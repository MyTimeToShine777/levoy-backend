#!/usr/bin/env python3
"""
Validation 3 for the Levoy Android app.

Resolves every `R.<type>.<name>` referenced from Kotlin against the real
definitions in res/, and checks the error classes a compiler-less environment
cannot otherwise catch:

  3a  dangling resource references   — R.color.primry, R.layout.item_call2
  3b  inflated layouts exist         — per Fragment/Activity
  3c  findViewById targets exist     — per Fragment, inside its own layout
  3d  <include> targets exist        — every layout includes a real layout

Usage: python3 tools/validate_resources.py
"""
import glob
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "app", "src", "main")
RES = os.path.join(SRC, "res")
KT_GLOB = os.path.join(SRC, "java", "**", "*.kt")
LAYOUT_DIR = os.path.join(RES, "layout")

ANDROID = "{http://schemas.android.com/apk/res/android}"
APK = "{http://schemas.android.com/apk/res/android}"

CHECKED_TYPES = ("id", "layout", "string", "color", "drawable", "array",
                 "dimen", "style", "mipmap", "bool", "menu")

VALUE_TAGS = {
    "string": "string",
    "string-array": "array",
    "integer-array": "array",
    "array": "array",
    "color": "color",
    "dimen": "dimen",
    "style": "style",
    "bool": "bool",
    "integer": "integer",
    "plurals": "plurals",
}

# Ids that live in the framework, not in res/.
SYSTEM_IDS = {"android.R.id.text1"}


def strip_kotlin(src: str) -> str:
    """Strip comments and string/char literals (same pass as validation 1)."""
    out, i, n = [], 0, len(src)
    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if ch == "/" and nxt == "/":
            while i < n and src[i] != "\n":
                i += 1
            continue
        if ch == "/" and nxt == "*":
            depth, i = 1, i + 2
            while i < n and depth:
                if src.startswith("/*", i):
                    depth += 1; i += 2
                elif src.startswith("*/", i):
                    depth -= 1; i += 2
                else:
                    i += 1
            out.append(" ")
            continue
        if src.startswith('"""', i):
            i += 3
            while i < n and not src.startswith('"""', i):
                i += 1
            i = min(i + 3, n)
            out.append(" ")
            continue
        if ch == '"':
            i += 1
            while i < n:
                if src[i] == "\\":
                    i += 2; continue
                if src[i] == '"':
                    i += 1; break
                i += 1
            out.append(" ")
            continue
        if ch == "'":
            i += 1
            while i < n:
                if src[i] == "\\":
                    i += 2; continue
                if src[i] == "'":
                    i += 1; break
                i += 1
            out.append(" ")
            continue
        out.append(ch)
        i += 1
    return "".join(out)


# ── Resource inventory ────────────────────────────────────────────────────

def collect_definitions():
    defined = {t: set() for t in CHECKED_TYPES}

    for path in glob.glob(os.path.join(RES, "values", "*.xml")):
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError:
            continue
        for child in root:
            name = child.get("name")
            if not name:
                continue
            if child.tag == "item":
                itype = child.get("type")
                if itype in defined:
                    defined[itype].add(name)
                continue
            mapped = VALUE_TAGS.get(child.tag)
            if mapped in defined:
                defined[mapped].add(name)

    # Qualifier folders such as drawable-v24 / mipmap-anydpi-v26 contribute
    # to the same R.<type> namespace as their unqualified sibling.
    for folder_path in glob.glob(os.path.join(RES, "*")):
        if not os.path.isdir(folder_path):
            continue
        base = os.path.basename(folder_path).split("-")[0]
        if base not in defined:
            continue
        for entry in os.listdir(folder_path):
            full = os.path.join(folder_path, entry)
            if os.path.isdir(full):
                for sub in os.listdir(full):
                    defined[base].add(os.path.splitext(sub)[0])
            else:
                defined[base].add(os.path.splitext(entry)[0])

    for path in glob.glob(os.path.join(RES, "**", "*.xml"), recursive=True):
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError:
            continue
        for elem in root.iter():
            value = elem.get(APK + "id")
            if value:
                if value.startswith("@+id/"):
                    defined["id"].add(value[len("@+id/"):])
                elif value.startswith("@id/"):
                    defined["id"].add(value[len("@id/"):])
    return defined


def layout_inventory():
    """{layout_name: {"ids": set, "includes": set}} for every layout."""
    out = {}
    for path in glob.glob(os.path.join(LAYOUT_DIR, "*.xml")):
        name = os.path.splitext(os.path.basename(path))[0]
        ids, includes = set(), set()
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError:
            out[name] = {"ids": ids, "includes": includes}
            continue
        for elem in root.iter():
            value = elem.get(APK + "id")
            if value:
                if value.startswith("@+id/"):
                    ids.add(value[len("@+id/"):])
                elif value.startswith("@id/"):
                    ids.add(value[len("@id/"):])
            if elem.tag == "include":
                ref = elem.get("layout")
                if ref:
                    includes.add(ref.split("/")[-1])
        out[name] = {"ids": ids, "includes": includes}
    return out


def resolve_ids(layout_name, layouts, depth=0):
    """ids visible in a layout, following <include> transitively."""
    if depth > 4 or layout_name not in layouts:
        return set()
    entry = layouts[layout_name]
    ids = set(entry["ids"])
    for inc in entry["includes"]:
        # An <include> overrides the included root's id, so both are reachable.
        ids.add(inc)
        ids |= resolve_ids(inc, layouts, depth + 1)
    return ids


# ── Source analysis ───────────────────────────────────────────────────────

def on_create_view_bodies(source: str):
    """
    Yield the body text of each onCreateView / onCreate override, so layout
    and findViewById pairing can be checked per screen rather than per file.
    """
    bodies = []
    pattern = re.compile(
        r"override\s+fun\s+onCreateView\s*\(", re.M
    )
    for match in pattern.finditer(source):
        # Walk forward to the matching close brace of the function body.
        start = source.find("{", match.end())
        if start < 0:
            continue
        depth, i = 0, start
        while i < len(source):
            if source[i] == "{":
                depth += 1
            elif source[i] == "}":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        bodies.append(source[match.end():i])
    return bodies


def main() -> int:
    defined = collect_definitions()
    layouts = layout_inventory()
    kt_files = sorted(glob.glob(KT_GLOB, recursive=True))
    problems = []

    print("=" * 74)
    print("VALIDATION 3a — every R.<type>.<name> in Kotlin resolves in res/")
    print("=" * 74)

    print("\nDefined resource counts:")
    for t in CHECKED_TYPES:
        print(f"  R.{t:<9} {len(defined[t]):>4}")

    r_ref = re.compile(r"(?<![\w.])R\.([a-z]+)\.([A-Za-z_][A-Za-z0-9_]*)")
    total_sites = 0
    distinct = set()
    skipped = {}

    for path in kt_files:
        rel = os.path.relpath(path, ROOT)
        with open(path, encoding="utf-8") as fh:
            for line_no, line in enumerate(fh, start=1):
                for m in r_ref.finditer(strip_kotlin(line)):
                    rtype, name = m.group(1), m.group(2)
                    if rtype not in defined:
                        skipped[rtype] = skipped.get(rtype, 0) + 1
                        continue
                    total_sites += 1
                    distinct.add((rtype, name))
                    if name not in defined[rtype]:
                        problems.append(f"{rel}:{line_no}  R.{rtype}.{name}  NOT DEFINED")

    print(f"\nDistinct R.* symbols referenced : {len(distinct)}")
    print(f"Reference sites (code only)     : {total_sites}")
    if skipped:
        print(f"Ignored platform/unknown R types: {skipped}")

    # ─────────────────────────────────────────────────────────────────────
    print()
    print("=" * 74)
    print("VALIDATION 3b — layouts inflated by each screen exist")
    print("=" * 74)

    inflate_all = re.compile(r"R\.layout\.([A-Za-z_][A-Za-z0-9_]*)")
    inflate_bodies = 0
    inflate_checked = 0

    for path in kt_files:
        rel = os.path.relpath(path, ROOT)
        with open(path, encoding="utf-8") as fh:
            source = fh.read()
        for layout in sorted(set(inflate_all.findall(strip_kotlin(source)))):
            inflate_checked += 1
            if layout not in layouts:
                problems.append(f"{rel}  R.layout.{layout}  LAYOUT MISSING")
        for body in on_create_view_bodies(source):
            for layout in set(inflate_all.findall(strip_kotlin(body))):
                inflate_bodies += 1
                if layout not in layouts:
                    problems.append(
                        f"{rel}  onCreateView inflates R.layout.{layout}  LAYOUT MISSING"
                    )

    print(f"\nR.layout.* reference sites : {inflate_checked}")
    print(f"onCreateView inflate sites  : {inflate_bodies}")
    print(f"Layouts on disk            : {len(layouts)}")

    # ─────────────────────────────────────────────────────────────────────
    print()
    print("=" * 74)
    print("VALIDATION 3c — findViewById ids exist inside the inflated layout")
    print("=" * 74)

    fv = re.compile(r"findViewById(?:<[^>]+>)?\(\s*R\.id\.([A-Za-z_][A-Za-z0-9_]*)\s*\)")
    per_screen_checked = 0
    per_screen_rows = []

    for path in kt_files:
        rel = os.path.relpath(path, ROOT)
        with open(path, encoding="utf-8") as fh:
            source = fh.read()
        bodies = on_create_view_bodies(source)
        for body in bodies:
            body_layouts = [l for l in set(inflate_all.findall(strip_kotlin(body)))
                            if l in layouts]
            if not body_layouts:
                continue
            visible = set()
            for layout in body_layouts:
                visible |= resolve_ids(layout, layouts)
            ids = sorted(set(fv.findall(strip_kotlin(body))))
            per_screen_checked += len(ids)
            missing = [i for i in ids if i not in visible]
            label = ",".join(sorted(body_layouts))
            per_screen_rows.append((rel, label, len(ids), missing))
            for m in missing:
                problems.append(
                    f"{rel}  onCreateView findViewById(R.id.{m}) not in {label}"
                )

    width = max((len(r[0]) for r in per_screen_rows), default=10)
    for rel, label, count, missing in per_screen_rows:
        status = "ok  " if not missing else "FAIL"
        detail = "" if not missing else "  missing: " + ", ".join(missing)
        print(f"  {status} {rel:<{width}}  {count:>2} ids in {label}{detail}")

    print(f"\nPer-screen findViewById checks: {per_screen_checked}")

    # ─────────────────────────────────────────────────────────────────────
    print()
    print("=" * 74)
    print("VALIDATION 3d — every <include layout=\"...\"> resolves")
    print("=" * 74)

    include_sites = 0
    include_rows = []
    for name, entry in sorted(layouts.items()):
        if not entry["includes"]:
            continue
        include_sites += len(entry["includes"])
        bad = sorted(i for i in entry["includes"] if i not in layouts)
        include_rows.append((name, sorted(entry["includes"]), bad))
        for b in bad:
            problems.append(f"layout {name}.xml  <include layout=\"{b}\">  MISSING")

    width = max((len(r[0]) for r in include_rows), default=10)
    for name, incs, bad in include_rows:
        status = "ok  " if not bad else "FAIL"
        print(f"  {status} {name + '.xml':<{width}}  includes {len(incs)}")
    print(f"\n<include> sites: {include_sites}")

    # ─────────────────────────────────────────────────────────────────────
    print()
    print("=" * 74)
    print("VALIDATION 3e — every findViewById id exists in SOME layout")
    print("            (covers adapters, dialogs and the overlay, not just")
    print("             onCreateView bodies)")
    print("=" * 74)

    all_layout_ids = set()
    for name in layouts:
        all_layout_ids |= resolve_ids(name, layouts)

    global_checked = 0
    global_rows = []
    for path in kt_files:
        rel = os.path.relpath(path, ROOT)
        with open(path, encoding="utf-8") as fh:
            source = fh.read()
        ids = sorted(set(fv.findall(strip_kotlin(source))))
        if not ids:
            continue
        missing = [i for i in ids if i not in all_layout_ids]
        global_checked += len(ids)
        global_rows.append((rel, len(ids), missing))
        for m in missing:
            problems.append(f"{rel}  findViewById(R.id.{m})  NOT IN ANY LAYOUT")

    width = max((len(r[0]) for r in global_rows), default=10)
    for rel, count, missing in global_rows:
        status = "ok  " if not missing else "FAIL"
        detail = "" if not missing else "  missing: " + ", ".join(missing)
        print(f"  {status} {rel:<{width}}  {count:>2} ids{detail}")
    print(f"\nGlobal findViewById checks: {global_checked} ids across {len(global_rows)} files")

    # ─────────────────────────────────────────────────────────────────────
    print()
    print("=" * 74)
    if problems:
        print(f"RESULT: FAILED — {len(problems)} problem(s)")
        print("=" * 74)
        for p in problems:
            print(f"  FAIL  {p}")
        return 1

    print("RESULT: all checks passed — 0 dangling refs, 0 missing layouts,")
    print("        0 bad findViewById targets, 0 bad includes")
    print("=" * 74)
    return 0


if __name__ == "__main__":
    sys.exit(main())
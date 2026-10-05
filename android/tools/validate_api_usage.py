#!/usr/bin/env python3
"""
Static check for two classes of runtime crash that a compiler-less environment
cannot catch and that the resource validators do not cover:

  A. getString(R.string.x) called WITHOUT arguments where the string declares a
     format specifier -> android.util.Formatter throws at runtime.
  B. Calls into the app's own helper objects (Ui.*, Fmt.*) with a member that
     does not exist on the object.

Usage: python3 tools/validate_api_usage.py
"""
import glob
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "app", "src", "main")
KT_GLOB = os.path.join(SRC, "java", "**", "*.kt")
VALUES = os.path.join(SRC, "res", "values")


def strip_comments(src):
    out, i, n = [], 0, len(src)
    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if ch == "/" and nxt == "/":
            while i < n and src[i] != "\n":
                out.append(" ")
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
        out.append(ch)
        i += 1
    return "".join(out)


def string_specifiers():
    """name -> count of %1$s-style specifiers"""
    out = {}
    for path in glob.glob(os.path.join(VALUES, "*.xml")):
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError:
            continue
        for elem in root:
            if elem.tag != "string":
                continue
            name = elem.get("name")
            if not name:
                continue
            text = "".join(elem.itertext())
            # %% is an escaped literal percent, not a specifier.
            specs = len(re.findall(r"%(?:\d+\$)?[sd]", text.replace("%%", "")))
            if specs:
                out[name] = specs
    return out


# Matches both `fun name(` and the extension form `fun View.name(`,
# optionally preceded by a generic type-parameter list.
FUN = re.compile(
    r"fun\s+(?:<[^>]*>\s*)?"
    r"(?:[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?:\?)?\.)?"
    r"([A-Za-z_][A-Za-z0-9_]*)\s*\("
)


def declared_helpers():
    """Members declared on object Ui and object Fmt in the util package."""
    ui, fmt = set(), set()
    for path in glob.glob(os.path.join(SRC, "java", "com", "levoy", "app", "util", "*.kt")):
        text = strip_comments(open(path, encoding="utf-8").read())
        if os.path.basename(path) == "Ui.kt":
            ui = set(FUN.findall(text))
        if os.path.basename(path) == "Formatters.kt":
            fmt = set(FUN.findall(text))
    return ui, fmt


def main() -> int:
    problems = []
    specs = string_specifiers()
    ui_members, fmt_members = declared_helpers()

    # Named-argument imports (onClick = ...) are a false-positive source; the
    # check below only cares that the member name exists.

    print("=" * 74)
    print("VALIDATION A — format strings never used without arguments")
    print("=" * 74)
    print(f"\nStrings declaring format specifiers: {len(specs)}")

    # getString(R.string.x) with no comma after the resource id.
    bare = re.compile(r"getString\(\s*R\.string\.([A-Za-z_][A-Za-z0-9_]*)\s*\)")
    # setText(R.string.x) / .setText(R.string.x) is equally unsafe.
    set_text = re.compile(r"\.setText\(\s*R\.string\.([A-Za-z_][A-Za-z0-9_]*)")

    checked = 0
    for path in sorted(glob.glob(KT_GLOB, recursive=True)):
        rel = os.path.relpath(path, ROOT)
        text = strip_comments(open(path, encoding="utf-8").read())
        for name in bare.findall(text):
            checked += 1
            if name in specs:
                problems.append(
                    f"{rel}  getString(R.string.{name}) has no args but the "
                    f"string declares {specs[name]} specifier(s) -> "
                    f"IllegalFormatException at runtime"
                )
        for name in set_text.findall(text):
            checked += 1
            if name in specs:
                problems.append(
                    f"{rel}  setText(R.string.{name}) has no args but the "
                    f"string declares {specs[name]} specifier(s)"
                )
    print(f"Call sites inspected: {checked}")

    # ─────────────────────────────────────────────────────────────────────
    print()
    print("=" * 74)
    print("VALIDATION B — Ui.* / Fmt.* members exist")
    print("=" * 74)
    print(f"\nUi members  ({len(ui_members)}): {', '.join(sorted(ui_members))}")
    print(f"Fmt members ({len(fmt_members)}): {', '.join(sorted(fmt_members))}")

    helper_checked = 0
    for path in sorted(glob.glob(KT_GLOB, recursive=True)):
        rel = os.path.relpath(path, ROOT)
        text = strip_comments(open(path, encoding="utf-8").read())
        for helper, known in (("Ui", ui_members), ("Fmt", fmt_members)):
            for member in set(re.findall(rf"\b{helper}\.([A-Za-z_][A-Za-z0-9_]*)", text)):
                # Imported extension members live in the same namespace.
                helper_checked += 1
                if member not in known:
                    problems.append(f"{rel}  {helper}.{member} is not declared on {helper}")

        # Extension-form imports: import ...Ui.<name> then bare <name>(...)
        for helper, known in (("Ui", ui_members), ("Fmt", fmt_members)):
            imported = set(
                re.findall(rf"import\s+com\.levoy\.app\.util\.{helper}\.([A-Za-z_][A-Za-z0-9_]*)", text)
            )
            for member in imported:
                helper_checked += 1
                if member not in known:
                    problems.append(
                        f"{rel}  imports {helper}.{member}, which is not declared"
                    )

    print(f"Helper references inspected: {helper_checked}")

    print()
    print("=" * 74)
    if problems:
        print(f"RESULT: FAILED — {len(problems)} problem(s)")
        for p in problems:
            print(f"  FAIL  {p}")
        return 1

    print("RESULT: all checks passed — no unformatted getString, no")
    print("        references to non-existent Ui/Fmt members")
    print("=" * 74)
    return 0


if __name__ == "__main__":
    sys.exit(main())
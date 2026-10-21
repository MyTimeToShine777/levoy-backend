#!/usr/bin/env python3
"""
Validation 1 + 2 for the Callio Android app.

  1. Kotlin brace / paren / bracket balance, ignoring strings and comments.
  2. Every res/*.xml file parses with xml.etree.

Neither script needs a JDK or the Android SDK.

Usage: python3 tools/validate_structure.py
"""
import glob
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "app", "src", "main")
KT_GLOB = os.path.join(SRC, "java", "**", "*.kt")

ANDROID_NAMESPACES = {
    "{http://schemas.android.com/apk/res/android}",
    "{http://schemas.android.com/apk/res-auto}",
    "{http://schemas.android.com/tools}",
    "{http://schemas.android.com/apk/res-animation}",
    "{http://www.w3.org/2000/svg}",
}

# Framework ids the app legitimately references but does not define in res/.
# These come from android.R / the platform, not from our own resources.
PLATFORM_R_PREFIXES = (
    "android.R.",       # explicit android.R.foo (none expected, allowed anyway)
)


def strip_kotlin(src: str) -> str:
    """
    Remove comments, string literals and char literals so brace counting is not
    confused by things like "}" or a URL inside a KDoc line.
    """
    out = []
    i = 0
    n = len(src)
    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ""

        # Line comment
        if ch == "/" and nxt == "/":
            while i < n and src[i] != "\n":
                i += 1
            continue

        # Block comment (nesting is legal in Kotlin)
        if ch == "/" and nxt == "*":
            depth = 1
            i += 2
            while i < n and depth:
                if src[i] == "/" and i + 1 < n and src[i + 1] == "*":
                    depth += 1
                    i += 2
                elif src[i] == "*" and i + 1 < n and src[i + 1] == "/":
                    depth -= 1
                    i += 2
                else:
                    i += 1
            out.append(" ")
            continue

        # Raw string: """ ... """ (may contain $ and ")
        if src.startswith('"""', i):
            i += 3
            while i < n:
                if src.startswith('"""', i):
                    i += 3
                    break
                # A raw string ends at the first """ that is not followed by ".
                i += 1
            out.append(' ')
            continue

        # Regular string with escapes
        if ch == '"':
            i += 1
            while i < n:
                if src[i] == "\\":
                    i += 2
                    continue
                if src[i] == '"':
                    i += 1
                    break
                if src[i] == "\n":
                    break  # unterminated; let the balance check report it
                i += 1
            out.append(" ")
            continue

        # Char literal
        if ch == "'":
            i += 1
            while i < n:
                if src[i] == "\\":
                    i += 2
                    continue
                if src[i] == "'":
                    i += 1
                    break
                i += 1
            out.append(" ")
            continue

        out.append(ch)
        i += 1
    return "".join(out)


def check_kt_balance(path: str):
    with open(path, encoding="utf-8") as fh:
        raw = fh.read()
    src = strip_kotlin(raw)

    problems = []
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    line = 1
    for ch in src:
        if ch == "\n":
            line += 1
        elif ch in "([{":
            stack.append((ch, line))
        elif ch in ")]}":
            if not stack:
                problems.append(f"unmatched closing '{ch}' at line {line}")
            else:
                opener, opened_at = stack.pop()
                if opener != pairs[ch]:
                    problems.append(
                        f"closing '{ch}' at line {line} does not match "
                        f"'{opener}' opened at line {opened_at}"
                    )
    for opener, opened_at in stack:
        problems.append(f"unclosed '{opener}' opened at line {opened_at}")
    return problems


def check_xml(path: str):
    try:
        ET.parse(path)
        return []
    except ET.ParseError as exc:
        return [f"XML parse error: {exc}"]
    except Exception as exc:  # unbound prefix etc.
        return [f"XML error: {exc}"]


def main() -> int:
    failures = 0

    print("=" * 72)
    print("VALIDATION 1 — Kotlin brace / paren / bracket balance")
    print("=" * 72)
    kt_files = sorted(glob.glob(KT_GLOB, recursive=True))
    for path in kt_files:
        problems = check_kt_balance(path)
        rel = os.path.relpath(path, ROOT)
        with open(path, encoding="utf-8") as fh:
            lines = sum(1 for _ in fh)
        if problems:
            failures += 1
            print(f"FAIL  {rel}  ({lines} lines)")
            for p in problems:
                print(f"        {p}")
        else:
            print(f"ok    {rel}  ({lines} lines)")
    print(f"\n{len(kt_files) - failures}/{len(kt_files)} Kotlin files balanced")

    print()
    print("=" * 72)
    print("VALIDATION 2 — every res XML file parses (xml.etree)")
    print("=" * 72)
    xml_files = sorted(
        glob.glob(os.path.join(SRC, "res", "**", "*.xml"), recursive=True)
    ) + [os.path.join(SRC, "AndroidManifest.xml")]

    xml_failures = 0
    for path in xml_files:
        problems = check_xml(path)
        rel = os.path.relpath(path, ROOT)
        if problems:
            xml_failures += 1
            failures += 1
            print(f"FAIL  {rel}")
            for p in problems:
                print(f"        {p}")
    print(f"\n{len(xml_files) - xml_failures}/{len(xml_files)} XML files parsed cleanly")

    # Inventory for the report.
    layouts = glob.glob(os.path.join(SRC, "res", "layout", "*.xml"))
    drawables = glob.glob(os.path.join(SRC, "res", "drawable", "*"))
    values = glob.glob(os.path.join(SRC, "res", "values", "*.xml"))
    print()
    print("Inventory:")
    print(f"  Kotlin files     : {len(kt_files)}")
    print(f"  Layout files     : {len(layouts)}")
    print(f"  Drawable files   : {len(drawables)}")
    print(f"  values/*.xml     : {len(values)}")

    print()
    if failures:
        print(f"RESULT: {failures} file(s) FAILED")
        return 1
    print("RESULT: all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
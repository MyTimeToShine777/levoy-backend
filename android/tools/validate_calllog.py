#!/usr/bin/env python3
"""
Validation 4 for the Callio Android app — regression guard on the call-log
query fix, plus manifest/theme sanity.

Background: `CallLogTracker.fetchNewCalls()` used to request
`CallsColumns.STATUS` in its projection. android.provider.CallLog.Calls has no
`status` column, so contentResolver.query() threw IllegalArgumentException, the
cursor died before a row was read, and the app silently uploaded nothing —
forever. The fix removed STATUS from the projection and switched to
getColumnIndex over getColumnIndexOrThrow (OEM providers legitimately omit
columns, and a throw there discards the whole sync).

This script fails if either regression comes back.

Usage: python3 tools/validate_calllog.py
"""
import glob
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "app", "src", "main")
KT_GLOB = os.path.join(SRC, "java", "**", "*.kt")
MANIFEST = os.path.join(SRC, "AndroidManifest.xml")
TRACKER = os.path.join(SRC, "java", "com", "levoy", "app", "calllog", "CallLogTracker.kt")

APK = "{http://schemas.android.com/apk/res/android}"


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def strip_comments(src):
    """Blank out // and /* */ comments so documentation text is not mistaken
    for a live reference."""
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


def main() -> int:
    problems = []
    kt_files = sorted(glob.glob(KT_GLOB, recursive=True))

    print("=" * 74)
    print("VALIDATION 4a — no CallsColumns.STATUS in the call-log projection")
    print("=" * 74)

    tracker = read(TRACKER)
    tracker_code = strip_comments(tracker)

    # Isolate the projection array literal passed to contentResolver.query().
    projection_match = re.search(
        r"val\s+projection\s*=\s*arrayOf\((.*?)\)", tracker_code, re.S
    )
    if not projection_match:
        problems.append("CallLogTracker: could not locate the `projection` arrayOf(...)")
        print("  FAIL  projection arrayOf(...) not found in CallLogTracker.kt")
    else:
        projection = projection_match.group(1)
        columns = re.findall(r"CallsColumns\.([A-Z_]+)", projection)
        print(f"  projection columns ({len(columns)}): {', '.join(columns)}")
        if "STATUS" in columns:
            problems.append(
                "CallLogTracker: projection requests CallsColumns.STATUS, a column "
                "that does not exist in android.provider.CallLog.Calls"
            )
            print("  FAIL  projection contains STATUS")
        else:
            print("  ok    STATUS is not requested  ✓")
        # Every remaining column must be a real CallLog.Calls column.
        real = {"_ID", "NUMBER", "DATE", "DURATION", "TYPE", "NAME"}
        for col in columns:
            if col not in real:
                problems.append(
                    f"CallLogTracker: projection column {col} is not a documented "
                    f"CallLog.Calls column (expected one of {sorted(real)})"
                )
                print(f"  FAIL  unknown column {col}")

    print()
    print("=" * 74)
    print("VALIDATION 4b — no getColumnIndexOrThrow anywhere in the app")
    print("=" * 74)

    throw_sites = []
    for path in kt_files:
        rel = os.path.relpath(path, ROOT)
        for line_no, line in enumerate(strip_comments(read(path)).splitlines(), start=1):
            if "getColumnIndexOrThrow" in line:
                throw_sites.append(f"{rel}:{line_no}  {line.strip()}")
    if throw_sites:
        for site in throw_sites:
            print(f"  FAIL  {site}")
        problems.append(
            f"getColumnIndexOrThrow reintroduced in {len(throw_sites)} place(s)"
        )
    else:
        print(f"  ok    scanned {len(kt_files)} Kotlin files, 0 occurrences  ✓")

    # getColumnIndex must still be the accessor actually used.
    if "getColumnIndex(" not in tracker_code:
        problems.append("CallLogTracker: no getColumnIndex( calls found")
        print("  FAIL  CallLogTracker does not use getColumnIndex(")
    else:
        uses = tracker_code.count("getColumnIndex(")
        print(f"  ok    CallLogTracker uses getColumnIndex( {uses} times  ✓")

    print()
    print("=" * 74)
    print("VALIDATION 4c — no raw android.provider.CallLog.STATUS reference")
    print("=" * 74)

    refs = [
        os.path.relpath(p, ROOT)
        for p in kt_files
        if "CallLog.Calls.STATUS" in strip_comments(read(p))
        or "CallLog.STATUS" in strip_comments(read(p))
    ]
    if refs:
        for r in refs:
            print(f"  FAIL  {r}")
        problems.append("android.provider.CallLog.STATUS referenced")
    else:
        print(f"  ok    scanned {len(kt_files)} Kotlin files, 0 references  ✓")

    print()
    print("=" * 74)
    print("VALIDATION 4d — manifest: Android 14 + new-feature permissions")
    print("=" * 74)

    manifest = ET.parse(MANIFEST).getroot()
    perms = {
        e.get(APK + "name")
        for e in manifest.iter("uses-permission")
    }
    required = {
        "android.permission.READ_CALL_LOG": "call tracking",
        "android.permission.READ_PHONE_STATE": "call tracking",
        "android.permission.INTERNET": "API calls",
        "android.permission.FOREGROUND_SERVICE": "sync service",
        "android.permission.FOREGROUND_SERVICE_DATA_SYNC": "Android 14 dataSync",
        "android.permission.POST_NOTIFICATIONS": "Android 13 notifications",
        "android.permission.CALL_PHONE": "SIM self-call",
        "android.permission.READ_CONTACTS": "Quick Action contact check",
        "android.permission.WRITE_CONTACTS": "Quick Action Save Contact",
        "android.permission.SYSTEM_ALERT_WINDOW": "Quick Action overlay",
    }
    for perm, why in required.items():
        if perm in perms:
            print(f"  ok    {perm:<58} ({why})")
        else:
            print(f"  FAIL  {perm:<58} MISSING ({why})")
            problems.append(f"manifest missing {perm}")

    # foregroundServiceType must remain dataSync.
    services = list(manifest.iter("service"))
    data_sync = any(
        s.get(APK + "foregroundServiceType") == "dataSync" for s in services
    )
    print()
    if data_sync:
        print("  ok    CallSyncService foregroundServiceType=dataSync  ✓")
    else:
        print("  FAIL  no service declares foregroundServiceType=\"dataSync\"")
        problems.append("no dataSync foreground service")

    # Theme sanity: default theme must not be a light/light-primary theme.
    app_node = next(iter(manifest.iter("application")))
    theme = app_node.get(APK + "theme")
    print(f"  ok    application theme = {theme}")
    if "DayNight" in (theme or "") or "Light" in (theme or ""):
        problems.append(f"application theme {theme} is not dark-first")

    print()
    print("=" * 74)
    if problems:
        print(f"RESULT: FAILED — {len(problems)} problem(s)")
        for p in problems:
            print(f"  FAIL  {p}")
        return 1

    print("RESULT: all checks passed — projection clean, no OrThrow,")
    print("        manifest permissions and dataSync service intact")
    print("=" * 74)
    return 0


if __name__ == "__main__":
    sys.exit(main())
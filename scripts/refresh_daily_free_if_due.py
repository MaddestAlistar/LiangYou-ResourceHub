#!/usr/bin/env python3
"""Independent fallback for verified App Store price-drop updates.

This collector is intentionally separate from sports, movie and localization
regressions: a chess translation failure must not block Apple price checks.
"""
from __future__ import annotations
import argparse
import subprocess
import sys
from datetime import timedelta
from refresh_data import is_due, verified_time
from feed_common import ROOT, iso, now, read_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    path = ROOT / "data/daily-free.json"
    before = verified_time("apple", read_json(path))
    instant = now()
    if not args.force and not is_due(before, instant, 3):
        print("APPLE_FALLBACK_NOT_DUE", iso(before) if before else None, flush=True)
        return 0
    print("APPLE_FALLBACK_REFRESH_START", iso(before) if before else None, flush=True)
    result = subprocess.run(
        [sys.executable, "-u", str(ROOT / "scripts/update_daily_free.py")],
        cwd=ROOT, timeout=900, check=False,
    )
    after = verified_time("apple", read_json(path))
    if result.returncode or after is None or (before is not None and after <= before):
        raise RuntimeError("Apple source checks did not produce a newer verified snapshot")
    if after > now() + timedelta(hours=1):
        raise RuntimeError("Future verification time is invalid")
    print("APPLE_FALLBACK_VERIFIED", iso(after), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

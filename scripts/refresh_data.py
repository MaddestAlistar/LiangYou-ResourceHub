#!/usr/bin/env python3
"""Half-hour watchdog; prices every 3h, sports every 2h, retry failures next tick."""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import subprocess
import sys
from feed_common import ROOT, date, iso, now, read_json, write_json

JOBS = {
    'apple': ('update_daily_free.py', 'daily-free.json', 3),
    'android': ('update_android_free.py', 'android-free.json', 3),
    'games': ('update_game_free.py', 'game-free.json', 3),
    'sports': ('update_sports.py', 'sports.json', 2),
    'predict': ('update_predict_sports.py', 'predict-sports.json', 2),
    'kalshi': ('update_kalshi_sports.py', 'kalshi-sports.json', 2),
    'fixtures': ('update_real_sports.py', 'real-sports.json', 6),
    'extras': ('update_extra_sports.py', 'extra-sports.json', 6),
}

def verified_time(name, snapshot):
    if name == 'apple':
        values = [snapshot.get('regions', {}).get(region, {}).get('verified_at') for region in ('cn', 'us')]
    elif name == 'games':
        values = [snapshot.get('platforms', {}).get(region, {}).get('checked_at') for region in ('steam', 'epic')]
    else:
        values = [snapshot.get('checked_at') or snapshot.get('generated_at')]
    timestamps = [date(v) for v in values]
    return min(timestamps) if timestamps and all(timestamps) else None

def is_due(verified, instant, hours):
    return verified is None or verified > instant + timedelta(hours=1) or instant - verified >= timedelta(hours=hours)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    instant = now()
    old = read_json(ROOT / 'data/update-status.json')
    def refresh(name):
        script, filename, hours = JOBS[name]
        path = ROOT / 'data' / filename
        previous = verified_time(name, read_json(path))
        entry = dict(old.get('jobs', {}).get(name, {}))
        # A maintainer may have rerun a collector independently after a failed
        # watchdog. Recognise its real verification instead of repeating it.
        attempted = date(entry.get('last_attempt_at'))
        if entry.get('status') == 'failed' and previous and attempted and previous > attempted:
            entry['status'] = 'ok'
        snapshot = read_json(path) if name == 'kalshi' else {}
        kalshi_link_upgrade = name == 'kalshi' and snapshot.get('link_schema_version') != 2
        coverage_upgrade = name in ('kalshi','sports') and read_json(path).get('coverage_schema_version') != 2
        fixtures_upgrade = name == 'fixtures' and read_json(path).get('fixture_schema_version') != 6
        extras_upgrade = name == 'extras' and read_json(path).get('extra_sports_version') != 2
        if args.force or kalshi_link_upgrade or coverage_upgrade or fixtures_upgrade or extras_upgrade or entry.get('status') == 'failed' or is_due(previous, instant, hours):
            entry['last_attempt_at'] = iso()
            try:
                result = subprocess.run([sys.executable, '-u', str(ROOT / 'scripts' / script)], cwd=ROOT, timeout=900)
                success = verified_time(name, read_json(path))
                if result.returncode or not success or (previous and success <= previous):
                    raise RuntimeError('Collector did not produce a new successful verification')
                entry['status'] = 'ok'
            except Exception as exc:
                entry['status'] = 'failed'
                print(f'::warning::{name} refresh failed: {exc}', flush=True)
        else:
            entry.setdefault('status', 'ok')
            print(f'{name}: verified recently; not due', flush=True)
        success = verified_time(name, read_json(path))
        entry['interval_hours'] = hours
        entry['last_success_at'] = iso(success) if success else None
        # A failed job is retried on the next scheduled tick, not 3h after failure.
        entry['next_due_at'] = iso(success + timedelta(hours=hours)) if success else None
        return name, entry
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs = dict(pool.map(refresh, JOBS))
    write_json(ROOT / 'data/update-status.json', {'schema': 1, 'checked_at': iso(), 'timezone': 'Asia/Shanghai', 'watchdog_minutes': 30, 'jobs': jobs})
    # Optional official fixtures must not break the six established working feeds.
    return int(any(e['status'] == 'failed' for k,e in jobs.items() if k not in ('fixtures', 'extras')))

if __name__ == '__main__':
    raise SystemExit(main())

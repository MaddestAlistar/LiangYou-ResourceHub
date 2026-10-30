#!/usr/bin/env python3
"""Due-aware feed refresh: preserve source intervals; retry failures on the next heartbeat."""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import subprocess
import sys
from feed_common import ROOT, date, iso, now, read_json, write_json

JOBS = {
    'media': ('update_media_intel.py', 'media-intel.json', 6),
    'apple': ('update_daily_free.py', 'daily-free.json', 3),
    'android': ('update_android_free.py', 'android-free.json', 3),
    'games': ('update_game_free.py', 'game-free.json', 3),
    'sports': ('update_sports.py', 'sports.json', 2),
    'predict': ('update_predict_sports.py', 'predict-sports.json', 2),
    'kalshi': ('update_kalshi_sports.py', 'kalshi-sports.json', 2),
    'fixtures': ('update_real_sports.py', 'real-sports.json', 6),
    'extras': ('update_extra_sports.py', 'extra-sports.json', 6),
    'board': ('update_board_games.py', 'board-games.json', 6),
    'nba': ('update_nba_balldontlie.py', 'nba-games.json', 6),
    'odds': ('update_odds_reference.py', 'sports-odds.json', 6),
    'chess_profiles': ('update_chess_players.py', 'chess-players.json', 24),
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
        # Check NBA game-day snapshots every 2h, otherwise preserve 6h cadence.
        # Only a verified future/ongoing fixture can enable the faster cycle.
        if name == 'nba':
            recent_snapshot = read_json(path)
            active = any(
                e.get('status') in ('scheduled','live')
                and (kickoff := date(e.get('start_time'))) is not None
                and instant - timedelta(hours=3) <= kickoff <= instant + timedelta(hours=12)
                for e in recent_snapshot.get('events',[]) if isinstance(e,dict)
            )
            hours = 2 if active else 6
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
        media_upgrade = name == 'media' and (read_json(path).get('media_source_version') != 5 or read_json(path).get('classification_source_version') != 1)
        fixtures_upgrade = name == 'fixtures' and read_json(path).get('fixture_schema_version') != 11
        extras_upgrade = name == 'extras' and read_json(path).get('extra_sports_version') != 3
        board_upgrade = name == 'board' and read_json(path).get('board_source_revision') != 5
        new_source_upgrade = (name, read_json(path).get({'nba':'nba_source_version','odds':'odds_schema_version','chess_profiles':'chess_profile_version'}.get(name))) if name in ('nba','odds','chess_profiles') else None
        needs_source_upgrade = bool(new_source_upgrade and new_source_upgrade[1] != (2 if name == 'chess_profiles' else 1))
        if args.force or media_upgrade or kalshi_link_upgrade or coverage_upgrade or fixtures_upgrade or extras_upgrade or board_upgrade or needs_source_upgrade or entry.get('status') == 'failed' or is_due(previous, instant, hours):
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
    # A no-op heartbeat is visible in Actions logs. Do not commit a new
    # timestamp (and trigger extra Pages work) when no source state changed.
    if old.get('jobs') != jobs or old.get('watchdog_minutes') != 15:
        write_json(ROOT / 'data/update-status.json',
                   {'schema': 1, 'checked_at': iso(), 'timezone': 'Asia/Shanghai',
                    'watchdog_minutes': 15, 'jobs': jobs})
        print('REFRESH_WATCHDOG_STATUS_UPDATED', flush=True)
    else:
        print('REFRESH_WATCHDOG_NO_CHANGES', flush=True)
    # Optional official fixtures must not break the six established working feeds.
    return int(any(e['status'] == 'failed' for k,e in jobs.items() if k not in ('fixtures', 'extras', 'board', 'nba', 'odds', 'chess_profiles', 'media')))

if __name__ == '__main__':
    raise SystemExit(main())

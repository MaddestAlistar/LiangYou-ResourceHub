"""Bound the Pages film-coverage JSON without discarding current catalog titles.

The two coverage collectors can each add verified articles, so compaction must
run after both collectors and after merging with the newest main branch. Older
out-of-catalog records lose surplus news before any entire record is evicted.
"""
from __future__ import annotations

import json
from pathlib import Path

from refresh_media_title_coverage import candidates

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / 'data' / 'media-title-coverage.json'
TARGET_BYTES = 1_850_000
MAX_ROWS = 650


def encoded(snapshot):
    return (json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def balanced_articles(articles, limit):
    """Retain both Chinese and other news when shortening old records."""
    zh = [r for r in articles if isinstance(r, dict) and r.get('language') == 'zh']
    other = [r for r in articles if isinstance(r, dict) and r.get('language') != 'zh']
    result = zh[:limit // 2] + other[:limit // 2]
    seen = {id(r) for r in result}
    result.extend(r for r in articles if isinstance(r, dict) and id(r) not in seen)
    return result[:limit]


def compact(snapshot, active, max_bytes=TARGET_BYTES):
    items = snapshot['items']
    before = len(encoded(snapshot))
    inactive = sorted((key for key in items if key not in active),
                      key=lambda key: (str(items[key].get('checkedAt') or ''), key))
    shortened = 0
    removed = 0
    # Keep verified video records; reduce old news rather than deleting titles.
    for limit in (12, 8, 4):
        if len(encoded(snapshot)) <= max_bytes:
            break
        for key in inactive:
            if len(encoded(snapshot)) <= max_bytes:
                break
            old = items[key].get('articles') or []
            if len(old) > limit:
                items[key]['articles'] = balanced_articles(old, limit)
                shortened += 1
    for key in inactive:
        if len(encoded(snapshot)) <= max_bytes and len(items) <= MAX_ROWS:
            break
        del items[key]
        removed += 1
    # As the live catalog grows, trim news, never remove a live title.
    if len(encoded(snapshot)) > max_bytes:
        active_keys = sorted((key for key in items if key in active),
                             key=lambda key: (str(items[key].get('checkedAt') or ''), key))
        for limit in (16, 12, 8, 6, 4):
            if len(encoded(snapshot)) <= max_bytes:
                break
            for key in active_keys:
                if len(encoded(snapshot)) <= max_bytes:
                    break
                old = items[key].get('articles') or []
                if len(old) > limit:
                    items[key]['articles'] = balanced_articles(old, limit)
                    shortened += 1
    after = len(encoded(snapshot))
    if after > max_bytes or len(items) > MAX_ROWS:
        raise ValueError(f'Coverage snapshot too large even after safe compaction: '
                         f'{after} bytes, {len(items)} titles. '
                         'Consider splitting into smaller JSON shards.')
    return before, after, shortened, removed


def main():
    snapshot = json.loads(FILE.read_text(encoding='utf-8'))
    if snapshot.get('schema') != 1 or not isinstance(snapshot.get('items'), dict):
        raise ValueError('Invalid coverage snapshot; refusing to overwrite')
    active = set(candidates())
    before, after, shortened, removed = compact(snapshot, active)
    if before != after:
        FILE.write_bytes(encoded(snapshot))
    print('COVERAGE_COMPACT', 'before=', before, 'after=', after,
          'titles=', len(snapshot['items']), 'current_catalog=', len(active),
          'shortened=', shortened, 'evicted_old=', removed)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Merge approved Douyin title clips across concurrent GitHub Pages updates.

A stale refresh cannot remove existing official verified clips or roll back
which works have already been searched.
"""
import json
import sys
from pathlib import Path

def merge(current, latest):
    if current.get("schema") != 1 or latest.get("schema") != 1:
        raise ValueError("invalid_douyin_schema")
    rows = dict(current.get("items") or {})
    for work_id, proposed in (latest.get("items") or {}).items():
        if not isinstance(proposed, dict):
            continue
        prior = rows.get(work_id)
        if not isinstance(prior, dict):
            rows[work_id] = proposed
            continue
        newer = proposed if str(proposed.get("checkedAt") or "") >= str(prior.get("checkedAt") or "") else prior
        others = prior if newer is proposed else proposed
        vids = {}
        for src in (others, newer):
            for video in (src.get("videos") or []):
                if not isinstance(video, dict) or video.get("platform") != "douyin":
                    continue
                if video.get("embedVerified") is not True or video.get("verifiedByOfficialDouyin") is not True:
                    continue
                vids[str(video.get("videoId") or "")] = video
        rows[work_id] = {**newer, "videos": list(vids.values())[-4:]}
    merged = {**current, **latest}
    merged["items"] = rows
    merged["discoveryCursor"] = max(int(current.get("discoveryCursor") or 0),
                                    int(latest.get("discoveryCursor") or 0))
    return merged

def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: merge_media_douyin.py <existing> <new>")
    existing, candidate = [Path(x) for x in sys.argv[1:]]
    a=json.loads(existing.read_text(encoding="utf8"))
    b=json.loads(candidate.read_text(encoding="utf8"))
    result=merge(a,b)
    existing.write_text(json.dumps(result,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf8")
    print("DOUYIN_MERGED",len(result["items"]),"catalog_works",flush=True)

if __name__ == "__main__":
    main()

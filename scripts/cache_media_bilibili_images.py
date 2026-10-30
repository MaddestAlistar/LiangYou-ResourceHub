#!/usr/bin/env python3
"""Store real Bilibili film-video covers as local GitHub Pages assets.

Only accepts BV IDs and provider-owned thumbnail URLs from ID-verified
catalog/coverage snapshots. No video bytes, credentials or fabricated covers.
Cover map is separate so hourly title-coverage snapshots cannot remove it.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data/media-domestic-trailers.json"
COVERAGE = ROOT / "data/media-title-coverage.json"
COVER_MAP = ROOT / "data/media-bilibili-cover-map.json"
COVER_DIR = ROOT / "assets/media-video-covers"
BVID = re.compile(r"BV[A-Za-z0-9]{10}")
ASSET_RE = re.compile(r"\./assets/media-video-covers/(BV[A-Za-z0-9]{10})\.(?:jpg|png|webp)")
HOSTS = ("hdslb.com", "biliimg.com")
MAX_BYTES = 1_500_000
MAX_NEW = 90
MAX_TOTAL = 450


def image_url(value: object) -> str | None:
    if not isinstance(value, str) or len(value) > 650:
        return None
    try:
        u = urlparse(value)
        host = (u.hostname or "").lower()
        if (u.scheme != "https" or u.username or u.password or
                not any(host == d or host.endswith("." + d) for d in HOSTS) or
                not re.fullmatch(r"/bfs/archive/[a-f0-9]{32,80}\.(?:jpg|jpeg|png|webp)(?:@[\w!.-]{1,80})?", u.path, re.I)):
            return None
        return value
    except ValueError:
        return None


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def valid_row(row: object) -> tuple[str, str] | None:
    if not isinstance(row, dict) or row.get("platform") != "bilibili":
        return None
    vid = str(row.get("videoId") or "")
    if not BVID.fullmatch(vid) or row.get("verifiedSource") != f"https://www.bilibili.com/video/{vid}/":
        return None
    cover = image_url(row.get("thumbnail"))
    return (vid, cover) if cover else None


def source_candidates() -> list[tuple[str, str]]:
    snapshot = read_json(CATALOG)
    coverage = read_json(COVERAGE)
    records = []
    for row in snapshot.get("items", []):
        if valid_row(row):
            records.append((999_999_999, row))
    works = coverage.get("items", {})
    if isinstance(works, dict):
        for title in works.values():
            if not isinstance(title, dict):
                continue
            videos = title.get("videos")
            if not isinstance(videos, list):
                continue
            verified = [x for x in videos if valid_row(x) and
                        (x.get("verifiedByTitleId") is True or x.get("matchedByTitle") is True)]
            verified.sort(key=lambda x: (
                x.get("type") != "Trailer",
                -int(x.get("likes") or 0),
                -int(x.get("views") or 0),
            ))
            for row in verified[:2]:
                records.append((int(row.get("likes") or 0), row))
    # Prioritize the official hand-selected set then high-interest titles,
    # preserving a bounded number of small, lazy-loaded image assets.
    records.sort(key=lambda x: -x[0])
    seen = set()
    unique = []
    for _score, row in records:
        item = valid_row(row)
        if item and item[0] not in seen:
            seen.add(item[0])
            unique.append(item)
    return unique[:MAX_TOTAL]


def fetch_image(url: str) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
        "Referer": "https://www.bilibili.com/",
        "Accept": "image/jpeg,image/png,image/webp",
    })
    with urllib.request.urlopen(req, timeout=12) as response:
        mime = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
        data = response.read(MAX_BYTES + 1)
    if not 500 <= len(data) <= MAX_BYTES:
        raise ValueError("image_size")
    if data[:3] == b"\xff\xd8\xff" and mime in ("image/jpeg", "image/jpg", "application/octet-stream"):
        return data, "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n" and mime == "image/png":
        return data, "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP" and mime == "image/webp":
        return data, "webp"
    raise ValueError("image_format")


def main() -> None:
    catalog = read_json(CATALOG)
    if catalog.get("schema") != 1:
        raise ValueError("catalog schema unsupported")
    COVER_DIR.mkdir(parents=True, exist_ok=True)
    previous = read_json(COVER_MAP).get("items", {})
    mapping: dict[str, str] = {}
    # Revalidate every local mapping against the source BV ID and actual file.
    if isinstance(previous, dict):
        for vid, path in previous.items():
            if (BVID.fullmatch(vid) and isinstance(path, str) and ASSET_RE.fullmatch(path)
                    and ASSET_RE.fullmatch(path).group(1) == vid
                    and (ROOT / path.removeprefix("./")).is_file()):
                mapping[vid] = path
    fresh, failed = 0, 0
    for vid, cover in source_candidates():
        if vid in mapping:
            continue
        existing = next((f for ext in ("jpg", "png", "webp")
                         if (f := COVER_DIR / f"{vid}.{ext}").exists()), None)
        if existing is not None:
            mapping[vid] = f"./assets/media-video-covers/{existing.name}"
            continue
        if fresh >= MAX_NEW:
            break
        try:
            payload, ext = fetch_image(cover)
            destination = COVER_DIR / f"{vid}.{ext}"
            destination.write_bytes(payload)
            mapping[vid] = f"./assets/media-video-covers/{destination.name}"
            fresh += 1
        except (ValueError, TimeoutError, OSError, urllib.error.URLError) as exc:
            failed += 1
            print(f"Cover {vid} skipped ({type(exc).__name__})")
    # Maintain the original hand-curated catalog's thumbnailLocal fields too.
    updated_catalog = False
    for item in catalog.get("items", []):
        if not isinstance(item, dict) or item.get("platform") != "bilibili":
            continue
        local = mapping.get(str(item.get("videoId") or ""))
        if local and item.get("thumbnailLocal") != local:
            item["thumbnailLocal"] = local
            updated_catalog = True
    if updated_catalog:
        CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    data = {"schema": 1, "items": dict(sorted(mapping.items()))}
    if read_json(COVER_MAP) != data:
        COVER_MAP.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Bilibili cover cache: verified={len(source_candidates())}, cached_total={len(mapping)}, "
          f"new={fresh}, unavailable={failed}")


if __name__ == "__main__":
    main()

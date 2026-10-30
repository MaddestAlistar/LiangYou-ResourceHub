#!/usr/bin/env python3
"""Mirror the public tech-news feed and its small images to our GitHub Pages origin.

China-facing pages must not require a successful Cloudflare Workers or
raw.githubusercontent.com request to show editorial updates. No admin API,
credentials or unpublished review-queue submissions are used.
"""
from __future__ import annotations

import base64
import json
import os
import re
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/tech-news-feed.json"
IMAGES = ROOT / "assets/tech-news"
SOURCE_API = "https://api.github.com/repos/MaddestAlistar/Icon-Review-Queue/contents/news/tech-news.json"
SOURCE_RAW = "https://raw.githubusercontent.com/MaddestAlistar/Icon-Review-Queue/main/news/tech-news.json"
IMAGE_ROOT = "https://raw.githubusercontent.com/MaddestAlistar/videos/main/news-images/"
POSTER_ROOT = "https://raw.githubusercontent.com/MaddestAlistar/videos/main/clips/"
IMAGE_NAME = re.compile(r"[a-f0-9-]{36}\.jpg\Z")
CATEGORIES = {"系统提醒", "联名上新", "应用动态", "图标动态", "热点播报", "联合抽奖", "宣传推广", "视频精选"}


def download(url: str, maximum: int, retries: int = 2) -> bytes:
    error = None
    for attempt in range(retries):
        try:
            req = Request(url, headers={"User-Agent": "LiangYou-Tech-News-Mirror/1.0",
                                        "Accept": "application/vnd.github+json",
                                        "Cache-Control": "no-cache"})
            with urlopen(req, timeout=18) as response:
                content = response.read(maximum + 1)
            if len(content) > maximum:
                raise ValueError("Response exceeded size limit")
            return content
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            error = exc
            if attempt + 1 < retries:
                time.sleep(attempt + 1)
    raise RuntimeError(f"Could not download public news source: {type(error).__name__}") from error


def fetch_feed() -> dict:
    try:
        result = json.loads(download(SOURCE_API, 900_000))
        if result.get("encoding") != "base64" or not isinstance(result.get("content"), str):
            raise ValueError("Invalid public GitHub contents result")
        data = json.loads(base64.b64decode(result["content"]))
    except (RuntimeError, ValueError, KeyError, TypeError):
        data = json.loads(download(SOURCE_RAW, 700_000))
    if data.get("schema") != 1 or not isinstance(data.get("items"), list) or len(data["items"]) > 300:
        raise ValueError("Invalid public tech news schema")
    return data


def image_local(url: str, directory: Path, prefix: str, local_prefix: str) -> str:
    if not isinstance(url, str) or not url.startswith(prefix):
        return ""
    filename = url[len(prefix):]
    if not IMAGE_NAME.fullmatch(filename):
        return ""
    target = directory / (local_prefix + filename)
    if target.is_file() and 4 < target.stat().st_size <= 1_200_000:
        return "./assets/tech-news/" + target.name
    try:
        body = download(url, 1_200_000)
        if len(body) < 5 or not body.startswith(b"\xff\xd8\xff") or not body.endswith(b"\xff\xd9"):
            raise ValueError("Not a complete JPEG image")
        directory.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=directory, delete=False) as tmp:
            tmp.write(body)
            temp_name = tmp.name
        os.replace(temp_name, target)
        return "./assets/tech-news/" + target.name
    except (RuntimeError, ValueError) as exc:
        # News text remains available even when its image host is unreachable.
        print("NEWS_IMAGE_UNAVAILABLE", filename, str(exc)[:120], flush=True)
        return ""


def video_local(url: str, directory: Path) -> str:
    """Store a bounded MP4 alongside the page so mainland visitors can play it."""
    if not isinstance(url, str) or not url.startswith(POSTER_ROOT):
        return ""
    name = url[len(POSTER_ROOT):]
    if not re.fullmatch(r"[a-f0-9-]{36}\.mp4", name):
        return ""
    target = directory / ("clip-" + name)
    if target.is_file() and 12 < target.stat().st_size <= 20_000_000:
        return "./assets/tech-news/" + target.name
    try:
        body = download(url, 20_000_000)
        if len(body) < 12 or body[4:8] != b"ftyp":
            raise ValueError("Not an MP4 container")
        directory.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=directory, delete=False) as tmp:
            tmp.write(body)
            temp_name = tmp.name
        os.replace(temp_name, target)
        return "./assets/tech-news/" + target.name
    except (RuntimeError, ValueError) as exc:
        print("NEWS_VIDEO_UNAVAILABLE", name, str(exc)[:120], flush=True)
        return ""


def snapshot(source: dict) -> dict:
    existing = set()
    rows = []
    for item in source["items"]:
        if not isinstance(item, dict):
            raise ValueError("Invalid news item")
        ident = item.get("id")
        if not isinstance(ident, str) or not re.fullmatch(r"news-[a-z0-9-]{6,64}", ident) or ident in existing:
            raise ValueError("Invalid or duplicate news ID")
        existing.add(ident)
        if item.get("category") not in CATEGORIES:
            raise ValueError("Invalid news category")
        if not all(isinstance(item.get(key), str) and 0 < len(item[key].strip()) <= bound
                   for key, bound in (("title", 120), ("content", 3000))):
            raise ValueError("Invalid news text")
        row = dict(item)
        if item["category"] != "视频精选":
            if len(rows) < 80:
                local = image_local(item.get("newsImageUrl", ""), IMAGES, IMAGE_ROOT, "")
                if local:
                    row["localNewsImageUrl"] = local
        elif sum(x.get("category") == "视频精选" for x in rows) < 6:
            local = image_local(item.get("posterUrl", ""), IMAGES, POSTER_ROOT, "clip-")
            if local:
                row["localPosterUrl"] = local
            video = video_local(item.get("videoUrl", ""), IMAGES)
            if video:
                row["localVideoUrl"] = video
        rows.append(row)
    return {"schema": 1, "updatedAt": source.get("updatedAt"), "items": rows}


def main() -> None:
    result = snapshot(fetch_feed())
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    value = json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n"
    if OUTPUT.exists() and OUTPUT.read_text(encoding="utf-8") == value:
        print("TECH_NEWS_UNCHANGED", len(result["items"]), flush=True)
        return
    OUTPUT.write_text(value, encoding="utf-8")
    print("TECH_NEWS_SNAPSHOT_UPDATED", len(result["items"]),
          sum(bool(x.get("localNewsImageUrl") or x.get("localPosterUrl")) for x in result["items"]),
          sum(bool(x.get("localVideoUrl")) for x in result["items"]),
          result.get("updatedAt"), flush=True)


if __name__ == "__main__":
    main()

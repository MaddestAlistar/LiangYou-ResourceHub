#!/usr/bin/env python3
"""No-cost indexed Douyin Jingxuan discovery -> official iframe approval.

The official all-platform search API is closed to ordinary apps. We query
ordinary publicly indexed pages at low frequency, never imitate restricted
Douyin search APIs or parse private requests. Only exact-work-matched public
videos approved by open.douyin.com appear in the site's trailer gallery.
"""
from __future__ import annotations
import html
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

from refresh_media_anime_videos import catalog as anime_catalog, safe_anime_video
from refresh_media_extra_videos import matches_title, normalize, VIDEO_WORDS, TRAILER_WORDS, BAN_WORDS

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data/media-intel.json"
OUTPUT = ROOT / "data/media-douyin-verified.json"
SEARCH = "https://html.duckduckgo.com/html/?q="
OFFICIAL = "https://open.douyin.com/api/douyin/v1/video/get_iframe_by_video?video_id="
VIDEO_ID = re.compile(r"^[1-9]\d{14,20}$")
EMBED_ID = re.compile(r"open\.douyin\.com/player/video\?vid=([1-9]\d{14,20})(?!\d)")
INDEX_URL = re.compile(r"https?://(?:jingxuan\.douyin\.com|www\.douyin\.com)/(?:m/)?video/([1-9]\d{14,20})(?!\d)")
MAX_PER_WORK = 4
MAX_API_CHECKS = 8
HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
           "Accept": "text/html,application/json;q=0.9,*/*;q=0.8"}

def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def request(url, timeout=17):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError("http_" + str(response.status))
        return response.read(380000).decode("utf-8", "replace")

def film_catalog():
    works = json.loads(CATALOG.read_text(encoding="utf8")).get("works") or {}
    result = {}
    for work in works.values():
        if not isinstance(work, dict) or work.get("kind") not in ("movie", "tv"):
            continue
        mid = int(work.get("tmdb_id") or 0)
        title = str(work.get("title") or "").strip()
        original = str(work.get("original_title") or "").strip()
        date = str(work.get("date") or "")
        year = int(date[:4]) if re.match(r"^\d{4}", date) else 0
        if mid <= 0 or len(title) < 2 or year < 1900:
            continue
        key = work["kind"] + ":" + str(mid)
        result[key] = {"kind": work["kind"], "id": key, "tmdb_id": mid,
                       "title": title, "original": original,
                       "aliases": list(dict.fromkeys(v for v in (title, original) if v)),
                       "year": year}
    return result

def search_terms(work, variant=0):
    aliases = [str(x) for x in work.get("aliases", []) if isinstance(x, str)]
    han = next((x for x in aliases if re.search(r"[\u3400-\u9fff]", x)), None)
    title = han or work["title"]
    if work["kind"] == "anime":
        words = ("动漫 PV", "动画 预告", "官方 先导")
    else:
        words = ("预告", "官方 预告片", "相关视频")
    return "site:jingxuan.douyin.com/m/video/ " + title + " " + words[variant % len(words)]

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
    def handle_starttag(self, tag, attrs):
        if tag == "a":
            url = dict(attrs).get("href", "")
            if url:
                self.urls.append(url)

def indexed_ids(query):
    """Return None on rate limit/error; [] on valid search with no results."""
    url = SEARCH + urllib.parse.quote(query)
    try:
        body = request(url)
    except urllib.error.HTTPError as error:
        print("DOUYIN_DISCOVERY_THROTTLED", error.code, flush=True)
        return None
    except (OSError, ValueError) as error:
        print("DOUYIN_DISCOVERY_UNAVAILABLE", type(error).__name__, flush=True)
        return None
    if "challenge" in body[:1500].lower() or "anomaly" in body[:1500].lower():
        return None
    links = Links()
    links.feed(body)
    found = []
    for value in links.urls:
        # DDG uses uddg= for a public redirect; decode without following it.
        value = html.unescape(value)
        for _ in range(2):
            value = urllib.parse.unquote(value)
        for video_id in INDEX_URL.findall(value):
            if video_id not in found:
                found.append(video_id)
    return found[:20]

def verify_official(video_id):
    if not VIDEO_ID.fullmatch(str(video_id)):
        return None
    try:
        data = json.loads(request(OFFICIAL + video_id, timeout=13))
    except (OSError, ValueError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict) or data.get("err_no") != 0:
        return None
    info = data.get("data")
    if not isinstance(info, dict):
        return None
    code = html.unescape(str(info.get("iframe_code") or ""))
    match = EMBED_ID.search(code)
    if not match or match.group(1) != video_id:
        return None
    title = str(info.get("video_title") or "").strip()
    if not 5 <= len(title) <= 220:
        return None
    return {"videoId": video_id, "name": title, "publisher": "抖音精选"}

def match_work(work, video):
    name = video["name"]
    if BAN_WORDS.search(name) or not VIDEO_WORDS.search(name):
        return False
    if work["kind"] == "anime":
        return safe_anime_video(work, video)
    if not matches_title(name, work["aliases"], work["year"], work["kind"]):
        return False
    if work["kind"] == "movie" and len(normalize(work["title"])) <= 4:
        if not re.search(r"[《「『]\s*" + re.escape(work["title"]) + r"\s*[》」』]", name):
            return False
    if re.search(r"剧情解说|电影解说|解说合集|剪辑版|游戏实况|游戏攻略|游戏混剪|手办开箱", name, re.I):
        return False
    return True

def create_row(work, result):
    video_id = result["videoId"]
    row = {"platform": "douyin", "videoId": video_id, "embedId": video_id,
           "embedVerified": True, "verifiedByOfficialDouyin": True,
           "verifiedSource": "https://jingxuan.douyin.com/m/video/" + video_id,
           "name": result["name"][:160], "publisher": result["publisher"],
           "kind": work["kind"], "title": work["title"], "year": work["year"],
           "thumbnail": None,
           "type": "Trailer" if TRAILER_WORDS.search(result["name"]) else "Related"}
    if work["kind"] == "anime":
        row.update(workId=work["id"], verifiedByCatalogTitle=True)
    else:
        row.update(tmdbId=work["tmdb_id"], matchedByTitle=True)
    return row

def choose(works, items, cursor):
    # A single search per run to avoid throttling on public search indexes.
    # Rotate by media type so films, television and anime all progress.
    kinds = ("anime", "tv", "movie")
    for off in range(3):
        kind = kinds[(cursor + off) % 3]
        choices = [(key, work) for key, work in works.items() if work["kind"] == kind]
        if choices:
            return min(choices, key=lambda kv: (
                str(items.get(kv[0], {}).get("checkedAt") or ""), kv[0]))
    return None

def main():
    works = {**film_catalog(), **anime_catalog()}
    try:
        prior = json.loads(OUTPUT.read_text(encoding="utf8"))
    except (OSError, ValueError, json.JSONDecodeError):
        prior = {}
    items = {k: v for k, v in (prior.get("items") or {}).items()
             if k in works and isinstance(v, dict)}
    cursor = max(0, int(prior.get("discoveryCursor") or 0))
    selected = choose(works, items, cursor)
    if selected is None:
        print("DOUYIN_NO_CATALOG_WORKS", flush=True)
        return
    key, work = selected
    old = items.get(key, {})
    old_videos = [v for v in old.get("videos", []) if isinstance(v, dict)
                  and v.get("platform") == "douyin"
                  and v.get("embedVerified") is True]
    variant = int(old.get("searchPass") or 0)
    query = search_terms(work, variant)
    print("DOUYIN_SEARCH_WORK", key, work["title"], "pass", variant + 1, flush=True)
    ids = indexed_ids(query)
    if ids is None:
        # Keep all published videos unchanged. Rotate index selection anyway to
        # prevent a rate-limited work from starving the full media catalogue.
        print("DOUYIN_INDEX_UNAVAILABLE_NO_CHANGES", flush=True)
        return
    videos = list(old_videos[:MAX_PER_WORK])
    checked = 0
    for video_id in ids:
        if checked >= MAX_API_CHECKS or len(videos) >= MAX_PER_WORK:
            break
        if any(v.get("videoId") == video_id for v in videos):
            continue
        checked += 1
        verified = verify_official(video_id)
        if verified and match_work(work, verified):
            videos.append(create_row(work, verified))
            print("DOUYIN_APPROVED", key, video_id, flush=True)
        time.sleep(.18)
    items[key] = {"title": work["title"], "kind": work["kind"],
                  "year": work["year"], "tmdbId": work.get("tmdb_id") or 0,
                  "workId": work["id"], "checkedAt": now(),
                  "searchPass": variant + 1, "videos": videos}
    result = {"schema": 1, "updatedAt": now(), "provider": "douyin",
              "discovery": "public_search_index_and_official_iframe",
              "discoveryCursor": cursor + 1,
              "items": items}
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n",
                      encoding="utf8")
    print("DOUYIN_DISCOVERY_SUMMARY", "checked", key, "index_ids", len(ids),
          "approved", len(videos) - len(old_videos), "total_title_videos", len(videos),
          "works_checked", sum(bool(x.get("checkedAt")) for x in items.values()),
          flush=True)

if __name__ == "__main__":
    main()

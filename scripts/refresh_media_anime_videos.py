#!/usr/bin/env python3
"""Refresh anime trailers against AniList identity and public video search metadata.

Public IDs only. Do not turn a title hit into an AniList/TMDB identity claim.
The checked-in snapshot remains usable when individual providers are blocked.
"""
from __future__ import annotations
import json
import os
import re
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

from refresh_media_extra_videos import (
    normalize, matches_title, parse_acfun, parse_niconico, parse_dailymotion
)

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "media-intel.json"
OUT = ROOT / "data" / "media-anime-videos.json"
GRAPH = "https://graphql.anilist.co"
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
WORK_ID = re.compile(r"^(?:bangumi|anilist|mal|simkl-anime)-[1-9]\d*$")
SEASON = re.compile(r"(?:第\s*([一二三四五六七八九0-9]+)\s*[季期部]|(?:season|saison)\s*([2-9])|([2-9])(?:nd|rd|th)\s+season)", re.I)
EXCLUDE = re.compile(r"剧场版|劇場版|映画|真人版|live.action|film red|film z|重制版|remake|完整版电影|full episode|全片|第\d+集", re.I)
KNOWN_ALIASES = {
    "bangumi-975": ["航海王", "海贼王", "ONE PIECE", "ワンピース"],
}

def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def name_aliases(w):
    strings = [w.get("title"), w.get("original_title"), w.get("english_title")]
    strings += KNOWN_ALIASES.get(w["id"], [])
    out = []
    for value in strings:
        value = str(value or "").strip()
        if value and len(value) <= 120 and normalize(value) and value not in out:
            out.append(value)
    return out[:24]

def catalog():
    d = json.loads(CATALOG.read_text(encoding="utf-8"))
    rows = {}
    for w in (d.get("works") or {}).values():
        if not isinstance(w, dict) or w.get("kind") != "anime":
            continue
        ident = str(w.get("id") or "")
        if not WORK_ID.fullmatch(ident):
            continue
        date = str(w.get("date") or "")
        year = int(date[:4]) if re.match(r"^\d{4}", date) else 0
        ids = list(w.get("aliases") or [])
        ids.append(ident)
        ani = next((int(i.split("-")[1]) for i in ids if re.fullmatch(r"anilist-[1-9]\d*", str(i))), 0)
        mal = int(w.get("mal_id") or 0) if str(w.get("mal_id") or "").isdigit() else 0
        rows[ident] = {"id": ident, "kind": "anime", "title": w.get("title") or "",
                       "original": w.get("original_title") or "", "year": year,
                       "aliases": name_aliases(w), "anilistId": ani, "malId": mal,
                       "tmdb_id": 0}
    return rows

FIELDS = """
id idMal type format seasonYear startDate { year month day }
title { native romaji english }
synonyms trailer { id site thumbnail }
"""

def graphql(query, variables):
    data = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = urllib.request.Request(GRAPH, data=data, headers={
        "Content-Type": "application/json", "Accept": "application/json",
        "User-Agent": "LiangYou-ResourceHub/1.0"
    })
    try:
        with urllib.request.urlopen(req, timeout=17) as response:
            d = json.loads(response.read(150000))
        return d.get("data") if isinstance(d, dict) and not d.get("errors") else None
    except (OSError, ValueError, urllib.error.HTTPError):
        return None

def year_match(work, ani):
    local = work["year"]
    origin = (ani.get("startDate") or {}).get("year") or ani.get("seasonYear") or 0
    return not (local >= 1900 and origin >= 1900 and abs(local - origin) > 1)

def exact_title(work, ani):
    local = {normalize(x) for x in work["aliases"] if x}
    remote = [*(ani.get("synonyms") or []), *((ani.get("title") or {}).values())]
    return any(normalize(name) in local for name in remote if name and len(normalize(name)) >= 4)

def lookup_anilist(work):
    if work["anilistId"] or work["malId"]:
        column = "id" if work["anilistId"] else "idMal"
        ident = work["anilistId"] or work["malId"]
        result = graphql("query($id:Int){Media(" + column + ":$id,type:ANIME){" + FIELDS + "}}",
                         {"id": ident})
        ani = (result or {}).get("Media")
        if ani and year_match(work, ani):
            return ani
        return None
    # Search only the original catalog name, never a generated English guess.
    term = work["original"] or work["title"]
    if not term:
        return None
    query = "query($q:String){Page(page:1,perPage:8){media(search:$q,type:ANIME,sort:SEARCH_MATCH){" + FIELDS + "}}}"
    response = graphql(query, {"q": term})
    candidates = (((response or {}).get("Page") or {}).get("media") or [])
    candidates = [a for a in candidates if isinstance(a, dict) and year_match(work, a) and exact_title(work, a)]
    return candidates[0] if len(candidates) == 1 else None

def season_marker(text):
    m = SEASON.search(str(text or ""))
    if not m:
        return ""
    val = next((x for x in m.groups() if x), "")
    lookup = {"二": "2", "三": "3", "四": "4", "五": "5", "六": "6",
              "七": "7", "八": "8", "九": "9"}
    return lookup.get(val, val)

def safe_anime_video(work, row):
    label = str(row.get("name") or "")
    if EXCLUDE.search(label):
        return False
    # A four-character fandom nickname can point at a previous season or a
    # fan edit. Require a primary title or a sufficiently distinctive synonym.
    primary = {str(work.get("title") or ""), str(work.get("original") or "")}
    trusted_aliases = [
        alias for alias in work["aliases"] if alias in primary
        or len(normalize(alias)) >= 6
        or (work.get("id") == "bangumi-975" and alias in
            ("航海王", "海贼王", "ONE PIECE", "ワンピース"))
    ]
    if not matches_title(label, trusted_aliases, work["year"], "anime"):
        return False
    # Exclude unrelated gameplay, story recaps and crossover fan edits that
    # happen to contain a recognizable franchise name.
    if re.search(r"剧情解说|剪辑版|游戏实况|gameplay|walkthrough|playthrough|通关攻略", label, re.I):
        return False
    if re.search(r"×|\bx\b", label, re.I) and not re.search(r"TVアニメ|动画|anime|アニメ", label, re.I):
        return False
    # "restart" and later seasons are distinct series identities, not synonyms
    # of the original 2016 anime or its generic franchise PVs.
    if any("restart" in str(name).casefold() for name in primary) and "restart" not in label.casefold():
        return False
    edition = next((season_marker(x) for x in primary if season_marker(x)), "")
    if not edition:
        for name in primary:
            m = re.search(r"(?:\s|[：:])([2-9]|II|III)\s*$", name, re.I)
            if m:
                edition = {"II": "2", "III": "3"}.get(m[1].upper(), m[1])
                break
    clip_edition = season_marker(label)
    if not clip_edition and edition:
        match = re.search(r"(?:\s|[：:])([2-9]|II|III)(?=\s*(?:PV|预告|trailer|teaser|$))", label, re.I)
        if match:
            clip_edition = {"II": "2", "III": "3"}.get(match[1].upper(), match[1])
    if edition and clip_edition != edition:
        return False
    if not edition and clip_edition:
        return False
    # "ONE PIECE" also describes film, live-action, games and a separate remake.
    if work["id"] == "bangumi-975" and re.search(
        r"THE ONE PIECE|film|电影|真人|剧场|重制|游戏|手游|航海王热血航线", label, re.I):
        return False
    return True

def canonical_cached_clip(work, row):
    """Re-check older snapshots even when this anime is not in today's batch."""
    if not isinstance(row, dict) or row.get("workId") != work["id"] or row.get("kind") != "anime":
        return False
    if row.get("verifiedByCatalogTitle") is not True:
        return False
    if row.get("year") != work["year"]:
        return False
    platform, ident = row.get("platform"), str(row.get("videoId") or "")
    canonical = {
        "acfun": ("https://www.acfun.cn/v/ac" + ident, r"[1-9]\\d{3,11}"),
        "niconico": ("https://www.nicovideo.jp/watch/" + ident, r"(?:sm|so)\\d{6,12}"),
        "dailymotion": ("https://www.dailymotion.com/video/" + ident, r"x[a-z0-9]{4,12}")
    }
    if platform not in canonical:
        return False
    url, pattern = canonical[platform]
    if re.fullmatch(pattern, ident, re.I) is None or row.get("verifiedSource") != url:
        return False
    return safe_anime_video(work, row)

def recheck_published(items, works):
    """Remove old-season and game clips from every entry, not only the refreshed batch."""
    removed = 0
    for ident, item in items.items():
        work = works.get(ident)
        if not work or not isinstance(item, dict):
            continue
        aliases = list(dict.fromkeys([
            *work["aliases"], *(item.get("aliases") or [])
        ]))[:24]
        check = {**work, "aliases": aliases}
        existing = item.get("videos") or []
        clean = [row for row in existing if canonical_cached_clip(check, row)]
        removed += len(existing) - len(clean)
        item["videos"] = clean
        trailers = []
        for video in item.get("youtubeTrailers") or []:
            if not isinstance(video, dict):
                continue
            vid = str(video.get("id") or "")
            if not VIDEO_ID.fullmatch(vid) or video.get("url") != "https://www.youtube.com/watch?v=" + vid:
                continue
            if video.get("verifiedBy") not in ("AniList", "Toei Animation"):
                continue
            if vid not in [previous["id"] for previous in trailers]:
                trailers.append(video)
        item["youtubeTrailers"] = trailers[:12]
    return removed

def discover(work, previous):
    status = {}
    rows = []
    for label, parser, platform in [
        ("AcFun", parse_acfun, "acfun"),
        ("Niconico", parse_niconico, "niconico"),
        ("Dailymotion", parse_dailymotion, "dailymotion")
    ]:
        try:
            found = parser(work)
            status[label] = "ok" if found else "empty"
        except Exception:
            found = [x for x in previous.get("videos", [])
                     if x.get("platform") == platform]
            status[label] = "unavailable"
        for v in found:
            if not isinstance(v, dict) or not safe_anime_video(work, v):
                continue
            row = {key: v[key] for key in (
                "platform", "videoId", "name", "type", "verifiedSource",
                "publisher", "thumbnail", "views", "likes"
            ) if key in v}
            row.update(kind="anime", workId=work["id"], title=work["title"],
                       year=work["year"], verifiedByCatalogTitle=True)
            if row not in rows:
                rows.append(row)
        time.sleep(0.3)
    dedup = {}
    for row in rows:
        key = row.get("platform", "") + ":" + row.get("videoId", "")
        if key and key not in dedup:
            dedup[key] = row
    return list(dedup.values())[:12], status

def refresh(work, previous):
    ani = lookup_anilist(work)
    aliases = list(work["aliases"])
    # Preserve previously ID-linked official/AniList clips during transient API
    # errors; an empty upstream response must not erase a verified prior result.
    trailers = [v for v in previous.get("youtubeTrailers", [])
                if isinstance(v, dict) and v.get("verifiedBy") in ("Toei Animation", "AniList")
                and VIDEO_ID.fullmatch(str(v.get("id") or ""))
                and v.get("url") == "https://www.youtube.com/watch?v=" + v["id"]]
    if ani:
        for value in [*(ani.get("synonyms") or []),
                      *((ani.get("title") or {}).values())]:
            if isinstance(value, str) and value.strip() and len(value) <= 120:
                if value not in aliases:
                    aliases.append(value)
        trailer = ani.get("trailer") or {}
        ident = str(trailer.get("id") or "")
        if trailer.get("site") == "youtube" and VIDEO_ID.fullmatch(ident):
            trailers.append({
                "id": ident, "title": work["title"] + " · AniList 关联 PV",
                "type": "Trailer", "verifiedBy": "AniList",
                "official": False, "embeddable": True,
                "url": "https://www.youtube.com/watch?v=" + ident
            })
    query_work = {**work, "aliases": aliases[:24]}
    videos, source_status = discover(query_work, previous)
    seen = set()
    trailers = [x for x in trailers if not (x["id"] in seen or seen.add(x["id"]))][:12]
    return {"workId": work["id"], "kind": "anime", "title": work["title"],
            "year": work["year"], "aliases": aliases[:24],
            "anilistId": ani.get("id") if ani else previous.get("anilistId"),
            "malId": ani.get("idMal") if ani else work["malId"],
            "youtubeTrailers": trailers, "videos": videos,
            "sources": source_status, "checkedAt": now()}

def main():
    works = catalog()
    try:
        previous = json.loads(OUT.read_text(encoding="utf-8"))
        old = previous.get("items") or {}
    except (OSError, ValueError):
        old = {}
    items = {key: row for key, row in old.items()
             if key in works and isinstance(row, dict)}
    dropped = recheck_published(items, works)
    print("ANIME_STALE_VIDEO_PRUNED", dropped, flush=True)
    batch = max(1, min(40, int(os.getenv("ANIME_VIDEOS_BATCH", "22"))))
    # Missing works first, then the oldest inspected entries. All catalog anime
    # take turns, not just hand-picked popular examples.
    keys = sorted(works, key=lambda k: (
        1 if k in items else 0, str(items.get(k, {}).get("checkedAt") or ""), k))
    for ident in keys[:batch]:
        work = works[ident]
        try:
            item = refresh(work, items.get(ident, {}))
            if item.get("youtubeTrailers") or item.get("videos") or ident not in items:
                items[ident] = item
            else:
                items[ident]["checkedAt"] = now()
            print("ANIME_VIDEO", ident, "youtube", len(item["youtubeTrailers"]),
                  "other", len(item["videos"]), flush=True)
        except Exception as exc:
            print("ANIME_VIDEO_UNAVAILABLE", ident, type(exc).__name__, flush=True)
    OUT.write_text(json.dumps({"schema": 1, "updatedAt": now(), "items": items},
                              ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print("ANIME_VIDEO_SUMMARY", len(items), "catalog", len(works), flush=True)

if __name__ == "__main__":
    main()

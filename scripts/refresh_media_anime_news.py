#!/usr/bin/env python3
"""Rotating public anime-news discovery; only work/season-specific RSS headlines.

The fixed identity is the site's anime work ID, not a speculative TMDB/title join.
Existing editor-verified entries survive empty or blocked public searches.
"""
from __future__ import annotations
import json
import os
import re
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data/media-intel.json"
VIDEOS = ROOT / "data/media-anime-videos.json"
DEST = ROOT / "data/media-anime-news.json"
ID = re.compile(r"^(?:bangumi|anilist|mal|simkl-anime)-[1-9]\d*$")
PEERS = {"bangumi-637802": "mal-63801", "mal-63801": "bangumi-637802"}
CONTEXT = re.compile(r"anime|animation|season|episode|trailer|preview|opening|ending|mappa|netflix|"
                     r"アニメ|第\d+期|第\d+話|放送|映像|予告|动画|动漫|预告|第\d+季|开播|新番|"\n                     r"柯南|detective conan|case closed|青之箱|蓝箱|アオのハコ|blue box|续作|续篇|周年|剧场版|制作|更新|声优|配信", re.I)
SEASON = re.compile(r"第\s*([一二三四五六七八九0-9]+)\s*[季期]|"
                    r"\bseason\s*([0-9]+)\b|\b([0-9]+)(?:st|nd|rd|th)\s+season\b|第\s*([一二三四五六七八九0-9]+)\s*部", re.I)
DIGITS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def read(path: Path) -> dict:
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
        return result if isinstance(result, dict) else {}
    except (OSError, ValueError):
        return {}


def compact(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKC", value).casefold() if c.isalnum())


def season(value: str) -> int:
    found = SEASON.search(value)
    if not found:
        return 0
    s = next((x for x in found.groups() if x), "")
    return int(s) if s.isdigit() else DIGITS.get(s, 0)


def verified_headline(headline: str, aliases: list[str], season_num: int) -> bool:
    raw = str(headline or "")[:260]
    headline_key = compact(raw)
    if len(headline_key) < 6 or not CONTEXT.search(raw):
        return False
    # A sequel needs an explicit season cue. Generic franchise articles from
    # other seasons must never become "new" news for season three.
    if season_num:
        if season(raw) != season_num:
            return False
    for alias in aliases:
        name = str(alias or "").strip()
        if season(name):
            name = SEASON.sub("", name)
        name = re.sub(r"\(\s*20\d{2}\s*\)", "", name).strip()
        key = compact(name)
        if len(key) >= 4 and key in headline_key:
            return True
    return False


def catalog() -> dict:
    c = read(CATALOG).get("works") or {}
    v = read(VIDEOS).get("items") or {}
    works = {}
    for wid, row in c.items():
        if not ID.fullmatch(wid) or row.get("kind") != "anime":
            continue
        year = str(row.get("date") or "")[:4]
        if not year.isdigit():
            continue
        aliases = [row.get("title"), row.get("original_title"), row.get("english_title")]
        aliases += (v.get(wid) or {}).get("aliases") or []
        peer = c.get(PEERS.get(wid, ""))
        if peer and str(peer.get("date") or "")[:4] == year:
            aliases += [peer.get("title"), peer.get("original_title"), peer.get("english_title")]
        aliases = list(dict.fromkeys(str(x).strip() for x in aliases if isinstance(x, str) and x.strip()))
        number = next((season(x) for x in aliases if season(x)), 0)
        works[wid] = {"year": int(year), "aliases": aliases[:16], "season": number}
    return works


def rss(wid: str, work: dict, lang: str) -> list[dict]:
    aliases = work["aliases"]
    name = next((x for x in aliases if lang == "zh" and re.search(r"[\u3400-\u9fff]", x)), None) if lang == "zh" else None
    if lang == "ja":
        name = next((x for x in aliases if re.search(r"[\u3040-\u30ff]", x)), None)
    if not name:
        name = next((x for x in aliases if re.search(r"[A-Za-z]{3}", x)), aliases[0])
    # Search localized aliases first; avoid requiring English "anime" in Chinese/Japanese news.\n    query = '"' + name[:90] + '" (动画 OR 动漫 OR アニメ OR anime OR 续作 OR 放送)'
    params = urllib.parse.urlencode({"q": query, "hl": lang, "gl": "JP" if lang == "ja" else "CN" if lang == "zh" else "US",
                                     "ceid": "JP:ja" if lang == "ja" else "CN:zh-Hans" if lang == "zh" else "US:en"})
    request = urllib.request.Request("https://news.google.com/rss/search?" + params,
        headers={"User-Agent": "Mozilla/5.0 (compatible; LiangYouAnimeNews/1.0)", "Accept": "application/rss+xml"})
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            xml = response.read(280000)
        root = ET.fromstring(xml)
    except Exception:
        return []
    results = []
    for entry in root.findall(".//channel/item")[:55]:
        raw = (entry.findtext("title") or "").strip()
        if not verified_headline(raw, aliases, work["season"]):
            continue
        link = (entry.findtext("link") or "").strip()
        if not link.startswith("https://news.google.com/"):
            continue
        date_raw = entry.findtext("pubDate") or ""
        try:
            published = parsedate_to_datetime(date_raw).astimezone(timezone.utc)
        except (ValueError, TypeError):
            continue
        now = datetime.now(timezone.utc)
        if published > now + timedelta(days=1) or published < now - timedelta(days=550):
            continue
        src = entry.find("source")
        publisher = (src.text or "").strip() if src is not None and src.text else "News"
        if not 1 <= len(publisher) <= 90:
            publisher = "News"
        article = {"title": raw[:190], "url": link, "source": publisher[:90],
                   "language": lang, "date": published.isoformat(),
                   "titleMatchVerified": True}
        if article["url"] not in {x["url"] for x in results}:
            results.append(article)
        if len(results) >= 8:
            break
    return results


def merge(existing: list, incoming: list) -> list:
    seen, result = set(), []
    # Preserve manually reviewed production news, then select independent RSS
    # results by language without dropping an already verified source on timeout.
    ranked = [x for x in existing if x.get("curated") is True] + incoming + [
        x for x in existing if x.get("curated") is not True]
    counts = {"zh": 0, "en": 0, "ja": 0, "ko": 0}
    for x in ranked:
        if not isinstance(x, dict) or not x.get("titleMatchVerified") or not isinstance(x.get("url"), str):
            continue
        if not x["url"].startswith("https://") or x["language"] not in counts or x["url"] in seen:
            continue
        if counts[x["language"]] >= 6:
            continue
        seen.add(x["url"])
        counts[x["language"]] += 1
        result.append(x)
    return result[:18]


def main():
    works = catalog()
    prev = read(DEST).get("items") or {}
    items = {k: v for k, v in prev.items() if k in works and isinstance(v, dict)}
    batch = max(1, min(150, int(os.getenv("ANIME_NEWS_BATCH", "100"))))
    keys = sorted(works, key=lambda k: (
        1 if k in items else 0, str(items.get(k, {}).get("checkedAt") or ""), k))[:batch]
    tasks = [(k, works[k], lang) for k in keys for lang in ("zh", "en", "ja")]
    found = {}
    with ThreadPoolExecutor(max_workers=5) as pool:
        for (key, _, lang), rows in zip(tasks, pool.map(lambda arg: rss(*arg), tasks)):
            found.setdefault(key, []).extend(rows)
            print("ANIME_NEWS", key, lang, len(rows), flush=True)
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for key in keys:
        old = items.get(key) or {}
        items[key] = {"workId": key, "kind": "anime", "year": works[key]["year"],
                      "articles": merge(old.get("articles") or [], found.get(key) or []),
                      "checkedAt": stamp}
    DEST.write_text(json.dumps({"schema": 1, "updatedAt": stamp, "items": items},
                               ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("ANIME_NEWS_SUMMARY", len(items), "articles",
          sum(bool(v.get("articles")) for v in items.values()), flush=True)


if __name__ == "__main__":
    main()

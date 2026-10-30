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
CONTEXT = re.compile(r"anime|animation|season|episode|trailer|preview|opening|ending|"
                     r"アニメ|第\d+期|第\d+話|放送|映像|予告|主題歌|周年|コラボ|"
                     r"动画|动漫|预告|新番|开播|联动|周年|主题曲|剧场版|"
                     r"配信|PV|visual|premiere|anniversary|broadcast", re.I)
# NFKC normalizes full-width digits before checking.
SEASON = re.compile(r"第\s*([一二三四五六七八九十0-9]+)\s*[季期]|"
                    r"\bseason\s*([2-9][0-9]?)\b|\b([2-9][0-9]?)(?:st|nd|rd|th)\s*season\b|"
                    r"\b(second|third|fourth|fifth)\s+season\b", re.I)
DIGITS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def read(path: Path) -> dict:
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
        return result if isinstance(result, dict) else {}
    except (OSError, ValueError):
        return {}


def compact(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKC", value).casefold() if c.isalnum())


def season(value: str) -> int:
    found = SEASON.search(unicodedata.normalize("NFKC", value))
    if not found:
        return 0
    s = next((x for x in found.groups() if x), "")
    return int(s) if s.isdigit() else {"second": 2, "third": 3, "fourth": 4, "fifth": 5}.get(s.lower(), DIGITS.get(s, 0))


def verified_headline(headline: str, aliases: list[str], season_num: int) -> bool:
    raw = unicodedata.normalize("NFKC", str(headline or "")[:260])
    headline_key = compact(raw)
    if len(headline_key) < 6 or not CONTEXT.search(raw):
        return False
    # A sequel needs an explicit season cue. Generic franchise articles from
    # other seasons must never become "new" news for season three.
    if season_num:
        reported = season(raw)
        if reported != season_num:
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
    by_mal, works = {}, {}
    # MAL ID is an edition identity: peer names may be shared only with
    # the same release year and season, never with a different sequel.
    for wid, row in c.items():
        if not ID.fullmatch(wid) or row.get("kind") != "anime":
            continue
        mal = str((v.get(wid) or {}).get("malId") or row.get("mal_id") or "")
        if mal.isdigit() and int(mal) > 0:
            by_mal.setdefault(mal, []).append(wid)
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
        mal = str((v.get(wid) or {}).get("malId") or row.get("mal_id") or "")
        for peer_id in by_mal.get(mal, []) if mal.isdigit() else []:
            if peer_id == wid:
                continue
            other = c[peer_id]
            if str(other.get("date") or "")[:4] != year:
                continue
            aliases += [other.get("title"), other.get("original_title"), other.get("english_title")]
            aliases += (v.get(peer_id) or {}).get("aliases") or []
        aliases = list(dict.fromkeys(str(x).strip() for x in aliases if isinstance(x, str) and x.strip()))
        number = next((season(x) for x in aliases if season(x)), 0)
        works[wid] = {"year": int(year), "aliases": aliases[:24], "season": number}
    return works


def search_names(work: dict, lang: str) -> list[str]:
    """Search alternate base names; verify the exact edition in headlines."""
    names = []
    for alias in work["aliases"]:
        base = SEASON.sub("", unicodedata.normalize("NFKC", alias)).strip(" -—:：()（）")
        if len(compact(base)) < 4:
            continue
        if lang == "zh" and (not re.search(r"[\u3400-\u9fff]", base) or re.search(r"[\u3040-\u30ff]", base)):
            continue
        if lang == "ja" and not re.search(r"[\u3040-\u30ff]", base):
            continue
        if lang == "en" and not re.search(r"[A-Za-z]{3}", base):
            continue
        if compact(base) not in {compact(x) for x in names}:
            names.append(base)
    return names[:2] or [SEASON.sub("", work["aliases"][0]).strip()]


def rss(wid: str, work: dict, lang: str) -> list[dict]:
    results, seen = [], set()
    for name in search_names(work, lang):
        params = urllib.parse.urlencode({"q": '"' + name[:90] + '"', "hl": lang,
            "gl": "JP" if lang == "ja" else "CN" if lang == "zh" else "US",
            "ceid": "JP:ja" if lang == "ja" else "CN:zh-Hans" if lang == "zh" else "US:en"})
        request = urllib.request.Request("https://news.google.com/rss/search?" + params,
            headers={"User-Agent": "Mozilla/5.0 (compatible; LiangYouAnimeNews/1.1)",
                     "Accept": "application/rss+xml"})
        try:
            with urllib.request.urlopen(request, timeout=12) as response:
                xml = response.read(280000)
            root = ET.fromstring(xml)
        except Exception:
            continue
        for entry in root.findall(".//channel/item")[:55]:
            raw = (entry.findtext("title") or "").strip()
            if not verified_headline(raw, work["aliases"], work["season"]):
                continue
            link = (entry.findtext("link") or "").strip()
            if not link.startswith("https://news.google.com/") or link in seen:
                continue
            try:
                published = parsedate_to_datetime(entry.findtext("pubDate") or "").astimezone(timezone.utc)
            except (ValueError, TypeError):
                continue
            now = datetime.now(timezone.utc)
            if published > now + timedelta(days=1) or published < now - timedelta(days=550):
                continue
            src = entry.find("source")
            publisher = (src.text or "").strip() if src is not None and src.text else "News"
            if not 1 <= len(publisher) <= 90:
                publisher = "News"
            results.append({"title": raw[:190], "url": link, "source": publisher[:90],
                            "language": lang, "date": published.isoformat(),
                            "titleMatchVerified": True})
            seen.add(link)
            if len(results) >= 8:
                break
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
    focus = [k for k in os.getenv("ANIME_NEWS_FOCUS", "").split(",") if k in works]
    ordered = sorted(works, key=lambda k: (
        1 if k in items else 0, str(items.get(k, {}).get("checkedAt") or ""), k))
    keys = list(dict.fromkeys(focus + ordered))[:batch]
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

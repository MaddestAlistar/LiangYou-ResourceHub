#!ausrabin/env python3
"""Gradually build exact-TMDB-ID news/video coverage for all catalog titles.

The Cloudflare Worker verifies title identity. This job only stores URL metadata
that was already ID-checked by the Worker; no scraping, synthetic articles or
third-party credentials are involved. Failed upstream checks never delete data.
"""
from __future__ import annotations

import concurrent.futures
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "media-title-coverage.json"
BASE = "https://liangyou-streaming-availability.maddestalistar.workers.dev"
KINDS = ("movie", "tv")
MAX_ROWS = 650
ID_PATTERN = re.compile(r"^(?:tmdb-detail:|tmdb-profile-v2:)?(movie|tv)-([1-9][0-9]{0,9})$")


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def valid_url(url):
    try:
        p = urllib.parse.urlparse(str(url))
        host = (p.hostname or "").lower()
        return (str(url) if p.scheme == "https" and not p.username and not p.password
                and host not in ("localhost", "127.0.0.1", "::1")
                and not host.endswith(".localhost") else "")
    except (ValueError, TypeError):
        return ""


def fetch(path):
    req = urllib.request.Request(BASE + path, headers={
        "User-Agent": "LiangYou-ResourceHub/1.0 (+https://maddestalistar.github.io/LiangYou-ResourceHub/)",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=28) as res:
        if res.status != 200:
            raise RuntimeError("http_not_ok")
        return json.loads(res.read(500000))


def candidates():
    identities = set()
    # The normalized catalog, not a hand-maintained three-film allow-list.
    try:
        doc = json.loads((ROOT / "data" / "media-intel.json").read_text(encoding="utf-8"))
        for work in (doc.get("works") or {}).values():
            if not isinstance(work, dict) or work.get("kind") not in KINDS:
                continue
            kind, mid = work["kind"], work.get("tmdb_id")
            if str(mid).isdigit() and 0 < int(mid) < 10**10:
                identities.add(f"{kind}:{int(mid)}")
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    # Previously opened films and series must also be eligible, even if an old
    # normalized catalog omitted their category.
    try:
        cache = json.loads((ROOT / "data" / "media-cache.json").read_text(encoding="utf-8"))
        for name in cache:
            m = ID_PATTERN.match(name)
            if m:
                identities.add(f"{m[1]}:{int(m[2])}")
    except (OSError, ValueError, TypeError):
        pass
    # Known curated records are already covered. Spend the API budget on others.
    try:
        curated = json.loads((ROOT / "data" / "media-title-news.json").read_text(encoding="utf-8"))
        identities -= set((curated.get("titles") or {}).keys())
    except (OSError, ValueError, TypeError):
        pass
    return sorted(identities)


def clean_articles(doc, kind, ident):
    if not isinstance(doc, dict) or doc.get("ok") is not True or doc.get("kind") != kind:
        return None
    if doc.get("tmdbId") != ident or not isinstance(doc.get("articles"), list):
        return None
    results = []
    seen = set()
    edition = doc.get("year")
    minimum_year = max(1970, edition - 3) if isinstance(edition, int) and edition > 1900 else 1990
    for row in doc["articles"][:65]:
        if not isinstance(row, dict) or row.get("titleMatchVerified") is not True:
            continue
        title = str(row.get("title") or "").strip()[:180]
        published = str(row.get("date") or "")
        try:
            if published and datetime.fromisoformat(published.replace("Z", "+00:00")).year < minimum_year:
                continue
        except ValueError:
            continue
        url = valid_url(row.get("url"))
        if len(title) < 8 or not url or url in seen:
            continue
        seen.add(url)
        results.append({
            "title": title, "url": url,
            "source": str(row.get("source") or "Publisher")[:64],
            "language": row.get("language") if row.get("language") in ("zh", "en", "ja", "ko") else "en",
            "date": row.get("date") if isinstance(row.get("date"), str) else None,
            "titleMatchVerified": True,
            "type": row.get("type") if row.get("type") == "community" else "article",
        })
        if len(results) >= 24:
            break
    return results


def clean_videos(doc, kind, ident):
    if not isinstance(doc, dict) or doc.get("ok") is not True or doc.get("kind") != kind:
        return None
    if doc.get("tmdbId") != ident or not isinstance(doc.get("videos"), list):
        return None
    year = doc.get("year")
    if not isinstance(year, int) or not 1900 <= year <= 2100:
        return []
    seen, results = set(), []
    for row in doc["videos"][:35]:
        if not isinstance(row, dict) or row.get("verifiedByTitleId") is not True:
            continue
        bvid = str(row.get("videoId") or "")
        if not re.fullmatch(r"BV[A-Za-z0-9]{10}", bvid):
            continue
        if row.get("tmdbId") != ident or row.get("kind") != kind or row.get("platform") != "bilibili":
            continue
        if row.get("year") != year or row.get("verifiedSource") != f"https://www.bilibili.com/video/{bvid}/":
            continue
        if bvid in seen:
            continue
        seen.add(bvid)
        results.append({
            "kind": kind, "tmdbId": ident, "title": str(row.get("title") or "")[:100],
            "year": year, "platform": "bilibili", "videoId": bvid,
            "verifiedSource": row["verifiedSource"],
            "verifiedByTitleId": True, "name": str(row.get("name") or "")[:145],
            "publisher": str(row.get("publisher") or "Bilibili")[:65],
            "type": "Trailer" if row.get("type") == "Trailer" else "Related",
            "likes": row.get("likes") if type(row.get("likes")) is int and row["likes"] >= 0 else None,
        })
        if len(results) >= 10:
            break
    return results


def clean_youtube_trailers(doc, kind, ident):
    # This is a server-generated TMDB-ID profile, not a title-only web search.
    if not isinstance(doc, dict) or doc.get("ok") is not True or doc.get("kind") != kind:
        return None
    if doc.get("tmdb_id") != ident or doc.get("id") != f"tmdb-{kind}-{ident}":
        return None
    date = str(doc.get("date") or "")
    year = int(date[:4]) if re.fullmatch(r"(?:19|20)\\d{2}", date[:4]) else None
    if not isinstance(year, int):
        return []
    rows = doc.get("profile", {}).get("videos", [])
    if not isinstance(rows, list):
        return []
    out, seen = [], set()
    for row in rows[:12]:
        if not isinstance(row, dict):
            continue
        url = valid_url(row.get("url"))
        try:
            parsed = urllib.parse.urlparse(url)
            query = urllib.parse.parse_qs(parsed.query)
            video_id = (query.get("v") or [""])[0]
        except (TypeError, ValueError):
            continue
        if parsed.hostname not in ("www.youtube.com", "youtube.com") or parsed.path != "/watch":
            continue
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id) or video_id in seen:
            continue
        seen.add(video_id)
        out.append({
            "kind": kind, "tmdbId": ident, "year": year,
            "id": video_id, "official": True, "verifiedByTitleId": True,
            "type": "Trailer", "title": str(row.get("name") or "Official trailer")[:145],
            "url": f"https://www.youtube.com/watch?v={video_id}"
        })
        if len(out) >= 3:
            break
    return out


def collect(key):
    kind, raw_id = key.split(":")
    ident = int(raw_id)
    fetched = {}
    for label, route in (
        ("articles", f"/api/news/title/{kind}/{ident}?v=11"),
        ("videos", f"/api/videos/title/{kind}/{ident}?v=6"),
        ("youtube", f"/api/title/{kind}/{ident}"),
    ):
        try:
            fetched[label] = fetch(route)
        except Exception as exc:
            print("COVERAGE_SOURCE_FAILED", key, label, type(exc).__name__)
    articles = clean_articles(fetched["articles"], kind, ident) if "articles" in fetched else None
    videos = clean_videos(fetched["videos"], kind, ident) if "videos" in fetched else None
    youtube = clean_youtube_trailers(fetched["youtube"], kind, ident) if "youtube" in fetched else None
    news = fetched.get("articles", {})
    video = fetched.get("videos", {})
    status = {
        "news": str(news.get("status") or "unavailable")[:30] if isinstance(news, dict) else "unavailable",
        "video": str(video.get("status") or "unavailable")[:30] if isinstance(video, dict) else "unavailable",
        "newsFound": len(articles or ()),
        "videosFound": len(videos or ()),
        "youtubeFound": len(youtube or ()),
        "youtube": "ok" if youtube else "no_data" if youtube is not None else "unavailable",
    }
    return key, articles, videos, youtube, news.get("year") if isinstance(news, dict) else None, status


def main():
    try:
        previous = json.loads(OUT.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        previous = {}
    items = {k: v for k, v in (previous.get("items") or {}).items()
             if isinstance(k, str) and re.fullmatch(r"(movie|tv):[1-9][0-9]{0,9}", k) and isinstance(v, dict)}
    works = candidates()
    limit = max(1, min(30, int(os.getenv("COVERAGE_BATCH", "20"))))
    # Rotate across every catalog title. A failed or empty search still records
    # the attempt, so 20 popular titles cannot monopolize every daily job.
    # Reserve some capacity for works whose last search returned no articles.
    # The remainder still cycles across the entire catalog, so popular films
    # cannot prevent older or previously successful titles from refreshing.
    by_age = lambda key: (str(items.get(key, {}).get("checkedAt") or ""), key)
    missing = sorted((key for key in works if not items.get(key, {}).get("articles")), key=by_age)
    missing_quota = min(len(missing), max(1, limit // 3))
    chosen = missing[:missing_quota]
    chosen_set = set(chosen)
    chosen.extend(key for key in sorted(works, key=by_age)
                  if key not in chosen_set and len(chosen) < limit)
    checked_at = utc_now()
    successes = 0
    status_counts = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for key, articles, videos, youtube, year, status in pool.map(collect, chosen):
            for family in ("news", "video", "youtube"):
                value = status[family]
                counter_key = family + ":" + value
                status_counts[counter_key] = status_counts.get(counter_key, 0) + 1
            old = items.get(key, {})
            # The upstream may temporarily return HTTP 200 with an empty list
            # after rate limiting or search changes. Retain previously verified
            # material instead of erasing a film's existing cards.
            record = {"checkedAt": checked_at,
                      "articles": articles or old.get("articles", []),
                      "videos": videos or old.get("videos", []),
                      "youtubeTrailers": youtube or old.get("youtubeTrailers", []),
                      "newsStatus": status["news"],
                      "videoStatus": status["video"],
                      "newsCandidates": status["newsFound"],
                      "videoCandidates": status["videosFound"],
                      "youtubeStatus": status["youtube"],
                      "youtubeCandidates": status["youtubeFound"]}
            if isinstance(year, int) and 1900 <= year <= 2100:
                record["year"] = year
            elif isinstance(old.get("year"), int):
                record["year"] = old["year"]
            if record["articles"] or record["videos"]:
                successes += 1
            items[key] = record
    # Keep coverage history bounded without silently removing curated records.
    if len(items) > MAX_ROWS:
        items = dict(sorted(items.items(),
                            key=lambda kv: kv[1].get("checkedAt", ""), reverse=True)[:MAX_ROWS])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"schema": 1, "updatedAt": checked_at, "items": items},
                              ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    coverage = {
        "titles": len(items),
        "with_news": sum(bool(row.get("articles")) for row in items.values()),
        "with_native_video": sum(bool(row.get("videos")) for row in items.values()),
        "with_official_youtube": sum(bool(row.get("youtubeTrailers")) for row in items.values()),
        "without_news": sum(not row.get("articles") for row in items.values()),
    }
    print("COVERAGE_RESULT", "available_catalog=", len(works), "checked=", len(chosen),
          "with_material=", successes, "stored=", len(items),
          "coverage=", json.dumps(coverage, ensure_ascii=False, sort_keys=True),
          "upstream=", json.dumps(status_counts, ensure_ascii=False, sort_keys=True))
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as summary:
            summary.write("### Film coverage refresh\n\n")
            summary.write("| Metric | Count |\n|---|---:|\n")
            for k, v in coverage.items():
                summary.write(f"| {k.replace('_', ' ')} | {v} |\n")
            summary.write("\nSource results (this batch): " +
                          ", ".join(f"{k}={v}" for k, v in sorted(status_counts.items())) + "\n")


if __name__ == "__main__":
    main()

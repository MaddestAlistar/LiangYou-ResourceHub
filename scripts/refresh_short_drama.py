#!/usr/bin/env python3
"""MDJ Hub short-drama catalog, using the official /openapi/v1/dramas endpoint.

A GitHub Actions secret supplies X-API-Key. Only public, normalized metadata is
saved for GitHub Pages; credentials, provider response bodies, and expiring play
URLs are never published.
"""
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/media-short-dramas.json"
API_URL = "https://themdjhub.org/openapi/v1/dramas"
MAX_ITEMS = 180
KINDS = {
    "live_action": "real",
    "live-action": "real",
    "real_drama": "real",
    "ai_drama": "ai",
    "ai_drama_series": "ai",
    "motion_comic": "comic",
    "comic": "comic",
    "animated": "comic",
}


def clean(value, limit=200):
    if isinstance(value, (str, int, float)):
        return re.sub(r"[\x00-\x1f\x7f]+", " ", str(value)).strip()[:limit]
    return ""


def get_first(row, *names):
    for name in names:
        value = row.get(name)
        if value is not None and value != "":
            return value
    return None


def public_url(value, *, poster=False):
    if not isinstance(value, str) or not value.strip():
        return ""
    raw = value.strip()
    if raw.startswith("//"):
        raw = "https:" + raw
    elif raw.startswith("/"):
        if poster and not raw.startswith(("/t/p/", "/images/", "/assets/", "/uploads/")):
            raw = "https://themdjhub.org/t/p/w500" + raw
        else:
            raw = "https://themdjhub.org" + raw
    try:
        parsed = urllib.parse.urlsplit(raw)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            return ""
        if parsed.hostname in ("localhost", "127.0.0.1", "::1") or parsed.hostname.endswith(".local"):
            return ""
        forbidden = {"token", "apikey", "api_key", "key", "secret", "signature",
                     "authorization", "auth", "access_token", "play_token"}
        if any(k.lower() in forbidden for k, _ in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)):
            return ""
        return raw[:900]
    except (ValueError, TypeError):
        return ""


def items_from(payload):
    """Official native format: {data: [...], meta: {...}}."""
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []
    data = payload.get("data", payload)
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        for key in ("results", "items", "list", "records", "dramas"):
            if isinstance(data.get(key), list):
                return [x for x in data[key] if isinstance(x, dict)]
    for key in ("results", "items", "list"):
        if isinstance(payload.get(key), list):
            return [x for x in payload[key] if isinstance(x, dict)]
    return []


def infer_kind(row):
    typ = clean(get_first(row, "contentType", "mdj_content_type", "content_type",
                          "formatType", "dramaType", "kind", "type"), 50).lower()
    if typ in KINDS:
        return KINDS[typ]
    label = clean(get_first(row, "contentTypeLabel", "mdj_content_type_label",
                            "formatTypeLabel"), 40)
    if "漫剧" in label or "漫画" in label or "动画" in label:
        return "comic"
    if "AI" in label.upper() or "人工智能" in label:
        return "ai"
    return "real" if typ in ("", "tv", "drama") or "真人" in label else "other"


def episode_count(row):
    value = get_first(row, "episodes", "number_of_episodes",
                      "episodeCount", "episode_count", "totalEpisodes")
    if isinstance(value, list):
        value = len(value)
    try:
        number = int(value)
        return number if 1 <= number <= 2000 else None
    except (TypeError, ValueError, OverflowError):
        return None


def newer(row, *, is_new_feed=False):
    value = get_first(row, "releaseDate", "release_date", "first_air_date",
                      "publishedAt", "created_at")
    if isinstance(value, str) and value[:10]:
        try:
            published = datetime.fromisoformat(value[:10]).replace(tzinfo=timezone.utc)
            return timedelta(0) <= datetime.now(timezone.utc) - published <= timedelta(days=30)
        except ValueError:
            pass
    return is_new_feed


def normalize(row, *, group, rank=None):
    title = clean(get_first(row, "title", "name", "originalTitle", "original_title",
                            "dramaName"), 140)
    if not title:
        return None
    item_id = clean(get_first(row, "id", "string_id", "drama_id", "dramaId"), 100)
    if not item_id:
        return None
    poster = get_first(row, "posterUrl", "poster_url", "poster", "coverUrl",
                       "cover_url", "cover", "poster_path", "posterPath")
    genres = row.get("genres")
    keywords = row.get("keywords")
    labels = []
    for source in (genres, keywords):
        if isinstance(source, list):
            for label in source:
                val = clean(label if not isinstance(label, dict) else get_first(label, "name", "title"), 24)
                if val and val not in labels:
                    labels.append(val)
                if len(labels) >= 5:
                    break
    score = get_first(row, "score", "vote_average", "communityScore")
    score_source = clean(get_first(row, "scoreSource", "score_source"), 40)
    votes = get_first(row, "ratingCount", "vote_count", "votes")
    try:
        score = float(score)
        votes = int(votes or 0)
        if not (0 < score <= 10 and votes > 0 and score_source not in ("ai_initial", "ai", "estimated")):
            score = None
    except (ValueError, TypeError, OverflowError):
        score = None
    popularity = get_first(row, "popularity", "heat")
    try:
        popularity = int(float(popularity))
        if not 0 <= popularity <= 10**14:
            popularity = None
    except (ValueError, TypeError, OverflowError):
        popularity = None
    kind = infer_kind(row)
    direct = public_url(get_first(row, "url", "detailUrl", "detail_url", "homepage"))
    if not direct:
        direct = "https://themdjhub.org/drama/" + urllib.parse.quote(item_id, safe="")
    status = clean(get_first(row, "status"), 35)
    return {
        "id": item_id, "title": title,
        "poster": public_url(poster, poster=True),
        "intro": clean(get_first(row, "overview", "intro", "description", "summary"), 700),
        "tags": labels[:4], "episodes": episode_count(row),
        "published_episodes": get_first(row, "publishedEpisodes", "mdj_published_episodes"),
        "kind": kind, "kind_label": clean(get_first(row, "contentTypeLabel", "mdj_content_type_label", "formatTypeLabel"), 40),
        "status": status,
        "platform": clean(get_first(row, "platform"), 40),
        "release_date": clean(get_first(row, "releaseDate", "release_date", "first_air_date"), 24),
        "heat": popularity,
        "rating": round(score, 1) if score is not None else None,
        "rank": rank if group == "popular" else None,
        "is_new": newer(row, is_new_feed=(group == "new")),
        "groups": [group],
        "url": direct,
    }


def fetch_feed(api_key, *, sort="popular", limit=60, content_type=None):
    params = {"page": "1", "limit": str(limit), "sort": sort}
    if content_type:
        params["content_type"] = content_type
    url = API_URL + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={
        "Accept": "application/json", "X-API-Key": api_key,
        "User-Agent": "LiangYou-ResourceHub/1.0 (server-side metadata collection)",
    })
    with urllib.request.urlopen(request, timeout=22) as response:
        if response.status != 200:
            raise ValueError("unexpected_http_status")
        payload = json.loads(response.read(2000000))
    if isinstance(payload, dict):
        if "error" in payload and payload["error"]:
            raise ValueError("provider_error")
        if payload.get("code") not in (None, 0, "0", 200, "200", 10000, "10000"):
            raise ValueError("provider_code")
    rows = items_from(payload)
    if not rows:
        raise ValueError("no_items")
    return rows


def collect(key):
    by_id = {}
    # The official documentation supports sort=popular, sort=new, and
    # content_type filtering. Ranking badges come only from the popular feed.
    feeds = [
        ("popular", "popular", None, 80),
        ("new", "new", None, 55),
        ("ai", "popular", "ai_drama", 30),
        ("comic", "popular", "motion_comic", 30),
        ("comic", "popular", "comic", 20),
    ]
    successes = []
    for group, sort, kind, limit in feeds:
        try:
            rows = fetch_feed(key, sort=sort, content_type=kind, limit=limit)
            count = 0
            for index, row in enumerate(rows):
                item = normalize(row, group=("popular" if group == "popular" else "new" if group == "new" else group),
                                 rank=index + 1 if group == "popular" else None)
                if not item or (kind and item["kind"] != "comic" if kind in ("motion_comic", "comic") else kind and item["kind"] != "ai"):
                    continue
                old = by_id.get(item["id"])
                if old:
                    old["groups"] = list(dict.fromkeys(old["groups"] + item["groups"]))
                    old["is_new"] = old["is_new"] or item["is_new"]
                    for key_name in ("poster", "intro", "platform", "status", "release_date", "episodes", "heat", "rating"):
                        if old.get(key_name) is None or old.get(key_name) == "":
                            old[key_name] = item.get(key_name)
                else:
                    by_id[item["id"]] = item
                count += 1
                if len(by_id) >= MAX_ITEMS:
                    break
            successes.append(group + ":" + str(count))
        except urllib.error.HTTPError as error:
            print("SHORT_DRAMA_FEED_HTTP", group, error.code)
            if error.code in (401, 403):
                break
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
            print("SHORT_DRAMA_FEED_UNAVAILABLE", group, type(error).__name__)
        time.sleep(0.25)
    return list(by_id.values())[:MAX_ITEMS], successes


def main():
    key = (os.environ.get("MDJHUB_API_KEY") or "").strip()
    if not key:
        print("SHORT_DRAMA_NO_SECRET: MDJHUB_API_KEY is not available")
        return
    records, successes = collect(key)
    if not records:
        print("SHORT_DRAMA_NO_VERIFIED_RECORDS; old snapshot retained")
        return
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    output = {
        "schema": 1, "source": "MDJ Hub", "status": "ok",
        "checked_at": now, "items": records,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts = {kind: sum(item["kind"] == kind for item in records)
              for kind in ("real", "ai", "comic")}
    print("SHORT_DRAMA_UPDATED", len(records), "kinds", counts, "feeds", successes)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Refresh public short-drama metadata from a configured MDJ Hub endpoint.

Never store the API key, raw provider payloads, or credential-bearing URLs.
The provider endpoint is deliberately configurable: the developer apply page
does not document an independently verified API path.
"""
import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/media-short-dramas.json"
MAX_ITEMS = 80


def clean(value, limit=300):
    return str(value).strip()[:limit] if isinstance(value, (str, int, float)) else ""


def https_url(value):
    if not isinstance(value, str):
        return ""
    try:
        part = urlsplit(value.strip())
        if part.scheme != "https" or not part.hostname or part.username or part.password:
            return ""
        if part.hostname in ("localhost", "127.0.0.1", "::1") or part.hostname.endswith(".local"):
            return ""
        if re.search(r"(?:^|[?&])(token|key|api_key|secret|authorization)=", part.query, re.I):
            return ""
        return value.strip()[:1000]
    except (ValueError, TypeError):
        return ""


def field(item, *names):
    for name in names:
        v = item.get(name)
        if v is not None and v != "":
            return v
    return None


def items_from(payload):
    """Handle common documented shapes; never treat arbitrary dicts as results."""
    obj = payload
    for _ in range(5):
        if isinstance(obj, list):
            return [x for x in obj if isinstance(x, dict)]
        if not isinstance(obj, dict):
            break
        selected = None
        for key in ("items", "list", "results", "records", "rows", "dramas",
                    "short_dramas", "shortDramas", "bookList", "videoList", "data"):
            value = obj.get(key)
            if isinstance(value, (list, dict)):
                selected = value
                break
        if selected is None:
            break
        obj = selected
    return []


def normalize(raw, checked_at):
    title = clean(field(raw, "title", "name", "drama_name", "dramaName",
                        "book_name", "bookName", "shortPlayName"), 140)
    if not title or len(title) > 140:
        return None
    tags_value = field(raw, "tags", "genres", "labels", "categories")
    if isinstance(tags_value, str):
        tags_value = re.split(r"[,，、/|]", tags_value)
    if not isinstance(tags_value, list):
        tags_value = []
    tags = [clean(t if not isinstance(t, dict) else field(t, "name", "title"), 24)
            for t in tags_value[:8]]
    tags = list(dict.fromkeys(t for t in tags if t))[:4]
    typ = clean(field(raw, "type", "category", "kind", "dramaType", "book_type"), 60)
    signature = (typ + " " + " ".join(tags)).casefold()
    kind = ("comic" if re.search(r"漫剧|漫画|动画|动漫|animated|comic", signature) else
            "ai" if re.search(r"(?:^|[^a-z])ai(?:[^a-z]|$)|人工智能", signature) else "real")
    if re.search(r"(?:^|[^a-z])ai(?:[^a-z]|$)|人工智能", signature):
        kind = "ai"
    episodes_raw = field(raw, "episodes", "episode_count", "episodeCount",
                         "total_episodes", "totalEpisodes", "chapter_num", "total")
    episodes = len(episodes_raw) if isinstance(episodes_raw, list) else None
    if episodes is None:
        try:
            episodes = int(episodes_raw)
        except (ValueError, TypeError):
            episodes = None
    if episodes is not None and not 1 <= episodes <= 1000:
        episodes = None
    rank_raw = field(raw, "rank", "ranking", "rank_no")
    try:
        rank = int(rank_raw)
        if rank < 1 or rank > 5000:
            rank = None
    except (TypeError, ValueError):
        rank = None
    published = clean(field(raw, "published_at", "release_date", "releaseDate",
                            "publish_time", "online_time", "created_at"), 40)
    is_new = raw.get("is_new") is True or raw.get("isNew") is True
    if published and not is_new:
        try:
            from datetime import timedelta
            published_date = datetime.fromisoformat(published.replace("Z", "+00:00"))
            if published_date.tzinfo is None:
                published_date = published_date.replace(tzinfo=timezone.utc)
            is_new = timedelta(0) <= datetime.now(timezone.utc) - published_date <= timedelta(days=30)
        except ValueError:
            pass
    link = https_url(field(raw, "url", "detail_url", "detailUrl", "share_url", "shareUrl"))
    return {
        "id": clean(field(raw, "id", "drama_id", "dramaId", "book_id", "bookId",
                           "short_play_id", "shortPlayId"), 90),
        "title": title,
        "poster": https_url(field(raw, "poster", "cover", "cover_url", "coverUrl",
                                   "image_url", "image", "thumb", "pic")),
        "intro": clean(field(raw, "intro", "description", "summary", "brief", "desc"), 500),
        "tags": tags,
        "episodes": episodes,
        "rank": rank,
        "kind": kind,
        "is_new": is_new,
        "url": link,
    }


def main():
    endpoint = (os.environ.get("MDJHUB_API_URL") or "").strip()
    key = (os.environ.get("MDJHUB_API_KEY") or "").strip()
    if not key or not endpoint:
        print("SHORT_DRAMA_NOT_CONFIGURED: require MDJHUB_API_KEY and MDJHUB_API_URL")
        return
    if not https_url(endpoint):
        print("SHORT_DRAMA_INVALID_ENDPOINT: HTTPS URL required, without credentials")
        return
    mode = (os.environ.get("MDJHUB_AUTH_MODE") or "bearer").strip().lower()
    if mode not in ("bearer", "x-api-key"):
        print("SHORT_DRAMA_AUTH_MODE_UNSUPPORTED")
        return
    headers = {
        "Accept": "application/json",
        "User-Agent": "LiangYou-ResourceHub/1.0 (public snapshot collector)",
    }
    headers["Authorization" if mode == "bearer" else "X-API-Key"] = (
        "Bearer " + key if mode == "bearer" else key
    )
    try:
        req = urllib.request.Request(endpoint, headers=headers)
        with urllib.request.urlopen(req, timeout=18) as response:
            if response.status != 200:
                raise ValueError("non_200")
            payload = json.loads(response.read(1500000))
        if isinstance(payload, dict) and payload.get("code") not in (None, 0, "0", 200, "200"):
            raise ValueError("provider_error")
        raw = items_from(payload)
        if not raw:
            raise ValueError("no_dramas")
        checked = datetime.now(timezone.utc).isoformat(timespec="seconds")
        records, seen = [], set()
        for item in raw:
            drama = normalize(item, checked)
            if not drama:
                continue
            identity = drama["id"] or drama["title"].casefold()
            if identity in seen:
                continue
            seen.add(identity)
            records.append(drama)
            if len(records) >= MAX_ITEMS:
                break
        if not records:
            raise ValueError("no_valid_dramas")
        output = {"schema": 1, "source": "MDJ Hub", "status": "ok",
                  "checked_at": checked, "items": records}
        OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("SHORT_DRAMA_UPDATED", len(records))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        # Never print response bodies, request URLs or token-bearing headers.
        print("SHORT_DRAMA_UNAVAILABLE", type(exc).__name__)


if __name__ == "__main__":
    main()

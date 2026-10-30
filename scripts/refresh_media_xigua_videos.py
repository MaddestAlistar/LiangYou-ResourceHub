#!/usr/bin/env python3
"""Optional Xigua discovery: SandBase public metadata + Xigua's own iframe approval.

Only approved embeds are published; never expose API keys, scrape protected
playback URLs, or claim a search hit is a verified title identity.
"""
from __future__ import annotations
import json, os, re, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

from refresh_media_extra_videos import (
    matches_title, normalize, VIDEO_WORDS, TRAILER_WORDS, BAN_WORDS
)
from refresh_media_anime_videos import catalog as anime_catalog, safe_anime_video
from xigua_zero_spend import LocalFreeBudget, FreeQuotaStop, funded_capacity_is_zero

ROOT = Path(__file__).resolve().parents[1]
FILMS = ROOT / "data/media-intel.json"
OUT = ROOT / "data/media-xigua-videos.json"
API = "https://api.sandbase.ai/v1/api/xigua/app-v2/search-video"
OFFICIAL = "https://www.ixigua.com/api/public/get_iframe_info?url="
ID = re.compile(r"[1-9]\d{14,20}")
IFRAME = re.compile(r"https://(?:www\.)?ixigua\.com/iframe/([1-9]\d{14,20})(?:[?&/]|(?=['\"\s<>]))")
MAX_ITEMS = 450
MAX_VIDEOS = 4

def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def json_request(url, body=None, key=None, timeout=16):
    headers = {"User-Agent": "LiangYou-ResourceHub-Xigua/1.0", "Accept": "application/json"}
    if key:
        headers["Authorization"] = "Bearer " + key
        headers["Content-Type"] = "application/json"
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError("http_" + str(response.status))
        return json.loads(response.read(1300000))

def search(keyword, key, budget=None):
    if budget is not None:
        budget.authorize()
    try:
        response = json_request(API, {"keyword": keyword}, key=key)
    except Exception as error:
        # Only status/type, never response body or credentials.
        http_status = getattr(error, "code", None)
        if isinstance(http_status, int):
            print("XIGUA_SANDBASE_SEARCH_HTTP", http_status, flush=True)
        else:
            print("XIGUA_SANDBASE_SEARCH_EXCEPTION", type(error).__name__, flush=True)
        # Do not retry; a rejected request could still count against free quota.
        raise FreeQuotaStop("sandbase_search_failed") from None
    if response.get("status") != "completed":
        raise RuntimeError("search_unavailable")
    outputs = response.get("outputs")
    if not isinstance(outputs, list) or not outputs or not isinstance(outputs[0], dict):
        raise RuntimeError("search_response_changed")
    data = outputs[0].get("data")
    if not isinstance(data, dict) or data.get("err_code") not in (0, None):
        raise RuntimeError("search_upstream_error")
    results = data.get("results")
    if not isinstance(results, list):
        raise RuntimeError("search_results_changed")
    return results[:30]

def parse_result(row):
    """SandBase results carry nested upstream data; do not assume optional fields."""
    if not isinstance(row, dict):
        return None
    parts = [row]
    for key in ("data", "video", "item", "item_info", "item_data"):
        val = row.get(key)
        if isinstance(val, dict):
            parts.insert(0, val)
            for sub in ("data", "video", "item"):
                if isinstance(val.get(sub), dict):
                    parts.insert(0, val[sub])
    def get(*keys):
        for part in parts:
            for k in keys:
                if part.get(k) not in (None, ""):
                    return part[k]
        return None
    video_id = str(get("group_id", "item_id", "video_id", "videoId", "id") or "")
    name = str(get("title", "video_title", "videoTitle") or "").strip()
    if not ID.fullmatch(video_id) or not 5 <= len(name) <= 170:
        return None
    cover = get("large_image_url", "thumbnail", "cover_url", "cover", "poster_url")
    if isinstance(cover, dict):
        cover = cover.get("url") or cover.get("url_list", [None])[0]
    if isinstance(cover, list):
        cover = cover[0] if cover else None
    if isinstance(cover, dict):
        cover = cover.get("url")
    author = get("author", "user_info")
    if isinstance(author, dict):
        author = author.get("name") or author.get("nickname")
    author = str(author or get("user_name", "nickname") or "西瓜视频")[:60]
    return {"videoId": video_id, "name": name,
            "thumbnail": trusted_cover(cover), "publisher": author}

def trusted_cover(value):
    if not isinstance(value, str):
        return None
    url = value.strip()
    if url.startswith("//"):
        url = "https:" + url
    if len(url) > 650 or not url.startswith("https://"):
        return None
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    allowed = ("bdxiguaimg.com", "byteimg.com", "pstatp.com", "toutiaoimg.com", "ixigua.com")
    return url if any(host == d or host.endswith("." + d) for d in allowed) else None

def approved_embed(video_id):
    """Use only the official approval response, not a guessed iframe path."""
    if not ID.fullmatch(str(video_id)):
        return None
    url = OFFICIAL + urllib.parse.quote("https://www.ixigua.com/" + video_id, safe="")
    response = json_request(url)
    if response.get("code") != 0 or not isinstance(response.get("data"), dict):
        return None
    code = response["data"].get("iframe_code")
    if not isinstance(code, str) or "<iframe" not in code.lower():
        return None
    match = IFRAME.search(code.replace("&amp;", "&"))
    return match.group(1) if match else None

def official_api_ready():
    """Fail closed before any paid metadata search if the official JSON route is down.

    The public sample URL is from Xigua's iframe documentation; a code != 0
    response still proves the JSON route exists, but an HTML SPA fallback does not.
    """
    documented = "https://www.ixigua.com/6912360007799407118"
    try:
        response = json_request(OFFICIAL + urllib.parse.quote(documented, safe=""), timeout=12)
        return isinstance(response, dict) and isinstance(response.get("code"), int)
    except Exception:
        return False

def film_catalog():
    result = {}
    for work in json.loads(FILMS.read_text(encoding="utf8")).get("works", {}).values():
        if not isinstance(work, dict) or work.get("kind") not in ("movie", "tv"):
            continue
        mid = int(work.get("tmdb_id") or 0)
        if mid <= 0:
            continue
        title = str(work.get("title") or "").strip()
        original = str(work.get("original_title") or "").strip()
        date = str(work.get("date") or "")
        year = int(date[:4]) if re.match(r"^\d{4}", date) else 0
        if not title or year < 1900:
            continue
        result[work["kind"] + ":" + str(mid)] = {
            "kind": work["kind"], "id": work["kind"] + ":" + str(mid),
            "tmdb_id": mid, "title": title, "original": original,
            "aliases": list(dict.fromkeys(x for x in (title, original) if x)),
            "year": year
        }
    return result

def accept(work, video):
    name = video["name"]
    if BAN_WORDS.search(name) or not VIDEO_WORDS.search(name):
        return False
    if work["kind"] == "anime":
        return safe_anime_video(work, video)
    if not matches_title(name, work["aliases"], work["year"], work["kind"]):
        return False
    # Avoid false hits for very short/common film titles and film commentary
    # referring to other works.
    title = work["title"]
    if work["kind"] == "movie" and len(normalize(title)) <= 4 and re.search(r"[\u4e00-\u9fff]", title):
        if not re.search(r"[《「『]\s*" + re.escape(title) + r"\s*[》」』]", name):
            return False
    if re.search(r"热血航线|海贼无双|游戏实况|游戏攻略|手游|gameplay", name, re.I):
        return False
    return True

def work_queries(work):
    aliases = work["aliases"]
    han = next((x for x in aliases if re.search(r"[\u4e00-\u9fff]", x)), None)
    main = han or work["title"]
    keyword = "动漫 PV" if work["kind"] == "anime" else "预告片"
    return [main + " " + keyword, main + " " + ("动画 预告" if work["kind"] == "anime" else "相关视频")]

def row_for(work, item, embed):
    base = {"platform": "xigua", "videoId": item["videoId"],
            "embedId": embed, "embedVerified": True,
            "verifiedSource": "https://www.ixigua.com/" + item["videoId"],
            "name": item["name"][:145],
            "publisher": item["publisher"],
            "thumbnail": item["thumbnail"],
            "type": "Trailer" if TRAILER_WORDS.search(item["name"]) else "Related",
            "kind": work["kind"], "title": work["title"], "year": work["year"]}
    if work["kind"] == "anime":
        base.update(workId=work["id"], verifiedByCatalogTitle=True)
    else:
        base.update(tmdbId=work["tmdb_id"], matchedByTitle=True)
    return base

def discover(work, key, budget=None, verify_embed=True):
    candidates = {}
    for query in work_queries(work):
        for result in search(query, key, budget):
            item = parse_result(result)
            if item and item["videoId"] not in candidates and accept(work, item):
                candidates[item["videoId"]] = item
        if len(candidates) >= MAX_VIDEOS * 3:
            break
        time.sleep(.35)
    videos = []
    if verify_embed:
        for item in list(candidates.values())[:MAX_VIDEOS * 3]:
            try:
                embed = approved_embed(item["videoId"])
            except Exception:
                # The official JSON endpoint may return an HTML SPA page.
                # Search metadata alone must never authorize an iframe.
                embed = None
            if embed:
                videos.append(row_for(work, item, embed))
            if len(videos) >= MAX_VIDEOS:
                break
            time.sleep(.3)
    # Search matches are diagnostic-only, not cards in the public gallery.
    return videos, len(candidates)

def official_iframe_api_responds():
    """Fail closed before any potentially billed discovery if the official API serves HTML."""
    probe = OFFICIAL + urllib.parse.quote("https://www.ixigua.com/7444746393916277283", safe="")
    req = urllib.request.Request(probe, headers={
        "User-Agent": "Mozilla/5.0 (compatible; LiangYou-ResourceHub/1.0)",
        "Accept": "application/json,text/plain,*/*"
    })
    try:
        with urllib.request.urlopen(req, timeout=13) as response:
            if response.status != 200:
                return False
            ctype = response.headers.get("Content-Type", "").lower()
            return "application/json" in ctype or "text/json" in ctype
    except (OSError, ValueError):
        return False

def main():
    key = os.getenv("SANDBASE_API_KEY", "").strip()
    if not key:
        print("XIGUA_DISABLED: configure SANDBASE_API_KEY GitHub Actions secret for automatic discovery")
        return

    # The free quota is shared across every SandBase API in this organization.
    # A one-call/day local limit alone is NOT a no-charge guarantee.
    # Account API may return 403 to restricted keys. As a separate explicit
    # safeguard, the owner can confirm a provider-enforced $0 key spend cap.
    # Never infer this from the GitHub secret being present.
    provider_zero_spend_confirmed = os.getenv(
        "SANDBASE_HARD_ZERO_SPEND_CONFIRMED", ""
    ).strip().lower() == "true"
    if provider_zero_spend_confirmed:
        print("XIGUA_ZERO_SPEND_GATE: owner confirmed hard $0 provider key limit")
    else:
        try:
            if not funded_capacity_is_zero(key):
                print("XIGUA_ZERO_SPEND_STOP: balance or credit line is nonzero / unknown")
                return
        except Exception as error:
            print("XIGUA_ZERO_SPEND_STOP: cannot verify account balance",type(error).__name__)
            return
    # Allow a one-call smoke test without changing the persisted 24/day ceiling.
    per_run = max(1, min(12, int(os.getenv("XIGUA_SEARCH_PER_RUN", "12"))))
    budget = LocalFreeBudget(ROOT / "data/media-xigua-budget.json", daily_cap=24, run_cap=per_run)
    if budget.used >= budget.daily_cap:
        print("XIGUA_ZERO_SPEND_STOP: UTC daily local cap reached")
        return
    # Search only under the configured quota, even if the iframe API is unavailable;
    # unverified matches are counted only, never rendered as playable videos.
    can_embed = official_iframe_api_responds() and official_api_ready()
    if not can_embed:
        print("XIGUA_EMBED_API_UNAVAILABLE: metadata search only; iframe publication disabled")
    works = {**film_catalog(), **anime_catalog()}
    try:
        old = json.loads(OUT.read_text(encoding="utf8"))
    except (OSError, ValueError):
        old = {}
    items = {k: v for k, v in (old.get("items") or {}).items() if k in works and isinstance(v, dict)}
    batch = max(1, min(15, int(os.getenv("XIGUA_VIDEOS_BATCH", "8"))))
    chosen = sorted(works, key=lambda k: (str(items.get(k, {}).get("checkedAt") or ""), k))[:batch]
    for key_id in chosen:
        if budget.used >= budget.daily_cap or budget.this_run >= budget.run_cap:
            print("XIGUA_ZERO_SPEND_STOP: local run/daily cap reached")
            break
        work = works[key_id]
        try:
            videos, candidate_count = discover(work, key, budget, verify_embed=can_embed)
            items[key_id] = {"title": work["title"], "kind": work["kind"],
                             "year": work["year"], "tmdbId": work.get("tmdb_id", 0),
                             "workId": work.get("id", ""),
                             "checkedAt": now(), "videos": videos,
                             "matchingCandidates": candidate_count}
            print("XIGUA_CHECKED", key_id, "matched",candidate_count,
                  "embedded",len(videos), flush=True)
        except FreeQuotaStop as error:
            print("XIGUA_ZERO_SPEND_STOP",str(error),flush=True)
            break
        except Exception as error:
            print("XIGUA_UNAVAILABLE",key_id,type(error).__name__,flush=True)
            # Preserve previously approved records during provider outages.
        time.sleep(.5)
    if len(items) > MAX_ITEMS:
        items = dict(sorted(items.items(),
            key=lambda item: str(item[1].get("checkedAt") or ""), reverse=True)[:MAX_ITEMS])
    OUT.write_text(json.dumps({"schema": 1, "updatedAt": now(), "items": items},
                             ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    print("XIGUA_SUMMARY",len(chosen),len(items),
          "search_calls_today",budget.used,"search_calls_this_run",budget.this_run,flush=True)

if __name__ == "__main__":
    main()

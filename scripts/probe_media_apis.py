#!/usr/bin/env python3
"""One-shot secure read-only verification of public film API sources.
Never log API keys, bearer tokens, full URLs, authorization headers, or raw error bodies.
"""
import concurrent.futures
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

def secret(*names):
    return next((os.environ[n].strip() for n in names if os.environ.get(n, "").strip()), "")

def fetch(base, params=None, headers=None, payload=None, timeout=19):
    url = base
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    body = json.dumps(payload).encode() if payload is not None else None
    h = {"User-Agent": "LiangYouResourceHub/1.0", "Accept": "application/json", **(headers or {})}
    if body is not None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, headers=h, data=body)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            status = response.status
            raw = response.read(400000)
    except urllib.error.HTTPError as exc:
        status = exc.code
        raw = exc.read(10000)
    except urllib.error.URLError as exc:
        return None, {}, "network_" + type(exc.reason).__name__
    except Exception as exc:
        return None, {}, "request_" + type(exc).__name__
    try:
        obj = json.loads(raw)
    except Exception:
        return status, {}, "invalid_json"
    return status, obj, None

def report(name, status, good, detail="", configured=None, error=None):
    output = {"api": name, "result": "PASS" if good else ("MISSING_SECRET" if configured is False else "FAIL"),
              "http": status, "detail": detail}
    if configured is not None: output["secret_present"] = configured
    if error: output["issue_type"] = error
    return output

def missing(name, key):
    return report(name, None, False, "Expected GitHub secret: " + key, configured=False)

def jikan():
    status, obj, err = fetch("https://api.jikan.moe/v4/anime/1")
    if status is None or status in (429, 502, 503):
        status, obj, err = fetch("https://api.jikan.moe/v4/anime/1/full", timeout=23)
    d = obj.get("data", {}) if isinstance(obj, dict) else {}
    ok = status == 200 and isinstance(d, dict) and bool(d.get("mal_id")) and bool(d.get("title"))
    return report("Jikan v4", status, ok, "anime_id=" + str(d.get("mal_id")) + ", score_available=" + str(d.get("score") is not None), error=err)

def mal():
    key = secret("MAL_CLIENT_ID", "MYANIMELIST_CLIENT_ID")
    if not key: return missing("MyAnimeList v2", "MAL_CLIENT_ID")
    status, obj, err = fetch("https://api.myanimelist.net/v2/anime/1",
                             {"fields": "mean,rank,num_list_users"}, {"X-MAL-CLIENT-ID": key})
    d = obj if isinstance(obj, dict) else {}
    ok = status == 200 and d.get("id") == 1 and isinstance(d.get("title"), str)
    return report("MyAnimeList v2", status, ok, "anime_id=" + str(d.get("id")) + ", mean_available=" + str(d.get("mean") is not None), True, err)

def omdb():
    key = secret("OMDB_API_KEY")
    if not key: return missing("OMDb", "OMDB_API_KEY")
    status, obj, err = fetch("https://www.omdbapi.com/", {"i": "tt0137523", "apikey": key})
    d = obj if isinstance(obj, dict) else {}
    ratings = d.get("Ratings", []) if isinstance(d.get("Ratings"), list) else []
    sources = [r.get("Source", "") for r in ratings if isinstance(r, dict)]
    ok = status == 200 and d.get("Response") == "True" and d.get("imdbID") == "tt0137523"
    return report("OMDb", status, ok, "imdbRating=" + str(d.get("imdbRating") is not None and d.get("imdbRating") != "N/A")
          + ", Metascore=" + str(d.get("Metascore") is not None and d.get("Metascore") != "N/A")
          + ", ratings=" + ", ".join(sources[:5]), True, err)

def mdblist():
    key = secret("MDBLIST_API_KEY", "MDB_LIST_API_KEY")
    if not key: return missing("MDBList", "MDBLIST_API_KEY")
    status, obj, err = fetch("https://api.mdblist.com/tmdb/movie/550", {"apikey": key})
    d = obj if isinstance(obj, dict) else {}
    rows = d.get("ratings", []) if isinstance(d.get("ratings"), list) else []
    ok = status == 200 and (bool(rows) or bool(d.get("title")) or bool(d.get("ids")))
    return report("MDBList", status, ok, "movie=" + str(d.get("title", ""))[:60] + ", rating_sources=" + str(len(rows)), True, err)

def kofic():
    key = secret("KOFIC_API_KEY", "KOBIS_API_KEY")
    if not key: return missing("KOFIC / KOBIS", "KOFIC_API_KEY")
    target = (datetime.now(ZoneInfo("Asia/Seoul")).date() - timedelta(days=2)).strftime("%Y%m%d")
    status, obj, err = fetch("https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json",
                             {"key": key, "targetDt": target}, timeout=22)
    if status is None:
        status, obj, err = fetch("https://kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json",
                                 {"key": key, "targetDt": target}, timeout=25)
    d = obj.get("boxOfficeResult", {}) if isinstance(obj, dict) else {}
    rows = d.get("dailyBoxOfficeList", []) if isinstance(d, dict) else []
    ok = status == 200 and isinstance(rows, list) and len(rows) > 0
    return report("KOFIC / KOBIS", status, ok,
                  "date=" + target + ", movies=" + str(len(rows)) + ", top_movie=" + str(rows[0].get("movieNm", ""))[:50] if rows else "date=" + target + ", movies=0", True, err)

def tastedive():
    key = secret("TASTEDIVE_API_KEY")
    if not key: return missing("TasteDive", "TASTEDIVE_API_KEY")
    candidates = [
        ("https://tastedive.com/api/similar", {"q": "Fight Club", "k": key, "type": "movie", "limit": "3"}),
        ("https://tastedive.com/api/similar", {"q": "movie:Fight Club", "k": key, "type": "movie", "limit": "3"}),
    ]
    attempts = []
    for endpoint, params in candidates:
        status, obj, err = fetch(endpoint, params, timeout=15)
        data = obj.get("Similar", {}) if isinstance(obj, dict) else {}
        rows = data.get("Results", []) if isinstance(data, dict) else []
        ok = status == 200 and isinstance(rows, list) and bool(rows)
        attempts.append(str(status) if status else (err or "network_error"))
        if ok: return report("TasteDive", status, True, "recommendations=" + str(len(rows)), True)
    return report("TasteDive", status, False, "legacy endpoints " + "/".join(attempts) + " (could be API migration)", True, err)

def fanart():
    key = secret("FANARTTV_API_KEY", "FANART_API_KEY")
    if not key: return missing("Fanart.tv", "FANARTTV_API_KEY")
    status, obj, err = fetch("https://webservice.fanart.tv/v3.2/movies/550", {"api_key": key})
    d = obj if isinstance(obj, dict) else {}
    n = sum(len(v) for k, v in d.items() if isinstance(v, list) and k not in ("albums",))
    ok = status == 200 and (n > 0 or bool(d.get("image_count")))
    return report("Fanart.tv", status, ok, "movie=" + str(d.get("name", ""))[:45] + ", image_groups=" + str(n), True, err)

def tvdb():
    key = secret("THETVDB_API_KEY", "TVDB_API_KEY", "THETVDB_API_V4_KEY")
    if not key: return missing("TheTVDB v4", "THETVDB_API_KEY or TVDB_API_KEY")
    pin = secret("THETVDB_PIN", "TVDB_PIN")
    payload = {"apikey": key}
    if pin: payload["pin"] = pin
    status, obj, err = fetch("https://api4.thetvdb.com/v4/login", payload=payload, timeout=20)
    d = obj.get("data", {}) if isinstance(obj, dict) else {}
    token = d.get("token") if isinstance(d, dict) else None
    if status != 200 or not token:
        return report("TheTVDB v4", status, False, "login_failed, subscriber_pin_present=" + str(bool(pin)), True, err)
    next_status, next_obj, next_err = fetch("https://api4.thetvdb.com/v4/series/121361",
                                            headers={"Authorization": "Bearer " + token}, timeout=20)
    item = next_obj.get("data", {}) if isinstance(next_obj, dict) else {}
    ok = next_status == 200 and isinstance(item, dict) and bool(item.get("id"))
    return report("TheTVDB v4", next_status, ok, "login=ok, series_record=" + str(bool(item.get("id"))), True, next_err)

def youtube():
    key = secret("YOUTUBE_API_KEY", "YOUTUBE_DATA_API_KEY", "YOUTUBE_DATA_API_V3_KEY")
    if not key: return missing("YouTube Data API v3", "YOUTUBE_API_KEY")
    status, obj, err = fetch("https://www.googleapis.com/youtube/v3/search",
                             {"part": "snippet", "type": "video", "q": "Fight Club 1999 official trailer", "maxResults": "2", "key": key})
    rows = obj.get("items", []) if isinstance(obj, dict) else []
    ok = status == 200 and isinstance(rows, list) and len(rows) > 0
    return report("YouTube Data API v3", status, ok, "videos=" + str(len(rows)), True, err)

def gdelt():
    status, obj, err = fetch("https://api.gdeltproject.org/api/v2/doc/doc",
              {"query": '"film festival"', "mode": "ArtList", "maxrecords": "3", "format": "json", "timespan": "1week"},
              timeout=23)
    rows = obj.get("articles", []) if isinstance(obj, dict) else []
    ok = status == 200 and isinstance(rows, list) and len(rows) > 0
    return report("GDELT DOC 2.0", status, ok, "articles=" + str(len(rows)), error=err)

def kitsu():
    status, obj, err = fetch("https://kitsu.io/api/edge/anime/1",
        headers={"Accept": "application/vnd.api+json"}, timeout=20)
    d = obj.get("data", {}) if isinstance(obj, dict) else {}
    ok = status == 200 and isinstance(d, dict) and bool(d.get("id"))
    return report("Kitsu Anime", status, ok, "anime_id=" + str(d.get("id")), error=err)

def boxoffice():
    status, obj, err = fetch("https://www.boxofficehistory.com/api/v1/meta.json")
    d = obj if isinstance(obj, dict) else {}
    ok = status == 200 and bool(d) and ("built" in str(d).lower() or "film" in str(d).lower() or "movie" in str(d).lower())
    return report("Box Office History", status, ok, "metadata_keys=" + ",".join(list(d.keys())[:7]), error=err)

def introdb():
    status, obj, err = fetch("https://api.theintrodb.org/v4/media",
              {"tvdb_id": "71663", "season": "1", "episode": "1"}, timeout=20)
    if status in (400,403,404) or status is None:
        status, obj, err = fetch("https://api.theintrodb.org/v4/media",
              {"tvdb_id": "71663", "duration_ms": "7200000"}, timeout=20)
    d = obj if isinstance(obj, dict) else {}
    ok = status == 200 and bool(d) and ("kind" in d or "tvdb_id" in d or "intro" in d or "credits" in d or "episodes" in d)
    return report("TheIntroDB v4", status, ok,
                  "kind=" + str(d.get("kind", ""))[:30] + ", keys=" + ",".join(list(d.keys())[:6]), error=err)

def guardian():
    key = secret("GUARDIAN_API_KEY", "THE_GUARDIAN_API_KEY")
    if not key: return missing("The Guardian Open Platform", "GUARDIAN_API_KEY")
    status, obj, err = fetch("https://content.guardianapis.com/search",
              {"section": "film", "page-size": "2", "api-key": key, "order-by": "newest"})
    d = obj.get("response", {}) if isinstance(obj, dict) else {}
    rows = d.get("results", []) if isinstance(d, dict) else []
    ok = status == 200 and d.get("status") == "ok" and len(rows) > 0
    return report("The Guardian Open Platform", status, ok,
                  "film_articles=" + str(len(rows)) + ", total_search_matches=" + str(d.get("total")), True, err)

CHECKS = [jikan, mal, omdb, mdblist, kofic, tastedive, fanart, tvdb, youtube, gdelt, kitsu, boxoffice, introdb, guardian]

def main():
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:
        futs = {pool.submit(fn):fn.__name__ for fn in CHECKS}
        for future in concurrent.futures.as_completed(futs):
            name = futs[future]
            try:
                data = future.result()
            except Exception as exc:
                data = report(name, None, False, "unexpected_exception_type=" + type(exc).__name__)
            results[name] = data
    ordered = [results[fn.__name__] for fn in CHECKS]
    for data in ordered:
        print("MEDIA_API_PROBE " + json.dumps(data, ensure_ascii=False), flush=True)
    print("MEDIA_API_SUMMARY " + json.dumps({
        "total":len(ordered),
        "passed":sum(x["result"]=="PASS" for x in ordered),
        "missing_secrets":sum(x["result"]=="MISSING_SECRET" for x in ordered),
        "failed":sum(x["result"]=="FAIL" for x in ordered)
    }), flush=True)
    # Do not fail whole job on network failures: retain per-provider results for diagnosis.
if __name__ == "__main__":
    main()

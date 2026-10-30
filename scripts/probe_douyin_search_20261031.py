#!/usr/bin/env python3
"""Read-only Douyin search endpoint comparison using three open-source client parameter variants.

Isolated experiment, deliberately no Cookie, no passwords, no media downloads,
no bypass of login or anti-bot checks, no publication to the site.
"""
import json
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SEARCHES = [
    ("航海王 预告片", "航海王"),
    ("名侦探柯南 预告片", "名侦探柯南"),
    ("青之箱 第二季 预告片", "青之箱"),
]
ENDPOINT = "https://www.douyin.com"
VARIANTS = {
    "TikTokDownloader": {
        "path": "/aweme/v1/web/search/item/",
        "search_channel": "aweme_video_web",
        "search_source": "switch_tab", "list_type": "single",
        "version_code": "170400", "version_name": "17.4.0",
    },
    "MediaCrawler": {
        "path": "/aweme/v1/web/general/search/single/",
        "search_channel": "aweme_general",
        "search_source": "tab_search", "list_type": "multi",
    },
    "LIghtJUNction/douyin": {
        "path": "/aweme/v1/web/general/search/single/",
        "search_channel": "aweme_general",
        "search_source": "tab_search", "list_type": "multi",
        "need_filter_settings": "1",
    },
}
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
}
def probe(tool, config, keyword, title):
    params = {
        "keyword": keyword, "search_channel": config["search_channel"],
        "enable_history": "1", "search_source": config["search_source"],
        "query_correct_type": "1", "is_filter_search": "0",
        "offset": "0", "count": "10", "list_type": config["list_type"],
    }
    params.update({k: v for k, v in config.items() if k not in
                   ("path", "search_channel", "search_source", "list_type")})
    url = ENDPOINT + config["path"] + "?" + urlencode(params)
    request = Request(url, headers={**HEADERS, "Referer": ENDPOINT + "/search/" + urlencode({"q": keyword})})
    result = {"tool": tool, "keyword": keyword, "http": None,
              "json_ok": False, "items": 0, "title_candidates": 0,
              "unique_ids": 0, "error": None}
    try:
        with urlopen(request, timeout=14) as response:
            payload = response.read(650_000)
            result["http"] = response.status
            result["content_type"] = response.headers.get("Content-Type", "")[:80]
        try:
            data = json.loads(payload)
            result["json_ok"] = True
            result["upstream_code"] = data.get("status_code")
            rows = data.get("data") or data.get("aweme_list") or []
            if not isinstance(rows, list):
                rows = []
            result["items"] = len(rows)
            result["list_field"] = "data" if isinstance(data.get("data"), list) else (
                "aweme_list" if isinstance(data.get("aweme_list"), list) else "none")
            nil = data.get("search_nil_info")
            if isinstance(nil, dict):
                result["empty_reason_fields"] = {k: str(v)[:100] for k,v in nil.items()
                                                 if k in ("search_nil_type", "search_nil_text", "text")}
            ids = set()
            for row in rows[:30]:
                if not isinstance(row, dict):
                    continue
                info = row.get("aweme_info") or row.get("aweme_mix_info") or row
                if not isinstance(info, dict):
                    continue
                vid = str(info.get("aweme_id") or "")
                if re.fullmatch(r"[1-9]\\d{14,20}", vid):
                    ids.add(vid)
                desc = str(info.get("desc") or row.get("desc") or "")
                if title in desc:
                    result["title_candidates"] += 1
            result["unique_ids"] = len(ids)
            result["candidate_ids_sample"] = sorted(ids)[:5]
            if not rows:
                result["response_keys"] = list(data)[:8]
        except (ValueError, TypeError):
            result["response_preview"] = payload[:100].decode("utf-8", errors="replace")
    except HTTPError as error:
        result["http"] = error.code
        result["error"] = "HTTP_" + str(error.code)
    except (URLError, TimeoutError, OSError) as error:
        result["error"] = type(error).__name__ + ":" + str(error)[:140]
    return result

if __name__ == "__main__":
    print("THIRDPARTY_DOUYIN_PROBE_START", flush=True)
    for keyword, title in SEARCHES:
        for name, cfg in VARIANTS.items():
            row = probe(name, cfg, keyword, title)
            print("DOUYIN_PROBE_RESULT " + json.dumps(row, ensure_ascii=False), flush=True)
            time.sleep(0.6)
    print("THIRDPARTY_DOUYIN_PROBE_COMPLETE", flush=True)

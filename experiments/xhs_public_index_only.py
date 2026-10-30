#!/usr/bin/env python3
"""Read-only search-engine-index test: no HTTP requests to Xiaohongshu.
Only Bing RSS and Google public search index. No account, cookies, or bypass.
"""
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from openweb_xhs_generic_probe import fetch_public_index

REPORT = Path("xhs-public-index-results.json")
KEYWORDS = ["咖啡", "海洋奇缘", "药屋少女的呢喃", "我的有罪之人"]
def main():
    rows = []
    report = {"method":"public_search_index_only","no_direct_xiaohongshu_request":True,"date_utc":datetime.now(timezone.utc).isoformat(),"results":rows}
    for keyword in KEYWORDS:
        if rows:
            time.sleep(12)
        bing = fetch_public_index("bing_rss", keyword)
        rows.append(bing)
        print(json.dumps(bing, ensure_ascii=False), flush=True)
        REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf8")
        if not bing.get("note_count"):
            time.sleep(12)
            google = fetch_public_index("google_html", keyword)
            rows.append(google)
            print(json.dumps(google, ensure_ascii=False), flush=True)
            REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf8")
    report["total_public_note_links"] = sum(row.get("note_count",0) for row in rows)
    report["per_keyword_hits"] = {q:sum(row.get("note_count",0) for row in rows if row["query"]==q) for q in KEYWORDS}
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf8")
    print("INDEX_REPORT",json.dumps(report["per_keyword_hits"],ensure_ascii=False),flush=True)
if __name__=="__main__":
    main()

#!/usr/bin/env python3
"""Low-frequency, anonymous, read-only Xiaohongshu search via OpenWeb.
No login, cookies, publish action, scraping retries, or website changes.
"""
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

TITLES = [
    {"title": "药屋少女的呢喃", "aliases": ["药屋少女的呢喃", "药屋少女的独语", "药师少女的独语", "药屋のひとりごと", "the apothecary diaries"]},
    {"title": "海洋奇缘", "aliases": ["海洋奇缘", "moana"], "exclude": ["海洋奇缘2", "海洋奇缘 2", "moana 2", "moana2"]},
    {"title": "我的有罪之人", "aliases": ["我的有罪之人"]},
]
BLOCK = re.compile(r"captcha|bot.blocked|verifytype|security verification|登录后查看搜索结果|安全验证|验证码|风控|账号异常|需要登录|请先登录", re.IGNORECASE)
CLI = Path(os.environ.get("OPENWEB_CLI", "openweb/dist/cli.js")).resolve()
REPORT = Path(os.environ.get("REPORT_PATH", "openweb-xhs-anon-report.json"))
INTERVAL_SECONDS = 20
ROUNDS = 2

def norm(value):
    return re.sub(r"[^0-9a-z\u4e00-\u9fff\u3040-\u30ff]+", "", str(value).lower())

def matching(title, spec):
    txt = norm(title)
    if any(norm(ex) in txt for ex in spec.get("exclude", [])):
        return False
    return any(norm(alias) in txt for alias in spec["aliases"])

def unwrap(data):
    if isinstance(data, dict):
        if isinstance(data.get("notes"), list):
            return data["notes"]
        for key in ("data", "body", "result", "response"):
            if key in data:
                found = unwrap(data[key])
                if found is not None:
                    return found
    return None

def save(report):
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")

def probe(spec, round_number):
    cmd = ["node", str(CLI), "xiaohongshu", "exec", "searchNotes",
           json.dumps({"keyword": spec["title"]}, ensure_ascii=False), "--max-response", "200000"]
    started = time.monotonic()
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=95, check=False)
    except subprocess.TimeoutExpired:
        return {"title": spec["title"], "round": round_number, "status": "timeout", "duration_seconds": 95, "stop": True}
    text = (proc.stdout or "") + "\n" + (proc.stderr or "")
    duration = round(time.monotonic() - started, 1)
    if BLOCK.search(text):
        return {"title": spec["title"], "round": round_number, "status": "login_or_security_block", "duration_seconds": duration, "stop": True, "error": text[-700:]}
    if proc.returncode != 0:
        return {"title": spec["title"], "round": round_number, "status": "error", "duration_seconds": duration, "stop": True, "error": text[-700:]}
    try:
        obj = json.loads(proc.stdout)
        notes = unwrap(obj)
        if notes is None:
            return {"title": spec["title"], "round": round_number, "status": "unexpected_response", "duration_seconds": duration, "stop": True, "response_shape": sorted(obj.keys()) if isinstance(obj, dict) else type(obj).__name__}
        video = [n for n in notes if isinstance(n, dict) and str(n.get("type", "")).lower() == "video"]
        relevant = [n for n in video if matching(n.get("displayTitle") or "", spec)]
        previews = [{"title": n.get("displayTitle"), "note_id": n.get("noteId"), "likes": n.get("likedCount")} for n in relevant[:8]]
        return {"title": spec["title"], "round": round_number, "status": "ok" if notes else "empty",
                "duration_seconds": duration, "note_count": len(notes), "video_count": len(video),
                "relevant_video_count": len(relevant), "relevant_video_previews": previews, "stop": False}
    except (json.JSONDecodeError, TypeError) as exc:
        return {"title": spec["title"], "round": round_number, "status": "invalid_json", "duration_seconds": duration, "stop": True, "error": str(exc)}

def main():
    report = {"type": "anonymous_xiaohongshu_search", "date_utc": datetime.now(timezone.utc).isoformat(),
              "source": "OpenWeb searchNotes", "source_commit": "a387b50c829d871839a613732e1b97bfa1946124",
              "authenticated": False, "planned_requests": 6, "interval_seconds": INTERVAL_SECONDS,
              "requests": [], "status": "running"}
    save(report)
    work = [(round_number, spec) for round_number in range(1, ROUNDS + 1) for spec in TITLES]
    for i, (round_number, spec) in enumerate(work):
        if i > 0:
            time.sleep(INTERVAL_SECONDS)
        item = probe(spec, round_number)
        report["requests"].append(item)
        print(json.dumps({k: v for k, v in item.items() if k != "error"}, ensure_ascii=False), flush=True)
        save(report)
        if item["stop"]:
            report["status"] = "stopped_on_error_or_security"
            break
    else:
        report["status"] = "completed"
    report["summary"] = {"requests_performed": len(report["requests"]),
                         "searches_with_nonempty_notes": sum(x.get("note_count", 0) > 0 for x in report["requests"]),
                         "total_relevant_video_occurrences": sum(x.get("relevant_video_count", 0) for x in report["requests"])}
    save(report)
    print("REPORT SUMMARY", json.dumps(report["summary"], ensure_ascii=False), flush=True)
    return 0

if __name__ == "__main__":
    sys.exit(main())

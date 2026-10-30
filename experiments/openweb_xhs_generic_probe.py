#!/usr/bin/env python3
"""Anonymous control search: OpenWeb first, then browser diagnostics and public search indexes.
One generic query; stop if CAPTCHA/security verification appears. Never logs cookies.
No writes, no credentials, no attempts to evade access controls.
"""
import html
import json
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

REPORT = Path("openweb-xhs-generic-and-alternatives.json")
BLOCK = re.compile(r"captcha|bot.blocked|verifytype|登录后查看搜索结果|安全验证|验证码|风控|账号异常|需要登录|请先登录", re.I)

def save(obj):
    REPORT.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf8")

def cli_query():
    cmd = ["node", "openweb/dist/cli.js", "xiaohongshu", "exec", "searchNotes",
           json.dumps({"keyword": "咖啡"}, ensure_ascii=False), "--max-response", "200000"]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=95)
    except subprocess.TimeoutExpired:
        return {"method": "OpenWeb", "query": "咖啡", "status": "timeout", "stop_for_security": False}
    raw = proc.stdout + "\n" + proc.stderr
    if BLOCK.search(raw):
        return {"method": "OpenWeb", "query": "咖啡", "status": "blocked_or_login", "stop_for_security": True}
    if proc.returncode:
        return {"method": "OpenWeb", "query": "咖啡", "status": "error", "detail": proc.stderr[-700:], "stop_for_security": False}
    try:
        obj = json.loads(proc.stdout)
        data = obj
        for key in ("body", "data", "result", "response"):
            if isinstance(data, dict) and "notes" not in data and isinstance(data.get(key), dict):
                data = data[key]
        if isinstance(data, dict) and isinstance(data.get("notes"), list):
            notes = data["notes"]
            return {"method": "OpenWeb", "query": "咖啡", "status": "ok" if notes else "empty",
                    "note_count": len(notes), "video_count": sum(n.get("type") == "video" for n in notes if isinstance(n, dict)),
                    "stop_for_security": False}
        return {"method": "OpenWeb", "query": "咖啡", "status": "unrecognized_response",
                "response_keys": list(obj)[:14] if isinstance(obj, dict) else [], "stop_for_security": False}
    except Exception as ex:
        return {"method": "OpenWeb", "query": "咖啡", "status": "parse_error", "detail": str(ex)[:150], "stop_for_security": False}

def browser_query():
    try:
        proc = subprocess.run(["node", "experiments/openweb_xhs_generic_diagnostic.cjs"],
                              capture_output=True, text=True, timeout=65)
        for line in reversed(proc.stdout.splitlines()):
            try:
                item = json.loads(line)
                item["stop_for_security"] = bool(item.get("has_security_or_captcha") or item.get("says_login_to_view"))
                return item
            except ValueError:
                pass
        return {"method": "anonymous_direct_browser", "status": "error",
                "detail": proc.stderr[-500:], "stop_for_security": False}
    except subprocess.TimeoutExpired:
        return {"method": "anonymous_direct_browser", "status": "timeout", "stop_for_security": False}

def fetch_public_index(engine, query):
    q = "site:xiaohongshu.com/explore/ " + query
    if engine == "bing_rss":
        url = "https://www.bing.com/search?format=rss&q=" + urllib.parse.quote(q)
    else:
        url = "https://www.google.com/search?num=10&q=" + urllib.parse.quote(q)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36", "Accept-Language":"zh-CN,zh;q=0.9,en;q=0.8"})
    try:
        with urllib.request.urlopen(req, timeout=18) as response:
            status = response.status
            payload = response.read(350000).decode("utf8", "replace")
    except (urllib.error.URLError, TimeoutError, OSError) as ex:
        return {"method": engine, "query": query, "status": "network_error", "detail": str(ex)[:210], "note_count": 0}
    urls = []
    if engine == "bing_rss":
        try:
            root = ET.fromstring(payload)
            for item in root.findall(".//item"):
                link = item.findtext("link") or ""
                if "xiaohongshu.com" in link:
                    urls.append({"url": link, "title": (item.findtext("title") or "")[:130]})
        except ET.ParseError as ex:
            return {"method": engine, "query": query, "status": "invalid_rss", "http_status": status, "detail": str(ex)[:120], "note_count": 0}
    else:
        for m in re.finditer(r'https?[^" <>\s]{4,350}', payload):
            u = html.unescape(m.group(0)).replace("\\u003d", "=")
            u = urllib.parse.unquote(u).split("&amp;")[0]
            if "xiaohongshu.com/explore/" in u:
                try:
                    u = u.split("&")[0].split("\\")[0]
                    urls.append({"url": u[:300]})
                except Exception:
                    pass
    seen, unique = set(), []
    for x in urls:
        if x["url"] not in seen:
            seen.add(x["url"])
            unique.append(x)
    return {"method": engine, "query": query, "status": "ok" if unique else "empty",
            "http_status": status, "note_count": len(unique), "sample_results": unique[:5]}

def main():
    report = {"type":"anonymous_xhs_generic_control","date_utc":datetime.now(timezone.utc).isoformat(),"authenticated": False,"network":"GitHub Actions ubuntu","results":[]}
    q = cli_query()
    report["results"].append(q)
    print("CONTROL", json.dumps(q, ensure_ascii=False), flush=True)
    save(report)
    if q.get("stop_for_security"):
        report["status"] = "stopped_security"
        save(report)
        return
    if q.get("note_count", 0):
        report["status"] = "control_search_success"
        save(report)
        return
    d = browser_query()
    report["results"].append(d)
    print("BROWSER_DIAGNOSTIC", json.dumps(d, ensure_ascii=False), flush=True)
    save(report)
    if d.get("stop_for_security"):
        report["status"] = "stopped_security"
        save(report)
        return
    # Alternative: public search-engine indexes (no direct Xiaohongshu requests, no login).
    # At most four low-frequency requests: one Bing + optional Google per keyword.
    for query in ["咖啡", "海洋奇缘"]:
        time.sleep(12)
        x = fetch_public_index("bing_rss", query)
        report["results"].append(x)
        print("PUBLIC_INDEX", json.dumps(x, ensure_ascii=False), flush=True)
        save(report)
        if not x.get("note_count"):
            time.sleep(12)
            y = fetch_public_index("google_html", query)
            report["results"].append(y)
            print("PUBLIC_INDEX", json.dumps(y, ensure_ascii=False), flush=True)
            save(report)
    report["status"] = "completed_alternative_probe"
    save(report)
    print("FINAL_STATUS", report["status"], flush=True)

if __name__ == "__main__":
    main()

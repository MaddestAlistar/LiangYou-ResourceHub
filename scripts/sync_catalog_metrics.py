#!/usr/bin/env python3
"""Refresh site catalog metrics from the actual public GitHub subscription JSONs."""
import json
import re
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data/projects.json"
BASE = "https://raw.githubusercontent.com/MaddestAlistar/"
URLS = {
    "icons": BASE + "LiangYou-IconLibrary/main/LiangYou-Emby-Icons.json",
    "original": BASE + "LiangYou-IconLibrary/main/LiangYou-Original-Icons.json",
    "channels": BASE + "LiangyouChannels/main/liangyouchannels-conflux.json",
}

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "LiangYou-ResourceHub-catalog-sync", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=35) as response:
        return json.load(response)

def update():
    sources = {key: fetch(url) for key, url in URLS.items()}
    icons = sources["icons"].get("icons")
    original = sources["original"].get("icons")
    entries = sources["channels"].get("entries")
    if not all(isinstance(x, list) and len(x) > 0 for x in (icons, original, entries)):
        raise ValueError("Invalid or empty source lists; refusing to overwrite catalog")
    total, selected, rooms = len(icons), len(original), len(entries)
    if selected > total:
        raise ValueError("Original icons exceed full collection; check upstream data")
    platforms = len({str(x["platform"]) for x in entries if x.get("platform")})
    sections = len(sources["channels"].get("sections", []))
    today = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    icon_date = re.search(r"更新时间[：:]\s*(\d{4}-\d{2}-\d{2})", str(sources["icons"].get("description", "")))
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    data["metrics"].update(icons=total, originalIcons=selected, channels=rooms, platforms=platforms, sections=sections)
    data["checkedAt"] = today
    data["updated"] = today
    for p in data["projects"]:
        if p["id"] == "icons":
            p["updated"] = today
            p["stats"] = f"{total:,} 枚图标"
            p["description"] = f"影视与音乐服务适用的媒体图标集合，包含 {total:,} 枚图标及 {selected} 枚良哥精选与专属图标；包含静态款与循环 GIF 动态款。"
            p["highlights"] = [f"{selected} 枚精选与专属", "含 GIF 动态款", "5 枚专属置顶"]
            p["note"] = f"根据原仓库公开订阅 JSON 核对：完整版 {total:,} 枚、精选与专属 {selected} 枚；GIF 是否流畅播放取决于客户端，订阅地址保持不变。"
            for item in p.get("imports", []):
                if "Emby-Icons.json" in item.get("url", ""):
                    item["name"] = f"完整图标库 · {total:,} 枚"
                elif "Original-Icons.json" in item.get("url", ""):
                    item["name"] = f"良哥精选与专属 · {selected} 枚"
        elif p["id"] == "channels":
            p["updated"] = today
            p["stats"] = f"{rooms:,} 个直播间"
            p["description"] = f"良友主播单收录 {platforms} 个平台的 {rooms:,} 个直播间，按 {sections} 个内容分区整理。可在汇流 App 导入完整主播单，也可单独选择分区。"
            p["highlights"] = [f"{platforms} 个直播平台", f"{sections} 个内容分区", "支持分区订阅"]
            p["note"] = f"从最新汇流主播单 JSON 统计 {rooms:,} 个直播间、{platforms} 个平台、{sections} 个分区；旧版头像订阅与直播间数量不是同一口径。"
            for item in p.get("imports", []):
                if "liangyouchannels-conflux.json" in item.get("url", ""):
                    item["name"] = f"良友主播单 · {rooms:,} 个直播间"
                    item["detail"] = f"汇流 App 的「订阅网址」入口，{sections} 个内容分区"
    content = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if CATALOG.read_text(encoding="utf-8") != content:
        CATALOG.write_text(content, encoding="utf-8")
    print(f"Checked {today}: full={total}, original={selected}, rooms={rooms}, platforms={platforms}, sections={sections}")

if __name__ == "__main__":
    update()

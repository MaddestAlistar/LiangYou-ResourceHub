#!/usr/bin/env python3
"""Refresh film headlines from Guardian Open Platform; no scraping, no invented stories."""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

KEY = (os.environ.get("THE_GUARDIAN_API_KEY") or os.environ.get("GUARDIAN_API_KEY") or "").strip()
OUT = Path(__file__).resolve().parents[1] / "data" / "media-guardian.json"

def trusted_link(raw, host):
    try:
        p = urlparse(str(raw))
        return str(raw) if p.scheme == "https" and not p.username and not p.password and (p.hostname == host or (p.hostname or "").endswith("." + host)) else ""
    except (ValueError, TypeError):
        return ""

def collect():
    endpoint = "https://content.guardianapis.com/search?" + urllib.parse.urlencode({
        "api-key": KEY, "section": "film", "page-size": "8",
        "order-by": "newest", "show-fields": "thumbnail,trailText,byline"
    })
    request = urllib.request.Request(endpoint, headers={"User-Agent": "LiangYou-ResourceHub/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=22) as response:
        if response.status != 200:
            raise ValueError("Guardian HTTP status not 200")
        result = json.load(response)
    root = result.get("response", {})
    if root.get("status") != "ok" or not isinstance(root.get("results"), list):
        raise ValueError("Invalid official Guardian response")
    articles = []
    for row in root["results"]:
        if row.get("sectionId") != "film":
            continue
        url = trusted_link(row.get("webUrl"), "theguardian.com")
        title = str(row.get("webTitle") or "").strip()
        date = str(row.get("webPublicationDate") or "")
        if not (url and title and date):
            continue
        fields = row.get("fields") or {}
        summary = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(fields.get("trailText") or ""))).strip()[:210]
        articles.append({
            "title": title, "url": url,
            "date": date, "section": str(row.get("sectionName") or "Film")[:45],
            "summary": summary, "byline": str(fields.get("byline") or "").strip(),
            "thumbnail": trusted_link(fields.get("thumbnail"), "guim.co.uk") or None,
            "source": "The Guardian"
        })
    if len(articles) < 3:
        raise ValueError("Less than 3 verified headlines")
    return {"ok": True, "status": "ok", "source": "The Guardian",
            "checkedAt": datetime.now(timezone.utc).isoformat(), "articles": articles[:8]}

def main():
    if not KEY:
        print("GUARDIAN_SNAPSHOT_NOT_CONFIGURED")
        return
    try:
        payload = collect()
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("GUARDIAN_SNAPSHOT_VERIFIED", len(payload["articles"]))
    except Exception as err:
        print("GUARDIAN_SNAPSHOT_UNAVAILABLE", type(err).__name__, "previous verified snapshot unchanged")

if __name__ == "__main__":
    main()

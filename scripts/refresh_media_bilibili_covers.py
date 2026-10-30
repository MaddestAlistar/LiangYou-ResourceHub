#!/usr/bin/env python3
"""Cache official Bilibili BV-video cover URLs in the Pages trailer snapshot.

Runs in GitHub Actions (not in visitor browsers); preserves verified URLs when
Bilibili rate limits GitHub-hosted requests. Does not fetch or rehost images.
"""
from __future__ import annotations

import json
import re
from html.parser import HTMLParser
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data/media-domestic-trailers.json"
BV_RE = re.compile(r"^BV[A-Za-z0-9]{10}$")
VALID_IMAGE_HOSTS = ("hdslb.com", "biliimg.com")
ENDPOINTS = (
    "https://api.bilibili.com/x/web-interface/view",
    "https://api.bilibili.com/x/web-interface/view/detail",
)


def checked_image(raw):
    if not isinstance(raw, str):
        return None
    if raw.startswith("//"):
        raw = "https:" + raw
    elif raw.startswith("http://"):
        # Bilibili may return an HTTP cover URL in otherwise valid JSON.
        # Upgrade the provider-owned CDN image to HTTPS before publishing.
        raw = "https://" + raw[len("http://"):]
    try:
        url = urlparse(raw)
        host = (url.hostname or "").lower()
        if (url.scheme != "https" or url.username or url.password or
                not any(host == d or host.endswith("." + d) for d in VALID_IMAGE_HOSTS)):
            return None
        if not url.path.startswith("/bfs/") or len(raw) > 600:
            return None
        return raw
    except ValueError:
        return None


class OgImage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.image = None

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "meta" or self.image:
            return
        data = dict(attrs)
        if (data.get("property") == "og:image" or
                data.get("name") in ("og:image", "twitter:image") or
                data.get("itemprop") == "image"):
            self.image = checked_image(data.get("content"))


def public_page_cover(bvid):
    # Bilibili can block API metadata calls while allowing the public webpage's
    # Open Graph cover. Both responses are provider-authored; no guessing IDs.
    request = urllib.request.Request(
        f"https://www.bilibili.com/video/{bvid}/",
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "zh-CN,zh;q=0.9",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            if response.status != 200:
                return None
            html = response.read(800000).decode("utf-8", "replace")
        parser = OgImage()
        parser.feed(html)
        return parser.image
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return None


def official_cover(bvid):
    """Return a first-party thumbnail from the public video details endpoint.

    A second metadata-only client identifier is used if a hosted CI runner is
    challenged by the browser request. No cookies or playback URLs are involved.
    """
    for api in ENDPOINTS:
        endpoint = api + "?" + urllib.parse.urlencode({"bvid": bvid})
        for user_agent in (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "okhttp/4.9.3",
        ):
            request = urllib.request.Request(endpoint, headers={
                "User-Agent": user_agent,
                "Accept": "application/json",
                "Referer": "https://www.bilibili.com/",
                "Accept-Language": "zh-CN,zh;q=0.9",
            })
            try:
                with urllib.request.urlopen(request, timeout=9) as response:
                    if response.status != 200:
                        continue
                    body = json.loads(response.read(400000))
                data = body.get("data") or {}
                view = data.get("View") or data
                if body.get("code") == 0 and view.get("bvid") == bvid:
                    image = checked_image(view.get("pic"))
                    if image:
                        return image
                print(f"Bilibili cover query {bvid}: API code {body.get('code', 'unknown')}")
            except urllib.error.HTTPError as exc:
                print(f"Bilibili cover query {bvid}: HTTP {exc.code}")
            except (urllib.error.URLError, TimeoutError, ValueError, KeyError, OSError):
                print(f"Bilibili cover query {bvid}: request unavailable")
    return public_page_cover(bvid)


def refresh():
    snapshot = json.loads(CATALOG.read_text(encoding="utf-8"))
    if snapshot.get("schema") != 1 or not isinstance(snapshot.get("items"), list):
        raise ValueError("Unexpected trailer catalog schema")
    found = changed = 0
    for row in snapshot["items"]:
        ident = str(row.get("videoId") or "")
        if (row.get("platform") != "bilibili" or not BV_RE.fullmatch(ident) or
                row.get("verifiedSource") != f"https://www.bilibili.com/video/{ident}/"):
            continue
        found += 1
        # Use the original provider-supplied cover until a newer official one
        # has been verified; never clear it after a transient API failure.
        cover = official_cover(ident)
        if cover and cover != row.get("thumbnail"):
            row["thumbnail"] = cover
            changed += 1
        time.sleep(0.6)
    if changed:
        snapshot["updatedAt"] = datetime.now(timezone.utc).date().isoformat()
        CATALOG.write_text(
            json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    print(f"Bilibili covers: {found} checked, {changed} changed")


if __name__ == "__main__":
    refresh()

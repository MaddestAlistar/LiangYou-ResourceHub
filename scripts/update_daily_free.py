#!/usr/bin/env python3
"""Refresh LiangYou's free App Store deals using public RSS + Apple Lookup.
Zero third-party API keys and zero Python dependencies.
Only a verified paid-to-free APP purchase is shown; IAP-only discounts are excluded.
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/daily-free.json"
ICONS = ROOT / "assets/daily-free"
UTC = timezone.utc
NOW = datetime.now(UTC)
MAX_EVENT_AGE = timedelta(days=7)
MAX_PER_REGION = 10
ATOM = "{http://www.w3.org/2005/Atom}"
FEEDS = {
    "cn": [
        ("App Store Discounts", "https://raw.githubusercontent.com/appstore-discounts/appstore-discounts/main/rss/cn.xml"),
        ("GoFans", "https://rsshub.app/gofans/ios"),
    ],
    "us": [
        ("App Store Discounts", "https://raw.githubusercontent.com/appstore-discounts/appstore-discounts/main/rss/us.xml"),
        ("Freshapps", "https://freshapps.com/rss/free.xml"),
    ],
}
PRICE_TO_FREE = re.compile(
    r"^\s*(?:价格|Price)\s*[:：]\s*([¥￥$]?\s*[0-9][0-9,.]*)\s*→\s*(?:免费|free\b|[¥￥$]?\s*0(?:\.0+)?(?:\b|$))",
    re.IGNORECASE,
)
APP_ID = re.compile(r"(?:/id|/(?:cn|us)/)(\d{7,12})(?!\d)", re.IGNORECASE)
FRESH_PRICE = re.compile(
    r"([¥￥$]\s*[1-9][0-9,.]*)\s*(?:→|->|to)\s*(?:free\b|[¥￥$]\s*0(?:\.0+)?)",
    re.IGNORECASE,
)


def download(url: str, timeout: int = 18, limit: int = 1_200_000) -> bytes:
    req = urllib.request.Request(
        url, headers={"User-Agent": "LiangYouFreeApps/1.0 (+https://github.com/MaddestAlistar/LiangYou-ResourceHub)", "Accept": "application/atom+xml, application/rss+xml, application/json, */*"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("response exceeds size limit")
    return raw


def timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    except (ValueError, TypeError):
        pass
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(value).astimezone(UTC)
    except (TypeError, ValueError, IndexError):
        return None


def normalize_price(price: str) -> str | None:
    amount = re.sub(r"[^0-9.]", "", price.replace(",", ""))
    try:
        if float(amount) <= 0:
            return None
    except ValueError:
        return None
    return price.replace(" ", "").strip()


def candidates_from_feed(raw: bytes, country: str, source: str) -> list[dict]:
    root = ET.fromstring(raw)
    entries = root.findall(f"{ATOM}entry")
    if not entries:
        entries = root.findall("./channel/item")
    found = []
    for item in entries[:120]:
        is_atom = item.tag == f"{ATOM}entry"
        def get(name: str) -> str:
            return (item.findtext(f"{ATOM}{name}" if is_atom else name) or "").strip()
        headline = get("title")
        summary = get("summary") or get("description")
        content = get("content") or get("description")
        link_el = item.find(f"{ATOM}link") if is_atom else None
        link = (link_el.attrib.get("href", "") if link_el is not None else get("link"))
        published = timestamp(get("updated") or get("published") or get("pubDate"))
        if not published or published > NOW + timedelta(hours=3) or NOW - published > MAX_EVENT_AGE:
            continue
        # App Store Discounts publishes IAP-only reductions too. Only a
        # headline that explicitly says the APP price became free qualifies.
        m = PRICE_TO_FREE.search(summary)
        if not m and source == "Freshapps":
            m = FRESH_PRICE.search(" ".join((headline, summary, content[:500])))
        if not m:
            continue
        original = normalize_price(m.group(1))
        if not original:
            continue
        combined = " ".join((link, summary[:700], content[:1200]))
        app_id = APP_ID.search(combined)
        if not app_id:
            # Some feeds embed https://apps.apple.com/.../id... in longer descriptions.
            app_id = APP_ID.search(content)
        if not app_id:
            continue
        found.append({
            "id": int(app_id.group(1)),
            "original_price": original,
            "source": source,
            "discovered_at": published.isoformat().replace("+00:00", "Z"),
            "published": published,
        })
    return found




class _MacGiftAnchorParser(HTMLParser):
    """Read public MacGift deal cards without executing any website scripts."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.active = None
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        href = dict(attrs).get("href", "")
        if isinstance(href, str) and re.search(r"/app/\d{7,12}/?(?:[?#].*)?$", href):
            self.active = {"href": href, "texts": []}

    def handle_data(self, data):
        if self.active is not None:
            self.active["texts"].append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.active is not None:
            self.links.append((self.active["href"], " ".join(self.active["texts"])))
            self.active = None


def candidates_from_macgift(raw: bytes, country: str) -> list[dict]:
    """Only use deal links clearly tagged as a *paid* app becoming free.

    Normal free apps, IAP-only offers, and paid-but-discounted apps cannot qualify.
    Apple Lookup then independently verifies the current price for the region.
    """
    parser = _MacGiftAnchorParser()
    parser.feed(raw.decode("utf-8", errors="replace"))
    found = []
    seen = set()
    money_pattern = r"(?:¥|￥)" if country == "cn" else r"\$"
    for href, label in parser.links:
        match_id = re.search(r"/app/(\d{7,12})(?:/|$|[?#])", href)
        if not match_id:
            continue
        app_id = int(match_id.group(1))
        if app_id in seen:
            continue
        text = " ".join(label.split())
        if country == "cn":
            if "限免" not in text or "免费" not in text:
                continue
        elif not re.search(r"\bFree\b", text, flags=re.IGNORECASE):
            continue
        if ("免费·含内购" in text or "Free + IAP" in text
                or "免费下载" in text or "Free download" in text
                or "外部源" in text or "External source" in text):
            continue
        amounts = re.findall(money_pattern + r"\s*([1-9]\d*(?:\.\d{1,2})?)", text)
        if not amounts:
            continue
        # Original paid price shown by the source; never infer it from a free API.
        price = (("¥" if country == "cn" else "$") + amounts[0])
        found.append({
            "id": app_id,
            "original_price": price,
            "source": "MacGift",
            "discovered_at": NOW.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "published": NOW,
        })
        seen.add(app_id)
        if len(found) >= 60:
            break
    return found

def lookup_prices(ids: list[int], country: str) -> dict[int, dict]:
    verified = {}
    for offset in range(0, len(ids), 25):
        batch = ids[offset:offset + 25]
        url = "https://itunes.apple.com/lookup?" + urllib.parse.urlencode(
            {"id": ",".join(str(x) for x in batch), "country": country, "entity": "software"}
        )
        try:
            response = json.loads(download(url, timeout=16))
            for app in response.get("results", []):
                if not isinstance(app, dict):
                    continue
                try:
                    app_id = int(app.get("trackId"))
                    price = float(app.get("price", -1))
                except (ValueError, TypeError):
                    continue
                if app_id not in batch or price != 0:
                    continue
                # 'isVppDeviceBasedLicensingEnabled' etc are not price signals.
                if app.get("wrapperType") != "software" and app.get("kind") not in ("software", "mac-software"):
                    continue
                verified[app_id] = app
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as exc:
            print(f"[{country}] Apple Lookup failed for batch {offset // 25 + 1}: {exc}", flush=True)
        time.sleep(0.5)
    return verified


def localize_icon(app: dict, country: str, app_id: int) -> str:
    url = app.get("artworkUrl100", "")
    if not isinstance(url, str) or not url.startswith("https://"):
        return ""
    hostname = (urllib.parse.urlparse(url).hostname or "").lower()
    if hostname != "mzstatic.com" and not hostname.endswith(".mzstatic.com"):
        return ""
    try:
        raw = download(url, timeout=10, limit=180_000)
        if raw.startswith(b"\xff\xd8\xff"):
            ext = ".jpg"
        elif raw.startswith(b"\x89PNG\r\n\x1a\n"):
            ext = ".png"
        elif raw.startswith(b"RIFF") and raw[8:12] == b"WEBP":
            ext = ".webp"
        else:
            return ""
        ICONS.mkdir(parents=True, exist_ok=True)
        destination = ICONS / f"{country}-{app_id}{ext}"
        if not destination.exists() or destination.read_bytes() != raw:
            destination.write_bytes(raw)
        return "./assets/daily-free/" + destination.name
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        print(f"[{country}] Could not cache icon for {app_id}: {exc}", flush=True)
        return ""


def main() -> None:
    previous = {}
    if OUT.exists():
        try:
            previous = json.loads(OUT.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass

    output = {"schema": 1, "generated_at": NOW.isoformat(timespec="seconds").replace("+00:00", "Z"), "regions": {}}
    successful_feeds = 0
    verified_total = 0
    for country in ("cn", "us"):
        candidates = {}
        country_feeds = 0
        for source, url in FEEDS[country]:
            try:
                raw = download(url)
                items = candidates_from_feed(raw, country, source)
                country_feeds += 1
                successful_feeds += 1
                print(f"[{country}] {source}: {len(items)} recent paid-to-free candidates")
                for candidate in items:
                    old = candidates.get(candidate["id"])
                    if not old or candidate["published"] > old["published"]:
                        candidates[candidate["id"]] = candidate
            except (urllib.error.URLError, TimeoutError, ET.ParseError, ValueError, OSError) as exc:
                print(f"[{country}] Source unavailable: {source}: {exc}", flush=True)


        # Additional public region-specific deal cards broaden the coverage.
        # Each candidate must still pass Apple's official current-price lookup.
        try:
            macgift_url = "https://macgift.com/" if country == "cn" else "https://macgift.com/us/"
            macgift_raw = download(macgift_url, timeout=18, limit=3_000_000)
            macgift_items = candidates_from_macgift(macgift_raw, country)
            country_feeds += 1
            successful_feeds += 1
            print(f"[{country}] MacGift: {len(macgift_items)} paid-to-free candidates", flush=True)
            for candidate in macgift_items:
                # Keep original historical price from the more recent source.
                old = candidates.get(candidate["id"])
                if not old or candidate["published"] > old["published"]:
                    candidates[candidate["id"]] = candidate
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            print(f"[{country}] MacGift source unavailable: {exc}", flush=True)

        if not country_feeds:
            # Avoid rewriting old items as fresh when the entire region is offline.
            old_region = previous.get("regions", {}).get(country, {})
            output["regions"][country] = {
                "status": "unavailable",
                "verified_at": old_region.get("verified_at"),
                "items": old_region.get("items", []),
            }
            continue

        priced = lookup_prices(list(candidates), country) if candidates else {}
        if candidates and not priced:
            # Can indicate expired sales, or an Apple outage. Show none rather
            # than claiming an unchecked free price.
            print(f"[{country}] No candidate passed Apple price verification")

        verified = []
        for candidate in sorted(candidates.values(), key=lambda x: x["published"], reverse=True):
            if len(verified) >= MAX_PER_REGION:
                break
            app = priced.get(candidate["id"])
            if not app:
                continue
            app_id = candidate["id"]
            icon = localize_icon(app, country, app_id)
            verified.append({
                "id": app_id,
                "name": str(app.get("trackName") or app.get("trackCensoredName") or f"App {app_id}")[:100],
                "genre": str(app.get("primaryGenreName") or "App Store 软件")[:40],
                "original_price": candidate["original_price"],
                "price": 0,
                "currency": str(app.get("currency") or ("CNY" if country == "cn" else "USD")),
                "country": country,
                "platform": "macOS" if app.get("kind") == "mac-software" else "iOS",
                "icon": icon,
                "url": f"https://apps.apple.com/{country}/app/id{app_id}",
                "source": candidate["source"],
                "discovered_at": candidate["discovered_at"],
            })
        verified_total += len(verified)
        output["regions"][country] = {
            "status": "ok",
            "verified_at": output["generated_at"],
            "items": verified,
        }

    if not successful_feeds:
        raise SystemExit("No RSS source succeeded. Previous JSON remains unchanged.")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Remove icons no longer in use; all artwork is cached locally for China.
    active = {Path(app["icon"]).name for region in output["regions"].values() for app in region["items"] if app.get("icon")}
    if ICONS.exists():
        for path in ICONS.iterdir():
            if path.is_file() and path.name not in active and path.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
                path.unlink()
    print(f"Updated {OUT.relative_to(ROOT)}: {verified_total} verified free apps, {successful_feeds} working feeds.")


if __name__ == "__main__":
    main()

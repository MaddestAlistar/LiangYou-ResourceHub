#!/usr/bin/env python3
"""Verify AppSales paid-to-free candidates against public Google Play USD offers.
No API key. Anonymous US storefront prices can differ from the signed-in account.
"""
from __future__ import annotations
import json
import io
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from feed_common import write_json, iso
from bs4 import BeautifulSoup
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data" / "android-free.json"
ICONS = ROOT / "assets" / "android-free"
NOW = datetime.now(timezone.utc).replace(microsecond=0)
MAX_RESULTS = 120
PAGES = (
    "https://www.app-sales.net/nowfree/",
    "https://www.app-sales.net/nowfree/?page=2",
    "https://www.app-sales.net/nowfree/?page=3",
)
PLAY_ID = re.compile(r"^[a-zA-Z][\w]*(?:\.[a-zA-Z_][\w]*)+$")
PRICE = re.compile(r"\$\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)")
DISCOUNT = re.compile(r"(?<!\d)-100\s*%")
FREE = re.compile(r"\bFREE\b", re.I)
UA = "Mozilla/5.0 (compatible; LiangYouFreeApps/1.1; +https://github.com/MaddestAlistar/LiangYou-ResourceHub)"

def get_bytes(url: str, limit: int = 2_500_000, timeout: int = 16) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,image/avif,image/webp,image/png,image/jpeg,*/*",
        "Accept-Language": "en-US,en;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=timeout) as response:
        result = response.read(limit + 1)
    if len(result) > limit:
        raise ValueError("Maximum response size exceeded")
    return result

def google_package(href: str) -> str | None:
    p = urllib.parse.urlparse(urllib.parse.urljoin("https://play.google.com/", href))
    if p.hostname != "play.google.com" or "/store/apps/details" not in p.path:
        return None
    app_id = urllib.parse.parse_qs(p.query).get("id", [""])[0]
    return app_id if PLAY_ID.fullmatch(app_id) and len(app_id) <= 160 else None

def pick_card(link, package):
    """Find the nearest card containing explicit FREE, old price and -100%."""
    for parent in list(link.parents)[:10]:
        if getattr(parent, "name", None) in ("body", "html"):
            break
        text = parent.get_text(" ", strip=True)
        if len(text) > 900:
            continue
        # A large ancestor may contain several different apps and a FREE
        # label / former price belonging to a different app. Never mix cards.
        ids = {
            google_package(a.get("href", ""))
            for a in parent.select('a[href*="play.google.com/store/apps/details"]')
        }
        ids.discard(None)
        if ids != {package}:
            continue
        if FREE.search(text) and DISCOUNT.search(text) and PRICE.search(text):
            return parent
    return None

def candidate_name(card, package):
    for node in card.select("h2,h3,h4,h5,.app-name,.app-title,[class*=appName],[class*=appTitle]"):
        title = node.get_text(" ",strip=True)
        if title and len(title) <= 115 and not FREE.fullmatch(title):
            return title
    # Most AppSales cards start with their app title and optionally ad labels.
    strings = [str(x).strip() for x in card.stripped_strings]
    excluded = re.compile(r"^(view on google play|free|contains ads|offers in-app purchases|-\d+%|\$\d+|star\s|bookmark\s)",re.I)
    for item in strings:
        if 3 <= len(item) <= 115 and not excluded.search(item) and item != package:
            return item
    return package.split(".")[-1]

def find_image(card):
    for image in card.select("img"):
        for key in ("data-src", "src", "data-original"):
            url = image.get(key, "")
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme=="https" and parsed.hostname and (
                parsed.hostname.endswith(".googleusercontent.com")
                or parsed.hostname.endswith(".gstatic.com")
            ):
                return url
    return ""

def parse_appsales(html: bytes, page: int) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    found = []
    packages = set()
    for a in soup.select('a[href*="play.google.com/store/apps/details"]'):
        package = google_package(a.get("href", ""))
        if not package or package in packages:
            continue
        card = pick_card(a, package)
        if card is None:
            continue
        text = card.get_text(" ", strip=True)
        price = PRICE.search(text)
        if not price or float(price.group(1).replace(",", "")) <= 0:
            continue
        packages.add(package)
        title = candidate_name(card, package)
        found.append({
            "package": package,
            "name": title,
            "original_price": "$" + price.group(1).replace(",", ""),
            "price": 0,
            "currency": "USD",
            "platform": "Android",
            "country": "us",
            "url": f"https://play.google.com/store/apps/details?id={urllib.parse.quote(package)}&hl=en_US&gl=US",
            "image_source": find_image(card),
            "source": "AppSales",
            "source_url": PAGES[page - 1],
            "verification": "third_party_price_tracker_not_google_play_confirmation",
            "genre": "Google Play",
            "page": page,
        })
    return found

def cache_icon(url: str, package: str) -> str:
    if not url:
        return ""
    u = urllib.parse.urlparse(url)
    host = (u.hostname or "").lower()
    if u.scheme != "https" or not (
        host.endswith(".googleusercontent.com") or host.endswith(".gstatic.com")
    ):
        return ""
    try:
        # Play often supplies a full-resolution image. Ask its image CDN for
        # an icon-sized variant and bound the stored file independently.
        if host.endswith('.googleusercontent.com'):
            url = url.split('=')[0] + '=s128-rw'
        raw = get_bytes(url, limit=1_000_000, timeout=12)
        with Image.open(io.BytesIO(raw)) as image:
            image.thumbnail((128, 128))
            output = io.BytesIO()
            image.convert('RGBA').save(output, format='WEBP', quality=82)
            raw = output.getvalue()
        suffix = '.webp'
        ICONS.mkdir(parents=True, exist_ok=True)
        filename = f"{package}{suffix}"
        path = ICONS / filename
        if not path.exists() or path.read_bytes() != raw:
            path.write_bytes(raw)
        return "./assets/android-free/" + filename
    except (OSError, urllib.error.URLError, TimeoutError, ValueError) as exc:
        print(f"App icon could not be cached for {package}: {exc}", flush=True)
        return ""

def play_price(raw, package):
    """Use a matching public SoftwareApplication offer, not a random 'Free' word."""
    soup = BeautifulSoup(raw, 'html.parser')
    for node in soup.select('script[type="application/ld+json"]'):
        try:
            value = json.loads(node.get_text())
        except (ValueError, TypeError):
            continue
        objects = value if isinstance(value, list) else [value]
        for app in objects:
            if not isinstance(app, dict) or app.get('@type') != 'SoftwareApplication':
                continue
            url = str(app.get('url', '')).replace('\\u003d', '=').replace('\\u0026', '&')
            if google_package(url) != package:
                continue
            offers = app.get('offers', [])
            if isinstance(offers, dict):
                offers = [offers]
            for offer in offers:
                if not isinstance(offer, dict) or offer.get('priceCurrency') != 'USD':
                    continue
                if offer.get('availability') not in ('https://schema.org/InStock', 'http://schema.org/InStock'):
                    continue
                try:
                    price = float(offer['price'])
                    if price >= 0:
                        return price, app.get('name'), app.get('image')
                except (ValueError, TypeError, KeyError):
                    pass
    raise ValueError('No matching USD SoftwareApplication offer')

def verify_google_play(candidate):
    app = dict(candidate)
    try:
        price, name, image = play_price(get_bytes(app['url']), app['package'])
        if price != 0:
            return None, 'paid'
        app.pop('page', None)
        image_source = app.pop('image_source', '')
        app['name'] = str(name or app['name'])[:120]
        existing = list(ICONS.glob(app['package'] + '.*'))
        app['icon'] = './assets/android-free/' + existing[0].name if existing else cache_icon(image or image_source, app['package'])
        app['observed_at'] = iso()
        app['verified_at'] = iso()
        app['verification'] = 'google_play_page_price_and_appsales_drop'
        return app, 'free'
    except Exception as exc:
        print(f"Google Play check skipped {app['package']}: {exc}", flush=True)
        return None, 'unavailable'

def main():
    pages_ok = 0
    candidates = {}
    for index, page in enumerate(PAGES, 1):
        try:
            raw = get_bytes(page)
            batch = parse_appsales(raw, index)
            pages_ok += 1
            print(f"AppSales page {index}: {len(batch)} paid-to-free candidates", flush=True)
            if not batch:
                print(f"Page {index} HTML snippet: {BeautifulSoup(raw[:3000], 'html.parser').get_text(' ', strip=True)[:260]}", flush=True)
            for app in batch:
                candidates.setdefault(app["package"], app)
            if len(candidates) >= MAX_RESULTS:
                break
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            print(f"AppSales page {index} unavailable: {exc}", flush=True)
        time.sleep(0.3)
    if not pages_ok or not candidates:
        # Don't replace working snapshot with an empty success.
        raise SystemExit(f"No eligible AppSales deals: {pages_ok} pages loaded, {len(candidates)} candidates")
    selected = list(candidates.values())[:MAX_RESULTS]
    items, price_checks, unavailable = [], 0, 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        for app, status in pool.map(verify_google_play, selected):
            price_checks += int(status in ("free", "paid"))
            unavailable += int(status == "unavailable")
            if app is not None:
                items.append(app)
    if selected and not price_checks:
        raise SystemExit("Google Play could not verify any candidate; keeping original snapshot")
    data = {
        "schema": 1,
        "generated_at": iso(),
        "checked_at": iso(),
        "interval_hours": 3,
        "source_name": "AppSales + Google Play",
        "source_url": PAGES[0],
        "price_confirmation": "google_play_public_page",
        "market": "Google Play / US reference market",
        "candidate_count": len(candidates),
        "price_checked_count": price_checks,
        "unavailable_count": unavailable,
        "status": "partial" if unavailable or pages_ok < len(PAGES) else "ok",
        "items": items,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    write_json(OUTPUT, data)
    used = {Path(x["icon"]).name for x in items if x["icon"]}
    if ICONS.exists():
        for path in ICONS.iterdir():
            if path.is_file() and path.suffix in (".jpg",".png",".webp") and path.name not in used:
                path.unlink()
    print(f"Updated {OUTPUT.relative_to(ROOT)} with {len(items)} Android offers (Google Play public-page checked, country-dependent).",flush=True)

if __name__ == "__main__":
    main()

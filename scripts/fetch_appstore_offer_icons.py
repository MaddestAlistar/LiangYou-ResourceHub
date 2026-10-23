#!/usr/bin/env python3
"""Download original App Store artwork for the eight LiangYou welfare cards.
The icons are downloaded from the iTunes Lookup API, not generated or redrawn.
"""
from __future__ import annotations
import io
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "offer-icons"
APPS = [
    ("conflux", 6787873453, "汇流直播"),
    ("tubo", 6793892368, "途播"),
    ("cartv", 6800211040, "CarTV"),
    ("comink", 6803453450, "Comink 漫画"),
    ("scanner", 6794778808, "万能扫"),
    ("carlink", 6805268992, "车联投屏"),
    ("m3uhub", 6820008763, "M3UHub"),
    ("appset", 6756836150, "应用集"),
]

def get(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; LiangYou-ResourceHub/1.0)",
            "Accept": "application/json,image/*;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read()

def lookup(app_id: int) -> dict:
    last_error = None
    for country in ("cn", "us", "hk", "tw", "gb"):
        url = f"https://itunes.apple.com/lookup?id={app_id}&country={country}&media=software"
        try:
            data = json.loads(get(url))
            for candidate in data.get("results", []):
                if int(candidate.get("trackId", -1)) == app_id:
                    return candidate
            last_error = f"ID {app_id} unavailable in {country}"
        except Exception as exc:
            last_error = f"{country}: {exc}"
        time.sleep(0.5)
    raise RuntimeError(f"Unable to verify App Store ID {app_id}: {last_error}")

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "source": "Official Apple iTunes Lookup API artwork URLs",
        "updated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "icons": [],
    }
    staged = []
    for filename, app_id, title in APPS:
        app = lookup(app_id)
        url = app.get("artworkUrl512") or app.get("artworkUrl100") or app.get("artworkUrl60")
        if not url or not url.startswith("https://"):
            raise RuntimeError(f"No official artwork URL for {title} ({app_id})")
        original = get(url)
        with Image.open(io.BytesIO(original)) as image:
            image.load()
            if image.width < 60 or image.height < 60:
                raise RuntimeError(f"Official icon too small: {title} {image.size}")
            if abs(image.width - image.height) > max(image.width, image.height) * .03:
                raise RuntimeError(f"Unexpected nonsquare App Store artwork: {title} {image.size}")
            image = ImageOps.exif_transpose(image)
            image = image.convert("RGBA" if image.mode in ("RGBA", "LA") or "transparency" in image.info else "RGB")
            image = image.resize((192, 192), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            image.save(buf, format="WEBP", quality=91, method=6)
            icon_bytes = buf.getvalue()
        staged.append((OUT / f"{filename}.webp", icon_bytes))
        manifest["icons"].append({
            "key": filename,
            "title": title,
            "app_store_id": app_id,
            "app_store_title": app.get("trackName"),
            "developer": app.get("artistName"),
            "app_store_url": app.get("trackViewUrl"),
            "artwork_url": url,
            "local_path": f"assets/offer-icons/{filename}.webp",
            "bytes": len(icon_bytes),
        })
        print(f"{title}: {app.get('trackName')} · App ID {app_id} · {len(icon_bytes)} bytes")
    if len(staged) != len(APPS):
        raise RuntimeError("Not all eight icons resolved: refusing partial deployment")
    for path, payload in staged:
        path.write_bytes(payload)
    (OUT / "appstore-sources.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("All eight official App Store icon files downloaded successfully.")

if __name__ == "__main__":
    main()

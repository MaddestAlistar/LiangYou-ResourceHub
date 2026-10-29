#!/usr/bin/env python3
"""Make the Icon Library's oversized home-page preview a small local WebP.

The original submitted PNG remains unchanged and available in the repository.
Only the lightweight preview path in the resource catalog is updated.
"""
import json
from pathlib import Path
from PIL import Image, ImageOps

source = Path("assets/previews/icons-komic.png")
target = Path("assets/previews/icons-komic.webp")
catalog = Path("data/projects.json")

if not source.is_file():
    raise SystemExit("Missing original Icon Library Komic image")
with Image.open(source) as original:
    artwork = ImageOps.exif_transpose(original)
    if artwork.mode not in ("RGB", "RGBA"):
        artwork = artwork.convert("RGBA")
    artwork.thumbnail((320, 320), Image.Resampling.LANCZOS)
    artwork.save(target, format="WEBP", quality=82, method=6, exact=True)
with Image.open(target) as result:
    result.verify()
size = target.stat().st_size
if size > 130_000 or size < 1000:
    raise SystemExit(f"Unexpected optimized WebP size: {size}")
data = json.loads(catalog.read_text(encoding="utf-8"))
found = False
for project in data.get("projects", []):
    if project.get("id") != "icons":
        continue
    images = project.get("images", [])
    if "./assets/previews/icons-komic.png" in images:
        project["images"] = [
            "./assets/previews/icons-komic.webp" if img == "./assets/previews/icons-komic.png" else img
            for img in images
        ]
        found = True
    elif "./assets/previews/icons-komic.webp" in images:
        found = True
if not found:
    raise SystemExit("Missing expected Icon Library preview reference")
catalog.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Komic preview optimized: {source.stat().st_size} -> {size} bytes")

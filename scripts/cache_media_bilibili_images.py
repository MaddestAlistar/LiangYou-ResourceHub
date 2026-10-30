#!/usr/bin/env python3
"""Cache hand-verified Bilibili trailer JPEG covers on our own GitHub Pages.

Uses only already-verified BV IDs and official CDN URLs from the static catalog.
No search, credential, cookies, proxying video, or fabricated thumbnails.
"""
import json
import re
import urllib.request
import urllib.error
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/"data/media-domestic-trailers.json"
COVER_DIR=ROOT/"assets/media-video-covers"
BVID=re.compile(r"BV[A-Za-z0-9]{10}")
ALLOWED=("hdslb.com","biliimg.com")
MAX_BYTES=1500000

def image_url(value):
    if not isinstance(value,str):return None
    try:
        u=urlparse(value)
        host=(u.hostname or "").lower()
        if(u.scheme!="https" or u.username or u.password or
            not any(host==d or host.endswith("."+d) for d in ALLOWED) or
            not u.path.startswith("/bfs/archive/")):return None
        return value
    except ValueError:return None

def fetch_jpeg(url):
    req=urllib.request.Request(url,headers={
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
        "Referer":"https://www.bilibili.com/",
        "Accept":"image/avif,image/webp,image/jpeg,image/png,*/*;q=0.8"
    })
    with urllib.request.urlopen(req,timeout=12) as response:
        typ=response.headers.get("Content-Type","").split(";")[0].strip().lower()
        raw=response.read(MAX_BYTES+1)
    if len(raw)>MAX_BYTES or len(raw)<500:raise ValueError("Invalid image size")
    if raw.startswith(b"\xff\xd8\xff") and typ in ("image/jpeg","image/jpg","application/octet-stream"):
        return raw,"jpg"
    if raw.startswith(b"\x89PNG\r\n\x1a\n") and typ=="image/png":
        return raw,"png"
    if raw.startswith(b"RIFF") and raw[8:12]==b"WEBP" and typ=="image/webp":
        return raw,"webp"
    raise ValueError("Unsupported image encoding")

def main():
    doc=json.loads(CATALOG.read_text(encoding="utf-8"))
    if doc.get("schema")!=1:raise ValueError("Unsupported catalog schema")
    COVER_DIR.mkdir(parents=True,exist_ok=True)
    ok=0; failed=0; changed=0
    for row in doc.get("items",[]):
        vid=str(row.get("videoId",""))
        if row.get("platform")!="bilibili" or not BVID.fullmatch(vid) or row.get("verifiedSource")!=f"https://www.bilibili.com/video/{vid}/":continue
        url=image_url(row.get("thumbnail"))
        if not url:failed+=1;continue
        existing=row.get("thumbnailLocal")
        if isinstance(existing,str) and re.fullmatch(r"\./assets/media-video-covers/BV[A-Za-z0-9]{10}\.(?:jpg|png|webp)",existing) and (ROOT/existing.removeprefix("./")).is_file():
            ok+=1;continue
        try:
            image,ext=fetch_jpeg(url)
            target=COVER_DIR/f"{vid}.{ext}"
            target.write_bytes(image)
            row["thumbnailLocal"]=f"./assets/media-video-covers/{vid}.{ext}"
            ok+=1;changed+=1
            print(f"Cached {vid} as {ext} ({len(image)} bytes)")
        except (ValueError,TimeoutError,OSError,urllib.error.URLError) as error:
            failed+=1
            print(f"Cover {vid} unavailable: {type(error).__name__}")
    if changed:
        CATALOG.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Bilibili static covers: cached={ok},new={changed},unavailable={failed}")

if __name__=="__main__":main()

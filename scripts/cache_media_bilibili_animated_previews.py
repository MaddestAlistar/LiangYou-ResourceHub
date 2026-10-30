#!/usr/bin/env python3
"""Create short, source-verified animated WEBP *storyboard* thumbnails for Bilibili.

Uses official x/player/videoshot snapshot sheets for exactly verified BVIDs.
It does not capture the video stream, generate fake animation, or store signed URLs.
Upstream errors keep old outputs and never overwrite hand-verified covers.
"""
import io
from datetime import date
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image, UnidentifiedImageError

ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/"data/media-domestic-trailers.json"
COVER_INDEX=ROOT/"data/media-bilibili-cover-map.json"
MOTION_INDEX=ROOT/"data/media-bilibili-motion-map.json"
OUTPUT=ROOT/"assets/media-video-previews"
BVID=re.compile(r"^BV[A-Za-z0-9]{10}$")
MAX_SOURCE_SIZE=4_000_000
MAX_OUTPUT_SIZE=700_000
HEADERS={
    "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Referer":"https://www.bilibili.com/",
    "Accept":"application/json,image/webp,image/png,image/jpeg,*/*",
}
def official_image(raw):
    if not isinstance(raw,str):return None
    if raw.startswith("//"):raw="https:"+raw
    try:
        u=urllib.parse.urlparse(raw)
        host=(u.hostname or "").lower()
        if u.scheme!="https" or u.username or u.password or not (
            host.endswith(".hdslb.com") or host=="hdslb.com" or
            host.endswith(".biliimg.com") or host=="biliimg.com"
        ) or not u.path.startswith("/bfs/videoshot/"):
            return None
        return raw
    except ValueError:return None

def get(url,max_bytes):
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=13) as response:
        if response.status!=200:raise ValueError("Upstream status")
        data=response.read(max_bytes+1)
        if len(data)>max_bytes:raise ValueError("Source too large")
        return data

def make_preview(bvid):
    api="https://api.bilibili.com/x/player/videoshot?"+urllib.parse.urlencode(
        {"bvid":bvid,"index":1})
    body=json.loads(get(api,900_000))
    if body.get("code")!=0:raise ValueError("Videoshot unsupported: "+str(body.get("code")))
    doc=body.get("data") or {}
    images=[official_image(x) for x in (doc.get("image") or [])][:2]
    images=[x for x in images if x]
    w=int(doc.get("img_x_size") or 0);h=int(doc.get("img_y_size") or 0)
    cols=int(doc.get("img_x_len") or 0);rows=int(doc.get("img_y_len") or 0)
    if not images or not (80<=w<=960 and 40<=h<=540 and 1<=cols<=20 and 1<=rows<=20):
        shots=doc.get("video_shots")
        shot_meta={"type":type(shots).__name__,
          "len":len(shots) if isinstance(shots,(list,dict,str)) else None,
          "first_keys":list(shots[0].keys())[:15] if isinstance(shots,list) and shots and isinstance(shots[0],dict) else
            list(shots.keys())[:15] if isinstance(shots,dict) else None}
        print("STORYBOARD_FIELDS",bvid,{"keys":sorted(doc.keys()),"images":len(images),"w":w,"h":h,"cols":cols,"rows":rows,"shots":shot_meta})
        raise ValueError("Incomplete storyboard")
    frames=[];sheet=Image.open(io.BytesIO(get(images[0],MAX_SOURCE_SIZE))).convert("RGB")
    if sheet.width<w*cols or sheet.height<h*rows:raise ValueError("Invalid sheet grid")
    count=min(cols*rows,14)
    # Samples from genuine, sequential Bilibili video snapshots, no invented frames.
    for index in range(count):
        left=(index%cols)*w;top=(index//cols)*h
        frames.append(sheet.crop((left,top,left+w,top+h)).resize((320,180)))
    if len(frames)<3:raise ValueError("Too few snapshots")
    buffer=io.BytesIO()
    frames[0].save(buffer,format="WEBP",save_all=True,
        append_images=frames[1:],duration=650,loop=0,quality=57,method=5)
    value=buffer.getvalue()
    if len(value)>MAX_OUTPUT_SIZE:raise ValueError("Preview too large")
    return value, len(frames)

def main():
    doc=json.loads(CATALOG.read_text(encoding="utf8"))
    if doc.get("schema")!=1:raise ValueError("Unsupported catalog")
    covers=json.loads(COVER_INDEX.read_text(encoding="utf8"))
    if covers.get("schema")!=1:raise ValueError("Unsupported cover map")
    OUTPUT.mkdir(parents=True,exist_ok=True)

    # Use previously verified BV IDs, not inferred film associations or
    # a generic provider keyword search. Cover map includes films beyond the
    # small manually curated catalog, so this scales to real matching results.
    ids={x for x in covers.get("items",{}) if BVID.fullmatch(x)}
    curated={}
    for row in doc.get("items",[]):
        ident=str(row.get("videoId") or "")
        if row.get("platform")=="bilibili" and BVID.fullmatch(ident) and (
            row.get("verifiedSource")==f"https://www.bilibili.com/video/{ident}/"):
            ids.add(ident)
            curated[ident]=row
    ordered=sorted(ids)
    # Do not repeatedly hammer Bilibili for unavailable storyboard sprites.
    # A small rotating slice covers the 70+ verified videos every few days.
    start=(date.today().toordinal()*24)%len(ordered) if ordered else 0
    selected={ordered[(start+i)%len(ordered)] for i in range(min(24,len(ordered)))}
    selected.update(curated)

    created=0;reused=0;unavailable=0
    for ident in sorted(selected):
        output=OUTPUT/f"{ident}.webp"
        if output.exists() and 1000<output.stat().st_size<MAX_OUTPUT_SIZE:
            reused+=1;continue
        try:
            blob,count=make_preview(ident)
            output.write_bytes(blob)
            created+=1
            print(f"Animated Bilibili storyboard {ident}: {count} genuine snapshots; {len(blob)} bytes")
        except (ValueError,TimeoutError,urllib.error.URLError,UnidentifiedImageError,OSError,KeyError) as exc:
            unavailable+=1
            print(f"Bilibili storyboard {ident} unavailable: {type(exc).__name__} {str(exc)[:90]}")

    # Preserve successes from earlier runs even when a later API request fails.
    # Publish only actual first-party WebP files matching a verified BV ID.
    motion={}
    for ident in sorted(ids):
        file=OUTPUT/f"{ident}.webp"
        if file.is_file() and 1000<file.stat().st_size<MAX_OUTPUT_SIZE:
            try:
                with Image.open(file) as img:
                    if img.format=="WEBP" and img.n_frames>=3:
                        motion[ident]=f"./assets/media-video-previews/{ident}.webp"
            except (UnidentifiedImageError,OSError):
                pass
    for ident,row in curated.items():
        if ident in motion:row["animatedThumbnailLocal"]=motion[ident]
        else:row.pop("animatedThumbnailLocal",None)
    catalog=json.dumps(doc,ensure_ascii=False,indent=2)+"\n"
    if catalog!=CATALOG.read_text(encoding="utf8"):
        CATALOG.write_text(catalog,encoding="utf8")

    manifest=json.dumps({"schema":1,"items":motion},ensure_ascii=False,indent=2)+"\n"
    if not MOTION_INDEX.exists() or MOTION_INDEX.read_text(encoding="utf8")!=manifest:
        MOTION_INDEX.write_text(manifest,encoding="utf8")
    print(f"Animated Bilibili storyboards: new={created},reused={reused},unavailable={unavailable},available={len(motion)}")
if __name__=="__main__":main()

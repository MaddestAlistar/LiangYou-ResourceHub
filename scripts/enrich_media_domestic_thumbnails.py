#!/usr/bin/env python3
"""One-off, low-frequency cover lookup for hand-verified Bilibili clips.

Uses official public video detail metadata; does not fetch or host video streams.
Never changes an existing field if the metadata lookup fails.
"""
import json
import time
import urllib.parse
from pathlib import Path
from refresh_media_extra_videos import get_json, trusted_thumbnail

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/"data/media-domestic-trailers.json"

def main():
    doc=json.loads(PATH.read_text(encoding="utf8"))
    count=0
    for item in doc.get("items",[]):
        if item.get("platform")!="bilibili" or item.get("thumbnail"):
            continue
        bvid=str(item.get("videoId") or "")
        if not bvid.startswith("BV"):continue
        url="https://api.bilibili.com/x/web-interface/view?"+urllib.parse.urlencode({"bvid":bvid})
        try:
            response=get_json(url,timeout=10)
            data=response.get("data") if response.get("code")==0 else None
            if not isinstance(data,dict) or data.get("bvid")!=bvid:continue
            thumb=trusted_thumbnail("bilibili",data.get("pic"))
            if thumb:
                item["thumbnail"]=thumb
                count+=1
                print("BILI_THUMBNAIL_OK",bvid,thumb.split("?")[0],flush=True)
        except Exception as ex:
            print("BILI_THUMBNAIL_UNAVAILABLE",bvid,type(ex).__name__,flush=True)
        time.sleep(3)
    PATH.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("BILI_THUMBNAILS_ADDED",count,flush=True)

if __name__=="__main__":main()

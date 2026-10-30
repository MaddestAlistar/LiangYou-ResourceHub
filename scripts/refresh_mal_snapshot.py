#!/usr/bin/env python3
"""Daily opt-in, exact-ID MyAnimeList metadata for titles in the published catalog."""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"data/media-intel.json"
OUT=ROOT/"data/media-mal-v2.json"
KEY=(os.environ.get("MAL_CLIENT_ID") or os.environ.get("MYANIMELIST_CLIENT_ID") or "").strip()
LIMIT=45

def ids_from_catalog(data):
    found=[]
    seen=set()
    def visit(value,depth=0):
        if depth>13:return
        if isinstance(value,dict):
            num=value.get("mal_id")
            try:
                n=int(num) if num is not None else 0
            except (ValueError,TypeError):
                n=0
            if 0<n<10**10 and n not in seen:
                seen.add(n)
                found.append(n)
            for val in value.values():visit(val,depth+1)
        elif isinstance(value,list):
            for val in value:visit(val,depth+1)
    visit(data)
    return found

def fetch(id):
    url="https://api.myanimelist.net/v2/anime/"+str(id)+"?"+urllib.parse.urlencode({
      "fields":"mean,rank,popularity,num_scoring_users,num_list_users,media_type,num_episodes,genres,studios,rating"
    })
    req=urllib.request.Request(url,headers={"X-MAL-CLIENT-ID":KEY,"Accept":"application/json","User-Agent":"LiangYouResourceHub/1.0"})
    with urllib.request.urlopen(req,timeout=13) as response:
        if response.status!=200:raise ValueError("MAL HTTP not 200")
        x=json.load(response)
    if x.get("id")!=id or not str(x.get("title") or "").strip():raise ValueError("MAL identity mismatch")
    score=x.get("mean")
    return {
       "ok":True,"status":"ok","source":"MyAnimeList v2","malId":id,
       "title":str(x["title"])[:160],"url":"https://myanimelist.net/anime/"+str(id),
       "score":score if isinstance(score,(float,int)) and 0<=score<=10 else None,"scale":10,
       "rank":x.get("rank") if isinstance(x.get("rank"),int) else None,
       "popularity":x.get("popularity") if isinstance(x.get("popularity"),int) else None,
       "ratingCount":x.get("num_scoring_users") if isinstance(x.get("num_scoring_users"),int) else None,
       "listUsers":x.get("num_list_users") if isinstance(x.get("num_list_users"),int) else None,
       "episodes":x.get("num_episodes") if isinstance(x.get("num_episodes"),int) else None,
       "mediaType":str(x.get("media_type") or "")[:30],
       # MAL suitability codes, not a statutory national film classification.
       "contentRating":str(x.get("rating") or "").lower() if str(x.get("rating") or "").lower() in
         {"g","pg","pg_13","r","r+","rx"} else None,
       "studios":[str(s["name"])[:70] for s in x.get("studios",[])[:5] if s.get("name")],
       "genres":[str(s["name"])[:70] for s in x.get("genres",[])[:8] if s.get("name")]
    }

def main():
    if not KEY or not SOURCE.exists():
        print("MAL_SNAPSHOT_NOT_CONFIGURED_OR_CATALOG_MISSING")
        return
    ids=ids_from_catalog(json.loads(SOURCE.read_text(encoding="utf-8")))[:LIMIT]
    results={}
    failed=0
    for id in ids:
        try: results[str(id)]=fetch(id)
        except urllib.error.HTTPError as err:
            failed+=1
            if err.code==429:
                print("MAL_RATE_LIMIT_STOP")
                break
        except (urllib.error.URLError,TimeoutError,ValueError,KeyError,TypeError,json.JSONDecodeError):
            failed+=1
        time.sleep(0.32)
    if len(results)<min(3,len(ids)):
        print("MAL_SNAPSHOT_NO_VERIFIED_RESULTS",len(results),"/",len(ids),"existing file unchanged")
        return
    payload={"ok":True,"status":"ok","source":"MyAnimeList v2",
             "checkedAt":datetime.now(timezone.utc).isoformat(),"count":len(results),"items":results}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("MAL_SNAPSHOT_VERIFIED",len(results),"of",len(ids),"errors",failed)

if __name__=="__main__":
    main()

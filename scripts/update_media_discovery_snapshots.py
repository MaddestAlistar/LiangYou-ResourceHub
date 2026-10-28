#!/usr/bin/env python3
"""Daily verified film enrichment snapshots for sources blocked at Cloudflare edge.
Do not interpolate IDs or publish credential-bearing URLs."""
import json,os,re,time,urllib.request,urllib.parse
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data/media-discovery-snapshot.json"
SOURCE=ROOT/"data/media-intel.json"
now=lambda:datetime.now(timezone.utc).isoformat()
def fetch(url,params=None,headers=None):
    u=url+("?" + urllib.parse.urlencode(params) if params else "")
    request=urllib.request.Request(u,headers={"Accept":"application/json","User-Agent":"LiangYou-ResourceHub/1.0",**(headers or {})})
    with urllib.request.urlopen(request,timeout=16) as response:
        if response.status!=200:raise ValueError("http_not_200")
        data=response.read(500000)
    return json.loads(data)
def valid_url(x,domain):
    try:
        p=urllib.parse.urlparse(x)
        return x if p.scheme=="https" and (p.hostname==domain or p.hostname.endswith("."+domain)) else ""
    except Exception:return ""
def save_section(snapshot,name,data):
    snapshot[name]={"checked_at":now(),**data}
def mal(snapshot,works):
    key=(os.getenv("MAL_CLIENT_ID") or os.getenv("MYANIMELIST_CLIENT_ID") or "").strip()
    if not key:return False
    candidates=[]
    for w in works:
        mid=w.get("mal_id")
        if str(mid).isdigit() and 1<=int(mid)<=9999999999:
            candidates.append(int(mid))
    candidates=list(dict.fromkeys(candidates))[:16]
    if not candidates:return False
    results={}
    for ident in candidates:
        try:
            x=fetch("https://api.myanimelist.net/v2/anime/"+str(ident),
                {"fields":"mean,rank,popularity,num_scoring_users,num_list_users,media_type,num_episodes,genres,studios"},
                {"X-MAL-CLIENT-ID":key})
            if int(x.get("id") or 0)!=ident or not x.get("title"):continue
            value=x.get("mean")
            score=value if isinstance(value,(int,float)) and 0<=value<=10 else None
            results[str(ident)]={"malId":ident,"title":str(x["title"])[:160],
                "score":score,"scale":10,"status":"ok","source":"MyAnimeList v2",
                "url":"https://myanimelist.net/anime/"+str(ident),
                "ratingCount":x.get("num_scoring_users") if isinstance(x.get("num_scoring_users"),int) else None,
                "rank":x.get("rank") if isinstance(x.get("rank"),int) else None,
                "popularity":x.get("popularity") if isinstance(x.get("popularity"),int) else None,
                "episodes":x.get("num_episodes") if isinstance(x.get("num_episodes"),int) else None,
                "studios":[str(t["name"])[:70] for t in (x.get("studios") or [])[:5] if t.get("name")],
                "genres":[str(t["name"])[:60] for t in (x.get("genres") or [])[:7] if t.get("name")]}
        except Exception:pass
        time.sleep(.14)
    if results:save_section(snapshot,"mal",{"status":"ok","items":results})
    return bool(results)
def tastedive(snapshot,doc):
    key=os.getenv("TASTEDIVE_API_KEY","").strip()
    if not key:return False
    movies=[x for x in (doc.get("sources",{}).get("tmdb",{}).get("items") or []) if isinstance(x,dict)]
    results={}
    for item in movies:
        kind=item.get("kind")
        if kind not in ("movie","tv"):continue
        title=(item.get("original_title") or item.get("title") or "").strip()
        id=item.get("tmdb_id")
        if not isinstance(id,int) or not 1<=id<10000000000 or not 3<=len(title)<=80 or not re.search(r"[A-Za-z]{3}",title):continue
        canonical="tmdb-"+kind+"-"+str(id)
        if canonical in results:continue
        try:
            x=fetch("https://tastedive.com/api/similar",{"k":key,"q":title,"type":"movie" if kind=="movie" else "show","limit":"5"})
            data=x.get("Similar") or x.get("similar") or {}
            suggestions=data.get("Results") or data.get("results") or []
            info=data.get("Info") or data.get("info") or []
            if info and str(info[0].get("Name") or info[0].get("name") or "").casefold().strip()!=title.casefold().strip():continue
            records=[{"title":str(v.get("Name") or v.get("name") or "")[:90],"source":"TasteDive","verified":False} for v in suggestions if (v.get("Name") or v.get("name"))]
            if records:results[canonical]={"queried_title":title,"suggestions":records[:5]}
        except Exception:pass
        time.sleep(.3)
        if len(results)>=10:break
    if results:save_section(snapshot,"tastedive",{"status":"ok","items":results})
    return bool(results)
def guardian(snapshot):
    key=(os.getenv("THE_GUARDIAN_API_KEY") or os.getenv("GUARDIAN_API_KEY") or "").strip()
    if not key:return False
    x=fetch("https://content.guardianapis.com/search",
        {"api-key":key,"section":"film","page-size":"6","order-by":"newest","show-fields":"thumbnail,trailText,byline"})
    if x.get("response",{}).get("status")!="ok":return False
    rows=[]
    for a in x["response"].get("results") or []:
        url=valid_url(a.get("webUrl") or "","theguardian.com")
        if not url or not a.get("webTitle"):continue
        fields=a.get("fields") or {}
        rows.append({"title":str(a["webTitle"])[:180],"url":url,"date":a.get("webPublicationDate"),
                     "thumbnail":valid_url(fields.get("thumbnail") or "","guim.co.uk") or None,
                     "summary":re.sub(r"<[^>]*>"," ",str(fields.get("trailText") or ""))[:190].strip(),
                     "section":str(a.get("sectionName") or "Film")[:50],"source":"The Guardian"})
    if rows:save_section(snapshot,"guardian",{"status":"ok","articles":rows})
    return bool(rows)
def main():
    try:doc=json.loads(SOURCE.read_text(encoding="utf-8"))
    except Exception:doc={}
    try:old=json.loads(OUT.read_text(encoding="utf-8"))
    except Exception:old={}
    snapshot={"schema":1,**{k:v for k,v in old.items() if k in ("mal","guardian","tastedive") and isinstance(v,dict)}}
    works=list((doc.get("works") or {}).values()) if isinstance(doc.get("works"),dict) else []
    for name,fn in (("mal",lambda:mal(snapshot,works)),("guardian",lambda:guardian(snapshot)),("tastedive",lambda:tastedive(snapshot,doc))):
        try:print("MEDIA_SNAPSHOT",name,"ok" if fn() else "unavailable_or_not_configured")
        except Exception as e:print("MEDIA_SNAPSHOT",name,"unavailable",type(e).__name__)
    if not any(snapshot.get(k,{}).get("status")=="ok" for k in ("mal","guardian","tastedive")):
        print("MEDIA_SNAPSHOT_NO_VERIFIED_CONTENT; nothing published");return
    OUT.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("MEDIA_SNAPSHOT_WRITTEN",OUT.stat().st_size)
if __name__=="__main__":main()

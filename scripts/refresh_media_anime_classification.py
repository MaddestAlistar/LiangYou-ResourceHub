#!/usr/bin/env python3
"""Public anime type, theme and non-statutory suitability metadata.

Only fetches by the site's existing exact Bangumi/AniList/MAL identifiers.
Title-search guesses and derived age recommendations are never published.
"""
from __future__ import annotations
import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data/media-intel.json"
VIDEOS = ROOT / "data/media-anime-videos.json"
MAL = ROOT / "data/media-mal-v2.json"
OUT = ROOT / "data/media-anime-classification.json"
UA = "LiangYou-ResourceHub/1.0 (public anime catalog metadata)"
ID_RE = re.compile(r"^(?:(?:bangumi|anilist|mal|simkl-anime)-[1-9]\d*|imdb-tt[1-9]\d{4,11})$")
GENRE_SET = {"热血","动作","冒险","喜剧","搞笑","奇幻","科幻","悬疑","推理","恋爱",
             "日常","校园","运动","音乐","历史","恐怖","机战","战争","剧情","家庭",
             "百合","治愈","武侠","魔法","悬疑","战斗","少年","少女"}
META_TAGS = {"日本","TV","TV动画","2026","2025","2024","动画","anime","番剧",
             "TRIGGER","J.C.STAFF","J.C. STAFF","P.A.WORKS","BONES","MAPPA",
             "WIT STUDIO","TOEI ANIMATION","东映动画","東映動畫","日升","SUNRISE",
             "十月新番","10月","新番","续作","OVA","剧场版","连载","漫画改",
             "小说改","游戏改","2026年10月","2026年","官方",
             "ONEPIECE","ONE PIECE","海贼王","ワンピース","JUMP",
             "少年JUMP","集英社","尾田榮一郎","尾田荣一郎","尾田栄一郎",
             "路飞","魯夫","ルフィ","民工","超连载","熱血系","热血系",
             "长篇连载","長篇連載","原作","周刊少年JUMP"}
AGE = {"g":"G","pg":"PG","pg_13":"PG-13","r":"R-17+","r+":"R+","rx":"Rx"}
SAFE_TAG = re.compile(r"^[^\x00-\x1f<>]{2,48}$")
ANILIST = "https://graphql.anilist.co"
FIELDS = """id idMal type isAdult startDate{year} seasonYear
 title{native romaji english} genres
 tags{name rank isMediaSpoiler isGeneralSpoiler isAdult}"""

def read(path):
    try:
        val=json.loads(path.read_text(encoding="utf8"))
        return val if isinstance(val,dict) else {}
    except (ValueError,OSError):
        return {}

def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def normalized_title(value):
    return "".join(c for c in unicodedata.normalize("NFKC",str(value or "")).casefold()
                   if c.isalnum())

def ident(name):
    return int(name.rsplit("-",1)[1]) if re.fullmatch(r"(?:bangumi|anilist|mal)-[1-9]\d*",name) else 0

def clean(values, max_count=6):
    result=[]
    for value in values or []:
        v=str(value or "").strip()
        if not SAFE_TAG.fullmatch(v) or v.casefold() in {"unknown","n/a","none"}:
            continue
        if v not in result:
            result.append(v)
        if len(result)>=max_count:
            break
    return result

def record_map():
    c=read(CATALOG)
    d=read(VIDEOS).get("items") or {}
    rows={}
    for work in (c.get("works") or {}).values():
        if not isinstance(work,dict) or work.get("kind")!="anime":
            continue
        wid=str(work.get("id") or "")
        if not ID_RE.fullmatch(wid):
            continue
        v=d.get(wid) or {}
        ids=[wid,*[str(x) for x in work.get("aliases") or []]]
        bangumi=next((ident(x) for x in ids if x.startswith("bangumi-") and ident(x)),0)
        anilist=next((ident(x) for x in ids if x.startswith("anilist-") and ident(x)),0)
        mal=next((ident(x) for x in ids if x.startswith("mal-") and ident(x)),0)
        anilist=anilist or int(v.get("anilistId") or 0)
        mal=mal or int(work.get("mal_id") or v.get("malId") or 0)
        if not 0<anilist<10**10:anilist=0
        if not 0<mal<10**10:mal=0
        raw=str(work.get("date") or "")
        year=int(raw[:4]) if re.match(r"^\d{4}",raw) else 0
        titles=[work.get("title"),work.get("original_title"),work.get("english_title")]
        titles+=list(v.get("aliases") or [])[:24]
        rows[wid]={"id":wid,"year":year,"bangumiId":bangumi,
                   "anilistId":anilist,"malId":mal,
                   "title":str(work.get("title") or "")[:160],
                   "identityTitles":[str(x) for x in titles if isinstance(x,str) and x]}
    return rows

def request_json(url,body=None,timeout=13):
    hdr={"User-Agent":UA,"Accept":"application/json"}
    if body is not None:
        hdr["Content-Type"]="application/json"
    req=urllib.request.Request(url,data=json.dumps(body).encode() if body is not None else None,headers=hdr)
    with urllib.request.urlopen(req,timeout=timeout) as response:
        if response.status!=200:
            raise RuntimeError("upstream_failure")
        return json.load(response)

def bangumi_detail(w):
    if not w["bangumiId"]:
        return None
    raw=request_json("https://api.bgm.tv/v0/subjects/"+str(w["bangumiId"]))
    if raw.get("id")!=w["bangumiId"] or raw.get("type")!=2 or raw.get("nsfw") is True:
        return None
    yr=str(raw.get("date") or "")[:4]
    if yr.isdigit() and w["year"]>1900 and abs(int(yr)-w["year"])>1:
        return None
    tags=raw.get("tags") or []
    tagged=sorted((x for x in tags if isinstance(x,dict)),key=lambda x:int(x.get("count") or 0),reverse=True)
    excluded_titles={normalized_title(v) for v in w.get("identityTitles") or []
                     if len(normalized_title(v))>=3}
    valid=[x["name"] for x in tagged
           if isinstance(x.get("name"),str)
           and x["name"].strip() not in META_TAGS
           and normalized_title(x["name"]) not in excluded_titles
           and not re.fullmatch(r"(?:19|20)\d{2}|OP|ED|PV|S\d+",x["name"].strip(),re.I)
           and int(x.get("count") or 0)>=5
           and SAFE_TAG.fullmatch(x["name"].strip())]
    themes=clean(valid,8)
    genres=clean((x for x in themes if x in GENRE_SET),6)
    return {"genres":genres,"themes":themes,"source":"Bangumi"}

def anilist_detail(w):
    aid,mid=w["anilistId"],w["malId"]
    if not (aid or mid):return None
    arg="id" if aid else "idMal"
    value=aid or mid
    payload={"query":"query($id:Int){Media("+arg+":$id,type:ANIME){"+FIELDS+"}}","variables":{"id":value}}
    d=request_json(ANILIST,payload)
    x=(d.get("data") or {}).get("Media")
    if not isinstance(x,dict) or x.get("type")!="ANIME" or x.get(arg)!=value:return None
    if x.get("isAdult") is True:return None
    origin=(x.get("startDate") or {}).get("year") or x.get("seasonYear") or 0
    if w["year"]>1900 and isinstance(origin,int) and origin>1900 and abs(origin-w["year"])>1:
        return None
    genres=clean(x.get("genres"),6)
    tags=sorted([t for t in x.get("tags") or [] if isinstance(t,dict)
                 and not t.get("isAdult") and not t.get("isMediaSpoiler")
                 and not t.get("isGeneralSpoiler") and int(t.get("rank") or 0)>=60],
                 key=lambda t:int(t.get("rank") or 0),reverse=True)
    themes=clean((t.get("name") for t in tags if str(t.get("name") or "") not in genres),6)
    return {"genres":genres,"themes":themes,"source":"AniList",
            "anilistId":x.get("id"),"malId":x.get("idMal")}

def mal_detail(w,cache):
    mid=w["malId"]
    x=cache.get(str(mid)) if mid else None
    if not isinstance(x,dict) or x.get("ok") is not True or x.get("status")!="ok" or x.get("malId")!=mid:
        return None
    # MAL is a platform content-suitability code, never a country-specific
    # age certification or a comprehensive content warning.
    code=str(x.get("contentRating") or "").lower()
    return {"genres":clean(x.get("genres"),6),
            "suitability":{"source":"MAL","rating":AGE[code]} if code in AGE else None}

def combine(w,prior,bgm,ani,mal):
    # High-confidence genre sources precede crowdsourced wiki tags.
    genres=clean([*(ani or {}).get("genres",[]),*(mal or {}).get("genres",[]),
                  *(bgm or {}).get("genres",[])],6)
    # Balance crowd tags with higher-ranked AniList topics. Do not let six
    # fandom shorthands crowd all the verified subject themes off the panel.
    community=(bgm or {}).get("themes",[])
    editorial=(ani or {}).get("themes",[])
    themes=clean([*community[:3],*editorial[:4],*community[3:]],6)
    group_source=((ani or {}).get("source") or (mal and "MAL") or (bgm or {}).get("source") or "")
    tag_source=("Bangumi · AniList" if (bgm or {}).get("themes") and (ani or {}).get("themes")
                else (bgm or {}).get("source") if (bgm or {}).get("themes")
                else (ani or {}).get("source") or "")
    fresh={"kind":"anime","workId":w["id"],"year":w["year"],
           "genres":genres,"keywords":themes,
           "genreSource":group_source,"themeSource":tag_source,
           "parental_rating":(mal or {}).get("suitability"),
           "bangumiId":w["bangumiId"],"anilistId":w["anilistId"],"malId":w["malId"],
           "checkedAt":now()}
    if not bgm and not ani and not mal and isinstance(prior,dict) and (
        prior.get("workId")==w["id"] and prior.get("year")==w["year"]
        and isinstance(prior.get("genres"),list)
        and isinstance(prior.get("keywords"),list)
    ):
        return prior
    return fresh

def main():
    works=record_map()
    previous=read(OUT).get("items") or {}
    mal=read(MAL).get("items") or {}
    items={}
    for wid,w in works.items():
        old=previous.get(wid) or {}
        if old.get("workId")==wid and old.get("year")==w["year"]:
            items[wid]=old
        else:
            items[wid]=combine(w,{},None,None,mal_detail(w,mal))
    # Refresh unfilled records first, then oldest entries for stable rotation.
    batch=max(1,min(50,int(os.environ.get("ANIME_CLASS_BATCH","35"))))
    ordered=sorted(works,key=lambda wid:(
        0 if wid in ("bangumi-975","bangumi-899") else 1,
        bool(items[wid].get("keywords")),
        bool(items[wid].get("genres")),
        str(items[wid].get("checkedAt") or ""),wid))
    checked=0
    for wid in ordered[:batch]:
        w=works[wid]
        bgm=ani=None
        try:
            bgm=bangumi_detail(w)
        except (ValueError,KeyError,TypeError,OSError,RuntimeError):
            pass
        time.sleep(.12)
        try:
            ani=anilist_detail(w)
        except (ValueError,KeyError,TypeError,OSError,RuntimeError):
            pass
        local=mal_detail(w,mal)
        old=items[wid]
        updated=combine(w,old,bgm,ani,local)
        # Preserve independently verified fields when one provider times out.
        if old.get("year")==w["year"]:
            if not updated["genres"] and old.get("genres"):
                updated["genres"]=old["genres"]
                updated["genreSource"]=old.get("genreSource","")
            if not updated["keywords"] and old.get("keywords"):
                updated["keywords"]=old["keywords"]
                updated["themeSource"]=old.get("themeSource","")
            if updated["parental_rating"] is None and local is None:
                updated["parental_rating"]=old.get("parental_rating")
        items[wid]=updated
        checked+=1
        print("ANIME_CLASS",wid,"genres",len(updated["genres"]),"themes",len(updated["keywords"]),
              "suitability",bool(updated["parental_rating"]),flush=True)
        time.sleep(.24)
    # Exact matching MAL IDs can fill existing entries not visited in this batch.
    for wid,w in works.items():
        x=mal_detail(w,mal)
        if x and x["suitability"]:
            items[wid]["parental_rating"]=x["suitability"]
            if not items[wid]["genres"] and x["genres"]:
                items[wid]["genres"]=x["genres"]
                items[wid]["genreSource"]="MAL"
    out={"schema":1,"updatedAt":now(),"items":items}
    OUT.write_text(json.dumps(out,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf8")
    print("ANIME_CLASS_SUMMARY",len(items),"processed",checked,"withGenres",
          sum(bool(x["genres"]) for x in items.values()),"withGuidance",
          sum(bool(x.get("parental_rating")) for x in items.values()),flush=True)

if __name__=="__main__":
    main()

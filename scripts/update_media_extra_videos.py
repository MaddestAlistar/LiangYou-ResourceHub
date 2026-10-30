#!/usr/bin/env python3
"""Low-rate public video discovery, keyed by exact TMDB catalog identities.

GitHub Actions refreshes a small rotating batch, never a visitor's browser.
Nothing is stored unless the public provider's returned title matches the
catalog name and the URL is canonical. A video search is not a TMDB identity
verification, so search-based matches use titleMatchVerified (not verifiedByTitleId).
"""
import datetime
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data/media-intel.json"
OUT = ROOT / "data/media-extra-videos.json"
VIDEO_LIMIT = 20
UA = "LiangYou-ResourceHub/1.0 (periodic movie trailer metadata; no bulk download)"
VIDEO_WORD = re.compile(r"预告|先导|特辑|花絮|片段|采访|专访|影评|解说|剧评|幕后|official|trailer|teaser|clip|featurette|interview|review|preview|behind.the.scenes|[\s　]pv|pv$|予告|特報|本予告|ティザー", re.I)
TRAILER_WORD = re.compile(r"预告|先导|官方|trailer|teaser|preview|pv|予告|特報|ティザー", re.I)
UNSUITABLE = re.compile(r"完整版|全集|全剧|网盘|下载资源|免费下载|磁力|盗版|full\s*(movie|episode|film)|全集免费观看", re.I)

def norm(s):
    return re.sub(r"[\W_]+", "", str(s or "").casefold(), flags=re.U)

def precise_title(video, names, year=0, kind="movie"):
    original = str(video or "")
    text = norm(original)
    if not text or UNSUITABLE.search(original) or not VIDEO_WORD.search(original):
        return False
    cleaned = [norm(x) for x in names if len(norm(x)) >= 4]
    if not any(x in text for x in cleaned):
        return False
    # Exclude a named sequel of an original movie even when original title is a prefix.
    for alias in cleaned:
        if alias and alias in text and kind == "movie":
            if re.search(re.escape(alias) + r"(?:2|3|4|5|ii|iii|iv|第二部|第三部|续集)", text):
                if not any(norm(x) == alias + "2" for x in names):
                    return False
    explicit_years = [int(y) for y in re.findall(r"(?<!\d)(?:19|20)\d{2}(?!\d)", original)]
    if kind == "movie" and year and explicit_years and all(abs(y-year)>1 for y in explicit_years):
        return False
    return True

def request_json(url):
    req=urllib.request.Request(url, headers={"User-Agent":UA,"Accept":"application/json","Accept-Language":"zh-CN,zh;q=0.8,en;q=0.6"})
    try:
        with urllib.request.urlopen(req,timeout=17) as response:
            if response.status!=200:return None
            return json.loads(response.read(350000))
    except (urllib.error.URLError, ValueError, TimeoutError, OSError):
        return None

def query(base, **kwargs):
    return base+"?"+urllib.parse.urlencode(kwargs)

def valid_work(work):
    if not isinstance(work,dict) or work.get("kind") not in ("movie","tv"):
        return False
    try: ident=int(work.get("tmdb_id") or 0)
    except (ValueError,TypeError):return False
    return 0<ident<100000000 and bool(work.get("title") or work.get("original_title"))

def year_of(work):
    try:return int(str(work.get("date") or "")[:4])
    except ValueError:return 0

def make_video(platform, ident, work, video_id, video_title, views=0, thumb=None):
    kind=work["kind"]; year=year_of(work); title=str(work.get("title") or "")
    patterns={
        "acfun":(r"\d{5,12}","https://www.acfun.cn/v/ac{}"),
        "niconico":(r"(?:sm|so|nm)\d{5,12}","https://www.nicovideo.jp/watch/{}"),
        "dailymotion":(r"x[a-zA-Z0-9]{5,15}","https://www.dailymotion.com/video/{}"),
    }
    pattern,url=patterns[platform]
    if not re.fullmatch(pattern,str(video_id)):return None
    names=[title,work.get("original_title")]
    if not precise_title(video_title,names,year,kind):return None
    rec={"platform":platform,"kind":kind,"tmdbId":ident,"title":title,"year":year,
         "videoId":str(video_id),"name":str(video_title)[:145],
         "type":"Trailer" if TRAILER_WORD.search(str(video_title)) else "Related",
         "verifiedSource":url.format(video_id),"titleMatchVerified":True,
         "matchMethod":"title_year_metadata","official":False}
    if isinstance(views,int) and views>=0:rec["views"]=views
    if isinstance(thumb,str) and thumb.startswith("https://"):rec["thumbnail"]=thumb[:350]
    return rec

def kino(work, ident):
    endpoint="movies" if work["kind"]=="movie" else "shows"
    data=request_json(query("https://api.kinocheck.com/"+endpoint,tmdb_id=ident,language="en"))
    if not isinstance(data,dict) or data.get("tmdb_id")!=ident:return []
    items=[data.get("trailer"),*(data.get("videos") or [])]
    out=[];seen=set()
    for v in items:
        if not isinstance(v,dict):continue
        youtube_id=str(v.get("youtube_video_id") or "")
        if not re.fullmatch(r"[a-zA-Z0-9_-]{11}",youtube_id) or youtube_id in seen:continue
        category=v.get("categories") or []
        if not isinstance(category,list):category=[]
        if not any(x in ("Trailer","Teaser","Clip","Featurette","Behind the Scenes","Interview") for x in category):
            continue
        name=str(v.get("title") or "").strip()
        # A KinoCheck TMDB link can contain a crossover or announcement for a
        # different film: reject obvious wrong years and named sequels.
        if year_of(work) and work["kind"]=="movie":
            mentioned=[int(x) for x in re.findall(r"(?<!\d)(?:19|20)\d{2}(?!\d)",name)]
            if mentioned and all(abs(x-year_of(work))>1 for x in mentioned):continue
        seen.add(youtube_id)
        out.append({"platform":"youtube","kind":work["kind"],"tmdbId":ident,
            "year":year_of(work),"videoId":youtube_id,"name":name[:145] or "Official movie video",
            "type":"Trailer" if "Trailer" in category or "Teaser" in category else "Related",
            "official":False,"verifiedByTitleId":True,"source":"KinoCheck"})
        if len(out)>=12:break
    return out

def acfun(work,ident):
    title=str(work.get("title") or "")
    if len(norm(title))<4:return []
    data=request_json(query("https://www.acfun.cn/rest/pc-direct/search/video",keyword=title+" 预告",page=1,pageSize=20))
    rows=data.get("videoList") if isinstance(data,dict) else []
    if not isinstance(rows,list):return []
    out=[]
    for row in rows:
        if not isinstance(row,dict):continue
        x=make_video("acfun",ident,work,row.get("dougaId"),row.get("title"),row.get("viewCount"))
        if x:out.append(x)
        if len(out)>=7:break
    return out

def niconico(work,ident):
    original=str(work.get("original_title") or "")
    # Niconico performs best on actual Japanese titles, not generic transliterations.
    if not re.search(r"[\u3040-\u30ff]",original):return []
    data=request_json(query("https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search",
        q=original+" PV",targets="title",fields="contentId,title,viewCounter,startTime",
        _sort="-viewCounter",_limit=20,_context="LiangYouFilmVideo"))
    rows=data.get("data") if isinstance(data,dict) else []
    if not isinstance(rows,list):return []
    out=[]
    for row in rows:
        if not isinstance(row,dict):continue
        x=make_video("niconico",ident,work,row.get("contentId"),row.get("title"),row.get("viewCounter"))
        if x:out.append(x)
        if len(out)>=7:break
    return out

def dailymotion(work,ident):
    original=str(work.get("original_title") or "")
    if len(norm(original))<7 or not re.search(r"[a-zA-Z]",original):return []
    # Short, common movie titles cause false positives: require trailer/film context.
    data=request_json(query("https://api.dailymotion.com/videos",
        search=original+" trailer",fields="id,title,views_total,thumbnail_360_url",limit=20))
    rows=data.get("list") if isinstance(data,dict) else []
    if not isinstance(rows,list):return []
    out=[]
    for row in rows:
        if not isinstance(row,dict):continue
        x=make_video("dailymotion",ident,work,row.get("id"),row.get("title"),row.get("views_total"),row.get("thumbnail_360_url"))
        if x:out.append(x)
        if len(out)>=7:break
    return out

def collect(work,ident):
    found=[];seen=set()
    for source in (kino,acfun,niconico,dailymotion):
        try:rows=source(work,ident)
        except Exception: rows=[]
        for v in rows:
            key=(v["platform"],v["videoId"])
            if key not in seen:seen.add(key);found.append(v)
        # Never hit provider APIs in parallel or on every visitor's page open.
        time.sleep(float(os.getenv("EXTRA_VIDEO_INTERVAL","3")))
    return found[:24]

def update():
    try: previous=json.loads(OUT.read_text(encoding="utf8"))
    except (OSError,ValueError):previous={}
    items={k:v for k,v in (previous.get("items") or {}).items() if
           re.fullmatch(r"(?:movie|tv):[1-9]\d{0,9}",str(k)) and isinstance(v,dict)}
    catalog=json.loads(CATALOG.read_text(encoding="utf8"))
    works={f'{v["kind"]}:{int(v["tmdb_id"])}':v for v in (catalog.get("works") or {}).values() if valid_work(v)}
    limit=max(1,min(8,int(os.getenv("EXTRA_VIDEO_BATCH","6"))))
    # Newly discovered recent works first; then oldest last-check timestamp.
    def priority(k):
        row=items.get(k)
        if row:return (1,str(row.get("checkedAt") or ""),k)
        return (0, str(9999-year_of(works[k])).zfill(4),k)
    selected=sorted(works,key=priority)[:limit]
    now=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    for key in selected:
        work=works[key];ident=int(work["tmdb_id"])
        fresh=collect(work,ident)
        old=items.get(key) or {}
        # Preserve previously verified items during intermittent API failures,
        # but expire old entries after 28 days.
        old_rows=old.get("videos") if isinstance(old.get("videos"),list) else []
        retained=[]
        try:
            age=(datetime.datetime.now(datetime.timezone.utc)-
                 datetime.datetime.fromisoformat(str(old.get("checkedAt") or "").replace("Z","+00:00"))).days
            if age<=28:retained=old_rows
        except ValueError:pass
        joined=[];seen=set()
        for v in fresh+retained:
            if not isinstance(v,dict):continue
            keyid=(v.get("platform"),v.get("videoId"))
            if keyid in seen:continue
            seen.add(keyid);joined.append(v)
        items[key]={"checkedAt":now,"year":year_of(work),"videos":joined[:24]}
        print("EXTRA_VIDEO_RESULT",json.dumps({"work":key,"title":work.get("title"),
              "fresh":len(fresh),"total":len(joined)},ensure_ascii=False),flush=True)
    # hard-limit entries to catalog identities and keep snapshot compact
    items={k:v for k,v in items.items() if k in works}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps({"schema":1,"updatedAt":now,"items":items},ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf8")
    print("EXTRA_VIDEO_REFRESH",json.dumps({"queried":len(selected),"titles":len(items)},ensure_ascii=False))

if __name__=="__main__":
    update()

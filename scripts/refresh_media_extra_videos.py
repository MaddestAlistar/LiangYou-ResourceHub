#!/usr/bin/env python3
"""Bounded, ID-scoped video metadata refresh: KinoCheck, AcFun, Niconico, Dailymotion.

No API keys or cookies; read only. Search results are title-matched, never
pretended to be upstream TMDB-ID verified. Results are cached for static Pages.
Only KinoCheck itself is TMDB ID keyed. Failure retains old verified records.
"""
from __future__ import annotations
import json, os, re, time, unicodedata, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/"data/media-intel.json"
OUT=ROOT/"data/media-extra-videos.json"
MAX_ITEMS=450
MAX_PER_SOURCE=5
HEADERS={"User-Agent":"LiangYou-MovieVideoMetadata/1.0", "Accept":"application/json"}
VIDEO_WORDS=re.compile(r"预告|先导|花絮|片段|幕后|影评|简评|解说|访谈|宣传|搞笑场面|精彩片段|PV|ティザー|予告|特報|トレーラー|trailer|teaser|clip|scene|review|interview|featurette|behind.the.scenes|promo|official|解禁",re.I)
TRAILER_WORDS=re.compile(r"预告|先导|PV|ティザー|予告|特報|トレーラー|trailer|teaser|promo",re.I)
BAN_WORDS=re.compile(r"全集|完整版电影|全片|电影完整版|未删减|full.movie|full.episode|第\d+話|第\d+话|第\d+集|完整正片|海盗版|破解",re.I)
OTHER_FILM_WORDS=re.compile(r"团队打造|团队联手|主创团队|制作团队|from.the.creators.of|制作班底",re.I)
YOUTUBE_ID=re.compile(r"^[A-Za-z0-9_-]{11}$")
ACFUN_ID=re.compile(r"^[1-9]\d{3,11}$")
NICO_ID=re.compile(r"^(?:sm|so)\d{6,12}$")
DM_ID=re.compile(r"^x[a-z0-9]{4,12}$",re.I)
def utc():return datetime.now(timezone.utc).isoformat(timespec="seconds")
def normalize(x):return "".join(c for c in unicodedata.normalize("NFKC",str(x or "")).casefold() if c.isalnum())
def latin(x):return bool(re.search(r"[a-z]",str(x or ""),re.I))
def has_alias(text,alias):
    t=str(text or "").casefold(); a=str(alias or "").casefold().strip()
    if not a:return False
    if latin(a) and len(normalize(a))<4:return False
    if latin(a):
        return bool(re.search(r"(?<![a-z0-9])"+re.escape(a)+r"(?![a-z0-9])",t,re.I))
    return normalize(a) in normalize(t)
def matches_title(video,aliases,year=0,kind="movie"):
    title=str(video or "").strip()
    if not title or BAN_WORDS.search(title) or OTHER_FILM_WORDS.search(title):return False
    matched=[a for a in aliases if has_alias(title,a)]
    if not matched:return False
    # "Moana 2" cannot match Moana (2016), nor 海洋奇缘2 match 海洋奇缘.
    for alias in matched:
        if str(alias).strip().endswith(("2","Ⅱ","II","第二季","第2季")):continue
        # Match explicit sequel numbers *before* punctuation is normalized.
        # "Resident Evil 2 (2026)" must not become "Resident Evil 22026"
        # and accidentally pass the same-year check for the original film.
        if latin(alias) and re.search(
            r"(?<![a-z0-9])"+re.escape(str(alias).strip())+
            r"[\s,.:;()\-]*[2-9](?![0-9])",title,re.I):
            return False
        pos=normalize(title).find(normalize(alias))
        if pos>=0:
            after=normalize(title)[pos+len(normalize(alias)):]
            if re.match(r"(?:[2-9](?!\d)|(?:ii|iii|iv|v|vi)(?![a-z0-9])|Ⅱ|第二部|第三部|第二季|第三季|第[2-9]季)",after,re.I):return False
    # Reject title/year conflicts for films, not later seasons of a television series.
    if kind=="movie" and year>1900:
        years=[int(x) for x in re.findall(r"(?:19|20)\d{2}",title)]
        if years and not any(abs(y-year)<=1 for y in years):return False
    return True
def get_json(url,timeout=11):
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=timeout) as res:
        if res.status!=200:raise RuntimeError("http_"+str(res.status))
        return json.loads(res.read(850000))
def search_url(base,params):return base+"?"+urllib.parse.urlencode(params)
def video_record(work,platform,ident,name,kind="Related",**more):
    return {"platform":platform,"videoId":ident,"name":str(name).strip()[:145],
      "type":kind,"title":work["title"],"kind":work["kind"],"tmdbId":work["tmdb_id"],
      "year":work["year"],"matchedByTitle":True,**more}
def parse_acfun(work):
    title=work["title"]; aliases=work["aliases"]; year=work["year"]
    if not re.search(r"[\u4e00-\u9fff]",title):return []
    result=[];seen=set()
    # Prefer trailers. If no relevant result, one additional low-frequency
    # general-title search can supply reviews or related clips without
    # fetching individual video streams or requiring accounts.
    for search_term in (title+" 预告", title):
        doc=get_json(search_url("https://www.acfun.cn/rest/pc-direct/search/video",
            {"keyword":search_term,"page":1,"pageSize":20}))
        for x in (doc.get("videoList") or [])[:35]:
            if not isinstance(x,dict):continue
            ident=str(x.get("contentId") or x.get("id") or x.get("dougaId") or "");name=x.get("title") or ""
            if not ACFUN_ID.fullmatch(ident) or ident in seen:continue
            if not matches_title(name,aliases,year,work["kind"]) or not VIDEO_WORDS.search(name):continue
            seen.add(ident)
            result.append(video_record(work,"acfun",ident,name,
              "Trailer" if TRAILER_WORDS.search(name) else "Related",
              verifiedSource="https://www.acfun.cn/v/ac"+ident,
              publisher=str(x.get("userName") or "AcFun")[:60],
              views=x.get("viewCount") if isinstance(x.get("viewCount"),int) else None))
            if len(result)>=MAX_PER_SOURCE:break
        if result:break
        time.sleep(2)
    return result
def parse_niconico(work):
    aliases=[x for x in work["aliases"] if re.search(r"[\u3040-\u30ff\u3400-\u9fff]",x)]
    if not aliases:return []
    # Japanese native title is favored; Chinese titles alone have poor recall on Niconico.
    jap=[x for x in aliases if re.search(r"[\u3040-\u30ff]",x)]
    if not jap:return []
    q=sorted(jap,key=len,reverse=True)[0]
    url=search_url("https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search",
      {"q":q+" PV","targets":"title","fields":"contentId,title,viewCounter,startTime",
       "_sort":"-viewCounter","_limit":20,"_context":"LiangYouResourceHub"})
    doc=get_json(url);results=[]
    for x in (doc.get("data") or [])[:20]:
        if not isinstance(x,dict):continue
        ident=str(x.get("contentId") or "");name=str(x.get("title") or "")
        if not NICO_ID.fullmatch(ident) or not matches_title(name,aliases,work["year"],work["kind"]):continue
        if not VIDEO_WORDS.search(name):continue
        results.append(video_record(work,"niconico",ident,name,"Trailer" if TRAILER_WORDS.search(name) else "Related",
          verifiedSource="https://www.nicovideo.jp/watch/"+ident,
          publisher="Niconico",views=x.get("viewCounter") if isinstance(x.get("viewCounter"),int) else None))
        if len(results)>=MAX_PER_SOURCE:break
    return results
def parse_dailymotion(work):
    aliases=[x for x in work["aliases"] if latin(x) and len(normalize(x))>=5]
    if not aliases:return []
    query=sorted(aliases,key=len,reverse=True)[0]
    doc=get_json(search_url("https://api.dailymotion.com/videos",
      {"search":query+" trailer","fields":"id,title,duration,views_total,url","limit":20}))
    results=[]
    for x in (doc.get("list") or [])[:20]:
        if not isinstance(x,dict):continue
        ident=str(x.get("id") or "");name=str(x.get("title") or "")
        if not DM_ID.fullmatch(ident) or not matches_title(name,aliases,work["year"],work["kind"]):continue
        if not VIDEO_WORDS.search(name):continue
        # Short movie titles are highly ambiguous across films, games and TV.
        # Without a release year, "Runner Runner" or older "Obsession" trailers
        # cannot be safely attached to the 2026 film solely by a word match.
        if work["kind"]=="movie":
            english=work.get("original") or ""
            tokens=re.findall(r"[A-Za-z]+",english)
            generic=(len(tokens)==1 or
                (len(tokens)==2 and tokens[0].casefold()=="the") or
                english.casefold().strip()=="resident evil")
            explicit_years=[int(y) for y in re.findall(r"(?<!\d)(?:19|20)\d{2}(?!\d)",name)]
            if generic and not any(abs(y-work["year"])<=1 for y in explicit_years):continue
        results.append(video_record(work,"dailymotion",ident,name,"Trailer" if TRAILER_WORDS.search(name) else "Related",
          verifiedSource="https://www.dailymotion.com/video/"+ident,
          publisher="Dailymotion",views=x.get("views_total") if isinstance(x.get("views_total"),int) else None))
        if len(results)>=MAX_PER_SOURCE:break
    return results
def parse_kinocheck(work):
    kind=work["kind"];ident=work["tmdb_id"]
    route="movies" if kind=="movie" else "shows"
    doc=get_json(search_url("https://api.kinocheck.com/"+route,{"tmdb_id":ident,"language":"en"}))
    if int(doc.get("tmdb_id") or 0)!=ident:return []
    result=[];seen=set()
    raw=[doc.get("trailer")]+(doc.get("videos") if isinstance(doc.get("videos"),list) else [])
    for x in raw:
        if not isinstance(x,dict):continue
        key=str(x.get("youtube_video_id") or "")
        name=str(x.get("title") or (doc.get("title") or "")+" trailer")
        if not YOUTUBE_ID.fullmatch(key) or key in seen:continue
        if kind=="movie" and ("live.action" in name.lower() or "live-action" in name.lower()) and work["year"]<2023:continue
        if kind=="movie" and work["year"]>1900:
            years=[int(y) for y in re.findall(r"(?:19|20)\d{2}",name)]
            if years and not any(abs(y-work["year"])<=1 for y in years):continue
        # Avoid sequel videos inside a movie's matched KinoCheck recommendations.
        if kind=="movie" and work["year"]<2025 and re.search(r"(?:Moana\s*2(?!\d)|海洋奇缘\s*2(?!\d))",name,re.I):continue
        seen.add(key)
        cats=x.get("categories") or []
        label="Trailer" if (TRAILER_WORDS.search(name) or any(c in ("Trailer","Teaser") for c in cats)) else "Clip"
        result.append({"platform":"youtube","id":key,"title":name[:145],
          "type":label,"official":x.get("official") is True,"kind":kind,"tmdbId":ident,
          "year":work["year"],"verifiedByTitleId":True,"verifiedBy":"KinoCheck",
          "url":"https://www.youtube.com/watch?v="+key})
        if len(result)>=10:break
    return result
def catalog():
    doc=json.loads(CATALOG.read_text(encoding="utf8"))
    works={}
    for row in (doc.get("works") or {}).values():
        if not isinstance(row,dict) or row.get("kind") not in ("movie","tv"):continue
        try:mid=int(row.get("tmdb_id") or 0)
        except(ValueError,TypeError):continue
        if mid<1:continue
        year=int(str(row.get("date") or "0")[:4]) if re.fullmatch(r"\d{4}",str(row.get("date") or "")[:4]) else 0
        if year<1900:continue
        title=str(row.get("title") or "").strip()
        original=str(row.get("original_title") or "").strip()
        if not title:continue
        aliases=list(dict.fromkeys([title,original]))
        works[f"{row['kind']}:{mid}"]={"kind":row["kind"],"tmdb_id":mid,"title":title,
          "original":original,"aliases":[a for a in aliases if a],"year":year}
    return works
def main():
    works=catalog()
    try:previous=json.loads(OUT.read_text(encoding="utf8"))
    except (OSError,ValueError):previous={}
    olditems=previous.get("items") or {}
    items={key:row for key,row in olditems.items() if isinstance(row,dict) and key in works}
    limit=max(1,min(18,int(os.getenv("EXTRA_VIDEOS_BATCH","10"))))
    priority=["tv:220542","movie:277834","movie:299534"]
    chosen=[k for k in priority if k in works and k not in items]
    chosen=chosen[:limit]
    # Re-check already-cached ambiguous English movie titles first, so that
    # stricter matching rules promptly clear old false positives (e.g. Runner
    # vs Runner Runner) instead of leaving them in the gallery for days.
    def ambiguous_cached(k):
        w=works[k]
        if w["kind"]!="movie":return False
        tokens=re.findall(r"[A-Za-z]+",w.get("original") or "")
        generic=(len(tokens)==1 or
            (len(tokens)==2 and tokens[0].casefold()=="the") or
            (w.get("original") or "").casefold().strip()=="resident evil")
        return generic and any(v.get("platform")=="dailymotion"
            for v in items.get(k,{}).get("videos",[]) if isinstance(v,dict))
    # Then oldest first; works with empty matches still get their turn.
    other=sorted((k for k in works if k not in chosen),
        key=lambda k:(0 if ambiguous_cached(k) else 1,str(items.get(k,{}).get("checkedAt") or ""),k))
    chosen.extend(other[:max(0,limit-len(chosen))])
    for key in chosen:
        work=works[key];prev=items.get(key,{})
        videos=[];youtube=[]
        source_status={}
        for source,parser in (("KinoCheck",parse_kinocheck),("AcFun",parse_acfun),
                              ("Niconico",parse_niconico),("Dailymotion",parse_dailymotion)):
            try:
                rows=parser(work)
                if source=="KinoCheck":youtube=rows
                else:videos.extend(rows)
                source_status[source]="ok" if rows else "empty"
            except Exception as exc:
                source_status[source]="unavailable:"+type(exc).__name__
            time.sleep(1)
        # Preserve old entries only when that specific source is unavailable.
        # A successful search returning no matching results must remove old
        # false positives rather than resurrect them from the previous cache.
        if source_status.get("KinoCheck","").startswith("unavailable"):
            youtube=prev.get("youtubeTrailers") or []
        providers={"AcFun":"acfun","Niconico":"niconico","Dailymotion":"dailymotion"}
        for label,platform in providers.items():
            if source_status.get(label,"").startswith("unavailable"):
                videos.extend(v for v in (prev.get("videos") or [])
                  if isinstance(v,dict) and v.get("platform")==platform)
        dedup={v["platform"]+":"+v["videoId"]:v for v in videos if isinstance(v,dict) and v.get("videoId")}
        items[key]={"title":work["title"],"kind":work["kind"],"tmdbId":work["tmdb_id"],
          "year":work["year"],"checkedAt":utc(),
          "videos":list(dedup.values())[:15],"youtubeTrailers":youtube[:10],"sources":source_status}
        print("EXTRA_VIDEO_RESULT",json.dumps({"key":key,"title":work["title"],"videos":len(dedup),
          "youtube":len(youtube),"sources":source_status,"samples":[{"platform":r.get("platform"),"id":r.get("videoId"),"name":r.get("name")} for r in list(dedup.values())[:3]]},ensure_ascii=False),flush=True)
    if len(items)>MAX_ITEMS:
        items=dict(sorted(items.items(),key=lambda pair:pair[1].get("checkedAt",""),reverse=True)[:MAX_ITEMS])
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"schema":1,"updatedAt":utc(),"items":items},ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf8")
    print("EXTRA_VIDEO_SUMMARY",json.dumps({"works":len(works),"refreshed":len(chosen),"cached":len(items),"with_sources":sum(bool(r.get("videos") or r.get("youtubeTrailers")) for r in items.values())},ensure_ascii=False))
if __name__=="__main__":main()

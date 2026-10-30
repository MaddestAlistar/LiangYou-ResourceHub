#!/usr/bin/env python3
"""Independent read-only check: KinoCheck, AcFun, Dailymotion, Niconico.

No credentials, no video downloads, no site edits, no retries. Reports actual HTTP
status and modestly-sized video metadata, not video-playback success.
"""
import datetime
import gzip
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

OUTPUT=Path("video-four-sources-report.json")
UA="LiangYou-MovieVideoProbe/1.0 (research only; one request per URL)"
REPORT={"at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "authenticated":False,"low_frequency":True,"results":[]}
def fetch(url, language="en-US"):
    request=urllib.request.Request(url,headers={
        "Accept":"application/json,text/html;q=0.9,*/*;q=0.8",
        "Accept-Language":language,
        "User-Agent":UA,
    })
    try:
        with urllib.request.urlopen(request,timeout=22) as response:
            payload=response.read(700000)
            if response.headers.get("Content-Encoding")=="gzip":
                payload=gzip.decompress(payload)
            decoded=payload.decode("utf-8","replace")
            ct=response.headers.get("Content-Type","")
            try: obj=json.loads(decoded)
            except (ValueError,TypeError): obj=None
            return {"http_status":response.status, "content_type":ct,
                    "final_host":urllib.parse.urlsplit(response.url).hostname,
                    "data":obj,"body_sample":decoded[:230] if obj is None else None}
    except urllib.error.HTTPError as ex:
        return {"http_status":ex.code,"content_type":ex.headers.get("Content-Type",""),
                "final_host":urllib.parse.urlsplit(ex.url).hostname,
                "body_sample":ex.read(250).decode("utf8","replace")}
    except Exception as ex:
        return {"http_status":None,"error":type(ex).__name__+": "+str(ex)[:200]}

def scan_lists(obj, keys=("list","data","items","results","result","videoList","video_list","videos","videoListData")):
    if isinstance(obj,list): return obj
    if isinstance(obj,dict):
        for key in keys:
            if isinstance(obj.get(key),list): return obj[key]
        for key in ("data","result","payload","dataInfo","videoList"):
            if isinstance(obj.get(key),dict):
                found=scan_lists(obj[key],keys)
                if found is not None:return found
    return None

def summarize(name, label, url, kind="list", language="en-US"):
    print("PROBING",name,label,flush=True)
    resp=fetch(url,language)
    raw=resp.pop("data",None)
    row={"source":name,"test":label,"endpoint":url,**resp}
    if isinstance(raw,dict):
        row["json_keys"]=list(raw.keys())[:20]
        if name=="KinoCheck":
            vid=raw.get("videos")
            trailer=raw.get("trailer")
            row.update({"tmdb_id":raw.get("tmdb_id"),"title":raw.get("title"),
                        "video_count":len(vid) if isinstance(vid,list) else None,
                        "trailer_id":trailer.get("youtube_video_id") if isinstance(trailer,dict) else None,
                        "sample_videos":[{"title":x.get("title"),"youtube_video_id":x.get("youtube_video_id"),
                                          "category":x.get("categories")} for x in (vid or [])[:4] if isinstance(x,dict)] if isinstance(vid,list) else []})
        else:
            v=scan_lists(raw)
            row["found_list"]=v is not None
            row["result_count"]=len(v) if isinstance(v,list) else None
            row["sample_videos"]=[{"title":x.get("title") or x.get("name") or x.get("contentTitle"),
                                   "id":x.get("id") or x.get("contentId") or x.get("dougaId") or x.get("videoId"),
                                   "views":x.get("viewCounter") or x.get("views_total") or x.get("viewCount"),
                                   "embed_url":x.get("embed_url")} for x in v[:5] if isinstance(x,dict)] if isinstance(v,list) else []
            row["totalCount"]=raw.get("meta",{}).get("totalCount") if isinstance(raw.get("meta"),dict) else raw.get("total")
            if isinstance(raw.get("error"),dict):
                row["api_error"]=str(raw["error"])[:240]
    elif isinstance(raw,list):
        row["result_count"]=len(raw)
        row["sample_videos"]=raw[:2]
    else:
        row["has_json"]=False
    REPORT["results"].append(row)
    OUTPUT.write_text(json.dumps(REPORT,ensure_ascii=False,indent=2),encoding="utf8")
    print("RESULT",json.dumps({k:v for k,v in row.items() if k not in ("endpoint","body_sample","sample_videos")},ensure_ascii=False),flush=True)
    if row.get("sample_videos"):
        print("EXAMPLES",json.dumps(row["sample_videos"][:3],ensure_ascii=False),flush=True)
    time.sleep(6)
    return row

def qs(base,params):
    return base+"?"+urllib.parse.urlencode(params)

def main():
    # KinoCheck: authoritative ID matching; Moana (2016) and known valid Avengers movie
    summarize("KinoCheck","Moana_2016_tmdb_277834",qs("https://api.kinocheck.com/movies",{"tmdb_id":277834,"language":"en"}))
    summarize("KinoCheck","Endgame_tmdb_299534_control",qs("https://api.kinocheck.com/movies",{"tmdb_id":299534,"language":"en"}))
    # AcFun: candidate unauthenticated web search, plus public search HTML fallback.
    summarize("AcFun","Moana_web_search_API",qs("https://www.acfun.cn/rest/pc-direct/search/video",{"keyword":"海洋奇缘","page":1,"pageSize":10}),language="zh-CN")
    summarize("AcFun","film_trailer_web_search",qs("https://www.acfun.cn/search",{"keyword":"电影预告"}),language="zh-CN")
    # Dailymotion: v0 legacy search vs newer v2 auth/no-auth availability
    summarize("Dailymotion","Moana_trailer_legacy_public",qs("https://api.dailymotion.com/videos",{"search":"Moana trailer","fields":"id,title,duration,views_total,url","limit":10}))
    summarize("Dailymotion","Apothecary_Diaries_legacy_public",qs("https://api.dailymotion.com/videos",{"search":"The Apothecary Diaries trailer","fields":"id,title,duration,views_total,url","limit":10}))
    summarize("Dailymotion","v2_video_public_auth_check",qs("https://api.dailymotion.com/v2/profiles/xiy/videos",{"fields":"title,video_id","page":1,"page_size":1}))
    # Niconico publicly documented snapshot v2. No OAuth key required.
    params={"q":"薬屋のひとりごと","targets":"title,description,tags",
            "fields":"contentId,title,description,viewCounter,startTime",
            "_sort":"-viewCounter","_limit":10,"_context":"LiangYouMovieVideoProbe"}
    summarize("Niconico","Apothecary_Diaries_Japanese",qs("https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search",params),language="ja-JP")
    params["q"]="モアナ"
    summarize("Niconico","Moana_Japanese",qs("https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search",params),language="ja-JP")
    REPORT["completed"]=True
    OUTPUT.write_text(json.dumps(REPORT,ensure_ascii=False,indent=2),encoding="utf8")
if __name__=="__main__":main()

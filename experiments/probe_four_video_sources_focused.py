#!/usr/bin/env python3
"""Second-stage focused film-video and embed-document diagnostics.

Tests page accessibility only; never asserts HTML 200 means playback.
"""
import datetime
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPORT={"at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"results":[],
        "scope":"public API plus embed document availability; NOT actual video playback"}
OUT=Path("video-four-sources-focused-report.json")
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"

def go(name, label, url):
    req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"application/json,text/html;q=0.9,*/*;q=0.7"})
    try:
        with urllib.request.urlopen(req,timeout=20) as resp:
            html=resp.read(550000).decode("utf8","replace")
            mime=resp.headers.get("Content-Type","")
            try:data=json.loads(html)
            except ValueError:data=None
            info={"status":resp.status,"mime":mime,"final_host":urllib.parse.urlsplit(resp.url).hostname}
    except urllib.error.HTTPError as ex:
        data=None
        info={"status":ex.code,"mime":ex.headers.get("Content-Type",""),"error":ex.read(180).decode("utf8","replace")}
        html=""
    except Exception as ex:
        data=None
        info={"status":None,"error":type(ex).__name__+": "+str(ex)[:180]}
        html=""
    item={"source":name,"test":label,**info}
    if isinstance(data,dict):
        item["keys"]=list(data)[:15]
        items=data.get("videoList") or data.get("data") or data.get("list")
        if isinstance(items,list):
            item["count"]=len(items)
            item["sample"]=[{"id":x.get("dougaId") or x.get("contentId") or x.get("id"),
                             "title":x.get("title") or x.get("contentTitle"),
                             "views":x.get("viewCounter") or x.get("viewCount")} for x in items[:6] if isinstance(x,dict)]
        elif name=="Dailymotion":
            item["video_title"]=data.get("title")
            item["video_id"]=data.get("id")
            item["owner"]=data.get("owner")
            item["duration"]=data.get("duration")
    elif html:
        item["page_title"]=(re.search(r"<title[^>]*>([^<]{0,150})</title>",html,re.I) or [None,None])[1]
        item["has_video_marker"]=any(x in html.lower() for x in ("video", "player", "stream"))
        item["blocked_or_login"]=any(x in html.lower() for x in ("access denied", "forbidden", "captcha", "login required"))
        item["html_length"]=len(html)
    REPORT["results"].append(item)
    OUT.write_text(json.dumps(REPORT,ensure_ascii=False,indent=2),encoding="utf8")
    print("RESULT",json.dumps(item,ensure_ascii=False)[:1800],flush=True)
    time.sleep(5)

def query(base,p):
    return base+"?"+urllib.parse.urlencode(p)

def main():
    go("AcFun","Moana_trailer_query",query("https://www.acfun.cn/rest/pc-direct/search/video",{"keyword":"海洋奇缘 预告","page":1,"pageSize":10}))
    go("AcFun","Apothecary_query",query("https://www.acfun.cn/rest/pc-direct/search/video",{"keyword":"药屋少女的呢喃","page":1,"pageSize":10}))
    go("Niconico","Apothecary_PV_precise",query("https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search",{"q":"薬屋のひとりごと PV","targets":"title","fields":"contentId,title,viewCounter,startTime","_sort":"-viewCounter","_limit":10,"_context":"LiangYouVideoProbe"}))
    go("Niconico","Moana_full_Japanese_title",query("https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search",{"q":"モアナと伝説の海","targets":"title","fields":"contentId,title,viewCounter,startTime","_sort":"-viewCounter","_limit":10,"_context":"LiangYouVideoProbe"}))
    go("Dailymotion","Known_search_result_metadata", "https://api.dailymotion.com/video/x8mcq94?fields=id,title,owner,duration,views_total")
    # Document-level checks, not evidence that media segments play
    go("AcFun","public_embed_html", "https://www.acfun.cn/player/ac26067614")
    go("Niconico","public_embed_html", "https://embed.nicovideo.jp/watch/sm42955152")
    # Docs' example Player ID for test only; NOT an owned player ID for production.
    go("Dailymotion","documented_example_player_html", "https://geo.dailymotion.com/player/x8lr5.html?video=x8mcq94")
    REPORT["completed"]=True
    OUT.write_text(json.dumps(REPORT,ensure_ascii=False,indent=2),encoding="utf8")
if __name__=="__main__":main()

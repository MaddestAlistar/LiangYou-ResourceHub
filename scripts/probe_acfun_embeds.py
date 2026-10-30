#!/usr/bin/env python3
"""Read-only public AcFun embed and HTML5 metadata check.

Only logs response status, embed-protection headers and metadata presence;
does not download any video, proxy streams, or print signed playback URLs.
"""
import json
import re
import urllib.request
import urllib.error
import urllib.parse
from urllib.parse import urlsplit

VIDEO="41787132"
URLS={
 "official_player":f"https://www.acfun.cn/player/ac{VIDEO}",
 "mobile_page":f"https://m.acfun.cn/v/?ac={VIDEO}",
 "desktop_page":f"https://www.acfun.cn/v/ac{VIDEO}",
 "quick_video_info":f"https://www.acfun.cn/v/ac{VIDEO}?quickViewId=videoInfo_new&ajaxpipe=1",
 "ajax_video_info":f"https://www.acfun.cn/v/ac{VIDEO}?quickViewId=videoInfo_new&ajaxpipe=1",
}
HEADERS={"User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
 "Accept":"text/html,application/xhtml+xml,application/json",
 "Accept-Language":"zh-CN,zh;q=0.9"}


def fetch(name,url):
    custom_headers=dict(HEADERS)
    if name=="ajax_video_info":
        custom_headers["User-Agent"]="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        custom_headers["Accept"]="*/*"
        custom_headers["X-Requested-With"]="XMLHttpRequest"
        custom_headers["Referer"]=f"https://www.acfun.cn/v/ac{VIDEO}"
    request=urllib.request.Request(url,headers=custom_headers)
    try:
        with urllib.request.urlopen(request,timeout=14) as response:
            body=response.read(1500000).decode("utf-8","replace")
            heads=response.headers
            print(name,"status",response.status,"x-frame-options",heads.get("X-Frame-Options","-"),
                  "csp",str(heads.get("Content-Security-Policy","-"))[:200],
                  "content-type",heads.get("Content-Type","-"),"length",len(body))
            return body
    except urllib.error.HTTPError as exc:
        print(name,"status",exc.code,"XFO",exc.headers.get("X-Frame-Options","-"),
            "CSP",str(exc.headers.get("Content-Security-Policy","-"))[:140])
        return ""
    except Exception as exc:
        print(name,"error",type(exc).__name__)
        return ""


def report_streams(markup):
    if not markup:return
    try:
        outer=json.loads(markup)
        print("ajax_json_keys",sorted(outer.keys())[:10])
        markup=outer.get("html") or markup
    except (ValueError,AttributeError):
        pass
    print("page_info_pattern_present",bool(re.search(r"window\.pageInfo\s*=",markup)))
    print("ksplay_embedded",bool(re.search("ksPlayJson",markup)))
    marker=re.search(r"window\.pageInfo\s*=\s*(?:window\.videoInfo\s*=\s*)?",markup)
    if not marker:return
    content=markup[marker.end():]
    script_end=content.find("</script>")
    if script_end>=0:content=content[:script_end]
    content=content.strip().rstrip(";").strip()
    try:
        d=json.loads(content)
        print("page_info_json_keys",sorted(d.keys())[:20])
        current=d.get("currentVideoInfo") or {}
        print("current_video_keys",sorted(current.keys())[:20])
        kp=current.get("ksPlayJson")
        print("ksplay_value",type(kp).__name__,len(kp) if isinstance(kp,str) else 0)
        obj=json.loads(kp) if isinstance(kp,str) else kp
        if not isinstance(obj,dict):return
        data=obj.get("data") if isinstance(obj.get("data"),dict) else obj
        arr=data.get("adaptationSet") or []
        if isinstance(arr,dict):arr=[arr]
        result=[(a.get("representation") or []) for a in arr if isinstance(a,dict)]
        print("ksplay_present",True,"representation_count",sum(map(len,result)))
        for rep in result[:1]:
            for row in rep[:3]:
                uri=str(row.get("url",""))
                bits=urlsplit(uri)
                print("representation",{"host":bits.hostname,
                      "path_ext":bits.path.rsplit(".",1)[-1] if "." in bits.path else "-",
                      "has_query":bool(bits.query),"quality":row.get("qualityType")})
                if uri:
                    request=urllib.request.Request(uri,headers={"User-Agent":HEADERS["User-Agent"],"Range":"bytes=0-128","Origin":"https://maddestalistar.github.io"})
                    try:
                        with urllib.request.urlopen(request,timeout=8) as response:
                            print("media_probe",response.status,"content_type",response.headers.get("Content-Type"),
                                  "cors",response.headers.get("Access-Control-Allow-Origin","-"),
                                  "bytes",len(response.read(128)))
                    except urllib.error.HTTPError as exc:
                        print("media_probe_http",exc.code)
                    except Exception as exc:
                        print("media_probe_error",type(exc).__name__)
                    return
    except Exception as exc:
        print("page_info_parse",type(exc).__name__,str(exc)[:100])
def probe_bilibili_covers():
    # Check the three already verified metadata covers; no image downloads.
    url="https://i1.hdslb.com/bfs/archive/3bb32693eb30498f4510c53716b11fcb6aab30bf.jpg"
    for ref in (None, "https://www.bilibili.com/"):
        headers={"User-Agent":"Mozilla/5.0","Accept":"image/avif,image/webp,image/jpeg,*/*"}
        if ref:headers["Referer"]=ref
        req=urllib.request.Request(url,method="HEAD",headers=headers)
        try:
            with urllib.request.urlopen(req,timeout=12) as response:
                print("bilibili_cover HEAD",{"referrer":bool(ref),"status":response.status,
                    "content_type":response.headers.get("Content-Type"),
                    "length":response.headers.get("Content-Length")})
        except urllib.error.HTTPError as exc:
            print("bilibili_cover HEAD",{"referrer":bool(ref),"status":exc.code})
        except Exception as exc:
            print("bilibili_cover HEAD",{"referrer":bool(ref),"error":type(exc).__name__})

if __name__=="__main__":
    pages={name:fetch(name,url) for name,url in URLS.items()}
    quick=pages.get("quick_video_info","")
    print("quick_video_info markers",
          {"pageInfo": "window.pageInfo" in quick,
           "videoInfo": "window.videoInfo" in quick,
           "ksPlayJson": "ksPlayJson" in quick,
           "access_denied":any(term in quick.lower() for term in ("access denied","forbidden","access control"))})
    for name,body in pages.items():
        if name.endswith("page") or name=="ajax_video_info":
            print("checking",name)
            report_streams(body)

    probe_bilibili_covers()

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
 "ajax_video_info":f"https://www.acfun.cn/v/ac{VIDEO}?quickViewId=videoInfo_new&ajaxpipe=1",
}
HEADERS={"User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
 "Accept":"text/html,application/xhtml+xml,application/json",
 "Accept-Language":"zh-CN,zh;q=0.9"}


def fetch(name,url):
    request=urllib.request.Request(url,headers=HEADERS)
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
    print("page_info_pattern_present",bool(re.search(r"window\.pageInfo\s*=",markup)))
    patterns=[
      r'window\\.pageInfo\\s*=\\s*window\\.videoInfo\\s*=\\s*(\\{[\\s\\S]{1,800000}?\\})\\s*</script>',
      r'window\.pageInfo\s*=\s*(\{[\s\S]{1,800000}?\})\s*;',
      r'<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)</script>'
    ]
    for pat in patterns:
        m=re.search(pat,markup)
        if not m:continue
        try:
            d=json.loads(m.group(1))
            print("page_info_json_keys",sorted(d.keys())[:16])
            candidates=[d,d.get("currentVideoInfo") or {}]
            for candidate in candidates:
                kp=candidate.get("ksPlayJson") if isinstance(candidate,dict) else None
                if kp:
                    obj=json.loads(kp) if isinstance(kp,str) else kp
                    manifest=obj.get("adaptationSet") or obj.get("data",{}).get("adaptationSet") or []
                    result=[(a.get("representation") or []) for a in manifest if isinstance(a,dict)]
                    print("ksplay_present",True,"representation_count",sum(map(len,result)))
                    for rep in result[:1]:
                        for row in rep[:2]:
                            uri=str(row.get("url",""))
                            bits=urlsplit(uri)
                            print("representation",{"host":bits.hostname,"path_ext":bits.path.rsplit(".",1)[-1] if "." in bits.path else "-",
                                  "has_query":bool(bits.query),"quality":row.get("qualityType")})
                    return
        except Exception as e:
            print("page_info_parse",type(e).__name__)
    print("ksplay_embedded",bool(re.search("ksPlayJson",markup)))
    print("video_info_script",bool(re.search("window.videoInfo",markup)))
if __name__=="__main__":
    pages={name:fetch(name,url) for name,url in URLS.items()}
    for name,body in pages.items():
        if name.endswith("page") or name=="ajax_video_info":
            print("checking",name)
            report_streams(body)

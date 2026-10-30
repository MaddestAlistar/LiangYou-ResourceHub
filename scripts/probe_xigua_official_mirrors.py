#!/usr/bin/env python3
"""No-cost, no-secret official cross-platform link check for existing Xigua IDs.
Never infer equivalent identity from matching numeric IDs alone.
"""
import urllib.request,urllib.error,re,html
samples={"cyberpunk":"7127120516426662408","detective":"7123957398770811429"}
hosts={
"xigua-page":"https://www.ixigua.com/{id}",
"toutiao-video":"https://www.toutiao.com/video/{id}/",
"m-toutiao":"https://m.toutiao.com/video/{id}/",
"douyin-video":"https://www.douyin.com/video/{id}",
"douyin-jingxuan":"https://www.douyin.com/jingxuan/video/{id}",
}
for label,vid in samples.items():
    for name,url_template in hosts.items():
        url=url_template.format(id=vid)
        req=urllib.request.Request(url,headers={
            "User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
            "Accept":"text/html,application/xhtml+xml"})
        try:
            with urllib.request.urlopen(req,timeout=13) as r:
                body=r.read(70000).decode("utf-8","replace")
                match=re.search(r"<title[^>]*>([^<]{1,200})</title>",body,re.I)
                title=html.unescape(match.group(1) if match else "").strip()[:90]
                video_visible=bool("赛博朋克" in body or "侦探已经死了" in body)
                print("XIGUA_OFFICIAL_MIRROR",label,name,r.status,
                      "host",urllib.parse.urlsplit(r.url).hostname,
                      "type",r.headers.get("Content-Type","")[:45],
                      "video_title_match",video_visible,
                      "title",title,flush=True)
        except urllib.error.HTTPError as e:
            print("XIGUA_OFFICIAL_MIRROR",label,name,"http",e.code,flush=True)
        except Exception as e:
            print("XIGUA_OFFICIAL_MIRROR",label,name,"error",type(e).__name__,flush=True)

#!/usr/bin/env python3
"""Public search-index feasibility probe for Douyin Jingxuan video discovery.

No Douyin restricted search API, cookies, passwords, scraping bypass, or keys.
The probe only collects video-page IDs exposed in ordinary public web indexes.
"""
from __future__ import annotations
import html, json, re, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from html.parser import HTMLParser

QUERIES=[
    "site:jingxuan.douyin.com/m/video/ 赛博朋克 边缘行者 预告",
    "site:jingxuan.douyin.com/m/video/ 熊出没 我们 预告",
    "site:jingxuan.douyin.com/m/video/ 动画 预告",
]
ID=re.compile(r"(?:jingxuan\.douyin\.com|www\.douyin\.com)/(?:m/)?video/([1-9]\d{14,20})")
class Links(HTMLParser):
    def __init__(self):super().__init__();self.urls=[]
    def handle_starttag(self,tag,attrs):
        if tag!="a":return
        d=dict(attrs);href=d.get("href")
        if href:self.urls.append(html.unescape(href))
def search_urls(engine,query):
    q=urllib.parse.quote(query)
    if engine=="bingrss":url="https://www.bing.com/search?format=rss&q="+q
    elif engine=="bing":url="https://www.bing.com/search?q="+q
    elif engine=="google":url="https://www.google.com/search?q="+q+"&num=15"
    elif engine=="ddg":url="https://html.duckduckgo.com/html/?q="+q
    else:raise ValueError(engine)
    req=urllib.request.Request(url,headers={
        "User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36",
        "Accept":"text/html,application/xhtml+xml,application/rss+xml,application/xml"})
    with urllib.request.urlopen(req,timeout=17) as r:
        raw=r.read(300_000).decode("utf-8","replace")
        final=r.url
        status=r.status
    urls=[]
    if engine=="bingrss":
        root=ET.fromstring(raw)
        for item in root.findall(".//item"):
            urls.extend([(item.findtext("link") or ""), (item.findtext("description") or "")])
    else:
        parser=Links()
        parser.feed(raw)
        urls=parser.urls[:150]
    ids=[]
    for source in [raw[:250000]]+urls:
        unwrapped=html.unescape(urllib.parse.unquote(source))
        for match in ID.findall(unwrapped):
            if match not in ids:ids.append(match)
    return {"http":status,"final_host":urllib.parse.urlsplit(final).hostname,
            "chars":len(raw),"links":len(urls),"ids":ids[:12],
            "head":raw[:70].replace("\n"," ")}

for query in QUERIES:
    for engine in ("bingrss","bing","google","ddg"):
        try:
            row=search_urls(engine,query)
            print("DOUYIN_PUBLIC_SEARCH",json.dumps({
                "engine":engine,"term":query.split(" ",1)[1][:36],**row
            },ensure_ascii=False),flush=True)
        except Exception as e:
            print("DOUYIN_PUBLIC_SEARCH_ERROR",engine,type(e).__name__,
                  getattr(e,"code",None),flush=True)

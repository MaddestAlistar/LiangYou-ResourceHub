#!/usr/bin/env python3
"""Check whether Xigua matched IDs are officially embeddable via Douyin migration.
Does not touch SandBase, credentials or any protected media URLs.
"""
import json, urllib.parse, urllib.request, urllib.error

samples={
 "cyberpunk":"7127120516426662408",
 "cyberpunk2":"7107073545662005771",
 "detective":"7123957398770811429",
 "terminal-list":"7116171226090996238",
 "official-xigua-example":"6803260807372079623",
 "verified-douyin-jingxuan-video":"7140302841666686239",
 "verified-douyin-2026":"7696680395005250856",
}
for label,ident in samples.items():
    url="https://open.douyin.com/api/douyin/v1/video/get_iframe_by_video?video_id="+ident
    req=urllib.request.Request(url,headers={
        "User-Agent":"Mozilla/5.0 (compatible; LiangYou-ResourceHub/1.0)",
        "Accept":"application/json"})
    try:
        with urllib.request.urlopen(req,timeout=13) as response:
            content_type=response.headers.get("Content-Type","?")
            raw=response.read(15000)
            if "json" not in content_type.lower():
                print("XIGUA_DOUYIN_API",label,ident,response.status,
                      "non_json",content_type,flush=True)
                continue
            data=json.loads(raw)
            payload=data.get("data") if isinstance(data,dict) else None
            embed=(payload or {}).get("iframe_code","") if isinstance(payload,dict) else ""
            name=(payload or {}).get("video_title","") if isinstance(payload,dict) else ""
            print("XIGUA_DOUYIN_API",label,ident,
                  "status",response.status,"err_no",data.get("err_no"),
                  "iframe",bool(embed and "open.douyin.com/player/video" in embed),
                  "title",str(name)[:80],flush=True)
    except urllib.error.HTTPError as e:
        print("XIGUA_DOUYIN_API",label,ident,"http",e.code,flush=True)
    except Exception as e:
        print("XIGUA_DOUYIN_API",label,ident,"error",type(e).__name__,flush=True)

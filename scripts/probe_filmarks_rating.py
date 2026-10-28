#!/usr/bin/env python3
"""Minimal public Filmarks check, no authentication or traffic circumvention."""
import json,re,urllib.error,urllib.request
cases=[
("filmarks_public_movie","https://filmarks.com/movies/14348"),
("filmarks_home","https://filmarks.com/"),
("markuapi_primary","https://markuapi.apn.leapcell.app/movies/14348"),
("markuapi_vercel","https://markuapi.vercel.app/movies/14348"),
("markuapi_alt","https://markuapi.kabk.dev/movies/14348")
]
for label,url in cases:
    req=urllib.request.Request(url,headers={"User-Agent":"LiangYou-Film-Research/1.0","Accept":"text/html,application/json"})
    try:
        with urllib.request.urlopen(req,timeout=18) as r:code=r.status;ct=r.headers.get("content-type","");body=r.read(400000).decode("utf-8","replace")
    except urllib.error.HTTPError as e:code=e.code;ct=e.headers.get("content-type","");body=e.read(10000).decode("utf-8","replace")
    except Exception as e:
        print("FILMARKS_CHECK "+json.dumps({"name":label,"http":None,"reason":type(e).__name__}),flush=True);continue
    data=None
    try:data=json.loads(body)
    except Exception:pass
    out={"name":label,"http":code,"bytes":len(body),"contentType":ct[:50],"json":isinstance(data,(list,dict))}
    if isinstance(data,dict):
        out["keys"]=list(data)[:12]
        for k in ("title","name","rating","score"):
            if isinstance(data.get(k),(str,int,float)):out[k]=data[k]
    elif "filmarks" in label:
        title=re.search(r"<title[^>]*>(.*?)</title>",body,re.I|re.S)
        out["title"]=re.sub(r"\s+"," ",title.group(1))[:85] if title else None
        out["jsonLdRating"]=[]
        for match in re.findall(r"<script[^>]+type=['\"]application/ld\+json['\"][^>]*>(.*?)</script>",body,re.I|re.S):
            try:
                obj=json.loads(match)
                if isinstance(obj,dict) and obj.get("aggregateRating"):
                    ag=obj["aggregateRating"]
                    out["jsonLdRating"].append({"ratingValue":ag.get("ratingValue"),"ratingCount":ag.get("ratingCount")})
            except Exception:pass
        out["htmlScoreHints"]={"review-score":body.find("review-score")>=0,"ratingValue":body.find("ratingValue")>=0}
    print("FILMARKS_CHECK "+json.dumps(out,ensure_ascii=False),flush=True)

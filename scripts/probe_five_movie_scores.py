#!/usr/bin/env python3
"""Research 5 independently queried film rating sources, low-volume public reads.
Never print API keys, full authenticated URLs, tokens, raw response bodies, or cookies.
"""
import json,os,urllib.request,urllib.error,urllib.parse
def fetch(url,headers=None,timeout=18):
    req=urllib.request.Request(url,headers={"User-Agent":"LiangYou-Film-Research/1.0","Accept":"application/json",**(headers or {})})
    try:
        with urllib.request.urlopen(req,timeout=timeout) as r:
            code=r.status
            body=r.read(350000)
            ct=r.headers.get("content-type","")
    except urllib.error.HTTPError as e:
        code=e.code
        body=e.read(35000)
        ct=e.headers.get("content-type","")
    except Exception as e:
        return {"http":None,"errorType":type(e).__name__}
    try:
        obj=json.loads(body)
    except Exception:
        return {"http":code,"json":False,"contentType":ct[:65]}
    return {"http":code,"json":True,"body":obj}
def send(provider,label,result):
    out={k:v for k,v in result.items() if k!="body"}
    data=result.get("body")
    out.update({"provider":provider,"sample":label})
    if isinstance(data,dict):
        out["keys"]=list(data)[:16]
        # Never include server-provided raw error text, URLs, or API credentials.
        if provider=="simkl":
            s=data.get("simkl")
            out["id"]=data.get("id")
            out["rating"]=s.get("rating") if isinstance(s,dict) else None
            out["votes"]=s.get("votes") if isinstance(s,dict) else None
            out["hasUrl"]=isinstance(data.get("link"),str) and data["link"].startswith("https://simkl.com")
        elif provider=="kitsu":
            d=data.get("data") or {}
            a=d.get("attributes") or {} if isinstance(d,dict) else {}
            out["id"]=d.get("id") if isinstance(d,dict) else None
            out["title"]=a.get("canonicalTitle")
            out["rating"]=a.get("averageRating")
            out["ratingCount"]=a.get("userCount")
        elif provider=="bilibili":
            d=data.get("result") or {}
            s=d.get("rating") or {}
            out["businessCode"]=data.get("code")
            out["title"]=d.get("title")
            out["seasonId"]=d.get("season_id")
            out["rating"]=s.get("score") if isinstance(s,dict) else None
            out["count"]=s.get("count") if isinstance(s,dict) else None
        elif provider=="mydramalist":
            out["title"]=data.get("title") or data.get("name")
            out["rating"]=data.get("rating")
            out["ratings"]=data.get("ratings") if isinstance(data.get("ratings"),(int,float,str)) else None
            out["errorFlag"]=data.get("error")
        elif provider=="filmarks":
            if label=="openapi":
                paths=data.get("paths") or {}
                out["pathSample"]=list(paths)[:25]
                out["ratingRouteCandidates"]=[x for x in paths if "movie" in x or "anime" in x or "drama" in x][:25]
            else:
                out["valueType"]=type(data).__name__
                for k in ("title","name","rating","score","review_count","count","id"):
                    if k in data and isinstance(data[k],(str,int,float)):
                        out[k]=data[k]
                if isinstance(data.get("results"),list):
                    out["resultCount"]=len(data["results"])
    print("FIVE_RATING_PROBE "+json.dumps(out,ensure_ascii=False,default=str),flush=True)

client=next((os.environ.get(k,"").strip() for k in ["SIMKL_CLIENT_ID_V2","SIMKL_V2_CLIENT_ID","SIMKL_CLIENT_ID","SIMKL_CLIENT_KEY","SIMKL_API_KEY","SIMKL_PUBLIC_VAR","SIMKL_V2_PUBLIC_VAR"] if os.environ.get(k,"").strip()),"")
if client:
    params=urllib.parse.urlencode({"simkl":"10280","fields":"simkl,ext,year","client_id":client})
    send("simkl","10280",fetch("https://api.simkl.com/ratings?"+params,headers={"simkl-api-key":client}))
else:send("simkl","10280",{"configured":False})
for host in ["https://kitsu.io","https://kitsu.app"]:
    send("kitsu",host,fetch(host+"/api/edge/anime/1",headers={"Accept":"application/vnd.api+json"}))
for ssid in [26801,42290]:
    send("bilibili",str(ssid),fetch("https://api.bilibili.com/pgc/view/web/season?season_id="+str(ssid),timeout=15))
send("mydramalist","58651-run-on",fetch("https://my-drama-list-api-ten.vercel.app/api/id/58651-run-on",timeout=25))
for host in ["https://markuapi.apn.leapcell.app","https://markuapi.vercel.app"]:
    send("filmarks","openapi",fetch(host+"/openapi.json",timeout=18))

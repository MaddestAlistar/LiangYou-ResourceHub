#!/usr/bin/env python3
"""Read-only, low-volume Chinese film API connectivity catalog; no credentials."""
import concurrent.futures
import datetime
import json
import pathlib
import urllib.error
import urllib.parse
import urllib.request
import time

UA="LiangYou-ResourceHub-CN-Film-Probe/1.0 (read-only, low-volume)"
G="https://60s.viki.moe/v2/"
SIXTY=[
("60s: 豆瓣电影周榜","douban/weekly/movie"),
("60s: 豆瓣华语剧集","douban/weekly/tv_chinese"),
("60s: 豆瓣全球剧集","douban/weekly/tv_global"),
("60s: 豆瓣华语综艺","douban/weekly/show_chinese"),
("60s: 豆瓣全球综艺","douban/weekly/show_global"),
("60s: 猫眼实时票房","maoyan/realtime/movie"),
("60s: 猫眼全球票房","maoyan/all/movie"),
("60s: 猫眼网剧热度","maoyan/realtime/web"),
("60s: 猫眼电视收视","maoyan/realtime/tv"),
("60s: 百度电视剧榜","baidu/teleplay")
]
OTHERS=[
("自建豆瓣 Top250","https://liangyou-douban-movie-api.maddestalistar.workers.dev/api/top250?page=1","self"),
("自建豆瓣新片榜","https://liangyou-douban-movie-api.maddestalistar.workers.dev/api/chart","self"),
("自建豆瓣周榜","https://liangyou-douban-movie-api.maddestalistar.workers.dev/api/weekly","self"),
("自建豆瓣正在热映","https://liangyou-douban-movie-api.maddestalistar.workers.dev/api/nowplaying","self"),
("ApiZero: 豆瓣电影详情","https://v1.apizero.cn/api/douban-movie?id=1292052","apizero"),
("ApiZero: 实时电影票房","https://v1.apizero.cn/api/movie-box","apizero"),
("every.film: 公开媒体详情","https://every.film/api/v1/media/70523/detail","every"),
("every.film: API schema","https://every.film/openapi.json","schema"),
("every.film: 文档","https://every.film/zh-CN","html"),
("bookyo: douban-imdb 服务","https://movie.querydata.org/api?id=1292052","bookyo"),
("MoviePilot: 公开 API 详情","https://api.movie-pilot.org/api/v1/douban/1292052","moviepilot"),
("MoviePilot: 公开 Top250","https://api.movie-pilot.org/api/v1/recommend/douban_movie_top250","moviepilot"),
("MoviePilot: 开放文档","https://api.movie-pilot.org/","html"),
("悦享数据: 豆瓣榜单","https://v.apiopt.com/api/v1/live/douban/movie/rank","auth"),
("WMDB: 站点","https://wmdb.tv/zh","html"),
("WMDB: OpenAPI","https://wmdb.tv/openapi.json","schema"),
("起零数据: 猫眼票房","https://api.istero.com/resource/v1/maoyan/movie/top","auth"),
("聚合数据: 中国票房","https://apis.juhe.cn/fapig/boxoffice/query","auth"),
("猫眼第三方 nxvav","https://api.nxvav.cn/api/maoyan/movie/","other"),
("豆瓣旧版官方 API","https://api.douban.com/v2/movie/subject/1292052","other"),
("Wikidata: 实体关联 JSON","https://www.wikidata.org/wiki/Special:EntityData/Q172241.json","wikidata"),
("Wikidata: Action API","https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q172241&props=claims&format=json","wikidata"),
]
def fetch(url, timeout=11):
    req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"application/json, text/html;q=0.8"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status,r.headers.get("Content-Type",""),r.read(350000),None
    except urllib.error.HTTPError as e:
        return e.code,e.headers.get("Content-Type",""),e.read(12000),"HTTPError"
    except Exception as e:
        return None,"",b"",type(e).__name__
def classify(name,url,kind):
    start=time.monotonic()
    code,ct,raw,error=fetch(url)
    try: data=json.loads(raw)
    except (ValueError,UnicodeError): data=None
    first=None
    if kind=="60s":
        if isinstance(data,dict):
            v=data.get("data")
            if isinstance(v,dict): v=next((x for x in v.values() if isinstance(x,list)),None)
            if isinstance(v,list) and v:
                first=next((x.get("title") or x.get("name") for x in v if isinstance(x,dict)),None)
                n=len(v)
            else:n=0
            verdict="data_ok" if code==200 and data.get("code")==200 and n>0 else "empty_or_error"
        else: verdict="no_json";n=0
    elif kind in ("self","apizero"):
        v=data.get("data") if isinstance(data,dict) else None
        if isinstance(v,dict): v=v.get("list") or v
        n=len(v) if isinstance(v,list) else (1 if isinstance(v,dict) and bool(v) else 0)
        first=v[0].get("title") or v[0].get("name") if isinstance(v,list) and v and isinstance(v[0],dict) else None
        verdict="data_ok" if code==200 and isinstance(data,dict) and data.get("code")==0 and n>0 else "quota_or_error"
    elif kind=="wikidata":
        ent=((data or {}).get("entities",{}) or {}).get("Q172241",{}) if isinstance(data,dict) else {}
        claims=ent.get("claims",{})
        def cv(prop):
            try:return str(claims[prop][0]["mainsnak"]["datavalue"]["value"])
            except (KeyError,IndexError,TypeError):return None
        did=cv("P4529");iid=cv("P345")
        n=int(bool(did and iid));first=f"IMDb {iid} / Douban {did}" if n else None
        verdict="data_ok" if code==200 and did=="1292052" and iid=="tt0111161" else "no_match_or_error"
    elif kind=="every":
        n=1 if isinstance(data,dict) and bool(data.get("title") or data.get("data") or data.get("id")) else 0
        verdict="data_ok" if code==200 and n else "no_data"; first=data.get("title") if isinstance(data,dict) else None
    elif kind=="schema":
        n=len(data.get("paths",{})) if isinstance(data,dict) else 0
        verdict="schema_ok" if code==200 and n else "not_confirmed"
    elif kind=="html":
        txt=raw[:350000].decode("utf-8","replace").lower()
        n=int(bool(code==200 and "<html" in txt))
        verdict="website_ok_not_api" if n else "site_unavailable"
    else:
        n=0
        if code in (401,403): verdict="auth_required"
        elif code==200 and isinstance(data,(dict,list)):
            n=len(data) if isinstance(data,list) else 1
            if isinstance(data,dict) and (data.get("error") or str(data.get("code","")) in ("401","403","400","4015")): verdict="auth_or_error"
            else:verdict="json_returned_unverified"
        else:verdict="not_confirmed"
    return {"name":name,"endpoint":url,"kind":kind,"http":code,"result":verdict,"items":n,"sample":first,"error":error,"seconds":round(time.monotonic()-start,2)}
def guarded(name,url,kind):
    try: return classify(name,url,kind)
    except Exception as e:return {"name":name,"endpoint":url,"kind":kind,"result":"probe_exception","error":type(e).__name__}
def main():
    rows=[]
    # Serial on public 60s to avoid burst and quota issues.
    for name,path in SIXTY:
        r=guarded(name,G+path,"60s"); rows.append(r)
        print("CN_MEDIA_PROBE "+json.dumps(r,ensure_ascii=False),flush=True)
        time.sleep(.8)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures=[pool.submit(guarded,*r) for r in OTHERS]
        for future in concurrent.futures.as_completed(futures):
            r=future.result();rows.append(r)
            print("CN_MEDIA_PROBE "+json.dumps(r,ensure_ascii=False),flush=True)
    report={"checked_at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"method":"Unauthenticated GET only; data_ok requires non-empty data and expected response shape.","results":rows}
    pathlib.Path("data").mkdir(exist_ok=True)
    pathlib.Path("data/cn-media-api-probe.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("CN_MEDIA_SUMMARY "+json.dumps({"checked":len(rows),"data_ok":sum(r["result"]=="data_ok" for r in rows),"by_status":{k:sum(r["result"]==k for r in rows) for k in sorted(set(r["result"] for r in rows))}},ensure_ascii=False),flush=True)
if __name__=="__main__":main()

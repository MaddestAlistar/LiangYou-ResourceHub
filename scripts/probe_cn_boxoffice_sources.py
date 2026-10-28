#!/usr/bin/env python3
"""Read-only external box office source health checks; not a production scraper."""
import concurrent.futures,datetime,json,urllib.request,urllib.error,time
SOURCES=[
("清和API·猫眼票房","https://api.qhsou.com/api/maoyan.php","qhsou"),
("清和API·全球影史票房","https://api.qhsou.com/api/qqys.php","qhsou"),
("清和API·豆瓣Top250","https://api.qhsou.com/api/douban.php","qhsou"),
("ApiZero·电影票房","https://v1.apizero.cn/api/movie-box","apizero"),
("Ahua猫眼·运行状态","https://maoyan.ahua.space/api/status","ahua_status"),
("Ahua猫眼·影片详情","https://maoyan.ahua.space/api/movie/1294273","ahua_detail"),
("接口盒子·猫眼综合票房公共测试","https://cn.apihz.cn/api/bang/maoyan1.php?id=88888888&key=88888888","apihz"),
("骁拓云·猫眼无Key验证","https://api.xiaotuo.net/api.php?act=Api_send&id=149","xiaotuo"),
("阿里淘票票·网关无Key验证","https://eco.taobao.com/router/rest?method=taobao.film.show.todayboxoffice.get&v=2.0&format=json","ali_gate"),
("淘票票·大盘票房文档","https://developer.alibaba.com/docs/api.htm?apiId=30258","doc"),
("淘票票·今日票房文档","https://developer.alibaba.com/docs/api.htm?apiId=33069","doc"),
("淘票票·热映待映文档","https://developer.alibaba.com/docs/api.htm?apiId=69080","doc"),
("淘票票·汇总票房文档","https://developer.alibaba.com/docs/api.htm?apiId=58116","doc"),
("灯塔·开放数据查询文档","https://developer.alibaba.com/docs/api.htm?apiId=70103","doc"),
("灯塔·官方网站","https://dt.taopiaopiao.com/","doc")
]
def test(row):
 name,url,kind=row; started=time.monotonic()
 req=urllib.request.Request(url,headers={"User-Agent":"LiangYou-API-Research/1.0","Accept":"application/json,text/html;q=0.8"})
 code=None;raw=b"";ctype="";err=None
 try:
  with urllib.request.urlopen(req,timeout=18) as h:
   code=h.status;ctype=h.headers.get("Content-Type","");raw=h.read(450000)
 except urllib.error.HTTPError as e:
  code=e.code;ctype=e.headers.get("Content-Type","");raw=e.read(16000)
 except Exception as e:err=type(e).__name__
 try:d=json.loads(raw)
 except (ValueError,UnicodeError):d=None
 samples=[];count=0;updated=None;error_code=None
 if isinstance(d,list): data=d
 elif isinstance(d,dict):
  error_code=d.get("code") or d.get("error_code") or d.get("errorCode")
  data=d.get("data")
  updated=d.get("updated") or d.get("updateTime") or d.get("time") or d.get("time2")
  if isinstance(data,dict):
   updated=updated or data.get("updated") or data.get("updated_at") or data.get("update_time")
   data=next((v for k,v in data.items() if k in ("list","items","movies","rows","result","data") and isinstance(v,list)),data)
  if data is None and isinstance(d.get("result"),list):data=d["result"]
  if data is None and isinstance(d.get("movieList"),list):data=d["movieList"]
  if data is None and isinstance(d.get("movies"),list):data=d["movies"]
 else:data=None
 if isinstance(data,list):
  count=len(data)
  samples=[str(next((x.get(k) for k in ["movieName","movie_name","name","title","nm"] if x.get(k)), ""))[:50] for x in data[:2] if isinstance(x,dict)]
 elif isinstance(data,dict):count=1; samples=[str(next((data.get(k) for k in ["movieName","movie_name","name","title","nm"] if data.get(k)),""))[:50]]
 if kind=="doc":
  good=code==200 and len(raw)>900
  verdict="DOC_OK" if good else "DOC_UNREACHABLE"
 elif kind=="ahua_status":
  good=code==200 and isinstance(d,dict) and bool(d.get("status"))
  verdict="STATUS_ONLY" if good else "FAIL"
 elif kind=="ahua_detail":
  good=code==200 and isinstance(d,dict) and d.get("_meta",{}).get("success") is True and d.get("basic",{}).get("movieName") not in (None,"","未知电影")
  movie=d.get("basic",{}) if isinstance(d,dict) else {}
  has_rating=bool(isinstance(d,dict) and any((d.get("rating") or {}).values()))
  has_box=bool(movie.get("boxOffice") and movie.get("boxOffice")!="未找到票房数据")
  verdict=("DATA_OK" if has_rating and has_box else "PARTIAL_DATA") if good else "FAIL_OR_EMPTY"
  samples=[d.get("basic",{}).get("movieName")] if isinstance(d,dict) else []
 elif kind=="qhsou":
  # Source varies formats; require actual movie-shaped content, not just HTTP 200
  if isinstance(d,dict):
   payload=d.get("data")
   if isinstance(payload,dict):
    for k in ("data","list","items","rank","boxOfficeList","movieList"):
     if isinstance(payload.get(k),list):payload=payload[k];break
   if isinstance(payload,list) and not count:
    count=len(payload)
   if not count:
    for k in ("list","items","results","rank"):
     if isinstance(d.get(k),list):count=len(d[k]);samples=[str(d[k][0])[:50]] if count else [];break
  good=code==200 and count>0
  verdict="DATA_OK" if good else "RESPONSE_NEEDS_REVIEW"
 elif kind=="apizero":
  good=code==200 and isinstance(d,dict) and d.get("code")==0 and count>0
  verdict="DATA_OK" if good else "QUOTA_OR_ERROR"
 elif kind=="apihz":
  good=code==200 and isinstance(d,dict) and d.get("code")==200 and count>0
  verdict="DATA_OK_PUBLIC_TEST_CREDENTIAL" if good else "AUTH_OR_ERROR"
 elif kind in ("xiaotuo","ali_gate"):
  verdict="AUTH_OR_KEY_NEEDED" if code in (200,400,401,403) else "NOT_REACHABLE"
 else:verdict="UNKNOWN"
 return {"provider":name,"kind":kind,"http":code,"verdict":verdict,"count":count,"sample":samples,"updated":updated,"service_code":error_code,"content_type":ctype[:55],"error":err,"seconds":round(time.monotonic()-started,2)}
def main():
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  results=list(pool.map(test,SOURCES))
 for x in results:print("BOXOFFICE_API_PROBE "+json.dumps(x,ensure_ascii=False),flush=True)
 print("BOXOFFICE_API_TOTAL "+json.dumps({"total":len(results),"data_ok":sum(x["verdict"]=="DATA_OK" for x in results),"doc_ok":sum(x["verdict"]=="DOC_OK" for x in results)},ensure_ascii=False),flush=True)
if __name__=="__main__":main()

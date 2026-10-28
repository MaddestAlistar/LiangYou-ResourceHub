#!/usr/bin/env python3
"""Read-only 2026 China Film Box Office official web feed connectivity check.
Public endpoints discovered in DogBox; 3 GET calls only, no cookies or bypass.
"""
import json,urllib.request,urllib.error,time
samples=[
("2026 annual gross","https://zgdypf.zgdypw.cn/getYearData?year=2026"),
("2025 annual gross","https://zgdypf.zgdypw.cn/getYearData?year=2025"),
("2026-10-27 date","https://zgdypf.zgdypw.cn/getDayData?date=2026-10-27&withSvcFee=true"),
]
for idx,(label,url) in enumerate(samples):
 try:
  req=urllib.request.Request(url,headers={"User-Agent":"LiangYou-Media-Research/1.0 (public read-only)","Accept":"application/json"})
  with urllib.request.urlopen(req,timeout=24) as resp:
   status=resp.status;raw=resp.read(400000)
  d=json.loads(raw)
  lst=d.get("rankList") or d.get("list") or []
  first=lst[0] if isinstance(lst,list) and lst else {}
  result={"name":label,"http":status,"is_json":True,"keys":list(d)[:12] if isinstance(d,dict) else [],
    "count":len(lst) if isinstance(lst,list) else 0,"first":{k:first.get(k) for k in ("name","movieCode","code","salesInWan","sumSalesDesc","salesRateDesc") if k in first} if isinstance(first,dict) else {}}
 except urllib.error.HTTPError as e:result={"name":label,"http":e.code,"is_json":False}
 except Exception as e:result={"name":label,"http":None,"error":type(e).__name__}
 print("FILM_FEED_CHECK "+json.dumps(result,ensure_ascii=False),flush=True)
 if idx<2:time.sleep(2)

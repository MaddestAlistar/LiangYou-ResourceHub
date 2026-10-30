#!/usr/bin/env python3
"""Read-only low-rate Bilibili thumbnail endpoint probe, no account or video downloads."""
import json,time,urllib.parse,urllib.request,urllib.error
ids=["BV1zprUY2EGj","BV1F3aF6mEQn"]
results=[]
for bv in ids:
    endpoints=[
      "https://api.bilibili.com/x/web-interface/view?"+urllib.parse.urlencode({"bvid":bv}),
      "https://liangyou-streaming-availability.maddestalistar.workers.dev/api/video/bilibili/"+bv
    ]
    for ep in endpoints:
      row={"bvid":bv,"endpoint_host":urllib.parse.urlparse(ep).hostname}
      try:
        req=urllib.request.Request(ep,headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) Chrome/124 Safari/537.36",
          "Referer":"https://www.bilibili.com/","Accept":"application/json"})
        with urllib.request.urlopen(req,timeout=16) as resp:
          raw=resp.read(250000); doc=json.loads(raw)
          d=doc.get("data") or doc
          if not isinstance(d,dict):d={}
          row.update({"http":resp.status,"code":doc.get("code"),
            "keys":list(d)[:40], "pic":d.get("pic") or d.get("thumbnail") or d.get("cover"),
            "video_id":d.get("bvid"),"title":d.get("title")})
      except Exception as e:row["error"]=str(e)[:170]
      results.append(row);print("BILI_COVER_PROBE",json.dumps(row,ensure_ascii=False),flush=True)
      time.sleep(5)
open("bilibili-cover-endpoints-report.json","w").write(json.dumps(results,ensure_ascii=False,indent=2))

#!/usr/bin/env python3
"""Verified Korean KOFIC daily chart; fail closed, never invent data."""
import json,os,urllib.request,urllib.parse,urllib.error
from datetime import datetime,timedelta,timezone
from pathlib import Path
from zoneinfo import ZoneInfo
KEY=os.environ.get("KOFIC_API_KEY","").strip()
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data/kofic-boxoffice.json"
def get(host,date):
    url="https://"+host+"/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json?"+urllib.parse.urlencode({"key":KEY,"targetDt":date})
    req=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":"LiangYou-ResourceHub/1.0"})
    with urllib.request.urlopen(req,timeout=12) as response:
        if response.status!=200: raise ValueError("HTTP failure")
        content=json.load(response)
    records=content.get("boxOfficeResult",{}).get("dailyBoxOfficeList")
    if not isinstance(records,list) or len(records)<3 or len(records)>10: raise ValueError("Missing verified KOFIC chart")
    data=[]
    for item in records:
        if not isinstance(item,dict) or not item.get("movieNm"): raise ValueError("Missing movie title")
        rank=int(item["rank"])
        if not 1<=rank<=10: raise ValueError("Bad rank")
        admission=int(item["audiCnt"])
        if admission<0: raise ValueError("Bad admissions")
        data.append({"rank":rank,"title":item["movieNm"][:140],"releaseDate":item.get("openDt","")[:12],
                     "audience":admission,"salesKRW":int(item.get("salesAmt") or "0")})
    return {"ok":True,"status":"ok","source":"KOFIC official Korea daily box office",
            "date":date,"checkedAt":datetime.now(timezone.utc).isoformat(),
            "data":data}
def main():
    if not KEY:
        print("KOFIC_NOT_CONFIGURED; existing snapshot unchanged")
        return
    date=(datetime.now(ZoneInfo("Asia/Seoul")).date()-timedelta(days=2)).strftime("%Y%m%d")
    for host in ("kobis.or.kr","www.kobis.or.kr"):
        try:
            data=get(host,date)
            OUT.parent.mkdir(parents=True,exist_ok=True)
            OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
            print("KOFIC_VERIFIED",date,len(data["data"]))
            return
        except Exception as exc:
            print("KOFIC_SOURCE_UNAVAILABLE",host,type(exc).__name__)
    print("KOFIC_UNAVAILABLE; retaining last verified file without fabricating a new one")
if __name__=="__main__": main()

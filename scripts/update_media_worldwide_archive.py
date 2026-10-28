#!/usr/bin/env python3
"""Validated historical worldwide chart; never present the 2019 capture as live rankings."""
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data/media-worldwide-archive.json"
SRC="https://boxofficehistory.com/api/v1/alltime/worldwide.json"
def main():
 req=urllib.request.Request(SRC,headers={"User-Agent":"LiangYou-ResourceHub/1.0 (historical data)","Accept":"application/json"})
 with urllib.request.urlopen(req,timeout=25) as r:
  if r.status!=200:raise ValueError("historical source unavailable")
  doc=json.load(r)
 if not isinstance(doc,dict) or not isinstance(doc.get("rows"),list) or len(doc["rows"])<50:raise ValueError("unexpected worldwide chart schema")
 asof=str(doc.get("asOf") or "")
 # This archival chart is explicitly the historic Oct 2019 ranking.
 if "2019" not in asof:raise ValueError("capture date not 2019; review changed data provenance")
 rows=[]
 for entry in doc["rows"]:
  if not isinstance(entry,dict):continue
  rank=entry.get("rank");gross=entry.get("worldwide");title=entry.get("title")
  if not isinstance(rank,int) or rank<1 or not isinstance(gross,int) or gross<=0 or not isinstance(title,str) or not title.strip():continue
  archive_id=entry.get("id")
  link=("https://boxofficehistory.com/api/v1/movies/"+archive_id+".json"
        if isinstance(archive_id,str) and re.fullmatch(r"[a-zA-Z0-9_-]{1,90}",archive_id) else SRC)
  rows.append({"rank":rank,"title":title[:160],"usd":gross,"url":link})
  if len(rows)>=30:break
 if len(rows)<20 or any(a["rank"]>=b["rank"] for a,b in zip(rows,rows[1:])):raise ValueError("worldwide chart integrity error")
 output={"schema":1,"source":"Box Office Archive · Wayback Machine / Box Office Mojo",
         "asOf":asof,"archival":True,"retrievedAt":datetime.now(timezone.utc).isoformat(),
         "sourceUrl":SRC,"rows":rows}
 OUT.parent.mkdir(parents=True,exist_ok=True)
 OUT.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print("HISTORICAL_WORLDWIDE_ARCHIVE_OK",asof,len(rows))
if __name__=="__main__":main()

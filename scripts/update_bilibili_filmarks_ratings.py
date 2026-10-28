#!/usr/bin/env python3
"""Verify 2 Bilibili and 2 Filmarks public scores; publish provenance-rich snapshots.
No login, cookies, rate evasion, or hidden API. A failed verification must not
overwrite the last good snapshot. Runs at most twice per day by default.
"""
from datetime import datetime,timezone
from pathlib import Path
import json,urllib.request,urllib.error,re,html,time

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data"/"bilibili-filmarks-ratings.json"
BILI=[26801,42290]
FILMARKS=[14348,16650]

def request(url):
  req=urllib.request.Request(url,headers={
    "User-Agent":"LiangYouResourceHub/1.0 public-rating-snapshot research",
    "Accept":"text/html,application/json;q=0.9"})
  with urllib.request.urlopen(req,timeout=24) as r:
    if r.status!=200:raise ValueError("unexpected_http")
    data=r.read(500001)
    if len(data)>500000:raise ValueError("upstream_too_large")
    return data.decode("utf-8","replace")

def score(x,maxval):
  if isinstance(x,bool) or x is None or not str(x).strip():return None
  try:n=float(x)
  except (TypeError,ValueError):return None
  return n if 0<n<=maxval else None

def bilibili(id):
  url=f"https://api.bilibili.com/pgc/view/web/season?season_id={id}"
  d=json.loads(request(url))
  data=d.get("result") or {}
  r=data.get("rating") or {}
  val=score(r.get("score"),10)
  count=r.get("count")
  if d.get("code")!=0 or data.get("season_id")!=id or not data.get("title") or val is None or not isinstance(count,int) or count<0:raise ValueError("bilibili_invalid_rating_or_identity")
  return {"id":id,"title":data["title"],"rating":val,"scale":10,
      "ratingCount":count,"pageUrl":f"https://www.bilibili.com/bangumi/play/ss{id}",
      "sourceUrl":url}

def filmarks(id):
  url=f"https://filmarks.com/movies/{id}"
  s=request(url)
  page_title=re.search(r"<title[^>]*>(.*?)</title>",s,re.I|re.S)
  if not page_title or "Filmarks" not in page_title.group(1):raise ValueError("filmarks_invalid_page")
  clean_title=html.unescape(page_title.group(1)).split(" - ")[0].strip()
  results=[]
  for raw in re.findall(r'<script[^>]+type=["\x27]application/ld\+json["\x27][^>]*>(.*?)</script>',s,re.I|re.S):
    try:obj=json.loads(raw)
    except (ValueError,TypeError):continue
    objs=obj if isinstance(obj,list) else [obj]
    for x in objs:
      if isinstance(x,dict) and x.get("@type")=="Movie" and isinstance(x.get("aggregateRating"),dict):
        a=x["aggregateRating"];value=score(a.get("ratingValue"),5)
        if value and clean_title and len(clean_title)<160:
          results.append((clean_title,value))
  if len(results)!=1:raise ValueError("filmarks_ambiguous_rating")
  title,value=results[0]
  return {"id":id,"title":title,"rating":value,"scale":5,
    "ratingCount":None,"pageUrl":url,"sourceUrl":url}

def main():
  data={"schema":1,"updatedAt":datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
    "sources":{"bilibili":{},"filmarks":{}},"sourceNotes":{
      "bilibili":"Bilibili public season API; ratingCount = users who rated.",
      "filmarks":"Filmarks official public page JSON-LD ratingValue; ratingCount is unknown."
    }}
  for i,id in enumerate(BILI):
    data["sources"]["bilibili"][str(id)]=bilibili(id)
    if i<len(BILI)-1:time.sleep(1)
  for i,id in enumerate(FILMARKS):
    data["sources"]["filmarks"][str(id)]=filmarks(id)
    if i<len(FILMARKS)-1:time.sleep(1)
  OUT.parent.mkdir(parents=True,exist_ok=True)
  OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
  print("PUBLIC_SCORE_SNAPSHOT "+json.dumps({"status":"ok","bilibili":len(data["sources"]["bilibili"]),
      "filmarks":len(data["sources"]["filmarks"]),"updatedAt":data["updatedAt"]},ensure_ascii=False),flush=True)

if __name__=="__main__":main()

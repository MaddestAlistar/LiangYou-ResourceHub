#!/usr/bin/env python3
"""Refresh sourced international film/TV headlines from publishers' public RSS.
Only public headline metadata and original article URLs; never republish bodies.
"""
from __future__ import annotations
import html
import json
import re
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/"data/media-world-news.json"
FEEDS=[
 ("Variety", "https://variety.com/v/film/feed/", "variety.com"),
 ("Deadline", "https://deadline.com/feed/", "deadline.com"),
 ("The Hollywood Reporter", "https://www.hollywoodreporter.com/feed/", "hollywoodreporter.com"),
 ("IndieWire", "https://www.indiewire.com/feed/", "indiewire.com"),
 ("TheWrap", "https://www.thewrap.com/feed/", "thewrap.com"),
 ("Collider", "https://collider.com/feed/", "collider.com"),
]
UA="LiangYouFilmNews/1.0 (metadata-only RSS aggregator)"
def clean(s):
 return re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]*>"," ",str(s or "")))).strip()[:180]
def trusted(link,domain):
 try:
  p=urlparse(str(link or ""))
  return p.geturl() if p.scheme=="https" and not p.username and not p.password and (p.hostname==domain or (p.hostname or "").endswith("."+domain)) else None
 except ValueError:return None
def timestamp(raw):
 try:
  d=parsedate_to_datetime(raw)
  if d.tzinfo is None:d=d.replace(tzinfo=timezone.utc)
  return d.astimezone(timezone.utc)
 except (ValueError,TypeError,OverflowError,IndexError):
  try:
   d=datetime.fromisoformat(str(raw).replace("Z","+00:00"))
   return d.astimezone(timezone.utc)
  except (ValueError,TypeError):return None
def fetch_feed(source,url,host):
 try:
  req=Request(url,headers={"User-Agent":UA,"Accept":"application/rss+xml,application/atom+xml,application/xml"})
  with urlopen(req,timeout=15) as response:
   if response.status!=200:return []
   raw=response.read(900001)
  if len(raw)>900000:return []
  doc=ET.fromstring(raw)
 except Exception as ex:
  print("WORLD_NEWS_SOURCE_UNAVAILABLE",source,type(ex).__name__)
  return []
 items=[]
 # RSS 2.0 and Atom 1.0; no HTML parsing of restricted publisher pages.
 for entry in list(doc.findall(".//item"))+list(doc.findall(".//{http://www.w3.org/2005/Atom}entry")):
  if len(items)>=45:break
  title=clean(entry.findtext("title") or entry.findtext("{http://www.w3.org/2005/Atom}title"))
  if len(title)<8:continue
  link=entry.findtext("link")
  if not link:
   node=entry.find("{http://www.w3.org/2005/Atom}link")
   link=node.get("href") if node is not None else None
  link=trusted(link,host)
  if not link:continue
  value=(entry.findtext("pubDate") or entry.findtext("{http://purl.org/dc/elements/1.1/}date")
        or entry.findtext("{http://www.w3.org/2005/Atom}published") or entry.findtext("{http://www.w3.org/2005/Atom}updated"))
  when=timestamp(value)
  if not when or when>datetime.now(timezone.utc)+timedelta(days=1) or when<datetime.now(timezone.utc)-timedelta(days=180):continue
  items.append({"source":source,"title":title,"date":when.date().isoformat(),"url":link})
 return items
def main():
 rows=[]
 for args in FEEDS:rows.extend(fetch_feed(*args))
 unique={}
 for row in rows:unique[row["url"]]=row
 # Keep previously verified headlines instead of replacing the archive with today's 64 or so RSS rows.
 # One-time editorial metadata per article; 1-year retention keeps older film titles discoverable.
 try:
  prior=json.loads(DEST.read_text(encoding="utf-8")) if DEST.exists() else {}
  for row in prior.get("items",[]):
   if not isinstance(row,dict) or row.get("source") not in {x[0] for x in FEEDS}:continue
   host=next((x[2] for x in FEEDS if x[0]==row["source"]),None)
   link=trusted(row.get("url"),host) if host else None
   if not link or len(str(row.get("title","")))<8:continue
   try:published=datetime.fromisoformat(str(row.get("date",""))).replace(tzinfo=timezone.utc)
   except ValueError:continue
   if published>datetime.now(timezone.utc) or published<datetime.now(timezone.utc)-timedelta(days=365):continue
   unique.setdefault(link,{**row,"url":link})
 except (OSError,ValueError,TypeError):pass
 rows=sorted(unique.values(),key=lambda a:a["date"],reverse=True)[:1400]
 if not rows:
  print("WORLD_NEWS_NO_VERIFIED_PUBLISHER_FEEDS; keeping previous snapshot")
  return 0
 document={"schema":1,"updatedAt":datetime.now(timezone.utc).isoformat(),"items":rows,
   "note":"Publisher RSS headlines and original source links only; no article bodies, no fabricated matches."}
 DEST.parent.mkdir(parents=True,exist_ok=True)
 DEST.write_text(json.dumps(document,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print("WORLD_NEWS_HEADLINES",len(rows),"SOURCES",len({x["source"] for x in rows}))
 return 0
if __name__=="__main__":raise SystemExit(main())

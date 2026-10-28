#!/usr/bin/env python3
"""Metadata-only film headlines from official Chinese film news pages.
Do not mirror bodies, reuse images, or misidentify links as Maoyan/Taopiaopiao APIs.
"""
import html
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/"data/media-cn-news.json"
SOURCES=[
 ("国家电影局","https://www.chinafilm.gov.cn/xwzx/gzdt/",r"/xwzx/gzdt/\d{6}/t\d{8}_\d+\.html", "chinafilm.gov.cn"),
 ("1905电影网","https://www.1905.com/news/",r"/news/\d{8}/\d+\.shtml", "1905.com"),
 ("新浪电影","https://ent.sina.com.cn/film/",r"/(?:m|tv)/[a-z]/20\d{2}-\d{2}-\d{2}/doc-[a-z0-9-]+\.shtml", "ent.sina.com.cn"),
 ("腾讯娱乐","https://new.qq.com/ch/ent/",r"/rain/a/20\d{6}[a-z0-9]+", "new.qq.com"),
]
A=re.compile(r"<a\b([^>]*)>(.*?)</a>",re.I|re.S)
HREF=re.compile(r"""href\s*=\s*["']([^"']+)["']""",re.I)
TITLE=re.compile(r"""title\s*=\s*["']([^"']+)["']""",re.I)
DATE=re.compile(r"20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}")
def text(value):
 return re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]*>"," ",value))).strip()
def trusted(u,origin,host):
 u=urljoin(origin,u)
 try:
  p=urlparse(u)
  if p.scheme!="https" or p.username or p.password:return None
  if p.hostname!=host and not (p.hostname or "").endswith("."+host):return None
  return u
 except ValueError:return None
def collect(name,url,pattern,host):
 try:
  req=Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; LiangYouHeadlines/1.0)","Accept":"text/html"})
  with urlopen(req,timeout=18) as r:
   if r.status!=200:raise ValueError("upstream_status")
   body=r.read(750000).decode("utf-8","replace")
 except Exception as e:
  print("CN_NEWS_UNAVAILABLE",name,type(e).__name__)
  return []
 found=[]
 for match in A.finditer(body):
  attrs=match.group(1)
  h=HREF.search(attrs)
  if not h:continue
  urlValue=trusted(h.group(1),url,host)
  if not urlValue or not re.search(pattern,urlparse(urlValue).path,re.I):continue
  tm=TITLE.search(attrs)
  heading=text(tm.group(1) if tm else match.group(2)).lstrip("•·　 ").strip()
  if len(heading)<8 or len(heading)>180:continue
  surrounding=text(body[match.end():match.end()+220])
  date_match=DATE.search(surrounding)
  if date_match:
   groups=re.findall(r"\d+",date_match.group())
   if len(groups)>=3:day=f"{int(groups[0]):04d}-{int(groups[1]):02d}-{int(groups[2]):02d}"
   else:continue
  else:
   uri_path=urlparse(urlValue).path
   uri_date=re.search(r"(20\d{6})",uri_path)
   explicit=re.search(r"(20\d{2})-(\d{2})-(\d{2})",uri_path)
   if explicit:day="-".join(explicit.groups())
   elif uri_date:
    ymd=uri_date.group(1);day=f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:8]}"
   else:continue
  try:datetime.fromisoformat(day)
  except ValueError:continue
  if day>datetime.now(timezone.utc).date().isoformat():continue
  if any(x["url"]==urlValue for x in found):continue
  found.append({"source":name,"title":heading,"url":urlValue,"date":day})
 return found[:12]
def collect_rss(name="中新网·文娱",rss="https://www.chinanews.com.cn/rss/culture.xml",host="chinanews.com.cn"):
 """Source-attributed RSS metadata; the publisher link must resolve to the allowed domain."""
 from email.utils import parsedate_to_datetime
 from xml.etree import ElementTree as ET
 try:
  req=Request(rss,headers={"User-Agent":"Mozilla/5.0 (compatible; LiangYouHeadlines/1.0)","Accept":"application/rss+xml,application/xml"})
  with urlopen(req,timeout=18) as response:
   raw=response.read(650001)
  if len(raw)>650000:return []
  doc=ET.fromstring(raw)
 except Exception as error:
  print("CN_NEWS_UNAVAILABLE",name,type(error).__name__)
  return []
 out=[]
 for item in doc.findall(".//item")[:60]:
  title=text(item.findtext("title") or "")
  if not title or len(title)<7:continue
  link=str(item.findtext("link") or "").strip()
  if link.startswith("http://") and host in link:link="https://"+link[7:]
  url=trusted(link,rss,host)
  if not url:continue
  try:
   ts=parsedate_to_datetime(str(item.findtext("pubDate") or ""))
   if ts.tzinfo is None:ts=ts.replace(tzinfo=timezone.utc)
   day=ts.astimezone(timezone.utc).date().isoformat()
   if (datetime.now(timezone.utc)-ts.astimezone(timezone.utc)).days>90:continue
  except Exception:continue
  if any(x["url"]==url for x in out):continue
  out.append({"source":name,"title":title[:180],"url":url,"date":day})
 return out[:30]

def main():
 items=[]
 for args in SOURCES:items+=collect(*args)
 items+=collect_rss()
 items+=collect_rss('搜狐娱乐','https://news.sohu.com/rss/yule.xml','news.sohu.com')
 items=sorted(items,key=lambda x:x["date"],reverse=True)
 if len(items)<3:
  print("CN_NEWS_NOT_ENOUGH_VERIFIED",len(items))
  return 0
 obj={"schema":1,"updatedAt":datetime.now(timezone.utc).isoformat(),"items":items[:120],
      "note":"Source-attributed headline metadata and original links only; no news article bodies."}
 DEST.parent.mkdir(parents=True,exist_ok=True)
 DEST.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
 print("CN_NEWS_SNAPSHOT_OK",len(obj["items"]))
 return 0
if __name__=="__main__":
 sys.exit(main())

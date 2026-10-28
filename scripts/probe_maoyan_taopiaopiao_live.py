#!/usr/bin/env python3
"""Read-only low-volume public page experiment. No login, tokens or evasion."""
import json,re,urllib.request,urllib.error,html,time
SOURCES=[
("maoyan-ne-zha","https://m.maoyan.com/asgard/movie/1294273"),
("maoyan-shawshank","https://m.maoyan.com/asgard/movie/1292052"),
("maoyan-annual","https://piaofang.maoyan.com/rankings/year"),
("taopiaopiao-home","https://m.taopiaopiao.com/"),
("taopiaopiao-public-show","https://h5.m.taopiaopiao.com/app/movie/pages/index/index.html"),
]
def fetch(name,url):
 req=urllib.request.Request(url,headers={
 "User-Agent":"LiangYou-ResourceHub-Movie-Research/1.0 (public read-only connectivity)",
 "Accept":"text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"})
 try:
  with urllib.request.urlopen(req,timeout=20) as res:
   status=res.status
   final=res.url
   body=res.read(550000).decode("utf-8","replace")
 except urllib.error.HTTPError as e:
  status=e.code;final=e.url;body=e.read(25000).decode("utf-8","replace")
 except Exception as e:
  print("SOURCE_PROBE "+json.dumps({"name":name,"status":None,"error":type(e).__name__},ensure_ascii=False),flush=True);return
 checks={}
 for label,pattern in [
 ("scoreCount",r'(?i)scoreCount.{0,110}'),
 ("sc",r'["\\]sc["\\] *[:=].{0,70}'),
 ("rating_num",r'rating-num.{0,150}'),
 ("rating_txt",r'猫眼购票评分.{0,170}'),
 ("rating_people",r'[\\d,]{3,}[^<>]{0,12}人评'),
 ("movie_id",r'"id" *: *1294273'),
 ("rankings",r'ranks-list.{0,200}'),
 ("boxoffice",r'票房.{0,90}'),
 ("appstate",r'__NEXT_DATA__|__NUXT__|__INITIAL_STATE__|__APOLLO_STATE__')
 ]:
  matches=re.findall(pattern,body,re.I)
  checks[label]={"count":len(matches),"snippets":[html.unescape(m[:180]) for m in matches[:2]]}
 print("SOURCE_PROBE "+json.dumps({"name":name,"status":status,"bytes":len(body),"final":final,"title":re.search(r'<title[^>]*>([^<]+)',body,re.I).group(1)[:80] if re.search(r'<title[^>]*>([^<]+)',body,re.I) else None,"checks":checks},ensure_ascii=False),flush=True)
def main():
 for name,url in SOURCES:
  fetch(name,url)
  time.sleep(1.0)
if __name__=="__main__":main()

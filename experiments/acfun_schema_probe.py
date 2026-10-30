#!/usr/bin/env python3
import json, urllib.parse, urllib.request
url='https://www.acfun.cn/rest/pc-direct/search/video?'+urllib.parse.urlencode({'keyword':'药屋少女的呢喃 预告','page':1,'pageSize':10})
req=urllib.request.Request(url,headers={'User-Agent':'LiangYou-MovieVideoMetadata/1.0','Accept':'application/json'})
with urllib.request.urlopen(req,timeout=18) as res:
    doc=json.load(res)
rows=doc.get('videoList') or []
for row in rows[:4]:
    print('ACFUN_SCHEMA',json.dumps({
      'keys':list(row)[:45],
      'title':row.get('title'),
      'candidates':{k:v for k,v in row.items() if any(term in k.lower() for term in ('id','url','link','href','douga')) and isinstance(v,(str,int,float))}
    },ensure_ascii=False),flush=True)

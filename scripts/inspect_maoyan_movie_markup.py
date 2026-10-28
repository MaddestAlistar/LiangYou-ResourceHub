import html,json,re,urllib.request
urls=[
("ne-zha","https://m.maoyan.com/asgard/movie/1294273"),
("historical-total","https://piaofang.maoyan.com/rankings/year")
]
for name,url in urls:
 req=urllib.request.Request(url,headers={"User-Agent":"LiangYou-Research/1.0 (read-only)","Accept":"text/html"})
 try:
  with urllib.request.urlopen(req,timeout=18) as r:text=r.read(500000).decode("utf-8","replace")
 except Exception as e:
  print("STRUCTURE "+json.dumps({"source":name,"error":type(e).__name__}));continue
 patterns=([
  r'"sc":9\.8',r'"scoreLabel":"[^"]+"',r'3,391,261',r'累计票房',r'评分人数',r'人评',r'1,544,614',r'"id":1294273',r'ranks-list'
 ] if name=="ne-zha" else [r'ranks-list',r'哪吒之魔童闹海',r'1544614',r'rankings/year'])
 for p in patterns:
  m=re.search(p,text,re.I)
  print("STRUCTURE "+json.dumps({"source":name,"key":p,"found":bool(m),"sample":html.unescape(text[max(0,m.start()-180):m.end()+245]) if m else None},ensure_ascii=False))

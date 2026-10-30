#!/usr/bin/env python3
"""Low-frequency source-specific AcFun response and metadata matcher check."""
import json, time, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / "scripts"))
import refresh_media_extra_videos as m
rows=[]
for work in [
 {"title":"药屋少女的呢喃","original":"薬屋のひとりごと","aliases":["药屋少女的呢喃","薬屋のひとりごと"],"year":2023,"kind":"tv","tmdb_id":220542},
 {"title":"海洋奇缘","original":"Moana","aliases":["海洋奇缘","Moana"],"year":2016,"kind":"movie","tmdb_id":277834},
 {"title":"哪吒之魔童闹海","original":"Ne Zha 2","aliases":["哪吒之魔童闹海","哪吒2"],"year":2025,"kind":"movie","tmdb_id":980477}
]:
 for q in (work["title"]+" 预告",work["title"]):
  url=m.search_url("https://www.acfun.cn/rest/pc-direct/search/video",{"keyword":q,"page":1,"pageSize":20})
  item={"film":work["title"],"query":q}
  try:
   data=m.get_json(url,timeout=15)
   item["top_level_keys"]=list(data)[:16]
   results=data.get("videoList") or []
   item["returned"]=len(results)
   item["first"]=[{"title":v.get("title"),"dougaId":v.get("dougaId"),"titleMatched":m.matches_title(v.get("title"),work["aliases"],work["year"],work["kind"]),
                   "keywordMatched":bool(m.VIDEO_WORDS.search(str(v.get("title") or "")))} for v in results[:12] if isinstance(v,dict)]
   item["canUse"]=sum(bool(m.matches_title(v.get("title"),work["aliases"],work["year"],work["kind"]) and m.VIDEO_WORDS.search(str(v.get("title") or ""))) for v in results if isinstance(v,dict))
  except Exception as e:
   item["error"]=type(e).__name__+": "+str(e)[:150]
  rows.append(item);print("ACFUN_DIAG",json.dumps({k:v for k,v in item.items() if k!="first"},ensure_ascii=False),flush=True)
  if item.get("first"):print("ACFUN_SAMPLE",json.dumps(item["first"][:7],ensure_ascii=False),flush=True)
  Path("acfun-targeted-report.json").write_text(json.dumps(rows,ensure_ascii=False,indent=2))
  time.sleep(6)

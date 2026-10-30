import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from refresh_media_extra_videos import get_json,search_url
url=search_url("https://www.acfun.cn/rest/pc-direct/search/video",{"keyword":"海洋奇缘 预告","page":1,"pageSize":5})
data=get_json(url)
for i,row in enumerate(data.get("videoList",[])[:4]):
  fields={}
  for k,v in row.items():
    if k.lower() in ("cover","coverurl","pic","thumb","picurl","videoid","dougaid","id","aid","ac","contentid","resourceid","url","title","videoid","video_id","douga_id","contentid","douliaid") or any(key in k.lower() for key in ("id","url","link","acfun")):
      fields[k]=str(v)[:230] if not isinstance(v,(dict,list)) else str(type(v))
  print("ACFUN_SHAPE",json.dumps({"title":row.get("title"),"keys":list(row),"candidate_identifiers":fields},ensure_ascii=False),flush=True)

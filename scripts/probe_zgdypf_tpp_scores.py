#!/usr/bin/env python3
"""Read-only low-volume verification of a 2026 public China Film Box Office page.
No login, cookies, evasion or private APIs. 3 URLs only, 2 sec gap.
"""
import json, re, time, urllib.request, urllib.error

SAMPLES = [
    ("捕风追影", "https://zgdypf.zgdypw.cn/movie/detail/00102032025", "9.7"),
    ("浪浪山小妖怪", "https://zgdypf.zgdypw.cn/movie/detail/00102782025", "9.5"),
    ("拼桌", "https://zgdypf.zgdypw.cn/movie/detail/00100412025", None),
]

def verify(expected_name, url, expected_tpp):
    req = urllib.request.Request(url,headers={
        "User-Agent":"LiangYou-Media-API-Research/1.0 (public-readonly; low-rate)",
        "Accept":"text/html,application/xhtml+xml"})
    try:
        with urllib.request.urlopen(req,timeout=28) as r:
            html=r.read(1200000).decode("utf-8","replace")
            code=r.status
    except urllib.error.HTTPError as e:
        print("TPP_SCORE_PROBE "+json.dumps({"film":expected_name,"http":e.code,"error":"upstream_http"},ensure_ascii=False),flush=True);return
    except Exception as e:
        print("TPP_SCORE_PROBE "+json.dumps({"film":expected_name,"http":None,"error":type(e).__name__},ensure_ascii=False),flush=True);return
    state=None;needle="window.__INITIAL_STATE__=";pos=html.find(needle)
    if pos>=0:
        try:
            state=json.JSONDecoder().raw_decode(html[pos+len(needle):].lstrip())[0]
        except (json.JSONDecodeError,ValueError):pass
    info=state.get("movieInfoData",{}) if isinstance(state,dict) else {}
    scores=info.get("scores",[]) if isinstance(info,dict) else []
    sd={}
    for score in scores if isinstance(scores,list) else []:
        if isinstance(score,dict) and score.get("name") in ("猫眼购票评分","豆瓣评分","淘票票评分"):
            sd[score["name"]]=score.get("value")
    label_names=["猫眼购票评分","豆瓣评分","淘票票评分"]
    poslist=[html.find(x) for x in label_names]
    title=re.search(r"<title[^>]*>([^<]+)",html,re.I)
    first = {k:info.get(k) for k in ("name","pubDesc","scores") if k in info} if info else {}
    result={
        "film":expected_name,"url":url,"http":code,"bytes":len(html),
        "title":title.group(1)[:110] if title else None,
        "initial_state":bool(state),"movie_name":info.get("name") if info else None,
        "scores":sd,"score_labels_in_html":dict(zip(label_names,[p>=0 for p in poslist])),
        "movie_box_sum_count":len(state.get("movieBoxSum",[])) if state else 0,
        "valid_name":bool(info and info.get("name")==expected_name),
        "matches_expected_tpp":str(sd.get("淘票票评分"))==expected_tpp if expected_tpp else sd.get("淘票票评分") in (None,"","- -"),
    }
    print("TPP_SCORE_PROBE "+json.dumps(result,ensure_ascii=False),flush=True)

for i,s in enumerate(SAMPLES):
    verify(*s)
    if i<len(SAMPLES)-1:time.sleep(2)

#!/usr/bin/env python3
"""Free BALLDONTLIE NBA Games only. No paid standings, stats or live claims."""
from __future__ import annotations
import json, os
from datetime import timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from feed_common import ROOT, iso, now, write_json
OUT = ROOT / "data" / "nba-games.json"
URL = "https://api.balldontlie.io/v1/games"

def positive_int(v):
    if isinstance(v,bool) or v is None:return None
    try:return int(v) if 0 <= int(v) <= 999 else None
    except (ValueError,TypeError):return None

def parse_game(g,instant):
    if not isinstance(g,dict):return None
    home,away=g.get("home_team") or {},g.get("visitor_team") or {}
    if not isinstance(home,dict) or not isinstance(away,dict):return None
    title_h=str(home.get("full_name") or "").strip()
    title_a=str(away.get("full_name") or "").strip()
    key=g.get("id")
    if not title_h or not title_a or not isinstance(key,int):return None
    value=str(g.get("datetime") or g.get("date") or "")
    from feed_common import date
    start=date(value)
    if not start:
        # Some BDL date-only records have no authoritative kickoff: omit.
        return None
    if not instant-timedelta(days=3)<=start<=instant+timedelta(days=12):return None
    detail=str(g.get("status") or "").strip()
    scores=(positive_int(g.get("home_team_score")),positive_int(g.get("visitor_team_score")))
    has_result=all(v is not None for v in scores)
    if "final" in detail.lower() or detail.lower().startswith("finished"):status="finished"
    elif "q" in detail.lower() and any(c.isdigit() for c in detail) or "half" in detail.lower() or "ot" in detail.lower():status="live"
    elif has_result and scores!=(0,0) and start<instant-timedelta(hours=4):status="finished"
    else:status="scheduled"
    # Never synthesize a finished score if source still reports scheduled.
    if status=="finished" and not has_result:return None
    return {"id":"bdl-nba-"+str(key),"provider":"balldontlie","sport":"basketball",
       "league":"NBA","stage":str(g.get("postseason") and "Playoffs" or "Regular Season"),
       "start_time":iso(start),"status":status,"status_detail":detail[:45],
       "home":title_h,"away":title_a,
       "score_home":scores[0] if status!="scheduled" else None,
       "score_away":scores[1] if status!="scheduled" else None,
       "prominence":420,"source_url":"https://www.balldontlie.io/"}

def collect(key,instant):
    q={"start_date":(instant.date()-timedelta(days=2)).isoformat(),
       "end_date":(instant.date()+timedelta(days=9)).isoformat(),"per_page":100}
    events=[]
    for page in range(2):
        address=URL+"?"+urlencode(q)
        try:
            with urlopen(Request(address,headers={"Authorization":key,"Accept":"application/json",
                  "User-Agent":"LiangYou-ResourceHub/2.0"}),timeout=26) as rsp:
                blob=rsp.read(2000000)
            data=json.loads(blob)
        except HTTPError as exc:
            raise RuntimeError("BALLDONTLIE HTTP "+str(exc.code)) from None
        except (URLError,TimeoutError,ValueError) as exc:
            raise RuntimeError("BALLDONTLIE "+type(exc).__name__) from None
        if not isinstance(data,dict) or not isinstance(data.get("data"),list):
            raise RuntimeError("BALLDONTLIE Games payload invalid")
        events.extend(x for g in data["data"] if (x:=parse_game(g,instant)))
        cursor=(data.get("meta") or {}).get("next_cursor")
        if not cursor:break
        q["cursor"]=str(cursor)
    return list({x["id"]:x for x in events}.values())[:140]

def main():
    key=os.getenv("BALLDONTLIE_API_KEY","").strip()
    if not key:raise SystemExit("BALLDONTLIE key not configured")
    instant=now()
    matches=collect(key,instant)
    # A successful empty schedule is still a real verification.
    write_json(OUT,{"schema":1,"source_type":"nba_game_fixtures","generated_at":iso(instant),
      "status":"ok","source":"balldontlie","interval_hours":6,"events":matches})
    print("BALLDONTLIE NBA verified games:",len(matches),flush=True)

if __name__=="__main__":main()

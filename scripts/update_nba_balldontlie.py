#!/usr/bin/env python3
"""Verified NBA schedule from BALLDONTLIE free Games endpoint.

Does not claim provider standings or live real-time scores. Safe without an API key.
"""
from __future__ import annotations
from datetime import timedelta
import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from feed_common import ROOT, now, iso, read_json, write_json, date

OUT=ROOT/"data/nba-games.json"
ENDPOINT="https://api.balldontlie.io/v1/games"

def parse_game(g, instant):
    if not isinstance(g,dict) or not isinstance(g.get("id"),int):return None
    home,away=g.get("home_team") or {},g.get("visitor_team") or {}
    if not isinstance(home,dict) or not isinstance(away,dict):return None
    hn=str(home.get("full_name") or "").strip()
    an=str(away.get("full_name") or "").strip()
    ts=date(g.get("datetime"))
    if not hn or not an or not ts:return None # no fabricated tip-off times
    if not instant-timedelta(days=3)<=ts<=instant+timedelta(days=9):return None
    state=str(g.get("status_state") or "").lower()
    if state=="scheduled":status="scheduled"
    elif state=="in_progress":status="live"
    elif state=="final":status="finished"
    else:return None # postponed/canceled/suspended are not fixtures
    def points(v):
        return v if isinstance(v,int) and not isinstance(v,bool) and 0<=v<=250 else None
    hs=points(g.get("home_team_score")) if status!="scheduled" else None
    as_=points(g.get("visitor_team_score")) if status!="scheduled" else None
    if status=="finished" and (hs is None or as_ is None):return None
    return {"id":"bdl-nba-"+str(g["id"]),"provider":"balldontlie","sport":"basketball",
      "league":"NBA","stage":"Playoffs" if g.get("postseason") else "Regular Season",
      "start_time":iso(ts),"status":status,"status_detail":str(g.get("status") or "")[:40],
      "home":hn,"away":an,"score_home":hs,"score_away":as_,
      "home_code":str(home.get("abbreviation") or "")[:5],
      "away_code":str(away.get("abbreviation") or "")[:5],
      "best_of":None,"winner_id":None,"prominence":445,
      "source_url":"https://www.balldontlie.io/"}

def get_games(key, instant):
    args={"start_date":(instant-timedelta(days=2)).date().isoformat(),
          "end_date":(instant+timedelta(days=8)).date().isoformat(),"per_page":100}
    rows=[]; cursor=None
    for page in range(2): # Hard cap 2 calls per refresh; <= 8/day
        if cursor is not None:args["cursor"]=cursor
        url=ENDPOINT+"?"+urlencode(args)
        req=Request(url,headers={"Authorization":key,"Accept":"application/json",
          "User-Agent":"LiangYou-ResourceHub/3.0"})
        with urlopen(req,timeout=22) as response:
            raw=response.read(1300000)
        body=json.loads(raw)
        if not isinstance(body,dict) or not isinstance(body.get("data"),list):
            raise RuntimeError("BALLDONTLIE returned invalid data")
        rows.extend(body["data"])
        cursor=(body.get("meta") or {}).get("next_cursor")
        if not cursor:break
    events=[p for g in rows if (p:=parse_game(g,instant))]
    return sorted({p["id"]:p for p in events}.values(),key=lambda x:x["start_time"])[:150]

def main():
    instant=now();old=read_json(OUT);key=os.environ.get("BALLDONTLIE_API_KEY","").strip()
    events=[];state="not_configured" if not key else "unavailable"
    verified_at=None
    try:
        if key:
            events=get_games(key,instant)
            state="ok";verified_at=iso(instant)
    except Exception as exc:
        print("::warning::NBA data check unavailable:",type(exc).__name__,flush=True)
    if state=="unavailable":
        previous=date(old.get("verified_at"))
        if previous and timedelta(0)<=instant-previous<=timedelta(hours=24):
            events=old.get("events",[]);state="stale";verified_at=old.get("verified_at")
    write_json(OUT,{"schema":1,"source_type":"nba_fixtures","nba_source_version":1,
      "generated_at":iso(instant),"verified_at":verified_at,"status":state,
      "interval_hours":6,"sources":[{"tag":"balldontlie","status":state,
       "verified_at":verified_at,"count":len(events)}],"events":events})
    print("BALLDONTLIE NBA:",state,len(events),flush=True)

if __name__=="__main__":main()

#!/usr/bin/env python3
"""Bounded, official BALLDONTLIE NBA fixtures; optional account and fail-soft output."""
from __future__ import annotations
import json
import os
from datetime import timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from feed_common import ROOT, now, iso, date, read_json, write_json

OUT = ROOT / "data" / "nba-games.json"
ROOT_API = "https://api.balldontlie.io/v1/games"
UA = "LiangYou-ResourceHub/3.0 (+https://github.com/MaddestAlistar/LiangYou-ResourceHub)"
SCHEMA = 1

def valid_int(value):
    if isinstance(value, bool): return None
    try: v = int(value)
    except (ValueError, TypeError): return None
    return v if 0 <= v <= 400 else None

def match(row, instant):
    if not isinstance(row, dict) or not isinstance(row.get("id"), int): return None
    home, away = row.get("home_team"), row.get("visitor_team")
    if not isinstance(home, dict) or not isinstance(away, dict): return None
    if not home.get("full_name") or not away.get("full_name"): return None
    # Date-only fields do not provide a verifiable kickoff time.
    start = date(row.get("datetime"))
    if not start or not str(row.get("datetime", "")).endswith(("Z","+00:00")): return None
    if not instant-timedelta(days=3) <= start <= instant+timedelta(days=10): return None
    status = str(row.get("status") or "").strip().lower()
    # BALLDONTLIE may return a human-readable Final, quarter, or start time.
    if status.startswith(("final", "completed")): phase = "finished"
    elif any(t in status for t in ("q1","q2","q3","q4","halftime","half time","overtime","ot ","in progress","live")):
        phase = "live"
    elif status in ("postponed","canceled","cancelled","suspended"): return None
    elif status in ("scheduled","upcoming","not started","") or "et" in status or "pm" in status or "am" in status:
        phase = "scheduled"
    else: return None
    h, a = valid_int(row.get("home_team_score")), valid_int(row.get("visitor_team_score"))
    if phase == "finished" and (h is None or a is None): return None
    if phase == "scheduled": h = a = None
    stage = str(row.get("postseason") or "").lower()
    typ = str(row.get("season_type") or "").lower()
    label = "Playoffs" if stage == "true" or row.get("postseason") is True or typ == "playoffs" else "Regular Season"
    return {
        "id": "bdl-nba-" + str(row["id"]), "provider":"balldontlie", "sport":"basketball",
        "league":"NBA","stage":label, "start_time":iso(start),
        "status":phase,"status_detail":status[:40], "home":str(home["full_name"])[:80],
        "away":str(away["full_name"])[:80], "score_home":h,"score_away":a,
        "best_of":None,"winner_id":None,"prominence":410,
        "source_url":"https://www.balldontlie.io/"
    }

def collect(key, instant):
    params={"per_page":100,"start_date":(instant.date()-timedelta(days=2)).isoformat(),
            "end_date":(instant.date()+timedelta(days=8)).isoformat()}
    events=[]
    for page in range(2):
        req=Request(ROOT_API+"?"+urlencode(params),headers={"Authorization":key,"Accept":"application/json","User-Agent":UA})
        try:
            with urlopen(req,timeout=25) as resp:
                if int(resp.headers.get("Content-Length","0"))>3000000:raise ValueError("NBA response too large")
                body=resp.read(3000001)
                if len(body)>3000000:raise ValueError("NBA response too large")
                payload=json.loads(body)
        except HTTPError as exc:
            raise RuntimeError("NBA API HTTP "+str(exc.code)) from None
        except (URLError, TimeoutError):
            raise RuntimeError("NBA network failure") from None
        if not isinstance(payload,dict) or not isinstance(payload.get("data"),list):
            raise ValueError("NBA malformed API response")
        events.extend(v for row in payload["data"] if (v:=match(row,instant)))
        cursor=(payload.get("meta") or {}).get("next_cursor")
        if not cursor:break
        params["cursor"]=cursor
    unique={e["id"]:e for e in events}
    return sorted(unique.values(),key=lambda v:v["start_time"])

def main():
    instant=now()
    key=os.getenv("BALLDONTLIE_API_KEY","").strip()
    if not key:
        print("BALLDONTLIE_API_KEY missing; preserving previous NBA snapshot")
        return
    previous=read_json(OUT)
    try:
        events=collect(key,instant)
    except Exception as exc:
        print("::warning::BALLDONTLIE NBA unavailable:",type(exc).__name__,str(exc)[:90],flush=True)
        if previous.get("generated_at"):return
        return
    write_json(OUT,{"schema":SCHEMA,"source_type":"nba_fixtures","generated_at":iso(instant),
        "status":"ok","provider":"balldontlie","interval_hours":6,
        "sources":[{"tag":"balldontlie","status":"ok","count":len(events)}],"events":events})
    print("NBA: {} verified games".format(len(events)),flush=True)

if __name__=="__main__":main()

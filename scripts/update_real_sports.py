#!/usr/bin/env python3
"""Read-only, quota-limited official fixtures feed. Secrets never leave Actions."""
from __future__ import annotations
import datetime as dt
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from feed_common import ROOT, write_json

OUT = ROOT / "data" / "real-sports.json"
UTC = dt.timezone.utc
UA = "LiangYou-ResourceHub-Fixtures/1.0"
FOOTBALL = {"39":"Premier League","140":"La Liga","135":"Serie A",
            "78":"Bundesliga","2":"Champions League"}
FOOTBALL_ROOT = "https://v3.football.api-sports.io"
BASKET_ROOT = "https://v1.basketball.api-sports.io"
PANDA_ROOT = "https://api.pandascore.co"
# Fixed budget for each complete run: 5 football + 4 basketball + 3 PandaScore.
# At 6-hour intervals, at most 36 requests/day to API-Sports, 12 to PandaScore.
PANDA_ENDPOINTS = ("upcoming", "running", "past")

class UnavailableSeason(RuntimeError):
    """Current season inaccessible under the provider plan; do not retry all leagues."""

CURRENT_STATUSES = {"1H","2H","HT","ET","BT","P","Q1","Q2","Q3","Q4","OT","LIVE","IN"}
DONE_STATUSES = {"FT","AET","PEN","AOT","AFTER_OT","FINISHED"}
CANCELED_STATUSES = {"PST","CANC","SUSP","INT","ABD","AWD","POST"}


def timestamp(value):
    if isinstance(value,(int,float)) and value > 0:
        return dt.datetime.fromtimestamp(value,UTC)
    if not isinstance(value,str) or not value.strip():
        return None
    try:
        out = dt.datetime.fromisoformat(value.replace("Z","+00:00"))
        return out.astimezone(UTC) if out.tzinfo else None
    except ValueError:
        return None


def iso(v):
    return v.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00","Z")


def name(value):
    return str(value or "").strip()[:100]


def score(value):
    if isinstance(value,bool) or value is None:
        return None
    if isinstance(value,int) and 0 <= value <= 999:
        return value
    if isinstance(value,str) and re.fullmatch(r"\d{1,3}",value.strip()):
        return int(value)
    return None


def json_request(url,headers,timeout=18):
    req=Request(url,headers=headers)
    for attempt in range(2):
        try:
            with urlopen(req,timeout=timeout) as response:
                if int(response.headers.get("Content-Length","0")) > 4_000_000:
                    raise ValueError("Payload exceeds safe bound")
                raw=response.read(4_000_001)
                if len(raw)>4_000_000:
                    raise ValueError("Oversized payload")
                return json.loads(raw)
        except HTTPError as exc:
            if exc.code in (401,403,429):
                raise RuntimeError("API access, quota or plan limit (HTTP %s)"%exc.code) from None
            if attempt == 1: raise RuntimeError("API HTTP %s"%exc.code) from None
        except Exception:
            if attempt == 1: raise RuntimeError("Network or invalid API response") from None
        time.sleep(1)
    raise RuntimeError("Data request failed")


def sports_request(root,path,query,key):
    payload=json_request(root+"/"+path+"?"+urlencode(query),{
        "x-apisports-key":key,"Accept":"application/json","User-Agent":UA})
    if not isinstance(payload,dict) or not isinstance(payload.get("response"),list):
        raise ValueError("Invalid API-Sports format")
    errors=payload.get("errors")
    if isinstance(errors,dict) and errors or isinstance(errors,list) and errors:
        details=" ".join(str(v) for v in (errors.values() if isinstance(errors,dict) else errors)).lower()
        # Free football plans may not include the current season. One attempt
        # is enough to establish that; never spend 5 calls repeating denial.
        if "season" in details and any(x in details for x in
                ("plan","access","available","subscription","not allowed","not permitted")):
            raise UnavailableSeason("Current season not included in subscription")
        raise RuntimeError("API-Sports access, subscription or quota rejected")
    return payload["response"]


def football_row(raw,now):
    if not isinstance(raw,dict):return None
    fixture=raw.get("fixture") or {}
    teams=raw.get("teams") or {}
    goals=raw.get("goals") or {}
    league=raw.get("league") or {}
    status=(fixture.get("status") or {}).get("short")
    when=timestamp(fixture.get("date"))
    ident=fixture.get("id")
    home=teams.get("home") or {}; away=teams.get("away") or {}
    if not when or not isinstance(ident,int) or not home.get("name") or not away.get("name"):
        return None
    if not now-dt.timedelta(days=3) <= when <= now+dt.timedelta(days=12):
        return None
    st="finished" if status in DONE_STATUSES else "live" if status in CURRENT_STATUSES else "scheduled" if status in ("NS","TBD") else "other"
    if st=="other":return None
    home_score=score(goals.get("home")) if st!="scheduled" else None
    away_score=score(goals.get("away")) if st!="scheduled" else None
    return {"id":"football-"+str(ident),"provider":"api-sports",
            "sport":"football","league":name(league.get("name")),"stage":name(league.get("round")),
            "start_time":iso(when),"status":st,"status_detail":name((fixture.get("status") or {}).get("long")),
            "home":name(home["name"]),"away":name(away["name"]),
            "score_home":home_score,"score_away":away_score,
            "source_url": "https://www.api-football.com/"}


def basketball_row(raw,now):
    if not isinstance(raw,dict):return None
    ident=raw.get("id")
    game_date=raw.get("date")
    when=timestamp(game_date.get("start") if isinstance(game_date,dict) else game_date)
    league=raw.get("league") or {}
    teams=raw.get("teams") or {}
    home=teams.get("home") or {}; away=teams.get("away") or {}
    if not isinstance(ident,int) or not when or not home.get("name") or not away.get("name"):
        return None
    if not now-dt.timedelta(days=3) <= when <= now+dt.timedelta(days=12):return None
    competition=name(league.get("name"))
    if not re.search(r"\bNBA\b|\bWNBA\b|\bNCAA\b",competition,re.I):return None
    st_raw=(raw.get("status") or {})
    code=name(st_raw.get("short") if isinstance(st_raw,dict) else st_raw).upper()
    st="finished" if code in DONE_STATUSES else "live" if code in CURRENT_STATUSES else "scheduled" if code in ("NS","TBD") else "other"
    if st=="other":return None
    totals=raw.get("scores") or {}
    h=(totals.get("home") or {}); a=(totals.get("away") or {})
    return {"id":"basketball-"+str(ident),"provider":"api-sports",
            "sport":"basketball","league":competition,"stage":name(league.get("season")),
            "start_time":iso(when),"status":st,"status_detail":name(st_raw.get("long") if isinstance(st_raw,dict) else ""),
            "home":name(home["name"]),"away":name(away["name"]),
            "score_home":score(h.get("total")) if st!="scheduled" else None,
            "score_away":score(a.get("total")) if st!="scheduled" else None,
            "source_url":"https://www.api-basketball.com/"}


def pandascore_row(raw,now):
    if not isinstance(raw,dict):return None
    ident=raw.get("id")
    if not isinstance(ident,int):return None
    when=timestamp(raw.get("scheduled_at")) or timestamp(raw.get("begin_at"))
    if not when or not now-dt.timedelta(days=3)<=when<=now+dt.timedelta(days=15):
        return None
    videogame=raw.get("videogame") or {}
    rawgame=(name(videogame.get("slug"))+" "+name(videogame.get("name"))).lower()
    if "league-of-legends" in rawgame or rawgame.startswith("lol "):game="lol"
    elif "csgo" in rawgame or "counter-strike" in rawgame or "dota" in rawgame or "valorant" in rawgame:game="esports"
    else: return None
    opp=raw.get("opponents") or []
    if len(opp)!=2:return None
    teams=[(x.get("opponent") or {}) for x in opp if isinstance(x,dict)]
    if len(teams)!=2 or not all(x.get("name") for x in teams):return None
    status=name(raw.get("status")).lower()
    st="scheduled" if status in ("not_started","not started") else "live" if status=="running" else "finished" if status=="finished" else None
    if not st:return None
    scores=raw.get("results") or []
    score_by_team={x.get("team_id"): score(x.get("score")) for x in scores if isinstance(x,dict)}
    hscore=score_by_team.get(teams[0].get("id")) if st!="scheduled" else None
    ascore=score_by_team.get(teams[1].get("id")) if st!="scheduled" else None
    league=raw.get("league") or {}; tour=raw.get("tournament") or {}
    return {"id":"panda-"+str(ident),"provider":"pandascore","sport":game,
            "league":name(league.get("name")) or name(videogame.get("name")),
            "stage":name(tour.get("name")),
            "start_time":iso(when),"status":st,"status_detail":"",
            "home":name(teams[0]["name"]),"away":name(teams[1]["name"]),
            "score_home":hscore,"score_away":ascore,
            "best_of":raw.get("number_of_games") if type(raw.get("number_of_games")) is int and raw["number_of_games"] in (1,2,3,5,7) else None,
            "winner_id":raw.get("winner_id") if isinstance(raw.get("winner_id"),int) else None,
            "source_url":"https://www.pandascore.co/"}


def retrieve_api_sports(key,now):
    today=now.date()
    results=[]; failures=[]
    start=(today-dt.timedelta(days=1)).isoformat()
    end=(today+dt.timedelta(days=7)).isoformat()
    for league_id,league_title in FOOTBALL.items():
        try:
            rows=sports_request(FOOTBALL_ROOT,"fixtures",{"league":league_id,"season":str(today.year),
                       "from":start,"to":end},key)
            for raw in rows:
                match=football_row(raw,now)
                if match:results.append(match)
        except UnavailableSeason:
            failures.extend("football-"+k for k in FOOTBALL if "football-"+k not in failures)
            print("API-Sports football: current season unavailable on subscribed plan; skipping remaining leagues",flush=True)
            break
        except Exception:
            failures.append("football-"+league_id)
    for offset in (-1,0,1,2):
        day=(today+dt.timedelta(days=offset)).isoformat()
        try:
            rows=sports_request(BASKET_ROOT,"games",{"date":day},key)
            for raw in rows:
                match=basketball_row(raw,now)
                if match:results.append(match)
        except Exception:
            failures.append("basketball-"+str(offset))
    if len(failures)==9:
        raise RuntimeError("All API-Sports fixtures requests failed (check subscription/region/quota)")
    return results,failures


def retrieve_pandascore(key,now):
    results=[];failures=[]
    for path in PANDA_ENDPOINTS:
        try:
            raw=json_request(PANDA_ROOT+"/matches/"+path+"?"+urlencode({
                "page[size]":100,"page[number]":1,
                "sort":"begin_at" if path!="past" else "-begin_at"}),
                {"Authorization":"Bearer "+key,"Accept":"application/json","User-Agent":UA})
            if not isinstance(raw,list):raise ValueError("PandaScore matches must be a list")
            for row in raw:
                match=pandascore_row(row,now)
                if match:results.append(match)
        except Exception:
            failures.append(path)
    if len(failures)==3:
        raise RuntimeError("All PandaScore match endpoints failed (check key, plan or quota)")
    return results,failures


def main():
    now=dt.datetime.now(UTC)
    events={};sources=[]
    pairs=(("api-sports","API_SPORTS_KEY",retrieve_api_sports),
           ("pandascore","PANDASCORE_API_TOKEN",retrieve_pandascore))
    for provider,keyname,func in pairs:
        secret=os.environ.get(keyname,"").strip()
        if not secret:
            sources.append({"tag":provider,"status":"unavailable","count":0,
                            "reason":"GitHub Actions secret not available"})
            print("Official fixtures: "+provider+" key unavailable",flush=True)
            continue
        try:
            matches,failed=func(secret,now)
            for event in matches:events[event["id"]]=event
            sources.append({"tag":provider,"status":"partial" if failed else "ok",
                            "count":len(matches),"failed_groups":len(failed)})
            print("Official fixtures: "+provider+" returned "+str(len(matches))+
                  " usable matches; failed groups="+str(len(failed)),flush=True)
        except Exception:
            sources.append({"tag":provider,"status":"unavailable","count":0,
                            "reason":"Provider request failed"})
            print("Official fixtures: "+provider+" unavailable; credentials not logged",flush=True)
    if all(src["status"]=="unavailable" for src in sources):
        raise RuntimeError("No verified official fixture source; previous snapshot preserved")
    # Bound by sport AND match state, so live activity cannot crowd out the
    # upcoming schedule or the recent finished scores.
    ranked={"live":0,"scheduled":1,"finished":2}
    ordered=sorted(events.values(),key=lambda x:(ranked.get(x["status"],3),
                  x["start_time"] if x["status"]!="finished" else
                  iso(dt.datetime(1970,1,1,tzinfo=UTC)+
                    (dt.datetime(2100,1,1,tzinfo=UTC)-timestamp(x["start_time"]))),
                  x["id"]))
    status_limits={"live":18,"scheduled":26,"finished":16}
    by_bucket={};selected=[]
    for event in ordered:
        key=(event["sport"],event["status"])
        by_bucket[key]=by_bucket.get(key,0)+1
        if by_bucket[key]<=status_limits[event["status"]]:
            selected.append(event)
    output={"schema":1,"source_type":"official_fixtures","generated_at":iso(now),
            "interval_hours":6,"sources":sources,"status":"ok" if all(src["status"]=="ok" for src in sources) else "partial",
            "events":selected,
            "notes":"Verified provider schedules and reported scores; 6-hour snapshots are not real-time. Missing scores are shown as pending."}
    write_json(OUT,output)
    print("Official fixtures published: "+str(len(selected)),flush=True)


if __name__=="__main__":
    main()

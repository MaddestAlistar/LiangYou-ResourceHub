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
    tournament_id=tour.get("id") if isinstance(tour.get("id"),int) else None
    return {"id":"panda-"+str(ident),"provider":"pandascore","sport":game,
            "league":name(league.get("name")) or name(videogame.get("name")),
            "stage":name(tour.get("name")),
            "tournament_id":tournament_id,
            "tournament_name":name(tour.get("name")),
            "start_time":iso(when),"status":st,"status_detail":"",
            "home":name(teams[0]["name"]),"away":name(teams[1]["name"]),
            "score_home":hscore,"score_away":ascore,
            "best_of":raw.get("number_of_games") if type(raw.get("number_of_games")) is int and raw["number_of_games"] in (1,2,3,5,7) else None,
            "winner_id":raw.get("winner_id") if isinstance(raw.get("winner_id"),int) else None,
            "source_url":"https://www.pandascore.co/"}


def positive_int(value):
    return value if type(value) is int and 0 <= value <= 10000 else None


def official_bracket(raw,tournament_id,label):
    """Extract identifiable real fixtures from provider bracket tree.
    Do not fabricate rounds, opponents or advancement from incomplete nodes.
    """
    if not isinstance(raw,(list,dict)):
        return None
    rounds={}
    seen=set()
    scanned=0
    def visit(node,depth=0,parent_round=""):
        nonlocal scanned
        if depth>9 or scanned>900:return
        if isinstance(node,list):
            for item in node[:120]:visit(item,depth+1,parent_round)
            return
        if not isinstance(node,dict):return
        scanned+=1
        round_label=name(node.get("round_name") or node.get("round") or
                         node.get("stage") or node.get("name") or parent_round)
        if isinstance(node.get("round_number"),int) and not round_label:
            round_label="Round "+str(node["round_number"])
        opponents=node.get("opponents")
        if not isinstance(opponents,list):
            opponents=node.get("teams") if isinstance(node.get("teams"),list) else None
        if isinstance(opponents,list) and len(opponents)==2:
            teams=[]
            for obj in opponents:
                if not isinstance(obj,dict):continue
                target=obj.get("opponent") if isinstance(obj.get("opponent"),dict) else obj
                if target and target.get("name"):teams.append(name(target["name"]))
            if len(teams)==2:
                ident=str(node.get("id") or node.get("match_id") or "")
                identifier=ident if ident else "|".join(teams)
                if identifier not in seen:
                    seen.add(identifier)
                    if not round_label:round_label="Bracket"
                    score_items=node.get("results") or []
                    score_map={item.get("team_id"):positive_int(item.get("score"))
                               for item in score_items if isinstance(item,dict)}
                    a_id=(opponents[0].get("opponent") or opponents[0]).get("id")
                    b_id=(opponents[1].get("opponent") or opponents[1]).get("id")
                    scores=[score_map.get(a_id),score_map.get(b_id)]
                    match={"home":teams[0],"away":teams[1],
                           "score_home":scores[0],"score_away":scores[1]}
                    # Winner only if the API explicitly supplies a verified ID.
                    winner=node.get("winner_id")
                    if winner in (a_id,b_id) and type(winner) is int:
                        match["winner"]=teams[0] if winner==a_id else teams[1]
                    rounds.setdefault(round_label,[]).append(match)
        for key in ("brackets","rounds","matches","games","nodes","children","groups","tree"):
            value=node.get(key)
            if isinstance(value,(list,dict)):visit(value,depth+1,round_label)
    visit(raw)
    cards=[{"round":rnd,"matches":matches[:12]} for rnd,matches in rounds.items()][:10]
    if not cards:return None
    return {"tournament_id":tournament_id,"title":label,"rounds":cards,
            "provider":"pandascore"}


def panda_standings(raw,tournament_id,label):
    if not isinstance(raw,list):return None
    entries=[]
    def extract(value,depth=0):
        if depth>3:return
        if isinstance(value,list):
            for el in value[:150]:extract(el,depth+1)
            return
        if not isinstance(value,dict):return
        team=value.get("team") or value.get("opponent")
        if isinstance(team,dict) and team.get("name"):
            rank=value.get("rank",value.get("position"))
            rank=positive_int(rank)
            wins=positive_int(value.get("wins",value.get("win")))
            losses=positive_int(value.get("losses",value.get("loss")))
            if rank is not None:
                entries.append({"rank":rank,"team":name(team["name"]),
                                "wins":wins,"losses":losses,
                                "group":name(value.get("group", ""))})
            return
        for key in ("standings","groups","rows","teams","results"):
            if isinstance(value.get(key),(list,dict)):
                extract(value[key],depth+1)
    extract(raw)
    entries=sorted(entries,key=lambda x:(x["group"],x["rank"]))
    if not entries:return None
    return {"id":"panda-"+str(tournament_id),"title":label,"kind":"esports",
            "provider":"pandascore","groups":entries[:50]}


def nba_standings(key,now):
    # The documented NBA basketball league ID is 12; verify returned league
    # metadata when available, and never manufacture a standings row.
    season=(now.year if now.month>=7 else now.year-1)
    season_label=str(season)+"-"+str(season+1)
    rows=sports_request(BASKET_ROOT,"standings",{"league":12,"season":season_label},key)
    flat=[]
    def visit(x,depth=0):
        if depth>3:return
        if isinstance(x,list):
            for y in x[:250]:visit(y,depth+1)
            return
        if not isinstance(x,dict):return
        team=x.get("team") or {}
        if not isinstance(team,dict) or not team.get("name"):return
        rank=positive_int(x.get("position"))
        if rank is None:return
        group=x.get("group") or {}
        groupname=name(group.get("name") if isinstance(group,dict) else group)
        if groupname not in ("Eastern Conference","Western Conference"):
            return
        data=x.get("games") or {}
        win=data.get("win") if isinstance(data,dict) else None
        lose=data.get("lose") if isinstance(data,dict) else None
        if isinstance(win,dict):win=win.get("total")
        if isinstance(lose,dict):lose=lose.get("total")
        flat.append({"rank":rank,"team":name(team["name"]),
                     "group":groupname,"wins":positive_int(win),
                     "losses":positive_int(lose)})
    visit(rows)
    if not flat:return None
    return {"id":"nba-"+season_label,"title":"NBA "+season_label,
            "provider":"api-sports","kind":"basketball",
            "groups":sorted(flat,key=lambda x:(x["group"],x["rank"]))[:36]}


def tournament_extras(matches,key):
    # Only two distinct relevant tournaments per collection. Four additional
    # requests at most (brackets + standings), even with many Panda matches.
    candidates={}
    for m in matches:
        tid=m.get("tournament_id")
        if type(tid) is not int or m.get("provider")!="pandascore":continue
        title=m.get("tournament_name") or m.get("league") or ""
        if tid not in candidates:
            priority=(0 if m.get("sport")=="lol" else 2)
            combined=(m.get("league","")+" "+title).lower()
            if any(x in combined for x in ("worlds","msi","lpl","lck","international")):
                priority-=1
            candidates[tid]=(priority,title)
    selected=sorted(candidates,key=lambda tid:(candidates[tid][0],tid))[:2]
    brackets=[];standings=[];errors=0
    headers={"Authorization":"Bearer "+key,"Accept":"application/json","User-Agent":UA}
    for tid in selected:
        title=candidates[tid][1]
        for kind in ("brackets","standings"):
            try:
                url=PANDA_ROOT+"/tournaments/"+str(tid)+"/"+kind+"?"+urlencode({"page[size]":100,"page[number]":1})
                raw=json_request(url,headers)
                normalized=(official_bracket(raw,tid,title) if kind=="brackets"
                            else panda_standings(raw,tid,title))
                if normalized:
                    (brackets if kind=="brackets" else standings).append(normalized)
            except Exception:
                errors+=1
    print("PandaScore tournament details: %d brackets, %d standings, %d request failures" %
          (len(brackets),len(standings),errors),flush=True)
    return brackets,standings


def retrieve_api_sports(key,now):
    today=now.date()
    results=[]; failures=[]
    start=(today-dt.timedelta(days=1)).isoformat()
    end=(today+dt.timedelta(days=7)).isoformat()
    # Current-season football access is often absent on the free tier;
    # probe one league only. It must not exhaust the request budget.
    for league_id,league_title in list(FOOTBALL.items())[:1]:
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
    for offset in (0,1,2,3,4,5,6):
        day=(today+dt.timedelta(days=offset)).isoformat()
        try:
            rows=sports_request(BASKET_ROOT,"games",{"date":day},key)
            for raw in rows:
                match=basketball_row(raw,now)
                if match:results.append(match)
        except Exception:
            failures.append("basketball-"+str(offset))
    if len(failures)==8:
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
    events={};sources=[];brackets=[];standings=[]
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
            if provider=="pandascore":
                b,t=tournament_extras(matches,secret)
                brackets.extend(b);standings.extend(t)
            elif provider=="api-sports":
                try:
                    nba=nba_standings(secret,now)
                    if nba:standings.append(nba)
                except Exception:
                    print("NBA standings not available on current plan; keeping calendar data",flush=True)
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
                  -timestamp(x["start_time"]).timestamp() if x["status"]=="finished"
                  else timestamp(x["start_time"]).timestamp(),
                  x["id"]))
    status_limits={"live":18,"scheduled":26,"finished":16}
    by_bucket={};selected=[]
    for event in ordered:
        key=(event["sport"],event["status"])
        by_bucket[key]=by_bucket.get(key,0)+1
        if by_bucket[key]<=status_limits[event["status"]]:
            selected.append(event)
    output={"schema":1,"source_type":"official_fixtures","generated_at":iso(now),
            "interval_hours":6,"sources":sources,
            "status":"ok" if all(src["status"]=="ok" for src in sources) else "partial",
            "events":selected,"brackets":brackets[:2],"standings":standings[:3],
            "notes":"Verified schedules, provider bracket trees and standings. No live score display; updates roughly every six hours."}
    write_json(OUT,output)
    print("Official fixtures published: "+str(len(selected)),flush=True)


if __name__=="__main__":
    main()

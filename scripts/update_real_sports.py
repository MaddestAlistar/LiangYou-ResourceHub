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
PANDA_LOL_MATCHES = ("upcoming", "past")
PANDA_LOL_TOURNAMENTS = ("running", "past")
# Safe per-cycle cap: 3 all-game match + 2 LoL match + 2 LoL
# tournament discovery + up to 5 brackets + 6 tables = 18 Panda calls.
# At 6h cadence this stays <= 72 read requests/day (without retries).
# Keep a bounded set of current-phase records; priority stages receive reserved slots.
# About 23 PandaScore read requests per full refresh at the maximum, before retries.
MAX_BRACKET_REQUESTS = 6
MAX_STANDINGS_REQUESTS = 10

def popularity(league, stage="", sport=""):
    """Editorial prominence ordering, NOT a claim of real viewer traffic."""
    s=(str(league)+" "+str(stage)).lower()
    if sport=="lol":
        base=100
        if re.search(r"worlds|world championship|全球总决赛",s):return 500
        if re.search(r"mid.season|\bmsi\b",s):return 460
        if re.search(r"\blpl\b|\blck\b",s):
            return 275 if re.search(r"challenger|academy|youth|次级|青训",s) else 430
        if re.search(r"\blec\b|\blcs\b|\blcp\b|\bfirst stand\b",s):return 385
        return 290
    if re.search(r"\bnba\b",s):return 410
    if re.search(r"champions league|欧冠|premier league|英超",s):return 390
    if re.search(r"vct|valorant champions|\bmasters\b|\bmajor\b|international|\bti\b",s):return 325
    if re.search(r"pgl|blast|esl pro|iem|dreamleague",s):return 310
    return 220 if sport=="basketball" else 160 if sport=="football" else 90


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
            "prominence":popularity(league.get("name"),league.get("round"),"football"),
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
            "prominence":popularity(competition,"","basketball"),
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
            "prominence":popularity(league.get("name"),tour.get("name"),game),
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
        # PandaScore nodes often use individual match titles such as
        # "Semifinal 2: A vs B". Group by actual knockout round instead.
        raw_round=round_label.lower()
        lower=raw_round
        numbered_round=re.search(r"\b(?:upper|lower|winners?|losers?)\s+bracket\s+round\s+(\d+)\b",raw_round)
        if numbered_round:
            # A match title such as "Lower bracket round 1 match 2: A vs B"
            # must be grouped with round 1, not shown in its own column.
            round_label="Round "+numbered_round.group(1)
        elif "grand final" in lower or re.search(r"\bfinal\b",lower):
            round_label="Final"
        elif "semifinal" in lower or "semi-final" in lower:
            round_label="Semifinals"
        elif "quarterfinal" in lower or "quarter-final" in lower:
            round_label="Quarterfinals"
        elif "round of 16" in lower or "last 16" in lower:
            round_label="Round of 16"
        elif isinstance(node.get("round_number"),int) and not round_label:
            round_label="Round "+str(node["round_number"])
        # Do not collapse upper/lower semifinals or finals into a single column.
        if re.search(r"lower|loser|败者",raw_round):
            round_label="Lower Bracket / "+round_label
        elif re.search(r"upper|winner|胜者",raw_round):
            round_label="Upper Bracket / "+round_label
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
                    if scores==[0,0] and not node.get("winner_id"):
                        scores=[None,None]
                    match={"home":teams[0],"away":teams[1],
                           "score_home":scores[0],"score_away":scores[1]}
                    # Preserve provider IDs and upstream winner/loser lineage.
                    # Never infer a double-elimination transition from a team name alone.
                    if ident: match["match_id"]=ident
                    prior=node.get("previous_matches")
                    if isinstance(prior,list):
                        refs=[]
                        for p in prior[:4]:
                            if not isinstance(p,dict):continue
                            p_id=p.get("match_id")
                            flow=str(p.get("type") or "").lower()
                            if isinstance(p_id,(int,str)) and str(p_id).strip() and flow in ("winner","loser"):
                                refs.append({"match_id":str(p_id),"type":flow})
                        if refs:match["previous_matches"]=refs
                    rtype=name(node.get("bracket_type") or node.get("bracket") or node.get("type")).lower()
                    if rtype in ("upper","lower","winners","losers","winner","loser"):
                        match["bracket_side"]="lower" if rtype in ("lower","losers","loser") else "upper"
                    elif "lower" in lower or "loser" in lower:match["bracket_side"]="lower"
                    elif "upper" in lower or "winner" in lower:match["bracket_side"]="upper"
                    best_of=positive_int(node.get("number_of_games"))
                    if best_of in (1,2,3,5,7):match["best_of"]=best_of
                    match_date=timestamp(node.get("scheduled_at") or node.get("begin_at"))
                    if match_date:match["start_time"]=iso(match_date)
                    # Winner only if the API explicitly supplies a verified ID.
                    winner=node.get("winner_id")
                    if winner in (a_id,b_id) and type(winner) is int:
                        match["winner"]=teams[0] if winner==a_id else teams[1]
                    rounds.setdefault(round_label,[]).append(match)
        for key in ("brackets","rounds","matches","games","nodes","children","groups","tree"):
            value=node.get(key)
            if isinstance(value,(list,dict)):visit(value,depth+1,round_label)
    visit(raw)
    order={"Round of 16":1,"Quarterfinals":2,"Semifinals":3,"Final":4}
    cards=[{"round":rnd,"matches":matches[:12]}
           for rnd,matches in sorted(rounds.items(),key=lambda item:
               (order.get(item[0],9),item[0]))][:12]
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
        if not team and isinstance(value.get("opponent"),dict):
            team=value["opponent"]
        if isinstance(team,dict) and team.get("name"):
            rank=value.get("rank",value.get("position"))
            rank=positive_int(rank)
            wins=positive_int(value.get("wins",value.get("win")))
            losses=positive_int(value.get("losses",value.get("loss")))
            if rank is not None:
                entries.append({"rank":rank,"team":name(team["name"]),
                                "wins":wins,"losses":losses,
                                "group":name(value.get("group", {}).get("name", "") if isinstance(value.get("group"),dict) else value.get("group", ""))})
            return
        for key in ("standings","groups","rows","teams","results","rankings","participants","entries"):
            if isinstance(value.get(key),(list,dict)):
                extract(value[key],depth+1)
    extract(raw)
    entries=sorted(entries,key=lambda x:(x["group"],x["rank"]))
    if not entries:return None
    league=label.split(" · ")[0].strip()
    stage=label.split(" · ",1)[1].strip() if " · " in label else ""
    phase_group=""
    if re.search(r"legend group",stage,re.I):phase_group="Legend Group"
    elif re.search(r"rise group",stage,re.I):phase_group="Rise Group"
    elif re.search(r"group ascend",stage,re.I):phase_group="Group Ascend"
    elif re.search(r"group nirvana",stage,re.I):phase_group="Group Nirvana"
    if phase_group:
        for e in entries:
            if not e["group"]:e["group"]=phase_group
    return {"id":"panda-"+str(tournament_id),"title":label,"kind":"esports",
            "provider":"pandascore","league":league,"stage":stage,
            "phase_group":phase_group,"groups":entries[:50]}


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


def discover_lol_tournaments(key,now):
    """Discover running and recent historical league phases with bounded pagination.

    PandaScore's general top-match discovery can omit quieter sister groups.
    Check up to two recent past pages so LCK Rise / LPL Nirvana can be found.
    """
    found=[]
    seen=set()
    headers={"Authorization":"Bearer "+key,"Accept":"application/json","User-Agent":UA}
    for period in PANDA_LOL_TOURNAMENTS:
        for page in range(1,3 if period=="past" else 2):
            try:
                url=PANDA_ROOT+"/lol/tournaments/"+period+"?"+urlencode({
                    "page[size]":100,"page[number]":page,
                    "sort":"-end_at" if period=="past" else "-begin_at"})
                payload=json_request(url,headers)
                if not isinstance(payload,list) or not payload:break
                historic=0
                for row in payload:
                    if not isinstance(row,dict) or not isinstance(row.get("id"),int):continue
                    if row["id"] in seen:continue
                    stage=name(row.get("name")).lower()
                    is_group=any(word in stage for word in
                                 ("group","swiss","regular","round robin","league phase"))
                    if row.get("has_bracket") is not True and not is_group:continue
                    end=timestamp(row.get("end_at"))
                    start=timestamp(row.get("begin_at"))
                    if end and end < now-dt.timedelta(days=150):
                        historic+=1
                        continue
                    if start and start > now+dt.timedelta(days=45):continue
                    league=row.get("league") or {}
                    label=name(league.get("name") if isinstance(league,dict) else "") or "英雄联盟"
                    title=name(row.get("name")) or "淘汰赛"
                    seen.add(row["id"])
                    found.append({"tournament_id":row["id"],"sport":"lol",
                        "league":label,"tournament_name":title,
                        "has_bracket":row.get("has_bracket") is True,
                        "start_time":iso(start or end) if (start or end) else None,
                        "source":"tournament"})
                if period=="past" and (len(payload)<100 or historic>60):break
            except Exception:
                print("PandaScore LoL tournament discovery: %s page %d unavailable"%(period,page),flush=True)
                break
    return found


def tournament_extras(matches,key,discoveries=None):
    """Query bounded high-profile LoL and other esports, without inventing tables."""
    candidates={}
    for m in list(matches)+list(discoveries or []):
        tid=m.get("tournament_id")
        if type(tid) is not int:continue
        league=m.get("league") or ""
        stage=m.get("tournament_name") or ""
        label=name(league+" · "+stage) if stage else name(league)
        knockout=any(k in stage.lower() for k in
                     ("playoff","elimination","knockout","final","quarter","semi"))
        knockout=knockout or m.get("has_bracket") is True
        regular=any(k in stage.lower() for k in
                    ("regular","group","swiss","league","week","qualifier"))
        priority=popularity(league,stage,m.get("sport"))
        # A discovered tournament explicitly marked has_bracket is preferable
        # to a guessed knockout event whose provider might have no bracket.
        point=timestamp(m.get("start_time") or m.get("begin_at") or m.get("end_at"))
        recent=point.timestamp() if point else 0
        value={"priority":priority,"title":label,"sport":m.get("sport"),
               "bracket":knockout,"ranking":regular,"league":league,
               "recent":recent}
        if tid not in candidates or value["priority"]>candidates[tid]["priority"]:
            candidates[tid]=value
        else:
            candidates[tid]["bracket"] |= knockout
            candidates[tid]["ranking"] |= regular
            candidates[tid]["recent"]=max(candidates[tid]["recent"],recent)
    # Within the same league priority, prefer the latest confirmed tournament
    # rather than the smallest (often oldest) PandaScore identifier.
    order=lambda tid:(-candidates[tid]["priority"],-candidates[tid]["recent"],-tid)
    ranked_candidates=sorted(candidates,key=order)
    def spread_by_league(ids,limit):
        """Prioritize distinct competitions; fill unused slots with next valid stages."""
        chosen=[];seen=set()
        for tid in ids:
            key=re.sub(r"[^a-z0-9]+","",name(candidates[tid].get("league")).lower())
            if key not in seen:
                chosen.append(tid)
                seen.add(key)
                if len(chosen)>=limit:return chosen
        for tid in ids:
            if tid not in chosen:
                chosen.append(tid)
                if len(chosen)>=limit:break
        return chosen
    # Feature the real LCK/LPL playoffs above older Road to MSI/Play-In events.
    # Still show only published provider bracket nodes, never fabricated pairings.
    def bracket_rank(tid):
        item=candidates[tid]
        title=(item["league"]+" "+item["title"]).lower()
        bonus=0
        if re.search(r"worlds|world championship",title) and re.search(r"knockout|playoffs",title):
            bonus=250
        elif re.search(r"\blck\b",title) and re.search(r"playoffs",title):
            bonus=240
        elif re.search(r"\blpl\b",title) and re.search(r"playoffs",title):
            bonus=235
        elif re.search(r"\blck\b",title) and "road to msi" in title:
            bonus=-140
        return item["priority"]+bonus
    # Keep at least one other-esports bracket when available, even during Worlds.
    bracket_pool=sorted([tid for tid in ranked_candidates if candidates[tid]["bracket"]],
                        key=lambda tid:(-bracket_rank(tid),tid))
    other_bracket=[tid for tid in bracket_pool if candidates[tid]["sport"]=="esports"]
    lol_bracket=[tid for tid in bracket_pool if candidates[tid]["sport"]=="lol"]
    bracket_choices=spread_by_league(lol_bracket,MAX_BRACKET_REQUESTS-(1 if other_bracket else 0))
    if other_bracket:bracket_choices+=spread_by_league(other_bracket,1)
    if len(bracket_choices)<MAX_BRACKET_REQUESTS:
        bracket_choices+= [tid for tid in bracket_pool if tid not in bracket_choices][:
            MAX_BRACKET_REQUESTS-len(bracket_choices)]
    # Reserve complete paired league groups BEFORE popularity-based allocation.
    # A Legend/Ascend table alone must never consume all available LCK/LPL slots.
    rank_pool=[tid for tid in ranked_candidates if candidates[tid]["ranking"]]
    def phase_key(tid):
        v=candidates[tid]
        title=(v["league"]+" "+v["title"]).lower()
        if re.search(r"\blck\b",title) and not re.search(r"challenger|academy|youth",title):
            if "legend group" in title:return "lck_legend"
            if "rise group" in title:return "lck_rise"
        if re.search(r"\blpl\b",title):
            if "group ascend" in title:return "lpl_ascend"
            if "group nirvana" in title:return "lpl_nirvana"
        if re.search(r"worlds|world championship",title) and re.search(r"group|swiss",title):
            return "worlds_swiss"
        return ""
    priority_keys=("lck_legend","lck_rise","lpl_ascend","lpl_nirvana","worlds_swiss")
    rank_choices=[]
    for phase_name in priority_keys:
        chosen=next((tid for tid in rank_pool if phase_key(tid)==phase_name),None)
        if chosen is not None and chosen not in rank_choices:rank_choices.append(chosen)
    others=[tid for tid in rank_pool if candidates[tid]["sport"]!="lol"]
    for tid in spread_by_league(others,2):
        if tid not in rank_choices and len(rank_choices)<MAX_STANDINGS_REQUESTS:rank_choices.append(tid)
    for tid in spread_by_league(rank_pool,MAX_STANDINGS_REQUESTS):
        if tid not in rank_choices and len(rank_choices)<MAX_STANDINGS_REQUESTS:rank_choices.append(tid)
    for tid in rank_pool:
        if len(rank_choices)>=MAX_STANDINGS_REQUESTS:break
        if tid not in rank_choices:rank_choices.append(tid)
    brackets=[];standings=[];errors=0
    headers={"Authorization":"Bearer "+key,"Accept":"application/json","User-Agent":UA}
    blocked=False
    for kind,ids in (("brackets",bracket_choices),("standings",rank_choices)):
        if blocked:break
        for tid in ids:
            label=candidates[tid]["title"]
            try:
                url=PANDA_ROOT+"/tournaments/"+str(tid)+"/"+kind+"?"+urlencode(
                    {"page[size]":100,"page[number]":1})
                raw=json_request(url,headers)
                value=(official_bracket(raw,tid,label) if kind=="brackets"
                       else panda_standings(raw,tid,label))
                if value:
                    value["sport"]=candidates[tid]["sport"]
                    value["prominence"]=candidates[tid]["priority"]
                    (brackets if kind=="brackets" else standings).append(value)
            except Exception as exc:
                errors+=1
                # Never print tokens, URL query parameters or raw API bodies.
                reason=str(exc)
                status=next((code for code in ("401","403","429","404","422")
                             if "HTTP "+code in reason),None)
                if status:
                    print("PandaScore %s detail endpoint: HTTP %s" % (kind,status),flush=True)
                else:
                    print("PandaScore %s detail endpoint: request rejected (%s)" %
                          (kind,type(exc).__name__),flush=True)
                # When the endpoint is denied, additional detail requests only
                # waste the subscription's rate budget. Keep prior verified data.
                if status in ("401","403","429"):
                    blocked=True
                    print("PandaScore detail circuit breaker activated",flush=True)
                    break
    brackets.sort(key=lambda x:(-x["prominence"],
                               -candidates[x["tournament_id"]]["recent"],-x["tournament_id"]))
    standings.sort(key=lambda x:(-x["prominence"],
                                -candidates[int(x["id"].removeprefix("panda-"))]["recent"],x["id"]))
    print("PandaScore details: %d knockout brackets, %d standings, %d failed requests" %
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
    for path in PANDA_ENDPOINTS + tuple("lol/matches/"+x for x in PANDA_LOL_MATCHES):
        try:
            raw=json_request(PANDA_ROOT+"/"+("matches/"+path if "/" not in path else path)+"?"+urlencode({
                "page[size]":100,"page[number]":1,
                "sort":"begin_at" if not path.endswith("past") else "-begin_at"}),
                {"Authorization":"Bearer "+key,"Accept":"application/json","User-Agent":UA})
            if not isinstance(raw,list):raise ValueError("PandaScore matches must be a list")
            for row in raw:
                match=pandascore_row(row,now)
                if match:results.append(match)
        except Exception:
            failures.append(path)
    if len(failures)==len(PANDA_ENDPOINTS)+len(PANDA_LOL_MATCHES):
        raise RuntimeError("All PandaScore match endpoints failed (check key, plan or quota)")
    return results,failures


def collect_stage_matches(key,tournament_id):
    """Optional bounded provider history for round-by-round Swiss diagrams.

    The provider's explicit round number is kept if present; never infer a
    round or winner from a standings table. Failure leaves normal feeds intact.
    """
    headers={"Authorization":"Bearer "+key,"Accept":"application/json","User-Agent":UA}
    url=PANDA_ROOT+"/tournaments/"+str(tournament_id)+"/matches?"+urlencode({
        "page[size]":100,"page[number]":1,"sort":"-begin_at"})
    raw=json_request(url,headers)
    if not isinstance(raw,list):return []
    output=[]
    seen=set()
    for match in raw[:100]:
        if not isinstance(match,dict) or type(match.get("id")) is not int:continue
        if match["id"] in seen:continue
        seen.add(match["id"])
        opponents=match.get("opponents") or []
        if not isinstance(opponents,list) or len(opponents)!=2:continue
        teams=[x.get("opponent") or {} for x in opponents if isinstance(x,dict)]
        if len(teams)!=2 or not all(isinstance(x,dict) and x.get("name") for x in teams):continue
        when=timestamp(match.get("scheduled_at")) or timestamp(match.get("begin_at"))
        if not when:continue
        state=name(match.get("status")).lower()
        status={"finished":"finished","running":"live","not_started":"scheduled"}.get(state)
        if not status:continue
        results=match.get("results") or []
        scoring={x.get("team_id"):score(x.get("score"))
                 for x in results if isinstance(x,dict)}
        winner_id=match.get("winner_id")
        winner=next((name(x["name"]) for x in teams if x.get("id")==winner_id),None) if type(winner_id) is int else None
        round_value=match.get("round_number",match.get("round"))
        if type(round_value) is str and re.fullmatch(r"(?:round\s*)?[1-5]",round_value,re.I):
            round_value=int(re.sub(r"\D","",round_value))
        round_number=round_value if type(round_value) is int and 1<=round_value<=5 else None
        output.append({"id":"stage-"+str(match["id"]),
            "tournament_id":tournament_id,"round":round_number,
            "home":name(teams[0]["name"]),"away":name(teams[1]["name"]),
            "score_home":scoring.get(teams[0].get("id")) if status!="scheduled" else None,
            "score_away":scoring.get(teams[1].get("id")) if status!="scheduled" else None,
            "winner":winner,"start_time":iso(when),"status":status})
    output.sort(key=lambda x:x["start_time"])
    return output[:80]


def main():
    now=dt.datetime.now(UTC)
    events={};sources=[];brackets=[];standings=[];stage_matches=[]
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
                b,t=tournament_extras(matches,secret,discover_lol_tournaments(secret,now))
                brackets.extend(b);standings.extend(t)
                # One supplementary Swiss history request at most per cycle.
                focus=next((x for x in t if
                    re.search(r"worlds|全球总决赛",x.get("title",""),re.I) and
                    re.search(r"group|swiss|小组|瑞士",x.get("title",""),re.I)),None)
                if focus:
                    try:
                        identifier=int(focus["id"].removeprefix("panda-"))
                        stage_matches=collect_stage_matches(secret,identifier)
                        print("PandaScore Swiss match history: %d verified matches"%
                              len(stage_matches),flush=True)
                    except Exception:
                        print("Swiss match history not available; retaining verified standings",flush=True)

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
    ordered=sorted(events.values(),key=lambda x:(
                  ranked.get(x["status"],3),
                  # Keep featured matches even when low-profile fixtures fill the page.
                  -(x.get("prominence") or popularity(x.get("league"),x.get("stage"),x.get("sport")))
                    if x["status"]=="scheduled" else 0,
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
    # Preserve only recently verified previous data when a provider misses a
    # stage in one collection. Never represent these retained rows as live.
    try:
        previous=json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    except Exception:
        previous={}
    previous_at=timestamp(previous.get("generated_at"))
    if previous_at and dt.timedelta(0)<=now-previous_at<=dt.timedelta(days=14):
        for section,records,limit in (("standings",standings,MAX_STANDINGS_REQUESTS+1),
                                      ("brackets",brackets,MAX_BRACKET_REQUESTS)):
            current_ids={str(r.get("id") or r.get("tournament_id")) for r in records}
            for old in previous.get(section,[]):
                if len(records)>=limit:break
                if not isinstance(old,dict) or old.get("provider")!="pandascore":continue
                ident=str(old.get("id") or old.get("tournament_id"))
                if ident in current_ids:continue
                if section=="standings" and not any(
                    isinstance(row.get("wins"),int) and isinstance(row.get("losses"),int)
                    for row in old.get("groups",[]) if isinstance(row,dict)):continue
                if section=="brackets" and not old.get("rounds"):continue
                preserved=dict(old)
                source_at=timestamp(preserved.get("verified_at")) or previous_at
                if not source_at or now-source_at>dt.timedelta(days=14):continue
                preserved["status"]="stale"
                # Preserve the original evidence date; never advance it when
                # the current collector has not obtained a fresh record.
                preserved["verified_at"]=iso(source_at)
                records.append(preserved)
                current_ids.add(ident)
    phases={"lck_legend":False,"lck_rise":False,"lpl_ascend":False,"lpl_nirvana":False}
    checks={"lck_legend":r"\blck\b.*legend group",
            "lck_rise":r"\blck\b.*rise group",
            "lpl_ascend":r"\blpl\b.*group ascend",
            "lpl_nirvana":r"\blpl\b.*group nirvana"}
    for board in standings:
        title=str(board.get("title","")).lower()
        for group,regex in checks.items():
            if re.search(regex,title):phases[group]=True
    lineage_count=sum(len(m.get("previous_matches",[]))
        for b in brackets for r in b.get("rounds",[]) for m in r.get("matches",[]))
    output={"schema":1,"fixture_schema_version":10,"source_type":"official_fixtures","generated_at":iso(now),
            "interval_hours":6,"sources":sources,
            "status":"ok" if all(src["status"]=="ok" for src in sources) else "partial",
            "events":selected,"brackets":brackets[:MAX_BRACKET_REQUESTS],"standings":standings[:MAX_STANDINGS_REQUESTS+1],
             "phase_coverage":phases,"verified_bracket_edges":lineage_count,
             "stage_matches":stage_matches,
            "notes":"Verified schedules, provider bracket trees and standings. No live score display; updates roughly every six hours."}
    write_json(OUT,output)
    print("Official fixtures published: "+str(len(selected)),flush=True)


if __name__=="__main__":
    main()

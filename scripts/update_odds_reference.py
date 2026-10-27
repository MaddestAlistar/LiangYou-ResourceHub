#!/usr/bin/env python3
"""The Odds API: bounded pregame h2h reference, NOT match outcomes/predictions.

Never publish API keys, raw responses or source bookmaker inventories.
One region/one market per request, monthly local cap, provider remaining guard.
"""
from __future__ import annotations
import json
import os
from urllib.parse import urlencode
from urllib.request import Request,urlopen
from datetime import timedelta
from feed_common import ROOT,now,date,iso,read_json,write_json

OUT=ROOT/"data/sports-odds.json"
BASE="https://api.the-odds-api.com/v4"
SPORTS=(("basketball_nba",6),("soccer_epl",12),("soccer_uefa_champs_league",24))
HARD_MONTHLY_LIMIT=210
MIN_API_REMAINING=50

def get_json(url):
    with urlopen(Request(url,headers={"Accept":"application/json",
           "User-Agent":"LiangYou-ResourceHub/3.0"}),timeout=19) as res:
        body=res.read(1800000)
        headers={k.lower():v for k,v in res.headers.items()
                 if k.lower() in ("x-requests-remaining","x-requests-last")}
    return json.loads(body),headers

def safe_int(value,default):
    try:return max(0,int(value))
    except (ValueError,TypeError):return default

def rows_for(sport,body,instant):
    if not isinstance(body,list):raise ValueError("Invalid odds payload")
    rows=[]
    for e in body:
        if not isinstance(e,dict):continue
        when=date(e.get("commence_time"))
        if not when or not instant<when<=instant+timedelta(days=7):continue
        home=str(e.get("home_team") or "").strip()[:90]
        away=str(e.get("away_team") or "").strip()[:90]
        if not home or not away or home==away:continue
        selected=None
        # Only one representative book, not a repackaged odds feed.
        for book in e.get("bookmakers",[])[:30]:
            if not isinstance(book,dict):continue
            for market in book.get("markets",[]):
                if not isinstance(market,dict) or market.get("key")!="h2h":continue
                updated=date(market.get("last_update") or book.get("last_update"))
                if not updated or (instant-updated)>timedelta(hours=12):continue
                outcomes=[]
                for x in market.get("outcomes",[]):
                    if not isinstance(x,dict):continue
                    v=x.get("price")
                    if not isinstance(v,(int,float)) or isinstance(v,bool) or not 1.01<=v<=1000:continue
                    name=str(x.get("name") or "").strip()[:90]
                    if name:outcomes.append({"name":name,"decimal":round(float(v),3)})
                if len(outcomes) not in (2,3) or len({x["name"] for x in outcomes})!=len(outcomes):continue
                expected={home,away}
                if not expected.issubset({x["name"] for x in outcomes}):continue
                selected={"bookmaker":str(book.get("title") or "")[:50],
                          "outcomes":outcomes,"quote_at":iso(updated)}
                break
            if selected:break
        if not selected:continue
        rows.append({"id":"odds-"+str(e.get("id") or "")[:45],
            "provider":"the-odds-api","sport":"basketball" if sport=="basketball_nba" else "football",
            "league":{"basketball_nba":"NBA","soccer_epl":"Premier League",
                      "soccer_uefa_champs_league":"Champions League"}[sport],
            "home":home,"away":away,"start_time":iso(when),
            **selected})
    return sorted(rows,key=lambda x:x["start_time"])[:40]

def main():
    instant=now()
    previous=read_json(OUT)
    token=os.getenv("THE_ODDS_API_KEY","").strip()
    month=instant.strftime("%Y-%m")
    used=safe_int(previous.get("monthly_credits",0),0) if previous.get("quota_month")==month else 0
    last_checks=previous.get("last_checked",{}) if isinstance(previous.get("last_checked"),dict) else {}
    sources=[]
    existing={s:[] for s,_ in SPORTS}
    for e in previous.get("events",[]):
        if not isinstance(e,dict):continue
        kind={"NBA":"basketball_nba","Premier League":"soccer_epl","Champions League":"soccer_uefa_champs_league"}.get(e.get("league"))
        if kind and (v:=date(e.get("quote_at"))) and timedelta(0)<=instant-v<=timedelta(hours=12):
            if (start:=date(e.get("start_time"))) and start>instant:existing[kind].append(e)
    current={k:list(v) for k,v in existing.items()}
    if token:
        try:
            # /sports is free and prevents spending credits for inactive leagues.
            sports,_=get_json(BASE+"/sports/?"+urlencode({"apiKey":token}))
            active={str(x.get("key")) for x in sports if isinstance(x,dict) and x.get("active")}
        except Exception as exc:
            print("::warning::Odds availability check:",type(exc).__name__,flush=True)
            active=set()
    else:active=set()
    # A billing-month change must not inherit an exhausted local guard.
    # The first paid response will report the provider’s actual remainder.
    remaining=safe_int(previous.get("provider_remaining"),100000) if previous.get("quota_month")==month else 100000
    for sport,hours in SPORTS:
        checked=date(last_checks.get(sport))
        if not token:status="not_configured"
        elif sport not in active:status="inactive"
        elif checked and timedelta(0)<=instant-checked<timedelta(hours=hours):status="recent"
        elif used>=HARD_MONTHLY_LIMIT or remaining<=MIN_API_REMAINING:status="budget_guard"
        else:
            status="unavailable"
            try:
                query=urlencode({"apiKey":token,"regions":"us","markets":"h2h","oddsFormat":"decimal"})
                body,headers=get_json(BASE+"/sports/"+sport+"/odds/?"+query)
                current[sport]=rows_for(sport,body,instant)
                remaining=safe_int(headers.get("x-requests-remaining"),remaining)
                used+=safe_int(headers.get("x-requests-last"),1)
                last_checks[sport]=iso(instant)
                status="ok"
            except Exception as exc:
                # Avoid infinite free tier retry every heartbeat.
                last_checks[sport]=iso(instant)
                print("::warning::Odds source unavailable:",sport,type(exc).__name__,flush=True)
        sources.append({"tag":"the-odds-api:"+sport,"status":status,"count":len(current[sport])})
    events=[x for name,_ in SPORTS for x in current[name]]
    write_json(OUT,{"schema":1,"source_type":"bookmaker_reference",
      "odds_schema_version":1,"generated_at":iso(instant),"quota_month":month,
      "monthly_credits":used,"monthly_cap":HARD_MONTHLY_LIMIT,
      "provider_remaining":remaining if token else None,
      "last_checked":last_checks,"sources":sources,"events":events})
    print("Odds snapshot:",len(events),"events; local month units",used,flush=True)

if __name__=="__main__":main()

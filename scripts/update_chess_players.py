#!/usr/bin/env python3
"""Chess.com public player metadata with an allowlist of VERIFIED usernames.

A broadcast PGN display name is not a Chess.com account identifier. No fuzzy
user search or guessed usernames; preserve last verified profiles briefly.
"""
from __future__ import annotations
import json
from urllib.request import Request,urlopen
from datetime import timedelta
from feed_common import ROOT,read_json,now,date,iso,write_json

OUT=ROOT/"data/chess-players.json"
BOARD=ROOT/"data/board-games.json"
VERIFIED_USERS={"Nakamura, Hikaru":("hikaru","Hikaru Nakamura")}
BASE="https://api.chess.com/pub/player/"

def get_json(url):
    req=Request(url,headers={"User-Agent":"LiangYou-ResourceHub/3.0 (chess stats; noncommercial)",
             "Accept":"application/json"})
    with urlopen(req,timeout=15) as rsp:return json.loads(rsp.read(250000))

def rating(payload,variant):
    x=(payload.get(variant) or {}).get("last") or {}
    number=x.get("rating")
    return number if isinstance(number,int) and not isinstance(number,bool) and 100<=number<=4000 else None

def fetch_player(pgn_name, username,expected):
    profile=get_json(BASE+username)
    actual=str(profile.get("name") or "").strip().casefold()
    if actual!=" ".join(expected.casefold().split()) or str(profile.get("username") or "").casefold()!=username:
        raise ValueError("Chess.com player identity did not match")
    stats=get_json(BASE+username+"/stats")
    fide=profile.get("fide")
    fide=fide if isinstance(fide,int) and not isinstance(fide,bool) and 100<=fide<=3500 else None
    return {"pgn_name":pgn_name,"display_name":expected,"username":username,"title":str(profile.get("title") or "")[:5],
     "fide":fide,"rapid":rating(stats,"chess_rapid"),"blitz":rating(stats,"chess_blitz"),
     "bullet":rating(stats,"chess_bullet"),"source_url":"https://www.chess.com/member/"+username}

def main():
    instant=now();old=read_json(OUT)
    board=read_json(BOARD)
    playing={str(e.get(side)) for e in board.get("events",[]) if e.get("sport")=="chess"
             for side in ("home","away")}
    previous={x.get("pgn_name"):x for x in old.get("players",[]) if isinstance(x,dict)}
    records=[];success=0
    for player,(username,identity) in VERIFIED_USERS.items():
        if player not in playing:continue
        try:
            item=fetch_player(player,username,identity)
            item["verified_at"]=iso(instant)
            records.append(item);success+=1
        except Exception as exc:
            print("::warning::Chess.com profile unavailable:",username,type(exc).__name__,flush=True)
            was=previous.get(player);t=date(was.get("verified_at")) if was else None
            if t and timedelta(0)<=instant-t<=timedelta(hours=72):
                records.append(was)
    write_json(OUT,{"schema":1,"source_type":"chess_player_metadata",
      "chess_profile_version":1,"generated_at":iso(instant),"verified_at":iso(instant) if success else None,
      "status":"ok" if success else "no_verified_profiles","players":records,
      "sources":[{"tag":"chess.com","status":"ok" if success else "unavailable","count":success}]})
    print("Chess.com verified profiles:",success,flush=True)

if __name__=="__main__":main()

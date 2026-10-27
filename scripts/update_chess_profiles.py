#!/usr/bin/env python3
"""Read-only Chess.com PubAPI metadata. Only explicitly mapped named players."""
from __future__ import annotations
import json, re, time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from feed_common import ROOT, iso, now, write_json
OUT=ROOT/"data"/"chess-players.json"
# Require an explicit, reviewed FIDE-name -> Chess.com username mapping.
PLAYERS={"Nakamura, Hikaru":"hikaru","Caruana, Fabiano":"fabianocaruana"}
BASE="https://api.chess.com/pub/player/"

def get(path):
    req=Request(BASE+path,headers={"Accept":"application/json",
                "User-Agent":"LiangYou-ResourceHub/2.0 (GitHub: MaddestAlistar/LiangYou-ResourceHub)"})
    with urlopen(req,timeout=18) as rsp:
        payload=rsp.read(100000)
    return json.loads(payload)

def rating(d,k):
    obj=d.get(k)
    if not isinstance(obj,dict):return None
    last=obj.get("last") or {}
    n=last.get("rating") if isinstance(last,dict) else None
    return n if isinstance(n,int) and 100<=n<=4000 else None

def parse(name,user,profile,stats):
    username=str(profile.get("username") or "").lower()
    full=str(profile.get("name") or "").strip()
    if username!=user or not full:return None
    # Verified identity: transliterated first+surname must match the mapped FIDE name.
    folded=lambda v:re.sub("[^a-z]","",v.lower())
    parts=[folded(x.strip()) for x in name.split(",")]
    if len(parts)!=2 or not all(p in folded(full) for p in parts):return None
    fide=profile.get("fide")
    return {"name":name,"username":user,"name_public":full[:90],
      "title":str(profile.get("title") or "")[:12],
      "country":str(profile.get("country") or "")[-2:],
      "fide":fide if isinstance(fide,int) and 1000<=fide<=3200 else None,
      "rapid":rating(stats,"chess_rapid"),"blitz":rating(stats,"chess_blitz"),
      "bullet":rating(stats,"chess_bullet"),
      "profile_url":"https://www.chess.com/member/"+user}

def main():
    entries=[]
    for name,user in PLAYERS.items():
        try:
            profile=get(user);time.sleep(.3);stats=get(user+"/stats")
            entry=parse(name,user,profile,stats)
            if entry:entries.append(entry)
            else:print("Chess.com identity not confirmed:",name,flush=True)
        except (HTTPError,ValueError,TimeoutError,OSError) as exc:
            print("Chess.com metadata unavailable:",user,type(exc).__name__,flush=True)
        time.sleep(.4)
    if not entries:raise SystemExit("No Chess.com identities verified; retain last snapshot")
    write_json(OUT,{"schema":1,"source_type":"chess_public_profiles","generated_at":iso(now()),
       "status":"ok" if len(entries)==len(PLAYERS) else "partial",
       "interval_hours":24,"source":"chess.com","players":entries})
    print("Verified Chess.com profiles:",len(entries),flush=True)

if __name__=="__main__":main()

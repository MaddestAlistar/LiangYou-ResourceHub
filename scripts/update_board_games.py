#!/usr/bin/env python3
"""Verified chess broadcasts and professional Go fixtures. Read-only, bounded collection."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
import re
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
from bs4 import BeautifulSoup
from feed_common import ROOT, write_json
from go_player_sources import enrich

OUT = ROOT / "data" / "board-games.json"
UTC = timezone.utc
JST = ZoneInfo("Asia/Tokyo")
KST = ZoneInfo("Asia/Seoul")
NOW = datetime.now(UTC)
UA = "LiangYou-ResourceHub/2.0 (+https://github.com/MaddestAlistar/LiangYou-ResourceHub)"
JAPAN = "https://www.nihonkiin.or.jp/match/2week.html"
KOREA = "https://www.baduk.or.kr/record/schedule_in.asp"
CHINA = "https://www.weiqi.org.cn/competition/battle"
LICHESS = "https://lichess.org/api/broadcast/top"
GO_TITLE = re.compile(r"(?:世界|국제|world|棋聖|名人|本因坊|天元|碁聖|十段|王座|国手|国手山脈|烂柯|三星|LG|春蘭|农心|農心|応氏|女子|女流|囲碁|바둑|기성|명인|국수|棋仙|棋王|杯|전|リーグ)", re.I)
PRO_CHESS = re.compile(r"(?:world|fide|candidates|grand|masters|championship|chess olympiad|cup|club|open|tata|sinquefield|bundesliga|national|champions|chess tour)", re.I)
AMATEUR = re.compile(r"(?:u(?:8|10|12|14|16|18|20)\b|elementary|school|amateur|beginner|kids|children|child|youth|junior|cadet|student|scholastic|어린이|청소년)",re.I)

def stamp(value):
    if isinstance(value,(float,int)) and value>0:
        return datetime.fromtimestamp(value/1000 if value>10**11 else value,UTC)
    if isinstance(value,str) and value:
        try:
            d=datetime.fromisoformat(value.replace("Z","+00:00"))
            return d.astimezone(UTC) if d.tzinfo else None
        except ValueError: pass
    return None

def iso(value):
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00","Z")

def get(url, token="", accept="application/json", timeout=19, limit=1800000):
    h={"User-Agent":UA,"Accept":accept,"Accept-Language":"en-US,en;q=0.9"}
    if token:h["Authorization"]="Bearer "+token
    req=Request(url,headers=h)
    with urlopen(req,timeout=timeout) as response:
        if response.status!=200: raise ValueError("HTTP "+str(response.status))
        raw=response.read(limit+1)
        if len(raw)>limit:raise ValueError("Response too large")
        return raw.decode(response.headers.get_content_charset() or "utf-8","replace")

def found(tour):
    name=str(tour.get("name","")).strip()
    return bool(name and PRO_CHESS.search(name) and not AMATEUR.search(name))

def items(value):
    if isinstance(value,list):return value
    if isinstance(value,dict):
        for key in ("results","list","broadcasts","items"):
            if isinstance(value.get(key),list):return value[key]
    return []

def pgn_games(pgn):
    positions=[m.start() for m in re.finditer(r'(?m)^\[Event\s+"',pgn)]
    positions.append(len(pgn))
    for i in range(len(positions)-1):
        fragment=pgn[positions[i]:positions[i+1]]
        tags=dict(re.findall(r'(?m)^\[(\w+)\s+"([^"]*)"\]',fragment))
        white=tags.get("White","").strip()
        black=tags.get("Black","").strip()
        if white in ("","?") or black in ("","?") or white.lower()=="bye" or black.lower()=="bye":continue
        result=tags.get("Result","*").strip()
        if result not in ("*","1-0","0-1","1/2-1/2"):continue
        yield white,black,result,tags

def chess(token):
    if not token:raise ValueError("Missing LICHESS_API_TOKEN")
    listing=json.loads(get(LICHESS,token))
    if not isinstance(listing,dict):raise ValueError("Invalid Lichess broadcast list")
    records=[]
    seen=set()
    for state in ("active","upcoming","past"):
        for item in items(listing.get(state)):
            if not isinstance(item,dict):continue
            tour=item.get("tour") or item.get("tournament") or {}
            rd=item.get("round") or {}
            if not isinstance(tour,dict) or not isinstance(rd,dict) or not found(tour):continue
            rid=str(rd.get("id",""))
            if not re.fullmatch(r"[a-zA-Z0-9]{8}",rid) or rid in seen:continue
            start=stamp(rd.get("startsAt") or rd.get("starts_at") or rd.get("start"))
            if not start or not NOW-timedelta(days=3)<=start<=NOW+timedelta(days=10):continue
            seen.add(rid)
            records.append((state,tour,rd,start,rid))
            if len(records)>=9:break
        if len(records)>=9:break
    events=[]
    for state,tour,rd,start,rid in records:
        # PGN is public broadcast information; only headers needed, never republish moves.
        try:
            pgn=get("https://lichess.org/api/broadcast/round/"+rid+".pgn",
                    token,"application/x-chess-pgn",timeout=24,limit=2000000)
            games=list(pgn_games(pgn))
        except (ValueError,HTTPError,URLError,TimeoutError) as exc:
            print("lichess round unavailable:",rid,type(exc).__name__,flush=True)
            continue
        league=str(tour.get("name","")).strip()[:110]
        round_name=str(rd.get("name","") or "").strip()[:80]
        tourid=str(tour.get("id",""))
        for white,black,result,tags in games[:32]:
            status="finished" if result!="*" else ("live" if state=="active" else "scheduled")
            if state=="past" and status=="scheduled":continue
            if state=="upcoming" and status=="live":status="scheduled"
            key=hashlib.sha1((rid+"|"+white+"|"+black).encode()).hexdigest()[:12]
            scores={"1-0":(1,0),"0-1":(0,1),"1/2-1/2":(.5,.5)}
            pair=scores.get(result,(None,None))
            events.append(dict(id="chess-"+key,provider="lichess",sport="chess",league=league,
                stage=round_name,home=white,away=black,start_time=iso(start),
                status=status,score_home=pair[0],score_away=pair[1],
                prominence=340 if re.search(r"world|fide|candidates|grand",league,re.I) else 185,
                source_url="https://lichess.org/broadcast/"+tourid if re.fullmatch(r"[a-zA-Z0-9]{8}",tourid) else "https://lichess.org/broadcast",
                result_detail=result))
        time.sleep(.8)  # respect Lichess limits; never parallelize requests
    return events

def event_date(raw,year,month,day,zone):
    try:return datetime(year,month,day,12,0,tzinfo=zone)
    except ValueError:return None

def japan():
    body=get(JAPAN,accept="text/html",timeout=22,limit=2500000)
    soup=BeautifulSoup(body,"html.parser")
    content=soup.get_text(" ",strip=True)
    year_match=re.search(r"更新日時[：:]?\s*(20\d{2})-",content)
    year=int(year_match.group(1)) if year_match else NOW.astimezone(JST).year
    events=[]
    # The official page is grouped by date. For each row, take the closest
    # preceding standalone date heading rather than invent a start hour.
    for tr in soup.find_all("tr"):
        cells=[td.get_text(" ",strip=True) for td in tr.find_all(["td","th"],recursive=False)]
        if len(cells)<4:continue
        label=cells[0]
        if not GO_TITLE.search(label):continue
        pieces=[s for s in cells[1:] if s.strip() and s.strip() not in ("△","▲","—","-")]
        players=[s for s in pieces if re.search(r"(?:九|八|七|六|五|四|三|二|初)段|名誉|天元|碁聖|棋聖|本因坊|名人",s)]
        if len(players)<2:continue
        marker=tr.find_previous(string=re.compile(r"^\s*(?:0?[1-9]|1[0-2])月(?:0?[1-9]|[12]\d|3[01])日\s*$"))
        if not marker:continue
        m=re.search(r"(\d{1,2})月(\d{1,2})日",str(marker))
        if not m:continue
        month,day=map(int,m.groups())
        match_date=event_date(label,year,month,day,JST)
        if not match_date:continue
        if match_date>NOW+timedelta(days=10) or match_date<NOW-timedelta(days=4):continue
        result=next((s for s in pieces if re.search(r"(?:黒|白).*(?:中押|目|半|勝|負)|持碁",s)),None)
        # Japanese official result table puts winner in the left player column.
        finished=bool(result)
        if not finished and match_date<NOW-timedelta(days=1):continue
        white,black=players[:2]
        key=hashlib.sha1((str(match_date.date())+"|"+label+"|"+white+"|"+black).encode()).hexdigest()[:12]
        events.append(dict(id="go-jp-"+key,provider="nihonkiin",sport="go",
            league=label,stage="",home=white,away=black,
            start_time=iso(match_date),time_precision="date",display_date=match_date.strftime("%Y-%m-%d"),
            status="finished" if finished else "scheduled",
            score_home=None,score_away=None,
            result_detail=result if finished else "",
            prominence=260 if re.search(r"国手山脈|世界|LG|三星|春蘭|応氏|農心",label) else 140,
            source_url=JAPAN))
        if len(events)>=85:break
    if not events:raise ValueError("No parseable recent Japanese professional pairings")
    return events

def korea():
    """Read the published calendar, keeping only *named player* pairings.

    Korean calendar cells often split the date, clock and event name across
    nested tags. Flatten it into token lines before reading; never confuse
    team-vs-team league fixtures with two confirmed individual players.
    """
    body=get(KOREA,accept="text/html",timeout=22,limit=2500000)
    soup=BeautifulSoup(body,"html.parser")
    page=soup.get_text("\n",strip=True)
    year_match=re.search(r"(20\d{2})년",page)
    current=NOW.astimezone(KST)
    base_year=int(year_match.group(1)) if year_match else current.year
    lines=[line.strip() for line in page.splitlines() if line.strip()]
    records=[]
    seen=set()
    active_day=None
    active_month=current.month
    for i,line in enumerate(lines):
        day_match=re.fullmatch(r"(?:(?:일|월|화|수|목|금|토)\s+)?([1-9]|[12]\d|3[01])",line)
        if day_match:
            day=int(day_match.group(1))
            # Calendar may include a few adjacent-month days in the grid.
            active_month=current.month + (1 if day<current.day-19 else
                                          -1 if day>current.day+19 else 0)
            active_year=base_year
            if active_month==13:active_month,active_year=1,base_year+1
            if active_month==0:active_month,active_year=12,base_year-1
            active_day=(active_year,active_month,day)
            continue
        if not active_day:continue
        # Some templates render the clock and event description in different tags.
        combined=line
        if re.fullmatch(r"\d{1,2}:\d{2}",line) and i+1<len(lines):
            combined=line+" "+lines[i+1]
        match=re.search(r"(?P<hour>[01]?\d|2[0-3]):(?P<minute>[0-5]\d)\s+"
            r"(?P<title>[^()\n]{2,140}?)\s*\(\s*ㅇ\s*"
            r"(?P<home>[^():]{1,35}?)\s*:\s*(?P<away>[^():]{1,35}?)\s*\)",combined)
        if not match:continue
        title=match.group("title").strip()
        # The "ㅇ" prefix marks an individual televised pairing. Team fixtures
        # lack it, and should not be mislabelled as named professional players.
        if not GO_TITLE.search(title) or AMATEUR.search(title):continue
        home=match.group("home").strip()
        away=match.group("away").strip()
        if not home or not away or home==away:continue
        try:
            when=datetime(*active_day,int(match.group("hour")),
                int(match.group("minute")),tzinfo=KST)
        except ValueError:continue
        if when<NOW-timedelta(minutes=90) or when>NOW+timedelta(days=9):continue
        unique=iso(when)+"|"+title+"|"+home+"|"+away
        key=hashlib.sha1(unique.encode()).hexdigest()[:12]
        if key in seen:continue
        seen.add(key)
        # Explicit Korean round labels are part of the headline, so their
        # actual text is preserved, not inferred from the calendar date.
        stage=(re.search(r"(?:(?:결승|준결승|4강|8강|16강|32강|64강|패자결승|예선|본선|[0-9]+R)"
              r"(?:\s*\d+국)?)",title) or [None])[0] or ""
        records.append(dict(id="go-kr-"+key,provider="baduk",sport="go",
            league=title[:110],stage=stage,home=home,away=away,
            start_time=iso(when),status="scheduled",score_home=None,
            score_away=None,prominence=230 if "세계" in title or "월드" in title else 180,
            source_url=KOREA))
        if len(records)>=40:break
    if not records:
        print("baduk parser diagnostic: tokens",len(lines),"tables",len(soup.find_all("table")),
            "calendar_days",sum(bool(re.fullmatch(r"(?:(?:일|월|화|수|목|금|토)\s+)?([1-9]|[12]\d|3[01])",x)) for x in lines),
            "named_pairings",sum("(ㅇ" in x for x in lines),flush=True)
        raise ValueError("No current Korean professional player pairings could be verified")
    return records

def main():
    token=os.getenv("LICHESS_API_TOKEN","").strip()
    events=[]
    sources=[]
    for provider,func in (("lichess",lambda:chess(token)),("nihonkiin",japan),("baduk",korea)):
        try:
            rows=func()
            events+=rows
            sources.append({"tag":provider,"status":"ok","count":len(rows)})
            print(provider,"verified records:",len(rows),flush=True)
        except Exception as exc:
            sources.append({"tag":provider,"status":"unavailable","count":0})
            print("::warning::",provider,type(exc).__name__,str(exc)[:180],flush=True)
    # CN association page is JS-driven; do not turn its HTML shell into imaginary games.
    sources.append({"tag":"weiqi-association","status":"pending_api_validation","count":0})
    seen=set()
    clean=[]
    for row in sorted(events,key=lambda e:(e["start_time"],e["id"])):
        if row["id"] not in seen:clean.append(row);seen.add(row["id"])
    if not any(s["status"]=="ok" for s in sources):
        # Do not overwrite previously verified fixtures after a network outage.
        raise RuntimeError("No board game source verified; preserving last snapshot")
    # Ranking/player metadata never changes the verified fixture identity or status.
    sources.extend(enrich(clean))
    write_json(OUT,{"schema":1,"source_type":"board_game_fixtures","generated_at":iso(datetime.now(UTC)),
        "interval_hours":6,"board_source_revision":3,"status":"ok" if all(s["status"]=="ok" for s in sources[:3]) else "partial",
        "sources":sources,"events":clean[:180]})

if __name__=="__main__":
    main()

"""Small, fail-soft Go player metadata layer; never manufactures fixtures.

CC0 u-go.net player list is only used for matching names across languages.
Go Ratings values are attributed third-party ranking estimates, not game scores.
"""
from __future__ import annotations

import gzip
import json
import re
import unicodedata
from urllib.request import Request, urlopen
from urllib.parse import quote, urljoin, urlparse
from bs4 import BeautifulSoup

ARCHIVE_INDEX = "https://db.u-go.net/playerdb-archive/"
ARCHIVE = "https://dldb.u-go.net/playerdb-latest.json.gz"
API = "https://db.u-go.net/playerdb/players/"
RATINGS = "https://www.goratings.org/en/"
UA = "LiangYou-ResourceHub/2.0 (+https://github.com/MaddestAlistar/LiangYou-ResourceHub)"

def fetch(url, max_bytes=2200000):
    req=Request(url,headers={"User-Agent":UA,"Accept":"text/html,application/json,application/gzip"})
    with urlopen(req, timeout=19) as rsp:
        if rsp.status!=200:raise ValueError("Unexpected source status")
        payload=rsp.read(max_bytes+1)
        if len(payload)>max_bytes:raise ValueError("Go metadata response too large")
        return payload

def norm(s):
    return re.sub(r"\s+","",unicodedata.normalize("NFKC",str(s or "")).casefold().strip())

def bare_name(s):
    # Take only the trailing professional rank or title from Japanese display.
    return re.sub(r"\s+(?:[一二三四五六七八九]段|初段|名人|棋聖|本因坊|碁聖|天元|王座|十段)$","",str(s or "").strip())

def flatten_db(doc):
    # Archives can use a top-level array or an object with the players array.
    if isinstance(doc,list):return doc
    if isinstance(doc,dict):
        for key in ("players","results","data","records"):
            value=doc.get(key)
            if isinstance(value,list):return value
            if isinstance(value,dict):
                for nested in ("results","players"):
                    if isinstance(value.get(nested),list):return value[nested]
        # Some public-domain exports use numeric player ID keys.
        if len(doc)>50 and all(isinstance(v,dict) for v in list(doc.values())[:25]):
            return list(doc.values())
    return []

def aliases(player):
    found={}
    if not isinstance(player,dict):return found
    name=player.get("key_name")
    if isinstance(name,str) and name:
        found[norm(name)]={"lang":"en","preferred":True,"display":name}
    for group in player.get("names",[]) if isinstance(player.get("names"),list) else []:
        if not isinstance(group,dict):continue
        for alt in group.get("simplenames",[]) if isinstance(group.get("simplenames"),list) else []:
            if not isinstance(alt,dict) or alt.get("incorrect"):continue
            spelling=alt.get("name")
            if not isinstance(spelling,str) or not spelling:continue
            languages=alt.get("languages") or []
            by_lang={x.get("language"):bool(x.get("preferred")) for x in languages if isinstance(x,dict)}
            for code in ("zh","en","ko","ja"):
                if code in by_lang:
                    old=found.get(norm(spelling))
                    value={"lang":code,"preferred":by_lang[code],"display":spelling}
                    if old is None or (not old["preferred"] and value["preferred"]):found[norm(spelling)]=value
            if norm(spelling) not in found:found[norm(spelling)]={"lang":"","preferred":False,"display":spelling}
    return found

def build_name_index(doc):
    rows=flatten_db(doc)
    by_name={}
    for player in rows:
        if not isinstance(player,dict):continue
        alias=aliases(player)
        if not alias:continue
        names=player.get("names") or []
        all_names=[]
        for n in names if isinstance(names,list) else []:
            all_names += [q for q in n.get("simplenames",[]) if isinstance(q,dict)] if isinstance(n,dict) else []
        def pref(lang):
            found=[n.get("name") for n in all_names if n.get("name") and not n.get("incorrect")
                and any(isinstance(z,dict) and z.get("language")==lang and z.get("preferred") for z in n.get("languages",[]))]
            return found[0] if found else None
        key_name=str(player.get("key_name") or "").strip()
        ch=pref("zh")
        english=pref("en") or key_name
        rgid=None
        for group in names if isinstance(names,list) else []:
            if isinstance(group,dict) and group.get("goratings"):
                rgid=str(group["goratings"]);break
        ranks=player.get("ranks") or []
        latest=next((x.get("rank") for x in reversed(ranks) if isinstance(x,dict) and re.fullmatch(r"[1-9]p",str(x.get("rank","")))),None)
        info={"name_zh":ch,"name_en":english,"go_ratings_id":rgid,"rank":latest,
              "u_go_id":player.get("id")}
        for name in alias:
            # An ambiguous alias must never silently map different people.
            if name in by_name and by_name[name]!=info:by_name[name]=None
            elif name not in by_name:by_name[name]=info
    return by_name,len(rows)

def load_names():
    # The download lives behind a separate host; derive its real path from
    # the official archive index, do not assume the .gz filename is at /.
    listing=BeautifulSoup(fetch(ARCHIVE_INDEX,400000).decode('utf-8','replace'),'html.parser')
    urls=[urljoin(ARCHIVE_INDEX,a.get('href','')) for a in listing.select('a[href]')
        if 'playerdb-latest.json.gz' in a.get('href','')]
    urls=[url for url in urls if urlparse(url).scheme=='https' and
        urlparse(url).hostname in ('dldb.u-go.net','db.u-go.net','dl.u-go.net')]
    raw=fetch(urls[0] if urls else ARCHIVE,2000000)
    if raw[:2]==b"\x1f\x8b":raw=gzip.decompress(raw)
    if len(raw)>12000000:raise ValueError("Decompressed player database too large")
    doc=json.loads(raw.decode("utf-8-sig"))
    found,count=build_name_index(doc)
    if count<200:raise ValueError("Player database too small or unsupported: "+str(type(doc).__name__))
    return found,count

def load_ratings():
    soup=BeautifulSoup(fetch(RATINGS,3000000),"html.parser")
    by_id={}
    by_name={}
    for tr in soup.find_all("tr"):
        cells=tr.find_all(["td","th"],recursive=False)
        if len(cells)<4:continue
        fields=[c.get_text(" ",strip=True) for c in cells]
        if not re.fullmatch(r"\d{1,4}",fields[0]):continue
        rank=int(fields[0])
        if not 1<=rank<=2500:continue
        name=fields[1]
        value=next((int(x) for x in reversed(fields[2:]) if re.fullmatch(r"[2-4]\d{3}",x)),None)
        if not name or value is None:continue
        a=cells[1].find("a",href=True)
        m=re.search(r"/players/(\d+)\.html",a["href"]) if a else None
        info={"rating":value,"world_rank":rank,"ratings_url":RATINGS+"players/"+m.group(1)+".html" if m else RATINGS}
        by_name[norm(name)]=info
        if m:by_id[m.group(1)]=info
    if len(by_name)<20:raise ValueError("Go Ratings page parser found no usable ratings")
    return by_id,by_name

def partial_names(events,limit=12):
    '''Use documented exact-match API for a few relevant players if the archive is down.'''
    found={}
    queried=set()
    calls=0
    for e in events:
        if e.get('sport')!='go':continue
        for side in ('home','away'):
            source=bare_name(e.get(side,''))
            key=norm(source)
            if not key or key in queried:continue
            queried.add(key)
            if calls>=limit:return found,calls
            calls+=1
            try:
                doc=json.loads(fetch(API+'?searchname='+quote(source),300000).decode('utf-8'))
                rows=doc.get('results',[]) if isinstance(doc,dict) else []
                if len(rows)!=1:continue
                entries,_=build_name_index(rows)
                if key in entries and entries[key]:found[key]=entries[key]
            except Exception as exc:
                print('u-go exact lookup unavailable',type(exc).__name__,flush=True)
    return found,calls

def enrich(events):
    names={}
    ratings_by_id={}
    ratings_by_name={}
    status=[]
    try:
        names,total=load_names()
        status.append({"tag":"u-go","status":"ok","players":total})
    except Exception as exc:
        print('::warning::u-go archive:',type(exc).__name__,str(exc)[:160],flush=True)
        names,calls=partial_names(events)
        status.append({'tag':'u-go','status':'partial' if names else 'unavailable','players':len(names),'queries':calls})
    try:
        ratings_by_id,ratings_by_name=load_ratings()
        status.append({"tag":"go-ratings","status":"ok","players":len(ratings_by_name)})
    except Exception as exc:
        status.append({"tag":"go-ratings","status":"unavailable"})
        print("::warning::Go Ratings metadata:",type(exc).__name__,str(exc)[:110],flush=True)
    matched=0
    for event in events:
        if event.get("sport")!="go":continue
        for side in ("home","away"):
            name=bare_name(event.get(side,""))
            details=names.get(norm(name))
            # Without an exact alias match, do not translate or attach someone else's rating.
            rating=None
            if details:
                rid=details.get("go_ratings_id")
                if rid and rid in ratings_by_id:rating=ratings_by_id[rid]
                if not rating:rating=ratings_by_name.get(norm(details.get("name_en")))
                if details.get("name_zh"):event[side+"_zh"]=details["name_zh"]
                if details.get("name_en"):event[side+"_en"]=details["name_en"]
                if details.get("rank"):event[side+"_professional_rank"]=details["rank"]
                if details.get("u_go_id"):event[side+"_player_url"]="https://db.u-go.net/playerdb/players/"+str(details["u_go_id"])+"/"
                matched+=1
            if rating:
                event[side+"_rating"]=rating["rating"]
                event[side+"_world_rank"]=rating["world_rank"]
                event[side+"_rating_url"]=rating["ratings_url"]
    print("go player metadata:",matched,"matched names; ratings",len(ratings_by_name),flush=True)
    return status

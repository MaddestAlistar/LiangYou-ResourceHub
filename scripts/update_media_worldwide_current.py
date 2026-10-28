#!/usr/bin/env python3
"""Snapshot a *source-attributed*, community-edited current worldwide film chart.

The Wikipedia list is not an official audited box-office API. A failed, malformed
or surprising response never overwrites the last verified snapshot.
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data/media-worldwide-current.json"
PAGE="https://en.wikipedia.org/wiki/List_of_highest-grossing_films"
API="https://en.wikipedia.org/w/api.php"
UA="LiangYouResourceHub/1.0 (https://github.com/MaddestAlistar/LiangYou-ResourceHub; sourced box office summary)"

def text(cell):
    cloned=BeautifulSoup(str(cell),"html.parser")
    for el in cloned.select("sup, .reference, .sortkey, .mw-editsection"):
        el.decompose()
    return " ".join(cloned.get_text(" ",strip=True).split())

def table_rows(html):
    soup=BeautifulSoup(html,"html.parser")
    for table in soup.select("table"):
        trs=table.find_all("tr",recursive=False)
        if not trs:
            tbody=table.find("tbody")
            trs=tbody.find_all("tr",recursive=False) if tbody else []
        if not trs:continue
        headers=[text(x).lower() for x in trs[0].find_all(["th","td"],recursive=False)]
        def column(term):
            return next((i for i,v in enumerate(headers) if term in v),-1)
        rank_idx,title_idx,gross_idx,year_idx=column("rank"),column("title"),column("worldwide gross"),column("year")
        if min(rank_idx,title_idx,gross_idx,year_idx)<0:continue
        rows=[]
        for tr in trs[1:]:
            cells=tr.find_all(["th","td"],recursive=False)
            if len(cells)<=max(rank_idx,title_idx,gross_idx,year_idx):continue
            rank_text=text(cells[rank_idx])
            title_text=text(cells[title_idx]).replace("†","").replace("‡","").strip()
            gross_text=text(cells[gross_idx])
            year_text=text(cells[year_idx])
            rank_m=re.search(r"^\s*(\d{1,3})\s*$",rank_text)
            money_m=re.search(r"\$\s*([\d,]{7,})",gross_text)
            year_m=re.search(r"(19\d{2}|20\d{2})",year_text)
            if not rank_m or not money_m or not year_m or not title_text:continue
            rank=int(rank_m.group(1));gross=int(money_m.group(1).replace(",",""));year=int(year_m.group(1))
            if not (1<=rank<=100 and 250_000_000<=gross<=10_000_000_000 and 1900<=year<=datetime.now(timezone.utc).year):continue
            link=next((a.get("href") for a in cells[title_idx].find_all("a") if a.get("href","").startswith("/wiki/")),None)
            movie=urljoin("https://en.wikipedia.org",link) if link else PAGE
            if urlparse(movie).hostname!="en.wikipedia.org":movie=PAGE
            rows.append({"rank":rank,"title":title_text[:160],"usd":gross,"year":year,"url":movie})
            if len(rows)>=30:break
        if rows:return rows
    return []

def collect():
    q=urllib.parse.urlencode({"action":"parse","page":"List_of_highest-grossing_films","prop":"text","format":"json","formatversion":2})
    req=urllib.request.Request(API+"?"+q,headers={"User-Agent":UA,"Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=25) as response:
        if response.status!=200:raise ValueError("Wikipedia API status not 200")
        body=json.load(response)
    parsed=body.get("parse") or {}
    page_html=parsed.get("text") or ""
    if not isinstance(page_html,str) or len(page_html)<10000:raise ValueError("Unexpected Wikimedia table content")
    rows=table_rows(page_html)
    if len(rows)<15:raise ValueError("Global table yielded fewer than 15 unambiguous rows")
    ranks=[x["rank"] for x in rows]
    if ranks!=list(range(1,len(rows)+1)):raise ValueError("Ranks missing or duplicated")
    if any(a["usd"]<b["usd"] for a,b in zip(rows,rows[1:])):raise ValueError("Gross amounts out of order")
    return {"schema":1,"source":"Wikipedia, List of highest-grossing films (community maintained)",
            "sourceUrl":PAGE,"retrievedAt":datetime.now(timezone.utc).isoformat(),
            "status":"source_snapshot_not_real_time","currency":"USD",
            "scope":"Reported unadjusted worldwide theatrical gross; source may be revised",
            "rows":rows}

def main():
    try:
        payload=collect()
        OUT.parent.mkdir(parents=True,exist_ok=True)
        OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print("WORLDWIDE_CURRENT_SNAPSHOT_OK",len(payload["rows"]),payload["retrievedAt"])
    except Exception as e:
        print("WORLDWIDE_CURRENT_SOURCE_UNAVAILABLE",type(e).__name__,str(e)[:180])
        # Fail closed, but do not delete the previous verified snapshot.
        return 0
    return 0

if __name__=="__main__":
    sys.exit(main())

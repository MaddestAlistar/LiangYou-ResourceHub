#!/usr/bin/env python3
"""Focused, read-only Jikan / GDELT availability check.

GDELT: one request at a time, >= 7s between completed requests,
honor Retry-After, at most 2 retries, exponential 30/60 second backoff.
A 429 never counts as zero news articles.
"""
from __future__ import annotations
import json
import os
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone

UA="LiangYou-ResourceHub/1.0 (API health check)"
def emit(name, **v):
    print("FOCUSED_API_PROBE "+json.dumps({"api":name,**v}, ensure_ascii=False), flush=True)

def request(url, *, timeout=20):
    req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"application/json"})
    try:
        with urllib.request.urlopen(req,timeout=timeout) as resp:
            status=resp.status
            raw=resp.read(250000)
            headers=dict(resp.headers.items())
    except urllib.error.HTTPError as e:
        status=e.code
        raw=e.read(1200)
        headers=dict(e.headers.items()) if e.headers else {}
    except urllib.error.URLError as e:
        reason=e.reason
        return None,None,{},type(reason).__name__
    except Exception as e:
        return None,None,{},type(e).__name__
    try:
        obj=json.loads(raw)
    except (ValueError,TypeError):
        obj=None
    return status,obj,headers,None

def dns_check(host):
    try:
        infos=socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)
        return "ok", len(infos)
    except OSError as e:
        return type(e).__name__,0

def check_jikan():
    host="api.jikan.moe"
    dns,count=dns_check(host)
    emit("Jikan v4",phase="dns",result=dns,addresses=count)
    for attempt,path in enumerate(("/v4/anime/1","/v4/top/anime?limit=1"),start=1):
        # Do not hammer the free service
        if attempt>1: time.sleep(4)
        status,obj,headers,error=request("https://"+host+path,timeout=19)
        data=obj.get("data") if isinstance(obj,dict) else None
        valid=isinstance(data,dict) and data.get("mal_id") == 1 if attempt==1 else (
              isinstance(data,list) and bool(data) and isinstance(data[0],dict) and bool(data[0].get("mal_id")))
        emit("Jikan v4",phase="http",attempt=attempt,endpoint="anime_detail" if attempt==1 else "top_anime",
             http_status=status,result="PASS" if valid and status==200 else "FAIL",
             network_issue=error,data_valid=bool(valid))
        if valid and status==200: return True
        if status==429: return False
    return False

def retry_after(headers):
    raw=next((v for k,v in headers.items() if k.lower()=="retry-after"),None)
    if not raw:return None
    try:return max(0,int(raw))
    except (ValueError,TypeError):pass
    try:
        dt=parsedate_to_datetime(raw)
        return max(0,int((dt-datetime.now(timezone.utc)).total_seconds()))
    except (ValueError,TypeError,OverflowError):return None

def check_gdelt():
    host="api.gdeltproject.org"
    dns,count=dns_check(host)
    emit("GDELT DOC 2.0",phase="dns",result=dns,addresses=count)
    url="https://"+host+"/api/v2/doc/doc?"+urllib.parse.urlencode({
        "query":'"film festival"',"mode":"ArtList","maxrecords":3,"format":"json","timespan":"1week"})
    # Start with an extra spacing margin; previous attempts got HTTP 429.
    time.sleep(7)
    last_completed=0
    for attempt in range(1,4):
        if last_completed:
            time.sleep(max(0,7-(time.monotonic()-last_completed)))
        status,obj,headers,error=request(url,timeout=23)
        last_completed=time.monotonic()
        articles=obj.get("articles") if isinstance(obj,dict) else None
        found=len(articles) if isinstance(articles,list) else None
        ok=status==200 and isinstance(articles,list) and len(articles)>0
        emit("GDELT DOC 2.0",phase="http",attempt=attempt,http_status=status,
             result="PASS" if ok else "RATE_LIMITED" if status==429 else "FAIL",
             articles=found,network_issue=error)
        if ok:return True
        if status!=429:
            # Do not retry malformed requests or non-rate-limit errors.
            return False
        if attempt==3:return False
        # Honor provider-provided Retry-After and use exponential delay 30 / 60 s.
        # Keep capped to 90s to avoid lengthy CI jobs, avoiding retry storms.
        retry=retry_after(headers)
        delay=max(30*(2**(attempt-1)),retry or 0)
        if delay>90:
            emit("GDELT DOC 2.0",phase="backoff",result="STOP",reason="retry_after_exceeds_90_seconds",retry_after=retry)
            return False
        emit("GDELT DOC 2.0",phase="backoff",result="WAIT",seconds=delay)
        time.sleep(delay)
    return False

def main():
    j=check_jikan()
    g=check_gdelt()
    emit("summary",jikan="PASS" if j else "UNAVAILABLE",gdelt="PASS" if g else "UNAVAILABLE")
    # Exit normally: reports provider availability, not repository health.
if __name__=="__main__": main()

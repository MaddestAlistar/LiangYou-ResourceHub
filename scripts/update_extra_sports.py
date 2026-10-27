#!/usr/bin/env python3
"""Verified extra NBA/football coverage from the user's own API accounts.

No keys in committed files. Never fabricate results or rankings. One NBA
request plus six football-data requests per 6-hour update, well inside
published free-tier limits.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from feed_common import ROOT, iso, now, read_json, write_json

OUT = ROOT / "data/extra-sports.json"
FOOTBALL = "https://api.football-data.org/v4"
NBA = "https://mcp.dunkapi.com/v1/get_standings"
LEAGUES = {"PL": "Premier League", "PD": "La Liga",
           "BL1": "Bundesliga", "SA": "Serie A", "FL1": "Ligue 1"}
STANDING_CODES = ("PL", "PD", "BL1", "SA", "FL1")


def request(url, headers, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = Request(url, data=data, headers={
        **headers, "Accept": "application/json",
        "User-Agent": "LiangYouResourceHub/1.0",
        **({"Content-Type": "application/json"} if body is not None else {})
    })
    try:
        with urlopen(req, timeout=28) as response:
            result = json.load(response)
    except HTTPError as exc:
        # Never print an API token, URL query credentials or raw response.
        raise RuntimeError("HTTP " + str(exc.code)) from None
    except (URLError, TimeoutError) as exc:
        raise RuntimeError("Network unavailable: " + type(exc).__name__) from None
    if not isinstance(result, dict):
        raise RuntimeError("Unexpected API response")
    if isinstance(result.get("errors"), dict) and result["errors"]:
        raise RuntimeError("API returned an error")
    if result.get("error"):
        raise RuntimeError("API returned an error")
    return result


def integer(v, allow_zero=True):
    if isinstance(v, bool) or v is None:
        return None
    try:
        n = int(v)
    except (ValueError, TypeError):
        return None
    return n if n >= (0 if allow_zero else 1) else None


def nba_standings(key, year):
    envelope = request(NBA, {"x-api-key": key}, {"season": year})
    data = envelope.get("data", envelope)
    if not isinstance(data, dict) or data.get("season") != year:
        raise RuntimeError("NBA season mismatch")
    rows = data.get("standings")
    if not isinstance(rows, list) or len(rows) < 25:
        raise RuntimeError("NBA standings absent or incomplete")
    groups = []
    seen = set()
    for x in rows:
        if not isinstance(x, dict):
            continue
        team = str(x.get("display_name") or "").strip()
        conf = str(x.get("conference") or "").strip().lower()
        win, loss = integer(x.get("wins")), integer(x.get("losses"))
        if not team or conf not in ("western", "eastern") or win is None or loss is None or team in seen:
            continue
        seen.add(team)
        groups.append({
            "team": team, "group": "Western Conference" if conf == "western" else "Eastern Conference",
            "wins": win, "losses": loss,
            "played": win + loss,
            "win_pct": round(win / (win + loss), 4) if win + loss else 0.0
        })
    west = [g for g in groups if g["group"] == "Western Conference"]
    east = [g for g in groups if g["group"] == "Eastern Conference"]
    if len(west) != 15 or len(east) != 15:
        raise RuntimeError("NBA conference membership incomplete")
    for conf in (east, west):
        conf.sort(key=lambda x: (-x["win_pct"], -x["wins"], x["team"]))
        for i, row in enumerate(conf, 1):
            row["rank"] = i
    return {"id": "dunk-nba-" + str(year), "title": "NBA " + str(year - 1) + "-" + str(year),
            "kind": "basketball", "sport": "basketball", "provider": "dunkapi",
            "groups": groups, "prominence": 440}


def football_fixture(x):
    if not isinstance(x, dict):
        return None
    when = x.get("utcDate")
    ident = x.get("id")
    teams = (x.get("homeTeam") or {}, x.get("awayTeam") or {})
    if not all(isinstance(t, dict) and t.get("name") for t in teams):
        return None
    if not isinstance(when, str) or not when.endswith("Z") or integer(ident) is None:
        return None
    state = str(x.get("status") or "")
    if state in ("SCHEDULED", "TIMED"):
        status = "scheduled"
    elif state in ("IN_PLAY", "PAUSED", "LIVE", "EXTRA_TIME", "PENALTY_SHOOTOUT"):
        status = "live"
    elif state in ("FINISHED", "AWARDED"):
        status = "finished"
    else:
        return None
    s = (x.get("score") or {}).get("fullTime") or {}
    score_home = integer(s.get("home")) if status != "scheduled" else None
    score_away = integer(s.get("away")) if status != "scheduled" else None
    info = x.get("competition") or {}
    league = LEAGUES.get(info.get("code"), str(info.get("name") or "").strip())
    if not league:
        return None
    return {"id": "football-data-" + str(ident), "provider": "football-data", "sport": "football",
            "league": league, "stage": str(x.get("stage") or "").replace("_", " ").title(),
            "start_time": when, "status": status, "status_detail": state,
            "home": teams[0]["name"], "away": teams[1]["name"],
            "score_home": score_home, "score_away": score_away,
            "best_of": None, "winner_id": None, "prominence": 190 if info.get("code") in LEAGUES else 130,
            "source_url": "https://www.football-data.org/"}


def football_standing(payload, code):
    tables = payload.get("standings")
    if not isinstance(tables, list):
        return None
    groups = []
    for table in tables:
        if not isinstance(table, dict) or table.get("type") != "TOTAL":
            continue
        for row in table.get("table", []):
            team = row.get("team") if isinstance(row, dict) else None
            if not isinstance(team, dict) or not team.get("name"):
                continue
            rank, wins, losses = integer(row.get("position"), False), integer(row.get("won")), integer(row.get("lost"))
            draws, points, played = integer(row.get("draw")), integer(row.get("points")), integer(row.get("playedGames"))
            if rank is None or wins is None or losses is None or draws is None or points is None:
                continue
            groups.append({
                "rank": rank, "team": str(team["name"]), "wins": wins, "losses": losses,
                "draws": draws, "points": points, "played": played,
                "group": "Group " + str(table["group"])[-1:] if table.get("group") else ""
            })
    if len(groups) < 10:
        return None
    return {"id": "football-data-" + code, "title": LEAGUES[code], "provider": "football-data",
            "sport": "football", "kind": "football", "groups": groups, "prominence": 170}


def collect_football(key, instant):
    day = instant.date()
    params = urlencode({"dateFrom": (day - dt.timedelta(days=1)).isoformat(),
                        "dateTo": (day + dt.timedelta(days=9)).isoformat()})
    matches = request(FOOTBALL + "/matches?" + params, {"X-Auth-Token": key}).get("matches")
    if not isinstance(matches, list):
        raise RuntimeError("Football schedule missing")
    events = [v for x in matches if (v := football_fixture(x))]
    events.sort(key=lambda x: (x["start_time"], x["id"]))
    if not events:
        raise RuntimeError("No verified football schedule")
    standings = []
    errors = []
    for code in STANDING_CODES:
        time.sleep(0.7)
        try:
            board = football_standing(
                request(FOOTBALL + "/competitions/" + code + "/standings", {"X-Auth-Token": key}),
                code)
            if board:
                standings.append(board)
            else:
                errors.append(code + ": no complete table")
        except Exception as exc:
            errors.append(code + ": " + type(exc).__name__)
    return events, standings, errors


def main():
    instant = now()
    stamp = iso(instant)
    previous = read_json(OUT)
    events = []
    standings = []
    sources = []
    nba_key = os.getenv("DUNKAPI_API_KEY", "").strip()
    football_key = os.getenv("FOOTBALL_DATA_API_KEY", "").strip()

    try:
        if not nba_key:
            raise RuntimeError("DUNKAPI_API_KEY not configured")
        season = instant.year + (1 if instant.month >= 7 else 0)
        board = nba_standings(nba_key, season)
        standings.append(board)
        sources.append({"tag": "dunkapi", "status": "ok", "count": len(board["groups"]), "verified_at": stamp})
    except Exception as exc:
        prior = [x for x in previous.get("standings", [])
                 if x.get("provider") == "dunkapi"]
        standings.extend(prior)
        sources.append({"tag": "dunkapi", "status": "stale" if prior else "failed",
                        "count": sum(len(x.get("groups", [])) for x in prior),
                        "verified_at": next((s.get("verified_at") for s in previous.get("sources", [])
                                             if s.get("tag") == "dunkapi"), None)})
        print("DunkAPI verification unavailable:", type(exc).__name__, flush=True)

    try:
        if not football_key:
            raise RuntimeError("FOOTBALL_DATA_API_KEY not configured")
        f_events, f_boards, misses = collect_football(football_key, instant)
        events.extend(f_events)
        standings.extend(f_boards)
        # Retain missing league tables but never replace recent verified tables.
        found = {x["id"] for x in f_boards}
        standings.extend(x for x in previous.get("standings", [])
                         if x.get("provider") == "football-data" and x.get("id") not in found)
        sources.append({"tag": "football-data", "status": "partial" if misses else "ok",
                        "count": len(f_events), "standings": len(f_boards),
                        "verified_at": stamp})
        if misses:
            print("Football standings temporarily unavailable:", len(misses), flush=True)
    except Exception as exc:
        prior_events = [x for x in previous.get("events", []) if x.get("provider") == "football-data"]
        prior_boards = [x for x in previous.get("standings", []) if x.get("provider") == "football-data"]
        events.extend(prior_events)
        standings.extend(prior_boards)
        sources.append({"tag": "football-data", "status": "stale" if prior_events else "failed",
                        "count": len(prior_events), "verified_at": next(
                            (s.get("verified_at") for s in previous.get("sources", [])
                             if s.get("tag") == "football-data"), None)})
        print("Football verification unavailable:", type(exc).__name__, flush=True)

    output = {"schema": 1, "source_type": "supplemental_fixtures",
              "generated_at": stamp, "interval_hours": 6, "sources": sources,
              "status": "ok" if all(x["status"] == "ok" for x in sources) else "partial",
              "events": events, "standings": standings,
              "notes": "Verified third-party provider data, 6-hour refresh; provider attribution required."}
    # Do not mark an entirely failed first collection as successfully verified.
    if not events and not standings:
        raise SystemExit("No verified supplemental records available")
    write_json(OUT, output)
    print("Supplemental sports: {} football fixtures, {} standings ({} teams)".format(
        len(events), len(standings), sum(len(x.get("groups", [])) for x in standings)), flush=True)


if __name__ == "__main__":
    main()

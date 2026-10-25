#!/usr/bin/env python3
"""Read-only Predict.fun pre-match winner markets. Never exposes API credentials."""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from feed_common import write_json

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/predict-sports.json"
BASE = "https://api.predict.fun/v1/categories"
UTC = dt.timezone.utc
HEADERS = {"Accept": "application/json", "User-Agent": "LiangYou-ResourceHub-Sports/2.0"}
LEAGUES = {
    "lol": "英雄联盟", "basketball": "NBA", "football": "足球",
    "esports": "其他电竞", "other": "其他体育",
}
EXCLUDE = re.compile(r"\b(?:game|map|set|quarter|half)\s*[-#]?\d|spread|handicap|total\s+(?:kills|maps|rounds|points)|over.?under|first\s+blood|first\s+tower|correct\s+score", re.I)
MATCH = re.compile(r"\bvs\.?\b|\s@\s|\bversus\b", re.I)


def moment(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    except ValueError:
        return None


def fetch_categories(api_key, pages=12):
    """Bounded cursor pagination and retry; never include credentials in errors."""
    cursor, seen = None, set()
    all_categories = []
    for _ in range(pages):
        query = {"first": 100, "status": "OPEN"}
        if cursor:
            query["after"] = cursor
        request = Request(BASE + "?" + urlencode(query), headers={**HEADERS, "x-api-key": api_key})
        payload = None
        for attempt in range(3):
            try:
                with urlopen(request, timeout=25) as response:
                    payload = json.load(response)
                break
            except Exception:
                if attempt == 2:
                    raise RuntimeError("Predict.fun categories request failed (network, API key, rate limit or region)")
                time.sleep(2 ** attempt)
        if not isinstance(payload, dict) or payload.get("success") is not True or not isinstance(payload.get("data"), list):
            raise RuntimeError("Unexpected Predict.fun categories response")
        page = payload["data"]
        all_categories.extend(page)
        next_cursor = payload.get("cursor")
        if not page or not next_cursor or next_cursor in seen:
            break
        seen.add(next_cursor)
        cursor = next_cursor
    return all_categories


def category_type(category):
    value = " ".join(str(x or "") for x in (
        category.get("slug"), category.get("title"), category.get("shortTitle"),
        category.get("marketVariant"),
        " ".join(str(t.get("slug") or t.get("name") or "") for t in category.get("tags", []) if isinstance(t, dict)),
    )).lower()
    sports = category.get("variantDetails", {}).get("sports") if isinstance(category.get("variantDetails"), dict) else None
    # A match should have two identifiable opponents; don't treat championship outright
    # markets and unrelated questions as games.
    if not (MATCH.search(value) or isinstance(sports, dict) and sports.get("teams")):
        return None
    if EXCLUDE.search(value):
        return None
    if re.search(r"league.of.legends|\blol\b|worlds.2026|lck|lpl", value):
        return "lol"
    if re.search(r"\bnba\b|basketball|wnba", value):
        return "basketball"
    if re.search(r"counter.strike|\bcs2\b|dota.?2|valorant|esports", value):
        return "esports"
    if re.search(r"\bcfb\b|college.football|american.football|\bnfl\b|ncaa.football", value):
        return "other"
    if re.search(r"soccer|football|premier.league|serie.a|la.liga|bundesliga|champions.league|ligue.1|\bepl\b", value):
        return "football"
    if re.search(r"\bnfl\b|\bmlb\b|baseball|\bnhl\b|tennis|\batp\b|\bwta\b", value):
        return "other"
    return None


def team_list(category):
    details = category.get("variantDetails")
    sports = details.get("sports") if isinstance(details, dict) else None
    options = category.get("teams") or (sports or {}).get("teams") or []
    names = []
    for option in options:
        if not isinstance(option, dict):
            continue
        name = str(option.get("name") or option.get("alias") or option.get("abbreviation") or "").strip()
        if name and name.casefold() not in [x.casefold() for x in names]:
            names.append(name)
    if len(names) == 2:
        return names
    title = str(category.get("shortTitle") or category.get("title") or "")
    match = re.search(r"(.+?)\s+(?:vs\.?|versus|@)\s+(.+)", title, re.I)
    if match:
        left = re.sub(r"^(?:lol|nba|nfl|mlb|cs2|dota2)\s*:\s*", "", match.group(1), flags=re.I).strip()
        right = re.split(r"\s*(?:\|| · | - BO[135]| - game)\s*", match.group(2), maxsplit=1, flags=re.I)[0].strip()
        if 2 <= len(left) <= 80 and 2 <= len(right) <= 80:
            return [left, right]
    return []


def side_name(item, teams):
    """Match a quote's team identity against the event's real participants."""
    details = item.get("variantDetails")
    variants = item.get("variantData")
    sports = details.get("sports") if isinstance(details, dict) else None
    options = [item.get("team"), (sports or {}).get("team"),
               variants.get("team") if isinstance(variants, dict) else None]
    def compact(x):
        return re.sub(r"[^a-z0-9]+", "", str(x or "").casefold())
    for entry in options:
        if not isinstance(entry, dict):
            continue
        for key in ("name", "alias", "abbreviation"):
            for team in teams:
                if compact(entry.get(key)) and compact(entry.get(key)) == compact(team):
                    return team
    name = str(item.get("name") or item.get("title") or "")
    for team in teams:
        if compact(name) and compact(name) == compact(team):
            return team
    return "平局" if name.casefold() in ("draw", "tie") else None


def mid_price(outcome):
    try:
        bid = float((outcome.get("bestBid") or {})["price"])
        ask = float((outcome.get("bestAsk") or {})["price"])
    except (TypeError, ValueError, KeyError):
        return None
    # Price interpolation is forbidden for huge spreads/placeholder books.
    if not (0 < bid <= ask < 1 and ask - bid <= .20):
        return None
    return round((bid + ask) / 2, 4)


def normalize(category, now):
    if not isinstance(category, dict) or category.get("status") not in ("OPEN", "REGISTERED"):
        return None
    if category.get("isVisible") is False or category.get("parentSlug"):
        return None
    kind = category_type(category)
    when = moment(category.get("startsAt"))
    if not kind or not when or not (now < when <= now + dt.timedelta(days=30)):
        return None
    slug = str(category.get("slug") or "")
    if not re.fullmatch(r"[a-z0-9_-]{3,190}", slug):
        return None
    teams = team_list(category)
    if len(teams) != 2:
        return None
    markets = category.get("markets")
    if not isinstance(markets, list):
        return None
    selected = None
    for market in markets:
        if not isinstance(market, dict):
            continue
        if str(market.get("marketType") or "").upper() not in ("SPORTS_MONEYLINE", "MONEYLINE"):
            continue
        if market.get("tradingStatus") not in (None, "OPEN") or market.get("isVisible") is False:
            continue
        if EXCLUDE.search(str(market.get("title") or "") + " " +
                          str(market.get("question") or "") + " " +
                          str(market.get("description") or "")[:150]):
            continue
        market_id = market.get("id")
        if market_id is None:
            continue
        outcomes = market.get("outcomes")
        if not isinstance(outcomes, list) or len(outcomes) not in (2, 3):
            continue
        found = {}
        for outcome in outcomes:
            if not isinstance(outcome, dict):
                continue
            side = side_name(outcome, teams)
            price = mid_price(outcome)
            if side is None or price is None or side in found:
                continue
            found[side] = {"name": side, "probability": price, "market_id": str(market_id)}
        wanted = teams if len(outcomes) == 2 else [teams[0], "平局", teams[1]]
        if set(found) != set(wanted):
            continue
        candidate = [found[team] for team in wanted]
        if not .95 <= sum(x["probability"] for x in candidate) <= 1.05:
            continue
        selected = candidate
        break
    if not selected:
        return None
    title = str(category.get("shortTitle") or category.get("title") or "").strip()
    if not title or len(title) > 180:
        title = " vs ".join(teams)
    league = LEAGUES[kind]
    sports = (category.get("variantDetails") or {}).get("sports") or {}
    for member in (category.get("teams") or sports.get("teams") or []):
        if isinstance(member, dict) and member.get("league"):
            league = str(member["league"])[:64]
            break
    return {
        "id": "predict-" + str(category.get("id") or slug),
        "title": title, "category": kind, "league": league,
        "start_time": when.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "outcomes": selected, "checked_at": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "verification": "open_match_winner_market",
        "provider": "predict",
        "source_url": "https://predict.fun/market/" + slug,
    }


def main():
    key = os.environ.get("PREDICT_FUN_API_TOKEN", "").strip()
    if not key:
        raise SystemExit("Predict.fun API token is not configured; existing snapshot preserved")
    now = dt.datetime.now(UTC)
    categories = fetch_categories(key)
    matched = {}
    for category in categories:
        event = normalize(category, now)
        if event:
            matched[event["id"]] = event
    groups = {name: [] for name in LEAGUES}
    for event in sorted(matched.values(), key=lambda e: (e["start_time"], e["id"])):
        if len(groups[event["category"]]) < 12:
            groups[event["category"]].append(event)
    selected = [event for category in LEAGUES for event in groups[category]]
    snapshot = {
        "schema": 1, "source": "Predict.fun API", "source_type": "prediction_market",
        "generated_at": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "interval_hours": 2, "status": "ok",
        "sources": [{"tag": "predict-categories", "status": "ok", "received": len(categories),
                     "verified_matches": len(selected)}],
        "events": selected,
        "notes": "赛前胜负市场的买卖报价中位数，仅为市场隐含概率；无有效报价不展示。仅供赛事参考。",
    }
    write_json(OUTPUT, snapshot)
    print("Predict.fun: checked %s categories, published %s verified matches" % (len(categories), len(selected)))


if __name__ == "__main__":
    main()

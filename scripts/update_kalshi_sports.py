#!/usr/bin/env python3
"""Kalshi read-only match winner markets. No credentials, trading or fake kickoffs."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
import json
import math
from pathlib import Path
import re
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from feed_common import write_json

OUTPUT = Path(__file__).resolve().parents[1] / "data/kalshi-sports.json"
BASE = "https://api.elections.kalshi.com/trade-api/v2"
UTC = timezone.utc
HEADERS = {"Accept": "application/json", "User-Agent": "LiangYou-ResourceHub-Sports/3.0"}
# Real match-winner series only: totals, spreads, map props and outright futures excluded.
SERIES = {
    "lol": ("KXLOLGAME",),
    "basketball": ("KXNBAGAME", "KXWNBAGAME", "KXNCAABBGAME"),
    "football": ("KXEPLGAME", "KXUCLGAME", "KXUEFAGAME", "KXLALIGAGAME",
                 "KXSERIEAGAME", "KXBUNDESLIGAGAME", "KXMLSGAME"),
    "esports": ("KXCS2GAME", "KXDOTA2GAME", "KXVALORANTGAME"),
    "other": ("KXNFLGAME", "KXMLBGAME", "KXNHLGAME", "KXATPMATCH", "KXWTAMATCH",
              "KXCFBGAME", "KXUFCFIGHT", "KXF1H2H"),
}
LEAGUE = {
    "KXLOLGAME":"英雄联盟", "KXNBAGAME":"NBA", "KXEPLGAME":"英超",
    "KXUCLGAME":"欧冠", "KXUEFAGAME":"欧冠", "KXLALIGAGAME":"西甲",
    "KXSERIEAGAME":"意甲", "KXBUNDESLIGAGAME":"德甲", "KXMLSGAME":"MLS",
    "KXCS2GAME":"CS2", "KXDOTA2GAME":"Dota 2", "KXVALORANTGAME":"Valorant",
    "KXNFLGAME":"NFL", "KXMLBGAME":"MLB", "KXNHLGAME":"NHL",
    "KXATPMATCH":"ATP", "KXWTAMATCH":"WTA"
}
BAD_LABEL = re.compile(r"\b(?:total|spread|handicap|over|under|point|score|map\s*\d|round\s*\d|set\s*\d|kills?|parlay)\b", re.I)
MATCH = re.compile(r"\bvs\.?\b|\bv\.?\b|\s@\s|\bversus\b", re.I)
TICKER = re.compile(r"^[A-Z0-9-]{6,110}$")


def iso(instant):
    return instant.isoformat(timespec="seconds").replace("+00:00", "Z")


def moment(raw):
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(UTC)
    except ValueError:
        return None


def positive_number(value, allow_zero=False):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number < 0 or (number == 0 and not allow_zero):
        return None
    return round(number, 2)


def price(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return round(number, 4) if math.isfinite(number) and 0 < number < 1 else None


def get_json(url):
    req = Request(url, headers=HEADERS)
    for attempt in range(3):
        try:
            with urlopen(req, timeout=18) as response:
                obj = json.load(response)
            if not isinstance(obj, dict):
                raise ValueError("Expected an object from Kalshi")
            return obj
        except HTTPError as exc:
            if exc.code in (400, 404):
                return None  # Unlisted or inactive series.
            if attempt == 2:
                raise RuntimeError("Kalshi request unavailable: HTTP " + str(exc.code)) from None
        except Exception:
            if attempt == 2:
                raise RuntimeError("Kalshi market API unavailable") from None
        time.sleep(1 + attempt)
    return None


def fetch_series(series, pages=2):
    results, cursor, seen = [], None, set()
    for _ in range(pages):
        params = {"series_ticker":series, "status":"open",
                  "limit":100, "with_nested_markets":"true",
                  "min_close_ts":int(datetime.now(UTC).timestamp())}
        if cursor:
            params["cursor"] = cursor
        payload = get_json(BASE + "/events?" + urlencode(params))
        if payload is None:
            break
        events = payload.get("events")
        if not isinstance(events, list):
            raise RuntimeError("Unexpected Kalshi event page")
        results.extend(events)
        nxt = payload.get("cursor")
        if not nxt or nxt in seen or not events:
            break
        seen.add(nxt)
        cursor = nxt
    return results


def series_slug(series):
    """Use the exchange's series title for the canonical public event deep link."""
    try:
        info = get_json(BASE + "/series/" + series)
        record = info.get("series") if isinstance(info, dict) else None
        title = str(record.get("title") or "") if isinstance(record, dict) else ""
        slug = re.sub(r"[^a-z0-9]+","-",title.lower()).strip("-")
        if 3 <= len(slug) <= 90:
            return slug
    except Exception:
        pass
    return None


def is_open(market):
    return market.get("status") in ("active","open") and not market.get("result")


def selected_time(event, markets, now):
    """Never report market close as an actual kickoff."""
    meta = event.get("product_metadata") or {}
    if not isinstance(meta, dict):
        meta = {}
    for key in ("game_start_time","game_start_at","scheduled_start_time",
                "start_time","scheduled_start","match_start_time"):
        value = moment(meta.get(key)) or moment(event.get(key))
        if value and now < value <= now + timedelta(days=30):
            return value, "kickoff"
    possibilities = [moment(m.get("occurrence_datetime")) for m in markets
                     if moment(m.get("occurrence_datetime"))]
    if len(possibilities) == len(markets) and possibilities and max(possibilities)-min(possibilities) <= timedelta(minutes=15):
        value = min(possibilities)
        if now < value <= now + timedelta(days=30):
            return value, "kickoff"
    # Not a kickoff: clearly mark that this timestamp is the trading closing time.
    values = [moment(m.get("close_time")) for m in markets]
    values = [v for v in values if v]
    if len(values) == len(markets) and values and max(values)-min(values) <= timedelta(hours=48):
        value = min(values)
        if now < value <= now + timedelta(days=30):
            return value, "market_close"
    return None, None


def normalize(event, series, now, page_slug=None, discovered_category=None, league_label=None):
    if not isinstance(event, dict):
        return None
    ticker = str(event.get("event_ticker") or "")
    if not TICKER.fullmatch(ticker) or str(event.get("series_ticker") or "").upper() != series:
        return None
    if str(event.get("category") or "Sports").lower() not in ("sports", "esports"):
        return None
    category = discovered_category or next((k for k, v in SERIES.items() if series in v), None)
    if not category:
        return None
    all_markets = event.get("markets")
    if not isinstance(all_markets, list) or len(all_markets) not in (2, 3):
        return None  # Requires all match-winner outcomes; not a single isolated bet.
    title = str(event.get("title") or "").strip()
    subtitle = str(event.get("sub_title") or "").strip()
    if not title or len(title) > 180 or not (MATCH.search(title) or MATCH.search(subtitle)):
        return None
    if BAD_LABEL.search(title) or BAD_LABEL.search(subtitle):
        return None
    parsed = []
    for market in all_markets:
        if not isinstance(market, dict) or not is_open(market):
            return None
        if market.get("market_type") not in (None, "binary"):
            return None
        if market.get("mve_collection_ticker") or market.get("mve_selected_legs"):
            return None
        slug = str(market.get("ticker") or "")
        if not TICKER.fullmatch(slug) or market.get("event_ticker") != ticker:
            return None
        label = str(market.get("yes_sub_title") or "").strip()
        if not label or len(label) > 80 or BAD_LABEL.search(label):
            return None
        bid, ask = price(market.get("yes_bid_dollars")), price(market.get("yes_ask_dollars"))
        if bid is None or ask is None or ask < bid or ask - bid > .20:
            return None
        outcome = {"name": "平局" if label.casefold() in ("tie","draw") else label,
                   "probability": round((bid + ask) / 2,4),
                   "market_id": slug, "best_bid":bid, "best_ask":ask}
        for source, destination in (("yes_bid_size_fp","best_bid_size"),
                                    ("yes_ask_size_fp","best_ask_size")):
            v = positive_number(market.get(source))
            if v is not None:
                outcome[destination] = v
        last = price(market.get("last_price_dollars"))
        previous = price(market.get("previous_price_dollars"))
        if last is not None:
            outcome["last_price"] = last
        if previous is not None:
            outcome["previous_price"] = previous
        parsed.append((market,outcome))
    names = [x["name"].casefold() for _,x in parsed]
    if len(set(names)) != len(names):
        return None
    if len(parsed) == 3 and "平局" not in [x["name"] for _,x in parsed]:
        return None
    if not .90 <= sum(x["probability"] for _,x in parsed) <= 1.10:
        return None
    when, kind = selected_time(event, [m for m,_ in parsed], now)
    if not when:
        return None
    if len(parsed) == 3:
        parsed.sort(key=lambda item: item[1]["name"] == "平局") # reorder below into middle
        draw = next(x for x in parsed if x[1]["name"] == "平局")
        others = [x for x in parsed if x[1]["name"] != "平局"]
        parsed = [others[0], draw, others[1]]
    # Kalshi contract volumes are counts, NOT USD. Never feed them into USD slots.
    stats = {}
    for field, label in (("volume_24h_fp","volume_24h_contracts"),
                         ("volume_fp","volume_total_contracts"),
                         ("open_interest_fp","open_interest_contracts")):
        values = [positive_number(m.get(field),allow_zero=True) for m,_ in parsed]
        if all(v is not None for v in values):
            stats[label] = round(sum(values),2)
    if ("volume_24h_contracts" in stats and "volume_total_contracts" in stats and
            stats["volume_24h_contracts"] > stats["volume_total_contracts"]):
        stats.pop("volume_total_contracts",None)
    best_of_match = re.search(r"\bBO([1357])\b",title,re.I)
    competition = subtitle[:85] if subtitle and not MATCH.search(subtitle) else None
    checked = iso(now)
    return {
        "id":"kalshi-" + ticker.lower(), "title":title,
        "category":category, "league":league_label or LEAGUE.get(series,category),
        "start_time":iso(when), "time_kind":kind,
        "best_of":int(best_of_match.group(1)) if best_of_match else None,
        "competition":competition, "outcomes":[o for _,o in parsed],
        "stats":stats, "checked_at":checked,
        "verification":"open_match_winner_market", "provider":"kalshi",
        "source_url": ("https://kalshi.com/markets/" + series.lower() + "/" +
                       page_slug + "/" + ticker.lower()) if page_slug
                      else ("https://kalshi.com/markets/" + series.lower())
    }


def find_extra_series():
    """Single optional metadata request, capped to six additional head-to-head series."""
    try:
        data = get_json(BASE + "/series?category=Sports")
        options = data.get("series", []) if isinstance(data, dict) else []
        if not isinstance(options, list):
            return []
        exclude = {s for group in SERIES.values() for s in group}
        extras = []
        for entry in options:
            if not isinstance(entry, dict):
                continue
            ticker = str(entry.get("ticker") or "")
            title = str(entry.get("title") or "")
            labels = " ".join(str(x) for x in entry.get("tags",[]) if isinstance(x,str))
            description = (ticker+" "+title+" "+labels).lower()
            if not re.fullmatch(r"KX[A-Z0-9]{3,40}", ticker) or ticker in exclude:
                continue
            if not re.search(r"game|match|head.to.head|h2h|fight", description):
                continue
            if re.search(r"total|spread|prop|futures|outright|champion|winner of|over|under|goals|points|set winner|map winner",description):
                continue
            if re.search(r"college basketball|ncaa basketball|wnba",description):
                cat="basketball"
            elif re.search(r"college football|ncaa football|ufc|mma|formula 1|formula one|motorsport|golf",description):
                cat="other"
            elif re.search(r"ligue 1|french league|national team soccer|international soccer",description):
                cat="football"
            elif re.search(r"valorant|league of legends|counter.strike|dota 2",description):
                cat="esports" if not re.search(r"league of legends",description) else "lol"
            else:
                continue
            extras.append((cat,ticker,title[:55] or ticker))
            exclude.add(ticker)
            if len(extras) >= 6:
                break
        return extras
    except Exception:
        print("Kalshi series discovery unavailable; using curated series",flush=True)
        return []


def main():
    now = datetime.now(UTC)
    curated = [(k,s,LEAGUE.get(s,s)) for k,series in SERIES.items() for s in series]
    extra = find_extra_series()
    all_series = (curated+extra)[:28]
    print("Kalshi series budget: %d curated and %d discovered" %
          (len(curated),len(all_series)-len(curated)),flush=True)
    health = []
    def collect(entry):
        category, series, league = entry
        try:
            pages = 2 if series in {s for _,s,_ in curated} else 1
            rows = fetch_series(series,pages=pages)
            slug = series_slug(series) if rows else None
            return (category,series,league,rows,slug,None)
        except Exception as exc:
            return (category,series,league,[],None,str(exc)[:110])
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(collect, all_series))
    found = {}
    for category,series,league,rows,slug,error in results:
        health.append({"tag":series,"status":"unavailable" if error else "ok","received":len(rows)})
        if error:
            print("Kalshi series unavailable: %s" % series,flush=True)
        for raw in rows:
            event = normalize(raw,series,now,slug,category,league)
            if event:
                found[event["id"]] = event
    if not any(h["status"]=="ok" for h in health):
        raise RuntimeError("All Kalshi series requests failed; old snapshot preserved")
    # Avoid replacing previously validated data with an empty snapshot on a partial outage.
    if not found and any(h["status"]!="ok" for h in health):
        raise RuntimeError("No verifiable Kalshi events during a partial outage")
    buckets = {c:[] for c in SERIES}
    for event in sorted(found.values(),key=lambda e:(e["start_time"], e["id"])):
        if len(buckets[event["category"]])<30:
            buckets[event["category"]].append(event)
    # Interleave categories so the "all" tab isn't front-loaded with one sport.
    events = [buckets[cat][i] for i in range(30) for cat in SERIES
              if i < len(buckets[cat])]
    snapshot = {
        "schema":1,"source":"Kalshi public market API",
        "source_type":"prediction_market","generated_at":iso(now),
        "interval_hours":2,
        "status":"ok" if all(h["status"]=="ok" for h in health) else "partial",
        "link_schema_version":2,
        "sources":health,"events":events,
        "notes":"Kalshi is a prediction exchange. Contract volume and open interest are counts, not US dollars. Market close is not necessarily kickoff."
    }
    write_json(OUTPUT,snapshot)
    print("Kalshi verified events: %d from %d series (matched %d)" %
          (len(events),len(all_series),len(found)),flush=True)


if __name__ == "__main__":
    main()

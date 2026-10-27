#!/usr/bin/env python3
"""Keep a bounded, read-only history of verified pre-match market snapshots.

This does not call exchanges/APIs; it reads existing verified JSON produced by
the scheduled collectors. Missing or expired feeds never fabricate points.
"""
from __future__ import annotations
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "market-history.json"
FEEDS = (("polymarket", "sports.json"), ("predict", "predict-sports.json"),
         ("kalshi", "kalshi-sports.json"))
UTC = timezone.utc
MAX_MARKETS = 500
MAX_POINTS = 90
DAYS = 7

def date(value):
    if not isinstance(value, str):
        return None
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return d.astimezone(UTC) if d.tzinfo else None
    except (ValueError, OverflowError):
        return None

def stamp(value):
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")

def valid_outcomes(rows):
    if not isinstance(rows, list) or len(rows) not in (2, 3):
        return None
    collected = []
    for row in rows:
        if not isinstance(row, dict):
            return None
        name = row.get("name")
        raw = row.get("probability")
        if not isinstance(name, str) or not (0 < len(name) <= 100):
            return None
        if not isinstance(raw, (int, float)) or isinstance(raw, bool) or not math.isfinite(raw) or not 0 <= raw <= 1:
            return None
        collected.append([name, round(float(raw), 4)])
    if len({name.casefold() for name, _ in collected}) != len(collected):
        return None
    if not .90 <= sum(x[1] for x in collected) <= 1.10:
        return None
    return collected

def build(previous, feeds, instant):
    cutoff = instant - timedelta(days=DAYS)
    stored = previous.get("markets", {}) if isinstance(previous, dict) else {}
    markets = {}
    if isinstance(stored, dict):
        for key, row in stored.items():
            if not isinstance(key, str) or not isinstance(row, dict) or len(key) > 185:
                continue
            entries = []
            for entry in row.get("points", [])[-MAX_POINTS:]:
                if not isinstance(entry, dict):
                    continue
                tm = date(entry.get("at"))
                outs = entry.get("outcomes")
                if tm and cutoff <= tm <= instant + timedelta(hours=1) and isinstance(outs, list):
                    outcomes = valid_outcomes([{"name":x[0], "probability":x[1]}
                                              for x in outs if isinstance(x, list) and len(x) == 2])
                    if outcomes:
                        entries.append({"at":stamp(tm),"outcomes":outcomes})
            if entries:
                entries.sort(key=lambda item: item["at"])
                markets[key] = {"provider":row.get("provider"), "id":row.get("id"),
                    "points":entries[-MAX_POINTS:]}
    for provider, payload in feeds:
        if not isinstance(payload, dict) or payload.get("schema") != 1 or payload.get("source_type") != "prediction_market":
            continue
        verified = date(payload.get("generated_at"))
        if not verified or not cutoff <= verified <= instant + timedelta(hours=1):
            continue
        # Only use reasonably fresh source checks, not an old feed replayed as a new point.
        if instant - verified > timedelta(hours=6):
            continue
        for market in payload.get("events", []):
            if not isinstance(market, dict) or market.get("verification") != "open_match_winner_market":
                continue
            mid = market.get("id")
            if not isinstance(mid, str) or len(mid) > 120 or not mid.replace("-", "").replace("_", "").isalnum():
                continue
            if market.get("time_kind") == "market_close":
                continue
            checked = date(market.get("checked_at"))
            start = date(market.get("start_time"))
            if not checked or not start or checked > start or checked < cutoff:
                continue
            if checked > instant + timedelta(hours=1) or abs((checked - verified).total_seconds()) > 3600:
                continue
            outcomes = valid_outcomes(market.get("outcomes"))
            if not outcomes:
                continue
            key = provider + ":" + mid
            row = markets.setdefault(key, {"provider":provider, "id":mid, "points":[]})
            point = {"at":stamp(checked), "outcomes":outcomes}
            if any(x["at"] == point["at"] for x in row["points"]):
                continue
            row["points"].append(point)
            row["points"].sort(key=lambda x:x["at"])
            row["points"] = row["points"][-MAX_POINTS:]
    markets = dict(sorted(markets.items(),
                          key=lambda kv:kv[1]["points"][-1]["at"], reverse=True)[:MAX_MARKETS])
    updated = max((p["at"] for market in markets.values() for p in market["points"]),default=None)
    return {"schema":1,"source_type":"verified_market_history","retention_days":DAYS,
            "generated_at":updated,"markets":markets}

def main():
    previous = {}
    if OUT.exists():
        try:
            previous = json.loads(OUT.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            previous = {}
    feeds = []
    for provider, name in FEEDS:
        try:
            feeds.append((provider,json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))))
        except (OSError, ValueError):
            feeds.append((provider,{}))
    updated = build(previous,feeds,datetime.now(UTC))
    payload = json.dumps(updated,ensure_ascii=False,separators=(",",":"),allow_nan=False) + "\n"
    if not OUT.exists() or OUT.read_text(encoding="utf-8") != payload:
        OUT.write_text(payload,encoding="utf-8")
        print("Saved %d verified market histories" % len(updated["markets"]))
    else:
        print("Market history unchanged")

if __name__ == "__main__":
    main()

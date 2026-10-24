#!/usr/bin/env python3
"""Update sports probabilities from Polymarket's publicly readable Gamma API.

No sign-in, bookmaker credentials, paid plan, browser scraping, or JS required.
Only real open match-winner markets are published. Missing categories stay empty.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
import re
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "sports.json"
BASE = "https://gamma-api.polymarket.com/events"
# Query by current public Gamma tags. A tag can be temporarily empty between events.
SOURCES = (
    ("lol", "英雄联盟", ("league-of-legends",)),
    ("basketball", "NBA", ("nba",)),
    ("football", "足球", ("soccer", "epl", "ucl")),
    ("esports", "电竞", ("counter-strike-2", "dota-2")),
    ("other", "其他体育", ("nfl", "mlb", "atp", "wta")),
)
UTC = dt.timezone.utc


def as_list(value):
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except (ValueError, TypeError):
            return []
    return []


def date_value(value):
    if not value or not isinstance(value, str):
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    except (ValueError, TypeError):
        return None


def get_events(tag_slug):
    query = urlencode({
        "tag_slug": tag_slug,
        "active": "true",
        "closed": "false",
        "limit": "140" if tag_slug in ("soccer", "epl", "ucl") else "100",
        "order": "volume24hr" if tag_slug in ("soccer", "epl", "ucl") else "startDate",
        "ascending": "false" if tag_slug in ("soccer", "epl", "ucl") else "true",
    })
    url = BASE + "?" + query
    req = Request(url, headers={
        "User-Agent": "LiangYou-ResourceHub-Sports/1.0 (+https://github.com/MaddestAlistar/LiangYou-ResourceHub)",
        "Accept": "application/json",
    })
    last_error = None
    for attempt in range(3):
        try:
            with urlopen(req, timeout=20) as response:
                obj = json.load(response)
            if not isinstance(obj, list):
                raise ValueError("Gamma endpoint returned non-list")
            return obj
        except Exception as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Gamma request failed for tag {tag_slug}: {last_error}")


def get_by_slug(slug):
    """Read the parent match's moneyline event, excluding secondary markets."""
    req = Request(BASE + "?" + urlencode({"slug": slug}), headers={
        "User-Agent": "LiangYou-ResourceHub-Sports/1.0",
        "Accept": "application/json",
    })
    try:
        with urlopen(req, timeout=15) as resp:
            data = json.load(resp)
        return data if isinstance(data, list) else []
    except Exception as exc:
        print(f"Football match {slug}: {exc}", file=sys.stderr)
        return []


def normal_market(event, category):
    """Return only a real match-winner market (two-way or football three-way)."""
    title = str(event.get("title") or "").strip()
    if not re.search(r"\bvs\.?\b|\bv\.?\b|\s@\s", title, re.I):
        return None
    markets = event.get("markets") or []
    if not isinstance(markets, list):
        return None
    candidates = []
    binary = []
    for market in markets:
        if not isinstance(market, dict) or market.get("closed") is True:
            continue
        outcomes = as_list(market.get("outcomes"))
        values = as_list(market.get("outcomePrices"))
        if len(outcomes) not in (2, 3) or len(values) != len(outcomes):
            continue
        names = [str(x).strip() for x in outcomes]
        if any(not x or len(x) > 90 for x in names):
            continue
        try:
            prices = [float(x) for x in values]
        except (TypeError, ValueError):
            continue
        if not all(0 <= p <= 1 for p in prices):
            continue
        if not (0.78 <= sum(prices) <= 1.22):
            continue
        market_kind = str(market.get("sportsMarketType") or market.get("marketType") or "").lower()
        question = str(market.get("question") or "").lower()
        if market_kind and market_kind not in ("moneyline", "h2h", "match winner", "winner"):
            continue
        if re.search(r"\b(spread|handicap|total|over/under|maps|kills|rounds|points|correct score)\b", question):
            continue
        if set(x.lower() for x in names) == {"yes", "no"}:
            if category == "football" and market_kind == "moneyline":
                binary.append((question, dict(zip((x.lower() for x in names), prices))["yes"]))
            continue
        if any(n.lower() in ("over", "under", "yes", "no") for n in names):
            continue
        if not market_kind and not re.search(r"\b(win|winner|vs|match)\b", question):
            continue
        score = 2 if market_kind in ("moneyline", "h2h", "match winner") else 0
        if "winner" in question or "win " in question or " vs " in question:
            score += 1
        candidates.append((score, names, prices))
    if candidates:
        candidates.sort(key=lambda entry: entry[0], reverse=True)
        _, names, prices = candidates[0]
        return [{"name": n, "probability": round(p, 4)} for n, p in zip(names, prices)]
    # Many football games expose three separate binary moneyline questions:
    # "Will Team A win?" / "Will the match be a draw?" / "Will Team B win?".
    # Reconstruct only when all 3 outcomes are unambiguously identified.
    if category != "football" or len(binary) < 3:
        return None
    teams = re.split(r"\s+vs\.?\s+|\s+@\s+", title, maxsplit=1, flags=re.I)
    if len(teams) != 2:
        return None
    left = teams[0].split(":")[-1].strip()
    right = re.split(r"\s+\-\s+|\s+\(", teams[1], maxsplit=1)[0].strip()
    if min(len(left), len(right)) < 3:
        return None
    found = {}
    for q, yes in binary:
        a = left.casefold() in q
        b = right.casefold() in q
        if "draw" in q or "tie" in q:
            found["draw"] = yes
        elif a and not b:
            found["left"] = yes
        elif b and not a:
            found["right"] = yes
    if set(found) != {"left", "draw", "right"}:
        return None
    probs = [found["left"], found["draw"], found["right"]]
    if not 0.78 <= sum(probs) <= 1.22:
        return None
    return [{"name": n, "probability": round(p, 4)} for n, p in
            zip((left, "平局", right), probs)]


def normalize(event, category, fallback_label, now):
    if event.get("closed") is True or event.get("active") is False:
        return None
    slug = str(event.get("slug") or "")
    if not re.fullmatch(r"[a-z0-9-]{3,160}", slug):
        return None
    title = str(event.get("title") or "").strip()
    if not 4 <= len(title) <= 170:
        return None
    outcomes = normal_market(event, category)
    if outcomes is None:
        return None
    when = date_value(event.get("startTime") or event.get("gameStartTime") or event.get("startDate"))
    if when is not None:
        if when < now or when > now + dt.timedelta(days=60):
            return None
    league = fallback_label
    series = event.get("series")
    if isinstance(series, list) and series and isinstance(series[0], dict):
        league = str(series[0].get("title") or fallback_label)[:60]
    elif isinstance(series, dict):
        league = str(series.get("title") or fallback_label)[:60]
    return {
        "id": str(event.get("id") or slug),
        "title": title,
        "category": category,
        "league": league,
        "start_time": when.isoformat().replace("+00:00", "Z") if when else None,
        "outcomes": outcomes,
        "source_url": "https://polymarket.com/event/" + slug,
    }


def main():
    now = dt.datetime.now(UTC)
    items = {}
    totals = {}
    requested = set()
    printed_parent = False
    for category, label, tags in SOURCES:
        found = 0
        for tag in tags:
            events = get_events(tag)
            if category == "football":
                parent_slugs = []
                for match in events:
                    if not isinstance(match, dict):
                        continue
                    slug = str(match.get("slug") or "")
                    matched = re.match(r"^([a-z0-9-]+-\d{4}-\d{2}-\d{2})(?:-[a-z0-9-]+)?$", slug)
                    if not matched:
                        continue
                    parent_slug = matched.group(1)
                    if parent_slug != slug and parent_slug not in requested:
                        requested.add(parent_slug)
                        parent_slugs.append(parent_slug)
                for parent_slug in parent_slugs[:16]:
                    matches = get_by_slug(parent_slug)
                    if matches and not printed_parent:
                        first = matches[0]
                        print("FOOTBALL_PARENT", json.dumps({
                            "title": first.get("title"),
                            "markets": [{"q": p.get("question"), "type": p.get("sportsMarketType"),
                                         "outcomes": p.get("outcomes"), "prices": p.get("outcomePrices")}
                                         for p in (first.get("markets") or [])[:5]
                                         if isinstance(p, dict)]}, ensure_ascii=False)[:2600], flush=True)
                        printed_parent = True
                    events.extend(matches)
            for event in events:
                if not isinstance(event, dict):
                    continue
                normalized = normalize(event, category, label, now)
                if normalized is None:
                    continue
                found += 1
                # Different tags can overlap; keep the more specific category first.
                items.setdefault(normalized["id"], normalized)
            print(f"{tag}: received {len(events)} candidate events", flush=True)
        totals[category] = found

    def display_priority(event):
        # Prioritise well-known football leagues while preserving nearer games
        # and independently filling the other sport groups.
        if event["category"] != "football":
            return (0, event["start_time"] is None, event["start_time"] or "9999", event["id"])
        league = event["league"].casefold()
        priority_leagues = (
            "premier league", "champions league", "la liga", "serie a",
            "bundesliga", "ligue 1", "europa league", "world cup",
        )
        return (0 if any(name in league for name in priority_leagues) else 1,
                event["start_time"] is None, event["start_time"] or "9999", event["id"])

    sorted_items = sorted(items.values(), key=lambda e: (e["category"], display_priority(e)))
    selection = []
    counts = {key: 0 for key, _, _ in SOURCES}
    for item in sorted_items:
        group = item["category"]
        if counts[group] >= 12:
            continue
        selection.append(item)
        counts[group] += 1

    snapshot = {
        "schema": 1,
        "source": "Polymarket Gamma API",
        "source_type": "prediction_market",
        "generated_at": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "interval_hours": 2,
        "events": selection,
        "notes": "市场报价隐含概率，并非博彩公司赔率，也不保证赛事结果；数据按 2 小时计划更新，GitHub Actions 执行可能延迟。",
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n"
    if OUTPUT.exists() and OUTPUT.read_text(encoding="utf-8") == text:
        print("Snapshot unchanged")
    else:
        OUTPUT.write_text(text, encoding="utf-8")
    print(f"Published {len(selection)} verified match markets; category hits: {totals}")


if __name__ == "__main__":
    main()

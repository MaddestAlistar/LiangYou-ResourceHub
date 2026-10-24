#!/usr/bin/env python3
"""Regional paid-to-free evidence + fresh Apple Lookup price. No API key.
Discovery covers the last 30 days, including continuing offers. No fuzzy name
matching, cross-region old prices, IAP-only deals, or fabricated fill items.
"""
from __future__ import annotations
import json
import re
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlparse
from bs4 import BeautifulSoup
from feed_common import ROOT, UTC, get, iso, now, date, read_json, write_json

OUT = ROOT / 'data/daily-free.json'
ICONS = ROOT / 'assets/daily-free'
MAX_AGE = timedelta(days=30)
ATOM = '{http://www.w3.org/2005/Atom}'
APP_ID = re.compile(r'(?:/id|/(?:cn|us)/)(\d{7,12})(?!\d)')
DROP = re.compile(r'^\s*(?:价格|Price)\s*[:：]\s*([¥￥$]?\s*\d[\d,.]*)\s*→\s*(免费|free|[¥￥$]?\s*0(?:\.0+)?)(?=\s|<|$)', re.I)
FEED = 'https://raw.githubusercontent.com/appstore-discounts/appstore-discounts/main/rss/{country}.xml'

def recent(value, instant):
    return value is not None and instant - MAX_AGE <= value <= instant + timedelta(hours=1)

def candidate(app_id, old, source, url, when):
    amount = float(re.sub(r'[^\d.]', '', str(old).replace(',', '')) or '0')
    if amount <= 0:
        raise ValueError('Original price must be positive')
    return {'id': int(app_id), 'original_price': str(old).replace(' ', ''), 'source': source,
            'source_url': url, 'discovered_at': iso(when)}

def parse_rss(raw, country, instant):
    root = ET.fromstring(raw)
    entries = root.findall(f'{ATOM}entry') or root.findall('./channel/item')
    result = []
    for item in entries:
        prefix = ATOM if item.tag.startswith(ATOM) else ''
        value = lambda key: (item.findtext(prefix + key) or '').strip()
        summary = value('summary') or value('description')
        match = DROP.search(summary)
        if not match:
            continue
        stamp = value('updated') or value('published') or value('pubDate')
        when = date(stamp)
        if not when:
            try:
                when = parsedate_to_datetime(stamp).astimezone(UTC)
            except (TypeError, ValueError):
                continue
        link_el = item.find(prefix + 'link')
        link = link_el.get('href', '') if link_el is not None and prefix else value('link')
        appid = APP_ID.search(link)
        if appid and recent(when, instant):
            try:
                result.append(candidate(appid[1], match[1], 'App Store Discounts RSS', link, when))
            except ValueError:
                pass
    return result

def parse_us_history(raw, appid, instant):
    soup = BeautifulSoup(raw, 'html.parser')
    # The site's display times have no timezone. Use its calendar date only;
    # interpreting these local times as UTC wrongly excludes today's deals.
    for table in soup.select('table'):
        rows = []
        for row in table.select('tr'):
            cells = [c.get_text(' ', strip=True) for c in row.select('td')]
            if len(cells) >= 2:
                rows.append(cells)
        if len(rows) < 2 or not re.fullmatch(r'Free|GRATUIT|\$0(?:\.00)?', rows[0][-1], re.I):
            continue
        match = re.search(r'\b(\d{2}/\d{2}/\d{4})\b', rows[0][0])
        if not match:
            continue
        when = datetime.strptime(match[1], '%m/%d/%Y').replace(tzinfo=UTC)
        if not recent(when, instant):
            continue
        # Only the immediately preceding paid observation establishes the drop.
        prior = re.fullmatch(r'\$\s*(\d[\d,]*(?:\.\d+)?)', rows[1][-1])
        if prior and float(prior[1].replace(',', '')) > 0:
            item = candidate(appid, '$' + prior[1], 'AppStore-Discounts', f'https://appstore-discounts.com/en/app/{appid}', when)
            item['date_precision'] = 'day'
            return item
    return None

def us_histories(instant):
    base = 'https://appstore-discounts.com/en/free'
    home = get(base)
    soup = BeautifulSoup(home, 'html.parser')
    # The homepage is a small selection; category pages discover more real apps.
    categories = list(dict.fromkeys(a['href'] for a in soup.select('a[href]') if re.fullmatch(re.escape(base) + r'/[a-z-]+', a['href'])))
    pages = [home]
    failures = 0
    def fetch_page(url):
        try:
            return get(url, attempts=1)
        except Exception:
            return None
    with ThreadPoolExecutor(max_workers=4) as pool:
        for raw in pool.map(fetch_page, categories):
            if raw:
                pages.append(raw)
            else:
                failures += 1
    ids = list(dict.fromkeys(int(m) for raw in pages for m in re.findall(rb'/en/app/(\d{7,12})', raw)))[:240]
    def parse(appid):
        try:
            return parse_us_history(get(f'https://appstore-discounts.com/en/app/{appid}', attempts=1), appid, instant), False
        except Exception:
            return None, True
    result = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for item, error in pool.map(parse, ids):
            failures += int(error)
            if item:
                result.append(item)
    if ids and failures >= len(ids):
        raise RuntimeError('Price history pages unavailable')
    print(f'US history: {len(pages)} category pages, {len(ids)} detail pages, {len(result)} dated drops, {failures} unavailable', flush=True)
    return result

def gofans(instant):
    soup = BeautifulSoup(get('https://gofans.cn/'), 'html.parser')
    links = []
    for card in soup.select('.media'):
        current = card.select_one('.price-now')
        old = card.select_one('.price-original')
        link = card.select_one('a[href^="/app/"]')
        if current and old and link and current.get_text(strip=True).lower() == 'free':
            links.append(urljoin('https://gofans.cn', link['href']))
    def detail(url):
        try:
            raw = get(url, attempts=1)
            text = raw.decode('utf-8')
            appid = re.search(r'track_id:"(\d{7,12})"', text)
            plain = BeautifulSoup(raw, 'html.parser').get_text(' ', strip=True)
            # Explicit dated transition in the price history, not just a Free badge.
            history = plain.split('最低入手价浮动记录', 1)[-1]
            drop = re.match(r'\s*¥\s*(\d+(?:\.\d+)?)\s*->\s*¥0\.00\s+(\d{4}/\d{2}/\d{2})', history)
            if not appid or not drop or float(drop[1]) <= 0:
                return None
            when = datetime.strptime(drop[2], '%Y/%m/%d').replace(tzinfo=timezone(timedelta(hours=8)))
            if recent(when, instant):
                return candidate(appid[1], '¥' + drop[1], 'GoFans', url, when)
        except Exception as exc:
            print(f'GoFans detail skipped: {exc}', flush=True)
        return None
    with ThreadPoolExecutor(max_workers=4) as pool:
        return [item for item in pool.map(detail, list(dict.fromkeys(links))) if item]

def guofen(instant):
    base = 'https://www.guofenchaxun.com/xianmian?type=free'
    soup = BeautifulSoup(get(base), 'html.parser')
    cards = []
    for card in soup.select('a.gf-free-card[href]'):
        text = card.get_text(' ', strip=True)
        if '限免' in text and '免费' in text and 'iOS' in text and '内购限免' not in text:
            cards.append(card['href'])
    def detail(url):
        try:
            soup = BeautifulSoup(get(url, attempts=1), 'html.parser')
            app_link = soup.select_one('a[href*="apps.apple.com/cn/"]')
            text = soup.get_text(' ', strip=True)
            appid = APP_ID.search(app_link['href']) if app_link else None
            drop = re.search(r'限免日\s*(\d{4}-\d{2}-\d{2})', text)
            old = soup.select_one('s')
            if not appid or not drop or not old:
                return None
            when = date(drop[1] + 'T00:00:00+08:00')
            if recent(when, instant):
                return candidate(appid[1], old.get_text(strip=True), '果粉查询', url, when)
        except Exception as exc:
            print(f'Guofen detail skipped: {exc}', flush=True)
        return None
    with ThreadPoolExecutor(max_workers=4) as pool:
        return [item for item in pool.map(detail, cards[:60]) if item]

def lookup(ids, country):
    found, failures, checked = {}, 0, 0
    for offset in range(0, len(ids), 25):
        batch = ids[offset:offset + 25]
        url = 'https://itunes.apple.com/lookup?' + urlencode({'id': ','.join(map(str, batch)), 'country': country, 'entity': 'software'})
        try:
            data = json.loads(get(url))
            if not isinstance(data.get('results'), list):
                raise ValueError('Invalid Apple response')
            checked += len(batch)
            for app in data['results']:
                if app.get('trackId') in batch and app.get('kind') in ('software', 'mac-software') and app.get('price') == 0:
                    found[app['trackId']] = app
        except Exception as exc:
            failures += 1
            print(f'{country} Apple batch unavailable: {exc}', flush=True)
        # Keep below Apple's documented approximate rate limit.
        time.sleep(3.1)
    if ids and not checked:
        raise RuntimeError('All Apple price requests failed')
    return found, checked, failures

def cache_icon(app, country):
    appid = app['trackId']
    for existing in ICONS.glob(f'{country}-{appid}.*'):
        return './assets/daily-free/' + existing.name
    url = app.get('artworkUrl100', '')
    if not (url.startswith('https://') and (urlparse(url).hostname or '').endswith('.mzstatic.com')):
        return ''
    try:
        raw = get(url, limit=180_000, attempts=1)
        ext = '.jpg' if raw.startswith(b'\xff\xd8\xff') else '.png' if raw.startswith(b'\x89PNG') else '.webp' if raw[:4] == b'RIFF' and raw[8:12] == b'WEBP' else ''
        if ext:
            ICONS.mkdir(parents=True, exist_ok=True)
            path = ICONS / f'{country}-{appid}{ext}'
            path.write_bytes(raw)
            return './assets/daily-free/' + path.name
    except Exception:
        pass
    return ''

def main():
    instant = now()
    old = read_json(OUT)
    output = {'schema': 1, 'generated_at': iso(instant), 'interval_hours': 3, 'lookback_days': 30, 'regions': {}}
    successes = 0
    for country in ('cn', 'us'):
        candidates, health = {}, []
        sources = [('App Store Discounts RSS', FEED.format(country=country), lambda: parse_rss(get(FEED.format(country=country)), country, instant))]
        sources += [('GoFans', 'https://gofans.cn/', lambda: gofans(instant)), ('果粉查询', 'https://www.guofenchaxun.com/xianmian?type=free', lambda: guofen(instant))] if country == 'cn' else [('AppStore-Discounts', 'https://appstore-discounts.com/en/free', lambda: us_histories(instant))]
        for name, url, collect in sources:
            try:
                items = collect()
                health.append({'name': name, 'url': url, 'status': 'ok', 'candidates': len(items), 'checked_at': iso()})
                for item in items:
                    previous = candidates.get(item['id'])
                    if not previous or item['discovered_at'] > previous['discovered_at']:
                        candidates[item['id']] = item
                print(f'{country} {name}: {len(items)} candidates', flush=True)
            except Exception as exc:
                health.append({'name': name, 'url': url, 'status': 'unavailable', 'checked_at': iso()})
                print(f'{country} {name}: {exc}', flush=True)
        previous_region = old.get('regions', {}).get(country, {})
        # Keep established regional evidence when offers leave a feed's first page.
        # The date is never reset and the current price must be checked again.
        for item in previous_region.get('items', []):
            if item.get('country') == country and recent(date(item.get('discovered_at')), instant):
                candidates.setdefault(item['id'], {k: item[k] for k in ('id', 'original_price', 'source', 'source_url', 'discovered_at')})
        try:
            if not any(h['status'] == 'ok' for h in health):
                raise RuntimeError('All discovery sources failed')
            priced, checked, failures = lookup(list(candidates), country)
            verified_at = iso()
            def build(item):
                app = priced[item['id']]
                return {**item, 'name': str(app.get('trackName', ''))[:120], 'genre': str(app.get('primaryGenreName', 'App Store'))[:50],
                        'price': 0, 'currency': app.get('currency', 'CNY' if country == 'cn' else 'USD'), 'country': country,
                        'platform': 'macOS' if app.get('kind') == 'mac-software' else 'iOS', 'icon': cache_icon(app, country),
                        'url': f'https://apps.apple.com/{country}/app/id{item["id"]}', 'verified_at': verified_at,
                        'verification': 'current_apple_price_and_recent_dated_drop'}
            selected = sorted((c for c in candidates.values() if c['id'] in priced), key=lambda c: c['discovered_at'], reverse=True)
            with ThreadPoolExecutor(max_workers=4) as pool:
                items = list(pool.map(build, selected))
            output['regions'][country] = {'status': 'partial' if failures or any(h['status'] != 'ok' for h in health) else 'ok',
                'verified_at': verified_at, 'candidate_count': len(candidates), 'price_checked_count': checked, 'sources': health, 'items': items}
            successes += 1
        except Exception as exc:
            print(f'{country} refresh failed, keeping original verification timestamp: {exc}', flush=True)
            output['regions'][country] = {**previous_region, 'status': 'unavailable', 'last_attempt_at': iso(), 'sources': health}
    if not successes:
        raise SystemExit('No region successfully verified; previous snapshot preserved')
    write_json(OUT, output)
    print('Apple verified totals:', {k: len(v.get('items', [])) for k, v in output['regions'].items()}, flush=True)

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Official store giveaways only: no permanent F2P, trials, or key tasks."""
from __future__ import annotations
import io
import json
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse, urlencode
from bs4 import BeautifulSoup
from PIL import Image
from feed_common import ROOT, get, now, iso, date, read_json, write_json

OUTPUT = ROOT / 'data/game-free.json'
ICONS = ROOT / 'assets/game-free'
STEAM_SEARCH = 'https://store.steampowered.com/search/?maxprice=free&specials=1&cc=us&l=english'
EPIC_API = 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions'

def cache_image(url, key):
    path = ICONS / (key + '.webp')
    if path.exists():
        return './assets/game-free/' + path.name
    host = urlparse(url).hostname or ''
    if not url.startswith('https://') or not any(host == domain or host.endswith('.' + domain) for domain in ('epicgames.com', 'steamstatic.com', 'akamaihd.net')):
        return ''
    try:
        raw = get(url, limit=5_000_000, attempts=1)
        with Image.open(io.BytesIO(raw)) as image:
            image.thumbnail((640, 360))
            ICONS.mkdir(parents=True, exist_ok=True)
            image.convert('RGB').save(path, format='WEBP', quality=78)
        return './assets/game-free/' + path.name
    except Exception as exc:
        print(f'Game image unavailable: {key}: {exc}', flush=True)
        return ''

def parse_epic(data, country, instant):
    elements = data['data']['Catalog']['searchStore']['elements']
    result = []
    for app in elements:
        if app.get('offerType') not in ('BASE_GAME', 'BUNDLE', 'DLC', 'ADD_ON'):
            continue
        price = (app.get('price') or {}).get('totalPrice') or {}
        if price.get('discountPrice') != 0 or not isinstance(price.get('originalPrice'), (int, float)) or price['originalPrice'] <= 0:
            continue
        promos = (app.get('promotions') or {}).get('promotionalOffers', [])
        windows = [w for group in promos for w in group.get('promotionalOffers', [])
                   if w.get('discountSetting', {}).get('discountPercentage') == 0
                   and date(w.get('startDate')) and date(w.get('endDate'))
                   and date(w['startDate']) <= instant < date(w['endDate'])]
        if not windows:
            continue
        mapping = (app.get('catalogNs') or {}).get('mappings') or []
        slug = next((m.get('pageSlug') for m in mapping if m.get('pageType') == 'productHome'), None)
        if not slug:
            slug = app.get('productSlug') or app.get('urlSlug')
        if not isinstance(slug, str) or not re.fullmatch(r'[a-zA-Z0-9_-]+', slug):
            continue
        images = app.get('keyImages', [])
        image = next((i['url'] for kind in ('OfferImageWide', 'DieselStoreFrontWide', 'Thumbnail') for i in images if i.get('type') == kind), '')
        result.append({'id': str(app['id']), 'name': app['title'], 'platform': 'Epic', 'country': country,
            'kind': 'dlc' if app.get('offerType') in ('DLC', 'ADD_ON') else 'game',
            'price': 0, 'original_price': price.get('fmtPrice', {}).get('originalPrice', ''), 'currency': price.get('currencyCode'),
            'url': 'https://store.epicgames.com/' + ('zh-CN' if country == 'cn' else 'en-US') + '/p/' + slug,
            'source': 'Epic Games 官方', 'source_url': EPIC_API + '?' + urlencode({'locale': 'zh-CN', 'country': country.upper(), 'allowCountries': country.upper()}),
            'verification': 'official_active_free_to_keep', 'verified_at': iso(instant),
            'starts_at': windows[0]['startDate'], 'ends_at': windows[0]['endDate'], 'image_source': image})
    return result

def epic(instant):
    results, health = {}, []
    for country in ('cn', 'us'):
        url = EPIC_API + '?' + urlencode({'locale': 'zh-CN', 'country': country.upper(), 'allowCountries': country.upper()})
        try:
            for item in parse_epic(json.loads(get(url)), country, instant):
                key = item['id']
                if key in results:
                    results[key]['regions'].append(country)
                else:
                    results[key] = {**item, 'regions': [country]}
            health.append({'name': f'Epic {country.upper()}', 'url': url, 'status': 'ok'})
        except Exception as exc:
            health.append({'name': f'Epic {country.upper()}', 'url': url, 'status': 'unavailable'})
            print(f'Epic {country}: {exc}', flush=True)
    if not any(h['status'] == 'ok' for h in health):
        raise RuntimeError('Epic official endpoint unavailable')
    for item in results.values():
        item['icon'] = cache_image(item.pop('image_source'), 'epic-' + item['id'])
    return list(results.values()), health

def purchase_options(raw):
    soup = BeautifulSoup(raw, 'html.parser')
    options = []
    def walk(value):
        if isinstance(value, dict):
            if 'packageid' in value and 'is_free_to_keep' in value:
                options.append(value)
            for child in value.values():
                if isinstance(child, (dict, list)):
                    walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
    for node in soup.select('[data-props]'):
        try:
            value = json.loads(node['data-props'])
            walk(value)
        except (ValueError, TypeError):
            continue
    return options

def parse_steam(raw, app, instant):
    if app.get('type') not in ('game', 'dlc'):
        return None
    for option in purchase_options(raw):
        try:
            if option.get('is_free_to_keep') != 1 or int(option.get('discount_pct', -1)) != 100:
                continue
            if int(option.get('final_price_in_cents', -1)) != 0 or int(option.get('original_price_in_cents', 0)) <= 0:
                continue
            end = int(option.get('free_to_keep_ends') or 0)
            if end <= instant.timestamp():
                continue
            from datetime import datetime
            from feed_common import UTC
            appid = int(app['steam_appid'])
            return {'id': str(appid), 'name': app['name'].strip(), 'platform': 'Steam', 'country': 'us', 'regions': ['us'],
                'kind': app['type'], 'requires_base_game': (app.get('fullgame') or {}).get('name') if app['type'] == 'dlc' else None,
                'price': 0, 'original_price': option.get('formatted_original_price'), 'currency': 'USD',
                'url': f'https://store.steampowered.com/app/{appid}/?cc=us&l=schinese', 'source': 'Steam 官方商店',
                'source_url': f'https://store.steampowered.com/app/{appid}/?cc=us&l=english',
                'verification': 'official_active_free_to_keep', 'verified_at': iso(instant),
                'ends_at': iso(datetime.fromtimestamp(end, UTC)), 'package_id': option['packageid'], 'image_source': app.get('header_image', '')}
        except (TypeError, ValueError, KeyError):
            continue
    return None

def steam(instant):
    soup = BeautifulSoup(get(STEAM_SEARCH), 'html.parser')
    if not soup.select_one('#search_results'):
        raise ValueError('Steam search layout unavailable')
    ids = set()
    for row in soup.select('a.search_result_row[data-ds-appid]'):
        pct = row.select_one('.discount_pct')
        if pct and pct.get_text(strip=True) == '-100%' and re.fullmatch(r'\d+', row['data-ds-appid']):
            ids.add(int(row['data-ds-appid']))
    # Search is not a complete catalog: recheck previous promotions until expiry.
    for item in read_json(OUTPUT).get('platforms', {}).get('steam', {}).get('items', []):
        if str(item.get('id', '')).isdigit() and date(item.get('ends_at')) and date(item['ends_at']) > instant:
            ids.add(int(item['id']))
    errors = []
    def verify(appid):
        try:
            data = json.loads(get(f'https://store.steampowered.com/api/appdetails?appids={appid}&cc=us&l=english'))
            entry = data.get(str(appid), {})
            if not entry.get('success'):
                raise ValueError('Steam app metadata unavailable')
            raw = get(f'https://store.steampowered.com/app/{appid}/?cc=us&l=english')
            item = parse_steam(raw, entry['data'], instant)
            if item:
                item['icon'] = cache_image(item.pop('image_source'), 'steam-' + str(appid))
            return item
        except Exception as exc:
            errors.append(appid)
            print(f'Steam {appid}: {exc}', flush=True)
            return None
    with ThreadPoolExecutor(max_workers=3) as pool:
        items = [item for item in pool.map(verify, sorted(ids)) if item]
    if ids and len(errors) == len(ids):
        raise RuntimeError('All Steam store checks unavailable')
    return items, [{'name': 'Steam 官方商店', 'url': STEAM_SEARCH, 'status': 'partial' if errors else 'ok', 'candidates': len(ids), 'unavailable': len(errors)}]

def main():
    instant = now()
    previous = read_json(OUTPUT)
    result = {'schema': 1, 'generated_at': iso(instant), 'interval_hours': 3, 'platforms': {}}
    successes = 0
    for name, collect in [('steam', steam), ('epic', epic)]:
        try:
            items, sources = collect(instant)
            result['platforms'][name] = {'status': 'ok' if all(s['status'] == 'ok' for s in sources) else 'partial', 'checked_at': iso(), 'items': items, 'sources': sources}
            successes += 1
            print(f'{name}: {len(items)} official active giveaways', flush=True)
        except Exception as exc:
            result['platforms'][name] = {**previous.get('platforms', {}).get(name, {'items': []}), 'status': 'unavailable', 'last_attempt_at': iso()}
            print(f'{name}: {exc}', flush=True)
    if not successes:
        raise SystemExit('Both official game stores unavailable; previous snapshot preserved')
    write_json(OUTPUT, result)

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Read-only film intelligence snapshots. Secrets stay in Actions; no user OAuth data.
Per-source caches survive failures. Watchmode: <= 4 searches + 4 sources/day.
"""
from __future__ import annotations
import hashlib, html, io, json, os, re, sys
from concurrent.futures import ThreadPoolExecutor
from itertools import zip_longest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from zoneinfo import ZoneInfo
from feed_common import ROOT, now, iso, date, read_json, write_json
from media_catalog import build_catalog, normalized_ratings

UA = 'LiangYouResourceHub/1.0 (https://github.com/MaddestAlistar/LiangYou-ResourceHub)'
PATH = ROOT / 'data/media-intel.json'
STATE = ROOT / 'data/media-cache.json'
SOURCES = {
 'tmdb': ('TMDB','https://www.themoviedb.org',6),
 'tvmaze': ('TVmaze','https://www.tvmaze.com',6),
 'bangumi': ('Bangumi','https://bgm.tv',6),
 'anilist': ('AniList','https://anilist.co',6),
 'trakt': ('Trakt','https://trakt.tv',6),
 'simkl': ('Simkl','https://simkl.com',24),
 'omdb': ('OMDb','https://www.omdbapi.com',24),
 'watchmode': ('Watchmode','https://www.watchmode.com',24),
 'opensubtitles': ('OpenSubtitles','https://www.opensubtitles.com',24),
 'assrt': ('伪射手网','https://assrt.net',24),
 'mdblist': ('MDBList','https://mdblist.com',24),
}
KEY_NAMES = {
 'tmdb': ('TMDB_READ_ACCESS_TOKEN','TMDB_ACCESS_TOKEN','TMDB_API_TOKEN','TMDB_API_KEY','TMDB_TOKEN'),
 'bangumi': ('BANGUMI_ACCESS_TOKEN','BANGUMI_TOKEN','BGM_ACCESS_TOKEN','BANGUMI_API_KEY'),
 'trakt': ('TRAKT_CLIENT_ID','TRAKT_API_KEY'),
 'simkl': ('SIMKL_CLIENT_ID_V2','SIMKL_V2_CLIENT_ID','SIMKL_CLIENT_ID','SIMKL_CLIENT_KEY','SIMKL_API_KEY'),
 'omdb': ('OMDB_API_KEY',),
 'watchmode': ('WATCHMODE_API_KEY',),
 'opensubtitles': ('OPENSUBTITLES_API_KEY','OPEN_SUBTITLES_API_KEY'),
 'assrt': ('ASSRT_TOKEN','ASSRT_API_TOKEN','ASSRT_API_KEY','SHOOTER_API_KEY'),
 'mdblist': ('MDBLIST_API_KEY','MDB_LIST_API_KEY'),
}
SOURCE_REVISIONS = {"omdb": 2, "assrt": 2, "tmdb": 4, "tvmaze": 3, "anilist": 3, "trakt": 3, "simkl": 3, "mdblist": 2}
CACHE = {}
TMDB_MEM = {}

class FeedError(Exception): pass

class CollectedItems(list):
    failures=0

def key(source, required=True):
    value = next((os.environ[n].strip() for n in KEY_NAMES.get(source,()) if os.environ.get(n,'').strip()), '')
    if source == 'omdb':
        value = value.strip("\"'")
        if value.startswith(('https://','http://')) and urlparse(value).hostname in ('www.omdbapi.com','omdbapi.com'):
            value = parse_qs(urlparse(value).query).get('apikey',[''])[0]
        elif value.startswith('apikey='):
            value = parse_qs(value).get('apikey',[''])[0]
    if required and not value: raise FeedError('missing_key')
    return value

def get(url, params=None, headers=None, body=None):
    if params: url += ('&' if '?' in url else '?') + urlencode(params)
    h = {'User-Agent':UA,'Accept':'application/json',**(headers or {})}
    payload = None
    if body is not None:
        payload = json.dumps(body).encode(); h['Content-Type']='application/json'
    try:
        with urlopen(Request(url, data=payload, headers=h),timeout=22) as r:
            raw = r.read(8_000_001)
        if len(raw)>8_000_000: raise FeedError('response_too_large')
        data = json.loads(raw)
        if isinstance(data,dict) and (data.get('errors') or data.get('success') is False): raise FeedError('api_error')
        return data
    except HTTPError as e:
        if urlparse(url).hostname == 'www.omdbapi.com':
            # Classify a bounded error body; never print or persist it.
            try:
                message = str(json.loads(e.read(8192)).get('Error','')).lower()
                for needle,code in [('invalid api key','invalid_api_key'),('activate','inactive_api_key'),('limit','quota_exceeded')]:
                    if needle in message: raise FeedError(code) from None
            except FeedError: raise
            except Exception: pass
        raise FeedError('http_'+str(e.code)) from None
    except FeedError: raise
    except Exception as exc: raise FeedError('network_or_response_error_'+type(exc).__name__) from None

def clean(v): return html.unescape(re.sub(r'<[^>]*>', '',str(v or ''))).strip()
def num(v):
    try: return float(v) if v is not None else None
    except (ValueError,TypeError): return None

def safe_url(v):
    try: return v if urlparse(v).scheme in ('https','http') and not urlparse(v).username else ''
    except (ValueError,TypeError): return ''

def rating(source, value, scale=10):
    n = num(value)
    return [{'source':source,'value':n,'scale':scale}] if n is not None and n>0 else []

def cached(namespace, ident, hours, loader):
    cachekey = namespace+':'+str(ident)
    previous = CACHE.get(cachekey,{})
    stamp = date(previous.get('checked_at'))
    if stamp and now()-stamp<timedelta(hours=hours): return previous['data']
    data = loader()
    CACHE[cachekey]={'checked_at':iso(),'data':data}
    return data

def tmdb(path, **params):
    token = key('tmdb'); headers={}
    if len(token)>50: headers['Authorization']='Bearer '+token
    else: params['api_key']=token
    return get('https://api.themoviedb.org/3/'+path, {'language':'zh-CN',**params},headers)

def tmdb_item(x, kind):
    return {'id':f'tmdb-{kind}-{x["id"]}','kind':kind,'title':x.get('title') or x.get('name') or '',
      'original_title':x.get('original_title') or x.get('original_name') or '',
      'date':x.get('release_date') or x.get('first_air_date') or '',
      'overview':clean(x.get('overview')),'poster':'https://image.tmdb.org/t/p/w342'+x['poster_path'] if x.get('poster_path') else '',
      'ratings':rating('TMDB',x.get('vote_average')),'votes':x.get('vote_count',0),
      'tmdb_id':x['id'],'imdb_id':x.get('imdb_id') or x.get('external_ids',{}).get('imdb_id') or '',
      'url':f'https://www.themoviedb.org/{kind}/{x["id"]}','source':'TMDB'}

def detail(tid,kind):
    ident=f'{kind}-{tid}'
    if ident not in TMDB_MEM:
        TMDB_MEM[ident]=cached('tmdb-profile-v3',ident,72,lambda:tmdb_profile(tmdb(f'{kind}/{tid}',append_to_response='external_ids,credits,videos,recommendations,keywords,'+('release_dates' if kind=='movie' else 'content_ratings')),kind))
    return dict(TMDB_MEM[ident])

def tmdb_subject_tags(x):
    """Use only TMDB-provided keywords (no inferred themes or generated labels)."""
    payload=x.get('keywords') or {}
    candidates=payload.get('keywords') or payload.get('results') or []
    result=[];seen=set()
    for entry in candidates:
        word=clean(entry.get('name')) if isinstance(entry,dict) else ''
        if not isinstance(word,str):continue
        word=word.strip()
        if not 2<=len(word)<=28 or any(c in word for c in '<>{}\\n\\r'):continue
        key=word.casefold()
        if key in seen:continue
        seen.add(key);result.append(word)
        if len(result)>=6:break
    return result


def tmdb_parental_rating(x,kind):
    """Return a country-specific rating only when TMDB supplied an unambiguous one.

    This is a classification, *not* an invented age recommendation or a list
    of content warnings. Countries have different classification systems.
    """
    countries=['CN','HK','TW','US','GB','AU','SG','JP','KR']
    invalid={'','NR','N/R','N/A','NA','NOT RATED','UNRATED','NONE','TBC','TBD','0'}
    def valid(value):
        v=str(value or '').strip().upper()
        return v if v not in invalid and re.fullmatch(r'[A-Z0-9+\\-/ ]{1,14}',v) else ''
    if kind=='movie':
        rows=(x.get('release_dates') or {}).get('results') or []
        for country in countries:
            group=next((a.get('release_dates') or [] for a in rows if a.get('iso_3166_1')==country),[])
            theatrical={valid(a.get('certification')) for a in group if isinstance(a,dict) and a.get('type') in (2,3)}
            theatrical.discard('')
            alternatives={valid(a.get('certification')) for a in group if isinstance(a,dict)}
            alternatives.discard('')
            values=theatrical or alternatives
            if len(values)==1:return {'country':country,'rating':next(iter(values)),'source':'TMDB'}
        return None
    rows=(x.get('content_ratings') or {}).get('results') or []
    for country in countries:
        options={valid(row.get('rating')) for row in rows if isinstance(row,dict) and row.get('iso_3166_1')==country}
        options.discard('')
        if len(options)==1:return {'country':country,'rating':next(iter(options)),'source':'TMDB'}
    return None


def tmdb_profile(x,kind):
    item=tmdb_item(x,kind);credits=x.get('credits') or {}
    creators=[{'name':p.get('name',''),'role':'Director','url':f'https://www.themoviedb.org/person/{p["id"]}'} for p in credits.get('crew',[]) if p.get('job')=='Director']
    creators += [{'name':p.get('name',''),'role':'Creator','url':f'https://www.themoviedb.org/person/{p["id"]}'} for p in x.get('created_by',[])]
    item['profile']={
      'checked_at':iso(),'via':'TMDB','tagline':clean(x.get('tagline')),
      'genres':[g['name'] for g in x.get('genres',[]) if isinstance(g,dict) and isinstance(g.get('name'),str) and g['name'].strip()][:8],
      'keywords':tmdb_subject_tags(x),'parental_rating':tmdb_parental_rating(x,kind),
      'runtime':x.get('runtime') or next(iter(x.get('episode_run_time') or []),None),
      'status':x.get('status',''),'languages':[v.get('name') or v.get('english_name') for v in x.get('spoken_languages',[])],
      'countries':[v.get('name') for v in x.get('production_countries',[])],
      'creators':creators[:6],
      'cast':[{'name':p.get('name',''),'character':p.get('character',''),'url':f'https://www.themoviedb.org/person/{p["id"]}'} for p in credits.get('cast',[])[:10]],
      'seasons':[{'number':s['season_number'],'name':s.get('name',''),'episodes':s.get('episode_count'),'date':s.get('air_date',''),'url':f'https://www.themoviedb.org/tv/{x["id"]}/season/{s["season_number"]}'} for s in x.get('seasons',[]) if s.get('season_number',0)>0],
      'videos':[{'name':v.get('name',''),'url':'https://www.youtube.com/watch?v='+v['key']} for v in (x.get('videos') or {}).get('results',[]) if v.get('site')=='YouTube' and v.get('official') and v.get('type') in ('Trailer','Teaser') and re.fullmatch(r'[A-Za-z0-9_-]{11}',v.get('key',''))][:3],
      'related':[{'id':f'tmdb-{kind}-{r["id"]}','title':r.get('title') or r.get('name',''),'url':f'https://www.themoviedb.org/{kind}/{r["id"]}'} for r in (x.get('recommendations') or {}).get('results',[])[:6]],
      'episodes':x.get('number_of_episodes'),'season_count':x.get('number_of_seasons'),
    }
    return item

def collect_tmdb():
    items=[]
    for kind,category in [('movie','movies'),('tv','series')]:
        for x in tmdb(f'trending/{kind}/week')['results'][:20]:
            if x.get('adult'): continue
            item=tmdb_item(x,kind);item['category']=category
            try: item.update(detail(x['id'],kind))
            except FeedError: pass
            items.append(item)
    for x in tmdb('movie/upcoming',region='CN')['results'][:16]:
        if not x.get('adult') and x.get('release_date','') >= now().astimezone(ZoneInfo('Asia/Shanghai')).date().isoformat():
            item=tmdb_item(x,'movie')
            try: item.update(detail(x['id'],'movie'))
            except FeedError: pass
            item['date']=x.get('release_date','')
            item['category']='upcoming';items.append(item)
    if not items: raise FeedError('empty_response')
    return items

def localized_show(show):
    imdb=(show.get('externals') or {}).get('imdb')
    if not imdb or not key('tmdb',False): return None
    def load():
        matches=tmdb('find/'+imdb,external_source='imdb_id').get('tv_results',[])
        return tmdb_item(matches[0],'tv') if matches else None
    try: return cached('tv-title',imdb,720,load)
    except FeedError: return None

def collect_tvmaze():
    today=now().astimezone(ZoneInfo('Asia/Shanghai')).date(); episodes={}; successes=0
    # Include yesterday's US broadcast date for episodes that air today in China.
    for offset in range(-1,7):
        day=(today+timedelta(days=offset)).isoformat()
        for endpoint,params in [('schedule',{'country':'US','date':day}),('schedule/web',{'date':day})]:
            try: rows=get('https://api.tvmaze.com/'+endpoint,params);successes+=1
            except FeedError: continue
            for e in rows:
                show=e.get('show') or e.get('_embedded',{}).get('show') or {}
                if show.get('type') not in ('Scripted','Animation'): continue
                stamp=date(e.get('airstamp'))
                if not stamp or not(today <= stamp.astimezone(ZoneInfo('Asia/Shanghai')).date() < today+timedelta(days=7)): continue
                episodes[e['id']]=(e,show,stamp)
    if not successes: raise FeedError('network_or_response_error')
    if successes<16: raise FeedError('partial_schedule')
    chosen=[]
    for offset in range(7):
        day=today+timedelta(days=offset)
        group=[x for x in episodes.values() if x[2].astimezone(ZoneInfo('Asia/Shanghai')).date()==day]
        group.sort(key=lambda x: (x[1].get('weight') or 0),reverse=True)
        chosen.extend(group[:16])
    items=[]; translations={}
    for e,s,stamp in chosen:
        if s['id'] not in translations and len(translations)<40: translations[s['id']]=localized_show(s)
        loc=translations.get(s['id']) or {}
        channel=s.get('webChannel') or s.get('network') or {}
        items.append({'id':'tvmaze-episode-'+str(e['id']),'kind':'tv','category':'calendar',
          'title':loc.get('title') or s.get('name',''),'original_title':s.get('name',''),
          'overview':loc.get('overview') or clean(s.get('summary')), 'overview_language':'zh' if loc.get('overview') else 'en',
          'poster':loc.get('poster') or (s.get('image') or {}).get('medium',''),
          'ratings':rating('TVmaze',(s.get('rating') or {}).get('average')),
          'imdb_id':(s.get('externals') or {}).get('imdb',''),'url':safe_url(e.get('url')),
          'tmdb_id':loc.get('tmdb_id'),'tvmaze_id':s['id'],'tvdb_id':(s.get('externals') or {}).get('thetvdb'),
          'air_at':iso(stamp),'season':e.get('season'),'episode':e.get('number'),
          'episode_title':e.get('name',''),'channel':channel.get('name',''),'source':'TVmaze'})
    return items

def collect_bangumi():
    token=key('bangumi',False)
    rows=get('https://api.bgm.tv/calendar',headers={'Authorization':'Bearer '+token} if token else {})
    items=[]
    for day in rows:
        for x in day.get('items',[]):
            if x.get('nsfw'): continue
            items.append({'id':'bangumi-'+str(x['id']),'kind':'anime','category':'anime','title':x.get('name_cn') or x.get('name',''),
              'original_title':x.get('name',''),'date':x.get('air_date',''),'weekday':day['weekday']['id'],
              'overview':clean(x.get('summary')),'poster':(x.get('images') or {}).get('common',''),
              'ratings':rating('Bangumi',(x.get('rating') or {}).get('score')),'votes':(x.get('rating') or {}).get('total',0),
              'url':'https://bgm.tv/subject/'+str(x['id']),'source':'Bangumi'})
    if not items: raise FeedError('empty_response')
    return sorted(items,key=lambda x:x.get('votes',0),reverse=True)[:80]

def collect_anilist():
    d=now().astimezone(ZoneInfo('Asia/Shanghai'))
    query='''query($year:Int,$season:MediaSeason){Page(page:1,perPage:30){media(type:ANIME,seasonYear:$year,season:$season,sort:TRENDING_DESC,isAdult:false){id idMal title{native romaji english} description coverImage{large} averageScore episodes siteUrl startDate{year month day} nextAiringEpisode{episode airingAt}}}}'''
    data=get('https://graphql.anilist.co',body={'query':query,'variables':{'year':d.year,'season':['WINTER','SPRING','SUMMER','FALL'][(d.month-1)//3]}})
    items=[]
    for x in data['data']['Page']['media']:
        a=x.get('nextAiringEpisode') or {}; start=x.get('startDate') or {}
        items.append({'id':'anilist-'+str(x['id']),'kind':'anime','category':'anime','title':x['title'].get('native') or x['title'].get('romaji'),
          'original_title':x['title'].get('romaji',''),'english_title':x['title'].get('english',''),
          'overview':clean(x.get('description')),'overview_language':'en','poster':x['coverImage'].get('large',''),
          'date':'-'.join(str(start[k]).zfill(2) for k in ('year','month','day')) if all(start.get(k) for k in ('year','month','day')) else '',
          'ratings':rating('AniList',x.get('averageScore'),100),'episodes':x.get('episodes'),'episode':a.get('episode'),
          'mal_id':x.get('idMal'),
          'air_at':iso(datetime.fromtimestamp(a['airingAt'],timezone.utc)) if a.get('airingAt') else '',
          'url':safe_url(x.get('siteUrl')),'source':'AniList'})
    if not items: raise FeedError('empty_response')
    return items

def collect_trakt():
    headers={'trakt-api-version':'2','trakt-api-key':key('trakt')}; items=[]
    for endpoint,kind,wrapper in [('movies','movie','movie'),('shows','tv','show')]:
        rows=get('https://api.trakt.tv/'+endpoint+'/trending',{'limit':16,'extended':'full'},headers)
        for row in rows:
            x=row[wrapper]; ids=x.get('ids',{}); item={}
            if x.get('certification') in ('NC-17','TV-MA') and x.get('genres')==['adult']: continue
            if ids.get('tmdb') and key('tmdb',False):
                try: item=detail(ids['tmdb'],kind)
                except FeedError: pass
            if not item: item={'id':f'trakt-{kind}-{ids["trakt"]}','title':x['title'],'original_title':x['title'],'kind':kind,'date':str(x.get('year') or ''),'overview':clean(x.get('overview')),'overview_language':'en','poster':'','ratings':[]}
            item={**item,'id':f'trakt-{kind}-{ids["trakt"]}','source':'Trakt','category':'movies' if kind=='movie' else 'series',
              'imdb_id':ids.get('imdb',''),'url':f'https://trakt.tv/{endpoint}/{ids.get("slug") or ids["trakt"]}',
              'ratings':item.get('ratings',[])+[{**r,'votes':x.get('votes')} for r in rating('Trakt',x.get('rating'))],'watchers':row.get('watchers')}
            items.append(item)
    if not items: raise FeedError('empty_response')
    return items

def collect_simkl():
    rows=get('https://data.simkl.in/discover/trending/week_100.json',{'client_id':key('simkl'),'app-name':'LiangYouResourceHub','app-version':'1.0'})
    items=[]
    for category,kind in [('movies','movie'),('tv','tv'),('anime','anime')]:
        for x in rows.get(category,[])[:12]:
            ids=x.get('ids',{}); sid=ids.get('simkl_id') or ids.get('simkl') or x.get('id'); item={}
            if not sid: continue
            if ids.get('tmdb') and kind!='anime' and key('tmdb',False):
                try: item=detail(ids['tmdb'],kind)
                except FeedError: pass
            if not item: item={'title':x.get('title',''),'original_title':x.get('title',''),'kind':kind,'date':str(x.get('year') or ''),'overview':'','poster':'https://simkl.in/posters/'+x['poster']+'_m.webp' if x.get('poster') else '', 'ratings':[]}
            items.append({**item,'id':f'simkl-{kind}-{sid}','category':{'movie':'movies','tv':'series','anime':'anime'}[kind],
              'source':'Simkl','imdb_id':ids.get('imdb',''),'url':('https://simkl.com'+x['url']) if str(x.get('url','')).startswith('/') else f'https://simkl.com/{category}/{sid}/'+str(ids.get('slug') or '')})
    if not items: raise FeedError('empty_response')
    return items

def enrich(source,candidates):
    token=key(source); out=CollectedItems();consecutive=0;last_error='no_matching_titles'
    limit={'omdb':12,'mdblist':32,'watchmode':4,'opensubtitles':6,'assrt':6}[source]
    for item in candidates[:limit]:
        imdb=item.get('imdb_id',''); ident=item['id']
        if not imdb and source not in ('assrt','mdblist'): continue
        entry={'target_id':ident,'imdb_id':imdb,'checked_at':iso()}
        if source=='omdb':
            x=get('https://www.omdbapi.com/',{'apikey':token,'i':imdb,'plot':'short'})
            if x.get('Response')=='False':
                if 'limit' in x.get('Error','').lower() or 'key' in x.get('Error','').lower(): raise FeedError('api_error')
                continue
            entry['ratings']=omdb_ratings(x)
        elif source=='mdblist':
            if not item.get('tmdb_id') or item.get('kind') not in ('movie','tv'): continue
            kind='movie' if item['kind']=='movie' else 'show'
            try: x=get(f'https://api.mdblist.com/tmdb/{kind}/{item["tmdb_id"]}',{'apikey':token})
            except FeedError as exc:
                if str(exc)=='http_404': continue
                out.failures+=1;consecutive+=1;last_error=str(exc)
                print(f'mdblist: tmdb-{kind}-{item["tmdb_id"]}: {last_error}',flush=True)
                if consecutive>=3 or last_error in ('http_401','http_403','http_429'): break
                continue
            consecutive=0
            if x.get('error'): raise FeedError('api_error')
            if imdb and x.get('imdb_id') and x['imdb_id']!=imdb: continue
            entry['ratings']=normalized_ratings(x.get('ratings',[]),'MDBList',entry['checked_at'])
        elif source=='watchmode':
            # Exact external ID lookup. No fuzzy title matching, US availability only.
            x=get('https://api.watchmode.com/v1/search/',{'apiKey':token,'search_field':'imdb_id','search_value':imdb})
            matches=x.get('title_results',[])
            if not matches: entry['providers']=[]
            else:
                rows=get(f'https://api.watchmode.com/v1/title/{matches[0]["id"]}/sources/',{'apiKey':token,'regions':'US'})
                seen=set(); providers=[]
                for r in rows:
                    url=safe_url(r.get('web_url')); k=(r.get('name'),r.get('type'))
                    if url and r.get('region')=='US' and k not in seen:
                        seen.add(k);providers.append({'name':r['name'],'type':r.get('type',''),'region':'US','url':url})
                entry['providers']=providers[:12]
        elif source=='opensubtitles':
            x=get('https://api.opensubtitles.com/api/v1/subtitles',{'imdb_id':imdb.removeprefix('tt'),'languages':'zh-cn,zh-tw,en'}, {'Api-Key':token,'User-Agent':'LiangYouResourceHub v1.0'})
            entry['results']=[{'title':clean(r.get('attributes',{}).get('release')),'language':r.get('attributes',{}).get('language',''),'url':safe_url(r.get('attributes',{}).get('url'))} for r in x.get('data',[])[:5]]
        else:
            q=item.get('original_title') or item['title']
            if len(q)<3: continue
            x=get('https://api.assrt.net/v1/sub/search',{'q':q,'cnt':5},{'Authorization':'Bearer '+token})
            if x.get('status')!=0: raise FeedError('api_error')
            entry['results']=assrt_results(x,item)
        out.append(entry)
    if not out: raise FeedError(last_error)
    return out

def omdb_ratings(data):
    result=[]; seen=set()
    for r in data.get('Ratings') or []:
        if not isinstance(r,dict): continue
        if r.get('Source') and r.get('Value') not in (None,'','N/A') and r['Source'] not in seen:
            seen.add(r['Source']); result.append({'source':r['Source'],'display':r['Value']})
    for name,field,scale in [('Internet Movie Database','imdbRating','10'),('Metacritic','Metascore','100')]:
        if name not in seen and data.get(field) not in (None,'','N/A'):
            result.append({'source':name,'display':str(data[field])+'/'+scale})
    return result

def subtitle_title_matches(title,item):
    """Search results are candidates, not verified work identities."""
    normalized=lambda value: re.sub(r'[\W_]+',' ',str(value).casefold()).strip()
    haystack=normalized(title)
    year=str(item.get('date',''))[:4]
    years=set(re.findall(r'\b(?:19|20)\d{2}\b',str(title)))
    if year.isdigit() and years and year not in years: return False
    for field in ('title','original_title','english_title'):
        name=normalized(item.get(field,''))
        if len(name)<3: continue
        if name.startswith('the ') and len(name.split())>2: name=name[4:]
        if re.search(r'[\u3400-\u9fff]',name):
            if name in haystack: return True
        elif ' '+name+' ' in ' '+haystack+' ':
            # A single common word alone (e.g. Hope) is not enough evidence.
            if len(name.split())>1 or (year.isdigit() and year in years): return True
    return False

def assrt_results(data,item=None):
    payload=data.get('sub') or {}
    if not isinstance(payload,dict): raise FeedError('invalid_subtitle_schema')
    rows=payload.get('subs') or []
    if not isinstance(rows,list): raise FeedError('invalid_subtitle_schema')
    result=[]
    for row in rows[:5]:
        if not isinstance(row,dict) or not str(row.get('id','')).isdigit(): continue
        lang=row.get('lang') or {}
        language=lang.get('desc','') if isinstance(lang,dict) else str(lang)
        title=clean(row.get('native_name') or row.get('videoname'))
        if item is not None and not subtitle_title_matches(title,item): continue
        result.append({'title':title,'language':language,
                       'url':'https://assrt.net/xml/sub/'+str(row['id'])+'.xml'})
    return result

def refresh_source(source,previous,loader):
    result=dict(previous or {}); stamp=date(result.get('checked_at'))
    # Failed sources retry after 6h; quota endpoints never retry faster than 24h.
    hours=SOURCES[source][2]
    revision=SOURCE_REVISIONS.get(source,1)
    if result.get('collector_revision',1)==revision and stamp and now()-stamp<timedelta(hours=hours): return result
    result.update(name=SOURCES[source][0],url=SOURCES[source][1],checked_at=iso(),interval_hours=hours,collector_revision=revision)
    try:
        items=loader()
        if not isinstance(items,list): raise FeedError('invalid_schema')
        result.update(status='ok',items=items,updated_at=iso(),error=None)
        if getattr(items,'failures',0):
            ids={i.get('target_id') for i in items}
            result['items']=list(items)+[i for i in (previous or {}).get('items',[]) if i.get('target_id') not in ids]
            result.update(status='partial',error='partial_response',failed_lookups=items.failures)
    except FeedError as e:
        result.update(status='stale' if result.get('items') else 'unavailable',error=str(e))
        result.setdefault('items',[])
    except Exception as exc:
        result.update(status='stale' if result.get('items') else 'unavailable',error='invalid_response_'+type(exc).__name__)
        result.setdefault('items',[])
    print(f'{source}: {result["status"]}, {len(result["items"])} records; {result.get("error") or "verified"}',flush=True)
    return result

def localize_images(sources):
    folder=ROOT/'assets/media-posters';folder.mkdir(parents=True,exist_ok=True)
    allowed=('image.tmdb.org','static.tvmaze.com','lain.bgm.tv','s4.anilist.co','simkl.in')
    def localize(item):
        url=item.get('poster','')
        if not url or url.startswith('./assets/'): return
        if urlparse(url).hostname not in allowed: item['poster']='';return
        target=folder/(hashlib.sha256(url.encode()).hexdigest()[:20]+'.webp')
        try:
            if not target.exists():
                from PIL import Image
                with urlopen(Request(url,headers={'User-Agent':UA}),timeout=12) as r: raw=r.read(3_000_001)
                if len(raw)>3_000_000: return
                im=Image.open(io.BytesIO(raw));im.thumbnail((342,513));im.convert('RGB').save(target,'WEBP',quality=78)
            item['poster']='./assets/media-posters/'+target.name
        except Exception: pass
    items=[i for s in sources.values() for i in s.get('items',[]) if i.get('poster')]
    with ThreadPoolExecutor(max_workers=6) as pool: list(pool.map(localize,items))
    # Retain only posters referenced by the current snapshot (including stale sources).
    used={Path(i['poster']).name for i in items if i.get('poster','').startswith('./assets/')}
    for p in folder.glob('*.webp'):
        if p.name not in used: p.unlink()

def main():
    global CACHE
    old=read_json(PATH);CACHE=read_json(STATE)
    sources=dict(old.get('sources',{}))
    for name,fn in [('tmdb',collect_tmdb),('tvmaze',collect_tvmaze),('bangumi',collect_bangumi),('anilist',collect_anilist),('trakt',collect_trakt),('simkl',collect_simkl)]:
        sources[name]=refresh_source(name,sources.get(name),fn)
    # Localize AniList only on an exact native-name match; never merge approximate titles.
    names={clean(i.get('original_title')).casefold():i['title'] for i in sources['bangumi'].get('items',[])}
    for i in sources['anilist'].get('items',[]):
        if clean(i.get('title')).casefold() in names: i['title']=names[clean(i['title']).casefold()]
    candidates=[];seen=set()
    for i in sources['tmdb'].get('items',[]):
        imdb=i.get('imdb_id')
        if i.get('category') in ('movies','series') and imdb and imdb not in seen:
            seen.add(imdb);candidates.append(i)
    for name in ('omdb','watchmode','opensubtitles','assrt'):
        sources[name]=refresh_source(name,sources.get(name),lambda n=name:enrich(n,candidates))
    # Alternate movies and shows so a daily rating budget covers both equally.
    tmdb_items=sources['tmdb'].get('items',[])
    movies=[i for i in tmdb_items if i.get('category')=='movies']
    shows=[i for i in tmdb_items if i.get('category')=='series']
    rating_candidates=[i for pair in zip_longest(movies,shows) for i in pair if i]
    sources['mdblist']=refresh_source('mdblist',sources.get('mdblist'),lambda:enrich('mdblist',rating_candidates))
    localize_images(sources)
    works,aliases=build_catalog(sources)
    output={'schema':1,'media_source_version':5,'checked_at':iso(),'timezone':'Asia/Shanghai','sources':sources,'works':works,'aliases':aliases}
    # Cache is public metadata only; credentials/URLs with credential query strings never saved.
    CACHE={k:v for k,v in CACHE.items() if date(v.get('checked_at')) and now()-date(v['checked_at'])<timedelta(days=30)}
    serialized=json.dumps([output,CACHE],ensure_ascii=False)
    for names in KEY_NAMES.values():
        for name in names:
            secret=os.environ.get(name,'').strip()
            if len(secret)>=8 and secret in serialized: raise RuntimeError('Credential detected in output; refusing write')
    write_json(PATH,output);write_json(STATE,CACHE)
    return 0 if any(s.get('items') for s in sources.values()) else 1

if __name__=='__main__': sys.exit(main())

"""Canonical public work records. Identity comes only from provider IDs."""
import math
import re

RATING_SOURCES = {
    'imdb': ('IMDb', 10), 'internet movie database': ('IMDb', 10),
    'tmdb': ('TMDB', 10), 'trakt': ('Trakt', 10), 'tvmaze': ('TVmaze', 10),
    'tomatoes': ('Rotten Tomatoes', 100), 'rotten tomatoes': ('Rotten Tomatoes', 100),
    'popcorn': ('RT Audience', 100), 'tomatoesaudience': ('RT Audience', 100),
    'rt audience': ('RT Audience', 100),
    'metacritic': ('Metacritic', 100), 'metacriticuser': ('Metacritic User', 10),
    'metacritic user': ('Metacritic User', 10),
    'letterboxd': ('Letterboxd', 5), 'myanimelist': ('MyAnimeList', 10),
    'rogerebert': ('Roger Ebert', 4), 'bangumi': ('Bangumi', 10), 'anilist': ('AniList', 100),
    'roger ebert': ('Roger Ebert', 4),
}

def normalized_ratings(rows, publisher, checked_at):
    result=[]
    for row in rows or []:
        definition=RATING_SOURCES.get(str(row.get('source','')).lower())
        if not definition: continue
        name,scale=definition
        value=row.get('value')
        if value is None and row.get('display'):
            value=str(row['display']).split('/')[0].rstrip('%')
        try: value=float(value)
        except (ValueError,TypeError): continue
        if not math.isfinite(value) or not 0<=value<=scale: continue
        votes=row.get('votes')
        result.append({'source':name,'value':value,'scale':scale,
                       'display':f'{value:g}'+('%' if name in ('Rotten Tomatoes','RT Audience') else f'/{scale}'),
                       'votes':votes if isinstance(votes,int) and votes>=0 else None,
                       'via':publisher,'checked_at':checked_at})
    return result

def identity_tokens(item):
    result=[]
    kind=item.get('kind')
    if kind in ('movie','tv') and str(item.get('tmdb_id','')).isdigit():
        result.append(f'tmdb-{kind}-{item["tmdb_id"]}')
    imdb=item.get('imdb_id','')
    if re.fullmatch(r'tt\d{5,12}',str(imdb)): result.append('imdb-'+imdb)
    for field,prefix in [('mal_id','mal'),('tvmaze_id','tvmaze-show'),('tvdb_id','tvdb-show')]:
        if str(item.get(field,'')).isdigit(): result.append(prefix+'-'+str(item[field]))
    ident=str(item.get('id',''))
    if re.fullmatch(r'[a-z]+(?:-[a-z]+)*-\d+',ident): result.append(ident)
    return list(dict.fromkeys(result))

def build_catalog(sources):
    records=[];parent={}
    def find(x):
        parent.setdefault(x,x)
        if parent[x]!=x: parent[x]=find(parent[x])
        return parent[x]
    for provider,snapshot in sources.items():
        for item in snapshot.get('items',[]):
            if not item.get('id'): continue
            tokens=identity_tokens(item)
            if not tokens: continue
            for token in tokens[1:]: parent[find(token)]=find(tokens[0])
            records.append((provider,snapshot,item,tokens))
    groups={}
    for row in records: groups.setdefault(find(row[3][0]),[]).append(row)
    works={};aliases={}
    for group in groups.values():
        tokens=sorted({t for row in group for t in row[3]})
        rank=lambda t:(0 if t.startswith('tmdb-') else 1 if t.startswith('imdb-') else 2 if t.startswith('mal-') else 3,t)
        wid=min(tokens,key=rank)
        work={'id':wid,'aliases':tokens,'ratings':[],'links':[],'profile':{},'categories':[]}
        # Provider order is intentional: TMDB supplies the preferred Chinese metadata.
        for provider,snapshot,item,_ in group:
            for field in ('title','original_title','english_title','kind','date','overview','poster','imdb_id','tmdb_id','mal_id','tvmaze_id','tvdb_id','episodes','weekday'):
                if not work.get(field) and item.get(field): work[field]=item[field]
            if item.get('category')=='anime' and item.get('air_at'):
                work['air_at']=item['air_at'];work['episode']=item.get('episode')
            for field,value in item.get('profile',{}).items():
                if not work['profile'].get(field) and value: work['profile'][field]=value
            category=item.get('category')
            if category and category not in work['categories']: work['categories'].append(category)
            if item.get('url') and not any(l['url']==item['url'] for l in work['links']):
                # An episode URL is useful but is not a new series identity.
                work['links'].append({'name':item.get('source',provider),'url':item['url']})
            ratings=[dict(r) for r in item.get('ratings',[])]
            for r in ratings:
                if provider in ('tmdb','bangumi') and r.get('source')==item.get('source') and item.get('votes') is not None:r.setdefault('votes',item['votes'])
            work['ratings']+=normalized_ratings(ratings,item.get('source',provider),snapshot.get('updated_at'))
            item['work_id']=wid
        for token in tokens: aliases[token]=wid
        works[wid]=work
    for provider in ('omdb','mdblist'):
        snapshot=sources.get(provider,{})
        for entry in snapshot.get('items',[]):
            wid=aliases.get(entry.get('target_id')) or aliases.get('imdb-'+str(entry.get('imdb_id','')))
            if not wid: continue
            work=works[wid]
            work['ratings']+=normalized_ratings(entry.get('ratings'),snapshot.get('name',provider),entry.get('checked_at'))
            for field,value in entry.get('profile',{}).items():
                if not work['profile'].get(field) and value: work['profile'][field]=value
    for work in works.values():
        scores={}
        def priority(r): return 3 if r['via']==r['source'] else 2 if r['via']=='OMDb' else 1
        for score in work['ratings']:
            previous=scores.get(score['source'])
            if not previous or (priority(score),score.get('checked_at') or '')>(priority(previous),previous.get('checked_at') or ''):
                scores[score['source']]=score
        work['ratings']=list(scores.values())
    return works,aliases

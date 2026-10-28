/* Pure identity and browser-local watchlist rules; also exercised by Node tests. */
(() => {
  'use strict';
  const KEY='liangyou.media.watchlist.v1', LIMIT=1000;
  const statuses=['want','watching','watched'];
  const validId=id=>typeof id==='string' && /^(?:[a-z]+-){1,3}(?:tt)?\d{1,12}$/.test(id);
  const str=(v,n=300)=>typeof v==='string'?v.slice(0,n):'';
  function safeURL(v) {
    if(typeof v!=='string')return '';
    if(/^\.\/assets\/media-posters\/[a-f0-9]{20}\.webp$/.test(v))return v;
    try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}
  }
  function snapshot(w) {
    if(!w||!validId(w.id)||!str(w.title))throw Error('invalid_work');
    return {id:w.id,aliases:[...new Set([w.id,...(Array.isArray(w.aliases)?w.aliases:[])].filter(validId))].slice(0,50),
      title:str(w.title),original_title:str(w.original_title),english_title:str(w.english_title),
      kind:['movie','tv','anime'].includes(w.kind)?w.kind:'tv',date:str(w.date,20),overview:str(w.overview,5000),
      poster:safeURL(w.poster),imdb_id:/^tt\d{5,12}$/.test(w.imdb_id)?w.imdb_id:'',
      links:(Array.isArray(w.links)?w.links:[]).filter(l=>l&&safeURL(l.url)&&str(l.name)).slice(0,12).map(l=>({name:str(l.name,60),url:safeURL(l.url)}))};
  }
  function parseBackup(raw) {
    if(typeof raw!=='string'||raw.length>2000000)throw Error('invalid_backup');
    const d=JSON.parse(raw);
    if(d?.schema!==1||d?.app!=='liangyou-watchlist'||!Array.isArray(d.items)||d.items.length>LIMIT)throw Error('invalid_backup');
    return d.items.map(x=>{
      if(!x||!statuses.includes(x.status)||!Number.isFinite(Date.parse(x.updated_at)))throw Error('invalid_backup');
      return {work:snapshot(x.work),status:x.status,updated_at:x.updated_at};
    });
  }
  function catalog(data) {
    if(data?.works&&data?.aliases)return {works:data.works,aliases:data.aliases};
    // Keep the UI usable while the first v2 collector is deploying.
    const works={},aliases={};
    Object.values(data?.sources||{}).forEach(s=>(s.items||[]).forEach(i=>{
      if(!i.id)return;
      const id=i.imdb_id?'imdb-'+i.imdb_id:i.tmdb_id?`tmdb-${i.kind}-${i.tmdb_id}`:i.id;
      if(!works[id])works[id]={...i,id,aliases:[],links:[],profile:i.profile||{}};
      works[id].aliases.push(i.id);aliases[i.id]=id;aliases[id]=id;
      if(i.url)works[id].links.push({name:i.source,url:i.url});
    }));
    return {works,aliases};
  }
  function resolve(work,cat) {
    for(const id of [work.id,...(work.aliases||[])])if(cat.works[id]||cat.aliases[id])return cat.works[id]?id:cat.aliases[id];
    return work.id;
  }
  function merge(existing,incoming,cat) {
    const entries=new Map();
    for(const entry of [...existing,...incoming]){
      const id=resolve(entry.work,cat),old=entries.get(id);
      if(!old||Date.parse(entry.updated_at)>Date.parse(old.updated_at))entries.set(id,{...entry,work:snapshot(cat.works[id]||entry.work)});
    }
    if(entries.size>LIMIT)throw Error('list_full');
    return [...entries.values()].sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at));
  }
  function backup(items) {return JSON.stringify({app:'liangyou-watchlist',schema:1,exported_at:new Date().toISOString(),items},null,2);}
  function legacy(raw) {
    const records=JSON.parse(raw);if(!records||typeof records!=='object'||Array.isArray(records))throw Error('invalid_legacy');
    return Object.values(records).filter(x=>x&&x.title&&['watchlist','watching','watched'].includes(x.status)).map(x=>{
      const id=Number.isSafeInteger(Number(x.tmdbId))&&Number(x.tmdbId)>0?`tmdb-${x.kind==='tv'?'tv':'movie'}-${x.tmdbId}`:x.id;
      if(!validId(id)||!Number.isFinite(Date.parse(x.updatedAt)))throw Error('invalid_legacy');
      return {work:snapshot({id,title:x.title,original_title:x.originalTitle,kind:x.kind,date:x.year,imdb_id:x.imdbId}),status:x.status==='watchlist'?'want':x.status,updated_at:x.updatedAt};
    });
  }
  function createStore(storage) {
    return {
      read(){const raw=storage.getItem(KEY);return raw?parseBackup(raw):[];},
      write(items){const raw=backup(items);parseBackup(raw);storage.setItem(KEY,raw);return items;}
    };
  }
  globalThis.LiangYouMedia={KEY,LIMIT,statuses,validId,safeURL,snapshot,parseBackup,catalog,resolve,merge,backup,createStore,legacy};
})();

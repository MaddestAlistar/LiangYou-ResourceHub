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
  // Join distinct provider cards only when their full anime edition title and
  // premiere year agree. Exact provider IDs already merge upstream; this is
  // a conservative presentation bridge for Japanese/Chinese season spellings.
  function animeTitleKey(value) {
    let raw=String(value||'').normalize('NFKC').toLowerCase().replace(/½/g,'1/2').trim();
    const season=/第\s*[一二三四五六七八九十\d]+\s*[季期]|(?:2nd|3rd|4th|5th|second|third|fourth|fifth)\s+season|season\s*[2-9]/i.test(raw);
    if(season)raw=raw.replace(/\((?:19|20)\d{2}\)/g,'');
    const nums={'一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','十':'10'};
    raw=raw.replace(/第\s*([一二三四五六七八九十\d]+)\s*[季期]/g,(_,n)=>'season'+(nums[n]||n))
      .replace(/(2nd|second)\s+season/g,'season2')
      .replace(/(3rd|third)\s+season/g,'season3')
      .replace(/(4th|fourth)\s+season/g,'season4')
      .replace(/(5th|fifth)\s+season/g,'season5')
      .replace(/season\s*([2-9])/g,'season$1')
      .replace(/[^\p{L}\p{N}]+/gu,'');
    return raw.length>=6?raw:'';
  }
  function animeEquivalentGroups(works) {
    const rows=Object.values(works||{}).filter(w=>w?.kind==='anime'&&/^\d{4}/.test(w.date||''));
    const byKey=new Map(),pairs=[],parent=new Map(rows.map(w=>[w.id,w.id]));
    const find=id=>{const x=parent.get(id);if(x!==id)parent.set(id,find(x));return parent.get(id);};
    for(const w of rows)for(const key of new Set([w.title,w.original_title,w.english_title].map(animeTitleKey).filter(Boolean))){
      const items=byKey.get(key)||[];items.push(w);byKey.set(key,items);
    }
    for(const values of byKey.values()){
      for(let i=0;i<values.length;i++)for(let j=i+1;j<values.length;j++){
        const a=values[i],b=values[j],ya=Number(a.date.slice(0,4)),yb=Number(b.date.slice(0,4));
        if(Math.abs(ya-yb)>1||a.mal_id&&b.mal_id&&Number(a.mal_id)!==Number(b.mal_id))continue;
        // A unique full title across two provider records is required.
        if(values.length!==2)continue;
        pairs.push([a.id,b.id]);
      }
    }
    for(const [a,b] of pairs)if(find(a)!==find(b))parent.set(find(b),find(a));
    const groups=new Map();
    for(const w of rows){const id=find(w.id);const group=groups.get(id)||[];group.push(w.id);groups.set(id,group);}
    return [...groups.values()].filter(g=>g.length>1);
  }
  function mergeAnimeCatalog(input) {
    const works={...input.works},aliases={...input.aliases};
    for(const group of animeEquivalentGroups(works)){
      const ids=group.slice().sort((a,b)=>(a.startsWith('bangumi-')?0:1)-(b.startsWith('bangumi-')?0:1)||a.localeCompare(b));
      const head=ids[0];let w={...works[head]};
      for(const otherId of ids.slice(1)){
        const other=works[otherId];if(!other)continue;
        w={
          ...w,
          mal_id:w.mal_id||other.mal_id,
          poster:w.poster||other.poster,
          overview:w.overview||other.overview,
          english_title:w.english_title||other.english_title,
          aliases:[...new Set([...(w.aliases||[]),...(other.aliases||[]),other.id])],
          categories:[...new Set([...(w.categories||[]),...(other.categories||[])])],
          links:[...new Map([...(w.links||[]),...(other.links||[])].map(l=>[l.url,l])).values()],
          ratings:[...new Map([...(other.ratings||[]),...(w.ratings||[])].map(r=>[r.source,r])).values()],
          profile:{...(other.profile||{}),...(w.profile||{})}
        };
        for(const id of [otherId,...(other.aliases||[])])aliases[id]=head;
        delete works[otherId];
      }
      for(const id of [head,...(w.aliases||[])])aliases[id]=head;
      works[head]=w;
    }
    return {works,aliases};
  }
  function createStore(storage) {
    return {
      read(){const raw=storage.getItem(KEY);return raw?parseBackup(raw):[];},
      write(items){const raw=backup(items);parseBackup(raw);storage.setItem(KEY,raw);return items;}
    };
  }
  globalThis.LiangYouMedia={KEY,LIMIT,statuses,validId,safeURL,snapshot,parseBackup,catalog,mergeAnimeCatalog,animeEquivalentGroups,animeTitleKey,resolve,merge,backup,createStore,legacy};
})();

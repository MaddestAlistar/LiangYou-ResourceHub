/* Source-ID-linked score cards: no title search, no false cross-platform merges. */
(()=>{
 'use strict';
 const root=document.querySelector('#media');if(!root)return;
 const worker='https://liangyou-extra-ratings-lab.maddestalistar.workers.dev';
 const pending=new Map();
 const en=()=>document.documentElement.lang.startsWith('en');
 const t=(zh,enText)=>en()?enText:zh;
 const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const load=path=>{
   if(!pending.has(path))pending.set(path,fetch(worker+path,{signal:AbortSignal.timeout(13500)})
     .then(r=>{if(!r.ok)throw Error('source_unavailable');return r.json();})
     .catch(()=>null));
   return pending.get(path);
 };
 const unique=values=>[...new Set(values)];
 root.addEventListener('liangyou:media-detail',async ev=>{
   const info=ev.detail;
   if(info?.section!=='ratings')return;
   const aliases=Array.isArray(info.aliases)?info.aliases.filter(x=>typeof x==='string'):[];
   const candidates=[];
   for(const id of unique(aliases)){
     const simkl=/^simkl-(movie|tv|anime)-([1-9]\d{1,9})$/.exec(id);
     if(simkl&&simkl[1]===(info.kind==='tv'?'tv':info.kind)&&!candidates.some(x=>x.source==='Simkl'))
       candidates.push({source:'Simkl',id:simkl[2],path:'/api/simkl/'+simkl[2]});
     const bb=/^bilibili-(?:season|anime)-([1-9]\d{0,9})$/.exec(id);
     if(bb&&!candidates.some(x=>x.source==='Bilibili 番剧'))
       candidates.push({source:'Bilibili 番剧',id:bb[1],path:'/api/bilibili/season/'+bb[1]});
     const fm=/^filmarks-movie-([1-9]\d{2,8})$/.exec(id);
     if(fm&&info.kind==='movie'&&!candidates.some(x=>x.source==='Filmarks'))
       candidates.push({source:'Filmarks',id:fm[1],path:'/api/filmarks/movie/'+fm[1]});
   }
   const tmdbId=Number(info.tmdbId);
   if(!candidates.some(x=>x.source==='Simkl')){
     if(['movie','tv'].includes(info.kind)&&Number.isSafeInteger(tmdbId)&&tmdbId>0&&tmdbId<1e10)
       candidates.push({source:'Simkl',externalSite:'tmdb',externalId:String(tmdbId),
         path:'/api/simkl/by-tmdb/'+info.kind+'/'+tmdbId});
     else if(info.kind==='anime'&&Number.isSafeInteger(Number(info.malId))&&Number(info.malId)>0)
       candidates.push({source:'Simkl',externalSite:'mal',externalId:String(info.malId),
         path:'/api/simkl/by-mal/anime/'+info.malId});
   }
   const malId=Number(info.malId);
   if((info.kind==='anime'||info.kind==='tv')&&Number.isSafeInteger(malId)&&malId>0&&malId<1e10)
     candidates.push({source:'Kitsu',id:String(malId),path:'/api/kitsu/by-mal/'+malId});
   if(!candidates.length)return;
   const section=root.querySelector('#media-dialog .mi-ratings-section');if(!section)return;
   const block=document.createElement('section');block.className='mi-exact-scores';
   block.innerHTML='<p class="mi-caption">'+t('正在按已核对的跨平台作品 ID 获取更多评分…','Loading ratings by verified source IDs…')+'</p>';
   const manual=section.querySelector('.mtk-rating-research');
   if(manual)manual.before(block);else section.append(block);
   const returned=await Promise.all(candidates.map(async entry=>({entry,result:await load(entry.path)})));
   if(!block.isConnected)return;
   const year=Number(String(info.year||'').slice(0,4));
   const cards=returned.filter(({entry,result:d})=>{
     if(!d||d.code!==0||String(d.id)=== ''||!Number.isFinite(d.rating)||d.rating<=0)return false;
     if(entry.source==='Kitsu'){
       return String(d.malId)===entry.id&&d.mappingMethod==='official_kitsu_mal_mapping'&&d.scale===100&&d.rating<=100;
     }
     if(entry.externalSite){
       if(d.matchedExternalSite!==entry.externalSite||String(d.matchedExternalId)!==entry.externalId||
          d.mappingMethod!==(entry.externalSite==='tmdb'?'official_simkl_tmdb_lookup':'official_simkl_mal_lookup'))return false;
     }else if(String(d.id)!==entry.id)return false;
     if(entry.source==='Simkl'){
       const remoteYear=Number(d.releaseYear);
       if(year>1850&&remoteYear>1850&&Math.abs(remoteYear-year)>1)return false;
       const url=String(d.pageUrl||'');
       const kind=info.kind==='movie'?'movies':info.kind==='tv'?'tv':'anime';
       return url.startsWith('https://simkl.com/'+kind+'/')&&d.scale===10&&d.rating<=10;
     }
     // For sources lacking a cross-reference to the work, require the linked
     // source ID from the canonical catalog plus a nonblank source title.
     return !!d.title&&((d.scale===5&&entry.source==='Filmarks')||(d.scale===10&&entry.source==='Bilibili 番剧'));
   });
   if(!cards.length){block.remove();return;}
   block.innerHTML='<h4>'+t('跨平台独立评分 · ID 已关联','Platform ratings · linked by ID')+'</h4>'+
     '<div class="mi-score-grid">'+cards.map(({entry,result:d})=>
       '<div class="mi-score-tile"><span>'+esc(entry.source)+'</span><strong>'+
       esc(Number(d.rating).toFixed(1))+'/'+esc(d.scale)+'</strong><small>'+
       t('原站作品 ID 已关联','Exact source ID')+
       (Number.isSafeInteger(d.ratingCount)?' · '+esc(d.ratingCount.toLocaleString())+t(' 票',' votes'):'')+'</small></div>'
     ).join('')+'</div><p class="mi-caption">'+
     t('Simkl 支持 TMDB/MAL 准确 ID 查询，Kitsu 使用 MAL 官方映射；无原站标识的来源不猜分。','Simkl resolves exact TMDB/MAL IDs, and Kitsu uses MAL mapping; no fuzzy score matching.')+'</p>';
 });
})();
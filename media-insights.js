/* LiangYou film dossiers: six-category source-aware enrichment.
   Exact TMDB IDs only; absence and upstream failure are never fabricated. */
(function(){
  'use strict';
  const root=document.getElementById('media');
  if(!root)return;
  const base='https://liangyou-streaming-availability.maddestalistar.workers.dev';
  const cache=new Map();
  const english=()=>document.documentElement.lang.startsWith('en');
  const t=(zh,en)=>english()?en:zh;
  const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function safe(href){
    try{const u=new URL(href);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}
  }
  const a=(url,label)=>safe(url)?'<a href="'+esc(safe(url))+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':'';
  const format=v=>v&&Number.isFinite(Date.parse(v))?new Intl.DateTimeFormat(english()?'en-GB':'zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)):'';
  async function json(path){
    const r=await fetch(base+path,{signal:AbortSignal.timeout(18000)});
    if(!r.ok)throw Error('unavailable');
    return await r.json();
  }
  let sourceSnapshotPromise=null;
  async function sourceSnapshot(){
    if(!sourceSnapshotPromise)sourceSnapshotPromise=(async()=>{
      try{
        const r=await fetch('./data/media-discovery-snapshot.json',{cache:'no-cache',signal:AbortSignal.timeout(5000)});
        if(!r.ok)return null;
        const d=await r.json();
        return d?.schema===1?d:null;
      }catch{return null;}
    })();
    return sourceSnapshotPromise;
  }
  let broaderMalSnapshot=null;
  async function officialMalCache(id){
    if(!broaderMalSnapshot){
      broaderMalSnapshot=(async()=>{
        try{
          const r=await fetch('./data/media-mal-v2.json',{cache:'no-cache',signal:AbortSignal.timeout(6000)});
          if(!r.ok)return null;
          const d=await r.json(),age=Date.now()-Date.parse(d.checkedAt);
          if(d.ok!==true||d.status!=='ok'||d.source!=='MyAnimeList v2'||
             !Number.isFinite(age)||age<0||age>7*86400000||!d.items)return null;
          return d.items;
        }catch{return null;}
      })();
    }
    const items=await broaderMalSnapshot;
    const item=items?.[String(id)];
    return item?.ok===true&&item.malId===id&&item.status==='ok'?item:null;
  }
  function snapshotFresh(section){
    const age=Date.now()-Date.parse(section?.checked_at||'');
    return Number.isFinite(age)&&age>=0&&age<72*3600000&&section?.status==='ok';
  }
  function get(kind,id,withMedia=false,withWiki=false){
    const key=kind+':'+id+':'+(withMedia?'discover':'base')+':'+(withWiki?'wikimedia':'plain');
    if(!cache.has(key))cache.set(key,json('/api/insights/'+kind+'/'+id+'?schema=13'+(withMedia?'&media=1':'')+(withWiki?'&wiki=1':'')).catch(e=>{cache.delete(key);throw e;}));
    return cache.get(key);
  }
  const classificationCache=new Map();
  function getClassification(kind,id){
    const key=kind+':'+id;
    if(!classificationCache.has(key))classificationCache.set(key,(async()=>{
      const response=await fetch(base+'/api/classification/'+kind+'/'+id+'?schema=1',{signal:AbortSignal.timeout(15000)});
      // Backwards-compatible while the lightweight Worker route is rolling out.
      if(response.status===404)return get(kind,id,false);
      if(!response.ok)throw Error('classification_unavailable');
      return response.json();
    })().catch(error=>{classificationCache.delete(key);throw error;}));
    return classificationCache.get(key);
  }
  async function filmNewsFeed(){
    // GitHub Actions provides a verified snapshot if Worker-to-Guardian access is denied.
    try{
      const response=await fetch('./data/media-guardian.json',{cache:'no-cache',signal:AbortSignal.timeout(5500)});
      if(response.ok){
        const value=await response.json(),age=Date.now()-Date.parse(value.checkedAt);
        if(value.ok===true&&value.status==='ok'&&value.source==='The Guardian'&&
          Array.isArray(value.articles)&&value.articles.length>=3&&age>=0&&age<48*3600000&&
          value.articles.every(x=>x.title&&safe(x.url)&&x.date))return value;
      }
    }catch{}
    const snap=await sourceSnapshot();
    if(snapshotFresh(snap?.guardian)&&Array.isArray(snap.guardian.articles)&&snap.guardian.articles.length>=3)
      return {ok:true,status:'ok',source:'The Guardian',articles:snap.guardian.articles};
    return json('/api/news/film');
  }
  function item(label,value){
    return value?'<div class="mi-insight-fact"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>':'';
  }
  function serviceNames(d){
    const names={fanart:'Fanart.tv',thetvdb:'TheTVDB',wikidata:'Wikidata',omdb:'OMDb',guardian:'The Guardian'};
    const rows=Object.entries(names).map(([name,label])=>[name,label,d.sources?.[name]]).filter(x=>x[2]==='ok');
    return rows.length?'<p class="mi-caption">'+t('本次有补充数据：','Supplemented by: ')+rows.map(x=>esc(x[1])).join(' · ')+'</p>':'';
  }
  function profile(d){
    const tv=d.tvdb;
    const art=(d.artwork||[]).filter(x=>x.url&&safe(x.url)).slice(0,2);
    let content='<section class="mi-insight-block"><h3>'+t('跨站资料补充','Extended metadata')+'</h3>';
    if(tv)content+='<div class="mi-insight-facts">'+item('TheTVDB ID',tv.id)+item(t('剧集首播','First aired'),tv.firstAired)+item(t('剧集状态','Series status'),tv.status)+item(t('季数','Season count'),tv.seasons)+'</div><div class="mi-insight-links">'+a(tv.url,'TheTVDB')+'</div><p class="mi-caption">'+t('TheTVDB 的 score 代表热度，不作观众评分。','TheTVDB score measures popularity, not audience rating.')+'</p>';
    if(art.length)content+='<details class="mi-artwork-drawer"><summary>'+t('作品画作 · Fanart.tv','Artwork · Fanart.tv')+' ('+art.length+')</summary><div class="mi-artwork-grid">'+art.map(x=>'<a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(x.url)+'" alt="'+esc(x.type)+'" loading="lazy" decoding="async"></a>').join('')+'</div><p class="mi-caption">'+t('Fanart.tv 原始图片，版权归相应权利人。','Images sourced from Fanart.tv; rights belong to their owners.')+'</p></details>';
    if(d.wikidata?.verified){
      content+='<div class="mi-insight-links">'+a(d.wikidata.url,'Wikidata · '+d.wikidata.id)+
        (d.wikipedia?a(d.wikipedia.url,'Wikipedia · '+d.wikipedia.language.toUpperCase()):'')+'</div>';
      content+='<p class="mi-caption">'+t('百科实体已与 TMDB / IMDb 原始标识交叉核验；百科不提供实时播放渠道。','Wikimedia entity cross-checked against TMDB / IMDb. Wikipedia does not verify live streaming availability.')+'</p>';
    }
    if(!tv&&!art.length&&!d.wikidata?.verified)content+='<p class="mi-caption">'+t('这部作品暂没有可验证的补充资料，已有 TMDB 档案保持不变。','No independently verified supplements for this title.')+'</p>';
    return content+serviceNames(d)+'</section>';
  }
  function people(d){
    return '<section class="mi-insight-block"><h3>'+t('跨库关系与标识','Entity relationships')+'</h3>'+
      '<p class="mi-caption">'+t('演职信息按 TMDB 原始人物链接展示。只有跨站 ID 可核验时才加入对应实体，避免同名人员串档。','TMDB credit links remain canonical; external entities require exact IDs.')+'</p>'+
      '<div class="mi-insight-facts">'+item('TMDB',d.tmdbId)+item('IMDb',d.imdbId)+item('TheTVDB',d.tvdbId)+item('Wikidata',d.wikidataId)+'</div>'+
      (d.wikidata?.verified?'<div class="mi-insight-links">'+a(d.wikidata.url,t('查看已核验 Wikidata 实体','View verified Wikidata entity'))+
        (d.wikipedia?a(d.wikipedia.url,'Wikipedia · '+d.wikipedia.language.toUpperCase()):'')+'</div>':'')+
      '</section>';
  }
  function boxoffice(d){
    if(d.kind!=='movie')return '<section class="mi-insight-block"><p class="mi-caption">'+t('此作品不是院线电影，不适用单片票房统计。','This is not a theatrical film; individual box office totals do not apply.')+'</p></section>';
    const usd=n=>new Intl.NumberFormat(english()?'en-US':'zh-CN',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
    const financials=d.financials||{};
    const cards=[
      ['TMDB · '+t('已记录收入（区域未注明）','Reported revenue (region unspecified)'),financials.revenueUSD],
      ['TMDB · '+t('制作预算','Production budget'),financials.budgetUSD]
    ].filter(([,v])=>typeof v==='number'&&Number.isFinite(v)&&v>0);
    return '<section class="mi-insight-block"><h3>'+t('单片票房与财务信息','Film box office and financials')+'</h3>'+
      (d.boxOffice?'<div class="mi-insight-highlight"><small>'+t('美国本土票房 · OMDb 汇总','US domestic gross · OMDb')+'</small><strong>'+esc(d.boxOffice.amount)+'</strong>'+a(d.boxOffice.sourceUrl,'IMDb')+'</div>':'')+
      (cards.length?'<div class="mi-cn-box-grid">'+cards.map(([label,v])=>'<div><small>'+esc(label)+'</small><strong>'+esc(usd(v))+'</strong></div>').join('')+'</div>':'')+
      (d.wikidataBoxOffice&&d.wikidata?.verified?'<div class="mi-insight-highlight"><small>'+t('Wikidata 收录票房 · 美元（地区与统计时间未注明）','Wikidata box office · USD (region and reporting date unspecified)')+'</small><strong>'+esc(usd(d.wikidataBoxOffice.amount))+'</strong>'+a(d.wikidataBoxOffice.sourceUrl,'Wikidata')+'</div>':'')+
      (!d.boxOffice&&!cards.length&&!d.wikidataBoxOffice?'<p class="mi-caption">'+t('暂无经过核对的单片收入数据。','No matching individual film financial figures yet.')+'</p>':'')+
      '<p class="mi-caption">'+t('美元金额来自不同来源、不同统计口径。TMDB revenue 不等同于已验证的全球院线票房；预算不属于票房。','USD figures can have different scopes. TMDB revenue is not a verified worldwide theatrical gross, and budget is not box office.')+'</p>'+
      '</section>';
  }
  function formatDuration(raw){
    const m=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(raw||''));
    if(!m)return '';
    const h=Number(m[1]||0),min=Number(m[2]||0),sec=Number(m[3]||0);
    return (h?h+':'+String(min).padStart(2,'0'):String(min))+':'+String(sec).padStart(2,'0');
  }
  // One unified trailer gallery. Domestic videos are only attached with exact title,
  // release year, publisher URL and a valid provider-specific video identifier.
  function verifiedDomesticTrailers(info,records=[]){
    const year=Number(String(info?.year||'').slice(0,4));
    const kind=info?.kind;
    const aliases=[info?.title,info?.originalTitle,...(Array.isArray(info?.aliases)?info.aliases:[])]
      .filter(x=>typeof x==='string').map(x=>x.normalize('NFKC').trim().toLowerCase()).filter(Boolean);
    if(!aliases.length||!Number.isSafeInteger(year)||year<1900||!['movie','tv'].includes(kind))return [];
    const found=[],ids=new Set();
    for(const x of Array.isArray(records)?records:[]){
      if(!x||x.kind!==kind)continue;
      const idBound=x.verifiedByTitleId===true&&Number(x.tmdbId)===Number(info?.tmdbId)&&
        Math.abs(Number(x.year)-year)<=1;
      if(!idBound&&(Number(x.year)!==year||
         !aliases.includes(String(x.title||'').normalize('NFKC').trim().toLowerCase())))continue;
      const u=safe(x.verifiedSource);
      if(!u)continue;
      const id=String(x.videoId||''),p=x.platform;
      let verified=false;
      if(p==='bilibili')verified=/^BV[A-Za-z0-9]{10}$/.test(id)&&u==='https://www.bilibili.com/video/'+id+'/';
      if(p==='tencent')verified=/^[A-Za-z0-9]{11}$/.test(id)&&u==='https://v.qq.com/x/page/'+id+'.html';
      if(p==='youku')verified=/^[A-Za-z0-9=_-]{8,80}$/.test(id)&&u==='https://v.youku.com/v_show/id_'+id+'.html';
      if(p==='iqiyi')verified=/^[A-Za-z0-9]{6,40}$/.test(id)&&u==='https://www.iqiyi.com/v_'+id+'.html';
      // A 1905 movie profile is not a verified trailer playback URL. Show as
      // source link only, never construct an unapproved streaming iframe.
      if(!verified||ids.has(p+':'+id))continue;
      ids.add(p+':'+id);
      found.push({...x,videoId:id,url:u});
      if(found.length>=36)break;
    }
    return found;
  }
  // Select one cross-platform gallery: 6 strongest matched clips, and only when
  // there are more than six candidates, up to four additional Chinese-platform clips.
  // This applies equally to trailers, teasers, interviews, reviews and scene clips.
  function rankFilmVideos(rows){
    const seen=new Set();
    const unique=(Array.isArray(rows)?rows:[]).filter(v=>{
      if(!v||typeof v.key!=='string'||!v.key||seen.has(v.key))return false;
      seen.add(v.key);return true;
    });
    const merit=v=>{
      const likes=Number.isSafeInteger(v.likes)&&v.likes>=0?v.likes:0;
      const role=v.type==='trailer'?(v.official?130:108):75;
      const playable=v.playable===false?-45:0;
      return role+Math.log10(likes+1)*10+playable;
    };
    const ranked=unique.slice().sort((a,b)=>merit(b)-merit(a)||
      Number(b.domestic)-Number(a.domestic)||a.key.localeCompare(b.key));
    const main=ranked.slice(0,6),picked=new Set(main.map(x=>x.key));
    const extra=ranked.length>6?ranked.filter(x=>x.domestic&&!picked.has(x.key)).slice(0,4):[];
    return [...main,...extra];
  }
  function trailerGallery(d={},info={},domesticRows=[],status='ready'){
    const youtube=Array.isArray(d?.trailers)?d.trailers.filter(v=>/^[A-Za-z0-9_-]{11}$/.test(v.id||'')).slice(0,12):[];
    const domestic=verifiedDomesticTrailers(info,domesticRows);
    const ytIds=new Set(youtube.map(x=>x.id));
    const verifiedRelated=Array.isArray(d?.relatedVideos)?d.relatedVideos
      .filter(v=>/^[A-Za-z0-9_-]{11}$/.test(v.id||'')&&v.embeddable===true&&
        v.ageRestricted!==true&&!ytIds.has(v.id))
      .sort((a,b)=>(Number.isFinite(b.likes)?b.likes:-1)-(Number.isFinite(a.likes)?a.likes:-1)).slice(0,16):[];
    function youtubeCard(v,related=false){
      const poster=safe(v.thumbnail)||'https://i.ytimg.com/vi/'+v.id+'/hqdefault.jpg';
      const duration=formatDuration(v.duration);
      const fmt=n=>new Intl.NumberFormat(english()?'en':'zh-CN',{notation:'compact',maximumFractionDigits:1}).format(n);
      const views=Number.isFinite(v.views)?fmt(v.views)+t(' 播放',' views'):'';
      const likes=Number.isFinite(v.likes)&&v.likes>0?fmt(v.likes)+t(' 赞',' likes'):'';
      const label=related?t('相关视频','Related video'):
        v.ageRestricted===true?t('年龄限制 · 原站观看','Age-restricted · source only'):
        v.official?t('TMDB 标注官方','TMDB official'):t('搜索候选 · 待核对','Unverified search match');
      const embedAllowed=v.embeddable!==false&&v.ageRestricted!==true;
      const thumb='<img loading="lazy" decoding="async" src="'+esc(poster)+'" alt="" referrerpolicy="no-referrer">'+
        '<span class="mi-trailer-play" aria-hidden="true">'+(embedAllowed?'▶':'↗')+'</span>'+
        (duration?'<span class="mi-trailer-duration">'+esc(duration)+'</span>':'');
      const url='https://www.youtube.com/watch?v='+v.id;
      const player=embedAllowed?
        '<button class="mi-trailer-trigger" type="button" data-mi-play-video="'+esc(v.id)+'" aria-haspopup="dialog" aria-label="'+t('播放视频：','Play video: ')+esc(v.title||'Video')+'">'+thumb+'</button>':
        '<a class="mi-trailer-trigger mi-video-external" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+thumb+'</a>';
      return '<article class="mi-trailer-card"><div class="mi-trailer-preview">'+player+'</div>'+
        '<div class="mi-trailer-body"><div class="mi-trailer-tags"><span>YouTube</span><span class="'+(related||v.official?'':'mi-warning-source')+'">'+label+'</span></div>'+
        '<strong>'+esc(v.title||'Video')+'</strong><small>'+esc(v.channel||'YouTube')+
        (likes?'<span class="mi-video-likes"> · '+esc(likes)+'</span>':'')+(views?' · '+esc(views):'')+'</small>'+
        '<div class="mi-insight-links">'+a(url,'YouTube')+'</div></div></article>';
    }
    const candidates=[];
    for(const v of youtube)candidates.push({key:'youtube:'+v.id,domestic:false,
      type:['Trailer','Teaser'].includes(v.type)?'trailer':'related',
      official:v.official===true,playable:v.embeddable!==false&&v.ageRestricted!==true,
      likes:Number.isSafeInteger(v.likes)?v.likes:-1,card:youtubeCard(v)});
    for(const v of verifiedRelated)candidates.push({key:'youtube:'+v.id,domestic:false,
      type:'related',official:false,playable:true,likes:v.likes,card:youtubeCard(v,true)});
    for(const x of domestic){
      const provider=x.platform==='bilibili'?'Bilibili':x.platform==='tencent'?'腾讯视频':x.platform==='youku'?'优酷':'爱奇艺';
      const name=String(x.name||t('影视预告片','Trailer'));
      const supportedPlayer=x.platform==='bilibili'||x.platform==='tencent'||x.platform==='youku';
      const cover='<span class="mi-trailer-source-cover '+(x.platform==='bilibili'?'mi-trailer-bilibili':'mi-trailer-tencent')+'">'+
        '<span class="mi-trailer-source-brand">'+esc(provider)+'</span>'+
        '<span class="mi-trailer-play" aria-hidden="true">'+(supportedPlayer?'▶':'↗')+'</span>'+
        '<span class="mi-trailer-source-hint">'+t(supportedPlayer?'点击播放':'原站观看','Open video')+'</span></span>';
      const player=supportedPlayer?'<button class="mi-trailer-trigger" type="button" data-mi-play-cn="'+esc(x.platform)+
        '" data-mi-cn-id="'+esc(x.videoId)+'" data-mi-cn-url="'+esc(x.url)+
        '" aria-haspopup="dialog" aria-label="'+t('播放视频：','Play video: ')+esc(name)+'">'+cover+'</button>':
        '<a class="mi-trailer-trigger mi-video-external" href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">'+cover+'</a>';
      const card='<article class="mi-trailer-card"><div class="mi-trailer-preview">'+player+'</div>'+
        '<div class="mi-trailer-body"><div class="mi-trailer-tags"><span>'+esc(provider)+'</span></div>'+
        '<strong>'+esc(name)+'</strong><small>'+esc(x.publisher||provider)+
          (Number.isSafeInteger(x.likes)&&x.likes>=0?' · '+esc(new Intl.NumberFormat(english()?'en':'zh-CN',{notation:'compact'}).format(x.likes))+t(' 赞',' likes'):'')+'</small>'+
        '<div class="mi-insight-links">'+a(x.url,t('原站观看','Original video'))+'</div></div></article>';
      candidates.push({key:x.platform+':'+x.videoId,domestic:true,type:x.type==='Related'?'related':'trailer',
        official:x.official===true,playable:supportedPlayer,likes:Number.isSafeInteger(x.likes)?x.likes:-1,card});
    }
    const selected=rankFilmVideos(candidates);
    // Platform search links are discovery fallbacks, not unverified embedded videos.
    const title=String(info?.title||info?.originalTitle||'').normalize('NFKC').trim();
    const q=encodeURIComponent(title+' 预告片');
    const year=Number(String(info?.year||'').slice(0,4));
    const aliases=[info?.title,info?.originalTitle,...(Array.isArray(info?.aliases)?info.aliases:[])]
      .filter(x=>typeof x==='string').map(x=>x.normalize('NFKC').trim().toLowerCase()).filter(Boolean);
    const cinemaSource=(Array.isArray(domesticRows)?domesticRows:[]).find(x=>
      x&&x.platform==='1905'&&x.kind===info?.kind&&Number(x.year)===year&&
      aliases.includes(String(x.title||'').normalize('NFKC').trim().toLowerCase())&&
      /^https:\/\/www\.1905\.com\/mdb\/film\/[1-9]\d{3,10}\/$/.test(safe(x.verifiedSource)||''));
    const finder=title?
      '<details class="mi-trailer-search"><summary>'+t('其他平台查找预告片','Find trailers on other platforms')+'</summary>'+
      '<div class="mi-insight-links">'+
      a('https://search.bilibili.com/all?keyword='+q,'Bilibili')+
      a('https://v.qq.com/x/search/?q='+q,t('腾讯视频','Tencent Video'))+
      a('https://so.youku.com/search/q_'+encodeURIComponent(title),t('优酷','Youku'))+
      a('https://so.iq.com/so/?q='+encodeURIComponent(title),t('爱奇艺','iQIYI'))+
      a(cinemaSource?.verifiedSource||'https://www.1905.com/news/yg/',
        cinemaSource?t('1905 · 当前作品资料','1905 · Matched title'):'1905电影网')+'</div></details>':'';
    let state='';
    if(!selected.length){
      if(status==='loading')state=t('正在查找可播放的预告片…','Checking verified trailers…');
      else if(status==='error')state=t('预告片接口暂不可用，已保留平台查找入口。','Trailer service unavailable; platform links remain available.');
      else state=t('暂无核验过的预告片，可通过下方入口前往原平台查找。','No verified videos for this title; try the original platforms.');
    }
    return '<section class="mi-insight-block mi-videos-block"><div class="mi-insight-head"><h3>'+t('预告片/相关视频','Trailers / Related videos')+
      '</h3><span class="mi-tech-tag">'+t('多平台','Multiple platforms')+'</span></div>'+
      (selected.length?'<div class="mi-trailer-grid">'+selected.map(x=>x.card).join('')+'</div>':'')+
      (state?'<p class="mi-caption mi-trailer-state">'+state+'</p>':'')+finder+'</section>';
  }

  // Domestic snapshot is intentionally independent of the YouTube/TMDB Worker.
  let domesticVideoPromise=null;
  function domesticVideoSnapshot(){
    if(!domesticVideoPromise)domesticVideoPromise=(async()=>{
      try{
        const r=await fetch('./data/media-domestic-trailers.json',{cache:'no-cache',signal:AbortSignal.timeout(6500)});
        if(!r.ok)return [];
        const d=await r.json();
        return d?.schema===1&&Array.isArray(d.items)?d.items:[];
      }catch{return [];}
    })();
    return domesticVideoPromise;
  }

  let worldNewsPromise=null;
  function worldNewsSnapshot(){
    if(!worldNewsPromise)worldNewsPromise=(async()=>{
      try{
        const r=await fetch('./data/media-world-news.json',{cache:'no-cache',signal:AbortSignal.timeout(6500)});
        if(!r.ok)return [];
        const doc=await r.json(),age=Date.now()-Date.parse(doc.updatedAt||'');
        if(doc.schema!==1||!Array.isArray(doc.items)||!Number.isFinite(age)||age<0||age>8*86400000)return [];
        return doc.items.filter(x=>x&&typeof x.title==='string'&&safe(x.url)&&
          ['Variety','Deadline','The Hollywood Reporter','IndieWire','TheWrap','Collider'].includes(x.source));
      }catch{return [];}
    })();
    return worldNewsPromise;
  }
  function discoverySections(d,worldArticles=[]){
    const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g,' ').trim();
    const rawTitles=[d.localTitle,d.originalTitle,d.title,...(Array.isArray(d.aliases)?d.aliases:[])].filter(v=>typeof v==='string').slice(0,36);
    function matchScore(article){
      // Curated articles are already keyed to the exact TMDB kind, ID and release
      // year. They may discuss a film without spelling its public title verbatim.
      if(article.verifiedByTitleId===true)return 200;
      // Exact film-ID Worker matches are pre-screened by release year and title.
      if(article.titleMatchVerified===true)return article.type==='community'?85:145;
      const headline=String(article.title||'').normalize('NFKC'),line=' '+normalize(headline)+' ';
      let confidence=0;
      for(const label of rawTitles){
        const name=normalize(label),compact=name.replace(/ /g,'');
        if(compact.length<2)continue;
        const quoted=['“'+label+'”',"'"+label+"'",'《'+label+'》','「'+label+'」'].some(q=>headline.toLowerCase().includes(q.toLowerCase()));
        if(quoted){confidence=Math.max(confidence,100+Math.min(compact.length,20));continue;}
        if(/[\u3400-\u9fff\uac00-\ud7af]/.test(name)){
          if(compact.length>=4&&line.replace(/ /g,'').includes(compact))confidence=Math.max(confidence,75+Math.min(compact.length,20));
        }else if(compact.length>=4&&line.includes(' '+name+' ')){
          // "Moana" and "Obsession" are also ordinary words or older films.
          // Require a film-specific context, and for single-word aliases use
          // a release-year/live-action/director-style disambiguation signal.
          const single=compact.length<=12&&!name.includes(' ');
          const context=/\b(movie|film|cinema|trailer|box office|horror|director|screening|remake|live.action|review|festival|actor|actress|release)\b/i.test(headline);
          const anchored=/\b(20\d{2}|19\d{2})\b|\blive.action\b|\bCurry Barker\b|\bDwayne Johnson\b|\bDisney\b/i.test(headline);
          if(!single||context&&anchored||quoted)
            confidence=Math.max(confidence,70+Math.min(compact.length,20));
        }
      }
      return confidence;
    }
    const suggestions=Array.isArray(d.suggestions)?d.suggestions:[];
    const sources=Array.isArray(worldArticles)?worldArticles:[];
    const all=[...(Array.isArray(d.news)?d.news:[]),...sources]
      .filter(x=>x&&safe(x.url)).map(x=>({...x,confidence:matchScore(x)})).filter(x=>x.confidence>0);
    const seen=new Set(),seenTitle=new Set();
    const rows=all.sort((a,b)=>b.confidence-a.confidence||Date.parse(b.date||0)-Date.parse(a.date||0)).filter(x=>{
      const url=safe(x.url),title=normalize(x.title);
      if(!url||seen.has(url)||seenTitle.has(title))return false;
      seen.add(url);seenTitle.add(title);return true;
    }).slice(0,6);
    const international='<section class="mi-insight-block mi-international-news"><div class="mi-insight-head"><h3>'+t('国际新闻','International news')+'</h3><span class="mi-tech-tag">'+t('多来源','Multiple sources')+'</span></div>'+
      (rows.length?'<div class="mi-insight-news mi-editorial-grid">'+rows.map(x=>{
        const image=safe(x.thumbnail);
        return '<article class="mi-editorial-card">'+(image?'<img src="'+esc(image)+'" loading="lazy" decoding="async" alt="" referrerpolicy="no-referrer">':'')+
          '<div class="mi-editorial-body"><span>'+esc(x.source||x.section||'Publisher')+' · '+esc(format(x.date))+'</span>'+
          '<strong>'+a(x.url,x.title)+'</strong>'+(x.summary?'<p>'+esc(x.summary)+'</p>':'')+
          (x.byline?'<small>'+esc(x.byline)+'</small>':'')+'</div></article>';
      }).join('')+'</div>':
        '<p class="mi-caption">'+(d.newsSearchPending?
          t('正在继续查找与本片相关的国际报道…','Searching additional international coverage…'):
          t('暂未找到与本片明确关联的国际报道。','No verifiable international headlines for this title.'))+'</p>')+'</section>';
    const similar='<section class="mi-insight-block mi-similar-themes"><div class="mi-insight-head"><h3>'+t('相似主题探索','Similar themes')+'</h3><span class="mi-tech-tag">TasteDive</span></div>'+
      '<p class="mi-caption">'+t('以下仅是名称级推荐，不代表本站已确认作品 ID，暂不与电影档案自动合并。','Name-only suggestions; identities have not been matched to site titles.')+'</p>'+
      (suggestions.length?'<div class="mi-suggestion-list">'+suggestions.slice(0,5).map(x=>'<span>'+esc(x.title)+'</span>').join('')+'</div>':
      '<p class="mi-caption">'+t('暂无核验过的相似主题推荐。','No matching theme suggestions verified yet.')+'</p>')+'</section>';
    return {trailers:trailerGallery(d),international,similar};
  }
  async function displayBoxOfficeArchive(info,target){
    // Open Box Office Archive public lookup is indexed by the exact TMDB ID.
    const id=Number(info.tmdbId);
    if(info.kind!=='movie'||!Number.isSafeInteger(id)||id<1||id>9999999999)return;
    const host=document.createElement('section');
    host.className='mi-insight-block mi-archive-panel';
    host.innerHTML='<p class="mi-caption">'+t('正在核查北美历史票房档案…','Checking historical North American grosses…')+'</p>';
    const slot=target.querySelector('[data-mi-boxoffice-slot="archive"]');
    if(slot)slot.appendChild(host);else target.appendChild(host);
    try{
      const response=await fetch('https://boxofficehistory.com/api/v1/lookup/tmdb/'+id+'.json',{
        signal:AbortSignal.timeout(10000),mode:'cors'});
      if(!host.isConnected)return;
      if(response.status===404){host.remove();return;}
      if(!response.ok)throw Error('archive_unavailable');
      const d=await response.json(),archiveId=String(d.id||''),year=Number(d.year);
      const matchingYear=Number(String(info.year||'').slice(0,4));
      if(!/^[a-z0-9_-]{1,90}$/i.test(archiveId)||!Number.isSafeInteger(year)||year<1880||year>2100||
          (matchingYear>1880&&Math.abs(matchingYear-year)>1)||
          typeof d.domestic!=='number'||!Number.isFinite(d.domestic)||d.domestic<0){
        host.remove();return;
      }
      const dollars=new Intl.NumberFormat(english()?'en-US':'zh-CN',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(d.domestic));
      host.innerHTML='<div class="mi-insight-head"><h3>'+t('北美历史票房档案','Historical North American box office')+'</h3><span class="mi-tech-tag">Box Office Archive</span></div>'+
        '<div class="mi-insight-highlight"><small>'+t('北美累计票房 · 美国及加拿大','Domestic lifetime total · US & Canada')+'</small>'+
        '<strong>'+esc(dollars)+'</strong></div>'+
        '<p class="mi-caption">'+t('基于互联网档案馆保存的 Box Office Mojo 历史资料，可能与当前重新上映后的最新票房不同。','Archived Box Office Mojo figures from the Internet Archive. Later re-releases may change current totals.')+
        ' · '+esc(year)+' · '+esc(d.title||'')+'</p>'+
        '<div class="mi-insight-links">'+a('https://boxofficehistory.com/api/v1/movies/'+archiveId+'.json',t('查看历史票房来源','View archived film data'))+'</div>';
    }catch{if(host.isConnected)host.innerHTML='<p class="mi-caption">'+t('历史票房档案暂时不可用。','The historical archive is temporarily unavailable.')+'</p>';}
  }
  async function displayMAL(info,target){
    const id=Number(info.malId);
    if(!Number.isSafeInteger(id)||id<1||id>9999999999)return;
    const host=document.createElement('section');
    host.className='mi-insight-block mi-mal-panel';
    host.innerHTML='<p class="mi-caption">'+t('核对 MyAnimeList 作品标识…','Checking MyAnimeList identity…')+'</p>';
    const ratingsSlot=info.section==='ratings'?target.querySelector('[data-mi-ratings-slot="mal"]'):null;
    if(ratingsSlot)ratingsSlot.appendChild(host);else target.appendChild(host);
    try{
      const primary=await officialMalCache(id);
      const snapshot=primary?null:await sourceSnapshot();
      const cached=primary||(snapshotFresh(snapshot?.mal)?snapshot.mal.items?.[String(id)]:null);
      const d=cached?{...cached,ok:true}:await json('/api/anime/mal/'+id);
      if(!host.isConnected)return;
      if(d.ok!==true||d.status!=='ok'||d.malId!==id){host.remove();return;}
      const score=Number.isFinite(d.score)&&d.scale===10?d.score.toFixed(2)+'/10':t('未评分','Not rated');
      host.innerHTML='<div class="mi-insight-head"><h3>'+t('MyAnimeList 官方动画资料','MyAnimeList official anime data')+'</h3><span class="mi-tech-tag">MAL v2</span></div>'+
       '<div class="mi-insight-highlight"><small>'+t('官方评分 · ','Official rating · ')+esc(d.title)+'</small><strong>'+esc(score)+'</strong>'+
         (d.ratingCount!=null?'<small>'+esc(d.ratingCount.toLocaleString())+t(' 人评分',' ratings')+'</small>':'')+
         a(d.url,'MyAnimeList')+'</div>'+
       (info.section==='profile'?'<div class="mi-insight-facts">'+
        item(t('官方排名','MAL rank'),d.rank?'#'+d.rank:'')+
        item(t('人气排名','Popularity'),d.popularity?'#'+d.popularity:'')+
        item(t('集数','Episodes'),d.episodes)+
        item(t('制作公司','Studios'),Array.isArray(d.studios)?d.studios.join(' · '):'')+
        item(t('类型','Genres'),Array.isArray(d.genres)?d.genres.join(' · '):'')+'</div>':'')+
       '<p class="mi-caption">'+t('通过作品的原始 MAL ID 查询，不会把同名动画错误合并。','Looked up using original MAL ID, never a fuzzy title match.')+'</p>';
    }catch{if(host.isConnected)host.innerHTML='<p class="mi-caption">'+t('MAL 补充资料暂不可用。','MAL source temporarily unavailable.')+'</p>';}
  }
  // Optional live metadata repair for works whose scheduled TMDB profile is stale.
  // Never merge on the title alone: the incoming TMDB ID and release year must match.
  async function hydrateClassification(info){
    const kind=info?.kind==='movie'?'movie':info?.kind==='tv'?'tv':null;
    const id=Number(info?.tmdbId);
    if(!kind||!Number.isSafeInteger(id)||id<1)return;
    try{
      const data=await getClassification(kind,id);
      if(data.ok!==true||data.kind!==kind||data.tmdbId!==id||!data.classification)return;
      const expectedYear=Number(String(info.year||'').slice(0,4));
      const actualYear=Number(String(data.releaseDate||'').slice(0,4));
      if(expectedYear>1850&&actualYear>1850&&Math.abs(expectedYear-actualYear)>1)return;
      const name=v=>String(v||'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
      const original=String(info.originalTitle||'').trim();
      if(/^[a-z0-9 \-:.,!?&'()]+$/i.test(original)&&name(original)!==name(data.originalTitle||data.title))return;
      root.dispatchEvent(new CustomEvent('liangyou:media-classification',{
        detail:{id:info.id,tmdbId:id,kind,classification:data.classification}
      }));
    }catch{
      // Optional source failure must not hide existing scores and title data.
    }
  }
  // Stale scheduled TMDB snapshots can omit keywords and parental classifications.
  // Fetch at most two visible films concurrently and cap remote calls per session.
  const visibleAttempts=new Set();
  let visibleQueue=[],visibleInFlight=0;
  function drainVisibleClassifications(){
    while(visibleInFlight<2&&visibleQueue.length&&visibleAttempts.size<24){
      const info=visibleQueue.shift();
      if(!info||visibleAttempts.has(info.id))continue;
      visibleAttempts.add(info.id);
      visibleInFlight++;
      hydrateClassification(info).finally(()=>{
        visibleInFlight--;
        drainVisibleClassifications();
      });
    }
  }
  root.addEventListener('liangyou:media-visible',ev=>{
    const rows=Array.isArray(ev.detail)?ev.detail:[];
    // New page/filter supersedes queued, no-longer-visible work; in-flight work
    // is allowed to finish and is matched by its exact TMDB ID.
    visibleQueue=rows.filter(info=>
      ['movie','tv'].includes(info?.kind)&&Number.isSafeInteger(Number(info.tmdbId))&&
      Number(info.tmdbId)>0&&(!info.hasKeywords||!info.hasParentalRating)&&
      !visibleAttempts.has(info.id)
    ).slice(0,8);
    drainVisibleClassifications();
  });
  async function showWikimediaInToolkit(info){
    const kind=['movie','tv'].includes(info?.kind)?info.kind:null;
    const id=Number(info?.tmdbId);
    if(!kind||!Number.isSafeInteger(id)||id<1)return;
    try{
      const d=await get(kind,id,false,true);
      if(d?.ok!==true||d.tmdbId!==id||d.kind!==kind||!d.wikidata?.verified)return;
      const host=root.querySelector('#media-dialog .mi-toolkit');
      if(!host||host.dataset.mtkId!==String(info.id))return;
      if(!host.querySelector('.mtk-wikimedia')){
        const section=document.createElement('div');
        section.className='mtk-wikimedia';
        section.innerHTML='<p class="mi-caption">'+t('百科作品资料核对（不代表此平台可播放）','Verified encyclopedia references (not streaming availability)')+'</p>'+
          '<div class="mi-insight-links">'+a(d.wikidata.url,'Wikidata')+
          (d.wikipedia?a(d.wikipedia.url,'Wikipedia · '+d.wikipedia.language.toUpperCase()):'')+'</div>';
        host.appendChild(section);
      }
    }catch{/* No sourced wiki data: do not show a placeholder. */}
  }
  async function display(info){
    if(!info)return;
    if(info.section==='watch'){showWikimediaInToolkit(info);return;}
    if(!['ratings','profile','people','boxoffice','discover'].includes(info.section))return;
    const target=root.querySelector('#media-dialog .mi-detail-content');
    if(!target)return;
    if(['ratings','profile'].includes(info.section)&&Number.isSafeInteger(Number(info.malId))&&Number(info.malId)>0)displayMAL(info,target);
    if(info.section==='boxoffice')displayBoxOfficeArchive(info,target);
    if(info.section==='ratings'){hydrateClassification(info);return;}
    if(info.kind==='anime')return;
    const kind=info.kind==='tv'?'tv':info.kind==='movie'?'movie':null;
    const id=Number(info.tmdbId);
    const discoverSlots=info.section==='discover'?{
      trailers:target.querySelector('[data-mi-discover-slot="trailers"]'),
      international:target.querySelector('[data-mi-discover-slot="international"]'),
      similar:target.querySelector('[data-mi-discover-slot="similar"]')
    }:null;
    const pane=document.createElement('div');pane.className='mi-insight-host';
    pane.dataset.miInsight=String(info.id)+':'+info.section;
    let domesticRows=[],trailerResult=null,trailerStatus='loading',verifiedAliases=[];
    let indexedDomesticRows=[],discoveredDomesticRows=[];
    function setDomesticRows(){
      domesticRows=[...indexedDomesticRows,...discoveredDomesticRows];
      paintTrailers();
    }
    function paintTrailers(){
      if(!discoverSlots?.trailers||!pane.isConnected)return;
      const enrichedInfo={...info,aliases:[...(Array.isArray(info.aliases)?info.aliases:[]),...verifiedAliases]};
      pane.innerHTML=trailerGallery(trailerResult||{},enrichedInfo,domesticRows,trailerStatus);
      // The original TMDB links have been integrated into the single trailer
      // experience; a duplicate headline must never remain underneath.
      const fallback=discoverSlots.trailers.querySelector('.mi-official-trailer-fallback');
      if(fallback)fallback.remove();
    }
    const discoverUnavailable=()=>{
      if(!discoverSlots?.trailers)return false;
      trailerStatus='error';
      paintTrailers();
      return true;
    };
    // Keep editorial, global RSS and optional title-scoped results independent:
    // a slow external index cannot wipe a fast human-verified title match.
    let worldArticles=[],indexedNews=[],remoteNews=[],remoteDone=false;
    let intlContext={title:info.title,localTitle:info.title,
      originalTitle:info.originalTitle,aliases:info.aliases,news:[],suggestions:[]};
    function paintInternational(){
      if(!pane.isConnected||!discoverSlots?.international?.isConnected)return;
      const news=[...(Array.isArray(intlContext.news)?intlContext.news:[]),...indexedNews,...remoteNews];
      discoverSlots.international.innerHTML=discoverySections({...intlContext,news,newsSearchPending:!remoteDone},worldArticles).international;
    }
    if(info.section==='discover'&&discoverSlots?.international){
      worldNewsSnapshot().then(rows=>{worldArticles=rows;paintInternational();}).catch(()=>{});
      (window.LiangYouTitleNews?.forInfo(info)??Promise.resolve(null)).then(index=>{
        indexedNews=(index?.articles||[]).filter(x=>x.language!=='zh');
        paintInternational();
      }).catch(()=>{});
      const remoteLookup=window.LiangYouTitleNews?.remoteForInfo?.(info);
      if(remoteLookup&&typeof remoteLookup.then==='function'){
        remoteLookup.then(index=>{
          remoteNews=(index?.articles||[]).filter(x=>x.language!=='zh');
        }).catch(()=>{}).finally(()=>{
          remoteDone=true;paintInternational();
        });
      }else{remoteDone=true;paintInternational();}
    }
    if(discoverSlots?.trailers){
      discoverSlots.trailers.prepend(pane);
      paintTrailers();
      Promise.all([domesticVideoSnapshot(),window.LiangYouTitleNews?.forInfo(info)??Promise.resolve(null)]).then(async ([rows,index])=>{
        const all=[...rows,...(index?.videos||[])];
        verifiedAliases=[...new Set([...verifiedAliases,...(index?.aliases||[])])];
        indexedDomesticRows=all;setDomesticRows();
        // Curated public videos may not include like counts. Never invent them.
        const relevant=all.filter(x=>x.platform==='bilibili'&&/^BV[A-Za-z0-9]{10}$/.test(x.videoId)&&
          !Number.isSafeInteger(x.likes)).slice(0,16);
        if(!relevant.length)return;
        const withLikes=await Promise.all(relevant.map(async x=>{
          try{
            const r=await fetch(base+'/api/video/bilibili/'+x.videoId,{signal:AbortSignal.timeout(7500)});
            if(!r.ok)return x;
            const d=await r.json();
            return d.ok===true&&d.bvid===x.videoId&&Number.isSafeInteger(d.likes)&&d.likes>=0?{...x,likes:d.likes}:x;
          }catch{return x;}
        }));
        if(!pane.isConnected)return;
        const known=new Map(withLikes.map(v=>[v.videoId,v]));
        indexedDomesticRows=all.map(x=>known.get(x.videoId)||x);
        setDomesticRows();
      }).catch(()=>{});
      // Platform availability can vary by region or rate-limit, so this is
      // independent of the already-rendered curated video cards.
      window.LiangYouTitleNews?.videoForInfo?.(info)?.then(data=>{
        if(!pane.isConnected||!Array.isArray(data?.videos))return;
        discoveredDomesticRows=data.videos;
        setDomesticRows();
      }).catch(()=>{});
    }
    else if(info.section==='boxoffice'){
      const slot=target.querySelector('[data-mi-boxoffice-slot="international"]');
      if(slot)slot.appendChild(pane);else target.appendChild(pane);
    }else target.appendChild(pane);
    if(!kind||!Number.isSafeInteger(id)||id<1){
      if(!discoverUnavailable('尚无可核实的预告片来源。','No verified trailer source for this title.'))
        pane.innerHTML='<p class="mi-caption">'+t('未建立准确的 TMDB ID，暂不自动关联外部数据。','No verified TMDB identity; external data will not be merged.')+'</p>';
      return;
    }
    if(!discoverSlots?.trailers)pane.innerHTML='<p class="mi-caption">'+t('正在核对补充数据…','Checking verified external data…')+'</p>';
    try{
      const data=await get(kind,id,info.section==='discover',['profile','people','boxoffice'].includes(info.section));
      if(!pane.isConnected)return;
      if(data.ok!==true||data.kind!==kind||data.tmdbId!==id){
        if(!discoverUnavailable('作品标识未通过核对，暂不显示预告片。','Trailer identity could not be verified.'))
          pane.innerHTML='<p class="mi-caption">'+t('补充接口返回的作品标识不匹配，已跳过这批资料。','Additional data did not match the verified title ID and was skipped.')+'</p>';
        return;
      }
      // Guard against a catalog cross-ID mismatch: never show another work's trailer.
      const latinName=value=>{
        const name=String(value||'').normalize('NFKC').trim();
        return name&&/^[A-Za-z0-9 \-:.,!?&'()]+$/.test(name)?name.toLowerCase().replace(/[^a-z0-9]+/g,''):'';
      };
      // Localized and original film titles can differ while sharing one verified
      // TMDB ID. Check both title forms before rejecting a correct trailer.
      const expectedNames=[info.originalTitle,info.title].map(latinName).filter(Boolean);
      const receivedNames=[data.originalTitle,data.title].map(latinName).filter(Boolean);
      const namesConflict=expectedNames.length>0&&receivedNames.length>0&&
        !expectedNames.some(name=>receivedNames.includes(name));
      const localYear=Number(String(info.year||'').slice(0,4));
      const remoteYear=Number(String(data.releaseDate||'').slice(0,4));
      if(namesConflict||Number.isInteger(localYear)&&localYear>1850&&
          Number.isInteger(remoteYear)&&remoteYear>1850&&Math.abs(localYear-remoteYear)>1){
        if(!discoverUnavailable('作品信息存在冲突，未展示可能属于其他影片的视频。','Conflicting title details; unrelated trailers are withheld.'))
          pane.innerHTML='<p class="mi-caption">'+t('作品来源身份未通过核对，已阻止其他影片的预告和资讯串入。','Title identity did not match, so unrelated trailers and articles were not displayed.')+'</p>';
        return;
      }
      let enriched=data;
      if(info.section==='discover'&&!(Array.isArray(data.suggestions)&&data.suggestions.length)){
        const snapshot=await sourceSnapshot();
        const extra=snapshotFresh(snapshot?.tastedive)?snapshot.tastedive.items?.[info.id]:null;
        const localName=String(info.originalTitle||info.title||'').normalize('NFKC').trim().toLowerCase();
        if(extra?.queried_title&&extra.queried_title.normalize('NFKC').trim().toLowerCase()===localName&&Array.isArray(extra.suggestions))
          enriched={...data,suggestions:extra.suggestions};
      }
      if(!pane.isConnected)return;
      if(info.section==='discover'&&discoverSlots?.trailers){
        verifiedAliases=Array.isArray(enriched.aliases)?enriched.aliases:[];
        const newsContext={...enriched,localTitle:info.title,aliases:[...(Array.isArray(enriched.aliases)?enriched.aliases:[]),...(Array.isArray(info.aliases)?info.aliases:[])]};
        if(verifiedAliases.length)root.dispatchEvent(new CustomEvent('liangyou:media-verified-aliases',{
          detail:{...info,aliases:[...(Array.isArray(info.aliases)?info.aliases:[]),...verifiedAliases]}
        }));
        const sections=discoverySections(newsContext);
        trailerResult=enriched;
        trailerStatus='ready';
        paintTrailers();
        intlContext=newsContext;
        paintInternational();
        if(discoverSlots.similar?.isConnected)discoverSlots.similar.innerHTML=sections.similar;
      }else{
        pane.innerHTML=info.section==='profile'?profile(enriched):info.section==='people'?people(enriched):info.section==='boxoffice'?boxoffice(enriched):'';
      }
    }catch{
      if(pane.isConnected&&!discoverUnavailable(
        '预告片接口暂不可用，未显示未经核实的视频。',
        'Trailer service unavailable; no unverified videos displayed.'))
        pane.innerHTML='<p class="mi-caption">'+t('补充接口暂不可用，已有作品资料仍可正常查看。','Optional insights are unavailable. Core title data remains available.')+'</p>';
    }
  }
  // Public embeds need no viewer login. An account or age verification requirement
  // from YouTube itself is not bypassed. Preserve Referer to avoid player error 153.
  const trailerDialog=document.getElementById('media-trailer-dialog');
  const trailerStage=document.getElementById('media-trailer-stage');
  const playerSwitch=document.getElementById('media-trailer-switch');
  let activeVideoId='';
  let useStandardHost=false;
  function stopTrailer(){
    if(trailerStage)trailerStage.replaceChildren();
    activeVideoId='';
    useStandardHost=false;
  }
  function closeTrailer(){
    // Clear the frame synchronously, including on mobile, before dialog.close()
    // dispatches its 'close' event (which some browsers defer).
    stopTrailer();
    if(trailerDialog?.open)trailerDialog.close();
  }
  function showTrailerFrame(id,standard){
    if(!trailerStage||!/^[A-Za-z0-9_-]{11}$/.test(id))return;
    const frame=document.createElement('iframe');
    frame.title=t('YouTube 预告片播放器','YouTube trailer player');
    const hostname=standard?'www.youtube.com':'www.youtube-nocookie.com';
    frame.src='https://'+hostname+'/embed/'+id+'?autoplay=1&playsinline=1&rel=0';
    frame.loading='eager';
    frame.allow='autoplay; encrypted-media; accelerometer; gyroscope; picture-in-picture; web-share';
    frame.referrerPolicy='strict-origin-when-cross-origin';
    frame.allowFullscreen=true;
    trailerStage.replaceChildren(frame);
    activeVideoId=id;
    useStandardHost=standard;
    if(playerSwitch)playerSwitch.textContent=standard?t('切换隐私播放器','Try privacy-enhanced player'):t('切换普通播放器','Try standard player');
  }
  root.addEventListener('click',ev=>{
    const button=ev.target.closest('button[data-mi-play-cn]');
    if(!button||!trailerDialog||!trailerStage)return;
    const platform=button.dataset.miPlayCn,id=button.dataset.miCnId;
    const url=safe(button.dataset.miCnUrl);
    let frameUrl='';
    if(platform==='bilibili'&&/^BV[A-Za-z0-9]{10}$/.test(id)&&
       url==='https://www.bilibili.com/video/'+id+'/')
      frameUrl='https://player.bilibili.com/player.html?bvid='+id+'&autoplay=1&danmaku=0&poster=1';
    if(platform==='tencent'&&/^[A-Za-z0-9]{11}$/.test(id)&&
       url==='https://v.qq.com/x/page/'+id+'.html')
      frameUrl='https://v.qq.com/txp/iframe/player.html?vid='+id;
    if(platform==='youku'&&/^[A-Za-z0-9=_-]{8,80}$/.test(id)&&
       url==='https://v.youku.com/v_show/id_'+id+'.html')
      frameUrl='https://player.youku.com/embed/'+encodeURIComponent(id);
    if(!frameUrl)return;
    const name=button.closest('.mi-trailer-card')?.querySelector('.mi-trailer-body strong')?.textContent?.trim()||t('预告片','Trailer');
    const frame=document.createElement('iframe');
    const provider=platform==='bilibili'?'Bilibili':platform==='tencent'?'Tencent Video':'Youku';
    frame.title=provider+' · '+name;
    frame.src=frameUrl;
    frame.loading='eager';
    frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.referrerPolicy='strict-origin-when-cross-origin';
    frame.allowFullscreen=true;
    stopTrailer();
    trailerStage.appendChild(frame);
    document.getElementById('media-trailer-title').textContent=name;
    document.getElementById('media-trailer-kicker').textContent=(platform==='bilibili'?'Bilibili':platform==='tencent'?'腾讯视频':'优酷')+' · '+t('相关视频','Related video');
    document.getElementById('media-trailer-help').textContent=t('视频由原平台直接播放；若嵌入受到平台限制，请点击原站观看。','The source platform handles playback. If embedding is restricted, open the original page.');
    const external=document.getElementById('media-trailer-external');
    external.href=url;external.textContent=t('原站观看 ↗','Open original ↗');
    if(playerSwitch)playerSwitch.hidden=true;
    if(!trailerDialog.open)trailerDialog.showModal();
  });

  root.addEventListener('click',ev=>{
    const button=ev.target.closest('button[data-mi-play-video]');
    if(!button)return;
    const id=button.dataset.miPlayVideo;
    if(!/^[A-Za-z0-9_-]{11}$/.test(id)||!trailerDialog||!trailerStage)return;
    const card=button.closest('.mi-trailer-card');
    const name=card?.querySelector('.mi-trailer-body strong')?.textContent?.trim()||t('官方预告片','Trailer');
    document.getElementById('media-trailer-title').textContent=name;
    document.getElementById('media-trailer-kicker').textContent=t('公开视频 · 无需 YouTube 账号','PUBLIC TRAILER · NO ACCOUNT REQUIRED');
    document.getElementById('media-trailer-close').setAttribute('aria-label',t('关闭视频播放器','Close trailer player'));
    document.getElementById('media-trailer-help').textContent=t('公开视频通常无需登录；如果出现播放错误，可切换官方播放器。年龄或账号验证限制无法绕过。','Public videos usually play without a login. For playback errors, try the other official player; account and age restrictions still apply.');
    const external=document.getElementById('media-trailer-external');
    external.href='https://www.youtube.com/watch?v='+id;
    external.textContent=t('原站观看 ↗','Open on YouTube ↗');
    // Wait until the visitor taps a trailer before making requests to YouTube.
    if(playerSwitch)playerSwitch.hidden=false;
    showTrailerFrame(id,true);
    if(!trailerDialog.open)trailerDialog.showModal();
  });
  playerSwitch?.addEventListener('click',()=>{
    if(activeVideoId)showTrailerFrame(activeVideoId,!useStandardHost);
  });
  trailerDialog?.addEventListener('close',stopTrailer);
  document.getElementById('media-trailer-close')?.addEventListener('click',closeTrailer);
  trailerDialog?.addEventListener('click',ev=>{if(ev.target===trailerDialog)closeTrailer();});
  document.getElementById('media-dialog')?.addEventListener('close',closeTrailer);
  root.addEventListener('liangyou:media-detail',ev=>display(ev.detail));

})();
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
  function snapshotFresh(section){
    const age=Date.now()-Date.parse(section?.checked_at||'');
    return Number.isFinite(age)&&age>=0&&age<72*3600000&&section?.status==='ok';
  }
  function get(kind,id,withMedia=false){
    const key=kind+':'+id+':'+(withMedia?'discover':'base');
    if(!cache.has(key))cache.set(key,json('/api/insights/'+kind+'/'+id+'?schema=4'+(withMedia?'&media=1':'')).catch(e=>{cache.delete(key);throw e;}));
    return cache.get(key);
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
    if(d.wikidata)content+='<p class="mi-caption">'+t('TMDB 提供的 Wikidata 标识（未独立核实实体内容）：','Wikidata ID from TMDB (entity content not independently verified): ')+a(d.wikidata.url,(d.wikidata.label||'Wikidata')+' · '+d.wikidata.id)+'</p>';
    if(!tv&&!art.length&&!d.wikidata)content+='<p class="mi-caption">'+t('这部作品暂没有可验证的补充资料，已有 TMDB 档案保持不变。','No independently verified supplements for this title.')+'</p>';
    return content+serviceNames(d)+'</section>';
  }
  function people(d){
    return '<section class="mi-insight-block"><h3>'+t('跨库关系与标识','Entity relationships')+'</h3>'+
      '<p class="mi-caption">'+t('演职信息按 TMDB 原始人物链接展示。只有跨站 ID 可核验时才加入对应实体，避免同名人员串档。','TMDB credit links remain canonical; external entities require exact IDs.')+'</p>'+
      '<div class="mi-insight-facts">'+item('TMDB',d.tmdbId)+item('IMDb',d.imdbId)+item('TheTVDB',d.tvdbId)+item('Wikidata',d.wikidataId)+'</div>'+
      (d.wikidata?'<div class="mi-insight-links">'+a(d.wikidata.url,t('查看 Wikidata 作品实体','Open Wikidata entity'))+'</div>':'')+
      '</section>';
  }
  function boxoffice(d){
    return '<section class="mi-insight-block"><h3>'+t('单片票房补充','Film box office')+'</h3>'+
      (d.boxOffice?'<div class="mi-insight-highlight"><small>'+t('美国本土票房 · OMDb 汇总','US domestic box office · OMDb')+'</small><strong>'+esc(d.boxOffice.amount)+'</strong>'+a(d.boxOffice.sourceUrl,'IMDb')+'</div>':
        '<p class="mi-caption">'+t('暂无经过 IMDb ID 核验的单片票房；此处不会把全球票房与美国票房混用。','No verified film total. Global and US figures are never mixed.')+'</p>')+
      '<details class="mi-rankings-drawer"><summary>'+t('韩国每日票房 · KOFIC','Korea daily box office · KOFIC')+'</summary><div class="mi-kr-boxoffice" aria-live="polite">'+t('展开后读取官方榜单','Open to load the official chart')+'</div></details></section>';
  }
  function formatDuration(raw){
    const m=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(raw||''));
    if(!m)return '';
    const h=Number(m[1]||0),min=Number(m[2]||0),sec=Number(m[3]||0);
    return (h?h+':'+String(min).padStart(2,'0'):String(min))+':'+String(sec).padStart(2,'0');
  }
  function trailerGallery(d){
    const videos=Array.isArray(d.trailers)?d.trailers.filter(v=>/^[A-Za-z0-9_-]{11}$/.test(v.id||'')).slice(0,5):[];
    if(!videos.length)return '<section class="mi-insight-block"><h3>'+t('视频情报','Trailer intelligence')+'</h3><p class="mi-caption">'+t('暂无核验过的预告片。可在下方打开 TMDB 提供的原视频链接。','No verified trailers. Source links may appear above.')+'</p></section>';
    return '<section class="mi-insight-block mi-videos-block"><div class="mi-insight-head"><h3>'+t('预告片 · 视频情报','Trailers · video intelligence')+'</h3><span class="mi-tech-tag">YouTube Data v3</span></div>'+
      '<p class="mi-caption">'+t('优先展示 TMDB 标注的视频，非官方搜索结果单独标识；可嵌入视频点击后才加载播放器。','Prioritizes TMDB-curated videos; unverified results are labeled. Embeddable videos load on tap.')+'</p>'+
      '<div class="mi-trailer-grid">'+videos.map(v=>{
        const poster=safe(v.thumbnail)||'https://i.ytimg.com/vi/'+v.id+'/hqdefault.jpg';
        const duration=formatDuration(v.duration);
        const views=Number.isFinite(v.views)?new Intl.NumberFormat(english()?'en':'zh-CN',{notation:'compact',maximumFractionDigits:1}).format(v.views)+t(' 播放',' views'):'';
        const label=v.official?t('TMDB 标注官方','TMDB official'):t('搜索候选 · 待核对','Search candidate');
        const embedAllowed=v.embeddable!==false;
        const thumb='<img loading="lazy" decoding="async" src="'+esc(poster)+'" alt="" referrerpolicy="no-referrer">'+
          '<span class="mi-trailer-play" aria-hidden="true">'+(embedAllowed?'▶':'↗')+'</span>'+
          (duration?'<span class="mi-trailer-duration">'+esc(duration)+'</span>':'');
        const player=embedAllowed?
          '<button class="mi-trailer-trigger" type="button" data-mi-play-video="'+esc(v.id)+'" aria-label="'+t('播放预告片：','Play trailer: ')+esc(v.title||'Trailer')+'">'+thumb+'</button>':
          '<a class="mi-trailer-trigger mi-video-external" href="'+esc(v.url)+'" target="_blank" rel="noopener noreferrer" aria-label="'+t('在 YouTube 查看预告片：','Open trailer on YouTube: ')+esc(v.title||'Trailer')+'">'+thumb+'</a>';
        return '<article class="mi-trailer-card"><div class="mi-trailer-preview">'+player+'</div>'+
          '<div class="mi-trailer-body"><div class="mi-trailer-tags"><span class="'+(v.official?'':'mi-warning-source')+'">'+label+'</span>'+ (v.type&&v.type!=='Search'?'<span>'+esc(v.type)+'</span>':'')+'</div>'+
          '<strong>'+esc(v.title||'Trailer')+'</strong><small>'+esc(v.channel||'YouTube')+(views?' · '+esc(views):'')+'</small>'+
          '<div class="mi-insight-links">'+a(v.url,'YouTube')+'</div></div></article>';
      }).join('')+'</div></section>';
  }
  function discover(d){
    const rows=Array.isArray(d.news)?d.news:[],suggestions=Array.isArray(d.suggestions)?d.suggestions:[];
    return trailerGallery(d)+
      '<section class="mi-insight-block"><div class="mi-insight-head"><h3>'+t('媒体报道 · 资讯雷达','Editorial coverage · news radar')+'</h3><span class="mi-tech-tag">The Guardian</span></div>'+
      '<p class="mi-caption">'+t('按作品原名匹配影视报道，显示摘要与来源日期；同名作品仍需人工核对。','Title-matched film coverage with date and preview. Same-name works still need verification.')+'</p>'+
      (rows.length?'<div class="mi-insight-news mi-editorial-grid">'+rows.map(x=>{
        const image=safe(x.thumbnail);
        return '<article class="mi-editorial-card">'+(image?'<img src="'+esc(image)+'" loading="lazy" decoding="async" alt="" referrerpolicy="no-referrer">':'')+
          '<div class="mi-editorial-body"><span>'+esc(x.section||'The Guardian')+' · '+esc(format(x.date))+'</span>'+
          '<strong>'+a(x.url,x.title)+'</strong>'+(x.summary?'<p>'+esc(x.summary)+'</p>':'')+
          (x.byline?'<small>'+esc(x.byline)+'</small>':'')+'</div></article>';
      }).join('')+'</div>':
        '<p class="mi-caption">'+t('本片暂无匹配的 Guardian 文章，其他资讯与推荐仍可使用。','No matching Guardian stories; other recommendations remain available.')+'</p>')+'</section>'+
      '<details class="mi-world-news"><summary>'+t('展开电影世界资讯 · Guardian 最新影视报道','Explore the wider film world · Guardian latest')+'</summary>'+
      '<p class="mi-caption">'+t('以下是全球电影资讯，并非当前作品的相关新闻。按需加载，节省接口请求。','General film headlines, not necessarily related to this title. Loaded on demand.')+'</p>'+
      '<div class="mi-world-news-list" aria-live="polite"></div></details>'+
      (suggestions.length?'<section class="mi-insight-block"><div class="mi-insight-head"><h3>'+t('相似题材探索','Similar-title discovery')+'</h3><span class="mi-tech-tag">TasteDive</span></div>'+
        '<p class="mi-caption">'+t('以下仅是名称级推荐，不代表本站已确认作品 ID，暂不与电影档案自动合并。','Name-only suggestions; identities have not been matched to site titles.')+'</p>'+
        '<div class="mi-suggestion-list">'+suggestions.slice(0,5).map(x=>'<span>'+esc(x.title)+'</span>').join('')+'</div></section>':'');
  }
  async function displayBoxOfficeArchive(info,target){
    // Open Box Office Archive public lookup is indexed by the exact TMDB ID.
    const id=Number(info.tmdbId);
    if(info.kind!=='movie'||!Number.isSafeInteger(id)||id<1||id>9999999999)return;
    const host=document.createElement('section');
    host.className='mi-insight-block mi-archive-panel';
    host.innerHTML='<p class="mi-caption">'+t('正在核查北美历史票房档案…','Checking historical North American grosses…')+'</p>';
    target.appendChild(host);
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
    target.appendChild(host);
    try{
      const snapshot=await sourceSnapshot();
      const cached=snapshotFresh(snapshot?.mal)?snapshot.mal.items?.[String(id)]:null;
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
  async function display(info){
    if(!info||!['ratings','profile','people','boxoffice','discover'].includes(info.section))return;
    const target=root.querySelector('#media-dialog .mi-detail-content');
    if(!target)return;
    if(['ratings','profile'].includes(info.section)&&Number.isSafeInteger(Number(info.malId))&&Number(info.malId)>0)displayMAL(info,target);
    if(info.section==='boxoffice')displayBoxOfficeArchive(info,target);
    if(info.section==='ratings'||info.kind==='anime')return;
    const kind=info.kind==='tv'?'tv':info.kind==='movie'?'movie':null;
    const id=Number(info.tmdbId);
    const pane=document.createElement('div');pane.className='mi-insight-host';
    pane.dataset.miInsight=String(info.id)+':'+info.section;
    target.appendChild(pane);
    if(!kind||!Number.isSafeInteger(id)||id<1){
      pane.innerHTML='<p class="mi-caption">'+t('未建立准确的 TMDB ID，暂不自动关联外部数据。','No verified TMDB identity; external data will not be merged.')+'</p>';
      return;
    }
    pane.innerHTML='<p class="mi-caption">'+t('正在核对补充数据…','Checking verified external data…')+'</p>';
    try{
      const data=await get(kind,id,info.section==='discover');
      if(!pane.isConnected||data.ok!==true||data.kind!==kind||data.tmdbId!==id)return;
      let enriched=data;
      if(info.section==='discover'&&!(Array.isArray(data.suggestions)&&data.suggestions.length)){
        const snapshot=await sourceSnapshot();
        const extra=snapshotFresh(snapshot?.tastedive)?snapshot.tastedive.items?.[info.id]:null;
        const localName=String(info.originalTitle||info.title||'').normalize('NFKC').trim().toLowerCase();
        if(extra?.queried_title&&extra.queried_title.normalize('NFKC').trim().toLowerCase()===localName&&Array.isArray(extra.suggestions))
          enriched={...data,suggestions:extra.suggestions};
      }
      if(!pane.isConnected)return;
      pane.innerHTML=info.section==='profile'?profile(enriched):info.section==='people'?people(enriched):info.section==='boxoffice'?boxoffice(enriched):discover(enriched);
    }catch{
      if(pane.isConnected)pane.innerHTML='<p class="mi-caption">'+t('补充接口暂不可用，已有作品资料仍可正常查看。','Optional insights are unavailable. Core title data remains available.')+'</p>';
    }
  }
  // Collapsed global source registry: clarify what each API actually supplies.
  const registry=document.createElement('details');
  registry.className='mi-source-registry';
  const domains=[
    ['评分','Ratings','TMDB · IMDb/OMDb · MDBList · Trakt · TVmaze · Bangumi · AniList · Simkl · Kitsu · Bilibili · Filmarks · Maoyan · Douban · Taopiaopiao'],
    ['影视资料','Metadata','TMDB · TVmaze · TheTVDB · Fanart.tv · MyAnimeList v2 (verified anime ID)'],
    ['人物关系','People','TMDB Credits · Wikidata (verified cross-ID)'],
    ['票房','Box office','OMDb (US) · Box Office Archive · Maoyan (CN) · KOFIC (KR) · CN third-party aggregate'],
    ['播放渠道','Streaming','Watchmode · JustWatch via TMDB · OpenSubtitles · assrt.net'],
    ['资讯推荐','Discover','TMDB · YouTube Data v3 · The Guardian · TasteDive (optional)']
  ];
  function registryUI(){
    registry.innerHTML='<summary>'+t('六类数据源与分工','Six data domains & sources')+'</summary>'+
      '<p class="mi-caption">'+t('接口已部署不代表每部作品都有数据；第三方实验来源与官方 API 分开标识。','An installed API does not guarantee title coverage. Experimental sources remain separate from official APIs.')+'</p>'+
      '<div class="mi-source-registry-grid">'+domains.map(([zh,en,sources])=>'<div><b>'+t(zh,en)+'</b><span>'+esc(sources)+'</span></div>').join('')+'</div>';
  }
  registryUI();
  const health=root.querySelector('.mi-health');
  if(health)health.before(registry);
  new MutationObserver(registryUI).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});

  root.addEventListener('click',ev=>{
    const button=ev.target.closest('button[data-mi-play-video]');
    if(!button)return;
    const id=button.dataset.miPlayVideo;
    if(!/^[A-Za-z0-9_-]{11}$/.test(id))return;
    const host=button.closest('.mi-trailer-preview');
    if(!host)return;
    const frame=document.createElement('iframe');
    frame.title=t('YouTube 预告片播放器','YouTube trailer player');
    frame.src='https://www.youtube-nocookie.com/embed/'+id+'?rel=0';
    frame.loading='lazy';
    frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.referrerPolicy='strict-origin-when-cross-origin';
    frame.allowFullscreen=true;
    host.replaceChildren(frame);
  });
  root.addEventListener('toggle',async e=>{
    if(!e.target.matches('.mi-world-news')||!e.target.open)return;
    const pane=e.target.querySelector('.mi-world-news-list');
    if(!pane||pane.dataset.loading==='1'||pane.dataset.loaded==='1')return;
    pane.dataset.loading='1';
    pane.textContent=t('正在读取 Guardian 电影资讯…','Loading Guardian film coverage…');
    try{
      const d=await filmNewsFeed();
      if(!pane.isConnected)return;
      if(d.status==='not_configured'){
        pane.textContent=t('Guardian API 暂未配置。','Guardian API is not configured.');
        pane.dataset.loaded='1';return;
      }
      if(d.ok!==true||!Array.isArray(d.articles))throw Error('news_not_available');
      pane.innerHTML=d.articles.length?'<div class="mi-editorial-grid">'+d.articles.slice(0,6).map(x=>{
        const picture=safe(x.thumbnail);
        return '<article class="mi-editorial-card">'+(picture?'<img src="'+esc(picture)+'" loading="lazy" decoding="async" alt="" referrerpolicy="no-referrer">':'')+
          '<div class="mi-editorial-body"><span>'+esc(x.section||'Film')+' · '+esc(format(x.date))+'</span>'+
          '<strong>'+a(x.url,x.title)+'</strong>'+(x.summary?'<p>'+esc(x.summary)+'</p>':'')+(x.byline?'<small>'+esc(x.byline)+'</small>':'')+'</div></article>';
      }).join('')+'</div>':'<p class="mi-caption">'+t('暂时没有可用的电影资讯。','No film headlines are available.')+'</p>';
      pane.dataset.loaded='1';
    }catch{if(pane.isConnected)pane.innerHTML='<p class="mi-caption">'+t('电影资讯暂不可用，可稍后重新展开。','Film news is temporarily unavailable. Try expanding again later.')+'</p>';}
    finally{if(pane.isConnected)delete pane.dataset.loading;}
  },true);
  root.addEventListener('liangyou:media-detail',ev=>display(ev.detail));
  root.addEventListener('toggle',async e=>{
    if(!e.target.matches('.mi-rankings-drawer')||!e.target.open)return;
    const pane=e.target.querySelector('.mi-kr-boxoffice');if(!pane||pane.dataset.loaded)return;
    pane.dataset.loaded='1';pane.textContent=t('读取 KOFIC…','Loading KOFIC…');
    try{
      let d=null;
      // Prefer a verified, recent GitHub Actions snapshot when Cloudflare-to-KOFIC is blocked.
      try{
        const r=await fetch('./data/kofic-boxoffice.json',{cache:'no-cache',signal:AbortSignal.timeout(6000)});
        if(r.ok){
          const x=await r.json(),age=Date.now()-Date.parse(x.checkedAt);
          if(x.ok===true&&x.status==='ok'&&/^\d{8}$/.test(x.date)&&Array.isArray(x.data)&&x.data.length>=3&&age>=0&&age<72*3600000)d=x;
        }
      }catch{}
      if(!d)d=await json('/api/kobis/daily');
      if(!pane.isConnected)return;
      if(d.status==='not_configured'){pane.textContent=t('KOFIC 凭证尚未配置；不展示猜测票房。','KOFIC key is not configured; no guessed chart.');return;}
      if(d.ok!==true||!Array.isArray(d.data)||d.status!=='ok')throw Error('invalid');
      pane.innerHTML='<p class="mi-caption">'+esc(d.date)+' · '+t('韩国单日票房 / 韩元','Korean daily box office / KRW')+'</p>'+
        '<ol>'+d.data.slice(0,8).map(x=>'<li><b>'+esc(x.title)+'</b><small>'+t('当日观众 ','Daily admissions ')+esc(x.audience==null?'—':x.audience.toLocaleString())+'</small></li>').join('')+'</ol>';
    }catch{if(pane.isConnected){pane.dataset.loaded='';pane.textContent=t('KOFIC 榜单暂时不可用。','KOFIC chart unavailable.');}}
  },true);
})();
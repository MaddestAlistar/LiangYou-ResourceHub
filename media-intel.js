/* Film intelligence v2: canonical public records and a private browser-local list. */
(() => {
  'use strict';
  const root=document.querySelector('#media'),core=window.LiangYouMedia;
  if(!root||!core)return;
  const $=s=>root.querySelector(s);
  let data=null,cat={works:{},aliases:{}},tab='movies',source='all',day='',query='',page=0;
  let activeId='',detailTab='ratings',activeEpisode=null,loadFailed=false,list=[],listFilter='all',storageError=false;
  let language=document.documentElement.lang.startsWith('en')?'en':'zh';
  let usingCachedSnapshot=false;
  const store=core.createStore({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)});
  const text=(zh,en)=>language==='en'?en:zh;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const url=v=>{try{const u=new URL(v,location.href);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?esc(u.href):'';}catch{return '';}};
  const link=(href,label,cls='')=>url(href)?`<a class="${cls}" href="${url(href)}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true"> ↗</span></a>`:'';
  const format=v=>v&&!Number.isNaN(Date.parse(v))?new Intl.DateTimeFormat(language==='en'?'en-GB':'zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)):'—';
  const dateKey=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
  const title=i=>language==='en'?(i.english_title||i.original_title||i.title):i.title;
  const saved=id=>list.find(e=>core.resolve(e.work,cat)===id);
  const statusName=s=>({want:text('想看','Want to watch'),watching:text('在看','Watching'),watched:text('看完','Watched')})[s]||'';
  const workFor=i=>cat.works[cat.aliases[i.work_id||i.id]||i.work_id||i.id]||i;
  const activeWork=()=>cat.works[activeId]||saved(activeId)?.work;
  const tabs=[['movies','热门电影','Movies'],['series','热门剧集','Series'],['calendar','追剧日历','Calendar'],['anime','动漫新番','Anime'],['upcoming','即将上映','Coming soon'],['library','我的片单','My list']];
  const choices=()=>tab==='calendar'?['tvmaze']:tab==='anime'?['all','bangumi','anilist','simkl']:tab==='upcoming'?['tmdb']:['all','tmdb','trakt','simkl'];
  const stale=s=>s.status!=='ok'||!s.updated_at||Date.now()-Date.parse(s.updated_at)>(s.interval_hours||6)*7200000;
  const poster=i=>`<div class="mi-poster">${i.poster?`<img src="${url(i.poster)}" alt="${esc(title(i))}" loading="lazy" decoding="async" width="342" height="513">`:'<span aria-hidden="true">✦</span>'}</div>`;
  const scoreValue=r=>Number.isFinite(r.value)&&r.scale ? `${r.source==='MyAnimeList'?r.value.toFixed(2):r.scale<=10?r.value.toFixed(1):r.value}${['Rotten Tomatoes','RT Audience'].includes(r.source)?'%':'/'+r.scale}` : r.display||'—';
  const scores=(i,limit=3)=>(i.ratings||[]).slice(0,limit).map(r=>`<span class="mi-rating"><b>${esc(r.source==='Internet Movie Database'?'IMDb':r.source)}</b> ${esc(scoreValue(r))}</span>`).join('');
  // Films use regional TMDB classifications; anime uses exact-ID
  // AniList/Bangumi/MAL metadata. MAL is advisory, NOT a legal age certificate.
  function classificationData(work){
    const p=work?.profile||{},anime=work?.kind==='anime';
    const cleanList=values=>Array.isArray(values)?[...new Set(values.filter(v=>typeof v==='string')
      .map(v=>v.trim()).filter(v=>v.length>=2&&v.length<=48))]:[];
    const zhGenres={
      'Action':'动作','Adventure':'冒险','Comedy':'喜剧','Drama':'剧情',
      'Fantasy':'奇幻','Sci-Fi':'科幻','Science Fiction':'科幻','Mystery':'悬疑',
      'Romance':'恋爱','Slice of Life':'日常','Supernatural':'超自然',
      'Suspense':'悬念','Thriller':'惊悚','Horror':'恐怖','Sports':'运动',
      'Music':'音乐','Psychological':'心理','Historical':'历史',
      'Mecha':'机甲','Mahou Shoujo':'魔法少女','Magic':'魔法',
      'Isekai':'异世界','Reincarnation':'转生','Detective':'侦探',
      'Shounen':'少年','Shoujo':'少女','Seinen':'青年','Josei':'女性向',
      'Martial Arts':'武术','Military':'军事','School':'校园',
      'School Life':'校园','Super Power':'超能力','Superpowers':'超能力',
      'Space':'太空','Space Opera':'太空歌剧','Pirates':'海盗',
      'Found Family':'伙伴羁绊','Ensemble Cast':'群像','Coming of Age':'成长',
      'Swordplay':'剑术','Travel':'旅行','Survival':'生存','Family':'家庭',
      'Mythology':'神话','Demons':'恶魔','Tragedy':'悲剧',
      'Time Travel':'时间旅行','Crime':'犯罪','Politics':'政治',
      'Urban Fantasy':'都市奇幻','Post-Apocalyptic':'末日后','Robots':'机器人'
    };
    const localTag=value=>anime?text(zhGenres[value]||value,value):value;
    const genres=cleanList(p.genres).map(localTag).slice(0,6);
    const keywords=cleanList(p.keywords).map(localTag)
      .filter(v=>!genres.some(g=>g.toLocaleLowerCase()===v.toLocaleLowerCase())).slice(0,6);
    const age=p.parental_rating;
    const tmdbValid=age&&age.source==='TMDB'&&
      ['CN','HK','TW','US','GB','AU','SG','JP','KR'].includes(age.country)&&
      typeof age.rating==='string'&&/^[A-Za-z0-9+ /-]{1,14}$/.test(age.rating)&&
      !['NR','N/R','UNRATED','NOT RATED','NONE','NA','N/A'].includes(age.rating.toUpperCase());
    const malValid=anime&&age?.source==='MAL'&&
      ['G','PG','PG-13','R-17+','R+','Rx'].includes(age.rating);
    return {anime,genres,keywords,genreSource:anime?p.anime_genre_source||'':'',
      themeSource:anime?p.anime_theme_source||'':'',
      age:malValid?{country:'MAL',rating:age.rating,source:'MAL'}:
        tmdbValid?{country:age.country,rating:age.rating,source:'TMDB'}:null};
  }
  function classificationCard(work){
    const d=classificationData(work);
    const labels=[...d.genres.slice(0,2),...d.keywords.slice(0,d.genres.length?1:2)];
    if(!labels.length&&!d.age)return '';
    return '<div class="mi-card-classification">'+labels.map((tag,i)=>
      '<span class="mi-tag-pill'+(i>=Math.min(2,d.genres.length)?' mi-keyword-pill':'')+'">'+esc(tag)+'</span>').join('')+
      (d.age?'<span class="mi-age-pill">'+esc(text('家长指南','Parental guide'))+' · '+esc(d.age.country)+' '+esc(d.age.rating)+'</span>':'')+'</div>';
  }
  function classificationDetail(work){
    const d=classificationData(work);
    if(!d.anime&&!d.genres.length&&!d.keywords.length&&!d.age)return '';
    const genres=d.genres.length?'<div class="mi-classification-group"><small>'+
      (d.anime?text('作品类型','Genres'):text('影片类型','Genres'))+
      '</small><div class="mi-classification-pills">'+d.genres.map(v=>
      '<span class="mi-tag-pill">'+esc(v)+'</span>').join('')+'</div>'+'</div>':
      (d.anime?'<div class="mi-classification-group"><small>'+text('作品类型','Genres')+
      '</small><p class="mi-caption">'+text('暂未收录可核验的作品类型。','No verified genres yet.')+'</p></div>':'');
    const keywords=d.keywords.length?'<div class="mi-classification-group"><small>'+
      text('主题标签','Theme tags')+'</small><div class="mi-classification-pills">'+
      d.keywords.map(v=>'<span class="mi-tag-pill mi-keyword-pill">'+esc(v)+'</span>').join('')+'</div>'+'</div>':
      (d.anime?'<div class="mi-classification-group"><small>'+text('主题标签','Theme tags')+
      '</small><p class="mi-caption">'+text('暂未收录可核验的主题标签。','No verified theme tags yet.')+'</p></div>':'');
    const age=d.anime?'<div class="mi-classification-group mi-parental-guide"><small>'+
      text('家长指南','Parental guide')+'</small>'+
      (d.age?'<div class="mi-classification-pills"><span class="mi-age-pill">MAL · '+esc(d.age.rating)+'</span></div>'+
        '<p class="mi-caption">'+text('MyAnimeList 内容适宜性分类，仅供参考，并非国家或地区官方年龄分级，也不代表完整内容警示。',
          'MyAnimeList suitability category only; not an official national age rating or comprehensive content advisory.')+'</p>':
        '<p class="mi-caption">'+text('尚无可核验的内容分级，不代表适合所有年龄。','No verified content suitability rating yet; this does not mean suitable for all ages.')+'</p>')+
      '</div>':d.age?'<div class="mi-classification-group mi-parental-guide"><small>'+
      text('家长指南 · 地区分级','Parental guide · Regional classification')+
      '</small><div class="mi-classification-pills"><span class="mi-age-pill">'+
      esc(d.age.country)+' · '+esc(d.age.rating)+'</span></div><p class="mi-caption">'+
      text('来源：TMDB 收录的地区分级，仅供参考；不同国家标准不同，不代表完整内容警示。',
           'TMDB-recorded regional rating for reference only; not a full content advisory. Classifications vary by country.')+'</p></div>':'';
    return '<section class="mi-classification-detail" aria-label="'+
      text(d.anime?'动漫类型、主题标签和家长指南':'影片标签与家长指南',
           d.anime?'Anime genres, themes and parental guidance':'Film tags and parental guidance')+
      '">'+genres+keywords+age+'</section>';
  }
  function notify(message,error=false){const n=$('#media-notice');n.hidden=!message;n.textContent=message;n.classList.toggle('mi-error',error);const dn=$('#media-dialog-notice');if(dn){dn.textContent=message;dn.classList.toggle('mi-error',error);}}
  function loadList(){try{list=core.merge(store.read(),[],cat);if(!localStorage.getItem('liangyou.media.migrated.toolkit.v1')){const old=localStorage.getItem('liangyou:media-watchlist:v1');if(old){list=core.merge(list,core.legacy(old),cat);store.write(list);localStorage.setItem('liangyou.media.migrated.toolkit.v1','1');}}storageError=false;}catch{storageError=true;notify(text('无法读取本地片单。请检查浏览器存储设置；已有数据不会被覆盖。','Cannot read your local list. Check browser storage; existing data will not be overwritten.'),true);}}
  function persist(next){
    if(storageError){notify(text('本地存储不可用，请先检查浏览器设置。','Local storage is unavailable. Please check browser settings.'),true);return false;}
    try{store.write(next);list=next;return true;}catch{notify(text('保存失败：浏览器存储空间不足或被禁用。可先导出片单备份。','Could not save: browser storage is full or disabled. Export your list to back it up.'),true);return false;}
  }
  function setStatus(id,status){
    const w=cat.works[id]||saved(id)?.work;if(!w)return;
    const next=list.filter(e=>core.resolve(e.work,cat)!==id);
    if(status)next.unshift({work:core.snapshot(w),status,updated_at:new Date().toISOString()});
    if(next.length>core.LIMIT){notify(text('片单最多保存 1,000 部作品，请先导出备份并整理。','Your list can hold 1,000 titles. Export and organize it first.'),true);return;}
    if(persist(next)){render();if($('#media-dialog').open){if(activeWork())renderDetail();else $('#media-dialog').close();}notify(status?text('已保存到「','Saved to “')+statusName(status)+text('」。','”.'):text('已从片单移除。','Removed from your list.'));}
  }
  function rawItems(){
    if(tab==='library')return list.filter(e=>listFilter==='all'||e.status===listFilter).map(e=>({...cat.works[core.resolve(e.work,cat)]||e.work,work_id:core.resolve(e.work,cat),saved_status:e.status}));
    if(source==='all')return Object.values(cat.works).filter(w=>w.categories?.includes(tab));
    return (data?.sources?.[source]?.items||[]).filter(i=>i.category===tab);
  }
  function metadata(i){
    if(tab==='calendar')return `${format(i.air_at)} · ${i.season!=null?'S'+i.season:''}${i.episode!=null?' E'+i.episode:''}`;
    if(tab==='anime'&&i.air_at)return `${text('下集','Next')} E${i.episode} · ${format(i.air_at)}`;
    if(tab==='anime'&&i.weekday)return text('每周'+['','一','二','三','四','五','六','日'][i.weekday]+'播出',['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i.weekday]+' · Weekly');
    return (i.date||text('日期待定','Date TBA'))+(i.kind==='movie'?text(' · 电影',' · Film'):i.kind==='anime'?text(' · 动漫',' · Anime'):text(' · 剧集',' · Series'));
  }
  function images(){root.querySelectorAll('.mi-poster img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;img.parentElement.classList.add('mi-image-missing');},{once:true}));}
  function render(){
    $('#media-title').textContent=text('影视情报中心','Film & TV Intelligence');
    $('#media-subtitle').textContent=text('发现好作品，留住你的下一部。','Discover something good. Keep your next watch close.');
    $('#media-search-label').textContent=text('片名筛选','Filter titles');
    $('#media-tabs').setAttribute('aria-label',text('影视分类','Film categories'));$('#media-sources').setAttribute('aria-label',text('选择数据来源或片单状态','Choose source or list status'));
    $('#media-search').placeholder=tab==='library'?text('搜索我的片单…','Search my list…'):text('搜索当前分类的片名…','Search titles in this category…');
    $('#media-search').setAttribute('aria-label',text('搜索影视作品','Search film titles'));
    $('#media-tabs').innerHTML=tabs.map(([id,zh,en])=>`<button type="button" data-mi-tab="${id}" aria-pressed="${tab===id}">${text(zh,en)}${id==='library'?` <span class="mi-tab-count">${list.length}</span>`:''}</button>`).join('');
    $('#media-sources').innerHTML=tab==='library'?['all',...core.statuses].map(s=>`<button type="button" data-mi-filter="${s}" aria-pressed="${listFilter===s}">${s==='all'?text('全部','All'):statusName(s)} <span>${list.filter(e=>s==='all'||e.status===s).length}</span></button>`).join(''):choices().map(s=>`<button type="button" data-mi-source="${s}" aria-pressed="${source===s}">${s==='all'?text('汇总','All sources'):esc(data?.sources?.[s]?.name||s)}</button>`).join('');
    $('#media-library-tools').hidden=tab!=='library';
    $('#media-library-note').textContent=text('仅保存在当前浏览器。导出 JSON 可备份，导入会合并片单并保留较新的状态。','Saved only in this browser. Export JSON for backup; imports merge lists and retain the newer status.');
    $('#media-export').textContent=text('导出片单','Export list');$('#media-import').textContent=text('导入片单','Import list');
    $('#media-export').disabled=!list.length;
    $('#media-updated').textContent=usingCachedSnapshot
      ?text('本地快照 · 正在核对最新数据','Local snapshot · Checking current data')
      :(data?text('定时更新 · 北京时间','Scheduled updates · UTC+8'):text('正在读取影视情报…','Loading intelligence…'));
    const s=data?.sources?.[source]||{};
    $('#media-source-status').textContent=tab==='library'?text('按片单更新时间排序','Recently updated first'):source==='all'?(data?text('快照更新：','Snapshot: ')+format(data.checked_at):''):s.status==='unavailable'?text('该来源暂不可用，可切换其他来源。','Source unavailable. Try another source.'):(data?(stale(s)?text('旧快照 · ','Cached snapshot · '):'')+text('数据核对：','Verified: ')+format(s.updated_at):'');
    $('#media-source-status').classList.toggle('mi-stale',source!=='all'&&tab!=='library'&&!!data&&stale(s));
    $('#media-scope').innerHTML=tab==='library'?esc(text('你的观影计划，从这里继续。','Pick up your viewing plans here.')):source==='simkl'?link('https://simkl.com/'+(tab==='movies'?'movies/best-movies':tab==='series'?'tv/best-shows':'anime/best-anime')+'/most-watched/',text('Simkl 本周热门','Simkl Trending This Week')):esc(tab==='calendar'?text('美区电视台与全球流媒体 · 未来 7 天精选 · 北京时间','US TV & global streaming · Selected next 7 days · UTC+8'):tab==='upcoming'?text('TMDB 中国大陆发行信息 · 以官方公布为准','TMDB China release dates · Confirm with distributors'):tab==='anime'?text('连载与新番 · 原站播出时间不等于字幕上线时间','Airing & seasonal anime · Original air times, not subtitle releases'):text('按来源热度收录 · 相同作品已合并 · 评分保留原始口径','Selected by source popularity · Matching titles merged · Original rating scales'));
    let items=rawItems();
    $('#media-days').hidden=tab!=='calendar';
    if(tab==='calendar'){
      const days=Array.from({length:7},(_,n)=>dateKey(Date.now()+n*86400000));if(!days.includes(day))day=days[0];
      $('#media-days').innerHTML=days.map((d,n)=>`<button type="button" data-mi-day="${d}" aria-pressed="${day===d}"><span>${n===0?text('今天','Today'):new Intl.DateTimeFormat(language==='en'?'en':'zh-CN',{weekday:'short',timeZone:'Asia/Shanghai'}).format(new Date(d+'T12:00:00+08:00'))}</span><b>${d.slice(5)}</b><small>${items.filter(i=>i.air_at&&dateKey(i.air_at)===d).length}${text(' 集',' eps')}</small></button>`).join('');
      items=items.filter(i=>i.air_at&&dateKey(i.air_at)===day);
    }else{const seen=new Set();items=items.filter(i=>{const id=workFor(i).id;if(seen.has(id))return false;seen.add(id);return true;});}
    if(query.trim()){const q=query.trim().toLocaleLowerCase();items=items.filter(i=>{const w=workFor(i);return [w.title,w.original_title,w.english_title].some(v=>String(v||'').toLocaleLowerCase().includes(q));});}
    const size=matchMedia('(max-width:760px)').matches?4:8,totalPages=Math.max(1,Math.ceil(items.length/size));page=Math.min(page,totalPages-1);
    $('#media-count').textContent=`${items.length} ${text(tab==='calendar'?'集':'部',tab==='calendar'?'episodes':'titles')}`;
    const visibleItems=items.slice(page*size,page*size+size);
    $('#media-grid').innerHTML=items.length?visibleItems.map((item,index)=>{
      const w=workFor(item),id=w.id,state=saved(id)?.status;
      return `<article class="mi-card"><button type="button" class="mi-card-open" data-mi-open="${esc(id)}" ${tab==='calendar'?`data-mi-episode="${esc(item.id)}"`:''} aria-label="${esc(text('查看详情：','View details: ')+title(w))}">${poster(w)}<span class="mi-rank">${String(page*size+index+1).padStart(2,'0')}</span><div class="mi-card-copy"><h3>${esc(title(w))}</h3><p class="mi-original">${esc(w.original_title!==title(w)?w.original_title:w.title!==title(w)?w.title:'')}</p><p class="mi-meta">${esc(metadata(['calendar','upcoming'].includes(tab)?item:w))}</p>${classificationCard(w)}<div class="mi-scores">${scores(w)}</div><span class="mi-open-label">${text('查看完整情报','Explore title')} <span aria-hidden="true">↗</span></span></div></button><button type="button" class="mi-quick-save ${state?'is-saved':''}" data-mi-save="${esc(id)}" aria-label="${esc((state?statusName(state)+' · ':text('加入想看：','Add to watchlist: '))+title(w))}">${state?'✓ '+statusName(state):text('＋ 想看','＋ Watchlist')}</button></article>`;
    }).join(''):`<div class="mi-empty"><span aria-hidden="true">◇</span><h3>${!data&&tab!=='library'?(loadFailed?text('暂时无法读取影视情报','Unable to load intelligence'):text('情报加载中','Loading…')):query?text('没有匹配的片名','No matching titles'):tab==='library'?text('把下一部想看的作品留在这里','Save your next watch here'):text('暂时没有可展示的情报','No titles available yet')}</h3><p>${tab==='library'?text('在作品卡片点击「＋ 想看」，或在详情中选择观影状态。','Choose “＋ Watchlist” on a card, or set your viewing status in its details.'):query?text('试试原名或切换分类。这里只搜索已收录的作品。','Try the original title or another category. Search covers collected titles.'):text('可切换日期或来源，定时采集会补充数据。','Try another date or source. Scheduled collection will refresh this view.')}</p>${!data&&tab!=='library'?'<button type="button" id="media-retry">'+text('重新加载','Retry')+'</button>':''}</div>`;
    $('#media-page').textContent=`${page+1} / ${totalPages}`;$('#media-prev').disabled=page===0;$('#media-next').disabled=page>=totalPages-1;
    $('#media-prev').textContent=text('上一页','Previous');$('#media-next').textContent=text('下一页','Next');$('#media-pagination').hidden=items.length<=size;
    $('#media-health-title').textContent=text('数据来源与更新状态','Sources & freshness');
    $('#media-health').innerHTML=Object.values(data?.sources||{}).map(s=>`<div><span>${link(s.url,esc(s.name))}</span><span class="${stale(s)?'mi-muted':'mi-ok'}">${s.status==='unavailable'?text('暂不可用','Unavailable'):s.status==='partial'?text('部分更新','Partially updated'):stale(s)?text('保留旧数据','Cached data'):text('已更新','Updated')}</span><time>${format(s.updated_at)}</time></div>`).join('');
    $('#media-attribution').innerHTML=`${link('https://www.themoviedb.org','<img src="./assets/media-tmdb.svg" width="78" height="12" alt="TMDB">')} <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span> ${link('https://www.tvmaze.com/api','TVmaze · CC BY-SA')} ${link('https://www.omdbapi.com','OMDb')} ${link('https://mdblist.com','MDBList')} ${link('https://www.watchmode.com','Watchmode')} ${link('https://assrt.net',text('字幕服务由 assrt.net 提供','Subtitles by assrt.net'))}`;
    images();
    // Notify the optional metadata adapter without blocking cards or pagination.
    root.dispatchEvent(new CustomEvent('liangyou:media-visible',{detail:visibleItems.map(item=>{
      const w=workFor(item),m=/^tmdb-(movie|tv)-([1-9]\d{0,9})$/.exec(w.id||'');
      return {id:w.id,kind:w.kind,tmdbId:w.tmdb_id||m?.[2],
        title:w.title,originalTitle:w.original_title,year:w.date,
        hasKeywords:Array.isArray(w.profile?.keywords)&&w.profile.keywords.length>0,
        hasParentalRating:Boolean(w.profile?.parental_rating?.rating)};
    })}));
  }
  function enrichment(name,w){return (data?.sources?.[name]?.items||[]).find(e=>cat.aliases[e.target_id]===w.id||(w.imdb_id&&w.imdb_id===e.imdb_id));}
  function scorePanel(w){
    return `<section class="mi-detail-block mi-ratings-section"><h3>${text('多站口碑','Across the ratings')}</h3><p class="mi-caption">${text('各站评分尺度与样本不同，独立展示，不计算混合平均分。','Each platform uses its own scale and audience. Scores are shown separately.')}</p><div class="mi-score-grid">${(w.ratings||[]).map(r=>`<div class="mi-score-tile"><span>${esc(r.source)}</span><strong>${esc(scoreValue(r))}</strong><small>${r.votes!=null?esc(new Intl.NumberFormat(language==='en'?'en':'zh-CN').format(r.votes))+text(' 票 · ',' votes · '):''}${esc(r.via||r.source)}${r.checked_at?' · '+format(r.checked_at):''}</small></div>`).join('')||`<p class="mi-caption">${w._loadError?text('此作品资料暂不可用，可稍后再次打开重试。','Title details temporarily unavailable. Reopen to retry.'):w._needsFetch?text('正在读取可信作品资料…','Loading verified title data…'):text('此作品暂未收录评分。','No ratings collected for this title yet.')}</p>`}</div><div data-mi-ratings-slot="exact"></div><div data-mi-ratings-slot="domestic"></div><div data-mi-ratings-slot="mal"></div><div data-mi-ratings-slot="manual"></div></section>`;
  }
  function overview(w){
    const p=w.profile||{},statuses={'Released':['已上映','Released'],'Returning Series':['连载中','Returning series'],'Ended':['已完结','Ended'],'Canceled':['已取消','Canceled'],'In Production':['制作中','In production'],'Post Production':['后期制作','Post-production'],'Planned':['筹备中','Planned']};
    const facts=[[text('上映 / 首播','Release / premiere'),w.date],[text('类型','Genres'),p.genres?.join(' · ')],[text('时长','Runtime'),p.runtime?p.runtime+text(' 分钟',' min'):''],[text('状态','Status'),statuses[p.status]?text(...statuses[p.status]):p.status],[text('地区','Countries'),p.countries?.join(' · ')],[text('语言','Languages'),p.languages?.join(' · ')]];
    return `<section class="mi-detail-block"><h3>${text('作品资料','About this title')}</h3><dl class="mi-facts">${facts.filter(([,v])=>v).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${p.tagline?`<p class="mi-tagline">${esc(p.tagline)}</p>`:''}<p class="mi-overview">${esc(w.overview||text('简介暂缺，请查看资料原站。','No synopsis available. Please visit the source.'))}</p>${p.checked_at?`<p class="mi-caption">TMDB · ${format(p.checked_at)}</p>`:''}</section>`+(w.kind==='movie'?'':`<details class="mi-seasons-drawer"><summary>${text('季集与近期播出','Seasons and airings')}</summary>${episodes(w)}</details>`);
  }
  function peoplePanel(w){
    const p=w.profile||{};
    return `${p.creators?.length||p.cast?.length?`<section class="mi-detail-block"><h3>${text('演职员','Cast & creators')}</h3><div class="mi-people">${(p.creators||[]).map(a=>`<div>${link(a.url,esc(a.name))}<small>${a.role==='Director'?text('导演','Director'):text('主创','Creator')}</small></div>`).join('')}${(p.cast||[]).map(a=>`<div>${link(a.url,esc(a.name))}<small>${esc(a.character)}</small></div>`).join('')}</div></section>`:''}`+collaborationPanel(w);
  }
  function collaborationPanel(w){
    const p=w.profile||{},cast=[...(p.creators||[]),...(p.cast||[])];
    const connections=[];
    for(const person of cast.slice(0,14)){
      if(!/^https:\/\/www\.themoviedb\.org\/person\/[1-9]\d{0,9}$/.test(person.url||""))continue;
      const related=Object.values(cat.works).filter(other=>other.id!==w.id&&
        [...(other.profile?.creators||[]),...(other.profile?.cast||[])].some(a=>a.url===person.url));
      for(const other of related.slice(0,2))if(connections.length<6&&!connections.some(x=>x.id===other.id))connections.push({id:other.id,person:person.name,work:other});
      if(connections.length>=6)break;
    }
    if(!connections.length)return "";
    return '<section class="mi-detail-block"><h3>'+text("同一演职人员的其他作品","Other works with shared credits")+"</h3><p class=\"mi-caption\">"+text("仅按 TMDB 人物 ID 精确关联，不按姓名猜测。","Matched by exact TMDB person ID, not name.")+"</p><div class=\"mi-related\">"+connections.map(x=>"<button type=\"button\" data-mi-related=\""+esc(x.id)+"\">"+esc(title(x.work))+" <small>· "+esc(x.person)+"</small></button>").join("")+"</div></section>";
  }
  function boxOfficePanel(){
    return `<section class="mi-detail-block"><h3>${text("票房情报","Box office")}</h3><p class="mi-caption">${text("单片、国家、币种和统计周期独立展示。","Keep film totals, regions, currencies and periods separate.")}</p></section>
      <div data-mi-boxoffice-slot="mainland"></div>
      <div data-mi-boxoffice-slot="international"></div>
      <div data-mi-boxoffice-slot="archive"></div>`;
  }
  function discoverPanel(w){
    // Keep a stable DOM order: asynchronous international and mainland news may
    // resolve in either order, but never change the section sequence.
    const p=w.profile||{};
    const official=p.videos?.length
      ?`<section class="mi-detail-block mi-official-trailer-fallback"><h3>${text('预告片/相关视频','Trailers / Related videos')}</h3><div class="mi-detail-links">${p.videos.map(v=>link(v.url,'▶ '+esc(v.name))).join('')}</div><p class="mi-caption">${text('原始预告片链接由 TMDB 提供，可在 YouTube 查看。','Original trailer links from TMDB can be opened on YouTube.')}</p></section>`
      :`<section class="mi-insight-block mi-official-trailer-fallback"><h3>${text('预告片','Trailers')}</h3><p class="mi-caption">${text('正在核对可播放的预告片…','Checking available trailers…')}</p></section>`;
    const related=p.related?.length
      ?`<div class="mi-related">${p.related.map(r=>{const target=cat.aliases[r.id]||r.id;return /^tmdb-(?:movie|tv)-[1-9]\d{0,9}$/.test(target)?`<button type="button" data-mi-related="${esc(target)}">${esc(cat.works[target]?title(cat.works[target]):r.title)} <span aria-hidden="true">→</span></button>`:link(r.url,esc(r.title));}).join('')}</div><p class="mi-caption">${text('相关推荐来自 TMDB','Recommendations from TMDB')}</p>`
      :`<p class="mi-caption">${text('暂无可核验的相关作品推荐。','No verified related titles available.')}</p>`;
    return `<div class="mi-discover-slot" data-mi-discover-slot="trailers">${official}</div>
      <div class="mi-discover-slot" data-mi-discover-slot="international"><section class="mi-insight-block"><h3>${text('国际新闻','International news')}</h3><p class="mi-caption">${text('正在核对相关报道…','Checking related coverage…')}</p></section></div>
      <div class="mi-discover-slot" data-mi-discover-slot="domestic"><section class="mi-insight-block"><h3>${text('国内新闻','Chinese news')}</h3><p class="mi-caption">${text('正在核对相关报道…','Checking related coverage…')}</p></section></div>
      <div class="mi-discover-slot" data-mi-discover-slot="related"><section class="mi-detail-block"><h3>${text('还可以看看','More to explore')}</h3>${related}</section></div>
      <div class="mi-discover-slot" data-mi-discover-slot="similar"><section class="mi-insight-block"><h3>${text('相似主题探索','Similar themes')}</h3><p class="mi-caption">${text('正在核对相似题材推荐…','Checking similar themes…')}</p></section></div>`;
  }
  function episodes(w){
    const p=w.profile||{},events=(data?.sources?.tvmaze?.items||[]).filter(e=>cat.aliases[e.id]===w.id&&e.air_at).sort((a,b)=>a.air_at.localeCompare(b.air_at));
    return `<section class="mi-detail-block"><h3>${text('季集资料','Seasons')}</h3><p class="mi-caption">${p.season_count?p.season_count+text(' 季',' seasons'):''}${p.episodes?' · '+p.episodes+text(' 集',' episodes'):''}${w.episodes?text('共 ','Total ')+w.episodes+text(' 集',' episodes'):''}</p><div class="mi-season-grid">${(p.seasons||[]).map(s=>link(s.url,`<b>${esc(s.name||'Season '+s.number)}</b><small>${s.episodes??'—'}${text(' 集',' episodes')} · ${esc(s.date||text('日期待定','Date TBA'))}</small>`)).join('')||`<p class="mi-caption">${text('尚未收录季集目录，可查看下方资料原站。','A season directory has not been collected. Visit a source below.')}</p>`}</div></section><section class="mi-detail-block"><h3>${text('近期播出 · 北京时间','Airings · UTC+8')}</h3>${events.length?`<div class="mi-airings">${events.map(e=>`<div><time>${format(e.air_at)}</time><b>S${e.season??'—'} E${e.episode??'—'}</b><span>${esc(e.episode_title)}</span></div>`).join('')}</div>`:`<p class="mi-caption">${text('未来 7 天精选日历中暂无该作品的播出记录。','No airings for this title in the selected seven-day calendar.')}</p>`}</section>`;
  }
  function watch(w){
    // JustWatch/TMDB's region-aware provider lookup lives in the toolkit below.
    // Do not duplicate a hardcoded US-only Watchmode empty-state above it.
    return `<section class="mi-detail-block"><h3>${text('字幕情报','Subtitle intelligence')}</h3><p class="mi-caption">${text('请核对年份、季集、语言与片源版本。','Check the year, episode, language and release version.')}</p>${['opensubtitles','assrt'].map(s=>{const e=enrichment(s,w);return `<div class="mi-sub-source"><h4>${esc(data?.sources?.[s]?.name||s)}</h4>${e?`<p class="mi-caption">${text('检索时间','Checked')} ${format(e.checked_at)}</p>`:''}${e?.results?.length?e.results.map(r=>link(r.url,`${esc(r.title)}<small>${esc(r.language)}</small>`)).join(''):`<p class="mi-caption">${e?text('本次检索未返回匹配结果','No matching results in this check'):text('此片尚未建立字幕快照','No subtitle snapshot for this title')}</p>`}</div>`;}).join('')}<div class="mi-detail-links">${link('https://assrt.net/sub/?searchword='+encodeURIComponent(w.original_title||w.title),text('伪射手网继续搜索','Search on assrt.net'))}${link('https://www.opensubtitles.com',text('打开 OpenSubtitles','Open OpenSubtitles'))}</div></section>`;
  }
  function renderDetail(){
    const w=activeWork();if(!w)return;const state=saved(w.id)?.status;
    $('#media-dialog-close').textContent=text('关闭','Close');
    $('#media-dialog-body').innerHTML=`<div class="mi-detail-head">${poster(w)}<div><p class="mi-kicker">${text('作品档案','TITLE DOSSIER')} · ${esc(w.date?.slice(0,4)||'')}</p><h2 id="media-dialog-title">${esc(title(w))}</h2><p class="mi-original">${esc(w.original_title!==title(w)?w.original_title:'')}</p><div class="mi-detail-actions" role="group" aria-label="${text('观影状态','Viewing status')}">${core.statuses.map(s=>`<button type="button" data-mi-status="${s}" aria-pressed="${state===s}">${state===s?'✓ ':''}${statusName(s)}</button>`).join('')}${state?`<button type="button" data-mi-remove>${text('移除','Remove')}</button>`:''}<button type="button" id="media-share">${text('复制链接','Copy link')}</button></div><p class="mi-caption">${text('片单仅保存在当前浏览器','Your list stays in this browser')}</p><p id="media-dialog-notice" class="mi-notice" role="status"></p></div></div>${classificationDetail(w)}${!cat.works[w.id]?`<p class="mi-caption">${text('此作品已离开当前榜单，显示你收藏时保存的资料。','This title has left the current snapshot. Showing the details saved in your list.')}</p>`:''}${activeEpisode?`<p class="mi-episode-banner">${format(activeEpisode.air_at)} · S${activeEpisode.season??'—'} E${activeEpisode.episode??'—'} · ${esc(activeEpisode.episode_title)}</p>`:''}<div class="mi-detail-nav" role="group" aria-label="${text('详情分类','Detail sections')}">${[['ratings','评分','Ratings'],['profile','影视资料','Details'],['people','人物关系','People'],['boxoffice','票房','Box office'],['watch','播放渠道','Watch'],['discover','资讯推荐','Discover']].map(([id,zh,en])=>`<button type="button" data-mi-detail="${id}" aria-pressed="${detailTab===id}">${text(zh,en)}</button>`).join('')}</div><div class="mi-detail-content">${detailTab==='ratings'?scorePanel(w):detailTab==='profile'?overview(w):detailTab==='people'?peoplePanel(w):detailTab==='boxoffice'?boxOfficePanel(w):detailTab==='discover'?discoverPanel(w):watch(w)}</div>${detailTab==='boxoffice'&&w.kind==='movie'?'<section id="media-boxoffice-rankings" class="mi-independent-rankings" aria-label="'+text('独立票房排行榜','Independent box-office charts')+'"></section>':''}<section class="mi-detail-block"><h3>${text('资料来源','Sources')}</h3><div class="mi-detail-links">${(w.links||[]).filter((l,n,arr)=>arr.findIndex(x=>x.name===l.name)===n).map(l=>link(l.url,esc(l.name))).join('')}${w.imdb_id?link('https://www.imdb.com/title/'+w.imdb_id+'/','IMDb'):''}${w.mal_id?link('https://myanimelist.net/anime/'+w.mal_id,'MyAnimeList'):''}</div><details class="mi-identity"><summary>${text('作品标识','Work identifiers')}</summary><code>${esc(w.id)}</code>${w.imdb_id?'<code>'+esc(w.imdb_id)+'</code>':''}</details></section>`;
    root.dispatchEvent(new CustomEvent('liangyou:media-detail',{detail:{id:w.id,title:title(w),originalTitle:w.original_title,year:w.date,kind:w.kind,tmdbId:w.tmdb_id||(/^tmdb-(?:movie|tv)-(\d+)$/.exec(w.id)||[])[1],imdbId:w.imdb_id,malId:w.mal_id,poster:w.poster||null,aliases:(w.aliases||[]).filter(x=>typeof x==='string').slice(0,50),section:detailTab}}));
    images();
  }
  async function hydrateRelated(id){
    const m=/^tmdb-(movie|tv)-([1-9]\d{0,9})$/.exec(id),w=cat.works[id];
    if(!m||!w||!w._needsFetch||w._loading)return;
    w._loading=true;
    try{
      const response=await fetch('https://liangyou-streaming-availability.maddestalistar.workers.dev/api/title/'+m[1]+'/'+m[2],{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('unavailable');
      const v=await response.json();
      if(v.ok!==true||v.id!==id||v.kind!==m[1]||v.tmdb_id!==Number(m[2])||typeof v.title!=='string'||!v.title)throw Error('id_mismatch');
      const previousProfile=w.profile||{},incomingProfile=v.profile||{};
      cat.works[id]={...w,...v,id,kind:m[1],categories:[],
        profile:{...previousProfile,...incomingProfile,
          keywords:previousProfile.keywords?.length?previousProfile.keywords:(incomingProfile.keywords||[]),
          parental_rating:previousProfile.parental_rating||incomingProfile.parental_rating||null},
        ratings:Array.isArray(v.ratings)?v.ratings:[],links:[{name:'TMDB',url:'https://www.themoviedb.org/'+m[1]+'/'+m[2]}],_needsFetch:false};
    }catch{w._loadError=true;}
    finally{if(cat.works[id])cat.works[id]._loading=false;if(activeId===id&&$('#media-dialog').open)renderDetail();}
  }
  function openDetails(id,episodeId){
    const target=cat.aliases[id]||id;
    if(!cat.works[target]&&!saved(target)){
      const match=/^tmdb-(movie|tv)-([1-9]\d{0,9})$/.exec(target);
      if(!match)return;
      const recommendation=activeWork()?.profile?.related?.find(r=>r.id===target);
      cat.works[target]={id:target,kind:match[1],tmdb_id:Number(match[2]),categories:[],
        title:recommendation?.title||text('正在加载作品资料…','Loading title…'),original_title:'',
        overview:'',poster:'',date:'',ratings:[],profile:{},
        links:[{name:'TMDB',url:'https://www.themoviedb.org/'+match[1]+'/'+match[2]}],_needsFetch:true};
      cat.aliases[target]=target;
    }
    activeId=target;activeEpisode=episodeId?(data?.sources?.tvmaze?.items||[]).find(i=>i.id===episodeId):null;detailTab='ratings';
    renderDetail();const d=$('#media-dialog');if(!d.open)d.showModal();d.scrollTop=0;
    const u=new URL(location.href);u.searchParams.set('film',activeId);u.hash='media';history.replaceState(null,'',u);
    if(cat.works[target]?._needsFetch)hydrateRelated(target);
  }
  root.addEventListener('liangyou:media-classification',ev=>{
    const d=ev.detail;
    if(!d||!['movie','tv'].includes(d.kind))return;
    const w=cat.works[d.id],m=/^tmdb-(movie|tv)-([1-9]\d{0,9})$/.exec(d.id);
    if(!w||w.kind!==d.kind||Number(w.tmdb_id||m?.[2])!==Number(d.tmdbId))return;
    const before=classificationData(w);
    const incoming=classificationData({profile:d.classification});
    const genres=before.genres.length?before.genres:incoming.genres;
    const keywords=before.keywords.length?before.keywords:incoming.keywords;
    const parental_rating=before.age?w.profile.parental_rating:incoming.age?d.classification.parental_rating:null;
    if(!genres.length&&!keywords.length&&!parental_rating)return;
    if(JSON.stringify({genres,keywords,parental_rating})===
       JSON.stringify({genres:before.genres,keywords:before.keywords,parental_rating:w.profile?.parental_rating||null}))return;
    w.profile={...(w.profile||{}),genres,keywords,parental_rating};
    // Patch just the matching visible card. Re-rendering the entire grid on
    // every asynchronous Worker reply can interrupt taps and scroll position.
    const card=[...root.querySelectorAll('.mi-card-open')].find(node=>node.dataset.miOpen===d.id);
    const current=card?.querySelector('.mi-card-classification');
    const markup=classificationCard(w);
    if(current){if(markup)current.outerHTML=markup;else current.remove();}
    else if(markup)card?.querySelector('.mi-meta')?.insertAdjacentHTML('afterend',markup);
    const dialog=$('#media-dialog');
    if(!dialog?.open||d.id!==activeId)return;
    const view=classificationDetail(w),old=dialog.querySelector('.mi-classification-detail');
    if(old)old.outerHTML=view;
    else if(view)dialog.querySelector('.mi-detail-head')?.insertAdjacentHTML('afterend',view);
  });
  function closeDetails(){const u=new URL(location.href);u.searchParams.delete('film');history.replaceState(null,'',u);activeEpisode=null;}
  async function share(){
    const u=new URL(location.href);u.searchParams.set('film',activeId);u.hash='media';
    try{await navigator.clipboard.writeText(u.href);notify(text('作品链接已复制。','Title link copied.'));}
    catch{const n=$('#media-dialog-notice');n.textContent=text('可复制地址栏中的作品链接。','You can copy the title link from the address bar.');}
  }
  function exportList(){
    const blob=new Blob([core.backup(list)],{type:'application/json'}),href=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=href;a.download='liangyou-watchlist-'+dateKey(Date.now())+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),4000);
    notify(text('片单已导出为 JSON。','Your list has been exported as JSON.'));
  }
  $('#media-import-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{if(file.size>2000000)throw Error('too_large');const incoming=core.parseBackup(await file.text()),next=core.merge(list,incoming,cat);if(persist(next)){render();notify(text('片单已合并，共 ','Lists merged: ')+next.length+text(' 部作品。',' titles.'));}}
    catch{notify(text('无法导入：请选择本站导出的有效 JSON 片单（最多 1,000 部、2 MB）。原有片单未改变。','Import failed. Use a valid exported JSON list (up to 1,000 titles and 2 MB). Your list is unchanged.'),true);}
  });
  root.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.miTab){tab=b.dataset.miTab;source=choices()[0];page=0;query='';$('#media-search').value='';notify('');render();}
    if(b.dataset.miSource){source=b.dataset.miSource;page=0;render();}
    if(b.dataset.miFilter){listFilter=b.dataset.miFilter;page=0;render();}
    if(b.dataset.miDay){day=b.dataset.miDay;page=0;render();}
    if(b.dataset.miOpen)openDetails(b.dataset.miOpen,b.dataset.miEpisode);
    if(b.dataset.miRelated)openDetails(b.dataset.miRelated);
    if(b.dataset.miSave){if(saved(b.dataset.miSave))openDetails(b.dataset.miSave);else setStatus(b.dataset.miSave,'want');}
    if(b.dataset.miStatus)setStatus(activeId,b.dataset.miStatus);
    if(b.hasAttribute('data-mi-remove'))setStatus(activeId,null);
    if(b.dataset.miDetail){detailTab=b.dataset.miDetail;renderDetail();const d=$('#media-dialog');if(d.open)d.scrollTop=0;}
    if(b.id==='media-share')share();
    if(b.id==='media-export')exportList();if(b.id==='media-import')$('#media-import-file').click();
    if(b.id==='media-prev'||b.id==='media-next'){page+=b.id==='media-next'?1:-1;render();$('#media-grid').scrollIntoView({block:'nearest'});}
    if(b.id==='media-dialog-close')$('#media-dialog').close();
    if(b.id==='media-retry')load();
  });
  $('#media-dialog').addEventListener('close',closeDetails);
  $('#media-dialog').addEventListener('click',e=>{if(e.target===$('#media-dialog'))$('#media-dialog').close();});
  $('#media-search').addEventListener('input',e=>{query=e.target.value;page=0;render();});
  window.addEventListener('storage',e=>{if(e.key===core.KEY||e.key===null){loadList();render();if($('#media-dialog').open)renderDetail();}});
  new MutationObserver(()=>{const next=document.documentElement.lang.startsWith('en')?'en':'zh';if(next!==language){language=next;render();if($('#media-dialog').open)renderDetail();}}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  const PUBLIC_CACHE_KEY='liangyou.media.public.snapshot.v1';
  const validSnapshot=d=>d?.schema===1&&d.sources&&typeof d.sources==='object'&&
    d.works&&typeof d.works==='object'&&d.aliases&&typeof d.aliases==='object';
  // Reuse exact-ID public anime, MAL and classifications snapshots.
  // Never query provider APIs directly from a visitor's browser.
  let animeIndex=null,malIndex=null,animeClassIndex=null,animeMetadataRequest=null;
  // Curated same-season identity: original Japanese title, 2026 premiere and MAL ID checked.
  // Never infer other adaptation identities from fuzzy translations.
  const safeTags=values=>Array.isArray(values)?[...new Set(values.filter(v=>
    typeof v==='string'&&v.length>=2&&v.length<=48&&!/[<>\x00-\x1f]/.test(v)))].slice(0,6):[];
  function applyAnimeMetadata(){
    if(!cat?.works)return [];
    const changed=[],codes={g:'G',pg:'PG',pg_13:'PG-13',r:'R-17+','r+':'R+',rx:'Rx'};
    for(const w of Object.values(cat.works)){
      if(w?.kind!=='anime')continue;
      const video=animeIndex?.items?.[w.id],extra=animeClassIndex?.items?.[w.id];
      const year=Number(String(w.date||'').slice(0,4));
      const valid=x=>x?.workId===w.id&&x?.kind==='anime'&&
        (!Number.isInteger(year)||year<1900||x.year===year);
      const v=valid(video)?video:null;
      const c=valid(extra)?extra:null;
      if(!v&&!c)continue;
      const malId=Number(c?.malId||v?.malId||w.mal_id||0);
      if(!Number.isSafeInteger(malId)||malId<0||malId>=10**10)continue;
      if(w.mal_id&&malId&&Number(w.mal_id)!==malId)continue;
      if(malId&&!w.mal_id)w.mal_id=malId;
      const record=malId?malIndex?.items?.[String(malId)]:null;
      const malValid=record?.ok===true&&record?.status==='ok'&&record?.malId===malId;
      const old=w.profile||{};
      const provider=x=>['AniList','Bangumi','MAL','Bangumi · AniList'].includes(x)?x:'';
      const rawGenres=safeTags(c?.genres);
      const rawKeywords=safeTags(c?.keywords);
      const genres=rawGenres.length?rawGenres:malValid?safeTags(record.genres):safeTags(old.genres);
      const keywords=rawKeywords.length?rawKeywords:safeTags(old.keywords);
      const officialMalCode=malValid?codes[record.contentRating]:null;
      const snapshotMalCode=c?.parental_rating?.source==='MAL'&&
        ['G','PG','PG-13','R-17+','R+','Rx'].includes(c.parental_rating.rating)?
        c.parental_rating.rating:null;
      const parental_rating=officialMalCode||snapshotMalCode?
        {source:'MAL',rating:officialMalCode||snapshotMalCode}:null;
      const next={...old,genres,keywords,
        anime_genre_source:provider(c?.genreSource)||(malValid&&genres.length?'MAL':''),
        anime_theme_source:provider(c?.themeSource),
        parental_rating};
      let didChange=false;
      if(JSON.stringify(old)!==JSON.stringify(next)){w.profile=next;didChange=true;}
      const additions=[];
      if(malValid&&Number.isFinite(record.score)&&record.score>0&&record.score<=10){
        additions.push({source:'MyAnimeList',value:record.score,scale:10,
          votes:Number.isSafeInteger(record.ratingCount)?record.ratingCount:null,
          via:'MyAnimeList v2',checked_at:malIndex.checkedAt||null});
      }
      if(additions.length){
        const existing=Array.isArray(w.ratings)?w.ratings:[];
        const merged=[...existing];
        for(const r of additions)if(!merged.some(v=>v.source===r.source))merged.push(r);
        if(JSON.stringify(existing)!==JSON.stringify(merged)){w.ratings=merged;didChange=true;}
      }
      if(didChange)changed.push(w.id);
    }
    return changed;
  }
  function patchAnimeTags(changed){
    if(!changed.length)return;
    const ids=new Set(changed);
    for(const card of root.querySelectorAll('.mi-card-open')){
      if(!ids.has(card.dataset.miOpen))continue;
      const w=cat.works[card.dataset.miOpen];
      const markup=classificationCard(w),old=card.querySelector('.mi-card-classification');
      if(old){if(markup)old.outerHTML=markup;else old.remove();}
      else if(markup)card.querySelector('.mi-meta')?.insertAdjacentHTML('afterend',markup);
      const ratingBox=card.querySelector('.mi-scores');
      if(ratingBox)ratingBox.innerHTML=scores(w);
    }
    const dialog=$('#media-dialog');
    if(!dialog?.open||!ids.has(activeId))return;
    const html=classificationDetail(activeWork());
    const old=dialog.querySelector('.mi-classification-detail');
    if(old){if(html)old.outerHTML=html;else old.remove();}
    else if(html)dialog.querySelector('.mi-detail-head')?.insertAdjacentHTML('afterend',html);
    if(detailTab==='ratings'){
      const current=dialog.querySelector('.mi-ratings-section .mi-score-grid');
      if(current){const scratch=document.createElement('div');scratch.innerHTML=scorePanel(activeWork());
        current.replaceWith(scratch.querySelector('.mi-score-grid'));}
    }
  }
  function loadAnimeMetadata(){
    if(animeMetadataRequest)return animeMetadataRequest;
    animeMetadataRequest=Promise.allSettled([
      fetch('./data/media-anime-videos.json',{cache:'no-cache',signal:AbortSignal.timeout(12000)})
        .then(r=>r.ok?r.json():null),
      fetch('./data/media-mal-v2.json',{cache:'no-cache',signal:AbortSignal.timeout(12000)})
        .then(r=>r.ok?r.json():null),
      fetch('./data/media-anime-classification.json',{cache:'no-cache',signal:AbortSignal.timeout(12000)})
        .then(r=>r.ok?r.json():null)
    ]).then(results=>{
      const rows=results.map(r=>r.status==='fulfilled'?r.value:null);
      animeIndex=rows[0]?.schema===1&&rows[0].items?rows[0]:null;
      malIndex=rows[1]?.source==='MyAnimeList v2'&&rows[1].items?rows[1]:null;
      animeClassIndex=rows[2]?.schema===1&&rows[2].items?rows[2]:null;
      patchAnimeTags(applyAnimeMetadata());
    }).catch(()=>{});
    return animeMetadataRequest;
  }
  function acceptSnapshot(snapshot,cached=false){
    if(!validSnapshot(snapshot))throw Error('invalid_media_snapshot');
    data=snapshot;cat=core.mergeAnimeCatalog(core.catalog(snapshot));usingCachedSnapshot=cached;applyAnimeMetadata();loadList();render();
    loadAnimeMetadata();
    const id=new URL(location.href).searchParams.get('film');
    if(id&&!$('#media-dialog').open){
      if(core.validId(id)&&(cat.works[id]||cat.aliases[id]||saved(id)||/^tmdb-(?:movie|tv)-[1-9]\\d{0,9}$/.test(id)))openDetails(id);
      else if(!cached)notify(text('此分享作品已不在当前快照中，可在片单中查看已保存的资料。','This shared title is no longer in the current snapshot. Saved details remain in your list.'));
    }else if(id&&$('#media-dialog').open&&activeWork())renderDetail();
  }
  function restoreCachedSnapshot(){
    try{
      const item=JSON.parse(localStorage.getItem(PUBLIC_CACHE_KEY)||'null');
      const age=Date.now()-Number(item?.savedAt);
      const checked=Date.now()-Date.parse(item?.data?.checked_at||'');
      if(!validSnapshot(item?.data)||!Number.isFinite(age)||age<0||age>12*3600000||
         !Number.isFinite(checked)||checked<0||checked>36*3600000)return false;
      acceptSnapshot(item.data,true);
      return true;
    }catch{return false;}
  }
  function rememberSnapshot(snapshot){
    const save=()=>{
      try{
        const content=JSON.stringify({savedAt:Date.now(),data:snapshot});
        if(content.length<1200000)localStorage.setItem(PUBLIC_CACHE_KEY,content);
      }catch{} // Storage may be disabled or full. Browsing must still work.
    };
    if('requestIdleCallback' in window)requestIdleCallback(save,{timeout:10000});
    else setTimeout(save,1000);
  }
  async function load(){
    loadFailed=false;
    const cached=!!data||restoreCachedSnapshot();
    try{
      let snapshot=window.LiangYouMediaSnapshotPrefetch
        ?await window.LiangYouMediaSnapshotPrefetch:null;
      // If the prefetched request failed, allow one normal network retry.
      if(!snapshot){
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),16000);
        try{
          const response=await fetch('./data/media-intel.json',{cache:'no-cache',signal:controller.signal});
          if(!response.ok)throw Error('media_snapshot_unavailable');
          snapshot=await response.json();
        }finally{clearTimeout(timer);}
      }
      acceptSnapshot(snapshot,false);
      rememberSnapshot(snapshot);
    }catch{
      loadFailed=!cached;
      if(!cached)render();
      $('#media-updated').textContent=cached
        ?text('当前网络暂不可用 · 显示已保存的影视快照','Network unavailable · Showing a saved film snapshot')
        :text('影视情报加载失败，可重试；本地片单仍可查看。','Could not load intelligence. Retry or open your local list.');
    }
  }
  matchMedia('(max-width:760px)').addEventListener('change',()=>{page=0;render();});
  window.LiangYouWatchlist={entries:()=>list.slice()};
  loadList();render();load();
})();

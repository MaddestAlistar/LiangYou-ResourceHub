/* Film & TV Intelligence: static public snapshots, no browser API credentials. */
(() => {
  'use strict';
  const root = document.querySelector('#media');
  if (!root) return;
  const $ = s => root.querySelector(s);
  let loadFailed = false;
  let data = null, tab = 'movies', source = 'tmdb', day = '', query = '', page = 0, active = null;
  let language = document.documentElement.lang.startsWith('en') ? 'en' : 'zh';
  const text = (zh,en) => language === 'en' ? en : zh;
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const url = v => { try { const u = new URL(v,location.href); return ['https:','http:'].includes(u.protocol) && !u.username ? escape(u.href) : ''; } catch { return ''; } };
  const format = v => v && !Number.isNaN(Date.parse(v)) ? new Intl.DateTimeFormat(language==='en'?'en-GB':'zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)) : '—';
  const dateKey = v => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
  const week = v => new Intl.DateTimeFormat(language==='en'?'en':'zh-CN',{timeZone:'Asia/Shanghai',weekday:'short'}).format(new Date(v));
  const tabs = [['movies','热门电影','Movies'],['series','热门剧集','Series'],['calendar','追剧日历','Calendar'],['anime','动漫新番','Anime'],['upcoming','即将上映','Coming soon']];
  const choices = () => tab==='calendar' ? ['tvmaze'] : tab==='anime' ? ['bangumi','anilist','simkl'] : tab==='upcoming' ? ['tmdb'] : ['tmdb','trakt','simkl'];
  const snapshot = () => data?.sources?.[source] || {};
  const items = () => (snapshot().items || []).filter(i=>i.category===tab);
  const stale = s => s.status !== 'ok' || !s.updated_at || Date.now()-Date.parse(s.updated_at) > (s.interval_hours || 6)*7200000;
  const link = (href,label,cls='') => url(href) ? `<a class="${cls}" href="${url(href)}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true"> ↗</span></a>` : '';
  const poster = (i,cls='') => `<div class="mi-poster ${cls}">${i.poster ? `<img src="${url(i.poster)}" alt="${escape(i.title)}" loading="lazy" decoding="async" width="342" height="513">` : '<span aria-hidden="true">✦</span>'}</div>`;
  const scores = i => (i.ratings||[]).map(r=>`<span class="mi-rating"><b>${escape(r.source)}</b> ${r.display ? escape(r.display) : `${escape(Number(r.value).toFixed(1))}<small> /${escape(r.scale)}</small>`}</span>`).join('');
  function title(i) { return language==='en' ? (i.english_title || i.original_title || i.title) : i.title; }
  function metadata(i) {
    if (tab==='calendar') return `${format(i.air_at)} · ${i.season != null ? 'S'+i.season : ''}${i.episode != null ? ' E'+i.episode : ''}`;
    if (tab==='anime' && i.air_at) return `${text('下集','Next')} E${i.episode} · ${format(i.air_at)}`;
    if (tab==='anime' && i.weekday) return language==='en' ? ['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i.weekday]+' · Weekly' : '每周'+['','一','二','三','四','五','六','日'][i.weekday]+'播出';
    return (i.date || text('日期待定','Date TBA')) + (i.kind==='movie' ? text(' · 电影',' · Film') : text(' · 剧集',' · Series'));
  }
  function badges() {
    $('#media-title').textContent=text('影视情报中心','Film & TV Intelligence');
    $('#media-subtitle').textContent=text('今晚看什么，下一集什么时候来。','Find your next watch. Know when the next episode arrives.');
    $('#media-kicker').textContent='LIANGYOU · SCREEN INTELLIGENCE';
    $('#media-search').placeholder=text('搜索当前榜单的片名…','Search titles in this list…');
    $('#media-search').setAttribute('aria-label',text('搜索当前榜单','Search current list'));
    $('#media-search-label').textContent=text('片名筛选','Filter titles');
    $('#media-tabs').setAttribute('aria-label',text('影视分类','Film categories'));
    $('#media-tabs').innerHTML=tabs.map(([id,zh,en])=>`<button type="button" data-mi-tab="${id}" aria-pressed="${tab===id}">${text(zh,en)}</button>`).join('');
    $('#media-sources').setAttribute('aria-label',text('选择数据来源','Choose source'));
    $('#media-sources').innerHTML=choices().map(s=>`<button type="button" data-mi-source="${s}" aria-pressed="${source===s}">${escape(data?.sources?.[s]?.name || s)}</button>`).join('');
    $('#media-health-title').textContent=text('数据来源与更新状态','Sources & freshness');
    $('#media-attribution').innerHTML=`${link('https://www.themoviedb.org','<img src="./assets/media-tmdb.svg" width="78" height="12" alt="TMDB">')} <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span> ${link('https://www.tvmaze.com/api','TVmaze · CC BY-SA')} ${link('https://www.watchmode.com','Watchmode')} ${link('https://assrt.net',text('字幕服务由 assrt.net 提供','Subtitles by assrt.net'))}`;
  }
  function renderHealth() {
    $('#media-health').innerHTML=Object.entries(data?.sources || {}).map(([id,s])=>`<div><span>${link(s.url,escape(s.name))}</span><span class="${stale(s)?'mi-muted':'mi-ok'}">${s.status==='unavailable' ? text('暂不可用','Unavailable') : stale(s) ? text('保留旧数据','Cached data') : text('已更新','Updated')}</span><time>${format(s.updated_at)}</time></div>`).join('');
  }
  function render() {
    badges();renderHealth();
    const s=snapshot();
    $('#media-updated').textContent=data ? text('定时更新 · 北京时间','Scheduled updates · UTC+8') : text('正在读取影视情报…','Loading intelligence…');
    const status = s.status==='unavailable' ? text('该来源暂未获取到数据，可切换其他来源。','This source is unavailable. Try another source.') : `${stale(s)?text('旧快照 · ','Cached snapshot · '):''}${text('数据核对：','Verified: ')}${format(s.updated_at)}`;
    $('#media-source-status').textContent=data ? status : '';
    $('#media-source-status').classList.toggle('mi-stale',!!data && stale(s));
    $('#media-scope').innerHTML=source==='simkl' ? link('https://simkl.com/'+(tab==='movies'?'movies/best-movies':tab==='series'?'tv/best-shows':'anime/best-anime')+'/most-watched/',text('Simkl 本周热门','Simkl Trending This Week')) : escape(tab==='calendar' ? text('美区电视台与全球流媒体 · 未来 7 天精选 · 北京时间','US TV & global streaming · Selected next 7 days · UTC+8') : tab==='upcoming' ? text('TMDB 中国大陆发行信息 · 上映日期以官方为准','TMDB China release dates · Confirm with distributors') : tab==='anime' ? text('连载与新番 · 原站播出信息，不代表中文字幕上线时间','Airing & seasonal anime · Original airing times, not subtitle releases') : text('按所选来源热度排序 · 评分保留原始平台口径','Ranked by source popularity · Scores retain their original scales'));
    let list=items();
    $('#media-days').hidden=tab!=='calendar';
    if(tab==='calendar') {
      const days=Array.from({length:7},(_,n)=>dateKey(Date.now()+n*86400000));
      if(!days.includes(day)) day=days[0];
      $('#media-days').innerHTML=days.map((d,n)=>`<button type="button" data-mi-day="${d}" aria-pressed="${day===d}"><span>${n===0?text('今天','Today'):week(d+'T12:00:00+08:00')}</span><b>${d.slice(5)}</b><small>${list.filter(i=>dateKey(i.air_at)===d).length}${text(' 集',' eps')}</small></button>`).join('');
      list=list.filter(i=>i.air_at && dateKey(i.air_at)===day);
    }
    if(query.trim()) {const q=query.trim().toLocaleLowerCase();list=list.filter(i=>[i.title,i.original_title,i.english_title].some(v=>String(v||'').toLocaleLowerCase().includes(q)));}
    const pageSize=window.matchMedia('(max-width:760px)').matches?4:8;
    const totalPages=Math.max(1,Math.ceil(list.length/pageSize));page=Math.min(page,totalPages-1);
    const shown=list.slice(page*pageSize,page*pageSize+pageSize);
    $('#media-count').textContent=`${list.length} ${text(tab==='calendar'?'集':'部',tab==='calendar'?'episodes':'titles')}`;
    $('#media-grid').innerHTML=shown.length ? shown.map((i,index)=>`<article class="mi-card"><button type="button" class="mi-card-open" data-mi-open="${escape(i.id)}" aria-label="${escape(text('查看详情：','View details: ')+title(i))}">${poster(i)}<span class="mi-rank">${String(page*pageSize+index+1).padStart(2,'0')}</span><div class="mi-card-copy"><h3>${escape(title(i))}</h3><p class="mi-original">${escape(i.original_title!==title(i)?i.original_title:i.channel||i.source)}</p><p class="mi-meta">${escape(metadata(i))}</p><div class="mi-scores">${scores(i)}</div><span class="mi-open-label">${text('查看情报','Explore')} <span aria-hidden="true">↗</span></span></div></button></article>`).join('') : `<div class="mi-empty"><span aria-hidden="true">◇</span><h3>${!data?(loadFailed?text('暂时无法读取影视情报','Unable to load intelligence'):text('情报加载中','Loading…')):query?text('当前榜单没有匹配片名','No matching titles'):text('这里暂时没有可展示的情报','No titles available yet')}</h3><p>${!data?(loadFailed?text('请点击重新加载，或稍后再试。','Please retry now or come back later.'):text('正在读取最近一次采集的数据。','Reading the latest snapshot.')):query?text('试试原名，或切换分类与来源。这里只搜索已收录榜单。','Try the original title or another category. Search covers this snapshot only.'):text('可切换日期或来源，下一次采集会自动补充。','Try another date or source; scheduled collection will refresh this view.')}</p>${!data?'<button type="button" id="media-retry">'+text('重新加载','Retry')+'</button>':''}</div>`;
    $('#media-page').textContent=`${page+1} / ${totalPages}`;
    $('#media-prev').disabled=page===0;$('#media-next').disabled=page>=totalPages-1;
    $('#media-prev').textContent=text('上一页','Previous');$('#media-next').textContent=text('下一页','Next');
    $('#media-pagination').hidden=list.length<=pageSize;
    root.querySelectorAll('.mi-poster img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;img.parentElement.classList.add('mi-image-missing');},{once:true}));
  }
  function enrichment(name,i) {return (data.sources[name]?.items || []).find(x=>x.target_id===i.id || (i.imdb_id && x.imdb_id===i.imdb_id));}
  function details(id) {
    active=items().find(i=>i.id===id);if(!active)return;
    const i=active;const omdb=enrichment('omdb',i),watch=enrichment('watchmode',i);
    const merged={...i,ratings:[...(i.ratings||[]),...(omdb?.ratings||[])]};
    const providerTypes={sub:text('订阅','Subscription'),rent:text('租赁','Rent'),buy:text('购买','Buy'),free:text('免费含广告或免费观看','Free / ad-supported'),tve:text('电视账号','TV provider')};
    const providers=watch?.providers?.length ? `<p class="mi-caption">${text('美国区 · 其他地区可能不同','United States · Availability varies by region')} · ${format(watch.checked_at)}</p><div class="mi-provider-list">${watch.providers.map(p=>link(p.url,`${escape(p.name)} <small>${escape(providerTypes[p.type]||p.type)}</small>`)).join('')}</div>` : `<p class="mi-caption">${watch?text('本次未查到美国区观看渠道。','No US providers found in this check.'):text('此片暂未收录观看渠道，可通过资料原站继续查询。','Provider information has not been collected for this title.')}</p>`;
    const subtitles=['opensubtitles','assrt'].map(s=>{const e=enrichment(s,i);return `<div class="mi-sub-source"><h4>${escape(data.sources[s]?.name||s)}</h4>${e?`<p class="mi-caption">${text('检索时间','Checked')} ${format(e.checked_at)}</p>`:''}${e?.results?.length?e.results.map(r=>link(r.url,`${escape(r.title||text('字幕详情','Subtitle details'))}<small>${escape(r.language)}</small>`)).join(''):`<p class="mi-caption">${e?text('本次检索未返回结果','No matches in the latest search'):text('此片尚未建立字幕快照','No subtitle snapshot for this title')}</p>`}</div>`;}).join('');
    $('#media-dialog-body').innerHTML=`<div class="mi-detail-head">${poster(i)}<div><p class="mi-kicker">${escape(i.source)} · ${escape(i.date?.slice(0,4)||'')}</p><h2 id="media-dialog-title">${escape(title(i))}</h2><p class="mi-original">${escape(i.original_title!==title(i)?i.original_title:'')}</p><div class="mi-scores">${scores(merged)}</div>${omdb?`<p class="mi-caption">OMDb · ${format(omdb.checked_at)}</p>`:''}<div class="mi-detail-links">${link(i.url,escape(i.source))}${i.imdb_id?link('https://www.imdb.com/title/'+i.imdb_id+'/', 'IMDb'):''}${i.source==='Simkl'?'<img src="./assets/media-simkl.png" width="24" height="24" alt="Simkl">':''}</div></div></div><p class="mi-overview">${escape(i.overview||text('简介暂缺，请查看原站详情。','No synopsis available. Visit the source for details.'))}</p>${i.air_at?`<p class="mi-caption">${text('播出时间（北京）','Airing (UTC+8)')} ${format(i.air_at)}${i.episode?' · E'+escape(i.episode):''}</p>`:''}<div class="mi-detail-block"><h3>${text('在哪里看','Where to watch')}</h3>${providers}${link('https://www.watchmode.com','Watchmode')}</div><div class="mi-detail-block"><h3>${text('字幕情报','Subtitle intelligence')}</h3><p class="mi-caption">${text('结果仅供检索，请核对年份、季集、语言与片源版本。','Check the year, episode, language and release before choosing subtitles.')}</p>${subtitles}<div class="mi-detail-links">${link('https://assrt.net/sub/?searchword='+encodeURIComponent(i.original_title||i.title),text('伪射手网继续搜索','Search on assrt.net'))}${link('https://www.opensubtitles.com',text('打开 OpenSubtitles','Open OpenSubtitles'))}</div></div>`;
    $('#media-dialog-close').textContent=text('关闭','Close');
    const dialog=$('#media-dialog');if(!dialog.open)dialog.showModal();
    root.dispatchEvent(new CustomEvent('liangyou:media-detail',{detail:{
      id:i.id,title:i.title,originalTitle:i.original_title||i.english_title||'',
      year:i.date||'',kind:i.kind,tmdbId:i.tmdb_id,imdbId:i.imdb_id
    }}));
    dialog.querySelectorAll('.mi-poster img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;},{once:true}));
  }
  root.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.miTab){tab=b.dataset.miTab;const opts=choices();source=opts.includes(source)?source:opts.find(x=>(data?.sources?.[x]?.items||[]).some(i=>i.category===tab))||opts[0];page=0;query='';$('#media-search').value='';render();}
    if(b.dataset.miSource){source=b.dataset.miSource;page=0;render();}
    if(b.dataset.miDay){day=b.dataset.miDay;page=0;render();}
    if(b.dataset.miOpen)details(b.dataset.miOpen);
    if(b.id==='media-prev'||b.id==='media-next'){page+=b.id==='media-next'?1:-1;render();$('#media-grid').scrollIntoView({block:'nearest'});}
    if(b.id==='media-dialog-close')$('#media-dialog').close();
    if(b.id==='media-retry')load();
  });
  $('#media-dialog').addEventListener('click',e=>{if(e.target===$('#media-dialog'))$('#media-dialog').close();});
  $('#media-search').addEventListener('input',e=>{query=e.target.value;page=0;render();});
  new MutationObserver(()=>{const next=document.documentElement.lang.startsWith('en')?'en':'zh';if(next!==language){language=next;render();if($('#media-dialog').open&&active)details(active.id);}}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  async function load(){
    loadFailed=false;
    try{const r=await fetch('./data/media-intel.json',{cache:'no-cache'});if(!r.ok)throw Error();const d=await r.json();if(d.schema!==1||!d.sources)throw Error();data=d;source=choices().find(s=>(data.sources[s]?.items||[]).some(i=>i.category===tab))||source;render();}
    catch{loadFailed=true;render();$('#media-updated').textContent=text('影视情报暂时加载失败，请稍后重试','Could not load intelligence. Please retry.');}
  }
  window.matchMedia('(max-width:760px)').addEventListener('change',()=>{page=0;render();});
  render();load();
})();

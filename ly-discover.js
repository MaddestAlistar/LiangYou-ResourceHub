/* LiangYou Discover 2 — local-first discovery, normalized source adapters and health.
   No analytics, no credentials, no dependency on third-party client code. */
(() => {
'use strict';
const header=document.querySelector('.site-header .header-inner'), main=document.querySelector('main');
if(!header||!main||document.getElementById('ly-discover'))return;
const base=new URL('./',document.baseURI), KEY='liangyou-discover-v1', CACHE=KEY+':cache:', TTL=7*86400000;
const en=()=>document.documentElement.lang.startsWith('en'), t=(zh,eng)=>en()?eng:zh;
const N=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e};
const text=v=>typeof v==='string'?v.trim():'', cut=(v,n=400)=>text(v).slice(0,n);
const arr=v=>Array.isArray(v)?v:[], field=v=>arr(v).map(x=>cut(x,90)).filter(Boolean);
const cat={section:['站内板块','Sections'],app:['APP 指南','App guide'],cloud:['云存储 Wiki','Cloud Wiki'],emby:['Emby Wiki','Emby Wiki'],resource:['资源库','Resources'],free:['每日限免','Free offers'],news:['科技动态','Tech news'],media:['影视情报','Media'],sports:['赛事','Sports']};
const label=c=>cat[c]?.[en()?1:0]||c;
const path=v=>{if(!text(v))return '';try{const u=new URL(v,base);return u.origin===base.origin&&u.pathname.startsWith(base.pathname)?u.href:''}catch{return ''}};
const imgPath=v=>{const p=path(v);if(!p)return '';const u=new URL(p);return u.pathname.startsWith(base.pathname+'assets/')&&/\.(?:png|webp|jpe?g|gif)$/i.test(u.pathname)?p:''};
const tagspec={
 emby:['Emby','Jellyfin','Plex','媒体库','私有媒体','私人媒体'],
 nas:['NAS','WebDAV','SMB','网盘','云存储','CloudDrive','OpenList','挂载'],
 iptv:['IPTV','M3U','EPG','频道','直播'],
 player:['播放器','影音','播放','player','解码','字幕','音轨'],
 art:['图标','徽章','海报','icon','badge','poster'],
 apple:['iOS','iPadOS','macOS','tvOS','Apple TV','CarPlay','苹果'],
 sports:['赛事','电竞','NBA','LOL','足球','篮球'],
 film:['电影','剧集','动漫','影视','movie','anime','series'],
 android:['Android','安卓','Google Play'],
 comics:['漫画','阅读','comic','manga']
};
const norm=v=>text(v).normalize('NFKC').toLocaleLowerCase();
function topics(x){const hay=norm([x.title,x.desc,...arr(x.tags)].join(' '));return Object.entries(tagspec).filter(([,words])=>words.some(w=>hay.includes(norm(w)))).map(([k])=>k)}
function normalize(o){
 if(!o||typeof o!=='object')return null;
 const id=cut(o.id,240),title=cut(o.title,160),url=path(o.url),category=o.category;
 if(!id||!title||!url||!Object.hasOwn(cat,category))return null;
 const score=typeof o.score==='number'&&Number.isFinite(o.score)&&o.score>=0&&o.score<=100?o.score:null;
 return {id,title,url,category,desc:cut(o.desc,650),term:cut(o.term,160),tags:[...new Set(field(o.tags))].slice(0,16),image:imgPath(o.image),updated:cut(o.updated,80),score,source:cut(o.source,70),variant:cut(o.variant,40),metric:cut(o.metric,160)};
}
function sig(x){let h=2166136261;const s=JSON.stringify([x.title,x.desc,x.tags,x.updated,x.score,x.metric]);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
function list(v,max=500){const m=new Map();for(const o of arr(v).slice(0,max)){const x=normalize(o);if(x&&!m.has(x.id))m.set(x.id,x)}return [...m.values()]}
function parseState(o){
 if(!o||o.version!==1)throw Error('Invalid backup');
 const tracks=new Map();for(const a of arr(o.tracks).slice(0,300)){const x=normalize(a?.item);if(x&&!tracks.has(x.id))tracks.set(x.id,{item:x,baseline:cut(a.baseline,40)||sig(x)})}
 return {version:1,favorites:list(o.favorites),history:list(o.history,100),follows:[...new Set(arr(o.follows).filter(c=>c!=='section'&&Object.hasOwn(cat,c)))],tracks:[...tracks.values()],queries:[...new Set(arr(o.queries).map(q=>cut(q,100)).filter(Boolean))].slice(0,30),searches:[...new Set(arr(o.searches).map(q=>cut(q,100)).filter(Boolean))].slice(0,15),privateMode:o.privateMode===true,visits:Object.fromEntries(Object.entries(o.visits&&typeof o.visits==='object'?o.visits:{}).filter(([k,v])=>k.length<=240&&Number.isInteger(v)&&v>0&&v<=100000).slice(0,500))};
}
let state=parseState({version:1}),storageOK=true;
try{const s=localStorage.getItem(KEY);if(s)state=parseState(JSON.parse(s))}catch{storageOK=false}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));storageOK=true}catch{storageOK=false}}
const entries=new Map(),health=new Map();let jobs=null,jobsError=false,jobsAt='',loading=false,loaded=false,loadedAt=0;
const tools=N('div');tools.id='ly-discover-tools';
const B=(txt,fn,cls)=>{const b=N('button',txt,cls);b.type='button';b.addEventListener('click',fn);return b};
let lastTrigger=null,mode='discover',limit=30,detail=null,rankMode='app';
const searchBtn=B('',()=>open('search',searchBtn));searchBtn.id='lyd-header-search';searchBtn.setAttribute('aria-haspopup','dialog');tools.append(searchBtn);header.append(tools);
const home=N('section',null,'container lyd-home');home.id='liangyou-discovery-home';home.setAttribute('aria-labelledby','lyd-home-title');main.append(home);
const dialog=N('dialog');dialog.id='ly-discover';dialog.setAttribute('aria-labelledby','ly-discover-title');
const head=N('div',null,'lyd-head'),title=N('h2');title.id='ly-discover-title';const close=B('×',()=>dialog.close(),'lyd-close');head.append(title,close);
const tabs=N('div',null,'lyd-tabs'),controls=N('div',null,'lyd-controls'),search=N('input');search.type='search';search.autocomplete='off';
const select=N('select'),sort=N('select');controls.append(search,select,sort);
const suggestions=N('div',null,'lyd-chips'),status=N('p',null,'lyd-status');status.setAttribute('role','status');
const results=N('div'),actions=N('div',null,'lyd-actions'),file=N('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
dialog.append(head,tabs,controls,suggestions,status,results,actions,file);document.body.append(dialog);
const button=(zh,eng,fn,active=false)=>{const b=B(t(zh,eng),fn);b.setAttribute('aria-pressed',String(active));return b};
const nav=document.querySelectorAll('.site-header .nav a[href]');
for(const a of nav){const href=a.getAttribute('href');const x=normalize({id:'section:'+href,title:a.textContent.trim(),url:href,category:'section',desc:''});if(x)entries.set(x.id,x)}
function get(pathname,json=true){return (async()=>{const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),12000);try{const r=await fetch(new URL(pathname,base),{signal:ac.signal,cache:'no-cache'});if(!r.ok)throw Error('HTTP '+r.status);return json?await r.json():await r.text()}finally{clearTimeout(timer)}})()}
function expect(v){if(!Array.isArray(v))throw Error('Invalid feed');return v}
const timeOf=d=>d?.updatedAt||d?.updated||d?.generated_at||d?.checked_at||'';
const adapter=(id,c,zh,eng,fn)=>({id,c,zh,eng,fn});
const adapters=[
 adapter('projects','resource','资源目录','Resource catalog',async add=>{const d=await get('data/projects.json');for(const x of expect(d.projects))add(x.id,x.title,x.id==='sports'?'#sports':'#resource-'+x.id,x.description,{tags:[...field(x.apps),...field(x.keywords)],updated:x.updated,image:arr(x.images)[0]});for(const x of arr(d.future))add('lab:'+x.id,x.title,'#lab',x.description,{tags:[x.format,x.audience],metric:x.contents});for(const x of arr(d.collabs))add('collab:'+x.id,x.name,'#collabs',x.description,{image:x.image});for(const x of arr(d.offers?.items))add('offer:'+x.name,x.name,'#offers',x.description);return timeOf(d)}),
 adapter('reviews','app','良友 APP 指南','App reviews',async add=>{const d=await get('data/lyx-reviews.json');for(const x of expect(d.reviews))if(x.status==='published'){const scores=arr(x.scores),weights=[.30,.20,.20,.10,.10,.10];const score=scores.length===6&&scores.every(n=>typeof n==='number'&&n>=0&&n<=100)?Math.round(scores.reduce((n,s,i)=>n+s*weights[i],0)*10)/10:null;add(x.id,x.name,'lyx-review.html#detail/'+encodeURIComponent(x.id),x.summary||x.review,{tags:[x.platform,x.category,...field(x.tags)],score,updated:x.updatedAt,image:x.icon})}return timeOf(d)}),
 adapter('cloud','cloud','云存储 Wiki','Cloud Wiki',async add=>{const html=await get('cloud-wiki.html',false),match=html.match(/const DATA\s*=\s*(\[[\s\S]*?\]);/);if(!match)throw Error('Cloud index unavailable');for(const x of expect(JSON.parse(match[1])))add(x.name,x.name,'cloud-wiki.html?item='+encodeURIComponent(x.name),x.desc,{tags:[x.category,...field(x.tags),...field(x.related)]});return ''}),
 adapter('emby','emby','Emby Wiki','Emby Wiki',async add=>{const d=await get('https://liangyou-icon-review.maddestalistar.workers.dev/emby-wiki-feed');if(!d.ok)throw Error('Wiki unavailable');for(const x of expect(d.items)){const name=x.name||x.serverName||x.title;if(name)add(x.id||name,name,'#emby-wiki',x.summary||x.description,{term:name,tags:[x.nature,...field(x.contents),...field(x.qualities)],updated:x.updatedAt,metric:[x.status,x.registration].filter(v=>typeof v==='string').join(' · ')})}return timeOf(d)}),
 adapter('apple','free','Apple 限免','Apple offers',async add=>{const d=await get('data/daily-free.json');if(!d.regions||typeof d.regions!=='object')throw Error('Invalid Apple feed');for(const [region,v] of Object.entries(d.regions))for(const x of expect(v.items))add(region+':'+x.id,x.name,'#daily-free',x.genre,{tags:[region.toUpperCase(),x.platform],image:x.icon,metric:x.original_price,updated:x.discovered_at});return timeOf(d)}),
 adapter('android','free','Android 限免','Android offers',async add=>{const d=await get('data/android-free.json');for(const x of expect(d.items))add('android:'+x.package,x.name,'#daily-free',x.genre,{tags:[x.platform],image:x.icon,metric:x.original_price});return timeOf(d)}),
 adapter('games','free','游戏限免','Game offers',async add=>{const d=await get('data/game-free.json');if(!d.platforms||typeof d.platforms!=='object')throw Error('Invalid games feed');for(const [p,v] of Object.entries(d.platforms))for(const x of expect(v.items))add(p+':'+x.id,x.name,'#daily-free',x.kind,{tags:[x.platform],image:x.icon,metric:[x.original_price,x.ends_at].filter(Boolean).join(' · ')});return timeOf(d)}),
 adapter('news','news','良友科技新闻','Tech news',async add=>{const d=await get('data/tech-news-feed.json');for(const x of expect(d.items))add(x.id,x.title,'#liangyou-tech-news',x.content,{tags:[x.category,x.platform],updated:x.updatedAt||x.createdAt,image:x.localNewsImageUrl||x.localPosterUrl});return timeOf(d)}),
 adapter('media','media','影视情报','Media catalog',async add=>{const d=await get('data/media-intel.json');if(!d.sources||typeof d.sources!=='object')throw Error('Invalid media feed');const seen=new Set();for(const s of Object.values(d.sources))for(const x of arr(s.items)){const id=x.work_id||d.aliases?.[x.id]||x.id;if(!id||!x.title||seen.has(id))continue;seen.add(id);add(id,x.title,'#media',x.overview,{term:x.title,tags:[x.original_title,...field(x.profile?.genres),...field(x.profile?.keywords)],image:x.poster,updated:x.date,variant:x.kind==='anime'?'anime':x.kind==='tv'||x.kind==='series'?'series':x.kind==='movie'?'movies':'',metric:x.profile?.status})}return timeOf(d)}),
 ...[['fixtures','data/real-sports.json','赛事日历','Fixtures'],['extras','data/extra-sports.json','补充赛事','Supplemental sports'],['board','data/board-games.json','棋牌赛事','Board games']].map(([id,url,zh,eng])=>adapter(id,'sports',zh,eng,async add=>{const d=await get(url),teams=new Map();for(const x of expect(d.events)){if(!x.home||!x.away)continue;const title=x.home+' vs '+x.away;add(x.id,title,'#sports',x.league,{tags:[x.sport,x.stage,x.home,x.away],term:x.home,updated:x.start_time,metric:[x.status,x.score_home!=null&&x.score_away!=null?x.score_home+' : '+x.score_away:''].filter(Boolean).join(' · ')});for(const name of [x.home,x.away]){const k=norm(name)+'|'+norm(x.sport);if(!teams.has(k))teams.set(k,{name,sport:x.sport,games:[]});teams.get(k).games.push(x)}}for(const [k,x] of teams){const recent=x.games.sort((a,b)=>String(b.start_time).localeCompare(String(a.start_time))).slice(0,5);add('team:'+id+':'+k,x.name,'#sports',recent.map(g=>g.home+' vs '+g.away).join(' · '),{term:x.name,tags:[x.sport,...recent.map(g=>g.league)],metric:recent.map(g=>[g.id,g.status,g.score_home,g.score_away,g.start_time].join(':')).join('|')})}for(const x of arr(d.standings))if(x.title)add('standing:'+x.id,x.title,'#sports',x.league,{tags:[x.sport],term:x.league});return timeOf(d)}))
];
function cacheRead(a){try{const d=JSON.parse(localStorage.getItem(CACHE+a.id)||'null');if(!d||!Number.isFinite(d.at)||Date.now()-d.at>TTL||!Array.isArray(d.items))return null;return {at:d.at,updated:d.updated,items:d.items.map(normalize).filter(x=>x&&x.source===a.id)}}catch{return null}}
function cacheWrite(a,items,updated){try{const payload=JSON.stringify({at:Date.now(),updated,items});if(payload.length<=850000)localStorage.setItem(CACHE+a.id,payload)}catch{}}
function replaceSource(a,items){for(const [id,x] of entries)if(x.source===a.id)entries.delete(id);for(const x of items)entries.set(x.id,x)}
async function load(force=false){
 if(loading||(!force&&loaded&&Date.now()-loadedAt<300000))return;
 loading=true;jobsError=false;for(const a of adapters){const prev=health.get(a.id);health.set(a.id,{...prev,state:'loading'});if(!prev){const c=cacheRead(a);if(c){replaceSource(a,c.items);health.set(a.id,{state:'loading',count:c.items.length,updated:c.updated,at:c.at,cached:true})}}}render();
 const jobTask=get('data/update-status.json').then(d=>{if(d.schema!==1||!d.jobs)throw Error('Invalid status');jobs=d.jobs;jobsAt=d.checked_at||''}).catch(()=>{jobsError=true});
 // Each adapter stages validated rows and commits them atomically; failure retains
 // only its own last-good snapshot, never replaces another adapter or the main site.
 await Promise.all([...adapters.map(async a=>{
  const staged=new Map();const add=(id,title,url,desc,extra={})=>{if(id==null)return;const x=normalize({id:a.c+':'+id,title,url,desc,category:a.c,source:a.id,...extra});if(x)staged.set(x.id,x)};
  try{const updated=cut(await a.fn(add),80),items=[...staged.values()];replaceSource(a,items);cacheWrite(a,items,updated);health.set(a.id,{state:'live',count:items.length,updated,at:Date.now()})}
  catch{const old=cacheRead(a),memory=[...entries.values()].filter(x=>x.source===a.id);const prev=health.get(a.id);if(old){replaceSource(a,old.items);health.set(a.id,{state:'cached',count:old.items.length,updated:old.updated,at:old.at})}else if(memory.length&&Number.isFinite(prev?.at)&&Date.now()-prev.at<=TTL){health.set(a.id,{state:'cached',count:memory.length,updated:prev?.updated,at:prev?.at})}else {replaceSource(a,[]);health.set(a.id,{state:'failed',count:0})}}
  if(dialog.open)render();
 }),jobTask]);
 loading=false;loaded=true;loadedAt=Date.now();renderHome();if(dialog.open)render();
}
const modes=[['discover','发现','Discover'],['search','搜索','Search'],['favorites','收藏','Saved'],['tracks','订阅','Tracking'],['history','历史','Recent'],['rank','榜单','Rankings'],['health','数据健康','Health'],['settings','设置','Settings']];
function option(s,v,zh,eng){const o=N('option',t(zh,eng));o.value=v;s.append(o)}
function translations(){
 searchBtn.textContent=t('⌕ 全站搜索','⌕ Search');
 close.setAttribute('aria-label',t('关闭','Close'));search.placeholder=t('搜索名称、标签、功能或链接…','Search names, tags, features or links…');search.setAttribute('aria-label',search.placeholder);
 const v=select.value,sv=sort.value;select.replaceChildren();sort.replaceChildren();option(select,'','全部板块','All categories');for(const c of Object.keys(cat))option(select,c,cat[c][0],cat[c][1]);select.value=v;
 option(sort,'relevance','相关度优先','Relevance');option(sort,'name','名称 A–Z','Name A–Z');option(sort,'recent','更新日期','Updated date');option(sort,'score','APP 评分','App score');sort.value=sv||'relevance';
 select.setAttribute('aria-label',t('筛选板块','Filter category'));sort.setAttribute('aria-label',t('排序方式','Sort'));renderHome();render();
}
function activate(m){mode=m;limit=30;detail=null;render();if(m==='search')search.focus()}
function open(m,trigger){lastTrigger=trigger;mode=m;detail=null;limit=30;translations();if(!dialog.open)dialog.showModal();if(m==='search')search.focus();else close.focus();load()}
function renderHome(){
 home.replaceChildren();
 const top=N('div',null,'lyd-home-top'),copy=N('div');
 const h=N('h2',t('良友发现中心','Discover LiangYou'));h.id='lyd-home-title';
 copy.append(h,N('p',t('跨板块发现资源、收藏与订阅，按需使用。','Explore related resources, save and track what matters.')));
 const entry=B(t('进入中心 ↗','Explore ↗'),()=>open('discover',entry),'lyd-primary');entry.id='lyd-home-discover';entry.setAttribute('aria-haspopup','dialog');top.append(copy,entry);home.append(top);
 const shortcuts=N('div',null,'lyd-home-shortcuts');
 for(const [m,zh,eng,n] of [['favorites','我的良友','My Hub',state.favorites.length],['tracks','资源订阅','Tracking',state.tracks.length],['health','数据状态','Data status',0]]){
  const title=t(zh,eng)+(n>0?' · '+n:'');const link=B(title,()=>open(m,link));link.dataset.lydEntry=m;link.setAttribute('aria-haspopup','dialog');shortcuts.append(link);
 }
 home.append(shortcuts);
}
function record(x){if(state.privateMode)return;state.history=[x,...state.history.filter(y=>y.id!==x.id)].slice(0,100);if(Object.hasOwn(state.visits,x.id)||Object.keys(state.visits).length<500)state.visits[x.id]=Math.min(100000,(state.visits[x.id]||0)+1);save()}
function jump(x){record(x);const u=new URL(x.url);if(u.pathname!==location.pathname)return;dialog.close();if(x.category==='media'&&x.variant){const b=document.querySelector('#media-tabs [data-mi-tab="'+x.variant+'"]');if(b&&b.getAttribute('aria-pressed')!=='true')b.click()}const id={emby:'wiki-search',media:'media-search',sports:'officialFixturesSearch'}[x.category];const input=id&&document.getElementById(id);if(input&&x.term){input.value=x.term;input.dispatchEvent(new Event('input',{bubbles:true}))}if(u.hash===location.hash)document.getElementById(u.hash.slice(1))?.scrollIntoView({block:'start'})}
function anchor(x,caption){const a=N('a',caption||x.title);a.href=x.url;a.addEventListener('click',e=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey)jump(x)});return a}
function favorite(x){const i=state.favorites.findIndex(y=>y.id===x.id);if(i>=0)state.favorites.splice(i,1);else if(state.favorites.length<500)state.favorites.unshift(x);else return;save();renderHome();render()}
function tracked(x){return state.tracks.find(y=>y.item.id===x.id)}
function track(x){const a=tracked(x);if(a)state.tracks=state.tracks.filter(y=>y!==a);else if(state.tracks.length<300)state.tracks.unshift({item:x,baseline:sig(x)});save();renderHome();render()}
function freshness(x){return x.source?health.get(x.source)?.state:'live'}
function changed(a){const x=entries.get(a.item.id);return x&&freshness(x)==='live'&&sig(x)!==a.baseline}
function current(x){return entries.get(x.id)||x}
function thumb(x){if(!x.image)return null;const im=N('img');im.src=x.image;im.alt='';im.loading='lazy';im.decoding='async';im.className='lyd-thumb';im.addEventListener('error',()=>im.remove(),{once:true});return im}
function row(raw,opts={}){
 const x=current(raw),r=N('article',null,'lyd-row');r.dataset.lydId=x.id;
 const im=thumb(x);if(im)r.append(im);
 const m=N('div',null,'lyd-main'),a=anchor(x);a.className='lyd-link';m.append(a);
 const meta=[label(x.category),x.score!=null?x.score+'/100':'',x.updated?x.updated.slice(0,10):'',freshness(x)==='cached'?t('缓存','Cached'):'',opts.extra].filter(Boolean).join(' · ');m.append(N('small',meta));
 if(x.desc)m.append(N('p',x.desc.slice(0,145)));
 const chips=N('div',null,'lyd-row-tags');for(const tag of x.tags.slice(0,3))chips.append(N('span',tag));if(chips.childNodes.length)m.append(chips);
 const btns=N('div',null,'lyd-row-actions'),fav=state.favorites.some(y=>y.id===x.id);
 const info=B(t('详情','Details'),()=>{detail=x;mode='detail';render()});info.dataset.lydAction='detail';
 const star=button(fav?'★':'☆',fav?'★':'☆',()=>favorite(x),fav);star.dataset.lydAction='save';star.setAttribute('aria-label',fav?t('取消收藏','Remove saved'):t('收藏','Save'));
 const follow=button(tracked(x)?'已订阅':'订阅',tracked(x)?'Tracked':'Track',()=>track(x),!!tracked(x));follow.dataset.lydAction='track';
 btns.append(info,star);if(x.category!=='section')btns.append(follow);r.append(m,btns);return r;
}
function heading(zh,eng,sub){const h=N('div',null,'lyd-section-head');h.append(N('h3',t(zh,eng)));if(sub)h.append(N('small',sub));results.append(h)}
function rows(items,empty){for(const x of items.slice(0,limit))results.append(row(x));if(!items.length)results.append(N('p',empty||t('暂无内容','Nothing here yet'),'lyd-empty'));if(items.length>limit)results.append(B(t('加载更多','Load more'),()=>{limit+=30;render()}))}
function queryScore(x,words){const title=norm(x.title),tags=norm(x.tags.join(' ')),hay=norm([x.title,x.desc,x.term,x.url,x.tags.join(' '),label(x.category)].join(' '));if(!words.every(w=>hay.includes(w)))return -1;return words.reduce((n,w)=>n+(title===w?25:title.startsWith(w)?14:title.includes(w)?9:tags.includes(w)?5:1),0)}
function runQuery(q,c=''){search.value=q;select.value=c;activate('search')}
function rememberQuery(){const q=cut(search.value,100);if(q&&!state.privateMode){state.searches=[q,...state.searches.filter(x=>x!==q)].slice(0,15);save()}}
function rankedQuery(){
 const q=norm(search.value).split(/\s+/).filter(Boolean);
 const found=[...entries.values()].filter(x=>(!select.value||select.value===x.category)&&(q.length||select.value||x.category==='section')).map(x=>[x,queryScore(x,q)]).filter(x=>x[1]>=0);
 found.sort((a,b)=>sort.value==='name'?a[0].title.localeCompare(b[0].title):sort.value==='recent'?String(b[0].updated).localeCompare(String(a[0].updated))||b[1]-a[1]:sort.value==='score'?(b[0].score??-1)-(a[0].score??-1)||b[1]-a[1]:b[1]-a[1]);return found.map(x=>x[0])
}
function related(x){
 const ts=topics(x),terms=x.tags.map(norm).filter(z=>z.length>=3),title=norm(x.title);
 return [...entries.values()].filter(y=>y.id!==x.id&&y.category!==x.category&&y.category!=='section').map(y=>{const hay=norm([y.title,y.desc,y.tags.join(' ')].join(' ')),other=topics(y);const direct=title.length>=3&&hay.includes(title)?12:0;const shared=ts.filter(z=>other.includes(z)).length;return [y,direct+shared*3+terms.filter(z=>hay.includes(z)).length*4]}).filter(z=>z[1]>=3).sort((a,b)=>b[1]-a[1]).slice(0,10).map(z=>z[0])
}
function date(v){const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString(en()?'en-US':'zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' CST':t('未提供','Not supplied')}
function healthLabel(s){return ({live:t('已读取','Loaded'),cached:t('使用缓存','Cached'),failed:t('读取失败','Unavailable'),loading:t('加载中','Loading')})[s]||t('未加载','Not loaded')}
function renderHealth(){
 status.textContent=t('浏览器读取状态与后台采集状态独立；缓存不代表实时数据。','Browser fetch and upstream collection are separate; cached data is not live.');
 heading('搜索数据源','Search adapters',t('独立加载 · 7 天缓存 · 按源保留上次成功数据','Independent loads · seven-day cache · last-good fallback'));
 for(const a of adapters){const h=health.get(a.id)||{},r=N('div',null,'lyd-health-row'),left=N('div');left.append(N('strong',t(a.zh,a.eng)),N('small',t('收录 ','Indexed ')+(h.count??0)+' · '+t('源时间 ','Source ')+date(h.updated)+' · '+t('读取 ','Fetch ')+date(h.at)));const b=N('span',healthLabel(h.state),'lyd-health-state');b.dataset.state=h.state||'';r.append(left,b);results.append(r)}
 heading('后台采集状态','Upstream scheduler',jobsError?t('状态文件暂不可读；下列若有记录为上次读取。','Status feed unavailable; shown data may be previous.'):date(jobsAt));
 const names={media:['影视','Media'],apple:['Apple 限免','Apple offers'],android:['Android 限免','Android offers'],games:['游戏','Games'],sports:['旧赛事源','Legacy sports source'],predict:['赛事预测','Predictions'],kalshi:['Kalshi 赛事','Kalshi'],fixtures:['真实赛事','Fixtures'],extras:['补充赛事','Supplemental fixtures'],board:['棋牌','Board games'],nba:['NBA','NBA'],odds:['赛事赔率','Odds'],chess_profiles:['棋手档案','Chess profiles']};
 for(const [k,j] of Object.entries(jobs||{})){const overdue=Number.isFinite(Date.parse(j.next_due_at))&&Date.now()>Date.parse(j.next_due_at)+900000,ok=j.status==='ok',r=N('div',null,'lyd-health-row'),left=N('div');left.append(N('strong',names[k]?.[en()?1:0]||k),N('small',t('上次成功 ','Last success ')+date(j.last_success_at)+' · '+t('下次计划 ','Next due ')+date(j.next_due_at)));const b=N('span',ok?(overdue?t('逾期','Overdue'):t('正常','OK')):j.status==='failed'?t('采集失败','Failed'):String(j.status||'unknown'),'lyd-health-state');b.dataset.state=ok&&!overdue?'live':ok?'cached':'failed';r.append(left,b);results.append(r)}
 actions.append(B(t('刷新全部数据源','Refresh sources'),()=>load(true)));actions.lastChild.disabled=loading;
}
function render(){
 title.textContent=mode==='detail'?t('资源档案','Resource profile'):t('良友发现与个人中心','LiangYou Discover & Library');
 tabs.replaceChildren();for(const [m,zh,eng] of modes){const b=button(zh,eng,()=>activate(m),mode===m);b.dataset.lydTab=m;tabs.append(b)}
 controls.hidden=mode!=='search';suggestions.replaceChildren();results.replaceChildren();actions.replaceChildren();status.textContent='';
 const pending=loading?t(' · 正在加载',' · Loading'):'',total=entries.size;
 if(mode==='search'){
  const q=cut(search.value,100),items=rankedQuery();status.textContent=t('匹配 '+items.length+' 项 · 已索引 '+total+' 项','Matches: '+items.length+' · Indexed: '+total)+pending;
  if(q){const sub=button(state.queries.includes(q)?'移除关键词订阅':'订阅此关键词',state.queries.includes(q)?'Remove saved query':'Track this query',()=>{rememberQuery();state.queries=state.queries.includes(q)?state.queries.filter(x=>x!==q):[q,...state.queries].slice(0,30);save();render()},state.queries.includes(q));suggestions.append(sub)}
  else for(const q of [...new Set([...state.searches,'Emby','NAS','CarPlay','4K','IPTV'])].slice(0,12))suggestions.append(B(q,()=>runQuery(q)));
  if(q)for(const tag of [...new Set(items.slice(0,8).flatMap(x=>x.tags))].filter(v=>v.length<=32&&norm(v)!==norm(q)).slice(0,6))suggestions.append(B(tag,()=>runQuery(tag,select.value)));
  rows(items,t('没有匹配项，试试其他关键词。','No matches. Try another query.'));
 }else if(mode==='discover'){
  status.textContent=t('基于本机关注、收藏与主题关联，不使用全站用户画像。','Based on local follows, saved items and topic matches; no shared user profile.')+pending;
  heading('继续探索','Continue exploring');const recent=state.history.slice(0,4);for(const x of recent)results.append(row(x));if(!recent.length)results.append(N('p',t('从搜索或精选资源开始。','Start with search or featured resources.'),'lyd-empty'));
  heading('为你发现','For you');const seeds=[...state.tracks.map(a=>a.item),...state.favorites,...state.history].slice(0,12),preferred=new Set(seeds.flatMap(topics)),seen=new Set(seeds.map(x=>x.id));
  const pool=[...entries.values()].filter(x=>x.category!=='section'&&!seen.has(x.id)).map(x=>[x,(state.follows.includes(x.category)?10:0)+topics(x).filter(z=>preferred.has(z)).length*4+(x.category==='app'&&x.score!=null?x.score/100:0)]).sort((a,b)=>b[1]-a[1]);const picked=[],counts={};for(const [x] of pool){if((counts[x.category]||0)>=3)continue;counts[x.category]=(counts[x.category]||0)+1;picked.push(x);if(picked.length>=12)break}for(const x of picked)results.append(row(x));if(!picked.length)results.append(N('p',t('数据准备中','Preparing sources'),'lyd-empty'));
  heading('板块速览','Browse categories');const group=N('div',null,'lyd-chips');for(const c of Object.keys(cat).filter(c=>c!=='section'))group.append(B(label(c)+' · '+[...entries.values()].filter(x=>x.category===c).length,()=>runQuery('',c)));results.append(group);
 }else if(mode==='detail'&&detail){
  const x=current(detail);status.textContent=label(x.category);const profile=N('section',null,'lyd-profile'),im=thumb(x);if(im)profile.append(im);const content=N('div');content.append(N('h3',x.title),N('p',x.desc||t('详细资料请访问原板块。','Open the original section for details.')));if(x.tags.length)content.append(N('p',x.tags.join(' · '),'lyd-status'));if(x.metric&&x.category!=='sports')content.append(N('p',x.metric,'lyd-status'));if(x.updated)content.append(N('small',t('资料日期：','Source date: ')+x.updated.slice(0,10)));profile.append(content);results.append(profile);actions.append(anchor(x,t('进入原资源','Open resource')),B(t('返回搜索','Back to search'),()=>activate('search')));const fav=state.favorites.some(y=>y.id===x.id);actions.append(button(fav?'取消收藏':'收藏',fav?'Remove saved':'Save',()=>favorite(x),fav));if(x.category!=='section')actions.append(button(tracked(x)?'取消订阅':'订阅资源',tracked(x)?'Untrack':'Track',()=>track(x),!!tracked(x)));
  heading('跨板块关联','Related across categories',t('基于名称、标签和共享主题匹配','Matched by name, tags and shared topics'));const rel=related(x);for(const y of rel)results.append(row(y));if(!rel.length)results.append(N('p',t('暂无匹配关联','No related matches'),'lyd-empty'));
 }else if(mode==='favorites'){
  status.textContent=t('本机收藏 '+state.favorites.length+' 项 · 按板块归类','Saved on this device: '+state.favorites.length+' · grouped by category');
  if(!state.favorites.length)rows([]);else for(const c of Object.keys(cat)){const group=state.favorites.filter(x=>x.category===c);if(group.length){heading(cat[c][0],cat[c][1]);for(const x of group)results.append(row(x))}}
 }else if(mode==='tracks'){
  const updates=state.tracks.filter(changed);status.textContent=t('订阅 '+state.tracks.length+' 项 · '+updates.length+' 项资料变化 · 仅比较站内快照','Tracking '+state.tracks.length+' · '+updates.length+' changes · compares site snapshots only')+pending;
  heading('资源更新','Resource updates',t('源数据变化不等同于 APP 发布新版本','Snapshot changes do not necessarily mean a new app release'));
  for(const a of [...updates,...state.tracks.filter(x=>!updates.includes(x))]){const x=entries.get(a.item.id);const r=row(x||a.item,{extra:changed(a)?t('有变化','Changed'):!x||freshness(x)!=='live'?t('暂未核实','Not verified'):t('无变化','Unchanged')});if(changed(a))r.querySelector('.lyd-row-actions').append(B(t('标为已读','Mark read'),()=>{a.item=x;a.baseline=sig(x);save();render()}));results.append(r)}
  if(!state.tracks.length)results.append(N('p',t('在任意搜索结果点击订阅。','Track any search result.'),'lyd-empty'));
  heading('关键词订阅','Saved queries');const qg=N('div',null,'lyd-chips');for(const q of state.queries)qg.append(B(q,()=>runQuery(q)));if(!state.queries.length)qg.append(N('small',t('在搜索时保存关键词。','Save a query from search.')));results.append(qg);
  heading('关注板块','Follow categories');const group=N('div',null,'lyd-chips');for(const c of Object.keys(cat).filter(c=>c!=='section'))group.append(button(cat[c][0],cat[c][1],()=>{state.follows=state.follows.includes(c)?state.follows.filter(y=>y!==c):[...state.follows,c];save();render()},state.follows.includes(c)));results.append(group);
 }else if(mode==='history'){
  status.textContent=state.privateMode?t('无痕模式已开启，不新增历史。','Private mode is on; no new history is recorded.'):t('仅记录通过本中心打开的资源。','Only visits made through this hub are recorded.');rows(state.history);
  actions.append(B(t('清空历史','Clear history'),()=>{if(confirm(t('清空访问记录及常用统计？','Clear visits and local rankings?'))){state.history=[];state.visits={};save();render()}}));
 }else if(mode==='rank'){
  status.textContent=t('按已有评分或本机行为排序，不伪造全站热度。','Uses published scores or local activity, not fabricated global popularity.');
  const g=N('div',null,'lyd-chips');for(const [k,zh,eng] of [['app','APP 评分榜','App scores'],['recent','资源日期榜','Resource dates'],['visits','我的常用榜','My frequently visited']])g.append(button(zh,eng,()=>{rankMode=k;render()},rankMode===k));results.append(g);
  let items=rankMode==='app'?[...entries.values()].filter(x=>x.category==='app'&&x.score!=null).sort((a,b)=>b.score-a.score):rankMode==='recent'?[...entries.values()].filter(x=>['resource','app','news'].includes(x.category)&&x.updated).sort((a,b)=>String(b.updated).localeCompare(String(a.updated))):state.history.slice().sort((a,b)=>(state.visits[b.id]||0)-(state.visits[a.id]||0));
  for(const [i,x] of items.slice(0,30).entries())results.append(row(x,{extra:'#'+(i+1)+(rankMode==='visits'?' · '+(state.visits[x.id]||0)+' '+t('次','visits'):'')}));if(!items.length)results.append(N('p',t('暂无榜单数据','No ranking data'),'lyd-empty'));
 }else if(mode==='health')renderHealth();
 else if(mode==='settings'){
  status.textContent=t('收藏、订阅与历史仅保存在当前浏览器；备份文件未加密。','Saved data stays in this browser; exported backup is not encrypted.');
  heading('隐私设置','Privacy');results.append(button(state.privateMode?'无痕模式：开启':'无痕模式：关闭',state.privateMode?'Private mode: on':'Private mode: off',()=>{state.privateMode=!state.privateMode;save();render()},state.privateMode),N('p',t('开启后不记录新的访问和搜索历史，不会清除已有记录。','Stops recording new visits and searches; existing records remain.'),'lyd-status'));
  heading('数据管理','Data management');results.append(B(t('清空访问与搜索历史','Clear visit and search history'),()=>{if(confirm(t('确认清空历史？','Clear history?'))){state.history=[];state.searches=[];state.visits={};save();render()}}),B(t('清理数据源缓存','Clear source cache'),()=>{for(const a of adapters)try{localStorage.removeItem(CACHE+a.id)}catch{}status.textContent=t('本地缓存已清理，不影响收藏。','Local source cache cleared; saved items retained.')})); 
  actions.append(B(t('导出 JSON 备份','Export JSON backup'),()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=N('a');a.href=url;a.download='LiangYou-Backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}),B(t('导入备份（合并）','Import backup (merge)'),()=>file.click()));
 }
 if(!storageOK)status.textContent+=t(' · 本地存储不可用，请导出备份',' · Local storage unavailable; export backup');
}
file.addEventListener('change',async()=>{try{const f=file.files?.[0];if(!f)return;if(f.size>3000000)throw Error('Too large');const x=parseState(JSON.parse(await f.text()));if(!confirm(t('将备份合并到现有收藏和订阅，不清除原记录。继续？','Merge backup into current saved items and tracking?')))return;state=parseState({...state,favorites:[...state.favorites,...x.favorites],history:[...state.history,...x.history],tracks:[...state.tracks,...x.tracks],follows:[...state.follows,...x.follows],queries:[...state.queries,...x.queries],searches:[...state.searches,...x.searches]});save();renderHome();render()}catch{status.textContent=t('备份无效，未修改现有数据。','Invalid backup; existing data unchanged.')}finally{file.value=''}});
search.addEventListener('input',()=>{limit=30;render()});search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();rememberQuery();render()}});search.addEventListener('change',rememberQuery);select.addEventListener('change',()=>{limit=30;render()});sort.addEventListener('change',()=>{limit=30;render()});
dialog.addEventListener('close',()=>{rememberQuery();renderHome();if(lastTrigger?.isConnected)lastTrigger.focus({preventScroll:true})});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!dialog.open){e.preventDefault();open('search',searchBtn)}});
new MutationObserver(translations).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
translations();
})();

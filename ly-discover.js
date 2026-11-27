/* LiangYou Discover — independent, local-first resource search and library. */
(() => {
  'use strict';
  const header=document.querySelector('.site-header .header-inner');
  if(!header || document.getElementById('ly-discover')) return;
  const base=new URL('./',document.baseURI), key='liangyou-discover-v1';
  const en=()=>document.documentElement.lang.startsWith('en');
  const tr=(zh,english)=>en()?english:zh;
  const node=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e};
  const safePath=value=>{try{const u=new URL(value,base);return u.origin===base.origin&&u.pathname.startsWith(base.pathname)?u.href:''}catch{return ''}};
  const categories={section:['站内板块','Sections'],app:['APP 指南','App guide'],cloud:['云存储 Wiki','Cloud Wiki'],emby:['Emby Wiki','Emby Wiki'],resource:['资源库','Resources'],free:['每日限免','Free apps'],news:['科技动态','Tech news'],media:['影视情报','Media'],sports:['赛事','Sports']};
  const label=c=>categories[c]?.[en()?1:0]||c;
  const clean=v=>typeof v==='string'?v.trim().slice(0,400):'';
  function normalize(o){
    if(!o||typeof o!=='object')return null;
    const title=clean(o.title),id=clean(o.id),url=safePath(o.url),category=o.category;
    if(!title||!id||!url||!Object.hasOwn(categories,category))return null;
    return {id,title,url,category,desc:clean(o.desc),term:clean(o.term)};
  }
  function parseState(o){
    if(!o||typeof o!=='object'||o.version!==1)throw Error('Invalid backup');
    const list=v=>{if(!Array.isArray(v))return [];const m=new Map();for(const raw of v.slice(0,500)){const x=normalize(raw);if(x&&!m.has(x.id))m.set(x.id,x)}return [...m.values()]};
    return {version:1,favorites:list(o.favorites),history:list(o.history).slice(0,100),follows:Array.isArray(o.follows)?[...new Set(o.follows.filter(c=>c!=='section'&&Object.hasOwn(categories,c)))]:[]};
  }
  let state={version:1,favorites:[],history:[],follows:[]}, storageOK=true;
  try{const raw=localStorage.getItem(key);if(raw)state=parseState(JSON.parse(raw))}catch{storageOK=false}
  function save(){try{localStorage.setItem(key,JSON.stringify(state));storageOK=true}catch{storageOK=false} }
  const style=node('style');
  style.textContent='#ly-discover-tools{grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:3px 0 5px}#ly-discover-tools button,#ly-discover button{font:inherit;cursor:pointer;color:inherit;background:#172235;border:1px solid #536078;border-radius:10px;padding:8px 12px;min-height:38px}#ly-discover-tools button:first-child,#ly-discover button[aria-pressed=true]{background:#e4c58a;color:#211b11;border-color:#e4c58a}#ly-discover{box-sizing:border-box;width:min(720px,calc(100% - 24px));max-height:85vh;max-height:85dvh;padding:20px;border:1px solid #536078;border-radius:20px;color:#edf1fa;background:#0c1422;overflow:auto;margin:auto;box-shadow:0 20px 80px #0009}#ly-discover::backdrop{background:#000b}#ly-discover h2{font-size:22px;margin:0}#ly-discover .lyd-head,#ly-discover .lyd-tabs,#ly-discover .lyd-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}#ly-discover .lyd-head{justify-content:space-between}#ly-discover input[type=search],#ly-discover select{box-sizing:border-box;width:100%;font:inherit;padding:12px;border:1px solid #536078;border-radius:10px;background:#121d2e;color:#edf1fa}#ly-discover .lyd-tabs{margin:14px 0}#ly-discover .lyd-status{color:#b5bfd1;font-size:13px;margin:12px 0}#ly-discover .lyd-row{display:flex;align-items:center;gap:8px;padding:12px 0;border-bottom:1px solid #263247}#ly-discover .lyd-main{flex:1;min-width:0}#ly-discover .lyd-main a{color:#f0d7a6;font-weight:650;text-decoration:none;overflow-wrap:anywhere}#ly-discover .lyd-main small{display:block;color:#b5bfd1;margin-top:5px;overflow-wrap:anywhere}#ly-discover .lyd-follow{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}#ly-discover button:focus-visible,#ly-discover a:focus-visible,#ly-discover input:focus-visible{outline:2px solid #e4c58a;outline-offset:2px}#ly-discover [hidden]{display:none!important}@media(max-width:600px){#ly-discover{padding:14px}#ly-discover-tools button{font-size:12px;min-height:34px;padding:6px 10px}#ly-discover .lyd-row button{padding:8px;font-size:12px}}';
  document.head.append(style);
  const tools=node('div');tools.id='ly-discover-tools';
  const searchBtn=node('button'),myBtn=node('button');for(const b of [searchBtn,myBtn]){b.type='button';b.setAttribute('aria-haspopup','dialog');tools.append(b)}header.append(tools);
  const dialog=node('dialog');dialog.id='ly-discover';dialog.setAttribute('aria-labelledby','ly-discover-title');
  const head=node('div',undefined,'lyd-head'),title=node('h2');title.id='ly-discover-title';const close=node('button','×');close.type='button';head.append(title,close);
  const tabs=node('div',undefined,'lyd-tabs'),search=node('input');search.type='search';search.autocomplete='off';
  const select=node('select');const status=node('p',undefined,'lyd-status');status.setAttribute('role','status');
  const results=node('div'),actions=node('div',undefined,'lyd-actions'),file=node('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
  dialog.append(head,tabs,search,select,status,results,actions,file);document.body.append(dialog);
  let mode='search',loaded=false,loading=false,failed=[],lastTrigger=null,limit=35;
  const entries=new Map();
  function add(c,id,title,url,desc,term=''){const item=normalize({category:c,id:c+':'+id,title,url,desc,term});if(item)entries.set(item.id,item)}
  const nav=document.querySelectorAll('.site-header .nav a[href]');
  for(const a of nav){const href=a.getAttribute('href');if(safePath(href))add('section',href,a.textContent.trim(),href,'')}
  function field(v){return Array.isArray(v)?v.join(' · '):typeof v==='string'?v:''}
  const get=async(path,json=true)=>{const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),12000);try{const r=await fetch(new URL(path,base),{signal:ac.signal,cache:'no-cache'});if(!r.ok)throw Error('HTTP '+r.status);return json?await r.json():await r.text()}finally{clearTimeout(timer)}};
  const sources=[
    ['resource',async()=>{const d=await get('data/projects.json');for(const x of d.projects||[])add('resource',x.id,x.title,'#library',[x.description,field(x.apps),field(x.keywords)].filter(Boolean).join(' · '));}],
    ['app',async()=>{const d=await get('data/lyx-reviews.json');for(const x of d.reviews||[])if(x.status==='published')add('app',x.id,x.name,'lyx-review.html#detail/'+encodeURIComponent(x.id),[x.summary,x.platform,field(x.tags)].filter(Boolean).join(' · '));}],
    ['cloud',async()=>{const html=await get('cloud-wiki.html',false);const match=html.match(/const DATA\s*=\s*(\[[\s\S]*?\]);/);if(!match)throw Error('Cloud index unavailable');for(const x of JSON.parse(match[1]))add('cloud',x.name,x.name,'cloud-wiki.html?item='+encodeURIComponent(x.name),[x.category,x.desc,field(x.tags)].filter(Boolean).join(' · '));}],
    ['emby',async()=>{const d=await get('https://liangyou-icon-review.maddestalistar.workers.dev/emby-wiki-feed');if(!d.ok||!Array.isArray(d.items))throw Error('Wiki unavailable');for(const x of d.items){const name=x.name||x.serverName||x.title;if(name)add('emby',x.id||name,name,'#emby-wiki',[x.nature,x.description,x.summary].filter(v=>typeof v==='string').join(' · '),name);}}],
    ['free',async()=>{const d=await get('data/daily-free.json');for(const [region,v] of Object.entries(d.regions||{}))for(const x of v.items||[])add('free',region+':'+x.id,x.name,'#daily-free',[region.toUpperCase(),x.genre,x.platform].filter(Boolean).join(' · '),x.name);}],
    ['news',async()=>{const d=await get('data/tech-news-feed.json');for(const x of d.items||[])add('news',x.id,x.title,'#liangyou-tech-news',x.content);}],
    ['media',async()=>{const d=await get('data/media-discovery-snapshot.json');for(const x of Object.values(d.mal?.items||{}))add('media',x.malId,x.title,'#media',[field(x.genres),field(x.studios)].filter(Boolean).join(' · '),x.title);}]
  ];
  async function load(){
    if(loading||loaded)return;loading=true;failed=[];render();
    await Promise.all(sources.map(async([c,fn])=>{try{await fn()}catch{failed.push(c)}if(dialog.open)render()}));
    loading=false;loaded=true;if(dialog.open)render();
  }
  const makeButton=(text,fn)=>{const b=node('button',text);b.type='button';b.addEventListener('click',fn);return b};
  const tabsInfo=[['search','搜索','Search'],['favorites','收藏','Saved'],['history','最近访问','Recent'],['follows','关注板块','Following']];
  function translations(){
    searchBtn.textContent=tr('⌕ 全站搜索','⌕ Search');myBtn.textContent=tr('☆ 我的良友','☆ My Hub');
    close.setAttribute('aria-label',tr('关闭','Close'));search.placeholder=tr('搜索应用、云盘、服务器、资源…','Search apps, cloud, servers, resources…');
    search.setAttribute('aria-label',search.placeholder);select.setAttribute('aria-label',tr('筛选板块','Filter category'));
    const val=select.value;select.replaceChildren();const all=node('option',tr('全部板块','All categories'));all.value='';select.append(all);
    for(const c of Object.keys(categories)){const o=node('option',label(c));o.value=c;select.append(o)}select.value=val;
    render();
  }
  function activate(m){mode=m;limit=35;render();if(m==='search')search.focus()}
  function open(m,trigger){lastTrigger=trigger;mode=m;limit=35;translations();if(!dialog.open)dialog.showModal();if(m==='search')search.focus();else close.focus();load()}
  function record(x){state.history=[x,...state.history.filter(y=>y.id!==x.id)].slice(0,100);save()}
  function applyTerm(x){const map={emby:'wiki-search',media:'media-search'};const field=document.getElementById(map[x.category]);if(field&&x.term){field.value=x.term;field.dispatchEvent(new Event('input',{bubbles:true}))}}
  function row(x){
    const r=node('div',undefined,'lyd-row'),main=node('div',undefined,'lyd-main'),a=node('a',x.title);a.href=x.url;
    a.addEventListener('click',ev=>{if(ev.button!==0||ev.metaKey||ev.ctrlKey||ev.shiftKey||ev.altKey)return;record(x);if(new URL(x.url).pathname===location.pathname){dialog.close();applyTerm(x)}});
    main.append(a,node('small',label(x.category)+(x.desc?' · '+x.desc.slice(0,130):'')));
    const favored=state.favorites.some(y=>y.id===x.id);const b=makeButton(favored?tr('★ 已收藏','★ Saved'):tr('☆ 收藏','☆ Save'),()=>{if(favored)state.favorites=state.favorites.filter(y=>y.id!==x.id);else{if(state.favorites.length>=500){status.textContent=tr('收藏已达 500 项上限','Saved items limit: 500');return}state.favorites.unshift(x)}save();render()});
    b.setAttribute('aria-pressed',String(favored));r.append(main,b);return r;
  }
  function score(x,q){const title=x.title.toLocaleLowerCase(),full=[title,x.desc,x.term,label(x.category)].join(' ').toLocaleLowerCase();if(!q.every(w=>full.includes(w)))return -1;return q.reduce((n,w)=>n+(title===w?12:title.startsWith(w)?8:title.includes(w)?5:1),0)}
  function render(){
    title.textContent=mode==='search'?tr('全站搜索','Search the Hub'):tr('我的良友','My LiangYou');
    tabs.replaceChildren();for(const [m,zh,eng] of tabsInfo){const b=makeButton(tr(zh,eng),()=>activate(m));b.setAttribute('aria-pressed',String(mode===m));tabs.append(b)}
    search.hidden=select.hidden=mode!=='search';results.replaceChildren();actions.replaceChildren();
    let items=[];
    if(mode==='search'){
      const q=search.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
      items=[...entries.values()].filter(x=>(!select.value||select.value===x.category)&&(q.length||select.value||x.category==='section')).map(x=>[x,score(x,q)]).filter(x=>x[1]>=0).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
      status.textContent=tr('匹配 '+items.length+' 项 · 已索引 '+entries.size+' 项','Matches: '+items.length+' · Indexed: '+entries.size)+(loading?tr(' · 正在独立加载数据源',' · Loading sources'):'')+(failed.length?tr(' · 暂不可用：',' · Unavailable: ')+failed.map(label).join(' / '):'');
      if(failed.length&&!loading)actions.append(makeButton(tr('重试数据源','Retry sources'),()=>{loaded=false;load()}));
    }else if(mode==='favorites')items=state.favorites;
    else if(mode==='history'){items=state.history;actions.append(makeButton(tr('清空历史','Clear history'),()=>{if(confirm(tr('清空最近访问记录？','Clear recent history?'))){state.history=[];save();render()}}))}
    else{
      const group=node('div',undefined,'lyd-follow');
      for(const c of Object.keys(categories).filter(c=>c!=='section')){const active=state.follows.includes(c);const b=makeButton(label(c),()=>{state.follows=active?state.follows.filter(v=>v!==c):[...state.follows,c];save();render()});b.setAttribute('aria-pressed',String(active));group.append(b)}results.append(group);
      items=[...entries.values()].filter(x=>state.follows.includes(x.category));
      if(state.follows.includes('sports'))items.push(...[...entries.values()].filter(x=>x.category==='section'&&x.url.endsWith('#sports')));
    }
    if(mode!=='search'){
      status.textContent=tr('本机保存 · '+items.length+' 项','Stored on this device · '+items.length+' items')+(mode==='follows'&&loading?tr(' · 加载中',' · Loading'):'');
      actions.append(makeButton(tr('导出备份','Export backup'),()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='LiangYou-Backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}),makeButton(tr('导入备份','Import backup'),()=>file.click()));
    }
    if(!storageOK)status.textContent+=tr(' · 本地存储不可用，请导出备份',' · Storage unavailable; export a backup');
    for(const x of items.slice(0,limit))results.append(row(x));
    if(!items.length)results.append(node('p',mode==='search'?tr('没有匹配项，试试其他关键词或板块。','No matches. Try other keywords or categories.'):tr('暂无内容，可在搜索中收藏资源或选择关注板块。','Nothing here yet. Save resources or follow categories.')));
    if(items.length>limit)results.append(makeButton(tr('加载更多','Load more'),()=>{limit+=35;render()}));
  }
  file.addEventListener('change',async()=>{try{const f=file.files?.[0];if(!f)return;if(f.size>1500000)throw Error('Too large');const imported=parseState(JSON.parse(await f.text()));if(!confirm(tr('导入将替换本机的良友收藏、关注和历史，继续？','Replace local saved items, follows and history?')))return;state=imported;save();render()}catch{status.textContent=tr('备份格式无效，未修改现有数据。','Invalid backup; existing data unchanged.')}finally{file.value=''}});
  search.addEventListener('input',()=>{limit=35;render()});select.addEventListener('change',()=>{limit=35;render()});
  searchBtn.onclick=()=>open('search',searchBtn);myBtn.onclick=()=>open('favorites',myBtn);close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>lastTrigger?.focus());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!dialog.open){e.preventDefault();open('search',searchBtn)}});
  new MutationObserver(translations).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  translations();
})();

import {NATURES} from './emby-wiki-schema.mjs?v=20261110.5';
import {el,api,stats,details,safeCover} from './emby-wiki-ui.mjs?v=20261112.detail1';

const $=id=>document.getElementById(id),root=$('emby-wiki');
if(root){
 let items=[],limit=8,loaded=false,loading=false,activeItem=null,loadError='';
 let language='zh';
 try{language=localStorage.getItem('liangyou-site-language')==='en'?'en':'zh'}catch{}
 const list=$('wiki-list'),search=$('wiki-search'),nature=$('wiki-nature'),sort=$('wiki-sort'),more=$('wiki-more'),dialog=$('wiki-detail');
 // Translate only known interface labels and server category values.
 // Never perform partial word replacement on contributor-written content.
 const labels={
  '公益服':'Community server','公费服':'Sponsored server','机场服':'Proxy-provider server',
  '正常运营':'Operating','维护中':'Under maintenance','暂时停服':'Temporarily offline','已停服':'Closed',
  '电影':'Movies','电视剧':'TV shows','动漫':'Anime','综艺':'Variety','纪录片':'Documentaries',
  '短剧':'Short dramas','体育':'Sports','音乐':'Music','原盘 / REMUX':'Blu-ray / REMUX','杜比视界':'Dolby Vision',
  '腐竹本人':'Server owner','管理员':'Administrator','普通用户':'Regular user','资料整理者':'Contributor',
  '媒体类型':'Media type','不含多版本':'Excluding versions','包含多版本':'Including versions',
  '电影（部）':'Movies (titles)','剧集（部）':'TV series (titles)','集数（集）':'Episodes',
  '未提供':'Not provided','统计日期':'Statistics date','统计口径':'Counting method',
  '资源内容':'Media categories','画质与规格':'Video quality & formats','开号条件':'Account access',
  '保号规则':'Account retention rules','费用说明':'Pricing','线路与访问':'Network & access',
  '简介':'Overview','投稿人':'Submitted by','投稿日期':'Submission date',
  '官方网站':'Official website','频道':'Channel','群组':'Group','机器人':'Bot',
  '统计凭证':'Statistics evidence','统计凭证截图':'Statistics screenshot',
  '统计凭证截图，点击查看原图':'Statistics screenshot — open original'
 };
 const t=value=>language==='en'?(labels[value]||value):value;
 function localizeText(value){
  if(language!=='en')return value;
  if(Object.prototype.hasOwnProperty.call(labels,value))return labels[value];
  const other=/^其他媒体 ([\d,]+) 项$/u.exec(value);
  if(other)return 'Other media: '+other[1]+' items';
  if(value.includes('、')){
   const parts=value.split('、');
   if(parts.every(part=>Object.prototype.hasOwnProperty.call(labels,part)))return parts.map(t).join(', ');
  }
  return value;
 }
 function localizeDisplay(node){
  if(language!=='en')return node;
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
  let n;
  while((n=walker.nextNode())){
   const original=n.nodeValue,trimmed=original.trim();
   if(trimmed)n.nodeValue=original.replace(trimmed,localizeText(trimmed));
  }
  for(const element of node.querySelectorAll('[alt],[aria-label]')){
   for(const attr of ['alt','aria-label']){
    const value=element.getAttribute(attr);
    if(value)element.setAttribute(attr,localizeText(value));
   }
  }
  return node;
 }
 NATURES.forEach(n=>{const option=el('option',n);option.value=n;nature.append(option)});
 function syncStatic(){
  $('wiki-title').textContent=language==='en'?'Emby Wiki · Server Directory':'Emby Wiki · 服务器档案';
  root.querySelector('.wk-head .wk-hint').textContent=language==='en'
   ?'Explore server libraries and account requirements. Profiles are community-submitted and published after review.'
   :'从片库规模到开号规则，按需了解一台服务器。资料由社区投稿，审核后收录。';
  root.querySelector('.wk-head a').textContent=language==='en'?'＋ Submit a Server':'＋ 自助投稿';
  search.placeholder=language==='en'?'Search servers, libraries or account access':'搜索服务器、资源或开号方式';
  search.setAttribute('aria-label',language==='en'?'Search Emby servers':'搜索 Emby 服务器');
  nature.setAttribute('aria-label',language==='en'?'Server category':'服务器性质');
  nature.options[0].textContent=language==='en'?'All Categories':'全部分类';
  for(const option of nature.options)if(option.value)option.textContent=t(option.value);
  sort.setAttribute('aria-label',language==='en'?'Sort server profiles':'档案排序');
  const sortLabels={
   updatedAt:language==='en'?'Recently Updated':'最近更新',
   statsDate:language==='en'?'Latest Statistics':'最新统计',
   name:language==='en'?'Name (A–Z)':'名称排序'
  };
  for(const option of sort.options)option.textContent=sortLabels[option.value]||option.textContent;
  $('wiki-retry').textContent=language==='en'?'Try Again':'重新加载';
  more.textContent=language==='en'?'Load More Profiles':'加载更多档案';
  root.querySelector('.wk-shell > p.wk-hint').textContent=language==='en'
   ?'Library figures reflect the stated statistics date. Server rules may change; refer to official announcements.'
   :'媒体库数量以标注的统计日期为准；服务规则可能变化，请以官方公告为准。';
  $('wiki-detail-close').textContent=language==='en'?'Close ×':'关闭 ×';
  $('wiki-detail-close').setAttribute('aria-label',language==='en'?'Close server profile':'关闭档案');
  if(!dialog.open)$('wiki-detail-title').textContent=language==='en'?'Server Profile':'服务器档案';
  if(!loaded&&!loading&&!loadError){
   $('wiki-count').textContent=language==='en'?'Preparing server profiles…':'正在准备服务器档案…';
   list.replaceChildren(el('p',language==='en'?'Loading server profiles…':'正在读取档案…','wk-empty'));
  }
 }
 function open(item,show=true){
  activeItem=item;
  $('wiki-detail-title').textContent=item.name;
  $('wiki-detail-meta').textContent=t(item.nature)+' · '+t(item.state);
  $('wiki-detail-content').replaceChildren(localizeDisplay(details(item)));
  if(show&&!dialog.open)dialog.showModal();
  if(show)dialog.scrollTop=0;
 }
 $('wiki-detail-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{activeItem=null});
 dialog.addEventListener('click',e=>{
  if(e.target===dialog){
   const bounds=dialog.getBoundingClientRect();
   if(e.clientX<bounds.left||e.clientX>bounds.right||e.clientY<bounds.top||e.clientY>bounds.bottom)dialog.close();
  }
 });
 function render(){
  const q=search.value.trim().toLowerCase();
  const filtered=items.filter(x=>{
   if(nature.value&&x.nature!==nature.value)return false;
   const fields=[x.name,x.summary,x.extraContent,x.registration,...(x.contents||[]),...(x.qualities||[])];
   if(language==='en')fields.push(...(x.contents||[]).map(t),...(x.qualities||[]).map(t),t(x.nature),t(x.state));
   return fields.join(' ').toLowerCase().includes(q);
  });
  filtered.sort((a,b)=>sort.value==='name'?a.name.localeCompare(b.name,'zh-CN'):(b[sort.value]||'').localeCompare(a[sort.value]||''));
  list.replaceChildren();
  $('wiki-count').textContent=language==='en'
   ?items.length+' servers · '+filtered.length+' matches'
   :'已收录 '+items.length+' 台 · 当前匹配 '+filtered.length+' 台';
  more.hidden=filtered.length<=limit;
  if(!filtered.length){
   const box=el('div',undefined,'wk-empty');
   box.append(
    el('h3',language==='en'?(items.length?'No Matching Servers':'No Server Listings Yet'):(items.length?'没有找到匹配的服务器':'等待第一份服务器档案')),
    el('p',language==='en'
     ?(items.length?'Try another search or switch to All Categories.':'Be the first to submit a verified profile. Approved server cards and library statistics will appear here.')
     :(items.length?'试试其他名称，或切换为全部分类。':'欢迎提交真实资料。审核通过后，服务器卡片与媒体库统计会显示在这里。'))
   );
   if(items.length){
    const button=el('button',language==='en'?'Clear Filters':'清除筛选','wk-button wk-secondary');
    button.onclick=()=>{search.value='';nature.value='';render()};
    box.append(button);
   }
   list.append(box);
   return;
  }
  const numberFormat=new Intl.NumberFormat(language==='en'?'en-US':'zh-CN',{notation:'compact',maximumFractionDigits:1});
  const metric=(item,plain,multi)=>{
   const value=item[plain]??item[multi];
   return value===null||value===undefined||value===''?'—':numberFormat.format(Number(value));
  };
  for(const x of filtered.slice(0,limit)){
   const card=el('article',undefined,'wk-card wk-directory-card');
   const button=el('button',undefined,'wk-directory-action');
   button.type='button';
   button.setAttribute('aria-label',language==='en'?'View full profile for '+x.name:'查看 '+x.name+' 的完整档案');
   button.onclick=()=>open(x);
   const header=el('div',undefined,'wk-directory-header');
   const cover=el('div',undefined,'wk-directory-cover');
   const initials=el('span',x.name.trim().slice(0,2)||'LY','wk-directory-initials');
   cover.append(initials);
   if(safeCover(x.coverUrl)){
    const img=el('img',undefined,'wk-directory-image');
    img.src=x.coverUrl;img.alt='';img.loading='lazy';img.decoding='async';
    img.onerror=()=>img.remove();cover.append(img);
   }
   const intro=el('div',undefined,'wk-directory-intro');
   intro.append(el('h3',x.name));
   const badges=el('div',undefined,'wk-directory-badges');
   const state=el('span',t(x.state),'wk-directory-status');
   if(x.state==='正常运营')state.classList.add('is-active');
   badges.append(el('span',t(x.nature),'wk-directory-nature'),state);
   header.append(cover,intro);
   const counts=el('div',undefined,'wk-directory-counts');
   for(const [label,plain,multi] of [
    [language==='en'?'Movies':'电影','movies','moviesWithVersions'],
    [language==='en'?'Series':'剧集','series','seriesWithVersions']
   ]){
    const cell=el('div',undefined,'wk-directory-count');
    cell.append(el('span',label),el('strong',metric(x,plain,multi)));
    counts.append(cell);
   }
   const footer=el('div',undefined,'wk-directory-footer');
   footer.append(el('span',(language==='en'?'Stats: ':'统计 ')+(x.statsDate||'—')));
   footer.append(el('span',language==='en'?'View details ↗':'查看详情 ↗','wk-directory-link'));
   button.append(header,badges,counts,footer);card.append(button);list.append(card);
  }
 }
 function renderError(){
  $('wiki-count').textContent=language==='en'?'Unable to load profiles':'档案暂时无法加载';
  list.replaceChildren(el('p',language==='en'?'Unable to retrieve server profiles. Please try again.':loadError,'wk-empty'));
  $('wiki-retry').hidden=false;
 }
 function syncLanguage(next){
  if(next!=='en'&&next!=='zh')return;
  language=next;
  syncStatic();
  if(loaded)render();
  else if(loadError)renderError();
  else if(loading)$('wiki-count').textContent=language==='en'?'Loading server profiles…':'正在读取服务器档案…';
  if(activeItem&&dialog.open)open(activeItem,false);
 }
 window.addEventListener('liangyou:languagechange',e=>syncLanguage(e.detail?.language));
 window.addEventListener('storage',e=>{if(e.key==='liangyou-site-language')syncLanguage(e.newValue)});
 const changed=()=>{limit=8;render()};
 search.oninput=changed;nature.onchange=changed;sort.onchange=changed;
 more.onclick=()=>{limit+=8;render()};
 async function load(){
  if(loading)return;
  loading=true;loadError='';
  list.setAttribute('aria-busy','true');$('wiki-retry').hidden=true;
  $('wiki-count').textContent=language==='en'?'Loading server profiles…':'正在读取服务器档案…';
  try{const data=await api('/emby-wiki-feed');items=data.items||[];loaded=true;render()}
  catch(e){loadError=e.message;renderError()}
  finally{loading=false;list.setAttribute('aria-busy','false')}
 }
 $('wiki-retry').onclick=load;
 // Align direct section links after the async project gallery settles.
 let anchorPending=location.hash==='#emby-wiki';
 function alignAnchor(){
  if(!anchorPending||location.hash!=='#emby-wiki')return;
  if($('projectGrid')?.getAttribute('aria-busy')==='true')return;
  anchorPending=false;
  requestAnimationFrame(()=>{if(location.hash==='#emby-wiki')root.scrollIntoView({block:'start'})});
 }
 function fromHash(){
  if(location.hash!=='#emby-wiki'){anchorPending=false;return}
  anchorPending=true;if(!loaded)load();alignAnchor();
 }
 window.addEventListener('hashchange',fromHash);
 document.addEventListener('hub:render',alignAnchor);
 const gallery=$('projectGrid');
 if(gallery&&'MutationObserver'in window){
  const observer=new MutationObserver(()=>{
   if(gallery.getAttribute('aria-busy')!=='true'){alignAnchor();observer.disconnect()}
  });
  observer.observe(gallery,{attributes:true,attributeFilter:['aria-busy']});
 }
 if(document.readyState!=='complete')window.addEventListener('load',()=>{
  if(location.hash==='#emby-wiki'){anchorPending=true;alignAnchor()}
 },{once:true});
 syncStatic();
 fromHash();
 if('IntersectionObserver'in window){
  const observer=new IntersectionObserver(entries=>{
   if(entries.some(e=>e.isIntersecting)&&!loaded){observer.disconnect();load()}
  },{rootMargin:'300px'});
  observer.observe(root);
 }else load();
}

/* Mainland film sources: independently attributed ratings, box-office and editorial updates. */
(function(){
'use strict';
const root=document.getElementById('media');if(!root)return;
const endpoint='https://liangyou-taopiaopiao-lab.maddestalistar.workers.dev';
const lookupCache=new Map(),newsCache={promise:null};
const english=()=>document.documentElement.lang.toLowerCase().startsWith('en');
const t=(zh,en)=>english()?en:zh;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sameTitle=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').replace(/[·•\-–—:：.。"'“”‘’]/g,'').toLowerCase();
const verifyYear=(v,year)=>String(v||'').includes(String(year));
async function fetchJSON(url,ms=12000){const r=await fetch(url,{signal:AbortSignal.timeout(ms)});if(!r.ok)throw Error('source_unavailable');return r.json();}
function safe(u){try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password?x.href:null;}catch{return null;}}
function fmtDate(s){const n=Date.parse(s||'');return Number.isFinite(n)?new Intl.DateTimeFormat(english()?'en-US':'zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(n)):'';}
function numberWan(x){return x&&x.unit==='万元'&&Number.isFinite(x.value)&&x.value>=0?x.value:null;}
const yuan=x=>x>=10000?(x/10000).toLocaleString('zh-CN',{maximumFractionDigits:2})+t(' 亿元',' × 100M CNY'):x.toLocaleString('zh-CN',{maximumFractionDigits:2})+t(' 万元',' × 10K CNY');
async function lookupFilm(info){
 const year=Number(String(info.year||'').slice(0,4));
 if(info.kind!=='movie'||!Number.isInteger(year)||year<2017||year>new Date().getFullYear()||!sameTitle(info.title))return null;
 const key=year+'|'+sameTitle(info.title);
 if(!lookupCache.has(key))lookupCache.set(key,(async()=>{
  const list=await fetchJSON(endpoint+'/api/search?year='+year+'&name='+encodeURIComponent(info.title),13000);
  if(list.code!==0||Number(list.year)!==year||!Array.isArray(list.data))return null;
  const rows=list.data.filter(x=>sameTitle(x.title)===sameTitle(info.title)&&/^\d{8,14}$/.test(String(x.movieCode||''))&&
   verifyYear(x.releaseDate||'',year));
  // Names which collide with another release or are absent never auto-join.
  if(rows.length!==1)return null;
  const found=rows[0],body=await fetchJSON(endpoint+'/api/movie/'+found.movieCode,12000);
  if(body.code!==0||String(body.movieCode)!==String(found.movieCode)||sameTitle(body.title)!==sameTitle(info.title)||
   !verifyYear(body.releaseDescription||found.releaseDate,year))return null;
  const valid=body.ratings&&['maoyan','douban','taopiaopiao'].every(k=>body.ratings[k]===null||
   Number.isFinite(body.ratings[k])&&body.ratings[k]>0&&body.ratings[k]<=10);
  return valid?body:null;
 })().catch(()=>null));
 return lookupCache.get(key);
}
function insertAutoRatings(info){
 if(info.section!=='ratings'||info.kind!=='movie')return;
 const target=root.querySelector('#media-dialog .mi-ratings-section');
 if(!target)return;
 const shell=document.createElement('section');
 shell.className='mi-cn-auto mi-cn-scores';
 shell.innerHTML='<p class="mi-caption">'+t('正在核对电影与国内评分来源…','Checking identity for mainland rating sources…')+'</p>';
 const manual=target.querySelector('.mtk-rating-research');
 if(manual)manual.before(shell);else target.appendChild(shell);
 lookupFilm(info).then(d=>{
  if(!shell.isConnected)return;
  const items=d?[['maoyan','猫眼'],['douban','豆瓣'],['taopiaopiao','淘票票']].filter(([k])=>d.ratings[k]!==null):[];
  if(!items.length){shell.innerHTML='<p class="mi-caption">'+t('暂无可通过片名和上映年份可靠关联的其他国内评分。','No additional mainland ratings could be safely matched by title and release year.')+'</p>';return;}
  const link=safe(d.upstreamUrl);
  shell.innerHTML='<h4>'+t('国内平台参考评分','Mainland platform rating references')+'</h4>'+
   '<div class="mi-score-grid">'+items.map(([k,name])=>'<div class="mi-score-tile"><span>'+name+'</span>'+
    '<strong>'+esc(d.ratings[k].toFixed(1))+'/10</strong><small>'+t('第三方公开汇总','Third-party public aggregation')+'</small></div>').join('')+'</div>'+
   '<p class="mi-caption">'+t('已按作品名称和上映年份精确匹配；非三家平台官方授权数据，不与上方评分合并。','Matched by exact title and year. Not officially licensed data; shown separately.')+
   (link?' · <a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">'+t('核对来源','Check source')+' ↗</a>':'')+'</p>';
 }).catch(()=>{if(shell.isConnected)shell.textContent=t('国内评分补充暂不可用。','Supplementary mainland ratings unavailable.');});
}
function insertBoxOffice(info){
 if(info.section!=='boxoffice')return;
 const target=root.querySelector('#media-dialog .mi-detail-content');
 if(!target)return;
 const shell=document.createElement('section');shell.className='mi-insight-block mi-cn-boxoffice';
 target.prepend(shell);
 if(info.kind!=='movie'){
  shell.innerHTML='<p class="mi-caption">'+t('当前作品为剧集或动画系列，院线单片票房不适用；下方地区榜单与本作品无直接关系。','The title is not a theatrical film; individual theatrical grosses do not apply. Regional charts below are separate.')+'</p>';
  return;
 }
 shell.innerHTML='<h3>'+t('中国内地单片票房','Mainland China film box office')+'</h3><p class="mi-caption">'+t('正在查找同名、同年份电影…','Looking for an exact title-and-year match…')+'</p>';
 lookupFilm(info).then(d=>{
  if(!shell.isConnected)return;
  if(!d||!d.boxOffice){shell.innerHTML='<h3>'+t('中国内地单片票房','Mainland China film box office')+'</h3><p class="mi-caption">'+t('暂无可靠的单片票房，不以年度榜单代替本片收入。','No verified individual film gross; yearly charts are not used as a substitute.')+'</p>';return;}
  const fields=[['cumulative',t('累计票房','Cumulative gross')],['firstDay',t('首日票房','Opening day')],['firstWeek',t('首周票房','Opening week')]].map(([k,label])=>[label,numberWan(d.boxOffice[k])]).filter(x=>x[1]!==null);
  if(!fields.length){shell.textContent=t('暂无可核实的内地单片票房。','No verified mainland gross.');return;}
  shell.innerHTML='<h3>'+t('中国内地单片票房','Mainland China film box office')+'</h3>'+
   '<div class="mi-cn-box-grid">'+fields.map(([label,value])=>'<div><small>'+esc(label)+'</small><strong>'+esc(yuan(value))+'</strong></div>').join('')+'</div>'+
   '<p class="mi-caption">'+t('第三方票房页面汇总（人民币），并非猫眼或淘票票官方授权接口；具体统计时间以原站为准。','Aggregated public third-party figures in CNY; not a licensed Maoyan/Taopiaopiao feed.')+
   (safe(d.upstreamUrl)?' · <a href="'+esc(d.upstreamUrl)+'" target="_blank" rel="noopener noreferrer">'+t('原始数据','Source')+' ↗</a>':'')+'</p>';
 }).catch(()=>{if(shell.isConnected)shell.textContent=t('内地票房补充暂不可用。','Mainland box office temporarily unavailable.');});
}
async function news(){
 if(!newsCache.promise)newsCache.promise=fetchJSON('./data/media-cn-news.json',7000).catch(()=>null);
 return newsCache.promise;
}
function domesticNews(info){
 if(info.section!=='discover')return;
 const target=root.querySelector('#media-dialog .mi-detail-content');if(!target)return;
 const box=document.createElement('details');box.className='mi-cn-news-drawer';
 box.innerHTML='<summary>'+t('中国电影资讯 · 国内快讯','Chinese cinema news · China film wire')+'</summary>'+
 '<p class="mi-caption">'+t('国产电影、行业与政策动态；不等同于猫眼或淘票票官方资讯。','Mainland cinema and film-industry headlines, not an official ticketing-app news feed.')+'</p>'+ '<div class="mi-cn-news-links"><a href="https://www.1905.com/news/" target="_blank" rel="noopener noreferrer">1905 电影网 ↗</a><a href="https://www.chinafilm.gov.cn/xwzx/gzdt/" target="_blank" rel="noopener noreferrer">国家电影局 ↗</a></div>'+ '<div class="mi-cn-news-results" aria-live="polite"></div>';
 target.appendChild(box);
 box.addEventListener('toggle',async()=>{
  if(!box.open||box.dataset.loaded)return;
  const pane=box.querySelector('.mi-cn-news-results');pane.textContent=t('读取国内影视资讯…','Loading Chinese film news…');
  const d=await news();
  if(!pane.isConnected)return;
  if(d?.schema!==1||!Array.isArray(d.items)||d.items.length<1){pane.innerHTML='<p class="mi-caption">'+t('资讯源暂未更新，可直接查看 1905 电影网。','Source snapshot unavailable; open 1905.com directly.')+'</p><a href="https://www.1905.com/news/" target="_blank" rel="noopener noreferrer">1905 电影网 ↗</a>';return;}
  const cards=d.items.slice(0,9).filter(x=>safe(x.url)&&x.title);
  pane.innerHTML='<div class="mi-cn-news-list">'+cards.map(x=>'<article><small>'+esc(x.source||'')+' · '+esc(fmtDate(x.date))+'</small><a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">'+esc(x.title)+' ↗</a></article>').join('')+'</div>'+
    '<p class="mi-caption">'+t('仅聚合标题、日期与原文链接。','Headlines, dates and original links only.')+'</p>';
  box.dataset.loaded='1';
 });
}
root.addEventListener('liangyou:media-detail',e=>{
 const info=e.detail;if(!info)return;
 insertAutoRatings(info);insertBoxOffice(info);domesticNews(info);
});
})();
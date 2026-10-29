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
const knownYear=value=>{
 const match=String(value||'').match(/(?:19|20)\d{2}/);
 return match?Number(match[0]):null;
};
const verifyYear=(v,year)=>knownYear(v)===Number(year);
async function fetchJSON(url,ms=12000){const r=await fetch(url,{signal:AbortSignal.timeout(ms)});if(!r.ok)throw Error('source_unavailable');return r.json();}
function safe(u){try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password?x.href:null;}catch{return null;}}
function fmtDate(s){const n=Date.parse(s||'');return Number.isFinite(n)?new Intl.DateTimeFormat(english()?'en-US':'zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(n)):'';}
function numberWan(x){return x&&x.unit==='万元'&&Number.isFinite(x.value)&&x.value>=0?x.value:null;}
const yuan=x=>x>=10000?(x/10000).toLocaleString('zh-CN',{maximumFractionDigits:2})+t(' 亿元',' × 100M CNY'):x.toLocaleString('zh-CN',{maximumFractionDigits:2})+t(' 万元',' × 10K CNY');
async function lookupFilm(info){
 const year=Number(String(info.year||'').slice(0,4));
 if(info.kind!=='movie'||!Number.isInteger(year)||year<2017||year>new Date().getFullYear()||!sameTitle(info.title))return null;
 const key=year+'|'+sameTitle(info.title);
 const existing=lookupCache.get(key);
 if(existing&&existing.until>Date.now())return existing.promise;
 const promise=(async()=>{
  const list=await fetchJSON(endpoint+'/api/search?year='+year+'&name='+encodeURIComponent(info.title),13000);
  if(list.code!==0||Number(list.year)!==year||!Array.isArray(list.data))return null;
  const rows=list.data.filter(x=>sameTitle(x.title)===sameTitle(info.title)&&/^\d{8,14}$/.test(String(x.movieCode||''))&&
   verifyYear(x.releaseDate||'',year));
  // Names which collide with another release or are absent never auto-join.
  if(rows.length!==1)return null;
  const found=rows[0],body=await fetchJSON(endpoint+'/api/movie/'+found.movieCode,12000);
  const detailYear=knownYear(body.releaseDescription);
  if(body.code!==0||String(body.movieCode)!==String(found.movieCode)||sameTitle(body.title)!==sameTitle(info.title)||
   !verifyYear(found.releaseDate,year)||(detailYear!==null&&detailYear!==year))return null;
  const valid=body.ratings&&['maoyan','douban','taopiaopiao'].every(k=>body.ratings[k]===null||
   Number.isFinite(body.ratings[k])&&body.ratings[k]>0&&body.ratings[k]<=10);
  return valid?body:null;
 })().catch(()=>null);
 lookupCache.set(key,{promise,until:Date.now()+90000});
 promise.then(result=>{
  if(lookupCache.get(key)?.promise===promise)lookupCache.get(key).until=Date.now()+(result?30*60000:90000);
 });
 return promise;
}
function insertAutoRatings(info){
 if(info.section!=='ratings'||info.kind!=='movie')return;
 const target=root.querySelector('#media-dialog .mi-ratings-section');
 if(!target)return;
 const shell=document.createElement('section');
 shell.className='mi-cn-auto mi-cn-scores';
 shell.innerHTML='<p class="mi-caption">'+t('正在核对电影与国内评分来源…','Checking identity for mainland rating sources…')+'</p>';
 const holder=target.querySelector('[data-mi-ratings-slot="domestic"]');
 if(holder)holder.appendChild(shell);else target.appendChild(shell);
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
 const slot=target.querySelector('[data-mi-boxoffice-slot="mainland"]');
 if(slot)slot.appendChild(shell);else target.prepend(shell);
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
function headlineMatch(headline,info){
 const raw=String(headline||'').normalize('NFKC').trim(),s=sameTitle(raw);
 const names=[info.title,info.originalTitle,...(Array.isArray(info.aliases)?info.aliases:[])]
  .filter(x=>typeof x==='string'&&x.trim().length>=2).slice(0,35);
 let score=0;
 for(const alias of names){
  const name=alias.normalize('NFKC').trim(),n=sameTitle(name);
  if(!n||n.length<2)continue;
  const quoted=['《'+name+'》','〈'+name+'〉','「'+name+'」','『'+name+'』','“'+name+'”',"'"+name+"'"]
   .some(q=>raw.toLowerCase().includes(q.toLowerCase()));
  if(quoted){score=Math.max(score,100+Math.min(n.length,20));continue;}
  if(/[\u3400-\u9fff\uac00-\ud7af]/.test(n)){
   if(n.length>=4&&s.includes(n))score=Math.max(score,70+Math.min(n.length,20));
  }else if(n.length>=4){
   // Only complete Latin titles can match. An empty normalized query must never match.
   const words=x=>String(x).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
   const needle=words(name),haystack=words(raw);
   if(needle.length>=4&&haystack&&(' '+haystack+' ').includes(' '+needle+' '))
    score=Math.max(score,65+Math.min(n.length,20));
  }
 }
 return score;
}
function domesticNews(info){
 if(info.section!=='discover')return;
 const target=root.querySelector('#media-dialog .mi-detail-content');if(!target)return;
 const holder=target.querySelector('[data-mi-discover-slot="domestic"]');
 // Verified aliases can arrive after an article has already appeared. Reuse the
 // current section rather than clearing its links back to a loading placeholder.
 const box=holder?.querySelector('.mi-cn-title-news')||document.createElement('section');
 if(!box.isConnected){
  box.className='mi-insight-block mi-cn-title-news';
  box.innerHTML='<div class="mi-insight-head"><h3>'+t('国内新闻','Chinese news')+'</h3><span class="mi-tech-tag">'+t('影视资讯','Film coverage')+'</span></div>'+
   '<div class="mi-cn-news-results" aria-live="polite"><p class="mi-caption">'+t('正在匹配相关新闻…','Matching relevant articles…')+'</p></div>';
  if(holder)holder.replaceChildren(box);else target.appendChild(box);
 }
 (async()=>{
  // Start optional source discovery in parallel with local snapshots to limit mobile waiting.
  const liveSearch=window.LiangYouTitleNews?.remoteForInfo?.(info);
  // A verified TMDB-ID article is eligible regardless of whether it is official or community authored.
  const feedPending=news();
  const verified=await (window.LiangYouTitleNews?.forInfo(info)??Promise.resolve(null));
  const pane=box.querySelector('.mi-cn-news-results');if(!pane?.isConnected)return;
  let d=null,remoteArticles=[],remoteDone=!(liveSearch&&typeof liveSearch.then==='function'),feedDone=false;
  function renderAdditional(dynamic=[]){
    const published=Date.parse(d?.updatedAt||''),age=Date.now()-published;
    const live=d?.schema===1&&Array.isArray(d.items)&&Number.isFinite(age)&&age>=0&&age<=7*86400000?d.items:[];
    const score=x=>x.type==='community'?60:130+Math.min(25,Math.max(0,Number(x.relevance||100)-100));
    const identityNews=(verified?.articles||[]).filter(x=>x.language==='zh')
      .map(x=>({...x,confidence:score(x)}));
    const seenUrl=new Set(),seenTitle=new Set();
    const candidates=[...dynamic.map(x=>({...x,confidence:score(x)})),...identityNews,...live.map(x=>({...x,confidence:headlineMatch(x.title,info)}))]
     .filter(x=>x.confidence>0&&safe(x.url)&&x.title)
     .sort((a,b)=>b.confidence-a.confidence||
       (Number.isSafeInteger(b.likes)?b.likes:-1)-(Number.isSafeInteger(a.likes)?a.likes:-1)||
       Date.parse(b.date||0)-Date.parse(a.date||0))
     .filter(x=>{
      const u=safe(x.url),name=sameTitle(x.title.replace(/\s[-–—|]\s[^–—|]{2,60}$/,''));
      if(seenUrl.has(u)||seenTitle.has(name))return false;
      seenUrl.add(u);seenTitle.add(name);return true;
     });
    const publisherCounts=new Map();
    const diverse=candidates.filter(x=>{
      const publisher=x.source||new URL(x.url).hostname,count=publisherCounts.get(publisher)||0;
      publisherCounts.set(publisher,count+1);return count<2;
    }).slice(0,6);
    const selected=new Set(diverse.map(x=>x.url));
    const matched=[...diverse,...candidates.filter(x=>!selected.has(x.url))].slice(0,6);
    if(!matched.length){
      const ongoing=!remoteDone||!feedDone;
      pane.innerHTML='<p class="mi-caption">'+(ongoing?
        t('正在进一步检索这部作品的相关报道…','Searching more sources for this title…'):
        t('目前没有找到能与这部作品准确对应的国内报道。','No verified Chinese headlines for this title.'))+'</p>';
      return;
    }
    pane.innerHTML='<div class="mi-insight-news mi-editorial-grid">'+matched.map(x=>
     '<article class="mi-editorial-card"><div class="mi-editorial-body"><span>'+
     esc(x.source||'')+' · '+esc(fmtDate(x.date))+'</span><strong>'+
     '<a href="'+esc(safe(x.url))+'" target="_blank" rel="noopener noreferrer">'+esc(x.title)+'</a>'+
     '</strong></div></article>').join('')+'</div>';
  }
  // Show ID-verified editorial articles as soon as the local index is ready.
  // Do not wait for the global feed or an optional cross-border RSS service.
  renderAdditional();
  feedPending.then(snapshot=>{
    feedDone=true;if(!pane.isConnected)return;
    d=snapshot;renderAdditional(remoteArticles);
  }).catch(()=>{
    feedDone=true;if(pane.isConnected)renderAdditional(remoteArticles);
  });
  if(liveSearch&&typeof liveSearch.then==='function')liveSearch.then(remote=>{
    remoteArticles=(remote?.articles||[]).filter(x=>x.language==='zh');
  }).catch(()=>{}).finally(()=>{
    remoteDone=true;
    if(pane.isConnected)renderAdditional(remoteArticles);
  });
 })().catch(()=>{if(box.isConnected)box.querySelector('.mi-cn-news-results').textContent=t('相关报道暂不可用。','Coverage temporarily unavailable.');});
}
root.addEventListener('liangyou:media-detail',e=>{
 const info=e.detail;if(!info)return;
 insertAutoRatings(info);insertBoxOffice(info);domesticNews(info);
});
// TMDB-ID-confirmed names help Chinese, Hong Kong and Taiwan film-title matches.
root.addEventListener('liangyou:media-verified-aliases',e=>{
 const info=e.detail;
 if(info?.section==='discover'&&Number.isSafeInteger(Number(info.tmdbId)))
   domesticNews(info);
});
})();

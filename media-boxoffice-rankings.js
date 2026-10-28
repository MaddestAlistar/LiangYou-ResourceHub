/* Independent rankings only, never attached to an individual film's gross. */
(function(){
 'use strict';
 const root=document.getElementById('media');if(!root)return;
 const cn='https://liangyou-maoyan-verified.maddestalistar.workers.dev/api/rankings/alltime';
 const cache=new Map();
 const english=()=>document.documentElement.lang.toLowerCase().startsWith('en');
 const t=(cn,en)=>english()?en:cn;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const moneyUSD=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
 const moneyCNY=wan=>(wan/10000).toLocaleString('zh-CN',{maximumFractionDigits:2})+t(' 亿元',' ×100M CNY');
 const validLink=x=>{try{const u=new URL(x);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
 async function fetchJSON(url,timeout=11000){
  const resp=await fetch(url,{signal:AbortSignal.timeout(timeout),cache:'no-cache'});
  if(!resp.ok)throw Error('unavailable');
  return resp.json();
 }
 function panel(id,title,desc,source){
  return '<details class="mi-ranking-drawer" data-mi-ranking="'+id+'"><summary>'+title+'</summary>'+
   '<p class="mi-caption">'+desc+'</p><div class="mi-ranking-result" aria-live="polite"></div>'+
   (source?'<p class="mi-caption"><a href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">'+t('查看数据来源','View source')+' ↗</a></p>':'')+'</details>';
 }
 function render(info){
  if(info?.section!=='boxoffice'||info.kind!=='movie')return;
  const host=root.querySelector('#media-boxoffice-rankings');
  if(!host)return;
  host.innerHTML='<div class="mi-ranking-header"><h3>'+t('独立票房排行榜','Independent box-office charts')+'</h3>'+
   '<p class="mi-caption">'+t('以下为地区与全球榜单，不属于当前电影的票房数据。按需展开读取。','These charts are independent of the title above. Expand to load each source.')+'</p></div>'+
   panel('world-current',t('全球累计票房参考榜 · 定期更新','Worldwide all-time · regularly refreshed'),
    t('基于维基百科公开榜单的社区整理快照，非官方实时票房数据；具体金额以来源为准。','A periodically captured community-maintained Wikipedia table, not an audited live feed.'),
    'https://en.wikipedia.org/wiki/List_of_highest-grossing_films')+
   panel('china',t('中国内地累计票房榜','Mainland China all-time cumulative gross'),
    t('第三方页面数据，人民币亿元；排名与更新时间以数据源为准。','Third-party page data, CNY. Confirm freshness with original source.'),
    'https://m.maoyan.com/board/4')+
   panel('korea',t('韩国每日票房 · KOFIC','Korea daily box office · KOFIC'),
    t('官方韩国每日榜单，不是当前影片的单片票房。','Official Korean daily chart; not this film’s gross.'),
    'https://www.kobis.or.kr/kobisopenapi/homepg/main/main.do');
 }
 function entries(rows,format){
  return '<ol class="mi-ranking-list">'+rows.map(x=>{
   const href=validLink(x.url);
   return '<li><span class="mi-ranking-index">'+esc(x.rank)+'</span><span class="mi-ranking-name">'+
    (href?'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(x.title)+' ↗</a>':esc(x.title))+
    '</span><strong>'+esc(format(x))+'</strong></li>';
  }).join('')+'</ol>';
 }
 async function load(key){
  const target=root.querySelector('.mi-ranking-drawer[data-mi-ranking="'+key+'"]');
  const pane=target?.querySelector('.mi-ranking-result');
  if(!target||!pane||pane.dataset.loading==='yes'||pane.dataset.ready==='yes')return;
  pane.dataset.loading='yes';pane.textContent=t('正在核验榜单…','Checking verified chart…');
  try{
   let body;
   if(!cache.has(key)){
    const path=key==='world-current'?'./data/media-worldwide-current.json':key==='korea'?'./data/kofic-boxoffice.json':cn;
    cache.set(key,fetchJSON(path).catch(err=>{cache.delete(key);throw err;}));
   }
   body=await cache.get(key);
   if(!pane.isConnected)return;
   if(key==='world-current'){
    const age=Date.now()-Date.parse(body.retrievedAt||'');
    if(body.schema!==1||body.status!=='source_snapshot_not_real_time'||
       body.source!=='Wikipedia, List of highest-grossing films (community maintained)'||
       !Array.isArray(body.rows)||body.rows.length<15||!Number.isFinite(age)||age<0||age>96*3600000)
      throw Error('current worldwide snapshot stale or invalid');
    const rows=body.rows.slice(0,15);
    if(rows.some((x,i)=>x.rank!==i+1||typeof x.title!=='string'||!Number.isSafeInteger(x.usd)||x.usd<=0)||
       rows.some((x,i)=>i>0&&x.usd>rows[i-1].usd))throw Error('worldwide order invalid');
    pane.innerHTML='<p class="mi-caption">'+t('社区榜单快照 · ','Community chart snapshot · ')+
      esc(new Date(body.retrievedAt).toLocaleDateString(english()?'en-US':'zh-CN'))+
      ' · '+t('非官方实时票房','Not an official live feed')+'</p>'+
      entries(rows,x=>moneyUSD(x.usd))+
      '<p class="mi-caption">'+t('维基百科社区维护数据，可能修订，排名及金额不保证与商业票房平台完全一致。','Community-edited numbers may change and differ from commercial databases.')+'</p>';
   }else if(key==='china'){
    if(body.code!==0||!Array.isArray(body.data)||body.data.length<3)throw Error('invalid mainland chart');
    const rows=body.data.slice(0,20).map((x,i)=>({
     rank:Number(x.rank)||i+1,title:x.title,url:Number.isSafeInteger(x.movieId)?'https://m.maoyan.com/asgard/movie/'+x.movieId:'',
     wan:x.cumulativeBoxOffice?.unit==='万元'?x.cumulativeBoxOffice.value:null
    })).filter(x=>x.title&&Number.isFinite(x.wan)&&x.wan>=0);
    if(rows.length<3)throw Error('invalid numbers');
    pane.innerHTML=entries(rows,x=>moneyCNY(x.wan))+
       '<p class="mi-caption">'+t('第三方数据快照：','Third-party snapshot: ')+esc(String(body.fetchedAt||body.updatedAt||t('时间未标注','undated')).slice(0,19))+'</p>';
   }else{
    const age=Date.now()-Date.parse(body.checkedAt);
    if(body.ok!==true||body.status!=='ok'||!Array.isArray(body.data)||body.data.length<3||!Number.isFinite(age)||age<0||age>72*3600000)throw Error('korea snapshot stale');
    const rows=body.data.slice(0,10).map((x,i)=>({
      rank:Number(x.rank)||i+1,title:x.title||'',audience:x.audience,sales:x.salesKRW
    })).filter(x=>x.title);
    pane.innerHTML='<p class="mi-caption">'+esc(body.date)+' · '+t('韩元及当日观众统计','KRW and daily admissions')+'</p>'+
     entries(rows,x=>t('观众 ','Admissions ')+(Number.isFinite(x.audience)?x.audience.toLocaleString():'—')+
      (Number.isFinite(x.sales)?' · ₩'+x.sales.toLocaleString():''));
   }
   pane.dataset.ready='yes';
  }catch{
   if(pane.isConnected)pane.innerHTML='<p class="mi-caption">'+t('榜单暂不可用或已过期，未展示未经核验的数据。','Chart is unavailable or stale; unverified data is hidden.')+'</p>';
  }finally{if(pane.isConnected)delete pane.dataset.loading;}
 }
 root.addEventListener('liangyou:media-detail',e=>render(e.detail));
 root.addEventListener('toggle',e=>{
  if(!e.target.matches('.mi-ranking-drawer')||!e.target.open)return;
  load(e.target.dataset.miRanking);
 },true);
})();
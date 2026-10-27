/* Language switch and verified prediction-market snapshot loader.
 * Market records feed the official fixture cards; no standalone market list.
 */
(()=>{
 'use strict';
 const section=document.getElementById('sports');
 const buttons=[...document.querySelectorAll('#sportsLanguage [data-sports-lang]')];
 if(!section)return;
 const storageKey='liangyou-sports-lang-v1';
 let language='zh';
 try{if(localStorage.getItem(storageKey)==='en')language='en';}catch{}
 const intros={
  zh:'赛事日历、电竞晋级图与联赛积分榜，赛前预测可在对应赛事详情中查看。',
  en:'Match calendar, esports brackets and league standings, with matching pre-match market snapshots inside each fixture.'
 };
 function setLanguage(value){
  language=value==='en'?'en':'zh';
  section.setAttribute('lang',language);
  const intro=section.querySelector('[data-sports-t="intro"]');
  if(intro)intro.textContent=intros[language];
  const title=section.querySelector('#sports-title');
  if(title)title.textContent=language==='zh'?'赛事数据中心':'Sports data center';
  buttons.forEach(button=>{
   const yes=button.dataset.sportsLang===language;
   button.classList.toggle('is-active',yes);
   button.setAttribute('aria-pressed',String(yes));
  });
 }
 setLanguage(language);
 buttons.forEach(button=>button.addEventListener('click',()=>{
  setLanguage(button.dataset.sportsLang);
  try{localStorage.setItem(storageKey,language);}catch{}
 }));
 const feeds=[
  {url:'./data/sports.json',provider:'polymarket'},
  {url:'./data/predict-sports.json',provider:'predict'},
  {url:'./data/kalshi-sports.json',provider:'kalshi'}
 ];
 let busy=false,lastAttempt=0;
 function verifiedFeed(data,provider){
  if(data?.schema!==1||data.source_type!=='prediction_market'||!Array.isArray(data.events))return null;
  const stamp=Date.parse(data.generated_at);
  if(!Number.isFinite(stamp)||stamp>Date.now()+3600000||Date.now()-stamp>6*3600000)return null;
  return data.events.filter(item=>item&&item.verification==='open_match_winner_market'&&
   Array.isArray(item.outcomes)&&[2,3].includes(item.outcomes.length)&&
   Number.isFinite(Date.parse(item.start_time))&&
   Number.isFinite(Date.parse(item.checked_at))&&
   item.outcomes.every(x=>x.name&&x.market_id&&Number.isFinite(x.probability)&&
    x.probability>=0&&x.probability<=1)).map(item=>({...item,provider}));
 }
 async function refresh(){
  if(busy||(lastAttempt&&Date.now()-lastAttempt<15*60000))return;
  busy=true;lastAttempt=Date.now();
  try{
   const results=await Promise.allSettled(feeds.map(async source=>{
    const response=await fetch(source.url,{cache:'no-cache',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Prediction feed unavailable');
    return verifiedFeed(await response.json(),source.provider);
   }));
   window.LiangYouMarketRecords=results.flatMap(x=>x.status==='fulfilled'&&x.value?x.value:[])
    .filter(item=>Date.parse(item.checked_at)<=Date.now()+3600000&&
     Date.now()-Date.parse(item.checked_at)<=6*3600000);
  }catch{
   window.LiangYouMarketRecords=[];
  }finally{
   busy=false;
   if(typeof CustomEvent==='function')
    window.dispatchEvent(new CustomEvent('liangyou:markets-updated'));
  }
 }
 window.LiangYouMarketRecords=[];
 refresh();
 window.setInterval(()=>{if(!document.hidden)refresh();},20*60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();

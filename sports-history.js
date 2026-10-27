/* Historical market-implied probabilities, verified snapshots only.
 * Data is recorded by the existing collector; no extra API requests.
 */
(()=>{
'use strict';
const panel=document.getElementById('officialFixtures');if(!panel)return;
let historyPromise=null,historyLoadedAt=0;
const encode=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const en=()=>document.getElementById('sports')?.getAttribute('lang')==='en';
const texts=()=>en()?{
 wait:'Reading historical snapshots…',empty:'There are not yet two verified snapshots for this match.',
 noDay:'Not enough historical points for this period.',
 title:'Pre-match implied probability history',note:'Market snapshots only. Not an official win probability, bookmaker odds, or live data.',
 choose:'Source',day:'24 hours',week:'7 days',asOf:'Last sample',
 chart:'Implied probability from stored public market snapshots',
 failed:'Historical snapshot is currently unavailable.'
}:{
 wait:'正在读取历史快照…',empty:'本场暂未积累至少两次可核验的历史采样。',
 noDay:'所选时间范围内暂时没有足够的数据点。',
 title:'赛前市场隐含概率走势',note:'仅展示公开市场历史快照，不是官方胜率、传统赔率或实时数据。',
 choose:'数据来源',day:'24小时',week:'7天',asOf:'最后采集',
 chart:'历史公开市场快照隐含概率',
 failed:'历史快照暂时不可用。'
};
function load(){
 // Reuse a recent download without freezing the chart at one session's first snapshot.
 if(historyPromise&&Date.now()-historyLoadedAt<10*60000)return historyPromise;
 historyLoadedAt=Date.now();
 historyPromise=fetch('./data/market-history.json',{
  cache:'no-cache',signal:AbortSignal.timeout(14000)
 }).then(r=>{if(!r.ok)throw Error('Missing snapshot');return r.json();})
 .then(x=>x?.schema===1&&x.source_type==='verified_market_history'&&x.markets&&
  typeof x.markets==='object'&&!Array.isArray(x.markets)?x:null)
 .catch(error=>{historyPromise=null;throw error;});
 return historyPromise;
}
function snapshots(fixture,raw){
 const link=window.LiangYouSportsLinks;
 const markets=link?.marketsFor(fixture,window.LiangYouMarketRecords||[])||[];
 const found=[];
 for(const item of markets.flatMap(x=>x.sources)){
  const id=item.provider+':'+item.id;
  const archive=raw.markets[id];
  if(!archive||archive.provider!==item.provider||String(archive.id)!==String(item.id)||
    !Array.isArray(archive.points))continue;
  const points=archive.points.map(p=>{
   const at=Date.parse(p.at);
   const outcomes=Array.isArray(p.outcomes)?p.outcomes:[];
   return {at,outcomes:outcomes.filter(x=>Array.isArray(x)&&
      typeof x[0]==='string'&&Number.isFinite(x[1])&&x[1]>=0&&x[1]<=1)};
  }).filter(p=>Number.isFinite(p.at)&&p.at<=Date.now()+3600000&&p.outcomes.length>=2)
   .sort((a,b)=>a.at-b.at);
  if(points.length<2)continue;
  const label=points.at(-1).outcomes[0]?.[0];
  const series=points.map(p=>({at:p.at,p:p.outcomes.find(o=>o[0]===label)?.[1]}))
   .filter(x=>Number.isFinite(x.p));
  if(series.length>=2)found.push({key:id,provider:item.provider,label,points:series});
 }
 return found.sort((a,b)=>b.points.length-a.points.length);
}
function plot(record,days){
 const t=texts(),cutoff=Date.now()-days*86400000;
 const samples=record.points.filter(x=>x.at>=cutoff).slice(-90);
 if(samples.length<2)return '<p class="sports-trend-msg">'+encode(t.noDay)+'</p>';
 const width=680,height=220,left=44,right=18,top=18,bottom=35;
 const min=samples[0].at,max=samples.at(-1).at;
 if(max<=min)return '<p class="sports-trend-msg">'+encode(t.noDay)+'</p>';
 const px=time=>left+(time-min)/(max-min)*(width-left-right);
 const py=prob=>top+(1-prob)*(height-top-bottom);
 const coords=samples.map(p=>px(p.at).toFixed(1)+','+py(p.p).toFixed(1)).join(' ');
 const end=samples.at(-1),first=samples[0];
 const labelTime=v=>new Intl.DateTimeFormat(en()?'en-GB':'zh-CN',{
  timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',
  minute:'2-digit',hour12:false
 }).format(new Date(v));
 const ticks=[0,.5,1].map(value=>
  '<line x1="'+left+'" x2="'+(width-right)+'" y1="'+py(value)+'" y2="'+py(value)+'" '+
  'stroke="rgba(176,195,212,.22)" stroke-dasharray="4 5"/>'+
  '<text x="'+(left-7)+'" y="'+(py(value)+4)+'" text-anchor="end" '+
  'fill="#9fb7ce" font-size="13">'+Math.round(value*100)+'%</text>').join('');
 return '<svg class="sports-trend-chart" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+
  encode(t.chart+': '+record.label)+'">'+ticks+
  '<polyline fill="none" stroke="#e6bd7e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="'+coords+'"/>'+
  '<circle cx="'+px(end.at)+'" cy="'+py(end.p)+'" r="5" fill="#f3d297"/>'+
  '<text x="'+left+'" y="'+(height-9)+'" fill="#9fb7ce" font-size="13">'+encode(labelTime(first.at))+'</text>'+
  '<text x="'+(width-right)+'" y="'+(height-9)+'" text-anchor="end" fill="#9fb7ce" font-size="13">'+
  encode(labelTime(end.at))+'</text></svg>'+
  '<div class="sports-trend-stat"><span>'+encode(record.label)+'</span><strong>'+
  (end.p*100).toFixed(1)+'%</strong><span>'+encode(t.asOf)+' · '+encode(labelTime(end.at))+
  ' · '+samples.length+(en()?' points':'个样本')+'</span></div>';
}
function show(container,records,range='1',selected=null){
 const t=texts();
 const chosen=records.find(x=>x.key===selected)||records[0];
 if(!chosen){container.innerHTML='<p class="sports-trend-msg">'+encode(t.empty)+'</p>';return;}
 const button=(value,label)=>'<button type="button" data-history-range="'+value+
  '" aria-pressed="'+(range===value)+'">'+label+'</button>';
 container.innerHTML='<div class="sports-trend-bar"><label>'+encode(t.choose)+
  '<select data-history-provider>'+records.map(item=>'<option value="'+encode(item.key)+'"'+
  (item.key===chosen.key?' selected':'')+'>'+encode(item.provider)+'</option>').join('')+'</select></label>'+
  '<div>'+button('1',t.day)+button('7',t.week)+'</div></div>'+
  plot(chosen,Number(range))+
  '<p class="sports-trend-note">'+encode(t.note)+'</p>';
 container.dataset.historyKey=chosen.key;container.dataset.historyRange=range;
}
panel.addEventListener('click',async ev=>{
 const open=ev.target.closest?.('[data-trend-open]');
 if(open){
  const id=open.dataset.trendOpen;
  const target=open.closest('.fixtures-trend')?.querySelector('[data-trend-content]');
  const fixture=(window.LiangYouOfficialSportsEvents||[]).find(x=>String(x.id)===String(id));
  if(!fixture||!target)return;
  target.hidden=false;target.innerHTML='<p class="sports-trend-msg">'+encode(texts().wait)+'</p>';
  open.hidden=true;
  try{
   const feed=await load();
   if(!target.isConnected)return;
   if(!feed){target.innerHTML='<p class="sports-trend-msg">'+encode(texts().failed)+'</p>';return;}
   const records=snapshots(fixture,feed);
   target._historyRecords=records;
   show(target,records);
  }catch{
   if(target.isConnected)target.innerHTML='<p class="sports-trend-msg">'+encode(texts().failed)+'</p>';
  }
  return;
 }
 const range=ev.target.closest?.('[data-history-range]');
 if(range){
  const content=range.closest('[data-trend-content]');
  if(content?._historyRecords)show(content,content._historyRecords,
   range.dataset.historyRange,content.dataset.historyKey);
 }
});
panel.addEventListener('change',ev=>{
 const source=ev.target.closest?.('[data-history-provider]');
 if(!source)return;
 const content=source.closest('[data-trend-content]');
 if(content?._historyRecords)show(content,content._historyRecords,
  content.dataset.historyRange||'1',source.value);
});
})();

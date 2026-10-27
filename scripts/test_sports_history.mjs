import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync('index.html','utf8');
const fixtureScript=readFileSync('fixtures.js','utf8');
const script=readFileSync('sports-history.js','utf8');
const css=readFileSync('sports-history.css','utf8');
assert(html.includes('sports-history.js?')&&html.includes('sports-history.css?'));
assert(fixtureScript.includes('data-trend-open'));
assert(script.includes('verified_market_history')&&script.includes('marketsFor('));
assert(css.includes('@media(max-width:500px)'));
const callbacks={};
const fixture={id:'match-1',sport:'lol',home:'T1',away:'GEN',
  start_time:new Date(Date.now()+86400000).toISOString()};
const holder={isConnected:true,hidden:true,innerHTML:'',dataset:{}};
const wrapper={querySelector(sel){return sel==='[data-trend-content]'?holder:null}};
const opened={dataset:{trendOpen:'match-1'},hidden:false,closest(sel){
 return sel==='.fixtures-trend'?wrapper:null;
}};
const panel={addEventListener(t,fn){callbacks[t]=fn}};
const sportSection={getAttribute(){return 'zh'}};
const now=Date.now();
const iso=offset=>new Date(now+offset).toISOString();
const raw={schema:1,source_type:'verified_market_history',markets:{
 'polymarket:sample-1':{provider:'polymarket',id:'sample-1',points:[
   {at:iso(-2*3600000),outcomes:[['T1',.61],['GEN',.39]]},
   {at:iso(-3600000),outcomes:[['T1',.66],['GEN',.34]]}
 ]}
}};
let requests=0;
const windowMock={
 LiangYouSportsLinks:{marketsFor:()=>[{sources:[{provider:'polymarket',id:'sample-1'}]}]},
 LiangYouOfficialSportsEvents:[fixture],LiangYouMarketRecords:[]
};
const ctx={window:windowMock,document:{getElementById(id){return id==='officialFixtures'?panel:id==='sports'?sportSection:null}},
 AbortSignal:{timeout:()=>({})},
 fetch:async url=>{requests++;assert.equal(url,'./data/market-history.json');return {ok:true,json:async()=>raw}},
 Date,Intl,console};
vm.runInNewContext(script,ctx,{timeout:3000});
assert.equal(typeof callbacks.click,'function');
await callbacks.click({target:{closest(sel){return sel==='[data-trend-open]'?opened:null}}});
assert.equal(holder.hidden,false);
assert.equal(opened.hidden,true);
assert(holder.innerHTML.includes('<polyline'),'Two verified points must produce a chart');
assert(holder.innerHTML.includes('66.0%'),'Observed percentage must be displayed without forecast');
assert(holder.innerHTML.includes('非')||holder.innerHTML.includes('不是'));
assert.equal(requests,1);
const dayButton={dataset:{historyRange:'7'},closest(sel){return sel==='[data-trend-content]'?holder:null}};
await callbacks.click({target:{closest(sel){return sel==='[data-history-range]'?dayButton:null}}});
assert(holder.innerHTML.includes('<polyline')&&holder.dataset.historyRange==='7');
assert.equal(requests,1,'Toggle uses locally cached snapshot');
raw.markets['polymarket:sample-1'].points.splice(0,1);
opened.hidden=false;holder.innerHTML='';
await callbacks.click({target:{closest(sel){return sel==='[data-trend-open]'?opened:null}}});
assert(!holder.innerHTML.includes('<polyline'),'Single observation must never be drawn as a trend');
assert(holder.innerHTML.includes('两次'));
// A malformed archived JSON must show a clear error, and a later click may retry.
const retryListeners={};
const retryBox={hidden:true,innerHTML:'',isConnected:true,dataset:{}};
const retryButton={dataset:{trendOpen:'match-1'},hidden:false,closest(sel){
 return sel==='.fixtures-trend'?{querySelector:()=>retryBox}:null;
}};
const retryWindow={
 LiangYouSportsLinks:windowMock.LiangYouSportsLinks,
 LiangYouOfficialSportsEvents:[fixture],LiangYouMarketRecords:[]
};
let retryCount=0,invalid=true;
vm.runInNewContext(script,{
 window:retryWindow,
 document:{getElementById(id){
  return id==='officialFixtures'?{addEventListener:(t,fn)=>{retryListeners[t]=fn}}:
   id==='sports'?sportSection:null;
 }},
 fetch:async()=>{
  retryCount++;
  return {ok:true,json:async()=>invalid?{schema:1,source_type:'verified_market_history',markets:null}:raw};
 },AbortSignal:{timeout:()=>({})},Date,Intl,console
},{timeout:3000});
const tryOpen=()=>retryListeners.click({
 target:{closest:sel=>sel==='[data-trend-open]'?retryButton:null}
});
await tryOpen();
assert(retryBox.innerHTML.includes('不可用'), 'A malformed history response must not spin indefinitely');
invalid=false;retryButton.hidden=false;
raw.markets['polymarket:sample-1'].points.push({
 at:iso(-30*60000),outcomes:[['T1',.68],['GEN',.32]]
});
await tryOpen();
assert.equal(retryCount,2,'Failed history downloads must be retried');
assert(retryBox.innerHTML.includes('<polyline'),'Newly valid historical data must render');
console.log('PASS: Malformed historical feeds show a failure and recover on retry.');

console.log('PASS: Lazy historical market chart, documented provenance, no fabricated trend for one sample.');

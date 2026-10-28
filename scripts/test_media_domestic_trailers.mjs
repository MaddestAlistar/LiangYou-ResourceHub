/* Verified domestic trailer integration: no guessing based on vague titles. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../media-insights.js',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../data/media-domestic-trailers.json',import.meta.url),'utf8'));
const start=source.indexOf('  function domesticTrailerPanel(info,records=[]){');
const end=source.indexOf('  let worldNewsPromise=null;',start);
assert.ok(start>=0&&end>start,'Domestic renderer is available');
const sourcePart=source.slice(start,end);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\u0027':'&#39;'}[c]));
const safe=url=>{try{const u=new URL(url);return u.protocol==='https:'?u.href:null;}catch{return null;}};
const a=(url,label)=>safe(url)?'<a href="'+esc(safe(url))+'">'+esc(label)+'</a>':'';
const panel=new Function('t','esc','safe','a',sourcePart+';return domesticTrailerPanel;')((zh)=>zh,esc,safe,a);
const example={title:'哪吒之魔童闹海',originalTitle:'Ne Zha 2',kind:'movie',year:'2025-01-29',aliases:['哪吒2']};
test('all three mainland video sources have accessible real search or channel links',()=>{
 const h=panel({title:'任意影片',kind:'movie',year:'2026'},[]);
 assert.match(h,/search\.bilibili\.com\/all\?keyword=/);
 assert.match(h,/v\.qq\.com\/x\/search\/\?q=/);
 assert.match(h,/1905\.com\/news\/yg\//);
 assert.match(h,/暂无已核实的国内预告片/);
 assert.doesNotMatch(h,/data-mi-play-cn=/);
});
test('verified title/year displays embedded Bilibili video, 1905 original catalogue, no invented Tencent VID',()=>{
 const h=panel(example,catalog.items);
 assert.match(h,/data-mi-play-cn="bilibili"/);
 assert.match(h,/data-mi-cn-id="BV1zprUY2EGj"/);
 assert.match(h,/data-mi-cn-id="BV1ULFPeEEBh"/);
 assert.match(h,/https:\/\/www\.1905\.com\/mdb\/film\/2255731\//);
 assert.doesNotMatch(h,/data-mi-play-cn="tencent"/);
 assert.doesNotMatch(h,/data-mi-play-cn="1905"/);
});
test('year mismatch, name mismatch and unrecognized sources are not attached to the wrong work',()=>{
 for(const incorrect of [
  {...example,year:'2026-01-29'},
  {...example,title:'哪吒之魔童降世',originalTitle:'Ne Zha',aliases:[]}
 ]){
  const h=panel(incorrect,catalog.items);
  assert.doesNotMatch(h,/data-mi-play-cn=/);
  assert.doesNotMatch(h,/mdb\/film\/2255731/);
 }
});
test('Tencent verified VID can be embedded later, but arbitrary URLs or unsupported IDs cannot',()=>{
 const correct={title:'哪吒之魔童闹海',kind:'movie',year:2025,platform:'tencent',
  videoId:'c3278hj65i6',verifiedSource:'https://v.qq.com/x/page/c3278hj65i6.html',name:'Approved video'};
 const trusted=panel(example,[correct]);
 assert.match(trusted,/data-mi-play-cn="tencent"/);
 assert.match(trusted,/data-mi-cn-id="c3278hj65i6"/);
 for(const untrusted of [{...correct,verifiedSource:'https://attacker.example/video'},
                         {...correct,videoId:'javascript:evil'},{...correct,year:2024}]){
   assert.doesNotMatch(panel(example,[untrusted]),/data-mi-play-cn="tencent"/);
 }
});
test('official Bilibili and Tencent iframe hosts only, with exact identifiers',()=>{
 assert.match(source,/https:\/\/player\.bilibili\.com\/player\.html\?bvid=/);
 assert.match(source,/https:\/\/v\.qq\.com\/txp\/iframe\/player\.html\?vid=/);
 assert.match(source,/trailerStage\.replaceChildren\(\)/);
 assert.match(source,/playerSwitch\)playerSwitch\.hidden=true/);
 assert.match(source,/if\(playerSwitch\)playerSwitch\.hidden=false/);
});

/* One unified YouTube/Bilibili/Tencent video gallery; exact source matching only. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../media-insights.js',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../data/media-domestic-trailers.json',import.meta.url),'utf8'));
const start=source.indexOf('  function verifiedDomesticTrailers(info,records=[]){');
const end=source.indexOf('  let worldNewsPromise=null;',start);
assert.ok(start>=0&&end>start,'Merged trailer gallery and domestic matching must exist');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
const link=(url,label)=>safe(url)?'<a href="'+escape(safe(url))+'">'+escape(label)+'</a>':'';
const {gallery,verified}=new Function('t','esc','safe','a','formatDuration','english',
 source.slice(start,end)+';return {gallery:trailerGallery,verified:verifiedDomesticTrailers};')(
  (zh)=>zh,escape,safe,link,()=>'',()=>false
);
const selected={title:'哪吒之魔童闹海',originalTitle:'Ne Zha 2',kind:'movie',year:'2025-01-29',aliases:['哪吒2']};
const yt={trailers:[{id:'AbCdEf12345',title:'Official movie trailer',official:true,embeddable:true,url:'https://www.youtube.com/watch?v=AbCdEf12345'}]};
test('one section and one shared card grid contain YouTube and verified Bilibili entries',()=>{
 const h=gallery(yt,selected,catalog.items,'ready');
 assert.equal((h.match(/<h3>预告片\/相关视频<\/h3>/g)||[]).length,1);
 assert.equal((h.match(/class="mi-trailer-grid"/g)||[]).length,1);
 assert.equal((h.match(/class="mi-trailer-card"/g)||[]).length,3);
 assert.match(h,/data-mi-play-video="AbCdEf12345"/);
 assert.match(h,/data-mi-play-cn="bilibili"/);
 assert.match(h,/data-mi-cn-id="BV1zprUY2EGj"/);
 assert.match(h,/data-mi-cn-id="BV1ULFPeEEBh"/);
 assert.doesNotMatch(h,/国内预告片|mi-domestic-trailers|mi-cn-video-card/);
});
test('highly liked related clips are separate, capped at five, and open the same player',()=>{
 const clips=Array.from({length:8},(_,i)=>({
  id:'Video'+String(i).padStart(6,'0'),title:'Ne Zha 2 behind the scenes',likes:(i+1)*100,embeddable:true,
  url:'https://www.youtube.com/watch?v=Video'+String(i).padStart(6,'0')
 }));
 const h=gallery({...yt,relatedVideos:clips},selected,catalog.items);
 assert.match(h,/预告片\/相关视频/);
 assert.equal((h.match(/高赞相关视频<\/h4>/g)||[]).length,0);
 assert.equal((h.match(/class="mi-trailer-grid"/g)||[]).length,2);
 assert.equal((h.match(/高赞相关视频/g)||[]).length,6);
 assert.equal((h.match(/data-mi-play-video="Video/g)||[]).length,5);
 assert.doesNotMatch(h,/data-mi-play-video="Video000000"/);
 const rejected=gallery({relatedVideos:[{id:'BadVideo123',likes:999,embeddable:false}]},selected,[]);
 assert.doesNotMatch(rejected,/data-mi-play-video="BadVideo123"/);
});
test('missing YouTube data still shows verified mainland videos in exactly the same grid',()=>{
 const h=gallery({},selected,catalog.items,'error');
 assert.equal((h.match(/class="mi-trailer-grid"/g)||[]).length,1);
 assert.equal((h.match(/mi-trailer-card/g)||[]).length,2);
 assert.match(h,/data-mi-play-cn="bilibili"/);
 assert.doesNotMatch(h,/暂不可用/);
});
test('1905 is a collapsible search/source link and not a fake playable video',()=>{
 const h=gallery({},selected,catalog.items,'ready');
 assert.match(h,/1905\.com\/mdb\/film\/2255731\//);
 assert.match(h,/1905 · 当前作品资料/);
 assert.match(h,/search\.bilibili\.com\/all\?keyword=/);
 assert.match(h,/v\.qq\.com\/x\/search\/\?q=/);
 assert.doesNotMatch(h,/data-mi-play-cn="1905"/);
 assert.doesNotMatch(h,/mi-domestic-video-grid|国内预告片/);
 const unmatched=gallery({}, {...selected,year:'2026'},catalog.items);
 assert.match(unmatched,/1905\.com\/news\/yg\//);
 assert.doesNotMatch(unmatched,/mdb\/film\/2255731/);
});
test('unmatched title/year never attaches another movie trailer',()=>{
 for(const incorrect of [
  {...selected,year:'2026-01-29'},
  {...selected,title:'哪吒之魔童降世',originalTitle:'Ne Zha',aliases:[]}
 ]){
  assert.equal(verified(incorrect,catalog.items).length,0);
  assert.doesNotMatch(gallery({},incorrect,catalog.items),/data-mi-play-cn=/);
 }
});
test('Tencent needs exact verified VID and original URL before it becomes a playable card',()=>{
 const right={title:'哪吒之魔童闹海',kind:'movie',year:2025,platform:'tencent',
   videoId:'c3278hj65i6',verifiedSource:'https://v.qq.com/x/page/c3278hj65i6.html',name:'Verified trailer'};
 const ok=gallery({},selected,[right]);
 assert.match(ok,/data-mi-play-cn="tencent"/);
 assert.match(ok,/class="mi-trailer-card"/);
 for(const wrong of [{...right,verifiedSource:'https://attacker.example/video'},
  {...right,videoId:'javascript:evil'}, {...right,year:2024}]){
  assert.doesNotMatch(gallery({},selected,[wrong]),/data-mi-play-cn="tencent"/);
 }
});
test('mainland and YouTube playback share the same in-page modal; switching remains YouTube-only',()=>{
 assert.match(source,/https:\/\/player\.bilibili\.com\/player\.html\?bvid=/);
 assert.match(source,/https:\/\/v\.qq\.com\/txp\/iframe\/player\.html\?vid=/);
 assert.match(source,/button\.closest\('\.mi-trailer-card'\)/);
 assert.match(source,/trailerStage\.replaceChildren\(\)/);
 assert.match(source,/playerSwitch\)playerSwitch\.hidden=true/);
 assert.match(source,/if\(playerSwitch\)playerSwitch\.hidden=false/);
 assert.doesNotMatch(source,/mi-domestic-trailer-host|domesticTrailerPanel/);
});

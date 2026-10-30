/* One 20-video cross-provider gallery: YouTube, Bilibili, AcFun,
   Niconico and Dailymotion (external until site-owned Player ID exists).
   KinoCheck contributes exact-ID YouTube entries, not a second player.
*/
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../media-insights.js',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../data/media-domestic-trailers.json',import.meta.url),'utf8'));
const start=source.indexOf('  function verifiedDomesticTrailers(info,records=[]){');
const end=source.indexOf('  let worldNewsPromise=null;',start);
assert.ok(start>=0&&end>start);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
const link=(url,label)=>safe(url)?'<a href="'+escape(safe(url))+'">'+escape(label)+'</a>':'';
const {gallery,verified}=new Function('t','esc','safe','a','formatDuration','english',
 source.slice(start,end)+';return {gallery:trailerGallery,verified:verifiedDomesticTrailers};')(
 (zh)=>zh,escape,safe,link,()=>'',()=>false
);
const selected={title:'哪吒之魔童闹海',originalTitle:'Ne Zha 2',kind:'movie',year:'2025-01-29',aliases:['哪吒2']};
const yt={trailers:[{id:'AbCdEf12345',title:'Official trailer',official:true,embeddable:true}]};
test('one shared grid still displays YouTube and Bilibili video records',()=>{
 const h=gallery(yt,selected,catalog.items,'ready');
 assert.equal((h.match(/<h3>预告片\/相关视频<\/h3>/g)||[]).length,1);
 assert.equal((h.match(/class="mi-trailer-grid"/g)||[]).length,1);
 assert.equal((h.match(/class="mi-trailer-card"/g)||[]).length,3);
 assert.match(h,/data-mi-play-video="AbCdEf12345"/);
 assert.match(h,/data-mi-play-cn="bilibili"/);
});
test('TMDB ID binding and year mismatch reject wrong videos',()=>{
 const row={kind:'movie',tmdbId:277834,title:'海洋奇缘',year:2016,
  videoId:'30636253',platform:'acfun',name:'《海洋奇缘》大陆预告',
  verifiedSource:'https://www.acfun.cn/v/ac30636253',titleMatchVerified:true};
 const info={kind:'movie',tmdbId:277834,title:'海洋奇缘',year:'2016-11-23'};
 assert.equal(verified(info,[row]).length,1);
 assert.equal(verified({...info,tmdbId:277835},[row]).length,0);
 assert.equal(verified({...info,year:'2026-11-23'},[row]).length,0);
 assert.equal(verified(info,[{...row,verifiedSource:'https://attacker.invalid/video'}]).length,0);
 assert.equal(verified(info,[{...row,titleMatchVerified:false,year:2015}]).length,0);
});
test('all four real video providers and KinoCheck YouTube IDs share the same gallery',()=>{
 const info={kind:'tv',tmdbId:220542,title:'药屋少女的呢喃',originalTitle:'薬屋のひとりごと',year:'2023-10-22'};
 const base={kind:'tv',tmdbId:220542,title:info.title,year:2023,titleMatchVerified:true};
 const rows=[
  {...base,platform:'acfun',videoId:'43386834',name:'药屋少女的呢喃 简评',type:'Related',verifiedSource:'https://www.acfun.cn/v/ac43386834'},
  {...base,platform:'niconico',videoId:'sm43190555',name:'薬屋のひとりごと 第2クールPV',type:'Trailer',verifiedSource:'https://www.nicovideo.jp/watch/sm43190555'},
  {...base,platform:'dailymotion',videoId:'x8mcq94',name:'The Apothecary Diaries Official Trailer',type:'Trailer',verifiedSource:'https://www.dailymotion.com/video/x8mcq94'}
 ];
 const kino={trailers:[{id:'F0zP0L_sUDA',title:'KinoCheck movie trailer',official:false,verifiedBy:'KinoCheck',embeddable:true}]};
 const html=gallery(kino,info,rows);
 assert.equal((html.match(/class="mi-trailer-card"/g)||[]).length,4);
 assert.match(html,/data-mi-play-cn="acfun"/);
 assert.match(html,/data-mi-play-cn="niconico"/);
 assert.match(html,/Dailymotion/);
 assert.match(html,/href="https:\/\/www.dailymotion.com\/video\/x8mcq94"/);
 assert.doesNotMatch(html,/data-mi-play-cn="dailymotion"/);
 assert.match(html,/data-mi-play-video="F0zP0L_sUDA"/);
});
test('20 total clips, not old six plus four, preserving platform diversity',()=>{
 const ytRows=Array.from({length:32},(_,i)=>({
   id:'Video'+String(i).padStart(6,'0'),title:'Movie trailer or cast clip',
   official:false,embeddable:true,likes:1000+i,type:i<7?'Trailer':'Related'
 }));
 const info={kind:'movie',tmdbId:550,title:'Fight Club',year:'1999-09-01'};
 const base={kind:'movie',tmdbId:550,title:info.title,year:1999,titleMatchVerified:true};
 const domestic=Array.from({length:15},(_,i)=>({
  ...base,platform:'bilibili',videoId:'BV'+String(i).padStart(10,'0'),
  verifiedSource:'https://www.bilibili.com/video/BV'+String(i).padStart(10,'0')+'/',
  name:'Fight Club review '+i,type:'Related'}));
 const h=gallery({trailers:ytRows,relatedVideos:ytRows},info,domestic);
 assert.equal((h.match(/class="mi-trailer-card"/g)||[]).length,20);
 assert.match(h,/data-mi-play-cn="bilibili"/);
 assert.match(h,/data-mi-play-video=/);
 assert.equal((gallery({trailers:ytRows},info,[]).match(/class="mi-trailer-card"/g)||[]).length,20);
 assert.equal((gallery({},info,domestic).match(/class="mi-trailer-card"/g)||[]).length,15);
});
test('legacy platform data is not presented in the unified gallery',()=>{
 const base={title:selected.title,kind:'movie',year:2025,name:'Old placeholder',videoId:'c3278hj65i6'};
 const old={...base,platform:'tencent',verifiedSource:'https://v.qq.com/x/page/c3278hj65i6.html'};
 const html=gallery({},selected,[old,{...old,platform:'iqiyi'}]);
 assert.doesNotMatch(html,/data-mi-play-cn="tencent"/);
 assert.doesNotMatch(html,/mi-trailer-card/);
 assert.doesNotMatch(html,/1905电影网|v.qq.com\/x\/search|so.youku.com|so.iq.com/);
 assert.match(html,/AcFun/);
 assert.match(html,/Niconico/);
 assert.match(html,/Dailymotion/);
});
test('Bilibili cached records and metadata-limited KinoCheck videos remain valid',()=>{
 const base={kind:'movie',tmdbId:550,verifiedByTitleId:true,year:1999,
 title:'不同地区译名',platform:'bilibili',videoId:'BV0000000000',
 name:'Fight Club trailer',verifiedSource:'https://www.bilibili.com/video/BV0000000000/'};
 const info={kind:'movie',tmdbId:550,title:'搏击俱乐部'};
 assert.equal(verified(info,[base]).length,1);
 assert.equal(verified({...info,tmdbId:551},[base]).length,0);
 assert.equal(verified({...info,kind:'tv'},[base]).length,0);
});
test('modal uses platform-authentic player URLs and never a borrowed Dailymotion ID',()=>{
 assert.match(source,/https:\/\/player\.bilibili\.com\/player\.html\?bvid=/);
 assert.match(source,/https:\/\/www\.acfun\.cn\/player\/ac/);
 assert.match(source,/https:\/\/embed\.nicovideo\.jp\/watch\//);
 assert.doesNotMatch(source,/geo\.dailymotion\.com\/player\/x8lr5/);
 assert.match(source,/trailerStage\.replaceChildren\(\)/);
 assert.match(source,/data-mi-play-cn/);
});

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
const coverUrl=x=>safe(x)||(/^\.\/assets\/media-posters\/[a-f0-9]{20}\.webp$/i.test(String(x||''))?x:null);
const workerBase='https://liangyou-streaming-availability.maddestalistar.workers.dev';
const {gallery,verified}=new Function('t','esc','safe','a','formatDuration','english','mediaCoverUrl','base',
 source.slice(start,end)+';return {gallery:trailerGallery,verified:verifiedDomesticTrailers};')(
  (zh)=>zh,escape,safe,link,()=>'',()=>false,coverUrl,workerBase
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
test('ID-linked clips render for catalog entries missing a release year without cross-title leaks',()=>{
 const row={kind:'movie',tmdbId:550,verifiedByTitleId:true,year:1999,
   title:'Fight Club',platform:'bilibili',videoId:'BV1234567890',
   name:'Fight Club cast interview',
   verifiedSource:'https://www.bilibili.com/video/BV1234567890/'};
 const noYear={kind:'movie',tmdbId:550,title:'搏击俱乐部',originalTitle:'Fight Club'};
 const html=gallery({},noYear,[row],'ready');
 assert.match(html,/data-mi-cn-id="BV1234567890"/);
 assert.equal(verified({...noYear,tmdbId:551},[row]).length,0);
 assert.equal(verified({...noYear,kind:'tv'},[row]).length,0);
 assert.equal(verified({...noYear,year:'2026-01-01'},[row]).length,0);
 assert.equal(verified({...noYear,tmdbId:null},[row]).length,0);
 const unsafe={...row,verifiedSource:'https://attacker.example/video/BV1234567890/'};
 assert.equal(verified(noYear,[unsafe]).length,0);
 const unverified={...row,verifiedByTitleId:false};
 assert.equal(verified(noYear,[unverified]).length,0);
});
test('gallery shows at most twenty total clips from any supported sources',()=>{
 const ytRows=Array.from({length:27},(_,i)=>({
  id:'Video'+String(i).padStart(6,'0'),title:'Film trailer '+i,
  likes:(i+1)*500,embeddable:true,official:false,type:'Related'
 }));
 const domestic=Array.from({length:25},(_,i)=>({
  title:selected.title,kind:'movie',year:2025,platform:'bilibili',
  videoId:'BV'+String(i).padStart(10,'0'),name:'Ne Zha 2 cast clip '+i,
  likes:(i+1)*900,type:'Related',verifiedSource:'https://www.bilibili.com/video/BV'+String(i).padStart(10,'0')+'/'
 }));
 const content=gallery({trailers:ytRows.slice(0,15),relatedVideos:ytRows},selected,domestic);
 assert.equal((content.match(/class="mi-trailer-grid"/g)||[]).length,1);
 assert.equal((content.match(/class="mi-trailer-card"/g)||[]).length,20);
 assert.match(content,/data-mi-play-cn="bilibili"/);
 assert.match(content,/data-mi-play-video/);
 const onlyYT=gallery({relatedVideos:ytRows},selected,[]);
 assert.equal((onlyYT.match(/class="mi-trailer-card"/g)||[]).length,20);
 const onlyB=gallery({},selected,domestic);
 assert.equal((onlyB.match(/class="mi-trailer-card"/g)||[]).length,20);
 assert.equal((gallery({},selected,domestic.slice(0,7)).match(/class="mi-trailer-card"/g)||[]).length,7);
});
test('missing YouTube data still shows verified mainland videos in exactly the same grid',()=>{
 const h=gallery({},selected,catalog.items,'error');
 assert.equal((h.match(/class="mi-trailer-grid"/g)||[]).length,1);
 assert.equal((h.match(/mi-trailer-card/g)||[]).length,2);
 assert.match(h,/data-mi-play-cn="bilibili"/);
 assert.doesNotMatch(h,/暂不可用/);
});
test('removed providers and search fallback are not rendered in video gallery',()=>{
 const h=gallery({},selected,catalog.items,'ready');
 assert.doesNotMatch(h,/data-mi-play-cn="1905"/);
 assert.doesNotMatch(h,/1905.com|v.qq.com|so.youku.com|iqiyi.com/);
 assert.doesNotMatch(h,/其他平台查找预告片|mi-trailer-search/);
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
test('AcFun Niconico and Dailymotion require canonical source links and exact catalog identity',()=>{
 const info={...selected,tmdbId:550};
 const providers=[
  {platform:'acfun',videoId:'30636253',url:'https://www.acfun.cn/v/ac30636253'},
  {platform:'niconico',videoId:'sm43190555',url:'https://www.nicovideo.jp/watch/sm43190555'},
  {platform:'dailymotion',videoId:'x8mcq94',url:'https://www.dailymotion.com/video/x8mcq94'},
 ];
 for(const p of providers){
  const row={kind:'movie',tmdbId:550,verifiedByTitleId:false,matchedByTitle:true,
    title:selected.title,year:2025,platform:p.platform,videoId:p.videoId,name:'预告片',
    verifiedSource:p.url};
  const ok=gallery({},info,[row]);
  assert.match(ok,/class="mi-trailer-card"/);
  assert.match(ok,new RegExp(p.platform==='dailymotion'?'mi-video-external':'data-mi-play-cn="'+p.platform+'"'));
  for(const broken of [{...row,verifiedSource:'https://attacker.example/video'},
      {...row,videoId:'javascript:evil'}, {...row,tmdbId:551}, {...row,year:2015}]){
   assert.doesNotMatch(gallery({},info,[broken]),/class="mi-trailer-card"/);
  }
 }
 const blocked={kind:'movie',year:2025,title:selected.title,platform:'tencent',
   videoId:'c3278hj65i6',verifiedSource:'https://v.qq.com/x/page/c3278hj65i6.html'};
 assert.doesNotMatch(gallery({},selected,[blocked]),/class="mi-trailer-card"/);
});
test('every movie can display server-verified Bilibili videos by TMDB ID rather than manually listed names',()=>{
 const info={...selected,tmdbId:550};
 const record={kind:'movie',tmdbId:550,verifiedByTitleId:true,title:'不同地区的电影译名',
  year:2025,platform:'bilibili',videoId:'BV0000000000',
  name:'正式预告',verifiedSource:'https://www.bilibili.com/video/BV0000000000/'};
 assert.equal(verified(info,[record]).length,1);
 assert.match(gallery({},info,[record]),/data-mi-cn-id="BV0000000000"/);
 assert.equal(verified(info,[{...record,tmdbId:551}]).length,0);
 assert.equal(verified(info,[{...record,verifiedByTitleId:false}]).length,0);
 assert.equal(verified(info,[{...record,verifiedSource:'https://untrusted.example/watch'}]).length,0);
});
test('YouTube Bilibili AcFun Niconico use in-site modal; Dailymotion needs own Player ID',()=>{
 assert.match(source,/https:\/\/player\.bilibili\.com\/player\.html\?bvid=/);
 assert.match(source,/https:\/\/www\.acfun\.cn\/player\/ac/);
 assert.match(source,/https:\/\/embed\.nicovideo\.jp\/watch\//);
 assert.match(source,/button\.closest\('\.mi-trailer-card'\)/);
 assert.match(source,/trailerStage\.replaceChildren\(\)/);
 assert.ok(source.includes("if(playerSwitch)playerSwitch.hidden=true"));
 assert.ok(source.includes("showAcfunHls(id)"));
 assert.ok(source.includes("/api/video/acfun/"));
 assert.ok(source.includes('showAcfunFrame(id)'));
 assert.ok(!source.includes('https://m.acfun.cn/v/?ac='));
 assert.match(source,/X-Frame-Options: SAMEORIGIN/);
 assert.match(source,/if\(playerSwitch\)playerSwitch\.hidden=false/);
 assert.doesNotMatch(source,/mi-domestic-trailer-host|domesticTrailerPanel/);
});


test('Dailymotion inline player is gated by a site-owned Player ID',()=>{
  assert.ok(source.includes('data/media-video-player-config.json'));
  assert.ok(source.includes('geo.dailymotion.com/player/'));
  assert.ok(source.includes('dailymotionPlayerId'));
  assert.ok(source.includes("x.platform!=='dailymotion'||Boolean(dailymotionPlayerId)"));
  assert.ok(!source.includes('/player/x8lr5.html'));
});

test('a site-owned Dailymotion Player ID enables modal buttons; absent ID stays external',()=>{
 const from=source.indexOf('  function verifiedDomesticTrailers(info,records=[]){');
 const to=source.indexOf('  let worldNewsPromise=null;',from);
 const positive=source.slice(from,to).replace("let dailymotionPlayerId='';","let dailymotionPlayerId='xOwned123';");
 assert.notEqual(positive,source.slice(from,to),'test must set only the local configured Player ID');
 const galleryOwned=new Function('t','esc','safe','a','formatDuration','english','mediaCoverUrl','base',
   positive+';return trailerGallery;')((zh)=>zh,escape,safe,link,()=>'',()=>false,coverUrl,workerBase);
 const info={...selected,tmdbId:550};
 const row={kind:'movie',title:info.title,tmdbId:550,year:2025,matchedByTitle:true,
   platform:'dailymotion',videoId:'x8mcq94',name:'Ne Zha 2 trailer',
   verifiedSource:'https://www.dailymotion.com/video/x8mcq94'};
 assert.match(gallery({},info,[row]),/mi-video-external/);
 const html=galleryOwned({},info,[row]);
 assert.match(html,/data-mi-play-cn="dailymotion"/);
 assert.match(html,/data-mi-cn-id="x8mcq94"/);
});


test('KinoCheck candidates remain visible even after 36 normal YouTube results',()=>{
 const entries=Array.from({length:42},(_,i)=>({
   id:'Y'+String(i).padStart(10,'0'),title:'Generic trailer '+i,
   type:'Trailer',official:true,embeddable:true
 }));
 const kc={id:'K1234567890',title:'Verified trailer from KinoCheck',type:'Trailer',
   official:true,verifiedBy:'KinoCheck',embeddable:true};
 const info={kind:'movie',tmdbId:550,title:'Fight Club',year:'1999-10-15'};
 const dm={kind:'movie',tmdbId:550,title:'Fight Club',year:1999,matchedByTitle:true,
   platform:'dailymotion',videoId:'x8mcq94',name:'Fight Club (1999) Trailer',
   verifiedSource:'https://www.dailymotion.com/video/x8mcq94',type:'Trailer'};
 const html=gallery({trailers:[...entries,kc]},info,[dm]);
 assert.equal((html.match(/class="mi-trailer-card"/g)||[]).length,20);
 assert.match(html,/KinoCheck · TMDB 精确匹配/);
 assert.match(html,/data-mi-play-video="K1234567890"/);
 assert.match(html,/Dailymotion/);
 const cards=[...html.matchAll(/<article class="mi-trailer-card">([\s\S]*?)<\/article>/g)].map(m=>m[1]);
 assert.ok(cards.slice(0,4).some(c=>c.includes('KinoCheck')),'KinoCheck should not be buried below 20 other trailers');
 assert.ok(cards.slice(0,4).some(c=>c.includes('Dailymotion')),'Dailymotion should get an early representative slot');
});
test('Bilibili cards use labeled work posters only while verified video covers are unavailable',()=>{
 const info={...selected,tmdbId:550,poster:'https://image.tmdb.org/t/p/w500/poster123.jpg'};
 const row={kind:'movie',tmdbId:550,matchedByTitle:true,title:info.title,year:2025,
   platform:'bilibili',videoId:'BV1234567890',name:'电影正式预告',
   verifiedSource:'https://www.bilibili.com/video/BV1234567890/'};
 const backup=gallery({},info,[row]);
 assert.match(backup,/poster123\.jpg/);
 assert.match(backup,/mi-trailer-fallback-label/);
 assert.match(backup,/作品海报/);
 const original=gallery({},info,[{...row,thumbnail:'https://i0.hdslb.com/bfs/archive/0123456789abcdef0123456789abcdef01234567.jpg'}]);
 assert.match(original,/https:\/\/i0\.hdslb\.com\/bfs\/archive\//);
 assert.doesNotMatch(original,/<span class="mi-trailer-fallback-label">/);
 assert.match(original,/data-thumb-poster-fallback="true"/);
});
test('Bilibili fallback supports local catalog work poster files without mislabeling them as video covers',()=>{
 const info={...selected,tmdbId:550,poster:'./assets/media-posters/0123456789abcdef0123.webp'};
 const row={kind:'movie',tmdbId:550,matchedByTitle:true,title:info.title,year:2025,
   platform:'bilibili',videoId:'BV1234567890',name:'官方预告',
   verifiedSource:'https://www.bilibili.com/video/BV1234567890/'};
 const html=gallery({},info,[row]);
 assert.match(html,/assets\/media-posters\/0123456789abcdef0123\.webp/);
 assert.match(html,/data-mi-bili-cover-id="BV1234567890"/,'Missing BV covers must trigger an on-demand lookup');
 assert.match(html,/mi-trailer-fallback-label/);
 assert.doesNotMatch(gallery({}, {...info,poster:'../../outside.jpg'},[row]),/outside\.jpg/);
 const knownCover=gallery({},info,[{...row,thumbnail:'https://i0.hdslb.com/bfs/archive/abcdef0123456789abcdef0123456789abcdef01.jpg'}]);
 assert.match(knownCover,/https:\/\/i0\.hdslb\.com\/bfs\/archive\//);
 assert.match(knownCover,/data-thumb-fallback="\.\/assets\/media-posters\/0123456789abcdef0123\.webp"/);
 assert.doesNotMatch(knownCover,/<span class="mi-trailer-fallback-label">/);
});
test('platform-specific real cover images render without untrusted sources',()=>{
 const info={...selected,tmdbId:550};
 const row={kind:'movie',tmdbId:550,matchedByTitle:true,title:info.title,year:2025,
    platform:'acfun',videoId:'30636253',name:'《哪吒之魔童闹海》预告',
    verifiedSource:'https://www.acfun.cn/v/ac30636253',
    thumbnail:'https://tx-free-imgs.acfun.cn/newUpload/valid-cover.jpeg'};
 const html=gallery({},info,[row]);
 assert.match(html,/class="mi-trailer-platform-thumb"/);
 assert.match(html,/tx-free-imgs.acfun.cn\/newUpload\/valid-cover.jpeg/);
 assert.match(source,/mi-trailer-platform-thumb/);
 assert.match(source,/https:\/\/www\.acfun\.cn\/player\/ac/);
});

test('verified AcFun GIF thumbnail is animated without a misleading playback-trial label',()=>{
 const info={...selected,tmdbId:550};
 const row={kind:'movie',tmdbId:550,matchedByTitle:true,title:info.title,year:2025,
   platform:'acfun',videoId:'30636253',name:'动画预告',
   verifiedSource:'https://www.acfun.cn/v/ac30636253',
   thumbnail:'https://tx-free-imgs.acfun.cn/newUpload/anim.gif?imageslim'};
 const h=gallery({},info,[row]);
 assert.match(h,/anim\.gif\?imageslim/);
 assert.match(h,/data-mi-native-motion="gif"/);
 assert.match(h,/动态封面/);
 assert.match(h,/站内播放/);
 assert.doesNotMatch(h,/尝试站内播放|Try in-page playback/);
 assert.match(source,/function playAcfunCover\(card\)/);
 assert.match(source,/video\.muted=true/);
});
test('Bilibili motion cover accepts only the matching verified BV ID and WebP path',()=>{
 const info={...selected,tmdbId:550};
 const row={kind:'movie',tmdbId:550,matchedByTitle:true,title:info.title,year:2025,
   platform:'bilibili',videoId:'BV1234567890',name:'影片预告',
   verifiedSource:'https://www.bilibili.com/video/BV1234567890/',
   animatedThumbnailLocal:'./assets/media-video-previews/BV1234567890.webp'};
 assert.match(gallery({},info,[row]),/data-mi-motion-src="\.\/assets\/media-video-previews\/BV1234567890\.webp"/);
 assert.doesNotMatch(gallery({},info,[{...row,animatedThumbnailLocal:'./assets/media-video-previews/BV1111111111.webp'}]),/data-mi-motion-src/);
 assert.doesNotMatch(gallery({},info,[{...row,animatedThumbnailLocal:'https://evil.example/a.webp'}]),/data-mi-motion-src/);
});
test('Niconico uses verified medium cover and falls back to original on CDN failure',()=>{
  const info={...selected,tmdbId:550};
  const row={kind:'movie',tmdbId:550,matchedByTitle:true,title:info.title,year:2025,
    platform:'niconico',videoId:'sm43190555',name:'Previews',
    verifiedSource:'https://www.nicovideo.jp/watch/sm43190555',
    thumbnail:'https://nicovideo.cdn.nimg.jp/thumbnails/43190555/43190555.5693593'};
  const html=gallery({},info,[row]);
  assert.match(html,/43190555\.5693593\.M/);
  assert.match(html,/data-thumb-fallback="https:\/\/nicovideo\.cdn\.nimg\.jp\/thumbnails\/43190555\/43190555\.5693593"/);
  assert.match(source,/img\.dataset\.thumbFallback/);
});

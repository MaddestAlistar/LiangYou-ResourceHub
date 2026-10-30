/* Browser regression: prove real Discover DOM renders trailers and separate news slots. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
let acfunMockCalls=0;
await context.route('**/*',async route=>{
 const requested=new URL(route.request().url());
 if(requested.pathname.endsWith('/data/media-intel.json')){
   const fixture=JSON.parse(await fs.readFile(new URL('../data/media-intel.json',import.meta.url),'utf8'));
   for(const work of Object.values(fixture.works||{})){
     if(work.profile){delete work.profile.genres;delete work.profile.keywords;delete work.profile.parental_rating;}
   }
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)});
 }
 if(requested.pathname==='/api/video/bilibili/BV1111111111'){
   return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},
     body:JSON.stringify({ok:true,bvid:'BV1111111111',likes:null,views:null,
       thumbnail:'https://i1.hdslb.com/bfs/archive/3bb32693eb30498f4510c53716b11fcb6aab30bf.jpg'})});
 }
 if(requested.hostname==='i1.hdslb.com'&&requested.pathname.startsWith('/bfs/archive/')){
   return route.fulfill({status:200,contentType:'image/jpeg',
     path:'assets/media-video-covers/BV1zprUY2EGj.jpg',
     headers:{'access-control-allow-origin':'*'}});
 }
 const acfunRequest=/^\/api\/video\/acfun\/([1-9][0-9]{3,11})$/.exec(requested.pathname);
 if(acfunRequest){
   acfunMockCalls++;
   return route.fulfill({status:200,contentType:'application/json',
     headers:{'access-control-allow-origin':'*'},
     body:JSON.stringify({ok:true,videoId:acfunRequest[1],quality:'720p',
       url:'https://tx-safety-video.acfun.cn/testing/sample.m3u8?token=test'})});
 }
 const url=new URL(route.request().url());
 if(['127.0.0.1','localhost'].includes(url.hostname)||url.protocol==='data:')return route.continue();
 return route.abort('blockedbyclient');
});
const page=await context.newPage();
const pageErrors=[];
page.on('pageerror',err=>pageErrors.push(String(err)));
try{
 await page.goto('http://127.0.0.1:8765/index.html#media',{waitUntil:'domcontentloaded',timeout:25000});
 try{
   await page.waitForFunction(()=>document.querySelectorAll('#media-grid .mi-card').length>=2,null,{timeout:45000});
 }catch(error){
   console.log('MEDIA_CARD_BOOT_DEBUG',JSON.stringify(await page.evaluate(()=>({
     ready:document.readyState,hash:location.hash,cards:document.querySelectorAll('#media-grid .mi-card').length,
     moduleRetry:document.querySelector('#media .cn-module-retry')?.textContent||'',
     mediaState:document.querySelector('#media-updated')?.textContent||'',
     scripts:[...document.scripts].filter(s=>/media-intel|media-core|china-perf/.test(s.src)).map(s=>s.src)
   }))),pageErrors.slice(-8));
   throw error;
 }
 await page.evaluate(()=>document.getElementById('media').addEventListener('liangyou:media-detail',e=>{
   window.__mediaDetailForTest=e.detail;
 }));
 await page.locator('#media-grid .mi-card-open').first().click();
 const info=await page.evaluate(()=>window.__mediaDetailForTest);
 assert.ok(info&&Number(info.tmdbId)>0,'Selected card needs a verified TMDB ID');
 const kind=info.kind==='tv'?'tv':'movie',tmdbId=Number(info.tmdbId);
 const title=String(info.title||'').trim(),originalTitle=String(info.originalTitle||title).trim();
 const year=/^(19|20)\d{2}/.exec(String(info.year||''))?.[0]||'2026';
 const worldName=originalTitle.length>=5?originalTitle:title;
 const now=new Date().toISOString(),date=now.slice(0,10);
 const fake={
   ok:true,kind,tmdbId,title:originalTitle,originalTitle,
   releaseDate:year+'-06-01',sources:{youtube:'ok',guardian:'no_data'},
   trailers:[{id:'AbCdEf12345',title:'Official film trailer',type:'Trailer',
       official:true,embeddable:true,thumbnail:'https://i.ytimg.com/vi/AbCdEf12345/hqdefault.jpg',
       url:'https://www.youtube.com/watch?v=AbCdEf12345'}],
   news:[],suggestions:[{title:'Suggested related title'}],artwork:[],financials:null
 };
 await page.route(/liangyou-streaming-availability\.maddestalistar\.workers\.dev\/api\/insights\//,route=>
   route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},
      body:JSON.stringify(fake)}));
 await page.route('**/data/media-domestic-trailers.json',route=>
   route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     schema:1,items:[{kind,title,year:Number(year),platform:'bilibili',
       videoId:'BV1zprUY2EGj',name:'Matched verified domestic trailer',
       publisher:'Film distributor',verifiedSource:'https://www.bilibili.com/video/BV1zprUY2EGj/',
       thumbnailLocal:'./assets/media-video-covers/BV1zprUY2EGj.jpg'},
       {kind,title,year:Number(year),platform:'bilibili',videoId:'BV1111111111',
         name:'Verified Bilibili clip lacking initial cover',
         verifiedSource:'https://www.bilibili.com/video/BV1111111111/'},
       {kind,title,year:Number(year),platform:'acfun',videoId:'41787132',
       name:'Matched AcFun public film trailer',verifiedSource:'https://www.acfun.cn/v/ac41787132'}]
   })}));
 await page.route('**/data/media-world-news.json',route=>
   route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     schema:1,updatedAt:now,items:[{source:'Variety',title:worldName+' '+year+' movie trailer news',
       url:'https://variety.com/film/real-film-story',date}]
   })}));
 await page.route('**/data/media-cn-news.json',route=>
   route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     schema:1,updatedAt:now,items:[{source:'新浪电影',title:'《'+title+'》最新电影资讯',
       url:'https://ent.sina.com.cn/film/m/test.shtml',date}]
   })}));
 await page.locator('#media-dialog [data-mi-detail="discover"]').click();
 try{
 await page.waitForFunction(expectWorld=>{
   const d=document.querySelector('#media-dialog');
   return d?.querySelector('.mi-trailer-card')&&
     d.querySelector('[data-mi-discover-slot="domestic"] .mi-editorial-card a')&&
     d.querySelector('.mi-international-news')&&
     (!expectWorld||d.querySelector('[data-mi-discover-slot="international"] .mi-editorial-card a'));
 },worldName.length>=5,{timeout:25000});
 }catch(error){
   const state=await page.evaluate(()=>{
     const d=document.querySelector('#media-dialog');
     return {title:d?.querySelector('h2')?.textContent,
       domestic:d?.querySelector('[data-mi-discover-slot="domestic"]')?.textContent?.slice(0,220),
       international:d?.querySelector('[data-mi-discover-slot="international"]')?.textContent?.slice(0,220),
       trailers:d?.querySelectorAll('.mi-trailer-card').length||0};
   });
   console.log('DISCOVER_WAIT_DEBUG',JSON.stringify({title,originalTitle,worldName,year,state,pageErrors}));
   throw error;
 }
 const result=await page.evaluate(()=>{
   const d=document.querySelector('#media-dialog'),slot=s=>d.querySelector('[data-mi-discover-slot="'+s+'"]');
   return {ordered:[...d.querySelectorAll('[data-mi-discover-slot]')].map(x=>x.dataset.miDiscoverSlot),
     trailerCount:slot('trailers').querySelectorAll('.mi-trailer-card').length,
     internationalCount:slot('international').querySelectorAll('.mi-editorial-card a').length,
     internationalText:slot('international').textContent,domesticText:slot('domestic').textContent,
     domesticCount:slot('domestic').querySelectorAll('.mi-editorial-card a').length,
     similarText:slot('similar').textContent,
     hasPlayButton:!!slot('trailers').querySelector('[data-mi-play-video]')};
 });
 assert.deepEqual(result.ordered,['trailers','international','domestic','related','similar']);
 assert.ok(result.trailerCount>=1,'Trailer gallery must display sourced videos');
 assert.equal(result.hasPlayButton,true,'Official YouTube trailer should play in-page');
 assert.equal(await page.locator('#media-dialog .mi-videos-block').count(),1,
   'There must be exactly one multi-platform trailer section');
 assert.equal(await page.locator('#media-dialog .mi-trailer-grid').count(),1,
   'YouTube and Chinese platforms share one video grid');
 // Browser-level proof that a cached BV thumbnail is an actual decodable
 // first-party image, not just a URL written into the DOM.
 const localCover=page.locator('#media-dialog [data-mi-play-cn="bilibili"] .mi-trailer-platform-thumb').first();
 await localCover.waitFor({state:'attached',timeout:10000});
 await localCover.evaluate(img=>img.decode());
 assert.equal(await localCover.evaluate(img=>img.naturalWidth>0),true);
 // Missing dynamic BV covers use a verified per-video metadata lookup and
 // the same image relay, without blocking or hiding the rest of the gallery.
 await page.waitForFunction(()=>{
   const el=document.querySelector('#media-dialog [data-mi-bili-cover-id="BV1111111111"] .mi-trailer-platform-thumb');
   return el?.complete&&el.naturalWidth>0&&el.src.includes('i1.hdslb.com/bfs/archive/');
 },{timeout:15000});
 assert.equal(await page.locator('#media-dialog [data-mi-bili-cover-id="BV1111111111"] .mi-trailer-fallback-label').count(),0);
 await page.locator('#media-dialog [data-mi-play-cn="bilibili"]').first().click();
 assert.equal(await page.locator('#media-trailer-dialog').evaluate(d=>d.open),true);
 assert.match(await page.locator('#media-trailer-stage iframe').getAttribute('src'),
   /player\.bilibili\.com\/player\.html\?bvid=BV1zprUY2EGj/);
 assert.equal(await page.locator('#media-trailer-switch').isHidden(),true);
 await page.locator('#media-trailer-close').click();
 assert.equal(await page.locator('#media-trailer-stage iframe').count(),0,
   'Closing a domestic video stops playback');
 await page.evaluate(()=>{
   // The mocked HLS manifest intentionally is not a real media stream.
   // Capture creation before the browser's decoder can reject and remove it.
   const stage=document.getElementById('media-trailer-stage');
   window.__acfunCapturedSrc='';
   new MutationObserver(()=>{
     const video=stage?.querySelector('video.mi-acfun-native');
     if(video?.src)window.__acfunCapturedSrc=video.src;
   }).observe(stage,{childList:true,subtree:true});
   const network=window.fetch.bind(window);
   window.__acfunFetches=[];
   window.fetch=(input,opts)=>{
     if(String(input).includes('/api/video/acfun/'))window.__acfunFetches.push(String(input));
     return network(input,opts);
   };
   const native=HTMLMediaElement.prototype.canPlayType;
   HTMLMediaElement.prototype.canPlayType=function(type){
     return /mpegurl/i.test(type)?'probably':native.call(this,type);
   };
 });
 await page.locator('#media-dialog [data-mi-play-cn="acfun"]').first().click();
 await page.waitForFunction(()=>Boolean(window.__acfunCapturedSrc)||
   Boolean(document.querySelector('#media-trailer-stage .mi-acfun-fallback')),{timeout:12000});
 assert.ok(acfunMockCalls>=1,'A verified AcFun ID must be requested on click');
 assert.equal(await page.locator('#media-trailer-stage iframe').count(),0,
   'AcFun must start as native HTML5 video, never the blocked H5 iframe');
 const captured=await page.evaluate(()=>window.__acfunCapturedSrc);
 if(captured){
   assert.match(captured,/tx-safety-video\.acfun\.cn\/testing\/sample\.m3u8/);
 }else{
   assert.match(await page.locator('#media-trailer-stage .mi-acfun-fallback').innerText(),/重新获取播放地址/);
   await page.locator('#media-trailer-stage .mi-acfun-fallback button').first().click();
   await page.waitForFunction(()=>Boolean(window.__acfunCapturedSrc)||
     Boolean(document.querySelector('#media-trailer-stage .mi-acfun-fallback')),{timeout:12000});
   assert.ok(acfunMockCalls>=2,'Retry should request a fresh temporary HLS address');
 }
 await page.locator('#media-trailer-close').click();
 assert.equal(await page.locator('#media-trailer-stage video').count(),0,
   'Closing native AcFun playback stops and removes video');
 await page.locator('#media-dialog [data-mi-play-video]').first().click();
 assert.match(await page.locator('#media-trailer-stage iframe').getAttribute('src'),
   /youtube\.com\/embed\//);
 assert.equal(await page.locator('#media-trailer-switch').isVisible(),true);
 await page.locator('#media-trailer-close').click();
 assert.equal(await page.locator('#media-dialog .mi-trailer-search').count(),0,
   'Obsolete manual source-search panel must remain removed');
 // Text in the DOM is not enough: CSS must leave all three cards actually visible.
 for(const selector of [
   '#media-dialog [data-mi-discover-slot="trailers"] .mi-trailer-card',
   '#media-dialog [data-mi-discover-slot="international"] .mi-international-news',
   '#media-dialog [data-mi-discover-slot="domestic"] .mi-editorial-card a'
 ]){
   assert.equal(await page.locator(selector).first().isVisible(),true,
      'Discover component must be visually visible: '+selector);
 }
 if(worldName.length>=5)assert.ok(result.internationalCount>=1,'An international article about this verified title must appear');
 // A full six-article ID-verified feed can legitimately outrank the mocked
 // Sina entry. Verify domestic articles, not one publisher's exact presence.
 assert.ok(result.domesticCount>=1,'At least one title-matched domestic article must remain visible');
 assert.match(result.similarText,/Suggested related title/);
 assert.equal(pageErrors.filter(x=>/discoverySections|suggestions is not defined|ReferenceError/.test(x)).length,0,
   'No uncaught Discover rendering exceptions');
 console.log('DISCOVER_BROWSER_OK',JSON.stringify(result).slice(0,1500));
 // Regression for an unavailable optional Worker: publisher snapshots must
 // continue rendering, and the trailer panel must not spin indefinitely.
 const offlinePage=await context.newPage();
 const offlineErrors=[];
 offlinePage.on('pageerror',err=>offlineErrors.push(String(err)));
 try{
   await offlinePage.goto('http://127.0.0.1:8765/index.html#media',{waitUntil:'domcontentloaded',timeout:25000});
   await offlinePage.waitForFunction(()=>document.querySelectorAll('#media-grid .mi-card').length>=2,null,{timeout:45000});
   await offlinePage.route('**/data/media-domestic-trailers.json',route=>
     route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
       schema:1,items:[{kind,title,year:Number(year),platform:'bilibili',
         videoId:'BV1zprUY2EGj',name:'Domestic fallback trailer',
         verifiedSource:'https://www.bilibili.com/video/BV1zprUY2EGj/'}]
     })}));
   await offlinePage.route('**/data/media-world-news.json',route=>
     route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
       schema:1,updatedAt:now,items:[{source:'Variety',title:worldName+' '+year+' movie confirmed title match',
         url:'https://variety.com/film/verified-source',date}]
     })}));
   await offlinePage.route('**/data/media-cn-news.json',route=>
     route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
       schema:1,updatedAt:now,items:[{source:'新浪电影',title:'《'+title+'》最新电影资讯',
         url:'https://ent.sina.com.cn/film/m/verified.shtml',date}]
     })}));
   // Context route aborts the external Worker; we deliberately do not stub it.
   await offlinePage.locator('#media-grid .mi-card-open').first().click();
   await offlinePage.locator('#media-dialog [data-mi-detail="discover"]').click();
   await offlinePage.waitForFunction(()=>{
     const d=document.querySelector('#media-dialog');
     return d?.querySelector('[data-mi-discover-slot="domestic"] .mi-editorial-card a')&&
       d?.querySelector('[data-mi-discover-slot="international"] .mi-international-news')&&
       d?.querySelector('[data-mi-discover-slot="trailers"] .mi-videos-block .mi-trailer-card [data-mi-play-cn="bilibili"]');
   },{timeout:20000});
   const offline=await offlinePage.evaluate(()=>{
     const d=document.querySelector('#media-dialog');
     const text=key=>d.querySelector('[data-mi-discover-slot="'+key+'"]')?.textContent||'';
     return {trailer:text('trailers'),international:text('international'),domestic:text('domestic'),
       domesticCount:d.querySelectorAll('[data-mi-discover-slot="domestic"] .mi-editorial-card a').length,
       internationalCount:d.querySelectorAll('[data-mi-discover-slot="international"] .mi-editorial-card a').length};
   });
   assert.doesNotMatch(offline.trailer,/正在核对可播放的预告片/,'No endless spinner when YouTube enrichment fails');
   assert.match(offline.trailer,/Domestic fallback trailer/,'Domestic video stays visible without the Worker');
   assert.equal(await offlinePage.locator('#media-dialog .mi-videos-block').count(),1);
   assert.equal(await offlinePage.locator('#media-dialog .mi-trailer-grid').count(),1);
   if(worldName.length>=5)assert.ok(offline.internationalCount>=1,'Offline Worker preserves verified international coverage');
   assert.ok(offline.domesticCount>=1,'Offline Worker must preserve title-matched Chinese news');
   assert.equal(await offlinePage.locator('#media-dialog .mi-trailer-search').count(),0,
     'Obsolete source-search panel must not return during Worker outages');
   assert.ok(!offlineErrors.some(x=>/ReferenceError|suggestions is not defined/.test(x)),
     'Offline news fallback has no unhandled renderer error');
   console.log('DISCOVER_WORKER_FAILURE_FALLBACK_OK',JSON.stringify(offline).slice(0,650));
 }finally{await offlinePage.close();}

}catch(e){
 await page.screenshot({path:'/tmp/media-discover-browser.png',fullPage:false}).catch(()=>{});
 console.error('DISCOVER_BROWSER_FAIL',String(e),pageErrors.slice(-7));
 process.exitCode=1;
}finally{await context.close();await browser.close();}

/* Browser regression: prove real Discover DOM renders trailers and separate news slots. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
await context.route('**/*',route=>{
 const url=new URL(route.request().url());
 if(['127.0.0.1','localhost'].includes(url.hostname)||url.protocol==='data:')return route.continue();
 return route.abort('blockedbyclient');
});
const page=await context.newPage();
const pageErrors=[];
page.on('pageerror',err=>pageErrors.push(String(err)));
try{
 await page.goto('http://127.0.0.1:8765/index.html#media',{waitUntil:'domcontentloaded',timeout:25000});
 await page.waitForFunction(()=>document.querySelectorAll('#media-grid .mi-card').length>=2,{timeout:30000});
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
       publisher:'Film distributor',verifiedSource:'https://www.bilibili.com/video/BV1zprUY2EGj/'}]
   })}));
 await page.route('**/data/media-world-news.json',route=>
   route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     schema:1,updatedAt:now,items:[{source:'Variety',title:worldName+' trailer news',
       url:'https://variety.com/film/real-film-story',date}]
   })}));
 await page.route('**/data/media-cn-news.json',route=>
   route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     schema:1,updatedAt:now,items:[{source:'新浪电影',title:'《'+title+'》最新电影资讯',
       url:'https://ent.sina.com.cn/film/m/test.shtml',date}]
   })}));
 await page.locator('#media-dialog [data-mi-detail="discover"]').click();
 await page.waitForFunction(()=>{
   const d=document.querySelector('#media-dialog');
   return d?.querySelector('.mi-trailer-card')&&d.querySelector('.mi-international-news')&&
      d.querySelector('.mi-cn-news-list a');
 },{timeout:20000});
 const result=await page.evaluate(()=>{
   const d=document.querySelector('#media-dialog'),slot=s=>d.querySelector('[data-mi-discover-slot="'+s+'"]');
   return {ordered:[...d.querySelectorAll('[data-mi-discover-slot]')].map(x=>x.dataset.miDiscoverSlot),
     trailerCount:slot('trailers').querySelectorAll('.mi-trailer-card').length,
     internationalText:slot('international').textContent,domesticText:slot('domestic').textContent,
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
 await page.locator('#media-dialog [data-mi-play-cn="bilibili"]').first().click();
 assert.equal(await page.locator('#media-trailer-dialog').evaluate(d=>d.open),true);
 assert.match(await page.locator('#media-trailer-stage iframe').getAttribute('src'),
   /player\.bilibili\.com\/player\.html\?bvid=BV1zprUY2EGj/);
 assert.equal(await page.locator('#media-trailer-switch').isHidden(),true);
 await page.locator('#media-trailer-close').click();
 assert.equal(await page.locator('#media-trailer-stage iframe').count(),0,
   'Closing a domestic video stops playback');
 await page.locator('#media-dialog [data-mi-play-video]').first().click();
 assert.match(await page.locator('#media-trailer-stage iframe').getAttribute('src'),
   /youtube\.com\/embed\//);
 assert.equal(await page.locator('#media-trailer-switch').isVisible(),true);
 await page.locator('#media-trailer-close').click();
 for(const fragment of ['search.bilibili.com/all?keyword=','v.qq.com/x/search/?q=','1905.com/news/yg/']){
   assert.equal(await page.locator('#media-dialog .mi-trailer-search a[href*="'+fragment+'"]').count(),1,
       'Mainland source link must be available without a provider API: '+fragment);
 }
 // Text in the DOM is not enough: CSS must leave all three cards actually visible.
 for(const selector of [
   '#media-dialog [data-mi-discover-slot="trailers"] .mi-trailer-card',
   '#media-dialog [data-mi-discover-slot="international"] .mi-international-news',
   '#media-dialog [data-mi-discover-slot="domestic"] .mi-cn-news-list a'
 ]){
   assert.equal(await page.locator(selector).first().isVisible(),true,
      'Discover component must be visually visible: '+selector);
 }
 if(worldName.length>=5)assert.match(result.internationalText,/Variety/,'World publisher article must appear');
 assert.match(result.domesticText,/新浪电影/,'Domestic matching article must appear');
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
   await offlinePage.waitForFunction(()=>document.querySelectorAll('#media-grid .mi-card').length>=2,{timeout:30000});
   await offlinePage.route('**/data/media-domestic-trailers.json',route=>
     route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
       schema:1,items:[{kind,title,year:Number(year),platform:'bilibili',
         videoId:'BV1zprUY2EGj',name:'Domestic fallback trailer',
         verifiedSource:'https://www.bilibili.com/video/BV1zprUY2EGj/'}]
     })}));
   await offlinePage.route('**/data/media-world-news.json',route=>
     route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
       schema:1,updatedAt:now,items:[{source:'Variety',title:worldName+' confirmed title match',
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
     return d?.querySelector('[data-mi-discover-slot="domestic"] .mi-cn-news-list a')&&
       d?.querySelector('[data-mi-discover-slot="international"] .mi-international-news')&&
       d?.querySelector('[data-mi-discover-slot="trailers"] .mi-videos-block .mi-trailer-card [data-mi-play-cn="bilibili"]');
   },{timeout:20000});
   const offline=await offlinePage.evaluate(()=>{
     const d=document.querySelector('#media-dialog');
     const text=key=>d.querySelector('[data-mi-discover-slot="'+key+'"]')?.textContent||'';
     return {trailer:text('trailers'),international:text('international'),domestic:text('domestic')};
   });
   assert.doesNotMatch(offline.trailer,/正在核对可播放的预告片/,'No endless spinner when YouTube enrichment fails');
   assert.match(offline.trailer,/Domestic fallback trailer/,'Domestic video stays visible without the Worker');
   assert.equal(await offlinePage.locator('#media-dialog .mi-videos-block').count(),1);
   assert.equal(await offlinePage.locator('#media-dialog .mi-trailer-grid').count(),1);
   if(worldName.length>=5)assert.match(offline.international,/Variety/,'Offline Worker must not block world RSS');
   assert.match(offline.domestic,/新浪电影/,'Offline Worker must not block Chinese RSS');
   assert.equal(await offlinePage.locator('#media-dialog .mi-trailer-search a').count(),3,
     'Mainland trailer source searches must survive Worker outages');
   assert.ok(!offlineErrors.some(x=>/ReferenceError|suggestions is not defined/.test(x)),
     'Offline news fallback has no unhandled renderer error');
   console.log('DISCOVER_WORKER_FAILURE_FALLBACK_OK',JSON.stringify(offline).slice(0,650));
 }finally{await offlinePage.close();}

}catch(e){
 await page.screenshot({path:'/tmp/media-discover-browser.png',fullPage:false}).catch(()=>{});
 console.error('DISCOVER_BROWSER_FAIL',String(e),pageErrors.slice(-7));
 process.exitCode=1;
}finally{await context.close();await browser.close();}

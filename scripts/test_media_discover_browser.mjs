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
 if(worldName.length>=5)assert.match(result.internationalText,/Variety/,'World publisher article must appear');
 assert.match(result.domesticText,/新浪电影/,'Domestic matching article must appear');
 assert.match(result.similarText,/Suggested related title/);
 assert.equal(pageErrors.filter(x=>/discoverySections|suggestions is not defined|ReferenceError/.test(x)).length,0,
   'No uncaught Discover rendering exceptions');
 console.log('DISCOVER_BROWSER_OK',JSON.stringify(result).slice(0,1500));
}catch(e){
 await page.screenshot({path:'/tmp/media-discover-browser.png',fullPage:false}).catch(()=>{});
 console.error('DISCOVER_BROWSER_FAIL',String(e),pageErrors.slice(-7));
 process.exitCode=1;
}finally{await context.close();await browser.close();}

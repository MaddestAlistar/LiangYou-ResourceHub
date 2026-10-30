const fs=require('node:fs');
const { chromium }=require('/tmp/film-cover-probe/node_modules/playwright-core');
const works=[['药屋少女的呢喃','tmdb-tv-220542'],['复仇者联盟5','tmdb-movie-1003596']];
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const results=[];
 try{
 for(const [title,id] of works){
  const context=await browser.newContext({
   viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,
   userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
  });
  const page=await context.newPage();
  const out={title,site:'https://maddestalistar.github.io/LiangYou-ResourceHub/',url:null};
  const errs=[];page.on('pageerror',e=>errs.push(String(e).slice(0,150)));
  try{
   const url=out.site+'?film='+id+'#media';
   const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:40000});
   out.http=r?.status();
   await page.waitForTimeout(6500);
   const open=await page.locator('#media-dialog').evaluate(el=>el.open);
   out.dialogOpen=open;
   if(!open)throw Error('film dialog not opened');
   await page.locator('[data-mi-detail="discover"]').click({timeout:7000});
   await page.waitForTimeout(16000);
   const imgs=page.locator('#media-dialog .mi-trailer-platform-thumb');
   out.platformThumbs=await imgs.count();
   await imgs.evaluateAll(nodes=>nodes.forEach(n=>{n.loading='eager';}));
   await page.waitForTimeout(6500);
   out.images=await imgs.evaluateAll(nodes=>nodes.map(n=>({srcHost:(()=>{try{return new URL(n.src).host}catch{return null}})(),loaded:n.complete&&n.naturalWidth>0,naturalWidth:n.naturalWidth})).slice(0,20));
   out.acfunMobileLinks=await page.locator('#media-dialog a.mi-trailer-trigger[href*="m.acfun.cn"]').count();
   out.acfunOldPlayerButtons=await page.locator('#media-dialog button[data-mi-play-cn="acfun"]').count();
   out.niconicoCards=await page.locator('#media-dialog .mi-trailer-tags').filter({hasText:'Niconico'}).count();
   out.dailymotionCards=await page.locator('#media-dialog .mi-trailer-tags').filter({hasText:'Dailymotion'}).count();
   out.videoCardCount=await page.locator('#media-dialog .mi-trailer-card').count();
   out.cache=await page.evaluate(async()=>{const d=await (await fetch('./data/media-extra-videos.json',{cache:'no-cache'})).json();return {updatedAt:d.updatedAt,works:Object.keys(d.items||{}).length}});
  }catch(e){out.error=String(e).slice(0,350)}
  out.pageErrors=errs.slice(0,10);
  results.push(out);
  console.log('MOBILE_COVER_RESULT',JSON.stringify(out).slice(0,5200));
  fs.writeFileSync('mobile-film-cover-report.json',JSON.stringify(results,null,2));
  await context.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error('FATAL',String(e));process.exitCode=1;});

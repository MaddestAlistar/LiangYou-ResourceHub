/* Browser regression for exact-title domestic film scores, grosses and headlines.
   All upstream services are mocked: no secrets or live provider dependence. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const hits={search:0,movie:0};
await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(['127.0.0.1','localhost'].includes(u.hostname))return route.continue();
  return route.abort('blockedbyclient');
});
const page=await context.newPage();
await page.route('https://liangyou-taopiaopiao-lab.maddestalistar.workers.dev/**',route=>{
 const u=new URL(route.request().url());
 const headers={'content-type':'application/json','access-control-allow-origin':'*'};
 if(u.pathname==='/api/search'){
   hits.search++;
   const name=u.searchParams.get('name');
   const rows=name==='哪吒之魔童闹海'?[{
     title:'哪吒之魔童闹海',movieCode:'00102032025',releaseDate:'2025-01-29'
   }]:[];
   return route.fulfill({status:200,headers,body:JSON.stringify({code:0,year:'2025',query:name,data:rows})});
 }
 if(u.pathname==='/api/movie/00102032025'){
   hits.movie++;
   return route.fulfill({status:200,headers,body:JSON.stringify({
     code:0,movieCode:'00102032025',title:'哪吒之魔童闹海',
     releaseDescription:'春节档上映', // year must be confirmed against year-list date
     ratings:{maoyan:9.3,douban:8.5,taopiaopiao:9.5},
     boxOffice:{cumulative:{value:1500000,unit:'万元'},
       firstDay:{value:23000,unit:'万元'},firstWeek:null},
     upstreamUrl:'https://zgdypf.zgdypw.cn/movie/detail/00102032025'
   })});
 }
 return route.abort();
});
await page.route('**/data/media-cn-news.json',route=>route.fulfill({status:200,
 headers:{'content-type':'application/json'},
 body:JSON.stringify({schema:1,updatedAt:new Date().toISOString(),items:[
  {source:'国家电影局',title:'《哪吒之魔童闹海》最新电影行业信息',url:'https://www.chinafilm.gov.cn/xwzx/gzdt/',date:'2026-10-28'}
 ]})}));
try{
 await page.goto('http://127.0.0.1:8765/index.html#media',{waitUntil:'domcontentloaded',timeout:25000});
 await page.locator('#media-grid .mi-card-open').first().waitFor({timeout:30000});
 await page.locator('#media-grid .mi-card-open').first().click();
 await page.waitForFunction(()=>document.querySelector('#media-dialog')?.open,{timeout:10000});
 const send=async(section,title='哪吒之魔童闹海',kind='movie')=>page.evaluate(info=>{
   document.querySelector('#media').dispatchEvent(new CustomEvent('liangyou:media-detail',{detail:info}));
 },{id:'tmdb-movie-99999',title,originalTitle:title,kind,year:'2025-01-29',tmdbId:99999,section});
 await send('ratings');
 await page.locator('.mi-cn-auto .mi-score-tile').nth(2).waitFor({timeout:15000});
 assert.equal(await page.locator('.mi-cn-auto .mi-score-tile').count(),3);
 const titles=await page.locator('.mi-cn-auto .mi-score-tile>span').allTextContents();
 assert.deepEqual(titles,['猫眼','豆瓣','淘票票']);
 assert.match(await page.locator('.mi-cn-auto').last().innerText(),/第三方公开汇总/);
 console.log('MAINLAND_INDEPENDENT_RATINGS_OK',JSON.stringify(titles));
 await send('boxoffice');
 await page.locator('.mi-cn-box-grid>div').first().waitFor({timeout:15000});
 assert.equal(await page.locator('.mi-cn-box-grid>div').count(),2);
 const text=await page.locator('.mi-cn-box-grid').innerText();
 assert.match(text,/累计票房/);
 assert.match(text,/150/);
 console.log('MAINLAND_FILM_GROSSES_OK',text.replace(/\n/g,' | '));
 await send('ratings','不存在的测试电影');
 await page.waitForFunction(()=>[...document.querySelectorAll('.mi-cn-auto')].some(
   n=>n.textContent.includes('暂无可通过片名')), {timeout:15000});
 const unmatched=await page.locator('.mi-cn-auto').last();
 assert.equal(await unmatched.locator('.mi-score-tile').count(),0);
 console.log('MAINLAND_NO_FALSE_TITLE_JOIN_OK');
 await send('boxoffice','测试剧集','tv');
 assert.ok((await page.locator('.mi-cn-boxoffice').first().innerText()).includes('院线单片票房不适用'));
 console.log('MAINLAND_NO_TV_BOX_OFFICE_OK');
 await send('discover');
 const relatedNews=page.locator('.mi-cn-title-news').last();
 await relatedNews.locator('.mi-insight-news .mi-editorial-card').first().waitFor({timeout:12000});
 assert.match(await relatedNews.innerText(),/哪吒之魔童闹海/);
 assert.match(await relatedNews.innerText(),/国家电影局/);
 console.log('MAINLAND_FILM_NEWS_OK');
 assert.ok(hits.search>=2&&hits.movie>=1,'expected mocked provider queries');
}finally{
 await context.close();
 await browser.close();
}

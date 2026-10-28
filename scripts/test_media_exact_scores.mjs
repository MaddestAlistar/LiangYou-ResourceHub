/* Browser checks for verified Simkl / Kitsu linkage and independent worldwide rankings. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();
let calledSimkl=0,calledKitsu=0;
await context.route('**/*',route=>{
 const u=new URL(route.request().url());
 if(['localhost','127.0.0.1'].includes(u.hostname)||u.protocol==='data:')return route.continue();
 return route.abort('blockedbyclient');
});
await page.route('https://liangyou-extra-ratings-lab.maddestalistar.workers.dev/**',route=>{
 const u=new URL(route.request().url());
 const headers={'access-control-allow-origin':'*','content-type':'application/json'};
 if(u.pathname==='/api/simkl/12345'){
  calledSimkl++;
  return route.fulfill({status:200,headers,body:JSON.stringify({code:0,platform:'Simkl',id:'12345',rating:8.6,scale:10,
   releaseYear:2025,pageUrl:'https://simkl.com/movies/12345/test',ratingCount:200})});
 }
 if(u.pathname==='/api/simkl/by-tmdb/movie/999'){
  return route.fulfill({status:200,headers,body:JSON.stringify({code:0,platform:'Simkl',id:'56789',
    matchedExternalId:'999',matchedExternalSite:'tmdb',mappingMethod:'official_simkl_tmdb_lookup',
    rating:8.4,scale:10,releaseYear:2025,pageUrl:'https://simkl.com/movies/56789/test'})});
 }
 if(u.pathname==='/api/simkl/by-tmdb/movie/909'){
  return route.fulfill({status:200,headers,body:JSON.stringify({code:0,platform:'Simkl',id:'45678',
    matchedExternalSite:'tmdb',matchedExternalId:'909',mappingMethod:'official_simkl_tmdb_lookup',
    rating:7.8,scale:10,releaseYear:2025,pageUrl:'https://simkl.com/movies/45678/test',
    ratingCount:177})});
 }
 if(u.pathname==='/api/kitsu/by-mal/1'){
  calledKitsu++;
  return route.fulfill({status:200,headers,body:JSON.stringify({code:0,platform:'Kitsu',id:'5',malId:'1',
   mappingMethod:'official_kitsu_mal_mapping',title:'Anime',rating:84.5,scale:100})});
 }
 return route.abort();
});
try{
 await page.goto('http://127.0.0.1:8765/index.html#media',{waitUntil:'domcontentloaded',timeout:25000});
 await page.locator('#media-grid .mi-card-open').first().waitFor({timeout:20000});
 await page.locator('#media-grid .mi-card-open').first().click();
 const push=info=>page.evaluate(x=>document.querySelector('#media').dispatchEvent(
   new CustomEvent('liangyou:media-detail',{detail:x})),info);
 await push({section:'ratings',kind:'movie',id:'tmdb-movie-999',title:'Test Film',year:'2025-01-10',
   aliases:['simkl-movie-12345']});
 await page.locator('.mi-exact-scores .mi-score-tile').first().waitFor({timeout:12000});
 assert.match(await page.locator('.mi-exact-scores').first().innerText(),/Simkl/);
 assert.equal(calledSimkl,1);
 console.log('EXACT_SIMKL_RATING_OK');
 await push({section:'ratings',kind:'anime',id:'anilist-anime-999',title:'Anime',malId:1,year:'2024',
   aliases:[]});
 await page.waitForFunction(()=>[...document.querySelectorAll('.mi-exact-scores')].some(x=>x.textContent.includes('Kitsu')),{timeout:12000});
 assert.equal(calledKitsu,1);
 console.log('EXACT_KITSU_MAL_MAPPING_OK');
 await push({section:'ratings',kind:'movie',id:'tmdb-movie-999',tmdbId:999,title:'Example',
   year:'2025-01-02',aliases:[]});
 await page.waitForFunction(()=>[...document.querySelectorAll('.mi-exact-scores')].some(n=>n.textContent.includes('8.4/10')),{timeout:12000});
 console.log('SIMKL_EXACT_TMDB_FALLBACK_OK');
 await push({section:'ratings',kind:'movie',id:'tmdb-movie-909',tmdbId:909,title:'Test Lookup Film',
   year:'2025-01-05',aliases:[]});
 await page.waitForFunction(()=>[...document.querySelectorAll('.mi-exact-scores')].some(x=>x.textContent.includes('7.8/10')),{timeout:12000});
 console.log('AUTO_SIMKL_BY_TMDB_ID_OK');
 await push({section:'ratings',kind:'movie',id:'tmdb-movie-666',title:'Unknown',year:'2025',aliases:[]});
 await page.waitForTimeout(250);
 assert.equal(await page.locator('.mi-exact-scores').filter({hasText:'Unknown'}).count(),0);
 console.log('NO_GUESSED_CROSS_PLATFORM_SCORES_OK');
 await page.locator('#media-dialog [data-mi-detail="boxoffice"]').click();
 const footer=page.locator('#media-boxoffice-rankings');
 await footer.locator('.mi-ranking-drawer').first().waitFor({timeout:8000});
 assert.equal(await footer.locator('.mi-ranking-drawer').count(),4);
 assert.equal(await page.locator('#media-dialog .mi-rankings-drawer').count(),0);
 assert.equal(await page.locator('#media-dialog .mtk-rankings').count(),0);
 const desc=await footer.locator('[data-mi-ranking="world"] summary').innerText();
 assert.match(desc,/2019/);
 console.log('BOTTOM_ONLY_REGION_AND_WORLD_CHARTS_OK');
 await footer.locator('[data-mi-ranking="world"] summary').click();
 await footer.locator('[data-mi-ranking="world"] .mi-ranking-list li').first().waitFor({timeout:9000});
 assert.match(await footer.locator('[data-mi-ranking="world"]').innerText(),/2019/);
 console.log('HISTORICAL_WORLDWIDE_CHART_OK');
 await footer.locator('[data-mi-ranking="world-current"] summary').click();
 await footer.locator('[data-mi-ranking="world-current"] .mi-ranking-list li').first().waitFor({timeout:10000});
 assert.match(await footer.locator('[data-mi-ranking="world-current"]').innerText(),/社区/);
 console.log('CURRENT_WIKIPEDIA_WORLDWIDE_SNAPSHOT_OK');
}finally{await context.close();await browser.close();}

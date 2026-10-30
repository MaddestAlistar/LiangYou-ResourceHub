/* Visual geometry regression test at mobile widths, no credentials or cloud APIs. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const issues=[];
for(const width of [390,360]){
 const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/data/media-intel.json')){
     const fixture=JSON.parse(await fs.readFile(new URL('../data/media-intel.json',import.meta.url),'utf8'));
     for(const work of Object.values(fixture.works||{})){
       if(work.profile){delete work.profile.genres;delete work.profile.keywords;delete work.profile.parental_rating;}
     }
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)});
   }
   if(['127.0.0.1','localhost'].includes(url.hostname)||url.protocol==='data:')return route.continue();
   return route.abort('blockedbyclient');
 });
 const page=await context.newPage();
 try{
   await page.goto('http://127.0.0.1:8765/index.html#media',{waitUntil:'domcontentloaded',timeout:25000});
   await page.waitForFunction(()=>document.querySelectorAll('#media-grid .mi-card').length>=2,{timeout:30000});
   const metrics=await page.evaluate(()=>{
     const cards=[...document.querySelectorAll('#media-grid .mi-card')].slice(0,2);
     const rect=(card,selector)=>(selector?card.querySelector(selector):card).getBoundingClientRect();
     const area=document.querySelector('#media-grid');
     return {layout:cards.map(card=>({
       card:[rect(card).top,rect(card).bottom,rect(card).height],
       poster:[rect(card,'.mi-poster').top,rect(card,'.mi-poster').bottom,rect(card,'.mi-poster').height],
       details:[rect(card,'.mi-card-copy').top,rect(card,'.mi-card-copy').bottom],
       link:[rect(card,'.mi-open-label').top,rect(card,'.mi-open-label').bottom],
       save:[rect(card,'.mi-quick-save').top,rect(card,'.mi-quick-save').bottom]
     })),overflow:area.scrollWidth-area.clientWidth};
   });
   const [a,b]=metrics.layout;
   const close=(x,y,label,tolerance=3)=>assert.ok(Math.abs(x-y)<=tolerance,label+': '+x+' vs '+y);
   close(a.card[0],b.card[0],'card top');
   close(a.card[1],b.card[1],'card bottom');
   close(a.poster[1],b.poster[1],'poster bottom');
   close(a.link[0],b.link[0],'details footer top');
   close(a.save[0],b.save[0],'watchlist footer top');
   assert.ok(metrics.overflow<=2,'grid horizontal overflow '+metrics.overflow);
   console.log('MOBILE_FILM_LAYOUT_OK',width,JSON.stringify(metrics));
   // Dedicated card shortcut must open the same Discover panel as the
   // existing in-dialog tab, without stealing the normal card click.
   const shortcut=page.locator('#media-grid .mi-card-discover').first();
   assert.match((await shortcut.textContent()).trim(),/资讯推荐/);
   const shortcutId=await shortcut.getAttribute('data-mi-card-discover');
   assert.equal(shortcutId,await page.locator('#media-grid .mi-card-open').first().getAttribute('data-mi-open'));
   await shortcut.click();
   await page.waitForFunction(()=>document.querySelector('#media-dialog')?.open,{timeout:10000});
   assert.equal(await page.locator('#media-dialog [data-mi-detail="discover"]').getAttribute('aria-pressed'),'true');
   const slots=()=>page.locator('#media-dialog [data-mi-discover-slot]').evaluateAll(
     nodes=>nodes.map(node=>node.dataset.miDiscoverSlot));
   const shortcutsSlots=await slots();
   assert.deepEqual(shortcutsSlots,['trailers','international','domestic','related','similar']);
   await page.locator('#media-dialog [data-mi-detail="ratings"]').click();
   await page.locator('#media-dialog [data-mi-detail="discover"]').click();
   assert.deepEqual(await slots(),shortcutsSlots,'Card and dialog shortcuts must share the exact Discover panel');
   await page.locator('#media-dialog-close').click();

   // Six-category title navigation must remain usable and free of internal API registry.
   await page.locator('#media-grid .mi-card-open').first().click();
   assert.equal(await page.locator('#media-dialog [data-mi-detail="ratings"]').getAttribute('aria-pressed'),'true');
   await page.waitForFunction(()=>document.querySelector('#media-dialog')?.open,{timeout:10000});
   const titleUI=await page.evaluate(()=>{
     const dialog=document.querySelector('#media-dialog');
     const nav=[...dialog.querySelectorAll('[data-mi-detail]')];
     return {labels:nav.map(x=>x.dataset.miDetail),sourceRegistry:document.querySelectorAll('#media .mi-source-registry').length,
       navOverflow:dialog.querySelector('.mi-detail-nav').scrollWidth-dialog.querySelector('.mi-detail-nav').clientWidth};
   });
   assert.deepEqual(titleUI.labels,['ratings','profile','people','boxoffice','watch','discover']);
   assert.equal(titleUI.sourceRegistry,0,'internal source registry must not appear to visitors');
   assert.ok(titleUI.navOverflow<=2,'six section tabs overflowing mobile width: '+titleUI.navOverflow);
   console.log('MOBILE_FILM_DETAILS_OK',width,JSON.stringify(titleUI));

   // Simulate the exact TMDB Worker classification event without external API access.
   // Both surfaces must update in place, without rebuilding the list of cards.
   const firstId=await page.locator('#media-grid .mi-card-open').first().getAttribute('data-mi-open');
   const idMatch=/^tmdb-(movie|tv)-([1-9]\d{0,9})$/.exec(firstId||'');
   assert.ok(idMatch,'First film must have a verified TMDB identity');
   const metadata=await page.evaluate(({id,kind,tmdbId})=>{
     const root=document.querySelector('#media');
     const card=[...root.querySelectorAll('.mi-card-open')].find(node=>node.dataset.miOpen===id);
     card.dataset.markStable='untouched';
     root.dispatchEvent(new CustomEvent('liangyou:media-classification',{detail:{
       id,kind,tmdbId,classification:{genres:['剧情'],keywords:['verified film theme'],
         parental_rating:{country:'US',rating:'PG-13',source:'TMDB'}}
     }}));
     const updated=[...root.querySelectorAll('.mi-card-open')].find(node=>node.dataset.miOpen===id);
     return {stable:updated===card&&updated.dataset.markStable==='untouched',
       cardText:updated.querySelector('.mi-card-classification')?.textContent||'',
       detailText:document.querySelector('#media-dialog .mi-classification-detail')?.textContent||''};
   },{id:firstId,kind:idMatch[1],tmdbId:Number(idMatch[2])});
   assert.ok(metadata.stable,'Async metadata must not re-render an entire film card');
   assert.match(metadata.cardText,/家长指南 · US PG-13/,'Card must show source-verified classification');
   assert.match(metadata.detailText,/家长指南 · 地区分级/,'Detail must show regional guidance');
   assert.match(metadata.detailText,/verified film theme/,'Detail must show verified theme keywords');
   console.log('MOBILE_CARD_AND_DOSSIER_GUIDES_OK',width);

   await page.locator('#media-dialog [data-mi-detail="boxoffice"]').click();
   await page.waitForTimeout(250);
   assert.equal(await page.locator('#media-dialog [data-mi-detail="boxoffice"]').getAttribute('aria-pressed'),'true');
   await page.locator('#media-dialog-close').click();

 }catch(err){
   const file='/tmp/mobile-film-'+width+'.png';
   await page.screenshot({path:file,fullPage:false}).catch(()=>{});
   issues.push(width+': '+String(err));
 }
 await context.close();
}
await browser.close();
if(issues.length){issues.forEach(x=>console.error('MOBILE_FILM_LAYOUT_FAIL',x));process.exitCode=1;}

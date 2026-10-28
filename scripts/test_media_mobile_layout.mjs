/* Visual geometry regression test at mobile widths, no credentials or cloud APIs. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const issues=[];
for(const width of [390,360]){
 const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await context.route('**/*',route=>{
   const url=new URL(route.request().url());
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
 }catch(err){
   const file='/tmp/mobile-film-'+width+'.png';
   await page.screenshot({path:file,fullPage:false}).catch(()=>{});
   issues.push(width+': '+String(err));
 }
 await context.close();
}
await browser.close();
if(issues.length){issues.forEach(x=>console.error('MOBILE_FILM_LAYOUT_FAIL',x));process.exitCode=1;}

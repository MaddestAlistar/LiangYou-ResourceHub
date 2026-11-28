// Regression: real directory renderer at phone/tablet/desktop sizes, with local fixtures.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=resolve(import.meta.dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const width of [320,360,390,430,768,1280]){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/emby-wiki-feed')return route.fulfill({json:{ok:true,items:[{name:'长数字排版测试',movies:100000000,series:99999999,episodes:100000000,moviesWithVersions:100000000,seriesWithVersions:100000000,episodesWithVersions:100000000,statsDate:'2026-11-28'}]}});
   if(url.hostname==='127.0.0.1')return route.continue();
   return route.abort();
  });
  const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html#emby-wiki`);
  await page.locator('#wiki-search').fill('长数字排版测试');
  await page.getByRole('button',{name:'查看 长数字排版测试 的完整档案',exact:true}).waitFor();
  const metrics=await page.locator('.wk-directory-count>strong').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,width:n.clientWidth,scroll:n.scrollWidth,overflow:getComputedStyle(n).overflow,whiteSpace:getComputedStyle(n).whiteSpace})));
  assert.deepEqual(metrics.map(x=>x.text),['100,000,000','99,999,999']);
  for(const n of metrics)assert.ok(n.scroll<=n.width+1,`${width}px card clipped: ${JSON.stringify(n)}`);
  await page.getByRole('button',{name:'查看 长数字排版测试 的完整档案',exact:true}).click();
  const detail=await page.locator('.wk-version-row strong').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,width:n.clientWidth,scroll:n.scrollWidth,wrap:getComputedStyle(n).whiteSpace})));
  for(const n of detail){assert.ok(n.scroll<=n.width+1,`${width}px detail clipped`);assert.equal(n.wrap,'nowrap')}
  await context.close();console.log(`PASS ${width}px: full card and detail counts`);
 }
}finally{await browser.close();await new Promise(r=>server.close(r))}

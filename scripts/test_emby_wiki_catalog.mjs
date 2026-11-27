import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergeWikiCatalog} from '../emby-wiki-catalog.mjs';
const {items}=JSON.parse(await readFile(new URL('../assets/data/emby-atlas.json',import.meta.url),'utf8'));
test('import has unique records and no invented library statistics',()=>{
 assert.equal(items.length,91);
 assert.equal(new Set(items.map(x=>x.name.toLowerCase())).size,91);
 for(const item of items){
  for(const field of ['movies','series','episodes','moviesWithVersions','seriesWithVersions','episodesWithVersions','others'])assert.equal(item[field],null);
  assert.equal(item.statsDate,'');assert.equal(item.submissionDate,'');
  assert.equal(item.nickname,'');assert.equal(item.role,'');
 }
 assert.equal(items.find(x=>x.name==='海豚emby').registration,'');
});
test('approved data including zero and statistics provenance remain authoritative',()=>{
 const original={id:'original',name:'宸宇',movies:0,statsDate:'2026-11-13',registration:'existing',network:'',retention:'existing retention',updatedAt:'2026-11-13',nickname:'author'};
 const result=mergeWikiCatalog([original],items);
 assert.equal(result.length,91);
 const item=result.find(x=>x.id==='original');
 assert.equal(item.movies,0);assert.equal(item.statsDate,'2026-11-13');
 assert.equal(item.registration,'existing');assert.equal(item.retention,'existing retention');
 assert.equal(item.nickname,'author');assert.equal(item.updatedAt,'2026-11-13');
 assert.equal(item.network,'可直连');assert.equal(original.network,'');
});
test('separate server editions are not merged by partial name',()=>{
 const result=mergeWikiCatalog([{name:'SNTP Standard'}],items);
 assert.equal(result.length,92);
 assert.ok(result.some(x=>x.name==='SNTP Lite v5'));
});

const telegram=JSON.parse(await readFile(new URL('../assets/data/emby-telegram.json',import.meta.url),'utf8'));
test('Telegram supplement leaves unknown counts, operating state and dates empty',()=>{
 assert.equal(telegram.items.length,22);
 for(const item of telegram.items){
  for(const field of ['movies','series','episodes','moviesWithVersions','seriesWithVersions','episodesWithVersions','others'])assert.equal(item[field],null);
  assert.equal(item.state,'');assert.equal(item.statsDate,'');assert.equal(item.submissionDate,'');
  assert.equal(item.nickname,'');assert.equal(item.role,'');
 }
 const pro=telegram.items.find(x=>x.name==='瞬影Pro');
 assert.match(pro.statsNote,/2026-08-13/);assert.match(pro.statsNote,/未说明是否包含多版本/);
});
test('multiple sources keep attribution and existing fields; separate paid editions stay distinct',()=>{
 const result=mergeWikiCatalog(items,telegram.items);
 assert.equal(result.length,105);
 assert.ok(result.some(x=>x.name==='瞬影'));
 assert.ok(result.some(x=>x.name==='瞬影Pro'));
 const nya=result.find(x=>x.name==='Nya Media Chat');
 assert.equal(nya.bot,'https://t.me/nyamedia_subscription_dev_bot');
 assert.equal(nya.sources.length,2);
 assert.equal(nya.sources[0].name,'e江湖');
 assert.ok(nya.sources[1].fields.includes('bot'));
});
test('historical notes never contaminate submitted count columns or provenance',()=>{
 const approved={id:'submitted',name:'益禾堂',movies:349,series:604,statsDate:'2026-11-13',statsNote:'',summary:'',nickname:'黄豆'};
 const incoming={...telegram.items.find(x=>x.name==='益禾堂'),statsNote:'Older historical count',movies:58};
 const result=mergeWikiCatalog([approved],[incoming])[0];
 assert.equal(result.movies,349);assert.equal(result.series,604);assert.equal(result.statsNote,'');
 assert.equal(result.statsDate,'2026-11-13');assert.equal(result.nickname,'黄豆');
 assert.deepEqual(result.sources[0].fields,['summary']);
});
test('one missing static source still returns the surviving catalog with partial notice',async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=async url=>{if(String(url).includes('telegram'))throw Error('network');return {ok:true,json:async()=>({items})}};
 try{
  const {fetchWikiSupplement}=await import('../emby-wiki-catalog.mjs');
  const result=await fetchWikiSupplement();assert.equal(result.partial,true);assert.equal(result.items.length,91);
 }finally{globalThis.fetch=saved}
});

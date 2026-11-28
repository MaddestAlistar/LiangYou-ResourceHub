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

const snapshots=JSON.parse(await readFile(new URL('../assets/data/emby-statistics.json',import.meta.url),'utf8'));
const {libraryView}=await import('../emby-wiki-catalog.mjs');
test('public counts are sourced snapshots; zero is data and missing dates stay missing',()=>{
 assert.equal(snapshots.items.length,51);
 assert.equal(new Set(snapshots.items.map(x=>x.name)).size,51);
 for(const {publicStats:s} of snapshots.items){
  assert.match(s.sourceUrl,/^https:\/\//);
  assert.ok(['unspecified','includingVersions'].includes(s.method));
  for(const key of ['movies','series','episodes'])assert.ok(s[key]===null||(Number.isSafeInteger(s[key])&&s[key]>=0));
  assert.ok(s.date===''||/^2026-\d\d-\d\d$/.test(s.date));
 }
 const zero=libraryView(snapshots.items.find(x=>x.name==='一点点'));
 assert.equal(zero.reportedMovies,0);assert.equal(zero.reportedSeries,26);
 assert.equal(zero.movies,undefined);assert.equal(zero.moviesWithVersions,undefined);
 const undated=libraryView(snapshots.items.find(x=>x.name==='麦当劳MDL'));
 assert.equal(undated.statsDate,'');assert.equal(undated.reportedMovies,1837);
 assert.equal(snapshots.items.some(x=>x.name==='youno公益'),false);
});
test('known version methodology uses its matching column and never populates deduplicated values',()=>{
 const entry=snapshots.items.find(x=>x.name==='临境Liminal EA');
 const view=libraryView(entry);
 assert.equal(view.moviesWithVersions,20649);assert.equal(view.seriesWithVersions,11114);
 assert.equal(view.movies,undefined);assert.equal(view.reportedMovies,undefined);
 assert.equal(view.statsDate,'2026-07-14');assert.equal(entry.statsDate,undefined);
 assert.deepEqual(libraryView(view),view);
});
test('public snapshots merge atomically, preserve submitted statistics and separate editions',()=>{
 const data=mergeWikiCatalog(mergeWikiCatalog(items,telegram.items),snapshots.items);
 assert.equal(data.length,109);
 assert.equal(libraryView(data.find(x=>x.name==='瞬影Pro')).reportedMovies,21068);
 assert.equal(libraryView(data.find(x=>x.name==='瞬影')).reportedMovies,undefined);
 const incoming=snapshots.items.find(x=>x.name==='一点点');
 const approved={name:'一点点',movies:0,series:30,statsDate:'2026-11-28'};
 const merged=mergeWikiCatalog([approved],[incoming])[0];
 assert.equal(merged.publicStats,undefined);assert.deepEqual(libraryView(merged),approved);
 const old={name:'一点点',publicStats:{movies:1,series:2,date:'2026-07-01',sourceUrl:'https://example.com/old'}};
 const latest=mergeWikiCatalog([old],[incoming])[0];
 assert.deepEqual(latest.publicStats,incoming.publicStats);
 assert.equal(old.publicStats.movies,1);
 assert.deepEqual(mergeWikiCatalog([latest],[old])[0].publicStats,incoming.publicStats);
});
test('unavailable statistics file keeps descriptions and surfaces partial failure',async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=async url=>{
  const path=String(url);
  if(path.includes('statistics'))throw Error('network');
  return {ok:true,json:async()=>({items:path.includes('telegram')?telegram.items:items})};
 };
 try{
  const {fetchWikiSupplement}=await import('../emby-wiki-catalog.mjs');
  const result=await fetchWikiSupplement();
  assert.equal(result.partial,true);assert.equal(result.items.length,105);
 }finally{globalThis.fetch=saved}
});

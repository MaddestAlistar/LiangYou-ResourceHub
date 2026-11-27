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

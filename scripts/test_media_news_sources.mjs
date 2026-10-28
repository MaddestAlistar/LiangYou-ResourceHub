/* Verify source bounds and cross-title safety without making web requests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const core=read('media-intel.js'), tool=read('media-toolkit.js'), ins=read('media-insights.js'),
  cn=read('media-cn-enhance.js'),worker=read('labs/streaming-availability-worker.mjs'),
  world=read('scripts/update_media_world_news.py'), mainland=read('scripts/update_media_cn_news.py');
test('US-only duplicate is gone, real regional platform toolkit and subtitles remain',()=>{
 const part=core.slice(core.indexOf('  function watch(w){'),core.indexOf('  function renderDetail(){'));
 assert.doesNotMatch(part,/在哪里看|美国区 · 其他地区可能不同/);
 assert.match(part,/字幕情报/);
 assert.match(tool,/观影工具箱/);
 assert.match(tool,/JustWatch via TMDB/);
});
test('world news includes six trusted publisher feeds, never invented articles',()=>{
 for(const name of ['Variety','Deadline','The Hollywood Reporter','IndieWire','TheWrap','Collider'])
   assert.ok(world.includes(name),name);
 assert.match(world,/if not rows:/);
 assert.match(world,/No|NO_VERIFIED/);
 assert.match(world,/trusted\(link,host\)/);
});
test('international and domestic panels cap matching articles at six and retain source',()=>{
 const section=ins.slice(ins.indexOf('  function discoverySections('),ins.indexOf('  async function displayBoxOfficeArchive('));
 assert.match(section,/\.slice\(0,6\)/);
 assert.match(section,/x\.source/);
 assert.match(section,/match\(x\)/);
 assert.match(ins,/data-mi-discover-slot="international"/);
 const dom=cn.slice(cn.indexOf('function domesticNews(info){'));
 assert.match(dom,/\.slice\(0,6\)/);
 assert.match(dom,/sameTitle\(headline\)/);
 assert.match(dom,/data-mi-discover-slot="domestic"/);
 for(const origin of ['搜狐娱乐','新浪电影','腾讯娱乐','豆瓣影评'])
  assert.ok(mainland.includes(origin),origin);
});
test('Wikidata box office is separately scoped and cannot be mixed with TMDB totals',()=>{
 assert.match(worker,/verifiedWikimedia\(/);
 assert.match(worker,/P4947/);
 assert.match(worker,/P4983/);
 assert.match(worker,/P2142/);
 assert.match(worker,/scope:"unspecified"/);
 assert.match(worker,/if\(withWiki\)task\("wikimedia"/);
 assert.match(ins,/d\.wikidataBoxOffice/);
 assert.match(ins,/地区与统计时间未注明/);
 assert.match(ins,/showWikimediaInToolkit/);
});
test('Wikipedia links never imply streaming rights',()=>{
 assert.match(ins,/百科不提供实时播放渠道/);
 assert.match(ins,/不代表此平台可播放/);
 assert.match(tool,/panel\.dataset\.mtkId=current\.id/);
});

/* Safeguards for exact-ID Korean title coverage and unrelated headline rejection. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const index=JSON.parse(readFileSync(new URL('../data/media-title-news.json',import.meta.url),'utf8'));
const lib=readFileSync(new URL('../media-title-news.js',import.meta.url),'utf8');
const front=readFileSync(new URL('../media-cn-enhance.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../media-insights.js',import.meta.url),'utf8');
const clips=readFileSync(new URL('../labs/streaming-availability-worker.mjs',import.meta.url),'utf8');
const fixture={kind:'tv',tmdbId:303745,year:'2026-10-19',title:'我的有罪之人',originalTitle:'나의 유죄인간'};
const fakeWindow={};
const load=new Function('window','fetch','AbortSignal',lib+';return window.LiangYouTitleNews')(
 fakeWindow,async ()=>new Response(JSON.stringify(index),{status:200}),AbortSignal
);
test('verified Korean series and unofficial community coverage use one exact TMDB identity',async()=>{
 const data=await load.forInfo(fixture);
 assert.ok(data&&data.articles.length>=4);
 assert.ok(data.articles.some(x=>x.type==='community'));
 assert.ok(data.articles.some(x=>x.title.includes('我的有罪之人')));
 assert.ok(data.videos.some(v=>v.platform==='bilibili'&&v.type==='Related'));
 assert.ok(data.articles.every(v=>v.url.startsWith('https://')));
});
test('wrong movie year or ID cannot receive the 2026 Korean series articles or videos',async()=>{
 for(const info of [
  {...fixture,tmdbId:303744},{...fixture,kind:'movie'},{...fixture,year:'2025-10-19'},
  {...fixture,tmdbId:null},{...fixture,kind:'anime'}
 ])assert.equal(await load.forInfo(info),null);
});
test('broad arts stories cannot be presented as matched Korean drama headlines',()=>{
 const start=front.indexOf('function headlineMatch('),end=front.indexOf('function domesticNews(',start);
 assert.ok(start>0&&end>start);
 const match=new Function('sameTitle',front.slice(start,end)+';return headlineMatch')(
  x=>String(x||'').normalize('NFKC').replace(/\\s+/g,'').replace(/[·•\\-–—:：.。"'“”‘’]/g,'').toLowerCase()
 );
 for(const item of [
   '澜湄流域各国艺术家齐聚西双版纳 演绎多元文明交融共生',
   '破解千馆一面 全国文学馆联盟年会',
   '第十二届中国曲艺节在四川广安开幕',
   '剪辑刷屏 《有罪之身》杀回榜单'
 ])assert.equal(match(item,fixture),0,item);
 assert.ok(match('《我的有罪之人》任时完、薛仁雅最新剧评',fixture)>0);
});
test('YouTube extras and domestic related clips are separately limited',()=>{
 assert.match(clips,/result\\.relatedVideos=matched\\.slice\\(0,2\\)/);
 assert.match(ui,/domesticRelated\\.slice\\(0,6\\)/);
 assert.match(ui,/data-mi-play-cn/);
 assert.doesNotMatch(ui,/relatedCards\\.length\\+'\\/5'/);
});

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
test('Moana live-action and Curry Barker Obsession have identity-safe Chinese and foreign articles and clips',async()=>{
 for(const [id,title] of [[1108427,'海洋奇缘：启航'],[1339713,'痴迷']]){
  const fixture={kind:'movie',tmdbId:id,year:'2026-07-10',title};
  const item=await load.forInfo(fixture);
  assert.ok(item&&item.articles.filter(x=>x.language==='zh').length>=5,title+' Chinese news');
  assert.ok(item.articles.filter(x=>x.language!=='zh').length>=2,title+' foreign news');
  assert.ok(item.articles.every(x=>x.verifiedByTitleId===true),title+' ID binding');
  assert.ok(item.videos.length>=4,title+' preview/video entries');
  assert.ok(item.videos.every(x=>x.kind==='movie'&&x.year===2026),title+' correct film identity');
  assert.equal(await load.forInfo({...fixture,year:'2016-11-23'}),null,'older edition must not reuse new film news');
  assert.equal(await load.forInfo({...fixture,kind:'tv'}),null,'series must not receive movie metadata');
 }
});
test('automatic rotating coverage makes previously unindexed titles available without trusting mismatched IDs',async()=>{
 let reads=0;
 const saved={
  schema:1,items:{'movie:550':{
   year:1999,checkedAt:'2026-10-29T00:00:00+00:00',
   articles:[
    {title:'Fight Club film director interview retrospective',
     url:'https://news.google.com/rss/articles/fightclub',source:'Publisher',
     language:'en',date:'2026-10-28',titleMatchVerified:true},
    {title:'Unverified arts editorial',url:'https://example.com/story',
     source:'Unknown',language:'en',titleMatchVerified:false}],
   videos:[
    {kind:'movie',tmdbId:550,verifiedByTitleId:true,year:1999,
      title:'Fight Club',platform:'bilibili',videoId:'BV1234567890',
      name:'Fight Club behind the scenes',
      verifiedSource:'https://www.bilibili.com/video/BV1234567890/'},
    {kind:'movie',tmdbId:551,verifiedByTitleId:true,year:1999,
      title:'Other film',platform:'bilibili',videoId:'BV1234567891',
      name:'Wrong work',verifiedSource:'https://www.bilibili.com/video/BV1234567891/'}]
  }}
 };
 const mock=async url=>{
   if(String(url).includes('media-title-coverage.json')){
     reads++;return new Response(JSON.stringify(saved),{status:200});
   }
   return new Response(JSON.stringify({schema:1,titles:{}}),{status:200});
 };
 const helper=new Function('window','fetch','AbortSignal',lib+';return window.LiangYouTitleNews')(
   {},mock,AbortSignal);
 const data=await helper.forInfo({kind:'movie',tmdbId:550,year:'1999-10-15'});
 assert.equal(data.articles.length,1);
 assert.equal(data.videos.length,1);
 assert.equal(data.videos[0].tmdbId,550);
 assert.equal((await helper.forInfo({kind:'movie',tmdbId:550,year:'1999-10-15'})).articles.length,1);
 assert.equal(reads,1);
 assert.equal(await helper.forInfo({kind:'movie',tmdbId:550,year:'2026-01-01'}),null);
 assert.equal(await helper.forInfo({kind:'movie',tmdbId:551,year:'1999-10-15'}),null);
 assert.equal(await helper.forInfo({kind:'tv',tmdbId:550,year:'1999-10-15'}),null);
});
test('optional remotely searched headlines are ID-bound and cannot erase local articles',async()=>{
 let calls=0;
 const runtime={};
 const remoteFetch=async url=>{
   if(String(url).includes('/api/news/title/tv/303745')){
     calls++;
     return new Response(JSON.stringify({
       ok:true,kind:'tv',tmdbId:303745,articles:[
         {title:'《我的有罪之人》公开采访',titleMatchVerified:true,date:'2026-10-28',source:'Film Publisher',
           url:'https://news.google.com/rss/articles/verified',language:'zh'},
         {title:'无关的新闻',date:'2026-10-28',source:'Unrelated',
           url:'https://bad.example/test',language:'zh'}
       ]}),{status:200});
   }
   return new Response(JSON.stringify(index),{status:200});
 };
 const helper=new Function('window','fetch','AbortSignal',lib+';return window.LiangYouTitleNews')(
    runtime,remoteFetch,AbortSignal);
 const local=await helper.forInfo(fixture);
 const remote=await helper.remoteForInfo(fixture);
 const remoteCached=await helper.remoteForInfo(fixture);
 assert.ok(local.articles.length>=4);
 assert.equal(remote.articles.length,1);
 assert.equal(remote.articles[0].source,'Film Publisher');
 assert.deepEqual(remoteCached,remote);
 assert.equal(calls,1);
 assert.deepEqual(await helper.forInfo({...fixture,tmdbId:999999}),null);
});
test('new automatic domestic video service only accepts verified same-ID publisher links',async()=>{
 let count=0;
 const runtime={};
 const response=async url=>{
  if(String(url).includes('/api/videos/title/tv/303745')){
   count++;
   const row={kind:'tv',tmdbId:303745,verifiedByTitleId:true,title:'我的有罪之人',
     year:2026,platform:'bilibili',videoId:'BV1spJR6yEci',
     name:'我的有罪之人演员访谈',verifiedSource:'https://www.bilibili.com/video/BV1spJR6yEci/'};
   return new Response(JSON.stringify({ok:true,kind:'tv',tmdbId:303745,year:2026,
     videos:[row,{...row,tmdbId:123},{...row,videoId:'BV0000000000',
       verifiedSource:'https://untrusted.example/watch'}]}),{status:200});
  }
  return new Response(JSON.stringify(index),{status:200});
 };
 const helper=new Function('window','fetch','AbortSignal',lib+';return window.LiangYouTitleNews')(
   runtime,response,AbortSignal);
 const result=await helper.videoForInfo(fixture);
 assert.equal(result.videos.length,1);
 assert.equal(result.videos[0].videoId,'BV1spJR6yEci');
 assert.equal((await helper.videoForInfo(fixture)).videos.length,1);
 assert.equal(count,1);
 assert.equal(await helper.videoForInfo({...fixture,tmdbId:0}),null);
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
test('the universal gallery now uses six shared slots and four optional domestic overflow slots',()=>{
 assert.ok(clips.includes('result.relatedVideos=matched.slice(0,16)'));
 assert.ok(ui.includes('function rankFilmVideos(rows)'));
 assert.ok(ui.includes('ranked.slice(0,6)'));
 assert.ok(ui.includes('slice(0,4)'));
 assert.ok(!ui.includes("relatedCards.length+'/5'"));
});

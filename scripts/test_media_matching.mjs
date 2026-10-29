import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{domesticVideoLink,articleRelevance} from '../labs/streaming-availability-worker.mjs';

const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;
after(()=>{globalThis.fetch=originalFetch;globalThis.caches=originalCaches;});
globalThis.caches={default:{match:async()=>null,put:async()=>{}}};
const json=x=>new Response(JSON.stringify(x));
const info={kind:'movie',tmdbId:550,year:1999,title:'搏击俱乐部'};
const records=[
 {platform:'tencent',videoId:'c3278hj65i6',verifiedSource:'https://v.qq.com/x/page/c3278hj65i6.html'},
 {platform:'1905',videoId:'811133',verifiedSource:'https://www.1905.com/video/play/811133.shtml'},
 {platform:'youku',videoId:'XNDQ12345678',verifiedSource:'https://v.youku.com/v_show/id_XNDQ12345678.html'},
 {platform:'iqiyi',videoId:'abcd12345',verifiedSource:'https://www.iqiyi.com/v_abcd12345.html'},
].map(x=>({...x,kind:'movie',tmdbId:550,year:1999,verifiedByTitleId:true,name:'《搏击俱乐部》电影预告',title:'搏击俱乐部'}));

test('canonical video links retain an actual episode VID and reject cover/search/profile URLs',()=>{
 assert.deepEqual(domesticVideoLink('https://v.qq.com/x/cover/album123/c3278hj65i6.html?tracking=1'),
  {platform:'tencent',videoId:'c3278hj65i6',url:records[0].verifiedSource});
 assert.equal(domesticVideoLink('https://m.1905.com/m/video/811133.shtml?fr=home').url,records[1].verifiedSource);
 for(const url of ['https://v.qq.com/x/cover/album123.html','https://www.1905.com/mdb/film/2119928/',
  'https://v.qq.com.evil.example/x/page/c3278hj65i6.html','https://a:b@v.qq.com/x/page/c3278hj65i6.html',
  'javascript:alert(1)','https://v.qq.com/x/search/?q=film'])assert.equal(domesticVideoLink(url),null,url);
});

test('article matching uses summaries and Unicode names without accepting sequels or old editions',()=>{
 assert.ok(articleRelevance('导演谈这部电影的幕后制作','《搏击俱乐部》导演 David Fincher 访谈',['搏击俱乐部'],{year:1999})>0);
 assert.ok(articleRelevance('Amélie (2001) film review','',['Amélie'],{year:2001})>0);
 assert.equal(articleRelevance('Dune 2 movie review','',['Dune'],{year:2021}),0);
 assert.equal(articleRelevance('Moana (2016) film review','Moana movie',['Moana'],{year:2026}),0);
 assert.equal(articleRelevance('Garden obsession interview','',['Obsession'],{year:2026}),0);
 assert.equal(articleRelevance('今日热门话题','《搏击俱乐部》电影',['搏击俱乐部'],{year:1999}),0);
});

test('non-curated movie discovers Tencent and 1905 only after checking destination page metadata',async()=>{
 const checked=[];
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='api.themoviedb.org')return json({id:550,adult:false,title:'搏击俱乐部',original_title:'Fight Club',release_date:'1999-10-15'});
  if(u.hostname==='api.bilibili.com')return json({code:-412});
  if(u.hostname==='www.bing.com')return new Response('<rss><channel/></rss>');
  if(u.hostname==='search.bilibili.com')return new Response('',{status:403});
  if(u.hostname==='v.qq.com'&&u.pathname==='/x/search/')return new Response(
   '<a href="https://v.qq.com/x/cover/album123/c3278hj65i6.html">《搏击俱乐部》电影预告</a>'+
   '<a href="https://v.qq.com/x/page/bad12345678.html">《搏击俱乐部》电影预告</a>'+
   '<a href="https://v.qq.com/x/page/err12345678.html">《搏击俱乐部》电影预告</a>');
  if(u.hostname==='search.1905.com')return new Response('<a href="'+records[1].verifiedSource+'">《搏击俱乐部》制作花絮</a>');
  checked.push(u.href);
  if(u.pathname.includes('bad12345678'))return new Response('<meta property="og:title" content="另一部电影预告">');
  if(u.pathname.includes('err12345678'))return new Response('<meta property="og:title" content="《搏击俱乐部》电影预告"><meta property="og:url" content="https://v.qq.com/x/page/xxx12345678.html">');
  return new Response('<meta property="og:title" content="《搏击俱乐部》电影预告"><meta property="og:url" content="'+u.href+'">');
 };
 const r=await worker.fetch(new Request('https://test.example/api/videos/title/movie/550'),{TMDB_API_KEY:'test'},{waitUntil(){}});
 const body=await r.json();
 assert.equal(body.status,'ok');assert.equal(body.videos.length,2);
 assert.deepEqual(new Set(body.videos.map(x=>x.platform)),new Set(['tencent','1905']));
 assert.ok(body.videos.every(x=>x.verifiedByTitleId&&x.tmdbId===550&&x.likes===null));
 assert.ok(checked.includes(records[0].verifiedSource));
 assert.ok(checked.includes(records[1].verifiedSource));
});

test('all domestic providers survive both live and scheduled frontend readers; wrong identities do not',async()=>{
 const source=readFileSync(new URL('../media-title-news.js',import.meta.url),'utf8');
 const videos=[...records,{...records[0],tmdbId:551},{...records[1],verifiedSource:'https://evil.example/video'}];
 const fakeFetch=async url=>String(url).includes('/api/videos/')?json({ok:true,...info,videos}):
  String(url).includes('coverage')?json({schema:1,items:{'movie:550':{year:1999,articles:[],videos}}}):json({schema:1,titles:{}});
 const reader=new Function('window','fetch','AbortSignal',source+';return window.LiangYouTitleNews;')({},fakeFetch,AbortSignal);
 assert.equal((await reader.videoForInfo(info)).videos.length,4);
 assert.equal((await reader.forInfo(info)).videos.length,4);
 assert.equal(await reader.forInfo({...info,year:2026}),null);
});

test('partial platform outages never produce synthetic video URLs or erase valid providers',async()=>{
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='api.themoviedb.org')return json({id:550,adult:false,title:'Fight Club',release_date:'1999-10-15'});
  throw Error('provider unavailable');
 };
 const r=await worker.fetch(new Request('https://test.example/api/videos/title/movie/550'),{TMDB_API_KEY:'test'},{waitUntil(){}});
 const body=await r.json();
 assert.equal(body.status,'upstream_unavailable');assert.deepEqual(body.videos,[]);
 assert.ok(body.sourceDiagnostics.platformSearchFailed>0);
});

test('native provider records survive a detail outage only with consistent aid, BVID, URL and date',async()=>{
 let removed=false;
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='api.themoviedb.org')return json({id:550,adult:false,title:'搏击俱乐部',release_date:'1999-10-15'});
  if(u.hostname==='api.bilibili.com'&&u.pathname.endsWith('/search/type'))return json({code:0,data:{result:[
   {type:'video',aid:12345,bvid:'BV1234567890',arcurl:'http://www.bilibili.com/video/av12345',
    pubdate:1700000000,title:'《搏击俱乐部》电影预告',author:'Film creator',like:230},
   {type:'video',aid:45678,bvid:'BV1234567891',arcurl:'https://www.bilibili.com/video/av99999',
    pubdate:1700000000,title:'《搏击俱乐部》电影预告'}
  ]}});
  if(u.hostname==='api.bilibili.com'&&u.pathname.endsWith('/view')){
   if(removed)return json({code:-404});
   throw Error('details unavailable');
  }
  throw Error('unavailable');
 };
 const get=async()=>{
  const r=await worker.fetch(new Request('https://test.example/api/videos/title/movie/550'),{TMDB_API_KEY:'test'},{waitUntil(){}});
  return r.json();
 };
 const available=await get();
 assert.equal(available.videos.length,1);
 assert.equal(available.videos[0].videoId,'BV1234567890');
 assert.equal(available.videos[0].verification,'provider_search_metadata');
 assert.equal(available.videos[0].likes,230);
 removed=true;
 assert.deepEqual((await get()).videos,[],'explicit removal must override a cached search record');
});

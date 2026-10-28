/* Offline contract tests: no API credentials or network access required. */
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../labs/streaming-availability-worker.mjs';

const originalFetch=globalThis.fetch;
const originalCaches=globalThis.caches;
globalThis.caches={default:{match:async()=>null,put:async()=>{}}};
after(()=>{globalThis.fetch=originalFetch;globalThis.caches=originalCaches;});
const json=data=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
function stub(data){
 globalThis.fetch=async input=>{
   const uri=new URL(String(input));
   if(uri.hostname==='api.themoviedb.org'&&uri.pathname.startsWith('/3/movie/550'))
     return json({...data.movie,id:550,title:'Fight Club',original_title:'Fight Club',adult:false,external_ids:{imdb_id:'tt0137523'},imdb_id:'tt0137523'});
   if(uri.hostname==='api.themoviedb.org'&&uri.pathname.startsWith('/3/tv/1399'))
     return json({...data.tv,id:1399,name:'Game of Thrones',original_name:'Game of Thrones',adult:false,external_ids:{tvdb_id:121361,imdb_id:'tt0944947'}});
   if(uri.hostname==='api4.thetvdb.com'&&uri.pathname==='/v4/login')return json({data:{token:'test-bearer'}});
   if(uri.hostname==='api4.thetvdb.com'&&uri.pathname==='/v4/series/121361/extended')return json({data:{id:121361,name:'Game of Thrones',score:982.5,status:{name:'Ended'},seasons:[{number:0},{number:1},{number:2}]}});
   if(uri.hostname==='www.kobis.or.kr'||uri.hostname==='kobis.or.kr')return json({boxOfficeResult:{dailyBoxOfficeList:[{rank:'1',movieNm:'기생충',openDt:'2019-05-30',salesAmt:'2000',audiCnt:'50'}]}});
   if(uri.hostname==='www.omdbapi.com')return json({Response:'True',imdbID:'tt0137523',BoxOffice:'$37,030,102'});
   if(uri.hostname==='content.guardianapis.com')return json(data.guardian||{response:{status:'ok',results:[]}});
   if(uri.hostname==='www.googleapis.com'&&uri.pathname==='/youtube/v3/videos')
     return json({items:[{id:'AbCdEf12345',snippet:{title:'Fight Club Official Trailer',channelTitle:'Official Movie Channel',publishedAt:'2025-05-11T10:00:00Z'},contentDetails:{duration:'PT2M14S'},statistics:{viewCount:'1234567'},status:{privacyStatus:'public',embeddable:true}}]});
   if(uri.hostname==='www.googleapis.com'&&uri.pathname==='/youtube/v3/search')
     return json({items:[{id:{videoId:'AbCdEf12345'},snippet:{title:'Fight Club Trailer Search',channelTitle:'Trailer Archive'}}]});
   if(uri.hostname==='tastedive.com')
     return json({Similar:{Results:[{Name:'Another Movie',Type:'movie'}]}});
   if(uri.hostname==='api.myanimelist.net'&&uri.pathname==='/v2/anime/1')return json({id:1,title:'Cowboy Bebop',mean:8.73,rank:43,popularity:21,num_scoring_users:865433,num_episodes:26,studios:[{name:'Sunrise'}],genres:[{name:'Action'}]});

   throw Error('unexpected outbound URL: '+uri.hostname+uri.pathname);
 };
}
async function invoke(path,env={}){
 const response=await worker.fetch(new Request('https://test.example'+path),env,{waitUntil:()=>{}});
 return {status:response.status,body:await response.json()};
}
test('movie enrichment requires an exact TMDB ID; no fabricated ratings',async()=>{
 stub({});
 const {status,body}=await invoke('/api/insights/movie/550',{TMDB_API_KEY:'test',OMDB_API_KEY:'test'});
 assert.equal(status,200);
 assert.equal(body.ok,true);assert.equal(body.kind,'movie');assert.equal(body.tmdbId,550);
 assert.equal(body.imdbId,'tt0137523');assert.equal(body.boxOffice.amount,'$37,030,102');
 assert.equal(body.sources.thetvdb,'identity_missing');assert.deepEqual(body.artwork,[]);
 assert.equal(Object.hasOwn(body,'ratings'),false);
});
test('TVDB joins on authoritative external ID and never exposes popularity as rating',async()=>{
 stub({});
 const {status,body}=await invoke('/api/insights/tv/1399',{TMDB_API_KEY:'test',THETVDB_API_KEY:'test'});
 assert.equal(status,200);assert.equal(body.tvdbId,121361);assert.equal(body.tvdb.seasons,2);
 assert.equal(body.sources.thetvdb,'ok');assert.equal(Object.hasOwn(body.tvdb,'score'),false);
});
test('missing KOFIC key explicitly marks source not configured',async()=>{
 stub({});
 const {status,body}=await invoke('/api/kobis/daily');
 assert.equal(status,200);assert.equal(body.status,'not_configured');assert.deepEqual(body.data,[]);
});
test('KOFIC daily parsing preserves KRW and admission counts',async()=>{
 stub({});
 const {status,body}=await invoke('/api/kobis/daily',{KOFIC_API_KEY:'test'});
 assert.equal(status,200);assert.equal(body.status,'ok');assert.equal(body.data[0].salesKRW,2000);assert.equal(body.data[0].audience,50);
});
test('invalid TMDB identity cannot be enriched',async()=>{
 stub({movie:{id:551}});
 // Test ID mismatches against the canonical TMDB response.
 const old=globalThis.fetch;
 globalThis.fetch=async input=>{
   if(String(input).includes('api.themoviedb.org'))return json({id:999,title:'Wrong title'});
   return old(input);
 };
 const {status,body}=await invoke('/api/insights/movie/550',{TMDB_API_KEY:'test'});
 assert.equal(status,502);assert.equal(body.ok,false);
});

test('TMDB official YouTube IDs get metadata without guessing the video title',async()=>{
 stub({movie:{videos:{results:[{site:'YouTube',official:true,type:'Trailer',key:'AbCdEf12345',name:'Official Film Trailer'}]}}});
 const {status,body}=await invoke('/api/insights/movie/550?media=1',{TMDB_API_KEY:'test',YOUTUBE_API_KEY:'test'});
 assert.equal(status,200);assert.equal(body.sources.youtube,'ok');
 assert.equal(body.trailers.length,1);assert.equal(body.trailers[0].id,'AbCdEf12345');
 assert.equal(body.trailers[0].official,true);assert.equal(body.trailers[0].duration,'PT2M14S');
 assert.equal(body.trailers[0].channel,'Official Movie Channel');
 assert.equal(body.trailers[0].views,1234567);
});
test('YouTube search-only results remain explicitly unverified',async()=>{
 stub({});
 const {body}=await invoke('/api/insights/movie/550?media=1',{TMDB_API_KEY:'test',YOUTUBE_API_KEY:'test'});
 assert.equal(body.trailers[0].official,false);
 assert.equal(body.trailers[0].verifiedBy,'YouTube search');
});
test('Guardian preview is sanitized, title-related and source attributed',async()=>{
 stub({guardian:{response:{status:'ok',results:[
  {sectionId:'film',sectionName:'Film',webTitle:'Fight Club retrospective',webUrl:'https://www.theguardian.com/film/fight-club',
   webPublicationDate:'2026-10-20T00:00:00Z',fields:{trailText:'<p>Fight Club retrospective <b>review</b>.</p>',thumbnail:'https://media.guim.co.uk/test.jpg'}},
  {sectionId:'film',webTitle:'Unrelated movie news',webUrl:'https://www.theguardian.com/film/unrelated'}
 ]}}});
 const {status,body}=await invoke('/api/insights/movie/550?media=1',{TMDB_API_KEY:'test',THE_GUARDIAN_API_KEY:'test'});
 assert.equal(status,200);assert.equal(body.sources.guardian,'ok');
 assert.equal(body.news.length,1);assert.equal(body.news[0].thumbnail,'https://media.guim.co.uk/test.jpg');
 assert.equal(body.news[0].summary.includes('<'),false);
});
test('TasteDive names cannot silently enter verified movie IDs',async()=>{
 stub({});
 const {status,body}=await invoke('/api/insights/movie/550?media=1',{TMDB_API_KEY:'test',TASTEDIVE_API_KEY:'test'});
 assert.equal(status,200);assert.equal(body.suggestions[0].title,'Another Movie');
 assert.equal(body.suggestions[0].verified,false);
 assert.equal(body.suggestions[0].tmdbId,undefined);
});

test('MyAnimeList v2 maps only exact MAL ID and preserves distinct rank/popularity',async()=>{
 stub({});
 const {status,body}=await invoke('/api/anime/mal/1',{MAL_CLIENT_ID:'test'});
 assert.equal(status,200);
 assert.equal(body.ok,true);assert.equal(body.malId,1);assert.equal(body.score,8.73);
 assert.equal(body.rank,43);assert.equal(body.popularity,21);
 assert.equal(body.ratingCount,865433);assert.deepEqual(body.studios,['Sunrise']);
 assert.equal(Object.hasOwn(body,'tmdbId'),false);
});
test('Missing MAL Client ID does not silently produce scores',async()=>{
 stub({});
 const {body}=await invoke('/api/anime/mal/1');
 assert.equal(body.status,'not_configured');assert.equal(body.score,undefined);
});

test('non-Discover panels do not spend YouTube or Guardian quota',async()=>{
 stub({});
 const {status,body}=await invoke('/api/insights/movie/550',{TMDB_API_KEY:'test',YOUTUBE_API_KEY:'test',THE_GUARDIAN_API_KEY:'test',TASTEDIVE_API_KEY:'test'});
 assert.equal(status,200);
 assert.equal(body.sources.youtube,'not_requested');
 assert.equal(body.sources.guardian,'not_requested');
 assert.equal(body.sources.tastedive,'not_requested');
 assert.deepEqual(body.trailers,[]);assert.deepEqual(body.news,[]);
});

test('on-demand Guardian film feed is separate and sanitizes article summary',async()=>{
 stub({guardian:{response:{status:'ok',results:[{
   webTitle:'Independent film spotlight',webUrl:'https://www.theguardian.com/film/film-spotlight',
   sectionName:'Film',webPublicationDate:'2026-10-28T11:30:00Z',
   fields:{trailText:'<p>New <b>film</b> coverage</p>',thumbnail:'https://media.guim.co.uk/still.jpg'}
 }]}}});
 const {status,body}=await invoke('/api/news/film',{THE_GUARDIAN_API_KEY:'test'});
 assert.equal(status,200);assert.equal(body.status,'ok');assert.equal(body.source,'The Guardian');
 assert.equal(body.articles.length,1);
 assert.equal(body.articles[0].summary,'New film coverage');
 assert.equal(body.articles[0].thumbnail,'https://media.guim.co.uk/still.jpg');
});
test('global film news absent credentials is explicitly unavailable',async()=>{
 stub({});
 const {body}=await invoke('/api/news/film');
 assert.equal(body.ok,true);assert.equal(body.status,'not_configured');assert.deepEqual(body.articles,[]);
});

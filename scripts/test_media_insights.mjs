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
   if(uri.hostname==='content.guardianapis.com')return json({response:{status:'ok',results:[]}});
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

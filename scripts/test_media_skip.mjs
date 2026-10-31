import {test} from "node:test";
import assert from "node:assert/strict";
import {boundedSegment,fromTheIntroDb,fromIntrodbApp,lookupSegments,handleSkip} from
 "../labs/title-playback-skips.mjs";

test("TheIntroDB accepts verified intro/recap/credits arrays, excludes invalid windows",()=>{
 const result=fromTheIntroDb({
  intro:[{start_ms:0,end_ms:72000}],
  recap:[{start_ms:72000,end_ms:115000}],
  credits:[{start_ms:1300000,end_ms:null}],
  post_credits:[{start_ms:1320000,end_ms:1350000}],
  preview:[{start_ms:1370000,end_ms:1400000}],
 },1450);
 assert.deepEqual(result.map(s=>s.type),["intro","recap","outro","postCredits","preview"]);
 assert.equal(result[0].end,72);
 assert.equal(result[2].end,null);
 assert.equal(fromTheIntroDb({intro:[{start_ms:0,end_ms:3000000}]},1200).length,0);
 assert.equal(boundedSegment({start_ms:10000,end_ms:30000,confidence:.1},"intro",360),null);
});
test("IntroDB.app accepts seconds timestamps and rejects mismatched video duration",()=>{
 const result=fromIntrodbApp({
  intro:{start_sec:2.5,end_sec:58,confidence:.92},
  recap:null,outro:{start_sec:1100,end_sec:1180,confidence:.8},
  post_credits:{start_sec:1181,end_sec:1200}
 },1250);
 assert.equal(result.length,3);
 assert.equal(result[0].start,2.5);
 assert.equal(result[0].end,58);
 assert.equal(fromIntrodbApp({intro:{start_sec:10,end_sec:2000}},400).length,0);
});
test("non-matched work returns no timestamps rather than fixed 90-second guesses",()=>{
 assert.deepEqual(fromTheIntroDb(null,400),[]);
 assert.deepEqual(fromIntrodbApp({no_intro:true},400),[]);
});
test("public TheIntroDB TV request selects exact season/episode and stays keyless",async()=>{
 const urls=[],mock=async url=>{
  urls.push(new URL(url));
  return new Response(JSON.stringify({intro:[{start_ms:1000,end_ms:67000}]}),
   {status:200,headers:{"content-type":"application/json"}});
 };
 const result=await lookupSegments({kind:"tv",tmdb:1399,imdb:"",season:2,episode:4,duration:3200},mock);
 assert.equal(result.status,"ready");assert.equal(result.segments[0].end,67);
 assert.equal(urls.length,1);assert.equal(urls[0].hostname,"api.theintrodb.org");
 assert.equal(urls[0].searchParams.get("tmdb_id"),"1399");
 assert.equal(urls[0].searchParams.get("season"),"2");
 assert.equal(urls[0].searchParams.get("episode"),"4");
 assert.equal(urls[0].searchParams.get("duration_ms"),"3200000");
 assert.equal(urls[0].searchParams.has("api_key"),false);
});
test("fallback to public IMDb IntroDB API when TMDB database has no match",async()=>{
 const urls=[],mock=async url=>{
  const u=new URL(url);urls.push(u);
  return new Response(JSON.stringify(u.hostname==="api.introdb.app"?
   {intro:{start_sec:3,end_sec:75,confidence:.95}}:{}),
   {status:200,headers:{"content-type":"application/json"}});
 };
 const result=await lookupSegments({kind:"tv",tmdb:1399,imdb:"tt0944947",season:1,
  episode:1,duration:3000},mock);
 assert.equal(result.status,"ready");
 assert.equal(result.source,"IntroDB");
 assert.equal(urls.length,2);
 assert.equal(urls[1].searchParams.get("imdb_id"),"tt0944947");
});
test("work ID and season/episode validations reject mismatched TMDB IDs",async()=>{
 const data=await handleSkip(new Request(
  "https://example.test/api/skip/work/tmdb-tv-1399?kind=tv&tmdb=9999&season=1&episode=1"),{},{});
 const body=await data.json();
 assert.equal(body.status,"bad_params");
});

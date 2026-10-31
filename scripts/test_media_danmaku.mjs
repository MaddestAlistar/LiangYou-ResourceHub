import {test} from "node:test";
import assert from "node:assert/strict";
import {exactTitle,episodeMatches,chooseMatch,parseComments,lookupDanmaku,readSeriesIndex,extractIndex,seasonMatches,handleDanmaku} from
 "../labs/title-playback-danmaku.mjs";

const record={title:"死神",originalTitle:"BLEACH",year:"2004"};
test("matching accepts correct title with regional annotation and rejects different films",()=>{
 assert.equal(exactTitle("死神（港澳台）(2004)【TV动画】from bilibili&dandan",record),true);
 assert.equal(exactTitle("死神（港澳台）(2023)【TV动画】",record),false);
 assert.equal(exactTitle("死神 千年血战篇(2022)",record),false);
 assert.equal(exactTitle("死亡笔记(2006)",record),false);
});
test("episode number is not confused with another episode or season",()=>{
 assert.equal(episodeMatches("【bilibili】第4集","tv",4),true);
 assert.equal(episodeMatches("【bilibili】第5集","tv",4),false);
 assert.equal(episodeMatches("EP 243","tv",243),true);
 assert.equal(episodeMatches("正片","tv",4),false);
 const candidates=[
  {animeTitle:"死神(2004)",episodeId:9901,episodeTitle:"第5集"},
  {animeTitle:"死神（港澳台）(2004)【TV动画】from bilibili&dandan",episodeId:9902,episodeTitle:"第4集"},
  {animeTitle:"死亡笔记(2006)",episodeId:9903,episodeTitle:"第4集"}
 ];
 assert.equal(chooseMatch(candidates,record,"tv",4).episodeId,9902);
 assert.equal(chooseMatch(candidates,record,"tv",3),null);
});
test("real-world DandanPlay p format stores color in third field and source in fourth",()=>{
 const xs=parseComments({comments:[
  {cid:"1",p:"0.00,1,16478873,[dandan]",m:"测试滚动",t:0,like:4},
  {cid:"2",p:"5.25,5,16777215,[bilibili1]",m:"测试顶部",t:0,like:1}
 ]});
 assert.equal(xs.length,2);
 assert.equal(xs[0].color,16478873);
 assert.equal(xs[1].color,16777215);
 assert.equal(xs[1].mode,5);
});
test("comments are bounded, timestamped and safe for textContent",()=>{
 const data=parseComments({comments:[
  {p:"1.5,1,25,16777215,0,0,0,1",m:"早上好"},
  {p:"3.0,4,25,65535,0,0,0,2",m:"底部弹幕"},
  {p:"4.0,5,25,16711680,0,0,0,3",m:"<script>alert(1)</script>"},
  {p:"0,9,25,0",m:"invalid"},
  {p:"-2,1,25,0",m:"invalid"}
 ]},0);
 assert.equal(data.length,3);
 assert.deepEqual(data.map(x=>x.mode),[1,4,5]);
 assert.equal(data[2].text,"<script>alert(1)</script>");
 assert.equal(data[1].time,3);
});
test("one cached whole-series index resolves adjacent episodes without new match requests",async()=>{
 const urls=[];
 const response=data=>new Response(JSON.stringify(data),{status:200,
   headers:{"content-type":"application/json"}});
 const epResponse=()=>{
  return response({success:true,animes:[
   {animeId:10,animeTitle:"死神（港澳台）(2004)【TV动画】from bilibili&dandan",episodes:[
    {episodeId:3910881,episodeTitle:"【bilibili】 第1集"},
    {episodeId:3910882,episodeTitle:"【bilibili】 第2集"},
    {episodeId:3910884,episodeTitle:"【bilibili】 第4话"}
   ]},
   {animeId:12,animeTitle:"死亡笔记(2006)",episodes:[
    {episodeId:9911,episodeTitle:"第1集"},{episodeId:9912,episodeTitle:"第2集"}
   ]}
  ]});
 };
 const cacheEntries=new Map();
 const cache={
  async match(key){return cacheEntries.get(key.url)?.clone()||null},
  async put(key,value){cacheEntries.set(key.url,value.clone())}
 };
 const fetcher=async url=>{
  urls.push(url);
  if(url.includes("/api/v2/search/episodes"))return epResponse();
  const m=url.match(/\/api\/v2\/comment\/(\d+)/);
  if(m)return response({comments:[{p:"1.2,1,16777215,[dandan]",m:"弹幕 "+m[1]}]});
  throw Error("Unexpected request: "+url);
 };
 const first=await lookupDanmaku(record,"tv",1,1,{fetcher,cache,base:"https://example.test/token"});
 assert.equal(first.status,"ready");
 assert.equal(first.comments.length,1);
 assert.equal(urls.filter(u=>u.includes("/search/episodes")).length,1);
 assert.equal(urls.filter(u=>u.includes("/api/v2/match")).length,0);
 const second=await lookupDanmaku(record,"tv",1,2,{fetcher,cache,base:"https://example.test/token"});
 assert.equal(second.status,"ready");
 assert.equal(urls.filter(u=>u.includes("/search/episodes")).length,1,
    "Adjacent episodes must reuse the cached series index");
 assert.ok(urls.at(-1).includes("/comment/3910882"));
 const fourth=await lookupDanmaku(record,"tv",1,4,{fetcher,cache,base:"https://example.test/token"});
 assert.equal(fourth.status,"ready");
 assert.ok(urls.at(-1).includes("/comment/3910884"));
});
test("fallback match remains available if a source does not implement episode index",async()=>{
 const urls=[],response=data=>new Response(JSON.stringify(data),{status:200});
 const fetcher=async (url,options)=>{
  urls.push(url);
  if(url.includes("/search/episodes"))return new Response("Not supported",{status:404});
  if(url.endsWith("/api/v2/match")){
   assert.equal(options.method,"POST");
   return response({isMatched:true,matches:[{animeTitle:"死神(2004)",
    episodeTitle:"第4集",episodeId:3910884}]});
  }
  if(url.includes("/comment/3910884"))return response({comments:[
    {p:"1.2,1,16478873,[dandan]",m:"弹幕一"}]});
  throw Error("Unexpected URL");
 };
 const result=await lookupDanmaku(record,"tv",1,4,{fetcher,base:"https://example.test/token"});
 assert.equal(result.status,"ready");
 assert.ok(urls.some(u=>u.endsWith("/api/v2/match")));
 assert.equal(result.comments.length,1);
});
test("unrelated episodes, spin-offs, and another season are never requested",async()=>{
 const data={success:true,animes:[
  {animeTitle:"死亡笔记(2006)",episodes:[{episodeId:99,episodeTitle:"第4集"}]},
  {animeTitle:"死神 第二季(2005)",episodes:[{episodeId:98,episodeTitle:"第4集"}]},
  {animeTitle:"死神(2004)",episodes:[{episodeId:97,episodeTitle:"第3集"}]}
 ]};
 const filtered=extractIndex(data,record,"tv",1);
 assert.equal(filtered.some(x=>x.episodeId===99),false);
 assert.equal(filtered.some(x=>x.episodeId===98),false);
 assert.equal(filtered.some(x=>x.episodeId===97),true);
 assert.equal(seasonMatches("死神 第二季(2005)",record,1),false);
 assert.equal(seasonMatches("死神 第二季(2005)",record,2),true);
 const requested=[];
 const fetcher=async(url)=>{
  requested.push(url);
  return new Response(JSON.stringify(url.includes("/search/episodes")?data:
    {isMatched:true,matches:[{animeTitle:"死亡笔记(2006)",episodeTitle:"第4集",episodeId:99}]}),
   {status:200});
 };
 const result=await lookupDanmaku(record,"tv",1,4,{fetcher,base:"https://example.test/token"});
 assert.equal(result.status,"unavailable");
 assert.ok(!requested.some(url=>url.includes("/comment/")),"Never request comments for wrong series/episodes");
});
test("rate limit ends this lookup without launching more origin requests",async()=>{
 const requests=[],fetcher=async url=>{
  requests.push(url);
  return new Response(JSON.stringify({success:false,errorMessage:"too many requests"}),{status:429});
 };
 const result=await lookupDanmaku(record,"tv",1,2,{fetcher,base:"https://example.test/token"});
 assert.equal(result.status,"unavailable");
 assert.equal(requests.length,1);
});
test("availability check omits comment text and reuses the full-payload cache",async()=>{
 const previous=globalThis.caches;
 const stored={ok:true,status:"ready",workId:"tmdb-tv-30984",kind:"tv",
  season:1,episode:4,count:1255,comments:[{time:1,mode:1,color:16777215,text:"private comment"}]};
 let hits=0;
 globalThis.caches={default:{async match(){hits++;return new Response(JSON.stringify(stored));}}};
 const base="https://example.test/api/danmaku/work/tmdb-tv-30984?kind=tv&title="+
  encodeURIComponent("死神")+"&original=BLEACH&year=2004&season=1&episode=4";
 try{
  const check=await handleDanmaku(new Request(base+"&check=1"),{},{waitUntil(){}});
  const meta=await check.json();
  assert.equal(meta.available,true);
  assert.equal(meta.count,1255);
  assert.equal(meta.comments,undefined,"do not send hundreds of comments to viewers who did not enable danmaku");
  const full=await handleDanmaku(new Request(base),{},{waitUntil(){}});
  assert.equal((await full.json()).comments[0].text,"private comment");
  assert.equal(hits,2);
 }finally{globalThis.caches=previous;}
});
test("empty episode cache does not advertise a danmaku toggle",async()=>{
 const previous=globalThis.caches;
 globalThis.caches={default:{async match(){return new Response(JSON.stringify({
  ok:true,status:"empty",workId:"tmdb-tv-30984",kind:"tv",season:1,episode:4,
  count:0,comments:[]}));}}};
 try{
  const url="https://example.test/api/danmaku/work/tmdb-tv-30984?"+
   "kind=tv&title=%E6%AD%BB%E7%A5%9E&year=2004&season=1&episode=4&check=1";
  const response=await handleDanmaku(new Request(url),{},{waitUntil(){}});
  const meta=await response.json();
  assert.equal(meta.available,false);
  assert.equal(meta.count,0);
  assert.equal(meta.comments,undefined);
 }finally{globalThis.caches=previous;}
});

import {test} from "node:test";
import assert from "node:assert/strict";
import {exactTitle,episodeMatches,chooseMatch,parseComments,lookupDanmaku} from
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
test("the backend matches requested episode, then fetches only its comment endpoint",async()=>{
 const urls=[];
 const response=data=>new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json"}});
 const fetcher=async (url,options)=>{
  urls.push(url);
  if(url.endsWith("/api/v2/match")){
   assert.equal(options.method,"POST");
   const body=JSON.parse(options.body);
   assert.match(body.fileName,/死神 S01E04/);
   return response({success:true,isMatched:true,matches:[
    {animeTitle:"死神（港澳台）(2004)【TV动画】from bilibili&dandan",
     episodeTitle:"【bilibili】第4集",episodeId:3910882,shift:0}]});
  }
  if(url.includes("/api/v2/comment/3910882")){
   return response({count:2,comments:[
    {p:"1.2,1,25,16777215",m:"弹幕一"},{p:"4.5,5,25,65535",m:"弹幕二"}]});
  }
  throw Error("Unexpected URL");
 };
 const result=await lookupDanmaku(record,"tv",1,4,{fetcher,base:"https://example.test/token"});
 assert.equal(result.status,"ready");
 assert.equal(result.comments.length,2);
 assert.equal(urls.length,2);
 assert.ok(urls.every(u=>u.startsWith("https://example.test/token/api/v2/")));
});
test("unrelated matches are never used to request comments",async()=>{
 const urls=[];
 const fetcher=async(url)=>{
  urls.push(url);
  return new Response(JSON.stringify({isMatched:true,matches:[
   {animeTitle:"死亡笔记(2006)",episodeTitle:"第4集",episodeId:99}]}),
   {status:200,headers:{"content-type":"application/json"}});
 };
 const result=await lookupDanmaku(record,"tv",1,4,{fetcher,base:"https://example.test/token"});
 assert.equal(result.status,"unavailable");
 assert.ok(urls.every(u=>u.endsWith("/api/v2/match")));
});

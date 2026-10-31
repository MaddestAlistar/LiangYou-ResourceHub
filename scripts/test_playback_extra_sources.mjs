import {test} from "node:test";
import assert from "node:assert/strict";
import {VOD_APIS,identity,stripSeason,parseNo,feedParts,jianpianParts,
 queryJianpian,queryVod,discoverExtra} from "../labs/playback-extra-sources.mjs";
const record={title:"名侦探柯南",originalTitle:"名探偵コナン",year:"1996"};
const ep=(label,num)=>label+"$https://cdn.example.test/show/"+num+".m3u8";
const resp=data=>new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json"}});
const fakeFetch=async url=>{
 const u=new URL(url);
 if(u.pathname.includes("videoV2")){
  assert.match(url,/key=keyword=/);
  return resp({code:1,data:[{id:89,title:"名侦探柯南"}]});
 }
 if(u.pathname.includes("detailv2")){
  return resp({code:1,data:{title:"名侦探柯南",
   source_list_source:[{name:"线路",source_list:[
    {source_name:"第1集",url:"https://cdn.example.test/ep1.mp4"},
    {source_name:"第2集",url:"https://cdn.example.test/ep2.mp4"}]}]}});
 }
 if(u.searchParams.get("ac")==="detail"){
  return resp({list:[
   {vod_name:"名侦探柯南",vod_year:"1996",vod_play_from:"m3u8",
    vod_play_url:ep("第1集",1)+"#"+ep("第2集",2)},
   {vod_name:"名侦探柯南 第二季",vod_year:"1996",vod_play_from:"m3u8",
    vod_play_url:ep("第1集",1)},
   {vod_name:"名侦探柯南 剧场版",vod_year:"1996",vod_play_from:"m3u8",
    vod_play_url:ep("正片",1)}]});
 }
 throw Error("Unknown mocked endpoint");
};
test("aggregate registry only makes HTTPS requests and keeps a bounded provider count",()=>{
 assert.equal(VOD_APIS.length,18);
 assert.ok(VOD_APIS.every(([key,url])=>url.startsWith("https://")&&!!key));
});
test("season and title checks reject another season and spin-offs",()=>{
 assert.equal(stripSeason("名侦探柯南 第二季").season,2);
 assert.equal(stripSeason("名侦探柯南 2").season,2);
 assert.equal(identity("名侦探柯南",record,"tv",1,"1996"),true);
 assert.equal(identity("名侦探柯南 第二季",record,"tv",1,"1996"),false);
 assert.equal(identity("名侦探柯南 剧场版",record,"tv",1,"1996"),false);
 assert.equal(identity("沙丘",{title:"沙丘",year:"2021"},"movie",1,1984),false);
});
test("TV/film episode matching does not reuse unrelated episode numbers",()=>{
 assert.equal(parseNo("第13集"),13);
 assert.equal(parseNo("EP 103"),103);
 assert.equal(parseNo("第3集"),3);
 assert.equal(jianpianParts({source_list_source:[{name:"常规线路",source_list:[
   {source_name:"第1集",url:"https://cdn.example.test/ep1.mp4"}]}]},"tv").length,0);
 const found=feedParts({vod_name:"名侦探柯南",vod_play_from:"主线",
  vod_play_url:ep("第1集",1)+"#"+ep("第2集",2)},"tv","test");
 assert.deepEqual(found.map(x=>x.number),[1,2]);
});
test("both JianPian and VOD adapters discover direct HTTPS links with correct identity",async()=>{
 const [jp,agg]=await Promise.all([
  queryJianpian(record,"tv",1,fakeFetch),
  queryVod(VOD_APIS[0],record,"tv",1,fakeFetch)]);
 assert.deepEqual(jp.map(x=>x.number),[1,2]);
 assert.deepEqual(agg.map(x=>x.number),[1,2]);
 const all=await discoverExtra(record,"tv",1,{fetcher:fakeFetch,siteLimit:2});
 assert.deepEqual(all.episodes,[1,2]);
 assert.ok(all.lines.every(x=>["jianpian","aggregate"].includes(x.provider)));
 assert.equal(all.checked,3);
});

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const script=readFileSync(new URL("../media-title-playback.js",import.meta.url),"utf8");
const section=script.match(/async function startPlayback\(\)\{[\s\S]*?\n\}\nfunction mount\(/)?.[0]?.replace(/\nfunction mount\($/,"");
assert.ok(section,"Playback function not found");
function harness(body){
 const history=[],button={disabled:false};
 let called=0,src=null;
 const video={
  setAttribute(){},addEventListener(){},canPlayType:()=>true,
  play(){called++;return Promise.resolve();}
 };
 Object.defineProperty(video,"src",{set(v){src=v},get(){return src}});
 const stage={replaceChildren(){},appendChild(){}};
 const target={querySelector(s){return s===".mtk-playback-start"?button:
   s===".mtk-playback-screen"?stage:null}};
 const context={
  active:{title:"Example Series",kind:"tv",id:"bangumi-899",season:1,episode:1,episodes:[1]},
  card:()=>target,serial:0,controller:null,video:null,hls:null,
  clearPlayback(){context.serial++;},
  showStatus(message,state){history.push({message,state})},
  t:a=>a,
  route:()=>"/api/play/work/bangumi-899?episode=1",
  json:async()=>body,
  AbortController,
  sameIdentity:()=>true,
  safeStream:v=>v?.url||null,
  document:{createElement:()=>video},
  episodeLabel:n=>"第 "+n+" 集",
  resetStage(){},
  loadHls:async()=>{throw Error("unexpected hls")},
 };
 vm.createContext(context);
 const call=vm.runInContext('"use strict";('+section+')',context);
 return {run:()=>call(),history,button,getPlayed:()=>called,getSrc:()=>src};
}
test("clicking Play issues a request, reports unavailable streams instead of throwing ReferenceError",async()=>{
 const app=harness({ok:false,status:"no_verified_stream"});
 await app.run();
 assert.ok(app.history.some(x=>x.message.includes("没有通过验证")));
 assert.equal(app.button.disabled,false);
 assert.equal(app.getPlayed(),0);
});
test("clicking Play actually reaches video element and starts verified MP4",async()=>{
 const app=harness({ok:true,status:"ready",kind:"tv",season:1,episode:1,
   media:{url:"https://media.example.org/episode.mp4",format:"mp4",cors:true}});
 await app.run();
 assert.equal(app.getSrc(),"https://media.example.org/episode.mp4");
 assert.equal(app.getPlayed(),1);
 assert.equal(app.button.disabled,false);
});

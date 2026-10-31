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
  boxAction(ready){button.disabled=!ready;},
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

test("the central circle is the only Play control in each title card",()=>{
 const start=script.indexOf("function playbackPlaceholder(");
 const end=script.indexOf("function renderEpisodes(){",start);
 assert.ok(start>=0&&end>start,"Playback markup helpers not found");
 const context={tr:value=>String(value),t:value=>value};
 vm.createContext(context);
 const parts=vm.runInContext(script.slice(start,end)+"\n({playbackHtml,playbackPlaceholder})",context);
 const html=parts.playbackHtml({id:"bangumi-899",kind:"tv",title:"名侦探柯南",episode:1});
 assert.match(html,/<button[^>]+class="mtk-playback-start mtk-playback-symbol"/);
 assert.equal((html.match(/class="mtk-playback-start/g)||[]).length,1);
 assert.doesNotMatch(html,/站内播放|Play here/);
 assert.match(html,/mtk-playback-actions" hidden/);
 assert.match(script,/if\(e\.target\.closest\("\.mtk-playback-start"\)\)startPlayback\(\)/);
});
test("central circle becomes enabled only after the work has matching episodes",()=>{
 const start=script.indexOf("function boxAction(ready){");
 const end=script.indexOf("let hlsPromise=null;",start);
 assert.ok(start>=0&&end>start,"Playback button control not found");
 const play={disabled:true,setAttribute(key,value){this[key]=value}};
 const actions={hidden:true},retry={hidden:true};
 const context={card:()=>({querySelector(sel){return ({
  ".mtk-playback-start":play,".mtk-playback-actions":actions,".mtk-playback-retry":retry
 })[sel]}}),t:value=>value};
 vm.createContext(context);
 const boxAction=vm.runInContext("("+script.slice(start,end).trim()+")",context);
 boxAction(true);
 assert.equal(play.disabled,false);
 assert.equal(actions.hidden,true);
 boxAction(false);
 assert.equal(play.disabled,true);
 assert.equal(actions.hidden,false);
 assert.equal(retry.hidden,false);
});

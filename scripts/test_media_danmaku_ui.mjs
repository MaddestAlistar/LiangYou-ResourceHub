import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source=fs.readFileSync(new URL("../media-title-danmaku.js",import.meta.url),"utf8");
const player=fs.readFileSync(new URL("../media-title-playback.js",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../media-title-danmaku.css",import.meta.url),"utf8");

test("danmaku UI attaches only to the real video and keeps a visible on/off switch",()=>{
 assert.match(source,/liangyou:player-video/);
 assert.match(player,/liangyou:player-video/);
 assert.match(player,/liangyou:player-stop/);
 assert.match(source,/className="mtk-danmaku-toggle"/);
 assert.match(source,/setAttribute\("aria-pressed",String\(on\)\)/);
 assert.match(source,/setItem\(PREFERENCE,enabled\?"1":"0"\)/);
 assert.match(source,/document\.createElement\("span"\)/);
 assert.match(source,/span\.textContent=item\.text/);
 assert.doesNotMatch(source,/\.innerHTML\s*=\s*item\.text/);
 assert.match(css,/pointer-events:none/);
});
test("work/season/episode identity reaches the exact bounded worker endpoint",()=>{
 const start=source.indexOf("function pathFor(info){"),end=source.indexOf("function indexNear(",start);
 assert.ok(start>0&&end>start);
 const ctx={URL,BASE:"https://example.test"};
 vm.createContext(ctx);
 const path=vm.runInContext("("+source.slice(start,end).trim()+")",ctx);
 const url=new URL(path({id:"tmdb-tv-30984",title:"死神",originalTitle:"BLEACH",
  year:"2004",kind:"tv",season:1,episode:243}));
 assert.equal(url.pathname,"/api/danmaku/work/tmdb-tv-30984");
 assert.equal(url.searchParams.get("title"),"死神");
 assert.equal(url.searchParams.get("episode"),"243");
 assert.equal(url.searchParams.get("season"),"1");
});
test("sorted danmaku captions seek to exact positions without drawing thousands of old items",()=>{
 const start=source.indexOf("function indexNear(entries,time){"),end=source.indexOf("function removeItems(",start);
 assert.ok(start>0&&end>start);
 const ctx={};vm.createContext(ctx);
 const index=vm.runInContext("("+source.slice(start,end).trim()+")",ctx);
 const a=[{time:0},{time:5},{time:11.4},{time:11.5},{time:60}];
 assert.equal(index(a,11.4),2);
 assert.equal(index(a,59.9),4);
 assert.equal(index(a,66),5);
});

test("unmatched episodes keep fullscreen and retry, but only confirmed comments show the switch",async()=>{
 const start=source.indexOf("async function probe(state,attempt=0){");
 const end=source.indexOf("async function load(state){",start);
 assert.ok(start>0&&end>start,"Availability check was not installed");
 let answer={ok:true,status:"empty",workId:"tmdb-tv-30984",kind:"tv",
  season:1,episode:4,count:0},loaded=0;
 const state={
  info:{id:"tmdb-tv-30984",kind:"tv",season:1,episode:4},
  video:{setAttribute(name,value){this[name]=value}},
  controls:{hidden:false},button:{},gear:{},retry:{},status:{},
  available:false,enabled:false,probeAbort:null,checking:false
 };
 const context={
  AbortController,session:state,pathFor:()=>"https://example.test/api/danmaku/work/tmdb-tv-30984?episode=4",
  fetch:async url=>{
   assert.match(url,/check=1/);
   return {ok:true,json:async()=>answer};
  },
  saveVerified(){},
  setButton(v){
    v.controls.hidden=false;
    v.button.hidden=!v.available;
    v.gear.hidden=!v.available;
    v.status.hidden=v.available;
    v.retry.hidden=v.available||v.checking;
  },load(){loaded++}
 };
 vm.createContext(context);
 const probe=vm.runInContext("("+source.slice(start,end).trim()+")",context);
 await probe(state);
 assert.equal(state.available,false);
 assert.equal(state.button.hidden,true);
 assert.equal(state.gear.hidden,true);
 assert.equal(state.controls.hidden,false,"Fullscreen must not disappear when danmaku is unavailable");
 assert.equal(state.retry.hidden,false,"Offer retry for an unverified episode");
 answer={...answer,status:"ready",count:1255};
 state.enabled=true;
 await probe(state);
 assert.equal(state.available,true);
 assert.equal(state.button.hidden,false);
 assert.equal(state.gear.hidden,false);
 assert.equal(state.retry.hidden,true);
 assert.equal(state.controls.hidden,false);
 assert.equal(state.video.controlsList,"nofullscreen");
 assert.equal(loaded,1);
});
test("iPhone web fullscreen keeps the video and overlay in one DOM layer",async()=>{
 const start=source.indexOf("function exitWebFullscreen(state){");
 const end=source.indexOf("document.addEventListener(\"fullscreenchange\"",start);
 assert.ok(start>0&&end>start,"Web fullscreen implementation was not found");
 const classes=new Set(),rootClasses=new Set();
 const classList=cs=>({
  add(x){cs.add(x)},remove(x){cs.delete(x)},contains(x){return cs.has(x)}
 });
 const controlClasses=new Set();
 const controls={parentElement:null,classList:classList(controlClasses),hidden:false,inert:false};
 const screen={classList:classList(classes),
  appendChild(node){node.parentElement=this;},
  after(node){node.parentElement={tag:"toolbar-outside-video"};}};
 const state={available:true,screen,controls,
  settings:{hidden:false},gear:{setAttribute(){}},
  fullscreen:{attrs:{},setAttribute(k,v){this.attrs[k]=v},textContent:"⛶"},
  webFullscreen:false,hideTimer:null};
 let callback=null;
 const context={session:state,navigator:{userAgent:"iPhone"},
  setTimeout(fn){callback=fn;return 1},clearTimeout(){callback=null},
  document:{
   fullscreenElement:null,webkitFullscreenElement:null,
   documentElement:{classList:classList(rootClasses)}
 }};
 vm.createContext(context);
 const parts=vm.runInContext(source.slice(start,end)+
  "\n({exitWebFullscreen,toggleWebFullscreen,revealFullscreenControls})",context);
 await parts.toggleWebFullscreen(state);
 assert.equal(state.webFullscreen,true);
 assert.ok(classes.has("mtk-danmaku-webfullscreen"));
 assert.equal(controls.parentElement,screen);
 assert.ok(rootClasses.has("mtk-danmaku-page-expanded"));
 assert.equal(state.fullscreen.attrs["aria-pressed"],"true");
 assert.equal(state.settings.hidden,true);
 assert.equal(typeof callback,"function");
 callback();
 assert.equal(controls.inert,true);
 assert.equal(controlClasses.has("mtk-danmaku-controls-hidden"),true);
 parts.revealFullscreenControls(state);
 assert.equal(controls.inert,false);
 assert.equal(controlClasses.has("mtk-danmaku-controls-hidden"),false);
 await parts.toggleWebFullscreen(state);
 assert.equal(state.webFullscreen,false);
 assert.ok(!classes.has("mtk-danmaku-webfullscreen"));
 assert.equal(controls.parentElement.tag,"toolbar-outside-video");
 assert.equal(controls.inert,false);
 assert.equal(callback,null);
});

test("saved danmaku settings clamp row count and opacity and limit position choices",()=>{
 const start=source.indexOf("const DEFAULT_SETTINGS=");
 const end=source.indexOf("let enabled=false",start);
 assert.ok(start>=0&&end>start);
 const ctx={};vm.createContext(ctx);
 const fn=vm.runInContext(source.slice(start,end)+"\n sanitizeSettings",ctx);
 assert.equal(fn(null).rows,4);
 assert.equal(fn({rows:100,position:"not-valid",opacity:-5}).rows,8);
 assert.equal(fn({rows:100,position:"not-valid",opacity:-5}).position,"top");
 assert.equal(fn({rows:100,position:"not-valid",opacity:-5}).opacity,20);
 assert.equal(fn({rows:2,position:"bottom",opacity:50}).rows,2);
 assert.equal(fn({rows:2,position:"bottom",opacity:50}).opacity,50);
});
test("normal playback tools render below the video while fullscreen retains controls",()=>{
 assert.match(source,/screen\.after\(controls\)/);
 assert.match(source,/state\.screen\.appendChild\(state\.controls\)/);
 assert.match(source,/state\.screen\.after\(state\.controls\)/);
 assert.match(source,/mtk-danmaku-setting-row/);
 assert.match(source,/\"rows\"/);
 assert.match(source,/position:position\.value/);
 assert.match(source,/\"opacity\"/);
 assert.match(source,/settingsOptions=sanitizeSettings/);
 assert.match(css,/#media \.mtk-danmaku-actions\{[\s\S]*position:relative/);
 assert.match(css,/#media \.mtk-danmaku-settings\[hidden\]\{display:none!important\}/);
 assert.match(css,/--mtk-danmaku-opacity/);
});

test("fullscreen controls auto-hide only in fullscreen; settings panel pauses the hide timer",()=>{
 const start=source.indexOf("function exitWebFullscreen(state){");
 const end=source.indexOf('document.addEventListener("fullscreenchange"',start);
 assert.ok(start>=0&&end>start);
 const classes=new Set();
 const classList={
   add(name){classes.add(name)},remove(name){classes.delete(name)},contains(name){return classes.has(name)}
 };
 let scheduled=null,ms=0;
 const state={available:true,webFullscreen:true,controls:{
   hidden:false,inert:false,classList},settings:{hidden:false},hideTimer:null,screen:{}};
 const context={session:state,document:{fullscreenElement:null,webkitFullscreenElement:null},
  setTimeout(fn,time){scheduled=fn;ms=time;return 9},
  clearTimeout(){scheduled=null}};
 vm.createContext(context);
 const api=vm.runInContext(source.slice(start,end)+
  "\n({revealFullscreenControls,hideFullscreenControls,clearFullscreenHide})",context);
 api.revealFullscreenControls(state);
 assert.equal(scheduled,null,"Do not hide controls while settings are expanded");
 state.settings.hidden=true;
 api.revealFullscreenControls(state);
 assert.equal(ms,2800);
 assert.equal(typeof scheduled,"function");
 scheduled();
 assert.ok(classes.has("mtk-danmaku-controls-hidden"));
 assert.equal(state.controls.inert,true);
 api.revealFullscreenControls(state);
 assert.equal(state.controls.inert,false);
 assert.ok(!classes.has("mtk-danmaku-controls-hidden"));
 state.webFullscreen=false;
 api.hideFullscreenControls(state);
 assert.ok(!classes.has("mtk-danmaku-controls-hidden"),"Never hide toolbar under the normal video");
 assert.match(css,/mtk-danmaku-controls-hidden/);
 assert.match(source,/screen\.addEventListener\("pointerdown",state\.onScreenTap,true\)/);
});

test("fullscreen control is independent of danmaku availability and error states",()=>{
 assert.match(source,/async function toggleWebFullscreen\(state\)\{\s*if\(state!==session\)return;/);
 assert.doesNotMatch(source,/state\.controls\.hidden=!state\.available/);
 assert.doesNotMatch(source,/state\.available=false;state\.controls\.hidden=true/);
 assert.match(source,/controls\.append\(status,retry,button,gear,fullscreen,settings\)/);
 assert.match(source,/retry\.addEventListener\("click",\(\)=>probe\(state,1\)\)/);
 assert.match(source,/state\.button\.hidden=!state\.available/);
 assert.match(source,/state\.gear\.hidden=!state\.available/);
 assert.match(css,/mtk-danmaku-status/);
 assert.match(css,/mtk-danmaku-retry/);
});

test("previously verified danmaku remains visible when an upstream refresh is unavailable",async()=>{
 const start=source.indexOf("async function probe(state,attempt=0){"),
   end=source.indexOf("async function load(state){",start);
 assert.ok(start>0&&end>start);
 const remembered=[],state={
  info:{id:"tmdb-tv-30984",title:"死神",kind:"tv",season:1,episode:2},
  video:{isConnected:true,setAttribute(){}},
  controls:{hidden:false},button:{},gear:{},retry:{},status:{},
  available:true,checking:false,enabled:false,probeAbort:null
 };
 const ctx={AbortController,session:state,pathFor:()=>"/api/danmaku?episode=2",
  fetch:async()=>({ok:true,json:async()=>({ok:true,status:"unavailable",
    workId:state.info.id,kind:"tv",season:1,episode:2,count:0})}),
  saveVerified:(info,flag)=>remembered.push(flag),
  setButton(v){v.button.hidden=!v.available;v.controls.hidden=false;v.gear.hidden=!v.available;},
  setTimeout(){throw Error("Do not retry already-verified episodes");}};
 vm.createContext(ctx);
 const probe=vm.runInContext("("+source.slice(start,end).trim()+")",ctx);
 await probe(state,0);
 assert.equal(state.available,true);
 assert.equal(state.button.hidden,false);
 assert.deepEqual(remembered,[]);
});
test("local browser keeps only recently verified episodes, not arbitrary unknown ones",()=>{
 const start=source.indexOf("const POSITIVE_CACHE="),
   end=source.indexOf("const MAX_DISPLAY=",start);
 assert.ok(start>0&&end>start);
 let now=1000000;const map=new Map();
 const ctx={localStorage:{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)},
  Date:{now:()=>now},JSON,Object,Number,Math};
 vm.createContext(ctx);
 const apis=vm.runInContext(source.slice(start,end)+"\n({readVerified,saveVerified})",ctx);
 const one={id:"tmdb-tv-30984",title:"死神",kind:"tv",season:1,episode:1};
 const two={...one,episode:2};
 assert.equal(apis.readVerified(one),false);
 apis.saveVerified(one,true);
 assert.equal(apis.readVerified(one),true);
 assert.equal(apis.readVerified(two),false);
 now+=49*60*60*1000;
 assert.equal(apis.readVerified(one),false);
});

test("temporary comment-download failure preserves known-positive episode and retry controls",()=>{
 assert.match(source,/else if\(body\?\.status==="empty"\)/);
 assert.match(source,/state\.loadError=true;state\.statusReason="unavailable"/);
 assert.match(source,/state\.status\.hidden=state\.available&&!state\.loadError/);
 assert.match(source,/state\.retry\.hidden=state\.checking\|\|\(state\.available&&!state\.loadError\)/);
 assert.match(source,/state\.available=readVerified\(info\)/);
 assert.match(source,/if\(state\.entries\.length\)saveVerified\(state\.info,true\)/);
 assert.doesNotMatch(source,/setTimeout\(\(\)=>\{if\(state===session&&state\.video\.isConnected\)probe\(state,1\);\},2700\)/);
});

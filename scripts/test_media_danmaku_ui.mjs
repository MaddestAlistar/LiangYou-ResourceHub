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

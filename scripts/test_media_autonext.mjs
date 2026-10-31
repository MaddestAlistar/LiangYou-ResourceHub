import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const code=readFileSync(new URL("../media-title-playback.js",import.meta.url),"utf8");
test("next available episode is selected from actual numbered list, saved and played",()=>{
 const start=code.indexOf("function nextEpisode(auto=true){");
 const end=code.indexOf("function configureSkip(",start);
 assert.ok(start>=0&&end>start);
 const info={kind:"tv",season:1,episode:4,episodes:[1,4,7],seasons:[{number:1}],page:0};
 const actions=[];
 const context={active:info,AUTO_NEXT:true,
  clearPlayback(){actions.push("clear");},episodesPerPage:()=>12,
  saveSelection(){actions.push("save");},renderEpisodes(){actions.push("render")},
  resetStage(){actions.push("reset")},showStatus(){},
  t:x=>x,startPlayback(){actions.push("play")},lookup(){actions.push("lookup")}};
 vm.createContext(context);
 const next=vm.runInContext("("+code.slice(start,end).trim()+")",context);
 assert.equal(next(),true);
 assert.equal(info.episode,7);
 assert.deepEqual(actions,["clear","save","render","reset","play"]);
 assert.equal(next(),false,"Must not invent a new episode after the actual last episode");
});
test("next season is queried only when catalogue verified a season number",()=>{
 const start=code.indexOf("function nextEpisode(auto=true){"),end=code.indexOf("function configureSkip(",start);
 const info={kind:"tv",season:1,episode:12,episodes:[12],seasons:[{number:1},{number:2}],page:0};
 const context={active:info,AUTO_NEXT:true,saveSelection(){},lookup(shouldPlay){this.didCall=shouldPlay;}};
 vm.createContext(context);
 const next=vm.runInContext("("+code.slice(start,end).trim()+")",context);
 assert.equal(next(),true);
 assert.equal(info.season,2);
 assert.equal(info.episode,1);
 assert.deepEqual(info.episodes,[]);
 assert.equal(context.didCall,true);
});
test("unknown identifiers do not skip arbitrary seconds but next-episode still listens for ended",()=>{
 const intro=code.slice(code.indexOf("function configureSkip("),code.indexOf("async function startPlayback(){"));
 assert.match(intro,/if\(!tmdb&&!\/\^tt/);
 assert.match(code,/v\.addEventListener\("ended",\(\)=>\{if\(serial===token\)nextEpisode\(\);\}/);
 assert.match(intro,/state\.segments=Array\.isArray\(result\.segments\)/);
 assert.match(intro,/Date\.now\(\)-state\.lastManualSeek<2500/);
 assert.match(intro,/postCredits/);
 assert.match(intro,/preview/);
});

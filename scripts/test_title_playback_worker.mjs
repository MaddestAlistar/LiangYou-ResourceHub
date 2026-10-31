import {test} from "node:test";
import assert from "node:assert/strict";
import worker,{normalize,rank,availableEpisodes,selectEntry,fromHtml} from "../labs/title-playback-worker.mjs";

test("strict identity prefers canonical title, rejects wrong film, seasons, and commentary",()=>{
 const titles=["名侦探柯南"];
 assert.equal(rank({vod_id:1,vod_name:"名侦探柯南",type_id:2,vod_year:1996},titles,"tv",1,"1996"),105);
 assert.equal(rank({vod_id:2,vod_name:"名侦探柯南 第二季",type_id:2},titles,"tv",1,"1996"),0);
 assert.equal(rank({vod_id:3,vod_name:"名侦探柯南 第二季",type_id:2},titles,"tv",2,"1996"),100);
 assert.equal(rank({vod_id:4,vod_name:"名侦探柯南：解说",type_id:2},titles,"tv",1,"1996"),0);
 assert.equal(rank({vod_id:5,vod_name:"名侦探柯南",type_id:1},titles,"tv",1,"1996"),0);
 assert.equal(rank({vod_id:6,vod_name:"名侦探柯南 剧场版",type_id:2},titles,"tv",1,"1996"),0);
 assert.equal(rank({vod_id:7,vod_name:"沙丘",type_id:1,vod_year:1984},["沙丘"],"movie",1,"2021"),0);
 assert.equal(normalize("《名侦探柯南》").replace(/[《》]/g,""),"名侦探柯南");
});
test("source episode matching uses exact numbered episodes and respects seasons",()=>{
 const lines=[{url:"第1集$https://example.com/1.mp4#第2集$https://example.com/2.mp4"},
              {url:"第2集$https://example.com/2b.mp4"}];
 assert.deepEqual(availableEpisodes(lines,"tv"),[1,2]);
 assert.equal(selectEntry(lines[0],"tv",2)?.url,"https://example.com/2.mp4");
 assert.equal(selectEntry(lines[0],"tv",3),undefined);
 assert.equal(selectEntry(lines[0],"movie",2),null);
});
test("explicit HTML media extraction ignores ordinary hyperlinks",()=>{
 assert.equal(fromHtml('<video controls src="https://cdn.example.com/test.mp4"></video>'),"https://cdn.example.com/test.mp4");
 assert.equal(fromHtml('<a href="https://example.com/watch">play</a>'),null);
});
test("only health is public without TMDB credentials and does not claim a proxy",async()=>{
 const h=await worker.fetch(new Request("https://example.com/health"),{},{waitUntil(){}});
 const data=await h.json();
 assert.equal(data.ok,true);
 assert.equal(data.videoProxy,false);
 const missing=await worker.fetch(new Request("https://example.com/api/title/tv/30983"),{},{waitUntil(){}});
 const unavailable=await missing.json();
 assert.equal(missing.status,502);
 assert.equal(unavailable.status,"unavailable");
});

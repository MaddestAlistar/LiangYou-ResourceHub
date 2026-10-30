const fs=require('fs');
const {chromium}=require('/tmp/liangyou-player-test/node_modules/playwright-core');
const cases=[
 {name:'AcFun',url:'https://www.acfun.cn/player/ac30636253'},
 {name:'Niconico',url:'https://embed.nicovideo.jp/watch/sm43190555'},
];
(async ()=>{
const report={created_at:new Date().toISOString(),note:'Github Linux headless Chrome, normal simulated user click, not China or Safari',results:[]};
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
for(const c of cases){
 const context=await browser.newContext({viewport:{width:1024,height:768}});
 const page=await context.newPage();
 const d={name:c.name,media_count:0,playback_confirmed:false};
 page.on('response',r=>{
  const ct=(r.headers()['content-type']||'').toLowerCase();
  if(/video\/|application\/vnd.apple.mpegurl|application\/dash\+xml/.test(ct)||/\.(m4s|mp4|ts|m3u8|mpd)(\?|$)/.test(r.url()))d.media_count++;
 });
 try{
 const goto=await page.goto(c.url,{waitUntil:'commit',timeout:16000});
 d.http_status=goto?.status();
 await page.waitForTimeout(11000);
 d.title=(await page.title()).slice(0,130);
 d.play_buttons=await page.locator('button').evaluateAll(els=>els.slice(0,18).map(e=>({text:e.innerText?.slice(0,45)||'',aria:e.getAttribute('aria-label')||''})));
 d.video_before=await page.evaluate(()=>{
    const v=document.querySelector('video');
    return v?{readyState:v.readyState,time:v.currentTime,paused:v.paused,video_error:v.error?.code||null}:null;
 });
 // Actual user gesture: try visible playback controls, then center of player only if none.
 const b=page.locator('button').filter({hasText:/^(?:▶|Play|播放|再生|見る|播放する|立即播放)$/i}).first();
 if(await b.count())await b.click({timeout:1500}).catch(()=>{});
 else await page.mouse.click(520,370).catch(()=>{});
 await page.waitForTimeout(6500);
 d.video_after=await page.evaluate(()=>{
    const v=document.querySelector('video');
    return v?{readyState:v.readyState,time:v.currentTime,paused:v.paused,video_error:v.error?.code||null}:null;
 });
 if(d.video_before&&d.video_after&&d.video_after.time-d.video_before.time>0.6)d.playback_confirmed=true;
 }catch(e){d.error=String(e).slice(0,230)}
 report.results.push(d);
 console.log('RETEST_RESULT',JSON.stringify(d).slice(0,2200));
 fs.writeFileSync('acfun-niconico-playback-retest.json',JSON.stringify(report,null,2));
 await context.close();
 await new Promise(r=>setTimeout(r,3500));
}
await browser.close();
})().catch(e=>{console.error(String(e));process.exitCode=1});

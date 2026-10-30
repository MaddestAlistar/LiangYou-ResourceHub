/* Anonymous Chrome browser smoke: real embed document + media time progress.
 * A 200 HTML response alone MUST NOT be scored as playable.
 * No login, no cookies supplied, no proxy bypass.
 */
const fs = require('node:fs');
const { chromium } = require('/tmp/liangyou-player-test/node_modules/playwright-core');
const cases = [
 {platform:'KinoCheck_YouTube',title:'Moana trailer youtube ID via KinoCheck',url:'https://www.youtube.com/embed/F0zP0L_sUDA?playsinline=1&mute=1'},
 {platform:'AcFun',title:'Moana CN trailer',url:'https://www.acfun.cn/player/ac30636253'},
 {platform:'Dailymotion',title:'Apothecary Diaries demo public player ID (not owned)',url:'https://geo.dailymotion.com/player/x8lr5.html?video=x8mcq94'},
 {platform:'Niconico',title:'Apothecary Diaries PV',url:'https://embed.nicovideo.jp/watch/sm43190555'},
];
const save=(obj)=>fs.writeFileSync('video-player-browser-report.json',JSON.stringify(obj,null,2));
async function inspect(page) {
 const out=[];
 for (const frame of page.frames()){
   try {
      const snap=await frame.evaluate(()=>{
        const vids=[...document.querySelectorAll('video')].slice(0,3);
        return vids.map(v=>({ready_state:v.readyState,network_state:v.networkState,
           current_time:Math.round(v.currentTime*10)/10,paused:v.paused,
           error_code:v.error?.code||null,src_scheme:v.currentSrc?new URL(v.currentSrc).protocol:null
        }));
      });
      if(snap.length)out.push({frame_origin:new URL(frame.url()).origin,vids:snap});
   } catch(e) {}
 }
 return out;
}
async function attemptPlay(page){
 const notes=[];
 for(const frame of page.frames()){
   try{
     const r=await frame.evaluate(async ()=>{
       const v=document.querySelector('video');if(!v)return null;
       v.muted=true;
       try{await Promise.race([v.play(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('play_timeout')),4500))]);return 'play_called_successfully';}
       catch(e){return (e?.name||'Error')+': '+String(e?.message||e).slice(0,125);}
     });
     if(r)notes.push(r);
   }catch(e){}
 }
 return notes;
}
(async()=>{
 const report={note:"Automated browser smoke in US GitHub Ubuntu runner. Passing implies playback only when currentTime advances; cannot confirm mainland China/Safari.",
   at_utc:new Date().toISOString(),results:[]};
 const chrome=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
   for(const c of cases){
      const rec={platform:c.platform,title:c.title,requested_url:c.url,html_status:null,media_response_count:0,media_statuses:[],playback_confirmed:false};
      const context=await chrome.newContext({viewport:{width:1024,height:768},ignoreHTTPSErrors:false});
      const page=await context.newPage();
      page.on('response',r=>{
       const u=r.url();
       const ct=(r.headers()['content-type']||'').toLowerCase();
       if(/video\/|application\/vnd.apple.mpegurl|application\/dash\+xml/.test(ct)||/\.(m3u8|mpd|m4s|mp4|ts)(\?|$)/i.test(u)){
         rec.media_response_count++;
         if(rec.media_statuses.length<8) rec.media_statuses.push(r.status());
       }
      });
      try{
        const resp=await page.goto(c.url,{waitUntil:'domcontentloaded',timeout:27000});
        rec.html_status=resp?.status()||null;
        rec.final_host=new URL(page.url()).host;
        await page.waitForTimeout(6000);
        rec.before=await inspect(page);
        rec.play_attempts=await attemptPlay(page);
        await page.waitForTimeout(4500);
        rec.after=await inspect(page);
        const base=new Map();
        for(const f of rec.before||[])for(const v of f.vids||[]){const k=f.frame_origin; base.set(k,Math.min(base.get(k)??Number.POSITIVE_INFINITY,v.current_time))}
        for(const f of rec.after||[])for(const v of f.vids||[]){
          const prev=base.get(f.frame_origin);
          if(prev!==undefined&&v.current_time-prev>0.6&&v.ready_state>=2)rec.playback_confirmed=true;
        }
        const title=await page.title().catch(()=>null);rec.page_title=title?.slice(0,110)||null;
      }catch(e){rec.error=e.name+': '+String(e.message||e).slice(0,175)}
      await context.close();
      report.results.push(rec);
      save(report);
      console.log("PLAYER_RESULT",JSON.stringify({
        platform:rec.platform,html_status:rec.html_status,media_response_count:rec.media_response_count,
        playback_confirmed:rec.playback_confirmed,
        before:rec.before,after:rec.after,play_attempts:rec.play_attempts,error:rec.error
      }).slice(0,2700));
      await new Promise(r=>setTimeout(r,4000));
   }
 }finally{await chrome.close();}
 report.completed=true;
 save(report);
})().catch(e=>{console.error("BROWSER_PROBE_FATAL",String(e));process.exitCode=1});

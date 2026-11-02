import { chromium, webkit } from 'playwright';

// READ-ONLY experiment. The production short-drama player is not modified.
// A blank HTML page is served at the exact production GitHub Pages origin.
// No video bytes pass through the owner's Cloudflare Worker.
const ORIGIN='https://maddestalistar.github.io';
const urls={
 iqiyi4:'https://www.iqiyi.com/v_2go3e66i74k.html',
 iqiyi45:'https://www.iqiyi.com/v_1vxy9fim5jw.html',
 bilibili:'https://player.bilibili.com/player.html?bvid=BV14mo9BuEpM&autoplay=0',
};
const trim=s=>String(s||'').slice(0,180);
async function headersTest(){
 for(const [key,url] of Object.entries(urls)){
  try{
   const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'},
    signal:AbortSignal.timeout(22000)});
   const html=(await r.text()).slice(0,2000000);
   const fields={
    status:r.status,url:new URL(r.url).hostname,
    xFrameOptions:r.headers.get('x-frame-options'),
    frameAncestors:trim(r.headers.get('content-security-policy')),
    htmlLength:html.length,
    titleMatch:html.includes('渔王：风浪越大鱼越贵'),
    iframeLinks:[...new Set((html.match(/https?:[^"'<>\\s]{5,220}(?:coopPlayerIndex|open\\.iqiyi\\.com|player\\.bilibili\\.com)[^"'<>\\s]{0,120}/gi)||[]))].slice(0,4).map(x=>x.slice(0,100)),
    showDuration:html.includes('02:34'),
    videoTag:html.includes('<video'),
    embedCode:html.includes('通用代码'),
   };
   console.log('HEADER_'+key.toUpperCase(),JSON.stringify(fields));
  }catch(e){console.log('HEADER_'+key.toUpperCase()+'_ERROR',trim(e))}
 }
}
async function browserTest(name, engine){
 let browser;
 try{
  browser=await engine.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
   locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
  const page=await context.newPage();
  await page.route('https://maddestalistar.github.io/LiangYou-ResourceHub/iframe-probe.html',
    route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html lang="zh"><body><main>Standalone iframe playback verification</main></body></html>'}));
  await page.goto('https://maddestalistar.github.io/LiangYou-ResourceHub/iframe-probe.html',{waitUntil:'domcontentloaded',timeout:22000});
  for(const [id,url] of Object.entries(urls)){
    const fails=[],responses=[],requests=[],consoleMessages=[];
    const onFailure=req=>fails.push({host:new URL(req.url()).hostname,reason:req.failure()?.errorText?.slice(0,95)});
    const onResponse=r=>{
      try{
       if(/iqiyi|bilibili|bilivideo|qiyi|video/.test(new URL(r.url()).hostname)){
        if(r.request().resourceType()==='media'||r.headers()['content-type']?.startsWith('video/'))responses.push({code:r.status(),host:new URL(r.url()).hostname,mediaType:r.request().resourceType(),contentType:r.headers()['content-type']?.slice(0,60)});
       }
      }catch{}
    };
    const onRequest=r=>{
      try{if(r.resourceType()==='media')requests.push(new URL(r.url()).hostname)}catch{}
    };
    const onConsole=msg=>{if(msg.type()==='error')consoleMessages.push(trim(msg.text()))};
    page.on('requestfailed',onFailure);page.on('response',onResponse);page.on('request',onRequest);page.on('console',onConsole);
    try{
      await page.evaluate(u=>{
       document.querySelectorAll('iframe').forEach(i=>i.remove());
       const iframe=document.createElement('iframe');
       iframe.id='media-probe';iframe.src=u;iframe.allow='autoplay; fullscreen; encrypted-media; picture-in-picture';
       iframe.allowFullscreen=true;iframe.style='display:block;width:365px;height:600px;border:0';
       document.body.appendChild(iframe);
      },url);
      await page.waitForTimeout(11000);
      const fr=page.frames().filter(f=>f!==page.mainFrame());
      const frameInfo=fr.slice(0,6).map(f=>({name:f.name(),host:(()=>{try{return new URL(f.url()).hostname}catch{return '?'}})(),path:(()=>{try{return new URL(f.url()).pathname}catch{return '?' }})()}));
      const playButtons=[];
      for(const f of fr){
       try{
        const labels=await f.locator('button,a').allTextContents({timeout:2200});
        playButtons.push(...labels.filter(x=>/播放|Play|立即观看|点击播放/.test(x)).slice(0,8).map(trim));
       }catch{}
      }
      console.log('IFRAME_'+name+'_'+id.toUpperCase(),JSON.stringify({
       host:new URL(url).hostname,iframeCount:fr.length,frames:frameInfo,
       mediaRequests:requests.slice(0,10),mediaResponses:responses.slice(0,10),
       failures:fails.filter(x=>/iqiyi|bilibili|qiyi|bilivideo/.test(x.host)).slice(0,12),
       consoleErrors:consoleMessages.slice(0,6),playLabels:playButtons.slice(0,8)}));
    }catch(e){console.log('IFRAME_'+name+'_'+id.toUpperCase()+'_ERROR',trim(e))}
    finally{
      page.off('requestfailed',onFailure);page.off('response',onResponse);page.off('request',onRequest);page.off('console',onConsole);
    }
  }
 }catch(e){console.log('BROWSER_'+name+'_ERROR',trim(e))}
 finally{await browser?.close()}
}
await headersTest();
await browserTest('CHROMIUM',chromium);
await browserTest('WEBKIT',webkit);

// Browser acceptance: stream real sample media directly from original CDN.
// No drama source is inferred; this tests only the HTML video path.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},
    deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const requests=[];
  const errors=[];
  page.on('request',r=>{
    const u=r.url();
    if(/(?:test-videos\.co\.uk|test-streams\.mux\.dev|liangyou-short-drama-playback\.)/.test(u)){
      requests.push(u.slice(0,180));
    }
  });
  page.on('pageerror',e=>errors.push(e.message.slice(0,200)));
  await page.route('https://liangyou-short-drama-playback.maddestalistar.workers.dev/api/resolve?*',route=>
    route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},
      body:JSON.stringify({error:'not_configured',episodes:[]})}));
  await page.goto('http://127.0.0.1:8765/#media',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#media .mi-tabs button[data-mi-tab="drama"]').click();
  await page.locator('#media .mi-drama-test-play').first().click();
  const dialog=page.locator('dialog.mi-dpt-dialog');
  await dialog.waitFor({state:'visible',timeout:15000});
  const video=dialog.locator('video');
  const mediaCheck=async(kind,host)=>{
    await dialog.locator(`button[data-demo-stream="${kind}"]`).click();
    await page.waitForFunction(()=>{
      const video=document.querySelector('dialog.mi-dpt-dialog video');
      return video?.readyState>=2||video?.error;
    },null,{timeout:55000});
    const info=await video.evaluate(v=>({url:v.currentSrc,readyState:v.readyState,
      width:v.videoWidth,height:v.videoHeight,error:v.error?.message||'',
      paused:v.paused,currentTime:v.currentTime}));
    assert.ok(info.readyState>=2,kind+' was not playable: '+JSON.stringify(info));
    assert.ok(info.width>0&&info.height>0,kind+' video metadata not loaded');
    assert.ok(new URL(info.url).hostname===host,kind+' unexpectedly proxied');
    console.log('DIRECT_BROWSER_MEDIA_'+kind.toUpperCase(),JSON.stringify(info));
  };
  await mediaCheck('mp4','test-videos.co.uk');
  await mediaCheck('hls','test-streams.mux.dev');
  assert.equal(errors.length,0,'JavaScript exceptions '+JSON.stringify(errors));
  assert.ok(requests.some(x=>x.includes('test-videos.co.uk')));
  assert.ok(requests.some(x=>x.includes('test-streams.mux.dev')));
  assert.equal(requests.some(x=>x.includes('liangyou-short-drama-playback.')&&x.match(/\.(mp4|m3u8|ts)(?:[?#]|$)/)),false,
    'Video was routed through the Cloudflare Worker');
  await dialog.locator('.mi-dpt-close').click();
  assert.equal(await video.getAttribute('src'),null);
  console.log('DIRECT_MEDIA_BROWSER_SUCCESS','iPhone-size Chrome verified MP4 + HLS without CF proxy');
}finally{
  await browser.close();
}

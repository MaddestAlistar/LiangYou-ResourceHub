// Read-only public-web playback probe: no Cloudflare video proxy and no upload.
// A video player shown by the platform is NOT proof the media can be embedded.
// Only examine public page identity, bounded initial media bytes and first frames.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const TITLE='重生！丑小鸭逆袭成了万人迷第二季';
const SERIES_ID='7685676216996596761';
const FIRST_EPISODE='7685677901034818622';
const PAGE='https://hongguoduanju.com/player/'+SERIES_ID;
const VIDEO='https://hongguoduanju.com/video/public/'+FIRST_EPISODE+'/360p.mp4';
const timeout=25000;
const describe=(err)=>String(err?.message||err).slice(0,320);
async function responseHeaders(url,headers={}){
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(timeout),redirect:'follow'});
  const summary={
    status:response.status,redirected:response.redirected,url:new URL(response.url).hostname,
    contentType:response.headers.get('content-type'),
    contentLength:response.headers.get('content-length'),
    contentRange:response.headers.get('content-range'),
    acceptRanges:response.headers.get('accept-ranges'),
    cors:response.headers.get('access-control-allow-origin')
  };
  return {response,summary};
}
const page=await responseHeaders(PAGE);
let html='';
if(page.response.ok){
  html=(await page.response.text()).slice(0,3_000_000);
  const titlePresent=html.includes(TITLE);
  const videoLinkPresent=html.includes('/video/public/'+FIRST_EPISODE+'/360p.mp4');
  console.log('OFFICIAL_PAGE',JSON.stringify({...page.summary,titlePresent,videoLinkPresent}));
  assert.ok(titlePresent,'Expected redfruit work title was not found');
}else{
  console.log('OFFICIAL_PAGE',JSON.stringify(page.summary));
  process.exitCode=1;
}
async function checkVideo(){
  const {response,summary}=await responseHeaders(VIDEO,{
    Range:'bytes=0-131071',Origin:'https://maddestalistar.github.io',
    Referer:PAGE
  });
  if(!response.ok){
    console.log('PUBLIC_VIDEO_RANGE',JSON.stringify({...summary,validMp4:false}));
    return false;
  }
  const reader=response.body?.getReader();
  const chunks=[];let total=0;
  try{
    while(reader&&total<131072){
      const {done,value}=await reader.read();
      if(done)break;
      chunks.push(value);total+=value.length;
    }
  }finally{try{await reader?.cancel()}catch{}}
  const bytes=new Uint8Array(Math.min(total,131072));let off=0;
  for(const c of chunks){bytes.set(c.subarray(0,Math.min(c.length,bytes.length-off)),off);off+=Math.min(c.length,bytes.length-off);if(off>=bytes.length)break}
  const signature=new TextDecoder().decode(bytes.subarray(4,8));
  const validMp4=signature==='ftyp';
  console.log('PUBLIC_VIDEO_RANGE',JSON.stringify({...summary,bytes:bytes.length,signature,validMp4}));
  return validMp4;
}
let validRange=false;try{validRange=await checkVideo()}catch(e){console.log('PUBLIC_VIDEO_RANGE_ERROR',describe(e))}
async function browserTest(name,launcher){
  let browser;
  try{
    browser=await launcher.launch({headless:true});
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:false});
    const testPage=await context.newPage();
    const requests=[];
    const failures=[];
    testPage.on('request',r=>{
      const url=r.url();
      if(/hongguoduanju\.com|workers\.dev|(?:byte|vod|cdn)/i.test(url))
        requests.push({host:new URL(url).host,type:r.resourceType()});
    });
    testPage.on('requestfailed',r=>failures.push({host:new URL(r.url()).hostname,
      reason:r.failure()?.errorText?.slice(0,120)}));
    await testPage.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout});
    await testPage.setContent('<main><video id="test" controls playsinline preload="auto" style="width:320px;height:540px" src="'+VIDEO+'"></video></main>');
    const outcome=await testPage.evaluate(async()=>{
      const v=document.querySelector('video');
      let last='timeout';
      await new Promise(resolve=>{
        const finish=value=>{last=value;resolve()};
        v.addEventListener('loadeddata',()=>finish('loadeddata'),{once:true});
        v.addEventListener('error',()=>finish('error'),{once:true});
        setTimeout(()=>finish('timeout'),35000);
        v.load();
      });
      const playResult=await v.play().then(()=> 'playing').catch(e=>'blocked: '+e.name);
      if(playResult==='playing')await new Promise(r=>setTimeout(r,1400));
      return {event:last,playResult,readyState:v.readyState,videoWidth:v.videoWidth,
        videoHeight:v.videoHeight,currentTime:v.currentTime,currentSrc:new URL(v.currentSrc||v.src).hostname,
        videoError:v.error?.code||null,networkState:v.networkState};
    });
    console.log('BROWSER_'+name,JSON.stringify({...outcome,requests:requests.slice(0,15),failures:failures.slice(0,6)}));
    return outcome.readyState>=2&&outcome.videoWidth>0&&outcome.currentTime>0&&
      !requests.some(x=>x.host.includes('workers.dev'));
  }catch(e){console.log('BROWSER_'+name+'_ERROR',describe(e));return false}
  finally{await browser?.close()}
}
const chromiumWorks=await browserTest('CHROMIUM',chromium);
const webkitWorks=await browserTest('WEBKIT',webkit);
console.log('FINAL_PUBLIC_HONGGUO_TEST',JSON.stringify({pageTitle:html.includes(TITLE),
  validMp4:validRange,chromiumWorks,webkitWorks,
  cloudflareVideoProxy:false,officialEmbeddingPermission:'not established'}));
if(!validRange||!chromiumWorks||!webkitWorks)process.exitCode=1;

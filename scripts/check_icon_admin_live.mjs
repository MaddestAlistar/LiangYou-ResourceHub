import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base='https://maddestalistar.github.io/LiangYou-ResourceHub';
const worker='https://liangyou-icon-review.maddestalistar.workers.dev';
const origin='https://maddestalistar.github.io';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const retry=async(fn,attempts=4)=>{
  let last;
  for(let i=0;i<attempts;i++){
    try{return await fn()}catch(err){last=err;await sleep(2500*(i+1))}
  }
  throw last;
};
const status=await retry(async()=>{
  const response=await fetch(worker+'/health',{headers:{Origin:origin},signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('Worker health HTTP '+response.status);
  const json=await response.json();
  if(json.ok!==true)throw Error('Worker reports not OK');
  if(response.headers.get('access-control-allow-origin')!==origin)
    throw Error('Worker health lacks expected CORS');
  return {code:response.status,version:json.version};
});
console.log('ICON_ADMIN_HEALTH',JSON.stringify(status));

const unauth=await retry(async()=>{
  const response=await fetch(worker+'/admin',{headers:{Origin:origin},signal:AbortSignal.timeout(18000)});
  const body=await response.json();
  if(response.status!==401)
    throw Error('Expected unauthenticated 401, got '+response.status+' '+JSON.stringify(body).slice(0,140));
  return {code:response.status,error:body.error};
});
console.log('ICON_ADMIN_GUARD',JSON.stringify(unauth));

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
  const errors=[];
  const failed=[];
  page.on('pageerror',err=>errors.push(err.message.slice(0,300)));
  page.on('requestfailed',req=>{
    if(/tech-news-admin\.js|icon-review-admin\.html|workers\.dev/.test(req.url()))
      failed.push({url:req.url().replace(/\?.*/,''),error:req.failure()?.errorText});
  });
  const response=await retry(async()=>{
    const r=await page.goto(base+'/icon-review-admin.html',{waitUntil:'domcontentloaded',timeout:25000});
    if(!r||r.status()!==200)throw Error('Admin HTML not reachable '+r?.status());
    return r;
  });
  await page.locator('#load').waitFor({timeout:20000});
  await page.locator('#key').waitFor({timeout:20000});
  await page.locator('#news-category').waitFor({timeout:20000});
  await page.waitForFunction(()=>typeof document.getElementById('news-refresh')?.onclick==='function'||
    document.getElementById('news-refresh')?.getAttribute('data-ready')==='true'||
    document.readyState==='complete',{timeout:15000}).catch(()=>{});
  await page.locator('#load').click();
  await page.waitForFunction(()=>document.getElementById('message')?.textContent?.includes('请输入管理员密钥'),
    null,{timeout:7000});
  await page.locator('#news-category').selectOption('视频精选');
  assert.equal(await page.locator('#news-video-fields').isVisible(),true,'News video category form did not open');
  await page.locator('#news-category').selectOption('系统提醒');
  assert.equal(await page.locator('#news-image-fields').isVisible(),true,'News image field missing');
  await page.locator('#key').fill('x'.repeat(24));
  await page.locator('#load').click();
  await page.waitForFunction(()=>{
    const msg=document.querySelector('#message')?.textContent||'';
    return msg.includes('读取失败：')||msg.includes('加载成功');
  },null,{timeout:20000});
  const message=await page.locator('#message').innerText();
  if(message.includes('加载成功'))throw Error('Unexpected success with invalid key');
  if(errors.length)throw Error('Browser script exceptions '+JSON.stringify(errors));
  if(failed.length)throw Error('Required network requests failed '+JSON.stringify(failed));
  console.log('ICON_ADMIN_BROWSER',JSON.stringify({html:response.status(),title:await page.title(),
    login:message.slice(0,120),newsForm:true,mobile:true,pageerrors:errors.length}));
} finally {
  await browser.close();
}

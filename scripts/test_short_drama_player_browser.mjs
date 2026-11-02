import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
  await page.route('https://liangyou-short-drama-playback.maddestalistar.workers.dev/api/resolve?*',route=>
    route.fulfill({status:503,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*'},
      body:JSON.stringify({error:'not_configured',episodes:[]})}));
  await page.goto('http://127.0.0.1:8765/#media',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#media .mi-tabs button[data-mi-tab="drama"]').waitFor({timeout:30000});
  await page.locator('#media .mi-tabs button[data-mi-tab="drama"]').click();
  await page.locator('#media .mi-drama-test-play').first().waitFor({timeout:30000});
  const button=page.locator('#media .mi-drama-test-play').first();
  const tag=button.locator('xpath=..');
  assert.equal(await button.textContent(),'测试');
  assert.ok(await tag.locator('.mi-drama-tag-items').count());
  const a=await button.boundingBox(),b=await tag.boundingBox();
  assert.ok(a&&b&&a.x>=b.x&&a.x+a.width<=b.x+b.width+1,'button stays within tag row');
  await button.click();
  const dialog=page.locator('dialog.mi-dpt-dialog');
  await dialog.waitFor({state:'visible',timeout:12000});
  assert.equal(await dialog.evaluate(el=>el.open),true);
  assert.equal(await dialog.locator('video[playsinline]').count(),1);
  await page.waitForFunction(()=>{
    const text=document.querySelector('.mi-dpt-status')?.textContent||'';
    return text.includes('播放服务已连接')||text.includes('尚未配置可合法使用的视频地址');
  },null,{timeout:12000});
  assert.equal(await dialog.locator('.mi-dpt-episodes').isVisible(),false);
  await dialog.locator('.mi-dpt-close').click();
  assert.equal(await dialog.evaluate(el=>el.open),false);
  assert.equal(await dialog.locator('video').getAttribute('src'),null);
  console.log('Short drama test button and inline modal verified at 390px.');
}finally{
  await browser.close();
}

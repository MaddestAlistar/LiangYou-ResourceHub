import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8765/#media',{waitUntil:'domcontentloaded',timeout:30000});
  const tab=page.locator('#media .mi-tabs button[data-mi-tab="drama"]');
  await tab.waitFor({timeout:30000});
  await tab.click();
  const cards=page.locator('#media .mi-drama-card');
  await cards.first().waitFor({timeout:30000});
  assert.ok(await cards.count()>0,'drama cards missing');
  assert.ok(await page.locator('#media .mi-drama-tags').count()>0,'genre labels missing');
  assert.equal(await page.locator('#media .mi-drama-test-play, #media [data-drama-playtest]').count(),0);
  assert.equal(await page.locator('dialog.mi-dpt-dialog').count(),0);
  await page.locator('#media .mi-drama-tags').first().click();
  assert.equal(await page.locator('dialog.mi-dpt-dialog').count(),0);
  assert.equal(errors.length,0,'page exceptions '+JSON.stringify(errors));
  console.log('Short drama cards show tags but no test entry or playback dialog at 390px.');
}finally{
  await browser.close();
}

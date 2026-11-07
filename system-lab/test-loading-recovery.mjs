import { chromium } from 'playwright';

const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const blockImage = route => {
  if(route.request().url().includes('freedos722.img')) return route.fulfill({status:503,body:'Temporarily unavailable'});
  return route.continue();
};
try {
  await page.route('**/*',blockImage);
  await page.goto('http://127.0.0.1:8765/system-lab/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-launch="freedos"]').click();
  await page.waitForFunction(()=>document.querySelector('#loadingCover')?.classList.contains('load-failed'),null,{timeout:45000});
  if(!(await page.locator('#errorMessage').textContent()).includes('镜像下载失败')) throw Error('Failed download had no useful error');
  if(!(await page.locator('#loadingDetail').textContent()).includes('重新尝试')) throw Error('Retry instructions were not shown');
  console.log('Blocked downloads produce visible error and retry controls.');
  await page.unroute('**/*',blockImage);
  await page.locator('#retryLoading').click();
  await page.waitForFunction(()=>/A:\\>/.test(document.querySelector('#screen_container')?.textContent||''),null,{timeout:95000});
  await page.waitForFunction(()=>document.querySelector('#loadingCover')?.hidden===true,null,{timeout:10000});
  console.log('Recovered from download failure: FreeDOS DOS prompt is visible.');
  if(errors.length)throw Error('Unexpected page errors: '+errors.join(';'));
  await page.screenshot({path:'/tmp/ly-web-os-retry-success.png',fullPage:true});
} catch(e) {
  console.error('Retry smoke FAILED:',e.message);
  console.error('Status:',await page.locator('#machineStatus').textContent().catch(()=>'?'));
  console.error('Error:',await page.locator('#errorMessage').textContent().catch(()=>'?'));
  console.error('Browser errors:',errors);
  await page.screenshot({path:'/tmp/ly-web-os-retry-error.png',fullPage:true}).catch(()=>{});
  process.exitCode=1;
} finally {await browser.close();}

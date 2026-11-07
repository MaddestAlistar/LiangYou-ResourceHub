import { chromium, devices } from 'playwright';

const url = 'http://127.0.0.1:8765/system-lab/';
const browser = await chromium.launch({headless:true, args:['--no-sandbox']});
const browserErrors = [];
const page = await browser.newPage({viewport:{width:1280,height:900}});
page.on('pageerror', err => browserErrors.push(err.message));
page.on('console', msg => { if(msg.type()==='error') browserErrors.push(msg.text()); });
try {
  await page.goto(url, {waitUntil:'domcontentloaded'});
  await page.locator('[data-launch="freedos"]').click();
  await page.waitForFunction(() => document.querySelector('#machineStatus')?.textContent?.includes('运行中'), null, {timeout:90000});
  // VM CPU started is not guest OS boot: wait for the actual DOS prompt.
  await page.waitForFunction(() => /A:\\>/.test(document.querySelector('#screen_container')?.textContent || ''), null, {timeout:100000});
  const first = await page.locator('#screen_container').evaluate(el => ({
    shown: getComputedStyle(el).display !== 'none',
    text: el.innerText.slice(0,240),
    canvasWidth: el.querySelector('canvas')?.width || 0
  }));
  console.log('FreeDOS launched:',first);
  if(!first.shown) throw new Error('FreeDOS screen was hidden');
  await page.screenshot({path:'/tmp/ly-web-os-freedos.png',fullPage:true});
  await page.locator('[data-launch="kolibri"]').click();
  await page.waitForFunction(() => document.querySelector('#machineName')?.textContent==='KolibriOS' && document.querySelector('#machineStatus')?.textContent?.includes('运行中'), null, {timeout:90000});
  // KolibriOS must switch to graphics; boot messages alone do not count.
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#screen_container canvas');
    return canvas && getComputedStyle(canvas).display !== 'none' && canvas.width >= 320 && canvas.height >= 200;
  }, null, {timeout:100000});
  console.log('KolibriOS graphics mode started');
  await page.screenshot({path:'/tmp/ly-web-os-kolibri.png',fullPage:true});
  await page.locator('[data-launch="linux"]').click();
  await page.waitForFunction(() => document.querySelector('#machineName')?.textContent==='Buildroot Linux' && document.querySelector('#machineStatus')?.textContent?.includes('运行中'), null, {timeout:90000});
  // Require a login or shell prompt, not just kernel initialization.
  await page.waitForFunction(() => /(?:login:\s*$|(?:^|\n)[^\n]*[#$]\s*$|\/root%\s*$)/m.test(document.querySelector('#screen_container')?.textContent || ''), null, {timeout:100000});
  console.log('Buildroot Linux login/shell prompt reached');
  await page.screenshot({path:'/tmp/ly-web-os-linux.png',fullPage:true});
  const mobile = await browser.newPage({...devices['iPhone 13']});
  await mobile.goto(url, {waitUntil:'domcontentloaded'});
  const layout = await mobile.evaluate(() => ({document:document.documentElement.scrollWidth, viewport:innerWidth, cardCount:document.querySelectorAll('.system-card').length}));
  console.log('Mobile layout:',layout);
  if(layout.document > layout.viewport + 5 || layout.cardCount !== 3) throw Error('Mobile screen layout overflow or missing system cards');
  await mobile.screenshot({path:'/tmp/ly-web-os-mobile.png',fullPage:true});
  console.log('Browser OS lab smoke test passed.');
} catch(error) {
  console.error('Browser OS lab smoke test failed:',error);
  console.error('Browser errors:', browserErrors.slice(-12));
  console.error('Visible text in emulator:',(await page.locator('#screen_container').textContent().catch(()=>''))?.slice(-1500));
  console.error('Canvas state:',await page.locator('#screen_container canvas').evaluate(el=>({display:getComputedStyle(el).display,width:el.width,height:el.height})).catch(()=>'?'));
  console.error('Page state:',await page.locator('#machineStatus').textContent().catch(()=>'?'));
  console.error('Error box:',await page.locator('#errorMessage').textContent().catch(()=>'?'));
  await page.screenshot({path:'/tmp/ly-web-os-error.png',fullPage:true}).catch(()=>{});
  process.exitCode = 1;
} finally { await browser.close(); }

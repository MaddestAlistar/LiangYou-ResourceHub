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
  // VM CPU started is not guest OS boot: wait for the actual DOS prompt.
  await page.waitForFunction(() => /A:\\>/.test(document.querySelector('#screen_container')?.textContent || ''), null, {timeout:100000});
  const first = await page.locator('#screen_container').evaluate(el => ({
    shown: getComputedStyle(el).display !== 'none',
    text: el.innerText.slice(0,240),
    canvasWidth: el.querySelector('canvas')?.width || 0
  }));
  console.log('FreeDOS launched:',first);
  if(!first.shown) throw new Error('FreeDOS screen was hidden');
  await page.waitForFunction(() => document.querySelector('#guestIndicator')?.textContent?.includes('DOS 已进入'),null,{timeout:15000});
  if(!(await page.locator('#guideTitle').textContent()).includes('FreeDOS')) throw new Error('FreeDOS guide not shown');
  const dosQuick = page.locator('[data-command="dir"]');
  await dosQuick.waitFor({state:'visible'});
  await page.waitForFunction(() => !document.querySelector('[data-command="dir"]')?.disabled, null, {timeout:15000});
  await dosQuick.click();
  await page.waitForFunction(() => document.querySelector('#quickFeedback')?.textContent?.includes('已输入并执行「dir」'),null,{timeout:15000});
  await page.waitForFunction(() => /dir/i.test(document.querySelector('#screen_container')?.textContent || ''),null,{timeout:15000});
  console.log('FreeDOS one-tap command sent successfully');
  const gameButton = page.locator('#primaryAction');
  if(!(await gameButton.textContent()).includes('查看磁盘文件')) throw Error('DOS main button should show files, not force snake');
  if(await page.locator('#easyActions [data-easycmd]').count()!==3)throw Error('Missing three DOS game choices');
  await gameButton.click();
  await page.waitForFunction(()=>document.querySelector('#playStatus')?.textContent?.includes('dir'),null,{timeout:15000});
  await page.locator('#easyActions [data-easycmd="snake"]').click();
  await page.waitForFunction(() => document.querySelector('#playStatus')?.textContent?.includes('已尝试启动「snake」'),null,{timeout:15000});
  await page.locator('[data-padkey="up"]').click();
  await page.waitForFunction(() => document.querySelector('#playStatus')?.textContent?.includes('方向键已按下：上'),null,{timeout:10000});
  console.log('FreeDOS multiple game choices and screen-adjacent gamepad work');
  await page.locator('#screenMode').click();
  if(!(await page.evaluate(()=>document.body.classList.contains('lab-immersive')))) throw Error('Immersive viewport did not open');
  if(!(await page.locator('#screenMode').textContent()).includes('返回')) throw Error('Immersive exit control missing');
  await page.locator('#screenMode').click();
  if(await page.evaluate(()=>document.body.classList.contains('lab-immersive'))) throw Error('Immersive viewport did not close');
  console.log('Enlarge and exit buttons work');
  await page.screenshot({path:'/tmp/ly-web-os-freedos.png',fullPage:true});
  await page.locator('[data-launch="kolibri"]').click();
  // KolibriOS must switch to graphics; boot messages alone do not count.
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#screen_container canvas');
    return canvas && getComputedStyle(canvas).display !== 'none' && canvas.width >= 320 && canvas.height >= 200;
  }, null, {timeout:100000});
  console.log('KolibriOS graphics mode started');
  if(!(await page.locator('#guideTitle').textContent()).includes('KolibriOS')) throw new Error('KolibriOS guide not shown');
  if(!(await page.locator('#systemNote').textContent()).includes('鼠标')) throw new Error('KolibriOS mouse instructions missing');
  await page.locator('#mouseControls [data-mouse="left"]').click();
  await page.waitForFunction(()=>document.querySelector('#playStatus')?.textContent?.includes('左键点击已发送'),null,{timeout:15000});
  await page.locator('#mouseControls [data-mouse="double"]').click();
  await page.waitForFunction(()=>document.querySelector('#playStatus')?.textContent?.includes('双击已发送'),null,{timeout:15000});
  await page.locator('#mouseControls [data-mouse="right"]').click();
  await page.waitForFunction(()=>document.querySelector('#playStatus')?.textContent?.includes('右键已发送'),null,{timeout:15000});
  console.log('KolibriOS virtual mouse left/double/right emitted');
  if(await page.locator('[data-vkey="ctrlc"]').isEnabled()) throw new Error('Ctrl+C should be disabled for graphical guest');
  await page.locator('#padEnter').click();
  await page.waitForFunction(() => document.querySelector('#quickFeedback')?.textContent?.includes('ENTER 已发送') || document.querySelector('#quickFeedback')?.textContent?.includes('Enter 已发送'),null,{timeout:10000});
  console.log('KolibriOS virtual Enter key sent');
  await page.screenshot({path:'/tmp/ly-web-os-kolibri.png',fullPage:true});
  await page.locator('[data-launch="linux"]').click();
  // Require a login or shell prompt, not just kernel initialization.
  await page.waitForFunction(() => /(?:login:\s*$|(?:^|\n)[^\n]*[#$]\s*$|\/root%\s*$)/m.test(document.querySelector('#screen_container')?.textContent || ''), null, {timeout:100000});
  console.log('Buildroot Linux login/shell prompt reached');
  if(!(await page.locator('#systemNote').textContent()).includes('没有可点击的桌面'))throw Error('Linux CLI explanation missing');
  if(await page.locator('#easyActions [data-easycmd]').count()!==3)throw Error('Linux beginner actions not available');
  await page.waitForFunction(() => document.querySelector('#guestIndicator')?.textContent?.includes('Shell 已进入'),null,{timeout:15000});
  if(!(await page.locator('#guideTitle').textContent()).includes('Linux')) throw new Error('Linux guide not shown');
  await page.locator('[data-command="pwd"]').click();
  await page.waitForFunction(() => document.querySelector('#quickFeedback')?.textContent?.includes('已输入并执行「pwd」'),null,{timeout:15000});
  console.log('Linux one-tap command sent successfully');
  await page.screenshot({path:'/tmp/ly-web-os-linux.png',fullPage:true});
  const mobile = await browser.newPage({...devices['iPhone 13']});
  await mobile.goto(url, {waitUntil:'domcontentloaded'});
  const layout = await mobile.evaluate(() => ({document:document.documentElement.scrollWidth, viewport:innerWidth, cardCount:document.querySelectorAll('.system-card').length}));
  console.log('Mobile layout:',layout);
  if(layout.document > layout.viewport + 5 || layout.cardCount !== 3) throw Error('Mobile screen layout overflow or missing system cards');
  await mobile.locator('[data-launch="linux"]').click();
  if(!(await mobile.locator('#guideTitle').textContent()).includes('Linux')) throw Error('Mobile guide did not update on launch');
  const mobileWidth = await mobile.evaluate(() => ({document:document.documentElement.scrollWidth,viewport:innerWidth,keys:document.querySelectorAll('#virtualKeys button').length,commands:document.querySelectorAll('#quickCommands [data-command]').length}));
  console.log('Mobile after choosing guest:', mobileWidth);
  if(mobileWidth.document > mobileWidth.viewport + 5 || mobileWidth.keys !== 9 || mobileWidth.commands !== 4) throw Error('Mobile guide or keypad overflows / is incomplete');
  await mobile.locator('#screenMode').click();
  const immersive = await mobile.evaluate(() => ({
    enabled:document.body.classList.contains('lab-immersive'),
    machinePosition:getComputedStyle(document.querySelector('#machine')).position,
    machineHeight:document.querySelector('#machine').getBoundingClientRect().height,
    windowHeight:innerHeight,
    padVisible:(() => { const r=document.querySelector('#dpad').getBoundingClientRect();return r.width>0&&r.top>=0&&r.bottom<=innerHeight+2; })()
  }));
  console.log('iPhone-like immersive layout:',immersive);
  if(!immersive.enabled || immersive.machinePosition!=='fixed' || !immersive.padVisible) throw Error('Mobile fullscreen fallback or gamepad not accessible');
  await mobile.screenshot({path:'/tmp/ly-web-os-mobile.png',fullPage:true});
  await mobile.locator('#screenMode').click();
  if(await mobile.evaluate(()=>document.body.classList.contains('lab-immersive'))) throw Error('Mobile immersive exit did not work');
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

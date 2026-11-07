import {webkit,devices} from 'playwright';
const browser=await webkit.launch({headless:true});
const page=await browser.newPage({...devices['iPhone 13'],browserName:undefined});
const errors=[],failures=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('requestfailed',r=>failures.push(r.url()+' '+r.failure()?.errorText));
try {
  await page.goto('http://127.0.0.1:8765/system-lab/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-launch="freedos"]').click();
  await page.waitForFunction(()=>{
    const status=document.querySelector('#machineStatus')?.textContent || '';
    const screen=document.querySelector('#screen_container')?.textContent || '';
    return /A:\\>/.test(screen)||/启动未完成|下载失败|加载失败/.test(status);
  },null,{timeout:90000});
  console.log('WebKit mobile state:',await page.locator('#machineStatus').textContent());
  console.log('Visible boot tail:',(await page.locator('#screen_container').textContent()).slice(-650));
  if(!(await page.locator('#screen_container').textContent()).includes('A:\\>'))throw new Error('WebKit did not boot FreeDOS to DOS prompt');
  console.log('WebKit mobile FreeDOS boot successful');
  await page.screenshot({path:'/tmp/ly-os-webkit.png',fullPage:true});
  await page.locator('[data-launch="kolibri"]').click();
  await page.waitForFunction(()=>{
    const canvas=document.querySelector('#screen_container canvas');
    return !!canvas && getComputedStyle(canvas).display!=='none' && canvas.width>=320 && canvas.height>=200;
  },null,{timeout:110000});
  await page.waitForFunction(()=>!document.querySelector('[data-mouse="left"]')?.disabled,null,{timeout:15000});
  if(await page.locator('#mouseControls').isHidden())throw Error('Mouse buttons should appear in Kolibri mode');
  await page.locator('[data-mouse="left"]').click();
  await page.waitForFunction(()=>document.querySelector('#playStatus')?.textContent?.includes('左键点击已发送'),null,{timeout:15000});
  await page.locator('[data-mouse="double"]').click();
  await page.waitForFunction(()=>document.querySelector('#playStatus')?.textContent?.includes('双击已发送'),null,{timeout:15000});
  await page.locator('#screen_container canvas').tap({position:{x:20,y:20}});
  await page.waitForFunction(()=>document.querySelector('#playStatus')?.textContent?.includes('左键点击已发送'),null,{timeout:15000});
  console.log('WebKit iPhone-like KolibriOS left/double/tap mouse events sent.');
  await page.screenshot({path:'/tmp/ly-os-webkit-kolibri.png',fullPage:true});
}catch(e){
  console.error('WebKit mobile boot FAILED:',e.message);
  console.error('State:',await page.locator('#machineStatus').textContent().catch(()=>'?'));
  console.error('Browser errors:',errors.slice(-10));
  console.error('Failed requests:',failures.slice(-10));
  console.error('Screen:',(await page.locator('#screen_container').textContent().catch(()=>''))?.slice(-800));
  console.error('Error box:',await page.locator('#errorMessage').textContent().catch(()=>'?'));
  await page.screenshot({path:'/tmp/ly-os-webkit-error.png',fullPage:true}).catch(()=>{});
  process.exitCode=1;
}finally{await browser.close()}

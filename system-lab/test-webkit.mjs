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

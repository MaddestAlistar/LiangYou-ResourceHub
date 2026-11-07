import { chromium } from 'playwright';
const profile=process.argv[2] || 'android';
if(!['android','reactos'].includes(profile))throw Error('Unsupported smoke profile');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1366,height:900}});
const errors=[],failed=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('requestfailed',r=>failed.push(r.url().slice(0,180)+' '+r.failure()?.errorText));
try{
 await page.goto('http://127.0.0.1:8765/system-lab/',{waitUntil:'domcontentloaded'});
 await page.locator('[data-launch="'+profile+'"]').click();
 await page.waitForFunction(()=>/虚拟机运行中|图形模式已出现|启动未完成/.test(document.querySelector('#machineStatus')?.textContent||''),null,{timeout:150000});
 const status=await page.locator('#machineStatus').textContent();
 console.log(profile,'engine state:',status);
 if(status.includes('启动未完成'))throw Error('Engine did not start '+await page.locator('#errorMessage').textContent());
 // Reaching the BIOS text or running the virtual CPU is not a usable OS.
 // Require the graphics canvas to actually switch to display mode.
 await page.waitForFunction(()=>{
   const cv=document.querySelector('#screen_container canvas');
   return !!cv && getComputedStyle(cv).display!=='none' && cv.width>=320 && cv.height>=200;
 },null,{timeout:180000});
 const state=await page.locator('#screen_container').evaluate(el=>({text:el.textContent.slice(-500),canvas:el.querySelector('canvas')?.width,canvasHeight:el.querySelector('canvas')?.height,screenVisible:getComputedStyle(el).display!=='none'}));
 console.log(profile,'graphical mode appeared (not necessarily desktop):',state);
 if(!state.screenVisible)throw Error('Display hidden');
 if(errors.length)throw Error('Page errors: '+errors.join(';'));
 console.log(profile,'smoke test passed: graphics mode shown, full desktop remains unverified');
 await page.screenshot({path:'/tmp/ly-'+profile+'-boot.png',fullPage:true});
}catch(e){
 console.error(profile,'SMOKE FAILED:',e.message);
 console.error('status:',await page.locator('#machineStatus').textContent().catch(()=>'?'));
 console.error('errors:',errors.slice(-8));
 console.error('failed requests:',failed.slice(-20));
 console.error('loader error:',await page.locator('#errorMessage').textContent().catch(()=>'?'));
 await page.screenshot({path:'/tmp/ly-'+profile+'-failed.png',fullPage:true}).catch(()=>{});
 process.exitCode=1;
}finally{await browser.close()}

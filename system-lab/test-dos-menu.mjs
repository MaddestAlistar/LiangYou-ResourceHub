import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const err=[];page.on('pageerror',e=>err.push(e.message));
const snapshot=async(name)=>{
 const s=await page.locator('#screen_container').evaluate(el=>({text:el.textContent,canvas:el.querySelector('canvas')?.width,visible:getComputedStyle(el).display}));
 console.log('SCREEN',name,JSON.stringify(s).slice(0,8500));
 await page.screenshot({path:'/tmp/dos-'+name+'.png',fullPage:true});
};
try{
 await page.goto('http://127.0.0.1:8765/system-lab/',{waitUntil:'domcontentloaded'});
 await page.locator('[data-launch="freedos"]').click();
 await page.waitForFunction(()=>/A:\\>/.test(document.querySelector('#screen_container')?.textContent||''),null,{timeout:90000});
 await snapshot('boot');
 const send=async(text)=>page.evaluate(async text=>{
   await window.__dosLabDebug.sendText(text);
 },text);
 // Only inspect published DOM controls and current screen; no direct emulator access needed.
 await page.locator('[data-command="minesw~1"]').click();
 await page.waitForTimeout(1600);
 await snapshot('mine-menu');
 await page.locator('#typeText').fill('1');
 await page.locator('#sendText').click();
 await page.waitForTimeout(500);
 await snapshot('mine-choice-1');
 await page.locator('#sendEnter').click();
 await page.waitForTimeout(1500);
 await snapshot('mine-choice-enter');
 await page.locator('#restart').click();
 await page.waitForTimeout(2700);
 await snapshot('reboot');
 await page.locator('[data-command="tetris"]').click();
 await page.waitForTimeout(1200);
 await snapshot('tetris');
 await page.locator('#padEsc').click();
 await page.waitForTimeout(800);
 await snapshot('tetris-esc');
}catch(e){console.error('PROBE FAILED',e.message);console.log('pageerrors',err);process.exitCode=1}
finally{await browser.close()}

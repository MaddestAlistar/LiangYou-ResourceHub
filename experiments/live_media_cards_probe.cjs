const fs=require('node:fs');
const {chromium}=require('/tmp/media-probe/node_modules/playwright-core');
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const targets=[["药屋少女的呢喃","tmdb-tv-220542"],["复仇者联盟5","tmdb-movie-1003596"]];
  const report=[];
  for(const [name,id] of targets){
    const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
    const row={title:name,id};
    try{
      const url='https://maddestalistar.github.io/LiangYou-ResourceHub/?film='+encodeURIComponent(id)+'#media';
      const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:40000});
      row.http=r?.status();
      await page.waitForTimeout(12000);
      const dialog=page.locator('#media-dialog');
      row.dialogOpen=await dialog.evaluate(el=>el.open);
      row.currentTitle=await page.locator('#media-dialog-title').textContent().catch(()=>null);
      if(row.dialogOpen){
        await page.locator('button[data-mi-detail="discover"]').click({timeout:8000});
        await page.waitForTimeout(23000);
        row.videoCardCount=await page.locator('#media-dialog .mi-trailer-card').count();
        row.platformTags=await page.locator('#media-dialog .mi-trailer-card .mi-trailer-tags').allTextContents();
        row.cardTitles=await page.locator('#media-dialog .mi-trailer-card .mi-trailer-body strong').allTextContents();
        row.sectionPreview=(await page.locator('#media-dialog .mi-videos-block').innerText().catch(()=>''))?.slice(0,600);
        row.status=await page.locator('#media-dialog .mi-trailer-state').textContent().catch(()=>null);
      }
      const d=await page.evaluate(async()=>{
        const a=await fetch('./data/media-extra-videos.json',{cache:'no-cache'});
        const doc=await a.json();
        return {status:a.status,updatedAt:doc.updatedAt,cachedItems:Object.keys(doc.items||{}).length};
      }).catch(e=>({error:String(e)}));
      row.cache=d;
    }catch(e){row.error=String(e).slice(0,300)}
    row.errors=errors.slice(0,15);
    console.log('PAGE_UI_RESULT',JSON.stringify(row).slice(0,3000));
    report.push(row);
    fs.writeFileSync('media-live-ui-probe.json',JSON.stringify(report,null,2));
    await context.close();
  }
  await browser.close();
})().catch(e=>{console.error('FATAL',String(e));process.exitCode=1});

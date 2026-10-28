/* LiangYou media-toolkit: streaming via JustWatch/TMDB, local tracking,
   Letterboxd export, and MovieClaw self-hosting guidance.
   No personal account tokens or tracking data leave this browser. */
(function(){
  "use strict";
  var root=document.getElementById("media"),dialog=document.getElementById("media-dialog");
  if(!root||!dialog)return;
  var current=null,controller=null;
  var regions={US:"美国 US",GB:"英国 GB",JP:"日本 JP",KR:"韩国 KR",HK:"香港 HK",TW:"台湾 TW",SG:"新加坡 SG",CA:"加拿大 CA",AU:"澳大利亚 AU",DE:"德国 DE",FR:"法国 FR",IN:"印度 IN",CN:"中国大陆 CN"};
  var region="US";
  var escape=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});};
  var english=function(){return document.documentElement.lang.toLowerCase().indexOf("en")===0;};
  var t=function(c,e){return english()?e:c;};
  function saveAs(name,content,type){
    var blob=new Blob([content],{type:type}),target=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=target;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(target);},4000);
  }
  function csvCell(s){var a=String(s==null?"":s);return '"'+a.replace(/"/g,'""')+'"';}
  function exportData(){
    var list=(window.LiangYouWatchlist?.entries()||[]).filter(x=>x.work.kind==='movie');
    if(!list.length){alert(t('片单中没有电影。','No movies in your list.'));return;}
    var rows=['tmdbID,imdbID,Title,Year'];
    list.forEach(x=>{var w=x.work;rows.push([( /^tmdb-movie-(\d+)$/.exec(w.id)||[])[1]||'',w.imdb_id||'',w.original_title||w.title,(w.date||'').slice(0,4)].map(csvCell).join(','));});
    saveAs('liangyou-letterboxd-import.csv','\ufeff'+rows.join('\r\n'),'text/csv;charset=utf-8');
  }
  function stamp(v){const d=new Date(v);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat(english()?'en-GB':'zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' (UTC+8)':'—';}
  function regionLabel(code){return regions[code]||code;}
  function renderOfferList(rows){
    if(!Array.isArray(rows)||!rows.length)return "";
    var dedupe={};
    return rows.filter(function(x){return x&&typeof x.name==="string"&&Number.isInteger(x.id);}).filter(function(x){if(dedupe[x.id])return false;dedupe[x.id]=1;return true;})
      .map(function(x){return '<span class="mtk-provider">'+escape(x.name)+'</span>';}).join("");
  }
  function renderProviders(data){
    if(!data||data.ok!==true||!data.providers)return t("查询结果暂不可用。","Availability unavailable.");
    var labels=[["subscription",t("订阅","Subscription")],["free",t("免费","Free")],["ads",t("含广告","Ad-supported")],["rent",t("租赁","Rent")],["buy",t("购买","Buy")]];
    var rows=labels.map(function(o){var pills=renderOfferList(data.providers[o[0]]);return pills?'<div class="mtk-group"><b>'+o[1]+'</b><div class="mtk-providers">'+pills+"</div></div>":"";}).filter(Boolean);
    var link=data.detailPage&&/^https:\/\/www\.themoviedb\.org\//.test(data.detailPage)
      ?'<a href="'+escape(data.detailPage)+'" target="_blank" rel="noopener noreferrer">'+t("查看 TMDB 地区渠道","Open regional providers on TMDB")+'</a>':"";
    if(!rows.length)return '<p class="mi-caption">'+t("此地区暂未找到可用渠道，不代表影片无法观看。","No listed providers in this region. Availability can differ.")+"</p>"+link;
    return rows.join("")+'<p class="mi-caption">'+t("来源：JustWatch（通过 TMDB）；仅显示平台，不是直接播放链接。","Source: JustWatch via TMDB; listings are not direct playback links.")+"</p>"+link;
  }
  async function loadProviders(detail,selected){
    var pane=dialog.querySelector(".mtk-provider-result");
    if(!pane)return;
    if(controller)controller.abort();
    if(!Number.isSafeInteger(Number(detail.tmdbId))||Number(detail.tmdbId)<1||!["movie","tv"].includes(detail.kind)){
      pane.textContent=t("这条资料尚未匹配 TMDB 影片 ID，不能准确查询播放渠道。","No verified TMDB ID for this title.");return;
    }
    var thisController=new AbortController();controller=thisController;
    pane.textContent=t("正在核对该地区的观看渠道…","Checking regional availability…");
    var timeout=setTimeout(function(){thisController.abort();},12000);
    try{
      var endpoint="https://liangyou-streaming-availability.maddestalistar.workers.dev/api/"+detail.kind+"/"+detail.tmdbId+"?region="+selected;
      var resp=await fetch(endpoint,{signal:thisController.signal});
      if(!resp.ok)throw new Error("http_"+resp.status);
      var obj=await resp.json();
      if(!obj||obj.tmdbId!==Number(detail.tmdbId)||obj.region!==selected||obj.type!==detail.kind)throw new Error("wrong_id");
      if(controller!==thisController)return;
      pane.innerHTML=renderProviders(obj);
    }catch(e){
      if(controller!==thisController)return;
      pane.innerHTML='<p class="mi-caption">'+t("暂时无法读取该地区渠道，请参考上方 Watchmode 数据或访问 TMDB。","Regional lookup unavailable; see Watchmode above or visit TMDB.")+'</p>';
    }finally{clearTimeout(timeout);}
  }
  function display(info){
    if(controller)controller.abort();
    if(!info||!info.id||!info.title||info.section!=="watch")return;
    current={
      id:String(info.id),title:String(info.title),originalTitle:String(info.originalTitle||""),
      tmdbId:Number.isSafeInteger(Number(info.tmdbId))&&Number(info.tmdbId)>0?Number(info.tmdbId):null,
      imdbId:/^tt\d{5,12}$/.test(String(info.imdbId||""))?String(info.imdbId):"",
      year:String(info.year||"").slice(0,4),
      kind:info.kind==="tv"?"tv":"movie"
    };
    var old=dialog.querySelector(".mi-toolkit");if(old)old.remove();
    var anchor=dialog.querySelector(".mi-detail-content");if(!anchor)return;
    var panel=document.createElement("section");panel.className="mi-toolkit mi-detail-block";
    var letterQuery=encodeURIComponent((current.originalTitle||current.title).trim());
    var lb="https://letterboxd.com/search/films/"+letterQuery+"/";
    panel.innerHTML=
      '<h3>'+t("观影工具箱","Watch toolkit")+'</h3>'+
      '<div class="mtk-stream">'+
      '<div class="mtk-heading"><b>'+t("在哪个平台看","Where to watch")+'</b><label>'+t("地区","Region")+
      ' <select class="mtk-region" aria-label="'+t("切换播放地区","Choose region")+'">'+Object.keys(regions).map(function(code){return '<option value="'+code+'"'+(code===region?' selected':'')+'>'+escape(regionLabel(code))+'</option>';}).join("")+'</select></label></div>'+
      '<div class="mtk-provider-result" aria-live="polite"></div><p class="mi-caption">'+t("渠道来源：JustWatch via TMDB · 地区可能不同","Provider data: JustWatch via TMDB · Varies by region")+'</p></div>'+
      '<details class="mtk-details"><summary>'+t("影视社区与自建媒体库","Community & self-hosted media")+'</summary>'+
      '<p class="mi-caption">'+t("Letterboxd 已能通过现有 MDBList 获取部分评分；此处提供精准标题检索与清单导出。","Letterboxd ratings are available for some titles via MDBList. Search and CSV export are separate features.")+'</p>'+
      '<div class="mtk-links"><button type="button" data-mtk-export="csv">'+t('导出片单为 Letterboxd CSV','Export list to Letterboxd CSV')+'</button><a href="'+escape(lb)+'" target="_blank" rel="noopener noreferrer">Letterboxd '+t("搜索","search")+'</a>'+
      '<a href="https://movieclaw.io/en/docs/overview" target="_blank" rel="noopener noreferrer">MovieClaw '+t("媒体服务器说明","server guide")+'</a>'+
      '<a href="https://github.com/movieclaw/movieclaw" target="_blank" rel="noopener noreferrer">MovieClaw GitHub</a></div>'+
      '<p class="mi-caption">'+t("MovieClaw 需独立 Docker / NAS 及私人授权；这里尚未连接你的媒体库，不会自动订阅或下载。","MovieClaw needs your own Docker/NAS instance and authorization; it is not connected here.")+'</p>'+
      '</details>';
    anchor.prepend(panel);
    loadProviders(current,region);
  }
  dialog.addEventListener("close",()=>{if(controller)controller.abort();});
  // Source-ID research lives in the actual film dossier, not on a second page.
  // Research answers are deliberately NOT promoted to canonical ratings without a verified ID mapping.
  const maoyan='https://liangyou-maoyan-verified.maddestalistar.workers.dev';
  const extraRatings='https://liangyou-extra-ratings-lab.maddestalistar.workers.dev';
  const cnAggregate='https://liangyou-taopiaopiao-lab.maddestalistar.workers.dev';
  const ratingPaths={
    kitsu:'/api/kitsu/anime/',bilibili:'/api/bilibili/season/',
    filmarks:'/api/filmarks/movie/',simkl:'/api/simkl/',
    maoyan:'/api/movie/',mydramalist:'/api/mydramalist/drama/','cn-aggregate':'/api/movie/'
  };
  async function requestJSON(endpoint){const r=await fetch(endpoint,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('unavailable');return r.json();}
  function displayRatings(info){
    if(!info||!['ratings','boxoffice'].includes(info.section))return;
    const section=dialog.querySelector(info.section==='ratings'?'.mi-ratings-section':'.mi-detail-content .mi-detail-block');
    if(!section)return;
    const research=document.createElement('details');research.className='mtk-details mtk-rating-research';
    research.innerHTML=
      '<summary>'+t('手动核对其他来源（可选）','Manual lookup for unmatched sources (optional)')+'</summary>'+
      '<p class="mi-caption">'+t('当前作品：','Current title: ')+'<b>'+escape(info.title)+'</b> · '+t('已能匹配的评分会自动显示；未匹配时才需要手动输入原站 ID。','Verified matches appear automatically; only unmatched sources need a manual source ID.')+'</p>'+
      '<form id="mtk-lookup"><label>'+t('评分平台','Rating source')+
      '<select id="mtk-rating-source" aria-label="'+t('评分平台','Rating source')+'">'+
      '<option value="simkl">Simkl</option><option value="kitsu">Kitsu</option><option value="bilibili">Bilibili 番剧</option><option value="filmarks">Filmarks</option><option value="maoyan">猫眼 Maoyan</option><option value="mydramalist">MyDramaList</option><option value="cn-aggregate">豆瓣 / 猫眼 / 淘票票（第三方汇总）</option></select></label>'+
      '<label>'+t('原站作品 ID','Source title ID')+'<input id="mtk-rating-id" inputmode="numeric" pattern="[1-9][0-9]{0,9}" maxlength="10" required placeholder="'+t('原站数字 ID','Original numeric ID')+'"></label>'+
      '<button type="submit">'+t('查询评分','Look up')+'</button></form>'+
      (info.kind==='movie'&&Number(info.year?.slice(0,4))>=2017&&Number(info.year?.slice(0,4))<=new Date().getFullYear()?'<button class="mtk-find-aggregate" type="button" data-mtk-find-year="'+escape(info.year.slice(0,4))+'" data-mtk-find-name="'+escape(info.title)+'">'+t('按片名与年份查找三站评分','Find aggregated scores by title & year')+'</button><div class="mtk-find-results" aria-live="polite"></div>':'')+
      '<p class="mi-caption">'+t('各站 ID 不通用；三站汇总是第三方页面数据，未获各平台官方独立验证，年度检索仅覆盖前300名。','IDs are not interchangeable. The three-platform aggregation is third-party data, not independently verified with official platforms. Yearly search covers only the top 300.')+'</p>'+
      '<div id="mtk-rating-result" aria-live="polite"></div>';
    if(info.section==='ratings')section.appendChild(research);
    const ranking=document.createElement('details');ranking.className='mtk-details mtk-rankings';
    ranking.innerHTML='<summary>'+t('中国内地累计票房榜','China all-time box office ranking')+'</summary>'+
      '<p class="mi-caption">'+t('独立榜单，与本片评分无关。','Separate chart, not this title’s rating.')+'</p>'+
      '<button type="button" id="mtk-box">'+t('查看前十名','View top 10')+'</button><div id="mtk-box-result" aria-live="polite"></div>';
    if(info.section==='boxoffice')section.appendChild(ranking);
  }
  dialog.addEventListener('change',function(ev){
    if(ev.target.id!=='mtk-rating-source')return;
    const box=dialog.querySelector('#mtk-rating-id'),slug=ev.target.value==='mydramalist',aggregate=ev.target.value==='cn-aggregate';
    if(!box)return;
    box.value='';box.inputMode=slug?'text':'numeric';
    box.pattern=slug?'[1-9][0-9]{2,8}-[a-z0-9-]{2,100}':aggregate?'[0-9]{8,14}':'[1-9][0-9]{0,9}';
    box.maxLength=slug?110:aggregate?14:10;
    box.placeholder=slug?'58651-run-on':aggregate?'00102032025':t('原站数字 ID','Original numeric ID');
    const result=dialog.querySelector('#mtk-rating-result');if(result)result.textContent='';
  });
  dialog.addEventListener('submit',async function(ev){
    if(ev.target.id!=='mtk-lookup')return;
    ev.preventDefault();
    const scope=ev.target,id=scope.querySelector('#mtk-rating-id').value.trim(),provider=scope.querySelector('#mtk-rating-source').value;
    if(!ratingPaths[provider]||!(provider==='mydramalist'?/^[1-9]\d{2,8}-[a-z0-9-]{2,100}$/:provider==='cn-aggregate'?/^\d{8,14}$/:/^[1-9]\d{0,9}$/).test(id))return;
    const pane=scope.parentElement.querySelector('#mtk-rating-result'),btn=scope.querySelector('[type="submit"]');
    btn.disabled=true;pane.textContent=t('正在核对原站…','Checking source…');
    try{
      const data=await requestJSON((provider==='maoyan'?maoyan:provider==='cn-aggregate'?cnAggregate:extraRatings)+ratingPaths[provider]+encodeURIComponent(id));
      if(!pane.isConnected)return;
      if(provider==='cn-aggregate'){
        const values=data.ratings;
        if(data.code!==0||String(data.movieCode)!==id||!data.title||!values||!['maoyan','douban','taopiaopiao'].every(k=>values[k]===null||Number.isFinite(values[k])&&values[k]>=0&&values[k]<=10))throw Error('invalid');
        const labels=[['maoyan','猫眼'],['douban','豆瓣'],['taopiaopiao','淘票票']];
        pane.innerHTML='<p class="mi-caption">'+t('第三方汇总资料 · 需人工核对作品与上映时间','Third-party aggregation · verify title and release date')+'</p>'+
          '<b>'+escape(data.title)+'</b><p class="mi-caption">'+escape(data.releaseDescription||'')+'</p>'+
          '<div class="mtk-cn-ratings">'+labels.map(([key,label])=>'<div><span>'+label+'</span><strong>'+(values[key]===null?t('未收录','N/A'):escape(values[key])+'/10')+'</strong></div>').join('')+'</div>'+
          '<p class="mi-caption">'+escape(stamp(data.fetchedAt))+' · '+t('非豆瓣、猫眼、淘票票官方授权 API；不可直接并入上方评分。','Not an authorized API of the listed platforms; not auto-merged into canonical scores.')+'</p>'+
          (window.LiangYouMedia.safeURL(data.upstreamUrl)?'<a target="_blank" rel="noopener noreferrer" href="'+escape(data.upstreamUrl)+'">'+t('核对第三方原始页','Verify third-party source')+' ↗</a>':'');
        return;
      }
      const scale=provider==='maoyan'?10:data.scale;
      if(data.code!==0||String(data.id??data.movieId)!==id||![5,10,100].includes(scale)||data.rating!==null&&(!Number.isFinite(data.rating)||data.rating<0||data.rating>scale))throw Error('invalid');
      const link=window.LiangYouMedia.safeURL(data.pageUrl||data.sourceUrl);
      pane.innerHTML='<div class="mtk-rating-result-card"><b>'+escape(data.title||data.platform||provider)+'</b><strong>'+(data.rating===null?t('暂无评分','No rating'):escape(data.rating)+'/'+scale)+'</strong></div>'+
        '<p class="mi-caption">'+escape(data.platform||data.source||provider)+' · '+escape(stamp(data.verifiedSnapshotAt||data.fetchedAt))+
        (Number.isSafeInteger(data.ratingCount)?' · '+escape(data.ratingCount.toLocaleString())+t(' 人评分',' ratings'):'')+'</p>'+
        (link?'<a target="_blank" rel="noopener noreferrer" href="'+escape(link)+'">'+t('查看原站核对作品','Verify source title')+' ↗</a>':'')+
        '<p class="mi-caption">'+t('这是独立查询结果；确认作品一致后才能建立持久 ID 对照。','Independent result: persistent identity mapping requires confirmation.')+'</p>';
    }catch{if(pane.isConnected)pane.textContent=t('暂无法核实这个 ID，请核对作品或稍后重试。','Unable to verify this source ID. Check the title or try again.');}
    finally{btn.disabled=false;}
  });
  dialog.addEventListener('click',async function(ev){
    const chosen=ev.target.closest('[data-mtk-aggregate-code]');
    if(chosen){
      const scope=dialog.querySelector('#mtk-lookup'),source=scope?.querySelector('#mtk-rating-source'),input=scope?.querySelector('#mtk-rating-id');
      if(!scope||!source||!input)return;
      source.value='cn-aggregate';source.dispatchEvent(new Event('change',{bubbles:true}));
      input.value=chosen.dataset.mtkAggregateCode;
      scope.requestSubmit();return;
    }
    const find=ev.target.closest('.mtk-find-aggregate');
    if(find){
      const pane=find.parentElement.querySelector('.mtk-find-results'),year=find.dataset.mtkFindYear,name=find.dataset.mtkFindName;
      if(!/^20[12][0-9]$/.test(year)||!name)return;
      find.disabled=true;pane.textContent=t('正在核对年度榜单…','Checking yearly leaderboard…');
      try{
        const d=await requestJSON(cnAggregate+'/api/search?year='+year+'&name='+encodeURIComponent(name));
        if(!pane.isConnected)return;
        if(d.code!==0||d.query!==name||String(d.year)!==year||!Array.isArray(d.data))throw Error('invalid');
        pane.innerHTML=d.data.length?d.data.filter(x=>/^\d{8,14}$/.test(String(x.movieCode||''))).slice(0,5).map(x=>'<button type="button" class="mtk-aggregate-choice" data-mtk-aggregate-code="'+escape(x.movieCode)+'">'+escape(x.title)+' · '+escape(x.movieCode)+'</button>').join(''):'<p class="mi-caption">'+t('年度前300名未找到精确同名作品，不代表影片不存在。','No exact-title match within yearly top 300.')+'</p>';
      }catch{if(pane.isConnected)pane.textContent=t('第三方年度检索暂不可用。','Third-party lookup unavailable.');}
      finally{find.disabled=false;}
      return;
    }
    if(ev.target.id!=='mtk-box')return;
    const btn=ev.target,pane=btn.parentElement.querySelector('#mtk-box-result');
    btn.disabled=true;pane.textContent=t('读取票房榜单…','Loading box office…');
    try{
      const data=await requestJSON(maoyan+'/api/rankings/alltime');
      if(!pane.isConnected)return;
      const rows=data.data?.slice(0,10);
      if(data.code!==0||!rows?.length||rows.some(x=>!x.title||!Number.isSafeInteger(x.movieId)||x.cumulativeBoxOffice?.unit!=='万元'||!Number.isFinite(x.cumulativeBoxOffice.value)))throw Error('invalid');
      pane.innerHTML='<ol class="mtk-box-list">'+rows.map(x=>'<li><a target="_blank" rel="noopener noreferrer" href="https://m.maoyan.com/asgard/movie/'+x.movieId+'">'+escape(x.title)+'</a><b>'+escape((x.cumulativeBoxOffice.value/10000).toFixed(2))+t(' 亿元',' ×100M CNY')+'</b></li>').join('')+'</ol>'+
        '<p class="mi-caption">'+t('猫眼公开榜单快照 · ','Maoyan public ranking snapshot · ')+escape(stamp(data.fetchedAt))+'</p>';
    }catch{if(pane.isConnected)pane.textContent=t('票房数据暂不可用。','Box office unavailable.');}
    finally{btn.disabled=false;}
  });
  root.addEventListener("liangyou:media-detail",function(ev){display(ev.detail);displayRatings(ev.detail);});
  dialog.addEventListener("change",function(ev){
    if(!ev.target.matches(".mtk-region"))return;
    region=ev.target.value in regions?ev.target.value:"US";
    if(current)loadProviders(current,region);
  });
  dialog.addEventListener("click",function(ev){
    var ex=ev.target.closest("[data-mtk-export]");
    if(ex)exportData(ex.dataset.mtkExport);
  });
})();

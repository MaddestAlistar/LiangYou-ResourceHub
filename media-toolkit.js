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
  const explorer=document.createElement('details');explorer.className='mtk-details';
  root.querySelector('.mi-health').before(explorer);
  function explorerUI(){
    explorer.innerHTML='<summary>'+t('票房与更多平台口碑','Box office & more ratings')+'</summary><p class="mi-caption">'+t('独立来源查询，不与作品档案自动合并。实验接口可能暂时不可用。','Independent lookups, not automatically merged into title profiles. Experimental sources may be unavailable.')+'</p><button type="button" id="mtk-box">'+t('查看中国内地累计票房前十','China all-time box office · Top 10')+'</button><div id="mtk-box-result" aria-live="polite"></div><form id="mtk-lookup"><label>'+t('评分平台','Rating source')+' <select id="mtk-rating-source"><option value="kitsu">Kitsu</option><option value="bilibili">Bilibili 番剧</option><option value="filmarks">Filmarks</option><option value="simkl">Simkl</option><option value="maoyan">猫眼 Maoyan</option></select></label><label>'+t('原站作品 ID','Original source title ID')+' <input id="mtk-rating-id" inputmode="numeric" pattern="[1-9][0-9]{0,9}" maxlength="10" required placeholder="'+t('输入原站数字 ID','Enter source numeric ID')+'"></label><button type="submit">'+t('查询评分','Look up rating')+'</button></form><p class="mi-caption">'+t('每个平台的 ID 不同。请核对返回片名；不要填写其他平台的 ID。Filmarks、猫眼为公开网页实验来源。','IDs differ by platform. Verify the returned title. Filmarks and Maoyan use experimental public-page sources.')+'</p><div id="mtk-rating-result" aria-live="polite"></div>';
  }
  explorerUI();
  async function requestJSON(endpoint){const r=await fetch(endpoint,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('unavailable');return r.json();}
  const maoyan='https://liangyou-maoyan-verified.maddestalistar.workers.dev';
  explorer.addEventListener('click',async ev=>{
    if(ev.target.id!=='mtk-box')return;
    const b=ev.target,pane=explorer.querySelector('#mtk-box-result');b.disabled=true;pane.textContent=t('读取票房快照…','Loading box office…');
    try{const d=await requestJSON(maoyan+'/api/rankings/alltime');
      const rows=d.data?.slice(0,10);if(d.code!==0||!rows?.length||rows.some(x=>!x.title||!Number.isSafeInteger(x.movieId)||x.cumulativeBoxOffice?.unit!=='万元'||!Number.isFinite(x.cumulativeBoxOffice.value)))throw Error('invalid');
      pane.innerHTML='<ol class="mtk-box-list">'+rows.map(x=>'<li><a target="_blank" rel="noopener noreferrer" href="https://m.maoyan.com/asgard/movie/'+x.movieId+'">'+escape(x.title)+'</a><b>'+escape((x.cumulativeBoxOffice.value/10000).toFixed(2))+t(' 亿元',' ×100M CNY')+'</b></li>').join('')+'</ol><p class="mi-caption">'+t('猫眼公开总榜快照 · 抓取于 ','Maoyan public ranking snapshot · Fetched ')+escape(stamp(d.fetchedAt))+'</p>';
    }catch{pane.textContent=t('票房源暂不可用，请稍后重试。','Box office unavailable. Please retry later.');}finally{b.disabled=false;}
  });
  explorer.addEventListener('submit',async ev=>{
    ev.preventDefault();const id=explorer.querySelector('#mtk-rating-id').value.trim(),provider=explorer.querySelector('#mtk-rating-source').value;
    if(!/^[1-9]\d{0,9}$/.test(id))return;
    const paths={kitsu:'/api/kitsu/anime/',bilibili:'/api/bilibili/season/',filmarks:'/api/filmarks/movie/',simkl:'/api/simkl/',maoyan:'/api/movie/'};
    if(!paths[provider])return;
    const pane=explorer.querySelector('#mtk-rating-result'),b=explorer.querySelector('[type="submit"]');b.disabled=true;pane.textContent=t('核对来源中…','Checking source…');
    try{const d=await requestJSON((provider==='maoyan'?maoyan:'https://liangyou-extra-ratings-lab.maddestalistar.workers.dev')+paths[provider]+id);
      const scale=provider==='maoyan'?10:d.scale;
      if(d.code!==0||String(d.id??d.movieId)!==id||![5,10,100].includes(scale)||d.rating!==null&&(!Number.isFinite(d.rating)||d.rating<0||d.rating>scale))throw Error('invalid');
      const source=window.LiangYouMedia.safeURL(d.pageUrl||d.sourceUrl);
      pane.innerHTML='<p><b>'+escape(d.title||provider+' #'+id)+'</b> · '+(d.rating===null?t('暂无评分','No rating'):escape(d.rating)+' / '+scale)+'</p><p class="mi-caption">'+escape(d.platform||d.source)+' · '+escape(stamp(d.verifiedSnapshotAt||d.fetchedAt))+(Number.isSafeInteger(d.ratingCount)?' · '+d.ratingCount+t(' 人评分',' ratings'):'')+'</p>'+(source?'<a target="_blank" rel="noopener noreferrer" href="'+escape(source)+'">'+t('核对原站作品 ↗','Verify on source ↗')+'</a>':'');
    }catch{pane.textContent=t('无法核实此 ID 的评分，请核对原站或稍后重试。','Could not verify this ID. Check the source or retry later.');}finally{b.disabled=false;}
  });
  new MutationObserver(explorerUI).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  root.addEventListener("liangyou:media-detail",function(ev){display(ev.detail);});
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

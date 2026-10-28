/* LiangYou media-toolkit: streaming via JustWatch/TMDB, local tracking,
   Letterboxd export, and MovieClaw self-hosting guidance.
   No personal account tokens or tracking data leave this browser. */
(function(){
  "use strict";
  var root=document.getElementById("media"),dialog=document.getElementById("media-dialog");
  if(!root||!dialog)return;
  var current=null,controller=null,records={};
  var KEY="liangyou:media-watchlist:v1";
  var regions={US:"美国 US",GB:"英国 GB",JP:"日本 JP",KR:"韩国 KR",HK:"香港 HK",TW:"台湾 TW",SG:"新加坡 SG",CA:"加拿大 CA",AU:"澳大利亚 AU",DE:"德国 DE",FR:"法国 FR",IN:"印度 IN",CN:"中国大陆 CN"};
  var region="US";
  var escape=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});};
  var english=function(){return document.documentElement.lang.toLowerCase().indexOf("en")===0;};
  var t=function(c,e){return english()?e:c;};
  function read(){
    try{
      var x=JSON.parse(localStorage.getItem(KEY)||"{}");
      return x&&typeof x==="object"&&!Array.isArray(x)?x:{};
    }catch(e){return {};}
  }
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(records));return true;}catch(e){return false;}}
  function saveAs(name,content,type){
    var blob=new Blob([content],{type:type}),target=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=target;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(target);},4000);
  }
  function csvCell(s){var a=String(s==null?"":s);return '"'+a.replace(/"/g,'""')+'"';}
  function exportData(kind){
    var list=Object.values(records).filter(function(x){return x&&typeof x==="object"&&x.id&&x.title;});
    if(!list.length){alert(t("目前还没有收藏记录。","Your local list is empty."));return;}
    if(kind==="json"){
      saveAs("liangyou-watchlist.json",JSON.stringify({format:"LiangYou Local Watchlist v1",exportedAt:new Date().toISOString(),items:list},null,2),"application/json;charset=utf-8");
    }else{
      var rows=["tmdbID,imdbID,Title,Year"];
      list.filter(function(x){return x.kind==="movie";}).forEach(function(x){
        rows.push([x.tmdbId||"",x.imdbId||"",x.title||"",x.year||""].map(csvCell).join(","));
      });
      if(rows.length===1){alert(t("当前收藏没有电影，Letterboxd CSV 只支持电影。","No movies in your watchlist. Letterboxd CSV supports movies only."));return;}
      saveAs("liangyou-letterboxd-import.csv","\ufeff"+rows.join("\r\n"),"text/csv;charset=utf-8");
    }
  }
  function titleKey(obj){return String(obj.kind||"movie")+":"+String(obj.tmdbId||obj.id||"");}
  function recordCount(){return Object.keys(records).filter(function(k){return records[k]&&records[k].status;}).length;}
  function refreshSavedUI(){
    var panel=dialog.querySelector(".mi-toolkit");if(!panel||!current)return;
    var x=records[titleKey(current)]||{};
    panel.querySelectorAll("[data-mtk-status]").forEach(function(b){
      b.setAttribute("aria-pressed",String(x.status===b.dataset.mtkStatus));
    });
    var status=panel.querySelector(".mtk-count");if(status)status.textContent=t("本机记录 ","Local items ")+recordCount()+t(" 部 · 不同步账号"," · not synced to apps");
  }
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
    if(!info||!info.id||!info.title)return;
    current={
      id:String(info.id),title:String(info.title),originalTitle:String(info.originalTitle||""),
      tmdbId:Number.isSafeInteger(Number(info.tmdbId))&&Number(info.tmdbId)>0?Number(info.tmdbId):null,
      imdbId:/^tt\d{5,12}$/.test(String(info.imdbId||""))?String(info.imdbId):"",
      year:String(info.year||"").slice(0,4),
      kind:info.kind==="tv"?"tv":"movie"
    };
    var old=dialog.querySelector(".mi-toolkit");if(old)old.remove();
    var anchor=dialog.querySelector(".mi-detail-head");if(!anchor)return;
    var panel=document.createElement("section");panel.className="mi-toolkit mi-detail-block";
    var letterQuery=encodeURIComponent((current.originalTitle||current.title).trim());
    var lb="https://letterboxd.com/search/films/"+letterQuery+"/";
    panel.innerHTML=
      '<h3>'+t("观影工具箱","Watch toolkit")+'</h3>'+
      '<div class="mtk-stream">'+
      '<div class="mtk-heading"><b>'+t("在哪个平台看","Where to watch")+'</b><label>'+t("地区","Region")+
      ' <select class="mtk-region" aria-label="'+t("切换播放地区","Choose region")+'">'+Object.keys(regions).map(function(code){return '<option value="'+code+'"'+(code===region?' selected':'')+'>'+escape(regionLabel(code))+'</option>';}).join("")+'</select></label></div>'+
      '<div class="mtk-provider-result" aria-live="polite"></div><p class="mi-caption">'+t("渠道来源：JustWatch via TMDB · 地区可能不同","Provider data: JustWatch via TMDB · Varies by region")+'</p></div>'+
      '<details class="mtk-details"><summary>'+t("想看 · 在看 · 已看（借鉴 Sofa Time / Showly）","Watchlist · Watching · Watched (inspired by Sofa Time / Showly)")+'</summary>'+
      '<p class="mi-caption">'+t("仅保存到本机浏览器，不会同步 Sofa Time、Showly、Trakt 或其他账号。","Stored only on this device; no account sync.")+'</p>'+
      '<div class="mtk-statuses">'+
      '<button type="button" data-mtk-status="watchlist">'+t("想看","Watchlist")+'</button>'+
      '<button type="button" data-mtk-status="watching">'+t("在看","Watching")+'</button>'+
      '<button type="button" data-mtk-status="watched">'+t("已看","Watched")+'</button>'+
      '<button type="button" data-mtk-status="remove">'+t("清除","Remove")+'</button></div>'+
      '<p class="mi-caption mtk-count"></p>'+
      '<div class="mtk-links"><button type="button" data-mtk-export="json">'+t("导出 JSON","Export JSON")+'</button>'+
      '<button type="button" data-mtk-export="csv">'+t("导出 Letterboxd CSV","Export Letterboxd CSV")+'</button></div></details>'+
      '<details class="mtk-details"><summary>'+t("影视社区与自建媒体库","Community & self-hosted media")+'</summary>'+
      '<p class="mi-caption">'+t("Letterboxd 已能通过现有 MDBList 获取部分评分；此处提供精准标题检索与清单导出。","Letterboxd ratings are available for some titles via MDBList. Search and CSV export are separate features.")+'</p>'+
      '<div class="mtk-links"><a href="'+escape(lb)+'" target="_blank" rel="noopener noreferrer">Letterboxd '+t("搜索","search")+'</a>'+
      '<a href="https://movieclaw.io/en/docs/overview" target="_blank" rel="noopener noreferrer">MovieClaw '+t("媒体服务器说明","server guide")+'</a>'+
      '<a href="https://github.com/movieclaw/movieclaw" target="_blank" rel="noopener noreferrer">MovieClaw GitHub</a></div>'+
      '<p class="mi-caption">'+t("MovieClaw 需独立 Docker / NAS 及私人授权；这里尚未连接你的媒体库，不会自动订阅或下载。","MovieClaw needs your own Docker/NAS instance and authorization; it is not connected here.")+'</p>'+
      '</details>';
    anchor.insertAdjacentElement("afterend",panel);
    refreshSavedUI();loadProviders(current,region);
  }
  records=read();
  root.addEventListener("liangyou:media-detail",function(ev){display(ev.detail);});
  dialog.addEventListener("change",function(ev){
    if(!ev.target.matches(".mtk-region"))return;
    region=ev.target.value in regions?ev.target.value:"US";
    if(current)loadProviders(current,region);
  });
  dialog.addEventListener("click",function(ev){
    var status=ev.target.closest("[data-mtk-status]");
    if(status&&current){
      var key=titleKey(current),next=status.dataset.mtkStatus;
      if(next==="remove")delete records[key];
      else records[key]={id:current.id,kind:current.kind,title:current.title,
        tmdbId:current.tmdbId,imdbId:current.imdbId,year:current.year,status:next,updatedAt:new Date().toISOString()};
      if(!persist())alert(t("本机浏览器不允许保存记录，可尝试关闭无痕模式。","Your browser could not save this list."));
      refreshSavedUI();return;
    }
    var ex=ev.target.closest("[data-mtk-export]");
    if(ex)exportData(ex.dataset.mtkExport);
  });
})();

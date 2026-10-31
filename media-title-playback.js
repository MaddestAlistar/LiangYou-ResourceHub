/* Per-title playback: no global search, no media proxy, lazy playback on click.
   The upstream API must validate TMDB identity and media signatures. */
(()=>{
"use strict";
const root=document.getElementById("media"),dialog=document.getElementById("media-dialog");
if(!root||!dialog)return;
const ENDPOINT="https://liangyou-title-playback.maddestalistar.workers.dev";
let active=null,controller=null,serial=0,video=null,hls=null,jsHls=null;
let pendingSwitch=null,stallTimer=null,lastProgress=0;
const en=()=>document.documentElement.lang.toLowerCase().startsWith("en");
const t=(a,b)=>en()?b:a;
const tr=s=>String(s??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const idValid=info=>/^[a-z][a-z0-9-]{2,90}$/.test(String(info?.id||""))&&
 String(info?.title||"").trim().length>=2&&["movie","tv","anime"].includes(info?.kind);
const canonical=info=>/^tmdb-(movie|tv)-([1-9]\d{0,9})$/.exec(String(info?.id||""));
function seasonFromTitle(title){
 const m=String(title||"").match(/第\s*([一二三四五六七八九十\d]+)\s*季|\bseason\s*(\d+)\b/i);
 if(!m){
  const trailing=String(title||"").match(/\s([2-9]|[1-5]\d)$/);
  return trailing?Number(trailing[1]):1;
 }
 const n=m[1]||m[2],zh={一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
 return /^\d+$/.test(n)?Number(n):(zh[n]||1);
}
function route(mode,info,episode){
 const m=canonical(info);
 const url=new URL(ENDPOINT+(m?"/api/"+mode+"/"+m[1]+"/"+m[2]:
   "/api/"+mode+"/work/"+encodeURIComponent(info.id)));
 url.searchParams.set("season",String(info.season));
 if(episode!=null)url.searchParams.set("episode",String(episode));
 if(!m){
   url.searchParams.set("kind",info.kind);
   url.searchParams.set("title",info.title);
   url.searchParams.set("original",info.originalTitle||"");
   url.searchParams.set("year",info.year||"");
 }
 return url.toString();
}
function sameIdentity(body,info){
 return body?.kind===info.kind&&body?.workId===info.id&&
  (canonical(info)?Number(body.tmdbId)===Number(info.tmdbId):body.tmdbId===null);
}
const inRange=(x,max)=>Number.isSafeInteger(Number(x))&&Number(x)>=1&&Number(x)<=max;
function clearPlayback(){
 serial++;
 if(stallTimer){clearTimeout(stallTimer);stallTimer=null;}
 controller?.abort();controller=null;
 if(video){video.pause();video.removeAttribute("src");video.load();video=null;}
 if(hls){try{hls.destroy();}catch{}hls=null;}
}
function card(){
 return dialog.querySelector(".mtk-playback");
}
function showStatus(message,style=""){
 const p=card()?.querySelector(".mtk-playback-status");
 if(p){p.textContent=message;p.dataset.state=style;}
}
function saveSelection(){
 if(!active)return;
 try{sessionStorage.setItem("liangyou:playback:"+active.id,JSON.stringify({season:active.season,episode:active.episode}));}catch{}
}
function restoreSelection(info){
 try{const v=JSON.parse(sessionStorage.getItem("liangyou:playback:"+info.id)||"null");
  return {season:inRange(v?.season,60)?Number(v.season):1,episode:inRange(v?.episode,3000)?Number(v.episode):1};}
 catch{return {season:1,episode:1};}
}
function playbackPlaceholder(info,caption){
 const title=String(info?.title||"");
 const now=info?.kind==="movie"?title:title+" · "+episodeLabel(info?.episode||1);
 return '<div class="mtk-playback-placeholder">'+
  '<button type="button" class="mtk-playback-start mtk-playback-symbol" disabled aria-label="'+
  tr(t("播放当前作品","Play this title"))+'" title="'+tr(t("点击播放","Tap to play"))+'">'+
  '<span aria-hidden="true">▶</span></button>'+
  '<span class="mtk-playback-now">'+tr(now)+'</span>'+
  '<small>'+tr(caption)+'</small></div>';
}
function playbackHtml(info){
 return '<section class="mtk-playback mi-detail-block" data-mtk-playback-id="'+tr(info.id)+'">'+
  '<div class="mtk-playback-head"><h3>'+t("影视播放","Play this title")+'</h3>'+
  '<span class="mtk-playback-identity">'+t("自动匹配当前作品","Matched per title")+'</span></div>'+
  '<div class="mtk-playback-screen">'+playbackPlaceholder(info,
    t("正在核对可用的视频资源","Checking available video resources"))+'</div>'+
  '<div class="mtk-playback-controls" hidden><label class="mtk-playback-season-row">'+t("选择季度","Season")+
  ' <select class="mtk-playback-season" aria-label="'+t("选择季度","Choose season")+'"></select></label>'+
  '<div class="mtk-playback-episode-head"><strong>'+t("选集","Episodes")+'</strong>'+
  '<div class="mtk-playback-pages"></div></div><div class="mtk-playback-episodes" role="group" aria-label="'+t("选择集数","Select episode")+'"></div></div>'+
  '<div class="mtk-playback-actions" hidden><button type="button" class="mtk-playback-retry">'+
  t("重新匹配","Retry match")+'</button></div>'+
  '<p class="mtk-playback-status" role="status" aria-live="polite">'+t("正在查找本片对应的播放资源…","Finding this title’s stream…")+'</p>'+
  '</section>';
}
function episodeLabel(n){return t("第 "+n+" 集","Episode "+n);}
function renderEpisodes(){
 const box=card(),info=active;if(!box||!info)return;
 const controls=box.querySelector(".mtk-playback-controls");
 controls.hidden=info.kind==="movie"||!info.episodes.length;
 const seasonRow=box.querySelector(".mtk-playback-season-row"),seasonSelect=box.querySelector(".mtk-playback-season");
 if(info.kind==="tv"){
  const options=info.seasons?.length?info.seasons:
    info.fixedSeason?[{number:info.season}]:[{number:1},{number:2},{number:3},{number:4},{number:5}];
  seasonSelect.innerHTML=options.map(s=>'<option value="'+s.number+'"'+(s.number===info.season?" selected":"")+">"+
    t("第 "+s.number+" 季","Season "+s.number)+"</option>").join("");
  seasonRow.hidden=options.length<2;
 }
 const count=info.episodes.length,pageCount=Math.ceil(count/48);
 info.page=Math.min(Math.max(0,info.page||0),Math.max(0,pageCount-1));
 const visible=info.episodes.slice(info.page*48,info.page*48+48);
 box.querySelector(".mtk-playback-episodes").innerHTML=visible.map(n=>
   '<button type="button" data-mtk-episode="'+n+'" aria-pressed="'+(n===info.episode)+'">'+
     (n===info.episode?"▶ ":"")+episodeLabel(n)+'</button>').join("");
 const nav=box.querySelector(".mtk-playback-pages");
 nav.innerHTML=pageCount<=1?"":'<button type="button" data-mtk-page="-1"'+(info.page===0?" disabled":"")+'>‹</button>'+
  '<span>'+(info.page+1)+" / "+pageCount+'</span>'+
  '<button type="button" data-mtk-page="1"'+(info.page>=pageCount-1?" disabled":"")+'>›</button>';
 boxAction(info.episodes.includes(info.episode));
 const txt=box.querySelector(".mtk-playback-now");
 if(txt)txt.textContent=info.kind==="movie"?info.title:info.title+" · "+episodeLabel(info.episode);
}
function resetStage(){
 pendingSwitch=null;lastProgress=0;
 const screen=card()?.querySelector(".mtk-playback-screen");
 if(!screen||!active)return;
 screen.innerHTML=playbackPlaceholder(active,t("点击画面中央的按钮播放","Tap the center play button"));
}
async function json(url,signal){
 const r=await fetch(url,{signal,mode:"cors",credentials:"omit",cache:"no-store"});
 const body=await r.json().catch(()=>null);
 if(!r.ok||!body)throw Error("unavailable");
 return body;
}
async function lookup(){
 if(!active||!card())return;
 const info=active;
 clearPlayback();
 const ac=new AbortController();controller=ac;
 const reqId=++serial;
 showStatus(t("正在匹配当前作品…","Matching this title…"));
 const stage=card()?.querySelector(".mtk-playback-screen");
 if(stage)resetStage();
 const url=route("title",info);
 try{
  const body=await json(url,ac.signal);
  if(!active||active!==info||serial!==reqId||!card())return;
  if(body.ok!==true||!sameIdentity(body,info)||body.season!==info.season)
   throw Error("identity_mismatch");
  info.seasons=Array.isArray(body.seasons)?body.seasons.filter(s=>inRange(s?.number,60)).slice(0,45):[];
  info.episodes=Array.isArray(body.episodes)?[...new Set(body.episodes.filter(e=>inRange(e,3000)).map(Number))].sort((a,b)=>a-b):[];
  if(info.episodes.length&&!info.episodes.includes(info.episode))info.episode=info.episodes[0];
  info.page=Math.max(0,Math.floor(Math.max(0,info.episodes.indexOf(info.episode))/48));
  renderEpisodes();saveSelection();
  if(body.status==="matched"&&info.episodes.length){
   boxAction(true);
   showStatus(t("已匹配当前作品，点击画面中央的播放按钮。","Title matched. Tap the center play button."),"success");
  }else{
   boxAction(false);
   showStatus(body.status==="no_match"?t("暂未匹配到这部作品的播放资源。","No matching stream found for this title."):
     t("当前没有可验证的播放资源。","No verified playback resource is currently available."),"empty");
  }
 }catch(e){
  if(ac.signal.aborted||serial!==reqId||active!==info)return;
  boxAction(false);
  showStatus(t("播放资源暂时无法查询，不影响其他影视资料。","Playback lookup is temporarily unavailable."),"error");
 }
}
function boxAction(ready){
 const pane=card(),play=pane?.querySelector(".mtk-playback-start"),
   actions=pane?.querySelector(".mtk-playback-actions"),retry=pane?.querySelector(".mtk-playback-retry");
 if(play){
  play.disabled=!ready;
  play.setAttribute("aria-label",ready?
    t("播放当前作品","Play this title"):
    t("正在匹配播放资源","Checking playback availability"));
 }
 if(actions)actions.hidden=ready;
 if(retry)retry.hidden=ready;
}
let hlsPromise=null;
async function loadHls(){
 if(window.Hls?.isSupported?.())return window.Hls;
 if(!hlsPromise)hlsPromise=(async()=>{
  for(const src of ["https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js",
                   "https://unpkg.com/hls.js@1.7.3/dist/hls.min.js"]){
   try{
    await new Promise((resolve,reject)=>{
     const s=document.createElement("script");s.src=src;s.async=true;
     const timer=setTimeout(()=>{s.remove();reject(Error("timeout"));},8000);
     s.onload=()=>{clearTimeout(timer);resolve();};s.onerror=()=>{clearTimeout(timer);s.remove();reject(Error("load"));};
     document.head.appendChild(s);
    });
    if(window.Hls?.isSupported?.())return window.Hls;
   }catch{}
  }
  throw Error("hls_unavailable");
 })().catch(e=>{hlsPromise=null;throw e;});
 return hlsPromise;
}
function safeStream(media){
 try{
  const u=new URL(media?.url);
  if(u.protocol!=="https:"||u.username||u.password||!["mp4","hls"].includes(media?.format))return null;
  if(!/\.(?:m3u8|mp4|mov)(?:[?#]|$)/i.test(u.href))return null;
  return u.href;
 }catch{return null;}
}
function tryInvisibleSwitch(key,token,playing,attempt,failed,why){
 if(serial!==token||!active||attempt>=2)return false;
 const category=["primary","jianpian","aggregate"].includes(key)?key:null;
 if(!category)return false;
 const seen=new Set(failed);
 if(seen.has(category))return false;
 seen.add(category);
 const position=Number.isFinite(playing?.currentTime)?playing.currentTime:0;
 pendingSwitch={attempt:attempt+1,failed:[...seen],resumeAt:Math.max(0,position,lastProgress||0)};
 showStatus(t("当前线路不稳定，正在自动切换…","Stream unstable. Switching automatically…"));
 // Do not reload the website or reveal any source-selection UI.
 startPlayback();
 return true;
}
async function startPlayback(){
 if(!active||!card()||!active.episodes.includes(active.episode))return;
 const info=active;
 const plan=pendingSwitch||{attempt:0,failed:[],resumeAt:0};
 pendingSwitch=null;
 if(plan.attempt===0)lastProgress=0;
 clearPlayback();
 const ac=new AbortController();controller=ac;
 const token=++serial;
 const b=card().querySelector(".mtk-playback-start");
 if(b)b.disabled=true;
 showStatus(t("正在获取当前集的播放地址…","Resolving this episode’s stream…"));
 const target=new URL(route("play",info,info.episode));
 if(plan.failed.length)target.searchParams.set("skip",plan.failed.join(","));
 const url=target.toString();
 try{
  const body=await json(url,ac.signal);
  if(ac.signal.aborted||serial!==token||active!==info||!card())return;
  if(body?.status==="no_verified_stream")throw Error("no_verified_stream");
  if(body.ok!==true||body.status!=="ready"||!sameIdentity(body,info)||
    body.season!==info.season||body.episode!==info.episode)throw Error("wrong_episode");
  const src=safeStream(body.media);if(!src)throw Error("bad_media");
  const screen=card().querySelector(".mtk-playback-screen");
  screen.replaceChildren();
  const v=document.createElement("video");video=v;v.controls=true;v.playsInline=true;v.preload="metadata";
  v.setAttribute("webkit-playsinline","");v.setAttribute("aria-label",info.title+" "+episodeLabel(info.episode));
  const sourceKey=body.media.sourceKey;
  v.addEventListener("timeupdate",()=>{
    if(serial===token&&v.currentTime>0)lastProgress=v.currentTime;
  });
  v.addEventListener("loadedmetadata",()=>{
    if(serial!==token)return;
    const position=Number(plan.resumeAt)||0;
    if(position>0&&Number.isFinite(v.duration)&&v.duration>position+1){
      try{v.currentTime=position;}catch{}
    }
  },{once:true});
  v.addEventListener("waiting",()=>{
    if(serial!==token||v.paused||v.seeking)return;
    if(stallTimer)clearTimeout(stallTimer);
    stallTimer=setTimeout(()=>{
      stallTimer=null;
      if(serial===token&&!v.paused&&!v.seeking&&v.readyState<3)
        tryInvisibleSwitch(sourceKey,token,v,plan.attempt,plan.failed,"buffer");
    },12000);
  });
  v.addEventListener("playing",()=>{
    if(stallTimer){clearTimeout(stallTimer);stallTimer=null;}
  });
  v.addEventListener("error",()=>{
    if(serial!==token)return;
    if(!tryInvisibleSwitch(sourceKey,token,v,plan.attempt,plan.failed,"video_error"))
      showStatus(t("视频加载失败，已无法继续切换线路。","Playback failed and no further fallback is available."),"error");
  });
  screen.appendChild(v);
  if(body.media.format==="hls"&&!v.canPlayType("application/vnd.apple.mpegurl")){
   if(body.media.cors!==true)throw Error("cors");
   const Hls=await loadHls();
   if(serial!==token||!v.isConnected)return;
   hls=new Hls({enableWorker:true,maxBufferLength:20});
   hls.on(Hls.Events.ERROR,(_,data)=>{
    if(data?.fatal&&serial===token){
      if(!tryInvisibleSwitch(sourceKey,token,v,plan.attempt,plan.failed,"hls_error"))
        showStatus(t("当前视频线路不可用，请稍后重试。","Playback is unavailable. Please try again later."),"error");
    }
   });
   hls.loadSource(src);hls.attachMedia(v);
  }else v.src=src;
  if(serial===token){
   showStatus(t("已加载播放地址，视频由浏览器直连片源服务器。","Stream loaded directly in your browser."),"success");
   v.play().catch(()=>{showStatus(t("点击视频中的播放按钮开始观看。","Tap the video play control to start."));});
  }
 }catch(e){
  if(ac.signal.aborted||serial!==token||active!==info)return;
  resetStage();
  boxAction(info.episodes.includes(info.episode));
  const unavailable=e?.message==="no_verified_stream";
  showStatus(unavailable?
    t(plan.attempt>0?"已自动检查其他线路，暂时都不可播放。":"已找到作品和集数，但当前没有通过验证的可播放线路，请稍后重试。",
      plan.attempt>0?"Alternate streams were also unavailable.":"Title and episode matched, but no playable stream passed verification. Try again later."):
    t("这集暂时无法播放，可能是线路、浏览器或网络限制。","This episode could not play due to a source, browser or network issue."),"error");
 }finally{if(serial===token&&b)b.disabled=false;}
}
function mount(info){
 clearPlayback();
 document.querySelectorAll("#media-dialog .mtk-playback").forEach(x=>x.remove());
 active=null;
 if(info?.section!=="watch"||!idValid(info))return;
 const toolkit=dialog.querySelector(".mi-toolkit");
 const anchor=toolkit?.querySelector(".mtk-details:last-of-type");
 if(!toolkit)return;
 const remembered=restoreSelection(info);
 const canonicalId=canonical(info),kind=canonicalId?canonicalId[1]:info.kind==="movie"?"movie":"tv";
 const inferredSeason=seasonFromTitle(info.title);
 const fixedSeason=!canonicalId&&inferredSeason>1;
 active={id:String(info.id),title:String(info.title||""),originalTitle:String(info.originalTitle||""),
  year:String(info.year||"").slice(0,4),kind,tmdbId:canonicalId?Number(canonicalId[2]):null,
  season:kind==="movie"?1:fixedSeason?inferredSeason:remembered.season,
  episode:kind==="movie"?1:remembered.episode,fixedSeason,
  episodes:[],seasons:[],page:0};
 const wrap=document.createElement("div");wrap.innerHTML=playbackHtml(active);
 const node=wrap.firstElementChild;
 if(anchor)anchor.insertAdjacentElement("afterend",node);else toolkit.appendChild(node);
 lookup();
}
root.addEventListener("liangyou:media-detail",e=>mount(e.detail));
dialog.addEventListener("close",()=>{clearPlayback();active=null;});
dialog.addEventListener("change",e=>{
 if(!e.target.matches(".mtk-playback-season")||!active)return;
 const n=Number(e.target.value);if(!inRange(n,60)||n===active.season)return;
 active.season=n;active.episode=1;active.page=0;active.episodes=[];saveSelection();lookup();
});
dialog.addEventListener("click",e=>{
 if(!active)return;
 const ep=e.target.closest("[data-mtk-episode]");
 if(ep&&inRange(ep.dataset.mtkEpisode,3000)){
  clearPlayback();active.episode=Number(ep.dataset.mtkEpisode);saveSelection();renderEpisodes();resetStage();
  boxAction(true);
  showStatus(t("已选好集数，点击画面中央的播放按钮。","Episode selected. Tap the center play button."));return;
 }
 const page=e.target.closest("[data-mtk-page]");
 if(page){const n=Number(page.dataset.mtkPage);active.page=Math.max(0,active.page+(n===1?1:-1));renderEpisodes();return;}
 if(e.target.closest(".mtk-playback-start"))startPlayback();
 if(e.target.closest(".mtk-playback-retry"))lookup();
});
})();

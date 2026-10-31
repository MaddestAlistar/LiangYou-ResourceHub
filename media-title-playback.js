/* Per-title playback: no global search, no media proxy, lazy playback on click.
   The upstream API must validate TMDB identity and media signatures. */
(()=>{
"use strict";
const root=document.getElementById("media"),dialog=document.getElementById("media-dialog");
if(!root||!dialog)return;
const ENDPOINT="https://liangyou-title-playback.maddestalistar.workers.dev";
let active=null,controller=null,serial=0,video=null,hls=null,jsHls=null;
const en=()=>document.documentElement.lang.toLowerCase().startsWith("en");
const t=(a,b)=>en()?b:a;
const tr=s=>String(s??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const idValid=info=>["movie","tv"].includes(info?.kind)&&Number.isSafeInteger(Number(info?.tmdbId))&&
 Number(info.tmdbId)>0&&/^tmdb-(?:movie|tv)-[1-9]\d{0,9}$/.test(String(info.id||""));
const inRange=(x,max)=>Number.isSafeInteger(Number(x))&&Number(x)>=1&&Number(x)<=max;
function clearPlayback(){
 serial++;
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
function playbackHtml(info){
 return '<section class="mtk-playback mi-detail-block" data-mtk-playback-id="'+tr(info.id)+'">'+
  '<div class="mtk-playback-head"><h3>'+t("影视播放","Play this title")+'</h3>'+
  '<span class="mtk-playback-identity">'+t("自动匹配当前作品","Matched per title")+'</span></div>'+
  '<div class="mtk-playback-screen"><div class="mtk-playback-placeholder">'+
  '<span class="mtk-playback-symbol" aria-hidden="true">▶</span>'+
  '<span class="mtk-playback-now">'+tr(info.title)+'</span>'+
  '<small>'+t("正在核对可用的视频资源","Checking available video resources")+'</small></div></div>'+
  '<div class="mtk-playback-controls" hidden><label class="mtk-playback-season-row">'+t("选择季度","Season")+
  ' <select class="mtk-playback-season" aria-label="'+t("选择季度","Choose season")+'"></select></label>'+
  '<div class="mtk-playback-episode-head"><strong>'+t("选集","Episodes")+'</strong>'+
  '<div class="mtk-playback-pages"></div></div><div class="mtk-playback-episodes" role="group" aria-label="'+t("选择集数","Select episode")+'"></div></div>'+
  '<div class="mtk-playback-actions"><button type="button" class="mtk-playback-start" disabled>'+
  '▶ '+t("站内播放","Play here")+'</button><button type="button" class="mtk-playback-retry" hidden>'+
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
  const options=info.seasons?.length?info.seasons:[{number:info.season}];
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
 box.querySelector(".mtk-playback-start").disabled=!info.episodes.includes(info.episode);
 const txt=box.querySelector(".mtk-playback-now");
 if(txt)txt.textContent=info.kind==="movie"?info.title:info.title+" · "+episodeLabel(info.episode);
}
function resetStage(){
 const screen=card()?.querySelector(".mtk-playback-screen");
 if(!screen||!active)return;
 screen.innerHTML='<div class="mtk-playback-placeholder"><span class="mtk-playback-symbol" aria-hidden="true">▶</span>'+
  '<span class="mtk-playback-now">'+tr(active.title)+'</span>'+
  '<small>'+t("选择集数后播放","Select an episode and press play")+'</small></div>';
}
async function json(url,signal){
 const r=await fetch(url,{signal,mode:"cors",credentials:"omit",cache:"no-store"});
 const body=await r.json().catch(()=>null);
 if(!r.ok||!body)throw Error("unavailable");
 return body;
}
async function lookup(){
 if(!active||!card())return;
 const info=active,token=++serial;
 controller?.abort();const ac=new AbortController();controller=ac;
 clearPlayback(); // increments serial; preserve the post-cleanup serial below
 const reqId=++serial;
 showStatus(t("正在匹配当前作品…","Matching this title…"));
 const stage=card()?.querySelector(".mtk-playback-screen");
 if(stage)resetStage();
 const url=ENDPOINT+"/api/title/"+info.kind+"/"+info.tmdbId+"?season="+info.season;
 try{
  const body=await json(url,ac.signal);
  if(!active||active!==info||serial!==reqId||!card())return;
  if(body.ok!==true||body.kind!==info.kind||body.tmdbId!==info.tmdbId||body.season!==info.season)
   throw Error("identity_mismatch");
  info.seasons=Array.isArray(body.seasons)?body.seasons.filter(s=>inRange(s?.number,60)).slice(0,45):[];
  info.episodes=Array.isArray(body.episodes)?[...new Set(body.episodes.filter(e=>inRange(e,3000)).map(Number))].sort((a,b)=>a-b):[];
  if(info.episodes.length&&!info.episodes.includes(info.episode))info.episode=info.episodes[0];
  info.page=Math.max(0,Math.floor(Math.max(0,info.episodes.indexOf(info.episode))/48));
  renderEpisodes();saveSelection();
  if(body.status==="matched"&&info.episodes.length){
   boxAction(true);
   showStatus(t("已匹配当前作品，请选择集数后点击播放。","Title matched. Select an episode, then press play."),"success");
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
 const b=card()?.querySelector(".mtk-playback-start"),retry=card()?.querySelector(".mtk-playback-retry");
 if(b)b.disabled=!ready;
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
async function startPlayback(){
 if(!active||!card()||!active.episodes.includes(active.episode))return;
 const info=active;
 clearPlayback();const ac=new AbortController();controller=ac,token=++serial;
 const b=card().querySelector(".mtk-playback-start");
 if(b)b.disabled=true;
 showStatus(t("正在获取当前集的播放地址…","Resolving this episode’s stream…"));
 const url=ENDPOINT+"/api/play/"+info.kind+"/"+info.tmdbId+"?season="+info.season+"&episode="+info.episode;
 try{
  const body=await json(url,ac.signal);
  if(ac.signal.aborted||serial!==token||active!==info||!card())return;
  if(body.ok!==true||body.status!=="ready"||body.kind!==info.kind||
    body.tmdbId!==info.tmdbId||body.season!==info.season||body.episode!==info.episode)throw Error("wrong_episode");
  const src=safeStream(body.media);if(!src)throw Error("bad_media");
  const screen=card().querySelector(".mtk-playback-screen");
  screen.replaceChildren();
  const v=document.createElement("video");video=v;v.controls=true;v.playsInline=true;v.preload="metadata";
  v.setAttribute("webkit-playsinline","");v.setAttribute("aria-label",info.title+" "+episodeLabel(info.episode));
  v.addEventListener("error",()=>{
   if(serial===token)showStatus(t("视频加载失败，请尝试重新播放或切换集数。","Stream failed. Retry or switch episode."),"error");
  });
  screen.appendChild(v);
  if(body.media.format==="hls"&&!v.canPlayType("application/vnd.apple.mpegurl")){
   if(body.media.cors!==true)throw Error("cors");
   const Hls=await loadHls();
   if(serial!==token||!v.isConnected)return;
   hls=new Hls({enableWorker:true,maxBufferLength:20});
   hls.on(Hls.Events.ERROR,(_,data)=>{
    if(data?.fatal&&serial===token)showStatus(t("当前 HLS 视频播放失败，请更换集数。","This HLS stream could not play."),"error");
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
  showStatus(t("暂时无法播放这集，可能是线路失效或浏览器限制。","This episode is unavailable or blocked by the browser."),"error");
 }finally{if(serial===token&&b)b.disabled=false;}
}
function mount(info){
 clearPlayback();
 document.querySelectorAll("#media-dialog .mtk-playback").forEach(x=>x.remove());
 if(info?.section!=="watch"||!idValid(info))return;
 const toolkit=dialog.querySelector(".mi-toolkit");
 const anchor=toolkit?.querySelector(".mtk-details:last-of-type");
 if(!toolkit)return;
 const remembered=restoreSelection(info);
 active={id:String(info.id),title:String(info.title||""),kind:info.kind,tmdbId:Number(info.tmdbId),
  season:info.kind==="movie"?1:remembered.season,episode:info.kind==="movie"?1:remembered.episode,
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
  showStatus(t("已选择对应集数，点击播放。","Episode selected. Press play."));return;
 }
 const page=e.target.closest("[data-mtk-page]");
 if(page){const n=Number(page.dataset.mtkPage);active.page=Math.max(0,active.page+(n===1?1:-1));renderEpisodes();return;}
 if(e.target.closest(".mtk-playback-start"))startPlayback();
 if(e.target.closest(".mtk-playback-retry"))lookup();
});
})();

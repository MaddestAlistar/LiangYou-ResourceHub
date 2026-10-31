/* Lightweight danmaku overlay for the existing per-title video element.
   Off by default; load only after a user turns it on. No third-party script CDN. */
(()=>{
"use strict";
const root=document.getElementById("media"),dialog=document.getElementById("media-dialog");
if(!root||!dialog)return;
const BASE="https://liangyou-title-playback.maddestalistar.workers.dev";
const PREFERENCE="liangyou:media:danmaku-enabled";
const POSITIVE_CACHE="liangyou:media:danmaku-verified-v2";
const POSITIVE_TTL=48*60*60*1000;
function verifiedKey(info){
 return [info?.id,info?.kind,info?.title,info?.season,info?.episode].join("|");
}
function readVerified(info){
 try{
  const entries=JSON.parse(localStorage.getItem(POSITIVE_CACHE)||"{}");
  const value=Number(entries[verifiedKey(info)]);
  return Number.isFinite(value)&&value>0&&Date.now()-value<POSITIVE_TTL;
 }catch{return false;}
}
function saveVerified(info,positive){
 try{
  const now=Date.now(),key=verifiedKey(info);
  const entries=JSON.parse(localStorage.getItem(POSITIVE_CACHE)||"{}");
  const current=entries&&typeof entries==="object"&&!Array.isArray(entries)?entries:{};
  for(const [k,v] of Object.entries(current)){
   if(!Number.isFinite(Number(v))||now-Number(v)>POSITIVE_TTL)delete current[k];
  }
  if(positive)current[key]=now;else delete current[key];
  const trimmed=Object.entries(current).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,100);
  localStorage.setItem(POSITIVE_CACHE,JSON.stringify(Object.fromEntries(trimmed)));
 }catch{}
}
const MAX_DISPLAY=120,SETTINGS_KEY="liangyou:media:danmaku-settings";
const DEFAULT_SETTINGS={rows:4,position:"top",opacity:70};
const allowedPositions=["top","middle","bottom"];
const clamp=(n,min,max,fallback)=>Number.isFinite(Number(n))?
  Math.max(min,Math.min(max,Math.round(Number(n)))):fallback;
function sanitizeSettings(value){
 return {rows:clamp(value?.rows,1,8,4),
   position:allowedPositions.includes(value?.position)?value.position:"top",
   opacity:clamp(value?.opacity,20,100,70)};
}
let enabled=false,session=null,settingsOptions={...DEFAULT_SETTINGS};
try{
 enabled=localStorage.getItem(PREFERENCE)==="1";
 settingsOptions=sanitizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)||"null"));
}catch{}
const en=()=>document.documentElement.lang.toLowerCase().startsWith("en");
const t=(zh,english)=>en()?english:zh;
function pathFor(info){
 const url=new URL(BASE+"/api/danmaku/work/"+encodeURIComponent(info.id));
 for(const [name,value] of Object.entries({kind:info.kind,title:info.title,original:info.originalTitle||"",
   year:info.year||"",season:info.season,episode:info.episode}))
   url.searchParams.set(name,String(value));
 return url.href;
}
function indexNear(entries,time){
 let left=0,right=entries.length;
 while(left<right){const mid=(left+right)>>1;
  if(entries[mid].time<time)left=mid+1;else right=mid;}
 return left;
}
function removeItems(state){
 state.area.replaceChildren();
 state.live=[];
 state.lane=0;
 state.lineTimes=[];
}
function showText(state,message){
 state.button.title=message;
 state.button.setAttribute("aria-label",message);
}
function setButton(state){
 // A failed or slow upstream check must never hide the entire player toolbar.
 state.controls.hidden=false;
 state.button.hidden=!state.available;
 state.gear.hidden=!state.available;
 state.status.hidden=state.available;
 state.retry.hidden=state.available||state.checking;
 if(!state.available)state.status.textContent=state.checking?
   t("正在检测弹幕…","Checking danmaku…"):
   state.statusReason==="empty"?
    t("本集暂无弹幕","No danmaku for this episode"):
    t("弹幕暂不可用","Danmaku unavailable");
 const on=state.enabled,loading=state.loading;
 state.button.textContent=t("弹幕 ","Danmaku ")+(on?t("开","On"):t("关","Off"));
 state.button.setAttribute("aria-pressed",String(on));
 state.button.dataset.loading=loading?"true":"false";
 showText(state,loading?t("正在获取本集弹幕","Loading episode danmaku"):
   t(on?"关闭弹幕":"开启弹幕",on?"Turn off danmaku":"Turn on danmaku"));
}
function removeNode(state,node){
 node.remove();state.live=state.live.filter(x=>x!==node);
}
function renderItem(state,item){
 const video=state.video,opts=state.options;
 const rows=opts.rows;
 if(!state.enabled||!video||!video.isConnected||state.live.length>=Math.max(3,rows*3))return;
 // Limit overlap in the same row without forcing every comment to render.
 const now=performance.now?.()||Date.now(),interval=item.mode===1?2300:3800;
 let lane=-1;
 for(let n=0;n<rows;n++){
  const index=(state.lane+n)%rows;
  if(now-(state.lineTimes[index]??-Infinity)>=interval){lane=index;break;}
 }
 if(lane<0)return;
 state.lane=(lane+1)%rows;
 state.lineTimes[lane]=now;
 const span=document.createElement("span");
 span.className="mtk-danmaku-item "+(item.mode===4?"mtk-danmaku-bottom":item.mode===5?
   "mtk-danmaku-top":"mtk-danmaku-scroll");
 span.textContent=item.text;
 span.style.color="#"+Number(item.color).toString(16).padStart(6,"0");
 const spacing=7.2,height=(rows-1)*spacing;
 const start=opts.position==="bottom"?84-height:
   opts.position==="middle"?50-height/2:9;
 span.style.top=(Math.max(4,start+lane*spacing))+"%";
 state.area.appendChild(span);state.live.push(span);
 span.addEventListener("animationend",()=>removeNode(state,span),{once:true});
 if(item.mode!==1)setTimeout(()=>removeNode(state,span),4300);
}
function applySettings(state,persist){
 state.options={...settingsOptions};
 state.area.style.setProperty("--mtk-danmaku-opacity",String(state.options.opacity/100));
 if(persist){
  try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settingsOptions));}catch{}
  // Clear old lanes, but preserve the selected episode and playback position.
  seek(state);
 }
}
function seek(state){
 removeItems(state);
 state.cursor=indexNear(state.entries,Math.max(0,(state.video.currentTime||0)-.15));
 state.lastTime=Number(state.video.currentTime)||0;
}
function update(state){
 if(!state.enabled||!state.entries.length||state.video.paused)return;
 const now=Number(state.video.currentTime)||0;
 if(Math.abs(now-state.lastTime)>3)seek(state);
 let fired=0;
 while(state.cursor<state.entries.length&&state.entries[state.cursor].time<=now+.25&&fired<MAX_DISPLAY){
  const item=state.entries[state.cursor++];
  if(item.time>=now-1.5)renderItem(state,item);
  fired++;
 }
 state.lastTime=now;
}
async function probe(state,attempt=0){
 state.probeAbort?.abort();
 const ac=new AbortController();state.probeAbort=ac;
 state.checking=true;setButton(state);
 try{
  const res=await fetch(pathFor(state.info)+"&check=1",
    {mode:"cors",credentials:"omit",cache:"default",signal:ac.signal});
  const body=await res.json();
  if(ac.signal.aborted||state!==session)return;
  const verified=!!(res.ok&&body?.ok===true&&body?.status==="ready"&&
    body?.workId===state.info.id&&body?.kind===state.info.kind&&
    body?.season===state.info.season&&body?.episode===state.info.episode&&
    Number(body?.count)>0);
  const definitelyEmpty=res.ok&&body?.ok===true&&body?.status==="empty"&&
    body?.workId===state.info.id&&body?.kind===state.info.kind&&
    body?.season===state.info.season&&body?.episode===state.info.episode;
  if(verified){state.available=true;saveVerified(state.info,true);}
  else if(definitelyEmpty){state.available=false;saveVerified(state.info,false);}
  // A transient upstream failure must not erase a previously verified episode.
  state.statusReason=definitelyEmpty?"empty":"unavailable";
  if(!state.available&&body?.status==="unavailable"&&attempt===0)
   setTimeout(()=>{if(state===session&&state.video.isConnected)probe(state,1);},2700);
  if(state.available){
   // Prefer the web fullscreen button, which keeps the comment overlay visible.
   // iOS may ignore controlsList; native video fullscreen remains a platform limit.
   state.video.setAttribute("controlsList","nofullscreen");
  }
  setButton(state);
  if(state.available&&state.enabled)load(state);
 }catch{
  if(state===session&&!ac.signal.aborted){
   state.available=false;state.statusReason="unavailable";
   if(attempt===0)setTimeout(()=>{
    if(state===session&&state.video.isConnected)probe(state,1);
   },2700);
  }
 }finally{
  if(state===session&&!ac.signal.aborted){
   state.probeAbort=null;state.checking=false;setButton(state);
  }
 }
}
async function load(state){
 if(!state.enabled||!state.available||state.entries.length||state.loading)return;
 state.loading=true;setButton(state);
 const ac=new AbortController();state.abort=ac;
 try{
  const res=await fetch(pathFor(state.info),{mode:"cors",credentials:"omit",cache:"default",signal:ac.signal});
  const body=await res.json();
  if(ac.signal.aborted||state!==session)return;
  if(!res.ok||body?.ok!==true||body?.workId!==state.info.id||
     body?.kind!==state.info.kind||body?.season!==state.info.season||
     body?.episode!==state.info.episode)throw Error("invalid_danmaku");
  state.entries=Array.isArray(body.comments)?body.comments
   .filter(x=>x&&Number.isFinite(x.time)&&x.time>=0&&[1,4,5].includes(x.mode)&&
    Number.isInteger(x.color)&&typeof x.text==="string")
   .slice(0,3000).sort((a,b)=>a.time-b.time):[];
  seek(state);
  if(state.entries.length)saveVerified(state.info,true);
  else{
   state.available=false;state.statusReason="empty";
   saveVerified(state.info,false);
   setButton(state);
  }
 }catch(e){
  if(ac.signal.aborted||state!==session)return;
  state.entries=[];
  showText(state,t("弹幕暂不可用，可关闭后重试","Danmaku unavailable. Toggle off and retry."));
 }finally{
  if(state===session){state.loading=false;state.abort=null;setButton(state);}
 }
}
function exitWebFullscreen(state){
 if(!state)return;
 clearFullscreenHide(state);
 state.controls.classList.remove("mtk-danmaku-controls-hidden");
 state.controls.inert=false;
 const fullscreenElement=document.fullscreenElement||document.webkitFullscreenElement;
 if(fullscreenElement===state.screen){
  try{(document.exitFullscreen||document.webkitExitFullscreen)?.call(document);}catch{}
 }
 state.screen.classList.remove("mtk-danmaku-webfullscreen");
 if(state.controls.parentElement===state.screen)state.screen.after(state.controls);
 state.webFullscreen=false;
 state.fullscreen.setAttribute("aria-pressed","false");
 state.fullscreen.textContent="⛶";
 document.documentElement.classList.remove("mtk-danmaku-page-expanded");
}
function inWebFullscreen(state){
 return !!(state&&(state.webFullscreen||
   document.fullscreenElement===state.screen||document.webkitFullscreenElement===state.screen));
}
function clearFullscreenHide(state){
 if(state?.hideTimer!=null){clearTimeout(state.hideTimer);state.hideTimer=null;}
}
function hideFullscreenControls(state){
 state.hideTimer=null;
 if(state!==session||!inWebFullscreen(state)||
    state.controls.hidden||!state.settings.hidden)return;
 state.controls.classList.add("mtk-danmaku-controls-hidden");
 state.controls.inert=true;
}
function revealFullscreenControls(state){
 if(state!==session)return;
 clearFullscreenHide(state);
 state.controls.classList.remove("mtk-danmaku-controls-hidden");
 state.controls.inert=false;
 if(inWebFullscreen(state)&&state.settings.hidden&&!state.controls.hidden)
  state.hideTimer=setTimeout(()=>hideFullscreenControls(state),2800);
}
async function toggleWebFullscreen(state){
 if(state!==session)return;
 if(state.webFullscreen){exitWebFullscreen(state);return;}
 state.settings.hidden=true;
 state.gear.setAttribute("aria-expanded","false");
 // iPhone Safari's native *video* fullscreen cannot contain HTML overlays.
 // Use a viewport-filling web mode instead; tablet/desktop supports element fullscreen.
 const iphone=/iPhone|iPod/i.test(navigator.userAgent||"");
 // The toolbar lives below the video in normal mode, inside the screen in fullscreen.
 state.screen.appendChild(state.controls);
 if(!iphone&&(state.screen.requestFullscreen||state.screen.webkitRequestFullscreen)){
  try{
   await (state.screen.requestFullscreen||state.screen.webkitRequestFullscreen).call(state.screen);
   if(state!==session)return;
   state.webFullscreen=true;
   state.fullscreen.setAttribute("aria-pressed","true");
   state.fullscreen.textContent="↙";
   revealFullscreenControls(state);
   return;
  }catch{}
 }
 state.screen.classList.add("mtk-danmaku-webfullscreen");
 state.webFullscreen=true;
 state.fullscreen.setAttribute("aria-pressed","true");
 state.fullscreen.textContent="↙";
 document.documentElement.classList.add("mtk-danmaku-page-expanded");
 revealFullscreenControls(state);
}
document.addEventListener("fullscreenchange",()=>{
 if(session&&!document.fullscreenElement&&!document.webkitFullscreenElement&&session.webFullscreen&&
   !session.screen.classList.contains("mtk-danmaku-webfullscreen"))exitWebFullscreen(session);
});
document.addEventListener("keydown",e=>{
 if(e.key==="Escape"&&session?.webFullscreen&&
   session.screen.classList.contains("mtk-danmaku-webfullscreen"))exitWebFullscreen(session);
});
function destroy(){
 if(!session)return;
 session.screen.removeEventListener("pointerdown",session.onScreenTap,true);
 exitWebFullscreen(session);
 session.probeAbort?.abort();
 session.abort?.abort();
 session.area.replaceChildren();
 session.controls.remove();
 session.area.remove();
 session.video.removeAttribute("controlsList");
 session.video.removeEventListener("timeupdate",session.onTime);
 session.video.removeEventListener("seeked",session.onSeek);
 session.video.removeEventListener("pause",session.onPause);
 session.video.removeEventListener("play",session.onPlay);
 session=null;
}
function mount(video,info){
 destroy();
 if(!(video instanceof HTMLVideoElement)||!info?.id||!info?.title)return;
 const screen=video.parentElement;
 if(!screen||!screen.classList.contains("mtk-playback-screen"))return;
 const area=document.createElement("div");area.className="mtk-danmaku-overlay";
 area.setAttribute("aria-hidden","true");
 const controls=document.createElement("div");
 controls.className="mtk-danmaku-actions";controls.hidden=false;
 const button=document.createElement("button");button.type="button";
 button.className="mtk-danmaku-toggle";
 button.setAttribute("aria-label",t("开启弹幕","Turn on danmaku"));
 const fullscreen=document.createElement("button");fullscreen.type="button";
 fullscreen.className="mtk-danmaku-expand";
 fullscreen.textContent="⛶";
 fullscreen.title=t("网页全屏：保留弹幕，iPhone 原生全屏无法叠加网页弹幕",
  "Web fullscreen preserves comments; iPhone native fullscreen does not");
 fullscreen.setAttribute("aria-label",t("弹幕网页全屏","Fullscreen with danmaku"));
 const gear=document.createElement("button");gear.type="button";
 gear.className="mtk-danmaku-gear";gear.textContent="⚙";
 gear.title=t("设置弹幕行数、位置和透明度","Danmaku display settings");
 gear.setAttribute("aria-label",gear.title);gear.setAttribute("aria-expanded","false");
 const settings=document.createElement("div");
 settings.className="mtk-danmaku-settings";settings.hidden=true;
 const status=document.createElement("span");
 status.className="mtk-danmaku-status";status.setAttribute("role","status");
 const retry=document.createElement("button");retry.type="button";
 retry.className="mtk-danmaku-retry";
 retry.textContent="↻";
 retry.title=t("重新检查当前集弹幕","Check this episode for danmaku again");
 retry.setAttribute("aria-label",retry.title);
 const createRange=(label,min,max,step,value,suffix,property)=>{
  const row=document.createElement("label");row.className="mtk-danmaku-setting-row";
  const caption=document.createElement("span");caption.textContent=label;
  const count=document.createElement("output");count.textContent=value+suffix;
  const slider=document.createElement("input");slider.type="range";
  slider.min=String(min);slider.max=String(max);slider.step=String(step);slider.value=String(value);
  slider.setAttribute("aria-label",label);
  row.append(caption,slider,count);settings.appendChild(row);
  slider.addEventListener("input",()=>{
   const next=clamp(slider.value,min,max,value);count.textContent=next+suffix;
   settingsOptions=sanitizeSettings({...settingsOptions,[property]:next});
   applySettings(state,true);
  });
 };
 const state={video,screen,info:{...info},area,controls,button,fullscreen,gear,settings,status,retry,
   enabled,available:readVerified(info),checking:false,statusReason:"unavailable",
   entries:[],cursor:0,lastTime:0,webFullscreen:false,
   options:{...settingsOptions},lane:0,lineTimes:[],
   live:[],loading:false,abort:null,probeAbort:null,hideTimer:null};
 createRange(t("显示行数","Rows"),1,8,1,state.options.rows,t(" 行",""),"rows");
 const positionRow=document.createElement("label");positionRow.className="mtk-danmaku-setting-row";
 const positionCaption=document.createElement("span");positionCaption.textContent=t("显示位置","Position");
 const position=document.createElement("select");position.setAttribute("aria-label",positionCaption.textContent);
 for(const [value,zh,english] of [["top","上方","Top"],["middle","中间","Middle"],["bottom","下方","Bottom"]]){
  const option=document.createElement("option");option.value=value;option.textContent=t(zh,english);
  option.selected=value===state.options.position;position.appendChild(option);
 }
 positionRow.append(positionCaption,position);settings.appendChild(positionRow);
 position.addEventListener("change",()=>{
  settingsOptions=sanitizeSettings({...settingsOptions,position:position.value});
  applySettings(state,true);
 });
 createRange(t("弹幕透明度","Opacity"),20,100,10,state.options.opacity,"%", "opacity");
 controls.append(status,retry,button,gear,fullscreen,settings);
 screen.appendChild(area);
 screen.after(controls);
 applySettings(state,false);
 state.onTime=()=>update(state);
 state.onSeek=()=>seek(state);
 state.onPause=()=>screen.classList.add("mtk-danmaku-paused");
 state.onPlay=()=>screen.classList.remove("mtk-danmaku-paused");
 video.addEventListener("timeupdate",state.onTime);
 video.addEventListener("seeked",state.onSeek);
 video.addEventListener("pause",state.onPause);
 video.addEventListener("play",state.onPlay);
 button.addEventListener("click",()=>{
  if(!state.available)return;
  enabled=!state.enabled;state.enabled=enabled;
  try{localStorage.setItem(PREFERENCE,enabled?"1":"0");}catch{}
  if(!enabled){state.abort?.abort();state.abort=null;state.loading=false;removeItems(state);}
  else if(!state.entries.length)load(state);else seek(state);
  setButton(state);
 });
 retry.addEventListener("click",()=>probe(state,1));
 fullscreen.addEventListener("click",()=>toggleWebFullscreen(state));
 state.onScreenTap=event=>{
  if(!inWebFullscreen(state))return;
  // Tapping the video reveals controls; touching the toolbar extends visibility.
  revealFullscreenControls(state);
 };
 screen.addEventListener("pointerdown",state.onScreenTap,true);
 controls.addEventListener("pointerdown",()=>revealFullscreenControls(state));
 gear.addEventListener("click",()=>{
  settings.hidden=!settings.hidden;
  gear.setAttribute("aria-expanded",String(!settings.hidden));
  revealFullscreenControls(state);
 });
 session=state;setButton(state);
 probe(state);
}
document.addEventListener("liangyou:player-video",event=>{
 const {video,info}=event.detail||{};mount(video,info);
});
document.addEventListener("liangyou:player-stop",destroy);
dialog.addEventListener("close",destroy);
})();

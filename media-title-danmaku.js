/* Lightweight danmaku overlay for the existing per-title video element.
   Off by default; load only after a user turns it on. No third-party script CDN. */
(()=>{
"use strict";
const root=document.getElementById("media"),dialog=document.getElementById("media-dialog");
if(!root||!dialog)return;
const BASE="https://liangyou-title-playback.maddestalistar.workers.dev";
const PREFERENCE="liangyou:media:danmaku-enabled";
const MAX_ACTIVE=16,MAX_DISPLAY=120;
let enabled=false,session=null;
try{enabled=localStorage.getItem(PREFERENCE)==="1";}catch{}
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
}
function showText(state,message){
 state.button.title=message;
 state.button.setAttribute("aria-label",message);
}
function setButton(state){
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
 const video=state.video;
 if(!state.enabled||!video||!video.isConnected||state.live.length>=MAX_ACTIVE)return;
 const span=document.createElement("span");
 span.className="mtk-danmaku-item "+(item.mode===4?"mtk-danmaku-bottom":item.mode===5?
   "mtk-danmaku-top":"mtk-danmaku-scroll");
 span.textContent=item.text;
 span.style.color="#"+Number(item.color).toString(16).padStart(6,"0");
 const lane=state.lane++%7;
 if(item.mode===1)span.style.top=(11+lane*10)+"%";
 else span.style[item.mode===4?"bottom":"top"]=(12+(lane%3)*7)+"%";
 state.area.appendChild(span);state.live.push(span);
 // The CSS animation keeps controls responsive; never intercept pointer events.
 span.addEventListener("animationend",()=>removeNode(state,span),{once:true});
 if(item.mode!==1)setTimeout(()=>removeNode(state,span),4300);
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
async function load(state){
 if(!state.enabled||state.entries.length||state.loading)return;
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
  if(!state.entries.length)showText(state,t("该集暂未匹配到弹幕","No danmaku found for this episode"));
 }catch(e){
  if(ac.signal.aborted||state!==session)return;
  state.entries=[];
  showText(state,t("弹幕暂不可用，可关闭后重试","Danmaku unavailable. Toggle off and retry."));
 }finally{
  if(state===session){state.loading=false;state.abort=null;setButton(state);}
 }
}
function destroy(){
 if(!session)return;
 session.abort?.abort();
 session.area.replaceChildren();
 session.button.remove();
 session.area.remove();
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
 const button=document.createElement("button");button.type="button";
 button.className="mtk-danmaku-toggle";
 button.setAttribute("aria-label",t("开启弹幕","Turn on danmaku"));
 screen.append(area,button);
 const state={video,info:{...info},area,button,enabled,entries:[],cursor:0,lastTime:0,
   lane:0,live:[],loading:false,abort:null};
 state.onTime=()=>update(state);
 state.onSeek=()=>seek(state);
 state.onPause=()=>screen.classList.add("mtk-danmaku-paused");
 state.onPlay=()=>screen.classList.remove("mtk-danmaku-paused");
 video.addEventListener("timeupdate",state.onTime);
 video.addEventListener("seeked",state.onSeek);
 video.addEventListener("pause",state.onPause);
 video.addEventListener("play",state.onPlay);
 button.addEventListener("click",()=>{
  enabled=!state.enabled;state.enabled=enabled;
  try{localStorage.setItem(PREFERENCE,enabled?"1":"0");}catch{}
  if(!enabled){state.abort?.abort();state.abort=null;state.loading=false;removeItems(state);}
  else if(!state.entries.length)load(state);else seek(state);
  setButton(state);
 });
 session=state;setButton(state);
 if(state.enabled)load(state);
}
document.addEventListener("liangyou:player-video",event=>{
 const {video,info}=event.detail||{};mount(video,info);
});
document.addEventListener("liangyou:player-stop",destroy);
dialog.addEventListener("close",destroy);
})();

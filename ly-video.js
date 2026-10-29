(()=>{'use strict';
const dialog=document.getElementById('ly-video-dialog');
const stage=dialog?.querySelector('.ly-video-stage');
const close=document.getElementById('ly-video-close');
const title=document.getElementById('ly-video-dialog-title');
const source=document.querySelector('#ly-video-dialog .ly-video-dialog-foot a');
const sourceLabel=document.querySelector('#ly-video-dialog .ly-video-dialog-foot span');
const players=Object.freeze({tubo:'./xhs-player.html',n90:'./xhs-player-n90.html'});
const ROOT='https://raw.githubusercontent.com/MaddestAlistar/videos/main/clips/';
if(!dialog||!stage)return;
function asset(value,ext){
 if(typeof value!=='string'||!value.startsWith(ROOT))return '';
 const path=value.slice(ROOT.length);
 return new RegExp('^[a-f0-9-]{36}\\.'+ext+'$').test(path)?value:'';
}
function openVideo(button){
 const key=button.dataset.lyVideoOpen;
 const page=players[key];
 const media=key==='uploaded'?asset(button.dataset.lyVideoSrc,'mp4'):'';
 if(!page&&!media)return;
 const item=button.closest('.ly-news-video-card, .ly-video-panel');
 const heading=item?.querySelector('h3, h2'),original=item?.querySelector('.ly-video-original');
 if(title&&heading)title.textContent=heading.textContent.trim();
 if(source&&original)source.href=original.href;
 if(sourceLabel)sourceLabel.textContent=item?.classList.contains('ly-news-video-card--tg')?'视频来源：Telegram':'视频来源：小红书';
 if(typeof dialog.showModal!=='function'){
  window.open(media||page,'_blank','noopener,noreferrer');return;
 }
 if(!dialog.open)dialog.showModal();
 stage.replaceChildren();
 if(media){
  const video=document.createElement('video');
  video.controls=true;video.playsInline=true;video.preload='metadata';video.className='ly-video-direct';
  const poster=asset(button.dataset.lyVideoPoster,'jpg');if(poster)video.poster=poster;
  video.src=media;video.setAttribute('aria-label',heading?.textContent?.trim()||'视频精选');
  stage.append(video);video.play().catch(()=>{});
 }else{
  const frame=document.createElement('iframe');
  frame.title='良友科技 · 视频播放器';frame.allow='autoplay; fullscreen; picture-in-picture';
  frame.allowFullscreen=true;frame.src=page;stage.append(frame);
 }
}
function dismiss(){if(dialog.open)dialog.close()}
document.addEventListener('click',event=>{
 const trigger=event.target.closest('[data-ly-video-open]');if(trigger)openVideo(trigger);
});
close?.addEventListener('click',dismiss);
dialog.addEventListener('click',event=>{if(event.target===dialog)dismiss()});
dialog.addEventListener('close',()=>{
 const video=stage.querySelector('video');
 if(video){video.pause();video.removeAttribute('src');video.load()}
 stage.replaceChildren();
});
})();

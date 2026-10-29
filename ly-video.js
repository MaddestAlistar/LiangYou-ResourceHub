(()=>{'use strict';
const dialog=document.getElementById('ly-video-dialog');
const stage=dialog?.querySelector('.ly-video-stage');
const close=document.getElementById('ly-video-close');
const title=document.getElementById('ly-video-dialog-title');
const source=document.querySelector('#ly-video-dialog .ly-video-dialog-foot a');
const triggers=document.querySelectorAll('[data-ly-video-open]');
const players=Object.freeze({tubo:'./xhs-player.html',n90:'./xhs-player-n90.html'});
if(!dialog||!stage)return;
function openVideo(event){
  const button=event.currentTarget;
  const key=button.getAttribute('data-ly-video-open')||'tubo';
  const page=players[key];
  if(!page)return;
  const item=button.closest('.ly-news-video-card, .ly-video-panel');
  const itemTitle=item?.querySelector('h3, h2');
  const itemSource=item?.querySelector('.ly-video-original');
  if(title&&itemTitle)title.textContent=itemTitle.textContent.trim();
  if(source&&itemSource)source.href=itemSource.href;
  if(typeof dialog.showModal==='function'){
    if(!dialog.open)dialog.showModal();
    stage.replaceChildren();
    const frame=document.createElement('iframe');
    frame.title='良友科技 · 视频播放器';
    frame.allow='autoplay; fullscreen; picture-in-picture';
    frame.allowFullscreen=true;
    frame.src=page;
    stage.appendChild(frame);
  }else window.open(page,'_blank','noopener,noreferrer');
}
function dismiss(){if(dialog.open)dialog.close()}
triggers.forEach(button=>button.addEventListener('click',openVideo));
close?.addEventListener('click',dismiss);
dialog.addEventListener('click',event=>{if(event.target===dialog)dismiss()});
dialog.addEventListener('close',()=>stage.replaceChildren());
})();

(()=>{'use strict';
const dialog=document.getElementById('ly-video-dialog');
const frame=document.getElementById('ly-video-frame');
const close=document.getElementById('ly-video-close');
const title=document.getElementById('ly-video-dialog-title');
const source=document.querySelector('#ly-video-dialog .ly-video-dialog-foot a');
const triggers=document.querySelectorAll('[data-ly-video-open]');
const players=Object.freeze({tubo:'./xhs-player.html',n90:'./xhs-player-n90.html'});
if(!dialog||!frame)return;
function openVideo(event){
  const button=event.currentTarget;
  const key=button.getAttribute('data-ly-video-open')||'tubo';
  const page=players[key];
  if(!page)return;
  const item=button.closest('.ly-video-panel');
  const itemTitle=item?.querySelector('h2');
  const itemSource=item?.querySelector('.ly-video-original');
  if(title&&itemTitle)title.textContent=itemTitle.textContent.trim();
  if(source&&itemSource)source.href=itemSource.href;
  if(typeof dialog.showModal==='function'){
    if(!dialog.open)dialog.showModal();
    frame.src=page;
  }else{
    window.open(page,'_blank','noopener,noreferrer');
  }
}
function dismiss(){if(dialog.open)dialog.close()}
triggers.forEach(button=>button.addEventListener('click',openVideo));
close?.addEventListener('click',dismiss);
dialog.addEventListener('click',event=>{if(event.target===dialog)dismiss()});
dialog.addEventListener('close',()=>{frame.removeAttribute('src')});
})();

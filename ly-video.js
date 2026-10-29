(()=>{'use strict';
const dialog=document.getElementById('ly-video-dialog');
const frame=document.getElementById('ly-video-frame');
const close=document.getElementById('ly-video-close');
const triggers=document.querySelectorAll('[data-ly-video-open]');
if(!dialog||!frame)return;
function open(){
  frame.src='./xhs-player.html';
  if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();
  else window.open('./xhs-player.html','_blank','noopener,noreferrer');
}
function dismiss(){if(dialog.open)dialog.close()}
triggers.forEach(button=>button.addEventListener('click',open));
close?.addEventListener('click',dismiss);
dialog.addEventListener('click',e=>{if(e.target===dialog)dismiss()});
dialog.addEventListener('close',()=>{frame.removeAttribute('src')});
})();

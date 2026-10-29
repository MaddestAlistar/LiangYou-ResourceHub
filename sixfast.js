/* One-click code copy with older-browser fallback. */
(() => {
  'use strict';
  const button=document.querySelector('[data-sixfast-copy]');
  if(!button) return;
  const code='sk999';
  button.addEventListener('click',async () => {
    let ok=false;
    try {
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(code);ok=true;}
    } catch (_) {}
    if(!ok){
      const field=document.createElement('textarea'); field.value=code; field.readOnly=true;
      field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);
      field.select();try{ok=document.execCommand('copy')}catch(_){}
      field.remove();
    }
    const lang=document.documentElement.lang==='en';
    button.textContent=ok?(lang?'Copied':'已复制'):(lang?'Select code above':'请手动复制口令');
    if(!ok) button.closest('.sixfast-code')?.querySelector('strong')?.focus?.();
  });
})();

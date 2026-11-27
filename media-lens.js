/* LiangYou anime lens — independent public APIs, no user data storage. */
(() => {
 'use strict';
 const trigger=document.getElementById('ly-lens-open');
 if(!trigger||document.getElementById('ly-lens'))return;
 const en=()=>document.documentElement.lang.startsWith('en'),t=(zh,eng)=>en()?eng:zh;
 const el=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!=null)n.textContent=txt;if(cls)n.className=cls;return n};
 const btn=(txt,fn)=>{const b=el('button',txt);b.type='button';b.addEventListener('click',fn);return b};
 const clean=v=>typeof v==='string'?v.trim().slice(0,240):'';
 const style=el('style');style.textContent='.ly-lens-entry{display:flex;justify-content:flex-end;margin:6px 0 8px}.ly-lens-entry button,#ly-lens button{font:inherit;cursor:pointer;border:1px solid #536078;border-radius:9px;background:#172235;color:#e5eaf3;padding:8px 12px;min-height:36px}.ly-lens-entry button{font-size:12px;color:#e4c58a}#ly-lens{box-sizing:border-box;width:min(620px,calc(100% - 24px));max-height:86vh;max-height:86dvh;overflow:auto;margin:auto;padding:20px;border:1px solid #536078;border-radius:17px;background:#0c1422;color:#edf1fa;overscroll-behavior:contain}#ly-lens::backdrop{background:#000b}#ly-lens h2{font-size:20px;margin:0}#ly-lens .ly-lens-head,#ly-lens .ly-lens-modes,#ly-lens .ly-lens-actions,#ly-lens .ly-lens-links{display:flex;align-items:center;gap:8px;flex-wrap:wrap}#ly-lens .ly-lens-head{justify-content:space-between}#ly-lens .ly-lens-modes{margin:14px 0}#ly-lens button[aria-pressed=true],#ly-lens #ly-lens-submit{background:#e4c58a;color:#211b11;border-color:#e4c58a}#ly-lens button:disabled{opacity:.45;cursor:default}#ly-lens p{font-size:13px;color:#b9c4d7;line-height:1.6;margin:10px 0}#ly-lens .ly-lens-drop{border:1px dashed #536078;border-radius:12px;padding:14px;margin:12px 0;display:grid;gap:10px;justify-items:center}#ly-lens .ly-lens-drop[data-drag=true]{border-color:#e4c58a}#ly-lens #ly-lens-preview{display:block;max-width:100%;max-height:180px;object-fit:contain;border-radius:8px}#ly-lens .ly-lens-result{padding:12px 0;border-bottom:1px solid #293548;overflow-wrap:anywhere}#ly-lens .ly-lens-result strong{font-size:15px;color:#f0d7a6}#ly-lens .ly-lens-result p{margin:4px 0}#ly-lens a{color:#e4c58a;font-size:12px;overflow-wrap:anywhere}#ly-lens .ly-lens-links{margin-top:15px}#ly-lens [hidden]{display:none!important}#ly-lens :focus-visible{outline:2px solid #e4c58a;outline-offset:2px}@media(max-width:600px){#ly-lens{padding:13px}#ly-lens h2{font-size:17px}}';
 document.head.append(style);
 const dialog=el('dialog');dialog.id='ly-lens';dialog.setAttribute('aria-labelledby','ly-lens-title');
 const heading=el('div',null,'ly-lens-head'),title=el('h2');title.id='ly-lens-title';
 const close=btn('×',()=>dialog.close());close.id='ly-lens-close';heading.append(title,close);
 const modes=el('div',null,'ly-lens-modes'),desc=el('p'),privacy=el('p'),drop=el('div',null,'ly-lens-drop'),hint=el('p');
 const input=el('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.id='ly-lens-file';input.hidden=true;
 const pick=btn('',()=>input.click()),preview=el('img');preview.id='ly-lens-preview';preview.alt='';preview.hidden=true;
 drop.append(hint,pick,preview,input);
 const actions=el('div',null,'ly-lens-actions'),submit=btn('',()=>recognize());submit.id='ly-lens-submit';
 const clear=btn('',()=>reset()),status=el('p');status.id='ly-lens-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const output=el('div');output.id='ly-lens-results';const links=el('div',null,'ly-lens-links');
 actions.append(submit,clear);dialog.append(heading,modes,desc,privacy,drop,actions,status,output,links);document.body.append(dialog);
 let mode='scene',file=null,previewUrl='',controller=null,serial=0,busy=false;
 const providers={scene:{name:'trace.moe',url:'https://api.trace.moe/search?anilistInfo&cutBorders=1',site:'https://trace.moe/'},character:{name:'AnimeTrace',url:'https://api.animetrace.com/v1/search',site:'https://www.animetrace.com/'}};
 function link(text,url){const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a}
 function stop(){serial++;controller?.abort();controller=null;busy=false}
 function revoke(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';preview.removeAttribute('src');preview.hidden=true}
 function reset(){stop();revoke();file=null;input.value='';output.replaceChildren();status.textContent='';buttons()}
 function buttons(){submit.disabled=!file||busy;clear.disabled=!file&&!busy}
 function labels(){
  trigger.textContent=t('◎ 动漫识图','◎ Anime image search');title.textContent=t('良友动漫识图','LiangYou Anime Lens');close.setAttribute('aria-label',t('关闭','Close'));
  modes.replaceChildren();for(const [key,zh,eng] of [['scene','截图出处','Scene search'],['character','角色识别','Character search']]){const b=btn(t(zh,eng),()=>{if(mode===key)return;stop();mode=key;output.replaceChildren();status.textContent='';labels()});b.dataset.lensMode=key;b.setAttribute('aria-pressed',String(mode===key));modes.append(b)}
  desc.textContent=mode==='scene'?t('识别动漫截图对应的作品、集数和出现时间。完整原始截图效果更好。','Find the anime, episode and timestamp. Full original screenshots work best.'):t('识别动漫图片中的角色与所属作品，结果仅供参考。','Find anime character and work names. Results are suggestions.');
  privacy.textContent=t('点击开始识别后，图片将直接发送至 '+providers[mode].name+'。良友网站不保存图片或识别历史，请勿上传私人或敏感图片。','Only when you start, the image is sent directly to '+providers[mode].name+'. LiangYou stores neither images nor search history. Do not upload sensitive images.');
  hint.textContent=t('选择、拖入或粘贴 JPG / PNG / WebP 图片（最大 10 MB）','Choose, drop or paste JPG / PNG / WebP (up to 10 MB)');
  pick.textContent=t('选择图片','Choose image');submit.textContent=busy?t('识别中…','Searching…'):t('开始识别','Start recognition');clear.textContent=t('清除 / 取消','Clear / cancel');
  links.replaceChildren(link(t('在 '+providers[mode].name+' 官网识别 ↗','Open '+providers[mode].name+' ↗'),providers[mode].site));buttons();
 }
 function selectFile(f){
  reset();if(!f)return;
  if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size<=0||f.size>10*1024*1024){status.textContent=t('请选择不超过 10 MB 的 JPG、PNG 或 WebP 图片。','Choose a JPG, PNG or WebP image no larger than 10 MB.');return}
  file=f;previewUrl=URL.createObjectURL(f);preview.src=previewUrl;preview.hidden=false;buttons();status.textContent=t('图片已就绪，尚未上传。','Image ready; not uploaded yet.');
 }
 function time(s){if(typeof s!=='number'||!Number.isFinite(s)||s<0)return '—';const n=Math.floor(s);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
 function searchWork(name){
  const tabs=document.getElementById('media-tabs'),anime=tabs?.querySelector('[data-mi-tab="anime"]'),field=document.getElementById('media-search');
  if(!anime||!field)return;
  dialog.close();if(anime.getAttribute('aria-pressed')!=='true')anime.click();field.value=name;field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();
 }
 function row(name,details,external=null){
  const r=el('article',null,'ly-lens-result');r.append(el('strong',name));for(const d of details.filter(Boolean))r.append(el('p',d));
  const a=el('div',null,'ly-lens-actions');a.append(btn(t('站内查找作品','Find in site'),()=>searchWork(name)));if(external)a.append(link('AniList ↗',external));r.append(a);return r
 }
 function sceneResults(d){
  if(!d||!Array.isArray(d.result)||d.error)throw Error('invalid');
  // Only explicitly classified non-adult results are shown. Never embed remote
  // preview media, filenames or arbitrary URLs from search responses.
  const sorted=d.result.filter(x=>x?.anilist?.isAdult===false&&Number.isSafeInteger(x.anilist.id)&&x.anilist.id>0&&typeof x.similarity==='number'&&Number.isFinite(x.similarity)&&x.similarity>=0&&x.similarity<=1).sort((a,b)=>b.similarity-a.similarity);
  const seen=new Set();let n=0;
  for(const x of sorted){const a=x.anilist, name=clean(a.title?.native)||clean(a.title?.romaji)||clean(a.title?.english);if(!name)continue;
   const ep=Array.isArray(x.episode)?x.episode.filter(v=>typeof v==='number'||typeof v==='string').join(' / '):typeof x.episode==='number'||typeof x.episode==='string'?String(x.episode):'';
   const k=a.id+':'+ep;if(seen.has(k))continue;seen.add(k);
   const alt=clean(a.title?.romaji)||clean(a.title?.english),sim=(x.similarity*100).toFixed(1)+'%';
   output.append(row(name,[alt!==name?alt:'',t('相似度 ','Similarity ')+sim+(x.similarity<.85?t(' · 低相似度，需人工核对',' · Low similarity; verify manually'):''),t('集数 ','Episode ')+(ep||'—')+' · '+time(x.from)+' – '+time(x.to)],'https://anilist.co/anime/'+a.id));if(++n>=5)break;
  }return n;
 }
 function characterResults(d){
  if(!d||![0,17720,200].includes(d.code)||!Array.isArray(d.data))throw Error(d?.code===17728?'quota':'invalid');
  let n=0;for(const box of d.data.slice(0,8)){if(!Array.isArray(box?.character))continue;
   for(const c of box.character.slice(0,3)){const work=clean(c?.work),name=clean(c?.character);if(!work||!name)continue;
    const r=row(work,[t('角色：','Character: ')+name,box.not_confident===true?t('低置信度候选，请核对','Low-confidence candidate; verify manually'):t('候选结果，请核对','Candidate; verify manually')]);output.append(r);if(++n>=15)return n;
   }
  }return n;
 }
 async function recognize(){
  if(!file||busy)return;
  const chosen=mode,token=++serial;busy=true;controller=new AbortController();const ac=controller;
  output.replaceChildren();status.textContent=t('正在请求 '+providers[chosen].name+'…','Contacting '+providers[chosen].name+'…');labels();
  const timer=setTimeout(()=>ac.abort(),25000);
  try{
   const body=new FormData();body.append(chosen==='scene'?'image':'file',file,'screenshot.'+({ 'image/png':'png','image/webp':'webp','image/jpeg':'jpg'}[file.type]));
   if(chosen==='character')body.append('is_multi','1'); // use provider default model, not a hard-coded model version
   const r=await fetch(providers[chosen].url,{method:'POST',body,signal:ac.signal,credentials:'omit',referrerPolicy:'no-referrer'});
   if(!r.ok)throw Error([402,429].includes(r.status)?'quota':'http');
   const d=await r.json();if(token!==serial||!dialog.open)return;
   const n=chosen==='scene'?sceneResults(d):characterResults(d);
   status.textContent=n?t('找到 '+n+' 条候选，请核对。','Found '+n+' candidates; verify matches.'):t('暂无可展示的匹配结果，可换一张图片重试。','No eligible matches. Try another image.');
  }catch(e){
   if(token!==serial||!dialog.open)return;
   status.textContent=e.message==='quota'?t('服务配额已用尽或请求过于频繁，请稍后再试。','Quota or rate limit reached. Try later.'):t('识别服务暂不可用（网络、跨域限制或超时），可尝试下方官网入口。','Recognition service unavailable (network, CORS or timeout). Try the official site below.');
  }finally{clearTimeout(timer);if(token===serial){busy=false;controller=null;labels()}}
 }
 input.addEventListener('change',()=>selectFile(input.files?.[0]));
 drop.addEventListener('dragover',e=>{e.preventDefault();drop.dataset.drag='true'});drop.addEventListener('dragleave',()=>delete drop.dataset.drag);
 drop.addEventListener('drop',e=>{e.preventDefault();delete drop.dataset.drag;selectFile(e.dataTransfer?.files?.[0])});
 dialog.addEventListener('paste',e=>{const f=[...(e.clipboardData?.items||[])].find(x=>x.kind==='file'&&x.type.startsWith('image/'))?.getAsFile();if(f){e.preventDefault();selectFile(f)}});
 trigger.addEventListener('click',()=>{labels();if(!dialog.open)dialog.showModal()});
 dialog.addEventListener('close',()=>{reset();labels();trigger.focus({preventScroll:true})});
 new MutationObserver(labels).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 labels();trigger.hidden=false;
})();

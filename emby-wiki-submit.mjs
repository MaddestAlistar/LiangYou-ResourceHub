import {validateWiki,chinaDate,hasCompleteCountColumn} from './emby-wiki-schema.mjs?v=20261110.11';
import {preferredLanguage,setPreferredLanguage,applyLanguage,localizeNotice} from './emby-wiki-lang.mjs?v=20261110.wiki-en1';
import {buildForm,readForm,fillForm,api,updateCountStatus} from './emby-wiki-ui.mjs?v=20261110.12';
const $=id=>document.getElementById(id),form=$('wiki-submit-form'),host=$('wiki-fields'),notice=$('wiki-submit-status');
buildForm(host);
function submissionId(){if(crypto.randomUUID)return 'wiki-'+crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return 'wiki-'+[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-')}

let id=submissionId(),image='',evidenceImage='',busy=false,imageBusy=false,evidenceBusy=false,imageRun=0,evidenceRun=0,done=false;
let language=preferredLanguage(),lastNotice='',lastError=false;
function notify(message,error=false){
 lastNotice=message;lastError=error;
 notice.textContent=localizeNotice(message,language);
 notice.className='wk-notice '+(error?'wk-error':'wk-success');
}
function progress(){const x=readForm(host),groups=[!!(x.name.trim()&&x.nature&&x.state&&x.contents.length),!!(hasCompleteCountColumn(x)&&x.statsDate),!!(x.registration.trim()&&x.retention.trim()),!!(x.website.trim()||x.channel.trim()||x.group.trim()||x.bot.trim()),!!(x.nickname.trim()&&x.submissionDate&&x.role)];const count=groups.filter(Boolean).length;$('wiki-progress').value=count;$('wiki-progress-label').textContent=language==='en'?'Completed '+count+' / 5 groups':'已完成 '+count+' / 5 组'}
form.addEventListener('input',progress);form.addEventListener('change',progress);
const draftKey='liangyou-emby-wiki-draft-v1';
try{const saved=JSON.parse(localStorage.getItem(draftKey)||'null');if(saved?.item){fillForm(host,saved.item);if(/^wiki-[a-f0-9-]{36}$/.test(saved.id))id=saved.id;if(saved.coverData?.startsWith('data:image/jpeg;base64,')){image=saved.coverData;$('wiki-cover-preview').src=image;$('wiki-cover-preview').hidden=false;$('wiki-cover-remove').hidden=false}if(saved.evidenceData?.startsWith('data:image/jpeg;base64,')){evidenceImage=saved.evidenceData;$('wiki-evidence-preview').src=evidenceImage;$('wiki-evidence-preview').hidden=false;$('wiki-evidence-remove').hidden=false}notify('已恢复上次未提交的草稿。');progress()}}catch{}
function saveDraft(){if(!done)try{localStorage.setItem(draftKey,JSON.stringify({id,item:readForm(host),coverData:image,evidenceData:evidenceImage}))}catch{}}
form.addEventListener('input',()=>{if(!busy)saveDraft()});form.addEventListener('change',()=>{if(!busy)saveDraft()});
async function compress(file,{square=false}={}){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>5000000)throw Error('请选择不超过 5 MB 的 JPG、PNG 或 WebP 图片');
 const url=URL.createObjectURL(file),img=new Image();
 try{img.src=url;await img.decode();if(square&&(img.naturalWidth!==img.naturalHeight||img.naturalWidth<320))throw Error('封面必须是 1:1 正方形图片，且至少 320×320 像素，请重新选择');if(img.naturalWidth*img.naturalHeight>40000000)throw Error('图片尺寸过大，请先缩小图片');let size=1200;
 while(size>=480){const scale=Math.min(1,size/img.naturalWidth,size/img.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#142437';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);for(const quality of [.82,.68,.52]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<290000)return data}size=Math.round(size*.75)}throw Error('图片压缩后仍过大，请换一张封面');
 }finally{URL.revokeObjectURL(url)}
}
async function validateCoverData(){
 if(!image)return;
 const preview=new Image();preview.src=image;await preview.decode();
 if(preview.naturalWidth!==preview.naturalHeight||preview.naturalWidth<320)throw Error('封面必须是 1:1 正方形图片，且至少 320×320 像素，请重新选择');
}
function clearImage(){imageRun++;image='';$('wiki-cover-file').value='';$('wiki-cover-preview').hidden=true;$('wiki-cover-preview').removeAttribute('src');$('wiki-cover-remove').hidden=true;$('wiki-cover-message').textContent='';imageBusy=false;$('wiki-submit').disabled=busy||evidenceBusy||done;saveDraft()}
$('wiki-cover-file').onchange=async()=>{const run=++imageRun;image='';$('wiki-cover-preview').hidden=true;$('wiki-cover-remove').hidden=true;const file=$('wiki-cover-file').files[0];if(!file){clearImage();return}imageBusy=true;$('wiki-submit').disabled=true;$('wiki-cover-message').textContent=localizeNotice('正在处理封面…',language);try{const data=await compress(file,{square:true});if(run!==imageRun)return;image=data;saveDraft();$('wiki-cover-preview').src=data;$('wiki-cover-preview').hidden=false;$('wiki-cover-remove').hidden=false;$('wiki-cover-message').textContent=localizeNotice('封面已就绪，约 '+Math.round(data.length*.75/1000)+' KB',language)}catch(e){if(run!==imageRun)return;$('wiki-cover-file').value='';$('wiki-cover-message').textContent=localizeNotice(e.message,language)}finally{if(run===imageRun){imageBusy=false;$('wiki-submit').disabled=busy||evidenceBusy||done;saveDraft()}}};
$('wiki-cover-remove').onclick=clearImage;
function clearEvidence(){evidenceRun++;evidenceImage='';$('wiki-evidence-file').value='';$('wiki-evidence-preview').hidden=true;$('wiki-evidence-preview').removeAttribute('src');$('wiki-evidence-remove').hidden=true;$('wiki-evidence-message').textContent='';evidenceBusy=false;$('wiki-submit').disabled=busy||imageBusy||done;saveDraft()}
$('wiki-evidence-file').onchange=async()=>{const run=++evidenceRun;evidenceImage='';$('wiki-evidence-preview').hidden=true;$('wiki-evidence-remove').hidden=true;const file=$('wiki-evidence-file').files[0];if(!file){clearEvidence();return}evidenceBusy=true;$('wiki-submit').disabled=true;$('wiki-evidence-message').textContent=localizeNotice('正在处理统计凭证…',language);try{const data=await compress(file);if(run!==evidenceRun)return;evidenceImage=data;saveDraft();$('wiki-evidence-preview').src=data;$('wiki-evidence-preview').hidden=false;$('wiki-evidence-remove').hidden=false;$('wiki-evidence-message').textContent=localizeNotice('统计凭证已就绪，约 '+Math.round(data.length*.75/1000)+' KB',language)}catch(e){if(run!==evidenceRun)return;$('wiki-evidence-file').value='';$('wiki-evidence-message').textContent=localizeNotice(e.message,language)}finally{if(run===evidenceRun){evidenceBusy=false;$('wiki-submit').disabled=busy||imageBusy||done;saveDraft()}}};
$('wiki-evidence-remove').onclick=clearEvidence;

function reset(){form.reset();host.querySelectorAll('input[type=date]').forEach(n=>n.value=chinaDate());clearImage();clearEvidence();id=submissionId();done=false;form.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=false);$('wiki-new').hidden=true;notice.textContent='';lastNotice='';lastError=false;try{localStorage.removeItem(draftKey)}catch{}progress();host.querySelector('input').focus()}
$('wiki-reset').onclick=()=>{if(!busy&&confirm(localizeNotice('清空当前表单和本地文字草稿？',language)))reset()};$('wiki-new').onclick=reset;
form.onsubmit=async event=>{event.preventDefault();if(busy||imageBusy||evidenceBusy||done)return;let item;try{item=validateWiki(readForm(host));await validateCoverData();if(!$('wiki-confirm').checked)throw Error('请确认投稿资料可以公开展示')}catch(e){notify(e.message,true);notice.focus();return}
 saveDraft();busy=true;form.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=true);notify('正在提交，请稍候…');
 try{const data=await api('/emby-wiki-submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,item,coverData:image,evidenceData:evidenceImage,confirm:true,company:form.elements.company.value})});done=true;try{localStorage.removeItem(draftKey)}catch{}notify('投稿成功，已进入待审核队列。\n投稿编号：'+data.id+'\n审核通过后将显示在网站 Emby Wiki 板块。');$('wiki-new').hidden=false;$('wiki-new').disabled=false;notice.focus()}
 catch(e){notify(e.message+'。草稿已保留，可使用原表单重试。',true);form.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=false);notice.focus()}
 finally{busy=false}
};

function changeLanguage(next){
 if(next!=='zh'&&next!=='en')return;
 language=next;
 applyLanguage(document.body,language);
 setPreferredLanguage(language);
 updateCountStatus(host);
 progress();
 if(lastNotice)notice.textContent=localizeNotice(lastNotice,language);
 // Refresh upload feedback without changing the selected files.
 for(const [messageId,photo] of [['wiki-cover-message',image],['wiki-evidence-message',evidenceImage]]){
  const message=$(messageId);
  if(photo)message.textContent=localizeNotice((messageId==='wiki-cover-message'?'封面已就绪，约 ':'统计凭证已就绪，约 ')+Math.round(photo.length*.75/1000)+' KB',language);
 }
}
for(const button of document.querySelectorAll('[data-wiki-lang]')){
 button.addEventListener('click',()=>changeLanguage(button.dataset.wikiLang));
}
changeLanguage(language);

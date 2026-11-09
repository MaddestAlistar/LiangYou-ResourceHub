import {validateWiki,chinaDate} from './emby-wiki-schema.mjs';
import {buildForm,readForm,fillForm,api} from './emby-wiki-ui.mjs';
const $=id=>document.getElementById(id),form=$('wiki-submit-form'),host=$('wiki-fields'),notice=$('wiki-submit-status');
buildForm(host);
function submissionId(){if(crypto.randomUUID)return 'wiki-'+crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return 'wiki-'+[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-')}

let id=submissionId(),image='',busy=false,imageBusy=false,imageRun=0,done=false;
function notify(message,error=false){notice.textContent=message;notice.className='wk-notice '+(error?'wk-error':'wk-success')}
function progress(){const x=readForm(host),groups=[!!(x.name.trim()&&x.nature&&x.state&&x.contents.length),!!(x.movies!==''&&x.series!==''&&x.statsDate),!!x.registration.trim(),!!(x.website.trim()||x.channel.trim()||x.group.trim()||x.bot.trim()),!!(x.nickname.trim()&&x.submissionDate)];const count=groups.filter(Boolean).length;$('wiki-progress').value=count;$('wiki-progress-label').textContent='已完成 '+count+' / 5 组'}
form.addEventListener('input',progress);form.addEventListener('change',progress);
const draftKey='liangyou-emby-wiki-draft-v1';
try{const saved=JSON.parse(localStorage.getItem(draftKey)||'null');if(saved?.item){fillForm(host,saved.item);if(/^wiki-[a-f0-9-]{36}$/.test(saved.id))id=saved.id;if(saved.coverData?.startsWith('data:image/jpeg;base64,')){image=saved.coverData;$('wiki-cover-preview').src=image;$('wiki-cover-preview').hidden=false;$('wiki-cover-remove').hidden=false}notify('已恢复上次未提交的草稿。');progress()}}catch{}
function saveDraft(){if(!done)try{localStorage.setItem(draftKey,JSON.stringify({id,item:readForm(host),coverData:image}))}catch{}}
form.addEventListener('input',()=>{if(!busy)saveDraft()});form.addEventListener('change',()=>{if(!busy)saveDraft()});
async function compress(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>5000000)throw Error('请选择不超过 5 MB 的 JPG、PNG 或 WebP 图片');
 const url=URL.createObjectURL(file),img=new Image();
 try{img.src=url;await img.decode();if(img.naturalWidth*img.naturalHeight>40000000)throw Error('图片尺寸过大，请先缩小图片');let size=1200;
 while(size>=480){const scale=Math.min(1,size/img.naturalWidth,size/img.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#142437';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);for(const quality of [.82,.68,.52]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<290000)return data}size=Math.round(size*.75)}throw Error('图片压缩后仍过大，请换一张封面');
 }finally{URL.revokeObjectURL(url)}
}
function clearImage(){imageRun++;image='';$('wiki-cover-file').value='';$('wiki-cover-preview').hidden=true;$('wiki-cover-preview').removeAttribute('src');$('wiki-cover-remove').hidden=true;$('wiki-cover-message').textContent='';imageBusy=false;$('wiki-submit').disabled=busy||done;saveDraft()}
$('wiki-cover-file').onchange=async()=>{const run=++imageRun;image='';$('wiki-cover-preview').hidden=true;$('wiki-cover-remove').hidden=true;const file=$('wiki-cover-file').files[0];if(!file){clearImage();return}imageBusy=true;$('wiki-submit').disabled=true;$('wiki-cover-message').textContent='正在处理封面…';try{const data=await compress(file);if(run!==imageRun)return;image=data;saveDraft();$('wiki-cover-preview').src=data;$('wiki-cover-preview').hidden=false;$('wiki-cover-remove').hidden=false;$('wiki-cover-message').textContent='封面已就绪，约 '+Math.round(data.length*.75/1000)+' KB'}catch(e){if(run!==imageRun)return;$('wiki-cover-file').value='';$('wiki-cover-message').textContent=e.message}finally{if(run===imageRun){imageBusy=false;$('wiki-submit').disabled=busy||done;saveDraft()}}};
$('wiki-cover-remove').onclick=clearImage;
function reset(){form.reset();host.querySelectorAll('input[type=date]').forEach(n=>n.value=chinaDate());clearImage();id=submissionId();done=false;form.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=false);$('wiki-new').hidden=true;notice.textContent='';try{localStorage.removeItem(draftKey)}catch{}progress();host.querySelector('input').focus()}
$('wiki-reset').onclick=()=>{if(!busy&&confirm('清空当前表单和本地文字草稿？'))reset()};$('wiki-new').onclick=reset;
form.onsubmit=async event=>{event.preventDefault();if(busy||imageBusy||done)return;let item;try{item=validateWiki(readForm(host));if(!$('wiki-confirm').checked)throw Error('请确认投稿资料可以公开展示')}catch(e){notify(e.message,true);notice.focus();return}
 saveDraft();busy=true;form.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=true);notify('正在提交，请稍候…');
 try{const data=await api('/emby-wiki-submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,item,coverData:image,confirm:true,company:form.elements.company.value})});done=true;try{localStorage.removeItem(draftKey)}catch{}notify('投稿成功，已进入待审核队列。\n投稿编号：'+data.id+'\n审核通过后将显示在网站 Emby Wiki 板块。');$('wiki-new').hidden=false;$('wiki-new').disabled=false;notice.focus()}
 catch(e){notify(e.message+'。文字草稿已保留，可使用原表单重试。',true);form.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=false);notice.focus()}
 finally{busy=false}
};

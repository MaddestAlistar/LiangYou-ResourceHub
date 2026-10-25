import {inspectImage} from './icon-image.mjs';
const $=id=>document.getElementById(id),API='https://liangyou-icon-review.maddestalistar.workers.dev';
let rows=[],busy=false,stop=false,batchId='',snapshot=null,activeWorker=null;
const element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
const notice=text=>{$('batch-status').textContent=text};
function selected(){return rows.filter(r=>r.file&&r.check.checked&&r.state!=='done')}
function update(){
 const valid=rows.filter(r=>r.file).length,done=rows.filter(r=>r.state==='done').length;
 $('batch-count').textContent=`共 ${rows.length} 项 · 合格 ${valid} 张 · 不合格 / 跳过 ${rows.length-valid} 项 · 已提交 ${done} 张`;
 $('batch-submit').textContent=`提交选中的合格图片（${selected().length}）`;
 $('batch-submit').disabled=busy||!selected().length;
 $('batch-file').disabled=busy;$('mode-single').disabled=busy;$('mode-batch').disabled=busy;
 $('batch-stop').hidden=!busy;
 for(const id of ['author','email','notes'])$(id).disabled=busy||!!snapshot;
 for(const r of rows){r.check.disabled=busy||!r.file||r.state==='done';if(r.nameInput)r.nameInput.disabled=busy||!!r.sent}
}
function cleanup(){
 for(const r of rows)if(r.url)URL.revokeObjectURL(r.url);
 rows=[];$('batch-items').replaceChildren();snapshot=null;
}
function setMode(batch){
 if(busy)return;
 $('single-upload').hidden=batch;$('batch-upload').hidden=!batch;
 $('single-name').hidden=batch;$('single-kind').hidden=batch;
 $('mode-single').setAttribute('aria-pressed',String(!batch));$('mode-batch').setAttribute('aria-pressed',String(batch));
 for(const id of ['author','email','notes']){if(batch&&snapshot)$(id).value=snapshot[id];$(id).disabled=batch&&!!snapshot}
}
$('mode-single').onclick=()=>setMode(false);$('mode-batch').onclick=()=>setMode(true);
async function unpack(file){
 const data=await file.arrayBuffer();
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./icon-archive-worker.mjs',import.meta.url),{type:'module'});activeWorker=worker;
  const finish=(error,result)=>{clearTimeout(timer);worker.terminate();activeWorker=null;error?reject(error):resolve(result)};
  const timer=setTimeout(()=>finish(Error('解包超时，请减少压缩包大小或先在本机解压后分批选择图片')),45000);
  worker.onmessage=e=>e.data.ok?finish(null,e.data):finish(Error(e.data.error));
  worker.onerror=()=>finish(Error('压缩包解析失败，请刷新页面，或先解压后分批选择图片'));
  worker.cancel=()=>finish(Error('已停止解包，未上传任何文件'));
  try{worker.postMessage({data,extension:file.name.split('.').pop().toLowerCase()},[data])}catch(e){finish(e)}
 });
}
async function decodedImage(file){
 const url=URL.createObjectURL(file),img=new Image();
 try{await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{img.src='';reject(Error('图片解码超时'))},10000);img.onload=()=>{clearTimeout(timeout);resolve()};img.onerror=()=>{clearTimeout(timeout);reject(Error('图片损坏或浏览器无法解码'))};img.src=url});return img}
 finally{URL.revokeObjectURL(url)}
}
function showRow(row){
 rows.push(row);const card=element('article');card.className='batch-item';
 const label=element('label');row.check=element('input');row.check.type='checkbox';row.check.checked=!!row.file;row.check.onchange=update;
 label.append(row.check,document.createTextNode(row.path));card.append(label);
 if(row.file){
  const canvas=element('canvas');canvas.width=row.info.width;canvas.height=row.info.height;canvas.className='batch-preview';canvas.setAttribute('role','img');canvas.setAttribute('aria-label','图标静态预览');canvas.getContext('2d').drawImage(row.image,0,0);card.append(canvas);delete row.image;
  if(row.info.kind==='动态'){
   const img=element('img');img.className='batch-preview';img.alt='GIF 动态预览';img.hidden=true;card.append(img);
   const play=element('button','播放 GIF');play.type='button';play.className='batch-secondary';
   play.onclick=()=>{if(row.url){URL.revokeObjectURL(row.url);row.url=null;img.removeAttribute('src');img.hidden=true;canvas.hidden=false;play.textContent='播放 GIF'}else{row.url=URL.createObjectURL(row.file);img.src=row.url;img.hidden=false;canvas.hidden=true;play.textContent='停止动画'}};
   card.append(play);
  }
  row.nameInput=element('input');row.nameInput.value=row.path.replaceAll('\\','/').split('/').pop().replace(/\.[^.]+$/,'').slice(0,60);row.nameInput.maxLength=60;row.nameInput.setAttribute('aria-label','图标名称：'+row.path);
  const nameLabel=element('label','图标名称（可修改）');nameLabel.append(row.nameInput);card.append(nameLabel);
  card.append(element('p',`${row.info.kind} · ${row.info.width} × ${row.info.height} · ${(row.file.size/1024/1024).toFixed(2)} MB`));
 }
 row.status=element('p',row.reason||'✓ 检查通过，等待提交');row.status.className=row.file?'batch-result':'field-error';card.append(row.status);$('batch-items').append(card);
}
$('batch-file').onchange=async()=>{
 if(busy)return;const input=Array.from($('batch-file').files);if(!input.length)return;
 cleanup();busy=true;stop=false;batchId=crypto.randomUUID();update();notice('正在解包并逐张检查，尚未上传…');
 try{
  const archive=input.filter(f=>/\.(zip|rar)$/i.test(f.name));let files,skipped=[];
  if(archive.length){
   if(input.length!==1)throw Error('每次请选择一个 ZIP / RAR，或直接多选图片；请勿混选');
   if(input[0].size>20*1024*1024)throw Error('压缩包不能超过 20 MB');
   const result=await unpack(input[0]);skipped=result.skipped;
   files=result.files.map(f=>({path:f.path,file:new File([f.bytes],f.path.replaceAll('\\','/').split('/').pop())}));
  }else{
   if(input.length>30)throw Error('每批最多 30 张图片，请分批选择');
   if(input.reduce((sum,f)=>sum+f.size,0)>50*1024*1024)throw Error('每批图片总大小不能超过 50 MB');
   files=input.map(file=>({path:file.name,file}));
  }
  const seen=new Set();
  for(const [i,f] of files.entries()){
   if(stop)break;
   notice(`正在检查 ${i+1} / ${files.length}：${f.path}`);
   try{
    const bytes=new Uint8Array(await f.file.arrayBuffer()),info=inspectImage(bytes,f.path);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    if(seen.has(hash))throw Error('与本批另一张图片内容相同，已跳过重复文件');
    const file=new File([bytes],f.file.name,{type:info.mime}),image=await decodedImage(file);
    if(image.naturalWidth!==info.width||image.naturalHeight!==info.height)throw Error('图片解码尺寸与文件信息不一致');
    seen.add(hash);showRow({path:f.path,file,info,image,key:crypto.randomUUID(),state:'ready'});
   }catch(e){showRow({path:f.path,reason:e.message,state:'invalid'})}
  }
  for(const skippedFile of skipped)showRow({path:skippedFile.path,reason:skippedFile.reason,state:'invalid'});
  notice(stop?'已停止检查；已检查的合格图片仍可选择提交。':'检查完成。确认名称、勾选图片，并填写上方作者 / 来源后提交。');
 }catch(e){notice(e.message)}finally{busy=false;update()}
};
$('batch-stop').onclick=()=>{stop=true;activeWorker?.cancel();notice('将停止后续处理；正在提交的这一张会先确认结果。')};
$('batch-submit').onclick=async()=>{
 if(busy)return;
 const pending=selected();if(!pending.length)return;
 if(pending.some(r=>!r.nameInput.value.trim())){notice('请填写所有选中图片的图标名称');return}
 const author=$('author').value.trim(),email=$('email').value.trim(),notes=$('notes').value.trim();
 if(!author){notice('请填写上方作者或来源');$('author').focus();return}
 if(email.length>254||(email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))){notice('请修改邮箱格式，或留空后提交');$('email').focus();return}
 snapshot??={author,email,notes};busy=true;stop=false;update();
 let failed=false;
 for(const row of pending){
  if(stop)break;
  row.sent??={...snapshot,name:row.nameInput.value.trim()};row.nameInput.disabled=true;
  row.state='sending';row.status.textContent='正在提交…';notice('正在逐张提交，请保持页面打开。已成功的图片不会重复提交。');
  const form=new FormData();form.set('file',row.file);form.set('kind',row.info.kind);form.set('submissionKey',row.key);form.set('batchId',batchId);
  for(const [key,value] of Object.entries(row.sent))form.set(key,value);
  try{
   const res=await fetch(API,{method:'POST',body:form,signal:AbortSignal.timeout(120000)}),out=await res.json();
   if(!res.ok||!out.ok)throw Error(out.error||'提交失败');
   row.state='done';row.check.checked=false;row.status.textContent='✓ 已进入审核队列 · '+out.id;
  }catch(e){row.state='failed';row.status.textContent='未能确认提交，可重试：'+e.message;failed=true;break}
  update();
 }
 busy=false;update();notice(failed?'遇到提交错误，已停止后续上传。点击提交可重试失败项并继续；已成功项会跳过。':stop?'已暂停，点击提交可继续剩余图片。':'本次所选图片已提交。每张图片在后台独立展示与审核。');
};
window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue=''}});
update();

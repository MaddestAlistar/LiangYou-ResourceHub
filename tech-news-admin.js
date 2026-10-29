/* News CMS with protected MP4 upload. Never store the admin key. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const ROOT='https://liangyou-icon-review.maddestalistar.workers.dev';
const ENDPOINT=ROOT+'/news-admin',UPLOAD=ROOT+'/news-video-upload';
const CATEGORIES=['系统提醒','联名上新','应用动态','图标动态','热点播报','联合抽奖','宣传推广','视频精选'];
const MAX_BYTES=20*1024*1024;
const list=$('news-items'),category=$('news-category'),title=$('news-title'),content=$('news-content'),notice=$('news-message');
const refresh=$('news-refresh'),save=$('news-save'),reset=$('news-reset'),heading=$('news-form-title');
const source=$('news-source-url'),videoFile=$('news-video-file'),videoFields=$('news-video-fields'),preview=$('news-video-preview'),videoHelp=$('news-video-help');
if(!list||!category||!title||!content||!notice||!videoFields||!source||!videoFile)return;
let editingId=null,busy=false,items=[],uploadedMedia=null,previewUrl=null;
function notify(message){notice.textContent=message}
function tag(name,value){const n=document.createElement(name);if(value!==undefined)n.textContent=value;return n}
function key(){const value=$('key').value;if(value.length<24)throw new Error('请先输入管理员密钥（至少 24 字符）');return value}
function sourcePlatform(raw){
 try{
  const u=new URL(raw.trim());
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname.length<2)return '';
  if(['xhslink.cn','xiaohongshu.com','www.xiaohongshu.com','m.xiaohongshu.com'].includes(u.hostname))return '小红书';
  if(['t.me','www.t.me','telegram.me','www.telegram.me'].includes(u.hostname))return 'Telegram';
 }catch{}
 return '';
}
async function request(body){
 const response=await fetch(ENDPOINT,{method:body?'POST':'GET',
  headers:{'X-Admin-Key':key(),...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(35000)});
 let data;try{data=await response.json()}catch{throw new Error('服务器没有返回有效的 JSON')}
 if(!response.ok||!data.ok)throw new Error(data.error||'新闻管理请求失败（HTTP '+response.status+'）');
 return data;
}
function showPreview(file){
 if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null}
 preview.hidden=!file;preview.removeAttribute('src');
 if(file){previewUrl=URL.createObjectURL(file);preview.src=previewUrl;preview.load()}
}
function toggleFields(){
 const isVideo=category.value==='视频精选';
 videoFields.hidden=!isVideo;
 $('news-title-label').textContent=isVideo?'内容标题':'新闻标题';
 $('news-content-label').textContent=isVideo?'内容描述':'新闻内容';
 $('news-title-required').hidden=!isVideo;
 $('news-content-required').hidden=!isVideo;
 source.required=isVideo;
 videoFile.required=isVideo&&!uploadedMedia?.videoUrl;
 videoHelp.textContent=editingId&&uploadedMedia?.videoUrl
  ?'已保存的视频可直接沿用；选择新的 MP4 会替换视频。旧文件保留在 videos 仓库，以便追溯。'
  :'上传后保存到 MaddestAlistar/videos。仅支持 MP4，单条不超过 20 MB。';
}
function resetForm(){
 editingId=null;uploadedMedia=null;category.value=CATEGORIES[0];title.value='';content.value='';source.value='';videoFile.value='';
 heading.textContent='发布一条新闻';save.textContent='发布新闻';showPreview(null);toggleFields();
}
function render(){
 list.replaceChildren();$('news-total').textContent='已发布 '+items.length+' 条';
 if(!items.length){const p=tag('p','暂无新闻记录');p.className='muted';list.append(p);return}
 for(const item of items){
  const card=tag('article');card.className='news-admin-item';
  const meta=tag('div');meta.className='news-admin-meta';
  const kind=tag('span',item.category);kind.className='news-admin-tag';
  const when=tag('span',new Date(item.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}));when.className='muted';
  meta.append(kind,when);card.append(meta,tag('h3',item.title));
  const body=tag('p',item.content);body.className='news-admin-body';card.append(body);
  if(item.category==='视频精选'&&item.sourceUrl){
   const origin=tag('a','原帖 · '+(item.platform==='tg'?'Telegram':'小红书')+' ↗');
   origin.href=item.sourceUrl;origin.target='_blank';origin.rel='noopener noreferrer';card.append(origin);
   const media=tag('p',item.videoUrl?'已附 MP4 视频':'待补充视频');media.className='muted';card.append(media);
  }
  const tools=tag('div');tools.className='news-admin-tools';
  const edit=tag('button','编辑');edit.className='secondary';edit.type='button';
  edit.addEventListener('click',()=>{
   editingId=item.id;category.value=item.category;title.value=item.title;content.value=item.content;
   source.value=item.sourceUrl||'';uploadedMedia=item.videoUrl?{videoUrl:item.videoUrl,posterUrl:item.posterUrl||''}:null;
   videoFile.value='';showPreview(null);toggleFields();
   heading.textContent='编辑新闻';save.textContent='保存修改';$('tech-news-admin').scrollIntoView({behavior:'smooth',block:'start'});title.focus();
  });
  const del=tag('button','删除');del.className='danger';del.type='button';
  del.addEventListener('click',async()=>{
   if(busy||!confirm('确认删除这条新闻？\n'+item.title+'\n（视频文件会保留在 videos 仓库）'))return;
   await change({action:'delete',id:item.id,confirm:true},'新闻已删除');
   if(editingId===item.id)resetForm();
  });
  tools.append(edit,del);card.append(tools);list.append(card);
 }
}
function setBusy(state){busy=state;for(const b of [refresh,save,reset,category,videoFile])b.disabled=state}
async function refreshNews(){
 if(busy)return;setBusy(true);notify('正在读取新闻记录…');
 try{const data=await request();items=data.items||[];render();notify('新闻已同步。新增、修改或删除后，首页会自动获取最新内容。')}
 catch(error){notify('读取失败：'+error.message)}
 finally{setBusy(false)}
}
async function change(body,successMessage){
 if(busy)return;setBusy(true);notify('正在保存到新闻数据源…');
 try{
  const data=await request(body);items=data.items||[];render();
  notify(successMessage+'。首页可能有约 1 分钟的缓存延迟。');
  if(body.action!=='delete')resetForm();
 }catch(error){notify('保存失败：'+error.message+'。请检查管理员密钥并刷新新闻记录后重试。')}
 finally{setBusy(false)}
}
async function capturePoster(file){
 const url=URL.createObjectURL(file),video=document.createElement('video');
 video.preload='auto';video.muted=true;video.playsInline=true;video.src=url;
 try{
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error('preview timeout')),7000);
   video.onloadeddata=()=>{clearTimeout(timeout);resolve()};
   video.onerror=()=>{clearTimeout(timeout);reject(new Error('cannot decode'))};
   video.load();
  });
  const w=video.videoWidth,h=video.videoHeight;
  if(!w||!h)return null;
  const scale=Math.min(1,600/w,760/h),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  return await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.68));
 }catch{return null}
 finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
}
async function uploadVideo(file){
 if(!file.name.toLowerCase().endsWith('.mp4')||!['video/mp4','application/mp4','application/octet-stream',''].includes(file.type))
  throw new Error('请上传 MP4 格式的视频');
 if(file.size>MAX_BYTES||file.size<12)throw new Error('视频大小必须在 20 MB 以内');
 notify('正在提取视频封面…');
 const poster=await capturePoster(file);
 const data=new FormData();data.append('video',file,file.name);
 if(poster&&poster.size<=450000)data.append('poster',poster,'cover.jpg');
 notify('正在上传视频到 GitHub videos 仓库，请不要关闭此页面…');
 const response=await fetch(UPLOAD,{method:'POST',headers:{'X-Admin-Key':key()},body:data,cache:'no-store',signal:AbortSignal.timeout(150000)});
 let result;try{result=await response.json()}catch{throw new Error('视频上传服务器未返回 JSON')}
 if(!response.ok||!result.ok)throw new Error(result.error||'视频上传失败（HTTP '+response.status+'）');
 return {videoUrl:result.videoUrl,posterUrl:result.posterUrl||''};
}
refresh.addEventListener('click',refreshNews);
category.addEventListener('change',toggleFields);
videoFile.addEventListener('change',()=>{showPreview(videoFile.files?.[0]||null);toggleFields()});
save.addEventListener('click',async()=>{
 if(busy)return;
 const item={category:category.value,title:title.value.trim(),content:content.value.trim()};
 if(!CATEGORIES.includes(item.category)){notify('请选择新闻分类');return}
 if(!item.title||item.title.length>120){notify('标题须为 1–120 个字符');return}
 if(!item.content||item.content.length>3000){notify('内容描述须为 1–3000 个字符');return}
 if(item.category==='视频精选'){
  item.sourceUrl=source.value.trim();
  if(!sourcePlatform(item.sourceUrl)){notify('请输入有效的小红书或 Telegram HTTPS 原帖链接');return}
  if(!videoFile.files?.[0]&&!uploadedMedia?.videoUrl){notify('视频精选必须上传 MP4 视频（不超过 20 MB）');return}
 }
 setBusy(true);
 try{
  if(item.category==='视频精选'){
   if(videoFile.files?.[0]){uploadedMedia=await uploadVideo(videoFile.files[0]);videoFile.value='';showPreview(null);toggleFields();}
   item.videoUrl=uploadedMedia.videoUrl;item.posterUrl=uploadedMedia.posterUrl||'';
  }
  notify('正在发布到新闻数据源…');
  const data=await request({action:editingId?'update':'create',...(editingId?{id:editingId}:{}),...item});
  items=data.items||[];render();resetForm();notify('已保存。首页新闻与视频精选会自动更新，可能有约 1 分钟缓存。');
 }catch(error){notify('保存失败：'+error.message+'。如视频已经上传成功，可再次保存，不会重复上传。')}
 finally{setBusy(false)}
});
reset.addEventListener('click',resetForm);
$('load').addEventListener('click',()=>{if($('key').value.length>=24)refreshNews()});
resetForm();render();
})();

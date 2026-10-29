/* Admin-only Tech News UI. ADMIN_KEY stays in the existing password field, never persisted. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const ENDPOINT='https://liangyou-icon-review.maddestalistar.workers.dev/news-admin';
const CATEGORIES=['系统提醒','联名上新','应用动态','图标动态','热点播报','联合抽奖','宣传推广','视频精选'];
const list=$('news-items'),category=$('news-category'),title=$('news-title'),content=$('news-content'),notice=$('news-message');
const refresh=$('news-refresh'),save=$('news-save'),reset=$('news-reset'),heading=$('news-form-title');
if(!list||!category||!title||!content||!notice)return;
let editingId=null,busy=false,items=[];
function notify(message){notice.textContent=message}
function tag(name,value){const n=document.createElement(name);if(value!==undefined)n.textContent=value;return n}
async function request(body){
 const key=$('key').value;
 if(key.length<24)throw new Error('请先输入管理员密钥（至少 24 字符）');
 const response=await fetch(ENDPOINT,{
   method:body?'POST':'GET',
   headers:{'X-Admin-Key':key,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),
   cache:'no-store',
   signal:AbortSignal.timeout(35000)
 });
 let data;try{data=await response.json()}catch{throw new Error('服务器没有返回有效的 JSON')}
 if(!response.ok||!data.ok)throw new Error(data.error||'新闻管理请求失败（HTTP '+response.status+'）');
 return data;
}
function resetForm(){editingId=null;category.value=CATEGORIES[0];title.value='';content.value='';heading.textContent='发布一条新闻';save.textContent='发布新闻'}
function render(){
 list.replaceChildren();
 $('news-total').textContent='已发布 '+items.length+' 条';
 if(!items.length){const p=tag('p','暂无新闻记录');p.className='muted';list.append(p);return}
 for(const item of items){
  const card=tag('article');card.className='news-admin-item';
  const meta=tag('div');meta.className='news-admin-meta';
  const kind=tag('span',item.category);kind.className='news-admin-tag';
  const when=tag('span',new Date(item.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}));when.className='muted';
  meta.append(kind,when);
  const h=tag('h3',item.title);
  const p=tag('p',item.content);p.className='news-admin-body';
  const tools=tag('div');tools.className='news-admin-tools';
  const edit=tag('button','编辑');edit.className='secondary';edit.type='button';
  edit.addEventListener('click',()=>{
    editingId=item.id;category.value=item.category;title.value=item.title;content.value=item.content;
    heading.textContent='编辑新闻';save.textContent='保存修改';$('tech-news-admin').scrollIntoView({behavior:'smooth',block:'start'});title.focus();
  });
  const del=tag('button','删除');del.className='danger';del.type='button';
  del.addEventListener('click',async()=>{
    if(busy||!confirm('确认删除这条新闻？\n'+item.title))return;
    await change({action:'delete',id:item.id,confirm:true},'新闻已删除');
    if(editingId===item.id)resetForm();
  });
  tools.append(edit,del);card.append(meta,h,p,tools);list.append(card);
 }
}
function setBusy(state){busy=state;for(const b of [refresh,save,reset])b.disabled=state}
async function refreshNews(){
 if(busy)return;
 setBusy(true);notify('正在读取新闻记录…');
 try{const data=await request();items=data.items||[];render();notify('新闻已同步。新增、修改或删除后，首页会自动获取最新内容。')}
 catch(error){notify('读取失败：'+error.message)}
 finally{setBusy(false)}
}
async function change(body,successMessage){
 if(busy)return;
 setBusy(true);notify('正在保存到新闻数据源…');
 try{
  const data=await request(body);
  items=data.items||[];render();
  notify(successMessage+'。首页可能有约 1 分钟的缓存延迟。');
  if(body.action!=='delete')resetForm();
 }catch(error){notify('保存失败：'+error.message+'。请检查密钥并刷新新闻记录后重试。')}
 finally{setBusy(false)}
}
refresh.addEventListener('click',refreshNews);
save.addEventListener('click',()=>{
 const item={category:category.value,title:title.value.trim(),content:content.value.trim()};
 if(!CATEGORIES.includes(item.category)){notify('请选择新闻分类');return}
 if(!item.title||item.title.length>120){notify('新闻标题须为 1–120 个字符');return}
 if(!item.content||item.content.length>3000){notify('新闻内容须为 1–3000 个字符');return}
 change({action:editingId?'update':'create',...(editingId?{id:editingId}:{}),...item},editingId?'新闻修改成功':'新闻发布成功');
});
reset.addEventListener('click',resetForm);
$('load').addEventListener('click',()=>{if($('key').value.length>=24)refreshNews()});
render();
})();

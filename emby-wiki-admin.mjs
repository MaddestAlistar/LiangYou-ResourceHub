import {STATUS_NAMES,validateWiki} from './emby-wiki-schema.mjs';
import {el,api,buildForm,readForm,fillForm,details,safeCover} from './emby-wiki-ui.mjs';
const $=id=>document.getElementById(id),host=$('wiki-admin-fields'),dialog=$('wiki-admin-edit'),list=$('wiki-admin-list');
buildForm(host,'wiki-edit');
let items=[],busy=false,editing=null;
function message(text,error=false){$('wiki-admin-message').textContent=text;$('wiki-admin-message').className='wk-notice'+(error?' wk-error':'')}
function key(){const value=$('key').value;if(value.length<24)throw Error('请先在上方输入管理员密钥');return value}
function headers(){return {'Content-Type':'application/json','X-Admin-Key':key()}}
async function load(){if(busy)return;busy=true;message('正在读取 Emby Wiki 投稿…');try{const data=await api('/emby-wiki-admin',{headers:headers()});items=data.items;message('已加载 '+items.length+' 份档案。待审核内容不会出现在网页公开板块。')}catch(e){message(e.message,true)}finally{busy=false;render()}}
function edit(item){editing=item;fillForm(host,item);$('wiki-admin-note').value=item.reviewNote||'';$('wiki-admin-remove-cover').checked=false;$('wiki-edit-message').textContent='';$('wiki-edit-title').textContent='编辑档案 · '+item.name;dialog.showModal()}
function render(){
 const filter=$('wiki-admin-filter').value,q=$('wiki-admin-search').value.trim().toLowerCase();
 const filtered=items.filter(x=>(filter==='all'||x.status===filter)&&[x.name,x.nickname,x.id].join(' ').toLowerCase().includes(q));
 $('wiki-admin-count').textContent='待审核 '+items.filter(x=>x.status==='pending').length+' · 已发布 '+items.filter(x=>x.status==='approved').length+' · 当前 '+filtered.length+' 条';
 list.replaceChildren();if(!filtered.length){list.append(el('p','当前没有符合条件的档案。','wk-empty'));return}
 for(const x of filtered){
  const card=el('article',undefined,'wk-card'),body=el('div',undefined,'wk-card-content');
  if(safeCover(x.coverUrl)){const img=el('img',undefined,'wk-cover');img.src=x.coverUrl;img.alt=x.name+'封面';img.loading='lazy';img.onerror=()=>img.remove();card.append(img)}
  body.append(el('span',STATUS_NAMES[x.status]||x.status,'wk-badge'),el('h3',x.name),el('p',x.nature+' · '+x.state,'wk-hint'),el('p','编号：'+x.id,'wk-hint'),el('p','收件时间：'+new Date(x.submittedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'（北京时间）','wk-hint'));
  const full=el('details'),summary=el('summary','展开全部投稿资料');full.append(summary,details(x));body.append(full);
  const note=el('textarea');note.rows=2;note.maxLength=500;note.value=x.reviewNote||'';note.placeholder='审核备注（选填，不在前台展示；勿填隐私）';note.setAttribute('aria-label',x.name+' 审核备注');note.disabled=busy;body.append(note);
  const actions=el('div',undefined,'wk-admin-tools'),editor=el('button','编辑资料','wk-button wk-secondary');editor.disabled=busy;editor.onclick=()=>edit(x);actions.append(editor);
  const choices=x.status==='approved'?[['withdrawn','下架']]:x.status==='pending'?[['approved','通过并发布'],['rejected','拒绝']]:[['approved','通过并发布'],['pending','恢复待审核']];
  for(const [action,label] of choices){const button=el('button',label,'wk-button '+(['rejected','withdrawn'].includes(action)?'wk-danger':''));button.disabled=busy;button.onclick=async()=>{
   if(busy)return;if(!confirm('确认'+label+'「'+x.name+'」？'+(action==='approved'?'通过后会展示在网站 Emby Wiki。':'')))return;
   const noteValue=note.value;busy=true;render();message('正在保存审核结果…');
   try{await api('/emby-wiki-admin',{method:'POST',headers:headers(),body:JSON.stringify({id:x.id,version:x.version,action,note:noteValue})});busy=false;await load();message('已'+label+'「'+x.name+'」。')}
   catch(e){message(e.message,true)}finally{busy=false;render()}
  };actions.append(button)}body.append(actions);card.append(body);list.append(card);
 }
}
$('wiki-admin-refresh').onclick=load;$('load').addEventListener('click',load);$('wiki-admin-filter').onchange=render;$('wiki-admin-search').oninput=render;
$('wiki-edit-close').onclick=()=>{if(!busy)dialog.close()};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
$('wiki-admin-edit-form').onsubmit=async e=>{e.preventDefault();if(busy||!editing)return;let item;try{item=validateWiki(readForm(host))}catch(error){$('wiki-edit-message').textContent=error.message;$('wiki-edit-message').focus();return}
 busy=true;$('wiki-edit-save').disabled=true;$('wiki-edit-message').textContent='正在保存…';
 try{await api('/emby-wiki-admin',{method:'POST',headers:headers(),body:JSON.stringify({id:editing.id,version:editing.version,action:'update',item,note:$('wiki-admin-note').value,removeCover:$('wiki-admin-remove-cover').checked})});dialog.close();busy=false;await load();message('档案资料已更新。已发布档案会同步显示最新内容。')}
 catch(error){$('wiki-edit-message').textContent=error.message}
 finally{busy=false;$('wiki-edit-save').disabled=false}
};

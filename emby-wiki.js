import {NATURES} from './emby-wiki-schema.mjs?v=20261110.5';
import {el,api,stats,details,safeCover} from './emby-wiki-ui.mjs?v=20261110.5';
const $=id=>document.getElementById(id),root=$('emby-wiki');
if(root){
 let items=[],limit=6,loaded=false,loading=false;
 const list=$('wiki-list'),search=$('wiki-search'),nature=$('wiki-nature'),sort=$('wiki-sort'),more=$('wiki-more'),dialog=$('wiki-detail');
 NATURES.forEach(n=>{const o=el('option',n);o.value=n;nature.append(o)});
 function open(item){$('wiki-detail-title').textContent=item.name;$('wiki-detail-meta').textContent=item.nature+' · '+item.state;$('wiki-detail-content').replaceChildren(details(item));dialog.showModal()}
 $('wiki-detail-close').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
 function render(){
  const q=search.value.trim().toLowerCase(),filtered=items.filter(x=>(!nature.value||x.nature===nature.value)&&[x.name,x.summary,x.extraContent,x.registration,...x.contents,...x.qualities].join(' ').toLowerCase().includes(q));
  filtered.sort((a,b)=>sort.value==='name'?a.name.localeCompare(b.name,'zh-CN'):(b[sort.value]||'').localeCompare(a[sort.value]||''));
  list.replaceChildren();$('wiki-count').textContent='已收录 '+items.length+' 台 · 当前匹配 '+filtered.length+' 台';more.hidden=filtered.length<=limit;
  if(!filtered.length){const box=el('div',undefined,'wk-empty');box.append(el('h3',items.length?'没有找到匹配的服务器':'等待第一份服务器档案'),el('p',items.length?'试试其他名称，或切换为全部分类。':'欢迎提交真实资料。审核通过后，服务器卡片与媒体库统计会显示在这里。'));if(items.length){const b=el('button','清除筛选','wk-button wk-secondary');b.onclick=()=>{search.value='';nature.value='';render()};box.append(b)}list.append(box);return}
  for(const x of filtered.slice(0,limit)){
   const card=el('article',undefined,'wk-card');if(safeCover(x.coverUrl)){const img=el('img',undefined,'wk-cover');img.src=x.coverUrl;img.alt=x.name+'封面';img.loading='lazy';img.onerror=()=>img.remove();card.append(img)}
   const content=el('div',undefined,'wk-card-content'),badges=el('div',undefined,'wk-badges');badges.append(el('span',x.nature,'wk-badge'),el('span',x.state,'wk-badge'));content.append(badges,el('h3',x.name),el('p',[...x.contents,...x.qualities].join(' · '),'wk-card-description'),stats(x),el('p','统计于 '+x.statsDate,'wk-hint'));
   content.append(el('p',x.summary||'开号：'+x.registration,'wk-card-description'),el('p',x.nickname+' · 投稿于 '+x.submissionDate,'wk-hint'));
   const b=el('button','查看完整档案 ↗','wk-button wk-secondary');b.type='button';b.setAttribute('aria-label','查看 '+x.name+' 的完整档案');b.onclick=()=>open(x);content.append(b);card.append(content);list.append(card);
  }
 }
 const changed=()=>{limit=6;render()};search.oninput=changed;nature.onchange=changed;sort.onchange=changed;more.onclick=()=>{limit+=6;render()};
 async function load(){if(loading)return;loading=true;list.setAttribute('aria-busy','true');$('wiki-retry').hidden=true;$('wiki-count').textContent='正在读取服务器档案…';try{const data=await api('/emby-wiki-feed');items=data.items;loaded=true;render()}catch(e){$('wiki-count').textContent='档案暂时无法加载';list.replaceChildren(el('p',e.message,'wk-empty'));$('wiki-retry').hidden=false}finally{loading=false;list.setAttribute('aria-busy','false')}}
 $('wiki-retry').onclick=load;
 // Direct links must load even before the section enters the viewport.
 // The async resource gallery above us can move the anchor after initial navigation.
 let anchorPending=location.hash==='#emby-wiki';
 function alignAnchor(){
  if(!anchorPending||location.hash!=='#emby-wiki')return;
  if($('projectGrid')?.getAttribute('aria-busy')==='true')return;
  anchorPending=false;
  requestAnimationFrame(()=>{if(location.hash==='#emby-wiki')root.scrollIntoView({block:'start'})});
 }
 function fromHash(){if(location.hash!=='#emby-wiki'){anchorPending=false;return}anchorPending=true;if(!loaded)load();alignAnchor()}
 window.addEventListener('hashchange',fromHash);
 document.addEventListener('hub:render',alignAnchor);
 const gallery=$('projectGrid');
 if(gallery&&'MutationObserver'in window){
  const galleryObserver=new MutationObserver(()=>{if(gallery.getAttribute('aria-busy')!=='true'){alignAnchor();galleryObserver.disconnect()}});
  galleryObserver.observe(gallery,{attributes:true,attributeFilter:['aria-busy']});
 }
 if(document.readyState!=='complete')window.addEventListener('load',()=>{if(location.hash==='#emby-wiki'){anchorPending=true;alignAnchor()}},{once:true});
 fromHash();
 if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&!loaded){observer.disconnect();load()}},{rootMargin:'300px'});observer.observe(root)}else load();
}

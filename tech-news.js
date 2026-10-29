/* LiangYou Tech News: progressively hydrate the homepage from the admin-published feed.
   Keep the existing three HTML cards visible if the network is unavailable. */
(()=>{'use strict';
const list=document.getElementById('ly-news-list');
if(!list)return;
const endpoint='https://liangyou-icon-review.maddestalistar.workers.dev/news-feed';
const categories=new Set(['系统提醒','联名上新','应用动态','图标动态','热点播报','联合抽奖','宣传推广']);
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node}
function hydrate(items){
 if(!Array.isArray(items))return;
 const fragment=document.createDocumentFragment();let added=0;
 for(const item of items.slice(0,300)){
  if(!item||!categories.has(item.category)||typeof item.title!=='string'||typeof item.content!=='string')continue;
  const article=element('article',undefined,'ly-news-item');
  const label=element('span',item.category,'ly-news-kind');
  const title=element('h3',item.title);
  const content=element('p',item.content);
  article.append(label,title,content);fragment.append(article);added++;
 }
 // If the feed is legitimately empty, show a friendly empty state, not stale pinned news.
 if(!added)fragment.append(element('p','暂无新闻更新','ly-news-empty'));
 list.replaceChildren(fragment);
}
async function refresh(){
 try{
  const response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw new Error('news_http_'+response.status);
  const data=await response.json();
  if(!data?.ok||data.schema!==1||!Array.isArray(data.items))throw new Error('news_invalid');
  hydrate(data.items);
 }catch(error){
  // The initial server-rendered news remains visible when blocked/offline.
  console.info('Tech news feed temporarily unavailable; using homepage snapshot.');
 }
}
refresh();
})();

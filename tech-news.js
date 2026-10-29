/* Tech News feed and two source-specific video cards. No remote HTML injection. */
(()=>{'use strict';
const list=document.getElementById('ly-news-list'),videos=document.getElementById('liangyou-video');
if(!list)return;
const endpoint='https://liangyou-icon-review.maddestalistar.workers.dev/news-feed';
const categories=new Set(['系统提醒','联名上新','应用动态','图标动态','热点播报','联合抽奖','宣传推广','视频精选']);
const VIDEO_ROOT='https://raw.githubusercontent.com/MaddestAlistar/videos/main/clips/';
const FIXED_SOURCE_URLS=new Set(['https://xhslink.cn/o/3eUyzuksTQC','https://xhslink.cn/o/7X4yBrtmKpu']);
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node}
function sourcePlatform(value){
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname.length<2)return null;
  if(['xhslink.cn','xiaohongshu.com','www.xiaohongshu.com','m.xiaohongshu.com'].includes(u.hostname))return 'xhs';
  if(['t.me','www.t.me','telegram.me','www.telegram.me'].includes(u.hostname))return 'tg';
 }catch{}
 return null;
}
function mediaUrl(value,extension){
 if(typeof value!=='string'||!value.startsWith(VIDEO_ROOT))return '';
 const filename=value.slice(VIDEO_ROOT.length);
 return new RegExp('^[a-f0-9-]{36}\\.'+extension+'$').test(filename)?value:'';
}
function buildVideoCard(item){
 const platform=sourcePlatform(item.sourceUrl),src=mediaUrl(item.videoUrl,'mp4'),poster=mediaUrl(item.posterUrl,'jpg');
 if(!platform||!src||typeof item.title!=='string'||typeof item.content!=='string')return null;
 if(FIXED_SOURCE_URLS.has(item.sourceUrl))return null;
 const isTG=platform==='tg';
 const article=element('article',undefined,'ly-news-video-card'+(isTG?' ly-news-video-card--tg':''));
 article.dataset.newsVideo=item.id;
 const cover=element('button',undefined,'ly-news-video-cover');cover.type='button';
 cover.setAttribute('aria-label','在网页内播放：'+item.title);
 cover.dataset.lyVideoOpen='uploaded';cover.dataset.lyVideoSrc=src;
 cover.dataset.lyVideoPoster=poster;
 if(poster){const img=element('img');img.src=poster;img.loading='lazy';img.decoding='async';img.alt=item.title+' 视频封面';img.referrerPolicy='no-referrer';cover.append(img)}
 else cover.append(element('span',isTG?'✈':'▶','ly-news-video-fallback'));
 cover.append(element('span','▶','ly-news-video-play-icon'),element('span',isTG?'频道视频':'视频笔记','ly-news-video-cover-label'));
 const main=element('div',undefined,'ly-news-video-content');
 const tags=element('div',undefined,'ly-news-video-tags');
 tags.append(element('span','视频精选','ly-news-kind ly-news-kind-video'));
 const badge=element('span',undefined,'ly-news-video-platform'+(isTG?' ly-news-video-platform--tg':''));
 const logo=element('span',isTG?'✈':'书');logo.setAttribute('aria-hidden','true');
 badge.append(logo,document.createTextNode(' '+(isTG?'Telegram':'小红书')));
 tags.append(badge);
 const title=element('h3',item.title),desc=element('p',item.content);
 const actions=element('div',undefined,'ly-news-video-actions');
 const play=element('button','▶ 网页内播放','ly-video-action');play.type='button';play.dataset.lyVideoOpen='uploaded';play.dataset.lyVideoSrc=src;play.dataset.lyVideoPoster=poster;
 const source=element('a','查看原帖 ↗','ly-video-original');source.href=item.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';
 actions.append(play,source);main.append(tags,title,desc,actions);article.append(cover,main);
 return article;
}
function hydrate(items){
 if(!Array.isArray(items))return;
 const fragment=document.createDocumentFragment(),dynamicVideo=document.createDocumentFragment();
 let added=0;
 for(const item of items.slice(0,300)){
  if(!item||!categories.has(item.category)||typeof item.title!=='string'||typeof item.content!=='string')continue;
  if(item.category==='视频精选'&&item.videoUrl){
   const video=buildVideoCard(item);
   if(video)dynamicVideo.append(video);
   continue;
  }
  const article=element('article',undefined,'ly-news-item');
  article.append(element('span',item.category,'ly-news-kind'),element('h3',item.title),element('p',item.content));
  fragment.append(article);added++;
 }
 if(!added)fragment.append(element('p','暂无文字新闻更新','ly-news-empty'));
 list.replaceChildren(fragment);
 if(videos){
  videos.querySelectorAll('[data-news-video]').forEach(node=>node.remove());
  videos.prepend(dynamicVideo);
 }
}
async function refresh(){
 try{
  const response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw new Error('news_http_'+response.status);
  const data=await response.json();
  if(!data?.ok||data.schema!==1||!Array.isArray(data.items))throw new Error('news_invalid');
  hydrate(data.items);
 }catch(error){
  // Leave the initial cards and playable videos in place when the API is blocked.
  console.info('Tech News feed unavailable; using homepage snapshot.');
 }
}
refresh();
})();

/* Tech News feed and two source-specific video cards. No remote HTML injection. */
(()=>{'use strict';
const list=document.getElementById('ly-news-list'),videos=document.getElementById('liangyou-video');
if(!list)return;
const endpoint='https://liangyou-icon-review.maddestalistar.workers.dev/news-feed';
const localEndpoint='./data/tech-news-feed.json';
const localImageUrl=value=>typeof value==='string'&&/^\.\/assets\/tech-news\/(?:clip-)?[a-f0-9-]{36}\.jpg$/.test(value)?value:'';
const categories=new Set(['系统提醒','联名上新','应用动态','图标动态','热点播报','联合抽奖','宣传推广','视频精选']);
const VIDEO_ROOT='https://raw.githubusercontent.com/MaddestAlistar/videos/main/clips/';
const NEWS_IMAGE_ROOT='https://raw.githubusercontent.com/MaddestAlistar/videos/main/news-images/';
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
 const platform=sourcePlatform(item.sourceUrl),src=mediaUrl(item.videoUrl,'mp4'),poster=mediaUrl(item.posterUrl,'jpg'),localPoster=localImageUrl(item.localPosterUrl);
 if(!platform||!src||typeof item.title!=='string'||typeof item.content!=='string')return null;
 if(FIXED_SOURCE_URLS.has(item.sourceUrl))return null;
 const isTG=platform==='tg';
 const article=element('article',undefined,'ly-news-video-card'+(isTG?' ly-news-video-card--tg':''));
 article.dataset.newsVideo=item.id;
 const cover=element('button',undefined,'ly-news-video-cover');cover.type='button';
 cover.setAttribute('aria-label','在网页内播放：'+item.title);
 cover.dataset.lyVideoOpen='uploaded';cover.dataset.lyVideoSrc=src;
 cover.dataset.lyVideoPoster=poster;
 if(localPoster||poster){
  const img=element('img');img.src=localPoster||poster;
  if(localPoster&&poster)img.addEventListener('error',()=>{if(img.src.endsWith(localPoster))img.src=poster;},{once:true});
  img.loading='lazy';img.decoding='async';img.alt=item.title+' 视频封面';img.referrerPolicy='no-referrer';cover.append(img);
 }
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
  const image=typeof item.newsImageUrl==='string'&&item.newsImageUrl.startsWith(NEWS_IMAGE_ROOT)
    &&/^[a-f0-9-]{36}\.jpg$/.test(item.newsImageUrl.slice(NEWS_IMAGE_ROOT.length))?item.newsImageUrl:'';
  if(image){
   const img=element('img',undefined,'ly-news-photo');
   const local=localImageUrl(item.localNewsImageUrl);
   img.src=local||image;
   if(local)img.addEventListener('error',()=>{if(img.src.endsWith(local))img.src=image;},{once:true});
   img.alt=item.title;img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
   article.append(img);
  }
  fragment.append(article);added++;
 }
 if(!added)fragment.append(element('p','暂无文字新闻更新','ly-news-empty'));
 list.replaceChildren(fragment);
 if(videos){
  videos.querySelectorAll('[data-news-video]').forEach(node=>node.remove());
  videos.prepend(dynamicVideo);
 }
}
// Homepage HTML is an offline fallback. A first-party JSON mirror restores
// current news in China even when Cloudflare Workers or GitHub raw is blocked.
let lastTimestamp=-1,lastPriority=-1,lastChecked=0;
let mirroredMedia=new Map();
function applyFeed(data,priority){
 if(!data?.ok&&priority===1)return;
 if(data?.schema!==1||!Array.isArray(data.items)||data.items.length>300)return;
 const timestamp=Number.isFinite(Date.parse(data.updatedAt))?Date.parse(data.updatedAt):0;
 if(priority===2){
  mirroredMedia=new Map(data.items.filter(item=>item&&typeof item.id==='string')
   .map(item=>[item.id,item]));
 }
 if(timestamp<lastTimestamp||(timestamp===lastTimestamp&&priority<lastPriority))return;
 lastTimestamp=timestamp;lastPriority=priority;
 // The live feed omits first-party mirror URLs. Retain those for the same
 // asset only; a later edited article must never inherit an obsolete picture.
 hydrate(data.items.map(item=>{
  const mirror=mirroredMedia.get(item?.id);
  return mirror?{...item,
   ...(item.newsImageUrl&&item.newsImageUrl===mirror.newsImageUrl?{localNewsImageUrl:mirror.localNewsImageUrl}:{}),
   ...(item.posterUrl&&item.posterUrl===mirror.posterUrl?{localPosterUrl:mirror.localPosterUrl}:{})
  }:item;
 }));
}
async function loadFeed(url,priority,timeout){
 try{
  const response=await fetch(url,{cache:priority===1?'no-store':'no-cache',
   signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw new Error('news_http_'+response.status);
  const data=await response.json();
  if(!data||data.schema!==1||!Array.isArray(data.items)||priority===1&&data.ok!==true)
   throw new Error('news_invalid');
  applyFeed(data,priority);
 }catch{
  // Preserve the newest successfully rendered news, not older HTML.
  if(priority===1)console.info('Live tech news unavailable; using first-party news snapshot.');
  else console.info('First-party tech news unavailable; retaining homepage fallback.');
 }
}
function refresh(){
 lastChecked=Date.now();
 // Start both in parallel: same-origin snapshot usually arrives first for
 // mainland visitors; the live API can still override a genuinely newer feed.
 void loadFeed(localEndpoint,2,7000);
 void loadFeed(endpoint,1,5000);
}
refresh();
addEventListener('pageshow',event=>{if(event.persisted)refresh();});
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&Date.now()-lastChecked>5*60*1000)refresh();
});
})();

// Tech News for LiangYou Resource Hub, stored in the existing review queue repository.
// Authentication reuses the existing Cloudflare Worker ADMIN_KEY and GITHUB_TOKEN.
export const NEWS_PATH = 'news/tech-news.json';
export const NEWS_CATEGORIES = Object.freeze(['系统提醒','联名上新','应用动态','图标动态','热点播报','联合抽奖','宣传推广','视频精选']);
const categories = new Set(NEWS_CATEGORIES);
export const VIDEO_MAX_BYTES = 20 * 1024 * 1024;
const VIDEO_REPO = 'MaddestAlistar/videos';
const VIDEO_PREFIX = 'clips/';
const VIDEO_ROOT = 'https://raw.githubusercontent.com/' + VIDEO_REPO + '/main/' + VIDEO_PREFIX;
export function sourceOf(urlValue){
 if(typeof urlValue!=='string'||urlValue.length>1200)return null;
 let url;try{url=new URL(urlValue.trim())}catch{return null}
 if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
 const host=url.hostname.toLowerCase();
 if(['xhslink.cn','www.xiaohongshu.com','xiaohongshu.com','m.xiaohongshu.com'].includes(host)&&url.pathname.length>1)return 'xhs';
 if(['t.me','www.t.me','telegram.me','www.telegram.me'].includes(host)&&url.pathname.length>1)return 'tg';
 return null;
}
function videoAsset(value,ext,required=true){
 if(!value&&!required)return '';
 if(typeof value!=='string'||!value.startsWith(VIDEO_ROOT))throw new Error('请先上传视频到 videos 仓库');
 const suffix=value.slice(VIDEO_ROOT.length);
 if(!new RegExp('^[a-f0-9-]{36}\\.'+ext+'$').test(suffix))throw new Error('视频素材地址无效');
 return value;
}
const json = (data,status,origin,cache='no-store') => new Response(JSON.stringify(data),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':origin,
  'Vary':'Origin','Cache-Control':cache,'X-Content-Type-Options':'nosniff'
}});
const validText = (value,max) => typeof value === 'string' && value.trim().length>=1 &&
  value.trim().length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
export function validateNewsItem(body,{legacy=false}={}){
  const category=body?.category, title=body?.title?.trim(), content=body?.content?.trim();
  if(!categories.has(category))throw new Error('请选择有效的新闻标签');
  if(!validText(title,120))throw new Error('新闻标题须为 1–120 个字符');
  if(!validText(content,3000))throw new Error('新闻内容须为 1–3000 个字符');
  if(category==='视频精选'){
    if(legacy&&!body?.videoUrl&&!body?.sourceUrl)return {category,title,content};
    const sourceUrl=body?.sourceUrl?.trim();
    const platform=sourceOf(sourceUrl);
    if(!platform)throw new Error('原网站链接仅支持小红书或 Telegram 的 HTTPS 链接');
    const videoUrl=videoAsset(body?.videoUrl,'mp4');
    const posterUrl=videoAsset(body?.posterUrl,'jpg',false);
    return {category,title,content,sourceUrl,platform,videoUrl,posterUrl};
  }
  return {category,title,content};
}
export function cleanNewsData(data){
  if(data?.schema!==1 || !Array.isArray(data.items) || data.items.length>300)throw new Error('新闻数据结构错误');
  const ids=new Set();
  const items=data.items.map(row=>{
    if(typeof row.id!=='string'||!/^news-[a-z0-9-]{6,64}$/.test(row.id)||ids.has(row.id))throw new Error('新闻编号损坏或重复');
    ids.add(row.id);
    const validated=validateNewsItem(row,{legacy:true});
    const createdAt=typeof row.createdAt==='string'?row.createdAt:'';
    const updatedAt=typeof row.updatedAt==='string'?row.updatedAt:createdAt;
    if(!Number.isFinite(Date.parse(createdAt))||!Number.isFinite(Date.parse(updatedAt)))throw new Error('新闻时间格式错误');
    return {id:row.id,...validated,createdAt,updatedAt};
  });
  items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
  return {schema:1,updatedAt:data.updatedAt||null,items};
}
function encodeNews(text){
  const bytes=new TextEncoder().encode(text);let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
function decodeNews(text){
  const bytes=Uint8Array.from(atob(text.replace(/\s/g,'')),ch=>ch.charCodeAt(0));
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
function newsGithub(env,fetcher) {
  if(!env.GITHUB_TOKEN||!env.REVIEW_REPO)throw new Error('新闻存储未配置');
  const url='https://api.github.com/repos/'+env.REVIEW_REPO+'/contents/'+NEWS_PATH;
  const headers={'Authorization':'Bearer '+env.GITHUB_TOKEN,'Accept':'application/vnd.github+json',
    'Content-Type':'application/json','User-Agent':'LiangYou-Tech-News','X-GitHub-Api-Version':'2022-11-28'};
  return async(options={})=>fetcher(url,{...options,headers,signal:AbortSignal.timeout(20000)});
}
async function loadNews(gh) {
  const response=await gh();
  if(!response.ok){
    if(response.status===404)return {sha:null,news:{schema:1,updatedAt:null,items:[]}};
    throw new Error('读取新闻失败（HTTP '+response.status+'）');
  }
  const file=await response.json();
  let data;try{data=JSON.parse(decodeNews(file.content))}catch{throw new Error('新闻 JSON 无法解析')}
  return {sha:file.sha,news:cleanNewsData(data)};
}
export async function serveTechNews(request,env,{origin='',allowed='https://maddestalistar.github.io',fetcher=fetch}={}){
  const pathname=new URL(request.url).pathname;
  const publicFeed=pathname==='/news-feed';
  if(!publicFeed&&pathname!=='/news-admin')return null;
  const cors=publicFeed?'*':(origin===allowed?origin:'null');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{
    'Access-Control-Allow-Origin':cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type, X-Admin-Key','Access-Control-Max-Age':'600'
  }});
  if(publicFeed&&request.method!=='GET')return json({error:'Method not allowed'},405,cors);
  if(!publicFeed){
    if(origin!==allowed)return json({error:'Origin not allowed'},403,cors);
    if(!env.ADMIN_KEY)return json({error:'管理员密钥未配置'},503,cors);
    const key=request.headers.get('X-Admin-Key')||'';
    if(key.length<24||key!==env.ADMIN_KEY)return json({error:'管理员密钥错误'},401,cors);
    if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405,cors);
  }
  try {
    const gh=newsGithub(env,fetcher);
    if(request.method==='GET'){
      const {news}=await loadNews(gh);
      return json({ok:true,...news},200,cors,publicFeed?'public, max-age=60':'no-store');
    }
    let body;try{body=await request.json()}catch{return json({error:'请求 JSON 无效'},400,cors)}
    const action=body?.action;
    if(!['create','update','delete'].includes(action))return json({error:'操作无效'},400,cors);
    let validated;
    if(action!=='delete')try{validated=validateNewsItem(body)}catch(e){return json({error:e.message},400,cors)}
    if(action!=='create'&&(typeof body.id!=='string'||!/^news-[a-z0-9-]{6,64}$/.test(body.id)))
      return json({error:'新闻编号无效'},400,cors);
    if(action==='delete' && body.confirm!==true)return json({error:'删除操作需要确认'},400,cors);
    const now=new Date().toISOString();
    const freshId='news-'+crypto.randomUUID();
    for(let attempt=0;attempt<3;attempt++){
      const {sha,news}=await loadNews(gh);
      if(action==='create'){
        if(news.items.length>=300)return json({error:'新闻记录已满（300 条），请先清理历史记录'},409,cors);
        news.items.unshift({id:freshId,...validated,createdAt:now,updatedAt:now});
      } else {
        const index=news.items.findIndex(x=>x.id===body.id);
        if(index===-1)return json({error:'新闻不存在，请刷新后重试'},404,cors);
        if(action==='update')news.items[index]={...news.items[index],...validated,updatedAt:now};
        else news.items.splice(index,1);
      }
      news.updatedAt=now;
      const payload={message:'news: '+action+(body.id?' '+body.id:''),content:encodeNews(JSON.stringify(news,null,2)+'\n')};
      if(sha)payload.sha=sha;
      const response=await gh({method:'PUT',body:JSON.stringify(payload)});
      if(response.ok)return json({ok:true,...cleanNewsData(news)},200,cors);
      if(response.status===409||response.status===422)continue;
      return json({error:'GitHub 保存失败（HTTP '+response.status+'），请重试'},502,cors);
    }
    return json({error:'其他管理员同时更新了新闻，请刷新后重试'},409,cors);
  } catch(error) {
    return json({error:error.message||'新闻操作失败，请稍后重试'},502,cors);
  }
}

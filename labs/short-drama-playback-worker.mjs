// Auditable, metadata-only short-drama playback adapter.
// No reverse-engineered mobile requests, URL scraping, signatures, decryptors,
// credentials in responses, or proxying of HLS/video/segment bytes.
const SITE_ORIGIN = 'https://maddestalistar.github.io';
const VERSION = 'authorized-streams-20261102-v1';
const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
const WORK_ID = /^[a-z0-9][a-z0-9-]{4,99}$/i;
const MAX_EPISODES = 160;
const TOKEN_PARAMS = /(?:^|&)(?:api_?key|access_?token|auth|authorization|key|signature|secret|token|play_?token)=/i;
const isHost = host => typeof host === 'string' &&
  host.length < 240 && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(host) &&
  !host.endsWith('.local') && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
const safeMediaURL = (value,allowedHosts) => {
  if(typeof value!=='string'||value.length>1900)return '';
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.hash||
       u.port&&u.port!=='443'||!isHost(u.hostname)||
       !allowedHosts.includes(u.hostname.toLowerCase())||
       TOKEN_PARAMS.test(u.search.slice(1)))return '';
    return u.href;
  }catch{return '';}
};
const cors = request => request.headers.get('Origin')===SITE_ORIGIN ?
  {'Access-Control-Allow-Origin':SITE_ORIGIN,'Vary':'Origin'}:{'Vary':'Origin'};
const respond = (request,body,status=200,head={}) => new Response(JSON.stringify(body),{
  status,headers:{...HEADERS,...cors(request),...head}
});
const parseManifest = raw => {
  if(typeof raw!=='string'||!raw||raw.length>1500000)return null;
  try{
    const data=JSON.parse(raw);
    if(data?.schema!==1||typeof data.works!=='object'||!data.works||
      Array.isArray(data.works)||!Array.isArray(data.allowedMediaHosts)||
      data.allowedMediaHosts.length>15)return null;
    const hosts=[...new Set(data.allowedMediaHosts.filter(isHost).map(x=>x.toLowerCase()))];
    if(!hosts.length||Object.keys(data.works).length>200)return null;
    return {works:data.works,hosts};
  }catch{return null;}
};
const selectEpisodes = (manifest,id,title) => {
  const work=Object.hasOwn(manifest.works,id)?manifest.works[id]:null;
  if(!work||typeof work.title!=='string'||work.title.length>150||
     work.title.trim().normalize('NFKC')!==title.trim().normalize('NFKC')||
     !Array.isArray(work.episodes)||work.episodes.length>MAX_EPISODES)return [];
  const seen=new Set();
  const result=[];
  for(const ep of work.episodes){
    if(!ep||typeof ep!=='object')continue;
    const number=Number(ep.number);
    if(!Number.isSafeInteger(number)||number<1||number>2000||seen.has(number))continue;
    const url=safeMediaURL(ep.url,manifest.hosts);
    if(!url)continue;
    const path=new URL(url).pathname.toLowerCase();
    const mime=path.endsWith('.m3u8')?'application/vnd.apple.mpegurl':
      path.endsWith('.mp4')?'video/mp4':'';
    if(!mime)continue;
    seen.add(number);
    result.push({number,label:'第'+number+'集',url,mime});
  }
  return result.sort((a,b)=>a.number-b.number);
};
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='OPTIONS'){
      if(request.headers.get('Origin')!==SITE_ORIGIN)return respond(request,{error:'forbidden_origin'},403);
      return new Response(null,{status:204,headers:{
        ...cors(request),'Access-Control-Allow-Methods':'GET, OPTIONS',
        'Access-Control-Allow-Headers':'Accept',
        'Access-Control-Max-Age':'3600',
        'Cache-Control':'no-store',
      }});
    }
    if(request.method!=='GET'&&request.method!=='HEAD')
      return respond(request,{error:'method_not_allowed'},405,{Allow:'GET, HEAD, OPTIONS'});
    if(url.pathname==='/health'){
      const manifest=parseManifest(env.AUTHORIZED_DRAMA_STREAMS_JSON);
      const body={ok:true,service:'short-drama-playback',version:VERSION,
        configured:Boolean(manifest),videoProxy:false,mode:'metadata-only'};
      const result=respond(request,body);
      return request.method==='HEAD'?new Response(null,{status:200,headers:result.headers}):result;
    }
    if(url.pathname!=='/api/resolve')
      return respond(request,{error:'not_found'},404);
    if(request.headers.get('Origin')!==SITE_ORIGIN)
      return respond(request,{error:'forbidden_origin'},403);
    if(request.method!=='GET')return respond(request,{error:'method_not_allowed'},405);
    if(url.search.length>350||Array.from(url.searchParams).some(([k])=>!['workId','title'].includes(k)))
      return respond(request,{error:'invalid_query'},400);
    const id=(url.searchParams.get('workId')||'').trim();
    const title=(url.searchParams.get('title')||'').trim();
    if(!WORK_ID.test(id)||title.length<2||title.length>140||/[\x00-\x1f]/.test(title))
      return respond(request,{error:'invalid_identity'},400);
    const manifest=parseManifest(env.AUTHORIZED_DRAMA_STREAMS_JSON);
    if(!manifest)return respond(request,{error:'not_configured',episodes:[]},503);
    const episodes=selectEpisodes(manifest,id,title);
    if(!episodes.length)return respond(request,{error:'no_authorized_episodes',episodes:[]},404);
    return respond(request,{episodes},200);
  }
};
export {parseManifest,selectEpisodes,safeMediaURL};

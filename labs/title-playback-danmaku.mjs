// Read-only, bounded danmaku adapter for a user-supplied DandanPlay-compatible endpoint.
// No videos, media fragments, credentials or arbitrary upstream URLs are sent to clients.
const DEFAULT_DANMAKU_BASE="http://nl.jc.cd/87654321";
const ALLOWED_ORIGIN="https://maddestalistar.github.io";
const shrink=s=>String(s??"").trim().slice(0,120);
const normalized=s=>shrink(s).toLowerCase()
 .replace(/\s*from\s+.+$/i,"")
 .replace(/（[^）]*）|\([^)]*\)|【[^】]*】|\[[^\]]*\]/g,"")
 .replace(/第\s*\d+\s*[季部]|\bseason\s*\d+\b|\bs\d+\b/gi,"")
 .replace(/[《》〈〉\s\-_:：·.,，。!?！？\/\\“”"'’]/g,"");
function exactTitle(actual,record){
 const a=normalized(actual);
 if(!a||a.length<2)return false;
 if(![record.title,record.originalTitle].some(x=>x&&normalized(x)===a))return false;
 const actualYear=String(actual||"").match(/[(（]\s*((?:19|20)\d\d)\s*[）)]/)?.[1];
 if(actualYear&&record.year&&String(record.year)!==actualYear)return false;
 return true;
}
function episodeMatches(label,kind,target){
 if(kind==="movie")return true;
 const text=String(label||"");
 const match=text.match(/(?:第\s*0*(\d{1,4})\s*[集话話期回])|(?:\bE(?:P)?\s*0*(\d{1,4})\b)|(?:^|[【\[\s])0*(\d{1,4})(?=[】\]\s]|$)/i);
 return !!match&&Number(match[1]||match[2]||match[3])===target;
}
function seasonMatches(actual,record,season){
 if(season===1)return !/(?:第\s*(?:[二三四五六七八九十]|[2-9])\s*季|\bS(?:eason)?\s*[2-9]\b)/i.test(actual||"");
 const m=String(actual||"").match(/第\s*([一二三四五六七八九十\d]+)\s*季|\b(?:Season|S)\s*(\d+)\b/i);
 if(!m)return false;
 const zh={一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
 const val=m[1]||m[2];
 return (zh[val]||Number(val))===season;
}
function chooseMatch(matches,record,kind,episode){
 if(!Array.isArray(matches))return null;
 return matches.find(x=>x&&Number.isSafeInteger(Number(x.episodeId))&&Number(x.episodeId)>0&&
   exactTitle(x.animeTitle,record)&&episodeMatches(x.episodeTitle,kind,episode))||null;
}
function trimComment(x,shift=0){
 const p=String(x?.p||"").split(",");
 // DandanPlay JSON commonly has p="time,mode,color,source";
 // Bilibili XML converted JSON may instead have p="time,mode,size,color,...".
 const rawColor=p.length>=4&&/^\d+$/.test(p[3])?p[3]:p[2];
 const time=Number(p[0])+shift,mode=Number(p[1]),color=Number(rawColor);
 const content=String(x?.m||"").replace(/[\u0000-\u001F\u007F]/g," ").trim().slice(0,120);
 if(!Number.isFinite(time)||time<0||time>86400||![1,4,5].includes(mode)||
  !Number.isInteger(color)||color<0||color>0xffffff||!content)return null;
 return {time:Math.round(time*10)/10,mode,color,text:content};
}
function parseComments(value,shift=0){
 const list=Array.isArray(value?.comments)?value.comments:[];
 const safeShift=Number.isFinite(Number(shift))?Math.max(-300,Math.min(300,Number(shift))):0;
 const stride=Math.max(1,Math.ceil(list.length/3000)),out=[];
 for(let i=0;i<list.length&&out.length<3000;i+=stride){
  const item=trimComment(list[i],safeShift);if(item)out.push(item);
 }
 return out.sort((a,b)=>a.time-b.time);
}
async function jsonBounded(url,options={},limit=900000,timeoutMs=9500,fetcher=fetch){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
 try{
  const r=await fetcher(url,{...options,redirect:"manual",signal:ctrl.signal});
  if(r.status!==200)return {http:r.status,value:null};
  const length=Number(r.headers.get("content-length")||0);
  if(length>limit)return {http:413,value:null};
  const reader=r.body?.getReader();let count=0,chunks=[];
  if(reader){
   while(true){
    const step=await reader.read();
    if(step.done)break;
    count+=step.value.byteLength;
    if(count>limit){await reader.cancel();return {http:413,value:null};}
    chunks.push(step.value);
   }
  }
  const bytes=Buffer.concat(chunks.map(x=>Buffer.from(x)));
  let value=null;try{value=JSON.parse(bytes.toString("utf8"));}catch{}
  return {http:r.status,value};
 }finally{clearTimeout(timer);}
}
function indexKey(record,kind,season){
 const u=new URL("https://liangyou-title-playback.maddestalistar.workers.dev/api/danmaku/index");
 u.searchParams.set("title",normalized(record.title));
 u.searchParams.set("original",normalized(record.originalTitle));
 u.searchParams.set("year",record.year||"");
 u.searchParams.set("kind",kind);u.searchParams.set("season",String(season));
 u.searchParams.set("version","2");
 return new Request(u.href);
}
function extractIndex(data,record,kind,season){
 const groups=Array.isArray(data?.animes)?data.animes:[];
 const entries=[];
 for(const group of groups.slice(0,150)){
  if(!exactTitle(group.animeTitle,record)||!seasonMatches(group.animeTitle,record,season))continue;
  for(const ep of (Array.isArray(group.episodes)?group.episodes:[]).slice(0,3000)){
   const id=Number(ep?.episodeId);
   if(!Number.isSafeInteger(id)||id<=0)continue;
   entries.push({episodeId:id,animeTitle:shrink(group.animeTitle),
    episodeTitle:shrink(ep.episodeTitle)});
   if(entries.length>=3600)break;
  }
  if(entries.length>=3600)break;
 }
 return entries;
}
async function readSeriesIndex(record,kind,season,{fetcher,base,cache}={}){
 const key=indexKey(record,kind,season);
 if(cache){
  try{
   const hit=await cache.match(key);
   if(hit){
    const data=await hit.json();
    if(Array.isArray(data.items))return {items:data.items,cached:true,throttled:false};
   }
  }catch{}
 }
 // A one-time series index is cheaper than calling /match for every episode.
 // DandanPlay-compatible results include animes[].episodes[] and episodeId.
 const names=[record.title,record.originalTitle].filter(Boolean).slice(0,2);
 let throttled=false;
 for(const name of names){
  try{
   const q=new URL("api/v2/search/episodes",base);
   q.searchParams.set("anime",name);
   const r=await jsonBounded(q.href,{headers:{"accept":"application/json"}},2500000,11000,fetcher);
   if(r.http===429){throttled=true;break;}
   if(r.value?.success!==true||!Array.isArray(r.value.animes))continue;
   const items=extractIndex(r.value,record,kind,season);
   if(!items.length)continue;
   if(cache){
    try{
     const response=new Response(JSON.stringify({items}),{headers:{
      "cache-control":"public,max-age=21600","content-type":"application/json"}});
     // Cache only positive title indexes. Never turn a transient timeout into "no episodes".
     await cache.put(key,response);
    }catch{}
   }
   return {items,cached:false,throttled:false};
  }catch{}
 }
 return {items:[],throttled};
}
async function lookupDanmaku(record,kind,season,episode,{fetcher=fetch,base=DEFAULT_DANMAKU_BASE,cache=null}={}){
 const baseUrl=new URL(base.replace(/\/$/,"")+"/");
 if(!["http:","https:"].includes(baseUrl.protocol))return {status:"unavailable",comments:[]};
 const seenIds=new Set();
 const candidates=[];
 let throttled=false;
 // Prefer cached whole-series episode index: once indexed, adjacent episodes need
 // only ONE upstream request (comments), rather than match+comment each time.
 const indexed=await readSeriesIndex(record,kind,season,{fetcher,base:baseUrl,cache});
 throttled=indexed.throttled;
 for(const item of indexed.items){
  if(episodeMatches(item.episodeTitle,kind,episode)&&!seenIds.has(item.episodeId)){
   candidates.push(item);seenIds.add(item.episodeId);
   if(candidates.length>=4)break;
  }
 }
 // Old deployments may not implement /search/episodes, so retain /match as fallback.
 // A rate-limited response must not trigger a burst of more upstream requests.
 if(!candidates.length&&!throttled){
  const names=[record.title,record.originalTitle].filter(Boolean).slice(0,2);
  for(const name of names){
   const nameString=kind==="movie"?name+" "+(record.year||""):
    name+" S"+String(season).padStart(2,"0")+"E"+String(episode).padStart(2,"0");
   try{
    const res=await jsonBounded(new URL("api/v2/match",baseUrl).href,{
     method:"POST",headers:{"content-type":"application/json","accept":"application/json"},
     body:JSON.stringify({fileName:nameString})},160000,7500,fetcher);
    if(res.http===429){throttled=true;break;}
    if(res.value?.isMatched!==true)continue;
    const selected=chooseMatch(res.value.matches,record,kind,episode);
    if(!selected||!seasonMatches(selected.animeTitle,record,season))continue;
    const id=Number(selected.episodeId);
    if(!seenIds.has(id)){candidates.push(selected);seenIds.add(id);}
    break;
   }catch{}
  }
 }
 let sawEmpty=false;
 for(const item of candidates){
  try{
   const result=await jsonBounded(new URL("api/v2/comment/"+
    encodeURIComponent(String(item.episodeId))+"?format=json",baseUrl).href,{
     headers:{"accept":"application/json"}},3500000,10500,fetcher);
   if(result.http===429){throttled=true;break;}
   if(result.value&&Array.isArray(result.value.comments)){
    const comments=parseComments(result.value,item.shift);
    if(comments.length)return {status:"ready",comments};
    sawEmpty=true;
   }
  }catch{}
 }
 return {status:throttled?"unavailable":sawEmpty?"empty":"unavailable",comments:[]};
}
const json=(value,ttl=0)=>new Response(JSON.stringify(value),{status:200,headers:{
 "content-type":"application/json; charset=utf-8",
 "access-control-allow-origin":ALLOWED_ORIGIN,
 "cache-control":ttl?"public,max-age="+ttl:"no-store",
 "x-content-type-options":"nosniff"}});
async function handleDanmaku(req,env,ctx){
 const u=new URL(req.url);
 const m=u.pathname.match(/^\/api\/danmaku\/work\/([a-z][a-z0-9-]{2,90})$/);
 if(!m||req.method!=="GET")return json({ok:false,status:"bad_request"});
 const title=shrink(u.searchParams.get("title")),originalTitle=shrink(u.searchParams.get("original"));
 const year=shrink(u.searchParams.get("year")).slice(0,4);
 const kind=u.searchParams.get("kind"),season=Number(u.searchParams.get("season")),
  episode=Number(u.searchParams.get("episode"));
 if(!["movie","tv"].includes(kind)||title.length<2||title.length>90||originalTitle.length>110||
  year&&!/^(18|19|20)\d{2}$/.test(year)||!Number.isInteger(season)||season<1||season>60||
  !Number.isInteger(episode)||episode<1||episode>3000||
  kind==="movie"&&(season!==1||episode!==1))return json({ok:false,status:"bad_params"});
 // The availability endpoint returns only metadata, not hundreds of KB of comments.
 // Both endpoints share the exact same full-payload cache key.
 const checkOnly=u.searchParams.get("check")==="1";
 const cacheUrl=new URL(u.href);cacheUrl.searchParams.delete("check");
 const cacheKey=new Request(cacheUrl.href,{method:"GET"});
 const cached=await caches.default.match(cacheKey);
 if(cached){
  if(!checkOnly)return cached;
  const found=await cached.json();
  return json({ok:true,status:found.status,workId:m[1],kind,season,episode,
    available:found.status==="ready"&&found.count>0,count:found.count||0},180);
 }
 const record={title,originalTitle,year};
 const data=await lookupDanmaku(record,kind,season,episode,{
  base:env.DANMAKU_API_BASE||DEFAULT_DANMAKU_BASE,
  cache:caches.default
 });
 const count=data.comments.length,available=data.status==="ready"&&count>0;
 const full=json({ok:true,status:data.status,workId:m[1],kind,season,episode,
   count,comments:data.comments},available?21600:0);
 if(available)ctx?.waitUntil?.(caches.default.put(cacheKey,full.clone()));
 if(checkOnly)return json({ok:true,status:data.status,workId:m[1],kind,season,episode,
   available,count},available?180:0);
 return full;
}
export {lookupDanmaku,chooseMatch,exactTitle,episodeMatches,seasonMatches,extractIndex,readSeriesIndex,parseComments,handleDanmaku};

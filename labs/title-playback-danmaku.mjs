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
 const match=text.match(/(?:第\s*0*(\d{1,4})\s*[集话話期])|(?:\bE(?:P)?\s*0*(\d{1,4})\b)/i);
 return !!match&&Number(match[1]||match[2])===target;
}
function chooseMatch(matches,record,kind,episode){
 if(!Array.isArray(matches))return null;
 return matches.find(x=>x&&Number.isSafeInteger(Number(x.episodeId))&&Number(x.episodeId)>0&&
   exactTitle(x.animeTitle,record)&&episodeMatches(x.episodeTitle,kind,episode))||null;
}
function trimComment(x,shift=0){
 const p=String(x?.p||"").split(",");
 const time=Number(p[0])+shift,mode=Number(p[1]),color=Number(p[3]);
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
async function lookupDanmaku(record,kind,season,episode,{fetcher=fetch,base=DEFAULT_DANMAKU_BASE}={}){
 // Only host-configured upstream; callers cannot choose URLs.
 const baseUrl=new URL(base.replace(/\/$/,"")+"/");
 if(!["http:","https:"].includes(baseUrl.protocol))return {status:"unavailable",comments:[]};
 const names=[record.title,record.originalTitle].filter(Boolean).slice(0,2);
 for(const name of names){
  const nameString=kind==="movie"?name+" "+(record.year||""):
   name+" S"+String(season).padStart(2,"0")+"E"+String(episode).padStart(2,"0");
  let matchData;
  try{
   const call=await jsonBounded(new URL("api/v2/match",baseUrl).href,{
    method:"POST",headers:{"content-type":"application/json","accept":"application/json"},
    body:JSON.stringify({fileName:nameString})},160000,8500,fetcher);
   matchData=call.value;
  }catch{continue;}
  if(matchData?.isMatched!==true)continue;
  const selected=chooseMatch(matchData.matches,record,kind,episode);
  if(!selected)continue;
  try{
   const raw=await jsonBounded(new URL("api/v2/comment/"+
     encodeURIComponent(String(selected.episodeId))+"?format=json",baseUrl).href,{
      headers:{"accept":"application/json"}},1400000,9500,fetcher);
   if(raw.value&&Array.isArray(raw.value.comments)){
    const comments=parseComments(raw.value,selected.shift);
    return {status:comments.length?"ready":"empty",comments};
   }
  }catch{}
 }
 return {status:"unavailable",comments:[]};
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
 const cacheKey=new Request(u.href,{method:"GET"});
 const cached=await caches.default.match(cacheKey);
 if(cached)return cached;
 const record={title,originalTitle,year};
 const data=await lookupDanmaku(record,kind,season,episode,{
  base:env.DANMAKU_API_BASE||DEFAULT_DANMAKU_BASE
 });
 const result=json({ok:true,status:data.status,workId:m[1],kind,season,episode,
   count:data.comments.length,comments:data.comments},data.status==="ready"?1800:120);
 // Only useful to cache a valid match; avoid caching transient network failures.
 if(data.status==="ready")ctx?.waitUntil?.(caches.default.put(cacheKey,result.clone()));
 return result;
}
export {lookupDanmaku,chooseMatch,exactTitle,episodeMatches,parseComments,handleDanmaku};

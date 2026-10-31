// Community skip markers for a confirmed work/season/episode.
// Reads are public. No API key is needed or exposed. Never proxies video data.
const ORIGIN="https://maddestalistar.github.io";
function respond(value,ttl=0){
 return new Response(JSON.stringify(value),{headers:{"content-type":"application/json; charset=utf-8",
  "cache-control":ttl?"public, max-age="+ttl:"no-store","access-control-allow-origin":ORIGIN,
  "x-content-type-options":"nosniff"}});
}
const number=(n)=>n==null?null:Number(n);
function boundedSegment(value,type,duration){
 if(!value||typeof value!=="object")return null;
 const startMs=value.start_ms??value.startMs, endMs=value.end_ms??value.endMs;
 const hasSeconds=value.start_sec!==undefined||value.end_sec!==undefined;
 const start=hasSeconds?(number(value.start_sec)??0):(number(startMs)==null?0:number(startMs)/1000);
 const end=hasSeconds?number(value.end_sec):(number(endMs)==null?null:number(endMs)/1000);
 if(!Number.isFinite(start)||start<0||start>86400||end!==null&&
    (!Number.isFinite(end)||end<=start||end>86400))return null;
 if(end!==null&&end-start<3)return null;
 if(type==="intro"&&end!==null&&end-start>360)return null;
 if(type==="recap"&&end!==null&&end-start>600)return null;
 if(type==="outro"&&end!==null&&end-start>1200)return null;
 if(duration>0&&(start>duration+5||end!==null&&end>duration+5))return null;
 const confidence=number(value.confidence);
 if(confidence!==null&&Number.isFinite(confidence)&&confidence<.55)return null;
 return {start:Math.round(start*10)/10,end:end===null?null:Math.round(end*10)/10};
}
function fromTheIntroDb(payload,duration){
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||payload.kind==="episodes"||
    payload.kind==="versions")return [];
 const segments=[];
 for(const [key,type] of [["intro","intro"],["recap","recap"],["credits","outro"],
                           ["outro","outro"],["post_credits","postCredits"],["preview","preview"]]){
  const raw=payload[key];
  const values=Array.isArray(raw)?raw:raw?[raw]:[];
  for(const val of values.slice(0,5)){
   const segment=boundedSegment(val,type,duration);
   if(segment)segments.push({type,...segment});
  }
 }
 return segments.slice(0,18).sort((a,b)=>a.start-b.start);
}
function fromIntrodbApp(payload,duration){
 if(!payload||typeof payload!=="object"||Array.isArray(payload))return [];
 const segments=[];
 for(const [key,type] of [["intro","intro"],["recap","recap"],["outro","outro"],
   ["post_credits","postCredits"]]){
  const val=payload[key];if(!val)continue;
  const seg=boundedSegment(val,type,duration);
  if(seg)segments.push({type,...seg});
 }
 return segments.sort((a,b)=>a.start-b.start);
}
async function getPublicJSON(url,fetcher=fetch,timeout=6500){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
 try{
  const r=await fetcher(url,{method:"GET",signal:ctrl.signal,redirect:"error",
    headers:{"accept":"application/json"}});
  if(!r.ok||Number(r.headers.get("content-length")||0)>120000)return null;
  const txt=await r.text();
  if(txt.length>120000)return null;
  return JSON.parse(txt);
 }catch{return null;}finally{clearTimeout(timer);}
}
async function lookupSegments({kind,tmdb,imdb,season,episode,duration},fetcher=fetch){
 if(tmdb){
  const u=new URL("https://api.theintrodb.org/v4/media");
  u.searchParams.set("tmdb_id",String(tmdb));
  if(kind==="tv"){u.searchParams.set("season",String(season));u.searchParams.set("episode",String(episode));}
  if(duration)u.searchParams.set("duration_ms",String(Math.round(duration*1000)));
  const body=await getPublicJSON(u.href,fetcher,6500);
  const segments=fromTheIntroDb(body,duration);
  if(segments.length)return {status:"ready",source:"TheIntroDB",segments};
 }
 if(imdb){
  const u=new URL("https://api.introdb.app/segments");
  u.searchParams.set("imdb_id",imdb);
  if(kind==="tv"){u.searchParams.set("season",String(season));u.searchParams.set("episode",String(episode));}
  else u.searchParams.set("is_movie","true");
  const body=await getPublicJSON(u.href,fetcher,6500);
  const segments=fromIntrodbApp(body,duration);
  if(segments.length)return {status:"ready",source:"IntroDB",segments};
 }
 return {status:"not_found",source:null,segments:[]};
}
async function handleSkip(req,env,ctx){
 const u=new URL(req.url),m=u.pathname.match(/^\/api\/skip\/work\/([a-z][a-z0-9-]{2,90})$/);
 if(!m||req.method!=="GET")return respond({ok:false,status:"bad_request"});
 const kind=u.searchParams.get("kind"),season=Number(u.searchParams.get("season")),
  episode=Number(u.searchParams.get("episode"));
 const tmdb=Number(u.searchParams.get("tmdb")||0);
 const imdb=u.searchParams.get("imdb")||"";
 const duration=Number(u.searchParams.get("duration")||0);
 const idMatch=/^tmdb-(movie|tv)-([1-9]\d{0,9})$/.exec(m[1]);
 if(!["tv","movie"].includes(kind)||!Number.isSafeInteger(season)||season<1||season>60||
  !Number.isSafeInteger(episode)||episode<1||episode>3000||
  kind==="movie"&&(season!==1||episode!==1)||
  !Number.isSafeInteger(tmdb)||tmdb<0||tmdb>1e10||
  imdb&&!/^tt\d{5,12}$/.test(imdb)||
  idMatch&&(kind!==idMatch[1]||Number(idMatch[2])!==tmdb)||
  !Number.isFinite(duration)||duration<0||duration>86400)
  return respond({ok:false,status:"bad_params"});
 if(!tmdb&&!imdb)return respond({ok:true,status:"no_identifier",segments:[]});
 // Duration is bucketed to avoid high-cardinality cache keys.
 const roundedDuration=duration?Math.round(duration/10)*10:0;
 const query={kind,tmdb,imdb,season,episode,duration:roundedDuration};
 const key=new Request(u.origin+"/api/skip/cache/"+m[1]+"?"+new URLSearchParams(
  Object.entries(query).map(([k,v])=>[k,String(v)])));
 try{
  const cached=await caches.default.match(key);if(cached)return cached;
  const data=await lookupSegments(query);
  const result=respond({ok:true,status:data.status,workId:m[1],kind,season,episode,
    segments:data.segments},data.status==="ready"?21600:0);
  if(data.status==="ready")ctx?.waitUntil?.(caches.default.put(key,result.clone()));
  return result;
 }catch{return respond({ok:true,status:"unavailable",workId:m[1],kind,season,episode,segments:[]});}
}
export {boundedSegment,fromTheIntroDb,fromIntrodbApp,lookupSegments,handleSkip};

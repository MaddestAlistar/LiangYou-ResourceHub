// Private upstream availability diagnostic. Never logs authentication path or comment contents.
// Only requests the user-supplied default-token endpoint from a disposable CI runner.
const hosts=["http://nl.jc.cd/87654321","https://nl.jc.cd/87654321"];
async function grab(url,options={}){
 const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),10000);
 try{
  const response=await fetch(url,{...options,redirect:"manual",signal:ctl.signal});
  const raw=await response.text();
  let value;try{value=JSON.parse(raw);}catch{}
  return {status:response.status,contentType:response.headers.get("content-type")||"",
    value,bytes:raw.length};
 }finally{clearTimeout(timeout);}
}
function matchSummary(result){
 const m=result?.value?.matches;
 return {status:result.status,bytes:result.bytes,success:result.value?.success,
   isMatched:result.value?.isMatched,matchCount:Array.isArray(m)?m.length:0,
   titles:Array.isArray(m)?m.slice(0,3).map(x=>String(x.animeTitle||"").slice(0,42)):[],
   episodeIds:Array.isArray(m)?m.slice(0,2).map(x=>x.episodeId):[],
   episodeTitles:Array.isArray(m)?m.slice(0,3).map(x=>String(x.episodeTitle||"").slice(0,55)):[],
   contentType:result.contentType};
}
let chosen=null;
for(let i=0;i<hosts.length;i++){
 const host=hosts[i],label=i===0?"http":"https";
 try{
  const r=await grab(host+"/api/v2/search/anime?keyword="+encodeURIComponent("死神"));
  console.log("SEARCH",JSON.stringify({transport:label,http:r.status,bytes:r.bytes,
    success:r.value?.success,results:r.value?.animes?.length??r.value?.data?.length??null,
    responseKeys:r.value?Object.keys(r.value).slice(0,8):[]}));
  if(r.status===200&&r.value){chosen=host;break;}
 }catch(e){console.log("SEARCH",JSON.stringify({transport:label,error:String(e.name||"request_failed")}));}
}
try{
 const via=await grab("https://liangyou-title-playback.maddestalistar.workers.dev/api/danmaku/check");
 console.log("CLOUDFLARE_PROBE",JSON.stringify({http:via.status,available:via.value?.available??null,
  upstreamHttp:via.value?.upstreamHttp??null,reason:via.value?.reason??null,shape:via.value?.shape||[]}));
}catch(e){console.log("CLOUDFLARE_PROBE",JSON.stringify({error:String(e?.name||"request_failed")}));}
if(!chosen){console.log("SUMMARY",JSON.stringify({endpointReachable:false,reason:"Both transports unavailable"}));process.exit(0);}
// Diagnostic compares whole-series index and match formatting, without logging comments.
// A single all-episodes query should be reusable across episode 1/2/4.
try{
 const req=chosen+"/api/v2/search/episodes?anime="+encodeURIComponent("死神");
 const r=await grab(req);
 const groups=Array.isArray(r.value?.animes)?r.value.animes:[];
 const items=groups.flatMap(g=>Array.isArray(g.episodes)?
   g.episodes.map(e=>({...e,animeTitle:g.animeTitle,animeId:g.animeId})) :[]);
 const episodes=items.filter(x=>/第\s*[124]\s*[集话話]|(?:EP?)0?[124]\b/i.test(x.episodeTitle||""));
 console.log("EPISODE_INDEX",JSON.stringify({
  http:r.status,bytes:r.bytes,success:r.value?.success,groupCount:groups.length,
  episodeCount:items.length,samples:episodes.slice(0,8).map(x=>({
   animeTitle:String(x.animeTitle||"").slice(0,55),
   episodeTitle:String(x.episodeTitle||"").slice(0,55),
   episodeId:x.episodeId,animeId:x.animeId}))
 }));
}catch(e){console.log("EPISODE_INDEX",JSON.stringify({error:String(e.name||"network_error")}));}
console.log("SUMMARY",JSON.stringify({endpointReachable:true,serverSideOnly:true,videoProxied:false}));

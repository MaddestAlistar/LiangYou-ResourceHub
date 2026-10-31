// Independent per-title playback metadata adapter. Never proxies video bytes.
// Uses an upstream user-provided Rex source for discovery; verifies TMDB title identity.
// Browser obtains direct HTTPS media only after explicit selection.
import {createHash,createCipheriv,randomBytes} from "node:crypto";
import {discoverExtra} from "./playback-extra-sources.mjs";

const ORIGIN="https://maddestalistar.github.io";
const SOURCE_HOST="app2.dsx.ac";
const SOURCE_ENDPOINT="http://"+SOURCE_HOST+"/ndsx.php/v7/logs";
const BUILD="1791855838435",APP_PACKAGE="com.zyx.cheyong";
const response=(body,status=200,cache=0)=>new Response(JSON.stringify(body),{status,headers:{
  "content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN,
  "cache-control":cache?"public,max-age="+cache:"no-store",
  "x-content-type-options":"nosniff","vary":"Origin"}});
const clean=s=>String(s??"").trim().slice(0,120);
const normalize=s=>clean(s).toLowerCase().replace(/【[^】]*】|\[[^\]]*\]|（[^）]*）|\([^)]*\)/g,"")
  .replace(/[《》〈〉\s\-_:：·,.，。!?！？\/\\“”"'’]/g,"");
const removeSeason=s=>String(s).replace(/第\s*[一二三四五六七八九十两零\d]+\s*季|\bseason\s*\d+\b|\bs\d+\b/gi,"");
function seasonIn(s){
 const m=String(s||"").match(/第\s*([一二三四五六七八九十两零\d]+)\s*季|\bseason\s*(\d+)\b|\bs(\d+)\b/i);
 if(!m){
  const trailing=String(s||"").match(/\s([2-9]|[1-5]\d)$/);
  return trailing?Number(trailing[1]):0;
 }
 const n=m[1]||m[2]||m[3];if(/^\d+$/.test(n))return Number(n);
 const d={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
 if(n.includes("十")){const p=n.split("十");return (d[p[0]]||1)*10+(d[p[1]]||0);}
 return d[n]||0;
}
function encrypt(method,data){
 const key=createHash("md5").update(BUILD+"^~!@#[-"+APP_PACKAGE).digest();
 const iv=randomBytes(16);const cipher=createCipheriv("aes-128-cbc",key,iv);
 const raw=JSON.stringify({method,data:{...data,token:""},csrf:Date.now()});
 return Buffer.concat([iv,cipher.update(raw,"utf8"),cipher.final()]).toString("base64url");
}
async function fetchLimited(url,opts={},maxMs=7500){
 const u=new URL(url);
 if(!["http:","https:"].includes(u.protocol)||u.username||u.password||
   u.hostname==="localhost"||/(\.local|\.internal)$/.test(u.hostname)||
   /^\d{1,3}(?:\.\d{1,3}){3}$/.test(u.hostname)||u.hostname.includes(":")||
   u.port&&!["80","443"].includes(u.port))throw Error("unsafe_destination");
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),maxMs);
 try{return await fetch(u.href,{...opts,redirect:"manual",signal:abort.signal});}
 finally{clearTimeout(timer);}
}
async function limitedText(res,max=120000){
 const reader=res.body?.getReader();if(!reader)return "";
 let n=0,parts=[];
 while(true){
  const p=await reader.read();if(p.done)break;
  n+=p.value.length;if(n>max){await reader.cancel();throw Error("response_too_large");}
  parts.push(p.value);
 }
 return new TextDecoder().decode(Buffer.concat(parts.map(x=>Buffer.from(x))));
}
async function sourceApi(method,data){
 const resp=await fetchLimited(SOURCE_ENDPOINT,{method:"POST",headers:{
  "content-type":"text/plain","user-agent":"Dart/3.13 (dart:io)","version":"2.0.0",
  "version-number":"220","pk-id":APP_PACKAGE,"build-time":BUILD,"platform":"ios"},
  body:encrypt(method,data)},9500);
 if(!resp.ok)throw Error("source_http_"+resp.status);
 const text=await limitedText(resp,160000);
 let obj=null;try{obj=JSON.parse(text);}catch{throw Error("source_invalid_json");}
 if(Number(obj.code)!==1)throw Error("source_unavailable");
 return obj.data;
}
async function tmdb(kind,id,env){
 const key=env.TMDB_API_KEY?.trim(),bearer=env.TMDB_READ_ACCESS_TOKEN?.trim();
 if(!bearer&&!key)throw Error("tmdb_not_configured");
 const url=new URL("https://api.themoviedb.org/3/"+kind+"/"+id);
 url.searchParams.set("language","zh-CN");
 if(!bearer)url.searchParams.set("api_key",key);
 const r=await fetchLimited(url.toString(),{headers:bearer?{"authorization":"Bearer "+bearer}:{}} ,9500);
 if(!r.ok)throw Error("tmdb_http_"+r.status);
 const body=await r.json();
 if(Number(body.id)!==id||body.adult||!String(body.title||body.name||"").trim())throw Error("wrong_tmdb_identity");
 return {title:clean(body.title||body.name),originalTitle:clean(body.original_title||body.original_name),
   year:String(body.release_date||body.first_air_date||"").slice(0,4),
   seasons:(Array.isArray(body.seasons)?body.seasons:[]).filter(s=>Number.isInteger(s.season_number)&&s.season_number>0&&s.season_number<=60)
     .map(s=>({number:s.season_number,episodeCount:Math.min(3000,Math.max(0,Number(s.episode_count)||0))})).slice(0,45)};
}
function rank(item,names,kind,season,year){
 if(!item?.vod_id||/解说|预告|花絮|片段|混剪/.test(clean(item.vod_name)+" "+clean(item.vod_state)))return 0;
 if(kind==="movie"&&Number(item.type_id)!==1)return 0;
 if(kind==="tv"&&Number(item.type_id)===1)return 0;
 const s=seasonIn(item.vod_name);
 if(kind==="tv"&&(season>1?s!==season:s>1))return 0;
 const comparable=name=>normalize(kind==="tv"?
   removeSeason(name).replace(/\s+\d{1,2}$/, ""):removeSeason(name));
 const provided=comparable(item.vod_name);
 const equal=names.some(n=>comparable(n)===provided&&provided.length>=2);
 if(!equal)return 0;
 const sourceYear=Number(item.vod_year),targetYear=Number(year);
 if(sourceYear>0&&targetYear>0&&Math.abs(sourceYear-targetYear)>1&&kind==="movie")return 0;
 // Prefer the exact named work over dub editions, edits and other parenthetical variants.
 // Keep qualifiers for this exact-match pass (normalize() strips them intentionally).
 const preserve=name=>clean(name).toLowerCase().replace(/[《》\s·\-_:：,.，。!?！？]/g,"");
 const exact=names.some(n=>preserve(n)===preserve(item.vod_name));
 return (exact?130:100)+(sourceYear>0&&targetYear>0&&Math.abs(sourceYear-targetYear)<=1?5:0);
}
async function matchSource(kind,record,season){
 const names=[record.title,record.originalTitle].filter(s=>s&&s.length>1);
 let best=null,attempted=0;
 for(const n of names.slice(0,2)){
  let results=[];
  try{const data=await sourceApi("search",{text:n,pg:1});if(Array.isArray(data))results=data;}
  catch{continue;}
  attempted++;
  for(const item of results.slice(0,60)){
   const score=rank(item,names,kind,season,record.year);
   if(score>(best?.score||0))best={item,score};
  }
  if(best?.score>=105)break;
 }
 if(!best)return {status:attempted?"no_match":"unavailable",record,source:null};
 let data;
 try{data=await sourceApi("video_detail",{id:best.item.vod_id,sign_md5:"",apk_path:"",apk_length:0});}
 catch{return {status:"unavailable",record,source:null};}
 const info=data?.vod_info;
 if(!info||String(info.vod_id)!==String(best.item.vod_id))return {status:"unavailable",record,source:null};
 const list=Array.isArray(info.vod_url_with_player)?info.vod_url_with_player:[];
 return {status:"matched",record,source:{title:clean(info.vod_name||best.item.vod_name),
   identityYear:clean(info.vod_year||best.item.vod_year),lines:list.slice(0,22)}};
}
function entries(line){
 const parsed=[];
 for(const part of String(line.url||"").split("#").slice(0,3000)){
  const at=part.indexOf("$");if(at<1)continue;
  const name=part.slice(0,at),u=part.slice(at+1);
  const num=name.match(/^\s*(?:第\s*)?0*(\d{1,4})\s*(?:[集话話期]|$)/);
  parsed.push({number:num?Number(num[1]):null,url:u});
 }
 return parsed;
}
function availableEpisodes(lines,kind){
 const nums=new Set();
 for(const line of lines){
  const parts=entries(line),numbered=parts.some(x=>x.number!=null);
  if(kind==="movie"){if(parts.length)nums.add(1);continue;}
  parts.forEach((part,i)=>{const n=numbered?part.number:i+1;if(n&&n>0&&n<=3000)nums.add(n);});
 }
 return [...nums].sort((a,b)=>a-b).slice(0,3000);
}
function selectEntry(line,kind,episode){
 const rows=entries(line);
 if(kind==="movie")return episode===1?rows[0]:null;
 const numbered=rows.some(r=>r.number!=null);
 return numbered?rows.find(r=>r.number===episode):rows[episode-1];
}
const direct=u=>/^https?:\/\/\S+\.(?:m3u8|mp4|mov)(?:[?#]|$)/i.test(u);
function parseCandidates(line,input){
 let a=[line.parse_api,...String(line.extra_parse_api||"").split(/\r?\n/)];const out=new Set();
 for(let s of a){s=String(s||"").trim();if(!/^https?:\/\//i.test(s))continue;
  const raw=s.includes("{url}")?s.replace("{url}",encodeURIComponent(input)):s+encodeURIComponent(input);
  if(raw.length<4500)out.add(raw);
 }
 return [...out].slice(0,3);
}
function decoded(value,depth=0){
 if(depth>=5||value==null)return null;
 if(typeof value==="string"){
  const v=value.trim();if(direct(v))return v;
  try{return decoded(JSON.parse(v),depth+1);}catch{return null;}
 }
 if(Array.isArray(value))return value.map(v=>decoded(v,depth+1)).find(Boolean)||null;
 if(typeof value!=="object"||value.code!=null&&![1,200].includes(Number(value.code)))return null;
 for(const k of ["url","play_url","playUrl","video_url"])
  if(typeof value[k]==="string"&&direct(value[k]))return value[k];
 return ["data","result","play"].map(k=>decoded(value[k],depth+1)).find(Boolean)||null;
}
function fromHtml(s){
 const html=String(s||"").replace(/&amp;/gi,"&").replace(/\\\//g,"/");
 const urls=[];
 for(const tag of html.match(/<(?:video|source)\b[^>]{0,1800}>/gi)||[]){
  const m=tag.match(/\bsrc\s*=\s*["'](https?:\/\/[^"']+)["']/i);if(m)urls.push(m[1]);
 }
 urls.push(...(html.match(/https?:\/\/[^\s"'<>\\]{5,1500}?\.(?:m3u8|mp4|mov)(?:[?#][^\s"'<>\\]*)?/gi)||[]));
 return urls.find(direct)||null;
}
async function candidateUrl(url){
 const r=await fetchLimited(url,{headers:{accept:"application/json,text/plain,text/html,*/*"}},7000);
 if(!r.ok)return null;
 const contentType=r.headers.get("content-type")||"";
 if(Number(r.headers.get("content-length")||0)>160000){await r.body?.cancel();return null;}
 const text=await limitedText(r,160000);
 if(/html/i.test(contentType))return fromHtml(text);
 try{return decoded(JSON.parse(text));}catch{return decoded(text);}
}
async function validMedia(url,kind){
 let parsed;try{parsed=new URL(url);}catch{return null;}
 if(parsed.protocol!=="https:"||parsed.username||parsed.password||!direct(url))return null;
 const type=/\.m3u8(?:[?#]|$)/i.test(parsed.href)?"hls":"mp4";
 let r;
 try{r=await fetchLimited(parsed.href,{method:"GET",headers:{"origin":ORIGIN,"range":"bytes=0-1023"}},8000);}
 catch{return null;}
 if(![200,206].includes(r.status)){await r.body?.cancel();return null;}
 const cors=r.headers.get("access-control-allow-origin");
 const allowCors=cors==="*"||cors===ORIGIN;
 if(type==="hls"&&!allowCors){await r.body?.cancel();return null;}
 const n=Number(r.headers.get("content-length")||0);
 const size=Number(r.headers.get("content-range")?.split("/")?.[1]||n);
 if(type==="mp4"&&size>0&&size<(kind==="movie"?80:20)*1000000){await r.body?.cancel();return null;}
 const reader=r.body?.getReader();let bytes=new Uint8Array(0);
 if(reader){const first=await reader.read();bytes=first.value||bytes;await reader.cancel();}
 const sig=type==="hls"?new TextDecoder().decode(bytes.subarray(0,60)).trimStart().startsWith("#EXTM3U"):
  bytes.length>=8&&Buffer.from(bytes.subarray(4,8)).toString("ascii")==="ftyp";
 if(!sig)return null;
 return {url:parsed.href,format:type,mime:type==="hls"?"application/vnd.apple.mpegurl":"video/mp4",cors:allowCors};
}
async function resolveExtras(extraLines,kind,episode,skip=""){
 const candidates=extraLines.filter(x=>x.number===episode&&x.provider!==skip);
 if(!candidates.length)return {media:null,latencyMs:null,considered:0};
 const started=Date.now(),distinct=new Set(),selected=[];
 for(const line of candidates){
  if(selected.length>=12)break;
  const key=line.provider+"|"+line.channel;
  if(distinct.has(key))continue;distinct.add(key);selected.push(line);
 }
 // Rank based on real response time to a tiny Range request.
 // This is server-side latency, not a guarantee of the viewer's throughput.
 const out=await Promise.all(selected.map(async entry=>{
  const t=Date.now();let media=null;
  try{media=await validMedia(entry.url,kind);}catch{}
  return media?{...media,sourceKey:entry.provider,latencyMs:Date.now()-t}:null;
 }));
 const valid=out.filter(Boolean).sort((a,b)=>a.latencyMs-b.latencyMs);
 return {media:valid[0]||null,latencyMs:valid[0]?.latencyMs??null,considered:selected.length,
   // one reserve line for same-provider errors when alternative provider absent
   alternatives:valid.slice(1,4).map(x=>({sourceKey:x.sourceKey,latencyMs:x.latencyMs}))};
}
async function chooseVerifiedStream(primaryLines,extraLines,kind,episode,skip=""){
 const races=[];
 if(skip!=="primary"&&primaryLines.length)
  races.push(resolve(primaryLines,kind,episode).then(x=>x.media?{...x.media,sourceKey:"primary"}:null));
 if(extraLines?.length)
  races.push(resolveExtras(extraLines,kind,episode,skip).then(x=>x.media||null));
 if(!races.length)return null;
 try{return await Promise.any(races.map(p=>p.then(x=>{if(!x)throw Error("no_media");return x;})));}
 catch{return null;}
}
async function resolve(lines,kind,episode){
 // Prefer inexpensive parser metadata checks over historically failing direct HLS links.
 // Three bounded workers can verify different lines without one slow source starving others.
 const started=Date.now(),diagnostics=[];
 const ranked=lines.slice(0,18).map((line,i)=>({line,index:i+1})).sort((a,b)=>
  Number(Boolean(a.line.parse_secret))-Number(Boolean(b.line.parse_secret))||
  Number(entries(a.line).some(x=>direct(x.url)))-Number(entries(b.line).some(x=>direct(x.url))));
 let cursor=0;
 async function verifyOne(){
  while(cursor<Math.min(14,ranked.length)&&Date.now()-started<35000){
   const {line,index}=ranked[cursor++],entry=selectEntry(line,kind,episode);
   if(!entry?.url)continue;
   const trace={line:index,mode:line.parse_secret?"secret":direct(entry.url)?"direct":"parser",
     parserAttempts:0,candidates:0,accepted:false};
   const candidates=[];
   if(!line.parse_secret&&direct(entry.url))candidates.push(entry.url);
   if(line.parse_secret){
    try{
     const data=await sourceApi("secret_parse_api_url",{url:entry.url,player_code:String(line.code||"")});
     const u=decoded(data);if(u)candidates.push(u);
    }catch{trace.secretError=true;}
   }else if(!direct(entry.url)){
    for(const url of parseCandidates(line,entry.url)){
     if(Date.now()-started>35000)break;
     trace.parserAttempts++;
     try{
      const found=await candidateUrl(url);
      if(found){candidates.push(found);break;}
     }catch{trace.parseError=true;}
    }
   }
   trace.candidates=candidates.length;
   for(const item of candidates){
    try{
     const result=await validMedia(item,kind);
     if(result){trace.accepted=true;diagnostics.push(trace);return result;}
    }catch{}
   }
   diagnostics.push(trace);
  }
  throw Error("no_verified_media");
 }
 try{
  const media=await Promise.any(Array.from({length:Math.min(3,ranked.length)},()=>verifyOne()));
  return {media,diagnostics};
 }catch{return {media:null,diagnostics};}
}
export default {
 async fetch(req,env,ctx){
  const u=new URL(req.url);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
   "access-control-allow-origin":ORIGIN,"access-control-allow-methods":"GET,OPTIONS",
   "access-control-allow-headers":"content-type","access-control-max-age":"86400"}});
  if(req.method!=="GET")return response({ok:false,error:"method"},405);
  if(u.pathname==="/health")return response({ok:true,service:"title-playback-metadata",version:"1.0",videoProxy:false});
  const m=u.pathname.match(/^\/api\/(title|play)\/(movie|tv)\/([1-9]\d{0,9})$/);
  const w=u.pathname.match(/^\/api\/(title|play)\/work\/([a-z][a-z0-9-]{2,90})$/);
  if(!m&&!w)return response({ok:false,error:"not_found"},404);
  const mode=m?m[1]:w[1],kind=m?m[2]:u.searchParams.get("kind");
  const id=m?Number(m[3]):null,workId=w?w[2]:"tmdb-"+kind+"-"+id;
  const season=kind==="movie"?1:Number(u.searchParams.get("season")||1);
  const episode=kind==="movie"?1:Number(u.searchParams.get("episode")||1);
  const workTitle=clean(u.searchParams.get("title")),originalTitle=clean(u.searchParams.get("original"));
  const year=clean(u.searchParams.get("year")).slice(0,4);
  if(!["movie","tv"].includes(kind)||m&&(id>1e10||!Number.isSafeInteger(id))||
     !Number.isInteger(season)||season<1||season>60||
     !Number.isInteger(episode)||episode<1||episode>3000||
     w&&(workTitle.length<2||workTitle.length>90||originalTitle.length>90||
       year&&!/^(18|19|20)\d\d$/.test(year)))return response({ok:false,error:"bad_params"},400);
  // For titles without a TMDB ID, use their existing public catalog work identifier,
  // original title, year and kind. No cross-title or global search UI.
  const metadataUrl=new URL(u.origin+"/api/title/"+(w?"work/"+workId:kind+"/"+id));
  metadataUrl.searchParams.set("season",String(season));
  // Bust cached source selections when ranking rules change.
  metadataUrl.searchParams.set("resolver","multi-sources-v1");
  if(w){metadataUrl.searchParams.set("kind",kind);metadataUrl.searchParams.set("title",workTitle);
    metadataUrl.searchParams.set("original",originalTitle);metadataUrl.searchParams.set("year",year);}
  const metadataKey=new Request(metadataUrl.href);
  try{
   let cached=await caches.default.match(metadataKey),base=null;
   if(cached)base=await cached.json();
   if(!base){
    const record=w?{title:workTitle,originalTitle,year,seasons:[]}:await tmdb(kind,id,env);
    // Three independent source families, one work identity. The VOD catalogue is
    // sampled with a strict request budget to keep Cloudflare costs bounded.
    const [found,extra]=await Promise.all([
      matchSource(kind,record,season),
      discoverExtra(record,kind,season,{siteLimit:8})
    ]);
    const mainEps=found.source?availableEpisodes(found.source.lines,kind):[];
    const union=[...new Set([...mainEps,...extra.episodes])].sort((a,b)=>a-b).slice(0,3000);
    const usable=found.status==="matched"||union.length>0;
    const result={ok:true,kind,tmdbId:id,workId,title:record.title,year:record.year,season,
      seasons:kind==="movie"?[]:record.seasons,
      status:usable?"matched":found.status,episodes:union,
      matchedTitle:found.source?found.source.title:union.length?record.title:null};
    base={...result,_lines:found.source?.lines||[],_extraLines:extra.lines};
    // Keep successful work/episode mapping through brief upstream outages.
    // A failed upstream connection is not proof that a title has no source:
    // never negative-cache "unavailable".
    if(found.status!=="unavailable"){
      ctx.waitUntil(caches.default.put(metadataKey,new Response(JSON.stringify(base),{
        headers:{"cache-control":"public,max-age="+(found.status==="matched"?1800:120)}})));
    }
   }
   if(mode==="title"){const {_lines,_extraLines,...pub}=base;return response(pub,200,base.status==="matched"?60:0);}
   if(base.status!=="matched"||!base.episodes.includes(episode))
    return response({ok:false,status:"no_episode",kind,tmdbId:id,workId,season,episode},404);
   const skip=["primary","jianpian","aggregate"].includes(u.searchParams.get("skip"))?
     u.searchParams.get("skip"):"";
   const media=await chooseVerifiedStream(base._lines||[],base._extraLines||[],kind,episode,skip);
   if(!media)return response({ok:false,status:"no_verified_stream",kind,tmdbId:id,workId,season,episode});
   return response({ok:true,status:"ready",kind,tmdbId:id,workId,season,episode,
     media,videoProxied:false,verifiedTitle:base.matchedTitle},200);
  }catch(e){
   return response({ok:false,status:"unavailable",error:"source_not_ready",kind,tmdbId:id},502);
  }
 }
};

export {normalize,rank,availableEpisodes,selectEntry,fromHtml};

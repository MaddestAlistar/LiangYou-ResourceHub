// JustWatch availability via official TMDB endpoints. No browser API credentials.
const regionCodes=new Set(["US","GB","CA","AU","JP","KR","DE","FR","IT","ES","NL","BR","IN","HK","TW","SG","TH","MY","PH","CN","NZ"]);
const ttl=21600;
const cors="https://maddestalistar.github.io";
function reply(payload,status=200,seconds=0){
 return new Response(JSON.stringify(payload),{status,headers:{
  "content-type":"application/json; charset=utf-8","access-control-allow-origin":cors,
  "cache-control":seconds?"public,max-age="+seconds:"no-store",
  "x-content-type-options":"nosniff","vary":"Origin"
 }});
}
const simplify=rows=>Array.isArray(rows)?rows.filter(x=>x&&typeof x.provider_name==="string"&&Number.isSafeInteger(x.provider_id)).slice(0,35).map(p=>({
 id:p.provider_id,name:p.provider_name,logo:p.logo_path&&/^\/[\w/.]+$/.test(p.logo_path)?"https://image.tmdb.org/t/p/w92"+p.logo_path:null
})): [];

const numericId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0&&Number(v)<1e10;
async function jsonRemote(uri,opts={},timeout=8500){
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout);
 try{const r=await fetch(uri,{...opts,signal:ac.signal});if(!r.ok)throw Error("upstream_"+r.status);return await r.json();}
 finally{clearTimeout(timer);}
}
function safeHttps(v,host){
 try{const u=new URL(v);return u.protocol==="https:"&&(!host||u.hostname===host||u.hostname.endsWith("."+host))?u.href:null;}catch{return null;}
}
async function tmdbInfo(kind,id,env){
 const token=env.TMDB_READ_ACCESS_TOKEN?.trim(),api=env.TMDB_API_KEY?.trim();
 if(!token&&!api)throw Error("TMDB credential missing");
 const u=new URL("https://api.themoviedb.org/3/"+kind+"/"+id);
 u.searchParams.set("append_to_response","external_ids");u.searchParams.set("language","en-US");
 if(!token)u.searchParams.set("api_key",api);
 const x=await jsonRemote(u.toString(),{headers:token?{Authorization:"Bearer "+token}:{}});
 if(Number(x.id)!==Number(id)||x.adult||!String(x.title||x.name||"").trim())throw Error("TMDB identity mismatch");
 return x;
}
async function mediaInsights(kind,id,env){
 const title=await tmdbInfo(kind,id,env), ext=title.external_ids||{};
 const imdb=/^tt\d{5,12}$/.test(title.imdb_id||ext.imdb_id||"")?(title.imdb_id||ext.imdb_id):null;
 const tvdb=kind==="tv"&&numericId(ext.tvdb_id)?Number(ext.tvdb_id):null;
 const wikidata=/^Q[1-9]\d{0,11}$/.test(ext.wikidata_id||"")?ext.wikidata_id:null;
 const result={ok:true,kind,tmdbId:Number(id),imdbId:imdb,tvdbId:tvdb,wikidataId:wikidata,
   originalTitle:title.original_title||title.original_name||"",title:title.title||title.name,
   checkedAt:new Date().toISOString(),sources:{},artwork:[],tvdb:null,wikidata:null,boxOffice:null,news:[]};
 const jobs=[];
 const task=(name,fn)=>jobs.push((async()=>{try{const x=await fn();result.sources[name]=x?"ok":"no_data";}catch{result.sources[name]="unavailable";}})());
 if(wikidata){
  task("wikidata",async()=>{
   const d=await jsonRemote("https://www.wikidata.org/wiki/Special:EntityData/"+wikidata+".json");
   const entity=d.entities?.[wikidata];if(!entity||entity.id!==wikidata)return null;
   result.wikidata={id:wikidata,url:"https://www.wikidata.org/wiki/"+wikidata,
     label:entity.labels?.zh?.value||entity.labels?.en?.value||""};return true;
  });
 }else result.sources.wikidata="identity_missing";
 if(env.FANARTTV_API_KEY||env.FANART_TV_API_KEY){
  task("fanart",async()=>{
   const key=env.FANARTTV_API_KEY||env.FANART_TV_API_KEY,reference=kind==="movie"?id:tvdb;
   if(!reference){result.sources.fanart="identity_missing";return null;}
   const endpoint="https://webservice.fanart.tv/v3.2/"+(kind==="movie"?"movies/":"tv/")+reference;
   const d=await jsonRemote(endpoint,{headers:{"api-key":key}});
   if(kind==="movie"&&d.tmdb_id&&Number(d.tmdb_id)!==Number(id))return null;
   const props=kind==="movie"?["moviebackground","moviethumb","movieposter"]:["showbackground","tvthumb","tvposter"];
   result.artwork=props.flatMap(p=>(d[p]||[]).slice(0,2).map(a=>({type:p,url:safeHttps(a.url,"fanart.tv"),language:a.lang||null,source:"Fanart.tv"}))).filter(x=>x.url).slice(0,4);
   return result.artwork.length>0;
  });
 }else result.sources.fanart="not_configured";
 if(tvdb&&(env.THETVDB_API_KEY||env.TVDB_API_KEY)){
  task("thetvdb",async()=>{
   const login=await jsonRemote("https://api4.thetvdb.com/v4/login",
     {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
       apikey:env.THETVDB_API_KEY||env.TVDB_API_KEY,...(env.THETVDB_PIN?{pin:env.THETVDB_PIN}:{})})});
   const token=login.data?.token;if(!token)return null;
   const d=await jsonRemote("https://api4.thetvdb.com/v4/series/"+tvdb+"/extended",
     {headers:{Authorization:"Bearer "+token}},8500);
   if(Number(d.data?.id)!==tvdb)return null;
   result.tvdb={id:tvdb,url:"https://thetvdb.com/dereferrer/series/"+tvdb,
     name:d.data.name||"",firstAired:d.data.firstAired||"",status:d.data.status?.name||"",
     seasons:Array.isArray(d.data.seasons)?d.data.seasons.filter(s=>s.number>0).length:null,
     summary:String(d.data.overview||"").slice(0,400)};
   return true;
  });
 }else result.sources.thetvdb=tvdb?"not_configured":"identity_missing";
 if(imdb&&(env.OMDB_API_KEY||env.OMDB_KEY)&&kind==="movie"){
  task("omdb",async()=>{
   const endpoint=new URL("https://www.omdbapi.com/");endpoint.searchParams.set("i",imdb);
   endpoint.searchParams.set("apikey",env.OMDB_API_KEY||env.OMDB_KEY);
   const d=await jsonRemote(endpoint);
   if(d.Response!=="True"||d.imdbID!==imdb)return null;
   if(/^\$[\d,]+$/.test(d.BoxOffice||""))result.boxOffice={label:"US domestic box office",amount:d.BoxOffice,source:"OMDb",sourceUrl:"https://www.imdb.com/title/"+imdb+"/"};
   return !!result.boxOffice;
  });
 }else result.sources.omdb=kind==="movie"?"not_configured":"not_applicable";
 const q=title.original_title||title.original_name||title.title||title.name||"";
 if(env.THE_GUARDIAN_API_KEY&&q.length>=5&&q.length<=90){
  task("guardian",async()=>{
   const endpoint=new URL("https://content.guardianapis.com/search");
   endpoint.searchParams.set("api-key",env.THE_GUARDIAN_API_KEY);
   endpoint.searchParams.set("q",'"'+q.replace(/"/g,"")+'"');
   endpoint.searchParams.set("page-size","5");
   endpoint.searchParams.set("order-by","newest");
   const d=await jsonRemote(endpoint.toString());
   if(d.response?.status!=="ok")return null;
   result.news=(d.response.results||[]).filter(x=>x.webUrl&&x.webTitle)
     .slice(0,4).map(x=>({title:x.webTitle,url:safeHttps(x.webUrl,"theguardian.com"),date:x.webPublicationDate,source:"The Guardian"}))
     .filter(x=>x.url);return result.news.length>0;
  });
 }else result.sources.guardian=env.THE_GUARDIAN_API_KEY?"not_applicable":"not_configured";
 await Promise.all(jobs);
 return result;
}
async function koreanBoxOffice(env){
 if(!env.KOFIC_API_KEY)return {ok:true,status:"not_configured",source:"KOFIC",data:[]};
 const date=new Date(Date.now()-3*86400000);
 const ymd=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(date).replace(/-/g,"");
 const uri=new URL("https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json");
 uri.searchParams.set("key",env.KOFIC_API_KEY);uri.searchParams.set("targetDt",ymd);
 const d=await jsonRemote(uri.toString());
 const list=d.boxOfficeResult?.dailyBoxOfficeList;if(!Array.isArray(list))throw Error("KOFIC schema unavailable");
 return {ok:true,status:"ok",source:"KOFIC official daily Korea box office",date:ymd,checkedAt:new Date().toISOString(),
  data:list.slice(0,10).filter(r=>r.movieNm&&r.rank).map(r=>({rank:Number(r.rank),title:r.movieNm,releaseDate:r.openDt||"",salesKRW:Number(r.salesAmt)||null,audience:Number(r.audiCnt)||null}))};
}

export default {
 async fetch(request,env,ctx){
  const u=new URL(request.url);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":cors,"access-control-allow-methods":"GET, OPTIONS"}});
  if(request.method!=="GET")return reply({ok:false,error:"GET only"},405);
  if(u.pathname==="/api/health")return reply({ok:true,status:"worker-online",note:"Check content routes for provider availability.",source:"JustWatch via TMDB",regions:[...regionCodes]});
  // Optional enrichment is served by verified TMDB identity; all keys remain in Worker secrets.
  const extra=u.pathname.match(/^\/api\/insights\/(movie|tv)\/([1-9]\d{0,9})$/);
  if(extra){
   const hit=await caches.default.match(request);if(hit)return hit;
   try{const body=await mediaInsights(extra[1],extra[2],env);
     const response=reply(body,200,86400);ctx.waitUntil(caches.default.put(request,response.clone()));return response;
   }catch{return reply({ok:false,error:"Insights currently unavailable"},502);}
  }
  if(u.pathname==="/api/boxoffice/kr"){
   const hit=await caches.default.match(request);if(hit)return hit;
   try{const body=await koreanBoxOffice(env);const response=reply(body,200,14400);
     if(body.status==="ok")ctx.waitUntil(caches.default.put(request,response.clone()));return response;
   }catch{return reply({ok:false,error:"KOFIC unavailable"},502);}
  }
  // Exact-ID title dossiers for site-internal recommendations. No fuzzy title matching.
  const titleMatch=u.pathname.match(/^\/api\/title\/(movie|tv)\/([1-9]\d{0,9})$/);
  if(titleMatch){
   const [_,kind,id]=titleMatch;
   const token=env.TMDB_READ_ACCESS_TOKEN?.trim(),apikey=env.TMDB_API_KEY?.trim();
   if(!token&&!apikey)return reply({ok:false,error:"TMDB credential not configured"},503);
   const hit=await caches.default.match(request);if(hit)return hit;
   const target=new URL("https://api.themoviedb.org/3/"+kind+"/"+id);
   target.searchParams.set("language","zh-CN");
   target.searchParams.set("append_to_response","external_ids,credits,videos,recommendations");
   if(!token)target.searchParams.set("api_key",apikey);
   const c=new AbortController(),timer=setTimeout(()=>c.abort(),16000);
   try{
    const res=await fetch(target.toString(),{signal:c.signal,headers:token?{"Authorization":"Bearer "+token,"Accept":"application/json"}:{"Accept":"application/json"}});
    if(!res.ok)throw Error("tmdb_status_"+res.status);
    const x=await res.json();
    if(Number(x?.id)!==Number(id)||x.adult||!(x.title||x.name))throw Error("title_id_mismatch");
    const person=p=>({name:p.name||"",character:p.character||"",url:"https://www.themoviedb.org/person/"+p.id});
    const crew=(x.credits?.crew||[]).filter(p=>p.job==="Director").slice(0,5).map(p=>({...person(p),role:"Director"}));
    const creators=[...crew,...(x.created_by||[]).slice(0,3).map(p=>({...person(p),role:"Creator"}))].slice(0,6);
    const profile={
      checked_at:new Date().toISOString(),via:"TMDB",
      tagline:x.tagline||"",genres:(x.genres||[]).slice(0,8).map(g=>g.name).filter(Boolean),
      runtime:x.runtime||(x.episode_run_time||[])[0]||null,status:x.status||"",
      languages:(x.spoken_languages||[]).slice(0,6).map(v=>v.name||v.english_name).filter(Boolean),
      countries:(x.production_countries||[]).slice(0,6).map(v=>v.name).filter(Boolean),
      creators,cast:(x.credits?.cast||[]).slice(0,10).map(person),
      seasons:(x.seasons||[]).filter(s=>s.season_number>0).slice(0,25).map(s=>({number:s.season_number,name:s.name||"",episodes:s.episode_count,date:s.air_date||"",url:"https://www.themoviedb.org/tv/"+id+"/season/"+s.season_number})),
      videos:(x.videos?.results||[]).filter(v=>v.site==="YouTube"&&v.official&&/^[A-Za-z0-9_-]{11}$/.test(v.key)&&["Trailer","Teaser"].includes(v.type)).slice(0,3).map(v=>({name:v.name||"Trailer",url:"https://www.youtube.com/watch?v="+v.key})),
      related:(x.recommendations?.results||[]).filter(v=>Number.isSafeInteger(v.id)&&!v.adult&&(v.title||v.name)).slice(0,6).map(v=>({id:"tmdb-"+kind+"-"+v.id,title:v.title||v.name,url:"https://www.themoviedb.org/"+kind+"/"+v.id})),
      episodes:x.number_of_episodes||null,season_count:x.number_of_seasons||null
    };
    const result={ok:true,id:"tmdb-"+kind+"-"+id,tmdb_id:Number(id),kind,
      title:x.title||x.name,original_title:x.original_title||x.original_name||"",
      date:x.release_date||x.first_air_date||"",overview:x.overview||"",
      poster:x.poster_path&&/^\/[A-Za-z0-9._-]+$/.test(x.poster_path)?"https://image.tmdb.org/t/p/w342"+x.poster_path:"",
      imdb_id:/^tt\d{5,12}$/.test(x.imdb_id||x.external_ids?.imdb_id||"")?(x.imdb_id||x.external_ids.imdb_id):"",
      ratings:Number.isFinite(x.vote_average)&&x.vote_average>0?[{source:"TMDB",value:x.vote_average,scale:10,votes:x.vote_count||null,via:"TMDB",checked_at:profile.checked_at}]:[],
      profile,source:"TMDB",checked_at:profile.checked_at};
    const response=reply(result,200,ttl);ctx.waitUntil(caches.default.put(request,response.clone()));return response;
   }catch(e){return reply({ok:false,error:"Title dossier unavailable",reason:String(e?.message||"unknown").slice(0,80)},502);}
   finally{clearTimeout(timer);}
  }
  const match=u.pathname.match(/^\/api\/(movie|tv)\/([1-9]\d{0,9})$/);
  if(!match)return reply({ok:false,error:"Not Found"},404);
  const region=(u.searchParams.get("region")||"US").toUpperCase();
  if(!regionCodes.has(region))return reply({ok:false,error:"Unsupported country code"},400);
  const token=env.TMDB_READ_ACCESS_TOKEN?.trim(),apikey=env.TMDB_API_KEY?.trim();
  if(!token&&!apikey)return reply({ok:false,error:"TMDB credential not configured"},503);
  const hit=await caches.default.match(request);
  if(hit)return hit;
  const target=new URL("https://api.themoviedb.org/3/"+match[1]+"/"+match[2]+"/watch/providers");
  if(!token)target.searchParams.set("api_key",apikey);
  const c=new AbortController();const timer=setTimeout(()=>c.abort(),18000);
  try{
    const res=await fetch(target.toString(),{signal:c.signal,headers:token?{"Authorization":"Bearer "+token,"Accept":"application/json"}:{"Accept":"application/json"}});
    if(!res.ok)throw Error("tmdb_status_"+res.status);
    const body=await res.json();
    if(!body||Number(body.id)!==Number(match[2])||!body.results||typeof body.results!=="object")throw Error("tmdb_id_or_schema_mismatch");
    const area=body.results[region]||{};
    const groups={subscription:simplify(area.flatrate),free:simplify(area.free),ads:simplify(area.ads),rent:simplify(area.rent),buy:simplify(area.buy)};
    const result={ok:true,source:"JustWatch via TMDB",sourceUrl:"https://www.themoviedb.org/"+match[1]+"/"+match[2]+"/watch",
      type:match[1],tmdbId:Number(match[2]),region,found:Object.values(groups).some(x=>x.length>0),
      providers:groups,detailPage:typeof area.link==="string"&&area.link.startsWith("https://www.themoviedb.org/")?area.link:null,
      attribution:"Availability provided by JustWatch via TMDB; country-level providers, not direct playback links.",
      checkedAt:new Date().toISOString()};
    const response=reply(result,200,ttl);ctx.waitUntil(caches.default.put(request,response.clone()));return response;
  }catch(e){return reply({ok:false,error:"Watch provider source unavailable",reason:String(e?.message||"unknown").slice(0,80)},502);}
  finally{clearTimeout(timer);}
 }
};
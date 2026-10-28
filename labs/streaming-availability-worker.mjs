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
async function tmdbInfo(kind,id,env,withMedia=false){
 const token=env.TMDB_READ_ACCESS_TOKEN?.trim(),api=env.TMDB_API_KEY?.trim();
 if(!token&&!api)throw Error("TMDB credential missing");
 const u=new URL("https://api.themoviedb.org/3/"+kind+"/"+id);
 u.searchParams.set("append_to_response",withMedia?"external_ids,videos":"external_ids");u.searchParams.set("language","en-US");
 if(!token)u.searchParams.set("api_key",api);
 const x=await jsonRemote(u.toString(),{headers:token?{Authorization:"Bearer "+token}:{}});
 if(Number(x.id)!==Number(id)||x.adult||!String(x.title||x.name||"").trim())throw Error("TMDB identity mismatch");
 return x;
}
async function mediaInsights(kind,id,env,withMedia=false){
 const title=await tmdbInfo(kind,id,env,withMedia), ext=title.external_ids||{};
 const imdb=/^tt\d{5,12}$/.test(title.imdb_id||ext.imdb_id||"")?(title.imdb_id||ext.imdb_id):null;
 const tvdb=kind==="tv"&&numericId(ext.tvdb_id)?Number(ext.tvdb_id):null;
 const wikidata=/^Q[1-9]\d{0,11}$/.test(ext.wikidata_id||"")?ext.wikidata_id:null;
 const result={ok:true,kind,tmdbId:Number(id),imdbId:imdb,tvdbId:tvdb,wikidataId:wikidata,
   originalTitle:title.original_title||title.original_name||"",title:title.title||title.name,releaseDate:title.release_date||title.first_air_date||"",
   checkedAt:new Date().toISOString(),sources:{},artwork:[],tvdb:null,wikidata:null,boxOffice:null,news:[],trailers:[],suggestions:[],financials:kind==="movie"?{revenueUSD:Number.isFinite(title.revenue)&&title.revenue>0?title.revenue:null,budgetUSD:Number.isFinite(title.budget)&&title.budget>0?title.budget:null,source:"TMDB",region:"not_specified"}:null};
 const keyYouTube=(env.YOUTUBE_API_KEY||env.YOUTUBE_DATA_API_KEY||env.YOUTUBE_DATA_API_V3_KEY||"").trim();
 const tmdbTrailerRows=(title.videos?.results||[]).filter(v=>v.site==="YouTube"&&v.official===true&&
   ["Trailer","Teaser","Clip","Featurette"].includes(v.type)&&/^[A-Za-z0-9_-]{11}$/.test(v.key));
 const seenIds=new Set();
 result.trailers=tmdbTrailerRows.filter(v=>{if(seenIds.has(v.key))return false;seenIds.add(v.key);return true;})
   .slice(0,5).map(v=>({id:v.key,title:String(v.name||"Trailer").slice(0,140),
     type:v.type,language:v.iso_639_1||"",channel:"",publishedAt:v.published_at||null,
     verifiedBy:"TMDB",official:true,embeddable:null,
     thumbnail:"https://i.ytimg.com/vi/"+v.key+"/hqdefault.jpg",
     url:"https://www.youtube.com/watch?v="+v.key}));
 const jobs=[];
 const task=(name,fn)=>jobs.push((async()=>{try{const x=await fn();result.sources[name]=x?"ok":"no_data";}catch{result.sources[name]="unavailable";}})());
 // Existing official TMDB video IDs are authoritative. YouTube supplies playback metadata.
 // A low-frequency search is used only if TMDB has no official video; it stays explicitly unverified.
 if(keyYouTube&&withMedia){
  task("youtube",async()=>{
   if(!result.trailers.length){
    const search=new URL("https://www.googleapis.com/youtube/v3/search");
    const year=String(title.release_date||title.first_air_date||"").slice(0,4);
    search.searchParams.set("key",keyYouTube);
    search.searchParams.set("part","snippet");
    search.searchParams.set("q",String(title.original_title||title.original_name||title.title||title.name||"").slice(0,75)+" "+year+" official trailer");
    search.searchParams.set("type","video");search.searchParams.set("maxResults","3");search.searchParams.set("videoEmbeddable","true");
    try{
     const found=await jsonRemote(search.toString(),{},7000);
     const seen=new Set();
     result.trailers=(found.items||[]).filter(v=>/^[A-Za-z0-9_-]{11}$/.test(v.id?.videoId||"")&&!seen.has(v.id.videoId)&&seen.add(v.id.videoId))
       .slice(0,2).map(v=>({id:v.id.videoId,title:String(v.snippet?.title||"Trailer candidate").slice(0,140),
        type:"Search",language:"",channel:String(v.snippet?.channelTitle||"").slice(0,70),
        publishedAt:v.snippet?.publishedAt||null,verifiedBy:"YouTube search",official:false,embeddable:null,
        thumbnail:"https://i.ytimg.com/vi/"+v.id.videoId+"/hqdefault.jpg",
        url:"https://www.youtube.com/watch?v="+v.id.videoId}));
    }catch{}
   }
   if(!result.trailers.length)return null;
   const u=new URL("https://www.googleapis.com/youtube/v3/videos");
   u.searchParams.set("key",keyYouTube);u.searchParams.set("part","snippet,contentDetails,status,statistics");
   u.searchParams.set("id",result.trailers.map(v=>v.id).join(","));
   const data=await jsonRemote(u.toString(),{},7500);
   const found=new Map((data.items||[]).map(v=>[v.id,v]));
   result.trailers=result.trailers.filter(v=>{
      const meta=found.get(v.id);
      if(!meta||meta.status?.privacyStatus!=="public")return false;
      v.embeddable=meta.status?.embeddable===true;
      v.channel=String(meta.snippet?.channelTitle||v.channel||"").slice(0,90);
      v.title=String(meta.snippet?.title||v.title||"").slice(0,150);
      v.publishedAt=meta.snippet?.publishedAt||v.publishedAt;
      v.duration=String(meta.contentDetails?.duration||"").slice(0,35);
      v.views=/^\d+$/.test(String(meta.statistics?.viewCount||""))?Number(meta.statistics.viewCount):null;
      return true;
   });
   return result.trailers.length>0;
  });
 }else result.sources.youtube=!withMedia?"not_requested":result.trailers.length?"tmdb_video_links":"not_configured";
 if(wikidata){
  // Exact cross-ID supplied by TMDB. Do not depend on a blocked Wikidata fetch,
  // and do not claim that a Wikidata biography/entity body has been downloaded.
  result.wikidata={id:wikidata,url:"https://www.wikidata.org/wiki/"+wikidata,label:""};
  result.sources.wikidata="linked_via_tmdb";
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
 if(withMedia&&env.THE_GUARDIAN_API_KEY&&q.length>=5&&q.length<=90){
  task("guardian",async()=>{
   const endpoint=new URL("https://content.guardianapis.com/search");
   endpoint.searchParams.set("api-key",env.THE_GUARDIAN_API_KEY);
   endpoint.searchParams.set("q",'"'+q.replace(/"/g,"")+'"');
   endpoint.searchParams.set("page-size","8");
   endpoint.searchParams.set("order-by","newest");
   endpoint.searchParams.set("show-fields","thumbnail,trailText,byline");
   const d=await jsonRemote(endpoint.toString());
   if(d.response?.status!=="ok")return null;
   const normalized=s=>String(s||"").normalize("NFKC").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g," ").trim();
   const query=normalized(q),tokens=query.split(" ").filter(Boolean);
   result.news=(d.response.results||[]).filter(x=>x.webUrl&&x.webTitle)
     .filter(x=>x.sectionId==="film"||x.sectionId==="tv-and-radio"||x.sectionId==="culture"||x.sectionId==="media")
     .filter(x=>{
       const heading=normalized(x.webTitle+" "+(x.fields?.trailText||"").replace(/<[^>]+>/g," "));
       return query.length>=6&&heading.includes(query)||tokens.length>=2&&tokens.every(t=>t.length<3||heading.includes(t));
     }).slice(0,4).map(x=>({
       title:String(x.webTitle).slice(0,180),url:safeHttps(x.webUrl,"theguardian.com"),date:x.webPublicationDate,
       source:"The Guardian",section:String(x.sectionName||"").slice(0,45),byline:String(x.fields?.byline||"").slice(0,90),
       summary:String(x.fields?.trailText||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,210),
       thumbnail:safeHttps(x.fields?.thumbnail,"guim.co.uk")||null,
       matchType:"title_search"
     })).filter(x=>x.url);
   return result.news.length>0;
  });
 }else result.sources.guardian=!withMedia?"not_requested":env.THE_GUARDIAN_API_KEY?"not_applicable":"not_configured";
 // Optional TasteDive results are name-only discovery leads, never merged with a TMDB identity.
 if(withMedia&&env.TASTEDIVE_API_KEY&&q.length>=5&&q.length<=100){
  task("tastedive",async()=>{
   const endpoint=new URL("https://tastedive.com/api/similar");
   endpoint.searchParams.set("k",env.TASTEDIVE_API_KEY);
   endpoint.searchParams.set("q",q);
   endpoint.searchParams.set("type",kind==="movie"?"movie":"show");
   endpoint.searchParams.set("limit","5");
   const d=await jsonRemote(endpoint.toString(),{},2000);
   const rows=d.Similar?.Results||d.similar?.results||[];
   if(!Array.isArray(rows))return null;
   result.suggestions=rows.filter(x=>typeof x.Name==="string"||typeof x.name==="string")
     .slice(0,5).map(x=>({title:String(x.Name||x.name).slice(0,90),type:String(x.Type||x.type||"").slice(0,25),source:"TasteDive",verified:false}));
   return result.suggestions.length>0;
  });
 }else result.sources.tastedive=!withMedia?"not_requested":"not_configured";

 await Promise.all(jobs);
 return result;
}
async function koreanBoxOffice(env){
 if(!env.KOFIC_API_KEY)return {ok:true,status:"not_configured",source:"KOFIC",data:[]};
 const date=new Date(Date.now()-3*86400000);
 const ymd=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(date).replace(/-/g,"");
 let d=null;
 for(const host of ["kobis.or.kr","www.kobis.or.kr"]){
  const uri=new URL("https://"+host+"/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json");
  uri.searchParams.set("key",env.KOFIC_API_KEY);uri.searchParams.set("targetDt",ymd);
  try{
   const next=await jsonRemote(uri.toString(),{headers:{"Accept":"application/json"}},7000);
   if(Array.isArray(next.boxOfficeResult?.dailyBoxOfficeList)){d=next;break;}
  }catch{}
 }
 const list=d?.boxOfficeResult?.dailyBoxOfficeList;
 if(!Array.isArray(list))return {ok:true,status:"unavailable",source:"KOFIC",date:ymd,data:[],note:"Official origin did not return a verified daily chart."};
 return {ok:true,status:"ok",source:"KOFIC official daily Korea box office",date:ymd,checkedAt:new Date().toISOString(),
  data:list.slice(0,10).filter(r=>r.movieNm&&r.rank).map(r=>({rank:Number(r.rank),title:r.movieNm,releaseDate:r.openDt||"",salesKRW:Number(r.salesAmt)||null,audience:Number(r.audiCnt)||null}))};
}

export default {
 async fetch(request,env,ctx){
  const u=new URL(request.url);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":cors,"access-control-allow-methods":"GET, OPTIONS"}});
  if(request.method!=="GET")return reply({ok:false,error:"GET only"},405);
  if(u.pathname==="/api/health")return reply({ok:true,status:"worker-online",note:"Check content routes for provider availability.",source:"JustWatch via TMDB",regions:[...regionCodes]});
  // Guardian's general film headlines are distinct from title-matched coverage.
  // The optional call is cached for 90 minutes, and only occurs when a user expands news.
  if(u.pathname==="/api/news/film"){
   const key=(env.THE_GUARDIAN_API_KEY||env.GUARDIAN_API_KEY||"").trim();
   if(!key)return reply({ok:true,status:"not_configured",source:"The Guardian",articles:[]});
   const cacheHit=await caches.default.match(request);if(cacheHit)return cacheHit;
   try{
    const endpoint=new URL("https://content.guardianapis.com/search");
    endpoint.searchParams.set("api-key",key);
    endpoint.searchParams.set("section","film");
    endpoint.searchParams.set("page-size","6");
    endpoint.searchParams.set("order-by","newest");
    endpoint.searchParams.set("show-fields","thumbnail,trailText,byline");
    const d=await jsonRemote(endpoint.toString(),{},9000);
    if(d.response?.status!=="ok"||!Array.isArray(d.response.results))throw Error("invalid_guardian_response");
    const articles=d.response.results.filter(v=>v.webTitle&&v.webUrl)
     .map(v=>({
       title:String(v.webTitle),
       url:safeHttps(v.webUrl,"theguardian.com"),
       date:v.webPublicationDate||null,section:String(v.sectionName||"Film").slice(0,45),
       summary:String(v.fields?.trailText||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,200),
       byline:String(v.fields?.byline||""),
       thumbnail:safeHttps(v.fields?.thumbnail,"guim.co.uk")||null,source:"The Guardian"
     })).filter(v=>v.url).slice(0,6);
    const body={ok:true,status:articles.length?"ok":"no_data",source:"The Guardian",checkedAt:new Date().toISOString(),articles};
    const response=reply(body,200,5400);ctx.waitUntil(caches.default.put(request,response.clone()));return response;
   }catch{return reply({ok:false,status:"unavailable",error:"Guardian film news unavailable"},502);}
  }
  // MyAnimeList v2: join anime only by a verified MAL numeric ID, never by title search.
  const animeMatch=u.pathname.match(/^\/api\/anime\/mal\/([1-9]\d{0,9})$/);
  if(animeMatch){
   const key=(env.MAL_CLIENT_ID||env.MYANIMELIST_CLIENT_ID||"").trim();
   if(!key)return reply({ok:true,status:"not_configured",source:"MyAnimeList v2",malId:Number(animeMatch[1])});
   const hit=await caches.default.match(request);if(hit)return hit;
   try{
    const endpoint=new URL("https://api.myanimelist.net/v2/anime/"+animeMatch[1]);
    endpoint.searchParams.set("fields","mean,rank,popularity,num_scoring_users,num_list_users,media_type,num_episodes,start_date,genres,studios");
    const x=await jsonRemote(endpoint.toString(),{headers:{"X-MAL-CLIENT-ID":key,"Accept":"application/json"}},9000);
    if(Number(x?.id)!==Number(animeMatch[1])||!String(x.title||"").trim())throw Error("MAL identity mismatch");
    const validMean=Number.isFinite(x.mean)&&x.mean>=0&&x.mean<=10?x.mean:null;
    const body={ok:true,status:"ok",source:"MyAnimeList v2",malId:Number(x.id),
      title:String(x.title).slice(0,170),url:"https://myanimelist.net/anime/"+x.id,
      score:validMean,scale:10,rank:Number.isInteger(x.rank)&&x.rank>0?x.rank:null,
      popularity:Number.isInteger(x.popularity)&&x.popularity>0?x.popularity:null,
      ratingCount:Number.isInteger(x.num_scoring_users)&&x.num_scoring_users>=0?x.num_scoring_users:null,
      listUsers:Number.isInteger(x.num_list_users)&&x.num_list_users>=0?x.num_list_users:null,
      episodes:Number.isInteger(x.num_episodes)?x.num_episodes:null,mediaType:String(x.media_type||"").slice(0,40),
      studios:Array.isArray(x.studios)?x.studios.filter(t=>t.name).slice(0,5).map(t=>String(t.name).slice(0,80)):[],
      genres:Array.isArray(x.genres)?x.genres.filter(t=>t.name).slice(0,8).map(t=>String(t.name).slice(0,80)):[],
      checkedAt:new Date().toISOString()};
    const response=reply(body,200,86400);ctx.waitUntil(caches.default.put(request,response.clone()));return response;
   }catch{return reply({ok:false,error:"MAL source or ID unavailable"},502);}
  }
  // Optional enrichment is served by verified TMDB identity; all keys remain in Worker secrets.
  const extra=u.pathname.match(/^\/api\/insights\/(movie|tv)\/([1-9]\d{0,9})$/);
  if(extra){
   const hit=await caches.default.match(request);if(hit)return hit;
   try{const body=await mediaInsights(extra[1],extra[2],env,u.searchParams.get("media")==="1");
     const response=reply(body,200,86400);ctx.waitUntil(caches.default.put(request,response.clone()));return response;
   }catch{return reply({ok:false,error:"Insights currently unavailable"},502);}
  }
  if(u.pathname==="/api/kobis/daily"||u.pathname==="/api/boxoffice/kr"){
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
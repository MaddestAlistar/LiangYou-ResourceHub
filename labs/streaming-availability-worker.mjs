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
export default {
 async fetch(request,env,ctx){
  const u=new URL(request.url);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":cors,"access-control-allow-methods":"GET, OPTIONS"}});
  if(request.method!=="GET")return reply({ok:false,error:"GET only"},405);
  if(u.pathname==="/api/health")return reply({ok:true,status:"worker-online",note:"Check content routes for provider availability.",source:"JustWatch via TMDB",regions:[...regionCodes]});
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
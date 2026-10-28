// LiangYou extra film ratings research Worker. No website frontend changes.
// Kitsu & Bilibili are provider public data; MDL uses a third-party educational demo.
// Simkl official client ID is a Cloudflare secret, never sent to browsers.
const ttl=21600;
function json(data,status=200,cache=false){
  return new Response(JSON.stringify(data),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "access-control-allow-origin":"*",
    "cache-control":cache?"public, max-age="+ttl:"no-store",
    "x-content-type-options":"nosniff"
  }});
}
function num(v,max){
  if(typeof v==="boolean"||v===null||v===undefined||String(v).trim()==="")return null;
  const n=Number(v);
  return Number.isFinite(n)&&n>0&&n<=max?n:null;
}
function int(v){
  const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:null;
}
async function retrieve(url,headers={},ms=18000){
  const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),ms);
  try{
    const res=await fetch(url,{signal:ctl.signal,headers:{
      "accept":"application/json","user-agent":"LiangYouResourceHub/1.0 (low frequency research)",...headers}});
    if(!res.ok)throw Error("upstream_http_"+res.status);
    const len=Number(res.headers.get("content-length")||0);
    if(len>400000)throw Error("upstream_large");
    const text=await res.text();
    if(text.length>400000)throw Error("upstream_large");
    const o=JSON.parse(text);
    if(!o||typeof o!=="object")throw Error("upstream_not_object");
    return o;
  }finally{clearTimeout(timer);}
}
async function cached(req,ctx,loader){
  const cache=caches.default;const found=await cache.match(req);
  if(found)return found;
  const data=await loader();const res=json(data,200,true);
  ctx.waitUntil(cache.put(req,res.clone()));
  return res;
}
function wrap(name,originalUrl,fields,attribution=null){
  return {code:0,platform:name,sourceUrl:originalUrl,...fields,
    fetchedAt:new Date().toISOString(),
    dataPolicy:attribution||"Public source data. Check provider terms before redistributing to a public website.",
    note:"A missing score is null; scores preserve the platform's native scale."};
}

const PUBLIC_SNAPSHOT_URL="https://raw.githubusercontent.com/MaddestAlistar/LiangYou-ResourceHub/main/data/bilibili-filmarks-ratings.json";
async function snapshotRating(source,id,scale){
  const o=await retrieve(PUBLIC_SNAPSHOT_URL,{},16000);
  const stamp=Date.parse(o.updatedAt||"");
  if(!Number.isFinite(stamp)||Date.now()-stamp>48*60*60*1000||stamp>Date.now()+10*60*1000)
    throw Error("verified_snapshot_stale");
  const d=o.sources?.[source]?.[id];
  if(!d||String(d.id)!==id||!d.title||num(d.rating,scale)===null||d.scale!==scale)
    throw Error("verified_snapshot_missing");
  return {...d,snapshotUpdatedAt:o.updatedAt};
}
async function filmarksDirect(id){
  const page="https://filmarks.com/movies/"+id;
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),17000);
  try{
    const r=await fetch(page,{signal:ctl.signal,headers:{
      "accept":"text/html","user-agent":"LiangYouResourceHub/1.0 public rating research"}});
    if(!r.ok||new URL(r.url).pathname!=="/movies/"+id)throw Error("filmarks_http_or_redirect");
    const html=await r.text();
    if(html.length>500000||html.length<1000)throw Error("filmarks_html_size");
    const t=/<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1];
    if(!t||!t.includes("Filmarks"))throw Error("filmarks_page_unexpected");
    const found=[];
    for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
      let obj;try{obj=JSON.parse(m[1]);}catch{continue;}
      for(const x of Array.isArray(obj)?obj:[obj]){
        if(!x||typeof x!=="object"||x["@type"]!=="Movie"||!x.aggregateRating)continue;
        const rating=num(x.aggregateRating.ratingValue,5);
        const title=t.split(" - ")[0].trim();
        if(rating!==null&&title&&title.length<160)
          found.push({rating,title});
      }
    }
    if(found.length!==1)throw Error("filmarks_rating_ambiguous");
    return {id,title:found[0].title,rating:found[0].rating,scale:5,
      ratingCount:null,pageUrl:page,sourceUrl:page};
  }finally{clearTimeout(timer);}
}
export default {
  async fetch(req,env,ctx){
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
      "access-control-allow-origin":"*","access-control-allow-methods":"GET,OPTIONS"}});
    if(req.method!=="GET")return json({code:405,error:"GET only"},405);
    const u=new URL(req.url);
    if(u.pathname==="/"||u.pathname==="/api/health")return json({
      code:0,status:"worker_running_not_upstream_health",name:"LiangYou Five Film Ratings Research Lab",
      endpoints:["/api/bilibili/season/26801","/api/kitsu/anime/1","/api/mydramalist/drama/58651-run-on","/api/simkl/10280","/api/filmarks/movie/14348"],
      limitations:"Individual upstream providers can fail. Simkl requires a server-side configured Client ID; Filmarks not verified."
    });
    try{
      const b=u.pathname.match(/^\/api\/bilibili\/season\/([1-9]\d{0,9})$/);
      if(b)return await cached(req,ctx,async()=>{
        const source="https://api.bilibili.com/pgc/view/web/season?season_id="+b[1];
        try{
          const d=await retrieve(source);
          const x=d.result||{};const r=x.rating||{};
          if(d.code!==0||String(x.season_id)!==b[1]||!x.title||num(r.score,10)===null)
            throw Error("source_id_name_mismatch");
          return wrap("Bilibili 番剧",source,{id:b[1],title:x.title,
            rating:num(r.score,10),scale:10,ratingCount:int(r.count),
            cover:x.cover||null,pageUrl:"https://www.bilibili.com/bangumi/play/ss"+b[1]});
        }catch{
          const record=await snapshotRating("bilibili",b[1],10);
          return wrap("Bilibili 番剧",record.sourceUrl,{id:b[1],title:record.title,
            rating:record.rating,scale:10,ratingCount:record.ratingCount,
            cover:null,pageUrl:record.pageUrl,verifiedSnapshotAt:record.snapshotUpdatedAt,
            delivery:"GitHub Actions validated source snapshot"});
        }
      });
      // Official Kitsu cross-site mappings: MAL ID -> uniquely linked Kitsu anime.
      const km=u.pathname.match(/^\/api\/kitsu\/by-mal\/([1-9]\d{0,9})$/);
      if(km)return await cached(req,ctx,async()=>{
        const map=new URL("https://kitsu.io/api/edge/mappings");
        map.searchParams.set("filter[externalSite]","myanimelist/anime");
        map.searchParams.set("filter[externalId]",km[1]);
        const d=await retrieve(map.toString(),{"accept":"application/vnd.api+json"},16000);
        const exact=(d.data||[]).filter(x=>x.attributes?.externalSite==="myanimelist/anime"&&
          String(x.attributes.externalId)===km[1]&&x.relationships?.item?.data?.type==="anime");
        const ids=[...new Set(exact.map(x=>x.relationships.item.data.id))];
        if(ids.length!==1||!/^[1-9]\d{0,9}$/.test(ids[0]))throw Error("kitsu_mapping_not_unique");
        const src="https://kitsu.io/api/edge/anime/"+ids[0];
        const record=await retrieve(src,{"accept":"application/vnd.api+json"},16000);
        const x=record.data||{},a=x.attributes||{};
        if(String(x.id)!==ids[0]||x.type!=="anime"||!a.canonicalTitle)throw Error("kitsu_anime_identity_mismatch");
        return wrap("Kitsu",src,{
          id:ids[0],malId:km[1],title:a.canonicalTitle,
          rating:num(a.averageRating,100),scale:100,ratingCount:null,
          pageUrl:"https://kitsu.app/anime/"+(a.slug||ids[0]),mappingMethod:"official_kitsu_mal_mapping"
        });
      });
      const k=u.pathname.match(/^\/api\/kitsu\/anime\/([1-9]\d{0,9})$/);
      if(k)return await cached(req,ctx,async()=>{
        let o;let src;
        try{src="https://kitsu.io/api/edge/anime/"+k[1];o=await retrieve(src,{"accept":"application/vnd.api+json"});}
        catch{src="https://kitsu.app/api/edge/anime/"+k[1];o=await retrieve(src,{"accept":"application/vnd.api+json"});}
        const d=o.data||{},a=d.attributes||{};
        if(String(d.id)!==k[1]||!a.canonicalTitle)throw Error("source_id_name_mismatch");
        return wrap("Kitsu",src,{id:k[1],title:a.canonicalTitle,rating:num(a.averageRating,100),
          scale:100, ratingCount:null,libraryUserCount:int(a.userCount),
          slug:a.slug||null,language:"en",pageUrl:"https://kitsu.app/anime/"+(a.slug||k[1])});
      });
      const m=u.pathname.match(/^\/api\/mydramalist\/drama\/([1-9]\d{2,8}-[a-z0-9-]{2,100})$/);
      if(m)return await cached(req,ctx,async()=>{
        const src="https://my-drama-list-api-ten.vercel.app/api/id/"+m[1];
        const x=await retrieve(src,{},22000);
        if(x.error||!x.title||String(x.slug)!==m[1])throw Error("source_id_name_mismatch");
        return wrap("MyDramaList (third-party)",src,{id:m[1],title:x.title,rating:num(x.rating,10),
          scale:10,ratingCount:null,
          pageUrl:"https://mydramalist.com/"+m[1]}, 
          "Data obtained via educational, unofficial MyDramaList API; verify original and redistribution rights.");
      });
      const fm=u.pathname.match(/^\/api\/filmarks\/movie\/([1-9]\d{2,8})$/);
      if(fm)return await cached(req,ctx,async()=>{
        let record,delivery="direct_public_page";
        try{record=await filmarksDirect(fm[1]);}
        catch{record=await snapshotRating("filmarks",fm[1],5);
          delivery="GitHub Actions validated source snapshot";}
        return wrap("Filmarks",record.sourceUrl,{id:fm[1],title:record.title,
          rating:record.rating,scale:5,ratingCount:null,pageUrl:record.pageUrl,
          delivery,verifiedSnapshotAt:record.snapshotUpdatedAt||null},
          "Filmarks public webpage rating, not an authorized API. Verify source terms before redistribution.");
      });
      // Simkl's ratings endpoint supports lookup by an exact TMDB/MAL external ID.
      // It is not a fuzzy title search, and keys remain server-side.
      const exactSimkl=u.pathname.match(/^\/api\/simkl\/by-(tmdb|mal)\/(?:(movie|tv|anime)\/)?([1-9]\d{0,9})$/);
      if(exactSimkl){
        const [_,source,kind,id]=exactSimkl;
        if(source==="tmdb"&&!["movie","tv"].includes(kind))return json({code:400,error:"TMDB lookup requires movie or tv type"},400);
        if(source==="mal"&&kind!=="anime")return json({code:400,error:"MAL lookup requires anime type"},400);
        if(!env.SIMKL_CLIENT_ID)return json({code:503,error:"Simkl Client ID not configured"},503);
        return await cached(req,ctx,async()=>{
          const url=new URL("https://api.simkl.com/ratings");
          url.searchParams.set(source,id);
          if(source==="tmdb")url.searchParams.set("type",kind==="movie"?"movie":"show");
          if(source==="mal")url.searchParams.set("type","anime");
          url.searchParams.set("fields","simkl,year");
          url.searchParams.set("client_id",env.SIMKL_CLIENT_ID);
          const x=await retrieve(url.toString(),{"simkl-api-key":env.SIMKL_CLIENT_ID});
          const sid=String(x.id||"");
          const expected=kind==="movie"?"movies":kind==="tv"?"tv":"anime";
          if(!/^[1-9]\d{1,9}$/.test(sid)||!String(x.link||"").startsWith("https://simkl.com/"+expected+"/"))
            throw Error("simkl_identity_mismatch");
          if(num(x.simkl?.rating,10)===null)return json({code:204,status:"no_rating",provider:"Simkl"},200);
          return wrap("Simkl","https://api.simkl.com/ratings",{id:sid,matchedExternalId:id,matchedExternalSite:source,
            title:null,rating:num(x.simkl.rating,10),scale:10,ratingCount:int(x.simkl?.votes),
            releaseYear:x.release_year||null,pageUrl:x.link,
            mappingMethod:source==="tmdb"?"official_simkl_tmdb_lookup":"official_simkl_mal_lookup"});
        });
      }
      const s=u.pathname.match(/^\/api\/simkl\/([1-9]\d{1,9})$/);
      if(s){
        if(!env.SIMKL_CLIENT_ID)return json({code:503,error:"Simkl Client ID not configured on Worker"},503);
        return await cached(req,ctx,async()=>{
          const src="https://api.simkl.com/ratings";
          const upstreamUrl=src+"?"+new URLSearchParams({simkl:s[1],fields:"simkl,year",client_id:env.SIMKL_CLIENT_ID}).toString();
          const x=await retrieve(upstreamUrl,{"simkl-api-key":env.SIMKL_CLIENT_ID});
          if(String(x.id)!==s[1]||!x.link||!x.link.startsWith("https://simkl.com/"))
            throw Error("source_id_name_mismatch");
          const r=x.simkl||{};
          return wrap("Simkl",src+"?simkl="+s[1],{id:s[1],title:null,
            rating:num(r.rating,10),scale:10,ratingCount:int(r.votes),
            releaseYear:x.release_year||null,pageUrl:x.link},
            "Simkl API: provide Simkl attribution/link; confirm usage restrictions for competing tracking services.");
        });
      }
      return json({code:404,error:"Not Found"},404);
    }catch(e){return json({code:502,error:"Source unavailable or insufficient identity evidence",
      reason:String(e?.message||"unknown").slice(0,100)},502);}
  }
};
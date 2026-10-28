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
export default {
  async fetch(req,env,ctx){
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
      "access-control-allow-origin":"*","access-control-allow-methods":"GET,OPTIONS"}});
    if(req.method!=="GET")return json({code:405,error:"GET only"},405);
    const u=new URL(req.url);
    if(u.pathname==="/"||u.pathname==="/api/health")return json({
      code:0,status:"worker_running_not_upstream_health",name:"LiangYou Four Film Ratings Research Lab",
      endpoints:["/api/bilibili/season/26801","/api/kitsu/anime/1","/api/mydramalist/drama/58651-run-on","/api/simkl/10280"],
      limitations:"Individual upstream providers can fail. Simkl requires a server-side configured Client ID; Filmarks not verified."
    });
    try{
      const b=u.pathname.match(/^\/api\/bilibili\/season\/([1-9]\d{0,9})$/);
      if(b)return await cached(req,ctx,async()=>{
        const source="https://api.bilibili.com/pgc/view/web/season?season_id="+b[1];
        const d=await retrieve(source);
        const x=d.result||{};const r=x.rating||{};
        if(d.code!==0||String(x.season_id)!==b[1]||!x.title)throw Error("source_id_name_mismatch");
        const rating=num(r.score,10);
        return wrap("Bilibili 番剧",source,{id:b[1],title:x.title,rating,scale:10,
          ratingCount:int(r.count),cover:x.cover||null,
          pageUrl:"https://www.bilibili.com/bangumi/play/ss"+b[1]});
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
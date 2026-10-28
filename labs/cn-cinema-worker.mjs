// Independent LiangYou cinema data laboratory. Not connected to website UI.
// Third-party redistribution permissions must be verified before public display.
const SOURCES = {
  domestic: ["https://api.qhsou.com/api/maoyan.php", "https://v1.apizero.cn/api/movie-box"],
  global: ["https://api.qhsou.com/api/qqys.php"]
};
const TTL=1800;
function json(value,status=200,cache=0){
  return new Response(JSON.stringify(value),{
    status,headers:{
      "content-type":"application/json; charset=utf-8",
      "access-control-allow-origin":"*",
      "cache-control":cache?"public, max-age="+cache:"no-store",
      "x-content-type-options":"nosniff"
    }
  });
}
async function load(url,ms=10000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  try{
    const r=await fetch(url,{signal:controller.signal,headers:{Accept:"application/json"}});
    if(!r.ok)throw Error("upstream_http_"+r.status);
    const data=await r.json();
    if(!data||typeof data!=="object")throw Error("bad_json_shape");
    return data;
  }finally{clearTimeout(timer);}
}
function findList(obj){
  if(Array.isArray(obj))return obj;
  if(!obj||typeof obj!=="object")return [];
  for(const k of ["movieList","movies","list","items","rows","data","result"]){
    const x=obj[k];
    if(Array.isArray(x))return x;
    if(x&&typeof x==="object"){const nested=findList(x);if(nested.length)return nested;}
  }
  return [];
}
function pick(o,...keys){
  for(const k of keys){const x=o?.[k];if(x!==undefined&&x!==null&&x!=="")return x;}
  return null;
}
function movie(x,i){
  if(!x||typeof x!=="object")return null;
  const name=pick(x,"movieName","name","title","nm","movie_name");
  if(typeof name!=="string"||!name.trim())return null;
  return{
    rank:pick(x,"top","rank")||i+1,
    title:name.trim(),
    movieId:pick(x,"movieId","movie_id","id"),
    cumulativeBoxOffice:pick(x,"sumBoxDesc","totalBoxOffice","totalBox","sumBox"),
    currentBoxOffice:pick(x,"boxDesc","boxOffice","todayBox","realtimeBoxOffice"),
    boxOfficeShare:pick(x,"boxRate","boxRateDesc","boxOfficeRate"),
    schedulingShare:pick(x,"showCountRate","showCountRateDesc","scheduleRate"),
    showCount:pick(x,"showCount"),
    attendance:pick(x,"avgSeatView","attendance"),
    releaseInfo:pick(x,"releaseInfo")
  };
}
function key(s){return String(s||"").normalize("NFKC").toLowerCase().trim().replace(/\s+/g,"");}
async function board(type){
  const src=SOURCES[type];let lastError;
  for(const u of src){
    try{
      const data=await load(u);
      if(u.includes("apizero.cn")&&data.code!==0)throw Error("upstream_business_error");
      const rows=findList(data).map(movie).filter(Boolean);
      if(!rows.length)throw Error("upstream_empty");
      return {code:0,source:u.includes("qhsou.com")?"清和 API": "ApiZero",
        upstream:u,sourceUpdatedAt:pick(data,"updateTime","updatedAt","time2","time"),
        retrievedAt:new Date().toISOString(),count:rows.length,data:rows,
        note:"Data is limited to the source leaderboard and may omit older films."};
    }catch(e){lastError=e;}
  }
  throw lastError||Error("no_available_source");
}
async function cached(req,ctx,get){
  const cache=caches.default;
  const hit=await cache.match(req);
  if(hit)return hit;
  const value=await get();
  const res=json(value,200,TTL);
  ctx.waitUntil(cache.put(req,res.clone()));
  return res;
}
export default{
  async fetch(req,env,ctx){
    const url=new URL(req.url);
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET,OPTIONS"}});
    if(req.method!=="GET")return json({code:405,message:"GET only"},405);
    if(url.pathname==="/"||url.pathname==="/api/health")return json({
      code:0,name:"LiangYou China Cinema API Lab",status:"worker-online",
      endpoints:["/api/boxoffice","/api/boxoffice?name=影片名","/api/global-boxoffice","/api/global-boxoffice?name=影片名"],
      limitation:"No standalone Maoyan rating or all-time film-ID box office API is claimed."
    });
    const type=url.pathname==="/api/global-boxoffice"?"global":url.pathname==="/api/boxoffice"?"domestic":null;
    if(!type)return json({code:404,message:"Not Found"},404);
    const title=url.searchParams.get("name")?.trim()||"";
    if(title.length>100)return json({code:400,message:"name too long"},400);
    try{
      return await cached(req,ctx,async()=>{
        const data=await board(type);
        if(!title)return data;
        const found=data.data.filter(x=>key(x.title)===key(title));
        return {...data,query:title,match:found.length?"exact_title":"not_on_current_board",count:found.length,data:found};
      });
    }catch(e){return json({code:502,message:"Data source unavailable",error:String(e?.message||"error").slice(0,100)},502);}
  }
};

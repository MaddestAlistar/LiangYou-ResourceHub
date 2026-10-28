// LiangYou independent movie-data experiment.
// Third-party zgdypf.zgdypw.cn aggregates Maoyan, Douban, Taopiaopiao scores.
// This is NOT an official Taopiaopiao API or a licensed redistribution feed.
const upstream="https://zgdypf.zgdypw.cn";
const ttl=7200; // At most one origin fetch per identical request/edge per 2 hours.
function output(data,status=200,seconds=0){
  return new Response(JSON.stringify(data),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "access-control-allow-origin":"*",
    "cache-control":seconds ? "public, max-age="+seconds : "no-store",
    "x-content-type-options":"nosniff"
  }});
}
async function getText(path,timeout=23000){
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort(),timeout);
  try{
    const res=await fetch(upstream+path,{signal:ac.signal,headers:{
      "accept":"text/html,application/json;q=0.9,*/*;q=0.5",
      "user-agent":"LiangYou-Media-Research/1.0 (low-volume public data check)"
    }});
    if(!res.ok)throw new Error("source_http_"+res.status);
    const len=Number(res.headers.get("content-length")||0);
    if(len>2000000)throw new Error("source_too_large");
    const text=await res.text();
    if(text.length>2000000||text.length<25)throw new Error("source_unexpected_length");
    return text;
  }finally{clearTimeout(timer);}
}
function getJSONFromHtml(html){
  const match=/window\.__INITIAL_STATE__\s*=\s*/.exec(html);
  if(!match)throw new Error("initial_state_missing");
  const rest=html.slice(match.index+match[0].length);
  const close=rest.search(/<\/script\s*>/i);
  if(close<1)throw new Error("initial_state_script_incomplete");
  const raw=rest.slice(0,close).trim().replace(/;\s*$/,"");
  const obj=JSON.parse(raw);
  if(!obj||typeof obj!=="object"||Array.isArray(obj))throw new Error("initial_state_not_object");
  return obj;
}
function rating(value){
  if(value===null||value===undefined||typeof value==="boolean")return null;
  const s=String(value).trim();
  if(!/^(?:\d|10)(?:\.\d{1,2})?$/.test(s))return null;
  const n=Number(s);
  return Number.isFinite(n)&&n>0&&n<=10?n:null;
}
function amount(value,unit){
  if(value===null||value===undefined)return null;
  const s=String(value).trim().replaceAll(",","");
  if(!/^\d+(?:\.\d+)?$/.test(s))return null;
  const n=Number(s);
  if(!Number.isFinite(n)||n<0)return null;
  if(unit==="亿")return {value:Math.round(n*1000000)/100,unit:"万元"};
  if(unit==="万"||unit==="万元")return {value:n,unit:"万元"};
  return null;
}
function parseFilm(html,code){
  const state=getJSONFromHtml(html);
  const film=state.movieInfoData;
  if(!film||typeof film!=="object"||typeof film.name!=="string"||!film.name.trim())throw new Error("movie_info_absent");
  const scores={maoyan:null,douban:null,taopiaopiao:null};
  const labels={"猫眼购票评分":"maoyan","豆瓣评分":"douban","淘票票评分":"taopiaopiao"};
  if(!Array.isArray(film.scores))throw new Error("rating_array_missing");
  const present=new Set();
  for(const item of film.scores){
    if(!item||typeof item!=="object")continue;
    const key=labels[item.name];
    if(!key||present.has(key))continue;
    present.add(key);
    scores[key]=rating(item.value);
  }
  if(present.size===0)throw new Error("no_supported_rating_fields");
  const box={};
  for(const x of Array.isArray(state.movieBoxSum)?state.movieBoxSum:[]){
    if(!x||typeof x!=="object")continue;
    const k={"累计票房":"cumulative","首日票房":"firstDay","首周票房":"firstWeek"}[x.title];
    if(k)box[k]=amount(x.value,x.unit);
  }
  const fields={maoyan:scores.maoyan,douban:scores.douban,taopiaopiao:scores.taopiaopiao};
  return {
    code:0,source:"中国电影票房：第三方汇总网页",
    upstreamUrl:upstream+"/movie/detail/"+code,
    movieCode:code,title:film.name.trim(),
    releaseDescription:typeof film.pubDesc==="string"?film.pubDesc:null,
    ratings:fields,boxOffice:{
      cumulative:box.cumulative||null,firstDay:box.firstDay||null,firstWeek:box.firstWeek||null
    },
    fetchedAt:new Date().toISOString(),
    accuracyNote:"Scores are attributed to third-party aggregates, not independently verified with each official platform.",
    nullNote:"A missing or invalid score is null, never zero."
  };
}
function parseYear(data,year){
  if(!data||typeof data!=="object"||!Array.isArray(data.rankList))throw new Error("year_list_missing");
  const rows=data.rankList.slice(0,500).map((v,i)=>{
    if(!v||typeof v!=="object"||typeof v.name!=="string"||!/^\d{8,14}$/.test(String(v.movieCode||"")))return null;
    const total=amount(v.salesInWan,"万");
    if(!total)return null;
    return {
      rank:i+1,movieCode:String(v.movieCode),title:v.name,
      releaseDate:typeof v.premiereDate==="string"?v.premiereDate:null,
      cumulativeBoxOffice:total,
      averageTicketPrice:typeof v.avgPrice==="string"&&Number.isFinite(Number(v.avgPrice))?Number(v.avgPrice):null
    };
  }).filter(Boolean);
  if(rows.length<5)throw new Error("year_list_empty_or_changed");
  return {code:0,source:"中国电影票房：公开年度榜单",sourceUrl:upstream+"/getYearData?year="+year,
    year,title:data.title||null,upstreamUpdatedAt:data.updateTimeDesc||null,
    fetchedAt:new Date().toISOString(),count:rows.length,data:rows};
}
function parseDay(data,date){
  if(!data||typeof data!=="object"||!Array.isArray(data.list))throw new Error("day_list_missing");
  const rows=data.list.slice(0,300).map((v,i)=>{
    if(!v||typeof v!=="object"||typeof v.name!=="string"||!v.name.trim())return null;
    return {
      rank:i+1,title:v.name,movieCode: v.code?String(v.code):null,
      cumulativeBoxOfficeDisplay:v.sumSalesDesc||null,
      dayBoxOfficeDisplay:v.salesInWanDesc||null,
      boxOfficeShare:v.salesRateDesc||null,
      screeningShare:v.sessionRateDesc||null,
      onlineSalesShare:v.onlineSalesRateDesc||null,
      seatOccupancy:v.seatRateDesc||null
    };
  }).filter(Boolean);
  if(rows.length<5)throw new Error("day_list_empty_or_changed");
  return {code:0,source:"中国电影票房：公开单日榜单",
    sourceUrl:upstream+"/getDayData?date="+date+"&withSvcFee=true",
    date,upstreamUpdatedAt:data.updateTimestamp||null,
    fetchedAt:new Date().toISOString(),count:rows.length,data:rows};
}
async function cached(req,ctx,task){
  const cached=await caches.default.match(req);
  if(cached)return cached;
  const result=await task();
  const response=output(result,200,ttl);
  ctx.waitUntil(caches.default.put(req,response.clone()));
  return response;
}
export default {
  async fetch(req,env,ctx){
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
      "access-control-allow-origin":"*","access-control-allow-methods":"GET,OPTIONS"}});
    if(req.method!=="GET")return output({code:405,error:"Method Not Allowed"},405);
    const url=new URL(req.url);
    if(url.pathname==="/"||url.pathname==="/api/health")return output({
      code:0,status:"worker_online",name:"LiangYou Film Score Aggregator Lab",
      endpoints:["/api/movie/00102032025","/api/movie/00102782025","/api/year?year=2025","/api/day?date=2026-10-27"],
      note:"Independent research interface. Aggregated scores are not official certified scores."
    });
    try{
      const movie=url.pathname.match(/^\/api\/movie\/(\d{8,14})$/);
      if(movie)return await cached(req,ctx,async()=>{
        const code=movie[1];
        return parseFilm(await getText("/movie/detail/"+code),code);
      });
      if(url.pathname==="/api/year"){
        const year=url.searchParams.get("year")||"";
        const currentYear=new Date().getUTCFullYear();
        if(!/^\d{4}$/.test(year)||Number(year)<2017||Number(year)>currentYear)
          return output({code:400,error:"Invalid year (2017 to current year)"},400);
        return await cached(req,ctx,async()=>{
          const body=await getText("/getYearData?year="+year);
          return parseYear(JSON.parse(body),year);
        });
      }
      if(url.pathname==="/api/day"){
        const date=url.searchParams.get("date")||"";
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||
           new Date(date).toISOString().slice(0,10)!==date||date<"2017-01-01")
          return output({code:400,error:"Invalid date"},400);
        const latest=new Date(Date.now()+36*60*60*1000).toISOString().slice(0,10);
        if(date>latest)return output({code:400,error:"Date is in the future"},400);
        return await cached(req,ctx,async()=>{
          const body=await getText("/getDayData?date="+date+"&withSvcFee=true");
          return parseDay(JSON.parse(body),date);
        });
      }
      return output({code:404,error:"Not Found"},404);
    }catch(err){
      return output({code:502,error:"Third-party data unavailable or unverified",reason:String(err?.message||"unknown").slice(0,100)},502);
    }
  }
};

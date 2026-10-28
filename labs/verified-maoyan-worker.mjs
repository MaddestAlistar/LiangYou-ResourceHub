// LiangYou Maoyan original-source research API.
// Public read-only data: direct Maoyan pages, no auth, no anti-bot bypass.
// Not connected to main site. Respect source terms before public redistribution.
const SOURCE = "https://m.maoyan.com";
const RANK = "https://piaofang.maoyan.com/rankings/year";
const ttl = 7200;
function respond(data,status=200,cacheTime=0){
  const headers={"Content-Type":"application/json; charset=utf-8",
    "Access-Control-Allow-Origin":"*","X-Content-Type-Options":"nosniff",
    "Cache-Control":cacheTime ? "public, max-age="+cacheTime : "no-store"};
  return new Response(JSON.stringify(data),{status,headers});
}
async function fetchHTML(url){
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort(),25000);
  try {
    const r=await fetch(url,{signal:ac.signal,
      headers:{"Accept":"text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "User-Agent":"LiangYou-ResourceHub-Research/1.0 (public read-only)"}
    });
    if(!r.ok)throw Error("source_http_"+r.status);
    const html=await r.text();
    if(html.length<500||html.length>2000000||!html.includes("<html"))throw Error("unexpected_source_html");
    return html;
  }finally{clearTimeout(timer);}
}
function decode(s){
  return (s||"").replace(/&amp;/g,"&").replace(/&quot;/g,'"')
    .replace(/&#39;|&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function match(s,r,group=1){
  const m=r.exec(s);return m ? m[group] : null;
}
function parseMovie(html,id){
  const title=decode(match(html,/<title[^>]*>([^<]+)<\/title>/i));
  if(!title||title.includes("验证")||title.includes("访问受限"))throw Error("source_unexpected_page");
  // Find a movie metadata JSON object with an exact id; not a review or comment.
  const idNeedle='"id":'+String(id)+',"';
  const pos=html.indexOf(idNeedle);
  if(pos<0)throw Error("exact_movie_id_not_found");
  const window=html.slice(pos, pos+9000);
  const name=match(window,/"nm":"([^"]{1,130})"/);
  const release=match(window,/"rt":"([0-9]{4}-[0-9]{2}-[0-9]{2})"/);
  const ratingText=match(window,/"sc":([0-9]+(?:\.[0-9]+)?),"scm":/);
  const ratingLabel=match(window,/"scoreLabel":"([^"]+)"/);
  if(!name||!title.includes(name)||!html.includes("猫眼电影"))throw Error("movie_name_and_page_mismatch");
  const ratingNumber=ratingText===null ? null : Number(ratingText);
  const hasRating=ratingLabel==="猫眼购票评分" && Number.isFinite(ratingNumber) &&
    ratingNumber>0 && ratingNumber<=10;
  // A title's rating count is only read from the exact on-page "N 人评" text.
  const ratingSection=html.match(/<div[^>]*class="[^"]*people-grade[^"]*"[\s\S]{0,500}/);
  const localCount=match(html,/> *([\d,]{3,}) 人评\s*<\/div>/);
  const count=hasRating && localCount ? Number(localCount.replace(/,/g,"")) : null;
  // Validate box-office unit explicitly. Maoyan labels this field 万元.
  const cum=match(html,/<div class="value">\s*([\d,]+(?:\.\d+)?)\s*<\/div>\s*<div class="name">\s*累计票房\(万\)\s*<\/div>/);
  const first=match(html,/<div class="value">\s*([\d,]+(?:\.\d+)?)\s*<\/div>\s*<div class="name">\s*首周票房\(万\)\s*<\/div>/);
  const box= cum && /^[\d,]+(?:\.\d+)?$/.test(cum) ? Number(cum.replace(/,/g,"")) : null;
  const firstBox=first && /^[\d,]+(?:\.\d+)?$/.test(first) ? Number(first.replace(/,/g,"")) : null;
  const q=Number(box);
  if(box!==null&&(!Number.isFinite(q)||q<0))throw Error("invalid_cumulative_box_office");
  return {
    code:0,source:"猫眼电影官方公开影片页",sourceUrl:SOURCE+"/asgard/movie/"+id,
    fetchedAt:new Date().toISOString(), movieId:id, title:name,
    releaseDate:release || null,
    rating:hasRating?ratingNumber:null,
    ratingCount:Number.isSafeInteger(count)&&count>0?count:null,
    ratingType:hasRating?ratingLabel:null,
    cumulativeBoxOffice:box===null?null:{value:box,unit:"万元"},
    firstWeekBoxOffice:firstBox===null?null:{value:firstBox,unit:"万元"},
    fieldsVerified:{
      movieId:true,movieTitle:true,maoyanRating:hasRating,
      ratingCount:Number.isSafeInteger(count)&&count>0,
      cumulativeBoxOffice:box!==null
    },
    note:"Null means not present in public page; never interpret missing data as 0. Values are a snapshot, not a licensed data feed."
  };
}
function parseAnnual(html){
  if(!html.includes('id="ranks-list"'))throw Error("annual_ranking_structure_not_found");
  const ul=/<ul class="row" data-com="hrefTo,href:'\/movie\/(\d+)'">([\s\S]*?)<\/ul>/g;
  const rows=[];let m;
  while((m=ul.exec(html))!==null && rows.length<500){
    const block=m[2];
    const title=decode(match(block,/<p class="first-line">([^<]+)<\/p>/));
    const rank=Number(match(block,/<li class="col0">(\d+)<\/li>/));
    const val=match(block,/<li class="col2 tr">([\d,.]+)<\/li>/);
    const released=match(block,/<p class="second-line">([0-9]{4}-[0-9]{2}-[0-9]{2}) 上映<\/p>/);
    const avg=match(block,/<li class="col3 tr">([\d.]+)<\/li>/);
    const viewers=match(block,/<li class="col4 tr">(\d+)<\/li>/);
    if(!title||!Number.isInteger(rank)||!val)continue;
    const total=Number(val.replace(/,/g,""));
    if(!Number.isFinite(total)||total<0)continue;
    rows.push({rank, movieId:Number(m[1]), title,
      releaseDate:released||null,
      cumulativeBoxOffice:{value:total,unit:"万元"},
      averageTicketPrice:Number.isFinite(Number(avg))?Number(avg):null,
      avgViewersPerScreening: Number.isInteger(Number(viewers))?Number(viewers):null});
  }
  if(rows.length<10||rows[0].rank!==1)throw Error("annual_ranking_data_incomplete");
  return{code:0,source:"猫眼专业版官方公开票房总榜",
    sourceUrl:RANK,fetchedAt:new Date().toISOString(),count:rows.length,data:rows,
    note:"Rankings are a snapshot of the public page; cumulative box office in 万元."};
}
async function served(req,ctx,produce){
  const hit=await caches.default.match(req);if(hit)return hit;
  const result=await produce();
  const response=respond(result,200,ttl);
  ctx.waitUntil(caches.default.put(req,response.clone()));
  return response;
}
export default{
  async fetch(req,env,ctx){
    const url=new URL(req.url);
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
      "Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS"}});
    if(req.method!=="GET")return respond({code:405,message:"GET only"},405);
    if(url.pathname==="/api/health"||url.pathname==="/")return respond({
      code:0,status:"worker-online",name:"LiangYou verified Maoyan film data lab",
      endpoints:["/api/movie/1294273","/api/rankings/alltime"],
      note:"A running Worker does not imply source availability; query actual data endpoint."
    });
    const movie=url.pathname.match(/^\/api\/movie\/([1-9][0-9]{3,9})$/);
    if(movie){
      const id=Number(movie[1]);
      try{return await served(req,ctx,async()=>{
        const html=await fetchHTML(SOURCE+"/asgard/movie/"+id);
        return parseMovie(html,id);
      });}catch(e){
        return respond({code:502,error:"Maoyan movie details unavailable or not verifiable",reason:String(e?.message||"unknown").slice(0,100)},502);
      }
    }
    if(url.pathname==="/api/rankings/alltime"){
      try{return await served(req,ctx,async()=>parseAnnual(await fetchHTML(RANK)));}
      catch(e){return respond({code:502,error:"Maoyan rankings unavailable",reason:String(e?.message||"unknown").slice(0,100)},502);}
    }
    return respond({code:404,error:"Not Found"},404);
  }
};

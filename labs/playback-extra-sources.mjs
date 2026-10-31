// Sidecar adapters for two user-supplied Rex resources: JianPian and VOD aggregate.
// All requests are discovery/metadata probes; never relay video bytes to visitors.
const JP_HOSTS=["https://h5.jianpianips1.com","https://h5.jianpianips2.com"];
const VOD_APIS=[
 ["wolong","https://wolongzyw.com/api.php/provide/vod/"],
 ["zuida","https://api.zuidapi.com/api.php/provide/vod/"],
 ["baofeng","https://bfzyapi.com/api.php/provide/vod/"],
 ["jisu","https://jszyapi.com/api.php/provide/vod/"],
 ["wujin","https://api.wujinapi.com/api.php/provide/vod/"],
 ["ruyi","https://cj.rycjapi.com/api.php/provide/vod/"],
 ["hongniu","https://www.hongniuzy2.com/api.php/provide/vod/"],
 ["guangsu","https://api.guangsuapi.com/api.php/provide/vod/"],
 ["ikun","https://ikunzyapi.com/api.php/provide/vod/"],
 ["uku","https://api.ukuapi.com/api.php/provide/vod/"],
 ["huya","https://www.huyaapi.com/api.php/provide/vod/"],
 ["lezi","https://cj.lziapi.com/api.php/provide/vod/"],
 ["jingyu","https://jyzyapi.com/provide/vod/"],
 ["lovedan","https://lovedan.net/api.php/provide/vod/"],
 ["maotai","https://caiji.maotaizy.cc/api.php/provide/vod/"],
 ["douban","https://dbzy.tv/api.php/provide/vod/"],
 ["subo","https://subocaiji.com/api.php/provide/vod/"],
 ["piaoling","https://p2100.net/api.php/provide/vod/"]
];
// The 3 HTTP-only providers in the Rex configuration are deliberately excluded
// from this HTTPS-only deployment to avoid insecure interception.
const httpsMedia=u=>{
 try{
  const x=new URL(String(u||"").trim());
  if(x.protocol!=="https:"||x.username||x.password||!x.hostname||
   /(?:^|\.)localhost$|(?:^|\.)internal$|(?:^|\.)local$/.test(x.hostname)||
   /^\d+(?:\.\d+){3}$/.test(x.hostname)||x.hostname.includes(":"))return null;
  if(!/\.(?:m3u8|mp4|mov)(?:[?#]|$)/i.test(x.href))return null;
  return x.href;
 }catch{return null;}
};
const clean=s=>String(s??"").trim().slice(0,110);
const basic=s=>clean(s).toLowerCase().replace(/[《》〈〉【】()\[\]（）\s\-_,，。.:：·!！?？]/g,"");
const roman={一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,两:2};
function stripSeason(s){
 const m=String(s||"").match(/第\s*([一二三四五六七八九十\d两]+)\s*[季部]|\bseason\s*(\d+)\b|\s([2-9]|[1-5]\d)$/i);
 if(!m)return {base:clean(s),season:1};
 const raw=m[1]||m[2]||m[3],number=/^\d+$/.test(raw)?Number(raw):roman[raw]||1;
 return {base:clean(s).replace(m[0],"").trim(),season:number};
}
function identity(candidate,record,kind,season,year){
 const title=clean(candidate),a=stripSeason(title);
 if(kind==="tv"&&a.season!==season)return false;
 const aliases=[record.title,record.originalTitle].filter(Boolean).map(s=>basic(stripSeason(s).base));
 // Annotation variants are considered only when their normalized core matches a title.
 // Never accept fuzzy "includes" as it confuses remakes and spin-offs.
 const name=basic(a.base.replace(/（(?:国语|粤语|英语|日语|中字|高清)）|\((?:国语|粤语)\)/gi,""));
 if(!name||!aliases.includes(name))return false;
 const targetYear=Number(record.year||0),candidateYear=Number(year||0);
 if(kind==="movie"&&targetYear&&candidateYear&&Math.abs(targetYear-candidateYear)>1)return false;
 return true;
}
function parseNo(s){
 const n=clean(s);
 const m=n.match(/(?:第\s*)?0*(\d{1,4})\s*(?:[集话話期]|$)|(?:E|EP)\s*0*(\d{1,4})/i);
 return m?Number(m[1]||m[2]):null;
}
function feedParts(item,kind,provider){
 const sections=cleanString(item.vod_play_url||"",650000).split("$$$");
 const sources=cleanString(item.vod_play_from||"",1800).split("$$$");
 const out=[];
 sections.slice(0,16).forEach((s,i)=>{
  const items=s.split("#").slice(0,2000),numbered=items.some(x=>parseNo(x.split("$")[0])!==null);
  items.forEach((ep,n)=>{
   const pos=ep.indexOf("$"),label=pos<0?"":ep.slice(0,pos);
   const raw=pos<0?ep:ep.slice(pos+1),url=httpsMedia(raw);
   if(!url||/抢先|预告|花絮|解说|片段|TC|TS|CAM/i.test(label))return;
   const number=kind==="movie"?1:numbered?parseNo(label):n+1;
   if(number==null||number<1||number>3000)return;
   out.push({provider:"aggregate",channel:provider,number,url});
  });
 });
 return out.slice(0,3000);
}
function cleanString(s,max){return String(s||"").slice(0,max);}
function jianpianParts(detail,kind){
 const out=[],sources=Array.isArray(detail?.source_list_source)?detail.source_list_source:[];
 for(const s of sources.slice(0,16)){
  const channel=clean(s.name).toLowerCase();
  if(/vip|ftp|常规/.test(channel))continue;
  const list=Array.isArray(s.source_list)?s.source_list:[];
  const numbered=list.some(x=>parseNo(x.source_name)!==null);
  list.slice(0,2000).forEach((x,i)=>{
   const url=httpsMedia(x.url);
   if(!url)return;
   const number=kind==="movie"?1:numbered?parseNo(x.source_name):i+1;
   if(number==null||number<1||number>3000)return;
   out.push({provider:"jianpian",channel:channel.slice(0,30),number,url});
  });
 }
 return out.slice(0,3000);
}
async function requestJson(url,fetcher=fetch,maxMs=7500){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),maxMs);
 try{
  const r=await fetcher(url,{method:"GET",redirect:"manual",signal:ctrl.signal,
   headers:{"accept":"application/json,text/plain,*/*"}});
  if(!r.ok||r.status>=300)return null;
  const len=Number(r.headers.get("content-length")||0);
  if(len>1300000)return null;
  const raw=await r.text();
  if(raw.length>1300000)return null;
  return JSON.parse(raw);
 }catch{return null;}
 finally{clearTimeout(timer);}
}
async function queryJianpian(record,kind,season,fetcher=fetch){
 for(const host of JP_HOSTS){
  const query=new URL(host+"/api/v2/search/videoV2");
  query.searchParams.set("key","keyword="+encodeURIComponent(record.title)+"&page=1");
  const result=await requestJson(query.href,fetcher,6500);
  const list=Array.isArray(result?.data)?result.data:Array.isArray(result?.data?.list)?
    result.data.list:Array.isArray(result?.list)?result.list:[];
  const matches=list.filter(x=>x?.id&&identity(x.title||x.vod_name,record,kind,season,x.year)).slice(0,2);
  for(const item of matches){
   const detail=await requestJson(host+"/api/video/detailv2?id="+encodeURIComponent(String(item.id)),fetcher,6500);
   if(!detail||Number(detail.code)!==1||!detail.data)continue;
   const data=detail.data;
   if(!identity(data.title||data.vod_name||item.title,record,kind,season,data.year||item.year))continue;
   const found=jianpianParts(data,kind);
   if(found.length)return found;
  }
 }
 return [];
}
async function queryVod(source,record,kind,season,fetcher=fetch){
 const [channel,url]=source;
 const q=new URL(url);q.searchParams.set("ac","detail");q.searchParams.set("wd",record.title);
 const result=await requestJson(q.href,fetcher,6500);
 const list=Array.isArray(result?.list)?result.list:Array.isArray(result?.data?.list)?result.data.list:[];
 const out=[];
 for(const item of list.slice(0,35)){
  if(!identity(item?.vod_name,record,kind,season,item?.vod_year))continue;
  out.push(...feedParts(item,kind,channel));
 }
 return out.slice(0,3000);
}
function unique(lines){
 const seen=new Set();const result=[];
 for(const line of lines){
  if(!line?.url||seen.has(line.url+"|"+line.number))continue;
  seen.add(line.url+"|"+line.number);result.push(line);
  if(result.length>=3500)break;
 }
 return result;
}
async function discoverExtra(record,kind,season,{fetcher=fetch,siteLimit=8}={}){
 const channels=VOD_APIS.slice(0,Math.max(0,Math.min(18,siteLimit)));
 const queries=[
  queryJianpian(record,kind,season,fetcher),
  ...channels.map(s=>queryVod(s,record,kind,season,fetcher))
 ];
 const settled=await Promise.allSettled(queries);
 const lines=unique(settled.flatMap(x=>x.status==="fulfilled"?x.value:[]));
 return {lines,episodes:[...new Set(lines.map(x=>x.number))].sort((a,b)=>a-b),
  checked:channels.length+1,channels:VOD_APIS.length};
}
export {VOD_APIS,identity,stripSeason,parseNo,feedParts,jianpianParts,queryJianpian,queryVod,discoverExtra,httpsMedia};

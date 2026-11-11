// LYX experience reviews: same Cloudflare ADMIN_KEY and review-queue GitHub secret as News/Wiki.
const STORE_PATH='lyx/reviews.json';
const MAX_ITEMS=120, MAX_BODY=550_000;
const DEFAULT={
 schemaVersion:1,updatedAt:"2026-11-11T16:00:00Z",
 reviews:[{
  id:"shangdaoji",name:"上岛记",category:"生活服务",subtitle:"信息助手",version:"v2.4.1",platform:"iOS / iPadOS",
  icon:"assets/lyx/shangdaoji.svg",
  summary:"专注日常高频信息管理，离线识别并整理取餐码、快递码、排队号和票据信息，通过灵动岛、实时活动及桌面组件让常用信息随时可见。",
  tagline:"识别高效 · 功能完整 · 体验优秀",tags:["本地识别","灵动岛","锁屏组件","Apple Watch"],
  scores:[92,91,86,91,89,90],
  review:"上岛记是一款侧重日常信息管理效率的实用工具，可在设备本地识别并整理取餐码、快递码、排队号、车票机票、验证码、二维码与备忘信息。\n\n它通过灵动岛、实时活动、锁屏与桌面小组件展示重要内容，并兼容 Apple Watch，支持来源标识自定义和智能分类，让不同场景的信息更容易查找。\n\n本地完成识别和数据处理也是它的一项优势。整体定位清晰，功能覆盖丰富，适合需要频繁查看取件、排队或票据信息的用户。",
  status:"published",order:1,updatedAt:"2026-11-11T16:00:00Z"
 }]
};
const json=(obj,status,cors,cache="no-store")=>new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":cors,"Cache-Control":cache,"Vary":"Origin","X-Content-Type-Options":"nosniff"}});
const encode=s=>{let bytes=new TextEncoder().encode(s),a='';for(let i=0;i<bytes.length;i+=8192)a+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(a)};
const decode=s=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(String(s).replace(/\s/g,'')),x=>x.charCodeAt(0)));
const check=(s,max,required=false)=>typeof s==="string"&&s.length<=max&&(!required||s.trim().length>0)&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s);
const validId=s=>typeof s==='string'&&/^[a-z0-9-]{1,80}$/.test(s);
function validate(row){
 if(!row||!validId(row.id))throw Error("应用 ID 格式无效");
 for(const [key,max,required] of [["name",70,true],["category",50,true],["subtitle",60,false],["version",30,false],["platform",80,false],["tagline",100,false],["summary",800,true],["review",10000,true]]){
   if(!check(row[key]??"",max,required))throw Error(key+" 内容格式或长度有误");
 }
 if(!Array.isArray(row.scores)||row.scores.length!==6||row.scores.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0||x>100))throw Error("六项评分必须填写 0–100");
 if(!Array.isArray(row.tags)||row.tags.length>10||row.tags.some(x=>!check(x,30)))throw Error("功能标签不合法");
 const icon=row.icon||"assets/lyx/shangdaoji.svg";
 if(typeof icon!=='string'||icon.length>160000||!/^(assets\/(?:lyx|collabs)\/[a-zA-Z0-9_.\/-]+\.(?:svg|png|webp)|data:image\/webp;base64,[A-Za-z0-9+/]+=*)$/.test(icon)||icon.includes(".."))throw Error("应用图标格式无效");
 if(icon.startsWith("data:")){
  const raw=atob(icon.split(",")[1]);
  if(raw.length>110000||raw.length<80||raw.slice(0,4)!=="RIFF"||raw.slice(8,12)!=="WEBP")throw Error("上传图标须为有效 WebP 且小于 110KB");
 }
 if(!["draft","published"].includes(row.status))throw Error("发布状态无效");
 if(!Number.isInteger(row.order)||row.order<1||row.order>999)throw Error("排序数字须在 1–999");
 if(typeof row.updatedAt!=="string"||!Number.isFinite(Date.parse(row.updatedAt)))throw Error("更新时间无效");
 const result={};
 for(const f of ["id","name","category","subtitle","version","platform","icon","summary","tagline","tags","scores","review","status","order","updatedAt"])result[f]=row[f]??(f==="icon"?icon:"");
 return result;
}
function validateStore(data){
 if(!data||data.schemaVersion!==1||!Array.isArray(data.reviews)||data.reviews.length>MAX_ITEMS)throw Error("评测仓库数据结构异常");
 const seen=new Set(),reviews=data.reviews.map(row=>{let r=validate(row);if(seen.has(r.id))throw Error("评测 ID 重复");seen.add(r.id);return r});
 return {schemaVersion:1,updatedAt:data.updatedAt||null,reviews};
}
function ghClient(env,fetcher){
 if(!env.GITHUB_TOKEN||!env.REVIEW_REPO)throw Error("后台存储尚未配置");
 const url="https://api.github.com/repos/"+env.REVIEW_REPO+"/contents/"+STORE_PATH;
 const headers={"Authorization":"Bearer "+env.GITHUB_TOKEN,"Accept":"application/vnd.github+json","Content-Type":"application/json","User-Agent":"LiangYou-LYX-Review","X-GitHub-Api-Version":"2022-11-28"};
 return async(opt={})=>fetcher(url,{...opt,headers,signal:AbortSignal.timeout(25000)});
}
async function loadStore(gh){
 const res=await gh();
 if(res.status===404)return {sha:null,data:validateStore(DEFAULT)};
 if(!res.ok)throw Error("评测数据读取失败（HTTP "+res.status+"）");
 const file=await res.json();let data;
 try{data=JSON.parse(decode(file.content))}catch{throw Error("评测数据解析失败")}
 return {sha:file.sha,data:validateStore(data)};
}
async function readBody(req){
 if(!(req.headers.get("content-type")||"").startsWith("application/json"))throw Error("请使用 JSON 请求");
 if(Number(req.headers.get("content-length")||0)>MAX_BODY)throw Error("提交内容过大");
 const text=await req.text();if(text.length>MAX_BODY)throw Error("提交内容过大");
 try{return JSON.parse(text)}catch{throw Error("提交的 JSON 无效")}
}
export async function serveLyxReviews(request,env,{origin="",allowed="https://maddestalistar.github.io",fetcher=fetch}={}){
 const path=new URL(request.url).pathname,publicFeed=path==="/lyx-feed";
 if(!publicFeed&&path!=="/lyx-admin")return null;
 const cors=publicFeed?"*":(origin===allowed?origin:"null");
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":cors,"Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type,X-Admin-Key","Access-Control-Max-Age":"600"}});
 if(publicFeed&&request.method!=="GET")return json({ok:false,error:"Method not allowed"},405,cors);
 if(!publicFeed){
   if(origin!==allowed)return json({ok:false,error:"Origin not allowed"},403,cors);
   if(!env.ADMIN_KEY)return json({ok:false,error:"管理员密钥未配置"},503,cors);
   const key=request.headers.get("X-Admin-Key")||"";
   if(key.length<24||key!==env.ADMIN_KEY)return json({ok:false,error:"管理员密钥错误"},401,cors);
   if(!["GET","POST"].includes(request.method))return json({ok:false,error:"Method not allowed"},405,cors);
 }
 try{
   const gh=ghClient(env,fetcher);
   if(request.method==="GET"){
     const {data}=await loadStore(gh);
     const reviews=publicFeed?data.reviews.filter(x=>x.status==="published"):data.reviews;
     return json({ok:true,schemaVersion:1,updatedAt:data.updatedAt,reviews},200,cors,publicFeed?"public, max-age=45":"no-store");
   }
   const body=await readBody(request),action=body?.action;
   if(!["create","update"].includes(action))return json({ok:false,error:"操作不支持"},400,cors);
   let submitted;
   try{submitted=validate({...body.item,updatedAt:new Date().toISOString()})}catch(e){return json({ok:false,error:e.message},400,cors)}
   if(action==="update"&&(!check(body.expectedUpdatedAt,60,true)||!Number.isFinite(Date.parse(body.expectedUpdatedAt))))return json({ok:false,error:"缺少编辑版本信息，请重新加载"},400,cors);
   for(let retry=0;retry<3;retry++){
     const {sha,data}=await loadStore(gh),i=data.reviews.findIndex(x=>x.id===submitted.id);
     if(action==="create"){
       if(i>=0)return json({ok:false,error:"该应用 ID 已存在，请编辑现有记录"},409,cors);
       if(data.reviews.length>=MAX_ITEMS)return json({ok:false,error:"已达到评测上限"},409,cors);
       data.reviews.push(submitted);
     }else{
       if(i<0)return json({ok:false,error:"档案不存在，请刷新"},404,cors);
       if(data.reviews[i].updatedAt!==body.expectedUpdatedAt)return json({ok:false,error:"这份评测已被其他管理员修改，请刷新后重新编辑，避免覆盖"},409,cors);
       submitted.updatedAt=new Date(Math.max(Date.now(),Date.parse(data.reviews[i].updatedAt)+1)).toISOString();
       data.reviews[i]=submitted;
     }
     data.updatedAt=submitted.updatedAt;
     const payload={message:"lyx: "+action+" "+submitted.id,content:encode(JSON.stringify(data,null,2)+"\n"),...(sha?{sha}:{})};
     const saved=await gh({method:"PUT",body:JSON.stringify(payload)});
     if(saved.ok)return json({ok:true,item:submitted,updatedAt:data.updatedAt,reviews:data.reviews},200,cors);
     if([409,422].includes(saved.status))continue;
     return json({ok:false,error:"保存失败（GitHub HTTP "+saved.status+"）"},502,cors);
   }
   return json({ok:false,error:"并发写入冲突，请重新尝试"},409,cors);
 }catch(e){return json({ok:false,error:e.message||"LYX 服务暂时不可用"},502,cors)}
}

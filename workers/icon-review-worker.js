import { publishIcon, githubClient, encode, VERSION } from "./icon-publisher.mjs";
// Cloudflare Worker · Icon Review Queue
// Secrets: GITHUB_TOKEN (fine-grained Contents: Read and write, restricted to review repository)
// Vars: REVIEW_REPO = MaddestAlistar/Icon-Review-Queue; ALLOWED_ORIGIN = https://maddestalistar.github.io
const reply=(obj,status=200,origin="")=>new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":origin,"Vary":"Origin","Cache-Control":"no-store"}});
export default {async fetch(request,env){
 const origin=request.headers.get("Origin")||"";
 const allowed=env.ALLOWED_ORIGIN||"https://maddestalistar.github.io";
 try {
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin===allowed?origin:"null","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, X-Admin-Key","Access-Control-Max-Age":"600"}});
 const url=new URL(request.url);
 // Public liveness/version only; no credentials, configuration or queue data.
 if(request.method==="GET"&&url.pathname==="/health")return reply({ok:true,version:VERSION},200,origin===allowed?origin:"");
 if(origin!==allowed)return reply({error:"Origin not allowed"},403,"null");
 if(url.pathname==="/admin"){
  if(!env.ADMIN_KEY)return reply({error:"Admin not configured"},503,origin);
  const key=request.headers.get("X-Admin-Key")||"";
  if(key.length<24||key!==env.ADMIN_KEY)return reply({error:"Unauthorized"},401,origin);
  if(!env.GITHUB_TOKEN||!env.REVIEW_REPO)return reply({error:"Server is not configured"},503,origin);
  const root="https://api.github.com/repos/"+env.REVIEW_REPO+"/contents/";
  const ghHeaders={"Authorization":"Bearer "+env.GITHUB_TOKEN,"Accept":"application/vnd.github+json","Content-Type":"application/json","User-Agent":"LiangYou-Icon-Review","X-GitHub-Api-Version":"2022-11-28"};
  const gh=async(path,options={})=>fetch(root+path,{...options,headers:ghHeaders,signal:AbortSignal.timeout(20000)});
  const decode=s=>decodeURIComponent(escape(atob(s.replace(/\s/g,""))));
  if(request.method==="GET"){
   const listing=await gh("pending");
   if(!listing.ok)return reply({error:"Failed to list pending files",status:listing.status},502,origin);
   const entries=await listing.json();
   const all=entries.filter(x=>x.type==="file"&&x.name.endsWith(".json")).sort((a,b)=>a.name.localeCompare(b.name));
   const offset=Math.max(0,Number.parseInt(url.searchParams.get("cursor")||"0",10)||0);
   const metas=all.slice(offset,offset+30);
   const items=await Promise.all(metas.map(async x=>{
    try{const res=await gh("pending/"+encodeURIComponent(x.name));if(!res.ok)return null;const obj=await res.json();const m=JSON.parse(decode(obj.content));return {...m,metaPath:"pending/"+x.name,metaSha:obj.sha,imageUrl:"https://raw.githubusercontent.com/"+env.REVIEW_REPO+"/main/"+m.filename.split("/").map(encodeURIComponent).join("/")};}catch{return null}
   }));
   return reply({ok:true,items:items.filter(Boolean),nextCursor:offset+30<all.length?offset+30:null,total:all.length},200,origin);
  }
  if(request.method==="POST"){
   let body;try{body=await request.json()}catch{return reply({error:"Invalid JSON"},400,origin)}
   const path=String(body.path||"");const status=String(body.status||"");
   if(!/^pending\/[a-zA-Z0-9_\u4e00-\u9fa5-]+\.json$/.test(path)||!["approved","rejected","pending"].includes(status))return reply({error:"Invalid request"},400,origin);
   const current=await gh(path);if(!current.ok)return reply({error:"Metadata not found"},404,origin);
   const item=await current.json();let meta;try{meta=JSON.parse(decode(item.content))}catch{return reply({error:"Bad metadata"},502,origin)}
   if(status!=="approved"&&(meta.publishedUrl||meta.status==="approved"))return reply({error:"已发布图标不能改回待审核或拒绝；如需下架，须同步移除正式库索引"},409,origin);
   if(status==="approved"){
    if(!env.PUBLISH_GITHUB_TOKEN)return reply({error:"正式图标库发布权限未配置"},503,origin);
    try {
      const publication=await publishIcon(meta,githubClient("MaddestAlistar/LiangYou-IconLibrary",env.PUBLISH_GITHUB_TOKEN),async()=>{
        const image=await gh(meta.filename.split("/").map(encodeURIComponent).join("/"));
        if(!image.ok)throw new Error("审核图片读取失败");
        const data=await image.json();
        if(data.encoding==="base64")return data;
        return githubClient(env.REVIEW_REPO,env.GITHUB_TOKEN)("git/blobs/"+data.sha);
      });
      for(const key of ["publishedName","publishedFilename","publishedUrl","publishedAt","publishedCommit","publisherVersion"])if(publication[key])meta[key]=publication[key];
      meta.publicationVerifiedAt=new Date().toISOString();
    } catch(error){return reply({error:error.message||"发布失败，请刷新后重试"},502,origin)}
   }
   meta.status=status;meta.reviewedAt=new Date().toISOString();
   const content=encode(JSON.stringify(meta,null,2)+"\n");
   const saved=await gh(path,{method:"PUT",body:JSON.stringify({message:"review: "+status+" "+meta.name,content,sha:item.sha})});
   if(!saved.ok)return reply({error:status==="approved"?"正式库已发布，但审核状态未保存。请刷新后再次点击通过，系统会核对已有发布，不会重复入库":"审核状态保存失败，请刷新后重试",status:saved.status},502,origin);
   return reply({ok:true,status,item:meta,publicationVerified:status==="approved"},200,origin);
  }
  return reply({error:"Method not allowed"},405,origin);
 }
 if(request.method!=="POST")return reply({error:"Method not allowed"},405,origin);
 if(!env.GITHUB_TOKEN||!env.REVIEW_REPO)return reply({error:"Server is not configured"},503,origin);
 const ct=request.headers.get("Content-Type")||"";if(!ct.includes("multipart/form-data"))return reply({error:"Expected multipart form"},400,origin);
 const len=Number(request.headers.get("Content-Length")||0);if(len>11*1024*1024)return reply({error:"File too large"},413,origin);
 let form;try{form=await request.formData()}catch{return reply({error:"Invalid form"},400,origin)}
 const file=form.get("file"),name=String(form.get("name")||"").trim(),author=String(form.get("author")||"").trim(),notes=String(form.get("notes")||"").slice(0,600),kind=String(form.get("kind")||"");
 if(!(file instanceof File)||!name||name.length>60||!author||author.length>100)return reply({error:"Missing or invalid fields"},400,origin);
 if(file.size>10*1024*1024||file.size===0)return reply({error:"Maximum file size is 10 MB"},413,origin);
 const ext=(file.name.split(".").pop()||"").toLowerCase();if(!["png","webp","gif"].includes(ext)||((kind==="动态")!==(ext==="gif")))return reply({error:"Invalid image type"},400,origin);
 const bytes=new Uint8Array(await file.arrayBuffer());let w=0,h=0,valid=false;
 const be=(p)=>((bytes[p]<<24)>>>0)+(bytes[p+1]<<16)+(bytes[p+2]<<8)+bytes[p+3];
 if(ext==="png"&&bytes.length>24&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71){w=be(16);h=be(20);valid=true}
 if(ext==="gif"&&bytes.length>10&&String.fromCharCode(...bytes.slice(0,3))==="GIF"){w=bytes[6]+bytes[7]*256;h=bytes[8]+bytes[9]*256;valid=true}
 if(ext==="webp"&&bytes.length>30&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP"){
 const typ=String.fromCharCode(...bytes.slice(12,16));
 if(typ==="VP8X"){w=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);h=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);valid=true}
 else if(typ==="VP8 "&&bytes.length>30){w=(bytes[26]|bytes[27]<<8)&16383;h=(bytes[28]|bytes[29]<<8)&16383;valid=true}
 else if(typ==="VP8L"&&bytes.length>25){const v=(bytes[21]|bytes[22]<<8|bytes[23]<<16|bytes[24]<<24)>>>0;w=(v&16383)+1;h=((v>>>14)&16383)+1;valid=true}
 }
 if(!valid||(ext==="gif"?(w!==h||w<320||w>480):(w!==720||h!==720)))return reply({error:ext==="gif"?"GIF must be square, 320–480 px":"Static icon must be 720 × 720 px"},400,origin);
 const safe=name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g,"-").slice(0,48)||"icon";
 const id=new Date().toISOString().replace(/[-:.TZ]/g,"")+"-"+crypto.randomUUID().slice(0,8);
 const base="pending/"+safe+"-"+id;const b64=(()=>{let s="";for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)})();
 const api="https://api.github.com/repos/"+env.REVIEW_REPO+"/contents/";
 const headers={"Authorization":"Bearer "+env.GITHUB_TOKEN,"Accept":"application/vnd.github+json","Content-Type":"application/json","User-Agent":"LiangYou-Icon-Review","X-GitHub-Api-Version":"2022-11-28"};
 const put=async(path,content)=>fetch(api+path,{method:"PUT",headers,body:JSON.stringify({message:"queue: "+safe+" ("+id+")",content})});
 const uploaded=await put(base+"."+ext,b64);
 if(!uploaded.ok)return reply({error:"GitHub upload failed",status:uploaded.status},502,origin);
 const metadata={id,name,author,kind,notes,filename:base+"."+ext,bytes:file.size,width:w,height:h,submittedAt:new Date().toISOString(),status:"pending"};
 const meta=await put(base+".json",btoa(unescape(encodeURIComponent(JSON.stringify(metadata,null,2)))));
 if(!meta.ok)return reply({error:"Image uploaded but metadata failed",id},502,origin);
 return reply({ok:true,id,reviewUrl:"https://github.com/"+env.REVIEW_REPO+"/tree/main/pending"},201,origin);
} catch { return reply({error:"服务暂时不可用，请刷新记录后重试；已完成发布的投稿不会重复入库"},503,origin===allowed?origin:"null"); }
}};
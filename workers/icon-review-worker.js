import { inspectImage } from "../icon-image.mjs";
import { isUUID, submitBatchItem } from "./icon-batch-submission.mjs";
import { validEmail, sealEmail, adminMetadata } from "./icon-contact.mjs";
import { publishIcon, withdrawIcon, renameIcon, githubClient, encode, VERSION } from "./icon-publisher.mjs";
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
   let entries=await listing.json();
   // Contents API caps a directory at 1,000 entries (images + metadata).
   // Large batch queues must not silently hide later submissions.
   if(entries.length>=1000){
    const treeClient=githubClient(env.REVIEW_REPO,env.GITHUB_TOKEN);
    const rootTree=await treeClient('git/trees/main');
    const pending=rootTree.tree.find(x=>x.path==='pending'&&x.type==='tree');
    if(!pending)return reply({error:'审核目录不存在，请刷新后重试'},502,origin);
    const tree=await treeClient('git/trees/'+pending.sha);
    if(tree.truncated)return reply({error:'审核目录过大，请先归档历史记录，避免遗漏投稿'},502,origin);
    entries=tree.tree.map(x=>({name:x.path,type:x.type==='blob'?'file':x.type}));
   }
   const all=entries.filter(x=>x.type==="file"&&x.name.endsWith(".json")).sort((a,b)=>a.name.localeCompare(b.name));
   const offset=Math.max(0,Number.parseInt(url.searchParams.get("cursor")||"0",10)||0);
   const metas=all.slice(offset,offset+30);
   const items=await Promise.all(metas.map(async x=>{
    try{const res=await gh("pending/"+encodeURIComponent(x.name));if(!res.ok)return null;const obj=await res.json();const m=JSON.parse(decode(obj.content));return {...await adminMetadata(m,env),metaPath:"pending/"+x.name,metaSha:obj.sha,imageUrl:"https://raw.githubusercontent.com/"+env.REVIEW_REPO+"/main/"+m.filename.split("/").map(encodeURIComponent).join("/")};}catch{return null}
   }));
   return reply({ok:true,items:items.filter(Boolean),nextCursor:offset+30<all.length?offset+30:null,total:all.length},200,origin);
  }
  if(request.method==="POST"){
   let body;try{body=await request.json()}catch{return reply({error:"Invalid JSON"},400,origin)}
   const path=String(body.path||"");const status=String(body.status||"");const renaming=body.action==="rename";
   if(!/^pending\/[a-zA-Z0-9_\u4e00-\u9fa5-]+\.json$/.test(path)||(!renaming&&!["approved","rejected","pending","withdrawn"].includes(status)))return reply({error:"Invalid request"},400,origin);
   const current=await gh(path);if(!current.ok)return reply({error:"Metadata not found"},404,origin);
   const item=await current.json();let meta;try{meta=JSON.parse(decode(item.content))}catch{return reply({error:"Bad metadata"},502,origin)}
   if(renaming){
    const name=String(body.name||"").trim();
    if(!name||name.length>60||/[\u0000-\u001f\u007f]/.test(name))return reply({error:"名称须为 1–60 个字符，不能包含控制字符"},400,origin);
    if((meta.status==="approved"||meta.publishedUrl)&&!env.PUBLISH_GITHUB_TOKEN)return reply({error:"正式库权限未配置"},503,origin);
    let renamed;
    try{if(env.PUBLISH_GITHUB_TOKEN)renamed=await renameIcon(meta,name,githubClient("MaddestAlistar/LiangYou-IconLibrary",env.PUBLISH_GITHUB_TOKEN))}catch(e){return reply({error:e.message},502,origin)}
    meta.originalSubmittedName??=meta.name;meta.name=name;meta.renamedAt=new Date().toISOString();
    if(renamed){meta.publishedName=renamed.publishedName;meta.publishedUrl=renamed.publishedUrl}
    const saved=await gh(path,{method:"PUT",body:JSON.stringify({message:"review: rename "+meta.id,sha:item.sha,content:encode(JSON.stringify(meta,null,2)+"\n")})});
    if(!saved.ok)return reply({error:"名称保存未能确认，请刷新后用相同名称重试；正式库修改可安全核对"},502,origin);
    return reply({ok:true,item:await adminMetadata(meta,env),renamed:true},200,origin);
   }
   if(!["approved","withdrawn"].includes(status)&&(meta.publishedUrl||["approved","withdrawn"].includes(meta.status)))return reply({error:"已发布图标不能改回待审核或拒绝；如需下架，须同步移除正式库索引"},409,origin);
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
   if(status==="withdrawn"){
    if(!env.PUBLISH_GITHUB_TOKEN)return reply({error:"正式图标库发布权限未配置"},503,origin);
    try {
      const result=await withdrawIcon(meta,githubClient("MaddestAlistar/LiangYou-IconLibrary",env.PUBLISH_GITHUB_TOKEN));
      for(const key of ["publishedName","publishedFilename","publishedUrl","publishedAt","withdrawnAt","withdrawnCommit","publisherVersion"])if(result[key])meta[key]=result[key];
      meta.withdrawalVerifiedAt=new Date().toISOString();
    } catch(error){return reply({error:error.message||"下架失败，请刷新后重试"},502,origin)}
   }
   meta.status=status;meta.reviewedAt=new Date().toISOString();
   const content=encode(JSON.stringify(meta,null,2)+"\n");
   const saved=await gh(path,{method:"PUT",body:JSON.stringify({message:"review: "+status+" "+meta.name,content,sha:item.sha})});
   if(!saved.ok)return reply({error:status==="approved"?"正式库已发布，但审核状态未保存。请刷新后再次点击通过，系统会核对已有发布，不会重复入库":status==="withdrawn"?"正式库已下架，但审核状态未保存。请刷新后再次点击下架，系统会核对已有结果":"审核状态保存失败，请刷新后重试",status:saved.status},502,origin);
   return reply({ok:true,status,item:await adminMetadata(meta,env),publicationVerified:status==="approved",withdrawalVerified:status==="withdrawn"},200,origin);
  }
  return reply({error:"Method not allowed"},405,origin);
 }
 if(request.method!=="POST")return reply({error:"Method not allowed"},405,origin);
 if(!env.GITHUB_TOKEN||!env.REVIEW_REPO)return reply({error:"Server is not configured"},503,origin);
 const ct=request.headers.get("Content-Type")||"";if(!ct.includes("multipart/form-data"))return reply({error:"Expected multipart form"},400,origin);
 const len=Number(request.headers.get("Content-Length")||0);if(len>11*1024*1024)return reply({error:"File too large"},413,origin);
 let form;try{form=await request.formData()}catch{return reply({error:"Invalid form"},400,origin)}
 const email=String(form.get("email")||"").trim();
 if(!validEmail(email))return reply({error:"邮箱格式不正确，请修改或留空 / Invalid email"},400,origin);
 const file=form.get("file"),name=String(form.get("name")||"").trim(),author=String(form.get("author")||"").trim(),notes=String(form.get("notes")||"").slice(0,600),kind=String(form.get("kind")||"");
 if(!(file instanceof File)||!name||name.length>60||!author||author.length>100)return reply({error:"Missing or invalid fields"},400,origin);
 if(file.size>10*1024*1024||file.size===0)return reply({error:"Maximum file size is 10 MB"},413,origin);
 const ext=(file.name.split(".").pop()||"").toLowerCase();if(!["png","webp","gif"].includes(ext)||((kind==="动态")!==(ext==="gif")))return reply({error:"Invalid image type"},400,origin);
 const bytes=new Uint8Array(await file.arrayBuffer());let imageInfo;
 try{imageInfo=inspectImage(bytes,file.name)}catch(error){return reply({error:error.message},400,origin)}
 const {width:w,height:h}=imageInfo;
 const submissionKey=String(form.get("submissionKey")||""),batchId=String(form.get("batchId")||"");
 if(submissionKey||batchId){
  if(form.get("namesConfirmed")!=="true")return reply({error:"请确认打包文件中的单独图片都有命名"},400,origin);
  if(!isUUID(submissionKey)||!isUUID(batchId))return reply({error:"Invalid batch identifier"},400,origin);
  try{
   const result=await submitBatchItem({submissionKey,batchId,name,author,notes,kind,ext,width:w,height:h},email,bytes,env,githubClient(env.REVIEW_REPO,env.GITHUB_TOKEN));
   return reply({ok:true,...result},result.recovered?200:201,origin);
  }catch(error){return reply({error:error.message||"批量投稿未能确认完成，请使用原批次重试"},502,origin)}
 }
 const safe=name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g,"-").slice(0,48)||"icon";
 const id=new Date().toISOString().replace(/[-:.TZ]/g,"")+"-"+crypto.randomUUID().slice(0,8);
 let contactEmailEncrypted;
 try{contactEmailEncrypted=await sealEmail(email,id,env)}catch{return reply({error:"邮箱暂时无法安全保存，请稍后重试或留空邮箱后提交"},503,origin)}
 const base="pending/"+safe+"-"+id;const b64=(()=>{let s="";for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)})();
 const api="https://api.github.com/repos/"+env.REVIEW_REPO+"/contents/";
 const headers={"Authorization":"Bearer "+env.GITHUB_TOKEN,"Accept":"application/vnd.github+json","Content-Type":"application/json","User-Agent":"LiangYou-Icon-Review","X-GitHub-Api-Version":"2022-11-28"};
 const put=async(path,content)=>fetch(api+path,{method:"PUT",headers,body:JSON.stringify({message:"queue: "+safe+" ("+id+")",content})});
 const uploaded=await put(base+"."+ext,b64);
 if(!uploaded.ok)return reply({error:"GitHub upload failed",status:uploaded.status},502,origin);
 const metadata={id,name,author,kind,notes,...(contactEmailEncrypted?{contactEmailEncrypted}:{}),filename:base+"."+ext,bytes:file.size,width:w,height:h,submittedAt:new Date().toISOString(),status:"pending"};
 const meta=await put(base+".json",btoa(unescape(encodeURIComponent(JSON.stringify(metadata,null,2)))));
 if(!meta.ok)return reply({error:"Image uploaded but metadata failed",id},502,origin);
 return reply({ok:true,id,reviewUrl:"https://github.com/"+env.REVIEW_REPO+"/tree/main/pending"},201,origin);
} catch { return reply({error:"服务暂时不可用，请刷新记录后重试；已完成发布的投稿不会重复入库"},503,origin===allowed?origin:"null"); }
}};

// Cloudflare Worker · Icon Review Queue
// Secrets: GITHUB_TOKEN (fine-grained Contents: Read and write, restricted to review repository)
// Vars: REVIEW_REPO = MaddestAlistar/Icon-Review-Queue; ALLOWED_ORIGIN = https://maddestalistar.github.io
const reply=(obj,status=200,origin="")=>new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":origin,"Vary":"Origin","Cache-Control":"no-store"}});
export default {async fetch(request,env){
 const origin=request.headers.get("Origin")||"";
 const allowed=env.ALLOWED_ORIGIN||"https://maddestalistar.github.io";
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin===allowed?origin:"null","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, X-Admin-Key","Access-Control-Max-Age":"600"}});
 if(origin!==allowed)return reply({error:"Origin not allowed"},403,"null");

 const url=new URL(request.url);
 if(url.pathname==="/admin"){
  if(!env.ADMIN_KEY)return reply({error:"Admin not configured"},503,origin);
  const key=request.headers.get("X-Admin-Key")||"";
  if(key.length<24||key!==env.ADMIN_KEY)return reply({error:"Unauthorized"},401,origin);
  if(!env.GITHUB_TOKEN||!env.REVIEW_REPO)return reply({error:"Server is not configured"},503,origin);
  const root="https://api.github.com/repos/"+env.REVIEW_REPO+"/contents/";
  const ghHeaders={"Authorization":"Bearer "+env.GITHUB_TOKEN,"Accept":"application/vnd.github+json","Content-Type":"application/json","User-Agent":"LiangYou-Icon-Review","X-GitHub-Api-Version":"2022-11-28"};
  const gh=async(path,options={})=>fetch(root+path,{...options,headers:ghHeaders});
  const decode=s=>decodeURIComponent(escape(atob(s.replace(/\s/g,""))));
  if(request.method==="GET"){
   const listing=await gh("pending");
   if(!listing.ok)return reply({error:"Failed to list pending files",status:listing.status},502,origin);
   const entries=await listing.json();
   const metas=entries.filter(x=>x.type==="file"&&x.name.endsWith(".json")).slice(-100).reverse();
   const items=await Promise.all(metas.map(async x=>{
    try{const res=await gh("pending/"+encodeURIComponent(x.name));if(!res.ok)return null;const obj=await res.json();const m=JSON.parse(decode(obj.content));return {...m,metaPath:"pending/"+x.name,metaSha:obj.sha,imageUrl:"https://raw.githubusercontent.com/"+env.REVIEW_REPO+"/main/"+m.filename.split("/").map(encodeURIComponent).join("/")};}catch{return null}
   }));
   return reply({ok:true,items:items.filter(Boolean)},200,origin);
  }
  if(request.method==="POST"){
   let body;try{body=await request.json()}catch{return reply({error:"Invalid JSON"},400,origin)}
   const path=String(body.path||"");const status=String(body.status||"");
   if(!/^pending\/[a-zA-Z0-9_\u4e00-\u9fa5-]+\.json$/.test(path)||!["approved","rejected","pending"].includes(status))return reply({error:"Invalid request"},400,origin);
   const current=await gh(path);if(!current.ok)return reply({error:"Metadata not found"},404,origin);
   const item=await current.json();let meta;try{meta=JSON.parse(decode(item.content))}catch{return reply({error:"Bad metadata"},502,origin)}
   if(status==="approved"){
    if(!env.PUBLISH_GITHUB_TOKEN)return reply({error:"请先在 Cloudflare 添加 PUBLISH_GITHUB_TOKEN（仅正式图标库 Contents 读写权限）"},503,origin);
    if(meta.status==="approved")return reply({error:"Already approved; check official library before retrying"},409,origin);
    const official="MaddestAlistar/LiangYou-IconLibrary";
    const publishHeaders={...ghHeaders,Authorization:"Bearer "+env.PUBLISH_GITHUB_TOKEN};
    const getOfficial=async p=>fetch("https://api.github.com/repos/"+official+"/contents/"+p,{headers:publishHeaders});
    const putOfficial=async(p,content,sha)=>fetch("https://api.github.com/repos/"+official+"/contents/"+p,{method:"PUT",headers:publishHeaders,body:JSON.stringify({message:"publish reviewed icon: "+meta.name,content,...(sha?{sha}:{})})});
    const isDynamic=meta.kind==="动态"||/\\.gif$/i.test(meta.filename);
    const ext=String(meta.filename).split(".").pop().toLowerCase();
    const rawName=String(meta.name||"").trim().replace(/\\s*(?:动态|dynamic)\\s*(?:0*[0-9]+)?$/i,"").trim();
    if(!rawName||!["png","webp","gif"].includes(ext))return reply({error:"Invalid icon name or extension"},400,origin);
    const files=["LiangYou-Original-Icons.json","LiangYou-Emby-Icons.json"];
    const plans=[];
    const snapshots=[];
    for(const file of files){
      const resp=await getOfficial(file);
      if(!resp.ok)return reply({error:"Cannot read "+file,status:resp.status},502,origin);
      const record=await resp.json();
      let data;try{data=JSON.parse(decode(record.content))}catch{return reply({error:"Invalid official JSON: "+file},502,origin)}
      if(!Array.isArray(data.icons)||data.icons.length<5)return reply({error:"Unsupported icon list: "+file},502,origin);
      snapshots.push({file,sha:record.sha,data});
    }
    const existing=snapshots.flatMap(x=>x.data.icons);
    const stripIndex=v=>String(v||"").trim().replace(/\\s+0*[0-9]+$/,"").trim();
    const displayPart=v=>stripIndex(v).split("｜").pop().trim();
    const lower=v=>v.toLocaleLowerCase();
    const nameKey=lower(rawName);
    const related=existing.filter(x=>{
      const base=displayPart(x.name).replace(/\\s*动态$/,"").trim();
      return lower(base)===nameKey;
    });
    const existingPrefix=related.map(x=>String(x.name).split("｜")[0]).find(x=>/^[a-zA-Z0-9-]+$/.test(x));
    const hasChinese=/[\\p{Script=Han}]/u.test(rawName);
    // Reuse a verified existing romanized prefix; do not invent pinyin for new Chinese names.
    const asciiStem=rawName.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
    const fileStem=(hasChinese&&existingPrefix?existingPrefix.toLowerCase():hasChinese?rawName.normalize("NFKC").toLowerCase():asciiStem).replace(/[^a-z0-9\\p{Script=Han}-]+/gu,"-").replace(/^-+|-+$/g,"").slice(0,70)||"icon";
    const prefix=hasChinese&&existingPrefix?existingPrefix+"｜":"";
    const baseLabel=prefix+rawName+(isDynamic?(hasChinese?"动态":" 动态"):"");
    const existingNames=new Set(existing.map(x=>lower(String(x.name||""))));
    let number=1;
    let label;
    do{
      label=baseLabel+(isDynamic||number>1?" "+String(number).padStart(2,"0"):"");
      if(!existingNames.has(lower(label)))break;
      number++;
    }while(number<1000);
    if(number>=1000)return reply({error:"Too many duplicate icon names"},409,origin);
    // Dynamic entries must always contain 动态 and a numbered suffix for search compatibility.
    let imagePath,exists;
    for(let attempt=0;attempt<100;attempt++){
      const suffix=String(number+attempt).padStart(2,"0");
      imagePath="icons/liangyou/"+fileStem+(isDynamic?"-animated":"")+"-"+suffix+"."+ext;
      exists=await getOfficial(imagePath.split("/").map(encodeURIComponent).join("/"));
      if(exists.status===404)break;
      if(!exists.ok)return reply({error:"Cannot check official image filename",status:exists.status},502,origin);
      if(attempt===99)return reply({error:"Too many duplicate filenames"},409,origin);
    }
    const newUrl="https://raw.githubusercontent.com/"+official+"/main/"+imagePath.split("/").map(encodeURIComponent).join("/");
    for(const snap of snapshots){
      const data=snap.data;
      if(data.icons.some(x=>x.url===newUrl))return reply({error:"Icon already listed in "+snap.file},409,origin);
      data.icons.push({name:label,url:newUrl});
      const fixed=data.icons.slice(0,5);
      const rest=data.icons.slice(5).sort((a,b)=>{
        const an=String(a.name||""),bn=String(b.name||"");
        const ad=/^[0-9]/.test(an),bd=/^[0-9]/.test(bn);
        if(ad!==bd)return ad?1:-1;
        return an.localeCompare(bn,"zh-CN",{numeric:true,sensitivity:"base"});
      });
      data.icons=[...fixed,...rest];
      data.description=String(data.description||"").replace(/更新时间：[^｜]+/,"更新时间："+new Date().toISOString().slice(0,10));
      plans.push({file:snap.file,sha:snap.sha,content:btoa(unescape(encodeURIComponent(JSON.stringify(data,null,2)+"\\n")))});
    }
    const originalImage=await gh(meta.filename.split("/").map(encodeURIComponent).join("/"));
    if(!originalImage.ok)return reply({error:"Review image unavailable"},502,origin);
    const imageData=await originalImage.json();
    const uploaded=await putOfficial(imagePath.split("/").map(encodeURIComponent).join("/"),imageData.content.replace(/\s/g,""));
    if(!uploaded.ok)return reply({error:"Official image upload failed",status:uploaded.status},502,origin);
    for(const plan of plans){
      const saved=await putOfficial(plan.file,plan.content,plan.sha);
      if(!saved.ok)return reply({error:"Image uploaded, but subscription update failed at "+plan.file+"; manual repair needed",status:saved.status},502,origin);
    }
    meta.publishedName=label;
    meta.publishedFilename=imagePath;
    meta.publishedUrl=newUrl;
    meta.publishedAt=new Date().toISOString();
   }
   meta.status=status;meta.reviewedAt=new Date().toISOString();
   const content=btoa(unescape(encodeURIComponent(JSON.stringify(meta,null,2))));
   const saved=await gh(path,{method:"PUT",body:JSON.stringify({message:"review: "+status+" "+meta.name,content,sha:item.sha})});
   if(!saved.ok)return reply({error:"Review update failed",status:saved.status},502,origin);
   return reply({ok:true,status},200,origin);
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
 if(!valid||(ext==="gif"?(w!==h||w<240||w>720):(w!==720||h!==720)))return reply({error:ext==="gif"?"GIF must be square, 240–720 px":"Static icon must be 720 × 720 px"},400,origin);
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
}};
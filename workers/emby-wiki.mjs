import {validateWiki,chinaDate} from '../emby-wiki-schema.mjs';
const PATH='emby-wiki/entries.json',LIMIT=300,MAX_BODY=700000;
const idOK=id=>typeof id==='string'&&/^wiki-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
const encode=s=>{const b=new TextEncoder().encode(s);let a='';for(let i=0;i<b.length;i+=8192)a+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(a)};
const decode=s=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(s.replace(/\s/g,'')),x=>x.charCodeAt(0)));
const json=(body,status,cors)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':cors,'Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function readBody(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('请使用 JSON 提交');
 if(Number(request.headers.get('content-length'))>MAX_BODY)throw Error('投稿内容过大');
 const reader=request.body?.getReader();if(!reader)throw Error('投稿内容为空');
 let length=0,parts=[];
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BODY){await reader.cancel();throw Error('投稿内容过大')}parts.push(value)}
 const bytes=new Uint8Array(length);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length}
 try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw Error('投稿 JSON 无效')}
}
function photo(value,label='图片'){
 if(!value)return '';
 if(typeof value!=='string'||value.length>300000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value))throw Error(label+'须为压缩后的 JPEG 图片，最大 220 KB');
 const b64=value.split(',')[1];let bytes;try{bytes=Uint8Array.from(atob(b64),x=>x.charCodeAt(0))}catch{throw Error(label+'图片格式无效')}
 if(bytes.length>220000||bytes.length<128||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error(label+'图片格式或大小无效');
 return b64;
}
async function uploadWikiImage(gh,id,encoded,folder,label,env){
 const path='emby-wiki/'+folder+'/'+id+'.jpg';
 const old=await gh('contents/'+path);
 let sha;if(old.ok)sha=(await old.json()).sha;else if(old.status!==404)throw Error('无法读取'+label+'状态');
 const upload=await gh('contents/'+path,{method:'PUT',body:JSON.stringify({message:'wiki: submission '+folder,content:encoded,...(sha?{sha}:{})})});
 if(!upload.ok)throw Error(label+'保存失败，请保留表单重试');
 return 'https://raw.githubusercontent.com/'+env.REVIEW_REPO+'/main/'+path;
}
function github(env,fetcher){
 if(!env.GITHUB_TOKEN||!env.REVIEW_REPO)throw Error('投稿服务尚未配置');
 return async(path,opts={})=>fetcher('https://api.github.com/repos/'+env.REVIEW_REPO+'/'+path,{...opts,headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'LiangYou-Emby-Wiki','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000)});
}
async function load(gh){
 const response=await gh('contents/'+PATH);
 if(response.status===404)return {sha:null,data:{schema:1,items:[]}};
 if(!response.ok)throw Error('无法读取档案，请稍后重试');
 let file=await response.json();const sha=file.sha;
 if(file.encoding!=='base64'){const blob=await gh('git/blobs/'+sha);if(!blob.ok)throw Error('无法读取档案内容');file=await blob.json()}
 const data=JSON.parse(decode(file.content));
 if(data.schema!==1||!Array.isArray(data.items)||data.items.length>LIMIT)throw Error('档案数据格式异常，请联系管理员');
 return {sha,data};
}
const publicItem=x=>({id:x.id,...validateWiki(x,{allowLegacyRole:true,allowLegacyRetention:true}),coverUrl:x.coverUrl||'',evidenceImageUrl:x.evidenceImageUrl||'',publishedAt:x.publishedAt,updatedAt:x.updatedAt});
async function hash(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('')}
async function clientTag(request,env){
 const ip=request.headers.get('CF-Connecting-IP');if(!ip||!env.ADMIN_KEY)return '';
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.ADMIN_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(chinaDate()+':'+ip))),x=>x.toString(16).padStart(2,'0')).join('');
}
export async function serveEmbyWiki(request,env,{origin='',allowed='https://maddestalistar.github.io',fetcher=fetch}={}){
 const path=new URL(request.url).pathname,feed=path==='/emby-wiki-feed',admin=path==='/emby-wiki-admin';
 const cors=feed?'*':origin===allowed?origin:'null';
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Admin-Key'}});
 if(!feed&&origin!==allowed)return json({error:'Origin not allowed'},403,cors);
 if(admin){const key=request.headers.get('X-Admin-Key')||'';if(!env.ADMIN_KEY||key.length<24||key!==env.ADMIN_KEY)return json({error:'管理员密钥错误'},401,cors)}
 if((feed&&request.method!=='GET')||(!feed&&!admin&&request.method!=='POST')||(admin&&!['GET','POST'].includes(request.method)))return json({error:'Method not allowed'},405,cors);
 try{
  const gh=github(env,fetcher);
  if(request.method==='GET'){
   const {data}=await load(gh);
   const items=data.items.filter(x=>!feed||x.status==='approved').map(x=>feed?publicItem(x):((({clientTag,digest,...rest})=>rest)(x))).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
   return json({ok:true,items,updatedAt:data.updatedAt||null},200,cors);
  }
  let body,validated,image,evidenceImage;
  try{
   body=await readBody(request);
   if(!idOK(body.id))throw Error('投稿编号无效，请刷新页面');
   if(!admin){if(body.company)throw Error('投稿校验失败');if(body.confirm!==true)throw Error('请确认投稿资料可以公开展示');validated=validateWiki(body.item);image=photo(body.coverData,'封面');evidenceImage=photo(body.evidenceData,'统计凭证')}
   else{
    if(!['update','approved','rejected','withdrawn','pending'].includes(body.action))throw Error('审核操作无效');
    if(!Number.isInteger(body.version)||body.version<1)throw Error('请刷新记录后审核');
    if(body.action==='update')validated=validateWiki(body.item);
    if(typeof body.note!=='string'||body.note.length>500)throw Error('审核备注不能超过 500 字');
   }
  }catch(e){return json({error:e.message},400,cors)}
  const now=new Date().toISOString(),tag=admin?'':await clientTag(request,env);
  const digest=admin?'':await hash(JSON.stringify(validated)+'|'+image+'|'+evidenceImage);
  let coverUrl='',evidenceImageUrl='';
  for(let attempt=0;attempt<3;attempt++){
   const {sha,data}=await load(gh),existing=data.items.find(x=>x.id===body.id);
   if(!admin){
    if(existing){if(existing.digest!==digest)return json({error:'这份投稿已收到。修改内容请开始新的投稿'},409,cors);return json({ok:true,id:existing.id,status:existing.status,recovered:true},200,cors)}
    if(data.items.length>=LIMIT)return json({error:'投稿队列已满，请稍后再试'},409,cors);
    if(tag&&data.items.filter(x=>x.clientTag===tag).length>=10)return json({error:'今天提交较多，请明天再试'},429,cors);
    if(image&&!coverUrl)coverUrl=await uploadWikiImage(gh,body.id,image,'covers','封面',env);
    if(evidenceImage&&!evidenceImageUrl)evidenceImageUrl=await uploadWikiImage(gh,body.id,evidenceImage,'evidence','统计凭证',env);
    data.items.push({id:body.id,...validated,coverUrl,evidenceImageUrl,status:'pending',version:1,submittedAt:now,updatedAt:now,digest,clientTag:tag,reviewNote:''});
   }else{
    if(!existing)return json({error:'档案不存在，请刷新列表'},404,cors);
    if(existing.version!==body.version)return json({error:'这条档案刚刚被修改，请刷新后再操作'},409,cors);
    const target=body.action==='update'?existing.status:body.action;
    const transitions={pending:['approved','rejected'],approved:['withdrawn'],rejected:['pending','approved'],withdrawn:['pending','approved']};
    if(body.action!=='update'&&!transitions[existing.status]?.includes(target))return json({error:'当前状态不能执行该操作，请刷新记录'},409,cors);
    if(target==='approved'&&data.items.some(x=>x.id!==existing.id&&x.status==='approved'&&x.name.toLowerCase()===(validated?.name||existing.name).toLowerCase()))return json({error:'已有同名已发布档案，请编辑现有档案或核实名称'},409,cors);
    if(validated)Object.assign(existing,validated);
    if(body.removeCover===true)existing.coverUrl='';
    if(body.removeEvidence===true)existing.evidenceImageUrl='';
    existing.status=target;existing.reviewNote=body.note.trim();existing.reviewedAt=now;existing.updatedAt=now;existing.version++;
    if(target==='approved'&&!existing.publishedAt)existing.publishedAt=now;
   }
   data.updatedAt=now;
   const saved=await gh('contents/'+PATH,{method:'PUT',body:JSON.stringify({message:'wiki: '+(admin?body.action:'submit')+' '+body.id,content:encode(JSON.stringify(data,null,2)+'\n'),...(sha?{sha}:{})})});
   if(saved.ok)return json({ok:true,id:body.id,status:admin?(body.action==='update'?existing.status:body.action):'pending'},admin?200:201,cors);
   if(![409,422].includes(saved.status))throw Error('保存未能确认，请保留表单并重试');
  }
  return json({error:'其他投稿正在保存，请稍后用原表单重试'},409,cors);
 }catch(e){return json({error:e.message||'投稿服务暂时不可用，请稍后重试'},502,cors)}
}

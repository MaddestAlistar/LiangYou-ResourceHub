import {adminMetadata,sealEmail} from './icon-contact.mjs';
export const isUUID=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const base64=bytes=>{let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out)};
export async function submitBatchItem(fields,email,bytes,env,gh){
 const id='batch-'+fields.submissionKey,filename='pending/'+id+'.'+fields.ext,path='pending/'+id+'.json';
 const imageDigest=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
 const meta={id,name:fields.name,author:fields.author,notes:fields.notes,kind:fields.kind,filename,bytes:bytes.length,width:fields.width,height:fields.height,batchId:fields.batchId,namesConfirmed:true,imageDigest,status:'pending',submittedAt:new Date().toISOString()};
 const contact=await sealEmail(email,id,env);if(contact)meta.contactEmailEncrypted=contact;
 let imageBlob;
 for(let attempt=0;attempt<3;attempt++){
  const ref=await gh('git/ref/heads/main'),head=ref.object.sha;
  let existing;
  try{existing=await gh('contents/'+path+'?ref='+head)}catch(e){if(e.status!==404)throw e}
  if(existing){
   const saved=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(existing.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
   const decoded=await adminMetadata(saved,env);
   const same=['id','name','author','notes','kind','filename','bytes','width','height','batchId','imageDigest'].every(k=>(k==='name'?(saved.originalSubmittedName||saved.name):saved[k])===meta[k])&&decoded.email===email&&!decoded.emailUnavailable;
   if(!same)throw Error('该投稿编号已用于不同内容，请保留原资料重试，或重新选择文件开始新批次');
   return {id,recovered:true};
  }
  const commit=await gh('git/commits/'+head);
  imageBlob??=await gh('git/blobs',{method:'POST',body:{content:base64(bytes),encoding:'base64'}});
  const tree=await gh('git/trees',{method:'POST',body:{base_tree:commit.tree.sha,tree:[{path:filename,mode:'100644',type:'blob',sha:imageBlob.sha},{path,mode:'100644',type:'blob',content:JSON.stringify(meta,null,2)+'\n'}]}});
  const next=await gh('git/commits',{method:'POST',body:{message:'queue: batch item '+id,tree:tree.sha,parents:[head]}});
  try{await gh('git/refs/heads/main',{method:'PATCH',body:{sha:next.sha,force:false}});return {id,recovered:false}}
  catch(e){if(![409,422].includes(e.status)||attempt===2)throw e}
 }
}

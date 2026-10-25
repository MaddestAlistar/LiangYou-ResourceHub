import {test} from 'node:test';
import assert from 'node:assert/strict';
import {submitBatchItem} from '../workers/icon-batch-submission.mjs';
import {encode,PublishError} from '../workers/icon-publisher.mjs';
import worker from '../workers/icon-review-worker.js';
const fields={submissionKey:'38e6c351-bc01-430f-a125-13269314ec99',batchId:'ef33ae23-0224-4316-80ba-b38010cc22bb',name:'Example',author:'Artist',notes:'',kind:'动态',ext:'gif',width:320,height:320};
const env={ADMIN_KEY:'fake-admin-secret-at-least-24-characters'},bytes=new Uint8Array([1,2,3]);
function fixture(fail='',conflict=false){
 let head='initial',count=0,writes=0,throwAfterWrite=fail==='lost-response';const files=new Map([['initial',{}]]),trees=new Map(),parents=new Map();
 const gh=async(path,options={})=>{
  if(path===fail)throw new PublishError('Simulated failure',503);
  const b=options.body;
  if(path==='git/ref/heads/main')return {object:{sha:head}};
  if(path.startsWith('git/commits/'))return {tree:{sha:path.split('/').pop()}};
  if(path.startsWith('contents/')){const [p,q]=path.slice(9).split('?'),ref=new URLSearchParams(q).get('ref');const content=files.get(ref)[p];if(!content)throw new PublishError('Missing',404);return {content:encode(content)}}
  if(path==='git/blobs'){assert.equal(typeof b,'object');return {sha:'image-sha'}}
  if(path==='git/trees'){const tree={...files.get(b.base_tree)};for(const item of b.tree)tree[item.path]=item.content||item.sha;const sha='tree-'+(++count);trees.set(sha,tree);return {sha}}
  if(path==='git/commits'){const sha='commit-'+(++count);files.set(sha,trees.get(b.tree));parents.set(sha,b.parents[0]);return {sha}}
  if(path==='git/refs/heads/main'){
   assert.equal(b.force,false);
   if(conflict){conflict=false;files.set('concurrent',{...files.get(head),'pending/other.json':'other'});head='concurrent';throw new PublishError('Conflict',422)}
   assert.equal(parents.get(b.sha),head);head=b.sha;writes++;
   if(throwAfterWrite){throwAfterWrite=false;throw new PublishError('Lost response',503)}return {};
  }
  throw Error(path);
 };
 return {gh,get files(){return files.get(head)},get writes(){return writes}};
}
test('batch creates one independent image and metadata atomically, encrypts contact and retries without duplication',async()=>{
 const f=fixture();const first=await submitBatchItem(fields,'artist@example.com',bytes,env,f.gh);
 assert.equal(Object.keys(f.files).length,2);assert.equal(f.writes,1);
 const meta=JSON.parse(f.files['pending/'+first.id+'.json']);assert.equal(meta.status,'pending');assert.equal(meta.batchId,fields.batchId);assert(meta.contactEmailEncrypted);assert(!JSON.stringify(f.files).includes('artist@example.com'));
 const retry=await submitBatchItem(fields,'artist@example.com',bytes,env,f.gh);assert.equal(retry.recovered,true);assert.equal(f.writes,1);
 await assert.rejects(submitBatchItem({...fields,name:'Changed'},'artist@example.com',bytes,env,f.gh),/不同内容/);assert.equal(f.writes,1);
});
for(const stage of ['git/blobs','git/trees','git/commits','git/refs/heads/main'])test('batch failure at '+stage+' cannot expose an orphan image or missing metadata',async()=>{
 const f=fixture(stage);await assert.rejects(submitBatchItem(fields,'',bytes,env,f.gh));assert.equal(Object.keys(f.files).length,0);
});
test('batch lost response safely recovers; concurrent edits survive retry',async()=>{
 const lost=fixture('lost-response');await assert.rejects(submitBatchItem(fields,'',bytes,env,lost.gh));assert.equal((await submitBatchItem(fields,'',bytes,env,lost.gh)).recovered,true);assert.equal(lost.writes,1);
 const concurrent=fixture('',true);await submitBatchItem(fields,'',bytes,env,concurrent.gh);assert.equal(concurrent.files['pending/other.json'],'other');
});
test('public Worker route validates a batch file and writes Git API objects, then returns the same ID on retry',async()=>{
 const f=fixture(),old=globalThis.fetch;
 const data=Uint8Array.from([71,73,70,56,57,97,64,1,64,1,0,0,0,59]);
 globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname.split('/test/queue/')[1]+new URL(url).search;
  try{return Response.json(await f.gh(path,{...options,body:options.body?JSON.parse(options.body):undefined}))}catch(e){return Response.json({}, {status:e.status||500})}
 };
 const request=()=>{const form=new FormData();for(const key of ['name','author','notes','kind','submissionKey','batchId'])form.set(key,fields[key]);form.set('file',new File([data],'test.gif',{type:'image/gif'}));return new Request('https://example.test',{method:'POST',headers:{Origin:'https://maddestalistar.github.io'},body:form})};
 try{
  const environment={...env,GITHUB_TOKEN:'dummy',REVIEW_REPO:'test/queue'};
  const first=await worker.fetch(request(),environment);assert.equal(first.status,201);
  const second=await worker.fetch(request(),environment);assert.equal(second.status,200);assert.equal((await first.json()).id,(await second.json()).id);assert.equal(f.writes,1);
 }finally{globalThis.fetch=old}
});

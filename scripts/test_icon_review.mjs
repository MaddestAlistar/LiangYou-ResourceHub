import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/icon-review-worker.js';
import {encode, decode, serialize, CATALOGS, VERSION} from '../workers/icon-publisher.mjs';
const origin='https://maddestalistar.github.io', key='test-only-admin-key-at-least-24';
const env={ADMIN_KEY:key,GITHUB_TOKEN:'fake-review-token',PUBLISH_GITHUB_TOKEN:'fake-publish-token',REVIEW_REPO:'test/queue'};
const request=(body,authenticated=true)=>new Request('https://example.test/admin',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(authenticated?{'X-Admin-Key':key}:{})},body:JSON.stringify(body)});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('unauthenticated requests cannot reach GitHub',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=()=>{throw Error('must not reach Github')};
 try{assert.equal((await worker.fetch(request({path:'pending/test.json',status:'approved'},false),env)).status,401)}finally{globalThis.fetch=previous}
});
test('health reveals version only',async()=>{
 const res=await worker.fetch(new Request('https://example.test/health',{headers:{Origin:origin}}),env);
 assert.deepEqual(await res.json(),{ok:true,version:VERSION});
});
for(const saveFails of [false,true])test('legacy approval verifies both subscriptions; queue save '+(saveFails?'failure is recoverable':'is valid JSON'),async()=>{
 const url='https://raw.githubusercontent.com/MaddestAlistar/LiangYou-IconLibrary/main/icons/liangyou/old.gif';
 const meta={id:'20261025090251677-a9cc2501',name:'云海 PRON',filename:'pending/test.gif',kind:'动态',status:'approved',publishedUrl:url};
 const catalog={icons:[...Array.from({length:5},(_,i)=>({name:'p'+i,url:'https://example.com/'+i})),{name:'云海 PRON 动态 01',url}]};
 const previous=globalThis.fetch;let officialWrites=0,queueWrites=0;
 globalThis.fetch=async(raw,options={})=>{
  const path=new URL(raw).pathname;
  if(path.includes('/test/queue/contents/pending/test.json')){
   if(options.method==='PUT'){queueWrites++;const m=JSON.parse(decode(JSON.parse(options.body).content));assert.equal(m.status,'approved');assert(m.publicationVerifiedAt);return json({},saveFails?409:200)}
   return json({sha:'meta-sha',content:encode(serialize(meta))});
  }
  if(options.method&&options.method!=='GET'){officialWrites++;throw Error('duplicate publication')}
  if(path.endsWith('/git/ref/heads/main'))return json({object:{sha:'head'}});
  if(path.endsWith('/git/commits/head'))return json({tree:{sha:'tree'}});
  if(CATALOGS.some(p=>path.endsWith('/contents/'+p)))return json({encoding:'base64',content:encode(serialize(catalog))});
  if(path.includes('/published-submissions/'))return json({},404);
  if(path.endsWith('/icons/liangyou/old.gif'))return json({sha:'image'});
  throw Error('unexpected '+path);
 };
 try{
  const res=await worker.fetch(request({path:'pending/test.json',status:'approved'}),env);const out=await res.json();
  assert.equal(res.status,saveFails?502:200);assert.equal(officialWrites,0);assert.equal(queueWrites,1);
  if(saveFails)assert.match(out.error,/正式库已发布.*审核状态未保存/);else assert.equal(out.publicationVerified,true);
 }finally{globalThis.fetch=previous}
});
test('published icons cannot be falsely marked rejected without unpublishing',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>json({sha:'x',content:encode(serialize({status:'approved',publishedUrl:'https://example.com/icon'}))});
 try{assert.equal((await worker.fetch(request({path:'pending/test.json',status:'rejected'}),env)).status,409)}finally{globalThis.fetch=previous}
});

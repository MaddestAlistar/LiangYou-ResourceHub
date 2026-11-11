import test from 'node:test';
import assert from 'node:assert/strict';
import {serveLyxReviews} from '../workers/lyx-reviews.mjs';

const origin='https://maddestalistar.github.io';
const base='https://liangyou-icon-review.maddestalistar.workers.dev';
const env={ADMIN_KEY:'a'.repeat(40),GITHUB_TOKEN:'secret',REVIEW_REPO:'MaddestAlistar/Icon-Review-Queue'};
function githubMock(){
 let contents=null,revision=1;
 return async (url,opts={})=>{
  assert.match(url,/\/contents\/lyx\/reviews\.json$/);
  const method=opts.method||'GET';
  if(method==='GET')return contents===null?new Response('{}',{status:404}):
   Response.json({sha:String(revision),content:contents},{status:200});
  assert.equal(method,'PUT');
  const b=JSON.parse(opts.body);
  if(contents!==null&&b.sha!==String(revision))return Response.json({message:'Conflict'},{status:409});
  if(contents===null&&b.sha)return Response.json({message:'Conflict'},{status:409});
  revision++;contents=b.content;
  return Response.json({content:{sha:String(revision)}},{status:201});
 };
}
function request(path,method='GET',body=null,key=null){
 return new Request(base+path,{method,headers:{'Origin':origin,...(key?{'X-Admin-Key':key}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
const invoke=(r,fetcher,opts={})=>serveLyxReviews(r,env,{origin:opts.origin??origin,allowed:origin,fetcher});

test('public feed exposes seeded published review without credentials',async()=>{
 const res=await invoke(request('/lyx-feed'),githubMock());
 assert.equal(res.status,200);
 const d=await res.json();
 assert.equal(d.reviews.length,1);
 assert.equal(d.reviews[0].name,'上岛记');
 assert.equal(d.reviews[0].scores.reduce((n,x,i)=>n+x*[.30,.20,.20,.10,.10,.10][i],0),90);
});

test('admin endpoint requires the existing ADMIN_KEY',async()=>{
 const gh=githubMock();
 assert.equal((await invoke(request('/lyx-admin'),gh)).status,401);
 assert.equal((await invoke(request('/lyx-admin','GET',null,'bad'),gh)).status,401);
 assert.equal((await invoke(request('/lyx-admin','GET',null,env.ADMIN_KEY),gh,{origin:'https://attacker.example'})).status,403);
 const r=await invoke(request('/lyx-admin','GET',null,env.ADMIN_KEY),gh);
 assert.equal(r.status,200);
 assert.equal((await r.json()).reviews.length,1);
});

test('draft can be created, published, edited and withdrawn; stale edits reject',async()=>{
 const gh=githubMock(),key=env.ADMIN_KEY;
 const baseItem={id:'test-app',name:'示例 App',category:'工具',subtitle:'',version:'1.0',platform:'iOS',
  icon:'assets/lyx/shangdaoji.svg',summary:'示例应用介绍',tagline:'测试',tags:['离线'],scores:[90,90,90,90,90,90],
  review:'用于测试的真实段落',status:'draft',order:2};
 async function post(action,item,expectedUpdatedAt){
  const res=await invoke(request('/lyx-admin','POST',{action,item,...(expectedUpdatedAt?{expectedUpdatedAt}:{})},key),gh);
  return {status:res.status,body:await res.json()};
 }
 let a=await post('create',baseItem);
 assert.equal(a.status,200);
 assert.equal(a.body.reviews.length,2);
 let view=await invoke(request('/lyx-feed'),gh);
 assert.equal((await view.json()).reviews.length,1); // no drafts leaked
 let previous=a.body.item.updatedAt;
 a=await post('update',{...baseItem,status:'published'},previous);
 assert.equal(a.status,200);
 const updated=a.body.item;
 view=await invoke(request('/lyx-feed'),gh);
 assert.equal((await view.json()).reviews.length,2);
 let stale=await post('update',{...baseItem,status:'draft'},previous);
 assert.equal(stale.status,409);
 a=await post('update',{...baseItem,status:'draft'},updated.updatedAt);
 assert.equal(a.status,200);
 view=await invoke(request('/lyx-feed'),gh);
 assert.equal((await view.json()).reviews.length,1);
});

test('scores out of range are rejected',async()=>{
 const gh=githubMock();
 const item={id:'bad-app',name:'Bad',category:'Utility',subtitle:'',version:'',platform:'',tagline:'',
 summary:'Summary',review:'A review',icon:'assets/lyx/shangdaoji.svg',tags:[],scores:[101,90,90,90,90,90],
 status:'published',order:2};
 const res=await invoke(request('/lyx-admin','POST',{action:'create',item},env.ADMIN_KEY),gh);
 assert.equal(res.status,400);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renameIcon,publishIcon, withdrawIcon, serialize, chooseName, encode, decode, CATALOGS, OFFICIAL, PublishError} from '../workers/icon-publisher.mjs';
const meta={id:'20261025190000000-abc12345',name:'云海 PRON',kind:'动态',filename:'pending/icon-test.gif',status:'pending'};
const pinned=Array.from({length:5},(_,i)=>({name:'Pinned '+i,url:'https://example.com/'+i}));
const base=()=>({description:'更新时间：2026-10-24｜良友',icons:[...pinned,{name:'alpha 动态 01',url:'https://example.com/a'},{name:'99 Numeric',url:'https://example.com/n'}]});
function fixture({failAt, conflict=false, malformed=false, large=false}={}){
 let head='head0',serial=0,refWrites=0;const calls=[],trees=new Map(),commits=new Map();
 const init=Object.fromEntries(CATALOGS.map(p=>[p,serialize(base())]));
 if(malformed)init[CATALOGS[0]]+='\\n';
 commits.set(head,{tree:{sha:'tree0'},files:init});
 const gh=async(path,options={})=>{
  calls.push({path,options});
  if(path===failAt)throw new PublishError('simulated error',503);
  if(path==='git/ref/heads/main')return {object:{sha:head}};
  if(path.startsWith('git/commits/') )return commits.get(path.slice(12));
  if(path.startsWith('contents/')){
   const [part,query]=path.slice(9).split('?');const ref=new URLSearchParams(query).get('ref');const file=commits.get(ref).files[decodeURIComponent(part)];
   if(file===undefined){if(options.missing)return null;throw new Error('missing '+path)}
   if(typeof file==='object')return {sha:file.sha};
   if(large&&CATALOGS.includes(part))return {sha:ref+'~'+part,encoding:'none'};
   return {encoding:'base64',content:encode(file)};
  }
  if(path.startsWith('git/blobs/')){const [ref,file]=path.slice(10).split('~');return {encoding:'base64',content:encode(commits.get(ref).files[file])};}
  if(path==='git/blobs')return {sha:'imageSha'};
  if(path==='git/trees'){
   const files=structuredClone([...commits.values()].find(c=>c.tree.sha===options.body.base_tree).files);
   for(const entry of options.body.tree)files[entry.path]=entry.content??{sha:entry.sha};
   const sha='tree'+(++serial);trees.set(sha,files);return {sha};
  }
  if(path==='git/commits'){
   const sha='commit'+(++serial);commits.set(sha,{tree:{sha:options.body.tree},files:trees.get(options.body.tree),parent:options.body.parents[0]});return {sha};
  }
  if(path==='git/refs/heads/main'){
   assert.equal(options.body.force,false);
   if(conflict){conflict=false;const other=structuredClone(commits.get(head));
    for(const p of CATALOGS){const c=JSON.parse(other.files[p]);c.icons.push({name:'Concurrent edit',url:'https://example.com/other'});other.files[p]=serialize(c)}
    other.tree.sha='tree-concurrent';head='concurrent';commits.set(head,other);throw new PublishError('conflict',422);
   }
   assert.equal(commits.get(options.body.sha).parent,head,'must not overwrite another commit');head=options.body.sha;refWrites++;return {object:{sha:head}};
  }
  throw new Error('unexpected '+path);
 };
 return {gh,calls,setConflict(){conflict=true},get head(){return head},get writes(){return refWrites},files:()=>commits.get(head).files};
}
const image=async()=>({encoding:'base64',content:btoa('image')});
test('exact output is JSON; UTF-8 survives and literal backslash-n fails',()=>{
 const s=serialize(base());assert.equal(s.at(-1),'\n');assert.deepEqual(JSON.parse(s),base());assert.equal(decode(encode('云海 🎨')), '云海 🎨');assert.throws(()=>JSON.parse(s+'\\n'));
});
test('atomic image + two indexes + receipt; fixed five preserved, digits last',async()=>{
 const f=fixture();const r=await publishIcon(meta,f.gh,image);assert.equal(f.writes,1);
 const write=f.calls.find(c=>c.path==='git/trees').options.body.tree;assert.equal(write.length,4);
 for(const file of CATALOGS){const c=JSON.parse(f.files()[file]);assert.deepEqual(c.icons.slice(0,5),pinned);assert.equal(c.icons.at(-1).name,'99 Numeric');assert.equal(c.icons.filter(x=>x.url===r.publishedUrl).length,1)}
 assert.match(r.publishedName,/云海 PRON动态 01/);assert(f.files()[r.publishedFilename]);
});
test('retry after lost response or queue failure reuses the committed receipt',async()=>{
 const f=fixture();const one=await publishIcon(meta,f.gh,image);const two=await publishIcon(meta,f.gh,()=>{throw Error('must not upload twice')});
 assert.equal(one.publishedUrl,two.publishedUrl);assert.equal(two.recovered,true);assert.equal(f.writes,1);
});
test('concurrent branch edit is retained after non-force retry',async()=>{
 const f=fixture({conflict:true});await publishIcon(meta,f.gh,image);assert.equal(f.writes,1);
 for(const p of CATALOGS)assert(JSON.parse(f.files()[p]).icons.some(x=>x.name==='Concurrent edit'));
});
test('bad JSON stops before any write',async()=>{
 const f=fixture({malformed:true});await assert.rejects(publishIcon(meta,f.gh,image),/有效 JSON/);assert.equal(f.head,'head0');assert(!f.calls.some(c=>c.options.method));
});
for(const path of ['git/blobs','git/trees','git/commits','git/refs/heads/main'])test('failure at '+path+' cannot expose a partial catalog',async()=>{
 const f=fixture({failAt:path});await assert.rejects(publishIcon(meta,f.gh,image));assert.equal(f.head,'head0');for(const p of CATALOGS)assert.equal(JSON.parse(f.files()[p]).icons.length,7);
});
test('Contents API encoding none falls back to Git blobs for large catalogs',async()=>{
 const f=fixture({large:true});await publishIcon(meta,f.gh,image);assert.equal(f.writes,1);
});
test('legacy approved icon is verified without creating another copy',async()=>{
 const f=fixture();const r=await publishIcon(meta,f.gh,image);
 const receipt='maintenance/published-submissions/'+meta.id+'.json';delete f.files()[receipt];
 const result=await publishIcon({...meta,status:'approved',publishedUrl:r.publishedUrl},f.gh,image);assert.equal(result.recovered,true);assert.equal(f.writes,1);
});
test('missing image in existing publication is not silently treated as success',async()=>{
 const f=fixture();const r=await publishIcon(meta,f.gh,image);delete f.files()[r.publishedFilename];
 await assert.rejects(publishIcon(meta,f.gh,image),/不完整/);assert.equal(f.writes,1);
});
test('real regexes handle Chinese prefixes and English dynamic suffixes',()=>{
 const c=base();c.icons.push({name:'yunhai｜云海动态 01',url:'https://example.com/y'});
 assert.equal(chooseName({...meta,name:'云海 动态 01'},[c,c]),'yunhai｜云海动态 02');
 assert.equal(chooseName({...meta,name:'Alpha Dynamic 01'},[c,c]),'Alpha 动态 02');
});

test('withdraw removes exact URL from both catalogs atomically, retaining image and same-name alternatives',async()=>{
 const f=fixture();const r=await publishIcon(meta,f.gh,image);
 for(const p of CATALOGS){const c=JSON.parse(f.files()[p]);c.icons.push({name:r.publishedName,url:'https://example.com/other-version'});f.files()[p]=serialize(c)}
 const result=await withdrawIcon({...meta,status:'approved',...r},f.gh);
 assert.equal(result.status,'withdrawn');assert.equal(f.writes,2);assert(f.files()[r.publishedFilename]);
 for(const p of CATALOGS){const c=JSON.parse(f.files()[p]);assert.deepEqual(c.icons.slice(0,5),pinned);assert(!c.icons.some(x=>x.url===r.publishedUrl));assert(c.icons.some(x=>x.url==='https://example.com/other-version'))}
 const writes=f.calls.filter(x=>x.path==='git/trees');assert.equal(writes.at(-1).options.body.tree.length,3);
});
test('withdraw retry after lost response is idempotent; stale approval cannot re-publish',async()=>{
 const f=fixture();const r=await publishIcon(meta,f.gh,image);const stale={...meta,...r,status:'approved'};
 const one=await withdrawIcon(stale,f.gh);const two=await withdrawIcon(stale,f.gh);
 assert.equal(two.recovered,true);assert.equal(one.withdrawnAt,two.withdrawnAt);assert.equal(f.writes,2);
 await assert.rejects(publishIcon(stale,f.gh,image),/已下架/);assert.equal(f.writes,2);
});
test('legacy approved record without receipt supports withdrawal',async()=>{
 const f=fixture();const r=await publishIcon(meta,f.gh,image);delete f.files()['maintenance/published-submissions/'+meta.id+'.json'];
 const result=await withdrawIcon({...meta,status:'approved',publishedUrl:r.publishedUrl},f.gh);
 assert.equal(result.status,'withdrawn');assert(f.files()[r.publishedFilename]);
});
test('withdraw preserves concurrent edits',async()=>{
 const f=fixture();const r=await publishIcon(meta,f.gh,image);f.setConflict();await withdrawIcon({...meta,...r,status:'approved'},f.gh);
 for(const p of CATALOGS){const c=JSON.parse(f.files()[p]);assert(c.icons.some(x=>x.name==='Concurrent edit'));assert(!c.icons.some(x=>x.url===r.publishedUrl))}
});
for(const path of ['git/trees','git/commits','git/refs/heads/main'])test('withdraw failure at '+path+' leaves both subscriptions unchanged',async()=>{
 const f=fixture();const r=await publishIcon(meta,f.gh,image);const before=f.head;
 const failing=(p,o)=>p===path?Promise.reject(new PublishError('failed',503)):f.gh(p,o);
 await assert.rejects(withdrawIcon({...meta,...r,status:'approved'},failing));assert.equal(f.head,before);
 for(const p of CATALOGS)assert(JSON.parse(f.files()[p]).icons.some(x=>x.url===r.publishedUrl));
});
test('unpublished item cannot be withdrawn',async()=>{
 const f=fixture();await assert.rejects(withdrawIcon(meta,f.gh),/没有可核对/);assert.equal(f.writes,0);
});
test('pinned five are protected from withdrawal',async()=>{
 const f=fixture();const url='https://raw.githubusercontent.com/'+OFFICIAL+'/main/icons/liangyou/pinned.png';
 for(const p of CATALOGS){const c=JSON.parse(f.files()[p]);c.icons[0].url=url;f.files()[p]=serialize(c)}
 await assert.rejects(withdrawIcon({...meta,status:'approved',publishedUrl:url},f.gh),/置顶/);assert.equal(f.writes,0);
});
test('withdraw repairs a partially removed target without affecting other entries',async()=>{
 const f=fixture();const r=await publishIcon(meta,f.gh,image);
 const c=JSON.parse(f.files()[CATALOGS[1]]);c.icons=c.icons.filter(x=>x.url!==r.publishedUrl);f.files()[CATALOGS[1]]=serialize(c);
 await withdrawIcon({...meta,...r,status:'approved'},f.gh);
 for(const p of CATALOGS)assert(!JSON.parse(f.files()[p]).icons.some(x=>x.url===r.publishedUrl));
});
test('Worker withdrawal metadata failure is safe to retry and yields withdrawn status',async()=>{
 const {default:worker}=await import('../workers/icon-review-worker.js');
 const f=fixture();const r=await publishIcon(meta,f.gh,image);const stale={...meta,...r,status:'approved'};
 const previous=globalThis.fetch;let failSave=true;
 globalThis.fetch=async(raw,options={})=>{
  const url=new URL(raw),path=url.pathname;
  if(path.startsWith('/repos/test/queue/contents/')){
   if(options.method==='PUT'){
    const saved=JSON.parse(decode(JSON.parse(options.body).content));assert.equal(saved.status,'withdrawn');assert(saved.withdrawalVerifiedAt);
    return Response.json({}, {status:failSave?409:200});
   }
   return Response.json({sha:'meta',content:encode(serialize(stale))});
  }
  const p=path.slice(('/repos/'+OFFICIAL+'/').length)+url.search;
  const result=await f.gh(p,{method:options.method,body:options.body?JSON.parse(options.body):undefined,missing:true});
  return result===null?Response.json({}, {status:404}):Response.json(result);
 };
 const key='test-only-key-at-least-24-characters';
 const env={ADMIN_KEY:key,GITHUB_TOKEN:'fake',PUBLISH_GITHUB_TOKEN:'fake',REVIEW_REPO:'test/queue'};
 const request=()=>new Request('https://example.test/admin',{method:'POST',headers:{Origin:'https://maddestalistar.github.io','X-Admin-Key':key,'Content-Type':'application/json'},body:JSON.stringify({path:'pending/icon-test.json',status:'withdrawn'})});
 try{
  const failed=await worker.fetch(request(),env);assert.equal(failed.status,502);assert.match((await failed.json()).error,/正式库已下架.*审核状态未保存/);
  failSave=false;const done=await worker.fetch(request(),env);assert.equal(done.status,200);const out=await done.json();assert.equal(out.withdrawalVerified,true);assert.equal(out.item.status,'withdrawn');assert.equal(f.writes,2);
 }finally{globalThis.fetch=previous}
});

test('published rename changes both catalogs atomically, retains image URL and is retry-safe',async()=>{
 const f=fixture();const result=await publishIcon(meta,f.gh,async()=>({encoding:'base64',content:'aW1hZ2U='}));const m={...meta,...result,status:'approved'};
 const renamed=await renameIcon(m,'New display name',f.gh);assert.equal(renamed.publishedUrl,result.publishedUrl);
 for(const p of CATALOGS)assert.equal(JSON.parse(f.files()[p]).icons.find(x=>x.url===result.publishedUrl).name,'New display name');
 const writes=f.writes;await renameIcon(m,'New display name',f.gh);assert.equal(f.writes,writes);
 await assert.rejects(renameIcon(m,'alpha 动态 01',f.gh),/同名/);
});
test('rename respects concurrent writes and never restores a withdrawn icon',async()=>{
 const f=fixture();const result=await publishIcon(meta,f.gh,async()=>({encoding:'base64',content:'aW1hZ2U='}));const m={...meta,...result,status:'approved'};
 f.setConflict();await renameIcon(m,'Changed',f.gh);assert(JSON.parse(f.files()[CATALOGS[1]]).icons.some(x=>x.name==='Concurrent edit'));
 await withdrawIcon(m,f.gh);const writes=f.writes;assert.equal(await renameIcon(m,'Do not restore',f.gh),null);assert.equal(f.writes,writes);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {serveEmbyWiki} from '../workers/emby-wiki.mjs';
import {validateWiki,chinaDate} from '../emby-wiki-schema.mjs';
const origin='https://maddestalistar.github.io';
const env={ADMIN_KEY:'test-only-long-admin-key-123456',GITHUB_TOKEN:'test-token',REVIEW_REPO:'MaddestAlistar/Icon-Review-Queue'};
const item=()=>({name:'测试档案',nature:'公益服',state:'正常运营',contents:['电影','电视剧'],qualities:['4K'],movies:12500,series:3200,episodes:'',others:'',statsDate:chinaDate(),submissionDate:chinaDate(),nickname:'测试用户',registration:'活动开号',website:'https://example.com',channel:'@example',confirm:true});
function database(){let state=null,sha=0,conflicts=0,fail=false,reads=0,writes=0;const assets=new Map();return {get state(){return state},set conflict(n){conflicts=n},set fail(v){fail=v},get writes(){return writes},get reads(){return reads},fetcher:async(url,options={})=>{
 const path=new URL(url).pathname.split('/contents/')[1];
 if(options.method==='PUT'){
  writes++;if(fail)return Response.json({},{status:503});
  const body=JSON.parse(options.body);
  if((/\/(covers|evidence)\//.test(path))){assets.set(path,body.content);return Response.json({})}
  if(conflicts){conflicts--;return Response.json({},{status:409})}
  if((sha?String(sha):undefined)!==body.sha)return Response.json({},{status:409});
  state=JSON.parse(Buffer.from(body.content,'base64').toString());sha++;return Response.json({});
 }
 reads++;if((/\/(covers|evidence)\//.test(path||'')))return assets.has(path)?Response.json({sha:'cover'}):Response.json({},{status:404});
 return state?Response.json({sha:String(sha),encoding:'base64',content:Buffer.from(JSON.stringify(state)).toString('base64')}):Response.json({},{status:404});
 }};}
function context(db){return {origin,allowed:origin,fetcher:db.fetcher}}
function req(path,body,{admin=false,ip=''}={}){return new Request('https://worker.test'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(admin?{'X-Admin-Key':env.ADMIN_KEY}:{}),...(ip?{'CF-Connecting-IP':ip}:{})},...(body?{body:JSON.stringify(body)}:{})})}
const submit=(db,body={})=>serveEmbyWiki(req('/emby-wiki-submit',{id:'wiki-'+crypto.randomUUID(),item:item(),confirm:true,...body}),env,context(db));
const review=(db,id,action,version=1,extra={})=>serveEmbyWiki(req('/emby-wiki-admin',{id,action,version,note:'后台备注',...extra},{admin:true}),env,context(db));
const feed=async db=>(await (await serveEmbyWiki(req('/emby-wiki-feed'),env,context(db))).json()).items;
test('required counts, units, dates, public entry and unknown fields',()=>{
 const good=validateWiki({...item(),status:'approved',reviewNote:'injected'});assert.equal(good.movies,12500);assert.equal(good.episodes,null);assert.equal(good.channel,'https://t.me/example');assert.equal(good.status,undefined);
 for(const patch of [{movies:''},{series:-1},{movies:1.5},{statsDate:'2026-02-30'},{submissionDate:'2100-01-01'},{nickname:' '},{contents:[]},{nature:'任意'},{website:'javascript:alert(1)'},{channel:'https://evil.example/'},{movies:0,series:0},{website:'',channel:''},{movies:true}])assert.throws(()=>validateWiki({...item(),...patch}));
 assert.equal(validateWiki({...item(),movies:0,series:0,others:100}).others,100);
});
test('pending -> approve -> update -> withdraw -> restore -> reject; auth and public projection',async()=>{
 const db=database(),created=await submit(db);assert.equal(created.status,201);const {id}=await created.json();assert.deepEqual(await feed(db),[]);
 const unauthorized=await serveEmbyWiki(req('/emby-wiki-admin',{id,action:'approved',version:1,note:''}),env,context(db));assert.equal(unauthorized.status,401);assert.deepEqual(await feed(db),[]);
 assert.equal((await review(db,id,'approved')).status,200);let entries=await feed(db);assert.equal(entries.length,1);for(const key of ['clientTag','digest','reviewNote','version'])assert.equal(entries[0][key],undefined);
 assert.equal((await review(db,id,'update',2,{item:{...item(),name:'改名',movies:14000}})).status,200);assert.equal((await feed(db))[0].movies,14000);
 assert.equal((await review(db,id,'withdrawn',3)).status,200);assert.deepEqual(await feed(db),[]);
 assert.equal((await review(db,id,'pending',4)).status,200);assert.equal((await review(db,id,'rejected',5)).status,200);assert.deepEqual(await feed(db),[]);
 assert.equal((await review(db,id,'approved',6)).status,200);assert.equal((await feed(db)).length,1);
});
test('idempotent retries, conflict retry and stale moderator protection',async()=>{
 const db=database(),id='wiki-'+crypto.randomUUID();db.conflict=1;assert.equal((await submit(db,{id})).status,201);assert.equal(db.state.items.length,1);assert.equal((await submit(db,{id})).status,200);assert.equal(db.state.items.length,1);
 assert.equal((await submit(db,{id,item:{...item(),name:'修改后'}})).status,409);
 assert.equal((await review(db,id,'approved')).status,200);assert.equal((await review(db,id,'withdrawn',1)).status,409);assert.equal((await feed(db)).length,1);
});
test('same-name publications blocked; updates preserve original submission time',async()=>{
 const db=database(),a=(await (await submit(db)).json()).id,b=(await (await submit(db)).json()).id;
 assert.equal((await review(db,a,'approved')).status,200);assert.equal((await review(db,b,'approved')).status,409);
 const time=db.state.items[0].submittedAt;assert.equal((await review(db,a,'update',2,{item:{...item(),nickname:'编辑后'}})).status,200);assert.equal(db.state.items[0].submittedAt,time);
});
test('errors do not acknowledge successful submission, invalid origin and payload are rejected',async()=>{
 const db=database();db.fail=true;assert.equal((await submit(db)).status,502);assert.equal(db.state,null);
 const denied=await serveEmbyWiki(req('/emby-wiki-submit',{id:'wiki-'+crypto.randomUUID()}),env,{...context(db),origin:'https://evil.example'});assert.equal(denied.status,403);
 assert.equal((await submit(db,{confirm:false})).status,400);assert.equal((await submit(db,{company:'spam'})).status,400);assert.equal((await submit(db,{coverData:'data:image/svg+xml;base64,xxx'})).status,400);assert.equal((await submit(db,{item:{...item(),summary:'x'.repeat(400001)}})).status,400);
});
test('daily submit throttling uses an HMAC tag, admin listing omits it',async()=>{
 const db=database();for(let i=0;i<10;i++){const r=await serveEmbyWiki(req('/emby-wiki-submit',{id:'wiki-'+crypto.randomUUID(),item:item(),confirm:true},{ip:'203.0.113.7'}),env,context(db));assert.equal(r.status,201)}
 const limited=await serveEmbyWiki(req('/emby-wiki-submit',{id:'wiki-'+crypto.randomUUID(),item:item(),confirm:true},{ip:'203.0.113.7'}),env,context(db));assert.equal(limited.status,429);assert.equal(JSON.stringify(db.state).includes('203.0.113.7'),false);
 const admin=await (await serveEmbyWiki(req('/emby-wiki-admin',null,{admin:true}),env,context(db))).json();assert.equal(admin.items[0].clientTag,undefined);
});
test('integration entry points are correctly ordered and escaped user content uses textContent',()=>{
 const home=readFileSync('index.html','utf8'),admin=readFileSync('icon-review-admin.html','utf8');assert.ok(home.indexOf('aria-label="图标自助投稿入口"')<home.indexOf('aria-label="Emby Wiki 自助投稿入口"'));assert.ok(admin.indexOf('id="tech-news-admin"')<admin.indexOf('id="emby-wiki-admin"'));
 for(const file of ['index.html','icon-review-admin.html','emby-wiki-submit.html']){const content=readFileSync(file,'utf8'),ids=[...content.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size,file+' unique IDs')}
 assert.ok(readFileSync('emby-wiki-ui.mjs','utf8').includes('n.textContent=text'));
});

test('version counts, legacy role normalization and evidence screenshot upload',async()=>{
 const good=validateWiki({...item(),moviesWithVersions:30000,seriesWithVersions:5500,episodes:123456,episodesWithVersions:180000,role:'腐竹本人'});
 assert.equal(good.moviesWithVersions,30000);assert.equal(good.episodesWithVersions,180000);
 assert.equal(validateWiki({...item(),role:'站长'}).role,'腐竹本人');
 for(const patch of [{moviesWithVersions:-1},{episodesWithVersions:'bad'},{moviesWithVersions:1.5}])assert.throws(()=>validateWiki({...item(),...patch}));
 const bytes=Buffer.alloc(200,0);bytes[0]=0xff;bytes[1]=0xd8;bytes[198]=0xff;bytes[199]=0xd9;
 const encoded='data:image/jpeg;base64,'+bytes.toString('base64');
 const db=database(),res=await submit(db,{item:{...item(),moviesWithVersions:30000},evidenceData:encoded});
 assert.equal(res.status,201);
 const id=(await res.json()).id;
 assert.ok(db.state.items[0].evidenceImageUrl.includes('emby-wiki/evidence/wiki-'));
 assert.equal((await review(db,id,'approved')).status,200);
 assert.equal((await feed(db))[0].moviesWithVersions,30000);
 assert.ok((await feed(db))[0].evidenceImageUrl);
 assert.equal((await review(db,id,'update',2,{item:{...item(),moviesWithVersions:30000},removeEvidence:true})).status,200);
 assert.equal((await feed(db))[0].evidenceImageUrl,'');
 assert.equal((await submit(database(),{evidenceData:'data:image/svg+xml;base64,xxx'})).status,400);
});

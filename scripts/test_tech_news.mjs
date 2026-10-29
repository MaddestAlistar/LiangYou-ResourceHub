import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serveTechNews,NEWS_CATEGORIES} from '../workers/tech-news.mjs';
const origin='https://maddestalistar.github.io';
const env={ADMIN_KEY:'sample-admin-passphrase-not-real',GITHUB_TOKEN:'sample',REVIEW_REPO:'demo/review'};
function db(){
 let content={schema:1,updatedAt:null,items:[]},sha='v1';
 const fetcher=async(_url,opts)=>{
  if(opts.method==='PUT'){
   const body=JSON.parse(opts.body);
   if(body.sha!==sha)return Response.json({message:'conflict'},{status:409});
   content=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
   sha='v2';return Response.json({ok:true});
  }
  return Response.json({sha,content:Buffer.from(JSON.stringify(content)).toString('base64')});
 };
 return {fetcher,read:()=>content};
}
const call=(path,method='GET',body,authenticated=true)=>new Request('https://demo.local'+path,{method,
 headers:{Origin:origin,...(authenticated?{'X-Admin-Key':env.ADMIN_KEY}:{}),...(body?{'Content-Type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{})});
test('Eight categories, authentication and publishing flow',async()=>{
 assert.equal(NEWS_CATEGORIES.length,8);
 assert.ok(NEWS_CATEGORIES.includes('视频精选'));
 const store=db(),extra={origin,allowed:origin,fetcher:store.fetcher};
 const denied=await serveTechNews(call('/news-admin','GET',null,false),env,extra);
 assert.equal(denied.status,401);
 const bad=await serveTechNews(call('/news-admin','POST',{action:'create',category:'other',title:'A',content:'B'}),env,extra);
 assert.equal(bad.status,400);
 const created=await serveTechNews(call('/news-admin','POST',{action:'create',category:'图标动态',title:'  新图标上线  ',content:'这里是中文内容'}),env,extra);
 assert.equal(created.status,200);
 const one=(await created.json()).items[0];
 assert.equal(one.title,'新图标上线');
 const feed=await serveTechNews(call('/news-feed','GET',null,false),env,extra);
 assert.equal((await feed.json()).items[0].id,one.id);
 const updated=await serveTechNews(call('/news-admin','POST',{action:'update',id:one.id,category:'热点播报',title:'更新标题',content:'更新正文'}),env,extra);
 assert.equal(updated.status,200);
 assert.equal(store.read().items[0].title,'更新标题');
 const removed=await serveTechNews(call('/news-admin','POST',{action:'delete',id:one.id,confirm:true}),env,extra);
 assert.equal(removed.status,200);
 assert.equal(store.read().items.length,0);
});

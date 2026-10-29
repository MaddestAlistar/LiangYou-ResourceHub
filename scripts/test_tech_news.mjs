import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serveTechNews,NEWS_CATEGORIES,sourceOf,VIDEO_MAX_BYTES,VIDEO_TITLE_MAX,VIDEO_DESC_MAX} from '../workers/tech-news.mjs';
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

test('Video items require uploaded MP4 and a supported original source',async()=>{
 assert.equal(VIDEO_MAX_BYTES,20*1000*1000);
 assert.equal(VIDEO_TITLE_MAX,20);
 assert.equal(VIDEO_DESC_MAX,38);
 assert.equal(sourceOf('https://xhslink.cn/o/abc'),'xhs');
 assert.equal(sourceOf('https://t.me/example/7309'),'tg');
 assert.equal(sourceOf('https://www.xiaohongshu.com/explore/123'),'xhs');
 assert.equal(sourceOf('https://t.me.evil.com/example'),null);
 assert.equal(sourceOf('javascript:alert(1)'),null);
 const store=db(),extra={origin,allowed:origin,fetcher:store.fetcher};
 const bad=await serveTechNews(call('/news-admin','POST',{action:'create',category:'视频精选',title:'测试',content:'说明'}),env,extra);
 assert.equal(bad.status,400);
 const badSite=await serveTechNews(call('/news-admin','POST',{action:'create',category:'视频精选',title:'测试',content:'说明',sourceUrl:'https://example.com/1',videoUrl:'https://example.com/a.mp4'}),env,extra);
 assert.equal(badSite.status,400);
 const videoUrl='https://raw.githubusercontent.com/MaddestAlistar/videos/main/clips/12345678-abcd-4567-aaaa-123456789abc.mp4';
 const created=await serveTechNews(call('/news-admin','POST',{action:'create',category:'视频精选',title:'XHS实测',content:'视频介绍',sourceUrl:'https://xhslink.cn/o/abc',videoUrl}),env,extra);
 assert.equal(created.status,200);
 const item=(await created.json()).items[0];
 assert.equal(item.platform,'xhs');
 assert.equal(item.videoUrl,videoUrl);
 const changed=await serveTechNews(call('/news-admin','POST',{action:'update',id:item.id,category:'视频精选',title:'TG实测',content:'新介绍',sourceUrl:'https://t.me/example/7309',videoUrl}),env,extra);
 assert.equal(changed.status,200);
 assert.equal((await changed.json()).items[0].platform,'tg');
 const deleted=await serveTechNews(call('/news-admin','POST',{action:'delete',id:item.id,confirm:true}),env,extra);
 assert.equal(deleted.status,200);
 assert.equal((await deleted.json()).items.length,0);
});
test('Video upload requires admin authentication and dedicated videos write token',async()=>{
 const fd=new FormData();
 fd.append('video',new Blob([new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0])],{type:'video/mp4'}),'clip.mp4');
 const mk=(auth=true)=>new Request('https://example.com/news-video-upload',{method:'POST',
  headers:{Origin:origin,...(auth?{'X-Admin-Key':env.ADMIN_KEY}:{})},body:fd});
 const denied=await serveTechNews(mk(false),env,{origin,allowed:origin,fetcher:async()=>{throw Error('should not fetch')}});
 assert.equal(denied.status,401);
 const noToken=await serveTechNews(mk(),env,{origin,allowed:origin,fetcher:async()=>{throw Error('should not fetch')}});
 assert.equal(noToken.status,503);
 const hits=[];
 const allowedEnv={...env,VIDEOS_GITHUB_TOKEN:'videos-test-token'};
 const uploaded=await serveTechNews(mk(),allowedEnv,{origin,allowed:origin,fetcher:async(url,opts)=>{
  hits.push({url,opts});return Response.json({content:{sha:'demo'}},{status:201});
 }});
 assert.equal(uploaded.status,200);
 const body=await uploaded.json();
 assert.match(body.videoUrl,/^https:\/\/raw\.githubusercontent\.com\/MaddestAlistar\/videos\/main\/clips\/[a-f0-9-]{36}\.mp4$/);
 assert.equal(hits.length,1);
 assert.equal(hits[0].opts.headers.Authorization,'Bearer videos-test-token');
});

test('Video-picked title and description enforce 20/38; regular news keeps old limits',async()=>{
 const store=db(),extra={origin,allowed:origin,fetcher:store.fetcher};
 const videoUrl='https://raw.githubusercontent.com/MaddestAlistar/videos/main/clips/12345678-abcd-4567-aaaa-123456789abc.mp4';
 const base={action:'create',category:'视频精选',sourceUrl:'https://t.me/channel/1',videoUrl};
 const rejectTitle=await serveTechNews(call('/news-admin','POST',{...base,title:'中'.repeat(21),content:'简短描述'}),env,extra);
 assert.equal(rejectTitle.status,400);
 assert.match((await rejectTitle.json()).error,/20/);
 const rejectDesc=await serveTechNews(call('/news-admin','POST',{...base,title:'视频标题',content:'中'.repeat(39)}),env,extra);
 assert.equal(rejectDesc.status,400);
 assert.match((await rejectDesc.json()).error,/38/);
 const accepted=await serveTechNews(call('/news-admin','POST',{...base,title:'中'.repeat(20),content:'文'.repeat(38)}),env,extra);
 assert.equal(accepted.status,200);
 const id=(await accepted.json()).items[0].id;
 const rejectEdit=await serveTechNews(call('/news-admin','POST',{...base,action:'update',id,title:'中'.repeat(21),content:'简介'}),env,extra);
 assert.equal(rejectEdit.status,400);
 assert.equal(store.read().items[0].title,'中'.repeat(20));
 const regular=await serveTechNews(call('/news-admin','POST',{action:'create',category:'应用动态',title:'中'.repeat(21),content:'文'.repeat(39)}),env,extra);
 assert.equal(regular.status,200);
});

test('Video upload rejects oversize before any GitHub write',async()=>{
 const fd=new FormData();
 fd.append('video',new Blob([new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0])],{type:'video/mp4'}),'clip.mp4');
 const request=new Request('https://example.com/news-video-upload',{method:'POST',headers:{
  Origin:origin,'X-Admin-Key':env.ADMIN_KEY,'Content-Length':String(VIDEO_MAX_BYTES+800001)
 },body:fd});
 const result=await serveTechNews(request,{...env,VIDEOS_GITHUB_TOKEN:'test-key'},{
  origin,allowed:origin,fetcher:async()=>{throw new Error('Must not write to GitHub')}
 });
 assert.equal(result.status,413);
 assert.match((await result.json()).error,/文件过大/);
});


test('Optional article image is persisted, edit replacement/removal works, and video retains its separate model',async()=>{
 const store=db(),extra={origin,allowed:origin,fetcher:store.fetcher};
 const root='https://raw.githubusercontent.com/MaddestAlistar/videos/main/news-images/';
 const first=root+'12345678-abcd-4567-aaaa-123456789abc.jpg';
 const second=root+'22345678-abcd-4567-aaaa-123456789abc.jpg';
 const create=await serveTechNews(call('/news-admin','POST',{
  action:'create',category:'系统提醒',title:'客户端通知',content:'公告信息',newsImageUrl:first
 }),env,extra);
 assert.equal(create.status,200);
 const created=(await create.json()).items[0];
 assert.equal(created.newsImageUrl,first);
 const feed=await serveTechNews(call('/news-feed','GET',null,false),env,extra);
 assert.equal((await feed.json()).items[0].newsImageUrl,first);
 const updated=await serveTechNews(call('/news-admin','POST',{
  action:'update',id:created.id,category:'热点播报',title:'后续更新',content:'新内容',newsImageUrl:second
 }),env,extra);
 assert.equal(updated.status,200);
 assert.equal((await updated.json()).items[0].newsImageUrl,second);
 const cleared=await serveTechNews(call('/news-admin','POST',{
  action:'update',id:created.id,category:'应用动态',title:'移除配图',content:'无图版本'
 }),env,extra);
 assert.equal(cleared.status,200);
 assert.equal((await cleared.json()).items[0].newsImageUrl,undefined);
 const evil=await serveTechNews(call('/news-admin','POST',{
  action:'create',category:'图标动态',title:'测试',content:'非法网址',newsImageUrl:'https://example.com/photo.jpg'
 }),env,extra);
 assert.equal(evil.status,400);
 const malformed=await serveTechNews(call('/news-admin','POST',{
  action:'create',category:'图标动态',title:'测试',content:'非法路径',newsImageUrl:root+'../bad.jpg'
 }),env,extra);
 assert.equal(malformed.status,400);
 const video=await serveTechNews(call('/news-admin','POST',{
  action:'create',category:'视频精选',title:'原有视频',content:'内容',
  sourceUrl:'https://t.me/example/100',
  videoUrl:'https://raw.githubusercontent.com/MaddestAlistar/videos/main/clips/12345678-abcd-4567-aaaa-123456789abc.mp4',
  newsImageUrl:first
 }),env,extra);
 assert.equal(video.status,200);
 assert.equal((await video.json()).items[0].newsImageUrl,undefined);
});

test('Photo uploads require admin secret, valid JPEG content and dedicated GitHub token',async()=>{
 const blob=new Uint8Array(180);blob[0]=0xff;blob[1]=0xd8;blob[178]=0xff;blob[179]=0xd9;
 const form=new FormData();form.append('image',new Blob([blob],{type:'image/jpeg'}),'news.jpg');
 const request=(auth=true,formData=form)=>new Request('https://example.com/news-image-upload',{
  method:'POST',headers:{Origin:origin,...(auth?{'X-Admin-Key':env.ADMIN_KEY}:{})},body:formData
 });
 const extra={origin,allowed:origin,fetcher:async()=>{throw Error('No GitHub writes permitted')}};
 const denied=await serveTechNews(request(false),env,extra);
 assert.equal(denied.status,401);
 const noToken=await serveTechNews(request(),env,extra);
 assert.equal(noToken.status,503);
 const hits=[];
 const uploaded=await serveTechNews(request(),{...env,VIDEOS_GITHUB_TOKEN:'test-token'},
  {origin,allowed:origin,fetcher:async(url,opts)=>{hits.push({url,opts});return Response.json({content:{sha:'sample'}},{status:201})}});
 assert.equal(uploaded.status,200);
 const data=await uploaded.json();
 assert.match(data.newsImageUrl,/^https:\/\/raw\.githubusercontent\.com\/MaddestAlistar\/videos\/main\/news-images\/[a-f0-9-]{36}\.jpg$/);
 assert.equal(hits.length,1);
 assert.equal(hits[0].opts.headers.Authorization,'Bearer test-token');
 const sent=JSON.parse(hits[0].opts.body);
 assert.equal(Buffer.from(sent.content,'base64').length,180);
 const notImage=new FormData();notImage.append('image',new Blob([new Uint8Array(180)],{type:'image/jpeg'}),'news.jpg');
 const invalid=await serveTechNews(request(true,notImage),{...env,VIDEOS_GITHUB_TOKEN:'test-token'},extra);
 assert.equal(invalid.status,400);
});
test('News photo upload rejects oversized requests before repository writes',async()=>{
 const fd=new FormData();fd.append('image',new Blob([new Uint8Array(180)],{type:'image/jpeg'}),'photo.jpg');
 const request=new Request('https://example.com/news-image-upload',{method:'POST',headers:{
  Origin:origin,'X-Admin-Key':env.ADMIN_KEY,'Content-Length':'1500000'
 },body:fd});
 const result=await serveTechNews(request,{...env,VIDEOS_GITHUB_TOKEN:'test-key'},{
  origin,allowed:origin,fetcher:async()=>{throw Error('Should not upload')}
 });
 assert.equal(result.status,413);
});

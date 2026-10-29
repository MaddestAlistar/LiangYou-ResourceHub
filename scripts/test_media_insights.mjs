/* Offline contract tests: no API credentials or network access required. */
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../labs/streaming-availability-worker.mjs';

const originalFetch=globalThis.fetch;
const originalCaches=globalThis.caches;
globalThis.caches={default:{match:async()=>null,put:async()=>{}}};
after(()=>{globalThis.fetch=originalFetch;globalThis.caches=originalCaches;});
const json=data=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
function stub(data){
 globalThis.fetch=async input=>{
   const uri=new URL(String(input));
   if(uri.hostname==='api.themoviedb.org'&&uri.pathname.startsWith('/3/movie/550'))
     return json({...data.movie,id:550,title:'Fight Club',original_title:'Fight Club',adult:false,external_ids:{imdb_id:'tt0137523'},imdb_id:'tt0137523'});
   if(uri.hostname==='api.themoviedb.org'&&uri.pathname.startsWith('/3/tv/1399'))
     return json({...data.tv,id:1399,name:'Game of Thrones',original_name:'Game of Thrones',adult:false,external_ids:{tvdb_id:121361,imdb_id:'tt0944947'}});
   if(uri.hostname==='api4.thetvdb.com'&&uri.pathname==='/v4/login')return json({data:{token:'test-bearer'}});
   if(uri.hostname==='api4.thetvdb.com'&&uri.pathname==='/v4/series/121361/extended')return json({data:{id:121361,name:'Game of Thrones',score:982.5,status:{name:'Ended'},seasons:[{number:0},{number:1},{number:2}]}});
   if(uri.hostname==='www.kobis.or.kr'||uri.hostname==='kobis.or.kr')return json({boxOfficeResult:{dailyBoxOfficeList:[{rank:'1',movieNm:'기생충',openDt:'2019-05-30',salesAmt:'2000',audiCnt:'50'}]}});
   if(uri.hostname==='www.omdbapi.com')return json({Response:'True',imdbID:'tt0137523',BoxOffice:'$37,030,102'});
   if(uri.hostname==='content.guardianapis.com')return json(data.guardian||{response:{status:'ok',results:[]}});
   if(uri.hostname==='www.googleapis.com'&&uri.pathname==='/youtube/v3/videos')
     return json({items:data.youtubeVideos||[{id:'AbCdEf12345',snippet:{title:'Fight Club Official Trailer',channelTitle:'Official Movie Channel',publishedAt:'2025-05-11T10:00:00Z'},contentDetails:{duration:'PT2M14S'},statistics:{viewCount:'1234567'},status:{privacyStatus:'public',embeddable:true}}]});
   if(uri.hostname==='www.googleapis.com'&&uri.pathname==='/youtube/v3/search')
     return json({items:data.youtubeSearch||[{id:{videoId:'AbCdEf12345'},snippet:{title:'Fight Club Trailer Search',channelTitle:'Trailer Archive'}}]});
   if(uri.hostname==='tastedive.com')
     return json({Similar:{Results:[{Name:'Another Movie',Type:'movie'}]}});
   if(uri.hostname==='api.myanimelist.net'&&uri.pathname==='/v2/anime/1')return json({id:1,title:'Cowboy Bebop',mean:8.73,rank:43,popularity:21,num_scoring_users:865433,num_episodes:26,studios:[{name:'Sunrise'}],genres:[{name:'Action'}]});

   throw Error('unexpected outbound URL: '+uri.hostname+uri.pathname);
 };
}
async function invoke(path,env={}){
 const response=await worker.fetch(new Request('https://test.example'+path),env,{waitUntil:()=>{}});
 return {status:response.status,body:await response.json()};
}
test('movie enrichment requires an exact TMDB ID; no fabricated ratings',async()=>{
 stub({});
 const {status,body}=await invoke('/api/insights/movie/550',{TMDB_API_KEY:'test',OMDB_API_KEY:'test'});
 assert.equal(status,200);
 assert.equal(body.ok,true);assert.equal(body.kind,'movie');assert.equal(body.tmdbId,550);
 assert.equal(body.imdbId,'tt0137523');assert.equal(body.boxOffice.amount,'$37,030,102');
 assert.equal(body.sources.thetvdb,'identity_missing');assert.deepEqual(body.artwork,[]);
 assert.equal(Object.hasOwn(body,'ratings'),false);
});
test('TVDB joins on authoritative external ID and never exposes popularity as rating',async()=>{
 stub({});
 const {status,body}=await invoke('/api/insights/tv/1399',{TMDB_API_KEY:'test',THETVDB_API_KEY:'test'});
 assert.equal(status,200);assert.equal(body.tvdbId,121361);assert.equal(body.tvdb.seasons,2);
 assert.equal(body.sources.thetvdb,'ok');assert.equal(Object.hasOwn(body.tvdb,'score'),false);
});
test('missing KOFIC key explicitly marks source not configured',async()=>{
 stub({});
 const {status,body}=await invoke('/api/kobis/daily');
 assert.equal(status,200);assert.equal(body.status,'not_configured');assert.deepEqual(body.data,[]);
});
test('KOFIC daily parsing preserves KRW and admission counts',async()=>{
 stub({});
 const {status,body}=await invoke('/api/kobis/daily',{KOFIC_API_KEY:'test'});
 assert.equal(status,200);assert.equal(body.status,'ok');assert.equal(body.data[0].salesKRW,2000);assert.equal(body.data[0].audience,50);
});
test('invalid TMDB identity cannot be enriched',async()=>{
 stub({movie:{id:551}});
 // Test ID mismatches against the canonical TMDB response.
 const old=globalThis.fetch;
 globalThis.fetch=async input=>{
   if(String(input).includes('api.themoviedb.org'))return json({id:999,title:'Wrong title'});
   return old(input);
 };
 const {status,body}=await invoke('/api/insights/movie/550',{TMDB_API_KEY:'test'});
 assert.equal(status,502);assert.equal(body.ok,false);
});

test('lightweight classification endpoint fetches only exact TMDB title metadata',async()=>{
 stub({movie:{genres:[{name:'Drama'}],keywords:{keywords:[{name:'family bonds'}]},
   release_dates:{results:[{iso_3166_1:'US',release_dates:[{type:3,certification:'PG-13'}]}]}}});
 const outbound=[];
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{outbound.push(new URL(String(input)).hostname);return original(input);};
 const {status,body}=await invoke('/api/classification/movie/550?schema=1',
   {TMDB_API_KEY:'test',OMDB_API_KEY:'test',FANARTTV_API_KEY:'test',THE_GUARDIAN_API_KEY:'test'});
 assert.equal(status,200);
 assert.equal(body.source,'TMDB');
 assert.equal(body.tmdbId,550);
 assert.deepEqual(body.classification.keywords,['family bonds']);
 assert.deepEqual(body.classification.parental_rating,{country:'US',rating:'PG-13',source:'TMDB'});
 assert.deepEqual(outbound,['api.themoviedb.org']);
});
test('lightweight classification omits unsourced TV ratings and rejects mismatched IDs',async()=>{
 stub({tv:{genres:[{name:'Drama'}],keywords:{results:[]},content_ratings:{results:[]}}});
 let x=await invoke('/api/classification/tv/1399?schema=1',{TMDB_API_KEY:'test'});
 assert.equal(x.status,200);assert.equal(x.body.classification.parental_rating,null);
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{
   const uri=new URL(String(input));
   if(uri.hostname==='api.themoviedb.org')return json({id:9999,name:'Wrong title'});
   return original(input);
 };
 x=await invoke('/api/classification/tv/1399?schema=1',{TMDB_API_KEY:'test'});
 assert.equal(x.status,502);assert.equal(x.body.ok,false);
});
test('real TMDB movie classification is territory-specific and does not infer age suitability',async()=>{
 stub({movie:{
   genres:[{id:28,name:'Action'},{id:12,name:'Adventure'}],
   keywords:{keywords:[{name:'space travel'},{name:'space travel'}]},
   release_dates:{results:[{iso_3166_1:'US',release_dates:[{type:3,certification:'PG-13'}]}]}
 }});
 const {status,body}=await invoke('/api/insights/movie/550',{TMDB_API_KEY:'test'});
 assert.equal(status,200);
 assert.deepEqual(body.classification.genres,['Action','Adventure']);
 assert.deepEqual(body.classification.keywords,['space travel']);
 assert.deepEqual(body.classification.parental_rating,{country:'US',rating:'PG-13',source:'TMDB'});
});
test('missing and conflicting parental classifications are omitted, not guessed',async()=>{
 stub({movie:{genres:[],keywords:{keywords:[]},release_dates:{results:[{iso_3166_1:'US',release_dates:[
  {type:3,certification:'R'},{type:3,certification:'PG-13'}]}]}}});
 const {body}=await invoke('/api/insights/movie/550',{TMDB_API_KEY:'test'});
 assert.equal(body.classification.parental_rating,null);
 stub({tv:{content_ratings:{results:[{iso_3166_1:'US',rating:'TV-14'}]},
  keywords:{results:[{name:'family relationships'}]}}});
 const result=await invoke('/api/insights/tv/1399',{TMDB_API_KEY:'test'});
 assert.equal(result.body.classification.parental_rating.rating,'TV-14');
 assert.deepEqual(result.body.classification.keywords,['family relationships']);
});
test('TMDB-ID news search accepts only matching film titles, not general arts news',async()=>{
 stub({movie:{alternative_titles:{titles:[{iso_3166_1:'CN',title:'搏击俱乐部'}]}}});
 const old=globalThis.fetch;
 const date=new Date(Date.now()-86400000).toUTCString();
 const item=(title,url,source)=>'<item><title>'+title+'</title><link>'+url+'</link><pubDate>'+date+
   '</pubDate><source>'+source+'</source></item>';
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='news.google.com')return new Response('<rss><channel>'+
    item('《搏击俱乐部》电影幕后花絮','https://news.google.com/rss/articles/real-cn','Publisher A')+
    item('艺术节举办：文学馆交流活动','https://news.google.com/rss/articles/unrelated','Publisher B')+
    item('Fight Club movie cast reunion','https://news.google.com/rss/articles/real-en','Publisher C')+
    '</channel></rss>',{status:200,headers:{'content-type':'application/rss+xml'}});
  return old(input);
 };
 try{
  const {status,body}=await invoke('/api/news/title/movie/550',{TMDB_API_KEY:'test'});
  assert.equal(status,200);
  assert.equal(body.kind,'movie');assert.equal(body.tmdbId,550);
  assert.equal(body.articles.length,2);
  assert.ok(body.articles.some(x=>x.title.includes('搏击俱乐部')));
  assert.ok(body.articles.some(x=>x.title.includes('Fight Club')));
  assert.ok(body.articles.every(x=>x.url.startsWith('https://news.google.com/')));
  assert.ok(body.articles.every(x=>!x.title.includes('文学馆')));
 }finally{globalThis.fetch=old;}
});
test('uncurated catalog films discover historical Chinese and English articles by exact TMDB ID',async()=>{
 const original=globalThis.fetch;
 const sampleDate=year=>new Date(Date.UTC(Math.max(2010,year)+1,3,18)).toUTCString();
 const origins=[];
 const entries=[
  {kind:'movie',id:27205,en:'Inception',zh:'盗梦空间',year:2010},
  {kind:'movie',id:603,en:'The Matrix',zh:'黑客帝国',year:1999},
  {kind:'movie',id:129,en:'Spirited Away',zh:'千与千寻',year:2001},
  {kind:'movie',id:157336,en:'Interstellar',zh:'星际穿越',year:2014}
 ];
 for(const item of entries){
  const date=sampleDate(item.year);
  globalThis.fetch=async input=>{
   const u=new URL(String(input)),host=u.hostname;
   if(host==='api.themoviedb.org'){
    const chinese=u.searchParams.get('language')==='zh-CN';
    return json({id:item.id,adult:false,title:chinese?item.zh:item.en,original_title:item.en,
      release_date:item.year+'-07-16',genres:[{name:'Science Fiction'}],
      alternative_titles:{titles:[{iso_3166_1:'CN',title:item.zh}]},credits:{cast:[],crew:[]}});
   }
   if(host==='news.google.com'){
    origins.push({q:u.searchParams.get('q'),ceid:u.searchParams.get('ceid')});
    const chinese=u.searchParams.get('ceid')==='CN:zh-Hans';
    const title=chinese?'《'+item.zh+'》电影深度影评':item.en+' '+item.year+' movie retrospective';
    return new Response('<rss><channel><item><title>'+title+'</title>'+
      '<link>https://news.google.com/rss/articles/'+item.id+(chinese?'-zh':'-en')+'</link>'+
      '<pubDate>'+date+'</pubDate><source>Film Magazine</source></item></channel></rss>');
   }
   if(host==='content.guardianapis.com')return json({response:{status:'ok',results:[
    {webTitle:item.en+' movie review '+item.year,webUrl:'https://www.theguardian.com/film/2010/jul/18/review',
     webPublicationDate:new Date(Date.UTC(Math.max(2010,item.year),6,18)).toISOString()}]}});
   throw Error('unexpected '+host);
  };
  try{
   const {status,body}=await invoke('/api/news/title/movie/'+item.id,
      {TMDB_API_KEY:'test',THE_GUARDIAN_API_KEY:'test'});
   assert.equal(status,200,item.en);
   assert.equal(body.tmdbId,item.id,item.en);
   assert.ok(body.articles.some(x=>x.language==='zh'),item.en+' Chinese archive');
   assert.ok(body.articles.some(x=>x.language==='en'),item.en+' English archive');
   assert.ok(body.articles.every(x=>x.titleMatchVerified===true),item.en+' verified per ID');
   if(item.year<=2011)assert.ok(body.articles.some(x=>x.date.startsWith('2011')||x.date.startsWith('2010')),
      item.en+' historical coverage');
  }finally{globalThis.fetch=original;}
 }
 assert.ok(origins.some(x=>x.ceid==='CN:zh-Hans'));
 assert.ok(origins.some(x=>x.ceid==='US:en'));
 assert.ok(origins.every(x=>!x.q.includes('when:2y')));
});
test('modern remakes cannot inherit same-name Guardian articles from an older film',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{
   const u=new URL(String(input));
   if(u.hostname==='api.themoviedb.org')return json({
     id:550,title:'The Cat in the Hat',original_title:'The Cat in the Hat',
     adult:false,release_date:'2026-11-06',credits:{crew:[],cast:[]},
     genres:[{name:'Family'}],alternative_titles:{titles:[]},translations:{translations:[]}});
   if(u.hostname==='content.guardianapis.com')return json({response:{status:'ok',results:[
     {webTitle:'The Cat in the Hat review – family film',
      webUrl:'https://www.theguardian.com/film/2004/apr/02/dvdreviews.shopping5',
      webPublicationDate:'2004-04-02T16:30:26Z'},
     {webTitle:'The Cat in the Hat 2026 movie review',
      webUrl:'https://www.theguardian.com/film/2026/nov/12/new-film-review',
      webPublicationDate:'2026-10-20T12:00:00Z'}]}});
   if(u.hostname==='news.google.com'||u.hostname==='www.bing.com')
     return new Response('<rss><channel></channel></rss>',{status:200});
   throw Error('unexpected external source');
 };
 try{
  const {status,body}=await invoke('/api/news/title/movie/550',{
   TMDB_API_KEY:'test',THE_GUARDIAN_API_KEY:'test'});
  assert.equal(status,200);
  assert.ok(body.articles.some(x=>x.url.includes('/2026/nov/12/')));
  assert.ok(body.articles.every(x=>!x.url.includes('/2004/apr/02/')));
 }finally{globalThis.fetch=original;}
});
test('Guardian film-section reviews can match a distinctive film even without its year in the headline',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='api.themoviedb.org')return json({id:550,title:'Inception',original_title:'Inception',
   release_date:'2010-07-16',adult:false,alternative_titles:{titles:[]},
   credits:{cast:[],crew:[{name:'Christopher Nolan',job:'Director'}]}});
  if(u.hostname==='news.google.com')return new Response('<rss><channel></channel></rss>');
  if(u.hostname==='content.guardianapis.com')return json({response:{status:'ok',results:[
   {webTitle:'Inception review – a mind-bending film',webUrl:'https://www.theguardian.com/film/2010/jul/15/inception-review',
    webPublicationDate:'2010-07-15T08:00:00Z'},
   {webTitle:'The future of technology',webUrl:'https://www.theguardian.com/film/2010/jul/15/other',
    webPublicationDate:'2010-07-15T08:00:00Z'}
  ]}});
  throw Error('unexpected URL '+u.hostname);
 };
 try{
  const {status,body}=await invoke('/api/news/title/movie/550',
    {TMDB_API_KEY:'test',THE_GUARDIAN_API_KEY:'test'});
  assert.equal(status,200);
  assert.ok(body.articles.some(v=>v.source==='The Guardian'&&v.title.startsWith('Inception review')));
  assert.ok(!body.articles.some(v=>v.title.includes('future of technology')));
 }finally{globalThis.fetch=old;}
});
test('Guardian standfirst can identify a specific movie when the headline has no title',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==="api.themoviedb.org")return json({id:550,adult:false,
   title:"Spirited Away",original_title:"Spirited Away",release_date:"2001-07-20"});
  if(u.hostname==="news.google.com")return new Response("<rss><channel></channel></rss>");
  if(u.hostname==="content.guardianapis.com")return json({response:{status:"ok",results:[
   {webTitle:"A wondrous animated film by Hayao Miyazaki",
    webUrl:"https://www.theguardian.com/film/2001/jul/30/miyazaki-feature",
    webPublicationDate:"2001-07-30T12:00:00Z",
    fields:{trailText:"Review: Spirited Away takes viewers into a magical world",standfirst:"Japanese animation"}},
   {webTitle:"Film industry obsession with nostalgia",
    webUrl:"https://www.theguardian.com/film/2022/aug/20/unrelated",
    webPublicationDate:"2022-08-20T12:00:00Z",
    fields:{trailText:"Our collective obsession with cinema",standfirst:"An unrelated film trend"}}
  ]}});
  if(u.hostname==="www.bing.com")return new Response("<rss><channel></channel></rss>");
  throw Error("Unexpected "+u.href);
 };
 try{
  const {status,body}=await invoke("/api/news/title/movie/550",
     {TMDB_API_KEY:"test",THE_GUARDIAN_API_KEY:"test"});
  assert.equal(status,200);
  assert.ok(body.articles.some(v=>v.source==="The Guardian"&&v.title.startsWith("A wondrous")));
  assert.ok(body.articles.every(v=>!v.title.includes("obsession with nostalgia")));
 }finally{globalThis.fetch=old;}
});
test('a movie with no news can show clearly labeled, ID-linked user review links without inventing popularity',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='api.themoviedb.org')return json({id:550,title:'Fight Club',original_title:'Fight Club',
   release_date:'1999-10-15',adult:false,alternative_titles:{titles:[]},
   reviews:{results:[
    {author:'MovieFan',content:'A carefully written film discussion with many specific observations.',
     url:'https://www.themoviedb.org/review/verified123',created_at:'2025-02-01T08:00:00Z'},
    {author:'Spam',content:'Spam content from an unrelated hostile website should never be linked.',
     url:'https://attacker.example/reviews/123',created_at:'2025-02-01T08:00:00Z'}
   ]}});
  if(u.hostname==='news.google.com')return new Response('<rss><channel></channel></rss>');
  throw Error('simulated public news source unavailable');
 };
 try{
  const {status,body}=await invoke('/api/news/title/movie/550',{TMDB_API_KEY:'test'});
  assert.equal(status,200);
  assert.ok(body.articles.some(v=>v.type==='community'&&v.source==='TMDB · Community reviews'));
  assert.ok(body.articles.some(v=>v.url==='https://www.themoviedb.org/review/verified123'));
  assert.ok(!body.articles.some(v=>v.url.includes('attacker.example')));
  assert.ok(body.articles.every(v=>v.titleMatchVerified===true));
  assert.ok(!body.articles.some(v=>Number.isFinite(v.likes)));
 }finally{globalThis.fetch=original;}
});
test('uncurated movie Bing fallback accepts verified publisher links and blocks unrelated results',async()=>{
 const original=globalThis.fetch,year='2010';
 let bingHits=0;
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='api.themoviedb.org')return json({id:550,title:'Inception',original_title:'Inception',
    release_date:year+'-07-16',adult:false,
    alternative_titles:{titles:[{iso_3166_1:'CN',title:'盗梦空间'}]},
    credits:{cast:[],crew:[{job:'Director',name:'Christopher Nolan'}]}});
  if(u.hostname==='news.google.com')return new Response('<rss><channel></channel></rss>');
  if(u.hostname==='www.bing.com'){
   bingHits++;
   const real='https://example.org/films/inception-analysis';
   const bad='https://example.org/other';
   const portal='https://www.youtube.com/watch?v=AbCdEf12345';
   return new Response('<rss><channel><item><title>Inception 2010 film review</title>'+
     '<link>'+real+'</link><source>Film Review Journal</source></item>'+
     '<item><title>Building obsession with productivity</title><link>'+bad+'</link></item>'+
     '<item><title>Inception 2010 film review</title><link>'+portal+'</link></item>'+
     '</channel></rss>',{status:200});
  }
  throw Error('unexpected '+u.hostname);
 };
 try{
  const {status,body}=await invoke('/api/news/title/movie/550',{TMDB_API_KEY:'test'});
  assert.equal(status,200);
  assert.ok(bingHits>0);
  assert.ok(body.articles.some(v=>v.url==='https://example.org/films/inception-analysis'));
  assert.ok(body.articles.every(v=>!v.title.includes('productivity')));
  assert.ok(body.articles.every(v=>!v.url.includes('youtube.com')));
  assert.ok(body.sourceDiagnostics.bingMatched>=1);
  assert.ok(body.articles.every(v=>v.titleMatchVerified===true));
 }finally{globalThis.fetch=original;}
});
test('Moana remake and Obsession movie headlines are separated from unrelated short-word coverage',async()=>{
 const old=globalThis.fetch;
 const today=new Date(Date.now()-86400000).toUTCString();
 const feed=titles=>new Response('<rss><channel>'+titles.map((t,i)=>
  '<item><title>'+t+'</title><link>https://news.google.com/rss/articles/news-'+i+
  '</link><pubDate>'+today+'</pubDate><source>Film Publisher</source></item>').join('')+
  '</channel></rss>',{status:200,headers:{'content-type':'application/rss+xml'}});
 for(const work of [
  {original:'Moana',local:'海洋奇缘：启航',genre:'Adventure',director:'Thomas Kail',
   good:['Live-action Moana 2026 movie premieres','《海洋奇缘》真人版 2026 电影票房'],
   bad:['Moana 2016 animated soundtrack','Moana fan obsession with jewelry','《海洋奇缘》动画原版口碑讨论']},
  {original:'Obsession',local:'痴迷',genre:'Horror',director:'Curry Barker',
   good:['Obsession 2026 horror film makes box office history','Curry Barker Obsession movie wins fans'],
   bad:['The internet obsession with movies','Obsession with gaming grows']}
 ]){
  globalThis.fetch=async input=>{
   const u=new URL(String(input));
   if(u.hostname==='api.themoviedb.org')return json({id:550,
     title:u.searchParams.get('language')==='zh-CN'?work.local:work.original,
     original_title:work.original,release_date:'2026-07-10',adult:false,
     genres:[{name:work.genre}],alternative_titles:{titles:[{iso_3166_1:'CN',title:work.local}]},
     credits:{crew:[{job:'Director',name:work.director}],cast:[]}});
   if(u.hostname==='news.google.com')return feed([...work.good,...work.bad]);
   throw Error('unexpected URL '+u.hostname);
  };
  const {status,body}=await invoke('/api/news/title/movie/550',{TMDB_API_KEY:'test'});
  assert.equal(status,200);
  assert.ok(body.articles.some(v=>v.title===work.good[0]),work.original+' legitimate film news');
  assert.ok(body.articles.every(v=>!work.bad.includes(v.title)),work.original+' unrelated coverage filtered');
 }
 globalThis.fetch=old;
});
test('news search gracefully returns empty output when no trusted TMDB lookup is available',async()=>{
 stub({});
 const {status,body}=await invoke('/api/news/title/movie/550',{});
 assert.equal(status,200);
 assert.equal(body.status,'unavailable');
 assert.deepEqual(body.articles,[]);
});
test('all catalog TV titles can use validated Chinese regional aliases to find international video metadata',async()=>{
 stub({tv:{
   first_air_date:'2011-04-17',
   alternative_titles:{results:[{iso_3166_1:'CN',title:'权力的游戏'}]},
   videos:{results:[{site:'YouTube',official:true,type:'Trailer',key:'AbCdEf12345',name:'Official series trailer'}]}
  },
  youtubeSearch:[{id:{videoId:'CNAlias1234'}},{id:{videoId:'BadMatch001'}}],
  youtubeVideos:[
   {id:'AbCdEf12345',snippet:{title:'Game of Thrones official trailer',channelTitle:'Official TV'},
    status:{privacyStatus:'public',embeddable:true},contentDetails:{duration:'PT1M'},
    statistics:{viewCount:'20000'}},
   {id:'CNAlias1234',snippet:{title:'《权力的游戏》幕后采访',channelTitle:'Film discussion'},
    status:{privacyStatus:'public',embeddable:true},contentDetails:{duration:'PT5M'},
    statistics:{likeCount:'930',viewCount:'90000'}},
   {id:'BadMatch001',snippet:{title:'其他电视剧花絮',channelTitle:'Unrelated'},
    status:{privacyStatus:'public',embeddable:true},contentDetails:{duration:'PT3M'},
    statistics:{likeCount:'999999',viewCount:'1000000'}}
  ]});
 const {status,body}=await invoke('/api/insights/tv/1399?media=1',
   {TMDB_API_KEY:'test',YOUTUBE_API_KEY:'test'});
 assert.equal(status,200);
 assert.equal(body.tmdbId,1399);
 assert.ok(body.aliases.includes('权力的游戏'));
 assert.ok(body.relatedVideos.some(x=>x.id==='CNAlias1234'&&x.likes===930));
 assert.ok(!body.relatedVideos.some(x=>x.id==='BadMatch001'));
});
test('regional YouTube search recovers film clips that the English-only search missed',async()=>{
 const regionalId='CnAliasX001',unrelatedId='WrongAlias01',officialId='AbCdEf12345';
 const previous=globalThis.fetch;
 const youtubeSearches=[];
 stub({movie:{release_date:'1999-10-15',alternative_titles:{titles:[
    {iso_3166_1:'CN',title:'搏击俱乐部'}]},
   videos:{results:[{site:'YouTube',official:true,type:'Trailer',
     key:officialId,name:'Fight Club official trailer'}]}}});
 const underlying=globalThis.fetch;
 globalThis.fetch=async input=>{
  const uri=new URL(String(input));
  if(uri.hostname==='www.googleapis.com'&&uri.pathname==='/youtube/v3/search'){
   youtubeSearches.push(uri.searchParams.get('q')||'');
   const chinese=youtubeSearches[youtubeSearches.length-1].includes('搏击俱乐部');
   return json({items:[{id:{videoId:chinese?regionalId:unrelatedId}}]});
  }
  if(uri.hostname==='www.googleapis.com'&&uri.pathname==='/youtube/v3/videos'){
   const wanted=(uri.searchParams.get('id')||'').split(',');
   const entries=[
    {id:officialId,title:'Fight Club trailer',likes:10},
    {id:regionalId,title:'《搏击俱乐部》电影幕后采访',likes:188},
    {id:unrelatedId,title:'Unrelated productivity interview',likes:99999}
   ];
   return json({items:entries.filter(v=>wanted.includes(v.id)).map(v=>({
      id:v.id,snippet:{title:v.title,channelTitle:'Film Channel'},
      status:{privacyStatus:'public',embeddable:true},contentDetails:{duration:'PT3M'},
      statistics:{likeCount:String(v.likes),viewCount:'20000'}
   }))});
  }
  return underlying(input);
 };
 try{
  const {status,body}=await invoke('/api/insights/movie/550?media=1',
    {TMDB_API_KEY:'test',YOUTUBE_API_KEY:'test'});
  assert.equal(status,200);
  assert.ok(youtubeSearches.some(q=>q.includes('搏击俱乐部')),'verified regional title must be queried');
  assert.ok(body.relatedVideos.some(v=>v.id===regionalId&&v.likes===188));
  assert.ok(!body.relatedVideos.some(v=>v.id===unrelatedId));
 }finally{globalThis.fetch=previous;}
});
test('all-title Bilibili discovery verifies TMDB identity and each matching BVID before publishing',async()=>{
 const previous=globalThis.fetch;
 const bvid='BV1F3aF6mEQn',wrong='BV1spJR6yEci';
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='api.themoviedb.org')return json({
    id:550,adult:false,title:u.searchParams.get('language')==='zh-CN'?'我的有罪之人':'Guilty Person',
    original_title:'Guilty Person',release_date:'2026-10-19',
    alternative_titles:{titles:[{iso_3166_1:'CN',title:'我的有罪之人'}]}
  });
  if(u.hostname==='api.bilibili.com'&&u.pathname.endsWith('/search/type'))return json({
    code:0,data:{result:[
      {bvid,title:'《我的有罪之人》预告片'},
      {bvid:wrong,title:'其他电视剧预告片'}
    ]}});
  if(u.hostname==='api.bilibili.com'&&u.pathname.endsWith('/view'))
    return json({code:0,data:{bvid,title:'《我的有罪之人》预告片',state:0,
      owner:{name:'Film Creator'},stat:{like:238,view:4567}}});
  throw Error('Unexpected network URL: '+u.href);
 };
 try{
  const {status,body}=await invoke('/api/videos/title/movie/550',{TMDB_API_KEY:'test'});
  assert.equal(status,200);assert.equal(body.kind,'movie');assert.equal(body.tmdbId,550);
  assert.equal(body.videos.length,1);
  assert.equal(body.videos[0].videoId,bvid);
  assert.equal(body.videos[0].likes,238);
  assert.equal(body.videos[0].verifiedByTitleId,true);
  assert.ok(body.videos[0].verifiedSource.endsWith('/'+bvid+'/'));
 }finally{globalThis.fetch=previous;}
});
test('all-title Bilibili discovery can fall back to an indexed public link and validate its BVID',async()=>{
 const old=globalThis.fetch,bvid='BV1F3aF6mEQn';
 globalThis.fetch=async input=>{
  const uri=new URL(String(input));
  if(uri.hostname==='api.themoviedb.org')return json({id:550,adult:false,
   title:uri.searchParams.get('language')==='zh-CN'?'我的有罪之人':'My Guilty Person',
   original_title:'My Guilty Person',release_date:'2026-10-19'});
  if(uri.hostname==='api.bilibili.com'&&uri.pathname.endsWith('/search/type'))
    return json({code:-412,message:'search unavailable'});
  if(uri.hostname==='www.bing.com'&&uri.pathname==='/search')
    return new Response('<rss><channel>'+
      '<item><title>《我的有罪之人》官方预告</title><link>https://www.bilibili.com/video/'+bvid+'/</link></item>'+
      '<item><title>《我的有罪之人》花絮</title><link>https://attacker.example/video/'+bvid+'/</link></item>'+
      '</channel></rss>',{status:200});
  if(uri.hostname==='api.bilibili.com'&&uri.pathname.endsWith('/view'))
    return json({code:0,data:{bvid,title:'《我的有罪之人》预告片',state:0,
      owner:{name:'Film Channel'},stat:{like:427,view:13570}}});
  throw Error('Unexpected '+uri.href);
 };
 try{
  const {status,body}=await invoke('/api/videos/title/movie/550',{TMDB_API_KEY:'test'});
  assert.equal(status,200);
  assert.equal(body.videos.length,1);
  assert.equal(body.videos[0].videoId,bvid);
  assert.equal(body.videos[0].likes,427);
  assert.ok(body.videos[0].verifiedByTitleId);
  assert.match(body.source,/Bing public index/);
 }finally{globalThis.fetch=old;}
});
test('Bing backup finds title-specific videos without a year only for distinctive catalog films',async()=>{
 const old=globalThis.fetch;
 const id='BV1F3aF6mEQn',queries=[];
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='api.themoviedb.org')return json({id:550,adult:false,
   title:'Far Away Oceanic Journey',original_title:'Far Away Oceanic Journey',
   release_date:'2024-03-03',alternative_titles:{titles:[]},translations:{translations:[]}});
  if(u.hostname==='api.bilibili.com'&&u.pathname.endsWith('/search/type'))
   return json({code:-412,message:'blocked'});
  if(u.hostname==='www.bing.com'&&u.pathname==='/search'){
   queries.push(u.searchParams.get('q'));
   return new Response('<rss><channel><item><title>Far Away Oceanic Journey film review</title>'+
    '<link>https://www.bilibili.com/video/'+id+'/</link></item></channel></rss>',{status:200});
  }
  if(u.hostname==='api.bilibili.com'&&u.pathname.endsWith('/view'))
   return json({code:0,data:{bvid:id,title:'Far Away Oceanic Journey film review',state:0,
    owner:{name:'Film Critics'},stat:{like:157,view:2045}}});
  throw Error('Unexpected '+u.href);
 };
 try{
  const {status,body}=await invoke('/api/videos/title/movie/550',{TMDB_API_KEY:'test'});
  assert.equal(status,200);assert.equal(body.videos.length,1);
  assert.ok(queries.some(q=>q.includes('Far Away Oceanic Journey')&&!q.includes('2024')));
  assert.equal(body.videos[0].likes,157);
 }finally{globalThis.fetch=old;}
});
test('Bing backup retains edition-year guard for short ambiguous film titles',async()=>{
 const old=globalThis.fetch,seen=[];
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='api.themoviedb.org')return json({id:550,adult:false,
   title:'Moana',original_title:'Moana',release_date:'2026-07-10'});
  if(u.hostname==='api.bilibili.com'&&u.pathname.endsWith('/search/type'))
   return json({code:-412,message:'blocked'});
  if(u.hostname==='www.bing.com'&&u.pathname==='/search'){
   seen.push(u.searchParams.get('q'));
   return new Response('<rss><channel><item><title>Moana 2016 film review</title>'+
    '<link>https://www.bilibili.com/video/BV1F3aF6mEQn/</link></item></channel></rss>',{status:200});
  }
  throw Error('Unexpected '+u.href);
 };
 try{
  const {status,body}=await invoke('/api/videos/title/movie/550',{TMDB_API_KEY:'test'});
  assert.equal(status,200);assert.equal(body.videos.length,0);
  assert.ok(seen.every(q=>q.includes('2026')));
 }finally{globalThis.fetch=old;}
});
test('non-indexed Japanese films use actual Chinese and Japanese titles in region-specific news searches',async()=>{
 const original=globalThis.fetch,queries=[];
 const date=new Date(Date.now()-86400000).toUTCString();
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==="api.themoviedb.org")return json({
   id:550,title:u.searchParams.get("language")==="zh-CN"?"你的名字。":"Your Name",
   original_title:"君の名は。",adult:false,release_date:"2016-08-26",
   alternative_titles:{titles:[]},
   translations:{translations:[{iso_639_1:"zh",iso_3166_1:"CN",data:{title:"你的名字。"}}]}
  });
  if(u.hostname==="news.google.com"){
   const q=u.searchParams.get("q")||"",lang=u.searchParams.get("hl");
   queries.push({q,lang});
   const title=lang==="ja"?"「君の名は。」2016年映画レビュー":lang==="zh-CN"?"《你的名字。》2016年电影影评":"Other TV story";
   return new Response('<rss><channel><item><title>'+title+'</title>'+
     '<link>https://news.google.com/rss/articles/jp-zh-' + encodeURIComponent(lang||'en')+
     '</link><pubDate>'+date+'</pubDate><source>Film Publication</source></item></channel></rss>',{status:200});
  }
  if(u.hostname==="www.bing.com")return new Response('<rss><channel></channel></rss>',{status:200});
  throw Error("Unexpected URL "+u.href);
 };
 try{
  const {status,body}=await invoke("/api/news/title/movie/550",{TMDB_API_KEY:"test"});
  assert.equal(status,200);
  assert.ok(queries.some(x=>x.lang==="zh-CN"&&x.q.includes("你的名字")), "Chinese title searched");
  assert.ok(queries.some(x=>x.lang==="ja"&&x.q.includes("君の名は")), "Japanese original searched");
  assert.ok(body.articles.some(x=>x.title.includes("你的名字")));
  assert.ok(body.articles.some(x=>x.title.includes("君の名は")));
 }finally{globalThis.fetch=original;}
});
test('all-title Bilibili discovery finds verified unyeared film reviews without unrelated videos',async()=>{
 const original=globalThis.fetch,bvid="BV1F3aF6mEQn",other="BV1spJR6yEci",searches=[];
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==="api.themoviedb.org")return json({id:550,adult:false,
   title:u.searchParams.get("language")==="zh-CN"?"大浪潮":"Great Wave",
   original_title:"Great Wave",release_date:"2024-02-15"});
  if(u.hostname==="api.bilibili.com"&&u.pathname.endsWith("/search/type")){
   searches.push(u.searchParams.get("keyword"));
   return json({code:0,data:{result:[
    {bvid,title:"《大浪潮》精华影评与幕后采访"},
    {bvid:other,title:"其他明星的八卦剪辑"}
   ]}});
  }
  if(u.hostname==="api.bilibili.com"&&u.pathname.endsWith("/view")){
   const vid=u.searchParams.get("bvid");
   if(vid===other)throw Error("Unrelated BVID must not reach the detail endpoint");
   return json({code:0,data:{bvid:vid,title:"《大浪潮》精华影评与幕后采访",state:0,
    owner:{name:"Film reviewer"},stat:{like:907,view:14000}}});
  }
  if(u.hostname==="www.bing.com")return new Response('<rss><channel></channel></rss>',{status:200});
  throw Error("Unexpected "+u.href);
 };
 try{
  const {status,body}=await invoke("/api/videos/title/movie/550",{TMDB_API_KEY:"test"});
  assert.equal(status,200);
  assert.equal(body.videos.length,1);
  assert.equal(body.videos[0].videoId,bvid);
  assert.equal(body.videos[0].likes,907);
  assert.ok(searches.some(x=>!x.includes("2024")),"yearless second search enabled");
 }finally{globalThis.fetch=original;}
});
test('every film keeps verified Chinese headlines even when international news is much more plentiful',async()=>{
 const previous=globalThis.fetch;
 const date=new Date(Date.now()-86400000).toUTCString();
 const row=(title,i)=>'<item><title>'+title+'</title><link>https://news.google.com/rss/articles/balanced-'+i+
   '</link><pubDate>'+date+'</pubDate><source>Movie publisher</source></item>';
 try{
  globalThis.fetch=async input=>{
   const u=new URL(String(input));
   if(u.hostname==='api.themoviedb.org')return json({id:550,adult:false,
     title:u.searchParams.get('language')==='zh-CN'?'大浪潮':'Great Wave',
     original_title:'Great Wave',release_date:'2023-06-05',
     translations:{translations:[{iso_639_1:'zh',iso_3166_1:'CN',data:{title:'大浪潮'}}]}});
   if(u.hostname==='news.google.com'){
    const chinese=u.searchParams.get('hl')==='zh-CN';
    const articles=chinese?Array.from({length:3},(_,i)=>row('《大浪潮》2023电影影评 '+i,'zh-'+i)):
       Array.from({length:30},(_,i)=>row('Great Wave 2023 film review '+i,'en-'+i));
    return new Response('<rss><channel>'+articles.join('')+'</channel></rss>',{status:200});
   }
   if(u.hostname==='www.bing.com')return new Response('<rss><channel></channel></rss>',{status:200});
   throw Error('unexpected '+u.href);
  };
  const {status,body}=await invoke('/api/news/title/movie/550',{TMDB_API_KEY:'test'});
  assert.equal(status,200);
  assert.ok(body.articles.length<=24);
  assert.equal(body.articles.filter(x=>x.language==='zh').length,3);
  assert.ok(body.articles.some(x=>x.language==='en'));
 }finally{globalThis.fetch=previous;}
});
test('regional TMDB translations discover genuine news for non-indexed catalog movies',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async input=>{
  const uri=new URL(String(input));
  if(uri.hostname==='api.themoviedb.org')return json({id:550,adult:false,
   title:'Great Wave',original_title:'Great Wave',release_date:'2023-06-05',
   translations:{translations:[{iso_639_1:'zh',iso_3166_1:'CN',data:{title:'大浪潮'}}]}});
  if(uri.hostname==='news.google.com')return new Response('<rss><channel>'+
    '<item><title>《大浪潮》2023年电影首映</title><link>https://news.google.com/rss/articles/film-news</link>'+
    '<pubDate>'+new Date(Date.now()-86400000).toUTCString()+'</pubDate><source>Film Press</source></item>'+
    '</channel></rss>',{status:200});
  if(uri.hostname==='www.bing.com')return new Response('<rss><channel></channel></rss>',{status:200});
  throw Error('Unexpected '+uri.href);
 };
 try{
  const {status,body}=await invoke('/api/news/title/movie/550',{TMDB_API_KEY:'test'});
  assert.equal(status,200);
  assert.equal(body.tmdbId,550);
  assert.ok(body.articles.some(x=>x.title.includes('大浪潮')));
  assert.ok(body.articles.every(x=>x.titleMatchVerified));
 }finally{globalThis.fetch=old;}
});
test('catalog movies without a Chinese title still receive checked English-title Bilibili clips',async()=>{
 const before=globalThis.fetch,search=[];
 const bvid="BV1F3aF6mEQn";
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==="api.themoviedb.org")return json({
   id:550,adult:false,title:"Northern Lights",original_title:"Northern Lights",
   release_date:"2024-03-01",alternative_titles:{titles:[]},translations:{translations:[]}
  });
  if(u.hostname==="api.bilibili.com"&&u.pathname.endsWith("/search/type")){
   search.push(u.searchParams.get("keyword"));
   return json({code:0,data:{result:[{bvid,title:"Northern Lights 电影幕后花絮"}]}});
  }
  if(u.hostname==="api.bilibili.com"&&u.pathname.endsWith("/view"))
   return json({code:0,data:{bvid,title:"Northern Lights 电影幕后花絮",state:0,
    owner:{name:"Film community"},stat:{like:52,view:2500}}});
  if(u.hostname==="www.bing.com")return new Response("<rss><channel></channel></rss>",{status:200});
  throw Error("Unexpected "+u.href);
 };
 try{
  const {status,body}=await invoke("/api/videos/title/movie/550",{TMDB_API_KEY:"test"});
  assert.equal(status,200);
  assert.equal(body.status,"ok");
  assert.equal(body.videos[0].videoId,bvid);
  assert.ok(search.some(x=>x.includes("Northern Lights")));
 }finally{globalThis.fetch=before;}
});
test('blocked Bilibili public search fails closed and does not invent video cards',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='api.themoviedb.org')return json({
    id:550,adult:false,title:'测试电影',original_title:'Test Movie',release_date:'2024-08-01'
  });
  if(u.hostname==='api.bilibili.com')return json({code:-412,message:'request blocked'});
  throw Error('Unexpected URL');
 };
 try{
  const {status,body}=await invoke('/api/videos/title/movie/550',{TMDB_API_KEY:'test'});
  assert.equal(status,200);assert.equal(body.status,'unavailable');
  assert.deepEqual(body.videos,[]);
 }finally{globalThis.fetch=previous;}
});
test('Bilibili likes are returned only from matching public video metadata',async()=>{
 const origin=globalThis.fetch;
 const id='BV1spJR6yEci';
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='api.bilibili.com'&&u.searchParams.get('bvid')===id)
   return json({code:0,data:{bvid:id,stat:{like:250,view:87500}}});
  throw Error('unexpected request');
 };
 try{
  const {status,body}=await invoke('/api/video/bilibili/'+id);
  assert.equal(status,200);assert.equal(body.ok,true);
  assert.equal(body.bvid,id);assert.equal(body.likes,250);assert.equal(body.views,87500);
 }finally{globalThis.fetch=origin;}
});
test('Bilibili mismatched IDs and unavailable like counters cannot be shown as popularity',async()=>{
 const origin=globalThis.fetch,id='BV1spJR6yEci';
 globalThis.fetch=async()=>json({code:0,data:{bvid:'BV1F3aF6mEQn',stat:{like:999999,view:99999}}});
 try{
  const {body}=await invoke('/api/video/bilibili/'+id);
  assert.equal(body.ok,false);
  assert.equal(body.likes,undefined);
 }finally{globalThis.fetch=origin;}
});
test('older movies may show a TMDB-linked unflagged trailer without falsely claiming it is official',async()=>{
 stub({movie:{videos:{results:[
  {site:"YouTube",official:false,type:"Trailer",key:"OldFilm1234",name:"Classic Film theatrical trailer"},
  {site:"YouTube",official:false,type:"Clip",key:"Pirated1234",name:"Full movie watch online"}
 ]}},youtubeVideos:[{
  id:"OldFilm1234",snippet:{title:"Classic Film theatrical trailer",channelTitle:"Film Archive"},
  status:{privacyStatus:"public",embeddable:true},contentDetails:{duration:"PT2M"},
  statistics:{viewCount:"800",likeCount:"40"}
 }]});
 const {status,body}=await invoke("/api/insights/movie/550?media=1",
   {TMDB_API_KEY:"test",YOUTUBE_API_KEY:"test"});
 assert.equal(status,200);
 assert.ok(body.trailers.some(x=>x.id==="OldFilm1234"&&x.official===false&&x.embeddable===true));
 assert.ok(!body.trailers.some(x=>x.id==="Pirated1234"));
});
test('TMDB official YouTube IDs get metadata without guessing the video title',async()=>{
 stub({movie:{videos:{results:[{site:'YouTube',official:true,type:'Trailer',key:'AbCdEf12345',name:'Official Film Trailer'}]}}});
 const {status,body}=await invoke('/api/insights/movie/550?media=1',{TMDB_API_KEY:'test',YOUTUBE_API_KEY:'test'});
 assert.equal(status,200);assert.equal(body.sources.youtube,'ok');
 assert.equal(body.trailers.length,1);assert.equal(body.trailers[0].id,'AbCdEf12345');
 assert.equal(body.trailers[0].official,true);assert.equal(body.trailers[0].duration,'PT2M14S');
 assert.equal(body.trailers[0].channel,'Official Movie Channel');
 assert.equal(body.trailers[0].views,1234567);
});
test('verified TMDB regional aliases and real YouTube likes improve related coverage safely',async()=>{
 stub({movie:{release_date:'1999-10-15',
   alternative_titles:{titles:[
     {iso_3166_1:'CN',title:'搏击俱乐部'},
     {iso_3166_1:'US',title:'Fight Club'},
     {iso_3166_1:'FR',title:'Unrelated translation'}
   ]},
   videos:{results:[{site:'YouTube',official:true,type:'Trailer',key:'AbCdEf12345',name:'Official trailer'}]}
  },youtubeVideos:[
   {id:'AbCdEf12345',snippet:{title:'Fight Club official trailer',channelTitle:'Official films'},
    contentDetails:{duration:'PT2M'},status:{privacyStatus:'public',embeddable:true},statistics:{viewCount:'500',likeCount:'40'}},
   {id:'Related9999',snippet:{title:'Fight Club cast interview',channelTitle:'Movie Press'},
    contentDetails:{duration:'PT4M'},status:{privacyStatus:'public',embeddable:true},statistics:{viewCount:'2000',likeCount:'420'}},
   {id:'Related8888',snippet:{title:'Fight Club movie scene discussion',channelTitle:'Film Channel'},
    contentDetails:{duration:'PT3M'},status:{privacyStatus:'public',embeddable:true},statistics:{viewCount:'3000',likeCount:'100'}},
   {id:'Unrelat9999',snippet:{title:'Unrelated game highlights',channelTitle:'Other'},
    contentDetails:{duration:'PT3M'},status:{privacyStatus:'public',embeddable:true},statistics:{viewCount:'90000',likeCount:'9999'}},
  ],youtubeSearch:[
   {id:{videoId:'Related8888'}},{id:{videoId:'Unrelat9999'}},{id:{videoId:'Related9999'}}
  ]});
 const {status,body}=await invoke('/api/insights/movie/550?schema=9&media=1',{TMDB_API_KEY:'test',YOUTUBE_API_KEY:'test'});
 assert.equal(status,200);
 assert.ok(body.aliases.includes('搏击俱乐部'));
 assert.ok(!body.aliases.includes('Unrelated translation'));
 assert.deepEqual(body.relatedVideos.map(v=>v.id),['Related9999','Related8888']);
 assert.deepEqual(body.relatedVideos.map(v=>v.likes),[420,100]);
 assert.ok(body.relatedVideos.every(v=>v.embeddable===true&&!v.ageRestricted));
});
test('age-restricted and non-embeddable trailers are labeled and ranked behind anonymous-playable clips',async()=>{
 stub({movie:{videos:{results:[
   {site:'YouTube',official:true,type:'Trailer',key:'AgeGate1234',name:'Restricted Trailer'},
   {site:'YouTube',official:true,type:'Trailer',key:'FreePlay123',name:'Public Trailer'}
 ]}},youtubeVideos:[
   {id:'AgeGate1234',snippet:{title:'Restricted trailer'},contentDetails:{contentRating:{ytRating:'ytAgeRestricted'}},status:{privacyStatus:'public',embeddable:true}},
   {id:'FreePlay123',snippet:{title:'Public trailer'},contentDetails:{},status:{privacyStatus:'public',embeddable:true}}
 ]});
 const {status,body}=await invoke('/api/insights/movie/550?media=1',{TMDB_API_KEY:'test',YOUTUBE_API_KEY:'test'});
 assert.equal(status,200);
 assert.deepEqual(body.trailers.map(v=>v.id),['FreePlay123','AgeGate1234']);
 assert.equal(body.trailers[0].ageRestricted,false);
 assert.equal(body.trailers[0].embeddable,true);
 assert.equal(body.trailers[1].ageRestricted,true);
 assert.equal(body.trailers[1].embeddable,true);
});
test('YouTube search-only results remain explicitly unverified',async()=>{
 stub({});
 const {body}=await invoke('/api/insights/movie/550?media=1',{TMDB_API_KEY:'test',YOUTUBE_API_KEY:'test'});
 assert.equal(body.trailers[0].official,false);
 assert.equal(body.trailers[0].verifiedBy,'YouTube search');
});
test('Guardian preview is sanitized, title-related and source attributed',async()=>{
 stub({guardian:{response:{status:'ok',results:[
  {sectionId:'film',sectionName:'Film',webTitle:'Fight Club retrospective',webUrl:'https://www.theguardian.com/film/fight-club',
   webPublicationDate:'2026-10-20T00:00:00Z',fields:{trailText:'<p>Fight Club retrospective <b>review</b>.</p>',thumbnail:'https://media.guim.co.uk/test.jpg'}},
  {sectionId:'film',webTitle:'Unrelated movie news',webUrl:'https://www.theguardian.com/film/unrelated'}
 ]}}});
 const {status,body}=await invoke('/api/insights/movie/550?media=1',{TMDB_API_KEY:'test',THE_GUARDIAN_API_KEY:'test'});
 assert.equal(status,200);assert.equal(body.sources.guardian,'ok');
 assert.equal(body.news.length,1);assert.equal(body.news[0].thumbnail,'https://media.guim.co.uk/test.jpg');
 assert.equal(body.news[0].summary.includes('<'),false);
});
test('TasteDive names cannot silently enter verified movie IDs',async()=>{
 stub({});
 const {status,body}=await invoke('/api/insights/movie/550?media=1',{TMDB_API_KEY:'test',TASTEDIVE_API_KEY:'test'});
 assert.equal(status,200);assert.equal(body.suggestions[0].title,'Another Movie');
 assert.equal(body.suggestions[0].verified,false);
 assert.equal(body.suggestions[0].tmdbId,undefined);
});

test('MyAnimeList v2 maps only exact MAL ID and preserves distinct rank/popularity',async()=>{
 stub({});
 const {status,body}=await invoke('/api/anime/mal/1',{MAL_CLIENT_ID:'test'});
 assert.equal(status,200);
 assert.equal(body.ok,true);assert.equal(body.malId,1);assert.equal(body.score,8.73);
 assert.equal(body.rank,43);assert.equal(body.popularity,21);
 assert.equal(body.ratingCount,865433);assert.deepEqual(body.studios,['Sunrise']);
 assert.equal(Object.hasOwn(body,'tmdbId'),false);
});
test('Missing MAL Client ID does not silently produce scores',async()=>{
 stub({});
 const {body}=await invoke('/api/anime/mal/1');
 assert.equal(body.status,'not_configured');assert.equal(body.score,undefined);
});

test('non-Discover panels do not spend YouTube or Guardian quota',async()=>{
 stub({});
 const {status,body}=await invoke('/api/insights/movie/550',{TMDB_API_KEY:'test',YOUTUBE_API_KEY:'test',THE_GUARDIAN_API_KEY:'test',TASTEDIVE_API_KEY:'test'});
 assert.equal(status,200);
 assert.equal(body.sources.youtube,'not_requested');
 assert.equal(body.sources.guardian,'not_requested');
 assert.equal(body.sources.tastedive,'not_requested');
 assert.deepEqual(body.trailers,[]);assert.deepEqual(body.news,[]);
});

test('on-demand Guardian film feed is separate and sanitizes article summary',async()=>{
 stub({guardian:{response:{status:'ok',results:[{
   webTitle:'Independent film spotlight',webUrl:'https://www.theguardian.com/film/film-spotlight',
   sectionName:'Film',webPublicationDate:'2026-10-28T11:30:00Z',
   fields:{trailText:'<p>New <b>film</b> coverage</p>',thumbnail:'https://media.guim.co.uk/still.jpg'}
 }]}}});
 const {status,body}=await invoke('/api/news/film',{THE_GUARDIAN_API_KEY:'test'});
 assert.equal(status,200);assert.equal(body.status,'ok');assert.equal(body.source,'The Guardian');
 assert.equal(body.articles.length,1);
 assert.equal(body.articles[0].summary,'New film coverage');
 assert.equal(body.articles[0].thumbnail,'https://media.guim.co.uk/still.jpg');
});
test('global film news absent credentials is explicitly unavailable',async()=>{
 stub({});
 const {body}=await invoke('/api/news/film');
 assert.equal(body.ok,true);assert.equal(body.status,'not_configured');assert.deepEqual(body.articles,[]);
});

test('Wikimedia facts require corroborating TMDB identity and retain uncertain box-office scope',async()=>{
 stub({});
 const fallback=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async input=>{
   const u=new URL(String(input));calls.push(u.hostname);
   if(u.hostname==='api.themoviedb.org')return json({id:550,title:'Fight Club',original_title:'Fight Club',
     imdb_id:'tt0137523',external_ids:{imdb_id:'tt0137523',wikidata_id:'Q123'},adult:false});
   if(u.hostname==='www.wikidata.org')return json({entities:{Q123:{
     id:'Q123',labels:{en:{value:'Fight Club'}},
     claims:{
       P4947:[{rank:'normal',mainsnak:{snaktype:'value',datavalue:{value:'550'}}}],
       P345:[{rank:'normal',mainsnak:{snaktype:'value',datavalue:{value:'tt0137523'}}}],
       P2142:[{rank:'normal',mainsnak:{snaktype:'value',datavalue:{value:{amount:'+10000000',unit:'http://www.wikidata.org/entity/Q4917'}}}}]
     },sitelinks:{enwiki:{title:'Fight Club (film)'}}
   }}});
   return fallback(input);
 };
 const plain=await invoke('/api/insights/movie/550?schema=8',{TMDB_API_KEY:'test'});
 assert.equal(plain.status,200);
 assert.equal(plain.body.wikidata.verified,false);
 assert.ok(!calls.includes('www.wikidata.org'),'Unrequested Wikimedia must not delay ordinary pages');
 const joined=await invoke('/api/insights/movie/550?schema=8&wiki=1',{TMDB_API_KEY:'test'});
 assert.equal(joined.status,200);
 assert.equal(joined.body.wikidata.verified,true);
 assert.equal(joined.body.wikipedia.language,'en');
 assert.equal(joined.body.wikidataBoxOffice.amount,10000000);
 assert.equal(joined.body.wikidataBoxOffice.scope,'unspecified');
 assert.equal(joined.body.sources.wikimedia,'ok');
});
test('a conflicting Wikidata external ID is never presented as verified',async()=>{
 stub({});
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='api.themoviedb.org')return json({id:550,title:'Fight Club',adult:false,
    imdb_id:'tt0137523',external_ids:{imdb_id:'tt0137523',wikidata_id:'Q123'}});
  if(u.hostname==='www.wikidata.org')return json({entities:{Q123:{id:'Q123',claims:{
    P4947:[{rank:'normal',mainsnak:{snaktype:'value',datavalue:{value:'999'}}}]
  }}}});
  return original(input);
 };
 const x=await invoke('/api/insights/movie/550?schema=8&wiki=1',{TMDB_API_KEY:'test'});
 assert.equal(x.status,200);
 assert.equal(x.body.wikidata.verified,false);
 assert.equal(x.body.wikidataBoxOffice,undefined);
 assert.equal(x.body.sources.wikimedia,'no_data');
});

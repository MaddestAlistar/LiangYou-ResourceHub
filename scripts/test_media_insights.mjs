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
 stub({movie:{
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

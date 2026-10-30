// JustWatch availability via official TMDB endpoints. No browser API credentials.
const regionCodes=new Set(["US","GB","CA","AU","JP","KR","DE","FR","IT","ES","NL","BR","IN","HK","TW","SG","TH","MY","PH","CN","NZ"]);
const ttl=21600;
const cors="https://maddestalistar.github.io";
function reply(payload,status=200,seconds=0){
 return new Response(JSON.stringify(payload),{status,headers:{
  "content-type":"application/json; charset=utf-8","access-control-allow-origin":cors,
  "cache-control":seconds?"public,max-age="+seconds:"no-store",
  "x-content-type-options":"nosniff","vary":"Origin"
 }});
}
const simplify=rows=>Array.isArray(rows)?rows.filter(x=>x&&typeof x.provider_name==="string"&&Number.isSafeInteger(x.provider_id)).slice(0,35).map(p=>({
 id:p.provider_id,name:p.provider_name,logo:p.logo_path&&/^\/[\w/.]+$/.test(p.logo_path)?"https://image.tmdb.org/t/p/w92"+p.logo_path:null
})): [];

const numericId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0&&Number(v)<1e10;
async function jsonRemote(uri,opts={},timeout=8500){
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout);
 try{const r=await fetch(uri,{...opts,signal:ac.signal});if(!r.ok)throw Error("upstream_"+r.status);return await r.json();}
 finally{clearTimeout(timer);}
}
function safeHttps(v,host){
 try{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password&&(!host||u.hostname===host||u.hostname.endsWith("."+host))?u.href:null;}catch{return null;}
}
async function tmdbInfo(kind,id,env,withMedia=false,language="en-US",withReviews=false){
 const token=env.TMDB_READ_ACCESS_TOKEN?.trim(),api=env.TMDB_API_KEY?.trim();
 if(!token&&!api)throw Error("TMDB credential missing");
 const u=new URL("https://api.themoviedb.org/3/"+kind+"/"+id);
 u.searchParams.set("append_to_response","external_ids,keywords,"+(kind==="movie"?"release_dates":"content_ratings")+(withMedia?",videos,alternative_titles,credits,translations":"")+(withReviews?",reviews":""));u.searchParams.set("language",language);
 if(withMedia)u.searchParams.set("include_video_language","en,zh,ja,ko,null");
 if(!token)u.searchParams.set("api_key",api);
 const x=await jsonRemote(u.toString(),{headers:token?{Authorization:"Bearer "+token}:{}});
 if(Number(x.id)!==Number(id)||x.adult||!String(x.title||x.name||"").trim())throw Error("TMDB identity mismatch");
 return x;
}
// Source-only editorial metadata: neither infer age suitability nor invent warnings.
function classificationFor(title,kind){
 const uniq=list=>[...new Set((Array.isArray(list)?list:[]).filter(x=>typeof x==="string"&&x.trim().length>=2&&x.trim().length<=28).map(x=>x.trim()))];
 const genres=uniq((title.genres||[]).map(g=>g?.name)).slice(0,6);
 const raw=title.keywords?.keywords||title.keywords?.results||[];
 const keywords=uniq(raw.map(k=>k?.name)).filter(x=>!/[<>{}\u0000-\u001f]/.test(x)).slice(0,6);
 const allowed=["CN","HK","TW","US","GB","AU","SG","JP","KR"];
 const invalid=new Set(["","NR","N/R","N/A","NA","NOT RATED","UNRATED","NONE","TBC","TBD","0"]);
 const valid=x=>{
  const v=String(x||"").trim().toUpperCase();
  return !invalid.has(v)&&/^[A-Z0-9+ /-]{1,14}$/.test(v)?v:"";
 };
 let parental_rating=null;
 if(kind==="movie"){
  const entries=title.release_dates?.results||[];
  for(const country of allowed){
   const dates=entries.find(g=>g.iso_3166_1===country)?.release_dates||[];
   const theatrical=[...new Set(dates.filter(x=>x?.type===2||x?.type===3).map(x=>valid(x.certification)).filter(Boolean))];
   const all=[...new Set(dates.map(x=>valid(x?.certification)).filter(Boolean))];
   const ratings=theatrical.length?theatrical:all;
   if(ratings.length===1){parental_rating={country,rating:ratings[0],source:"TMDB"};break;}
  }
 }else{
  for(const country of allowed){
   const ratings=[...new Set((title.content_ratings?.results||[]).filter(x=>x?.iso_3166_1===country).map(x=>valid(x.rating)).filter(Boolean))];
   if(ratings.length===1){parental_rating={country,rating:ratings[0],source:"TMDB"};break;}
  }
 }
 return {genres,keywords,parental_rating};
}
// Wikimedia records are optional background facts. A TMDB Wikidata ID alone is
// not sufficient: cross-check the entity's TMDB or IMDb statement before displaying.
async function verifiedWikimedia(qid,kind,id,imdb){
 if(!/^Q[1-9]\d{0,11}$/.test(String(qid||"")))return null;
 const endpoint="https://www.wikidata.org/wiki/Special:EntityData/"+qid+".json";
 let payload=null;
 try{
   payload=await jsonRemote(endpoint,{headers:{"User-Agent":"LiangYouResourceHub/1.0 (public film metadata verification)"}},5000);
 }catch{
   // Use Wikimedia's documented Action API when the JSON entity export is blocked.
   const api=new URL("https://www.wikidata.org/w/api.php");
   api.searchParams.set("action","wbgetentities");
   api.searchParams.set("ids",qid);
   api.searchParams.set("props","claims|labels|sitelinks");
   api.searchParams.set("format","json");
   api.searchParams.set("formatversion","2");
   payload=await jsonRemote(api.toString(),{headers:{"User-Agent":"LiangYouResourceHub/1.0 (public film metadata verification)"}},4500);
 }
 const entry=payload.entities?.[qid];
 if(!entry||entry.id!==qid||entry.missing!==undefined)return null;
 const claims=entry.claims||{};
 const statements=key=>(claims[key]||[]).filter(x=>x?.rank!=="deprecated"&&x?.mainsnak?.snaktype==="value");
 const values=key=>statements(key).map(x=>String(x?.mainsnak?.datavalue?.value||""));
 const tmdbProperty=kind==="movie"?"P4947":"P4983";
 const ids=values(tmdbProperty);
 const imdbIds=values("P345");
 if(ids.length&&!ids.includes(String(id)))return null;
 if(imdb&&imdbIds.length&&!imdbIds.includes(imdb))return null;
 if(!ids.length&&(!imdb||!imdbIds.includes(imdb)))return null;
 const page=entry.sitelinks?.zhwiki||entry.sitelinks?.enwiki;
 const lang=entry.sitelinks?.zhwiki?"zh":"en";
 const wikipedia=page?.title&&page.title.length<180?{
   title:page.title,language:lang,
   url:"https://"+lang+".wikipedia.org/wiki/"+encodeURIComponent(page.title.replace(/ /g,"_"))
 }:null;
 let boxOffice=null;
 if(kind==="movie"){
   const gross=statements("P2142").map(x=>{
     const v=x.mainsnak?.datavalue?.value;
     if(!v||typeof v.amount!=="string"||!Number.isFinite(Number(v.amount))||Number(v.amount)<=0)return null;
     // Q4917 = USD. Never convert or combine other currency units.
     if(v.unit!=="http://www.wikidata.org/entity/Q4917")return null;
     return {amount:Number(v.amount),currency:"USD",source:"Wikidata",
       sourceUrl:"https://www.wikidata.org/wiki/"+qid,scope:"unspecified"};
   }).filter(Boolean);
   if(gross.length===1)boxOffice=gross[0];
 }
 return {id:qid,url:"https://www.wikidata.org/wiki/"+qid,
   label:String(entry.labels?.zh?.value||entry.labels?.en?.value||"").slice(0,90),
   verified:true,wikipedia,boxOffice};
}
async function mediaInsights(kind,id,env,withMedia=false,withWiki=false){
 const title=await tmdbInfo(kind,id,env,withMedia), ext=title.external_ids||{};
 const imdb=/^tt\d{5,12}$/.test(title.imdb_id||ext.imdb_id||"")?(title.imdb_id||ext.imdb_id):null;
 const tvdb=kind==="tv"&&numericId(ext.tvdb_id)?Number(ext.tvdb_id):null;
 const wikidata=/^Q[1-9]\d{0,11}$/.test(ext.wikidata_id||"")?ext.wikidata_id:null;
 const result={ok:true,kind,tmdbId:Number(id),imdbId:imdb,tvdbId:tvdb,wikidataId:wikidata,
   originalTitle:title.original_title||title.original_name||"",title:title.title||title.name,releaseDate:title.release_date||title.first_air_date||"",
   classification:classificationFor(title,kind),
   checkedAt:new Date().toISOString(),sources:{},artwork:[],tvdb:null,wikidata:null,boxOffice:null,news:[],trailers:[],relatedVideos:[],suggestions:[],financials:kind==="movie"?{revenueUSD:Number.isFinite(title.revenue)&&title.revenue>0?title.revenue:null,budgetUSD:Number.isFinite(title.budget)&&title.budget>0?title.budget:null,source:"TMDB",region:"not_specified"}:null};
 // Read verified regional alternative titles from the SAME TMDB-ID response.
 // This improves headline matching without any new API key or independent fuzzy ID merge.
 const relevantCountries=new Set(["CN","HK","TW","US","GB","AU","JP","KR","SG"]);
 const aliases=title.alternative_titles?.titles||title.alternative_titles?.results||[];
 const aliasRows=Array.isArray(aliases)?aliases:[];
 const regional=(title.translations?.translations||[]).filter(v=>
    ["zh","ja","ko","en"].includes(v.iso_639_1)&&
    ["CN","HK","TW","US","GB","JP","KR","SG"].includes(String(v.iso_3166_1||"").toUpperCase()));
 result.aliases=[...new Set([
    ...aliasRows.filter(v=>relevantCountries.has(String(v.iso_3166_1||"").toUpperCase())).map(v=>v.title||v.name||""),
    ...regional.map(v=>v.data?.title||v.data?.name||""),
    title.title||title.name||"",title.original_title||title.original_name||""
   ].map(v=>String(v).normalize("NFKC").trim())
   .filter(v=>v.length>=2&&v.length<=100&&!/^(?:untitled|未定名|无标题)$/i.test(v)))].slice(0,45);
 const keyYouTube=(env.YOUTUBE_API_KEY||env.YOUTUBE_DATA_API_KEY||env.YOUTUBE_DATA_API_V3_KEY||"").trim();
 const tmdbTrailerRows=(title.videos?.results||[]).filter(v=>v.site==="YouTube"&&
   ["Trailer","Teaser","Clip","Featurette"].includes(v.type)&&/^[A-Za-z0-9_-]{11}$/.test(v.key)&&
   !/full\s*(?:movie|film|episode)|entire\s*(?:movie|film)|完整版|全集|网盘|资源下载/i.test(v.name||""));
 const seenIds=new Set();
 // Prefer authenticated public trailers, then other TMDB-ID-linked trailers.
 // Unofficial clips are labeled as such; they never inherit an "official" badge.
 tmdbTrailerRows.sort((a,b)=>Number(b.official===true)-Number(a.official===true)||
   Number(b.type==="Trailer")-Number(a.type==="Trailer")||
   Number(b.type==="Teaser")-Number(a.type==="Teaser"));
 result.trailers=tmdbTrailerRows.filter(v=>{if(seenIds.has(v.key))return false;seenIds.add(v.key);return true;})
   .slice(0,12).map(v=>({id:v.key,title:String(v.name||"Trailer").slice(0,140),
     type:v.type,language:v.iso_639_1||"",channel:"",publishedAt:v.published_at||null,
     verifiedBy:"TMDB",official:v.official===true,embeddable:null,
     thumbnail:"https://i.ytimg.com/vi/"+v.key+"/hqdefault.jpg",
     url:"https://www.youtube.com/watch?v="+v.key}));
 const jobs=[];
 const task=(name,fn)=>jobs.push((async()=>{try{const x=await fn();result.sources[name]=x?"ok":"no_data";}catch{result.sources[name]="unavailable";}})());
 // Existing official TMDB video IDs are authoritative. YouTube supplies playback metadata.
 // A low-frequency search is used only if TMDB has no official video; it stays explicitly unverified.
 if(keyYouTube&&withMedia){
  task("youtube",async()=>{
   if(!result.trailers.length){
    const search=new URL("https://www.googleapis.com/youtube/v3/search");
    const year=String(title.release_date||title.first_air_date||"").slice(0,4);
    search.searchParams.set("key",keyYouTube);
    search.searchParams.set("part","snippet");
    search.searchParams.set("q",String(title.original_title||title.original_name||title.title||title.name||"").slice(0,75)+" "+year+" official trailer");
    search.searchParams.set("type","video");search.searchParams.set("maxResults","3");search.searchParams.set("videoEmbeddable","true");
    try{
     const found=await jsonRemote(search.toString(),{},7000);
     const seen=new Set();
     result.trailers=(found.items||[]).filter(v=>/^[A-Za-z0-9_-]{11}$/.test(v.id?.videoId||"")&&!seen.has(v.id.videoId)&&seen.add(v.id.videoId))
       .slice(0,2).map(v=>({id:v.id.videoId,title:String(v.snippet?.title||"Trailer candidate").slice(0,140),
        type:"Search",language:"",channel:String(v.snippet?.channelTitle||"").slice(0,70),
        publishedAt:v.snippet?.publishedAt||null,verifiedBy:"YouTube search",official:false,embeddable:null,
        thumbnail:"https://i.ytimg.com/vi/"+v.id.videoId+"/hqdefault.jpg",
        url:"https://www.youtube.com/watch?v="+v.id.videoId}));
    }catch{}
   }
   if(!result.trailers.length)return null;
   const u=new URL("https://www.googleapis.com/youtube/v3/videos");
   u.searchParams.set("key",keyYouTube);u.searchParams.set("part","snippet,contentDetails,status,statistics");
   u.searchParams.set("id",result.trailers.map(v=>v.id).join(","));
   const data=await jsonRemote(u.toString(),{},7500);
   const found=new Map((data.items||[]).map(v=>[v.id,v]));
   result.trailers=result.trailers.filter(v=>{
      const meta=found.get(v.id);
      if(!meta||meta.status?.privacyStatus!=="public")return false;
      v.embeddable=meta.status?.embeddable===true;
      v.ageRestricted=meta.contentDetails?.contentRating?.ytRating==="ytAgeRestricted";
      v.channel=String(meta.snippet?.channelTitle||v.channel||"").slice(0,90);
      v.title=String(meta.snippet?.title||v.title||"").slice(0,150);
      v.publishedAt=meta.snippet?.publishedAt||v.publishedAt;
      v.duration=String(meta.contentDetails?.duration||"").slice(0,35);
      v.views=/^\d+$/.test(String(meta.statistics?.viewCount||""))?Number(meta.statistics.viewCount):null;
      return true;
   });
   // Prefer verified public videos that YouTube says can play without age verification.
   // Age-gated and embed-disabled videos remain as clearly labeled source links.
   result.trailers.sort((a,b)=>Number(a.embeddable!==true||a.ageRestricted===true)-Number(b.embeddable!==true||b.ageRestricted===true));
   return result.trailers.length>0;
  });
 }else result.sources.youtube=!withMedia?"not_requested":result.trailers.length?"tmdb_video_links":"not_configured";
 // Optional verified related clips: a single cached search per title, plus one low-cost
 // videos.list request for real public like counts. No guessed engagement numbers.
 if(keyYouTube&&withMedia){
  task("youtubeRelated",async()=>{
   const titleName=String(title.original_title||title.original_name||title.title||title.name||"").normalize("NFKC").trim();
   const releaseYear=String(title.release_date||title.first_air_date||"").slice(0,4);
   if(titleName.length<4||titleName.length>90||!/^(?:19|20)\d{2}$/.test(releaseYear))return null;
   // Discover English/original-name videos first, then try a verified
   // regional Chinese/Japanese/Korean title if fewer than four related videos
   // survive the public metadata checks. At most two YouTube searches/title.
   const lookupIds=async (term)=>{
    const search=new URL("https://www.googleapis.com/youtube/v3/search");
    search.searchParams.set("key",keyYouTube);search.searchParams.set("part","snippet");
    search.searchParams.set("q",term);
    search.searchParams.set("type","video");search.searchParams.set("maxResults","25");
    search.searchParams.set("videoEmbeddable","true");search.searchParams.set("safeSearch","moderate");
    const feed=await jsonRemote(search.toString(),{},7500);
    return [...new Set((feed.items||[]).map(v=>v.id?.videoId)
      .filter(v=>/^[A-Za-z0-9_-]{11}$/.test(v)))].slice(0,25);
   };
   const lookupDetails=async ids=>{
    if(!ids.length)return [];
    const lookup=new URL("https://www.googleapis.com/youtube/v3/videos");
    lookup.searchParams.set("key",keyYouTube);lookup.searchParams.set("part","snippet,contentDetails,status,statistics");
    lookup.searchParams.set("id",ids.join(","));
    const response=await jsonRemote(lookup.toString(),{},7500);
    return Array.isArray(response.items)?response.items:[];
   };
   const firstTerm=titleName+" "+releaseYear+" "+(kind==="movie"?"movie":"TV series");
   const firstIds=await lookupIds(firstTerm);
   const firstDetails=await lookupDetails(firstIds);
   const norm=x=>" "+String(x||"").normalize("NFKC").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g," ").trim()+" ";
   // Accept only verified TMDB regional aliases of the SAME title ID, never
   // loosely related actors, franchises or short ambiguous search terms.
   const matchingNames=[titleName,...result.aliases].map(v=>norm(v).trim()).filter(v=>{
     const compact=v.replace(/ /g,"");
     return compact.length>=4&&compact.length<=90;
   });
   const uniqueNames=[...new Set(matchingNames)];
   const banned=/full\s*(?:movie|film|episode)|entire\s*(?:movie|film)|watch\s*(?:movie|film)\s*online|完整版|全集|免费观影/i;
   const already=new Set(result.trailers.map(v=>v.id));
   const people=[...(title.credits?.crew||[]).filter(v=>v.job==="Director").slice(0,2),
     ...(title.credits?.cast||[]).slice(0,3)].map(v=>norm(v.name||"").trim())
     .filter(v=>v.length>=5);
   const isFilmContext=/\b(film|movie|trailer|review|scene|interview|director|cinema|behind|actor|cast|teaser|drama|series|episode)\b|电影|电视剧|影评|预告|演员|幕后|剧情|花絮|剧集|影视|片段|映画|予告|영화|드라마/i;
   const verifyCandidates=rows=>rows.filter(v=>{
    const id=String(v.id||""),heading=String(v.snippet?.title||""),label=norm(heading);
    if(already.has(id)||v.status?.privacyStatus!=="public"||v.status?.embeddable!==true||
       v.contentDetails?.contentRating?.ytRating==="ytAgeRestricted"||banned.test(heading))return false;
    const matchedName=uniqueNames.find(name=>label.includes(" "+name+" "));
    if(!matchedName)return false;
    // A correct title is not enough for remakes or one-word names: the video
    // might belong to a different edition, a song, or an unrelated hobby.
    const compact=matchedName.replace(/ /g,"");
    const release=Number(releaseYear),stated=[...heading.matchAll(/\b(?:19|20)\d{2}\b/g)].map(v=>Number(v[0]));
    const edition=/live[\s-]?action|remake|reboot|真人版|真人电影|重启|翻拍/i.test(heading);
    const person=people.some(name=>label.includes(" "+name+" "));
    const promotional=/\b(teaser|trailer|first look|coming soon)\b|预告|先导|首曝|定档|予告/i.test(heading);
    const earlierPromo=promotional&&stated.length>0&&stated.every(y=>y>=release-2&&y<release);
    const laterSeason=kind==="tv"&&stated.every(y=>y>=release&&y<=new Date().getUTCFullYear()+1)&&
      /\b(season|episode)\b|新一季|新季|第.{0,3}季|第.{0,3}集|시즌|シーズン/i.test(heading);
    if(stated.length&&stated.some(y=>Math.abs(y-release)>1)&&
       !edition&&!person&&!earlierPromo&&!laterSeason)return false;
    const asian=/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(matchedName);
    const ambiguous=!matchedName.includes(" ")&&(asian?compact.length<4:compact.length<=11);
    if(ambiguous&&!(heading.includes(releaseYear)||edition&&isFilmContext.test(heading)||
       person&&isFilmContext.test(heading)||earlierPromo))return false;
    if(compact.length<=6&&!isFilmContext.test(heading)&&!heading.includes(releaseYear))return false;
    // Hide unknown engagement instead of dropping a valid, playable film video.
    return !v.statistics?.likeCount||Number.isSafeInteger(Number(v.statistics.likeCount))&&Number(v.statistics.likeCount)>=0;
   }).map(v=>({
    id:v.id,title:String(v.snippet.title).slice(0,150),channel:String(v.snippet.channelTitle||"").slice(0,90),
    verifiedBy:"YouTube title/year search + public metadata",type:"Related",official:false,
    embeddable:true,ageRestricted:false,likes:/^\d+$/.test(String(v.statistics?.likeCount||""))?Number(v.statistics.likeCount):null,
    views:/^\d+$/.test(String(v.statistics?.viewCount||""))?Number(v.statistics.viewCount):null,
    duration:String(v.contentDetails?.duration||"").slice(0,35),
    thumbnail:"https://i.ytimg.com/vi/"+v.id+"/hqdefault.jpg",
    url:"https://www.youtube.com/watch?v="+v.id
   }));
   let matched=verifyCandidates(firstDetails);
   const regional=result.aliases.find(v=>/[\u3400-\u9fff\uac00-\ud7af]/.test(v)&&
     v.length>=4&&v.length<=65&&v!==titleName);
   if(matched.length<4&&regional){
    try{
     const ids=(await lookupIds(regional+" "+releaseYear+" "+(kind==="movie"?"电影 预告 影评":"剧集 预告 花絮")))
       .filter(id=>!firstIds.includes(id));
     const more=verifyCandidates(await lookupDetails(ids));
     matched=[...matched,...more];
    }catch{/* The optional second query never hides first-source results. */}
   }
   matched.sort((a,b)=>(Number(b.likes)||0)-(Number(a.likes)||0)||
     (Number(b.views)||0)-(Number(a.views)||0));
   result.relatedVideos=matched.slice(0,16);
   return result.relatedVideos.length>0;
  });
 }else result.sources.youtubeRelated=!withMedia?"not_requested":"not_configured";
 if(wikidata){
  result.wikidata={id:wikidata,url:"https://www.wikidata.org/wiki/"+wikidata,label:"",verified:false};
  result.sources.wikidata="linked_via_tmdb";
  if(withWiki)task("wikimedia",async()=>{
    const item=await verifiedWikimedia(wikidata,kind,id,imdb);
    if(!item)return false;
    result.wikidata=item;
    result.wikipedia=item.wikipedia||null;
    result.wikidataBoxOffice=item.boxOffice||null;
    return true;
  });
 }else result.sources.wikidata="identity_missing";
 if(env.FANARTTV_API_KEY||env.FANART_TV_API_KEY){
  task("fanart",async()=>{
   const key=env.FANARTTV_API_KEY||env.FANART_TV_API_KEY,reference=kind==="movie"?id:tvdb;
   if(!reference){result.sources.fanart="identity_missing";return null;}
   const endpoint="https://webservice.fanart.tv/v3.2/"+(kind==="movie"?"movies/":"tv/")+reference;
   const d=await jsonRemote(endpoint,{headers:{"api-key":key}});
   if(kind==="movie"&&d.tmdb_id&&Number(d.tmdb_id)!==Number(id))return null;
   const props=kind==="movie"?["moviebackground","moviethumb","movieposter"]:["showbackground","tvthumb","tvposter"];
   result.artwork=props.flatMap(p=>(d[p]||[]).slice(0,2).map(a=>({type:p,url:safeHttps(a.url,"fanart.tv"),language:a.lang||null,source:"Fanart.tv"}))).filter(x=>x.url).slice(0,4);
   return result.artwork.length>0;
  });
 }else result.sources.fanart="not_configured";
 if(tvdb&&(env.THETVDB_API_KEY||env.TVDB_API_KEY)){
  task("thetvdb",async()=>{
   const login=await jsonRemote("https://api4.thetvdb.com/v4/login",
     {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
       apikey:env.THETVDB_API_KEY||env.TVDB_API_KEY,...(env.THETVDB_PIN?{pin:env.THETVDB_PIN}:{})})});
   const token=login.data?.token;if(!token)return null;
   const d=await jsonRemote("https://api4.thetvdb.com/v4/series/"+tvdb+"/extended",
     {headers:{Authorization:"Bearer "+token}},8500);
   if(Number(d.data?.id)!==tvdb)return null;
   result.tvdb={id:tvdb,url:"https://thetvdb.com/dereferrer/series/"+tvdb,
     name:d.data.name||"",firstAired:d.data.firstAired||"",status:d.data.status?.name||"",
     seasons:Array.isArray(d.data.seasons)?d.data.seasons.filter(s=>s.number>0).length:null,
     summary:String(d.data.overview||"").slice(0,400)};
   return true;
  });
 }else result.sources.thetvdb=tvdb?"not_configured":"identity_missing";
 if(imdb&&(env.OMDB_API_KEY||env.OMDB_KEY)&&kind==="movie"){
  task("omdb",async()=>{
   const endpoint=new URL("https://www.omdbapi.com/");endpoint.searchParams.set("i",imdb);
   endpoint.searchParams.set("apikey",env.OMDB_API_KEY||env.OMDB_KEY);
   const d=await jsonRemote(endpoint);
   if(d.Response!=="True"||d.imdbID!==imdb)return null;
   if(/^\$[\d,]+$/.test(d.BoxOffice||""))result.boxOffice={label:"US domestic box office",amount:d.BoxOffice,source:"OMDb",sourceUrl:"https://www.imdb.com/title/"+imdb+"/"};
   return !!result.boxOffice;
  });
 }else result.sources.omdb=kind==="movie"?"not_configured":"not_applicable";
 const q=title.original_title||title.original_name||title.title||title.name||"";
 if(withMedia&&env.THE_GUARDIAN_API_KEY&&q.length>=5&&q.length<=90){
  task("guardian",async()=>{
   const endpoint=new URL("https://content.guardianapis.com/search");
   endpoint.searchParams.set("api-key",env.THE_GUARDIAN_API_KEY);
   endpoint.searchParams.set("q",'"'+q.replace(/"/g,"")+'"');
   endpoint.searchParams.set("page-size","8");
   endpoint.searchParams.set("order-by","newest");
   endpoint.searchParams.set("show-fields","thumbnail,trailText,byline");
   const d=await jsonRemote(endpoint.toString());
   if(d.response?.status!=="ok")return null;
   const normalized=s=>String(s||"").normalize("NFKC").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g," ").trim();
   const query=normalized(q),tokens=query.split(" ").filter(Boolean);
   result.news=(d.response.results||[]).filter(x=>x.webUrl&&x.webTitle)
     .filter(x=>x.sectionId==="film"||x.sectionId==="tv-and-radio"||x.sectionId==="culture"||x.sectionId==="media")
     .filter(x=>{
       const heading=normalized(x.webTitle+" "+(x.fields?.trailText||"").replace(/<[^>]+>/g," "));
       return query.length>=6&&heading.includes(query)||tokens.length>=2&&tokens.every(t=>t.length<3||heading.includes(t));
     }).slice(0,4).map(x=>({
       title:String(x.webTitle).slice(0,180),url:safeHttps(x.webUrl,"theguardian.com"),date:x.webPublicationDate,
       source:"The Guardian",section:String(x.sectionName||"").slice(0,45),byline:String(x.fields?.byline||"").slice(0,90),
       summary:String(x.fields?.trailText||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,210),
       thumbnail:safeHttps(x.fields?.thumbnail,"guim.co.uk")||null,
       matchType:"title_search"
     })).filter(x=>x.url);
   return result.news.length>0;
  });
 }else result.sources.guardian=!withMedia?"not_requested":env.THE_GUARDIAN_API_KEY?"not_applicable":"not_configured";
 // Optional TasteDive results are name-only discovery leads, never merged with a TMDB identity.
 if(withMedia&&env.TASTEDIVE_API_KEY&&q.length>=5&&q.length<=100){
  task("tastedive",async()=>{
   const endpoint=new URL("https://tastedive.com/api/similar");
   endpoint.searchParams.set("k",env.TASTEDIVE_API_KEY);
   endpoint.searchParams.set("q",q);
   endpoint.searchParams.set("type",kind==="movie"?"movie":"show");
   endpoint.searchParams.set("limit","5");
   const d=await jsonRemote(endpoint.toString(),{},2000);
   const rows=d.Similar?.Results||d.similar?.results||[];
   if(!Array.isArray(rows))return null;
   result.suggestions=rows.filter(x=>typeof x.Name==="string"||typeof x.name==="string")
     .slice(0,5).map(x=>({title:String(x.Name||x.name).slice(0,90),type:String(x.Type||x.type||"").slice(0,25),source:"TasteDive",verified:false}));
   return result.suggestions.length>0;
  });
 }else result.sources.tastedive=!withMedia?"not_requested":"not_configured";

 await Promise.all(jobs);
 return result;
}
// Title-scoped RSS discovery is supplemental to human-verified ID-linked articles.
// A long-tail title is queried by verified TMDB aliases, not by popular/general headlines.
const normalizedHeadline=v=>String(v||"").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
function rssDecoded(value){
 return String(value||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
   .replace(/&#(x[0-9a-f]+|\d+);|&(amp|quot|apos|lt|gt);/gi,(_,num,named)=>{
     if(num){const n=num[0].toLowerCase()==="x"?parseInt(num.slice(1),16):parseInt(num,10);
       return n>0&&n<0x110000&&!(n>=0xD800&&n<=0xDFFF)?String.fromCodePoint(n):"";}
     return ({amp:"&",quot:'"',apos:"'",lt:"<",gt:">"})[named.toLowerCase()]||"";
   }).replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
}
function rssField(xml,tag){
 const re=new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+tag+">","i");
 return rssDecoded(re.exec(xml)?.[1]||"");
}
function rssArticleMatches(headline,alias,context={}){
 const name=normalizedHeadline(alias),text=normalizedHeadline(headline);
 if(!name||!text)return false;
 const tight=name.replace(/ /g,""),asian=/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(name);
 const quoted=["《"+alias+"》","“"+alias+"”","「"+alias+"」","『"+alias+"』",'"'+alias+'"',"'"+alias+"'"].some(v=>
   headline.toLowerCase().includes(v.toLowerCase()));
 const exists=asian?text.replace(/ /g,"").includes(tight):(" "+text+" ").includes(" "+name+" ");
 if(!exists)return false;
 if(wrongTitleEdition(headline,alias,context.year))return false;
 const distinctive=asian?tight.length>=6:name.length>=12&&name.includes(" ");
 const year=String(context.year||""),oldYear=String(Number(context.year||0)-10);
 const hasYear=year.length===4&&headline.includes(year);
 const isRemake=/live[\s-]?action|真人[版电影]|真人化|重制|翻拍|remake/i.test(headline);
 const filmContext=/\b(movie|film|cinema|box[\s-]?office|trailer|review|interview|premiere|anniversary|director|horror|actor|actress|theater|screening|disney|feature|series|season|episode|television)\b|电影|恐怖片|影评|预告|访谈|专访|周年|首映|导演|演员|院线|票房|影片|上映|真人版|剧集|电视剧|剧评|新季|映画|監督|レビュー|予告|영화|드라마|예고|리뷰/i.test(headline);
 const person=(Array.isArray(context.people)?context.people:[]).some(p=>p.length>=5&&
   normalizedHeadline(headline).includes(normalizedHeadline(p)));
 // Remakes and homonymous films need edition-aware checks *before*
 // accepting any title length, even distinctive multiword names.
 const statedYears=[...headline.matchAll(/\b(?:19|20)\d{2}\b/g)].map(x=>Number(x[0]));
 const releaseYear=Number(year);
 if(Number.isInteger(releaseYear)&&releaseYear>1900&&
    statedYears.some(y=>y<=releaseYear-3)&&!hasYear&&!isRemake&&!person)return false;
 if(oldYear.length===4&&headline.includes(oldYear)&&!hasYear&&!isRemake&&!person)return false;
 // A truncated Chinese title is ambiguous even when a quoted phrase matches.
 if(context.requireEdition===true)return filmContext&&(hasYear||isRemake||person);
 if(distinctive)return true;
 if(asian&&tight.length<4)return (quoted&&filmContext)||hasYear&&filmContext||person&&filmContext;
 if(!asian&&!name.includes(" "))return hasYear&&filmContext||isRemake&&filmContext||
   person&&filmContext||quoted&&filmContext||
   // The Guardian film section can safely supply distinctive title-led reviews
   // even when headlines omit a year or cast member.
   context.editorialFilm===true&&name.length>=5&&
     /\b(review|trailer|movie|film|interview|director)\b/i.test(headline)&&
     text.startsWith(name+" ");
 // Distinctive two-word film titles such as "Fight Club" can be verified
 // by a film-specific context even when the headline omits the release year.
 if(!asian&&name.includes(" ")&&name.length>=8&&filmContext)return true;
 return quoted||hasYear&&filmContext||person&&filmContext;
}
function wrongTitleEdition(line,alias,year){
 const escape=v=>v.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
 const title=escape(String(alias||"").normalize("NFKC"));
 if(!title)return false;
 // "Dune 2" must not be accepted for "Dune"; an explicit title (year)
 // describes the work's edition rather than the article's publication date.
 const suffix=new RegExp(title+"\\s*(?:[：:]\\s*)?(?:[2-9](?![0-9])|II\\b|III\\b|IV\\b|第二部|第三部)","i");
 if(suffix.test(String(line).normalize("NFKC"))&&!/[2-9]$|\b(?:II|III|IV)$/.test(alias))return true;
 const dated=new RegExp(title+"[》\"']?\\s*[（(]((?:19|20)\\d{2})[）)]","i").exec(line);
 return !!dated&&Number(year)>1900&&Math.abs(Number(dated[1])-Number(year))>1;
}
export function articleRelevance(title,summary,aliases,context={}){
 const names=(Array.isArray(aliases)?aliases:[]).filter(v=>typeof v==="string"&&v.length>=2);
 const heading=String(title||""),description=String(summary||"").slice(0,500);
 const direct=names.some(alias=>rssArticleMatches(heading,alias,context));
 const relevantSummary=names.some(alias=>!wrongTitleEdition(heading+" "+description,alias,context.year)&&
   rssArticleMatches(description,alias,context));
 const movieHeadline=/电影|影片|影评|票房|导演|预告|演员|剧集|电视剧|首映|\b(film|movie|review|director|trailer|cast|box office|series|season|cinema)\b/i.test(heading);
 if(!direct&&!(relevantSummary&&movieHeadline))return 0;
 const combined=normalizedHeadline(heading+" "+description);
 const people=(context.people||[]).some(p=>normalizedHeadline(p).length>=3&&combined.includes(normalizedHeadline(p)));
 return (direct?100:65)+(people?25:0)+(context.year&&combined.includes(String(context.year))?15:0);
}
export async function titleNews(kind,id,env){
 // Fetch both language records concurrently: waiting for them sequentially
 // regularly consumed the entire browser deadline on slower overseas networks.
 const [item,possibleLocal]=await Promise.all([
  tmdbInfo(kind,id,env,true,"en-US",true),
  tmdbInfo(kind,id,env,true,"zh-CN",true).catch(()=>null)
 ]);
 const local=Number(possibleLocal?.id)===Number(id)?possibleLocal:null;
 const release=String(item.release_date||item.first_air_date||local?.release_date||local?.first_air_date||"");
 const year=release.slice(0,4);
 const original=String(item.original_title||item.original_name||"").trim();
 const localized=String(local?.title||local?.name||"").trim();
 const names=[original,String(item.title||item.name||"").trim(),localized];
 const alt=[...(item.alternative_titles?.titles||item.alternative_titles?.results||[]),
  ...(local?.alternative_titles?.titles||local?.alternative_titles?.results||[])];
 names.push(...alt.filter(v=>["CN","HK","TW","US","GB","KR","JP"].includes(v.iso_3166_1))
   .map(v=>String(v.title||v.name||"").trim()));
 // TMDB translations differ from alternate titles. Search all films with their
 // ID-bound Chinese, Cantonese, Japanese and Korean localized names as well.
 const translations=[...(item.translations?.translations||[]),...(local?.translations?.translations||[])];
 names.push(...translations.filter(v=>["zh","ja","ko","en"].includes(v.iso_639_1)&&
   ["CN","HK","TW","US","GB","JP","KR","SG"].includes(v.iso_3166_1))
   .map(v=>String(v.data?.title||v.data?.name||"").trim()));
 // Some TMDB records do not have a Chinese translation or alternative name.
 // Wikidata can supply one, but ONLY if its entity verifies the same TMDB/IMDb ID.
 // Do not perform a fuzzy Wikidata search for an arbitrary title string.
 let wikidataChinese="";
 if(!names.some(v=>/[\u3400-\u9fff]/.test(v))){
  const qid=String(item.external_ids?.wikidata_id||"");
  const imdb=String(item.external_ids?.imdb_id||item.imdb_id||"");
  if(/^Q[1-9]\d{0,11}$/.test(qid)){
   try{
    const linked=await verifiedWikimedia(qid,kind,id,/^tt\d{5,12}$/.test(imdb)?imdb:null);
    if(linked?.verified&&/[\u3400-\u9fff]{2,}/.test(linked.label||"")){
     wikidataChinese=linked.label;names.push(linked.label);
    }
   }catch{/* Missing Wikimedia labels must never block the other title searches. */}
  }
 }
 const distinct=[...new Set(names.filter(v=>v.length>=2&&v.length<=90&&!/[<>]/.test(v)))];
 const people=[item,local].flatMap(record=>[...(record?.credits?.crew||[]).filter(v=>v.job==="Director").slice(0,2),
  ...(record?.credits?.cast||[]).slice(0,3)]).map(v=>String(v.name||"").trim()).filter(v=>v.length>=3);
 // Country-specific names belong to one verified TMDB identity, but the original
 // may be Japanese or Korean. Never assume "first Asian name" is Chinese.
 const zhTranslated=translations.filter(v=>v.iso_639_1==="zh"&&["CN","HK","TW"].includes(v.iso_3166_1))
   .map(v=>String(v.data?.title||v.data?.name||"").trim());
 const zhAlternate=alt.filter(v=>["CN","HK","TW"].includes(v.iso_3166_1))
   .map(v=>String(v.title||v.name||"").trim());
 const zhOptions=[localized,...zhTranslated,...zhAlternate,wikidataChinese].filter(v=>
   /[\u3400-\u9fff]/.test(v)&&v.length>=2);
 const chinese=[...new Set(zhOptions)].slice(0,3);
 const originalLatin=distinct.find(v=>!/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(v)&&/\p{L}/u.test(v)&&v.length>=2);
 const hangul=distinct.find(v=>/[\uac00-\ud7af]/.test(v)&&v.length>=4);
 const japanese=distinct.find(v=>/[\u3040-\u30ff]/.test(v)&&v.length>=4);
 const genre=String(item.genres?.[0]?.name||"").trim();
 const queries=[];
 const add=(alias,query,locale,requireEdition=false)=>{
  if(alias&&query&&!queries.some(q=>q.query===query))queries.push({alias,query,locale,requireEdition});
 };
 if(chinese.length){
  const first=chinese[0];
  add(first,'"'+first+'" '+year+' '+(kind==="movie"?"电影":"电视剧"),"zh");
  add(first,'"'+first+'" '+(kind==="movie"?"影评 电影":"剧评 电视剧"),"zh");
  // A short query also finds announcements/interviews that omit the year.
  add(first,'"'+first+'" '+(kind==="movie"?"电影":"电视剧"),"zh");
  // Search an independently verified variant, rather than assuming one area's
  // translation is how every Chinese publisher spells the same film.
  if(chinese[1]&&chinese[1]!==first)
   add(chinese[1],'"'+chinese[1]+'" '+(kind==="movie"?"电影":"电视剧"),"zh");
  const root=first.split(/[：:]/)[0].trim();
  if(root!==first&&root.length>=4)
   add(root,'"'+root+'" '+year+' (真人版 OR 真人电影 OR 翻拍)',"zh",true);
 }
 if(originalLatin){
  const rare=originalLatin.length<13&&!originalLatin.includes(" ");
  const type=kind==="movie"?"film":"TV series";
  add(originalLatin,'"'+originalLatin+'" '+year+' '+(genre||type)+' '+type,"en");
  if(rare&&people.length)
   add(originalLatin,'"'+originalLatin+'" "'+people[0]+'" '+type,"en");
  add(originalLatin,'"'+originalLatin+'" '+type+' review',"en");
 }
 if(hangul)add(hangul,'"'+hangul+'" '+(kind==="movie"?"영화":"드라마"),"ko");
 if(japanese)add(japanese,'"'+japanese+'" '+(kind==="movie"?"映画":"ドラマ"),"ja");
 // A title may have only a Chinese translation and no searchable romanized name.
 // Those works should still be queried; absence of an English alias is not a failure.
 if(!queries.length)return {ok:true,kind,tmdbId:Number(id),status:"no_titles",articles:[]};
 // Limit the number of uncached upstream searches per opened work.
 const stats={rssOk:0,rssHttpError:0,rssInvalidXml:0,rssNetworkError:0,rssItems:0,rssMatched:0,guardianItems:0,bingOk:0,bingHttpError:0,bingInvalidXml:0,bingNetworkError:0,bingItems:0,bingMatched:0};
 const requests=queries.slice(0,10).map(async ({alias,query,locale,requireEdition})=>{
  const endpoint=new URL("https://news.google.com/rss/search");
  // Permit historical coverage of older catalog films; the old two-year window excluded it.
  endpoint.searchParams.set("q",query);
  if(locale==="zh"){
   endpoint.searchParams.set("hl","zh-CN");
   endpoint.searchParams.set("gl","CN");
   endpoint.searchParams.set("ceid","CN:zh-Hans");
  }else if(locale==="ko"){
   endpoint.searchParams.set("hl","ko");endpoint.searchParams.set("gl","KR");endpoint.searchParams.set("ceid","KR:ko");
  }else if(locale==="ja"){
   endpoint.searchParams.set("hl","ja");endpoint.searchParams.set("gl","JP");endpoint.searchParams.set("ceid","JP:ja");
  }else{
   endpoint.searchParams.set("hl","en-US");
   endpoint.searchParams.set("gl","US");
   endpoint.searchParams.set("ceid","US:en");
  }
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),7200);
  try{
   const res=await fetch(endpoint.toString(),{signal:ac.signal,headers:{"Accept":"application/rss+xml, application/xml, text/xml"}});
   if(!res.ok){stats.rssHttpError++;return [];}
   const xml=(await res.text()).slice(0,400000);
   if(!/<rss[\s>]/i.test(xml)||!/<item>/i.test(xml)){stats.rssInvalidXml++;return [];}
   stats.rssOk++;
   const now=Date.now(),ctx={year,people,requireEdition,kind};
   const oldest=Number(year)>1900?Date.UTC(Math.max(1970,Number(year)-3),0,1):Date.UTC(1990,0,1);
   const parsed=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0,50);
   stats.rssItems+=parsed.length;
   const accepted=parsed.map(m=>{
    const raw=m[1],title=rssField(raw,"title"),url=safeHttps(rssField(raw,"link"),"news.google.com");
    const stamp=Date.parse(rssField(raw,"pubDate"));
    // Use the query alias and independent movie identity signals. A random
    // "obsession" article must not pass just because the word is in the title.
    const summary=rssField(raw,"description").slice(0,400);
    const relevance=articleRelevance(title,summary,[alias],ctx);
    const match=relevance>0;
    if(!match||!url||!Number.isFinite(stamp)||stamp>now+86400000||stamp<oldest)return null;
    const publisher=rssField(raw,"source");
    return {title:title.slice(0,180),url,date:new Date(stamp).toISOString(),
      source:publisher.slice(0,60)||"Google News",relevance,titleMatchVerified:true,language:locale==="ja"?"ja":locale==="ko"?"ko":locale==="zh"?"zh":"en",matchType:"title_search"};
   }).filter(Boolean);
   stats.rssMatched+=accepted.length;
   return accepted;
  }catch{stats.rssNetworkError++;return [];}finally{clearTimeout(timer);}
 });
 // Independent licensed publisher API fallback: the Guardian can return real
 // historical articles even when an unofficial RSS search is empty or blocked.
 const guardianKey=(env.THE_GUARDIAN_API_KEY||env.GUARDIAN_API_KEY||"").trim();
 const guardian=guardianKey&&originalLatin? (async()=>{
  try{
   const api=new URL("https://content.guardianapis.com/search");
   api.searchParams.set("api-key",guardianKey);
   api.searchParams.set("q",'"'+originalLatin.replace(/"/g,"")+'"');
   api.searchParams.set("section","film");
   api.searchParams.set("page-size","30");
   api.searchParams.set("order-by","relevance");
   api.searchParams.set("show-fields","thumbnail,trailText,standfirst");
   const response=await jsonRemote(api.toString(),{},7500);
   if(response.response?.status!=="ok"||!Array.isArray(response.response.results))return [];
   stats.guardianItems+=response.response.results.length;
   return response.response.results.map(article=>{
    const title=String(article.webTitle||"").slice(0,180);
    const url=safeHttps(article.webUrl,"theguardian.com");
    const date=String(article.webPublicationDate||"");
    const stamp=Date.parse(date);
    // A publisher title search can return reviews of an older film with the
    // exact same name. Enforce the edition's release-era boundary for *every*
    // provider, including The Guardian (RSS already checks its own dates).
    const oldest=Number(year)>1900?Date.UTC(Math.max(1970,Number(year)-3),0,1):Date.UTC(1990,0,1);
    if(!url||!Number.isFinite(stamp)||stamp<oldest||stamp>Date.now()+86400000)return null;
    const summary=rssDecoded(String(article.fields?.trailText||"")+" "+String(article.fields?.standfirst||"")).slice(0,400);
    const context={year,people,editorialFilm:true};
    const headlineMatch=rssArticleMatches(title,originalLatin,context);
    const nearTitle=normalizedHeadline(originalLatin);
    const synopsis=normalizedHeadline(summary);
    const foundSummary=(" "+synopsis+" ").includes(" "+nearTitle+" ");
    const nameDistinctive=nearTitle.length>=12&&nearTitle.includes(" ");
    const filmHeadline=/\b(film|movie|cinema|director|review|ranking|watch|studio|screen|animation|release|movies|films)\b/i.test(title);
    const corroborated=year.length===4&&(
      title.includes(year)||summary.includes(year)||people.some(person=>
        normalizedHeadline(title+" "+summary).includes(normalizedHeadline(person))));
    // Guardian's formal film-section search is a reliable independent source.
    // Film titles may appear in the standfirst rather than the short headline.
    // Do not accept common single-word titles on description-only matches.
    if(!headlineMatch&&!(foundSummary&&filmHeadline&&(nameDistinctive||corroborated)))return null;
    return {title,url,date:new Date(stamp).toISOString(),source:"The Guardian",
      language:"en",matchType:"title_search",titleMatchVerified:true,
      thumbnail:safeHttps(article.fields?.thumbnail,"guim.co.uk"),
      summary:summary.slice(0,240)};
   }).filter(Boolean);
  }catch{return [];}
 })():Promise.resolve([]);
 // A second independent public RSS lookup improves coverage when Google News
 // has no matching titles. Bing's feed is not a versioned API, so failures are
 // optional and returned links must resolve to HTTPS publisher pages.
 const bingNames=[
   chinese[0]?{alias:chinese[0],q:'"'+chinese[0]+'" '+year+' '+(kind==="movie"?"电影":"电视剧"),market:"zh-CN"}:null,
   originalLatin?{alias:originalLatin,q:'"'+originalLatin+'" '+year+' '+(kind==="movie"?"film review":"TV review"),market:"en-US"}:null
 ].filter(Boolean).slice(0,2);
 const bingRequests=bingNames.map(async ({alias,q,market})=>{
   const url=new URL("https://www.bing.com/news/search");
   url.searchParams.set("q",q);url.searchParams.set("format","rss");
   url.searchParams.set("setmkt",market);
   const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),6500);
   try{
    const res=await fetch(url.toString(),{signal:ac.signal,headers:{"Accept":"application/rss+xml, application/xml"}});
    if(!res.ok){stats.bingHttpError++;return [];}
    const xml=(await res.text()).slice(0,220000);
    if(!/<rss[\s>]/i.test(xml)){stats.bingInvalidXml++;return [];}
    stats.bingOk++;
    const rows=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0,20);
    stats.bingItems+=rows.length;
    const matched=rows.map(m=>{
      const row=m[1],title=rssField(row,"title"),link=rssField(row,"link");
      let rawUrl=link;
      try{
       const u=new URL(link);
       if(u.hostname==="www.bing.com"&&u.pathname==="/news/apiclick.aspx")
        rawUrl=u.searchParams.get("url")||"";
      }catch{return null;}
      const target=safeHttps(rawUrl);
      if(!target)return null;
      const hostname=new URL(target).hostname.toLowerCase();
      const nonEditorial=["localhost","127.0.0.1","wikipedia.org","wikidata.org",
        "imdb.com","themoviedb.org","rottentomatoes.com","justwatch.com",
        "youtube.com","youtu.be","vimeo.com","bilibili.com","letterboxd.com",
        "netflix.com","disneyplus.com","metacritic.com","britannica.com"];
      if(nonEditorial.some(domain=>hostname===domain||hostname.endsWith("."+domain)))return null;
      const date=rssField(row,"pubDate"),stamp=Date.parse(date);
      const oldest=Number(year)>1900?Date.UTC(Math.max(1970,Number(year)-3),0,1):Date.UTC(1990,0,1);
      if(Number.isFinite(stamp)&&(stamp>Date.now()+86400000||stamp<oldest))return null;
      const relevance=articleRelevance(title,rssField(row,"description"),[alias],{year,people,kind});
      if(!relevance)return null;
      return {title:title.slice(0,180),url:target,
        date:Number.isFinite(stamp)?new Date(stamp).toISOString():null,
        source:rssField(row,"source").slice(0,60)||new URL(target).hostname.replace(/^www\./,""),
        language:/[\u3400-\u9fff]/.test(title)?"zh":/[\uac00-\ud7af]/.test(title)?"ko":"en",
        relevance,matchType:"title_search",titleMatchVerified:true};
    }).filter(Boolean);
    stats.bingMatched+=matched.length;return matched;
   }catch{stats.bingNetworkError++;return [];}finally{clearTimeout(timer);}
 });
 const domestic=chinese[0]?(async()=>{
  try{
   const uri="https://search.1905.com/search/index-p-type-news-q-"+encodeURIComponent(chinese[0])+".html";
   const html=await publicMarkup(uri,4500);
   return markupLinks(html,uri).map(row=>{
    const url=safeHttps(row.url,"1905.com");
    if(!url)return null;
    const path=new URL(url).pathname,dated=/^\/news\/(20\d{2})(\d{2})(\d{2})\/[1-9]\d+\.shtml$/.exec(path);
    if(!dated)return null;
    const date=dated[1]+"-"+dated[2]+"-"+dated[3],stamp=Date.parse(date);
    if(!Number.isFinite(stamp)||stamp>Date.now()+86400000||Number(dated[1])<Number(year)-3)return null;
    const relevance=articleRelevance(row.title,"",chinese,{year,people,kind});
    return relevance?{title:row.title.slice(0,180),url,date,source:"1905电影网",language:"zh",relevance,
      titleMatchVerified:true,matchType:"title_search"}:null;
   }).filter(Boolean).slice(0,12);
  }catch{return [];}
 })():Promise.resolve([]);
 const [batches,guardianRows,bingBatches,domesticRows]=await Promise.all([Promise.all(requests),guardian,Promise.all(bingRequests),domestic]),seen=new Set(),seenTitle=new Set();
 const rankedArticles=[...domesticRows,...bingBatches.flat(),...guardianRows,...batches.flat()].filter(x=>{
  const key=normalizedHeadline(x.title.replace(/\s[-–—|]\s[^–—|]{2,60}$/,'')),signature=key.replace(/\s+/g,"");
  if(seen.has(x.url)||seenTitle.has(signature))return false;
  seen.add(x.url);seenTitle.add(signature);return true;
 }).sort((a,b)=>(b.relevance||100)-(a.relevance||100)||Date.parse(b.date||0)-Date.parse(a.date||0)||a.url.localeCompare(b.url));
 // Mixed-language coverage matters as much as raw popularity: prevent one
 // publisher market from occupying all cached headlines for this TMDB ID.
 const balanced=[...rankedArticles.filter(x=>x.language==="zh").slice(0,12),
   ...rankedArticles.filter(x=>x.language!=="zh").slice(0,12)];
 const selectedUrls=new Set(balanced.map(x=>x.url));
 const articles=[...balanced,...rankedArticles.filter(x=>!selectedUrls.has(x.url))]
   .slice(0,24).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
 // Identity-linked community reviews are a clearly labeled fallback, not
 // publisher headlines. Their URLs are attached to this exact TMDB title ID.
 const community=[];
 if(articles.length<6){
  const knownAuthors=new Set();
  for(const review of [...(local?.reviews?.results||[]),...(item.reviews?.results||[])]){
   const url=safeHttps(review?.url,"themoviedb.org");
   const author=String(review?.author||"").normalize("NFKC").trim().slice(0,36);
   const content=String(review?.content||"");
   if(!url||!author||content.length<35||knownAuthors.has(author.toLowerCase()))continue;
   const published=Date.parse(review?.created_at||review?.updated_at||"");
   if(!Number.isFinite(published))continue;
   knownAuthors.add(author.toLowerCase());
   const chinese=/[\u3400-\u9fff]/.test(content);
   community.push({title:(localized||original||"Movie")+" · "+(chinese?"观众影评":"Community film review")+" ("+author+")",
     url,date:new Date(published).toISOString(),source:"TMDB · Community reviews",
     language:chinese?"zh":"en",type:"community",titleMatchVerified:true});
   if(community.length>=4)break;
  }
 }
 const finalArticles=[...articles,...community].slice(0,24);
 return {ok:true,kind,tmdbId:Number(id),year:Number(year)||null,
   status:finalArticles.length?"ok":"no_data",articles:finalArticles,source:"Film title search",sourceDiagnostics:stats};
}

// Video titles need their own relevance check. News headlines rarely contain
// words such as "幕后剪辑" or "高能混剪", but those are valid related videos.
function filmVideoTitleMatches(heading,titles,year,kind="movie"){
 const line=String(heading||"").normalize("NFKC").trim();
 if(!line||line.length>240||/完整版|全集|全片|免费观看|网盘|磁力|资源下载|破解|在线观看/i.test(line))return false;
 const compact=normalizedHeadline(line).replace(/ /g,"");
 const contextual=/预告|影评|解说|剪辑|混剪|花絮|幕后|采访|特辑|票房|剧情|演员|电影|剧集|电视剧|导演|片段|高能|映画|監督|予告|レビュー|영화|예고|리뷰|드라마|reaction|trailer|teaser|review|interview|scene|movie|film|drama|episode|behind/i.test(line);
 const edition=/真人版|真人电影|真人化|翻拍|重启|重制|live[\s-]?action|remake|reboot/i.test(line);
 const quoted=x=>['《'+x+'》','【'+x+'】','「'+x+'」','"'+x+'"'].some(q=>line.toLowerCase().includes(q.toLowerCase()));
 const yearString=String(year||"");
 const statedYears=[...line.matchAll(/\b(?:19|20)\d{2}\b/g)].map(v=>v[0]);
 const conflictingYear=statedYears.length&&yearString.length===4&&!statedYears.includes(yearString)&&!edition;
 return (Array.isArray(titles)?titles:[]).some(entry=>{
  const candidate=typeof entry==="string"?entry:entry?.name;
  if(!candidate)return false;
  const key=normalizedHeadline(candidate),plain=key.replace(/ /g,"");
  if(plain.length<2)return false;
  const asian=/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(key);
  const found=asian?compact.includes(plain):(" "+normalizedHeadline(line)+" ").includes(" "+key+" ");
  if(!found)return false;
  if(wrongTitleEdition(line,candidate,year))return false;
  if(conflictingYear){
   const release=Number(yearString),numbers=statedYears.map(Number);
   const promotional=/预告|定档|首曝|先导|teaser|trailer|coming soon|first look|予告/i.test(line);
   // A genuine early teaser for a 2026 film may have a 2024/2025 date.
   // The shortened/single-word names of remakes still need edition cues.
   const distinctive=asian?plain.length>=6:key.includes(" ")&&plain.length>=12;
   const prerelease=kind==="movie"&&distinctive&&promotional&&numbers.every(n=>n>=release-2&&n<release);
   // TV titles keep the TMDB year of their FIRST season, not the latest one.
   const season=kind==="tv"&&numbers.every(n=>n>=release&&n<=new Date().getUTCFullYear()+1)&&
     /第.{0,3}季|第.{0,3}集|season|episode|新季|新一季|更新|季度|시즌|シーズン/i.test(line);
   if(!prerelease&&!season)return false;
  }
  if(typeof entry==="object"&&entry.requireEdition===true&&!edition&&!line.includes(yearString))return false;
  if(asian&&plain.length<4)return quoted(candidate)&&contextual;
  if(!asian&&plain.length<7&&!line.includes(yearString)&&!quoted(candidate))return false;
  if(!contextual&&!line.includes(yearString)&&!quoted(candidate))return false;
  // Single common English nouns (e.g. Obsession) still need a movie context
  // or the correct release year, never merely the coincidental word.
  return true;
 });
}

// Canonicalize only actual video pages. Cover/album/search/profile URLs are
// never converted into a made-up video ID or player URL.
export function domesticVideoLink(value){
 try{
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password)return null;
  let m,platform,videoId,url;
  if(["www.bilibili.com","bilibili.com","m.bilibili.com"].includes(u.hostname)&&
     (m=/^\/video\/(BV[A-Za-z0-9]{10})\/?$/.exec(u.pathname))){
   platform="bilibili";videoId=m[1];url="https://www.bilibili.com/video/"+videoId+"/";
  }else if(u.hostname==="v.qq.com"&&(m=/^\/x\/(?:page|cover\/[A-Za-z0-9]+)\/([A-Za-z0-9]{11})\.html$/.exec(u.pathname))){
   platform="tencent";videoId=m[1];url="https://v.qq.com/x/page/"+videoId+".html";
  }else if(u.hostname==="v.youku.com"&&(m=/^\/v_show\/id_([A-Za-z0-9=_-]{8,80})\.html$/.exec(u.pathname))){
   platform="youku";videoId=m[1];url="https://v.youku.com/v_show/id_"+videoId+".html";
  }else if(u.hostname==="www.iqiyi.com"&&(m=/^\/v_([A-Za-z0-9]{6,40})\.html$/.exec(u.pathname))){
   platform="iqiyi";videoId=m[1];url="https://www.iqiyi.com/v_"+videoId+".html";
  }else if((u.hostname==="www.1905.com"&&(m=/^\/video\/play\/([1-9]\d{4,10})\.shtml$/.exec(u.pathname)))||
           (u.hostname==="m.1905.com"&&(m=/^\/m\/video\/([1-9]\d{4,10})\.shtml$/.exec(u.pathname)))){
   platform="1905";videoId=m[1];url="https://www.1905.com/video/play/"+videoId+".shtml";
  }else return null;
  return {platform,videoId,url};
 }catch{return null;}
}
async function publicMarkup(url,timeout=4000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  // No credentials, cookies, captcha handling or private playback APIs.
  const r=await fetch(url,{signal:controller.signal,redirect:"error",headers:{Accept:"text/html, application/rss+xml","User-Agent":"Mozilla/5.0 (compatible; LiangYouResourceHub/1.0)"}});
  if(!r.ok)throw Error("public_page_unavailable");
  const body=await r.text();
  if(body.length>1500000)throw Error("public_page_too_large");
  return body;
 }finally{clearTimeout(timer);}
}
function markupAttribute(tag,name){
 return new RegExp("\\b"+name+"\\s*=\\s*([\"'])([\\s\\S]*?)\\1","i").exec(tag)?.[2]||"";
}
function pageMeta(html,key){
 for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){
  if((markupAttribute(tag,"property")||markupAttribute(tag,"name")).toLowerCase()===key)
   return rssDecoded(markupAttribute(tag,"content"));
 }
 return "";
}
function markupLinks(html,base){
 const rows=[];
 for(const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
  const href=rssDecoded(markupAttribute(m[1],"href"));
  try{rows.push({url:new URL(href,base).href,title:rssDecoded(markupAttribute(m[1],"title")||m[2])});}catch{}
 }
 return rows;
}
function domesticNames(primary,local){
 return [...new Set([local?.title,local?.name,primary.title,primary.name,primary.original_title,primary.original_name,
  ...[primary,local].flatMap(x=>[...(x?.alternative_titles?.titles||x?.alternative_titles?.results||[])]
    .filter(v=>["CN","HK","TW","US","GB"].includes(v.iso_3166_1)).map(v=>v.title||v.name)),
  ...[primary,local].flatMap(x=>(x?.translations?.translations||[]).filter(v=>["zh","en"].includes(v.iso_639_1)).map(v=>v.data?.title||v.data?.name))
 ].map(v=>String(v||"").normalize("NFKC").trim()).filter(v=>v.length>=2&&v.length<=90))];
}
async function verifiedPublicVideo(candidate,names,year,kind,id,canonical){
 try{
  const html=await publicMarkup(candidate.url,3500);
  const title=pageMeta(html,"og:title")||rssField(html,"title");
  // An index title is just a candidate. Recheck the destination's own title.
  if(!filmVideoTitleMatches(title,names,String(year),kind))return null;
  const declared=pageMeta(html,"og:url");
  const linked=declared?domesticVideoLink(declared):null;
  if(declared&&(!linked||linked.platform!==candidate.platform||linked.videoId!==candidate.videoId))return null;
  if(/视频已删除|视频不存在|视频已下架|内容已删除/.test(title))return null;
  return {kind,tmdbId:Number(id),year,title:canonical,verifiedByTitleId:true,
   platform:candidate.platform,videoId:candidate.videoId,name:title.slice(0,145),
   verifiedSource:candidate.url,publisher:({bilibili:"Bilibili",tencent:"腾讯视频",youku:"优酷",iqiyi:"爱奇艺","1905":"1905电影网"})[candidate.platform],
   type:/预告|定档|teaser|trailer/i.test(title)?"Trailer":"Related",
   verification:"public_video_page",likes:null,views:null};
 }catch{return null;}
}
async function otherDomesticVideos(kind,id,identity){
 const [primary,local]=identity,names=domesticNames(primary,local);
 const year=Number(String(primary.release_date||primary.first_air_date||"").slice(0,4));
 if(!names.length||!Number.isInteger(year)||year<1900)return {videos:[],diagnostics:{}};
 const queryName=names.find(v=>/[\u3400-\u9fff]/.test(v))||names[0];
 const diagnostics={platformSearchOk:0,platformSearchFailed:0,platformCandidates:0,platformVerified:0};
 const queries=[
  "https://search.bilibili.com/all?keyword="+encodeURIComponent(queryName+" 预告"),
  "https://v.qq.com/x/search/?q="+encodeURIComponent(queryName+" 预告"),
  "https://search.1905.com/search/index-p-type-video-q-"+encodeURIComponent(queryName)+".html"
 ];
 const index=new URL("https://www.bing.com/search");
 index.searchParams.set("q",'"'+queryName+'" '+(queryName.length<7?year+' ':'')+'预告 (site:v.qq.com OR site:1905.com/video/play OR site:v.youku.com OR site:iqiyi.com)');
 index.searchParams.set("format","rss");index.searchParams.set("setmkt","zh-CN");
 queries.push(index.toString());
 const batches=await Promise.all(queries.map(async uri=>{
  try{
   const html=await publicMarkup(uri);diagnostics.platformSearchOk++;
   return /<rss[\s>]/i.test(html)?[...html.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0,30)
    .map(m=>({url:rssField(m[1],"link"),title:rssField(m[1],"title")})):markupLinks(html,uri);
  }catch{diagnostics.platformSearchFailed++;return [];}
 }));
 const seen=new Set(),perPlatform=new Map();
 const candidates=batches.flat().map(row=>({...row,link:domesticVideoLink(row.url)}))
  .filter(row=>row.link&&filmVideoTitleMatches(row.title,names,String(year),kind))
  .filter(row=>{
   const key=row.link.platform+":"+row.link.videoId,count=perPlatform.get(row.link.platform)||0;
   if(seen.has(key)||count>=3)return false;
   seen.add(key);perPlatform.set(row.link.platform,count+1);return true;
  }).slice(0,8);
 diagnostics.platformCandidates=candidates.length;
 const videos=(await Promise.all(candidates.map(row=>verifiedPublicVideo(row.link,names,year,kind,id,names[0])))).filter(Boolean);
 diagnostics.platformVerified=videos.length;
 return {videos,diagnostics};
}
export async function titleDomesticVideos(kind,id,env){
 const identity=await Promise.all([tmdbInfo(kind,id,env,true),tmdbInfo(kind,id,env,true,"zh-CN").catch(()=>null)]);
 const [bili,other]=await Promise.all([titleBilibiliVideos(kind,id,env,identity),otherDomesticVideos(kind,id,identity)]);
 const seen=new Set();
 const videos=[...bili.videos,...other.videos].filter(v=>{
   const key=v.platform+":"+v.videoId;if(seen.has(key))return false;seen.add(key);return true;
 }).sort((a,b)=>Number(b.type==="Trailer")-Number(a.type==="Trailer")||
   (b.likes||0)-(a.likes||0)||a.videoId.localeCompare(b.videoId)).slice(0,10);
 return {...bili,videos,status:videos.length?"ok":bili.status,
  source:bili.source+" + domestic public video pages",sourceDiagnostics:{...bili.sourceDiagnostics,...other.diagnostics}};
}

// Best-effort domestic video discovery for EVERY TMDB title. This source is
// uncredentialed and may reject automated requests; do not bypass its controls.
// External index results always require destination checks. Native Bilibili
// metadata can survive a temporary details outage only when its independent
// aid, BVID, original URL, title and publication date agree.
function biliCoverUrl(raw){
 if(typeof raw!=="string"||raw.length>650)return null;
 const value=raw.startsWith("//")?"https:"+raw:raw.startsWith("http://")?"https://"+raw.slice(7):raw;
 try{
  const u=new URL(value),host=u.hostname.toLowerCase();
  if(u.protocol!=="https:"||u.username||u.password||
    !["hdslb.com","biliimg.com"].some(suffix=>host===suffix||host.endsWith("."+suffix))||
    !u.pathname.startsWith("/bfs/"))return null;
  return u.href;
 }catch{return null;}
}
function nativeBilibiliRecord(row,names,year,kind,id,title){
 const bvid=String(row?.bvid||''),aid=Number(row?.aid),stamp=Number(row?.pubdate);
 if(row?.type!=="video"||!/^BV[A-Za-z0-9]{10}$/.test(bvid)||!Number.isSafeInteger(aid)||aid<=0||
    !Number.isFinite(stamp)||stamp<Date.UTC(Math.max(2009,year-3),0,1)/1000||stamp>Date.now()/1000+86400)return null;
 let original;
 try{original=new URL(row.arcurl);}catch{return null;}
 if(!["http:","https:"].includes(original.protocol)||original.username||original.password||
    !["www.bilibili.com","bilibili.com"].includes(original.hostname)||
    !["/video/"+bvid,"/video/"+bvid+"/","/video/av"+aid,"/video/av"+aid+"/"].includes(original.pathname))return null;
 const heading=rssDecoded(row.title||'');
 if(!filmVideoTitleMatches(heading,names,String(year),kind))return null;
 return {kind,tmdbId:Number(id),year,title,verifiedByTitleId:true,
  platform:"bilibili",videoId:bvid,name:heading.slice(0,145),publisher:String(row.author||"Bilibili").slice(0,65),
  verifiedSource:"https://www.bilibili.com/video/"+bvid+"/",type:/预告|定档|teaser|trailer/i.test(heading)?"Trailer":"Related",
  verification:"provider_search_metadata",availability:"unconfirmed",
  thumbnail:biliCoverUrl(row.pic),
  likes:Number.isSafeInteger(row.like)&&row.like>=0?row.like:null,
  views:Number.isSafeInteger(row.play)&&row.play>=0?row.play:null};
}
async function titleBilibiliVideos(kind,id,env,identity){
 const [primary,local]=identity||await Promise.all([
   tmdbInfo(kind,id,env,true),
   tmdbInfo(kind,id,env,true,"zh-CN").catch(()=>null)
 ]);
 const rawYear=String(primary.release_date||primary.first_air_date||"").slice(0,4);
 const year=Number(rawYear);
 const canonical=String(local?.title||local?.name||primary.title||primary.name||"").trim();
 const names=[
   canonical,primary.title,primary.name,primary.original_title,primary.original_name,
   ...(primary.alternative_titles?.titles||primary.alternative_titles?.results||[])
     .filter(v=>["CN","HK","TW"].includes(v.iso_3166_1)).map(v=>v.title||v.name),
   ...(primary.translations?.translations||[]).filter(v=>v.iso_639_1==="zh")
     .map(v=>v.data?.title||v.data?.name)
 ].map(x=>String(x||"").normalize("NFKC").trim())
  .filter(x=>x.length>=2&&x.length<=65);
 const regionName=[...new Set(names)].find(x=>/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(x));
 const latinName=[...new Set(names)].find(x=>/^[a-z0-9 .:'()&!-]+$/i.test(x)&&x.length>=2);
 const searchName=regionName||latinName;
 const checks={nativeReturned:0,nativeHttpSuccess:0,nativeRejected:0,nativeNetworkError:0,indexReturned:0,indexNetworkError:0,titleMatched:0,detailChecked:0,detailVerified:0,detailFailed:0};
 const empty=(status)=>({ok:true,kind,tmdbId:Number(id),year,status,source:"Bilibili public search",videos:[],sourceDiagnostics:checks});
 if(!searchName||!Number.isSafeInteger(year)||year<1900)return empty("no_usable_title");
 // Two independent searches per work: year-specific trailers and unyeared
 // reviews/clips. Both still need a verified title and Bilibili video ID.
 const titleChoices=[...new Set(names)].filter(x=>x.length>=2);
 // Bilibili's title search weighs every query token heavily. A query
 // combining year, film, review, behind-the-scenes AND trailer can suppress
 // legitimate matches completely. Use short, distinct probes; verify every
 // returned ID against the exact film identity downstream.
 const longDistinctive=/[\u3400-\u9fff]/.test(searchName)?
   searchName.replace(/[^\u3400-\u9fff]/g,"").length>=5:
   searchName.trim().split(/\s+/).length>=2&&searchName.length>=13;
 const queryBase=longDistinctive?searchName:searchName+" "+rawYear;
 const variants=[{name:searchName,query:queryBase+" 预告"},
   // A second short, yearless probe helps find commentary that omits the
   // release date; ID and video-heading checks still reject unrelated clips.
   {name:searchName,query:searchName+" "+(kind==="movie"?"影评":"花絮")}];
 const secondary=titleChoices.find(v=>v!==searchName&&v.length>=4&&
   (/[\u3400-\u9fff]/.test(v)||v.length>=9));
 if(secondary)variants[1]={name:secondary,
   query:secondary+" "+(kind==="movie"?"影评":"花絮")};
 let nativeWorking=false,indexedWorking=false;
 const results=(await Promise.all(variants.map(async item=>{
  try{
   const uri=new URL("https://api.bilibili.com/x/web-interface/search/type");
   uri.searchParams.set("search_type","video");
   uri.searchParams.set("keyword",item.query);
   uri.searchParams.set("order","totalrank");uri.searchParams.set("page","1");
   const payload=await jsonRemote(uri.toString(),{
    headers:{Accept:"application/json",Referer:"https://www.bilibili.com/",
      "User-Agent":"Mozilla/5.0 (compatible; LiangYouResourceHub/1.0)"}},4000);
   if(payload?.code===0&&Array.isArray(payload.data?.result)){
     nativeWorking=true;checks.nativeHttpSuccess++;checks.nativeReturned+=payload.data.result.length;
     return payload.data.result;
   }
   checks.nativeRejected++;return [];
  }catch{checks.nativeNetworkError++;return [];}
 }))).flat();
 const unique=new Set();
 let source="Bilibili public search";
 let shortlist=results.map(v=>({
  bvid:String(v.bvid||"").trim(),heading:rssDecoded(v.title||""),
  native:nativeBilibiliRecord(v,titleChoices,year,kind,id,canonical)
 })).filter(v=>/^BV[A-Za-z0-9]{10}$/.test(v.bvid)&&
   filmVideoTitleMatches(v.heading,titleChoices,rawYear,kind)&&
   !unique.has(v.bvid)&&unique.add(v.bvid)).slice(0,14);
 checks.titleMatched=shortlist.length;
 // Some Bilibili uploads omit "预告"/"影评" from their titles. The first
 // two searches are contextual, then one plain-title probe is permitted only
 // when the official public endpoint worked but no usable candidates survived.
 // Every candidate still has to pass video-title and real BVID verification.
 if(shortlist.length<3&&nativeWorking){
  try{
   const u=new URL("https://api.bilibili.com/x/web-interface/search/type");
   u.searchParams.set("search_type","video");u.searchParams.set("keyword",searchName);
   u.searchParams.set("order","totalrank");u.searchParams.set("page","1");
   const data=await jsonRemote(u.toString(),{headers:{
    Accept:"application/json",Referer:"https://www.bilibili.com/",
    "User-Agent":"Mozilla/5.0 (compatible; LiangYouResourceHub/1.0)"
   }},2500);
   if(data?.code===0&&Array.isArray(data.data?.result)){
    const found=data.data.result.map(x=>({
     bvid:String(x.bvid||"").trim(),heading:rssDecoded(x.title||""),
     native:nativeBilibiliRecord(x,titleChoices,year,kind,id,canonical)
    })).filter(x=>/^BV[A-Za-z0-9]{10}$/.test(x.bvid)&&
       filmVideoTitleMatches(x.heading,titleChoices,rawYear,kind)&&
       !unique.has(x.bvid)&&unique.add(x.bvid));
    shortlist=[...shortlist,...found].slice(0,14);
    checks.titleMatched=shortlist.length;
   }
  }catch{/* A rate-limited public search never fabricates a result. */}
 }
 // When the native search is blocked or returned only unrelated titles,
 // try a public index without scraping inaccessible player pages.
 if(shortlist.length<3){
  try{
   const uri=new URL("https://www.bing.com/search");
   // Long distinctive titles can be indexed without a release year,
   // whereas short/homonymous titles require the year to avoid cross-film clips.
   const sufficientlyDistinctive=/[\u3400-\u9fff]/.test(searchName)?
     searchName.replace(/[^\u3400-\u9fff]/g,"").length>=5:
     searchName.trim().split(/\s+/).length>=2&&searchName.length>=13;
   const indexTerm=sufficientlyDistinctive?
     '(预告 OR 影评 OR 花絮 OR 幕后 OR 剪辑)':rawYear+' (预告 OR 影评 OR 花絮)';
   uri.searchParams.set("q",'site:bilibili.com/video/ "'+searchName+'" '+indexTerm);
   uri.searchParams.set("format","rss");uri.searchParams.set("setmkt","zh-CN");
   const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),3500);
   try{
    const response=await fetch(uri.toString(),{signal:ac.signal,headers:{Accept:"application/rss+xml, application/xml"}});
    if(response.ok){
     const xml=(await response.text()).slice(0,220000);
     if(/<rss[\s>]/i.test(xml)){
      indexedWorking=true;
      const extra=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0,24).map(m=>{
       const title=rssField(m[1],"title"),link=rssField(m[1],"link");
       let u;try{u=new URL(link);}catch{return null;}
       if(u.protocol!=="https:"||!["www.bilibili.com","bilibili.com"].includes(u.hostname))return null;
       const match=/^\/video\/(BV[A-Za-z0-9]{10})\/?$/.exec(u.pathname);
       return match?{bvid:match[1],heading:title}:null;
      }).filter(v=>v&&filmVideoTitleMatches(v.heading,titleChoices,rawYear,kind)&&
        !unique.has(v.bvid)&&unique.add(v.bvid));
      checks.indexReturned+=extra.length;
      if(extra.length){shortlist=[...shortlist,...extra].slice(0,14);source="Bilibili + Bing public index"; }
      checks.titleMatched=shortlist.length;
     }
    }
   }finally{clearTimeout(timer);}
  }catch{checks.indexNetworkError++;/* An indexed search failure is not proof that this film has no videos. */}
 }
 if(!shortlist.length)return {ok:true,kind,tmdbId:Number(id),year,
   // A valid but empty Bing RSS response does not establish that Bilibili has
   // no clips; the native source may be geo-blocked or refuse automated access.
   status:nativeWorking||checks.indexReturned>0?"no_match":"upstream_unavailable",
   source:"Bilibili public search",videos:[],sourceDiagnostics:checks};
 checks.detailChecked=shortlist.length;
 const checked=await Promise.all(shortlist.map(async v=>{
   try{
    const uri=new URL("https://api.bilibili.com/x/web-interface/view");
    uri.searchParams.set("bvid",v.bvid);
    const resp=await jsonRemote(uri.toString(),{
      headers:{Accept:"application/json",Referer:"https://www.bilibili.com/",
       "User-Agent":"Mozilla/5.0 (compatible; LiangYouResourceHub/1.0)"}},3500);
    const d=resp?.data;
    if(resp.code!==0&&![-404,-403,-62002,-62004].includes(resp.code))throw Error("public_api_unavailable");
    if(resp.code!==0||d?.bvid!==v.bvid||(d.state!=null&&d.state!==0)){checks.detailFailed++;return null;}
    const title=String(d.title||"").normalize("NFKC").trim();
    if(!filmVideoTitleMatches(title,titleChoices,rawYear,kind)){checks.detailFailed++;return null;}
    checks.detailVerified++;
    const likes=Number(d.stat?.like),views=Number(d.stat?.view);
    return {kind,tmdbId:Number(id),verifiedByTitleId:true,title:canonical,year,
      platform:"bilibili",videoId:v.bvid,name:title.slice(0,145),
      publisher:String(d.owner?.name||"Bilibili").slice(0,65),
      verifiedSource:"https://www.bilibili.com/video/"+v.bvid+"/",
      type:/预告|定档|teaser|trailer/i.test(title)?"Trailer":"Related",
      thumbnail:biliCoverUrl(d.pic)||v.native?.thumbnail||null,
      likes:Number.isSafeInteger(likes)&&likes>=0?likes:null,
      views:Number.isSafeInteger(views)&&views>=0?views:null};
   }catch{
    const page=await verifiedPublicVideo({platform:"bilibili",videoId:v.bvid,
      url:"https://www.bilibili.com/video/"+v.bvid+"/"},titleChoices,year,kind,id,canonical);
    if(page){checks.detailVerified++;return page;}
    if(v.native){checks.nativeMetadataVerified=(checks.nativeMetadataVerified||0)+1;return v.native;}
    checks.detailFailed++;return null;
   }
 }));
 const videos=checked.filter(Boolean).sort((a,b)=>(b.likes||0)-(a.likes||0)||a.videoId.localeCompare(b.videoId)).slice(0,6);
 return {ok:true,kind,tmdbId:Number(id),year,source,
   status:videos.length?"ok":"no_match",videos,sourceDiagnostics:checks};
}

async function koreanBoxOffice(env){
 if(!env.KOFIC_API_KEY)return {ok:true,status:"not_configured",source:"KOFIC",data:[]};
 const date=new Date(Date.now()-3*86400000);
 const ymd=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(date).replace(/-/g,"");
 let d=null;
 for(const host of ["kobis.or.kr","www.kobis.or.kr"]){
  const uri=new URL("https://"+host+"/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json");
  uri.searchParams.set("key",env.KOFIC_API_KEY);uri.searchParams.set("targetDt",ymd);
  try{
   const next=await jsonRemote(uri.toString(),{headers:{"Accept":"application/json"}},7000);
   if(Array.isArray(next.boxOfficeResult?.dailyBoxOfficeList)){d=next;break;}
  }catch{}
 }
 const list=d?.boxOfficeResult?.dailyBoxOfficeList;
 if(!Array.isArray(list))return {ok:true,status:"unavailable",source:"KOFIC",date:ymd,data:[],note:"Official origin did not return a verified daily chart."};
 return {ok:true,status:"ok",source:"KOFIC official daily Korea box office",date:ymd,checkedAt:new Date().toISOString(),
  data:list.slice(0,10).filter(r=>r.movieNm&&r.rank).map(r=>({rank:Number(r.rank),title:r.movieNm,releaseDate:r.openDt||"",salesKRW:Number(r.salesAmt)||null,audience:Number(r.audiCnt)||null}))};
}

// Read only public AcFun video metadata. The native iOS HTML5 player consumes
// the original HLS stream directly; the Worker never relays video bytes.
function firstJsonObject(body){
 const start=body.indexOf("{");
 if(start<0)return null;
 let depth=0,quoted=false,escaped=false;
 for(let i=start;i<body.length;i++){
  const ch=body[i];
  if(quoted){
   if(escaped)escaped=false;
   else if(ch==="\\")escaped=true;
   else if(ch==='"')quoted=false;
  }else if(ch==='"')quoted=true;
  else if(ch==="{")depth++;
  else if(ch==="}"&&--depth===0){
   try{return JSON.parse(body.slice(start,i+1));}catch{return null;}
  }
 }
 return null;
}
function trustedAcfunHls(raw){
 try{
  const u=new URL(raw),hostname=u.hostname.toLowerCase();
  if(u.protocol!=="https:"||u.username||u.password||!u.pathname.endsWith(".m3u8")||
     !["acfun.cn","acfunchina.com","kuaishou.com","gifshow.com","yximgs.com","kwaicdn.com"].some(
       domain=>hostname===domain||hostname.endsWith("."+domain)))return null;
  return u.href;
 }catch{return null;}
}
async function acfunPublicHls(id){
 const endpoint="https://www.acfun.cn/v/ac"+id+"?quickViewId=videoInfo_new&ajaxpipe=1";
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),9000);
 try{
  const response=await fetch(endpoint,{signal:ac.signal,headers:{
   "Accept":"*/*","X-Requested-With":"XMLHttpRequest",
   "Referer":"https://www.acfun.cn/v/ac"+id,
   "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  }});
  if(!response.ok)return null;
  const raw=(await response.text()).slice(0,1000000);
  const envelope=firstJsonObject(raw);
  const html=envelope?.html;
  if(typeof html!=="string")return null;
  const script=/<script[^>]*class=["']videoInfo["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1]||html;
  const marker=/window\.pageInfo\s*=\s*(?:window\.videoInfo\s*=\s*)?/m.exec(script);
  if(!marker)return null;
  const info=firstJsonObject(script.slice(marker.index+marker[0].length));
  if(!info||Number(info.dougaId||info.contentId||id)!==Number(id))return null;
  const video=info.currentVideoInfo;
  if(!video||!video.ksPlayJson)return null;
  const k=typeof video.ksPlayJson==="string"?JSON.parse(video.ksPlayJson):video.ksPlayJson;
  const data=k?.data&&typeof k.data==="object"?k.data:k;
  const sets=Array.isArray(data?.adaptationSet)?data.adaptationSet:[];
  const clips=sets.flatMap(x=>Array.isArray(x?.representation)?x.representation:[])
   .map(x=>({url:trustedAcfunHls(x?.url),quality:String(x?.qualityType||"").slice(0,16)}))
   .filter(x=>x.url);
  if(!clips.length)return null;
  // Prioritize 720p for mobile bandwidth, otherwise first accessible variant.
  return clips.find(x=>/720/i.test(x.quality))||clips[0];
 }catch{return null;}finally{clearTimeout(timer);}
}
export default {
 async fetch(request,env,ctx){
  const u=new URL(request.url);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":cors,"access-control-allow-methods":"GET, OPTIONS"}});
  if(request.method!=="GET")return reply({ok:false,error:"GET only"},405);
  if(u.pathname==="/api/health")return reply({ok:true,status:"worker-online",note:"Check content routes for provider availability.",source:"JustWatch via TMDB",regions:[...regionCodes]});
  // Guardian's general film headlines are distinct from title-matched coverage.
  // The optional call is cached for 90 minutes, and only occurs when a user expands news.
  if(u.pathname==="/api/news/film"){
   const key=(env.THE_GUARDIAN_API_KEY||env.GUARDIAN_API_KEY||"").trim();
   if(!key)return reply({ok:true,status:"not_configured",source:"The Guardian",articles:[]});
   const cacheHit=await caches.default.match(request);if(cacheHit)return cacheHit;
   try{
    const endpoint=new URL("https://content.guardianapis.com/search");
    endpoint.searchParams.set("api-key",key);
    endpoint.searchParams.set("section","film");
    endpoint.searchParams.set("page-size","6");
    endpoint.searchParams.set("order-by","newest");
    endpoint.searchParams.set("show-fields","thumbnail,trailText,byline");
    const d=await jsonRemote(endpoint.toString(),{},9000);
    if(d.response?.status!=="ok"||!Array.isArray(d.response.results))throw Error("invalid_guardian_response");
    const articles=d.response.results.filter(v=>v.webTitle&&v.webUrl)
     .map(v=>({
       title:String(v.webTitle),
       url:safeHttps(v.webUrl,"theguardian.com"),
       date:v.webPublicationDate||null,section:String(v.sectionName||"Film").slice(0,45),
       summary:String(v.fields?.trailText||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,200),
       byline:String(v.fields?.byline||""),
       thumbnail:safeHttps(v.fields?.thumbnail,"guim.co.uk")||null,source:"The Guardian"
     })).filter(v=>v.url).slice(0,6);
    const body={ok:true,status:articles.length?"ok":"no_data",source:"The Guardian",checkedAt:new Date().toISOString(),articles};
    const response=reply(body,200,5400);ctx.waitUntil(caches.default.put(request,response.clone()));return response;
   }catch{return reply({ok:false,status:"unavailable",error:"Guardian film news unavailable"},502);}
  }
  // Per-work exact ID contextual news search, cached for six hours.
  const titleNewsRoute=u.pathname.match(/^\/api\/news\/title\/(movie|tv)\/([1-9]\d{0,9})$/);
  if(titleNewsRoute){
   const cacheKey=new Request(new URL(u.pathname+"?matching=20261029-v13",u.origin));
   const cached=await caches.default.match(cacheKey);if(cached)return cached;
   try{
    const body=await titleNews(titleNewsRoute[1],titleNewsRoute[2],env);
    const response=reply(body,200,body.articles.length?21600:300);
    ctx.waitUntil(caches.default.put(cacheKey,response.clone()));
    return response;
   }catch{return reply({ok:true,kind:titleNewsRoute[1],tmdbId:Number(titleNewsRoute[2]),status:"unavailable",articles:[]},200,900);}
  }
  const matchingVideos=u.pathname.match(/^\/api\/videos\/title\/(movie|tv)\/([1-9]\d{0,9})$/);
  if(matchingVideos){
   const cacheKey=new Request(new URL(u.pathname+"?matching=20261030-bili-cover-v14",u.origin));
   const cached=await caches.default.match(cacheKey);if(cached)return cached;
   try{
    const body=await titleDomesticVideos(matchingVideos[1],matchingVideos[2],env);
    const response=reply(body,200,body.videos.length?86400:900);
    ctx.waitUntil(caches.default.put(cacheKey,response.clone()));
    return response;
   }catch{return reply({ok:true,kind:matchingVideos[1],tmdbId:Number(matchingVideos[2]),
       status:"unavailable",videos:[]},200,300);}
  }
  // On-demand public HLS metadata; no signed URLs are persisted or cached.
  const acfun=u.pathname.match(/^\/api\/video\/acfun\/([1-9][0-9]{3,11})$/);
  if(acfun){
    const video=await acfunPublicHls(acfun[1]);
    return reply(video?{ok:true,platform:"acfun",videoId:acfun[1],...video}:
      {ok:false,platform:"acfun",status:"upstream_unavailable"},video?200:502,0);
  }
  // Image-only relay for verified Bilibili CDN cover URLs. Prevents cross-site
  // hotlink failures for dynamically discovered videos; never proxies video.
  if(u.pathname==="/api/media-cover/bilibili"){
    const source=u.searchParams.get("src")||"";
    let target=null;
    try{
      const parsed=new URL(source);
      const host=parsed.hostname.toLowerCase();
      if(parsed.protocol==="https:"&&!parsed.username&&!parsed.password&&
        ["hdslb.com","biliimg.com"].some(domain=>host===domain||host.endsWith("."+domain))&&
        /^\/bfs\/archive\/[a-f0-9]{32,80}\.(?:jpg|jpeg|png|webp)(?:@[\w!.-]{1,80})?$/i.test(parsed.pathname)&&
        source.length<500)target=parsed.href;
    }catch{}
    if(!target)return reply({ok:false,error:"invalid_image"},400,0);
    const cacheKey=new Request(u.href);
    const cached=await caches.default.match(cacheKey);
    if(cached)return cached;
    const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),7000);
    try{
      const upstream=await fetch(target,{signal:ac.signal,redirect:"error",headers:{
        "Referer":"https://www.bilibili.com/",
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
        "Accept":"image/jpeg,image/png,image/webp"
      }});
      const mime=(upstream.headers.get("content-type")||"").split(";")[0].toLowerCase();
      if(!upstream.ok||!["image/jpeg","image/png","image/webp"].includes(mime)||
        Number(upstream.headers.get("content-length")||0)>1500000)throw Error("image_unavailable");
      const bytes=await upstream.arrayBuffer();
      const magic=new Uint8Array(bytes.slice(0,12));
      if(bytes.byteLength<500||bytes.byteLength>1500000||
        !(mime==="image/jpeg"&&magic[0]===255&&magic[1]===216&&magic[2]===255)&&
        !(mime==="image/png"&&magic[0]===137&&magic[1]===80&&magic[2]===78&&magic[3]===71)&&
        !(mime==="image/webp"&&String.fromCharCode(...magic.slice(0,4))==="RIFF"))
        throw Error("invalid_image");
      const result=new Response(bytes,{status:200,headers:{
        "content-type":mime,"cache-control":"public,max-age=86400",
        "access-control-allow-origin":cors,"x-content-type-options":"nosniff"
      }});
      ctx.waitUntil(caches.default.put(cacheKey,result.clone()));
      return result;
    }catch{return reply({ok:false,error:"cover_unavailable"},502,0);}
    finally{clearTimeout(timeout);}
  }
  // Bilibili public video statistics; counts are never inferred from view totals.
  const bili=u.pathname.match(/^\/api\/video\/bilibili\/(BV[A-Za-z0-9]{10})$/);
  if(bili){
   const cached=await caches.default.match(request);if(cached)return cached;
   const id=bili[1];
   let thumbnail=null,likes=null,views=null;
   try{
    const endpoint=new URL("https://api.bilibili.com/x/web-interface/view");
    endpoint.searchParams.set("bvid",id);
    const doc=await jsonRemote(endpoint.toString(),{headers:{
      "Accept":"application/json","User-Agent":"Mozilla/5.0","Referer":"https://www.bilibili.com/"
    }},5000);
    if(doc?.code===0&&doc.data?.bvid===id&&(doc.data.state==null||doc.data.state===0)){
      thumbnail=biliCoverUrl(doc.data.pic);
      const stat=doc.data.stat||{};
      if(Number.isSafeInteger(stat.like)&&stat.like>=0)likes=stat.like;
      if(Number.isSafeInteger(stat.view)&&stat.view>=0)views=stat.view;
    }
   }catch{/* Some public Bilibili API requests are rate-limited. */}
   // Metadata availability and popularity are separate. A blocked stats API
   // must not prevent the original official video page providing its og:image.
   if(!thumbnail){
    try{
     const markup=await publicMarkup("https://www.bilibili.com/video/"+id+"/",5000);
     const declared=pageMeta(markup,"og:url");
     if((!declared||/^https:\/\/(?:www\.)?bilibili\.com\/video\/BV[A-Za-z0-9]{10}\/?$/.test(declared)&&
         declared.includes("/video/"+id))&&markup.includes(id))
       thumbnail=biliCoverUrl(pageMeta(markup,"og:image"));
    }catch{/* No cover: the client should retain the movie poster. */}
   }
   const available=Boolean(thumbnail)||likes!==null||views!==null;
   const result=reply({ok:available,bvid:id,source:"Bilibili",
     thumbnail,likes,views,checkedAt:new Date().toISOString(),
     status:available?"ok":"unavailable"},200,available?14400:1200);
   ctx.waitUntil(caches.default.put(request,result.clone()));
   return result;
  }
  // MyAnimeList v2: join anime only by a verified MAL numeric ID, never by title search.
  const animeMatch=u.pathname.match(/^\/api\/anime\/mal\/([1-9]\d{0,9})$/);
  if(animeMatch){
   const key=(env.MAL_CLIENT_ID||env.MYANIMELIST_CLIENT_ID||"").trim();
   if(!key)return reply({ok:true,status:"not_configured",source:"MyAnimeList v2",malId:Number(animeMatch[1])});
   const hit=await caches.default.match(request);if(hit)return hit;
   try{
    const endpoint=new URL("https://api.myanimelist.net/v2/anime/"+animeMatch[1]);
    endpoint.searchParams.set("fields","mean,rank,popularity,num_scoring_users,num_list_users,media_type,num_episodes,start_date,genres,studios");
    const x=await jsonRemote(endpoint.toString(),{headers:{"X-MAL-CLIENT-ID":key,"Accept":"application/json"}},9000);
    if(Number(x?.id)!==Number(animeMatch[1])||!String(x.title||"").trim())throw Error("MAL identity mismatch");
    const validMean=Number.isFinite(x.mean)&&x.mean>=0&&x.mean<=10?x.mean:null;
    const body={ok:true,status:"ok",source:"MyAnimeList v2",malId:Number(x.id),
      title:String(x.title).slice(0,170),url:"https://myanimelist.net/anime/"+x.id,
      score:validMean,scale:10,rank:Number.isInteger(x.rank)&&x.rank>0?x.rank:null,
      popularity:Number.isInteger(x.popularity)&&x.popularity>0?x.popularity:null,
      ratingCount:Number.isInteger(x.num_scoring_users)&&x.num_scoring_users>=0?x.num_scoring_users:null,
      listUsers:Number.isInteger(x.num_list_users)&&x.num_list_users>=0?x.num_list_users:null,
      episodes:Number.isInteger(x.num_episodes)?x.num_episodes:null,mediaType:String(x.media_type||"").slice(0,40),
      studios:Array.isArray(x.studios)?x.studios.filter(t=>t.name).slice(0,5).map(t=>String(t.name).slice(0,80)):[],
      genres:Array.isArray(x.genres)?x.genres.filter(t=>t.name).slice(0,8).map(t=>String(t.name).slice(0,80)):[],
      checkedAt:new Date().toISOString()};
    const response=reply(body,200,86400);ctx.waitUntil(caches.default.put(request,response.clone()));return response;
   }catch{return reply({ok:false,error:"MAL source or ID unavailable"},502);}
  }
  // Lightweight title classification for list cards. It uses one TMDB request,
  // never fanart/OMDb/TheTVDB/YouTube/Guardian, and never sends credentials to browsers.
  const classificationMatch=u.pathname.match(/^\/api\/classification\/(movie|tv)\/([1-9]\d{0,9})$/);
  if(classificationMatch){
   const hit=await caches.default.match(request);if(hit)return hit;
   try{
    const [_,kind,id]=classificationMatch,title=await tmdbInfo(kind,id,env,false);
    const body={ok:true,kind,tmdbId:Number(id),source:"TMDB",
      title:String(title.title||title.name||""),originalTitle:String(title.original_title||title.original_name||""),
      releaseDate:title.release_date||title.first_air_date||"",
      classification:classificationFor(title,kind),checkedAt:new Date().toISOString()};
    const response=reply(body,200,86400);
    ctx.waitUntil(caches.default.put(request,response.clone()));
    return response;
   }catch{return reply({ok:false,error:"Classification currently unavailable"},502);}
  }
  // Optional enrichment is served by verified TMDB identity; all keys remain in Worker secrets.
  const extra=u.pathname.match(/^\/api\/insights\/(movie|tv)\/([1-9]\d{0,9})$/);
  if(extra){
   const hit=await caches.default.match(request);if(hit)return hit;
   try{const body=await mediaInsights(extra[1],extra[2],env,u.searchParams.get("media")==="1",u.searchParams.get("wiki")==="1");
     const response=reply(body,200,86400);ctx.waitUntil(caches.default.put(request,response.clone()));return response;
   }catch{return reply({ok:false,error:"Insights currently unavailable"},502);}
  }
  if(u.pathname==="/api/kobis/daily"||u.pathname==="/api/boxoffice/kr"){
   const hit=await caches.default.match(request);if(hit)return hit;
   try{const body=await koreanBoxOffice(env);const response=reply(body,200,14400);
     if(body.status==="ok")ctx.waitUntil(caches.default.put(request,response.clone()));return response;
   }catch{return reply({ok:false,error:"KOFIC unavailable"},502);}
  }
  // Exact-ID title dossiers for site-internal recommendations. No fuzzy title matching.
  const titleMatch=u.pathname.match(/^\/api\/title\/(movie|tv)\/([1-9]\d{0,9})$/);
  if(titleMatch){
   const [_,kind,id]=titleMatch;
   const token=env.TMDB_READ_ACCESS_TOKEN?.trim(),apikey=env.TMDB_API_KEY?.trim();
   if(!token&&!apikey)return reply({ok:false,error:"TMDB credential not configured"},503);
   const hit=await caches.default.match(request);if(hit)return hit;
   const target=new URL("https://api.themoviedb.org/3/"+kind+"/"+id);
   target.searchParams.set("language","zh-CN");
   target.searchParams.set("append_to_response","external_ids,credits,videos,recommendations");
   if(!token)target.searchParams.set("api_key",apikey);
   const c=new AbortController(),timer=setTimeout(()=>c.abort(),16000);
   try{
    const res=await fetch(target.toString(),{signal:c.signal,headers:token?{"Authorization":"Bearer "+token,"Accept":"application/json"}:{"Accept":"application/json"}});
    if(!res.ok)throw Error("tmdb_status_"+res.status);
    const x=await res.json();
    if(Number(x?.id)!==Number(id)||x.adult||!(x.title||x.name))throw Error("title_id_mismatch");
    // A Chinese-language TMDB profile often has no localized trailers even
    // when English-language video metadata is available for this exact film.
    const linkedVideo=v=>v?.site==="YouTube"&&
      /^[A-Za-z0-9_-]{11}$/.test(String(v.key||""))&&
      ["Trailer","Teaser","Clip","Featurette","Behind the Scenes","Bloopers"].includes(v.type)&&
      !/full\s*(?:movie|film|episode)|完整版|全集|watch.*online|网盘|磁力|资源下载/i.test(v.name||"");
    let movieVideoRows=(x.videos?.results||[]).filter(linkedVideo);
    if(movieVideoRows.length<6){
      try{
        const videoUrl=new URL("https://api.themoviedb.org/3/"+kind+"/"+id+"/videos");
        videoUrl.searchParams.set("language","en-US");
        if(!token)videoUrl.searchParams.set("api_key",apikey);
        const extra=await jsonRemote(videoUrl.toString(),{
          headers:token?{Authorization:"Bearer "+token,Accept:"application/json"}:{Accept:"application/json"}
        },5500);
        // ID must match; titles or uploaders are not used to join different works.
        if(Number(extra?.id)===Number(id)&&Array.isArray(extra.results))
          movieVideoRows.push(...extra.results.filter(linkedVideo));
      }catch{/* A blocked extra request must not affect the main film profile. */}
    }
    const seenVideoIds=new Set();
    const verifiedVideoRows=movieVideoRows.filter(v=>{
      if(seenVideoIds.has(v.key))return false;seenVideoIds.add(v.key);return true;
    }).sort((a,b)=>Number(b.official===true)-Number(a.official===true)||
       Number(["Trailer","Teaser"].includes(b.type))-Number(["Trailer","Teaser"].includes(a.type))
      ).slice(0,6);
    const person=p=>({name:p.name||"",character:p.character||"",url:"https://www.themoviedb.org/person/"+p.id});
    const crew=(x.credits?.crew||[]).filter(p=>p.job==="Director").slice(0,5).map(p=>({...person(p),role:"Director"}));
    const creators=[...crew,...(x.created_by||[]).slice(0,3).map(p=>({...person(p),role:"Creator"}))].slice(0,6);
    const profile={
      checked_at:new Date().toISOString(),via:"TMDB",
      tagline:x.tagline||"",genres:(x.genres||[]).slice(0,8).map(g=>g.name).filter(Boolean),
      runtime:x.runtime||(x.episode_run_time||[])[0]||null,status:x.status||"",
      languages:(x.spoken_languages||[]).slice(0,6).map(v=>v.name||v.english_name).filter(Boolean),
      countries:(x.production_countries||[]).slice(0,6).map(v=>v.name).filter(Boolean),
      creators,cast:(x.credits?.cast||[]).slice(0,10).map(person),
      seasons:(x.seasons||[]).filter(s=>s.season_number>0).slice(0,25).map(s=>({number:s.season_number,name:s.name||"",episodes:s.episode_count,date:s.air_date||"",url:"https://www.themoviedb.org/tv/"+id+"/season/"+s.season_number})),
      videos:verifiedVideoRows.map(v=>({name:v.name||"Video",type:v.type,official:v.official===true,verifiedBy:"TMDB",url:"https://www.youtube.com/watch?v="+v.key})),
      related:(x.recommendations?.results||[]).filter(v=>Number.isSafeInteger(v.id)&&!v.adult&&(v.title||v.name)).slice(0,6).map(v=>({id:"tmdb-"+kind+"-"+v.id,title:v.title||v.name,url:"https://www.themoviedb.org/"+kind+"/"+v.id})),
      episodes:x.number_of_episodes||null,season_count:x.number_of_seasons||null
    };
    const result={ok:true,id:"tmdb-"+kind+"-"+id,tmdb_id:Number(id),kind,
      title:x.title||x.name,original_title:x.original_title||x.original_name||"",
      date:x.release_date||x.first_air_date||"",overview:x.overview||"",
      poster:x.poster_path&&/^\/[A-Za-z0-9._-]+$/.test(x.poster_path)?"https://image.tmdb.org/t/p/w342"+x.poster_path:"",
      imdb_id:/^tt\d{5,12}$/.test(x.imdb_id||x.external_ids?.imdb_id||"")?(x.imdb_id||x.external_ids.imdb_id):"",
      ratings:Number.isFinite(x.vote_average)&&x.vote_average>0?[{source:"TMDB",value:x.vote_average,scale:10,votes:x.vote_count||null,via:"TMDB",checked_at:profile.checked_at}]:[],
      profile,source:"TMDB",checked_at:profile.checked_at};
    const response=reply(result,200,ttl);ctx.waitUntil(caches.default.put(request,response.clone()));return response;
   }catch(e){return reply({ok:false,error:"Title dossier unavailable",reason:String(e?.message||"unknown").slice(0,80)},502);}
   finally{clearTimeout(timer);}
  }
  const match=u.pathname.match(/^\/api\/(movie|tv)\/([1-9]\d{0,9})$/);
  if(!match)return reply({ok:false,error:"Not Found"},404);
  const region=(u.searchParams.get("region")||"US").toUpperCase();
  if(!regionCodes.has(region))return reply({ok:false,error:"Unsupported country code"},400);
  const token=env.TMDB_READ_ACCESS_TOKEN?.trim(),apikey=env.TMDB_API_KEY?.trim();
  if(!token&&!apikey)return reply({ok:false,error:"TMDB credential not configured"},503);
  const hit=await caches.default.match(request);
  if(hit)return hit;
  const target=new URL("https://api.themoviedb.org/3/"+match[1]+"/"+match[2]+"/watch/providers");
  if(!token)target.searchParams.set("api_key",apikey);
  const c=new AbortController();const timer=setTimeout(()=>c.abort(),18000);
  try{
    const res=await fetch(target.toString(),{signal:c.signal,headers:token?{"Authorization":"Bearer "+token,"Accept":"application/json"}:{"Accept":"application/json"}});
    if(!res.ok)throw Error("tmdb_status_"+res.status);
    const body=await res.json();
    if(!body||Number(body.id)!==Number(match[2])||!body.results||typeof body.results!=="object")throw Error("tmdb_id_or_schema_mismatch");
    const area=body.results[region]||{};
    const groups={subscription:simplify(area.flatrate),free:simplify(area.free),ads:simplify(area.ads),rent:simplify(area.rent),buy:simplify(area.buy)};
    const result={ok:true,source:"JustWatch via TMDB",sourceUrl:"https://www.themoviedb.org/"+match[1]+"/"+match[2]+"/watch",
      type:match[1],tmdbId:Number(match[2]),region,found:Object.values(groups).some(x=>x.length>0),
      providers:groups,detailPage:typeof area.link==="string"&&area.link.startsWith("https://www.themoviedb.org/")?area.link:null,
      attribution:"Availability provided by JustWatch via TMDB; country-level providers, not direct playback links.",
      checkedAt:new Date().toISOString()};
    const response=reply(result,200,ttl);ctx.waitUntil(caches.default.put(request,response.clone()));return response;
  }catch(e){return reply({ok:false,error:"Watch provider source unavailable",reason:String(e?.message||"unknown").slice(0,80)},502);}
  finally{clearTimeout(timer);}
 }
};

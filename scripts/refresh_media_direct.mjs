// Run the same identity checks from the scheduled runner. Public sources can
// fail from one hosting region while being available from another. Never send
// cookies, bypass a challenge, or publish an unverified search hit.
import {readFile,writeFile} from 'node:fs/promises';
import {titleNews,titleDomesticVideos} from '../labs/streaming-availability-worker.mjs';
const file=new URL('../data/media-title-coverage.json',import.meta.url);
const env={TMDB_READ_ACCESS_TOKEN:process.env.TMDB_READ_ACCESS_TOKEN,
 TMDB_API_KEY:process.env.TMDB_API_KEY,THE_GUARDIAN_API_KEY:process.env.THE_GUARDIAN_API_KEY};
if(!env.TMDB_READ_ACCESS_TOKEN&&!env.TMDB_API_KEY){console.log('DIRECT_COVERAGE_SKIPPED missing TMDB configuration');process.exit(0);}
const snapshot=JSON.parse(await readFile(file,'utf8'));
const items=snapshot.items||{};
const requested=String(process.env.MEDIA_DIRECT_IDS||'').split(',').filter(Boolean);
const keys=(requested.length?requested:Object.keys(items))
 .filter(k=>/^(movie|tv):[1-9]\d{0,9}$/.test(k))
 .sort((a,b)=>String(items[a]?.directCheckedAt||'').localeCompare(String(items[b]?.directCheckedAt||''))||
   Number(!!items[a]?.videos?.length)-Number(!!items[b]?.videos?.length)||a.localeCompare(b))
 .slice(0,Math.max(1,Math.min(20,Number(process.env.MEDIA_DIRECT_BATCH)||12)));
let cursor=0,videoCount=0,newsCount=0;
const merge=(fresh,old,key,limit)=>{
 const seen=new Set();return [...fresh,...old].filter(row=>{
  const id=key(row);if(!id||seen.has(id))return false;seen.add(id);return true;
 }).slice(0,limit);
};
async function work(){
 while(cursor<keys.length){
  const key=keys[cursor++],[kind,rawId]=key.split(':'),id=Number(rawId),old=items[key]||{};
  const checkedAt=new Date().toISOString();
  try{
   const video=await titleDomesticVideos(kind,id,env);
   // Refresh news when either language has insufficient coverage, without
   // spending publisher requests on already healthy twelve-article records.
   const articles=old.articles||[];
   const needNews=articles.filter(x=>x.language==='zh'&&x.type!=='community').length<6||
     articles.filter(x=>x.language!=='zh'&&x.type!=='community').length<6;
   let news=null;
   if(needNews)try{news=await titleNews(kind,id,env);}catch{}
   const videos=merge(video.videos||[],old.videos||[],v=>v.platform+':'+v.videoId,10);
   const merged=merge(news?.articles||[],articles,v=>v.url,48);
   const balanced=[...merged.filter(x=>x.language==='zh').slice(0,12),...merged.filter(x=>x.language!=='zh').slice(0,12)];
   items[key]={...old,checkedAt,directCheckedAt:checkedAt,year:video.year||old.year,
    videos,articles:balanced,youtubeTrailers:old.youtubeTrailers||[],
    videoStatus:videos.length?'ok':video.status,videoCandidates:video.videos?.length||0,
    videoDiagnostics:video.sourceDiagnostics||{},directNewsStatus:news?.status||'not_requested'};
   videoCount+=video.videos?.length||0;newsCount+=news?.articles?.length||0;
   console.log('DIRECT_TITLE_RESULT',JSON.stringify({key,videos:video.videos?.length||0,
    platforms:[...new Set((video.videos||[]).map(x=>x.platform))],news:news?.articles?.length||0,
    videoStatus:video.status,diagnostics:video.sourceDiagnostics||{}}));
  }catch{
   // Keep verified data and record attempts so one broken title cannot starve
   // all other catalog titles in subsequent rotations. Never log API URLs.
   if(items[key])items[key].directCheckedAt=checkedAt;
   console.log('DIRECT_TITLE_UNAVAILABLE',key);
  }
 }
}
await Promise.all([work(),work()]);
snapshot.updatedAt=new Date().toISOString();snapshot.items=items;
await writeFile(file,JSON.stringify(snapshot)+'\n');
console.log('DIRECT_COVERAGE_RESULT',JSON.stringify({titles:keys.length,videos:videoCount,articles:newsCount}));

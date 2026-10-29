/* Exact TMDB-ID article and video index; editorial URLs are validated, not fabricated. */
(function(){
  'use strict';
  let pending;
  const safeUrl=value=>{
    try{
      const u=new URL(String(value||''));
      return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;
    }catch{return null;}
  };
  const validKind=x=>x==='movie'||x==='tv';
  function read(){
    if(!pending)pending=fetch('./data/media-title-news.json',{cache:'no-cache',signal:AbortSignal.timeout(6500)})
      .then(r=>{if(!r.ok)throw Error('title_news_snapshot_unavailable');return r.json();})
      .then(d=>d?.schema===1&&d.titles&&typeof d.titles==='object'?d:null)
      .catch(()=>null);
    return pending;
  }
  // Scheduled coverage for the full catalog, independently of the three
  // hand-checked editorial records. Read once per open tab and fail quietly
  // when the first scheduled refresh has not published yet.
  let coveragePromise;
  async function readCoverage(){
    if(!coveragePromise)coveragePromise=fetch('./data/media-title-coverage.json',{
      cache:'no-cache',signal:AbortSignal.timeout(7500)
    }).then(r=>r.ok?r.json():null)
      .then(d=>d?.schema===1&&d.items&&typeof d.items==='object'?d:null)
      .catch(()=>null);
    return coveragePromise;
  }
  async function cachedForInfo(kind,id,year){
    const cache=await readCoverage();
    const item=cache?.items?.[kind+':'+id];
    if(!item||!Array.isArray(item.articles)||!Array.isArray(item.videos))return null;
    const storedYear=Number(item.year);
    if(Number.isInteger(storedYear)&&storedYear>1900&&Math.abs(year-storedYear)>1)return null;
    const articles=item.articles.filter(x=>x?.titleMatchVerified===true&&
      typeof x.title==='string'&&x.title.length>=8&&x.title.length<=180&&
      typeof x.source==='string'&&safeUrl(x.url)&&
      (x.date==null||Number.isFinite(Date.parse(x.date)))&&
      ['zh','en','ja','ko'].includes(x.language)).slice(0,24)
      .map(x=>({...x,url:safeUrl(x.url)}));
    const videos=item.videos.filter(x=>x?.verifiedByTitleId===true&&
      x.kind===kind&&Number(x.tmdbId)===id&&
      x.platform==='bilibili'&&/^BV[A-Za-z0-9]{10}$/.test(x.videoId||'')&&
      safeUrl(x.verifiedSource)==='https://www.bilibili.com/video/'+x.videoId+'/'&&
      Number.isInteger(Number(x.year))&&Math.abs(Number(x.year)-year)<=1)
      .slice(0,10).map(x=>({...x,verifiedSource:safeUrl(x.verifiedSource)}));
    return articles.length||videos.length?{articles,videos,aliases:[]}:null;
  }
  async function forInfo(info){
    const kind=info?.kind,id=Number(info?.tmdbId),year=Number(String(info?.year||'').slice(0,4));
    if(!validKind(kind)||!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(year))return null;
    const d=await read();
    const item=d?.titles?.[kind+':'+id];
    // Do not penalize films absent from the tiny manually curated index.
    if(!item||item.kind!==kind||item.tmdbId!==id||item.year!==year)
      return cachedForInfo(kind,id,year);
    const articles=(Array.isArray(item.articles)?item.articles:[]).filter(x=>x&&
      typeof x.title==='string'&&x.title.length>=8&&x.title.length<=200&&
      typeof x.source==='string'&&safeUrl(x.url)&&Number.isFinite(Date.parse(x.date||'')))
      .map(x=>({...x,url:safeUrl(x.url),verifiedByTitleId:true}));
    const videos=(Array.isArray(item.videos)?item.videos:[]).filter(x=>x&&x.kind===kind&&
      Number(x.year)===year&&x.title===item.title&&safeUrl(x.verifiedSource))
      .map(x=>({...x,verifiedSource:safeUrl(x.verifiedSource)}));
    const aliases=(Array.isArray(item.aliases)?item.aliases:[]).filter(x=>typeof x==='string'&&x.length>=3&&x.length<=80).slice(0,18);
    return {articles,videos,aliases};
  }
  // Separate from the checked-in editorial index: a blocked optional search must
  // never delay or erase already verified records.
  const remoteCache=new Map();
  function remoteForInfo(info){
    const kind=info?.kind,id=Number(info?.tmdbId);
    if(!validKind(kind)||!Number.isSafeInteger(id)||id<1)return Promise.resolve(null);
    const key=kind+':'+id;
    const previous=remoteCache.get(key);
    if(previous&&Date.now()-previous.at<previous.ttl)return previous.promise;
    const entry={at:Date.now(),ttl:120000,promise:null};
    entry.promise=(async()=>{
      try{
        const r=await fetch('https://liangyou-streaming-availability.maddestalistar.workers.dev/api/news/title/'+kind+'/'+id+'?v=9',{
          signal:AbortSignal.timeout(21000)});
        if(!r.ok)return null;
        const d=await r.json();
        if(d?.ok!==true||d.kind!==kind||d.tmdbId!==id||!Array.isArray(d.articles))return null;
        const articles=d.articles.filter(x=>x&&typeof x.title==='string'&&
          x.title.length>=8&&x.title.length<=180&&
          x.titleMatchVerified===true&&safeUrl(x.url)&&!['localhost','127.0.0.1'].includes(new URL(safeUrl(x.url)).hostname)&&
          (x.date==null||Number.isFinite(Date.parse(x.date)))&&
          ['zh','ko','ja','en'].includes(x.language))
          .slice(0,18).map(x=>({...x,url:safeUrl(x.url)}));
        return {articles};
      }catch{return null;}
    })().then(result=>{
      // Empty or failed searches may recover later; successful exact-ID matches
      // can stay cached for longer without hammering external providers.
      entry.ttl=result?.articles?.length?3600000:120000;
      return result;
    });
    remoteCache.set(key,entry);
    return entry.promise;
  }
  // Optional per-title video discovery uses only server-validated TMDB IDs and
  // public video-detail metadata. Blocked search platforms return an empty list.
  const videoCache=new Map();
  function videoForInfo(info){
    const kind=info?.kind,id=Number(info?.tmdbId);
    const year=Number(String(info?.year||'').slice(0,4));
    if(!validKind(kind)||!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(year))
      return Promise.resolve(null);
    const key=kind+':'+id,prior=videoCache.get(key);
    if(prior&&Date.now()-prior.at<prior.ttl)return prior.promise;
    const entry={at:Date.now(),ttl:120000,promise:null};
    entry.promise=(async()=>{
      try{
        const r=await fetch('https://liangyou-streaming-availability.maddestalistar.workers.dev/api/videos/title/'+kind+'/'+id+'?v=5',{
          signal:AbortSignal.timeout(17500)});
        if(!r.ok)return null;
        const d=await r.json();
        if(d?.ok!==true||d.kind!==kind||d.tmdbId!==id||
           !Number.isSafeInteger(d.year)||Math.abs(d.year-year)>1||
           !Array.isArray(d.videos))return null;
        const videos=d.videos.filter(v=>v?.verifiedByTitleId===true&&
          v.kind===kind&&v.tmdbId===id&&v.platform==='bilibili'&&
          /^BV[A-Za-z0-9]{10}$/.test(String(v.videoId||''))&&
          Number(v.year)===d.year&&
          safeUrl(v.verifiedSource)==='https://www.bilibili.com/video/'+v.videoId+'/'&&
          typeof v.name==='string'&&v.name.length>=4&&v.name.length<=145)
          .slice(0,8).map(v=>({...v,verifiedSource:safeUrl(v.verifiedSource)}));
        return {videos};
      }catch{return null;}
    })().then(result=>{
      entry.ttl=result?.videos?.length?3600000:120000;
      return result;
    });
    videoCache.set(key,entry);return entry.promise;
  }
  window.LiangYouTitleNews=Object.freeze({forInfo,remoteForInfo,videoForInfo});
})();

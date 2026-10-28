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
  async function forInfo(info){
    const kind=info?.kind,id=Number(info?.tmdbId),year=Number(String(info?.year||'').slice(0,4));
    if(!validKind(kind)||!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(year))return null;
    const d=await read();
    const item=d?.titles?.[kind+':'+id];
    if(!item||item.kind!==kind||item.tmdbId!==id||item.year!==year)return null;
    const articles=(Array.isArray(item.articles)?item.articles:[]).filter(x=>x&&
      typeof x.title==='string'&&x.title.length>=8&&x.title.length<=200&&
      typeof x.source==='string'&&safeUrl(x.url)&&Number.isFinite(Date.parse(x.date||'')))
      .map(x=>({...x,url:safeUrl(x.url)}));
    const videos=(Array.isArray(item.videos)?item.videos:[]).filter(x=>x&&x.kind===kind&&
      Number(x.year)===year&&x.title===item.title&&safeUrl(x.verifiedSource))
      .map(x=>({...x,verifiedSource:safeUrl(x.verifiedSource)}));
    return {articles,videos};
  }
  window.LiangYouTitleNews=Object.freeze({forInfo});
})();

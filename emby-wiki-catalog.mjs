// Supplement approved submissions without replacing supplied values, including zero.
const empty=value=>value==null||value===''||(Array.isArray(value)&&value.length===0);
const key=name=>String(name||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const countFields=['movies','series','episodes','moviesWithVersions','seriesWithVersions','episodesWithVersions','others'];
const supplementalFields=['nature','state','contents','qualities','registration','summary','network','pricing','statsNote','extraContent','extraQuality','retention','website','channel','group','bot'];
const hasCounts=item=>countFields.some(k=>!empty(item[k]));
// Keep each public snapshot atomic: its values, method, date and source travel together.
export function libraryView(item){
 if(hasCounts(item)||!item.publicStats)return item;
 const s=item.publicStats;
 const fields=s.method==='includingVersions'?['moviesWithVersions','seriesWithVersions','episodesWithVersions']:['reportedMovies','reportedSeries','reportedEpisodes'];
 const view={...item,statsDate:s.date||'',statsNote:s.note||'',historicalStats:true};
 ['movies','series','episodes'].forEach((k,i)=>view[fields[i]]=s[k]??null);
 return view;
}
export function wikiSources(item){
 if(Array.isArray(item.sources))return item.sources;
 return item.sourceUrl?[{name:item.sourceName||'公开档案',url:item.sourceUrl,reference:item.sourceReference||'',retrievedAt:item.retrievedAt||'',note:item.sourceNote||'',fields:supplementalFields.filter(k=>!empty(item[k]))}]:[];
}
function mergeSources(a,b){
 const byUrl=new Map();
 for(const source of [...a,...b]){
  const id=source.url+'|'+(source.reference||'');
  const old=byUrl.get(id);
  byUrl.set(id,{...source,fields:[...new Set([...(old?.fields||[]),...(source.fields||[])])]});
 }
 return [...byUrl.values()];
}
export function mergeWikiCatalog(approved=[],supplement=[]){
 const result=approved.map(x=>({...x}));
 const names=new Map();
 for(const item of result)for(const name of [item.name,...(item.aliases||[])])names.set(key(name),item);
 for(const source of supplement){
  const match=[source.name,...(source.aliases||[])].map(key).map(n=>names.get(n)).find(Boolean);
  if(match){
   const before=wikiSources(match);
   const added=[];
   if(!hasCounts(match)&&source.publicStats){
    const old=match.publicStats,next=source.publicStats;
    if(!old||(next.date&&old.date&&next.date>old.date))match.publicStats={...next};
   }
   for(const field of supplementalFields){
    // An older/unspecified-method note must not accompany newer submitted counts.
    if(field==='statsNote'&&countFields.some(k=>!empty(match[k])))continue;
    if(empty(match[field])&&!empty(source[field])){match[field]=source[field];added.push(field)}
   }
   if(added.length){
    const contributing=wikiSources(source).map(s=>({...s,fields:(s.fields||added).filter(k=>added.includes(k))})).filter(s=>s.fields.length);
    match.sources=mergeSources(before,contributing);
    // Keep legacy attribution intact for consumers that do not read sources yet.
    if(!match.sourceUrl)for(const field of ['sourceName','sourceUrl','sourceReference','sourceUpdatedAt','sourceNote','retrievedAt','sourceEntryIds'])match[field]=source[field];
    match.supplementedFields=[...new Set([...(match.supplementedFields||[]),...added])];
   }
  }else{
   const item={...source};result.push(item);
   for(const name of [source.name,...(source.aliases||[])])names.set(key(name),item);
  }
 }
 return result;
}
export async function fetchWikiSupplement(){
 const paths=['./assets/data/emby-atlas.json?v=20261128','./assets/data/emby-telegram.json?v=20261128.tg1','./assets/data/emby-statistics.json?v=20261128.stats1'];
 const results=await Promise.allSettled(paths.map(async path=>{
  const response=await fetch(new URL(path,import.meta.url),{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('补充资料暂时无法加载');
  const data=await response.json();
  if(!Array.isArray(data.items))throw Error('补充资料格式错误');
  return data.items;
 }));
 const available=results.filter(x=>x.status==='fulfilled');
 if(!available.length)throw Error('补充资料暂时无法加载');
 return {items:available.reduce((items,x)=>mergeWikiCatalog(items,x.value),[]),partial:available.length!==paths.length};
}

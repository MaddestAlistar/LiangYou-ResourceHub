// Supplement approved community submissions; never replace a supplied value (including 0).
const empty=value=>value==null||value===''||(Array.isArray(value)&&value.length===0);
const key=name=>String(name||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const supplementalFields=['nature','state','contents','qualities','registration','summary','network','pricing','extraContent','extraQuality','retention','website','channel','group','bot'];
export function mergeWikiCatalog(approved=[],supplement=[]){
 const result=approved.map(x=>({...x}));
 const names=new Map(result.map(x=>[key(x.name),x]));
 for(const source of supplement){
  const match=[source.name,...(source.aliases||[])].map(key).map(n=>names.get(n)).find(Boolean);
  if(match){
   const added=[];
   for(const field of supplementalFields)if(empty(match[field])&&!empty(source[field])){match[field]=source[field];added.push(field)}
   if(added.length){
    for(const field of ['sourceName','sourceUrl','sourceReference','sourceUpdatedAt','retrievedAt','sourceEntryIds'])match[field]=source[field];
    match.supplementedFields=added;
   }
  }else{
   const item={...source};result.push(item);
   for(const name of [source.name,...(source.aliases||[])])names.set(key(name),item);
  }
 }
 return result;
}
export async function fetchWikiSupplement(){
 const response=await fetch(new URL('./assets/data/emby-atlas.json?v=20261128',import.meta.url),{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('补充资料暂时无法加载');
 const data=await response.json();
 if(!Array.isArray(data.items))throw Error('补充资料格式错误');
 return data.items;
}

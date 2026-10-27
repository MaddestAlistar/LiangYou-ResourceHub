/* Verified cross-provider event identity. No betting data is used as a match result. */
(function(root){
 'use strict';
 const aliases={
  'brooklyn nets':'nets','boston celtics':'celtics','new york knicks':'knicks',
  'detroit pistons':'pistons','los angeles lakers':'lakers','la lakers':'lakers',
  'los angeles clippers':'clippers','la clippers':'clippers',
  'portland trail blazers':'trail blazers','sacramento kings':'kings',
  'san antonio spurs':'spurs','golden state warriors':'warriors',
  'miami heat':'heat','oklahoma city thunder':'thunder',
  'milwaukee bucks':'bucks','cleveland cavaliers':'cavaliers',
  'denver nuggets':'nuggets','chicago bulls':'bulls','phoenix suns':'suns',
  'dallas mavericks':'mavericks','houston rockets':'rockets',
  'memphis grizzlies':'grizzlies','utah jazz':'jazz',
  'atlanta hawks':'hawks','toronto raptors':'raptors',
  'orlando magic':'magic','indiana pacers':'pacers',
  'washington wizards':'wizards','charlotte hornets':'hornets',
  'philadelphia 76ers':'76ers','new orleans pelicans':'pelicans',
  'minnesota timberwolves':'timberwolves',
  'bilibili gaming':'blg','top esports':'tes',"anyone's legend":'al',
  'team we':'we','jd gaming':'jdg','edward gaming':'edg',
  'invictus gaming':'ig','kt rolster':'kt','gen.g esports':'geng',
  'gen g':'geng','gen.g':'geng','hanwha life esports':'hle',
  'dplus kia':'dk','t1 esports':'t1'
 };
 const keyName=x=>{
  let v=String(x||'').normalize('NFKC').trim().toLowerCase()
   .replace(/[’‘]/g,"'").replace(/\bfc\b|\bfootball club\b/gi,'').replace(/[.\-_]+/g,' ')
   .replace(/\s+/g,' ').trim();
  v=aliases[v]||v;
  return v.replace(/[^a-z0-9\u4e00-\u9fff]/g,'');
 };
 const category=x=>x?.category==='other'?'esports':x?.category||x?.sport||'';
 const draw=x=>['draw','tie','平局','x'].includes(String(x||'').trim().toLowerCase());
 const marketSides=m=>Array.isArray(m?.outcomes)?
  m.outcomes.map(x=>x.name).filter(x=>!draw(x)).map(keyName).filter(Boolean):[];
 const officialSides=m=>[keyName(m?.home),keyName(m?.away)].filter(Boolean);
 const sides=m=>Array.isArray(m?.outcomes)?marketSides(m):officialSides(m);
 const time=m=>Date.parse(m?.start_time||'');
 const pairs=(a,b,maxGapMinutes=45)=>{
  if(category(a)!==category(b))return false;
  const ta=time(a),tb=time(b);
  if(!Number.isFinite(ta)||!Number.isFinite(tb)||
      Math.abs(ta-tb)>maxGapMinutes*60000)return false;
  // A market-close timestamp cannot be treated as a kickoff timestamp.
  if(a.time_kind==='market_close'||b.time_kind==='market_close')return false;
  const aa=sides(a),bb=sides(b);
  return aa.length===2&&bb.length===2&&aa[0]!==aa[1]&&bb[0]!==bb[1]&&
   aa.slice().sort().join('|')===bb.slice().sort().join('|');
 };
 const groupMarkets=events=>{
  const grouped=[];
  for(const market of events||[]){
   const item=grouped.find(g=>pairs(g.primary,market));
   if(item){
    // Never collapse two distinct markets from the same platform.
    if(item.sources.some(x=>x.provider===market.provider)){
     grouped.push({primary:market,sources:[market]});
    }else item.sources.push(market);
   }else grouped.push({primary:market,sources:[market]});
  }
  return grouped;
 };
 const officialFor=(market,fixtures)=>{
  const matches=(fixtures||[]).filter(x=>pairs(market,x,45));
  // An ambiguous team/time match is not a verified event association.
  return matches.length===1?matches[0]:null;
 };
 const marketsFor=(official,markets)=>groupMarkets((markets||[]).filter(m=>pairs(m,official,45)));
 // Stable, reviewable client-side identity: prefer an official provider event ID.
 // Unlinked market IDs are scoped to a market-only category and normalized sides.
 const matchIdentity=(record,fixtures=[])=>{
  const published=Array.isArray(record?.outcomes)?officialFor(record,fixtures):record;
  if(published&&published.id)return 'official:'+String(published.id);
  const teams=sides(record).slice().sort();
  const epoch=time(record);
  if(teams.length!==2||!Number.isFinite(epoch))return null;
  return 'market:'+category(record)+':'+teams.join(':')+':'+
    new Date(epoch).toISOString().slice(0,16);
 };
 root.LiangYouSportsLinks=Object.freeze({keyName,category,sides,pairs,groupMarkets,officialFor,marketsFor,matchIdentity});
})(window);

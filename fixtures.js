/* Verified official fixtures. Editorial priority != measured audience heat. */
(()=>{
'use strict';
const panel=document.getElementById('officialFixtures');if(!panel)return;
const el=id=>document.getElementById(id);
const refs={grid:el('officialFixturesGrid'),status:el('officialFixturesStatus'),count:el('officialFixturesCount'),
 search:el('officialFixturesSearch'),category:el('officialFixturesCategory'),sort:el('officialFixturesSort'),
 more:el('officialFixturesMore'),showing:el('officialFixturesShowing'),
 bracket:el('officialBracketGrid'),bracketSelect:el('officialBracketSelect'),bracketSport:el('officialBracketSport'),
 standing:el('officialStandingGrid'),standingSelect:el('officialStandingSelect'),standingSport:el('officialStandingSport')};
if(Object.values(refs).some(v=>!v))return;
const views=[...panel.querySelectorAll('[data-fixtures-view]')];
const dates=[...panel.querySelectorAll('[data-fixtures-date]')];
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const translations=window.LiangYouSportsI18n;
const strings={
zh:{title:'赛事日历与赛事资料',
 intro:'精选热门联赛赛程、英雄联盟与其他电竞淘汰赛、可核验的联赛排名。',
 views:['赛事日历','电竞晋级图','联赛积分榜'],dates:['今天','明天','未来7天'],
 placeholder:'搜索球队、战队或联赛',category:['全部项目','英雄联盟','其他电竞','篮球','足球'],
 sorts:['热门优先','时间优先'],formats:['全部电竞','英雄联盟','其他电竞'],
 ranks:['全部排名','英雄联盟','其他电竞','篮球'],
 first:'正在等待官方赛事资料首次同步，不显示模拟比赛。',
 empty:'暂未采集到符合条件的比赛，请换个日期、项目或关键词。',
 unavailable:'当前筛选没有可核验的淘汰赛晋级图。可能尚未进入淘汰赛阶段，或数据源尚未提供。',
 noStanding:'当前筛选没有可核验的官方积分榜；不会用预测概率或胜负场推算排名。',
 updated:'最近核验',partial:'部分接口暂不可用，仅展示已核验资料。',
 stale:'当前快照超过18小时，请以赛事官方公告为准。',time:'北京时间',
 total:n=>'已收录未来7天 '+n+' 场',shown:(n,t)=>'已显示 '+n+' / '+t+' 场',
 more:'加载更多赛程',round:'轮次',draw:'待定',rank:'排名',
 team:'战队 / 球队',wins:'胜',losses:'负',feature:'重点赛事',vs:'对阵',
 source:'来源',note:'数据来自 API-Sports 与 PandaScore，约每6小时采集。热门优先是按赛事级别设置的编辑排序，不代表实时观看人数；晋级关系、积分只显示实际返回的数据。下方预测市场独立展示。',
 market:'赛前预测市场'},
en:{title:'Calendar & tournament intelligence',
 intro:'Featured leagues, verified LoL and esports brackets, and published standings.',
 views:['Calendar','Esports brackets','Standings'],dates:['Today','Tomorrow','Next 7 days'],
 placeholder:'Search teams and competitions',category:['All sports','League of Legends','Other esports','Basketball','Football'],
 sorts:['Featured first','Kickoff time'],formats:['All esports','League of Legends','Other esports'],
 ranks:['All standings','League of Legends','Other esports','Basketball'],
 first:'Waiting for official fixture data. No sample results.',
 empty:'No scheduled matches for these filters.',
 unavailable:'No verified brackets for this filter. Knockout rounds may not have started.',
 noStanding:'No official standings for this filter; no rankings are inferred.',
 updated:'Last checked',partial:'Some providers unavailable. Verified records only.',
 stale:'Data more than 18 hours old. Check the organizer for updates.',time:'UTC+8',
 total:n=>n+' upcoming this week',shown:(n,t)=>'Showing '+n+' of '+t,
 more:'More matches',round:'Round',draw:'TBD',rank:'Rank',
 team:'Team',wins:'W',losses:'L',feature:'Featured',vs:'vs',
 source:'Source',note:'Data from API-Sports and PandaScore, checked about every six hours. Featured ordering is editorial, not live audience popularity. Brackets and standings are verified provider records; prediction markets are separate below.',
 market:'Prediction markets'}
};
let data={events:[],brackets:[],standings:[],generated_at:null,status:'pending'};
let view='calendar',date='week',limit=6;
const lang=()=>panel.closest('#sports')?.getAttribute('lang')==='en'?'en':'zh';
const t=()=>strings[lang()];
const localize=(v,category='')=>{
 const raw=String(v??'').trim();
 if(!raw||lang()==='en')return raw;
 const translated=translations?.league?.(raw,category,'zh');
 const specials={
 'Worlds':'英雄联盟全球总决赛','World Championship':'全球总决赛',
 'MSI':'季中冠军赛','LPL':'英雄联盟职业联赛 LPL','LCK':'韩国英雄联盟联赛 LCK',
 'LEC':'欧洲英雄联盟联赛 LEC','LCS':'北美英雄联盟联赛 LCS',
 'PGL Masters':'PGL 大师赛','VCT':'无畏契约冠军巡回赛 VCT',
 'NBA':'NBA 美国职业篮球联赛','NBA W':'WNBA 美国女子职业篮球联赛',
 'Eastern Conference':'东部联盟','Western Conference':'西部联盟',
 'Group Stage':'小组赛','Playoffs':'淘汰赛','Regular Season':'常规赛',
 'Swiss Stage':'瑞士轮','Quarterfinals':'四分之一决赛',
 'Semifinals':'半决赛','Final':'决赛','Grand Final':'总决赛',
 'Finals':'决赛','Round of 16':'十六强赛','Ranking':'排名'
 };
 if(specials[raw])return specials[raw];
 if(translated&&translated!==raw&&translated!=='英雄联盟')return translated;
 if(raw==='League of Legends')return '英雄联盟';
 // Only translate known competitive terms; unknown proper names stay original.
 return raw.replace(/\bWorlds\b/g,'全球总决赛').replace(/\bMSI\b/g,'季中冠军赛')
 .replace(/\bGroup Stage\b/gi,'小组赛').replace(/\bSwiss Stage\b/gi,'瑞士轮')
 .replace(/\bPlayoffs\b/gi,'淘汰赛').replace(/\bKnockout Stage\b/gi,'淘汰赛')
 .replace(/\bRegular Season\b/gi,'常规赛').replace(/\bQualifiers?\b/gi,'资格赛')
 .replace(/\bGroup ([A-Z])\b/gi,'$1组')
 .replace(/\bQuarterfinals?\b/gi,'四分之一决赛')
 .replace(/\bSemifinals?\b/gi,'半决赛')
 .replace(/\bGrand Finals?\b/gi,'总决赛')
 .replace(/\bFinals?\b/gi,'决赛')
 .replace(/Upper Bracket Round (\d+)(?: Match (\d+))?/gi,(_,n,m)=>'胜者组第'+n+'轮'+(m?' 第'+m+'场':''))
 .replace(/Lower Bracket Round (\d+)(?: Match (\d+))?/gi,(_,n,m)=>'败者组第'+n+'轮'+(m?' 第'+m+'场':''))
 .replace(/\bRound (\d+)\b/gi,'第$1轮');
};
const team=(v,sport)=>{
 const raw=String(v??'');
 if(lang()==='en')return raw;
 const hit=translations?.team?.(raw,sport,'zh') || raw;
 return hit;
};
const when=v=>{
 const d=new Date(v);
 if(!Number.isFinite(d.getTime()))return '--';
 return new Intl.DateTimeFormat(lang()==='zh'?'zh-CN':'en-US',{
  timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
};
const dayKey=value=>new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',
 year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
const empty=msg=>'<p class="fixtures-empty">'+safe(msg)+'</p>';
function popularity(row){
 if(Number.isFinite(row.prominence))return row.prominence;
 const text=(String(row.league||'')+' '+String(row.stage||'')).toLowerCase();
 let base=row.sport==='lol'?290:row.sport==='basketball'?220:row.sport==='football'?160:90;
 if(/\bworlds\b|world championship/.test(text))base=500;
 else if(/\bmsi\b|mid.season/.test(text))base=460;
 else if(/\blpl\b|\blck\b/.test(text))base=430;
 else if(/\bnba\b/.test(text))base=410;
 else if(/champions league|premier league/.test(text))base=390;
 else if(/vct|major|masters|international/.test(text))base=325;
 return base;
}
function topPriority(records){
 return [...records].sort((a,b)=>popularity(b)-popularity(a)||
  Date.parse(a.start_time||'')-Date.parse(b.start_time||''));
}
function updateLabels(){
 const copy=t();el('officialFixturesTitle').textContent=copy.title;
 el('officialFixturesIntro').textContent=copy.intro;
 el('officialFixturesNote').textContent=copy.note;
 el('fixturesMarketTitle').textContent=copy.market;
 views.forEach((x,i)=>{x.textContent=copy.views[i];
  const yes=x.dataset.fixturesView===view;x.classList.toggle('is-active',yes);x.setAttribute('aria-pressed',String(yes));});
 dates.forEach((x,i)=>{x.textContent=copy.dates[i];
  const yes=x.dataset.fixturesDate===date;x.classList.toggle('is-active',yes);x.setAttribute('aria-pressed',String(yes));});
 refs.search.placeholder=copy.placeholder;refs.search.setAttribute('aria-label',copy.placeholder);
 [...refs.category.options].forEach((x,i)=>x.textContent=copy.category[i]);
 [...refs.sort.options].forEach((x,i)=>x.textContent=copy.sorts[i]);
 [...refs.bracketSport.options].forEach((x,i)=>x.textContent=copy.formats[i]);
 [...refs.standingSport.options].forEach((x,i)=>x.textContent=copy.ranks[i]);
 refs.more.textContent=copy.more;
 for(const [id,mode] of [['fixtureCalendarPanel','calendar'],['fixtureBracketsPanel','brackets'],['fixtureStandingsPanel','standings']])
  el(id).hidden=mode!==view;
 const node=data.generated_at?Date.parse(data.generated_at):NaN;
 refs.status.textContent=Number.isFinite(node)?(Date.now()-node>18*3600000?copy.stale:
  (data.status==='partial'?copy.partial+' · ':'')+copy.updated+'：'+when(data.generated_at)+' · '+copy.time):copy.first;
}
function calendar(){
 const copy=t(),now=Date.now(),until=now+7*86400000;
 const today=dayKey(new Date()),tomorrow=dayKey(new Date(now+86400000));
 const query=refs.search.value.trim().normalize('NFKC').toLocaleLowerCase();
 let matches=data.events.filter(x=>{
   if(x.status!=='scheduled')return false;
   const time=Date.parse(x.start_time);
   if(!Number.isFinite(time)||time<now-120000||time>until)return false;
   if(date==='today'&&dayKey(new Date(time))!==today)return false;
   if(date==='tomorrow'&&dayKey(new Date(time))!==tomorrow)return false;
   if(refs.category.value!=='all'&&x.sport!==refs.category.value)return false;
   return !query||[x.home,x.away,x.league,x.stage,x.sport,
     team(x.home,x.sport),team(x.away,x.sport),
     localize(x.league,x.sport),localize(x.stage,x.sport)].join(' ').normalize('NFKC').toLocaleLowerCase().includes(query);
 });
 matches=refs.sort.value==='time'?[...matches].sort((a,b)=>Date.parse(a.start_time)-Date.parse(b.start_time)):topPriority(matches);
 refs.grid.innerHTML=matches.length?matches.slice(0,limit).map(x=>{
   const title=[localize(x.league,x.sport),localize(x.stage,x.sport),Number.isInteger(x.best_of)?'BO'+x.best_of:null].filter(Boolean).join(' · ');
   return '<article class="fixtures-card"><div class="fixtures-cardtop"><strong>'+safe(title)+
     '</strong><span>'+safe(when(x.start_time))+'</span></div>'+
     '<div class="fixtures-versus">'+safe(team(x.home,x.sport))+' <em>'+safe(copy.vs)+'</em> '+safe(team(x.away,x.sport))+'</div>'+
     '<div class="fixtures-cardfoot"><span class="fixtures-source">'+safe(x.provider==='pandascore'?'PandaScore':'API-Sports')+
     '</span>'+ (popularity(x)>=390?'<span class="fixtures-featured">'+safe(copy.feature)+'</span>':'')+
     '<span>'+safe(copy.time)+'</span></div></article>';
 }).join(''):empty(data.generated_at?copy.empty:copy.first);
 const total=data.events.filter(x=>x.status==='scheduled'&&Date.parse(x.start_time)>=now&&Date.parse(x.start_time)<=until).length;
 refs.count.textContent=copy.total(total);
 refs.showing.textContent=copy.shown(Math.min(matches.length,limit),matches.length);
 refs.more.hidden=matches.length<=limit;
}
function kindOf(v){
 if(v.sport)return v.sport;
 if(v.kind==='basketball')return 'basketball';
 return /worlds|\blol\b|lpl|lck|lgc|lec|msi/i.test(v.title||'')?'lol':'esports';
}
function options(select,items){
 const current=select.value;
 select.innerHTML=items.map((x,i)=>'<option value="'+safe(String(x.tournament_id||x.id||i))+'">'+
  safe(localize(x.title,kindOf(x)))+'</option>').join('');
 if(items.some(x=>String(x.tournament_id||x.id)===current))select.value=current;
 else if(items[0])select.value=String(items[0].tournament_id||items[0].id);
}
function bracketRound(label){
 return localize(label,'esports').replace(/^(?:Upper|Lower) Bracket Round /i,m=>m);
}
function brackets(){
 const copy=t(),kind=refs.bracketSport.value;
 const records=[...data.brackets].filter(x=>x&&x.provider==='pandascore'&&
   Array.isArray(x.rounds)&&x.rounds.length&&(kind==='all'||kindOf(x)===kind))
   .sort((a,b)=>popularity(b)-popularity(a));
 if(!records.length){refs.bracketSelect.hidden=true;refs.bracket.innerHTML=empty(copy.unavailable);return;}
 refs.bracketSelect.hidden=false;options(refs.bracketSelect,records);
 const selected=records.find(x=>String(x.tournament_id)===refs.bracketSelect.value)||records[0];
 const grouped=new Map();
 for(const round of selected.rounds){
  let key=String(round.round||copy.round);
  // Normalize repeated match labels from a single knockout stage.
  key=key.replace(/^(Upper|Lower) Bracket Round (\d+)(?: Match .*)?$/i,'$1 Bracket Round $2');
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(...(Array.isArray(round.matches)?round.matches:[]));
 }
 const sport=kindOf(selected);
 refs.bracket.innerHTML=[...grouped.entries()].slice(0,10).map(([label,matches])=>
  '<section class="fixtures-round"><h4>'+safe(bracketRound(label))+'</h4>'+
  matches.slice(0,12).map(m=>
    '<div class="fixtures-tie">'+[['home','score_home'],['away','score_away']].map(([side,score])=>
      '<div class="fixtures-tie-line'+(m.winner===m[side]?' is-winner':'')+'"><span>'+
      safe(team(m[side]||copy.draw,sport))+'</span><b>'+safe(Number.isInteger(m[score])?m[score]:'—')+'</b></div>').join('')+
    '</div>').join('')+'</section>').join('');
}
function standings(){
 const copy=t(),kind=refs.standingSport.value;
 const records=data.standings.filter(x=>x&&Array.isArray(x.groups)&&x.groups.length&&
    (kind==='all'||kindOf(x)===kind)).sort((a,b)=>popularity(b)-popularity(a));
 if(!records.length){refs.standingSelect.hidden=true;refs.standing.innerHTML=empty(copy.noStanding);return;}
 refs.standingSelect.hidden=false;options(refs.standingSelect,records);
 const selected=records.find(x=>String(x.id)===refs.standingSelect.value)||records[0];
 const groups=new Map();
 for(const item of selected.groups){
   if(!item||!Number.isInteger(item.rank)||!item.team)continue;
   const key=item.group||selected.title||'Ranking';
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(item);
 }
 refs.standing.innerHTML=[...groups.entries()].map(([group,list])=>
   '<section class="fixtures-standing-group"><h4>'+safe(localize(group,kindOf(selected)))+'</h4><table class="fixtures-ranking">'+
   '<thead><tr><th>'+copy.rank+'</th><th>'+copy.team+'</th><th>'+copy.wins+'</th><th>'+copy.losses+'</th></tr></thead><tbody>'+
   list.sort((a,b)=>a.rank-b.rank).slice(0,30).map(x=>'<tr><td>'+safe(x.rank)+'</td><td>'+
   safe(team(x.team,kindOf(selected)))+'</td><td>'+safe(Number.isInteger(x.wins)?x.wins:'—')+'</td><td>'+
   safe(Number.isInteger(x.losses)?x.losses:'—')+'</td></tr>').join('')+'</tbody></table></section>').join('')||empty(copy.noStanding);
}
function render(){updateLabels();if(view==='calendar')calendar();else if(view==='brackets')brackets();else standings();}
async function fetchData(){
 try{
  const result=await fetch('./data/real-sports.json?v='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(16000)});
  if(!result.ok)throw Error('Unavailable');
  const next=await result.json();
  if(next.schema!==1||next.source_type!=='official_fixtures'||!Array.isArray(next.events))throw Error('Invalid schema');
  data={...next,events:next.events.slice(0,300),brackets:Array.isArray(next.brackets)?next.brackets.slice(0,8):[],
    standings:Array.isArray(next.standings)?next.standings.slice(0,12):[]};
 }catch{data={...data,status:'failed'};}
 render();
}
views.forEach(x=>x.addEventListener('click',()=>{view=x.dataset.fixturesView;limit=6;render();}));
dates.forEach(x=>x.addEventListener('click',()=>{date=x.dataset.fixturesDate;limit=6;render();}));
refs.search.addEventListener('input',()=>{limit=6;render();});
refs.category.addEventListener('change',()=>{limit=6;render();});
refs.sort.addEventListener('change',()=>{limit=6;render();});
refs.more.addEventListener('click',()=>{limit+=6;render();});
refs.bracketSport.addEventListener('change',render);
refs.bracketSelect.addEventListener('change',render);
refs.standingSport.addEventListener('change',render);
refs.standingSelect.addEventListener('change',render);
document.querySelectorAll('#sportsLanguage [data-sports-lang]').forEach(x=>x.addEventListener('click',()=>setTimeout(render,0)));
render();fetchData();if(typeof window.setInterval==='function')window.setInterval(fetchData,15*60*1000);
})();

/* Verified official fixtures. Editorial priority != measured audience heat. */
(()=>{
'use strict';
const panel=document.getElementById('officialFixtures');if(!panel)return;
const el=id=>document.getElementById(id);
const refs={grid:el('officialFixturesGrid'),status:el('officialFixturesStatus'),count:el('officialFixturesCount'),
 search:el('officialFixturesSearch'),category:el('officialFixturesCategory'),sort:el('officialFixturesSort'),
 more:el('officialFixturesMore'),showing:el('officialFixturesShowing'),
 bracket:el('officialBracketGrid'),bracketQuick:el('officialBracketQuick'),bracketSelect:el('officialBracketSelect'),bracketSport:el('officialBracketSport'),bracketStage:el('officialBracketStage'),
 standing:el('officialStandingGrid'),standingSummary:el('officialStandingSummary'),standingQuick:el('officialStandingQuick'),standingSelect:el('officialStandingSelect'),standingSport:el('officialStandingSport')};
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
 sorts:['热门赛事优先','开赛时间优先'],formats:['全部电竞','英雄联盟','无畏契约','CS2','其他电竞'],stages:['淘汰赛','瑞士轮','小组赛'],
 ranks:['全部排名','英雄联盟','其他电竞','篮球','足球'],
 bracketSubtitle:'电竞阶段与晋级对阵',
 standingSubtitle:'多个联赛榜单可选择查看，点击榜单名称或展开卡片',
 hotHint:'按赛事知名度优先：世界赛、LPL/LCK、NBA 等；不代表真实观众人数',
 selectAllStandings:'全部可用榜单',
 bracketCount:n=>'已核验 '+n+' 个晋级图',
 rankingCount:n=>'已核验 '+n+' 份排名资料',
 noNba:'NBA 排名暂不可用，等待数据源恢复',
 points:'积分',played:'场',draws:'平',winRate:'胜率',
 esportsKind:['英雄联盟','其他电竞'],
 first:'正在等待官方赛事资料首次同步，不显示模拟比赛。',
 empty:'暂未采集到符合条件的比赛，请换个日期、项目或关键词。',
 unavailable:'暂无该阶段的赛事数据',
 noStanding:'暂无该赛事积分榜',
 updated:'最近核验',partial:'部分接口暂不可用，仅展示已核验资料。',
 stale:'当前快照超过18小时，请以赛事官方公告为准。',time:'北京时间',
 total:n=>'已收录未来7天 '+n+' 场',shown:(n,t)=>'已显示 '+n+' / '+t+' 场',
 more:'加载更多赛程',round:'轮次',draw:'待定',rank:'排名',
 team:'战队 / 球队',wins:'胜',losses:'负',feature:'重点赛事',vs:'对阵',
 source:'来源',note:'来源：PandaScore（电竞）、API-Sports（篮球赛程）、DunkAPI（NBA 排名）。足球数据由 football-data.org 提供（Data provided by football-data.org）。约每6小时采集，非实时比分；按赛事知名度排序，不代表真实观看人数。',
 market:'赛前预测市场'},
en:{title:'Calendar & tournament intelligence',
 intro:'Featured leagues, verified LoL and esports brackets, and published standings.',
 views:['Calendar','Esports brackets','Standings'],dates:['Today','Tomorrow','Next 7 days'],
 placeholder:'Search teams and competitions',category:['All sports','League of Legends','Other esports','Basketball','Football'],
 sorts:['Featured first','Kickoff time'],formats:['All esports','League of Legends','VALORANT','CS2','Other esports'],stages:['Knockout','Swiss stage','Group stage'],
 ranks:['All standings','League of Legends','Other esports','Basketball','Football'],
 bracketSubtitle:'Esports stages and brackets',
 standingSubtitle:'Select a league or expand published ranking cards',
 hotHint:'Editorial prominence: Worlds, LPL/LCK, NBA, not live viewership',
 selectAllStandings:'All available rankings',
 bracketCount:n=>n+' verified brackets',
 rankingCount:n=>n+' published rankings',
 noNba:'NBA standings unavailable until the data provider recovers',
 points:'Pts',played:'P',draws:'D',winRate:'Win%',
 esportsKind:['League of Legends','Other esports'],
 first:'Waiting for official fixture data. No sample results.',
 empty:'No scheduled matches for these filters.',
 unavailable:'No event data for this stage',
 noStanding:'No standings for this event',
 updated:'Last checked',partial:'Some providers unavailable. Verified records only.',
 stale:'Data more than 18 hours old. Check the organizer for updates.',time:'UTC+8',
 total:n=>n+' upcoming this week',shown:(n,t)=>'Showing '+n+' of '+t,
 more:'More matches',round:'Round',draw:'TBD',rank:'Rank',
 team:'Team',wins:'W',losses:'L',feature:'Featured',vs:'vs',
 source:'Source',note:'Sources: PandaScore (esports), API-Sports (basketball fixtures), DunkAPI (NBA standings). Data provided by football-data.org for soccer. Updates about every six hours; not live scores. Popularity ordering is editorial.',
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
 'LCK Challengers League':'LCK 次级联赛','LCP':'太平洋英雄联盟联赛 LCP',
 'LGC Rising':'英雄联盟 LGC 新星赛','EPL World Series':'EPL 世界系列赛',
 'DFRAG Invitational':'DFRAG 邀请赛',
 'LEC':'欧洲英雄联盟联赛 LEC','LCS':'北美英雄联盟联赛 LCS',
 'PGL Masters':'PGL 大师赛','VCT':'无畏契约冠军巡回赛 VCT',
 'VCT Game Changers':'VCT 改变者赛','PGL Masters Bucharest':'PGL 布加勒斯特大师赛',
 'NBA':'NBA 美国职业篮球联赛','NBA W':'WNBA 美国女子职业篮球联赛',
 'National Basketball Association':'NBA 美国职业篮球联赛',
 'Premier League':'英格兰超级联赛','La Liga':'西班牙甲级联赛',
 'Bundesliga':'德国甲级联赛','Serie A':'意大利甲级联赛',
 'Ligue 1':'法国甲级联赛','Eredivisie':'荷兰甲级联赛',
 'Primeira Liga':'葡萄牙超级联赛',
 'World Championship 2026':'2026 全球总决赛',
 'League of Legends World Championship':'英雄联盟全球总决赛',
 'Worlds 2026':'2026 英雄联盟全球总决赛',
 'League of Legends':'英雄联盟',
 'Counter-Strike 2':'反恐精英 2（CS2）',
 'Valorant':'无畏契约','Dota 2':'刀塔 2',
 'Swiss':'瑞士轮','Main Event':'正赛',
 'Upper Bracket':'胜者组','Lower Bracket':'败者组',
 'Elimination Stage':'淘汰赛','Group A':'A组','Group B':'B组',
 'Eastern Conference':'东部联盟','Western Conference':'西部联盟',
 'Group Stage':'小组赛','Playoffs':'淘汰赛','Play-In':'入围赛','Play-Ins':'入围赛','Regular Season':'常规赛',
 'Swiss Stage':'瑞士轮','Quarterfinals':'四分之一决赛',
 'Semifinals':'半决赛','Final':'决赛','Grand Final':'总决赛',
 'Finals':'决赛','Round of 16':'十六强赛','Ranking':'排名'
 };
 Object.assign(specials,{
  'Worlds · Play-In':'英雄联盟全球总决赛 · 入围赛',
  'Worlds · Group Stage':'英雄联盟全球总决赛 · 小组赛',
  'LCK Challengers League · Play-In':'LCK 次级联赛 · 入围赛',
  'LCK Challengers League · Playoffs':'LCK 次级联赛 · 淘汰赛',
  'LCK · Play-In':'韩国 LCK 联赛 · 入围赛',
  'Tesla Cup':'特斯拉杯','NODWIN Clutch Series':'NODWIN 电竞系列赛',
  'European Pro League':'欧洲职业联赛','United21':'United21 电竞赛事',
  'Esports Pro Circuit':'电竞职业巡回赛','Stake Ranked':'Stake 排名赛',
  'CCT Europe':'CCT 欧洲赛区','PARI Universe':'PARI 电竞赛事',
  'NBA W':'WNBA 女子篮球联赛'
 });
 if(specials[raw])return specials[raw];
 if(translated&&translated!==raw&&translated!=='英雄联盟')return translated;
 if(raw==='League of Legends')return '英雄联盟';
 // Only translate known competitive terms; unknown proper names stay original.
 return raw.replace(/\bWorlds\b/g,'全球总决赛').replace(/\bMSI\b/g,'季中冠军赛')
 .replace(/\bLeague of Legends\b/gi,'英雄联盟')
 .replace(/\bCounter-Strike\s*2\b/gi,'CS2（反恐精英2）')
 .replace(/\bValorant\b/gi,'无畏契约')
 .replace(/\bDota\s*2\b/gi,'刀塔2')
 .replace(/\bUpper Bracket\b/gi,'胜者组')
 .replace(/\bLower Bracket\b/gi,'败者组')
 .replace(/\bKnockout\b/gi,'淘汰赛')
 .replace(/\bLCK Challengers League\b/gi,'LCK 次级联赛')
 .replace(/\bLGC Rising\b/gi,'英雄联盟 LGC 新星赛')
 .replace(/\bEPL World Series\b/gi,'EPL 世界系列赛')
 .replace(/\bDFRAG Invitational\b/gi,'DFRAG 邀请赛')
 .replace(/\bPGL Masters\b/gi,'PGL 大师赛')
 .replace(/\bVCT\b/gi,'无畏契约冠军巡回赛 VCT')
 .replace(/\bPlay.Ins?\b/gi,'入围赛')
 .replace(/\bGroup Stage\b/gi,'小组赛').replace(/\bSwiss Stage\b/gi,'瑞士轮')
 .replace(/\bPlayoffs\b/gi,'淘汰赛').replace(/\bKnockout Stage\b/gi,'淘汰赛')
 .replace(/\bRegular Season\b/gi,'常规赛').replace(/\bQualifiers?\b/gi,'资格赛')
 .replace(/\bGroup ([A-Z])\b/gi,'$1组')
 .replace(/\bWeek (\d+)\b/gi,'第$1周')
 .replace(/\bRound (\d+):/gi,'第$1轮：')
 .replace(/\bMatch (\d+)\b/gi,'第$1场')
 .replace(/\bQuarterfinals?\b/gi,'四分之一决赛')
 .replace(/\bSemifinals?\b/gi,'半决赛')
 .replace(/\bGrand Finals?\b/gi,'总决赛')
 .replace(/\bFinals?\b/gi,'决赛')
 .replace(/Upper Bracket Round (\d+)(?: Match (\d+))?/gi,(_,n,m)=>'胜者组第'+n+'轮'+(m?' 第'+m+'场':''))
 .replace(/Lower Bracket Round (\d+)(?: Match (\d+))?/gi,(_,n,m)=>'败者组第'+n+'轮'+(m?' 第'+m+'场':''))
 .replace(/\bRound (\d+)\b/gi,'第$1轮');
};
const team=(v,sport)=>{
 const raw=String(v??'').trim();
 if(lang()==='en')return raw;
 // Known Chinese team names only. Unknown brands remain in official spelling.
 const known={
  'T1':'T1','Bilibili Gaming':'BLG（哔哩哔哩）','Top Esports':'TES（滔搏）',
  'Invictus Gaming':'IG','Gen.G Esports':'GEN',
  'Hanwha Life Esports':'HLE（韩华生命）','CTBC Flying Oyster':'CFO（中信飞牡蛎）',
  'Karmine Corp':'KC','G2 Esports':'G2',
  'Boston Celtics':'波士顿凯尔特人','Los Angeles Lakers':'洛杉矶湖人',
  'Golden State Warriors':'金州勇士','New York Knicks':'纽约尼克斯',
  'Brooklyn Nets':'布鲁克林篮网','Denver Nuggets':'丹佛掘金',
  'San Antonio Spurs':'圣安东尼奥马刺','Detroit Pistons':'底特律活塞',
  'Sacramento Kings':'萨克拉门托国王','Philadelphia 76ers':'费城76人',
  'Miami Heat':'迈阿密热火','Cleveland Cavaliers':'克利夫兰骑士',
  'Atlanta Hawks':'亚特兰大老鹰','Toronto Raptors':'多伦多猛龙'
 };
 Object.assign(known,{
  'Movistar KOI':'KOI','Gen.G':'GEN','Cloud9':'C9','Karmine Corp':'KC（卡尔明）',
  "Anyone's Legend":'AL','Dplus KIA':'DK',
  'Team Secret Whales':'TSW','LOS':'LOS','MVK Esports':'MVK',
  'FURIA':'FURIA','Fnatic':'FNC','Weibo Gaming':'WBG',
  'EDward Gaming':'EDG','LNG Esports':'LNG','JD Gaming':'JDG',
  'Ninjas in Pyjamas':'NIP','DRX':'DRX',
  'DN SOOPers Challengers':'DN SOOPers 二队',
  'Hanwha Life Esports Challengers':'HLE 二队',
  'BNK FearX Youth':'FOX 青训',
  'FURIA Esports':'FURIA','Team Liquid':'TL（液体）','LYON':'LYON',
  'Nongshim Red Force':'NS（农心红力）','BNK FEARX':'FOX',
  'T1 Academy':'T1 二队','KT Rolster':'KT','Kiwoom DRX Challengers':'DRX 二队',
  'KT Rolster Challengers':'KT 二队','Dplus KIA Challengers':'DK 二队',
  'Nongshim Esports Academy':'NS 青训',
  'Indiana Pacers':'印第安纳步行者','Washington Wizards':'华盛顿奇才',
  'Charlotte Hornets':'夏洛特黄蜂','Orlando Magic':'奥兰多魔术',
  'Portland Trail Blazers':'波特兰开拓者','Utah Jazz':'犹他爵士',
  'Memphis Grizzlies':'孟菲斯灰熊','Houston Rockets':'休斯敦火箭',
  'Milwaukee Bucks':'密尔沃基雄鹿','Oklahoma City Thunder':'俄克拉荷马雷霆',
  'Phoenix Suns':'菲尼克斯太阳','Atlanta Dream W':'亚特兰大梦想（WNBA）',
  'Golden State Valkyries W':'金州女武神（WNBA）'
 });
 return known[raw]||translations?.team?.(raw,sport,'zh')||raw;
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
 else if(/\blpl\b|\blck\b/.test(text))
   base=/challenger|academy|youth|次级|青训/.test(text)?275:430;
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
 const viz=window.LiangYouBracketViz;
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
 [...refs.bracketSport.options].forEach((x,i)=>x.textContent=copy.formats[i]||x.textContent);
 [...refs.bracketStage.options].forEach((x,i)=>x.textContent=copy.stages[i]);
 [...refs.standingSport.options].forEach((x,i)=>x.textContent=copy.ranks[i]);
 refs.more.textContent=copy.more;
 for(const [id,mode] of [['fixtureCalendarPanel','calendar'],['fixtureBracketsPanel','brackets'],['fixtureStandingsPanel','standings']])
  el(id).hidden=mode!==view;
 el('fixturesSortHint').textContent=copy.hotHint;
 el('officialBracketSubtitle').textContent=copy.bracketSubtitle;
 el('officialStandingSubtitle').textContent=copy.standingSubtitle;
 const node=data.generated_at?Date.parse(data.generated_at):NaN;
 refs.status.textContent=Number.isFinite(node)?(lang()==='zh'?'更新 ':'Updated ')+when(data.generated_at):'';
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
     '<div class="fixtures-cardfoot"><span class="fixtures-source">'+safe(x.provider==='pandascore'?'PandaScore':x.provider==='football-data'?'football-data.org':'API-Sports')+
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
 return /worlds|league of legends|\blol\b|\blpl\b|\blck\b|\blcp\b|\blgc\b|\blec\b|\bmsi\b/i.test(v.title||'')?'lol':'esports';
}
function options(select,items,includeAll=false){
 const current=select.value;
 select.innerHTML=(includeAll?'<option value="all">'+safe(t().selectAllStandings)+'</option>':'')+
  items.map((x,i)=>'<option value="'+safe(String(x._key||x.tournament_id||x.id||i))+'">'+
  safe(localize(x.title,kindOf(x)))+'</option>').join('');
 if(includeAll&&(current==='all'||!current))select.value='all';
 else if(items.some(x=>String(x._key||x.tournament_id||x.id)===current))select.value=current;
 else if(items[0])select.value=String(items[0]._key||items[0].tournament_id||items[0].id);
}
function bracketRound(label){
 return localize(label,'esports').replace(/^(?:Upper|Lower) Bracket Round /i,m=>m);
}
function brackets(){
 const viz=window.LiangYouBracketViz,copy=t(),kind=refs.bracketSport.value;
 if(!viz){refs.bracket.innerHTML=empty(copy.unavailable);return;}
 // Only visual bracket trees or stage progression diagrams live in this view.
 const knockout=data.brackets.filter(x=>x?.provider==='pandascore'&&Array.isArray(x.rounds)&&x.rounds.length)
  .map(x=>({...x,_key:'brk:'+x.tournament_id,_visual:'knockout'}));
 const phases=data.standings.filter(x=>x?.provider==='pandascore'&&Array.isArray(x.groups)&&x.groups.length)
  .map(x=>({...x,_key:'phase:'+x.id,_visual:viz.stageOf(x)})).filter(x=>x._visual==='swiss'||x._visual==='group');
 // When the provider has matches but no published standings, retain the
 // real Swiss fixture diagram without inventing a standings position.
 const knownIds=new Set(phases.map(x=>String(x.id).replace(/^panda-/,'')));
 const fixtureStages=new Map();
 for(const e of data.events){
  if(e.provider!=='pandascore'||!Number.isInteger(e.tournament_id)||!e.home||!e.away)continue;
  const name=[e.league,e.stage].filter(Boolean).join(' · ');
  const candidate={title:name,sport:e.sport};
  if(viz.stageOf(candidate)!=='swiss'||knownIds.has(String(e.tournament_id)))continue;
  if(!fixtureStages.has(e.tournament_id))fixtureStages.set(e.tournament_id,{
    id:'event-'+e.tournament_id,tournament_id:e.tournament_id,title:name,
    sport:e.sport,provider:'pandascore',groups:[],
    _visual:'swiss',_key:'fixture:'+e.tournament_id,prominence:e.prominence||0});
 }
 const available=[...knockout,...phases,...fixtureStages.values()].filter(x=>kind==='all'||viz.game(x)===kind);
 const priority={knockout:0,swiss:1,group:2};
 available.sort((a,b)=>(priority[a._visual]-priority[b._visual])||popularity(b)-popularity(a));
 let stage=refs.bracketStage.value;
 let records=available.filter(x=>x._visual===stage);
 if(!records.length&&available.length){
   stage=available[0]._visual;
   refs.bracketStage.value=stage;
   records=available.filter(x=>x._visual===stage);
 }
 refs.bracketQuick.innerHTML='';
 refs.bracket.classList.remove('is-groups');
 if(!records.length){
  refs.bracketSelect.hidden=true;
  refs.bracket.innerHTML=empty(copy.unavailable);
  return;
 }
 refs.bracketSelect.hidden=false;
 options(refs.bracketSelect,records);
 const chosen=records.find(x=>x._key===refs.bracketSelect.value)||records[0];
 const opts={lang:lang(),team:v=>team(v,kindOf(chosen)),
  translate:v=>bracketRound(v),events:[...(data.stage_matches||[]),...data.events]};
 const markup=chosen._visual==='knockout'?viz.knockout(chosen,opts):
  chosen._visual==='swiss'?viz.swiss(chosen,opts):viz.groups(chosen,opts);
 refs.bracket.innerHTML=markup||empty(copy.unavailable);
 if(chosen._visual==='swiss')viz.connect(refs.bracket,chosen,opts.events);
}
function standings(){
 const copy=t(),kind=refs.standingSport.value;
 const records=data.standings.filter(x=>x&&Array.isArray(x.groups)&&x.groups.length&&
    (kind==='all'||kindOf(x)===kind))
    .sort((a,b)=>popularity(b)-popularity(a));
 if(!records.length){
  refs.standingSelect.hidden=true;refs.standingQuick.innerHTML='';
  refs.standingSummary.textContent=kind==='basketball'?copy.noNba:copy.noStanding;
  refs.standing.innerHTML=empty(kind==='basketball'?copy.noNba:copy.noStanding);return;
 }
 refs.standingSelect.hidden=false;options(refs.standingSelect,records);
 const selectedId=refs.standingSelect.value;
 const selection=records.filter(x=>String(x.id)===selectedId).slice(0,1);
 refs.standingSummary.textContent='';
 refs.standingQuick.innerHTML='';
 refs.standing.innerHTML=selection.map((selected,i)=>{
  const groups=new Map();
  for(const item of selected.groups){
   if(!item||!Number.isInteger(item.rank)||!item.team)continue;
   const key=item.group||selected.title||'Ranking';
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(item);
  }
  if(!groups.size)return '';
  const sport=kindOf(selected),football=sport==='football',nba=sport==='basketball';
  const tables=[...groups.entries()].map(([group,list])=>{
   const headers=football?[copy.rank,copy.team,copy.points,copy.played,copy.wins,copy.draws,copy.losses]:
       nba?[copy.rank,copy.team,copy.wins,copy.losses,copy.winRate]:
       [copy.rank,copy.team,copy.wins,copy.losses];
   const rows=list.sort((a,b)=>a.rank-b.rank).slice(0,30).map(x=>{
    const value=v=>Number.isInteger(v)?safe(v):'—';
    const tds=football?[value(x.rank),safe(team(x.team,sport)),value(x.points),value(x.played),value(x.wins),value(x.draws),value(x.losses)]:
        nba?[value(x.rank),safe(team(x.team,sport)),value(x.wins),value(x.losses),
          Number.isFinite(x.win_pct)?safe((x.win_pct*100).toFixed(1)+'%'):'—']:
        [value(x.rank),safe(team(x.team,sport)),value(x.wins),value(x.losses)];
    return '<tr>'+tds.map(v=>'<td>'+v+'</td>').join('')+'</tr>';
   }).join('');
   return '<section class="fixtures-standing-group"><h4>'+safe(localize(group,sport))+
    '</h4><div class="fixtures-table-scroll"><table class="fixtures-ranking'+(football?' is-football':'')+'">'+
    '<thead><tr>'+headers.map(h=>'<th>'+safe(h)+'</th>').join('')+'</tr></thead><tbody>'+
    rows+'</tbody></table></div></section>';
  }).join('');
  return '<details class="fixtures-standing-card"'+(i<3||selection.length===1?' open':'')+'>'+
   '<summary><span>'+safe(kindOf(selected)==='lol'?copy.esportsKind[0]:
     kindOf(selected)==='esports'?copy.esportsKind[1]:kindOf(selected)==='football'?copy.ranks[4]:copy.ranks[3])+' · '+
     safe(localize(selected.title,kindOf(selected)))+'</span>'+
   '<span class="fixtures-standing-num">'+safe(selected.groups.length)+' '+safe(copy.team)+'</span></summary>'+
   '<div class="fixtures-standing-tables">'+tables+'</div></details>';
 }).join('')||empty(copy.noStanding);
}
function render(){updateLabels();if(view==='calendar')calendar();else if(view==='brackets')brackets();else standings();}
async function fetchData(){
 try{
  const fetchJson=async url=>{
   const result=await fetch(url+'?v='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(16000)});
   if(!result.ok)throw Error('Unavailable');
   return result.json();
  };
  const base=await fetchJson('./data/real-sports.json');
  if(base.schema!==1||base.source_type!=='official_fixtures'||!Array.isArray(base.events))
   throw Error('Invalid official snapshot schema');
  let extra=null;
  try{
   const candidate=await fetchJson('./data/extra-sports.json');
   if(candidate.schema===1&&candidate.source_type==='supplemental_fixtures'&&
      Array.isArray(candidate.events)&&Array.isArray(candidate.standings))extra=candidate;
  }catch{/* Optional provider unavailable; retain working PandaScore and API-Sports data. */}
  const published=extra?extra.standings:[];
  const events=extra?[...base.events,...extra.events]:base.events;
  const dedupe=items=>{
   const seen=new Set();
   return items.filter(x=>{
    if(!x||!x.id||seen.has(x.id))return false;
    seen.add(x.id);return true;
   });
  };
  data={...base,
    events:dedupe(events).slice(0,500),
    brackets:Array.isArray(base.brackets)?base.brackets.slice(0,16):[],
    standings:dedupe([...(base.standings||[]),...published]).slice(0,24),
    sources:[...(base.sources||[]),...(extra?.sources||[])],
    extraStatus:extra?.status||'unavailable',
    generated_at:base.generated_at};
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
refs.bracketStage.addEventListener('change',render);
refs.bracketSelect.addEventListener('change',render);
refs.bracketQuick.addEventListener('click',e=>{
 const btn=e.target.closest('[data-fixtures-tournament]');
 if(!btn)return;
 refs.bracketSelect.value=btn.dataset.fixturesTournament;
 render();
});
refs.standingSport.addEventListener('change',render);
refs.standingSelect.addEventListener('change',render);
refs.standingQuick.addEventListener('click',event=>{
 const button=event.target.closest('[data-fixtures-standing]');
 if(!button)return;
 refs.standingSelect.value=button.dataset.fixturesStanding;
 render();
});
document.querySelectorAll('#sportsLanguage [data-sports-lang]').forEach(x=>x.addEventListener('click',()=>setTimeout(render,0)));
render();fetchData();if(typeof window.setInterval==='function')window.setInterval(fetchData,15*60*1000);
if(typeof window.addEventListener==='function')window.addEventListener('resize',()=>{if(view==='brackets')render();},{passive:true});
})();

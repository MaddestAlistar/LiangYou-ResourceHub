/* Verified official fixtures. Editorial priority != measured audience heat. */
(()=>{
'use strict';
const panel=document.getElementById('officialFixtures');if(!panel)return;
const el=id=>document.getElementById(id);
const refs={grid:el('officialFixturesGrid'),status:el('officialFixturesStatus'),count:el('officialFixturesCount'),
 search:el('officialFixturesSearch'),category:el('officialFixturesCategory'),sort:el('officialFixturesSort'),
 more:el('officialFixturesMore'),showing:el('officialFixturesShowing'),
 state:el('officialFixturesState'),detail:el('officialFixtureDetail'),
 bracket:el('officialBracketGrid'),bracketQuick:el('officialBracketQuick'),bracketSelect:el('officialBracketSelect'),bracketSport:el('officialBracketSport'),bracketStage:el('officialBracketStage'),
 bracketRound:el('officialBracketRound'),bracketFocus:el('officialBracketFocus'),bracketExpand:el('officialBracketExpand'),
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
 nbaNote:'按胜率排序，同战绩并列；未采用 NBA 官方复杂决胜规则。',
 staleBoard:'上次核验的数据',staleOption:'（上次数据）',
 points:'积分',played:'场',draws:'平',winRate:'胜率',
 esportsKind:['英雄联盟','其他电竞'],
 first:'正在等待官方赛事资料首次同步，不显示模拟比赛。',
 empty:'暂未采集到符合条件的比赛，请换个日期、项目或关键词。',
 unavailable:'暂无该阶段的赛事数据',
 noStanding:'暂无该赛事积分榜',
 rankingOnly:'当前仅有名次数据，数据源未提供胜负记录；“—”不代表 0。',
 lckStageNote:'当前仅收录 LCK 第3—4轮传奇组的阶段排名（5支队伍），不是全年总积分榜；崛起组未收录。',
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
 nbaNote:'Sorted by win rate; tied records share a rank. Official tiebreakers are not applied.',
 staleBoard:'Previously verified data',staleOption:' (previous)',
 points:'Pts',played:'P',draws:'D',winRate:'Win%',
 esportsKind:['League of Legends','Other esports'],
 first:'Waiting for official fixture data. No sample results.',
 empty:'No scheduled matches for these filters.',
 unavailable:'No event data for this stage',
 noStanding:'No standings for this event',
 rankingOnly:'Only rank positions are available; the source did not supply wins or losses. Dashes do not mean zero.',
 lckStageNote:'This is the Legend Group table for LCK rounds 3–4 (five teams), not complete season standings. Rise Group is not included.',
 updated:'Last checked',partial:'Some providers unavailable. Verified records only.',
 stale:'Data more than 18 hours old. Check the organizer for updates.',time:'UTC+8',
 total:n=>n+' upcoming this week',shown:(n,t)=>'Showing '+n+' of '+t,
 more:'More matches',round:'Round',draw:'TBD',rank:'Rank',
 team:'Team',wins:'W',losses:'L',feature:'Featured',vs:'vs',
 source:'Source',note:'Sources: PandaScore (esports), API-Sports (basketball fixtures), DunkAPI (NBA standings). Data provided by football-data.org for soccer. Updates about every six hours; not live scores. Popularity ordering is editorial.',
 market:'Prediction markets'}
};
let data={events:[],brackets:[],standings:[],generated_at:null,status:'pending'};
let view='calendar',date='week',limit=6,detailId=null,selectedBracketMatch=null;
let fetchPending=false,archiveCache=null,extraCache=null,lastSnapshotSignature='';
const linker=window.LiangYouSportsLinks;
const lang=()=>panel.closest('#sports')?.getAttribute('lang')==='en'?'en':'zh';
const t=()=>strings[lang()];
const localize=(v,category='')=>{
 const raw=String(v??'').trim();
 if(raw==='LCK · Round 3-4 Legend Group')return lang()==='zh'
  ?'LCK 常规赛 · 第3—4轮 · 传奇组（阶段榜）'
  :'LCK Regular Season · Rounds 3–4 · Legend Group (stage standings)';
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
 'LCK · Round 3-4':'LCK · 第3—4轮 · 分组阶段榜',
 'LCK · 2026 Rounds 3-4':'LCK · 2026赛季第3—4轮 · 最终分组榜',
 'LPL · 2026 Split 3 Regular Season':'LPL · 2026第三赛段 · 最终分组榜',
 'LPL · Group Stage':'LPL · 登峰组与涅槃组 · 阶段榜',
 'Legend Group':'传奇组','Rise Group':'崛起组',
 'Group Ascend':'登峰组','Group Nirvana':'涅槃组',
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
 const copy=t();
 const modes=lang()==='zh'?['即将开始','进行中（上次核验）','最近完赛']:
   ['Upcoming','In progress (snapshot)','Recent results'];
 [...refs.state.options].forEach((option,i)=>{option.textContent=modes[i]||option.textContent;});
 refs.bracketExpand.textContent=lang()==='zh'?(refs.bracket.classList.contains('is-expanded')?'关闭全屏':'全屏查看'):
  (refs.bracket.classList.contains('is-expanded')?'Close fullscreen':'Fullscreen');
 el('officialBracketRoundLabel').textContent=lang()==='zh'?'快速定位轮次':'Jump to round';el('officialFixturesTitle').textContent=copy.title;
 const viz=window.LiangYouBracketViz;
 el('officialFixturesIntro').textContent=copy.intro;
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
 // Only show a single public verification timestamp; preserve diagnostics in data.
 const checks=[data.generated_at,data.extraGeneratedAt].map(x=>Date.parse(x||''))
  .filter(Number.isFinite);
 refs.status.textContent=checks.length?
  (lang()==='zh'?'最近数据核验：':'Last data check: ')+
  when(new Date(Math.max(...checks)).toISOString()):
  (lang()==='zh'?'等待数据核验':'Waiting for data verification');
}
function showFixtureDetail(id){
 detailId=id;
 const x=data.events.find(row=>String(row.id)===String(id));
 if(!x){refs.detail.hidden=true;refs.detail.innerHTML='';return;}
 // Match detail must obey the same quote-age ceiling as the market panel.
 // Never surface old odds just because a fixture record is still available.
 const freshMarkets=(window.LiangYouMarketRecords||[]).filter(m=>{
  const verified=Date.parse(m.checked_at||'');
  const start=Date.parse(m.start_time||'');
  return Number.isFinite(verified)&&Date.now()-verified<=6*3600000&&
    verified<=Date.now()+3600000&&Number.isFinite(start)&&start>Date.now();
 });
 const market=linker?.marketsFor(x,freshMarkets)||[];
 const group=market.flatMap(g=>g.sources);
 const label=lang()==='zh';
 const whenAt=when(x.start_time);
 const complete=x.status==='finished';
 const score=complete&&Number.isFinite(x.score_home)&&Number.isFinite(x.score_away)?
  safe(String(x.score_home)+' : '+String(x.score_away)):(label?'暂无已核验终场比分':'No verified final score');
 const state=x.status==='finished'?(label?'已完赛':'Finished'):
  x.status==='live'?(label?'进行中（上次核验）':'In progress (snapshot)'):(label?'尚未开始':'Upcoming');
 const source=x.provider==='pandascore'?'PandaScore':x.provider==='football-data'?'football-data.org':'API-Sports';
 const bracket=data.brackets.find(b=>Number(b.tournament_id)===Number(x.tournament_id) &&
  b.rounds?.some(r=>r.matches?.some(m=>linker?.pairs(x,{
     sport:x.sport,home:m.home,away:m.away,start_time:m.start_time||x.start_time
  },90))));
 const table=data.standings.find(b=>
   b.sport===x.sport && String(b.title||'').toLowerCase().includes(String(x.league||'').toLowerCase()) &&
   x.league);
 refs.detail.hidden=false;
 refs.detail.innerHTML='<div class="fixtures-detail-head"><strong>'+safe(team(x.home,x.sport))+
  ' · '+safe(team(x.away,x.sport))+'</strong><button type="button" data-close-fixture aria-label="'+
  (label?'关闭详情':'Close detail')+'">×</button></div>'+
  '<div class="fixtures-detail-meta">'+safe(localize(x.league,x.sport))+' · '+safe(state)+
  ' · '+safe(whenAt)+' · '+safe(source)+'</div>'+
  (complete?'<div class="fixtures-detail-score">'+score+'</div>':'')+
  (x.status==='live'?'<p class="fixtures-detail-caution">'+
   (label?'这是定时采集快照，不代表实时比分。':'Periodic snapshot, not a live score.')+'</p>':'')+
  '<div class="fixtures-detail-actions">'+
  (bracket?'<button type="button" data-fixture-bracket="'+safe(bracket.tournament_id)+'">'+
    (label?'在晋级图中查看':'View bracket')+'</button>':'')+
  (table?'<button type="button" data-fixture-standings="'+safe(table.id)+'">'+
    (label?'查看相关联赛积分榜':'Open league standings')+'</button>':'')+
  (group.length?'<button type="button" data-fixture-market="'+safe(x.id)+'">'+
    (label?'查看赛前市场卡片':'Open market cards')+'</button>':'')+'</div>'+
  '<div class="fixtures-detail-markets"><strong>'+
    (label?'已关联的赛前预测市场':'Matched prediction-market snapshots')+'</strong>'+
    (group.length?group.map(g=>{
       const site=g.provider==='predict'?'Predict.fun':g.provider==='kalshi'?'Kalshi':'Polymarket';
       const probabilities=(g.outcomes||[]).map(o=>team(o.name,x.sport)+' '+
         (Number.isFinite(o.probability)?(o.probability*100).toFixed(1)+'%':'—')).join(' · ');
       const asOf=Number.isFinite(Date.parse(g.checked_at||''))?when(g.checked_at):'—';
       return '<span class="fixtures-market-source">'+safe(site)+' · '+safe(probabilities)+
         ' · '+(label?'采集于 ':'Captured ')+safe(asOf)+'</span>';
    }).join(''):
     '<small>'+(label?'暂无可确认的同场市场数据':'No confidently matched market')+'</small>')+
  '</div>';
}
function calendar(){
 const copy=t(),now=Date.now(),until=now+7*86400000,state=refs.state.value||'scheduled';
 const today=dayKey(new Date()),tomorrow=dayKey(new Date(now+86400000));
 const query=refs.search.value.trim().normalize('NFKC').toLocaleLowerCase();
 dates.forEach(node=>{node.hidden=state!=='scheduled'});
 let matches=data.events.filter(x=>{
  if(x.status!==state)return false;
  const instant=Date.parse(x.start_time);
  if(!Number.isFinite(instant))return false;
  if(state==='scheduled'){
   if(instant<now-120000||instant>until)return false;
   if(date==='today'&&dayKey(new Date(instant))!==today)return false;
   if(date==='tomorrow'&&dayKey(new Date(instant))!==tomorrow)return false;
  }else if(instant<now-(state==='live'?24:48)*3600000||instant>now+3600000)return false;
  if(refs.category.value!=='all'&&x.sport!==refs.category.value)return false;
  return !query||[x.home,x.away,x.league,x.stage,x.sport,
    team(x.home,x.sport),team(x.away,x.sport),
    localize(x.league,x.sport),localize(x.stage,x.sport)].join(' ').normalize('NFKC').toLocaleLowerCase().includes(query);
 });
 // Past results should show the most recently completed matches first;
 // future schedules still show earliest kickoff first for time sorting.
 if(state==='finished'){
  const newest=(a,b)=>Date.parse(b.start_time)-Date.parse(a.start_time);
  matches=[...matches].sort((a,b)=>refs.sort.value==='time'?newest(a,b):
   popularity(b)-popularity(a)||newest(a,b));
 }else{
  matches=refs.sort.value==='time'?[...matches].sort((a,b)=>
   Date.parse(a.start_time)-Date.parse(b.start_time)):topPriority(matches);
 }
 refs.grid.innerHTML=matches.length?matches.slice(0,limit).map(x=>{
  const title=[localize(x.league,x.sport),localize(x.stage,x.sport),
     Number.isInteger(x.best_of)?'BO'+x.best_of:null].filter(Boolean).join(' · ');
  const score=x.status==='finished'&&Number.isFinite(x.score_home)&&Number.isFinite(x.score_away)?
    '<span class="fixtures-score">'+safe(x.score_home)+' : '+safe(x.score_away)+'</span>':'';
  const status=x.status==='live'?(lang()==='zh'?'进行中 · 非实时':'Live status · delayed'):
    x.status==='finished'?(lang()==='zh'?'已结束':'Final'):null;
  return '<article class="fixtures-card"><div class="fixtures-cardtop"><strong>'+safe(title)+
    '</strong><span>'+safe(when(x.start_time))+'</span></div>'+
    '<div class="fixtures-versus">'+safe(team(x.home,x.sport))+' <em>'+safe(copy.vs)+'</em> '+
    safe(team(x.away,x.sport))+'</div>'+score+
    '<div class="fixtures-cardfoot"><span class="fixtures-source">'+safe(x.provider==='pandascore'?'PandaScore':
    x.provider==='football-data'?'football-data.org':'API-Sports')+'</span>'+
    (status?'<span class="fixtures-state-tag">'+safe(status)+'</span>':
    popularity(x)>=390?'<span class="fixtures-featured">'+safe(copy.feature)+'</span>':'')+
    '<button type="button" class="fixtures-detail-btn" data-fixture-id="'+safe(x.id)+'">'+
      (lang()==='zh'?'查看详情':'Details')+'</button></div></article>';
 }).join(''):empty(data.generated_at?copy.empty:copy.first);
 const total=matches.length;
 refs.count.textContent=state==='scheduled'?copy.total(data.events.filter(x=>x.status==='scheduled'&&
  Date.parse(x.start_time)>=now&&Date.parse(x.start_time)<=until).length):
  (lang()==='zh'?'当前筛选 '+total+' 场':'Filtered '+total+' matches');
 refs.showing.textContent=copy.shown(Math.min(matches.length,limit),matches.length);
 refs.more.hidden=matches.length<=limit;
 if(detailId)showFixtureDetail(detailId);
}
function kindOf(v){
 if(v.sport)return v.sport;
 if(v.kind==='basketball')return 'basketball';
 return /worlds|league of legends|\blol\b|\blpl\b|\blck\b|\blcp\b|\blgc\b|\blec\b|\bmsi\b/i.test(v.title||'')?'lol':'esports';
}
function consolidatedStandings(records){
 const out=[],paired=new Map();
 for(const record of records){
  const title=String(record.title||'');
  const lck=/^LCK\s*·\s*Round 3-4\s+(?:Legend|Rise) Group$/i.test(title);
  const lpl=/^LPL\s*·\s*Group (?:Ascend|Nirvana)$/i.test(title);
  const key=lck?'lck-2026-round34':lpl?'lpl-2026-split3':null;
  if(!key){out.push(record);continue;}
  if(!paired.has(key))paired.set(key,[]);
  paired.get(key).push(record);
 }
 for(const [key,items] of paired){
  const lck=key.startsWith('lck');
  const expected=lck?['Legend Group','Rise Group']:['Group Ascend','Group Nirvana'];
  const groups=items.flatMap(item=>item.groups.map(r=>({...r,
   group:r.group||item.phase_group||(/legend/i.test(item.title)?'Legend Group':
   /rise/i.test(item.title)?'Rise Group':/ascend/i.test(item.title)?'Group Ascend':'Group Nirvana')})));
  const seen=new Set(groups.map(r=>r.group));
  out.push({...items[0],id:key,title:lck?'LCK · Round 3-4':'LPL · Group Stage',
   groups,missing_groups:expected.filter(g=>!seen.has(g)),record_count:items.length,
   is_combined:true,phase_family:key,status:items.some(x=>x.status==='stale')?'stale':items[0].status});
 }
 return out;
}
function options(select,items,includeAll=false){
 const current=select.value;
 select.innerHTML=(includeAll?'<option value="all">'+safe(t().selectAllStandings)+'</option>':'')+
  items.map((x,i)=>'<option value="'+safe(String(x._key||x.tournament_id||x.id||i))+'">'+
  safe(localize(x.title,kindOf(x))+(x.status==='stale'?t().staleOption:''))+'</option>').join('');
 if(includeAll&&(current==='all'||!current))select.value='all';
 else if(items.some(x=>String(x._key||x.tournament_id||x.id)===current))select.value=current;
 else if(items[0])select.value=String(items[0]._key||items[0].tournament_id||items[0].id);
}
function bracketRound(label){
 return localize(label,'esports').replace(/^(?:Upper|Lower) Bracket Round /i,m=>m);
}
function setupBracketControls(chosen){
 const active=chosen?._visual==='knockout';
 el('officialBracketRoundLabel').hidden=!active;
 refs.bracketRound.hidden=!active;refs.bracketExpand.hidden=!active;
 refs.bracketFocus.hidden=!active||!selectedBracketMatch;
 const candidates=active&&typeof refs.bracket.querySelectorAll==='function'?
  [...refs.bracket.querySelectorAll('.lyb-round-name[data-col]')]:[];
 const unique=new Map();
 candidates.forEach(x=>{const col=Number(x.dataset.col);
  if(Number.isFinite(col)&&!unique.has(col))unique.set(col,x.textContent.trim());
 });
 refs.bracketRound.innerHTML=[...unique].sort((a,b)=>a[0]-b[0]).map(([col,name])=>
  '<option value="'+col+'">'+safe(name)+'</option>').join('');
 if(active&&selectedBracketMatch)highlightBracket(selectedBracketMatch);
}
function highlightBracket(id){
 const root=refs.bracket;
 if(typeof root.querySelectorAll!=='function')return;
 const cards=[...root.querySelectorAll('.lyb-match[data-match-id]')];
 const paths=[...root.querySelectorAll('.lyb-bracket-edge[data-from][data-to]')];
 const target=cards.find(m=>m.dataset.matchId===String(id));
 if(!target){selectedBracketMatch=null;refs.bracketFocus.hidden=true;return;}
 // Follow verified predecessors backwards and descendants forwards, separately.
 // Undirected traversal would incorrectly highlight unrelated sibling paths.
 const ancestors=new Set([String(id)]),descendants=new Set([String(id)]);
 for(let repeat=0;repeat<cards.length;repeat++){
  let changed=false;
  for(const line of paths){
   if(ancestors.has(line.dataset.to)&&!ancestors.has(line.dataset.from)){
    ancestors.add(line.dataset.from);changed=true;
   }
   if(descendants.has(line.dataset.from)&&!descendants.has(line.dataset.to)){
    descendants.add(line.dataset.to);changed=true;
   }
  }
  if(!changed)break;
 }
 const keep=new Set([...ancestors,...descendants]);
 for(const card of cards){
  const selected=card.dataset.matchId===String(id);
  card.classList.toggle('is-path',keep.has(card.dataset.matchId));
  card.classList.toggle('is-focused',selected);
  card.classList.toggle('is-muted',!keep.has(card.dataset.matchId));
  card.setAttribute('aria-pressed',String(selected));
 }
 for(const path of paths){
  const linked=(ancestors.has(path.dataset.from)&&ancestors.has(path.dataset.to))||
   (descendants.has(path.dataset.from)&&descendants.has(path.dataset.to));
  path.classList.toggle('is-path',linked);
  path.classList.toggle('is-muted',!linked);
 }
 selectedBracketMatch=String(id);
 refs.bracketFocus.hidden=false;
 refs.bracketFocus.textContent=(lang()==='zh'?'已选中真实比赛 · ':'Verified selected match · ')+
  target.textContent.trim().replace(/\s+/g,' ').slice(0,160);
}
function jumpBracketColumn(){
 const scroll=refs.bracket.querySelector?.('.lyb-scroll');
 const node=[...(refs.bracket.querySelectorAll?.('.lyb-round-name[data-col]')||[])]
  .find(x=>x.dataset.col===refs.bracketRound.value);
 if(!scroll||!node)return;
 const left=Number(node.dataset.col)*((typeof window.innerWidth==='number'&&window.innerWidth<=680)?212:282);
 if(typeof scroll.scrollTo==='function')scroll.scrollTo({left:Math.max(0,left-10),behavior:'smooth'});
}
function brackets(){
 const viz=window.LiangYouBracketViz,copy=t(),kind=refs.bracketSport.value;
 if(!viz){refs.bracket.innerHTML=empty(copy.unavailable);return;}
 // Only visual bracket trees or stage progression diagrams live in this view.
 const knockout=data.brackets.filter(x=>x?.provider==='pandascore'&&Array.isArray(x.rounds)&&x.rounds.length)
  .map(x=>({...x,_key:'brk:'+x.tournament_id,_visual:'knockout'}));
 const phases=consolidatedStandings(data.standings.filter(x=>(x?.provider==='pandascore'||x?.historical_final===true)&&Array.isArray(x.groups)&&x.groups.length))
  .map(x=>({...x,_key:'phase:'+x.id,_visual:x.is_combined||x.historical_final?'group':viz.stageOf(x)}))
  .filter(x=>x._visual==='swiss'||x._visual==='group');
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
 setupBracketControls(chosen);
 if(chosen._visual==='swiss')viz.connect(refs.bracket,chosen,opts.events);
}
function standings(){
 const copy=t(),kind=refs.standingSport.value;
 const records=consolidatedStandings(data.standings.filter(x=>x&&Array.isArray(x.groups)&&x.groups.length&&
    (kindOf(x)==='football'||x.groups.some(row=>Number.isInteger(row.wins)&&Number.isInteger(row.losses)))))
    .filter(x=>(kind==='all'||kindOf(x)===kind))
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
  const orderNote=selected.order_method==='win_pct'?'<p class="fixtures-ranking-note">'+safe(copy.nbaNote)+'</p>':'';
  const archiveNote=selected.historical_final?'<p class="fixtures-ranking-note">'+
   safe(lang()==='zh'?'2026年已完赛阶段的最终排名（历史快照，不是实时赛事），独立于 PandaScore 动态数据。':'Final historical 2026 standings; not live PandaScore results.')+'</p>':'';
  const sourceUrl=selected.historical_final&&/^https:\/\/(?:lolesports\.com|www\.sheepesports\.com)\//.test(selected.source_url||'')?
   '<p class="fixtures-ranking-note"><a href="'+safe(selected.source_url)+'" target="_blank" rel="noopener noreferrer">'+
   safe(lang()==='zh'?'查看原始赛事成绩':'Original event standings')+'</a></p>':'';
  const stageNote=selected.is_combined?'<p class="fixtures-ranking-note">'+
   safe(lang()==='zh'?'同赛段分组集中展示，排名与战绩来自已核验数据源；不等同于全年总榜。':'Grouped verified phase records, not full-season standings.')+'</p>':
   selected.title==='LCK · Round 3-4 Legend Group'?'<p class="fixtures-ranking-note">'+safe(copy.lckStageNote)+'</p>':'';
  const rules=selected.phase_family==='lck-2026-round34'?
   (lang()==='zh'?'赛制规则：传奇组第1—2名进入季后赛第二轮，第3—4名进入季后赛第一轮，第5名进入入围赛；崛起组第1—3名进入入围赛，第4—5名淘汰。':'Format: Legend top 2 to playoff R2, next 2 to R1, fifth to play-in; Rise top 3 to play-in, bottom 2 eliminated.'):
   selected.phase_family==='lpl-2026-split3'?
   (lang()==='zh'?'赛制规则：登峰组前6名进入季后赛；第7—8名与涅槃组前2名参加骑士之路，争夺季后赛名额；涅槃组后2名淘汰。':'Format: Ascend top six to playoffs; Ascend bottom two and Nirvana top two enter the Knights Path playoff qualifier. Nirvana bottom two are eliminated.'):'';
  const rulesNote=rules?'<p class="fixtures-ranking-note">'+safe(rules+(lang()==='zh'?' 仅说明赛制，当前排名不自动判定已晋级。':' Rules only; published ranks do not automatically confirm qualification.'))+'</p>':'';
  const missingNote=selected.missing_groups?.length?'<p class="fixtures-ranking-note is-stale">'+
   safe((lang()==='zh'?'以下分组暂未获得可靠数据：':'Missing verified groups: ')+selected.missing_groups.map(x=>localize(x)).join(' / '))+'</p>':'';
  const staleNote=selected.status==='stale'?'<p class="fixtures-ranking-note is-stale">'+
    safe(copy.staleBoard)+(selected.verified_at?' · '+safe(when(selected.verified_at)):'')+'</p>':'';
  const tables=[...groups.entries()].map(([group,list])=>{
   const headers=football?[copy.rank,copy.team,copy.points,copy.played,copy.wins,copy.draws,copy.losses]:
       nba?[copy.rank,copy.team,copy.wins,copy.losses,copy.winRate]:
       [copy.rank,copy.team,copy.wins,copy.losses,copy.winRate];
   const rows=list.sort((a,b)=>a.rank-b.rank).slice(0,30).map(x=>{
    const value=v=>Number.isInteger(v)?safe(v):'—';
    const tds=football?[value(x.rank),safe(team(x.team,sport)),value(x.points),value(x.played),value(x.wins),value(x.draws),value(x.losses)]:
        nba?[value(x.rank),safe(team(x.team,sport)),value(x.wins),value(x.losses),
          Number.isFinite(x.win_pct)?safe((x.win_pct*100).toFixed(1)+'%'):'—']:
        [value(x.rank),safe(team(x.team,sport)),value(x.wins),value(x.losses),
         Number.isInteger(x.wins)&&Number.isInteger(x.losses)&&x.wins+x.losses>0?
         safe((100*x.wins/(x.wins+x.losses)).toFixed(1)+'%'):'—'];
    return '<tr>'+tds.map(v=>'<td>'+v+'</td>').join('')+'</tr>';
   }).join('');
   const rankOnly=!football&&!nba&&list.every(x=>!Number.isInteger(x.wins)&&!Number.isInteger(x.losses));
   return '<section class="fixtures-standing-group"><h4>'+safe(localize(group,sport))+
    '</h4>'+(rankOnly?'<p class="fixtures-ranking-note">'+safe(copy.rankingOnly)+'</p>':'')+
    '<div class="fixtures-table-scroll"><table class="fixtures-ranking'+(football?' is-football':'')+'">'+
    '<thead><tr>'+headers.map(h=>'<th>'+safe(h)+'</th>').join('')+'</tr></thead><tbody>'+
    rows+'</tbody></table></div></section>';
  }).join('');
  return '<details class="fixtures-standing-card"'+(i<3||selection.length===1?' open':'')+'>'+
   '<summary><span>'+safe(kindOf(selected)==='lol'?copy.esportsKind[0]:
     kindOf(selected)==='esports'?copy.esportsKind[1]:kindOf(selected)==='football'?copy.ranks[4]:copy.ranks[3])+' · '+
     safe(localize(selected.title,kindOf(selected)))+'</span>'+
   '<span class="fixtures-standing-num">'+safe(selected.groups.length)+' '+safe(copy.team)+'</span></summary>'+
   '<div class="fixtures-standing-tables">'+staleNote+orderNote+archiveNote+sourceUrl+stageNote+missingNote+rulesNote+tables+'</div></details>';
 }).join('')||empty(copy.noStanding);
}
function render(){updateLabels();if(view==='calendar')calendar();else if(view==='brackets')brackets();else standings();}
async function fetchData(){
 if(fetchPending)return;
 fetchPending=true;
 try{
  const fetchJson=async url=>{
   const result=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(16000)});
   if(!result.ok)throw Error('Unavailable');
   return result.json();
  };
  // Concurrent fetches avoid three sequential 16-second waits on slow networks.
  // The completed 2026 archive is immutable for this browsing session.
  const [base,extraRaw,archiveRaw]=await Promise.all([
    fetchJson('./data/real-sports.json'),
    fetchJson('./data/extra-sports.json').catch(()=>null),
    archiveCache?Promise.resolve(archiveCache):
      fetchJson('./data/verified-lol-2026.json').catch(()=>null)
  ]);
  if(base.schema!==1||base.source_type!=='official_fixtures'||!Array.isArray(base.events))
   throw Error('Invalid official snapshot schema');
  const extra=extraRaw?.schema===1&&extraRaw.source_type==='supplemental_fixtures'&&
    Array.isArray(extraRaw.events)&&Array.isArray(extraRaw.standings)?extraRaw:null;
  if(extra)extraCache=extra;
  // Retain earlier verified NBA/football snapshots when an optional feed
  // fails. Never label these retained records as freshly verified.
  const usableExtra=extra||extraCache;
  const published=usableExtra?usableExtra.standings.map(x=>extra?x:
    {...x,status:'stale',verified_at:x.verified_at||usableExtra.generated_at}):[];
  const historic=archiveRaw?.schema===1&&archiveRaw.source_type==='verified_completed_esports_standings'&&
    Number(archiveRaw.season)===2026&&Array.isArray(archiveRaw.standings)&&
    archiveRaw.standings.every(x=>x.historical_final&&Array.isArray(x.groups)&&x.source_url)?
    archiveRaw.standings:[];
  if(historic.length)archiveCache=archiveRaw;
  const signature=[base.generated_at,base.status,usableExtra?.generated_at||'',
    extra?.status||'stale',archiveCache?.generated_at||''].join('|');
  // An earlier transient fetch failure must clear on the next successful
  // request even if the server returned an unchanged snapshot.
  if(signature===lastSnapshotSignature&&data.status!=='failed')return;
  lastSnapshotSignature=signature;
  const events=usableExtra?[...base.events,...usableExtra.events]:base.events;
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
    // 2026 final archives take precedence over incomplete 2026 phase snapshots.
    standings:dedupe([...(base.standings||[]).filter(x=>
      !(historic.length&&String(base.generated_at||'').startsWith('2026-')&&
      (/^LCK · Round 3-4 (?:Legend|Rise) Group$/i.test(x.title||'')||
       /^LPL · Group (?:Ascend|Nirvana)$/i.test(x.title||'')))),
      ...published,...historic]).slice(0,24),
    sources:[...(base.sources||[]),...(usableExtra?.sources||[])],
    extraStatus:extra?.status||(usableExtra?'stale':'unavailable'),
    extraGeneratedAt:usableExtra?.generated_at||null,
    generated_at:base.generated_at,officialSources:base.sources||[],
    extraSources:(usableExtra?.sources||[]).map(x=>extra?x:{...x,status:'stale'})};
  window.LiangYouOfficialSportsEvents=data.events;
  if(typeof window.dispatchEvent==='function'&&typeof CustomEvent==='function')
    window.dispatchEvent(new CustomEvent('liangyou:fixtures-updated'));
  
  render();
 }catch{data={...data,status:'failed'};render();}
 finally{fetchPending=false;}
}
views.forEach(x=>x.addEventListener('click',()=>{view=x.dataset.fixturesView;limit=6;render();}));
dates.forEach(x=>x.addEventListener('click',()=>{date=x.dataset.fixturesDate;limit=6;render();}));
refs.search.addEventListener('input',()=>{limit=6;render();});
refs.category.addEventListener('change',()=>{limit=6;render();});
refs.sort.addEventListener('change',()=>{limit=6;render();});
refs.more.addEventListener('click',()=>{limit+=6;render();});
refs.state.addEventListener('change',()=>{detailId=null;refs.detail.hidden=true;limit=6;render();});
refs.grid.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-fixture-id]');
 if(button)showFixtureDetail(button.dataset.fixtureId);
});
refs.detail.addEventListener('click',event=>{
 const close=event.target.closest?.('[data-close-fixture]');
 if(close){detailId=null;refs.detail.hidden=true;refs.detail.innerHTML='';return;}
 const bracket=event.target.closest?.('[data-fixture-bracket]');
 if(bracket){view='brackets';refs.bracketStage.value='knockout';
   refs.bracketSport.value='all';refs.bracketSelect.value='brk:'+bracket.dataset.fixtureBracket;render();
   refs.bracket.scrollIntoView?.({behavior:'smooth',block:'start'});return;}
 const marketButton=event.target.closest?.('[data-fixture-market]');
 if(marketButton&&typeof window.dispatchEvent==='function'&&typeof CustomEvent==='function'){
   window.dispatchEvent(new CustomEvent('liangyou:open-market',{detail:{id:marketButton.dataset.fixtureMarket}}));
   return;
 }
 const standings=event.target.closest?.('[data-fixture-standings]');
 if(standings){view='standings';refs.standingSport.value='all';
   refs.standingSelect.value=standings.dataset.fixtureStandings;render();
   refs.standing.scrollIntoView?.({behavior:'smooth',block:'start'});}
});
if(typeof window.addEventListener==='function'){
 window.addEventListener('liangyou:open-fixture',event=>{
  const id=event.detail?.id;if(!id)return;
  view='calendar';const match=data.events.find(x=>String(x.id)===String(id));
  refs.state.value=match?.status||'scheduled';date='week';limit=6;render();showFixtureDetail(id);
  refs.detail.scrollIntoView?.({behavior:'smooth',block:'start'});
 });
 window.addEventListener('liangyou:markets-updated',()=>{if(detailId)showFixtureDetail(detailId);});
}
function resetBracketView(){
 selectedBracketMatch=null;
 refs.bracket.classList.remove('is-expanded');
 refs.bracketExpand.setAttribute('aria-pressed','false');
 render();
}
refs.bracketSport.addEventListener('change',resetBracketView);
refs.bracketStage.addEventListener('change',resetBracketView);
refs.bracketSelect.addEventListener('change',resetBracketView);
refs.bracketRound.addEventListener('change',jumpBracketColumn);
refs.bracketExpand.addEventListener('click',()=>{
 const expanded=refs.bracket.classList.toggle('is-expanded');
 refs.bracketExpand.setAttribute('aria-pressed',String(expanded));
 render();
});
refs.bracket.addEventListener('click',event=>{
 if(event.target.closest?.('[data-exit-bracket]')){
   refs.bracket.classList.remove('is-expanded');
   refs.bracketExpand.setAttribute('aria-pressed','false');
   render();
   return;
 }
 const match=event.target.closest?.('.lyb-match[data-match-id]');
 if(match)highlightBracket(match.dataset.matchId);
});
refs.bracket.addEventListener('keydown',event=>{
 if(event.key!=='Enter'&&event.key!==' ')return;
 const match=event.target.closest?.('.lyb-match[data-match-id]');
 if(match){event.preventDefault();highlightBracket(match.dataset.matchId);}
});
if(typeof document.addEventListener==='function')document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&refs.bracket.classList.contains('is-expanded')){
   refs.bracket.classList.remove('is-expanded');refs.bracketExpand.setAttribute('aria-pressed','false');render();
 }
});
refs.bracketQuick.addEventListener('click',e=>{
 const btn=e.target.closest('[data-fixtures-tournament]');
 if(!btn)return;
 refs.bracketSelect.value=btn.dataset.fixturesTournament;
 resetBracketView();
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
render();fetchData();if(typeof window.setInterval==='function'){
 window.setInterval(()=>{if(!document.hidden)fetchData();},30*60*1000);
 // Advance date-window cards without a network request or a costly
 // bracket reflow when data has not changed.
 window.setInterval(()=>{
   if(document.hidden)return;
   updateLabels();
   if(view==='calendar')calendar();
 },60*1000);
}
if(typeof document.addEventListener==='function')
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)fetchData();});
let mobileBracket=typeof window.innerWidth==='number'&&window.innerWidth<=680;
if(typeof window.addEventListener==='function')window.addEventListener('resize',()=>{
  // Mobile browser chrome triggers many resize events. Rerender only at
  // the 680px breakpoint so a user's scroll position is not repeatedly lost.
  const next=typeof window.innerWidth==='number'&&window.innerWidth<=680;
  if(next!==mobileBracket){mobileBracket=next;if(view==='brackets')render();}
},{passive:true});
})();

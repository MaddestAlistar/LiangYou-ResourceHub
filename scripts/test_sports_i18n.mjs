import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('sports-i18n.js', 'utf8');
const window = {};
vm.runInNewContext(source, { window });
const tr = window.LiangYouSportsI18n;
assert(tr, 'Translation registry missing');
for (const lang of ['zh', 'en']) {
  for (const key of ['title', 'intro', 'sourceNote', 'download', 'promoTitle',
    'prediction', 'more', 'shown', 'all', 'football', 'lol']) {
    assert(tr.ui[lang][key], lang + ' text missing: ' + key);
  }
}
assert.equal(tr.team('Top Esports', 'lol', 'zh'), 'TES（滔搏）');
assert.equal(tr.team("Anyone's Legend", 'lol', 'zh'), 'AL');
assert.equal(tr.team('Heat', 'basketball', 'zh'), '热火');
assert.equal(tr.team('Arsenal FC', 'football', 'zh'), '阿森纳');
assert.equal(tr.team('平局', 'football', 'en'), 'Draw');
assert.equal(tr.team('Unknown New Club', 'football', 'zh'), 'Unknown New Club');
assert.equal(tr.league('Premier League 2025', 'football', 'zh'), '英超');
assert.equal(tr.league('La Liga 2', 'football', 'zh'), '西乙');
assert.equal(tr.league('Scottish Premier League', 'football', 'zh'), 'Scottish Premier League');
assert.equal(tr.league('League of Legends', 'lol', 'zh'), '英雄联盟');
assert.equal(tr.stage('Worlds Group Stage'), '全球总决赛小组赛');
for(const lang of ['zh','en']) for(const key of ['richHint','preMatch','details','bestBid','bestAsk','asOf','quoteNote',
 'volume24h','totalVolume','liquidity','quotesUnavailable','bookSize',
 'volume24hContracts','volumeTotalContracts','openInterest','marketDeadline','lastTrade','kalshiQuoteNote',
 'searchLabel','searchPlaceholder','sortTime','sortActivity','noSearchResults']) assert(tr.ui[lang][key]);

const lol = {
  title: "LoL: Top Esports vs Anyone's Legend (BO1) - Worlds Group Stage",
  category: 'lol',
  outcomes: [{ name: 'Top Esports', probability: 0.365 },
    { name: "Anyone's Legend", probability: 0.635 }]
};
assert.equal(tr.title(lol, 'zh'), 'TES（滔搏） 对阵 AL · BO1 · 全球总决赛小组赛');
assert.equal(tr.title(lol, 'en'), lol.title);
const football = {
  title: 'Arsenal FC vs. Everton FC',
  category: 'football',
  outcomes: [
    { name: 'Arsenal FC', probability: 0.68 },
    { name: '平局', probability: 0.21 },
    { name: 'Everton FC', probability: 0.13 }
  ]
};
assert.equal(tr.title(football, 'zh'), '阿森纳 对阵 埃弗顿');
assert.equal(tr.title(football, 'en'), 'Arsenal FC vs. Everton FC');

const live = JSON.parse(readFileSync('data/sports.json', 'utf8'));
assert(Array.isArray(live.events), 'Sports snapshot must exist');
for (const event of live.events) {
  for (const lang of ['zh', 'en']) {
    assert(tr.title(event, lang).length > 0, 'Blank match title: ' + event.id);
    assert(tr.league(event.league, event.category, lang).length > 0, 'Blank league: ' + event.id);
    event.outcomes.forEach(outcome => {
      assert(tr.team(outcome.name, event.category, lang).length > 0, 'Blank team: ' + event.id);
    });
  }
}
const html = readFileSync('index.html', 'utf8');
assert(html.includes('data-sports-lang="zh"') && html.includes('data-sports-lang="en"'));
assert(html.indexOf('sports-i18n.js?') < html.indexOf('sports.js?'), 'Dictionary must load first');
assert(html.includes('data-sports-t="sourceNote"'));
const ui = readFileSync('sports.js', 'utf8');
assert(ui.includes('renderStatic()') && ui.includes('translation.title(event, language)'));
assert(ui.includes("activeSource !== 'all'") && ui.includes('richMarketDetails(event, names)'));
assert(ui.includes("extra.summary") && ui.includes("volume_24h_usd") && ui.includes("quotesUnavailable"));
assert(ui.includes("volume_24h_contracts") && ui.includes("provider === 'kalshi'"));
assert(html.includes('data-source-filter="kalshi"'));
assert(html.includes('id="sportsSearch"') && html.includes('id="sportsSort"'));
assert.equal((html.match(/data-sport-filter="/g)||[]).length,5);
assert(html.indexOf('data-sport-filter="football"') < html.indexOf('data-sport-filter="other"'));
assert(!html.includes('data-sport-filter="esports"'));
assert(ui.includes('search.addEventListener') && ui.includes('sortControl.addEventListener'));
assert(ui.includes("['other','esports'].includes(m.category)"));
assert(html.includes('data-sports-t="richHint"'));

assert(html.includes('id="officialFixtures"') && html.includes('id="officialFixturesGrid"'));
assert(/src="\.\/fixtures\.js\?v=[0-9.]+"/.test(html), 'Fixture JS must be versioned');
assert(/href="\.\/fixtures\.css\?v=[0-9.]+"/.test(html), 'Fixture CSS must be versioned');
assert(html.indexOf('sports-i18n.js?') < html.indexOf('fixtures.js?'), 'Dictionary must load before fixture renderer');
const fixtureJS = readFileSync('fixtures.js','utf8');
assert(fixtureJS.includes('LGC Rising') && fixtureJS.includes('LCK Challengers League'), 'Chinese event names missing');
assert(fixtureJS.includes('热门赛事优先'), 'Hot-first title missing');
assert(fixtureJS.includes("real-sports.json"));
const visualJS=readFileSync('bracket-viz.js','utf8');
assert(visualJS.includes("score_home") && visualJS.includes("SWISS STAGE") && visualJS.includes("lyb-knockout-map"));
{
 const model={};
 vm.runInNewContext(visualJS,{window:model,Intl,Date},{timeout:2000});
 const swiss=model.LiangYouBracketViz.swiss({
  id:'panda-23',title:'Worlds · Group Stage',
  groups:[{team:'T1',wins:2,losses:1,rank:1,group:''}]
 },{
  lang:'zh',events:[{id:'stage-12',tournament_id:23,round:4,
   status:'finished',home:'T1',away:'BLG',score_home:2,score_away:1,
   start_time:'2026-10-27T10:00:00Z'}]
 });
 assert(swiss.includes('lyb-swiss-track')&&swiss.includes('lyb-timeline-track'));
 assert(!swiss.includes('lyb-matchup'), 'No guessed round pool when history is incomplete');
 assert(swiss.includes('lyb-swiss-links') && swiss.includes('OUTCOMES'), 'Swiss route must show outcomes and SVG links');
 assert(swiss.includes('T1')&&swiss.includes('BLG')&&swiss.includes('2')&&swiss.includes('1'));
 const unassigned=model.LiangYouBracketViz.swiss({
  id:'panda-23',title:'Worlds · Group Stage',groups:[]
 },{lang:'zh',events:[{id:'stage-18',tournament_id:23,round:null,
  status:'finished',home:'T1',away:'BLG',score_home:1,score_away:0,
  winner:'T1',start_time:'2026-10-23T11:00:00Z'}]});
 assert(unassigned.includes('lyb-timeline-track')&&unassigned.includes('lyb-date-team'),
  'Undated-round matches must render in a verified date timeline');
 const group=model.LiangYouBracketViz.groups({title:'PGL Masters · Group Stage',
  groups:[{team:'Team Liquid',wins:2,losses:1,rank:1}]},{lang:'en'});
 assert(group.includes('lyb-group-flow')&&!group.includes('<table'));
}
assert(fixtureJS.includes('officialStandingSelect') && fixtureJS.includes('refs.standingQuick.innerHTML'), 'Standings selector missing');
assert(fixtureJS.includes('LCK 常规赛 · 第3—4轮 · 传奇组（阶段榜）') &&
 fixtureJS.includes('lckStageNote'), 'LCK stage label and scope note must be displayed');
assert(fixtureJS.includes("x.groups.some(row=>Number.isInteger(row.wins)&&Number.isInteger(row.losses))"),
 'Rank-only esports standings must not be displayed as complete tables');
assert(fixtureJS.includes('extraGeneratedAt') && fixtureJS.includes('selected.status===\'stale\'') && fixtureJS.includes('staleOption'),
 'Independent source timestamps and stale-table badges must remain visible');
assert(fixtureJS.includes('extra-sports.json') && fixtureJS.includes('football-data') && fixtureJS.includes('winRate'),
 'New real provider standings and source labels must remain wired to fixtures UI');
assert(html.includes('<option value="football">足球</option>') && html.includes('Data provided by football-data.org'),
 'Football ranking selector and visible provider attribution missing');
assert(fixtureJS.includes('refs.bracketStage') && fixtureJS.includes("viz.stageOf"), 'Diagram stage selector missing');
assert(fixtureJS.includes('viz.connect(refs.bracket,chosen,opts.events)'), 'Swiss confirmed edges must connect to verified event history');
assert(html.includes('<option value="swiss" selected>'), 'Feature verified 2026 Worlds Swiss by default');
const fixtureStyles=readFileSync('fixtures.css','utf8');
assert(fixtureStyles.includes('.fixtures-subhead>.fixtures-multiselect{flex:0 0 auto!important'),
 'Reset desktop flex-basis for mobile columns to avoid large empty gaps');
assert(fixtureJS.includes("topPriority(matches)") && fixtureJS.includes("popularity(b)-popularity(a)"),
  'Featured calendar ordering missing');
assert(html.includes('id="officialStandingQuick"'),'Standings navigation missing');
assert(!html.includes('id="officialStandingLeagues"') &&
 !fixtureJS.includes('leagueFilter') && fixtureJS.includes('consolidatedStandings'),
 'Duplicate league pill navigation must be removed; grouped standings must remain');
assert(visualJS.includes('previous_matches') && visualJS.includes('is-loser'),
 'Official bracket predecessor routes and loser paths must remain visible');
assert(html.includes('fixtures.js?v=20261027.26') && html.includes('bracket-viz.js?v=20261027.11') && html.includes('fixtures.css?v=20261027.19'),
  'Changed assets must be cache-busted');
assert(fixtureJS.includes("fixtures-card") && fixtureJS.includes("setAttribute('aria-pressed'"));
assert(html.includes('data-fixtures-view="calendar"') && html.includes('data-fixtures-view="brackets"') && html.includes('data-fixtures-view="standings"'));
assert(html.includes('id="officialBracketGrid"') && html.includes('id="officialStandingGrid"'));
assert(html.includes('id="officialBracketSport"') && html.includes('id="officialStandingSport"'));
assert(html.includes('id="officialFixturesSort"') && html.includes('value="popular"'));
assert(fixtureJS.includes('function popularity(') && fixtureJS.includes("topPriority(matches)"));
assert(fixtureJS.includes("translations?.team") && fixtureJS.includes("localize(x.league"));
assert(fixtureJS.includes("kindOf(x)===kind"));
assert(!html.includes('真实赛程与比分') && !fixtureJS.includes('Schedules & scores'));
assert(fixtureJS.includes('data.brackets') && fixtureJS.includes('data.standings'));
assert(html.includes('id="sportsSourceHint"') && html.includes('data-sports-t="richHint"'));
const sportsStyles = readFileSync('sports.css','utf8');
assert(sportsStyles.includes('.sports-match-rich') && sportsStyles.includes('.sports-quote-row'));
assert(sportsStyles.includes('.sports-metrics') && sportsStyles.includes('.sports-metric'));

// Runtime smoke test: execute sports.js against a minimal DOM so early
// initialization errors (including temporal dead-zone errors) fail CI.
{
  const UI = readFileSync('sports.js', 'utf8');
  const now = Date.now();
  const future = new Date(now + 2 * 86400000).toISOString();
  const timestamp = new Date(now).toISOString();
  const ids = new Map();
  function element(id) {
    const e = {
      id, dataset:{}, hidden:false, innerHTML:'', textContent:'', value:'',
      listeners:{}, attributes:{},
      classList:{toggle(){},add(){},remove(){}},
      addEventListener(type,fn){this.listeners[type]=fn;},
      setAttribute(name,val){this.attributes[name]=val;},
      querySelectorAll(){return [];},
      dispatch(type){assert(this.listeners[type],'Missing '+type+' listener for '+id);this.listeners[type]();}
    };
    ids.set(id,e);
    return e;
  }
  for(const id of ['sportsGrid','sportsStatus','sportsCount','sportsListActions',
    'sportsMore','sportsCollapse','sportsShowing','sports','sportsLanguage',
    'sportsSearch','sportsSort','sportsSourceHint']) element(id);
  const names=['all','lol','basketball','football','other'];
  const tabs=names.map(name=>Object.assign(element('tab-'+name),{dataset:{sportFilter:name}}));
  const sources=['all','predict','polymarket','kalshi'].map(name=>
    Object.assign(element('source-'+name),{dataset:{sourceFilter:name}}));
  const languages=['zh','en'].map(name=>
    Object.assign(element('lang-'+name),{dataset:{sportsLang:name}}));
  ids.get('sports').querySelectorAll=selector=>
    selector==='[data-sport-filter]'?tabs:
    selector==='[data-source-filter]'?sources:[];
  ids.get('sportsLanguage').querySelectorAll=selector=>
    selector==='[data-sports-lang]'?languages:[];
  ids.get('sportsSort').options=[
    {dataset:{sportsT:'sortTime'},textContent:''},
    {dataset:{sportsT:'sortActivity'},textContent:''}
  ];
  function fixture(id, category, names, provider, title, vol=100) {
    return {
      id,title,category,league:category==='basketball'?'NBA':category,
      provider,verification:'open_match_winner_market',start_time:future,
      checked_at:timestamp,source_url:provider==='kalshi'?
      'https://kalshi.com/markets/kxsample/sample-game/kxsample-26abc':
      provider==='predict'?'https://predict.fun/market/sample-game':
      'https://polymarket.com/event/sample-game',
      stats:provider==='kalshi'?{volume_24h_contracts:vol}:{volume_24h_usd:vol},
      outcomes:names.map((name,i)=>({name,market_id:id+'-'+i,probability:i?0.45:0.55,
        best_bid:i?0.44:0.54,best_ask:i?0.46:0.56}))
    };
  }
  const samples={
    polymarket:[fixture('a','basketball',['Solar Bears','Moon Otters'],'polymarket','Solar Bears vs Moon Otters',500)],
    predict:[fixture('b','esports',['Falcons','Furia'],'predict','CS2: Falcons vs Furia',120)],
    kalshi:[fixture('c','other',['Red Hawks','Blue Tigers'],'kalshi','UFC: Red Hawks vs Blue Tigers',400)]
  };
  const doc={hidden:false,
    getElementById:id=>ids.get(id)||null,
    addEventListener(){}
  };
  const win={
    LiangYouSportsI18n:tr,matchMedia:()=>({matches:true}),setInterval(){}
  };
  const webFetch=async path=>{
    const provider=path.includes('predict-sports.json')?'predict':
      path.includes('kalshi-sports.json')?'kalshi':'polymarket';
    return {ok:true,json:async()=>({
      schema:1,source_type:'prediction_market',status:'ok',
      generated_at:timestamp,events:samples[provider]
    })};
  };
  vm.runInNewContext(UI,{
    window:win, document:doc, localStorage:{getItem:()=>null,setItem(){}},
    fetch:webFetch, AbortSignal, console
  },{timeout:2000});
  // Promise.allSettled and fetch callbacks execute on the next microtask turn.
  await new Promise(resolve=>setImmediate(resolve));
  assert(ids.get('sportsGrid').innerHTML.includes('sports-match'),
    'Sports runtime failed to initialize and render feed cards');
  tabs.find(t=>t.dataset.sportFilter==='other').dispatch('click');
  let markup=ids.get('sportsGrid').innerHTML;
  assert(markup.includes('Falcons')&&markup.includes('Red Hawks'),
    '"Other" tab should include esports and other sports');
  ids.get('sportsSearch').value='ufc';
  ids.get('sportsSearch').dispatch('input');
  assert(ids.get('sportsGrid').innerHTML.includes('Red Hawks'));
  assert(!ids.get('sportsGrid').innerHTML.includes('Falcons'),
    'Keyword search must filter other entries locally');
  ids.get('sportsSearch').value='';
  ids.get('sportsSearch').dispatch('input');
  sources.find(s=>s.dataset.sourceFilter==='kalshi').dispatch('click');
  markup=ids.get('sportsGrid').innerHTML;
  assert(markup.includes('Red Hawks')&&!markup.includes('Falcons'),
    'Selecting Kalshi should filter to that provider');
  assert(markup.includes('sports-metrics'),'Selected provider details missing');
  ids.get('sportsSort').value='activity';
  ids.get('sportsSort').dispatch('change');
  languages.find(l=>l.dataset.sportsLang==='en').dispatch('click');
  assert.equal(ids.get('sports').lang,'en');
  assert(ids.get('sportsSearch').placeholder.includes('Search'));
  console.log('PASS: Sports DOM startup, unified other tab, keyword search, source filter, sorting, and language toggle.');
}


// Regression smoke test for the REAL fixture board: four LoL knockout
// tournaments, multiple ranking tables, bilingual controls and hot-first order.
{
 const raw = readFileSync('data/real-sports.json','utf8');
 const snapshot = JSON.parse(raw);
 const extra = JSON.parse(readFileSync('data/extra-sports.json','utf8'));
 const archived = JSON.parse(readFileSync('data/verified-lol-2026.json','utf8'));
 assert.equal(archived.source_type,'verified_completed_esports_standings');
 assert.deepEqual(archived.standings.map(x=>x.groups.length),[10,12]);
 assert(archived.standings.every(x=>x.historical_final&&/^https:\/\//.test(x.source_url)));
 assert(Array.isArray(snapshot.brackets) && Array.isArray(snapshot.standings));
 assert.equal(extra.source_type,'supplemental_fixtures');
 assert(extra.events.some(x=>x.provider==='football-data')&&extra.standings.some(x=>x.provider==='dunkapi'));

 const actualVizSource=readFileSync('bracket-viz.js','utf8');
 const swissHost={};
 vm.runInNewContext(actualVizSource,{window:swissHost,Intl,Date},{timeout:2000});
 const swissAPI=swissHost.LiangYouBracketViz;
 {
   const mobileHost={innerWidth:390};
   vm.runInNewContext(actualVizSource,{window:mobileHost,Intl,Date},{timeout:2000});
   const fixture=snapshot.brackets.find(x=>x.rounds?.length);
   const mobile=mobileHost.LiangYouBracketViz.knockout(fixture,{lang:'zh'});
   const desktop=swissAPI.knockout(fixture,{lang:'zh'});
   const dimensions=str=>Number(str.match(/lyb-knockout-map[^"]*" style="width:(\d+)px;/)?.[1]||0);
   assert(mobile.includes('lyb-knockout-gesture')&&mobile.includes('is-mobile'),
     'Phone bracket must show swipe cue and compact layout');
   assert(dimensions(mobile)>0 && dimensions(mobile)<dimensions(desktop),
     'Narrow phone viewport must generate proportionally smaller bracket columns');
 }
 // Every rendered knockout connector must come from a pair of real match IDs.
 for(const board of snapshot.brackets){
   const all=(board.rounds||[]).flatMap(round=>round.matches||[]);
   const ids=new Set(all.map(m=>String(m.match_id)).filter(Boolean));
   const knownLinks=all.flatMap(m=>m.previous_matches||[])
       .filter(previous=>ids.has(String(previous.match_id))).length;
   const markup=swissAPI.knockout(board,{lang:'zh'});
   assert(markup.includes('lyb-knockout-map'),'Verified knockout map missing: '+board.title);
   const edges=[...markup.matchAll(/<path class="lyb-bracket-edge [^"]+" data-from="([^"]+)" data-to="([^"]+)"/g)];
   assert.equal(edges.length,knownLinks,
     'Only provider-connected predecessors may produce lines: '+board.title);
   const positioned=[...markup.matchAll(/<article class="lyb-match" data-match-id="([^"]+)" style="left:(\d+)px;/g)];
   const coords=new Map(positioned.map(m=>[m[1],Number(m[2])]));
   for(const edge of edges){
     const before=coords.get(edge[1]),after=coords.get(edge[2]);
     assert(Number.isFinite(before)&&Number.isFinite(after)&&after>before,
       'Verified route must always progress rightwards: '+board.title+' '+edge[1]+' -> '+edge[2]);
   }
   if(all.some(m=>m.bracket_side==='lower')&&all.some(m=>m.bracket_side==='upper')){
     assert(markup.includes('胜者组')&&markup.includes('败者组'),
       'Double-elimination lanes must stay distinct: '+board.title);
   }
 }
 if(Array.isArray(snapshot.stage_matches)&&snapshot.stage_matches.length>=20){
   const timeline=swissAPI.inferRounds(snapshot.stage_matches);
   assert(timeline,'Worlds Swiss full history should yield a verified nonfabricated round timeline');
   const official=snapshot.standings.find(x=>/Worlds.*Group Stage/i.test(x.title));
   const links=swissAPI.verifiedTransitions(timeline);
   assert(links.has('0-0|1-0')&&links.has('2-0|ADVANCES'),
    'Confirmed Swiss win/loss paths must derive from actual results');
   assert(!links.has('2-2|ADVANCES'),
    'Unplayed fifth-round progress must not be marked confirmed');
   if(official){
     const svg={innerHTML:'',setAttribute(name,value){this[name]=value;}};
     const box=(key,x)=>({dataset:{pool:key},getBoundingClientRect(){
       return {left:x,right:x+100,top:30,bottom:85};}});
     const track={scrollWidth:580,scrollHeight:280,getBoundingClientRect(){
       return {left:0,top:0,right:580,bottom:280};},
       querySelector(q){return q==='.lyb-swiss-links'?svg:null;},
       querySelectorAll(){return [box('0-0',10),box('1-0',260)];}};
     swissAPI.connect({querySelector(){return track;}},official,snapshot.stage_matches);
     assert(svg.innerHTML.includes('lyb-link-confirmed'),
       'First-round verified pathway should be highlighted in the real SVG');
     assert(svg.viewBox==='0 0 580 280','SVG routes must use measured container space');
   }
   const counts=timeline.matches.reduce((m,x)=>(m[x.round]=(m[x.round]||0)+1,m),{});
   assert(counts[1]===8&&counts[2]===8&&counts[3]===8,'First three Swiss rounds must be complete');
   if(official){
     assert(swissAPI.inferRounds(snapshot.stage_matches,official.groups),
      'Verified match records must match official current Swiss standings');
     const contradictory=official.groups.map(x=>({...x}));
     contradictory[0].wins+=1;
     assert(swissAPI.inferRounds(snapshot.stage_matches,contradictory)===null,
      'Conflicting provider standings must reject historical path reconstruction');
   }
   assert([...timeline.stages[1].values()].filter(x=>x.wins===1).length===8,'After R1 should have 8 teams at 1-0');
   assert([...timeline.stages[2].values()].filter(x=>x.wins===1&&x.losses===1).length===8,
    'After R2 should have 8 teams at 1-1');
   assert([...timeline.stages[3].values()].filter(x=>x.wins===3).length===2,
    'After R3 verified 3-0 teams should be qualified');
   const worlds=snapshot.standings.find(x=>/Worlds.*Group Stage/i.test(x.title));
   if(worlds){
     const visual=swissAPI.swiss(worlds,{lang:'zh',events:snapshot.stage_matches});
     assert((visual.match(/class="lyb-matchup"/g)||[]).length===snapshot.stage_matches.length,
      'Every verified Swiss match must appear in its historical record pool');
     assert(!visual.includes('lyb-timeline-track'), 'Known-round Swiss matchups should not fall into a duplicate timeline');
     assert(visual.includes('<div class="lyb-legend">')&&visual.includes('已确认路线'), 'Compact Swiss route legend should render');
     assert((visual.match(/<div\b/g)||[]).length===(visual.match(/<\/div>/g)||[]).length,
      'Swiss graph must emit balanced DOM nodes');
     assert(visual.includes('0-0')&&visual.includes('2-2')&&visual.includes('ADVANCES'));
   }
   const incomplete=swissAPI.inferRounds(snapshot.stage_matches.slice(0,7));
   assert(incomplete===null,'Incomplete Swiss history must not be guessed');
 }

 const localeSource = readFileSync('fixtures.js','utf8');
 const html = readFileSync('index.html','utf8');
 for(const id of ['officialBracketQuick','officialStandingSummary',
                  'officialBracketSubtitle','officialStandingSubtitle','fixturesSortHint'])
  assert(html.includes('id="'+id+'"'),'Missing new fixture control '+id);
 const ui = new Map();
 function node(id){
  const e = {id,dataset:{},value:'',hidden:false,textContent:'',placeholder:'',
   listeners:{},options:[],attributes:{},_markup:'',
   classList:{toggle(){},add(){},remove(){}},
   addEventListener(ev,handler){this.listeners[ev]=handler;},
   setAttribute(k,v){this.attributes[k]=v;},
   getAttribute(k){return this.attributes[k];},
   dispatch(type){assert(this.listeners[type],this.id+' missing '+type);this.listeners[type]({target:this});}
  };
  Object.defineProperty(e,'innerHTML',{get(){return this._markup;},set(v){
   this._markup=v;
   if(id.endsWith('Select')){
    this.options=[...v.matchAll(/<option value="([^"]+)"/g)].map(m=>({value:m[1]}));
    this.value=this.options[0]?.value||'';
   }
  }});
  ui.set(id,e);return e;
 }
 const ids=['officialFixtures','officialFixturesGrid','officialFixturesCount',
 'officialFixturesStatus','officialFixturesSearch','officialFixturesCategory',
 'officialFixturesSort','officialFixturesMore','officialFixturesShowing',
 'officialBracketGrid','officialBracketQuick','officialBracketSelect','officialBracketSport','officialBracketStage',
 'officialStandingGrid','officialStandingSummary','officialStandingQuick','officialStandingSelect','officialStandingSport',
 'officialFixturesTitle','officialFixturesIntro','officialFixturesNote',
 'fixturesMarketTitle','fixtureCalendarPanel','fixtureBracketsPanel',
 'fixtureStandingsPanel','fixturesSortHint','officialBracketSubtitle','officialStandingSubtitle'];
 ids.forEach(node);
 const modes=['calendar','brackets','standings'].map(v=>Object.assign(node('mode_'+v),{dataset:{fixturesView:v}}));
 const dates=['today','tomorrow','week'].map(v=>Object.assign(node('date_'+v),{dataset:{fixturesDate:v}}));
 const section={getAttribute:()=> 'zh-CN'};
 ui.get('officialFixtures').closest=()=>section;
 ui.get('officialFixtures').querySelectorAll=sel=>sel==='[data-fixtures-view]'?modes:dates;
 ui.get('officialFixturesCategory').value='all';
 ui.get('officialFixturesSort').options=[{value:'popular'},{value:'time'}];
 ui.get('officialFixturesSort').value='popular';
 ui.get('officialBracketSport').options=[{value:'all'},{value:'lol'},{value:'valorant'},{value:'cs2'},{value:'other'}];
 ui.get('officialBracketSport').value='all';
  ui.get('officialBracketStage').options=[{value:'knockout'},{value:'swiss'},{value:'group'}];
  ui.get('officialBracketStage').value='swiss';
 ui.get('officialStandingSport').options=[{value:'all'},{value:'lol'},{value:'esports'},{value:'basketball'},{value:'football'}];
 ui.get('officialStandingSport').value='all';
 const doc={getElementById:id=>ui.get(id)||null,querySelectorAll:()=>[]};
 const win={LiangYouSportsI18n:tr,setInterval(){}};
  vm.runInNewContext(visualJS,{window:win,Intl,Date},{timeout:2000});
 const fetch=async(url)=>({ok:true,json:async()=>url.includes('verified-lol-2026.json')?archived:
      url.includes('extra-sports.json')?extra:snapshot});
 vm.runInNewContext(localeSource,{document:doc,window:win,fetch,AbortSignal,console,Intl,setTimeout,Date},{timeout:2000});
 await new Promise(resolve=>setImmediate(resolve));
 modes[1].dispatch('click');
  assert(ui.get('officialBracketStage').value==='swiss', 'Current Worlds Swiss stage should be featured');
  assert(ui.get('officialBracketGrid').innerHTML.includes('lyb-swiss-track'), 'Worlds Swiss progression should be visible initially');
  ui.get('officialBracketStage').value='knockout';
  ui.get('officialBracketStage').dispatch('change');
  assert(ui.get('officialBracketGrid').innerHTML.includes('lyb-knockout-map'), 'Knockout switch must render visual bracket tree');
  assert(ui.get('officialBracketGrid').innerHTML.includes('lyb-lines'), 'Knockout diagram missing SVG');
  assert(ui.get('officialBracketQuick').innerHTML==='', 'Redundant tournament choices shown');
  assert(ui.get('officialBracketSelect').options.length===snapshot.brackets.length);
  ui.get('officialBracketStage').value='swiss';
  ui.get('officialBracketStage').dispatch('change');
  assert(ui.get('officialBracketGrid').innerHTML.includes('lyb-swiss-track'), 'Worlds Swiss stage graph missing');
  assert(!ui.get('officialBracketGrid').innerHTML.includes('fixtures-ranking'), 'A ranking table must not masquerade as diagram');
  ui.get('officialBracketSport').value='valorant';
  ui.get('officialBracketSport').dispatch('change');
  assert(ui.get('officialBracketGrid').innerHTML.includes('lyb-knockout-map'), 'VCT bracket must render');
  ui.get('officialBracketSport').value='cs2';
  ui.get('officialBracketSport').dispatch('change');
  assert(ui.get('officialBracketStage').value==='group', 'CS2 must fall back to available group flow');
  assert(ui.get('officialBracketGrid').innerHTML.includes('lyb-group-flow'), 'PGL group flow missing');
  ui.get('officialBracketSport').value='all';
  ui.get('officialBracketSport').dispatch('change');
  modes[2].dispatch('click');
  if(snapshot.standings.length){
    assert(ui.get('officialStandingQuick').innerHTML==='', 'Redundant standings buttons still shown');
    // Count the same published records the UI receives: archived 2026
    // finals supersede incomplete PandaScore phase fragments.
    const candidates=[...snapshot.standings.filter(x=>
      !(archived.standings.length&&String(snapshot.generated_at||'').startsWith('2026-')&&
      (/^LCK · Round 3-4 (?:Legend|Rise) Group$/i.test(x.title||'')||
       /^LPL · Group (?:Ascend|Nirvana)$/i.test(x.title||'')))),
      ...extra.standings,...archived.standings];
    const records=candidates.filter(x=>x&&Array.isArray(x.groups)&&x.groups.length&&
      (x.sport==='football'||x.groups.some(row=>Number.isInteger(row.wins)&&Number.isInteger(row.losses))));
    assert.equal(ui.get('officialStandingSelect').options.length,
      new Set(records.map(x=>x.id)).size,
      'Only complete published standings (including verified historical finals) should be selectable');
    assert(!records.some(x=>x.title==='Worlds · Play-In'), 'Rank-only Worlds Play-In should be hidden');
    assert((ui.get('officialStandingGrid').innerHTML.match(/fixtures-standing-card/g)||[]).length===1,
      'Only the chosen standings card should render');
    assert(ui.get('officialStandingGrid').innerHTML.includes('fixtures-ranking'));
    ui.get('officialStandingSelect').value='archived-lck-2026-r34';
    ui.get('officialStandingSelect').dispatch('change');
    assert(ui.get('officialStandingGrid').innerHTML.includes('2026赛季第3—4轮') &&
           ui.get('officialStandingGrid').innerHTML.includes('传奇组') &&
           ui.get('officialStandingGrid').innerHTML.includes('崛起组') &&
           ui.get('officialStandingGrid').innerHTML.includes('历史快照'),
           'Final LCK two-group historical standings must be attributed and visible');
    ui.get('officialStandingSelect').value='archived-lpl-2026-s3';
    ui.get('officialStandingSelect').dispatch('change');
    assert(ui.get('officialStandingGrid').innerHTML.includes('登峰组') &&
           ui.get('officialStandingGrid').innerHTML.includes('涅槃组'),
           'Final LPL two-group historical standings must be visible');
  }
  ui.get('officialStandingSport').value='basketball';
  ui.get('officialStandingSport').dispatch('change');
  assert(ui.get('officialStandingSelect').options.length===1,'DunkAPI NBA standings must be selectable');
  assert(ui.get('officialStandingGrid').innerHTML.includes('NBA') &&
         ui.get('officialStandingGrid').innerHTML.includes('fixtures-ranking'),
         'Real NBA standings card missing');
  assert(ui.get('officialStandingGrid').innerHTML.includes('东部联盟') ||
         ui.get('officialStandingGrid').innerHTML.includes('西部联盟'),
         'NBA East/West conference rankings missing');
  ui.get('officialStandingSport').value='football';
  ui.get('officialStandingSport').dispatch('change');
  assert(ui.get('officialStandingSelect').options.length===5,'Five football tables must be selectable');
  assert(ui.get('officialStandingGrid').innerHTML.includes('fixtures-ranking is-football') &&
         ui.get('officialStandingGrid').innerHTML.includes('积分'),
         'Verified football table and points columns missing');
  assert(ui.get('officialFixturesStatus').textContent.includes('NBA/足球'),
    'Independent NBA/football verified timestamp must be displayed');
  const footballRecord=extra.standings.find(x=>x.provider==='football-data');
  if(footballRecord){
    footballRecord.status='stale';
    footballRecord.verified_at='2026-10-26T03:00:00Z';
    ui.get('officialStandingSport').dispatch('change');
    assert(ui.get('officialStandingGrid').innerHTML.includes('fixtures-ranking-note is-stale'),
      'Previously verified league table should display a warning');
    assert(ui.get('officialStandingSelect').innerHTML.includes('（上次数据）'),
      'Previously verified league must also be identified in dropdown');
  }
  assert(ui.get('officialFixturesNote').innerHTML.includes('href="https://www.football-data.org/"'),
         'Visible football-data source attribution link missing');
  ui.get('officialStandingSport').value='all';
  ui.get('officialStandingSport').dispatch('change');
  section.getAttribute=()=> 'en';
 modes[0].dispatch('click');
 assert(ui.get('officialFixturesTitle').textContent==='Calendar & tournament intelligence');
 assert(ui.get('fixturesSortHint').textContent.includes('Editorial prominence'));
 modes[1].dispatch('click');
 assert(ui.get('officialBracketSubtitle').textContent.includes('Esports stages'));
 console.log('PASS: Worlds Swiss, VCT, CS2, NBA East/West and five official soccer standings.');
}

console.log('PASS: Chinese-English translations, original names and snapshot match titles');

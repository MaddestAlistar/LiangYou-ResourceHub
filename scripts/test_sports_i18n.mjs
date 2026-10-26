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
assert(html.includes('fixtures.js?v=20261027.1') && html.includes('fixtures.css?v=20261027.1'));
const fixtureJS = readFileSync('fixtures.js','utf8');
assert(fixtureJS.includes("real-sports.json") && fixtureJS.includes("score_home"));
assert(fixtureJS.includes("fixtures-card") && fixtureJS.includes("setAttribute('aria-pressed'"));
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

console.log('PASS: Chinese-English translations, original names and snapshot match titles');

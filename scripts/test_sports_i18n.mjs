import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(name,'utf8');
const html=read('index.html');
const fixtures=read('fixtures.js');
const siteI18n=read('site-i18n.js');
const market=read('sports.js');
const linker=read('sports-link.js');
const styles=read('fixtures.css');
const workflow=read('.github/workflows/refresh-data.yml');
const dispatcher=read('scripts/refresh_data.py');
const collector=read('scripts/update_board_games.py');
const data=JSON.parse(read('data/real-sports.json'));
const extra=JSON.parse(read('data/extra-sports.json'));
const board=JSON.parse(read('data/board-games.json'));
const nbaExtra=JSON.parse(read('data/nba-games.json'));
const bookmaker=JSON.parse(read('data/sports-odds.json'));
const chessProfilesFeed=JSON.parse(read('data/chess-players.json'));
assert.equal(nbaExtra.source_type,'nba_fixtures');
assert.equal(bookmaker.source_type,'bookmaker_reference');
assert.equal(chessProfilesFeed.source_type,'chess_player_metadata');
assert(nbaExtra.events.every(x=>x.provider==='balldontlie'&&x.sport==='basketball'&&
  x.start_time&&x.home&&x.away&&['scheduled','live','finished'].includes(x.status)),
 'NBA sources must have verified game states and tipoff timestamps');
assert(bookmaker.events.every(x=>x.provider==='the-odds-api'&&x.start_time&&x.quote_at&&
 x.outcomes.length>=2&&x.outcomes.every(o=>o.decimal>1)),
 'Bookmaker snapshot only stores bounded pregame decimal head-to-head references');
assert(chessProfilesFeed.players.every(x=>x.source_url.startsWith('https://www.chess.com/member/')&&x.verified_at),
 'Chess player profiles must have verified source account and update timestamp');
assert(fixtures.includes('renderOddsReference(x,label)')&&fixtures.includes('renderChessProfiles(x,label)')&&
 fixtures.includes('oddsForFixture(x)')&&fixtures.includes('nbaEvents,...base.events'),
 'Existing calendar must integrate optional verified NBA, odds, and chess metadata');
assert(fixtures.includes("linker?.pairs?.(x,y,75)")&&fixtures.includes('chessProfiles=new Map'),
 'Cross-provider NBA dedupe and chess profile matching must remain intact');

const archive=JSON.parse(read('data/verified-lol-2026.json'));

const win={};
vm.runInNewContext(read('sports-i18n.js'),{window:win},{timeout:3000});
const tr=win.LiangYouSportsI18n;
assert(tr && tr.ui && tr.league && tr.team, 'Translation registry missing');
for(const lang of ['zh','en']) {
 assert(tr.ui[lang]?.title && tr.ui[lang]?.download, 'Language missing: '+lang);
}
assert.equal(tr.team('Top Esports','lol','zh'),'TES（滔搏）');
assert.equal(tr.team("Anyone's Legend",'lol','zh'),'AL');
assert.equal(tr.team('Arsenal FC','football','zh'),'阿森纳');
assert.equal(tr.league('Premier League 2025','football','zh'),'英超');
assert.equal(tr.title({title:'Arsenal FC vs. Everton FC',category:'football',
 outcomes:[{name:'Arsenal FC'},{name:'Everton FC'}]},'en'),'Arsenal FC vs. Everton FC');

const values=[...html.matchAll(/<option value="(chess|go)">/g)].map(m=>m[1]);
assert.deepEqual(values,['chess','go'],'Both board-game category filters required');
assert(html.includes('id="officialFixturesCategory"')&&html.includes('id="officialFixtureDetail"'));
assert(html.includes('data-fixtures-view="calendar"')&&html.includes('data-fixtures-view="brackets"')&&html.includes('data-fixtures-view="standings"'));
const assets=html+read('china-perf.js');
assert(assets.indexOf('sports-i18n.js?')<assets.indexOf('fixtures.js?'),'Dictionary must load first');
assert(/["']\.\/fixtures\.js\?v=\d+(?:\.\d+)+["']/.test(assets),'Browser cache must refresh fixture JS');
assert(fixtures.includes("['chess','go'].includes(x.sport)"),'Category records must be validated');
assert(fixtures.includes("board-games.json") && fixtures.includes('boardGeneratedAt'),'Board feeds must load and show verification date');
assert(fixtures.includes("providerName(") && fixtures.includes("time_precision==='date'"),'Board provider and date-only support missing');
assert(fixtures.includes("cache:'no-cache'") && fixtures.includes('Promise.all(['),'Parallel no-cache loading missing');
assert(fixtures.includes('showFixtureDetail') && fixtures.includes('refs.state.addEventListener'),'Calendar details must remain interactive');
assert(fixtures.includes('autoBoardStatus')&&fixtures.includes('manualBoardStatus')&&fixtures.includes('offerRecentBoardResults()')&&fixtures.includes("refs.state.value='scheduled'"),'Chess/Go filter must recover after async fetch and respect explicit statuses');
assert(collector.includes('start>NOW+timedelta(minutes=5)'),'Future Lichess broadcast must not be reported live');
assert(fixtures.includes("topPriority(matches)")&&fixtures.includes("if(state==='finished')"),'Calendar priority and finished ordering must remain');
assert(fixtures.includes("Date.now()-verified<=6*3600000"),'Old prediction markets must not leak into match details');
assert(styles.includes('.fixtures-grid')&&styles.includes('@media(max-width:720px)'),'Responsive fixture styles missing');
assert(market.includes('LiangYouMarketRecords')&&market.includes('liangyou:markets-updated'),'Prediction snapshots should still attach to official fixtures');
assert(linker.includes('marketsFor')||linker.includes('marketsFor:'),'Independent market matching missing');
assert(!html.includes('id="officialFixtureMarkets"'),'Prediction market list must not reappear outside fixture cards');

assert.equal(data.source_type,'official_fixtures');
assert(Array.isArray(data.events)&&Array.isArray(data.brackets)&&Array.isArray(data.standings));
assert.equal(extra.source_type,'supplemental_fixtures');
assert(Array.isArray(extra.events)&&Array.isArray(extra.standings));
assert.equal(archive.source_type,'verified_completed_esports_standings');
assert(Array.isArray(archive.standings));
assert.equal(board.schema,1);
assert.equal(board.source_type,'board_game_fixtures');
assert(Array.isArray(board.events)&&Array.isArray(board.sources));
const ids=new Set();
for(const e of board.events) {
 assert(typeof e.id==='string'&&!ids.has(e.id),'Board event ID missing or duplicated: '+e.id);
 ids.add(e.id);
 assert(['chess','go'].includes(e.sport),'Unsupported board sport');
 assert(['scheduled','live','finished'].includes(e.status),'Invalid board match status');
 assert(e.home&&e.away&&Number.isFinite(Date.parse(e.start_time)),'Cannot publish unverified chess/Go matchup');
 assert(['lichess','nihonkiin','baduk'].includes(e.provider),'Unexpected board source');
 if(e.time_precision==='date')assert(/^\d{4}-\d{2}-\d{2}$/.test(e.display_date),'Date-only game missing display_date');
}
assert(dispatcher.includes("'board': ('update_board_games.py', 'board-games.json', 6)"),'Board verification job must be scheduled');
assert(workflow.includes('LICHESS_API_TOKEN: \u0024{{ secrets.LICHESS_API_TOKEN }}'),'Lichess secret must stay server-side');
assert(workflow.includes('data/board-games.json'),'Action must commit board snapshots');
assert(!html.includes('LICHESS_API_TOKEN')&&!fixtures.includes('LICHESS_API_TOKEN'),'Never expose the Lichess token in client code');
assert(collector.includes('lichess.org/api/broadcast/top') && collector.includes('www.nihonkiin.or.jp/match/2week.html'),'Collectors must use official sources');
assert(collector.includes('source_type="board_game_fixtures"')||collector.includes('"source_type":"board_game_fixtures"'),'Collector schema mismatch');

const boardHost={};
vm.runInNewContext(read('board-i18n.js'),{window:boardHost},{timeout:2000});
const bt=boardHost.LiangYouBoardI18n;

assert(siteI18n.includes('[data-site-lang],#officialFixtures'), 'Global translation must not override local fixture language');
assert(fixtures.includes("if(event.sport!=='chess'&&event.sport!=='go')return team(event[which],event.sport);"),
 'Football, NBA and esports must not be processed by Go/chess translator');
const teamStart=fixtures.indexOf('const team=(v,sport)=>{');
const teamEnd=fixtures.indexOf('const chessOutcome=',teamStart);
assert(teamStart>=0&&teamEnd>teamStart,'Cannot locate real calendar participant rendering functions');
const teamScope=fixtures.slice(teamStart,teamEnd)+'\n({team,boardPlayer})';
const localeScope=value=>vm.runInNewContext(teamScope,{
 lang:()=>value,translations:tr,boardTranslations:bt
},{timeout:2000});
const zhParticipants=localeScope('zh');
const enParticipants=localeScope('en');
for(const [sport,name,expected] of [
 ['football','Arsenal FC','阿森纳'],
 ['football','Manchester City FC','曼城'],
 ['basketball','Golden State Warriors','金州勇士'],
 ['basketball','Los Angeles Lakers','洛杉矶湖人'],
 ['lol','Top Esports','TES（滔搏）'],
 ['esports','Bilibili Gaming','BLG（哔哩哔哩）']
]){
 assert.equal(zhParticipants.boardPlayer({sport,home:name},'home'),expected,
  'Non-board Chinese participant translation regression: '+name);
 assert.equal(enParticipants.boardPlayer({sport,home:name},'home'),name,
  'English team name must remain official: '+name);
}
assert.equal(zhParticipants.boardPlayer({sport:'go',home:'박정환',home_zh:'朴廷桓'},'home'),'朴廷桓');
assert.equal(zhParticipants.boardPlayer({sport:'chess',home:'Caruana, Fabiano'},'home'),'法比亚诺·卡鲁阿纳');

assert(bt && typeof bt.league==='function' && typeof bt.player==='function' && typeof bt.stage==='function',
 'Board localization interface unavailable');
assert(linker.includes("'afc bournemouth':'bournemouth'")&&
 linker.includes("'brighton and hove albion':'brighton'"),
 'Verified Premier League aliases must remain stable for cross-provider matching');
assert.equal(bt.league('49기 SG배 한국일보 명인전 패자결승','go','zh'),'第49届 SG杯韩国日报名人战 · 败者组决赛');
assert.equal(bt.league('2026 Sh수협은행 여자바둑 최강전 결승 3국','go','zh'),'2026 Sh水协银行女子围棋最强战 · 决赛第3局');
assert.equal(bt.league('名人 挑戦７','go','zh'),'日本名人战 · 挑战赛第7局');
assert.equal(bt.league('Benidorm Chess Open 2026 | Group A','chess','zh'),'2026 贝尼多姆国际象棋公开赛 · A组');
assert.equal(bt.stage('Round 6','chess','zh'),'第6轮');
assert.equal(bt.chessResult('1-0','zh'),'白方胜');
assert.equal(bt.chessResult('0-1','zh'),'黑方胜');
assert.equal(bt.chessResult('1/2-1/2','zh'),'和棋');
assert.equal(bt.chessResult('*','zh'),'对局未结束');
assert.equal(bt.chessResult('1/2-1/2','en'),'1/2-1/2');
assert.equal(bt.chessSide('home','zh'),'白方');
assert.equal(bt.chessSide('away','zh'),'黑方');
assert.equal(bt.chessSide('home','en'),'White');
assert(fixtures.includes("x.sport==='chess'&&chessOutcome(x)"), 'Finished chess result must be localized in cards');
assert(fixtures.includes("x.sport==='chess'?safe(chessSide('home'))"), 'Chess detail needs localized white/black player roles');
assert(fixtures.includes("x.sport!=='chess'?"), 'Chess details must not show duplicate raw PGN result');
assert.equal(bt.stage('패자결승','go','zh'),'败者组决赛');
assert.equal(bt.stage('결승 3국','go','zh'),'决赛第3局');
assert.equal(bt.player('박정환','go','zh'),'朴廷桓');
assert.equal(bt.player('스미레','go','zh'),'仲邑堇');
assert.equal(bt.player('김주아','go','zh'),'김주아', 'Unverified Go name must not be invented');
assert.equal(bt.player('Caruana, Fabiano','chess','zh'),'法比亚诺·卡鲁阿纳');
assert.equal(bt.player('Unknown, Player','chess','zh'),'Unknown, Player',
 'Unknown real player must never be assigned a guessed Chinese identity');
assert.equal(bt.league('Benidorm Chess Open 2026 | Group A','chess','en'),'Benidorm Chess Open 2026 | Group A');
assert.equal(bt.stage('Round 6','chess','en'),'Round 6');
assert.equal(bt.player('김주아','go','en','Kim Jooah'),'Kim Jooah');
assert(fixtures.includes('function renderGoPlayerRating(x,side,zh)'), 'Go player cards must be structured and independently rendered');
assert(fixtures.includes('fixtures-go-event-name') && fixtures.includes('fixtures-go-event-meta'), 'Go match title and metadata must have separate hierarchy');
assert(fixtures.includes('fixtures-go-player-grid') && fixtures.includes("renderGoPlayerRating(x,'home',label)+renderGoPlayerRating(x,'away',label)"), 'Both Go players must have separate rating cards');
assert(fixtures.includes('fixtures-go-summary-foot') && fixtures.includes('fixtures-go-source-links'), 'Go rating sources and caveat must be in their own footer');
assert(!fixtures.includes('fixtures-go-ratings'), 'Legacy inline Go rating text must be removed');
assert(styles.includes('grid-template-columns:repeat(2,minmax(0,1fr))')&&styles.includes('.fixtures-go-player-grid')&&styles.includes('@media(max-width:360px)'),
 'Go detail player cards must be mobile responsive');
assert(fixtures.includes('const boardTranslations=window.LiangYouBoardI18n')&&
 fixtures.includes("boardTranslations?.player?.")&&fixtures.includes("boardTranslations?.stage?."),
 'Localized league/round/player rendering must be connected');
assert(assets.indexOf('board-i18n.js?')<assets.indexOf('fixtures.js?') &&
 assets.includes('./board-i18n.js?'), 'Load board translations before fixture UI');
const chessActive=board.events.filter(x=>x.sport==='chess'&&x.status==='live');
const chessCompleted=board.events.filter(x=>x.sport==='chess'&&x.status==='finished');
// Live feeds may legitimately contain neither state between tournaments.
// Keep both translation paths covered with test-only, deterministic samples.
const chessTranslationSamples=[
 {id:'test-live',league:'Benidorm Chess Open 2026 | Group A',stage:'Round 6',status:'live'},
 {id:'test-finished',league:'Benidorm Chess Open 2026 | Group A',stage:'Round 6',status:'finished',result_detail:'1-0'}
];
for(const group of [chessTranslationSamples,chessActive,chessCompleted]){
 for(const row of group){
   const zhLeague=bt.league(row.league,'chess','zh');
   const zhStage=bt.stage(row.stage,'chess','zh');
   assert(/[\u3400-\u9fff]/.test(zhLeague), 'Unlocalized chess tournament: '+row.league);
   assert(/[\u3400-\u9fff]/.test(zhStage), 'Unlocalized chess stage: '+row.stage);
   assert.equal(bt.league(row.league,'chess','en'),row.league);
   assert.equal(bt.stage(row.stage,'chess','en'),row.stage);
   if(row.status==='finished')assert(['白方胜','黑方胜','和棋'].includes(bt.chessResult(row.result_detail,'zh')),
    'Untranslated completed chess result: '+row.id);
 }
}
for(const row of board.events){
 if(!['go','chess'].includes(row.sport))continue;
 assert(bt.league(row.league,row.sport,'zh').trim(),'Empty translated tournament: '+row.id);
 if(row.stage)assert(bt.stage(row.stage,row.sport,'zh').trim(),'Empty translated round: '+row.id);
 assert(bt.player(row.home,row.sport,'zh',row.home_zh).trim(),'Empty home player: '+row.id);
 assert(bt.player(row.away,row.sport,'zh',row.away_zh).trim(),'Empty away player: '+row.id);
}
console.log('PASS: Safe Chinese localization for chess/Go tournaments, stages, players and preserved English source labels.');

const vizHost={};
vm.runInNewContext(read('bracket-viz.js'),{window:vizHost,Date,Intl},{timeout:3000});
assert(typeof vizHost.LiangYouBracketViz?.knockout==='function','Esports bracket renderer missing');
console.log('PASS: Bilingual sports data, market linking, knockout renderer, responsive calendar, and authenticated chess / professional Go pipeline.');

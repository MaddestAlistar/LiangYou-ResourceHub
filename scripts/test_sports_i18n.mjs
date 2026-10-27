import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(name,'utf8');
const html=read('index.html');
const fixtures=read('fixtures.js');
const market=read('sports.js');
const linker=read('sports-link.js');
const styles=read('fixtures.css');
const workflow=read('.github/workflows/refresh-data.yml');
const dispatcher=read('scripts/refresh_data.py');
const collector=read('scripts/update_board_games.py');
const data=JSON.parse(read('data/real-sports.json'));
const extra=JSON.parse(read('data/extra-sports.json'));
const board=JSON.parse(read('data/board-games.json'));
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
assert(html.indexOf('sports-i18n.js?')<html.indexOf('fixtures.js?'),'Dictionary must load first');
assert(/src="\.\/fixtures\.js\?v=\d+(?:\.\d+)+"/.test(html),'Browser cache must refresh fixture JS');
assert(fixtures.includes("['chess','go'].includes(x.sport)"),'Category records must be validated');
assert(fixtures.includes("board-games.json") && fixtures.includes('boardGeneratedAt'),'Board feeds must load and show verification date');
assert(fixtures.includes("providerName(") && fixtures.includes("time_precision==='date'"),'Board provider and date-only support missing');
assert(fixtures.includes("cache:'no-cache'") && fixtures.includes('Promise.all(['),'Parallel no-cache loading missing');
assert(fixtures.includes('showFixtureDetail') && fixtures.includes('refs.state.addEventListener'),'Calendar details must remain interactive');
assert(fixtures.includes('autoBoardStatus')&&fixtures.includes("refs.state.value='scheduled';autoBoardStatus=false"),'Temporary chess/Go recent-results fallback must reset when changing categories');
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

const vizHost={};
vm.runInNewContext(read('bracket-viz.js'),{window:vizHost,Date,Intl},{timeout:3000});
assert(typeof vizHost.LiangYouBracketViz?.knockout==='function','Esports bracket renderer missing');
console.log('PASS: Bilingual sports data, market linking, knockout renderer, responsive calendar, and authenticated chess / professional Go pipeline.');

import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const text = name => readFileSync(name, 'utf8');
const data = JSON.parse(text('data/projects.json'));
const html = text('index.html');
const css = text('style.css');
const js = text('app.js');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(new Set(ids).size, ids.length, 'Duplicate HTML IDs');
for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert(ids.includes(id), 'Broken section anchor: ' + id);
assert(Array.isArray(data.projects) && data.projects.length >= 3, 'Live projects missing');
assert(Array.isArray(data.future) && data.future.length >= 1, 'Future roadmap missing');
assert.equal(new Set([...data.projects, ...data.future].map(p => p.id)).size, data.projects.length + data.future.length, 'Duplicate catalog IDs');
const secureURL = value => { const u = new URL(value); assert.equal(u.protocol, 'https:', 'HTTPS required'); return u; };
const seenImports = new Set();
for (const p of data.projects) {
  assert(p.stage === 'live' && p.title && p.description, 'Incomplete project');
  assert(/^[a-z][a-z0-9-]*$/.test(p.id), 'Unsafe project ID');
  const repo = secureURL(p.repo);
  assert(repo.hostname === 'github.com' && repo.pathname.startsWith('/MaddestAlistar/'), 'Unexpected repository');
  assert(p.apps?.length && p.imports?.length && p.steps?.length && p.images?.length, 'Incomplete resource details');
  for (const i of p.imports) {
    const u = secureURL(i.url);
    assert(u.hostname === 'raw.githubusercontent.com' && u.pathname.startsWith(repo.pathname + '/main/'), 'Import must belong to original repository');
    assert(u.pathname.endsWith('.json') && !/\s/.test(i.url), 'Import URL must be encoded JSON address');
    assert(!seenImports.has(i.url), 'Duplicate import'); seenImports.add(i.url);
    assert(i.name && i.detail, 'Import purpose is required');
  }
  for (const src of p.images) {
    if (src.startsWith('./assets/previews/')) {
      assert(!src.includes('..') && existsSync(src.slice(2)), 'Missing or unsafe local preview');
    } else assert.fail('Preview must be served locally: ' + src);
  }
  if (p.imageLabels) assert.equal(p.imageLabels.length, p.images.length, 'Preview labels do not match images');
}
for (const p of data.future) {
  assert(p.title && p.description && p.format && p.audience && p.contents && p.caveat, 'Incomplete lab resource');
  assert(p.repo?.startsWith('https://github.com/MaddestAlistar/'), 'Resource Lab repository missing');
  assert(p.jsonUrl?.startsWith('https://raw.githubusercontent.com/MaddestAlistar/'), 'Resource Lab JSON index missing');
  assert(!p.imports && !p.url, 'Lab indexes must not pretend to be direct App imports');
}
for (const update of data.updates) assert(data.projects.some(p => p.id === update.project), 'Update points to missing project');
for (const key of ['icons', 'originalIcons', 'channels', 'platforms', 'sections']) assert(Number.isInteger(data.metrics[key]) && data.metrics[key] > 0, 'Invalid metric: ' + key);
assert(data.metrics.originalIcons <= data.metrics.icons, 'Invalid original icon count');
assert.equal(data.community.url, 'https://t.me/liangyouuniversity');
assert(html.includes(data.community.url), 'Missing Telegram destination');
assert.equal(data.social.url, 'https://xhslink.cn/o/8SW6tCkrHad');
assert(html.includes(data.social.url), 'Missing Xiaohongshu destination');
assert.deepEqual(data.projects.find(p => p.id === 'badges').imports.map(i => i.name), ['简易版', '合成徽章版', '复杂版'], 'Badge entry points must use the three official versions');
for (const marker of ['projectGrid', 'projectDialog', 'roadmapGrid', 'projectSearch', 'libraryCount', 'manualCopyValue', 'dialogStatus', 'quickLinks', 'filters']) assert(ids.includes(marker), 'Missing UI target: ' + marker);
for (const [, id] of js.matchAll(/\$\("([^"]+)"\)/g)) assert(ids.includes(id), 'JavaScript target missing: ' + id);
assert(js.includes('fetch("./data/projects.json"'), 'Catalog not loaded');
assert(css.includes('minmax(0, 1fr)') && css.includes('@media (max-width: 420px)'), 'Responsive layout missing');
assert(css.includes('overflow-wrap: anywhere') && css.includes('100dvh'), 'Long URL or small-screen modal protections missing');
for (const [, file] of html.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:\?[^"#]*)?"/g)) assert(existsSync(file), 'Missing local asset: ' + file);
assert(existsSync('og-cover.png'), 'Missing social preview PNG');
assert(existsSync('interactive/logo/index.html'), 'Missing interactive Logo page');
assert(/src="\.\/interactive\/logo\/embed\.html\?v=[\d.]+"/.test(html), 'Interactive Logo iframe missing');
assert.equal(html.split('<iframe ').length - 1, 1, 'Only one interactive Logo iframe is allowed');
assert(html.includes('id="interactive-logo"'), 'Hero 3D Logo anchor missing');
assert(!html.includes('logoInteractionToggle') && !html.includes('logo-showcase-section'), 'Obsolete 3D overlay or special section remains');
assert(existsSync('interactive/logo/embed.html'), 'Missing clean 3D embed page');
const embed=text('interactive/logo/embed.html');
assert(embed.includes('stage.addEventListener') && embed.includes('setEnergy(!energy)'), 'Embedded drag/click interactions missing');
assert(embed.includes('.social-panel,.bottom') || embed.includes('.topbar,.heading,.social-panel,.bottom'), 'Embedded social cards not hidden');
assert(data.metrics.icons > 0 && data.metrics.originalIcons > 0, 'Missing icon counts');
assert(data.metrics.channels > 0 && data.metrics.platforms > 0 && data.metrics.sections > 0, 'Missing channel counts');
const threeD=text('interactive/logo/index.html');
assert(threeD.includes("const data='./logo.webp'") && embed.includes("const data='./logo.webp'"), '3D texture must be served locally in both views');
assert(existsSync('interactive/logo/logo.webp'), 'Local 3D texture missing');
assert(!embed.includes('raw.githubusercontent.com'), 'Embedded logo still depends on GitHub Raw');
assert(existsSync('assets/image-fallback.svg'), 'Local image fallback missing');
assert(threeD.includes(data.social.url) && threeD.includes(data.community.url), '3D social links mismatch');
assert(html.includes('id="offers"'), 'App offers section missing');
assert.equal((html.match(/class="offer-card /g) || []).length, 8, 'Expected eight App discount cards');
assert(Array.isArray(data.offers?.items) && data.offers.items.length === 8, 'Eight offer links expected');
for(const item of data.offers.items) assert(html.includes(item.url.replaceAll('&','&amp;')), 'Offer link missing for ' + item.name);
assert(html.includes('hero-fullscreen') && html.includes('hero-logo-space'), '3D fullscreen link missing below logo');
assert(html.includes('quick-symbol'), 'Resource shortcut visual refresh missing');
assert(!html.includes('class="hero-byline"'), 'Old author byline remains in hero');
assert(html.includes('APP OFFERS · 良友福利'), 'Benefits label was not updated');
assert(html.includes('id="collabs"'), 'Collaboration showcase missing');
assert(Array.isArray(data.collabs) && data.collabs.length === 12, 'Expected twelve collaborations');
assert.equal((html.match(/class="collab-card/g) || []).length, 12, 'Twelve collaboration cards expected');
assert.equal(data.collabs[0].id, 'aptv');
assert.equal(data.collabs[1].id, 'senplayer');
for (const entry of data.collabs) {
  assert(existsSync(entry.image.slice(2)), 'Missing collaboration image: ' + entry.id);
  assert(html.includes(entry.image), 'Collaboration gallery reference missing: ' + entry.id);
}
assert(!html.includes('图片按你提供的联名原稿整理'), 'Removed gallery note came back');
assert(!html.includes('class="tf-disclaimer"'), 'Unrequested TF footer disclaimer remains');
assert(html.includes('通过 TestFlight Store 分发 TestFlight 内测名额，获取更多用户'), 'Updated TF subtitle missing');
assert(html.includes('12 款联名作品'), 'Collaboration gallery count not updated');
assert(html.includes('id="tf-store"'), 'TestFlight Store section missing');
assert(html.includes(data.tfstore.url), 'TestFlight Store registration URL mismatch');
assert(existsSync('assets/collabs/tfapp-v2.webp'), 'New TestFlight Store image missing');
assert(html.includes('assets/collabs/tfapp-v2.webp'), 'New TestFlight Store image reference missing');
for(const id of ['comink','carlink','floating','appcollection']) assert(data.collabs.some(p=>p.id===id),'New collaboration missing: '+id);
assert(!data.projects.find(p=>p.id==='badges').imports.some(i=>/原\s*(EplayerX|OopsPlayer|V12)/i.test(i.detail)), 'Historic badge labels still shown');
assert.equal(text('.nojekyll'), '', '.nojekyll must remain empty');
assert(html.includes('id="lab"') && html.includes('<h2 id="roadmap-title">资源实验室</h2>') && html.includes('<a href="#lab">实验室</a>'), 'Resource Lab section not found');
assert(!html.includes('v0.1 · 6 个仓库首版') && !html.includes('六个新项目，首版现已开放'), 'Stale first-version headings remain');
assert.equal(data.future.length, 6, 'Expected six Resource Lab projects');
for(const item of data.future){
  assert(item.title && item.description && item.contents && item.format && item.audience && item.caveat, 'Incomplete Resource Lab card');
  const url = secureURL(item.jsonUrl);
  assert(url.hostname === 'raw.githubusercontent.com' && url.pathname.startsWith('/MaddestAlistar/') && url.pathname.endsWith('/main/index.json'), 'Unexpected Lab JSON URL');
  const name = url.pathname.split('/')[2];
  assert(item.repo === 'https://github.com/MaddestAlistar/' + name, 'JSON repository mismatch');
}
assert(js.includes('data-lab-json') && js.includes('copyLabJSON') && js.includes('lab-copy-fallback'), 'JSON copy flow missing');
assert(html.includes('id="partners"') && html.includes('友情合作单位'), 'Partner section missing');
assert(html.includes('https://t.me/Amazing_jlqz') && html.includes('https://t.me/Chat3ayne'), 'Partner URLs missing');
for(const file of ['assets/partners/amzing.webp','assets/partners/3ayne.webp']){
  assert(existsSync(file), 'Partner logo missing: ' + file);
  assert(html.includes('./' + file), 'Partner logo not referenced: ' + file);
}
assert.equal((html.match(/class="partner-card /g) || []).length, 2, 'Expected exactly two partner cards');
console.log(`PASS: ${data.projects.length} resources, ${seenImports.size} valid import mappings, ${data.future.length} planned directions, HTML anchors and data references.`);


// Verified snapshots must be traceable, region-specific and safe to render.
const appleOffers = JSON.parse(text('data/daily-free.json'));
assert.equal(appleOffers.schema, 1);
for (const country of ['cn', 'us']) {
  const region = appleOffers.regions[country];
  assert(region && Array.isArray(region.items));
  const seen = new Set();
  for (const app of region.items) {
    assert(Number.isInteger(app.id) && !seen.has(app.id)); seen.add(app.id);
    assert(app.country === country && app.price === 0 && app.verification === 'current_apple_price_and_recent_dated_drop');
    assert(app.source_url?.startsWith('https://') && Number.isFinite(Date.parse(app.discovered_at)));
    if (app.icon) assert(app.icon.startsWith('./assets/daily-free/') && existsSync(app.icon.slice(2)), 'Missing Apple icon');
  }
}
const androidOffers=JSON.parse(text('data/android-free.json'));
assert.equal(androidOffers.schema,1,'Android JSON schema mismatch');
assert.equal(androidOffers.price_confirmation,'google_play_public_page','Android offers require current store-page verification');
assert(Array.isArray(androidOffers.items));
const seenAndroid=new Set();
for(const app of androidOffers.items){
  assert(typeof app.package==='string' && /^[a-zA-Z][\w]*(?:\.[\w]+)+$/.test(app.package),'Invalid Google Play package');
  assert(!seenAndroid.has(app.package),'Duplicated Android app'); seenAndroid.add(app.package);
  assert(app.source==='AppSales' && app.country==='us' && app.price===0);
  assert(app.verification === 'google_play_page_price_and_appsales_drop');
  assert(Number.isFinite(Date.parse(app.verified_at)) && app.url.startsWith('https://play.google.com/store/apps/details?id='));
  if(app.icon) assert(app.icon.startsWith('./assets/android-free/') && existsSync(app.icon.slice(2)), 'Missing Android icon');
}
const gameOffers=JSON.parse(text('data/game-free.json'));
assert.equal(gameOffers.schema,1);
for(const platform of ['steam','epic']) {
  const section = gameOffers.platforms[platform];
  assert(Array.isArray(section.items));
  const seen = new Set();
  for(const item of section.items) {
    assert(!seen.has(item.id)); seen.add(item.id);
    assert(item.price === 0 && item.verification === 'official_active_free_to_keep');
    assert(['game','dlc'].includes(item.kind) && Number.isFinite(Date.parse(item.ends_at)));
    const url = secureURL(item.url);
    assert(url.hostname === (platform === 'steam' ? 'store.steampowered.com' : 'store.epicgames.com'));
    if(item.icon) assert(item.icon.startsWith('./assets/game-free/') && existsSync(item.icon.slice(2)), 'Missing game image');
  }
}
const sports = JSON.parse(text('data/sports.json'));
assert.equal(sports.source_type, 'prediction_market');
assert(Array.isArray(sports.events));
for(const event of sports.events) {
  assert(event.verification === 'open_match_winner_market' && Number.isFinite(Date.parse(event.start_time)));
  assert([2,3].includes(event.outcomes.length));
  assert(event.outcomes.every(o => o.market_id && Number.isFinite(o.probability) && o.probability >= 0 && o.probability <= 1));
}
const kalshi = JSON.parse(text('data/kalshi-sports.json'));
assert.equal(kalshi.schema,1);
assert.equal(kalshi.source_type,'prediction_market');
if(kalshi.link_schema_version != null) assert.equal(kalshi.link_schema_version,2);
assert(Array.isArray(kalshi.events));
for(const e of kalshi.events){
  assert(e.provider==='kalshi' && e.verification==='open_match_winner_market');
  assert(['market_close','kickoff'].includes(e.time_kind));
  assert([2,3].includes(e.outcomes.length));
  assert(/^https:\/\/kalshi\.com\/markets\/[a-z0-9-]+(?:\/[a-z0-9-]+\/[a-z0-9-]+)?$/.test(e.source_url));
  for(const o of e.outcomes) assert(o.market_id && Number.isFinite(o.probability) && o.probability>0 && o.probability<1 &&
    o.best_bid>0 && o.best_ask<1 && o.best_bid<=o.best_ask);
  for(const n of ['volume_24h_contracts','volume_total_contracts','open_interest_contracts'])
    if(n in (e.stats||{})) assert(Number.isFinite(e.stats[n]) && e.stats[n]>=0);
}
const predict = JSON.parse(text('data/predict-sports.json'));
assert.equal(predict.source_type,'prediction_market');
assert(Array.isArray(predict.events));
for (const event of [...sports.events,...predict.events]) {
  if(event.stats?.volume_total_usd && event.stats?.volume_24h_usd) {
    assert(event.stats.volume_24h_usd <= event.stats.volume_total_usd,
      'Invalid 24h/total volume: '+ (event.provider||'polymarket')+' / '+event.id +
      ' / '+event.stats.volume_24h_usd+' > '+event.stats.volume_total_usd);
  }
  if (event.stats) for(const name of ['volume_24h_usd','volume_total_usd','liquidity_usd']) {
    if(name in event.stats) assert(Number.isFinite(event.stats[name]) && event.stats[name] > 0);
  }
  for(const outcome of event.outcomes) {
    assert(!('_clob_token' in outcome) && !('_clob_ref' in outcome),'CLOB internal tokens leaked');
    if('best_bid' in outcome || 'best_ask' in outcome) {
      assert(outcome.best_bid > 0 && outcome.best_ask < 1 && outcome.best_bid <= outcome.best_ask);
    }
  }
}
for (const platform of ['cn','us','android','steam','epic']) assert(html.includes('data-daily-region="' + platform + '"'));
assert(html.includes('id="dailyFreeMore"') && html.includes('id="dailyFreeRefresh"'));

// Official fixture snapshots are independent of prediction market odds.
const fixtureSnapshot = JSON.parse(text('data/real-sports.json'));
assert.equal(fixtureSnapshot.schema,1);
assert.equal(fixtureSnapshot.source_type,'official_fixtures');
assert(Array.isArray(fixtureSnapshot.events));
const fixtureIds=new Set();
for(const match of fixtureSnapshot.events){
  assert(typeof match.id==='string'&&!fixtureIds.has(match.id),'Duplicate fixture ID');
  fixtureIds.add(match.id);
  assert(['api-sports','pandascore'].includes(match.provider));
  assert(['lol','esports','football','basketball'].includes(match.sport));
  assert(['scheduled','live','finished'].includes(match.status));
  assert(match.home&&match.away&&Number.isFinite(Date.parse(match.start_time)));
  for(const key of ['score_home','score_away'])
    assert(match[key]===null||(Number.isInteger(match[key])&&match[key]>=0&&match[key]<1000));
  if(match.status==='scheduled')assert(match.score_home===null&&match.score_away===null);
}
for(const target of ['officialFixtures','officialFixturesGrid','officialFixturesStatus',
  'officialFixturesSearch','officialFixturesCategory','officialFixturesMore'])
  assert(html.includes('id="'+target+'"'),'Missing real fixture UI target: '+target);
for(const file of ['fixtures.js','fixtures.css'])assert(existsSync(file),'Missing fixture asset');

const feedStatus=JSON.parse(text('data/update-status.json'));
assert.equal(feedStatus.schema,1);
for(const key of ['apple','android','games','sports']) assert(feedStatus.jobs[key]?.interval_hours > 0);
// A newly installed feed has no status until the first scheduled collection.
if (feedStatus.jobs.predict) assert(feedStatus.jobs.predict.interval_hours > 0);
if (feedStatus.jobs.kalshi) assert(feedStatus.jobs.kalshi.interval_hours > 0);
if (feedStatus.jobs.fixtures) assert.equal(feedStatus.jobs.fixtures.interval_hours,6);
console.log('PASS: Regional Apple, verified Android, Steam/Epic, sports provenance and scheduler metadata.');

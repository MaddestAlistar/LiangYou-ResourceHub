import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
const read = path => readFileSync(path,'utf8');
const page=read('index.html');
const loader=read('china-perf.js');
const cache=read('china-cache-sw.js');
const gallery=read('app.js');
const style=read('design.css');
const direct=[...page.matchAll(/<script\s+src="\.\/([^"?]+)(?:\?[^"]*)?"\s+defer><\/script>/g)].map(x=>x[1]);
assert(direct.includes('china-perf.js'),'Progressive module loader must run');
assert(direct.includes('app.js'),'The resource gallery must remain direct-loaded');
const heavy=[
  'media-core.js','media-intel.js','media-toolkit.js','media-title-news.js',
  'media-insights.js','media-cn-enhance.js','media-exact-scores.js',
  'media-boxoffice-rankings.js','sports-i18n.js','sports-link.js',
  'sports-personal.js','sports.js','bracket-viz.js','board-i18n.js',
  'sports-share.js','sports-history.js','fixtures.js','daily-free.js'
];
for(const file of heavy){
  assert(existsSync(file),'Missing feature module '+file);
  assert(!direct.includes(file),'Feature must not block homepage: '+file);
  assert(loader.includes("'./"+file+'?'),'Missing deferred module '+file);
}
assert(loader.indexOf('media-core.js')<loader.indexOf('media-intel.js'));
assert(loader.indexOf('sports-i18n.js')<loader.indexOf('fixtures.js'));
const stylesheetFiles=[
  'daily-free.css','sports.css','fixtures.css','sports-personal.css',
  'sports-share.css','sports-history.css','media-intel.css',
  'media-toolkit.css','media-cn-enhance.css','media-boxoffice-rankings.css'
];
const directStyles=[...page.matchAll(/<link rel="stylesheet" href="\.\/([^"?]+)(?:\?[^"]*)?">/g)].map(x=>x[1]);
assert(directStyles.length===5,'Only foundational homepage styles should block first render');
for(const file of stylesheetFiles){
  assert(existsSync(file),'Missing deferred stylesheet '+file);
  assert(!directStyles.includes(file),'Feature stylesheet must not block homepage: '+file);
  assert(loader.includes("'./"+file+'?'),'Missing stylesheet in lazy loader: '+file);
}
assert(loader.indexOf('media-intel.js')<loader.indexOf('media-boxoffice-rankings.js'),
  'Core film catalogue should render before optional enrichment');
assert(loader.includes('await loadStyles(module.styles)'),'Core feature CSS must load before its JS initialization');
assert(loader.includes('startMediaExtras(module)'),'Film detail tools should hydrate after core film browsing');
assert(loader.includes("module.id === 'sports'"),'Replay market readiness after all sports modules load');
assert(loader.includes('IntersectionObserver'),'Feature scripts must load near their sections');
assert(loader.includes('hashchange'),'Hash navigation must load modules');
assert(loader.includes("hash === '#daily-free'"),'Daily Freebies deep link must be immediate');
assert(page.includes('id="media"')&&page.includes('id="sports"'));
assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com|ajax\.googleapis\.com/.test(page));
assert(cache.includes('RECHECK_AFTER'),'Mutable cached artwork should refresh');
assert(cache.includes("liangyou-art-v2"),'Artwork cache must be versioned');
assert(cache.includes("url.origin !== scope.origin"),'Cache must not intercept external domains');
assert(cache.includes("request.mode === 'navigate'"),'Do not cache full HTML navigation');
assert(!/\.json[^\n]*test\(/.test(cache),'Live JSON feeds must never be cached');
assert(gallery.includes('liangyou-project-directory-v1'),'Only directory may use bounded local fallback');
assert(style.includes('cn-save-data'),'Save-Data should disable decorative motion');
const logo=read('interactive/logo/embed.html');
assert(logo.includes("liangyou:logo-visibility"),'Embedded 3D animation must honor visibility messages');
assert(loader.includes('logoFrame.contentWindow?.postMessage'),'Homepage must pause offscreen logo rendering');
assert(page.includes('embed.html?v=4.2'),'Animation iframe must use updated version');
assert(page.includes('rel="preload" as="image" type="image/webp" href="./interactive/logo/logo.webp"'), '3D hero texture must preload in the parent document');

// The large thumbnail and source snapshot must stay compact on future refreshes.
const projectData=JSON.parse(read('data/projects.json'));
const iconProject=projectData.projects.find(p=>p.id==='icons');
assert(iconProject?.images.includes('./assets/previews/icons-komic.webp'),
  'Icon Library should use the converted WebP instead of the oversized PNG');
assert(statSync('assets/previews/icons-komic.webp').size < 130000,
  'The gallery WebP must remain smaller than the original 514 KB PNG');
const mediaSnapshot=read('data/media-intel.json');
assert(mediaSnapshot.startsWith('{"schema":'), 'Film snapshot should be compact JSON');
const mediaRecord=JSON.parse(mediaSnapshot);
assert(mediaRecord.schema===1 && Object.keys(mediaRecord.works||{}).length>100,
  'Film snapshot must retain full verified works and source data');
const embed=read('interactive/logo/embed.html');
assert(embed.includes('const depthCount='),'Mobile logo should reduce compositing work');
assert(loader.includes("startMediaExtras(module)"),'Media detail enrichment must run after base catalogue');
console.log('PASS: mainland-friendly homepage loads core first, lazy-loads modules, and only caches local artwork');

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
  'sports-share.js','sports-history.js','fixtures.js'
];
for(const file of heavy){
  assert(existsSync(file),'Missing feature module '+file);
  assert(!direct.includes(file),'Feature must not block homepage: '+file);
  assert(loader.includes("'./"+file+'?'),'Missing deferred module '+file);
}
assert(loader.indexOf('media-core.js')<loader.indexOf('media-intel.js'));
assert(loader.indexOf('sports-i18n.js')<loader.indexOf('fixtures.js'));
assert(loader.includes('IntersectionObserver'),'Feature scripts must load near their sections');
assert(loader.includes('hashchange'),'Hash navigation must load modules');
assert(page.includes('id="media"')&&page.includes('id="sports"'));
assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com|ajax\.googleapis\.com/.test(page));
assert(cache.includes("url.origin !== scope.origin"),'Cache must not intercept external domains');
assert(cache.includes("request.mode === 'navigate'"),'Do not cache full HTML navigation');
assert(!/\.json[^\n]*test\(/.test(cache),'Live JSON feeds must never be cached');
assert(gallery.includes('liangyou-project-directory-v1'),'Only directory may use bounded local fallback');
assert(style.includes('cn-save-data'),'Save-Data should disable decorative motion');
console.log('PASS: mainland-friendly homepage loads core first, lazy-loads modules, and only caches local artwork');

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
  p.images.forEach(secureURL);
}
for (const p of data.future) {
  assert(p.title && p.description && p.format && p.audience && p.next, 'Incomplete roadmap');
  assert(['priority', 'research'].includes(p.phase), 'Unknown roadmap phase');
  assert(!p.imports && !p.url, 'Unreleased resources must not have import links');
}
for (const update of data.updates) assert(data.projects.some(p => p.id === update.project), 'Update points to missing project');
for (const key of ['icons', 'originalIcons', 'channels', 'platforms', 'sections']) assert(Number.isInteger(data.metrics[key]) && data.metrics[key] > 0, 'Invalid metric: ' + key);
assert(data.metrics.originalIcons <= data.metrics.icons, 'Invalid original icon count');
assert.equal(data.community.url, 'https://t.me/liangyouuniversity');
assert(html.includes(data.community.url), 'Missing Telegram destination');
for (const marker of ['projectGrid', 'projectDialog', 'roadmapGrid', 'projectSearch', 'libraryCount', 'manualCopyValue', 'dialogStatus', 'quickLinks', 'filters']) assert(ids.includes(marker), 'Missing UI target: ' + marker);
for (const [, id] of js.matchAll(/\$\("([^"]+)"\)/g)) assert(ids.includes(id), 'JavaScript target missing: ' + id);
assert(js.includes('fetch("./data/projects.json"'), 'Catalog not loaded');
assert(css.includes('minmax(0, 1fr)') && css.includes('@media (max-width: 420px)'), 'Responsive layout missing');
assert(css.includes('overflow-wrap: anywhere') && css.includes('100dvh'), 'Long URL or small-screen modal protections missing');
for (const [, file] of html.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:\?[^"#]*)?"/g)) assert(existsSync(file), 'Missing local asset: ' + file);
assert(existsSync('og-cover.png'), 'Missing social preview PNG');
assert.equal(text('.nojekyll'), '', '.nojekyll must remain empty');
console.log(`PASS: ${data.projects.length} resources, ${seenImports.size} valid import mappings, ${data.future.length} planned directions, HTML anchors and data references.`);

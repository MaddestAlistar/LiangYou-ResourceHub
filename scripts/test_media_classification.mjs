/* Public TMDB tags and country-specific parental guidance; missing data stays hidden. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../media-intel.js',import.meta.url),'utf8');
const begin=src.indexOf('  function classificationData(work){');
const end=src.indexOf('  function notify(',begin);
assert.ok(begin>=0&&end>begin,'classification functions must exist');
const slice=src.slice(begin,end);
const escape=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const {classificationCard,classificationDetail}=new Function('text','esc',slice+';return {classificationCard,classificationDetail};')((zh)=>zh,escape);

test('card shows only available TMDB keywords, genres and rated country',()=>{
 const record={profile:{genres:['剧情','悬疑'],keywords:['psychological thriller'],
 parental_rating:{country:'US',rating:'PG-13',source:'TMDB'}}};
 assert.match(classificationCard(record),/剧情/);
 assert.match(classificationCard(record),/悬疑/);
 assert.match(classificationCard(record),/psychological thriller/);
 assert.match(classificationCard(record),/家长指南 · US PG-13/);
 assert.match(classificationDetail(record),/主题标签/);
 assert.match(classificationDetail(record),/家长指南 · 地区分级/);
 assert.match(classificationDetail(record),/TMDB 收录的地区分级/);
});
test('absent genre and certification create no empty blocks at all',()=>{
 assert.equal(classificationCard({profile:{}}),'');
 assert.equal(classificationDetail({profile:{}}),'');
 assert.equal(classificationCard({}),'');
 assert.equal(classificationDetail({}),'');
});
test('a genre without parent guidance does not imply a rating or content warning',()=>{
 const card=classificationCard({profile:{genres:['喜剧'],parental_rating:null}});
 assert.match(card,/喜剧/);
 assert.doesNotMatch(card,/家长指南|mi-age-pill/);
});
test('unverified or malformed classifications never appear',()=>{
 const bad=[{country:'US',rating:'PG-13',source:'guessed'},
 {country:'CN',rating:'NR',source:'TMDB'},
 {country:'ZZ',rating:'18',source:'TMDB'},
 {country:'US',rating:'<script>',source:'TMDB'}];
 for(const age of bad){
  assert.equal(classificationCard({profile:{parental_rating:age}}),'');
  assert.equal(classificationDetail({profile:{parental_rating:age}}),'');
 }
});
test('HTML special characters are escaped and excessive keywords are capped',()=>{
 const tags=['<x>','space western','drama','family film','comedy','thriller','romance'];
 const card=classificationCard({profile:{keywords:tags}});
 assert.doesNotMatch(card,/<x>/);
 assert.ok((card.match(/mi-tag-pill/g)||[]).length<=2);
 const detail=classificationDetail({profile:{keywords:tags}});
 assert.ok((detail.match(/mi-keyword-pill/g)||[]).length<=6);
});

test('visible-card metadata requests are bounded and do not block the film grid',()=>{
 const insights=readFileSync(new URL('../media-insights.js',import.meta.url),'utf8');
 assert.match(src,/liangyou:media-visible/);
 assert.doesNotMatch(src,/liangyou:media-tiles/);
 assert.doesNotMatch(insights,/liangyou:media-tiles/);
 assert.match(insights,/root\.addEventListener\('liangyou:media-visible'/);
 assert.match(insights,/visibleInFlight<2/);
 assert.match(insights,/visibleAttempts\.size<24/);
 assert.match(insights,/hydrateClassification\(info\)/);
 assert.match(src,/insertAdjacentHTML\('afterend',markup\)/);
 assert.doesNotMatch(src,/w\.profile=\{\.\.\.\(w\.profile\|\|\{\}\),genres,keywords,parental_rating\};\s*render\(\)/);
});

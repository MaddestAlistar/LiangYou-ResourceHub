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

test('anime genres, theme tags and MAL guidance render without source captions',()=>{
 const work={kind:'anime',profile:{genres:['Action','Adventure','Fantasy','Shounen'],
   keywords:['Pirates','Found Family'],anime_genre_source:'AniList',anime_theme_source:'Bangumi',
   parental_rating:{source:'MAL',rating:'PG-13'}}};
 const card=classificationCard(work),detail=classificationDetail(work);
 assert.match(card,/动作/);
 assert.match(card,/冒险/);
 assert.match(card,/家长指南 · MAL PG-13/);
 assert.match(detail,/作品类型/);
 assert.match(detail,/主题标签/);
 assert.match(detail,/海盗/);
 assert.match(detail,/伙伴羁绊/);
 assert.doesNotMatch(detail,/来源：AniList|来源：Bangumi|Source: /);
 assert.match(detail,/MAL · PG-13/);
 assert.match(detail,/并非国家或地区官方年龄分级/);
});
test('anime with no verified parental metadata never invents an age or hides guidance',()=>{
 const title={kind:'anime',profile:{genres:['Comedy'],keywords:[],parental_rating:null}};
 const html=classificationDetail(title);
 assert.match(html,/家长指南/);
 assert.match(html,/尚无可核验的内容分级/);
 assert.doesNotMatch(html,/PG-13|18岁以上|适合儿童/);
 assert.doesNotMatch(classificationCard(title),/mi-age-pill/);
 const fake={kind:'anime',profile:{parental_rating:{source:'guessed',rating:'PG-13'}}};
 assert.doesNotMatch(classificationDetail(fake),/MAL · PG-13/);
 assert.match(classificationDetail(fake),/尚无可核验的内容分级/);
});
test('anime enrichment is exact-ID and cannot reset the film video player',()=>{
 assert.match(src,/media-anime-classification\.json/);
 assert.match(src,/x\?\.workId===w\.id/);
 assert.match(src,/x\?\.kind==='anime'/);
 assert.match(src,/patchAnimeTags\(applyAnimeMetadata\(\)\)/);
 assert.match(src,/querySelector\('\.mi-classification-detail'\)/);
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

test('verified MAL scores render directly on anime cover cards with their own precision',()=>{
 assert.match(src,/r\.source==='MyAnimeList'\?r\.value\.toFixed\(2\)/);
 assert.match(src,/source:'MyAnimeList',value:record\.score/);
 assert.match(src,/ratingBox\.innerHTML=scores\(w\)/);
 assert.match(src,/verifiedAnimePeers=Object\.freeze/);
 assert.match(src,/if\(peer\)for\(const r of peer\.ratings/);
});

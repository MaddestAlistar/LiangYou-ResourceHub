/* Exact anime edition reconciliation: never join unrelated seasons. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const scope={};
runInNewContext(readFileSync(new URL('../media-core.js',import.meta.url),'utf8'),scope);
const core=scope.LiangYouMedia;
const d=JSON.parse(readFileSync(new URL('../data/media-intel.json',import.meta.url),'utf8'));

test('Japanese third-season titles match despite original remake year',()=>{
  assert.equal(core.animeTitleKey('らんま1/2 第3期'),core.animeTitleKey('らんま1/2 (2024) 第3期'));
  assert.notEqual(core.animeTitleKey('らんま1/2 第2期'),core.animeTitleKey('らんま1/2 (2024) 第3期'));
});

test('Ranma 2026 metadata joins without mixing scores or losing Chinese name',()=>{
  const merged=core.mergeAnimeCatalog(core.catalog(d));
  assert.equal(merged.aliases['mal-63801'],'bangumi-637802');
  assert.equal(merged.aliases['anilist-209872'],'bangumi-637802');
  const w=merged.works['bangumi-637802'];
  assert.ok(w);assert.equal(w.mal_id,63801);
  assert.equal(merged.works['mal-63801'],undefined);
  assert.ok(w.ratings.some(x=>x.source==='Bangumi'&&x.value===7.5));
  assert.ok(w.ratings.some(x=>x.source==='AniList'&&x.value===78));
});

test('different seasons, remake years, kind and MAL IDs never join',()=>{
  const works={
    'bangumi-11':{id:'bangumi-11',title:'作品 第2期',date:'2026-10-01',kind:'anime'},
    'mal-12':{id:'mal-12',title:'作品 第3期',date:'2026-10-01',kind:'anime'},
    'mal-13':{id:'mal-13',title:'作品 第2期',date:'2022-10-01',kind:'anime'},
    'mal-14':{id:'mal-14',title:'其他作品 第2期',date:'2026-10-01',kind:'anime'},
    'mal-15':{id:'mal-15',title:'作品 第2期',date:'2026-10-01',kind:'movie'},
    'mal-21':{id:'mal-21',title:'Other Title 第3期',date:'2026-10-01',kind:'anime',mal_id:21},
    'mal-22':{id:'mal-22',title:'Other Title 第3期',date:'2026-10-01',kind:'anime',mal_id:22}
  };
  const joined=core.mergeAnimeCatalog({works,aliases:{}});
  assert.equal(Object.keys(joined.works).length,Object.keys(works).length);
});

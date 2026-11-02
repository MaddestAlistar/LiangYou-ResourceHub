import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const cards=readFileSync(new URL('../media-shortdrama.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../media-intel.css',import.meta.url),'utf8');
const loader=readFileSync(new URL('../china-perf.js',import.meta.url),'utf8');

test('short drama cards show genre labels without test playback controls',()=>{
  assert.match(cards,/mi-drama-tags/);
  assert.match(cards,/mi-drama-rating/);
  assert.match(cards,/mi-drama-overview/);
  assert.doesNotMatch(cards,/data-drama-playtest|mi-drama-test-play|测试播放|查看作品来源/);
  assert.doesNotMatch(css,/mi-drama-test-play|mi-dpt-dialog|mi-dpt-demo/);
});

test('site does not download or initialize experimental short drama playback',()=>{
  assert.match(loader,/media-shortdrama\.js/);
  assert.doesNotMatch(loader,/media-shortdrama-player\.js/);
  assert.match(loader,/media-intel\.css/);
});

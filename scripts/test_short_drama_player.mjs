import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const player=readFileSync(new URL('../media-shortdrama-player.js',import.meta.url),'utf8');
const cards=readFileSync(new URL('../media-shortdrama.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../media-intel.css',import.meta.url),'utf8');
const loader=readFileSync(new URL('../china-perf.js',import.meta.url),'utf8');
const config=JSON.parse(readFileSync(new URL('../data/short-drama-playback-test.json',import.meta.url),'utf8'));

test('short drama cards show a test button without exposing provider labels',()=>{
  assert.match(cards,/data-drama-playtest/);
  assert.match(cards,/mi-drama-tag-items/);
  assert.doesNotMatch(cards,/查看作品来源/);
  assert.match(css,/\.mi-drama-test-play/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto/);
});

test('playback modal is lazy, closable and mobile-native',()=>{
  assert.match(player,/document\.createElement\('dialog'\)/);
  assert.match(player,/<video controls playsinline webkit-playsinline/);
  assert.match(player,/dialog\.addEventListener\('close',stop\)/);
  assert.match(player,/video\.removeAttribute\('src'\)/);
  assert.match(player,/mi-dpt-episode/);
  assert.match(css,/\.mi-dpt-dialog::backdrop/);
});

test('no obfuscated worker is executed in site, and unavailable streams are not faked',()=>{
  assert.equal(config.schema,1);
  assert.equal(config.enabled,false);
  assert.equal(config.resolveEndpoint,'');
  assert.match(player,/if\(settings\?\.schema!==1\|\|settings\?\.enabled!==true\|\|!endpoint\)/);
  assert.doesNotMatch(player,/hongguo-native\.obfuscated|createHandler\(/);
  assert.match(player,/https:/);
  assert.match(loader,/media-shortdrama-player\.js/);
});

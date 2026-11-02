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

test('public sample media goes directly to its CDN and is explicitly labeled as a demonstration',()=>{
  assert.ok(player.includes('data-demo-stream="mp4"'));
  assert.ok(player.includes('data-demo-stream="hls"'));
  assert.ok(player.includes('test-videos.co.uk/vids/bigbuckbunny'));
  assert.ok(player.includes('test-streams.mux.dev/x36xhzz'));
  assert.ok(player.includes('非当前短剧正片'));
  assert.ok(player.includes('2008 Blender Foundation · CC BY 3.0'));
  assert.ok(player.includes("video.addEventListener('playing'"));
  assert.ok(css.includes('.mi-dpt-demo-button'));
  assert.ok(player.includes('await video.play()'));
  assert.ok(!player.includes('.workers.dev/video.mp4'));
});

test('no obfuscated worker is executed in site, and unavailable streams are not faked',()=>{
  assert.equal(config.schema,1);
  assert.equal(config.enabled,true);
  assert.equal(config.resolveEndpoint,'https://liangyou-short-drama-playback.maddestalistar.workers.dev/api/resolve');
  assert.match(player,/if\(settings\?\.schema!==1\|\|settings\?\.enabled!==true\|\|!endpoint\)/);
  assert.doesNotMatch(player,/hongguo-native\.obfuscated|createHandler\(/);
  assert.match(player,/https:/);
  assert.match(loader,/media-shortdrama-player\.js/);
});

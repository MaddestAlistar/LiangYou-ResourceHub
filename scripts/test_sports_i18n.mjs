import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('sports-i18n.js', 'utf8');
const window = {};
vm.runInNewContext(source, { window });
const tr = window.LiangYouSportsI18n;
assert(tr, 'Translation registry missing');
for (const lang of ['zh', 'en']) {
  for (const key of ['title', 'intro', 'sourceNote', 'download', 'promoTitle',
    'prediction', 'more', 'shown', 'all', 'football', 'lol']) {
    assert(tr.ui[lang][key], lang + ' text missing: ' + key);
  }
}
assert.equal(tr.team('Top Esports', 'lol', 'zh'), 'TES（滔搏）');
assert.equal(tr.team("Anyone's Legend", 'lol', 'zh'), 'AL');
assert.equal(tr.team('Heat', 'basketball', 'zh'), '热火');
assert.equal(tr.team('Arsenal FC', 'football', 'zh'), '阿森纳');
assert.equal(tr.team('平局', 'football', 'en'), 'Draw');
assert.equal(tr.team('Unknown New Club', 'football', 'zh'), 'Unknown New Club');
assert.equal(tr.league('Premier League 2025', 'football', 'zh'), '英超');
assert.equal(tr.league('La Liga 2', 'football', 'zh'), '西乙');
assert.equal(tr.league('Scottish Premier League', 'football', 'zh'), 'Scottish Premier League');
assert.equal(tr.league('League of Legends', 'lol', 'zh'), '英雄联盟');

const lol = {
  title: "LoL: Top Esports vs Anyone's Legend (BO1) - Worlds Group Stage",
  category: 'lol',
  outcomes: [{ name: 'Top Esports', probability: 0.365 },
    { name: "Anyone's Legend", probability: 0.635 }]
};
assert.equal(tr.title(lol, 'zh'), 'TES（滔搏） 对阵 AL · BO1 · 全球总决赛小组赛');
assert.equal(tr.title(lol, 'en'), lol.title);
const football = {
  title: 'Arsenal FC vs. Everton FC',
  category: 'football',
  outcomes: [
    { name: 'Arsenal FC', probability: 0.68 },
    { name: '平局', probability: 0.21 },
    { name: 'Everton FC', probability: 0.13 }
  ]
};
assert.equal(tr.title(football, 'zh'), '阿森纳 对阵 埃弗顿');
assert.equal(tr.title(football, 'en'), 'Arsenal FC vs. Everton FC');

const live = JSON.parse(readFileSync('data/sports.json', 'utf8'));
assert(Array.isArray(live.events), 'Sports snapshot must exist');
for (const event of live.events) {
  for (const lang of ['zh', 'en']) {
    assert(tr.title(event, lang).length > 0, 'Blank match title: ' + event.id);
    assert(tr.league(event.league, event.category, lang).length > 0, 'Blank league: ' + event.id);
    event.outcomes.forEach(outcome => {
      assert(tr.team(outcome.name, event.category, lang).length > 0, 'Blank team: ' + event.id);
    });
  }
}
const html = readFileSync('index.html', 'utf8');
assert(html.includes('data-sports-lang="zh"') && html.includes('data-sports-lang="en"'));
assert(html.indexOf('sports-i18n.js?') < html.indexOf('sports.js?'), 'Dictionary must load first');
assert(html.includes('data-sports-t="sourceNote"'));
const ui = readFileSync('sports.js', 'utf8');
assert(ui.includes('renderStatic()') && ui.includes('translation.title(event, language)'));
console.log('PASS: Chinese-English translations, original names and snapshot match titles');

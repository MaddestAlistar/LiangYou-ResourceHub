/* Media dossier slot-order contracts. No network or API credentials required. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const core=source('media-intel.js');
const toolkit=source('media-toolkit.js');
const insights=source('media-insights.js');
const domestic=source('media-cn-enhance.js');
const exact=source('media-exact-scores.js');
const rankings=source('media-boxoffice-rankings.js');
const index=source('index.html');
const section=(text,start,end)=>{
 const a=text.indexOf(start),b=text.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Missing section '+start);
 return text.slice(a,b);
};

test('rating layout has stable source positions before optional manual lookup',()=>{
 const ratings=section(core,'  function scorePanel(w){','  function overview(w){');
 const slots=[...ratings.matchAll(/data-mi-ratings-slot="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(slots,['exact','domestic','mal','manual']);
 assert.match(exact,/\[data-mi-ratings-slot="exact"\]/);
 assert.match(domestic,/\[data-mi-ratings-slot="domestic"\]/);
 assert.match(insights,/\[data-mi-ratings-slot="mal"\]/);
 assert.match(toolkit,/\[data-mi-ratings-slot="manual"\]/);
});
test('manual rating selector excludes all six providers with supported automatic matching',()=>{
 const ratings=section(toolkit,'  function displayRatings(info){',"  dialog.addEventListener('submit'");
 assert.match(ratings,/MyDramaList/);
 assert.doesNotMatch(ratings,/value="(?:simkl|kitsu|bilibili|filmarks|maoyan|cn-aggregate)"/);
 assert.doesNotMatch(ratings,/mtk-find-aggregate/);
});
test('individual film box office is stable regardless of asynchronous data arrival',()=>{
 const panel=section(core,'  function boxOfficePanel(){','  function discoverPanel(w){');
 const slots=[...panel.matchAll(/data-mi-boxoffice-slot="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(slots,['mainland','international','archive']);
 assert.match(domestic,/\[data-mi-boxoffice-slot="mainland"\]/);
 assert.match(insights,/\[data-mi-boxoffice-slot="international"\]/);
 assert.match(insights,/\[data-mi-boxoffice-slot="archive"\]/);
});
test('2019 worldwide archive is absent, other independent charts remain',()=>{
 assert.doesNotMatch(rankings,/2019年10月存档|media-worldwide-archive\.json/);
 for(const name of ['world-current','china','korea'])
   assert.ok(rankings.includes("panel('"+name+"'"),name+' must remain visible');
 assert.ok(!rankings.includes("panel('world',"),'legacy world chart must be gone');
});
test('mainstream YouTube player is default and privacy mode stays selectable',()=>{
 assert.match(insights,/showTrailerFrame\(id,true\)/);
 assert.match(insights,/const hostname=standard\?'www\.youtube\.com':'www\.youtube-nocookie\.com'/);
 assert.match(index,/>切换隐私播放器<\/button>/);
});
test('changed assets invalidate old browser cache',()=>{
 const versions={
  'media-intel.js':'20261029.liveguides5',
  'media-toolkit.js':'20261029.autoscore1',
  'media-insights.js':'20261029.liveguides4',
  'media-cn-enhance.js':'20261029.stablelayout1',
  'media-exact-scores.js':'20261029.stablelayout1',
  'media-boxoffice-rankings.js':'20261029.noarchive1'
 };
 for(const [name,version] of Object.entries(versions))
   assert.ok(index.includes('./'+name+'?v='+version),name);
});

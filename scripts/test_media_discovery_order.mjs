/* Offline contract: discovery modules stay in a predictable visual and DOM order. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const core=file('media-intel.js');
const insights=file('media-insights.js');
const mainland=file('media-cn-enhance.js');
const index=file('index.html');
const expected=['trailers','international','domestic','related','similar'];

function panel(work){
  const start=core.indexOf('  function discoverPanel(w){');
  const end=core.indexOf('  function episodes(w){',start);
  assert.ok(start>=0&&end>start,'Discovery renderer exists');
  const source=core.slice(start,end);
  const factory=new Function('cat','text','link','esc',source+';return discoverPanel;');
  const fn=factory({aliases:{},works:{}},(zh)=>zh,(_,label)=>'<a>'+label+'</a>',s=>String(s??''));
  return fn(work);
}
test('visible discovery sections always occupy trailer, world news, mainland news, related, similar order',()=>{
  const html=panel({profile:{videos:[{url:'https://www.youtube.com/watch?v=AbCdEf12345',name:'Trailer'}],related:[{id:'tmdb-movie-550',title:'Related work'}]}});
  assert.deepEqual([...html.matchAll(/data-mi-discover-slot="([^"]+)"/g)].map(m=>m[1]),expected);
  assert.match(html,/<h3>预告片<\/h3>/);
  assert.match(html,/<h3>国际新闻<\/h3>/);
  assert.match(html,/<h3>国内新闻<\/h3>/);
  assert.match(html,/<h3>还可以看看<\/h3>/);
  assert.match(html,/<h3>相似主题探索<\/h3>/);
  const related=html.indexOf('Related work');
  assert.ok(related>html.indexOf('data-mi-discover-slot="related"'));
  assert.ok(related<html.indexOf('data-mi-discover-slot="similar"'));
});
test('empty title still displays ordered headings and empty related-state rather than losing a section',()=>{
  const html=panel({profile:{}});
  assert.deepEqual([...html.matchAll(/data-mi-discover-slot="([^"]+)"/g)].map(m=>m[1]),expected);
  assert.match(html,/暂无可核验的相关作品推荐/);
});
test('international and similar suggestions render inside their corresponding slots only',()=>{
  assert.match(insights,/discoverSlots\.trailers\.prepend\(pane\)/);
  assert.match(insights,/discoverSlots\.international\.innerHTML=sections\.international/);
  assert.match(insights,/discoverSlots\.similar\.innerHTML=sections\.similar/);
  assert.match(insights,/function discoverySections\(d[,)]/);
  assert.match(insights,/t\('相似主题探索','Similar themes'\)/);
});
test('domestic news updates its fixed third slot even when asynchronous',()=>{
  assert.match(mainland,/target\.querySelector\('\[data-mi-discover-slot="domestic"\]'\)/);
  assert.match(mainland,/holder\.replaceChildren\(box\)/);
  assert.match(mainland,/t\('国内新闻','Chinese news'\)/);
});
test('source attribution follows all discovery slots and cache-busted scripts are loaded',()=>{
  const rendered=core.slice(core.indexOf('  function renderDetail(){'),core.indexOf('  async function hydrateRelated('));
  assert.ok(rendered.indexOf("detailTab==='discover'?discoverPanel(w)")>=0);
  assert.ok(rendered.indexOf("detailTab==='discover'?discoverPanel(w)")<rendered.indexOf("text('资料来源','Sources')"));
  for(const [name,version] of Object.entries({'media-intel.js':'20261029.newsroom1','media-insights.js':'20261029.newsroom1','media-cn-enhance.js':'20261029.newsroom1'}))
    assert.ok(index.includes('./'+name+'?v='+version),name+' must use the new script version');
});

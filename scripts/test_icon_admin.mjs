import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../icon-review-admin.html',import.meta.url),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function ui(approve){
 class Element{constructor(){this.children=[];this.value='';this.disabled=false;} append(...v){this.children.push(...v)} replaceChildren(...v){this.children=v}}
 const nodes=Object.fromEntries(['filter','search','count','items','load','key','message'].map(x=>[x,new Element()]));
 nodes.filter.value='all';nodes.key.value='dummy-test-key';const posts=[],confirmations=[];
 const item={id:'test-123456',name:'Test icon',status:'approved',publishedName:'Test icon',publishedUrl:'https://raw.githubusercontent.com/MaddestAlistar/LiangYou-IconLibrary/main/icons/liangyou/test.png',metaPath:'pending/test.json'};
 const context={document:{getElementById:id=>nodes[id],createElement:()=>new Element()},AbortSignal,
  confirm:message=>{confirmations.push(message);return approve},fetch:async(url,options)=>{
   if(options.method==='POST'){posts.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,withdrawalVerified:true,item:{...item,status:'withdrawn',withdrawnAt:'2026-10-25T10:00:00Z'}})}}
   return {ok:true,json:async()=>({ok:true,items:[{...item}],nextCursor:null})};
  }};
 vm.runInNewContext(source,context);
 const buttons=()=>{const found=[];function walk(e){if(e.onclick)found.push(e);for(const x of e.children||[])walk(x)}walk(nodes.items);return found};
 return {nodes,posts,confirmations,buttons};
}
test('down button requires confirmation; cancel sends no write',async()=>{
 const x=ui(false);await x.nodes.load.onclick();const b=x.buttons().find(x=>x.textContent==='下架');assert(b&&!b.disabled);await b.onclick();assert.equal(x.posts.length,0);assert.match(x.confirmations[0],/完整库和精选库/);
});
test('confirmed down sends correct action and renders withdrawn-only controls',async()=>{
 const x=ui(true);await x.nodes.load.onclick();await x.buttons().find(x=>x.textContent==='下架').onclick();
 assert.equal(x.posts.length,1);assert.deepEqual(x.posts[0],{path:'pending/test.json',status:'withdrawn'});
 assert.deepEqual(x.buttons().map(x=>x.textContent),['核对下架']);assert.match(x.nodes.message.textContent,/下架成功/);
 assert(html.includes('<option value="withdrawn">已下架</option>'));
});

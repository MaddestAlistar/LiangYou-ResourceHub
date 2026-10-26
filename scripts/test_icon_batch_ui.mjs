import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {inspectImage} from '../icon-image.mjs';
import {unpackArchive} from '../icon-archive-core.mjs';
const source=readFileSync(new URL('../icon-batch.mjs',import.meta.url),'utf8').replace(/^import .*\n/,'').replaceAll('import.meta.url',JSON.stringify(new URL('../icon-batch.mjs',import.meta.url).href));
function ui(){
 class Element{constructor(tag='div'){this.tag=tag;this.children=[];this.value='';this.files=[];this.hidden=false;this.checked=false}append(...v){this.children.push(...v)}replaceChildren(...v){this.children=v}setAttribute(){}removeAttribute(){}focus(){}getContext(){return {drawImage(){}}}}
 const nodes={},get=id=>nodes[id]??=new Element();
 const urls=new Map();let number=0;class TestURL extends URL{static createObjectURL(f){const url='blob:'+number++;urls.set(url,f);return url}static revokeObjectURL(url){urls.delete(url)}}
 class Image{set src(url){if(!url)return;urls.get(url).arrayBuffer().then(data=>{const info=inspectImage(new Uint8Array(data),urls.get(url).name);this.naturalWidth=info.width;this.naturalHeight=info.height;this.onload()})}}
 class Worker{terminate(){}postMessage({data,extension}){unpackArchive(data,extension,readFileSync(new URL('../vendor/archive/unrar.wasm',import.meta.url))).then(result=>this.onmessage({data:{ok:true,...result}})).catch(e=>this.onmessage({data:{ok:false,error:e.message}}))}}
 const requests=[];let call=0;
 const context={document:{getElementById:get,createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})},Image,Worker,URL:TestURL,File,FormData,crypto,AbortSignal,setTimeout,clearTimeout,window:{addEventListener(){}},inspectImage,
  fetch:async(url,{body})=>{const row=Object.fromEntries(body.entries());requests.push(row);call++;return {ok:call!==2,json:async()=>call===2?{error:'temporary failure'}:{ok:true,id:'batch-'+row.submissionKey}}}};
 vm.runInNewContext(source,context);get('author').value='Artist';get('email').value='artist@example.com';get('notes').value='Test batch';
 const load=async ext=>{get('batch-file').files=[new File([readFileSync(new URL('./fixtures/icon-batch/mixed.'+ext,import.meta.url))],'mixed.'+ext)];await get('batch-file').onchange()};
 return {get,load,requests};
}
for(const ext of ['zip','rar'])test(ext+' batch UI displays each result, selects only valid images and resumes after failure without duplicate success',async()=>{
 const x=ui();await x.load(ext);assert.match(x.get('batch-count').textContent,/合格 2 张/);assert.equal(x.get('batch-items').children.length,4);
 await x.get('batch-submit').onclick();assert.equal(x.requests.length,0);x.get('batch-names-confirmed').checked=true;await x.get('batch-submit').onclick();assert.equal(x.requests.length,2);assert.equal(x.requests[0].kind,'静态');assert.equal(x.requests[1].kind,'动态');assert.equal(x.requests[0].batchId,x.requests[1].batchId);assert.notEqual(x.requests[0].submissionKey,x.requests[1].submissionKey);assert.match(x.get('batch-status').textContent,/重试/);
 await x.get('batch-submit').onclick();assert.equal(x.requests.length,3);assert.equal(x.requests[2].submissionKey,x.requests[1].submissionKey);assert.match(x.get('batch-count').textContent,/已提交 2 张/);assert.equal(x.get('batch-submit').disabled,true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../lyx-poster.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../lyx-review.html',import.meta.url),'utf8');
const avatar=readFileSync(new URL('../assets/lyx/author-avatar.svg',import.meta.url),'utf8');
const reviews=JSON.parse(readFileSync(new URL('../data/lyx-reviews.json',import.meta.url),'utf8')).reviews;
test('poster assets, DOM and script are present',()=>{
 assert.match(html,/id="posterDialog"/);
 for(const id of ['posterSave','posterNativeShare','posterCopyLink','posterPreview','posterClose','posterCloseSecondary'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/window\.LYXPoster\.open\(CURRENT\)/);
 assert.match(html,/lyx-poster\.js/);
 assert.doesNotThrow(()=>new vm.Script(source));
 const m=avatar.match(/data:image\/webp;base64,([a-zA-Z0-9+/=]+)/);
 assert.ok(m,'original author avatar must be embedded for canvas');
 const data=Buffer.from(m[1],'base64');
 assert.ok(data.length>3000,'avatar contains actual image pixels');
 assert.equal(data.toString('ascii',0,4),'RIFF');
 assert.equal(data.toString('ascii',8,12),'WEBP');
 const original=reviews.find(x=>x.id==='shangdaoji');
 assert.ok(original);
 assert.equal(original.scores.reduce((n,s,i)=>n+s*[.3,.2,.2,.1,.1,.1][i],0),90);
});
function harness(){
 const printed=[];
 const ctx=new Proxy({},{
  get(target,key){if(key==='measureText')return s=>({width:String(s).length*18});
    if(key==='createLinearGradient'||key==='createConicGradient'||key==='createRadialGradient')return ()=>({addColorStop(){}});
    if(key==='fillText')return text=>printed.push(String(text));
    if(!(key in target))target[key]=()=>{};return target[key]},
  set(target,key,value){target[key]=value;return true}
 });
 const nodes={};for(const id of ['posterDialog','posterStatus','posterPreview','posterClose',
 'posterCloseSecondary','posterSave','posterNativeShare','posterCopyLink'])nodes[id]={id,disabled:true,hidden:false,removeAttribute(){},setAttribute(){}};
 nodes.posterDialog.showModal=()=>{nodes.posterDialog.open=true};
 nodes.posterDialog.close=()=>{nodes.posterDialog.open=false};
 nodes.posterDialog.querySelectorAll=()=>[nodes.posterSave,nodes.posterNativeShare,nodes.posterCopyLink];
 nodes.posterDialog.addEventListener=()=>{};
 const canvas={width:0,height:0,getContext:()=>ctx,toBlob:cb=>cb(new Blob(['PNG'],{type:'image/png'}))};
 const document={getElementById:id=>nodes[id]||null,addEventListener:(name,fn)=>{if(name==='DOMContentLoaded')fn()},
  createElement:tag=>tag==='canvas'?canvas:{click(){},remove(){},setAttribute(){}},body:{appendChild(){}}};
 class FakeImage{width=144;height=144;set src(url){this._src=url;queueMicrotask(()=>this.onload?.())}get src(){return this._src}}
 const u={createObjectURL:()=> 'blob:poster-generated',revokeObjectURL(){}};
 const embedded='<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/webp;base64,UklGRlJJRkZXRUJQ"/></svg>';
 const sandbox={document,window:{},Image:FakeImage,URL:u,Blob,File:class {},navigator:{},location:{href:'https://example.com/lyx-review.html#detail/app'},fetch:async()=>({ok:true,text:async()=>embedded}),console,queueMicrotask,alert(){}};
 vm.createContext(sandbox);
 new vm.Script(source).runInContext(sandbox);
 return {poster:sandbox.window.LYXPoster,nodes,printed};
}
test('poster generates live scores, app text and footer from each chosen review',async()=>{
 const {poster,nodes,printed}=harness();
 const a=reviews.find(x=>x.id==='shangdaoji');
 await poster.open(a);
 assert.equal(nodes.posterDialog.open,true);
 assert.equal(nodes.posterPreview.hidden,false);
 assert.equal(nodes.posterPreview.src,'blob:poster-generated');
 assert.equal(nodes.posterSave.disabled,false);
 assert.ok(printed.some(x=>x.includes('LYX 90.0 =')),'correct dynamic formula');
 assert.ok(printed.some(x=>x.includes('上岛记')),'current app name');
 assert.ok(printed.some(x=>x.includes('116584042')),'fixed Xiaohongshu ID');
 assert.ok(printed.some(x=>x.includes('@良哥看未来')),'fixed author name');
 const b={...a,id:'another-test',name:'第二款应用',icon:'assets/lyx/shangdaoji.svg',review:'另一款应用的专属评价',scores:[70,80,80,80,80,80]};
 printed.length=0;
 await poster.open(b);
 assert.ok(printed.some(x=>x.includes('第二款应用')),'second app name');
 assert.ok(printed.some(x=>x.includes('另一款应用')),'second app review');
 assert.ok(printed.some(x=>x.includes('LYX 77.0 =')),'score recomputed for second app');
 assert.ok(printed.some(x=>x.includes('可以尝试')),'ranking changes with score');
});

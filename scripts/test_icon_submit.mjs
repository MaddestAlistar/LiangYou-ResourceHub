import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../icon-submit.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function ui(reduced=false){
 class Element{
  constructor(){this.value='';this.files=[];this.hidden=true;this.style={};this.events={};this.classList={toggle(){}};this.attrs={}}
  addEventListener(type,fn){this.events[type]=fn}
  setAttribute(k,v){this.attrs[k]=v}
  removeAttribute(k){delete this[k]}
  focus(){}
  getContext(){return {drawImage:()=>{this.drawn=true}}}
 }
 const nodes={};const get=id=>nodes[id]??=new Element();
 get('kind').value='静态';get('name').value='Test icon';get('author').value='Tester';
 const images=[],revoked=[],forms=[];let seq=0;
 class Image{constructor(){images.push(this)} load(size){this.width=size;this.height=size;this.onload()}}
 const context={document:{getElementById:get,querySelector:()=>new Element()},Image,localStorage:{getItem:()=>null},URL:{createObjectURL:()=>`blob:test-${++seq}`,revokeObjectURL:u=>revoked.push(u)},
  window:{matchMedia:()=>({matches:reduced}),addEventListener(){}},FormData,
  fetch:async(url,options)=>{forms.push(options.body);return {ok:true,json:async()=>({ok:true,id:'test-id'})}}};
 vm.runInNewContext(source,context);
 function choose(name,size=320){const file=new File(['original bytes'],name,{type:name.endsWith('.gif')?'image/gif':'image/png'});get('file').files=[file];get('file').events.change();images.at(-1).load(size);return file}
 return {get,images,revoked,forms,choose};
}
test('GIF selects dynamic type, autoplays, stops to still frame and replays with a fresh URL',()=>{
 const x=ui();x.choose('motion.gif');assert.equal(x.get('kind').value,'动态');assert.equal(x.get('preview-controls').hidden,false);
 assert(x.get('preview-still').drawn);const url=x.get('preview').src;assert(url.startsWith('blob:'));
 x.get('preview-stop').events.click();assert.equal(x.get('preview-still').hidden,false);assert.equal(x.get('preview').src,undefined);assert(x.revoked.includes(url));
 x.get('preview-play').events.click();assert.notEqual(x.get('preview').src,url);assert.equal(x.get('preview-still').hidden,true);
});
test('reduced motion starts static, allows manual play, switching to PNG clears animation controls',()=>{
 const x=ui(true);x.choose('motion.gif');assert.equal(x.get('preview-still').hidden,false);assert.equal(x.get('preview').src,undefined);
 x.get('preview-play').events.click();assert(x.get('preview').src);
 x.choose('still.png',720);assert.equal(x.get('kind').value,'静态');assert.equal(x.get('preview-controls').hidden,true);assert.equal(x.get('preview-still').hidden,true);
});
test('late image validation cannot replace a newer chosen file',()=>{
 const x=ui();x.get('file').files=[new File(['old'],'old.gif')];x.get('file').events.change();const old=x.images.at(-1);
 x.choose('new.png',720);const url=x.get('preview').src;old.load(320);assert.equal(x.get('preview').src,url);assert.equal(x.get('preview-controls').hidden,true);
});
test('email validates before network request; GIF submission uses unmodified selected file',async()=>{
 const x=ui();const file=x.choose('motion.gif');x.get('email').value='wrong';await x.get('submit').events.click();assert.equal(x.forms.length,0);assert.equal(x.get('email-error').hidden,false);
 x.get('email').value=' creator@example.com ';await x.get('submit').events.click();assert.equal(x.forms.length,1);assert.equal(x.forms[0].get('email'),'creator@example.com');assert.equal(await x.forms[0].get('file').text(),await file.text());assert.equal(x.forms[0].get('kind'),'动态');
});

/* Guest-mode YouTube embed tests. Offline: no API secrets or YouTube session. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync(new URL('../media-insights.js',import.meta.url),'utf8');

function setup(){
 const create=()=>({
  listeners:Object.create(null),
  classList:{
    values:new Set(),
    add(name){this.values.add(name);},
    remove(name){this.values.delete(name);},
    contains(name){return this.values.has(name);}
  },
  addEventListener(type,fn){this.listeners[type]=fn;},
  setAttribute(name,value){this[name]=value;}
 });
 const root=create(),dialog=create(),stage=create(),switchButton=create(),closeButton=create(),mediaDialog=create();
 dialog.open=false;
 dialog.showModal=function(){this.open=true;};
 dialog.close=function(){this.open=false;this.listeners.close?.();};
 stage.children=[];
 stage.replaceChildren=function(...children){this.children=[...children];};
 const title=create(),kicker=create(),help=create(),external=create();
 const elems={
  media:root,'media-trailer-dialog':dialog,'media-trailer-stage':stage,
  'media-trailer-switch':switchButton,'media-trailer-close':closeButton,
  'media-trailer-title':title,'media-trailer-kicker':kicker,
  'media-trailer-help':help,'media-trailer-external':external,
  'media-dialog':mediaDialog,
 };
 const document={
  documentElement:{lang:'zh-CN'},
  getElementById(id){return elems[id]??null;},
  createElement(tag){return {tag};},
 };
 runInNewContext(script,{document});
 const open=id=>{
  const button={dataset:{miPlayVideo:id},closest(selector){
   return selector==='.mi-trailer-card'?{querySelector(){return {textContent:'公开电影预告片'};}}:null;
  }};
  root.listeners.click({target:{closest(selector){return selector==='button[data-mi-play-video]'?button:null;}}});
 };
 return {root,dialog,stage,switchButton,closeButton,mediaDialog,external,title,open};
}
test('public trailer opens without any user token, API key or sign-in prompt',()=>{
 const ui=setup();
 assert.equal(ui.dialog.open,false);
 assert.equal(ui.stage.children.length,0);
 ui.open('AbCdEf12345');
 assert.equal(ui.dialog.open,true);
 assert.equal(ui.stage.children.length,1);
 assert.match(ui.stage.children[0].src,/^https:\/\/www\.youtube\.com\/embed\/AbCdEf12345\?/);
 assert.equal(ui.stage.children[0].referrerPolicy,'strict-origin-when-cross-origin');
 assert.equal(ui.stage.children[0].allowFullscreen,true);
 assert.equal(ui.title.textContent,'公开电影预告片');
  assert.equal(ui.external.href,undefined,'No outbound original-site viewing link');
});
test('visitor can manually switch between two official YouTube player hosts',()=>{
 const ui=setup();
 ui.open('AbCdEf12345');
 ui.switchButton.listeners.click();
 assert.match(ui.stage.children[0].src,/^https:\/\/www\.youtube-nocookie\.com\/embed\/AbCdEf12345\?/);
 assert.equal(ui.stage.children[0].referrerPolicy,'strict-origin-when-cross-origin');
 ui.switchButton.listeners.click();
 assert.match(ui.stage.children[0].src,/^https:\/\/www\.youtube\.com\/embed\/AbCdEf12345\?/);
});
test('closing by button, Escape or film detail close stops video by removing its iframe',()=>{
 const ui=setup();
 ui.open('AbCdEf12345');
 ui.closeButton.listeners.click();
 assert.equal(ui.stage.children.length,0);
 assert.equal(ui.dialog.open,false);
 ui.open('AbCdEf12345');
 ui.dialog.close(); // browser's Escape path
 assert.equal(ui.stage.children.length,0);
 ui.open('AbCdEf12345');
 ui.mediaDialog.listeners.close();
 assert.equal(ui.stage.children.length,0);
});
test('invalid video IDs are never inserted as iframe URLs',()=>{
 const ui=setup();
 ui.open('bad&evil');
 assert.equal(ui.stage.children.length,0);
 assert.equal(ui.dialog.open,false);
});
test('restricted video metadata disables inline click-to-play without inventing an anonymous stream',()=>{
 assert.match(script,/v\.embeddable!==false&&v\.ageRestricted!==true/);
 assert.match(script,/年龄限制 · 原站观看/);
});

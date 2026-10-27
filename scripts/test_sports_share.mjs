import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync('index.html','utf8');
const script=readFileSync('sports-share.js','utf8');
const css=readFileSync('sports-share.css','utf8');
const fixtureJs=readFileSync('fixtures.js','utf8');
assert(html.includes('sports-share.js?')&&html.includes('sports-share.css?'));
assert(html.includes('id="sportsShareDialog"')&&html.includes('id="sportsSharePreview"'));
assert(html.includes('data-share-note')&&html.includes('data-share-native'));
assert(fixtureJs.includes("data-fixture-share"));
assert(css.includes('@media(max-width:480px)'));
const textCalls=[];
const gradient={addColorStop(){}};
const ctx={
 fillRect(){},createLinearGradient(){return gradient;},createRadialGradient(){return gradient;},
 beginPath(){},roundRect(){},fill(){},stroke(){},moveTo(){},lineTo(){},
 fillText(v){textCalls.push(v);},
 measureText(v){return {width:String(v).length*26}}
};
const canvas={
 width:0,height:0,getContext(){return ctx;},
 toDataURL(){return 'data:image/png;base64,dGVzdA=='},
 toBlob(fn){fn({type:'image/png',mock:true});}
};
let actionListener,dialogListener,closeCalls=0,downloaded=null;
const elements={};
const dialog={open:false,querySelector(s){return elements[s]},addEventListener(t,fn){
 if(t==='click')dialogListener=fn;
},showModal(){this.open=true;},close(){this.open=false;closeCalls++;}};
const preview={src:'',alt:''};
const panel={getAttribute(){return 'zh'},addEventListener(t,fn){if(t==='click')actionListener=fn}};
for(const s of ['[data-share-save]','[data-share-native]','[data-share-close]']){
 elements[s]={hidden:false,textContent:'',addEventListener(t,fn){this[t]=fn}};
}
for(const s of ['[data-share-title]','[data-share-note]'])elements[s]={textContent:''};
const doc={
 getElementById(id){return {sportsShareDialog:dialog,sportsSharePreview:preview,sports:panel}[id]||null;},
 createElement(tag){if(tag==='canvas')return canvas;
  if(tag==='a')return {set download(v){downloaded=v},href:'',click(){},remove(){}};
  throw Error('Unexpected created element '+tag);
 },
 body:{append(){}}
};
const fixture={
 id:'verified-test-1',sport:'basketball',provider:'balldontlie',
 league:'NBA',home:'Los Angeles Lakers',away:'Boston Celtics',
 start_time:new Date(Date.now()+86400000).toISOString(),
 status:'scheduled',score_home:99,score_away:77
};
const win={
 LiangYouOfficialSportsEvents:[fixture],
 LiangYouSportsI18n:{team:raw=>raw,league:raw=>raw},
 setTimeout(fn){fn()},
 File:undefined
};
const context={window:win,document:doc,console,navigator:{},Date,Intl,
 Blob:class {}, File:undefined};
vm.runInNewContext(script,context,{timeout:3000});
assert.equal(typeof actionListener,'function');
const click=id=>actionListener({target:{closest(sel){return sel==='[data-fixture-share]'?
 {dataset:{fixtureShare:id}}:null}},preventDefault(){}});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
click(fixture.id);
await flush();
assert(dialog.open&&preview.src.startsWith('data:image/png'), 'Card must render without remote assets');
assert(textCalls.some(x=>String(x).includes('湖人')||String(x).includes('Lakers')));
assert(!textCalls.some(x=>String(x).includes('99  :  77')),
 'Scheduled fixture must not display score despite provider placeholder values');
assert(elements['[data-share-note]'].textContent.includes('快照'));
elements['[data-share-save]'].click();
assert(downloaded?.endsWith('.png'));
dialogListener({target:{closest(sel){return sel==='[data-share-close]'?{}:null}}});
assert(closeCalls===1&&dialog.open===false);
fixture.status='finished';fixture.score_home=99;fixture.score_away=77;
textCalls.length=0;
click(fixture.id);await flush();
assert(textCalls.some(x=>String(x).includes('99  :  77')),
 'Finished fixtures with numeric verified score should show it');
fixture.sport='go';fixture.home='박정환';fixture.away='김주아';
fixture.score_home=3;fixture.score_away=4;textCalls.length=0;
click(fixture.id);await flush();
assert(!textCalls.some(x=>String(x).includes('3  :  4')),
 'Go results must not be fabricated from generic numeric scores');
console.log('PASS: Local PNG match cards, verified outcome guardrails, preview and save UI.');

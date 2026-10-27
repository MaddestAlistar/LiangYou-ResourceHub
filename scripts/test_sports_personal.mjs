import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('index.html','utf8');
const personal=readFileSync('sports-personal.js','utf8');
const fixtures=readFileSync('fixtures.js','utf8');
const styles=readFileSync('sports-personal.css','utf8');
const matcher=readFileSync('sports-link.js','utf8');
assert(html.includes('sports-personal.js?')&&html.includes('sports-personal.css?'));
assert(html.includes('id="sportsPersonal"')&&html.includes('id="sportsHealth"'));
assert(html.includes('id="sportsArchiveToggle"'));
assert(html.indexOf('sports-link.js?')<html.indexOf('sports-personal.js?')&&
 html.indexOf('sports-personal.js?')<html.indexOf('fixtures.js?'));
assert(fixtures.includes('personal?.followingOnly()')&&fixtures.includes('renderVerifiedForm(x,label)'));
assert(fixtures.includes("Boolean(x.historical_final)"));
assert(styles.includes('@media(max-width:700px)')&&styles.includes('.fixtures-follow-button'));

const matchWindow={};
vm.runInNewContext(matcher,{window:matchWindow},{timeout:1000});
const links=matchWindow.LiangYouSportsLinks;
assert(links && typeof links.marketsFor==='function');
const fixture={sport:'lol',home:'Vitality Rising Bees',away:'Mental Rush',start_time:'2026-10-29T12:00:00Z'};
const market={category:'lol',outcomes:[{name:'Rising Bees'},{name:'Mental Rush'}],start_time:'2026-10-29T12:55:00Z'};
assert(links.pairs(fixture,market,90),'Verified synonym and minor start delay should match');
assert(!links.pairs(fixture,{...market,start_time:'2026-10-29T16:00:00Z'},90),
 'Multi-hour mismatch must not be silently merged');
assert(!links.pairs({...fixture,sport:'esports'},{...market,category:'other'},90),
 'Unknown-sport markets must not become esports fixtures');

const listeners=new Map();
const shelf={innerHTML:'',addEventListener(type,fn){this[type]=fn}};
const health={innerHTML:''};
const grid={addEventListener(type,fn){this[type]=fn}};
const section={getAttribute:()=> 'zh',querySelectorAll:()=>[]};
const elements={sports:section,sportsPersonal:shelf,sportsHealth:health,officialFixturesGrid:grid};
const saved={};
let lastDownload;
let calendarBody='';
const document={
 getElementById:id=>elements[id]||null,
 body:{append:()=>{}},
 createElement:()=>({
  set href(x){this.url=x},set download(x){lastDownload=x},
  click(){},remove(){}
 })
};
class CalendarBlob {constructor(parts){calendarBody=parts.join('')}}
const win={
 LiangYouSportsLinks:links,
 addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)},
 dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event)},
 setTimeout:()=>{},
 alert(){throw Error('Unexpected no-events alert')}
};
const ctx={window:win,document,localStorage:{
 getItem:key=>saved[key]||null,setItem:(key,val)=>{saved[key]=val}
},Blob:CalendarBlob,URL:{createObjectURL:()=> 'blob:mock',revokeObjectURL(){}},
CustomEvent:class {constructor(type,options={}){this.type=type;this.detail=options.detail}},
Date,Intl,setTimeout:()=>{}};
vm.runInNewContext(personal,ctx,{timeout:3000});
const api=win.LiangYouSportsPersonal;
assert(api && typeof api.toggle==='function'&&typeof api.followingOnly==='function');
assert(!api.has('lol','T1'));
api.toggle('lol','T1');
assert(api.has('lol','T1'));
assert(saved['liangyou-sports-following-v1']?.includes('T1'));
const tomorrow=new Date(Date.now()+86400000).toISOString();
win.LiangYouOfficialSportsEvents=[{
 id:'test-1',sport:'lol',provider:'pandascore',league:'Worlds',home:'T1',
 away:'BLG',status:'scheduled',start_time:tomorrow
}];
win.dispatchEvent({type:'liangyou:fixtures-updated'});
assert(shelf.innerHTML.includes('T1')&&shelf.innerHTML.includes('下一场关注赛事'));
const act=action=>({target:{closest:selector=>selector==='[data-personal-action]'?
 {dataset:{personalAction:action}}:null}});
shelf.click(act('mine'));
assert(api.followingOnly());
shelf.click(act('export'));
assert.equal(lastDownload,'LiangYou-following.ics');
assert(calendarBody.includes('BEGIN:VCALENDAR')&&calendarBody.includes('SUMMARY:Worlds: T1 vs BLG'));
assert(calendarBody.includes('END:VCALENDAR')&&calendarBody.includes('DTSTART:'));
win.dispatchEvent({type:'liangyou:sports-health',detail:{sources:[
 {tag:'pandascore',status:'ok'},{tag:'api-sports',status:'partial',failed_groups:10}],
 generated_at:new Date().toISOString()}});
assert(health.innerHTML.includes('api-sports')&&health.innerHTML.includes('10'));
api.toggle('lol','T1');
assert(!api.has('lol','T1'));
// Board games can use Hangul, Kana and Han script; distinct people must not collide.
api.toggle('go','박정환');
assert(api.has('go','박정환'));
assert(!api.has('go','김주아'));
api.toggle('go','김주아');
assert(api.has('go','김주아'));
assert(api.has('go','박정환'));
api.toggle('go','박정환');
assert(!api.has('go','박정환')&&api.has('go','김주아'));
console.log('PASS: Personal follows, fixture filter signal, iCalendar export, source health, stable matcher guardrails.');

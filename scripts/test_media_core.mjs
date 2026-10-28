import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const scope={URL};vm.runInNewContext(readFileSync('media-core.js','utf8'),scope);
const c=scope.LiangYouMedia;
const work={id:'tmdb-movie-550',aliases:['imdb-tt0137523','trakt-movie-99'],title:'Fight Club',kind:'movie',date:'1999-10-15',links:[]};
const cat={works:{[work.id]:work},aliases:{'imdb-tt0137523':work.id,'trakt-movie-99':work.id}};
const entry=(status,stamp='2026-10-28T00:00:00Z',w=work)=>({work:w,status,updated_at:stamp});
test('same work saved under different provider identities collapses, newest status wins',()=>{
 const result=c.merge([entry('want','2026-10-27T00:00:00Z',{...work,id:'imdb-tt0137523'})],[entry('watching')],cat);
 assert.equal(result.length,1);assert.equal(result[0].work.id,work.id);assert.equal(result[0].status,'watching');
});
test('movie and series IDs remain distinct and equal titles never merge',()=>{
 const results=c.merge([entry('want')],[entry('watched',undefined,{...work,id:'tmdb-tv-550',aliases:[],kind:'tv'})],{works:{},aliases:{}});
 assert.equal(results.length,2);
});
test('saved titles survive leaving the active feed and survive export/import',()=>{
 const original=[entry('watched')],result=c.parseBackup(c.backup(original));
 assert.equal(result[0].work.title,'Fight Club');assert.equal(c.merge(result,[],{works:{},aliases:{}}).length,1);
});
test('older import cannot overwrite a newer watch state',()=>{
 assert.equal(c.merge([entry('watched')],[entry('want','2026-10-27T00:00:00Z')],cat)[0].status,'watched');
});
test('invalid backup fails atomically instead of silently dropping bad records',()=>{
 for(const items of [[entry('invalid')],[entry('want','yesterday')],[entry('want',undefined,{...work,id:'__proto__'})]]){
  assert.throws(()=>c.parseBackup(JSON.stringify({schema:1,app:'liangyou-watchlist',items})));
 }
 assert.throws(()=>c.parseBackup(JSON.stringify({schema:1,app:'other',items:[]})));
 assert.throws(()=>c.parseBackup('x'.repeat(2000001)));
});
test('imported metadata strips untrusted URLs and unsupported fields',()=>{
 const result=c.snapshot({...work,poster:'javascript:alert(1)',api_key:'secret',links:[{name:'bad',url:'https://user:secret@example.com'},{name:'valid',url:'https://www.themoviedb.org/movie/550'}]});
 assert.equal(result.poster,'');assert.equal(result.links.length,1);assert.equal(result.api_key,undefined);
});
test('storage errors propagate, successful writes round-trip',()=>{
 const values=new Map(),store=c.createStore({getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)});
 assert.equal(store.read().length,0);store.write([entry('watching')]);assert.equal(store.read()[0].status,'watching');
 const blocked=c.createStore({getItem:()=>null,setItem:()=>{throw Error('quota');}});
 assert.throws(()=>blocked.write([entry('want')]));
});
test('watchlist capacity is bounded',()=>{
 const items=Array.from({length:1001},(_,i)=>entry('want',undefined,{...work,id:'tmdb-movie-'+(i+1),aliases:[]}));
 assert.throws(()=>c.merge([],items,{works:{},aliases:{}}));
});
test('legacy toolkit list migrates exact IDs and preserves newer canonical status',()=>{
 const old=c.legacy(JSON.stringify({'movie:550':{id:'tmdb-movie-550',tmdbId:550,title:'Fight Club',kind:'movie',status:'watchlist',updatedAt:'2026-10-27T00:00:00Z'}}));
 assert.equal(old[0].status,'want');assert.equal(c.merge([entry('watched')],old,cat)[0].status,'watched');
 assert.throws(()=>c.legacy(JSON.stringify({x:{title:'X',status:'watched',id:'invalid',updatedAt:'bad'}})));
});

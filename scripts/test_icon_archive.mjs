import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {archivePlan,unpackArchive,LIMITS} from '../icon-archive-core.mjs';
import {inspectImage} from '../icon-image.mjs';
const fixture=ext=>Uint8Array.from(readFileSync(new URL('./fixtures/icon-batch/mixed.'+ext,import.meta.url))).buffer;
const wasm=readFileSync(new URL('../vendor/archive/unrar.wasm',import.meta.url));
for(const ext of ['zip','rar'])test(ext+' extracts nested images unchanged and reports invalid dimensions independently',async()=>{
 const result=await unpackArchive(fixture(ext),ext,wasm);
 assert.equal(result.files.length,3);assert.equal(result.skipped.length,1);assert.equal(result.skipped[0].path,'README.txt');
 const png=result.files.find(x=>x.path.endsWith('static.png')),gif=result.files.find(x=>x.path.endsWith('motion.gif'));
 assert.equal(inspectImage(png.bytes,png.path).kind,'静态');assert.equal(inspectImage(gif.bytes,gif.path).kind,'动态');
 assert.throws(()=>inspectImage(result.files.find(x=>x.path==='bad-size.png').bytes,'bad-size.png'),/720/);
 assert.throws(()=>inspectImage(png.bytes,'renamed.gif'),/真实格式/);
});
test('JPEG headers recognize static sizes, including APP markers and jpeg extension',()=>{
 const jpeg=size=>new Uint8Array([255,216,255,224,0,4,1,2,255,192,0,17,8,size>>8,size&255,size>>8,size&255,3,1,17,0,2,17,0,3,17,0,255,217]);
 for(const size of [720,1024])for(const ext of ['jpg','jpeg']){
  const info=inspectImage(jpeg(size),'example.'+ext);
  assert.equal(info.width,size);assert.equal(info.height,size);assert.equal(info.mime,'image/jpeg');assert.equal(info.kind,'静态');
 }
 assert.throws(()=>inspectImage(jpeg(800),'wrong.jpg'),/720/);
 assert.throws(()=>inspectImage(jpeg(720),'wrong.png'),/真实格式/);
 assert.throws(()=>inspectImage(jpeg(720),'wrong.webp'),/仅支持/);
});
test('ZIP and RAR produce identical original image bytes',async()=>{
 const a=await unpackArchive(fixture('zip'),'zip'),b=await unpackArchive(fixture('rar'),'rar',wasm);
 for(const image of a.files)assert.deepEqual(image.bytes,b.files.find(x=>x.path===image.path).bytes);
});
test('archive guard rejects unsafe paths, nested archives, encryption, duplicates and limits before extraction',()=>{
 const p=archivePlan();for(const path of ['../evil.png','/bad.gif','C:\\bad.png','__MACOSX/foo.png','folder/.hidden.png','nested.zip'])assert.equal(p.accept(path,1),false);
 assert.equal(p.accept('locked.gif',1,false,true),false);assert.equal(p.accept('huge.png',11*1024*1024),false);
 assert.equal(p.accept('good.png',10),true);assert.throws(()=>p.accept('good.png',10),/重复路径/);
 const count=archivePlan();for(let i=0;i<30;i++)count.accept(i+'.png',10);assert.throws(()=>count.accept('31.png',10),/30/);
 assert.throws(()=>archivePlan().accept('bomb.png',LIMITS.expandedBytes+1),/50 MB/);
});
test('broken archives fail explicitly instead of creating queue files',async()=>{
 await assert.rejects(unpackArchive(new Uint8Array([1,2,3]).buffer,'zip'));
 await assert.rejects(unpackArchive(new Uint8Array([1,2,3]).buffer,'rar',wasm));
});

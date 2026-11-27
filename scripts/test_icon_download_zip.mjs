import test from 'node:test';
import assert from 'node:assert/strict';
import {buildZip} from '../icon-download-zip.mjs';
import {unzipSync} from '../vendor/archive/codecs.mjs';
test('ZIP preserves original bytes and UTF-8 filenames',async()=>{const bytes=new Uint8Array([0,1,255,17]);const zip=buildZip([{name:'良友.png',bytes},{name:'ATTRIBUTION.txt',bytes:new TextEncoder().encode('credit')}]);const out=unzipSync(new Uint8Array(await zip.arrayBuffer()));assert.deepEqual(out['良友.png'],bytes);assert.equal(new TextDecoder().decode(out['ATTRIBUTION.txt']),'credit')});
test('ZIP rejects traversal and duplicate names',()=>{const bytes=new Uint8Array([1]);assert.throws(()=>buildZip([{name:'../bad',bytes}]));assert.throws(()=>buildZip([{name:'a',bytes},{name:'a',bytes}]))});

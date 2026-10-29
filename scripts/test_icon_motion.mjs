import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectEmbeddedMotion} from '../icon-motion.mjs';
import {inspectImage} from '../icon-image.mjs';

function jpeg720(withVideo=true) {
  // Valid JPEG SOF dimension header; the full JPEG pixel encoding is not
  // necessary for exercising the isolated binary format detector.
  const jpeg=[0xff,0xd8,0xff,0xc0,0,17,8,2,208,2,208,3,1,0x11,0,2,0x11,0,3,0x11,0,0xff,0xd9];
  const mp4=[0,0,0,24,102,116,121,112,105,115,111,109,0,0,2,0,105,115,111,109,109,112,52,50,
    0,0,0,100,109,100,97,116,...Array(96).fill(1)];
  return new Uint8Array([...jpeg,...(withVideo?mp4:[])]);
}
test('embedded MP4 after JPEG EOI is recognized separately from JPG cover',()=>{
 const bytes=jpeg720();
 assert.deepEqual(inspectImage(bytes,'sample.jpg').kind,'静态');
 const m=inspectEmbeddedMotion(bytes);
 assert.equal(m.videoOffset,23);
 assert.equal(m.videoBytes,bytes.length-23);
 assert.equal(m.brand,'isom');
});
test('static JPG and EXIF-only Live Photo claims are never mistaken for motion',()=>{
 const bare=jpeg720(false);
 assert.equal(inspectEmbeddedMotion(bare),null);
 const text=new TextEncoder().encode('Apple Live Photo ContentIdentifier MotionPhoto MicroVideo');
 const fake=new Uint8Array([...bare,...text]);
 assert.equal(inspectEmbeddedMotion(fake),null);
});
test('bogus trailing bytes and oversized JPEGs are rejected',()=>{
 let data=jpeg720();const mdat=data.findIndex((v,i)=>v===109&&data[i+1]===100&&data[i+2]===97&&data[i+3]===116);assert(mdat>0);data[mdat+1]=0;
 assert.equal(inspectEmbeddedMotion(data),null);
 assert.equal(inspectEmbeddedMotion(new Uint8Array(10*1024*1024+1)),null);
});

/* Minimal ZIP32 STORE writer: original image bytes, UTF-8 filenames, no compression. */
const encoder=new TextEncoder();
const table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
export function buildZip(entries){
 if(!Array.isArray(entries)||!entries.length||entries.length>30)throw Error('entry limit');
 const local=[],central=[],used=new Set();let offset=0,csize=0;
 const h=(n)=>{const bytes=new Uint8Array(n);return [bytes,new DataView(bytes.buffer)]};
 for(const entry of entries){
  if(typeof entry.name!=='string'||!entry.name||/[\/\\\u0000-\u001f]/.test(entry.name)||['.','..'].includes(entry.name)||used.has(entry.name)||!(entry.bytes instanceof Uint8Array))throw Error('invalid entry');
  used.add(entry.name);const name=encoder.encode(entry.name),data=entry.bytes,size=data.length,sum=crc(data);
  if(name.length>255||size>12*1024*1024||offset+size>28*1024*1024)throw Error('size limit');
  const [l,v]=h(30);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);v.setUint32(14,sum,true);v.setUint32(18,size,true);v.setUint32(22,size,true);v.setUint16(26,name.length,true);
  const [c,w]=h(46);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,0x21,true);w.setUint32(16,sum,true);w.setUint32(20,size,true);w.setUint32(24,size,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);
  local.push(l,name,data);central.push(c,name);offset+=l.length+name.length+size;csize+=c.length+name.length;
 }
 const [e,v]=h(22);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,csize,true);v.setUint32(16,offset,true);
 return new Blob([...local,...central,e],{type:'application/zip'});
}

export const MAX_IMAGE_BYTES=10*1024*1024;
export function inspectImage(bytes,filename){
 const ext=filename.split('.').pop().toLowerCase(),ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
 if(!['png','webp','gif'].includes(ext))throw Error('仅支持 PNG、WebP、GIF 图片');
 if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)throw Error('单张图片需大于 0 且不超过 10 MB');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let width=0,height=0;
 if(ext==='gif'&&bytes.length>=14&&['GIF87a','GIF89a'].includes(ascii(0,6))){width=view.getUint16(6,true);height=view.getUint16(8,true)}
 if(ext==='png'&&bytes.length>=24&&ascii(1,4)==='PNG'&&bytes[0]===137&&ascii(4,8)==='\r\n\x1a\n'&&ascii(12,16)==='IHDR'){width=view.getUint32(16);height=view.getUint32(20)}
 if(ext==='webp'&&bytes.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'){
  const type=ascii(12,16);
  if(type==='VP8X'){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)}
  if(type==='VP8 '){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383}
  if(type==='VP8L'&&bytes[20]===47){const v=view.getUint32(21,true);width=(v&16383)+1;height=((v>>>14)&16383)+1}
 }
 if(!width||!height)throw Error('图片内容无法识别，或扩展名与真实格式不符');
 if(ext==='gif'?(width!==height||width<320||width>480):(width!==720||height!==720))throw Error(ext==='gif'?'动态 GIF 必须为 320–480 px 的正方形':'静态 PNG / WebP 必须为 720 × 720 px');
 return {ext,width,height,kind:ext==='gif'?'动态':'静态',mime:ext==='gif'?'image/gif':ext==='png'?'image/png':'image/webp'};
}

export const MAX_IMAGE_BYTES=10*1024*1024;
export function inspectImage(bytes,filename){
 const ext=filename.split('.').pop().toLowerCase(),ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
 if(!['png','jpg','jpeg','gif'].includes(ext))throw Error('仅支持 PNG、JPG、JPEG、GIF 图片');
 if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)throw Error('单张图片需大于 0 且不超过 10 MB');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let width=0,height=0;
 if(ext==='gif'&&bytes.length>=14&&['GIF87a','GIF89a'].includes(ascii(0,6))){width=view.getUint16(6,true);height=view.getUint16(8,true)}
 if(ext==='png'&&bytes.length>=24&&ascii(1,4)==='PNG'&&bytes[0]===137&&ascii(4,8)==='\r\n\x1a\n'&&ascii(12,16)==='IHDR'){width=view.getUint32(16);height=view.getUint32(20)}
 if(['jpg','jpeg'].includes(ext)&&bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
  let pos=2;
  while(pos+3<bytes.length){
   if(bytes[pos++]!==255)break;
   while(pos<bytes.length&&bytes[pos]===255)pos++;
   const marker=bytes[pos++];
   if(marker===217||marker===218)break;
   if(marker===1||(marker>=208&&marker<=215))continue;
   if(pos+2>bytes.length)break;
   const length=view.getUint16(pos);
   if(length<2||pos+length>bytes.length)break;
   if(marker>=192&&marker<=207&&![196,200,204].includes(marker)&&length>=7){
    height=view.getUint16(pos+3);width=view.getUint16(pos+5);break;
   }
   pos+=length;
  }
 }
 if(!width||!height)throw Error('图片内容无法识别，或扩展名与真实格式不符');
 if(ext==='gif'?(width!==height||width<320||width>480):(width!==height||![720,1024].includes(width)))throw Error(ext==='gif'?'动态 GIF 必须为 320–480 px 的正方形':'静态 PNG/JPG/JPEG 必须为 720 × 720 或 1024 × 1024 px');
 return {ext,width,height,kind:ext==='gif'?'动态':'静态',mime:ext==='gif'?'image/gif':ext==='png'?'image/png':'image/jpeg'};
}

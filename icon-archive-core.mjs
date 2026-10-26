import {unzipSync,createExtractorFromData} from './vendor/archive/codecs.mjs';
export const LIMITS={archiveBytes:20*1024*1024,expandedBytes:50*1024*1024,images:30,entries:500};
export function archivePlan(){
 let count=0,total=0,images=0;const seen=new Set(),skipped=[];
 function accept(name,size,directory=false,encrypted=false){
  if(++count>LIMITS.entries)throw Error('压缩包目录条目过多，最多 500 项');
  if(!Number.isSafeInteger(size)||size<0||(total+=size)>LIMITS.expandedBytes)throw Error('解压后总大小不能超过 50 MB');
  const path=String(name).replaceAll('\\','/');
  if(directory||path.endsWith('/'))return false;
  let reason='';
  if(path.startsWith('/')||/^[a-z]:/i.test(path)||path.split('/').some(p=>p==='..')||/[\u0000-\u001f]/.test(path))reason='路径不安全，已跳过';
  else if(path.split('/').some(p=>p.startsWith('.'))||path.startsWith('__MACOSX/'))reason='系统隐藏文件，已跳过';
  else if(!/\.(png|jpe?g|gif)$/i.test(path))reason=/\.(zip|rar|7z)$/i.test(path)?'不展开嵌套压缩包':'非 PNG / JPG / JPEG / GIF 文件';
  else if(seen.has(path))throw Error('压缩包中有重复路径，请整理后重新打包');
  else if(encrypted)reason='加密文件不支持，请先解密';
  else if(!size||size>10*1024*1024)reason='单张图片需大于 0 且不超过 10 MB';
  if(reason){skipped.push({path,reason});return false}
  seen.add(path);if(++images>LIMITS.images)throw Error('每批最多 30 张图片，请分批打包');
  return true;
 }
 return {accept,skipped};
}
export async function unpackArchive(data,extension,wasmBinary){
 if(data.byteLength>LIMITS.archiveBytes)throw Error('压缩包不能超过 20 MB');
 const plan=archivePlan(),files=[];
 if(extension==='zip'){
  const content=unzipSync(new Uint8Array(data),{filter:f=>plan.accept(f.name,f.originalSize)});
  for(const [path,bytes] of Object.entries(content))files.push({path,bytes});
 }else if(extension==='rar'){
  const extractor=await createExtractorFromData({data,wasmBinary});
  const list=extractor.getFileList(),selected=new Set();
  if(list.arcHeader.flags.volume||list.arcHeader.flags.headerEncrypted)throw Error('不支持分卷或加密 RAR，请解密并合并后再上传');
  // Consume generators fully so the WASM extractor releases archive handles.
  for(const header of list.fileHeaders)if(plan.accept(header.name,header.unpSize,header.flags.directory,header.flags.encrypted))selected.add(header.name);
  if(selected.size){
   const result=extractor.extract({files:header=>selected.has(header.name)});
   for(const item of result.files)if(item.extraction)files.push({path:item.fileHeader.name,bytes:item.extraction});
  }
 }else throw Error('仅支持 ZIP / RAR 压缩包');
 let actual=0;
 for(const f of files)if(f.bytes.byteLength>10*1024*1024||(actual+=f.bytes.byteLength)>LIMITS.expandedBytes)throw Error('实际解压大小超过限制');
 return {files,skipped:plan.skipped};
}

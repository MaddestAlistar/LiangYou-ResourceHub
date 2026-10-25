import {unpackArchive} from './icon-archive-core.mjs';
self.onmessage=async event=>{
 try{
  const {data,extension}=event.data;
  let wasmBinary;
  if(extension==='rar'){
   const res=await fetch(new URL('./vendor/archive/unrar.wasm',import.meta.url));
   if(!res.ok)throw Error('RAR 解析组件加载失败，请稍后重试');
   wasmBinary=await res.arrayBuffer();
  }
  const result=await unpackArchive(data,extension,wasmBinary);
  // Copy transferred outputs so each file owns its buffer independently of WASM memory.
  result.files=result.files.map(f=>({path:f.path,bytes:f.bytes.slice()}));
  self.postMessage({ok:true,...result},result.files.map(f=>f.bytes.buffer));
 }catch(error){self.postMessage({ok:false,error:'无法解压：'+(error.message||'文件损坏或格式不受支持')+'。加密包请先解密，分卷包请先合并。'})}
};

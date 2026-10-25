import {build} from 'esbuild';
import {copyFile,mkdir} from 'node:fs/promises';
await mkdir(new URL('../../vendor/archive/',import.meta.url),{recursive:true});
await build({entryPoints:[new URL('entry.mjs',import.meta.url).pathname],outfile:new URL('../../vendor/archive/codecs.mjs',import.meta.url).pathname,bundle:true,format:'esm',platform:'browser',minify:true,define:{'process.versions.node':'undefined'},external:['fs','path'],legalComments:'eof'});
for(const [source,target] of [['node-unrar-js/esm/js/unrar.wasm','unrar.wasm'],['node-unrar-js/LICENSE.md','UNRAR-LICENSE.md'],['fflate/LICENSE','FFLATE-LICENSE']])await copyFile(new URL('node_modules/'+source,import.meta.url),new URL('../../vendor/archive/'+target,import.meta.url));

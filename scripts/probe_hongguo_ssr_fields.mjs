// Read-only official page SSR probe. No authentication, decryption, media proxy,
// source-token logging, or playback URL redistribution.
const link='https://hongguoduanju.com/player/7685676216996596761';
const r=await fetch(link,{signal:AbortSignal.timeout(25000)});
const html=await r.text();
const count=(term)=>html.split(term).length-1;
const matches=[...html.matchAll(/(?:\\?"|")main_url(?:\\?"|")\s*:\s*(?:\\?"|")((?:\\.|[^"\\])*)/g)];
let first=null;
for(const m of matches.slice(0,8)){
  const raw=m[1].replace(/\\\//g,'/').replace(/\\u0026/g,'&').replace(/\\u003d/g,'=').replace(/\\u002F/g,'/');
  try{
    const u=new URL(raw);
    if(u.protocol!=='https:')continue;
    first={host:u.hostname,format:/\.m3u8(?:$|\?)/.test(u.pathname)?'hls':/\.mp4(?:$|\?)/.test(u.pathname)?'mp4':'other',
      signed:u.searchParams.size>0,bytes:raw.length};
    break;
  }catch{}
}
const summary={status:r.status,htmlBytes:html.length,
  publicPreview:html.includes('/video/public/7685677901034818622/360p.mp4'),
  fields:{routerData:count('_ROUTER_DATA'),mainUrl:count('main_url'),backupUrl:count('backup_url'),
    videoPlayerInfo:count('video_player_info'),spadeA:count('spade_a'),
    locked:count('locked'),vidList:count('vid_list')},candidates:matches.length,first};
console.log('HONGGUO_SSR_PUBLIC_FIELDS',JSON.stringify(summary));

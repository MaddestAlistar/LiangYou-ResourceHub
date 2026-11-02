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

const alt='https://novelquickapp.com/player/7685676216996596761/7685677901034818622';
try{
  const res=await fetch(alt,{redirect:'follow',signal:AbortSignal.timeout(22000),headers:{
    'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  }});
  const body=(await res.text()).slice(0,3_000_000);
  const index=body.indexOf('video_player_info');
  const section=index>=0?body.slice(index,index+8000):'';
  const main=section.match(/"main_url"\s*:\s*"([^"]+)"/);
  let candidate=null;
  if(main){
    let val=main[1].replace(/\\u002[fF]/g,'/').replace(/\\\//g,'/');
    try{const parsed=new URL(val);
      candidate={host:parsed.hostname,protocol:parsed.protocol,
        urlChars:val.length,hasQuery:parsed.searchParams.size>0,
        format:parsed.pathname.toLowerCase().endsWith('.mp4')?'mp4':
          parsed.pathname.toLowerCase().endsWith('.m3u8')?'hls':'other'};
    }catch{}
  }
  console.log('NOVELQUICKAPP_PUBLIC',JSON.stringify({status:res.status,
    finalHost:new URL(res.url).hostname,bytes:body.length,
    containsPlayerInfo:index>=0,mainUrlField:Boolean(main),candidate}));
}catch(e){console.log('NOVELQUICKAPP_PUBLIC_ERROR',String(e.message||e).slice(0,210))}

// Probe media-host reachability from GitHub Actions without involving Cloudflare.
// Only public CC BY 3.0 Blender Foundation samples are used.
import assert from 'node:assert/strict';
const URLS={
  mp4:'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
  hls:'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
};
const results={};
for(const [kind,url] of Object.entries(URLS)){
  let err;
  for(let i=0;i<3;i++){
    try{
      const response=await fetch(url,{headers:{Range:'bytes=0-65535',Origin:'https://maddestalistar.github.io'},
        signal:AbortSignal.timeout(18000),redirect:'follow'});
      assert.ok(response.ok,'HTTP '+response.status);
      const bytes=new Uint8Array(await response.arrayBuffer());
      assert.ok(bytes.length>=16,'no media bytes');
      if(kind==='mp4'){
        assert.equal(new TextDecoder().decode(bytes.subarray(4,8)),'ftyp','invalid MP4 header');
      }else{
        assert.ok(new TextDecoder().decode(bytes.subarray(0,20)).startsWith('#EXTM3U'),'invalid HLS manifest');
      }
      results[kind]={status:response.status,bytes:bytes.length,
        contentType:response.headers.get('content-type'),
        accessControl:response.headers.get('access-control-allow-origin')};
      err=null;break;
    }catch(e){err=e;await new Promise(resolve=>setTimeout(resolve,1500*(i+1)));}
  }
  if(err)throw Error(kind+' direct CDN check failed: '+err.message);
}
console.log('DIRECT_MEDIA_PROBE',JSON.stringify(results));

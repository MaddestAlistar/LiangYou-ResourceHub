import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{parseManifest,selectEpisodes,safeMediaURL} from '../labs/short-drama-playback-worker.mjs';

const site='https://maddestalistar.github.io';
const domain='https://liangyou-short-drama-playback.maddestalistar.workers.dev';
const sample={
  schema:1,
  allowedMediaHosts:['media.example.org'],
  works:{
    'mc-demo123':{
      title:'授权短剧演示',
      episodes:[
        {number:2,url:'https://media.example.org/v/2.m3u8'},
        {number:1,url:'https://media.example.org/v/1.mp4'}
      ]
    }
  }
};
const env={AUTHORIZED_DRAMA_STREAMS_JSON:JSON.stringify(sample)};
const req=(path,origin=site,method='GET')=>
  new Request(domain+path,{method,headers:origin?{Origin:origin}:{}});
const read=async (url,config)=>{const resp=await worker.fetch(url,config);return [resp,await resp.json()]};

test('health is public but not a video proxy',async()=>{
  const [r,body]=await read(req('/health',null),env);
  assert.equal(r.status,200);
  assert.equal(body.videoProxy,false);
  assert.equal(body.configured,true);
  assert.equal(body.mode,'metadata-only');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
  const unconfigured=await (await worker.fetch(req('/health'),{})).json();
  assert.equal(unconfigured.configured,false);
});

test('only exact matching work and direct authorized origins resolve',async()=>{
  const query='/api/resolve?workId=mc-demo123&title='+encodeURIComponent('授权短剧演示');
  const [r,body]=await read(req(query),env);
  assert.equal(r.status,200);
  assert.equal(body.episodes.length,2);
  assert.equal(body.episodes[0].number,1);
  assert.equal(body.episodes[0].mime,'video/mp4');
  assert.equal(body.episodes[1].mime,'application/vnd.apple.mpegurl');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),site);
});

test('forbid untrusted sites and no origin for resolving private manifest',async()=>{
  for(const origin of [null,'https://attacker.example.org']){
    const [r]=await read(req('/api/resolve?workId=mc-demo123&title=授权短剧演示',origin),env);
    assert.equal(r.status,403);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
  }
  const [r]=await read(req('/api/resolve?workId=mc-demo123&title=错误作品'),env);
  assert.equal(r.status,404);
});

test('when no authorized media source is set never fabricate playback',async()=>{
  const [r,body]=await read(req('/api/resolve?workId=mc-demo123&title=授权短剧演示'),{});
  assert.equal(r.status,503);
  assert.deepEqual(body.episodes,[]);
});

test('do not let anyone submit a direct target or arbitrary parameters',async()=>{
  const [r]=await read(req('/api/resolve?workId=mc-demo123&title=授权短剧演示&url=https://evil.test'),env);
  assert.equal(r.status,400);
});

test('validate safe HTTPS hosts and block credentials, redirects and private hosts',()=>{
  const allow=['media.example.org'];
  for(const value of [
    'http://media.example.org/v/1.mp4',
    'https://user:password@media.example.org/v/1.mp4',
    'https://media.example.org/v/1.mp4?token=xxx',
    'https://media.example.org/v/1.mp4#key',
    'https://evil.example.org/v/1.mp4',
    'https://localhost/v/1.mp4',
    'https://127.0.0.1/v/1.mp4',
  ])assert.equal(safeMediaURL(value,allow),'');
  assert.equal(safeMediaURL('https://media.example.org/v/1.mp4',allow),
    'https://media.example.org/v/1.mp4');
  assert.equal(parseManifest(JSON.stringify({schema:1,allowedMediaHosts:[],works:{}})),null);
  assert.equal(parseManifest('not json'),null);
  const wrong={...sample,works:{'mc-demo123':{title:'授权短剧演示',episodes:[
    {number:1,url:'https://unauthorized.example/v/1.mp4'}
  ]}}};
  assert.deepEqual(selectEpisodes(parseManifest(JSON.stringify(wrong)),'mc-demo123','授权短剧演示'),[]);
});

test('all error responses prohibit caching and MIME sniffing',async()=>{
  const r=await worker.fetch(req('/anything'),env);
  assert.equal(r.status,404);
  assert.equal(r.headers.get('Cache-Control'),'no-store');
  assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');
});

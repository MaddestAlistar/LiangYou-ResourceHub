/* Opt-in short drama playback prototype.
   A server-side adapter must translate catalog IDs into direct, authorized HTTPS
   media URLs. Do not execute obfuscated upstream Worker code in visitors' pages. */
(() => {
  'use strict';
  const root=document.getElementById('media');
  if(!root)return;
  const en=()=>document.documentElement.lang.startsWith('en');
  const t=(cn,eng)=>en()?eng:cn;
  const CONFIG='./data/short-drama-playback-test.json';
  let dialog=null,video=null,episodes=[],selected=-1,hls=null,controller=null;
  let catalogPromise=null,configPromise=null,serial=0;
  const safeUrl=value=>{
    if(typeof value!=='string'||value.length>2500)return '';
    try{
      const u=new URL(value);
      return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';
    }catch{return '';}
  };
  const status=(value,error=false)=>{
    const node=dialog?.querySelector('.mi-dpt-status');
    if(node){node.textContent=value;node.dataset.error=String(error);}
  };
  const stop=()=>{
    serial++;
    if(controller){controller.abort();controller=null;}
    if(hls){hls.destroy();hls=null;}
    if(video){video.pause();video.removeAttribute('src');video.load();}
    episodes=[];selected=-1;
  };
  function ensureDialog(){
    if(dialog)return dialog;
    dialog=document.createElement('dialog');
    dialog.className='mi-dpt-dialog';
    dialog.setAttribute('aria-label','短剧测试播放');
    dialog.innerHTML=`<section class="mi-dpt-card">
      <header class="mi-dpt-head">
        <div><span class="mi-dpt-eyebrow">PLAYER TEST</span><h2 class="mi-dpt-title"></h2></div>
        <button type="button" class="mi-dpt-close" aria-label="关闭播放器">×</button>
      </header>
      <div class="mi-dpt-screen">
        <video controls playsinline webkit-playsinline preload="metadata" controlslist="nodownload" aria-label="短剧播放器"></video>
      </div>
      <p class="mi-dpt-status" role="status" aria-live="polite"></p>
      <div class="mi-dpt-episodes" hidden><div class="mi-dpt-section-title"></div><div class="mi-dpt-list" role="group"></div></div>
    </section>`;
    document.body.appendChild(dialog);
    video=dialog.querySelector('video');
    dialog.querySelector('.mi-dpt-close').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    dialog.addEventListener('close',stop);
    video.addEventListener('error',()=>{
      if(dialog?.open&&selected>=0)status(t('视频暂时无法播放，请换一集再试。','Video unavailable. Try another episode.'),true);
    });
    dialog.querySelector('.mi-dpt-list').addEventListener('click',e=>{
      const button=e.target.closest('button[data-episode-index]');
      if(!button)return;
      const index=Number(button.dataset.episodeIndex);
      if(Number.isInteger(index)&&index>=0&&index<episodes.length)void playEpisode(index);
    });
    return dialog;
  }
  function catalog(){
    if(!catalogPromise)catalogPromise=fetch('./data/media-short-dramas.json',{cache:'no-store'})
      .then(r=>{if(!r.ok)throw Error('catalog');return r.json();})
      .then(d=>Array.isArray(d?.items)?d.items:[])
      .catch(()=>[]);
    return catalogPromise;
  }
  function config(){
    if(!configPromise)configPromise=fetch(CONFIG,{cache:'no-store'})
      .then(r=>{if(!r.ok)throw Error('config');return r.json();})
      .catch(()=>null);
    return configPromise;
  }
  async function loadHls(){
    if(window.Hls?.isSupported?.())return window.Hls;
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js';
    script.async=true;
    await new Promise((resolve,reject)=>{
      script.onload=resolve;script.onerror=reject;
      document.head.appendChild(script);
    });
    if(!window.Hls?.isSupported?.())throw Error('hls_unsupported');
    return window.Hls;
  }
  async function playEpisode(index){
    const item=episodes[index];
    const src=safeUrl(item?.url);
    if(!src){status(t('这一集没有有效的视频地址。','This episode has no valid video URL.'),true);return;}
    selected=index;
    if(hls){hls.destroy();hls=null;}
    video.pause();
    video.removeAttribute('src');
    video.load();
    const cells=dialog.querySelectorAll('.mi-dpt-list button');
    for(const cell of cells)cell.setAttribute('aria-pressed',String(Number(cell.dataset.episodeIndex)===index));
    const isHls=item.mime==='application/vnd.apple.mpegurl'||/\.m3u8(?:[?#]|$)/i.test(src);
    try{
      status(t('正在加载第 ','Loading episode ')+(index+1)+t(' 集…','…'));
      if(isHls&&!video.canPlayType('application/vnd.apple.mpegurl')){
        const Hls=await loadHls();
        if(!dialog.open||selected!==index)return;
        hls=new Hls({enableWorker:true,maxBufferLength:20});
        hls.attachMedia(video);
        hls.loadSource(src);
        hls.on(Hls.Events.ERROR,(_ev,info)=>{
          if(info?.fatal)status(t('视频流加载失败。','Unable to load this stream.'),true);
        });
      }else video.src=src;
      await video.play().catch(()=>{});
      status(t('正在测试第 ','Testing episode ')+(index+1)+t(' 集 · 可使用播放器控制操作',' · Use the playback controls'));
    }catch{
      status(t('当前浏览器无法加载该视频流。','This browser cannot load the video stream.'),true);
    }
  }
  function showEpisodes(list){
    const panel=dialog.querySelector('.mi-dpt-episodes');
    const container=dialog.querySelector('.mi-dpt-list');
    container.replaceChildren();
    episodes=list.slice(0,300).map((item,i)=>({
      number:Number(item.number)||i+1,
      label:String(item.label||item.name||t('第 '+(i+1)+' 集','Episode '+(i+1))).slice(0,40),
      url:safeUrl(item.url||item.playUrl||item.src),
      mime:String(item.mime||'')
    })).filter(item=>item.url);
    panel.hidden=!episodes.length;
    dialog.querySelector('.mi-dpt-section-title').textContent=t('选择剧集','Select episode');
    episodes.forEach((item,i)=>{
      const b=document.createElement('button');
      b.type='button';b.className='mi-dpt-episode';
      b.dataset.episodeIndex=String(i);
      b.setAttribute('aria-pressed','false');
      b.textContent=item.label;
      container.appendChild(b);
    });
  }
  async function open(id){
    ensureDialog();
    stop();
    const turn=serial;
    dialog.querySelector('.mi-dpt-title').textContent=t('短剧测试播放','Drama playback test');
    dialog.querySelector('.mi-dpt-episodes').hidden=true;
    dialog.querySelector('.mi-dpt-list').replaceChildren();
    status(t('正在准备测试播放器…','Preparing test player…'));
    if(!dialog.open)dialog.showModal();
    const [works,settings]=await Promise.all([catalog(),config()]);
    if(turn!==serial||!dialog.open)return;
    const work=works.find(item=>String(item.id)===id);
    dialog.querySelector('.mi-dpt-title').textContent=String(work?.title||t('短剧测试播放','Drama playback test')).slice(0,100);
    // The uploaded file defines a server-side Worker, not a browser video file.
    // Never fetch arbitrary mobile-app endpoints or expose signatures from Pages.
    const endpoint=safeUrl(settings?.resolveEndpoint);
    if(settings?.schema!==1||settings?.enabled!==true||!endpoint){
      status(t('测试播放界面已就绪。还需要将视频接口部署为独立服务，当前暂无可播放流。',
        'The test player is ready, but no video service is configured yet.'),true);
      return;
    }
    if(!work){status(t('找不到对应的短剧资料。','Drama metadata was not found.'),true);return;}
    controller=new AbortController();
    try{
      const request=new URL(endpoint);
      request.searchParams.set('workId',id);
      request.searchParams.set('title',work.title);
      const response=await fetch(request.href,{credentials:'omit',cache:'no-store',signal:controller.signal,
        headers:{Accept:'application/json'}});
      if(turn!==serial||!dialog.open)return;
      const data=await response.json().catch(()=>null);
      if(response.status===503&&data?.error==='not_configured'){
        status(t('播放服务已连接，但尚未配置可合法使用的视频地址。',
          'Playback service is online; no authorized stream URLs have been configured.'),true);
        return;
      }
      if(response.status===404&&data?.error==='no_authorized_episodes'){
        status(t('当前作品暂无已授权的可播放剧集。','No authorized episodes for this title.'),true);
        return;
      }
      if(!response.ok)throw Error('not_available');
      if(!data||!Array.isArray(data.episodes))throw Error('invalid_response');
      showEpisodes(data.episodes);
      if(!episodes.length)throw Error('no_episodes');
      status(t('已找到可测试剧集，请选择播放。','Episodes available. Select one to play.'));
    }catch(error){
      if(error?.name==='AbortError')return;
      if(turn!==serial||!dialog.open)return;
      status(t('暂无可播放剧集，接口可能尚未部署或作品尚未匹配。',
        'No playable episodes. Service may be offline or the title unmatched.'),true);
    }
  }
  root.addEventListener('click',event=>{
    const b=event.target.closest('button[data-drama-playtest]');
    if(!b||!root.contains(b))return;
    void open(String(b.dataset.dramaPlaytest||'').slice(0,100));
  });
})();

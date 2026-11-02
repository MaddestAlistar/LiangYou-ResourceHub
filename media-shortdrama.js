/* Verified short drama snapshot UI. No provider key is ever sent to visitors. */
(() => {
  'use strict';
  const root=document.getElementById('media');
  if(!root)return;
  const $=id=>root.querySelector(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
  let snapshot=null,loading=false,failed=false,current=null,lastChecked=0;
  const translations=(zh,en)=>current?.language==='en'?en:zh;
  function heatLabel(value){
    const n=Number(value);
    if(!Number.isFinite(n)||n<=0)return '';
    return n>=1e8?(n/1e8).toFixed(1).replace(/\.0$/,'')+'亿':n>=1e4?(n/1e4).toFixed(1).replace(/\.0$/,'')+'万':Math.round(n).toLocaleString('zh-CN');
  }
  function active(){return root.querySelector('[data-mi-tab="drama"]')?.getAttribute('aria-pressed')==='true';}
  function date(value){
    if(!value||!Number.isFinite(Date.parse(value)))return '';
    return new Intl.DateTimeFormat(current?.language==='en'?'en-GB':'zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  }
  async function fetchSnapshot(){
    if(loading || (snapshot&&Date.now()-lastChecked<10*60000))return;
    loading=true;
    try{
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
      let response;
      try{response=await fetch('./data/media-short-dramas.json',{cache:'no-store',signal:controller.signal});}
      finally{clearTimeout(timeout);}
      if(!response.ok)throw Error('snapshot_unavailable');
      const data=await response.json();
      if(data?.schema!==1||!Array.isArray(data.items)||data.items.length>250)throw Error('invalid_snapshot');
      snapshot={...data,items:data.items.filter(item=>item&&typeof item.title==='string'&&item.title.trim().length>0)};
      lastChecked=Date.now();
      failed=false;
    }catch{failed=true;}
    finally{loading=false;lastChecked=Date.now();if(current&&active())render(current);}
  }
  function render(arg){
    current=arg;
    if(!active())return;
    if(!loading&&Date.now()-lastChecked>10*60000)fetchSnapshot();
    const loaded=Boolean(snapshot?.items?.length);
    const items=loaded?snapshot.items:[];
    let filtered=items;
    if(arg.source==='new')filtered=filtered.filter(item=>item.is_new===true||item.groups?.includes('new'));
    else if(['real','ai','comic'].includes(arg.source))filtered=filtered.filter(item=>item.kind===arg.source);
    const search=String(arg.query||'').trim().toLocaleLowerCase();
    if(search)filtered=filtered.filter(item=>[item.title,item.intro,...(Array.isArray(item.tags)?item.tags:[])].some(v=>String(v||'').toLocaleLowerCase().includes(search)));
    const size=matchMedia('(max-width:760px)').matches?4:8;
    const pages=Math.max(1,Math.ceil(filtered.length/size)),page=Math.min(Math.max(0,arg.page||0),pages-1);
    $('#media-updated').textContent=loaded?translations('短剧数据核对：','Drama snapshot: ')+date(snapshot.checked_at):
      failed?translations('短剧数据读取失败','Short drama data unavailable'):translations('短剧榜单 · 等待数据同步','Short drama · Awaiting verified data');
    $('#media-count').textContent=filtered.length+' '+translations('部短剧','dramas');
    $('#media-source-status').textContent=loaded?translations('数据核对：','Verified: ')+date(snapshot.checked_at):
      translations('仅展示已核实的数据','Only verified records are shown');
    $('#media-source-status').classList.toggle('mi-stale',loaded&&Boolean(snapshot.checked_at)&&Date.now()-Date.parse(snapshot.checked_at)>48*3600000);
    $('#media-grid').innerHTML=filtered.length?filtered.slice(page*size,page*size+size).map((item,index)=>{
      const title=esc(item.title),poster=safeURL(item.poster);
      const tags=(Array.isArray(item.tags)?item.tags:[]).filter(v=>typeof v==='string').slice(0,3);
      const ep=Number.isInteger(item.episodes)&&item.episodes>0?item.episodes:null;
      const rank=Number.isInteger(item.rank)&&item.rank>0?item.rank:null;
      const heat=heatLabel(item.heat);
      const rating=typeof item.rating==='number'&&item.rating>0&&item.rating<=10?item.rating.toFixed(1):'';
      const ratingType=['user','source','ai','reference'].includes(item.rating_type)?item.rating_type:
        rating?'reference':'none';
      const ratingLabel={user:translations('用户评分','User rating'),source:translations('来源评分','Source rating'),
        ai:translations('AI参考分','AI reference score'),reference:translations('参考评分','Reference score'),
        none:translations('暂无评分','Not rated')}[ratingType];
      const published=Number(item.published_episodes);
      const status=String(item.status||'').slice(0,28);
      const platform=String(item.platform||'').slice(0,25);
      const release=typeof item.release_date==='string'?item.release_date.slice(0,10):'';
      const kind={real:translations('真人短剧','Live action'),ai:translations('AI 短剧','AI drama'),comic:translations('漫剧','Animated')}[item.kind]||translations('短剧','Drama');
      return `<article class="mi-drama-card">
        <div class="mi-drama-poster">
          ${poster?`<img src="${esc(poster)}" alt="${title}" loading="lazy" decoding="async">`:'<span aria-hidden="true">✦</span>'}
          ${rank?`<span class="mi-drama-rank">TOP ${rank}</span>`:''}
          ${item.is_new?'<span class="mi-drama-new">NEW</span>':''}
        </div>
        <div class="mi-drama-copy">
          <h3>${title}</h3>
          <div class="mi-drama-rating mi-drama-rating-${esc(ratingType)}" aria-label="${esc(ratingLabel)}${rating?' '+esc(rating)+'/10':''}">
            ${rating?'<strong aria-hidden="true">★ '+esc(rating)+'<small> / 10</small></strong>':'<strong aria-hidden="true">—</strong>'}
            <span>${esc(ratingLabel)}</span>
          </div>
          <p class="mi-drama-line">${esc(item.kind_label||kind)}${ep?' · '+ep+translations(' 集',' eps'):''}</p>
          <div class="mi-drama-stats">
            ${heat?'<span>'+translations('站内热度 ','Popularity ')+esc(heat)+'</span>':''}
            ${status?'<span>'+esc(status)+'</span>':''}
            ${ep&&Number.isInteger(published)&&published>0&&published<ep?'<span>'+translations('更新至 ','Updated through ')+published+'/'+ep+'</span>':''}
          </div>
          ${platform?'<p class="mi-drama-platform">'+translations('收录平台：','Platform: ')+esc(platform)+'</p>':''}
          ${release?'<p class="mi-drama-platform">'+translations('首播日期：','Release: ')+esc(release)+'</p>':''}
          <div class="mi-drama-tags">${tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div>
          ${item.intro?`<details class="mi-drama-overview"><summary>${translations('剧情简介','Synopsis')}</summary><p>${esc(item.intro)}</p></details>`:''}
        </div>
      </article>`;
    }).join(''):
      `<div class="mi-empty mi-drama-empty"><span aria-hidden="true">✦</span>
       <h3>${search?translations('暂无匹配短剧','No matching dramas'):loaded?translations('这个分类暂无已核实的作品','No verified titles in this category'):
          failed?translations('短剧数据暂时不可用','Short drama data is unavailable'):translations('短剧榜单正在准备中','Short drama charts are being prepared')}</h3>
       <p>${search?translations('请尝试其他剧名或题材。','Try another title or genre.'):loaded?
          translations('可选择其他榜单或分类查看。','Choose another chart or genre.'):
          translations('已预留热播榜、最新上新、真人短剧、AI 短剧与漫剧。接口验证成功后将自动展示作品，不使用虚构排行。','Trending, new releases and genre sections are ready. Titles appear after the provider feed is verified.')}</p>
       </div>`;
    $('#media-page').textContent=`${page+1} / ${pages}`;
    $('#media-prev').disabled=page===0;
    $('#media-next').disabled=page>=pages-1;
    $('#media-prev').textContent=translations('上一页','Previous');
    $('#media-next').textContent=translations('下一页','Next');
    $('#media-pagination').hidden=filtered.length<=size;
  }
  root.addEventListener('liangyou:drama-render',event=>render(event.detail));
})();

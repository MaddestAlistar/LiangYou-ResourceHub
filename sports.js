(() => {
  'use strict';
  const grid=document.getElementById('sportsGrid'),status=document.getElementById('sportsStatus'),count=document.getElementById('sportsCount');
  if(!grid||!status||!count)return;
  const tabs=[...document.querySelectorAll('[data-sport-filter]')];
  let matches=[],active='all',updated=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time=v=>{if(!v)return '时间待确认';const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' 北京时间':'时间待确认'};
  function render(){
    const filtered=matches.filter(m=>active==='all'||m.category===active);
    const display=active==='all'?['lol','basketball','football','esports','other'].flatMap(cat=>filtered.filter(m=>m.category===cat).slice(0,5)):filtered.slice(0,24);
    count.textContent=active==='all'?'收录 '+filtered.length+' 场 · 精选 '+display.length+' 场':filtered.length+' 场赛事';
    if(!filtered.length){grid.innerHTML='<div class="sports-empty"><strong>当前暂无可展示的数据</strong>数据源还未同步，或该分区暂时没有公开的有效胜负市场。不会使用虚构赔率填充页面。</div>';return}
    grid.innerHTML=display.map(m=>{
      const [a,b]=m.outcomes;
      const p=Math.min(100,Math.max(0,Number(a.probability)*100));
      const q=Math.min(100,Math.max(0,Number(b.probability)*100));
      const url=(typeof m.source_url==='string'&&/^https:\/\/polymarket\.com\/event\/[a-z0-9-]+$/i.test(m.source_url))?m.source_url:'';
      const probabilityBlock=m.outcomes.length===3
        ?'<div class="sports-three">'+m.outcomes.map(o=>'<div class="sports-side"><span>'+esc(o.name)+'</span><b>'+Math.max(0,Math.min(100,Number(o.probability)*100)).toFixed(0)+'%</b></div>').join('')+'</div>'
        :'<div class="sports-prob"><div class="sports-side"><span>'+esc(a.name)+'</span><b>'+p.toFixed(0)+'%</b></div><span class="sports-versus">VS</span><div class="sports-side right"><span>'+esc(b.name)+'</span><b>'+q.toFixed(0)+'%</b></div></div>';
      return '<article class="sports-match"><div class="sports-match-top"><span>'+esc(m.league||'赛事')+'</span><span>'+esc(time(m.start_time))+'</span></div><h3>'+esc(m.title)+'</h3>'+probabilityBlock+'<div class="sports-track" aria-label="预测概率分布"><i style="width:'+p.toFixed(1)+'%"></i></div><div class="sports-match-bottom"><span>Polymarket · 市场隐含概率</span>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">来源 ↗</a>':'')+'</div></article>'
    }).join('');
  }
  tabs.forEach(btn=>btn.addEventListener('click',()=>{active=btn.dataset.sportFilter;tabs.forEach(t=>{const ok=t===btn;t.classList.toggle('is-active',ok);t.setAttribute('aria-pressed',String(ok))});render()}));
  fetch('./data/sports.json?d='+Math.floor(Date.now()/120000),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('no sports data');return r.json()}).then(d=>{
    if(d.schema!==1||!Array.isArray(d.events))throw Error('sports schema');
    matches=d.events.filter(m=>m&&Array.isArray(m.outcomes)&&[2,3].includes(m.outcomes.length)&&m.outcomes.every(o=>Number.isFinite(Number(o.probability))&&o.name)).sort((a,b)=>new Date(a.start_time||'9999')-new Date(b.start_time||'9999'));
    updated=d.generated_at?new Date(d.generated_at):null;
    const age=updated?Date.now()-updated.getTime():Infinity;
    status.textContent=updated&&Number.isFinite(age)?'上次同步：'+time(d.generated_at)+(age>6*3600*1000?' · 数据可能已过期':''):'等待首次同步';
    render();
  }).catch(()=>{status.textContent='同步数据暂不可用';grid.innerHTML='<div class="sports-empty"><strong>赛事数据暂不可用</strong>请稍后刷新。本栏目不展示未经验证的预测概率。</div>';count.textContent='同步失败'});
})();
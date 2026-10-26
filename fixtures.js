/* Independent official fixture board; never mixes scores with betting odds. */
(()=>{
 'use strict';
 const panel=document.getElementById('officialFixtures');
 if(!panel)return;
 const byId=id=>document.getElementById(id);
 const grid=byId('officialFixturesGrid'), count=byId('officialFixturesCount');
 const notice=byId('officialFixturesStatus'), search=byId('officialFixturesSearch');
 const sport=byId('officialFixturesCategory'),showing=byId('officialFixturesShowing'),more=byId('officialFixturesMore');
 const tabs=[...panel.querySelectorAll('[data-fixtures-state]')];
 const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text={
  zh:{title:'真实赛程与比分',intro:'API-Sports · PandaScore 真实赛事资料。比分来自定时快照，不是直播数据。',
   all:'全部赛程',live:'进行中',scheduled:'即将开始',finished:'已结束',search:'搜索球队、联赛或电竞项目',
   options:['全部项目','英雄联盟','其他电竞','篮球','足球'],more:'加载更多赛事',waiting:'首次真实数据同步中，不显示模拟比分。',
   partial:'部分数据源暂不可用；以下仅展示成功核验的赛事。',updated:'数据采集',cached:'数据已超过 18 小时，请以赛事官方信息为准。',
   listed:n=>'共 '+n+' 场',showing:(a,b)=>'已显示 '+a+' / '+b+' 场',empty:'这个条件下没有已采集的赛事，请切换分类或关键词。',
   scheduledScore:'待开赛',noScore:'比分待更新',bo:'赛制',source:'查看来源 ↗',time:'北京时间',
   note:'赛程与比分分别来自 API-Sports 和 PandaScore；每 6 小时计划更新，比分存在延迟，不代表实时赛况。下方预测市场数据独立展示。',
   market:'赛前预测市场'},
  en:{title:'Schedules & scores',intro:'API-Sports and PandaScore fixtures. Scores are periodically captured, not live feeds.',
   all:'All',live:'In progress',scheduled:'Upcoming',finished:'Finished',search:'Search teams, leagues and games',
   options:['All sports','League of Legends','Other esports','Basketball','Football'],more:'Show more matches',waiting:'Awaiting first verified snapshot; no simulated scores.',
   partial:'Some providers unavailable. Showing only verified results.',updated:'Captured',cached:'Snapshot older than 18 hours; check official results.',
   listed:n=>n+' matches',showing:(a,b)=>'Showing '+a+' / '+b,empty:'No matches found for this filter. Try a different keyword or category.',
   scheduledScore:'Not started',noScore:'Score pending',bo:'Format',source:'Source ↗',time:'UTC+8',
   note:'Fixtures are supplied by API-Sports and PandaScore, checked approximately every 6 hours. Scores may be delayed and are not live. Prediction markets appear separately below.',
   market:'Prediction markets'}
 };
 let state='all',records=[],limit=6,generated=null,status='pending';
 const lang=()=>panel.closest('#sports')?.getAttribute('lang')==='en'?'en':'zh';
 const copy=()=>text[lang()];
 const clock=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat(lang()==='zh'?'zh-CN':'en-US',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d):'--';};
 function staticText(){
   const t=copy();
   byId('officialFixturesTitle').textContent=t.title;
   byId('officialFixturesIntro').textContent=t.intro;
   byId('officialFixturesNote').textContent=t.note;
   byId('fixturesMarketTitle').textContent=t.market;
   tabs.forEach(b=>b.textContent=t[b.dataset.fixturesState]);
   search.placeholder=t.search;search.setAttribute('aria-label',t.search);
   [...sport.options].forEach((opt,i)=>opt.textContent=t.options[i]);
   more.textContent=t.more;
 }
 function card(row){
   const t=copy();
   const finished=row.status==='finished',live=row.status==='live';
   const stateLabel=t[row.status];
   const label=[row.league,row.stage,Number.isInteger(row.best_of)?'BO'+row.best_of:''].filter(Boolean).join(' · ');
   const score=value=>Number.isInteger(value)?'<span class="fixtures-score">'+safe(value)+'</span>':
      '<span class="fixtures-score fixtures-score-pending">'+safe(row.status==='scheduled'?t.scheduledScore:t.noScore)+'</span>';
   const source=row.provider==='pandascore'?'PandaScore':'API-Sports';
   const url=/^https:\/\/(?:www\.)?(?:api-football\.com|api-basketball\.com|pandascore\.co)\/$/.test(row.source_url)?row.source_url:'';
   return '<article class="fixtures-card"><div class="fixtures-cardtop"><span>'+safe(label)+
      '</span><span class="fixtures-state'+(live?' fixtures-state-live':finished?' fixtures-state-finished':'')+'">'+safe(stateLabel)+'</span></div>'+
      '<div class="fixtures-title">'+safe(clock(row.start_time))+' · '+safe(t.time)+'</div>'+
      '<div class="fixtures-versus"><span class="fixtures-team">'+safe(row.home)+'</span>'+score(row.score_home)+'</div>'+
      '<div class="fixtures-versus"><span class="fixtures-team">'+safe(row.away)+'</span>'+score(row.score_away)+'</div>'+
      '<div class="fixtures-cardfoot"><span class="fixtures-provider">'+source+'</span>'+
      (url?'<a href="'+safe(url)+'" target="_blank" rel="noopener noreferrer">'+safe(t.source)+'</a>':'')+'</div></article>';
 }
 function render(){
   staticText();
   const t=copy();
   const query=search.value.trim().normalize('NFKC').toLocaleLowerCase();
   const matches=records.filter(x=>(state==='all'||x.status===state)&&
     (sport.value==='all'||x.sport===sport.value)&&
     (!query||[x.league,x.stage,x.home,x.away,x.sport,x.provider].join(' ').normalize('NFKC').toLocaleLowerCase().includes(query)));
   const prioritized=[...matches].sort((a,b)=>{
     const rank=s=>s==='live'?0:s==='scheduled'?1:2;
     return rank(a.status)-rank(b.status) ||
       (a.status==='finished'?Date.parse(b.start_time)-Date.parse(a.start_time):
         Date.parse(a.start_time)-Date.parse(b.start_time));
   });
   const shown=prioritized.slice(0,limit);
   grid.innerHTML=shown.length?shown.map(card).join(''):'<p class="fixtures-empty">'+safe(
      records.length?t.empty:t.waiting)+'</p>';
   count.textContent=t.listed(records.length);
   showing.textContent=t.showing(shown.length,prioritized.length);
   more.hidden=shown.length>=prioritized.length;
   if(generated){
     const stale=Date.now()-Date.parse(generated)>18*3600000;
     notice.textContent=(stale?t.cached:status==='partial'?t.partial:t.updated+'：'+clock(generated)+' · '+t.time);
   }else notice.textContent=t.waiting;
 }
 async function refresh(){
   try{
     const response=await fetch('./data/real-sports.json?v='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(16000)});
     if(!response.ok)throw Error('snapshot missing');
     const snapshot=await response.json();
     if(snapshot.schema!==1||snapshot.source_type!=='official_fixtures'||!Array.isArray(snapshot.events))throw Error('invalid schema');
     const seen=new Set();
     records=snapshot.events.filter(x=>{
       if(!x||typeof x.id!=='string'||seen.has(x.id)||!['api-sports','pandascore'].includes(x.provider)||
         !['lol','esports','basketball','football'].includes(x.sport)||!['live','scheduled','finished'].includes(x.status)||
         !x.home||!x.away||!Number.isFinite(Date.parse(x.start_time)))return false;
       seen.add(x.id);return true;
     }).slice(0,220);
     generated=snapshot.generated_at;
     status=snapshot.status;
   }catch{status='failed';}
   render();
 }
 tabs.forEach(b=>b.addEventListener('click',()=>{
   state=b.dataset.fixturesState;limit=6;
   tabs.forEach(x=>{const selected=x===b;x.classList.toggle('is-active',selected);x.setAttribute('aria-pressed',String(selected));});
   render();
 }));
 search.addEventListener('input',()=>{limit=6;render();});
 sport.addEventListener('change',()=>{limit=6;render();});
 more.addEventListener('click',()=>{limit+=6;render();});
 document.querySelectorAll('#sportsLanguage [data-sports-lang]').forEach(x=>x.addEventListener('click',()=>setTimeout(render,0)));
 render();refresh();
 if(typeof window.setInterval==='function')window.setInterval(refresh,15*60*1000);
})();

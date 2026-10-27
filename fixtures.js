/* Official tournaments. No pseudo-live scores, no invented standings. */
(()=>{
 'use strict';
 const panel=document.getElementById('officialFixtures'); if(!panel)return;
 const el=id=>document.getElementById(id);
 const refs={grid:el('officialFixturesGrid'),status:el('officialFixturesStatus'),count:el('officialFixturesCount'),
   search:el('officialFixturesSearch'),category:el('officialFixturesCategory'),more:el('officialFixturesMore'),
   showing:el('officialFixturesShowing'),bracket:el('officialBracketGrid'),bracketSelect:el('officialBracketSelect'),
   standing:el('officialStandingGrid'),standingSelect:el('officialStandingSelect')};
 const views=[...panel.querySelectorAll('[data-fixtures-view]')],dates=[...panel.querySelectorAll('[data-fixtures-date]')];
 const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const messages={
 zh:{title:'赛事日历与赛事资料',intro:'未来赛程、官方电竞晋级路径、联赛积分排名；不展示延迟的进行中比分。',
  views:['赛事日历','电竞晋级图','联赛积分榜'],dates:['今天','明天','未来 7 天'],
  placeholder:'搜索球队、赛事或联赛',category:['全部项目','英雄联盟','其他电竞','篮球','足球'],
  first:'等待首次官方数据同步；不会填充模拟赛事。',empty:'暂未采集到符合条件的未来比赛，请换个日期或分类。',
  unavailable:'该赛事的官方晋级图尚未开放或当前接口没有返回可核验的完整对阵。',
  noStanding:'当前联赛暂无可核验的官方排名，暂不显示推算积分。',
  source:'数据源',updated:'最近核验',stale:'赛事资料已超过 18 小时未更新，请核对官方发布信息。',
  partial:'部分接口暂不可用，仅展示有来源的赛事资料。',time:'北京时间',
  total:n=>'本周 '+n+' 场',shown:(n,t)=>'已显示 '+n+' / '+t+' 场',more:'加载更多赛程',
  round:'轮次',draw:'待确认',rank:'排名',team:'战队 / 球队',wins:'胜',losses:'负',
  note:'赛程、晋级图、积分来自 API-Sports 与 PandaScore 的官方接口，约每 6 小时计划检查。晋级图和排名仅展示提供商返回的数据；预测市场信息独立在下方。',
  market:'赛前预测市场'},
 en:{title:'Event calendar & tournament data',intro:'Upcoming fixtures, verified esports brackets and standings. No delayed live scores.',
  views:['Calendar','Esports brackets','League standings'],dates:['Today','Tomorrow','Next 7 days'],
  placeholder:'Search teams or events',category:['All sports','League of Legends','Other esports','Basketball','Football'],
  first:'Waiting for verified provider data. No fictional fixtures.',empty:'No upcoming matches for this date or filter.',
  unavailable:'Verified official bracket not available for the selected event.',
  noStanding:'No official standings available for this league. No estimated rankings are shown.',
  source:'Source',updated:'Last verified',stale:'Data older than 18 hours. Check official records.',
  partial:'Some providers are unavailable. Showing only sourced records.',time:'UTC+8',
  total:n=>n+' this week',shown:(n,t)=>'Showing '+n+' / '+t,more:'More fixtures',
  round:'Round',draw:'TBD',rank:'Rank',team:'Team',wins:'W',losses:'L',
  note:'Schedules, brackets and standings are from API-Sports and PandaScore, checked about every six hours. Only returned data is displayed; prediction markets remain separate below.',
  market:'Prediction markets'}
 };
 let data={events:[],brackets:[],standings:[],generated_at:null,status:'pending'},view='calendar',date='week',limit=6;
 const lang=()=>panel.closest('#sports')?.getAttribute('lang')==='en'?'en':'zh';
 const txt=()=>messages[lang()];
 const fmtDate=v=>{
   const d=new Date(v);
   if(!Number.isFinite(d.getTime()))return '--';
   return new Intl.DateTimeFormat(lang()==='zh'?'zh-CN':'en-US',
     {timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
 };
 const dayKey=d=>new Intl.DateTimeFormat('en-US',
   {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
 const empty=(value)=>'<p class="fixtures-empty">'+safe(value)+'</p>';
 function labels(){
   const t=txt();el('officialFixturesTitle').textContent=t.title;el('officialFixturesIntro').textContent=t.intro;
   el('officialFixturesNote').textContent=t.note;el('fixturesMarketTitle').textContent=t.market;
   views.forEach((x,i)=>{x.textContent=t.views[i];const active=x.dataset.fixturesView===view;
     x.classList.toggle('is-active',active);x.setAttribute('aria-pressed',String(active));});
   dates.forEach((x,i)=>{x.textContent=t.dates[i];const active=x.dataset.fixturesDate===date;
     x.classList.toggle('is-active',active);x.setAttribute('aria-pressed',String(active));});
   refs.search.placeholder=t.placeholder;refs.search.setAttribute('aria-label',t.placeholder);
   [...refs.category.options].forEach((x,i)=>x.textContent=t.category[i]);
   refs.more.textContent=t.more;
   for(const [id,which] of [['fixtureCalendarPanel','calendar'],['fixtureBracketsPanel','brackets'],['fixtureStandingsPanel','standings']])
     el(id).hidden=which!==view;
   if(data.generated_at){
     const age=Date.now()-Date.parse(data.generated_at);
     refs.status.textContent=age>18*3600000?t.stale:(data.status==='partial'?t.partial+' · ':'')+
       t.updated+'：'+fmtDate(data.generated_at)+' · '+t.time;
   }else refs.status.textContent=t.first;
 }
 function calendar(){
   const t=txt(),now=Date.now();
   const today=dayKey(new Date()),tomorrow=dayKey(new Date(now+86400000));
   const until=now+7*86400000;
   const query=refs.search.value.trim().normalize('NFKC').toLowerCase();
   const matches=data.events.filter(e=>{
     if(e.status!=='scheduled'||!['api-sports','pandascore'].includes(e.provider))return false;
     const time=Date.parse(e.start_time);
     if(!Number.isFinite(time)||time<now-2*60*1000||time>until)return false;
     if(date==='today'&&dayKey(new Date(time))!==today)return false;
     if(date==='tomorrow'&&dayKey(new Date(time))!==tomorrow)return false;
     if(refs.category.value!=='all'&&e.sport!==refs.category.value)return false;
     if(query&&![e.home,e.away,e.league,e.stage,e.sport].join(' ').normalize('NFKC').toLowerCase().includes(query))return false;
     return true;
   }).sort((a,b)=>Date.parse(a.start_time)-Date.parse(b.start_time));
   refs.grid.innerHTML=matches.length?matches.slice(0,limit).map(e=>{
     const meta=[e.league,e.stage,Number.isInteger(e.best_of)?'BO'+e.best_of:null].filter(Boolean).join(' · ');
     return '<article class="fixtures-card"><div class="fixtures-cardtop"><strong>'+safe(meta)+
       '</strong><span>'+safe(fmtDate(e.start_time))+'</span></div>'+
       '<div class="fixtures-versus">'+safe(e.home)+' <em>VS</em> '+safe(e.away)+'</div>'+
       '<div class="fixtures-cardfoot"><span class="fixtures-source">'+safe(e.provider==='pandascore'?'PandaScore':'API-Sports')+
       '</span><span>'+safe(t.time)+'</span></div></article>';
   }).join(''):empty(data.generated_at?t.empty:t.first);
   refs.count.textContent=t.total(data.events.filter(e=>e.status==='scheduled'&&Date.parse(e.start_time)>=now&&Date.parse(e.start_time)<=until).length);
   refs.showing.textContent=t.shown(Math.min(matches.length,limit),matches.length);
   refs.more.hidden=matches.length<=limit;
 }
 function setOptions(select,items,kind){
   const current=select.value;
   select.innerHTML=items.map((x,i)=>'<option value="'+safe(String(i))+'">'+safe(x.title||kind+' '+(i+1))+'</option>').join('');
   select.value=Number(current)>=0&&Number(current)<items.length?current:'0';
 }
 function brackets(){
   const t=txt(),records=data.brackets.filter(b=>b&&Array.isArray(b.rounds)&&b.rounds.length&&b.provider==='pandascore');
   if(!records.length){refs.bracketSelect.hidden=true;refs.bracket.innerHTML=empty(t.unavailable);return;}
   refs.bracketSelect.hidden=false;setOptions(refs.bracketSelect,records,'Tournament');
   const selected=records[Number(refs.bracketSelect.value)]||records[0];
   refs.bracket.innerHTML=selected.rounds.slice(0,10).map(round=>
     '<section class="fixtures-round"><h4>'+safe(round.round||t.round)+'</h4>'+
     (Array.isArray(round.matches)?round.matches.slice(0,12):[]).map(match=>
       '<div class="fixtures-tie">'+[["home","score_home"],["away","score_away"]].map(([side,score])=>
         '<div class="fixtures-tie-line'+(match.winner===match[side]?' is-winner':'')+'"><span>'+
         safe(match[side]||t.draw)+'</span><b>'+safe(Number.isInteger(match[score])?match[score]:'—')+'</b></div>').join('')+
       '</div>').join('')+'</section>').join('');
 }
 function standings(){
   const t=txt(),records=data.standings.filter(x=>x&&Array.isArray(x.groups)&&x.groups.length);
   if(!records.length){refs.standingSelect.hidden=true;refs.standing.innerHTML=empty(t.noStanding);return;}
   refs.standingSelect.hidden=false;setOptions(refs.standingSelect,records,'League');
   const selected=records[Number(refs.standingSelect.value)]||records[0];
   const byGroup=new Map();
   for(const item of selected.groups){
     if(!item||!Number.isInteger(item.rank)||!item.team)continue;
     const key=item.group||selected.title||'Ranking';
     if(!byGroup.has(key))byGroup.set(key,[]);
     byGroup.get(key).push(item);
   }
   refs.standing.innerHTML=[...byGroup.entries()].map(([group,list])=>
     '<section class="fixtures-standing-group"><h4>'+safe(group)+'</h4><table class="fixtures-ranking">'+
       '<thead><tr><th>'+t.rank+'</th><th>'+t.team+'</th><th>'+t.wins+'</th><th>'+t.losses+'</th></tr></thead><tbody>'+
       list.sort((a,b)=>a.rank-b.rank).slice(0,20).map(x=>'<tr><td>'+safe(x.rank)+'</td><td>'+
         safe(x.team)+'</td><td>'+safe(Number.isInteger(x.wins)?x.wins:'—')+'</td><td>'+
         safe(Number.isInteger(x.losses)?x.losses:'—')+'</td></tr>').join('')+
       '</tbody></table></section>').join('')||empty(t.noStanding);
 }
 function render(){labels();if(view==='calendar')calendar();else if(view==='brackets')brackets();else standings();}
 async function fetchData(){
   try{
     const result=await fetch('./data/real-sports.json?v='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
     if(!result.ok)throw Error('Unavailable');
     const next=await result.json();
     if(next.schema!==1||next.source_type!=='official_fixtures'||!Array.isArray(next.events))throw Error('Invalid');
     data={...next,events:next.events.slice(0,240),
       brackets:Array.isArray(next.brackets)?next.brackets:[],
       standings:Array.isArray(next.standings)?next.standings:[]};
   }catch{data={...data,status:'failed'};}
   render();
 }
 views.forEach(x=>x.addEventListener('click',()=>{view=x.dataset.fixturesView;limit=6;render();}));
 dates.forEach(x=>x.addEventListener('click',()=>{date=x.dataset.fixturesDate;limit=6;render();}));
 refs.search.addEventListener('input',()=>{limit=6;render();});
 refs.category.addEventListener('change',()=>{limit=6;render();});
 refs.more.addEventListener('click',()=>{limit+=6;render();});
 refs.bracketSelect.addEventListener('change',render);
 refs.standingSelect.addEventListener('change',render);
 const langs=document.querySelectorAll('#sportsLanguage [data-sports-lang]');
 langs.forEach(x=>x.addEventListener('click',()=>setTimeout(render,0)));
 render();fetchData();if(typeof window.setInterval==='function')window.setInterval(fetchData,15*60*1000);
})();

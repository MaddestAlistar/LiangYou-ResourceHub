/* Verified esports progression diagrams. No fabricated teams, pairings or promotion links. */
(()=>{
'use strict';
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number.isInteger(n)?String(n):'—';
const z=(zh,en,lang)=>lang==='en'?en:zh;
const norm=s=>String(s||'').trim().toLocaleLowerCase('en');
const labelOf=x=>String(x.title||'');
function game(x){
 const v=labelOf(x).toLowerCase();
 if(/vct|valorant|无畏契约/.test(v))return 'valorant';
 if(/pgl|iem|cs2|counter.strike|blast|esl|major/.test(v))return 'cs2';
 if(/dota|dreamleague|the international/.test(v))return 'dota';
 if(x.sport==='lol'||/worlds|lck|lpl|lec|lcs|lcp|msi|league of legends/.test(v))return 'lol';
 return 'other';
}
function stageOf(x){
 const s=labelOf(x).toLowerCase();
 if(Array.isArray(x.rounds)&&x.rounds.length)return 'knockout';
 if(/swiss|瑞士/.test(s)||(/worlds|全球总决赛/.test(s)&&/group stage|小组赛/.test(s)))return 'swiss';
 if(/group|regular season|round robin|小组|常规赛/.test(s))return 'group';
 return null;
}
function cleanMatches(round){
 const set=new Set(),out=[];
 for(const m of round.matches||[]){
  if(!m||!m.home||!m.away)continue;
  const scorePair=[num(m.score_home),num(m.score_away)];
  const order=[norm(m.home),norm(m.away)].sort().join('|');
  const sig=order+'|'+norm(m.winner)+'|'+[
    norm(m.home)<norm(m.away)?scorePair.join(':'):scorePair.reverse().join(':')].join('');
  if(set.has(sig))continue;
  set.add(sig);out.push(m);
 }
 return out.slice(0,12);
}
function roundInfo(label){
 const v=String(label||'').toLowerCase();
 if(/round of 16|十六|1\/8/.test(v))return 10;
 if(/quarter|八强|1\/4/.test(v))return 20;
 if(/semi|半决/.test(v))return 30;
 if(/\bfinal\b|决赛/.test(v)&&!/semi|quarter/.test(v))return 40;
 if(/lower|败者/.test(v))return 50;
 return 15;
}
function knockout(record,opt={}){
 const language=opt.lang||'zh',translate=opt.translate||((v)=>v),team=opt.team||((v)=>v);
 const combined=new Map();
 for(const r of record.rounds||[]){
  const key=String(r.round||z('对阵','Matches',language));
  if(!combined.has(key))combined.set(key,[]);
  combined.get(key).push(...(r.matches||[]));
 }
 const all=[...combined].map(([label,matches])=>({label,matches:cleanMatches({matches})}))
  .filter(x=>x.matches.length).sort((a,b)=>roundInfo(a.label)-roundInfo(b.label));
 if(!all.length)return '';
 const cw=236,gap=56,margin=16,ch=98,space=16;
 const count=Math.min(10,all.length);
 const cols=all.slice(0,count);
 const peak=Math.max(...cols.map(r=>r.matches.length));
 const height=Math.max(178,peak*(ch+space)+38);
 const width=count*cw+(count-1)*gap+2*margin;
 const centers=cols.map(col=>{
  const n=col.matches.length;
  const total=n*ch+(n-1)*space;
  const top=30+(Math.max(0,height-30-total))/2;
  return col.matches.map((_,i)=>top+i*(ch+space));
 });
 const paths=[];
 for(let k=0;k<cols.length-1;k++){
  const cur=cols[k].matches,next=cols[k+1].matches;
  for(let i=0;i<cur.length;i++){
   const winner=cur[i].winner;
   if(!winner)continue;
   const matches=next.map((m,j)=>(norm(m.home)===norm(winner)||norm(m.away)===norm(winner))?j:-1).filter(n=>n>=0);
   if(matches.length!==1)continue;
   const j=matches[0],x1=margin+k*(cw+gap)+cw,x2=margin+(k+1)*(cw+gap);
   const y1=centers[k][i]+ch/2,y2=centers[k+1][j]+ch/2,mid=(x1+x2)/2;
   paths.push('<path d="M'+x1+' '+y1+' H'+mid+' V'+y2+' H'+x2+'" />');
  }
 }
 const cards=cols.map((col,k)=>{
  const x=margin+k*(cw+gap);
  return '<div class="lyb-round-name" style="left:'+x+'px;width:'+cw+'px">'+
   html(translate(col.label))+'</div>'+
   col.matches.map((m,i)=>{
    const y=centers[k][i],win=norm(m.winner);
    const side=(who,score)=>'<div class="lyb-team'+(win&&norm(who)===win?' is-winner':'')+'"><span>'+
      html(team(who))+'</span><b>'+num(score)+'</b></div>';
    return '<article class="lyb-match" style="left:'+x+'px;top:'+y+'px;width:'+cw+'px">'+
      side(m.home,m.score_home)+side(m.away,m.score_away)+'</article>';
   }).join('');
 }).join('');
 return '<div class="lyb-visual"><div class="lyb-visual-top"><strong>PLAYOFF BRACKET</strong><span>'+
  z('淘汰赛 · 对阵路径','Knockout · match tree',language)+'</span></div>'+
  '<div class="lyb-scroll" tabindex="0" role="region" aria-label="'+z('淘汰赛晋级图，横向滑动查看','Knockout bracket, horizontally scrollable',language)+'">'+
  '<div class="lyb-knockout-map" style="width:'+width+'px;height:'+(height+8)+'px">'+
  '<svg class="lyb-lines" aria-hidden="true" width="'+width+'" height="'+(height+8)+'" viewBox="0 0 '+width+' '+(height+8)+'">'+paths.join('')+'</svg>'+
  cards+'</div></div></div>';
}
const swissNodes=[
 [{name:'0-0',index:'R1',wins:0,losses:0}],
 [{name:'1-0',index:'R2',wins:1,losses:0},{name:'0-1',index:'R2',wins:0,losses:1}],
 [{name:'2-0',index:'R3',wins:2,losses:0},{name:'1-1',index:'R3',wins:1,losses:1},{name:'0-2',index:'R3',wins:0,losses:2}],
 [{name:'2-1',index:'R4',wins:2,losses:1},{name:'1-2',index:'R4',wins:1,losses:2}],
 [{name:'2-2',index:'R5',wins:2,losses:2}],
 [{name:'ADVANCES',index:'OUT',advanced:true},{name:'ELIMINATED',index:'OUT',eliminated:true}]
];
/**
 * Recover a match's Swiss round only when an entire 16-team opening round is
 * present and both opponents' verified appearance counts agree. Incomplete
 * histories retain null rounds; no dates or standings are used to invent them.
 */
function inferRounds(source,officialRows=[]){
 const matches=(source||[]).filter(m=>m&&m.home&&m.away&&
  (String(m.id||'').startsWith('stage-')))
  .slice().sort((a,b)=>String(a.start_time||'').localeCompare(String(b.start_time||''))||
    String(a.id).localeCompare(String(b.id)));
 const first=matches.slice(0,8);
 const entrants=new Set(first.flatMap(m=>[norm(m.home),norm(m.away)]));
 if(first.length!==8||entrants.size!==16||first.some(m=>m.status!=='finished'||
   !m.winner||![norm(m.home),norm(m.away)].includes(norm(m.winner))))return null;
 const played=new Map([...entrants].map(t=>[t,0]));
 const record=new Map([...entrants].map(t=>[t,{wins:0,losses:0}]));
 const stages=[new Map([...record].map(([t,v])=>[t,{...v,games:0}]))];
 const ordered=[];
 for(const m of matches){
  const a=norm(m.home),b=norm(m.away);
  if(!played.has(a)||!played.has(b)||a===b)return null;
  const countA=played.get(a),countB=played.get(b);
  if(countA!==countB||countA>=5)return null;
  const round=countA+1;
  if(Number.isInteger(m.round)&&m.round!==round)return null;
  const stA=record.get(a),stB=record.get(b);
  if(stA.wins>=3||stA.losses>=3||stB.wins>=3||stB.losses>=3)return null;
  const done=m.status==='finished';
  const winner=norm(m.winner);
  if(done&&winner!==a&&winner!==b)return null;
  ordered.push({...m,round,round_source:Number.isInteger(m.round)?'provider':'verified_sequence'});
  if(done){
   if(winner===a){stA.wins++;stB.losses++;}
   else{stB.wins++;stA.losses++;}
   played.set(a,round);played.set(b,round);
  }
 }
 // A stage snapshot contains only games concluded through that round.
 const totals=new Map([...entrants].map(t=>[t,{wins:0,losses:0,games:0}]));
 for(let round=1;round<=5;round++){
  for(const m of ordered.filter(v=>v.round===round&&v.status==='finished')){
   const a=norm(m.home),b=norm(m.away),winner=norm(m.winner);
   const tA=totals.get(a),tB=totals.get(b);
   if(!tA||!tB)return null;
   tA.games++;tB.games++;
   if(winner===a){tA.wins++;tB.losses++;}
   else{tB.wins++;tA.losses++;}
  }
  stages.push(new Map([...totals].map(([t,v])=>[t,{...v}])));
 }
 const official=(officialRows||[]).filter(x=>x&&x.team&&Number.isInteger(x.wins)&&Number.isInteger(x.losses));
 if(official.length>=8){
  const end=stages[5];
  for(const row of official){
   const actual=end.get(norm(row.team));
   if(!actual||actual.wins!==row.wins||actual.losses!==row.losses)return null;
  }
 }
 const names=new Map(matches.flatMap(m=>[[norm(m.home),m.home],[norm(m.away),m.away]]));
 return {matches:ordered,stages,names,entrants:[...entrants]};
}
function swiss(record,opt={}){
 const lang=opt.lang||'zh',team=opt.team||(v=>v),events=Array.isArray(opt.events)?opt.events:[],
  tournamentId=Number(record.tournament_id||String(record.id||'').replace('panda-',''));
 const history=inferRounds(events.filter(m=>Number(m.tournament_id)===tournamentId),record.groups);
 const ranked=(record.groups||[]).filter(r=>r&&r.team&&Number.isInteger(r.wins)&&Number.isInteger(r.losses));
 const historical=(i,node)=>{
  const snapshot=history.stages[Math.min(i,5)];
  return [...snapshot].filter(([t,st])=>node.advanced?st.wins>=3:
   node.eliminated?st.losses>=3:
   st.games===i&&st.wins===node.wins&&st.losses===node.losses)
   .map(([t,st])=>({team:history.names.get(t)||t,wins:st.wins,losses:st.losses}));
 };
 const slots=swissNodes.map((col,i)=>col.map(node=>({...node,teams:history?
  historical(i,node):ranked.filter(r=>node.advanced?r.wins>=3:
   node.eliminated?r.losses>=3:r.wins===node.wins&&r.losses===node.losses)})));
 const count=history?history.entrants.length:ranked.length;
 const showTeam=t=>'<div class="lyb-pool-team"><span>'+html(team(t.team))+'</span><b>'+
  num(t.wins)+':'+num(t.losses)+'</b></div>';
 const columnNames=[z('初始赛程','Opening',lang),z('第一轮后','After R1',lang),z('第二轮后','After R2',lang),z('第三轮后','After R3',lang),z('决胜轮','Decider',lang),z('晋级结果','Outcomes',lang)];
 const matches=(history?history.matches:events.filter(e=>Number(e.tournament_id)===tournamentId&&e.home&&e.away&&
   ['scheduled','live','finished'].includes(e.status)))
   .filter((e,i,list)=>list.findIndex(x=>String(x.id).replace(/^(?:stage|panda)-/,'')===
    String(e.id).replace(/^(?:stage|panda)-/,''))===i)
   .sort((a,b)=>Date.parse(a.start_time)-Date.parse(b.start_time));
 const matchCard=m=>{
  const done=m.status==='finished';
  const won=done?norm(m.winner):'';
  const row=(who,score)=>'<div class="lyb-matchup-team'+(won&&norm(who)===won?' is-winner':'')+'">'+
   '<span>'+html(team(who))+'</span><b>'+(done?num(score):'—')+'</b></div>';
  return '<article class="lyb-matchup">'+row(m.home,m.score_home)+row(m.away,m.score_away)+'</article>';
 };
 // Only an individually verified previous record identifies the match's
 // pre-round pool. A fixture's date by itself is never evidence of that pool.
 const poolFor=m=>{
  if(!history||!Number.isInteger(m.round)||m.round<1||m.round>5)return null;
  const prior=history.stages[m.round-1],one=prior?.get(norm(m.home)),two=prior?.get(norm(m.away));
  if(!one||!two||one.games!==m.round-1||two.games!==m.round-1||
     one.wins!==two.wins||one.losses!==two.losses)return null;
  return one.wins+'-'+one.losses;
 };
 const display=slots.map((col,i)=>{
  const roundNo=i+1;
  return '<div class="lyb-swiss-column"><h4><small>'+
   (i===5?'OUTCOMES':'ROUND '+roundNo)+'</small>'+html(columnNames[i])+'</h4>'+
   col.map(slot=>{
    const slotMatches=i<5?matches.filter(m=>m.round===roundNo&&poolFor(m)===slot.name):[];
    return '<div data-pool="'+html(slot.name)+'" class="lyb-pool '+(slot.advanced?'is-advanced':slot.eliminated?'is-eliminated':'')+'">'+
      '<header><b>'+html(slot.name)+'</b><small>'+(
       slot.advanced?z('晋级','Qualified',lang):slot.eliminated?z('淘汰','Eliminated',lang):
       z('战绩池','Record pool',lang))+'</small></header>'+
      (slotMatches.length?'<div class="lyb-pool-matches">'+slotMatches.map(matchCard).join('')+'</div>':
       slot.teams.length?slot.teams.map(showTeam).join(''):
       '<div class="lyb-pool-empty">—</div>')+'</div>';
   }).join('')+'</div>';
 }).join('');
 const loose=matches.filter(m=>!Number.isInteger(m.round)||m.round<1||m.round>5||!poolFor(m));
 const timelines=new Map();
 const dayFormatter=new Intl.DateTimeFormat(lang==='en'?'en-US':'zh-CN',{
  timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit'});
 const timeFormatter=new Intl.DateTimeFormat(lang==='en'?'en-US':'zh-CN',{
  timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false});
 for(const m of loose){
  const stamp=Date.parse(m.start_time);
  if(!Number.isFinite(stamp))continue;
  const date=dayFormatter.format(new Date(stamp));
  if(!timelines.has(date))timelines.set(date,[]);
  timelines.get(date).push({...m,_clock:timeFormatter.format(new Date(stamp))});
 }
 const fixtureList=[...timelines].slice(0,14).map(([date,round])=>
  '<div class="lyb-date-column"><h5>'+html(date)+'</h5>'+
  round.slice(0,16).map(m=>{
   const won=m.winner?norm(m.winner):'';
   const side=(name,score)=>'<div class="lyb-date-team'+(won&&norm(name)===won?' is-winner':'')+
     '"><span>'+html(team(name))+'</span><b>'+
     (m.status==='finished'?num(score):'—')+'</b></div>';
   return '<div class="lyb-date-match"><small>'+html(m._clock)+'</small>'+
     side(m.home,m.score_home)+side(m.away,m.score_away)+'</div>';
  }).join('')+'</div>').join('');
 return '<div class="lyb-visual lyb-swiss"><div class="lyb-visual-top"><strong>SWISS STAGE</strong>'+
  '<span>'+z('瑞士轮 · 战绩晋级路线','Swiss · progression by record',lang)+'</span></div>'+
  '<div class="lyb-scroll" tabindex="0" role="region" aria-label="'+z('瑞士轮晋级路线图','Swiss stage progression',lang)+'">'+
  '<div class="lyb-swiss-track"><svg class="lyb-swiss-links" aria-hidden="true"></svg>'+display+'</div></div>'+
  (fixtureList?'<section class="lyb-upcoming"><h4>'+z('赛程对阵时间线','Match timeline',lang)+'</h4><div class="lyb-scroll" tabindex="0" role="region" aria-label="'+z('按日期排列的已核验对阵','Verified fixtures by date',lang)+'"><div class="lyb-timeline-track">'+fixtureList+'</div></div></section>':'')+
  (count?'<p class="lyb-caption">'+(history?z('已核验比赛对应历轮战绩；虚线表示可能的晋级方向。','Verified rounds and records; dashed lines show possible progression.',lang):z('当前战绩与赛制路线。','Current verified records and stage paths.',lang))+'</p>':'')+
  '</div>';
}
function groups(record,opt={}){
 const lang=opt.lang||'zh',team=opt.team||(v=>v);
 const all=(record.groups||[]).filter(x=>x&&x.team&&Number.isInteger(x.rank));
 const bins=new Map();
 for(const row of all){const key=row.group||z('赛段','Stage',lang);if(!bins.has(key))bins.set(key,[]);bins.get(key).push(row);}
 // Build with records only, not an invented A/B/C group or qualification slot.
 const content=[...bins].map(([name,rows])=>'<section class="lyb-group"><h4>'+html(name)+'</h4>'+
  rows.sort((a,b)=>a.rank-b.rank).map(row=>'<div class="lyb-group-team"><span>'+
  html(team(row.team))+'</span><b>'+((Number.isInteger(row.wins)&&Number.isInteger(row.losses))?
  row.wins+'-'+row.losses:'—')+'</b></div>').join('')+'</section>').join('');
 return '<div class="lyb-visual"><div class="lyb-visual-top"><strong>GROUP STAGE</strong><span>'+
  z('分组赛 · 出线阶段','Group stage',lang)+'</span></div>'+
  '<div class="lyb-group-flow"><div class="lyb-groups">'+content+'</div>'+
  '<div class="lyb-qualify"><div class="lyb-qualify-mark">↗</div><strong>'+
  z('出线阶段','Qualification',lang)+'</strong><span>'+z('待官方确认','Pending confirmation',lang)+
  '</span></div></div></div>';
}

const swissEdges=[
 ['0-0','1-0'],['0-0','0-1'],
 ['1-0','2-0'],['1-0','1-1'],['0-1','1-1'],['0-1','0-2'],
 ['2-0','2-1'],['2-0','ADVANCES'],['1-1','2-1'],['1-1','1-2'],
 ['0-2','1-2'],['0-2','ELIMINATED'],
 ['2-1','2-2'],['2-1','ADVANCES'],['1-2','2-2'],['1-2','ELIMINATED'],
 ['2-2','ADVANCES'],['2-2','ELIMINATED']
];
function verifiedTransitions(history){
 const observed=new Set();
 if(!history)return observed;
 for(const m of history.matches){
  if(m.status!=='finished')continue;
  const before=history.stages[m.round-1],after=history.stages[m.round];
  if(!before||!after)continue;
  for(const who of [m.home,m.away]){
   const key=norm(who),a=before.get(key),b=after.get(key);
   if(!a||!b||!Number.isInteger(a.wins)||!Number.isInteger(a.losses))continue;
   const from=a.wins+'-'+a.losses;
   const to=b.wins>=3?'ADVANCES':b.losses>=3?'ELIMINATED':b.wins+'-'+b.losses;
   observed.add(from+'|'+to);
  }
 }
 return observed;
}
function connect(root,record,events){
 if(!root||typeof root.querySelector!=='function')return;
 const track=root.querySelector('.lyb-swiss-track'),svg=track?.querySelector('.lyb-swiss-links');
 if(!track||!svg||typeof track.getBoundingClientRect!=='function')return;
 const id=Number(record?.tournament_id||String(record?.id||'').replace('panda-',''));
 const history=inferRounds((events||[]).filter(m=>Number(m.tournament_id)===id),record?.groups);
 const confirmed=verifiedTransitions(history);
 const base=track.getBoundingClientRect(),nodes=new Map();
 track.querySelectorAll('.lyb-pool[data-pool]').forEach(item=>nodes.set(item.dataset.pool,item.getBoundingClientRect()));
 const coords=[];
 for(const [from,to] of swissEdges){
  const a=nodes.get(from),b=nodes.get(to);
  if(!a||!b)continue;
  const x1=a.right-base.left,x2=b.left-base.left,y1=(a.top+a.bottom)/2-base.top,y2=(b.top+b.bottom)/2-base.top;
  const mid=x1+(x2-x1)*.5;
  const actual=confirmed.has(from+'|'+to);
  coords.push('<path class="'+(actual?'lyb-link-confirmed':'lyb-link-possible')+
   '" d="M'+x1+' '+y1+' H'+mid+' V'+y2+' H'+x2+'"/>');
 }
 svg.setAttribute('viewBox','0 0 '+track.scrollWidth+' '+track.scrollHeight);
 svg.innerHTML=coords.join('');
}

window.LiangYouBracketViz={game,stageOf,knockout,swiss,groups,connect,inferRounds,verifiedTransitions};
})();
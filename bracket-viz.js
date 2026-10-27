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
  const sig=m.match_id?'id:'+String(m.match_id):order+'|'+norm(m.winner)+'|'+[
    norm(m.home)<norm(m.away)?scorePair.join(':'):scorePair.reverse().join(':')].join('');
  if(set.has(sig))continue;
  set.add(sig);out.push(m);
 }
 return out.slice(0,12);
}
function roundInfo(label){
 const v=String(label||'').toLowerCase();
 const numbered=v.match(/\bround\s+(\d+)\b/);
 if(numbered)return 5+Math.min(Number(numbered[1]),20);
 if(/round of 16|十六|1\/8/.test(v))return 10;
 if(/quarter|八强|1\/4/.test(v))return 20;
 if(/semi|半决/.test(v))return 30;
 if(/\bfinal\b|决赛/.test(v)&&!/semi|quarter/.test(v))return 40;
 return 15;
}
function knockout(record,opt={}){
 const lang=opt.lang||'zh',team=opt.team||(v=>v),translate=opt.translate||(v=>v);
 const all=[];
 for(const stage of record.rounds||[]){
  for(const m of cleanMatches(stage)){
   const title=String(stage.round||'');
   const side=m.bracket_side||(/lower|loser|败者/i.test(title)?'lower':
                              /upper|winner|胜者/i.test(title)?'upper':'final');
   all.push({...m,_stage:title,_side:side});
  }
 }
 if(!all.length)return '';
 const types=[
  {title:z('胜者组','Upper bracket',lang),kind:'upper'},
  {title:z('败者组','Lower bracket',lang),kind:'lower'},
  {title:z('决赛 / 其他官方轮次','Finals / other rounds',lang),kind:'final'}
 ];
 // Narrower columns reveal more of the next round on 360–430 px screens.
 const mobile=typeof window.innerWidth==='number'&&window.innerWidth<=680;
 const cw=mobile?178:226,gap=mobile?34:56,cardH=mobile?91:95,
       step=mobile?104:111,margin=mobile?12:16,top=mobile?44:48;
 const stageById=new Map(),lanes=[];
 for(const type of types){
  const matches=all.filter(m=>m._side===type.kind);
  if(!matches.length)continue;
  const rounds=new Map();
  for(const m of matches){
   if(!rounds.has(m._stage))rounds.set(m._stage,[]);
   rounds.get(m._stage).push(m);
  }
  const stages=[...rounds].map(([name,games])=>({name,games,col:0}))
   .sort((a,b)=>roundInfo(a.name)-roundInfo(b.name)||a.name.localeCompare(b.name));
  stages.forEach((stage,i)=>{
   stage.col=i;
   stage.games.forEach(m=>{if(m.match_id)stageById.set(String(m.match_id),stage);});
  });
  lanes.push({...type,stages});
 }
 // Put the grand final after both brackets even if a provider has no predecessor
 // references. Never assume a match's winner or fabricate an upstream node.
 const nonFinalMax=Math.max(0,...lanes.filter(x=>x.kind!=='final')
   .flatMap(x=>x.stages.map(g=>g.col)));
 const finals=lanes.find(x=>x.kind==='final');
 if(finals)finals.stages.forEach((g,i)=>{g.col=Math.max(g.col,nonFinalMax+1+i);});
 // Place each stage after every *verified* upstream match. Relax both
 // in-lane ordering and cross-lane match-ID edges until layout is stable.
 const stages=lanes.flatMap(x=>x.stages);
 let cycleDetected=false;
 for(let pass=0;pass<stages.length*2;pass++){
  let moved=false;
  for(const lane of lanes){
   for(let i=1;i<lane.stages.length;i++){
    const g=lane.stages[i],needed=lane.stages[i-1].col+1;
    if(g.col<needed){g.col=needed;moved=true;}
   }
  }
  for(const stage of stages){
   for(const match of stage.games){
    for(const ref of match.previous_matches||[]){
     const prior=stageById.get(String(ref.match_id));
     if(prior&&prior!==stage&&stage.col<=prior.col){
      stage.col=prior.col+1;moved=true;
     }
    }
   }
  }
  if(!moved)break;
  if(pass===stages.length*2-1)cycleDetected=true;
 }
 // Bound corrupt/cyclic source data. Connections must always go left to right;
 // unresolved references remain explicitly omitted instead of guessed.
 const maxCol=Math.max(0,...stages.map(x=>x.col));
 const maxWidthCols=Math.max(12,stages.length*2+1);
 if(cycleDetected||maxCol>maxWidthCols){
  for(const lane of lanes)lane.stages.forEach((stage,i)=>{stage.col=i;});
  if(finals)finals.stages.forEach((g,i)=>{g.col=nonFinalMax+1+i;});
 }
 const places=new Map(),cards=[],laneLabels=[];
 let yOffset=0;
 for(const lane of lanes){
  const longest=Math.max(1,...lane.stages.map(g=>g.games.length));
  const laneHeight=Math.max(178,top+longest*step+20);
  laneLabels.push('<div class="lyb-lane-label" style="top:'+(yOffset+3)+'px">'+html(lane.title)+'</div>');
  for(const stage of lane.stages){
   const x=margin+stage.col*(cw+gap);
   const extra=(longest-stage.games.length)*step/2;
   cards.push('<div class="lyb-round-name" data-col="'+stage.col+'" style="left:'+x+'px;top:'+(yOffset+25)+'px;width:'+cw+'px">'+
     html(translate(stage.name))+'</div>');
   for(let i=0;i<stage.games.length;i++){
    const m=stage.games[i],y=yOffset+top+extra+i*step;
    if(m.match_id)places.set(String(m.match_id),{x,y,side:lane.kind,match:m});
    const won=norm(m.winner);
    const renderTeam=(who,score)=>'<div class="lyb-team'+
      (won&&norm(who)===won?' is-winner':'')+'"><span>'+html(team(who))+
      '</span><b>'+num(score)+'</b></div>';
    const detail=m.best_of?'BO'+m.best_of:'';
    const state=m.winner?z('已完赛','Final',lang):z('结果待确认','Result pending',lang);
    cards.push('<article class="lyb-match" role="button" tabindex="0"'+
      (m.match_id?' data-match-id="'+html(m.match_id)+'"':'')+
      ' style="left:'+x+'px;top:'+y+'px;width:'+cw+'px">'+
      '<div class="lyb-match-meta">'+html(detail)+' <span>'+html(state)+'</span></div>'+
      renderTeam(m.home,m.score_home)+renderTeam(m.away,m.score_away)+'</article>');
   }
  }
  yOffset+=laneHeight+24;
 }
 const cols=Math.max(0,...stages.map(x=>x.col));
 const width=(cols+1)*cw+cols*gap+2*margin;
 const height=yOffset+12,paths=[];
 let unresolved=0,backward=0;
 for(const m of all){
  const target=places.get(String(m.match_id||''));
  if(!target)continue;
  for(const p of m.previous_matches||[]){
   const prior=places.get(String(p.match_id));
   if(!prior){unresolved++;continue;}
   if(target.x<=prior.x){backward++;continue;}
   const x1=prior.x+cw,x2=target.x,ym=prior.y+cardH/2,yn=target.y+cardH/2;
   // Route vertical transitions through the card gutter, not through labels.
   const mid=x1+(x2-x1)/2;
   const d='M'+x1+' '+ym+' H'+mid+' V'+yn+' H'+x2;
   paths.push('<path class="lyb-bracket-edge '+(p.type==='loser'?'is-loser':'is-winner')+
      '" data-from="'+html(p.match_id)+'" data-to="'+html(m.match_id)+'" d="'+d+'" />');
  }
 }
 const note=paths.length?
   z('全部连线依据官方上一场比赛 ID；败者路线为虚线。',
     'Paths use official predecessor match IDs; loser routes are dashed.',lang):
   z('暂无可验证的晋级连线，仅展示官方对阵；不会推测晋级结果。',
     'Verified matchups only; no guessed advancement paths.',lang);
 const missing=unresolved+backward;
 const caution=missing?' '+z('有'+missing+'条前序关系未能完整显示。',''+missing+' predecessor links could not be displayed.',lang):'';
 return '<div class="lyb-visual"><div class="lyb-visual-top"><strong>PLAYOFF BRACKET</strong><span>'+
  z('真实淘汰赛对阵','Verified knockout routes',lang)+'</span></div>'+
  '<p class="lyb-bracket-disclaimer">'+html(note+caution)+'</p>'+
  '<div class="lyb-knockout-gesture"><span>'+z('横向滑动查看后续轮次','Swipe to inspect later rounds',lang)+
  '</span><span>‹ &nbsp; ›</span></div>'+
  '<div class="lyb-scroll" tabindex="0" role="region" aria-label="'+
  z('左右滑动查看晋级图','Swipe horizontally to view brackets',lang)+'">'+
  '<div class="lyb-knockout-map lyb-multi-lane'+(mobile?' is-mobile':'')+
  '" style="width:'+width+'px;height:'+height+'px">'+
  '<svg class="lyb-lines" aria-hidden="true" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'">'+
  paths.join('')+'</svg>'+laneLabels.join('')+cards.join('')+'</div></div></div>';
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
  (count?'<div class="lyb-legend">'+(history?'<span><i class="lyb-key-solid"></i>'+z('已确认路线','Confirmed',lang)+'</span>':'')+'<span><i class="lyb-key-dashed"></i>'+z('可能路径','Possible paths',lang)+'</span></div>':'')+
  '</div>';
}
function groups(record,opt={}){
 const lang=opt.lang||'zh',team=opt.team||(v=>v);
 const all=(record.groups||[]).filter(x=>x&&x.team&&Number.isInteger(x.rank));
 const bins=new Map();
 for(const row of all){
  const key=row.group||z('赛段','Stage',lang);
  if(!bins.has(key))bins.set(key,[]);
  bins.get(key).push(row);
 }
 const nameOf=v=>({
  'Legend Group':z('传奇组','Legend Group',lang),
  'Rise Group':z('崛起组','Rise Group',lang),
  'Group Ascend':z('登峰组','Group Ascend',lang),
  'Group Nirvana':z('涅槃组','Group Nirvana',lang)
 })[v]||v;
 const lck=record.phase_family==='lck-2026-round34',lpl=record.phase_family==='lpl-2026-split3';
 const rule=(name,rank)=>{
  if(lck&&name==='Legend Group')return rank<=2?z('季后赛第2轮','Playoff R2',lang):
   rank<=4?z('季后赛第1轮','Playoff R1',lang):z('入围赛','Play-in',lang);
  if(lck&&name==='Rise Group')return rank===1?z('入围赛首轮','Play-in R1',lang):rank<=3?z('入围赛次轮','Play-in R2',lang):z('淘汰','Eliminated',lang);
  if(lpl&&name==='Group Ascend')return rank<=6?z('季后赛','Playoffs',lang):z('骑士之路','Knights Path',lang);
  if(lpl&&name==='Group Nirvana')return rank<=2?z('骑士之路','Knights Path',lang):z('淘汰','Eliminated',lang);
  return '';
 };
 const content=[...bins].map(([name,rows])=>'<section class="lyb-group"><h4>'+html(nameOf(name))+'</h4>'+
  rows.sort((a,b)=>a.rank-b.rank).map(row=>{
   const destination=rule(name,row.rank);
   return '<div class="lyb-group-team"><span><b class="lyb-group-rank">'+num(row.rank)+'</b> '+
    html(team(row.team))+'</span><div class="lyb-group-meta"><strong>'+
    ((Number.isInteger(row.wins)&&Number.isInteger(row.losses))?row.wins+'-'+row.losses:'—')+'</strong>'+
    (destination?'<small>'+html(destination)+'</small>':'')+'</div></div>';
  }).join('')+'</section>').join('');
 const missing=Array.isArray(record.missing_groups)?record.missing_groups:[];
 const notice=missing.length?'<p class="lyb-group-warning">'+
  html(z('以下分组尚无已核验数据：','Missing verified groups: ',lang)+missing.map(nameOf).join(' / '))+'</p>':'';
 const caution=(lck||lpl)?'<p class="lyb-caption">'+
   z('分组箭头描述2026年赛制规定的名次去向，不等于已确认的晋级结果。',
   'Position labels describe the 2026 competition format, not confirmed advancement.',lang)+'</p>':'';
 return '<div class="lyb-visual"><div class="lyb-visual-top"><strong>GROUP STAGE</strong><span>'+
  z('分组积分与晋级通道','Group standings & qualification routes',lang)+'</span></div>'+
  notice+'<div class="lyb-group-flow"><div class="lyb-groups">'+content+'</div>'+
  '<div class="lyb-qualify"><div class="lyb-qualify-mark">↗</div><strong>'+
  z('阶段去向','Stage outcomes',lang)+'</strong><span>'+
  z('按赛制映射 / 等待最终确认','Rules only / results verified separately',lang)+
  '</span></div></div>'+caution+'</div>';
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
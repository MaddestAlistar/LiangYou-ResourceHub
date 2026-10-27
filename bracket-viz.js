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
 [{name:'2-1',index:'R4',wins:2,losses:1},{name:'2-2',index:'R5',wins:2,losses:2},{name:'1-2',index:'R4',wins:1,losses:2}],
 [{name:'ADVANCES',index:'OUT',advanced:true},{name:'ELIMINATED',index:'OUT',eliminated:true}]
];
function swiss(record,opt={}){
 const lang=opt.lang||'zh',team=opt.team||(v=>v),events=Array.isArray(opt.events)?opt.events:[],
  tournamentId=Number(record.tournament_id||String(record.id||'').replace('panda-',''));
 const ranked=(record.groups||[]).filter(r=>r&&r.team&&Number.isInteger(r.wins)&&Number.isInteger(r.losses));
 const slots=swissNodes.map(col=>col.map(node=>({...node,teams:ranked.filter(r=>
  node.advanced?r.wins>=3:node.eliminated?r.losses>=3:r.wins===node.wins&&r.losses===node.losses)})));
 const count=ranked.length;
 const showTeam=t=>'<div class="lyb-pool-team"><span>'+html(team(t.team))+'</span><b>'+
  num(t.wins)+':'+num(t.losses)+'</b></div>';
 const columnNames=[z('起点','Start',lang),z('首轮','Round 2',lang),z('第二轮','Round 3',lang),z('关键轮','Deciding',lang),z('晋级结果','Outcomes',lang)];
 const matches=events.filter(e=>Number(e.tournament_id)===tournamentId&&e.home&&e.away&&
   ['scheduled','live','finished'].includes(e.status))
   .filter((e,i,list)=>list.findIndex(x=>String(x.id).replace(/^(?:stage|panda)-/,'')===String(e.id).replace(/^(?:stage|panda)-/,''))===i)
   .sort((a,b)=>Date.parse(a.start_time)-Date.parse(b.start_time));
 const matchCard=m=>{
   const scored=Number.isInteger(m.score_home)&&Number.isInteger(m.score_away)&&m.status==='finished';
   const title=html(team(m.home))+' <strong>'+(scored?num(m.score_home)+' : '+num(m.score_away):'VS')+'</strong> '+html(team(m.away));
   return '<div class="lyb-round-match">'+title+'</div>';
 };
 const display=slots.map((col,i)=>{
   const games=matches.filter(m=>m.round===i+1).slice(0,12);
   return '<div class="lyb-swiss-column"><h4><small>ROUND '+(i+1)+'</small>'+html(columnNames[i])+'</h4>'+
    col.map(slot=>'<div class="lyb-pool '+(slot.advanced?'is-advanced':slot.eliminated?'is-eliminated':'')+'">'+
     '<header><b>'+html(slot.name)+'</b><small>'+(
       slot.advanced?z('晋级','Qualified',lang):slot.eliminated?z('淘汰','Eliminated',lang):
       z('战绩池','Record pool',lang))+'</small></header>'+
     (slot.teams.length?slot.teams.map(showTeam).join(''):
       '<div class="lyb-pool-empty">—</div>')+'</div>').join('')+
     (games.length?'<div class="lyb-round-results"><strong>'+z('本轮对阵','Round matchups',lang)+'</strong>'+
      games.map(matchCard).join('')+'</div>':'')+'</div>';
 }).join('');
 const loose=matches.filter(m=>!Number.isInteger(m.round)||m.round<1||m.round>5);
 const fixtureList=loose.slice(0,10).map(m=>{
   const done=m.status==='finished',score=done&&Number.isInteger(m.score_home)&&Number.isInteger(m.score_away)?
    num(m.score_home)+' : '+num(m.score_away):'VS';
   const dt=Date.parse(m.start_time);
   const date=Number.isFinite(dt)?new Intl.DateTimeFormat(lang==='en'?'en-US':'zh-CN',{
     timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(dt)):'';
   return '<div class="lyb-fixture"><small>'+html(date)+'</small><span>'+html(team(m.home))+'</span><b>'+score+
    '</b><span>'+html(team(m.away))+'</span></div>';
 }).join('');
 return '<div class="lyb-visual lyb-swiss"><div class="lyb-visual-top"><strong>SWISS STAGE</strong>'+
  '<span>'+z('瑞士轮 · 战绩晋级路线','Swiss · progression by record',lang)+'</span></div>'+
  '<div class="lyb-scroll" tabindex="0" role="region" aria-label="'+z('瑞士轮晋级路线图','Swiss stage progression',lang)+'">'+
  '<div class="lyb-swiss-track">'+display+'</div></div>'+
  (fixtureList?'<section class="lyb-upcoming"><h4>'+z('已采集对阵','Verified matchups',lang)+'</h4><div class="lyb-fixtures">'+fixtureList+'</div></section>':'')+
  (count?'<p class="lyb-caption">'+z('战队仅显示当前已核验战绩；路径为赛制结构，不代表历史晋级轨迹。','Teams show verified current records; pathways illustrate the format, not historical advancement.',lang)+'</p>':'')+
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
window.LiangYouBracketViz={game,stageOf,knockout,swiss,groups};
})();
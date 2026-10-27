/* Personal fixture tracking: local-only preferences and verified calendar export. */
(()=>{
'use strict';
const section=document.getElementById('sports');
const shelf=document.getElementById('sportsPersonal');
const healthBox=document.getElementById('sportsHealth');
if(!section||!shelf)return;
const STORAGE='liangyou-sports-following-v1';
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>{
 const raw=String(v||'').trim();
 // Market matcher understands Latin aliases, while Korean/Japanese names need Unicode fallback.
 return window.LiangYouSportsLinks?.keyName?.(raw)||
  raw.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
};
const allowed=new Set(['lol','esports','basketball','football','chess','go']);
let followed=[];
let followingOnly=false;
let events=[];
const isEn=()=>section.getAttribute('lang')==='en';
function load(){
 try{
  const data=JSON.parse(localStorage.getItem(STORAGE)||'[]');
  if(!Array.isArray(data))return;
  followed=data.filter(x=>x&&allowed.has(x.sport)&&typeof x.name==='string'&&
   x.name.length>0&&x.name.length<130).slice(0,40).map(x=>({sport:x.sport,name:x.name}));
 }catch{}
}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(followed));}catch{}}
function has(sport,name){return followed.some(x=>x.sport===sport&&norm(x.name)===norm(name));}
function followsEvent(x){return x&&has(x.sport,x.home)||x&&has(x.sport,x.away);}
function notify(){if(!followed.length)followingOnly=false;save();render();window.dispatchEvent(new CustomEvent('liangyou:personal-change'));}
function toggle(sport,name){
 if(!allowed.has(sport)||!name||name.length>130)return;
 if(has(sport,name))followed=followed.filter(x=>!(x.sport===sport&&norm(x.name)===norm(name)));
 else if(followed.length<40)followed.push({sport,name});
 notify();
}
const L=()=>isEn()?{
 title:'My fixtures',help:'Follow teams to filter upcoming matches. Saved only in this browser.',
 follow:'Following',mine:'Following',all:'All matches',export:'Export .ics',
 empty:'Tap ☆ beside a team in the match calendar to follow it.',
 none:'No upcoming fixtures for followed teams in the available snapshot.',
 next:'Next followed fixture',notAvailable:'No verified time',removed:'Remove',
 health:'Data source status',verified:'Verified',partial:'Partial',failed:'Unavailable',stale:'Old snapshot',unknown:'Unknown',
 archived:'Data is a periodic snapshot, not live scores.',exportEmpty:'There are no dated upcoming matches to export.'
}:{
 title:'我的赛事',help:'关注喜欢的球队和战队，一键筛选未来赛程。收藏只保存在当前浏览器。',
 follow:'已关注',mine:'只看关注',all:'全部赛事',export:'导出日历 .ics',
 empty:'在赛事日历中点击队伍旁的 ☆ 即可关注。',
 none:'当前数据快照暂无关注队伍的未来赛事。',
 next:'下一场关注赛事',notAvailable:'时间未核验',removed:'取消关注',
 health:'数据源状态',verified:'已核验',partial:'部分缺失',failed:'不可用',stale:'历史快照',unknown:'状态未知',
 archived:'数据为定时采集快照，不代表实时比分。',exportEmpty:'当前没有可导出的已确认开赛时间赛事。'
};
function dateLabel(iso){
 try{return new Intl.DateTimeFormat(isEn()?'en-US':'zh-CN',{
 timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false
 }).format(new Date(iso));}catch{return L().notAvailable;}
}
function render(){
 const t=L(),upcoming=events.filter(x=>x.status==='scheduled'&&Date.parse(x.start_time)>Date.now()&&followsEvent(x))
 .sort((a,b)=>Date.parse(a.start_time)-Date.parse(b.start_time));
 const first=upcoming[0];
 const now=Date.now();
 const canExport=upcoming.some(x=>x.time_precision!=='date'&&Date.parse(x.start_time)<now+45*86400000);
 shelf.innerHTML='<div class="sports-personal-title"><div><strong>★ '+t.title+'</strong>'+
  '<p>'+t.help+'</p></div><span class="sports-personal-count">'+t.follow+' '+followed.length+'</span></div>'+
  (followed.length?'<div class="sports-personal-actions"><button type="button" data-personal-action="mine" aria-pressed="'+followingOnly+'">'+t.mine+'</button>'+
  '<button type="button" data-personal-action="all" aria-pressed="'+(!followingOnly)+'">'+t.all+'</button>'+
  '<button type="button" data-personal-action="export"'+(!canExport?' disabled':'')+'>'+t.export+'</button></div>':'')+
  (followed.length?'<div class="sports-personal-tags">'+followed.map(x=>
   '<button type="button" data-follow-team="'+safe(x.name)+'" data-follow-sport="'+safe(x.sport)+'" aria-label="'+
   safe(t.removed+': '+x.name)+'">'+safe(x.name)+' <span aria-hidden="true">×</span></button>').join('')+'</div>':
   '<p class="sports-personal-empty">'+t.empty+'</p>')+
  (followed.length?'<p class="sports-personal-next">'+(first?
   '<strong>'+t.next+'：</strong>'+safe(first.home)+' · '+safe(first.away)+' <span>'+safe(first.time_precision==='date'?(first.display_date||String(first.start_time||'').slice(0,10))+' · '+t.notAvailable:dateLabel(first.start_time))+'</span>':
   t.none)+'</p>':'');
}
function fold(text){return String(text||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n')
 .replace(/,/g,'\\,').replace(/;/g,'\\;');}
function icsTime(s){return new Date(s).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
function exportCalendar(){
 const now=Date.now();
 const list=events.filter(x=>x.status==='scheduled'&&Date.parse(x.start_time)>now&&
  Date.parse(x.start_time)<now+45*86400000&&followsEvent(x)&&x.time_precision!=='date')
  .sort((a,b)=>Date.parse(a.start_time)-Date.parse(b.start_time)).slice(0,150);
 if(!list.length){window.alert(L().exportEmpty);return;}
 const stamp=icsTime(new Date().toISOString());
 const entries=list.map(x=>{
  const dt=new Date(x.start_time).getTime();
  const start=icsTime(x.start_time);
  const end=icsTime(new Date(dt+2*3600000).toISOString());
  const name=fold((x.league||'赛事')+': '+x.home+' vs '+x.away);
  return ['BEGIN:VEVENT','UID:'+fold(String(x.provider||'fixture')+'-'+String(x.id))+'@liangyou-sports',
    'DTSTAMP:'+stamp,'DTSTART:'+start,'DTEND:'+end,'SUMMARY:'+name,
    'DESCRIPTION:'+fold('来源: '+String(x.provider||'')+'。预计时长2小时，仅为日历占位，不代表真实结束时间。'),
    'END:VEVENT'].join('\r\n');
 });
 const contents=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//LiangYou//Sports Calendar//ZH',
  'CALSCALE:GREGORIAN','X-WR-CALNAME:LiangYou Sports',...entries,'END:VCALENDAR'].join('\r\n')+'\r\n';
 const blob=new Blob([contents],{type:'text/calendar;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const anchor=document.createElement('a');anchor.href=url;anchor.download='LiangYou-following.ics';
 document.body.append(anchor);anchor.click();anchor.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),30000);
}
// The same local update-status.json used by the page's scheduled collector.
// Health is diagnostic metadata; it never acts as a source of scores.
let latestSources=[],latestGenerated='',jobs=null;
const jobNames={
 sports:['Polymarket','Polymarket'],predict:['Predict.fun','Predict.fun'],kalshi:['Kalshi','Kalshi'],
 fixtures:['赛事主数据','Official fixtures'],extras:['足球与排名','Football & standings'],
 board:['国际象棋 / 围棋','Chess & Go'],nba:['NBA','NBA'],odds:['The Odds API','The Odds API'],
 chess_profiles:['棋手资料','Chess profiles']
};
function updateHealth(sources,generated){
 if(!healthBox)return;
 if(Array.isArray(sources)){latestSources=sources;latestGenerated=generated||'';}
 const t=L(),unique=new Map();
 for(const x of latestSources){
  if(x?.tag&&(!unique.has(x.tag)||unique.get(x.tag).status==='ok'&&x.status!=='ok'))
   unique.set(x.tag,x);
 }
 const age=Date.parse(latestGenerated);
 const old=Number.isFinite(age)&&Date.now()-age>18*3600000;
 const sourceProblems=[...unique.values()].filter(x=>x.status!=='ok');
 const rawJobs=jobs?.jobs&&typeof jobs.jobs==='object'?Object.entries(jobs.jobs)
  .filter(([id])=>Object.hasOwn(jobNames,id)):[];
 const jobRows=rawJobs.map(([id,entry])=>{
  const last=Date.parse(entry.last_success_at||'');
  const frequency=Number(entry.interval_hours)||6;
  const delayed=!Number.isFinite(last)||Date.now()-last>(frequency*2+1)*3600000;
  const bad=entry.status!=='ok';
  return {name:jobNames[id][isEn()?1:0],last,delayed,bad};
 });
 const issues=old||sourceProblems.length>0||jobRows.some(x=>x.bad||x.delayed);
 const main=!(unique.size||jobRows.length)?t.unknown:issues?t.partial:t.verified;
 const status=x=>x==='ok'?t.verified:x==='partial'?t.partial:
  x==='failed'||x==='unavailable'?t.failed:x==='stale'?t.stale:t.unknown;
 const labelAt=timestamp=>{
  if(!Number.isFinite(timestamp))return '—';
  try{return new Intl.DateTimeFormat(isEn()?'en-US':'zh-CN',{
   timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',
   hour:'2-digit',minute:'2-digit',hour12:false
  }).format(new Date(timestamp));}catch{return '—';}
 };
 healthBox.innerHTML='<details><summary><span>◈ '+t.health+'</span><span>'+
   safe(main)+' · '+unique.size+'</span></summary>'+
   (unique.size?'<div class="sports-health-list">'+[...unique.values()].map(x=>{
    const extra=Number.isInteger(x.failed_groups)&&x.failed_groups>0?
     (isEn()?' · missing groups ':' · 缺失数据组 ')+x.failed_groups:'';
    return '<div><strong>'+safe(x.tag)+'</strong><span>'+safe(status(x.status)+extra)+'</span></div>';
   }).join('')+'</div>':'')+
   (jobRows.length?'<p class="sports-health-subtitle">'+
    (isEn()?'Scheduled collection · last successful update (UTC+8)':'定时采集 · 最近成功更新时间（北京时间）')+'</p>'+
    '<div class="sports-health-list">'+jobRows.map(x=>'<div><strong>'+safe(x.name)+'</strong><span>'+
     safe(x.bad?t.failed:x.delayed?t.stale:labelAt(x.last))+'</span></div>').join('')+'</div>':'')+
   '<p>'+safe(t.archived)+'</p></details>';
}
async function refreshJobHealth(){
 if(typeof fetch!=='function')return;
 try{
  const response=await fetch('./data/update-status.json',{cache:'no-cache',signal:AbortSignal.timeout(12000)});
  if(!response.ok) return;
  const data=await response.json();
  if(data?.schema!==1||!data.jobs||typeof data.jobs!=='object')return;
  jobs=data;updateHealth();
 }catch{}
}
load();
shelf.addEventListener('click',ev=>{
 const follow=ev.target.closest('[data-follow-team]');
 if(follow){toggle(follow.dataset.followSport,follow.dataset.followTeam);return;}
 const action=ev.target.closest('[data-personal-action]')?.dataset.personalAction;
 if(action==='export'){exportCalendar();return;}
 if(action==='mine'||action==='all'){
  followingOnly=action==='mine';render();
  window.dispatchEvent(new CustomEvent('liangyou:personal-change',{detail:{view:'calendar'}}));
 }
});
document.getElementById('officialFixturesGrid')?.addEventListener('click',ev=>{
 const button=ev.target.closest('[data-follow-team]');
 if(!button)return;
 ev.preventDefault();ev.stopPropagation();
 toggle(button.dataset.followSport,button.dataset.followTeam);
});
window.addEventListener('liangyou:fixtures-updated',()=>{
 events=window.LiangYouOfficialSportsEvents||[];
 render();
});
window.addEventListener('liangyou:sports-health',event=>{
 updateHealth(event.detail?.sources,event.detail?.generated_at);
});
section.querySelectorAll('#sportsLanguage [data-sports-lang]').forEach(button=>
 button.addEventListener('click',()=>window.setTimeout(()=>{render();updateHealth();},0)));
refreshJobHealth();
if(typeof window.setInterval==='function')window.setInterval(()=>{
 if(!document.hidden)refreshJobHealth();
},30*60000);
window.LiangYouSportsPersonal=Object.freeze({has, followsEvent, followingOnly:()=>followingOnly,
 toggle,refresh:render,updateHealth});
render();
})();
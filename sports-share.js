/* Verified sports sharing card. Fully local drawing; no outside images or market-as-results. */
(()=>{
'use strict';
const dialog=document.getElementById('sportsShareDialog');
const preview=document.getElementById('sportsSharePreview');
const panel=document.getElementById('sports');
if(!dialog||!preview||!panel)return;
const saveBtn=dialog.querySelector('[data-share-save]');
const nativeBtn=dialog.querySelector('[data-share-native]');
const closeBtn=dialog.querySelector('[data-share-close]');
let fileBlob=null;
let imageData='';
let currentName='LiangYou-Sports.png';
const english=()=>panel.getAttribute('lang')==='en';
const safeValue=v=>String(v??'').trim();
const tr=()=>window.LiangYouSportsI18n;
const board=()=>window.LiangYouBoardI18n;
function label(v,sport,which,fixture){
 const raw=safeValue(v);
 if(english())return raw;
 if(sport==='chess'||sport==='go')return board()?.player?.(
  raw,sport,'zh',fixture?.[which+'_zh'])||fixture?.[which+'_zh']||raw;
 return tr()?.team?.(raw,sport,'zh')||raw;
}
function league(v,sport){
 const raw=safeValue(v)||'SPORTS';
 if(english())return raw;
 if(sport==='chess'||sport==='go')return board()?.league?.(raw,sport,'zh')||raw;
 return tr()?.league?.(raw,sport,'zh')||raw;
}
function source(v){
 const p={pandascore:'PandaScore',balldontlie:'BALLDONTLIE',
  'football-data':'football-data.org',lichess:'Lichess',baduk:'韩国棋院',
  nihonkiin:'日本棋院','weiqi-association':'中国围棋协会'};
 return p[v]||safeValue(v)||'公开赛事来源';
}
function rounded(ctx,x,y,w,h,r,fill,stroke){
 ctx.beginPath();ctx.roundRect(x,y,w,h,r);
 if(fill){ctx.fillStyle=fill;ctx.fill();}
 if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}
}
function fit(ctx,value,maxW,initial=58,min=36){
 const text=safeValue(value)||'—';
 let size=initial;
 while(size>min){
  ctx.font='700 '+size+'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  if(ctx.measureText(text).width<=maxW)break;
  size-=2;
 }
 ctx.font='700 '+size+'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
 if(ctx.measureText(text).width<=maxW)return text;
 let cut=text;while(cut.length>1&&ctx.measureText(cut+'…').width>maxW)cut=cut.slice(0,-1);
 return cut+'…';
}
function drawCard(fixture){
 const c=document.createElement('canvas');c.width=1080;c.height=1440;
 const ctx=c.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
 const zh=!english();const completed=fixture.status==='finished';
 const scoreOk=completed&&Number.isFinite(fixture.score_home)&&Number.isFinite(fixture.score_away)
  &&fixture.sport!=='go';
 const stamp=Date.parse(fixture.start_time);
 let dateText=zh?'赛程时间待确认':'Match time unverified';
 if(fixture.time_precision==='date'){
  dateText=safeValue(fixture.display_date||fixture.start_time?.slice(0,10))+
    (zh?' · 具体时间待确认':' · kickoff unverified');
 }else if(Number.isFinite(stamp)){
  dateText=new Intl.DateTimeFormat(zh?'zh-CN':'en-GB',{
   timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',
   hour:'2-digit',minute:'2-digit',hour12:false
  }).format(new Date(stamp))+(zh?' 北京时间':' UTC+8');
 }
 const bg=ctx.createLinearGradient(0,0,1080,1440);
 bg.addColorStop(0,'#18253b');bg.addColorStop(.52,'#0a1326');bg.addColorStop(1,'#070c17');
 ctx.fillStyle=bg;ctx.fillRect(0,0,1080,1440);
 const halo=ctx.createRadialGradient(830,220,10,830,220,610);
 halo.addColorStop(0,'rgba(194,142,71,.18)');halo.addColorStop(1,'rgba(194,142,71,0)');
 ctx.fillStyle=halo;ctx.fillRect(0,0,1080,900);
 ctx.strokeStyle='rgba(211,169,102,.12)';ctx.lineWidth=1;
 for(let x=50;x<1100;x+=55){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x-150,1440);ctx.stroke();}
 rounded(ctx,46,44,988,1352,38,'rgba(9,18,34,.35)','rgba(223,178,105,.42)');
 rounded(ctx,96,102,115,8,4,'#dfb777');
 ctx.fillStyle='#f4e0b5';ctx.font='800 40px system-ui,sans-serif';
 ctx.textAlign='left';ctx.fillText('LIANGYOU',96,177);
 ctx.fillStyle='#a8b7ca';ctx.font='600 27px system-ui,sans-serif';
 ctx.fillText('MATCH INTELLIGENCE',96,222);
 const kind=fixture.sport==='lol'?'LOL':fixture.sport==='basketball'?'NBA / BASKETBALL':
  fixture.sport==='football'?'FOOTBALL':fixture.sport==='go'?'GO':
  fixture.sport==='chess'?'CHESS':'ESPORTS';
 ctx.textAlign='right';ctx.fillStyle='#bfa881';ctx.font='600 29px system-ui,sans-serif';
 ctx.fillText(kind,977,186);
 rounded(ctx,96,267,888,103,17,'rgba(215,176,110,.09)','rgba(213,172,104,.27)');
 ctx.textAlign='center';ctx.fillStyle='#e7d0a6';
 ctx.font='600 33px "PingFang SC",system-ui,sans-serif';
 const headline=fit(ctx,league(fixture.league,fixture.sport),790,37,27);
 ctx.fillText(headline,540,332);
 const home=label(fixture.home,fixture.sport,'home',fixture);
 const away=label(fixture.away,fixture.sport,'away',fixture);
 ctx.textAlign='center';
 ctx.fillStyle='#edf3f9';
 ctx.fillText(fit(ctx,home,820,76,40),540,535);
 ctx.fillStyle='#90a6bd';ctx.font='700 38px system-ui,sans-serif';
 ctx.fillText('VS',540,695);
 ctx.fillStyle='#edf3f9';
 ctx.fillText(fit(ctx,away,820,76,40),540,856);
 if(scoreOk){
  rounded(ctx,330,939,420,117,22,'rgba(228,184,109,.13)','rgba(225,186,118,.42)');
  ctx.font='800 68px system-ui,sans-serif';ctx.fillStyle='#f0ce93';
  ctx.fillText(String(fixture.score_home)+'  :  '+String(fixture.score_away),540,1019);
 }else{
  rounded(ctx,278,939,524,105,22,'rgba(37,66,96,.49)','rgba(120,158,190,.23)');
  ctx.font='700 39px "PingFang SC",system-ui,sans-serif';ctx.fillStyle='#d6e2f0';
  const st=completed?(zh?'已完赛 · 赛果以来源为准':'Finished · verify at source'):
   fixture.status==='live'?(zh?'进行中 · 非实时快照':'In progress · delayed snapshot'):
   (zh?'即将开始':'Upcoming');
  ctx.fillText(st,540,1005);
 }
 ctx.fillStyle='#c7d5e4';ctx.font='600 34px "PingFang SC",system-ui,sans-serif';
 ctx.fillText(fit(ctx,dateText,850,34,26),540,1149);
 ctx.strokeStyle='rgba(203,171,116,.32)';ctx.beginPath();
 ctx.moveTo(98,1205);ctx.lineTo(984,1205);ctx.stroke();
 ctx.fillStyle='#a9bbcb';ctx.font='500 26px "PingFang SC",system-ui,sans-serif';
 ctx.fillText((zh?'数据来源：':'Source: ')+source(fixture.provider),540,1262);
 ctx.fillStyle='#cbac78';ctx.font='700 27px "PingFang SC",system-ui,sans-serif';
 ctx.fillText('@良哥看未来',540,1311);
 ctx.fillStyle='#8093a8';ctx.font='400 22px system-ui,sans-serif';
 ctx.fillText('maddestalistar.github.io/LiangYou-ResourceHub',540,1354);
 return c;
}
async function openShare(id){
 const fixture=(window.LiangYouOfficialSportsEvents||[]).find(x=>String(x.id)===String(id));
 if(!fixture)return;
 try{
  const canvas=drawCard(fixture);
  imageData=canvas.toDataURL('image/png');
  preview.src=imageData;
  preview.alt=(english()?'Sports share card: ':'赛事分享卡：')+
    safeValue(fixture.home)+' vs '+safeValue(fixture.away);
  fileBlob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  currentName='LiangYou-Match-'+String(fixture.id).replace(/[^\w-]/g,'').slice(0,45)+'.png';
  nativeBtn.hidden=!(fileBlob&&typeof navigator!=='undefined'&&
   typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&
   typeof File==='function'&&
   navigator.canShare({files:[new File([fileBlob],currentName,{type:'image/png'})]}));
  dialog.querySelector('[data-share-title]').textContent=english()?'Match share card':'赛事分享卡';
  saveBtn.textContent=english()?'Save PNG':'保存 PNG';
  closeBtn.textContent=english()?'Close':'关闭';
  nativeBtn.textContent=english()?'Share':'系统分享';
  if(typeof dialog.showModal==='function'){if(!dialog.open)dialog.showModal();}
  else dialog.setAttribute('open','');
 }catch(error){console.warn('Sports card unavailable',error);}
}
panel.addEventListener('click',ev=>{
 const action=ev.target.closest?.('[data-fixture-share]');
 if(action){ev.preventDefault();openShare(action.dataset.fixtureShare);}
});
closeBtn.addEventListener('click',()=>{
 if(dialog.close)dialog.close();else dialog.removeAttribute('open');
});
saveBtn.addEventListener('click',()=>{
 if(!imageData)return;
 const a=document.createElement('a');a.download=currentName;a.href=imageData;
 document.body.append(a);a.click();a.remove();
});
nativeBtn.addEventListener('click',async()=>{
 if(!fileBlob||!navigator?.share||!window.File)return;
 const file=new File([fileBlob],currentName,{type:'image/png'});
 if(navigator.canShare?.({files:[file]})){
  try{await navigator.share({files:[file],title:'LiangYou Sports'});}catch(e){
   if(e?.name!=='AbortError')console.warn('Share failed',e);
  }
 }
});
})();

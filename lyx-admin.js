/* LYX CMS in original icon/news/wiki admin, reusing the single #key Cloudflare ADMIN_KEY. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),root=$('lyx-admin');if(!root)return;
 const ENDPOINT='https://liangyou-icon-review.maddestalistar.workers.dev/lyx-admin';
 const AXES=['功能丰富度','使用便捷性','稳定与流畅','系统融合度','设备适配性','隐私与安全'],WEIGHTS=[.30,.20,.20,.10,.10,.10];
 let items=[],editing=null,currentIcon='',originalIcon='',busy=false,loading=false;
 const field=id=>$('lyx-'+id),val=id=>field(id).value.trim();
 const initialIcon='assets/lyx/shangdaoji.svg';
 const empty=()=>({id:'',name:'',category:'',subtitle:'',version:'',platform:'iOS',tagline:'',summary:'',tags:[],scores:[80,80,80,80,80,80],review:'',icon:initialIcon,status:'draft',order:items.length+1});
 const safeIcon=url=>typeof url==='string'&&(/^(assets\/lyx\/[a-z0-9._\/-]+\.(svg|png|webp))$/i.test(url)||/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(url))?url:initialIcon;
 function status(s,err=false){$('lyx-status').textContent=s;$('lyx-status').className='muted '+(err?'lyx-error':'')}
 function adminKey(){const k=$('key').value;if(k.length<24)throw Error('请先在上方输入原来的管理员密钥，再点击「进入后台 / 刷新」');return k}
 async function request(body){
  const opt={method:body?'POST':'GET',headers:{'X-Admin-Key':adminKey(),...(body?{'Content-Type':'application/json'}:{})},cache:'no-store',signal:AbortSignal.timeout(30000)};
  if(body)opt.body=JSON.stringify(body);
  const r=await fetch(ENDPOINT,opt);let d;try{d=await r.json()}catch{throw Error('后台未返回有效 JSON')};
  if(!r.ok||!d.ok)throw Error(d.error||'读取失败（HTTP '+r.status+'）');
  return d;
 }
 const scoreNode=$('lyx-scores');
 scoreNode.innerHTML=AXES.map((name,i)=>'<label class="lyx-score-field">'+name+' <small>权重 '+Math.round(WEIGHTS[i]*100)+'%</small><input id="lyx-s'+i+'" type="number" required min="0" max="100" step="0.1" value="80"></label>').join('');
 function scores(){return AXES.map((_,i)=>{const el=$('lyx-s'+i),n=Number(el.value);if(el.value.trim()===''||!Number.isFinite(n)||n<0||n>100)throw Error('六维评分需填写 0–100');return n})}
 function calc(sc){return sc.reduce((n,x,i)=>n+x*WEIGHTS[i],0)}
 function rank(s){return s>=90?'旗舰推荐':s>=85?'优选推荐':s>=80?'值得尝试':s>=70?'可以尝试':'暂不推荐'}
 function updateScore(){try{const total=calc(scores());$('lyx-total').textContent=total.toFixed(1)+' / 100';$('lyx-rank').textContent=rank(total)}catch{$('lyx-total').textContent='—';$('lyx-rank').textContent='请完整填写六项分数'}}
 scoreNode.addEventListener('input',updateScore);
 function render(){
  const wrap=$('lyx-records');wrap.replaceChildren();
  if(!items.length){const p=document.createElement('p');p.className='muted';p.textContent='暂无记录。点击「新增评测」开始。';wrap.append(p);return}
  items.slice().sort((a,b)=>(a.order??999)-(b.order??999)).forEach(x=>{
   const b=document.createElement('button');b.type='button';b.className='lyx-record'+(editing?.id===x.id?' selected':'');
   const img=document.createElement('img');img.src=x.icon?.startsWith('data:')?x.icon:'./'+safeIcon(x.icon);img.alt='';
   const info=document.createElement('span');const title=document.createElement('strong');title.textContent=x.name;const sub=document.createElement('small');sub.textContent=calc(x.scores).toFixed(1)+' 分 · '+(x.status==='published'?'已发布':'草稿');info.append(title,sub);b.append(img,info);b.onclick=()=>select(x);wrap.append(b);
  });
 }
 function put(r){
  editing=r&&r.updatedAt?r:null;
  const item=r||empty();
  for(const key of ['id','name','category','subtitle','version','platform','tagline','summary','review','order'])field(key).value=item[key]??'';
  field('id').readOnly=!!editing;
  field('tags').value=(item.tags||[]).join('，');
  AXES.forEach((_,i)=>{$('lyx-s'+i).value=item.scores?.[i]??80});
  currentIcon=safeIcon(item.icon);originalIcon=currentIcon;
  const im=$('lyx-icon-preview');im.src=currentIcon.startsWith('data:')?currentIcon:'./'+currentIcon;
  field('icon-file').value='';
  $('lyx-edit-label').textContent=editing?'编辑：'+item.name:'新增应用评测';
  $('lyx-form').hidden=false;
  field('unpublish').disabled=!editing||item.status!=='published';
  $('lyx-preview').hidden=true;
  render();updateScore();
 }
 function select(r){put(r);root.scrollIntoView({behavior:'smooth',block:'start'})}
 async function load(){
  if(loading||!$('key').value)return;
  loading=true;status('正在载入 LYX 评测资料…');
  try{const d=await request();items=d.reviews||[];render();status('已载入 '+items.length+' 份评测。可以直接编辑已发布内容或新增应用。');if(editing){const current=items.find(x=>x.id===editing.id);if(current)put(current);else put(null)}else if(items.length)put(items[0]);else put(null)}
  catch(e){status('LYX 资料读取失败：'+e.message,true)}
  finally{loading=false}
 }
 $('lyx-refresh').onclick=load;$('load').addEventListener('click',()=>{if($('key').value.length>=24)load()});
 $('lyx-new').onclick=()=>{put(null);root.scrollIntoView({behavior:'smooth',block:'start'});field('name').focus()};
 $('lyx-reset-icon').onclick=()=>{currentIcon=originalIcon;$('lyx-icon-preview').src=currentIcon.startsWith('data:')?currentIcon:'./'+currentIcon;field('icon-file').value='';status('本次图标修改已恢复。')};
 field('icon-file').addEventListener('change',async()=>{
  const file=field('icon-file').files?.[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>6_000_000){status('请上传不超过 6 MB 的 PNG、JPG 或 WebP 图标',true);field('icon-file').value='';return}
  const url=URL.createObjectURL(file),im=new Image();
  try{im.src=url;await im.decode();const side=256,canvas=document.createElement('canvas');canvas.width=side;canvas.height=side;const cx=canvas.getContext('2d');cx.clearRect(0,0,side,side);cx.drawImage(im,0,0,side,side);
   let output='';
   for(const quality of [.84,.67,.50,.35]){const d=canvas.toDataURL('image/webp',quality);if(d.length<145000){output=d;break}}
   if(!output)throw Error('图标压缩后仍过大，请换一张更简单的图片');
   currentIcon=output;$('lyx-icon-preview').src=output;status('图标已准备好，点击保存或发布后生效。')}
  catch(e){status('图标处理失败：'+e.message,true);field('icon-file').value=''}finally{URL.revokeObjectURL(url)}
 });
 function collect(publish){
  if(!$('lyx-form').reportValidity())throw Error('请完整填写必填项');
  let id=val('id');if(!/^[a-z0-9-]{1,80}$/.test(id))throw Error('应用 ID 只能使用小写字母、数字和连字符');
  const old=editing,sc=scores(),now=new Date().toISOString();
  return {id,name:val('name'),category:val('category'),subtitle:val('subtitle'),version:val('version'),platform:val('platform'),tagline:val('tagline'),summary:val('summary'),tags:val('tags').split(/[,，]/).map(s=>s.trim()).filter(Boolean).slice(0,10),scores:sc,review:val('review'),icon:currentIcon,order:Number(val('order'))||1,status:publish?'published':old?.status||'draft',updatedAt:now};
 }
 async function save(publish,unpublish=false){
  if(busy)return;let item;
  try{item=collect(publish);if(unpublish)item.status='draft'}catch(e){status(e.message,true);return}
  busy=true;const buttons=[field('publish'),field('save'),field('unpublish'),$('lyx-new')];buttons.forEach(b=>b.disabled=true);
  status((publish?'正在发布':'正在保存')+'「'+item.name+'」…');
  try{
   const d=await request({action:editing?'update':'create',...(editing?{expectedUpdatedAt:editing.updatedAt}:{}),item});
   items=d.reviews||[];const saved=items.find(x=>x.id===item.id)||d.item;put(saved);
   status('「'+item.name+'」已'+(item.status==='published'?'发布/更新':'保存为草稿')+'，前台数据将自动刷新，国内镜像可能稍有延迟。');
  }catch(e){status('保存失败：'+e.message,true)}
  finally{busy=false;buttons.forEach(b=>b.disabled=false);field('unpublish').disabled=!editing||editing.status!=='published'}
 }
 $('lyx-form').addEventListener('submit',e=>{e.preventDefault();save(false)});
 field('publish').onclick=()=>save(true);
 field('unpublish').onclick=()=>{if(confirm('确定要取消发布这份评测？数据会保留成草稿。'))save(false,true)};
 field('preview-btn').onclick=()=>{try{const r=collect(false),sc=calc(r.scores);const box=$('lyx-preview');box.replaceChildren();const head=document.createElement('h3');head.textContent=r.name+' · '+sc.toFixed(1)+' 分 · '+rank(sc);const intro=document.createElement('p');intro.textContent=r.summary;const review=document.createElement('p');review.textContent=r.review;box.append(head,intro,review);box.hidden=false;box.scrollIntoView({behavior:'smooth',block:'nearest'})}catch(e){status(e.message,true)}};
 render();
})();
import {NATURES,CONTENTS,QUALITIES,STATES,ROLES,COUNT_FIELDS,chinaDate,publicURL} from './emby-wiki-schema.mjs';
export const ROOT='https://liangyou-icon-review.maddestalistar.workers.dev';
export function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
export async function api(path,options={}){const r=await fetch(ROOT+path,{...options,signal:AbortSignal.timeout(60000),cache:'no-store'});let data;try{data=await r.json()}catch{throw Error('服务暂时不可用，请稍后重试')}if(!r.ok||!data.ok)throw Error(data.error||'请求失败');return data}
export function buildForm(host,prefix='wiki'){
 const input=(name,label,{type='text',max=100,required=false,help='',placeholder=''}={})=>`<label class="wk-field" for="${prefix}-${name}"><span>${label} <small class="${required?'wk-required':''}">${required?'必填':'选填'}</small></span><input id="${prefix}-${name}" name="${name}" type="${type}" ${required?'required':''} ${type==='number'?'min="0" max="100000000" step="1" inputmode="numeric"':`maxlength="${max}"`} ${type==='date'?`min="2000-01-01" max="${chinaDate()}"`:''} placeholder="${placeholder}">${help?'<small>'+help+'</small>':''}</label>`;
 const area=(name,label,max,required=false,help='')=>`<label class="wk-field"><span>${label} <small class="${required?'wk-required':''}">${required?'必填':'选填'}</small></span><textarea name="${name}" maxlength="${max}" rows="3" ${required?'required':''}></textarea>${help?'<small>'+help+'</small>':''}</label>`;
 const select=(name,label,choices,required=false)=>`<label class="wk-field"><span>${label} <small class="${required?'wk-required':''}">${required?'必填':'选填'}</small></span><select name="${name}" ${required?'required':''}><option value="">请选择${required?'':'（可留空）'}</option>${choices.map(x=>`<option>${x}</option>`).join('')}</select></label>`;
 const chips=(name,label,choices,required=false)=>`<fieldset class="wk-choices"><legend>${label} <small class="${required?'wk-required':''}">${required?'必选，可多选':'选填，可多选'}</small></legend><div class="wk-chips">${choices.map(x=>`<label><input type="checkbox" name="${name}" value="${x}"><span>${x}</span></label>`).join('')}</div></fieldset>`;
 function wikiStatsSection(prefix){
 const values=[['movies','moviesWithVersions','电影','部',false],['series','seriesWithVersions','剧集','部',false],['episodes','episodesWithVersions','集数','集',false]];
 const cell=(name,label,required)=>`<label class="wk-stat-cell"><span class="wk-sr-only">${label}${required?'（必填）':'（选填）'}</span><input id="${prefix}-${name}" name="${name}" type="number" inputmode="numeric" min="0" max="100000000" step="1" placeholder="${label.startsWith('集数')?'选填':'填写数量'}" aria-label="${label}"></label>`;
 const rows=values.map(([plain,multi,label,unit,required])=>`<div class="wk-count-row"><div class="wk-count-label"><strong>${label}</strong><small>${unit}</small></div>${cell(plain,label+'（不含多版本）',required)}${cell(multi,label+'（包含多版本）',false)}</div>`).join('');
 const photo=prefix==='wiki'?`<div class="wk-evidence-picker"><label for="wiki-evidence-file" class="wk-evidence-label">统计凭证截图 <small>选填</small></label><input id="wiki-evidence-file" type="file" accept="image/jpeg,image/png,image/webp"><small class="wk-hint">可上传 JPG / PNG / WebP，单张原图不超过 5 MB。上传后压缩为图片保存，审核人员可查看；也可以同时提供链接。请遮挡账号等私密内容。</small><img id="wiki-evidence-preview" class="wk-upload-preview" alt="统计凭证预览" hidden><button id="wiki-evidence-remove" type="button" class="wk-quiet" hidden>移除凭证图片</button><p id="wiki-evidence-message" class="wk-hint" role="status"></p></div>`:'';
 return `<section class="wk-form-section"><h2><span>02</span> 媒体库统计</h2><p class="wk-hint">参照 Emby 统计填写。电影、剧集按部，集数按集。两种统计口径任选一种：至少完整填写其中一列的电影和剧集数量，另一列可留空；集数选填。没有该类别填 0，未知请留空。</p><div class="wk-count-table" role="group" aria-label="Emby 媒体库统计"><div class="wk-count-head"><span>媒体类型</span><span>不含多版本</span><span>包含多版本</span></div>${rows}</div><p class="wk-count-status" aria-live="polite">请选择一种统计口径，并填写该列电影和剧集的数量</p>${input('others','其他媒体（项）',{type:'number'})}<div class="wk-date-single">${input('statsDate','统计日期',{type:'date',required:true})}</div>${area('statsNote','统计口径说明',300,false,'例如：统计是否包含动漫、短剧，以及多版本的计算方式。')}${photo}${input('evidence','统计凭证链接',{max:500,placeholder:'可选：公开统计截图或公告的 HTTPS 链接'})}</section>`;
}
 host.innerHTML=`<section class="wk-form-section"><h2><span>01</span> 服务器资料</h2>${input('name','服务器名称',{max:60,required:true,placeholder:'填写播放器中显示的名称'})}<div class="wk-cols">${select('nature','服务器性质',NATURES,true)}${select('state','运营状态',STATES,true)}</div>${chips('contents','资源内容',CONTENTS,true)}${input('extraContent','其他资源内容',{max:100})}${chips('qualities','画质与规格',QUALITIES)}${input('extraQuality','画质补充',{max:100})}</section>
 ${wikiStatsSection(prefix)}
 <section class="wk-form-section"><h2><span>03</span> 开号与使用</h2>${area('registration','开号条件',500,true,'说明如何获取账号、目前是否开放。可点击下面的常用方式后补充。')}<div class="wk-shortcuts">${['开放注册','活动','抽奖','付费','签到开号','邀请','暂不开注'].map(x=>`<button type="button" class="wk-quiet" data-add="${x}">${x}</button>`).join('')}</div>${area('retention','保号规则',500,false,'留空显示“未提供”，不等同于无需保号。')}${input('pricing','费用说明',{max:200,placeholder:'例如月费、年费或公益免费；请注明币种'})}${area('network','线路与访问说明',300,false,'例如：直连情况、运营商差异、是否需要代理。')}</section>
 <section class="wk-form-section"><h2><span>04</span> 公开入口与简介</h2><p class="wk-hint">以下四种入口至少填写一个。仅填写官方网站或公开社区入口，不填写服务器登录地址、账号、密码或 API Key。</p>${input('website','官方网站',{max:500,placeholder:'https://…'})}<div class="wk-cols">${input('channel','Telegram 频道',{max:500,placeholder:'@用户名 或 https://t.me/…'})}${input('group','Telegram 群组',{max:500,placeholder:'@用户名 或邀请链接'})}</div>${input('bot','Telegram 机器人',{max:500,placeholder:'@用户名 或 https://t.me/…'})}${area('summary','服务器简介',600,false,'简要介绍资源特色、更新情况等，避免夸大。')}</section>
 <section class="wk-form-section"><h2><span>05</span> 投稿信息</h2><div class="wk-cols wk-submission-cols">${input('nickname','投稿人昵称',{max:40,required:true,help:'昵称会随档案公开展示。'})}${input('submissionDate','投稿日期',{type:'date',required:true})}</div>${select('role','你与服务器的关系',ROLES)}</section>`;
 host.querySelectorAll('input[type=date]').forEach(x=>x.value=chinaDate());
 host.addEventListener('input',e=>{if(e.target?.closest('.wk-count-table'))updateCountStatus(host)});
 updateCountStatus(host);
 host.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{const t=host.querySelector('[name=registration]');t.value=[...new Set([...t.value.split('、').filter(Boolean),b.dataset.add])].join('、');t.dispatchEvent(new Event('input',{bubbles:true}))});
}
export function readForm(host){const out={contents:[],qualities:[]};for(const n of host.querySelectorAll('[name]')){if(n.type==='checkbox'){if(n.checked&&Array.isArray(out[n.name]))out[n.name].push(n.value)}else out[n.name]=n.value}return out}
export function fillForm(host,item){for(const n of host.querySelectorAll('[name]')){if(n.type==='checkbox')n.checked=(item[n.name]||[]).includes(n.value);else n.value=item[n.name]??''}updateCountStatus(host)}
export function updateCountStatus(host){
 const note=host.querySelector('.wk-count-status');if(!note)return;
 const filled=name=>{const input=host.querySelector('[name="'+name+'"]');return !!input&&input.value!==''};
 const plain=filled('movies')&&filled('series'),multi=filled('moviesWithVersions')&&filled('seriesWithVersions');
 note.dataset.complete=plain||multi?'true':'false';
 note.textContent=plain&&multi?'两种统计口径均已填写完整':plain?'已完成「不含多版本」统计，包含多版本可选填':multi?'已完成「包含多版本」统计，不含多版本可选填':'请完整填写其中一列的电影和剧集数量（无该类别填 0）';
}
export function stats(item){
 const box=el('div',undefined,'wk-stats wk-version-stats');
 const columns=[
  {label:'不含多版本',keys:['movies','series','episodes']},
  {label:'包含多版本',keys:['moviesWithVersions','seriesWithVersions','episodesWithVersions']}
 ].filter(column=>column.keys.some(key=>item[key]!==null&&item[key]!==undefined&&item[key]!==''));
 if(columns.length===1)box.classList.add('wk-version-single');
 const head=el('div',undefined,'wk-version-head');
 head.append(el('span','媒体类型'));
 for(const column of columns)head.append(el('span',column.label));
 box.append(head);
 const value=k=>item[k]===null||item[k]===undefined||item[k]===''?'未提供':Number(item[k]).toLocaleString('zh-CN');
 for(const [label,i] of [['电影（部）',0],['剧集（部）',1],['集数（集）',2]]){
  const row=el('div',undefined,'wk-version-row');
  row.append(el('span',label));
  for(const column of columns)row.append(el('strong',value(column.keys[i])));
  box.append(row);
 }
 if(item.others!=null){const other=el('p','其他媒体 '+value('others')+' 项','wk-version-other');box.append(other)}
 return box;
}
export function details(item){const box=el('div',undefined,'wk-detail-body');
 box.append(stats(item));
 const dl=el('dl');
 const fields=[['统计日期',item.statsDate],['统计口径',item.statsNote||'未提供'],['资源内容',[...(item.contents||[]),item.extraContent].filter(Boolean).join('、')],['画质与规格',[...(item.qualities||[]),item.extraQuality].filter(Boolean).join('、')||'未提供'],['开号条件',item.registration],['保号规则',item.retention||'未提供'],['费用说明',item.pricing||'未提供'],['线路与访问',item.network||'未提供'],['简介',item.summary||'未提供'],['投稿人',item.nickname+(item.role?' · '+item.role:'')],['投稿日期',item.submissionDate]];
 for(const [k,v] of fields){dl.append(el('dt',k),el('dd',v))}box.append(dl);
 const links=el('div',undefined,'wk-links');for(const [k,label] of [['website','官方网站'],['channel','频道'],['group','群组'],['bot','机器人'],['evidence','统计凭证']]){if(!item[k])continue;try{const a=el('a',label+' ↗','wk-button wk-secondary');a.href=publicURL(item[k],label,['channel','group','bot'].includes(k));a.target='_blank';a.rel='noopener noreferrer nofollow';links.append(a)}catch{}}
 if(safeEvidence(item.evidenceImageUrl)){const proof=el('div',undefined,'wk-evidence-proof');proof.append(el('strong','统计凭证截图'));const link=el('a');link.href=item.evidenceImageUrl;link.target='_blank';link.rel='noopener noreferrer nofollow';const img=el('img');img.src=item.evidenceImageUrl;img.alt='统计凭证截图，点击查看原图';img.loading='lazy';link.append(img);proof.append(link);box.append(proof)}
 box.append(links);return box;
}
export function safeCover(url){return typeof url==='string'&&/^https:\/\/raw\.githubusercontent\.com\/MaddestAlistar\/Icon-Review-Queue\/main\/emby-wiki\/covers\/wiki-[a-f0-9-]+\.jpg$/.test(url)}

export function safeEvidence(url){return typeof url==='string'&&/^https:\/\/raw\.githubusercontent\.com\/MaddestAlistar\/Icon-Review-Queue\/main\/emby-wiki\/evidence\/wiki-[a-f0-9-]+\.jpg$/.test(url)}

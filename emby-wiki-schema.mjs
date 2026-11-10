// Shared by the form and Worker. Public fields are explicitly allow-listed.
export const NATURES = ['公益服','公费服','机场服'];
export const CONTENTS = ['电影','电视剧','动漫','综艺','纪录片','短剧','体育','音乐'];
export const QUALITIES = ['720P','1080P','4K','原盘 / REMUX','HDR10','HDR10+','杜比视界'];
export const STATES = ['正常运营','维护中','暂时停服','已停服'];
export const ROLES = ['腐竹本人','管理员','普通用户','资料整理者'];
export const COUNT_FIELDS = {movies:'电影（不含多版本，部）',series:'剧集（不含多版本，部）',episodes:'集数（不含多版本，集）',moviesWithVersions:'电影（包含多版本，部）',seriesWithVersions:'剧集（包含多版本，部）',episodesWithVersions:'集数（包含多版本，集）',others:'其他媒体（项）'};
export function hasCompleteCountColumn(values){
 const has=k=>values?.[k]!==''&&values?.[k]!=null;
 return (has('movies')&&has('series'))||(has('moviesWithVersions')&&has('seriesWithVersions'));
}
export function chinaDate(now=new Date()) { return new Date(now.getTime()+8*3600000).toISOString().slice(0,10); }
function text(value,label,max,required=false) {
 if(value==null)value='';
 if(typeof value!=='string')throw Error(label+'格式不正确');
 const s=value.trim();
 if((required&&!s)||s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s))throw Error(label+(required?'须填写，且':'')+'不能超过 '+max+' 字');
 return s;
}
function choice(value,options,label,required=true) {
 if(!value&&!required)return '';
 if(!options.includes(value))throw Error('请选择'+label);
 return value;
}
function date(value,label,today) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value||value<'2000-01-01'||value>today)throw Error(label+'须为有效日期，且不能晚于今天');
 return value;
}
export function publicURL(value,label='链接',telegram=false) {
 let s=text(value,label,500);
 if(!s)return '';
 if(telegram&&/^@[A-Za-z0-9_]{5,32}$/.test(s))s='https://t.me/'+s.slice(1);
 let u;try{u=new URL(s)}catch{throw Error(label+'请填写完整的 HTTPS 链接'+(telegram?'或 @用户名':''))}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname==='localhost'||!u.hostname.includes('.')||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)||u.hostname.startsWith('['))throw Error(label+'请使用公开的 HTTPS 地址');
 if(telegram&&!['t.me','telegram.me','www.t.me'].includes(u.hostname))throw Error(label+'请使用 Telegram 链接或 @用户名');
 return u.href;
}
export function validateWiki(input,{today=chinaDate()}={}) {
 const b=input||{},out={};
 out.name=text(b.name,'服务器名称',60,true);
 out.nature=choice(b.nature,NATURES,'服务器性质');
 out.state=choice(b.state,STATES,'运营状态');
 for(const [key,options,label,required] of [['contents',CONTENTS,'资源内容',true],['qualities',QUALITIES,'画质信息',false]]){
  if(!Array.isArray(b[key])||b[key].some(x=>!options.includes(x)))throw Error('请选择有效的'+label);
  out[key]=[...new Set(b[key])];if(required&&!out[key].length)throw Error('资源内容至少选择一项');
 }
 out.registration=text(b.registration,'开号条件',500,true);
 out.nickname=text(b.nickname,'投稿人昵称',40,true);
 out.submissionDate=date(b.submissionDate,'投稿日期',today);
 out.statsDate=date(b.statsDate,'媒体库统计日期',today);
 if(out.statsDate>out.submissionDate)throw Error('统计日期不能晚于投稿日期');
 for(const k of Object.keys(COUNT_FIELDS)){
  const v=b[k];
  if(v===''||v==null){out[k]=null;continue}
  if((typeof v!=='string'&&typeof v!=='number')||!/^\d+$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)>100000000)throw Error(COUNT_FIELDS[k]+'须为 0–100000000 的整数');
  out[k]=Number(v);
 }
 if(!hasCompleteCountColumn(out))throw Error('“不含多版本”或“包含多版本”至少完整填写一列的电影和剧集数量，没有的类别请填 0');
 if([out.movies,out.series,out.moviesWithVersions,out.seriesWithVersions,out.others].every(v=>!v))throw Error('媒体库统计至少有一类数量大于 0');
 for(const [k,label,max] of [['summary','服务器简介',600],['retention','保号规则',500],['network','线路与访问说明',300],['pricing','费用说明',200],['statsNote','统计口径说明',300],['extraContent','资源补充',100],['extraQuality','画质补充',100]])out[k]=text(b[k],label,max);
 out.role=choice(b.role==='站长'?'腐竹本人':b.role,ROLES,'投稿人身份',false);
 for(const [k,label,tg] of [['website','官方网站',false],['channel','频道',true],['group','群组',true],['bot','机器人',true],['evidence','统计凭证链接',false]])out[k]=publicURL(b[k],label,tg);
 if(!['website','channel','group','bot'].some(k=>out[k]))throw Error('官方网站、频道、群组或机器人至少填写一个，方便核验');
 return out;
}
export const STATUS_NAMES={pending:'待审核',approved:'已通过',rejected:'已拒绝',withdrawn:'已下架'};

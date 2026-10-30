// Manual diagnostics for the user-supplied "大师兄 / 驰时录" Rex module.
// No streaming URL, query token, video segment or key is saved.
import { createHash, createCipheriv, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { mkdir, writeFile, appendFile } from "node:fs/promises";

const host="app2.dsx.ac", origin="https://maddestalistar.github.io";
const build="1791855838435", pkg="com.zyx.cheyong";
const title=(process.env.PROBE_TITLE||"名侦探柯南").trim().slice(0,80);
const type=process.env.PROBE_TYPE||"tv";
const season=Math.max(1,Math.min(50,Number(process.env.PROBE_SEASON)||1));
const episode=Math.max(1,Math.min(1000,Number(process.env.PROBE_EPISODE)||1));
const year=(process.env.PROBE_YEAR||"").slice(0,4);
const folder=process.env.REPORT_DIR||"dashixiong-probe-report";
const report={checkedAt:new Date().toISOString(),title,type,season,episode,year,dns:null,https:null,search:null,matches:[],detail:null,media:[],lines:[],notes:[]};
const err=e=>String(e?.message||e).replace(/https?:\/\/\S+/g,"[URL]").slice(0,170);
const name=s=>String(s||"").replace(/[\r\n|<>]/g," ").slice(0,90);
function encryptedRequest(method,data){
  const key=createHash("md5").update(build+"^~!@#[-"+pkg).digest();
  const iv=randomBytes(16), cipher=createCipheriv("aes-128-cbc",key,iv);
  const text=JSON.stringify({method,data:{...data,token:""},csrf:Date.now()});
  return Buffer.concat([iv,cipher.update(text,"utf8"),cipher.final()]).toString("base64url");
}
function publicIP(ip){
  if(isIP(ip)===4){
    const [a,b]=ip.split(".").map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||
      (a===172&&b>=16&&b<=31)||(a===192&&(b===0||b===168))||
      (a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||b===51)));
  }
  if(isIP(ip)===6)return !/^(::|::1$|fc|fd|fe[89ab]|ff|2001:db8|::ffff:)/i.test(ip);
  return false;
}
async function checkedFetch(url,options={},timeout=9000){
  for(let count=0;count<4;count++){
    const u=new URL(url);
    if(!["http:","https:"].includes(u.protocol)||u.username||u.password||
      !u.hostname||u.hostname==="localhost"||u.hostname.endsWith(".local"))throw Error("blocked_url");
    const addresses=await lookup(u.hostname,{all:true});
    if(!addresses.length||!addresses.every(x=>publicIP(x.address)))throw Error("blocked_private_address");
    const response=await fetch(url,{...options,redirect:"manual",signal:AbortSignal.timeout(timeout)});
    if(![301,302,303,307,308].includes(response.status))return response;
    const next=response.headers.get("location");
    if(!next)return response;
    url=new URL(next,url).href;
  }
  throw Error("redirect_limit");
}
async function api(method,data){
  const response=await checkedFetch("http://"+host+"/ndsx.php/v7/logs",{
    method:"POST",headers:{"Content-Type":"text/plain","User-Agent":"Dart/3.13 (dart:io)",
      version:"2.0.0","version-number":"220","pk-id":pkg,"build-time":build,platform:"ios",
      "platform-version":"Version 27.2 (Build 24B5110a)"},
    body:encryptedRequest(method,data)
  },12000);
  let json=null;
  try{json=await response.json();}catch{}
  return {http:response.status,code:json?.code??null,json};
}
function strip(s){
  return String(s||"").toLowerCase()
    .replace(/\[[^\]]*\]|【[^】]*】|\([^)]*\)|（[^）]*）/g,"")
    .replace(/[\s\-_:：·.,，。!！?？/\\'\"“”‘’]/g,"");
}
const base=s=>String(s||"").replace(/第\s*[一二三四五六七八九十两零\d]+\s*季|\bseason\s*\d+\b|\bs\d+\b/gi,"");
function getSeason(s){
  const m=String(s||"").match(/第\s*([一二三四五六七八九十两零\d]+)\s*季|\bseason\s*(\d+)\b|\bs(\d+)\b/i);
  if(!m)return 0;
  const n=m[1]||m[2]||m[3];
  if(/^\d+$/.test(n))return Number(n);
  const words={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
  if(n.includes("十")){
    const p=n.split("十");return (words[p[0]]||1)*10+(words[p[1]]||0);
  }
  return words[n]||0;
}
function score(item){
  if(!item?.vod_id||/解说|预告|花絮|片段/.test((item.vod_name||"")+(item.vod_state||"")))return 0;
  if(type==="movie"&&Number(item.type_id)!==1)return 0;
  if(type==="tv"&&Number(item.type_id)===1)return 0;
  const found=getSeason(item.vod_name);
  if((season>1&&found!==season)||(season===1&&found>1))return 0;
  const wanted=season>1&&!getSeason(title)?title+" 第"+season+"季":title;
  const exact=strip(item.vod_name)===strip(wanted);
  const approximate=strip(base(item.vod_name))===strip(base(wanted));
  if(!exact&&!approximate)return 0;
  return (exact?100:95)+(year&&String(item.vod_year||"")===year?5:0);
}
function selectedEpisode(source,movie){
  const list=[];let numbered=false;
  for(const entry of String(source.url||"").split("#")){
    const dollar=entry.indexOf("$");if(dollar<1)continue;
    const match=entry.slice(0,dollar).match(/^\s*(?:第\s*)?0*(\d{1,4})\s*(?:[集话話期]|$)/);
    if(match)numbered=true;
    list.push({url:entry.slice(dollar+1),number:match?Number(match[1]):null});
  }
  if(movie)return episode===1?list[0]:null;
  return list.find(x=>x.number===episode)||(!numbered?list[episode-1]:null);
}
const isDirect=url=>/^https?:\/\//i.test(url)&&/\.(?:m3u8|mp4|mov|mkv)(?:[?#]|$)/i.test(url);
const cors=response=>["*",origin].includes(response.headers.get("access-control-allow-origin"));
async function mediaCheck(url){
  const u=new URL(url);
  const item={host:u.hostname,protocol:u.protocol.slice(0,-1),format:/\.m3u8(?:[?#]|$)/i.test(url)?"HLS":"file",
    head:null,get:null,cors:null,preflight:null,manifest:null,httpsCompatible:u.protocol==="https:"};
  try{
    const response=await checkedFetch(url,{method:"HEAD",headers:{Origin:origin}});
    item.head=response.status;item.cors=cors(response);
    item.contentType=response.headers.get("content-type")||null;
    await response.body?.cancel();
  }catch(e){item.headError=err(e);}
  if(item.format==="HLS"){
    try{
      const response=await checkedFetch(url,{headers:{Origin:origin,Range:"bytes=0-4095"}});
      item.get=response.status;item.cors=cors(response);
      const reader=response.body?.getReader();
      if(reader){
        const chunk=await reader.read();
        item.manifest=!!chunk.value&&new TextDecoder().decode(chunk.value.subarray(0,100)).trimStart().startsWith("#EXTM3U");
        await reader.cancel().catch(()=>{});
      }
    }catch(e){item.getError=err(e);}
  }
  try{
    const response=await checkedFetch(url,{method:"OPTIONS",headers:{Origin:origin,
      "Access-Control-Request-Method":"GET","Access-Control-Request-Headers":"range"}},6000);
    item.preflight={http:response.status,cors:cors(response),
      allowHeaders:response.headers.get("access-control-allow-headers")||null};
    await response.body?.cancel();
  }catch(e){item.preflight={error:err(e)};}
  return item;
}

function parsers(source,original){
  const listed=[source?.parse_api,...String(source?.extra_parse_api||"").split(/\r?\n/)];
  const seen=new Set(),result=[];
  for(let endpoint of listed){
    endpoint=String(endpoint||"").trim();
    if(!/^https?:\/\//i.test(endpoint)||seen.has(endpoint))continue;
    seen.add(endpoint);
    const target=endpoint.includes("{url}")?endpoint.replace("{url}",encodeURIComponent(original)):
      endpoint+encodeURIComponent(original);
    try{const x=new URL(target);if(x.username||x.password||x.href.length>4096)continue;result.push(x.href);}
    catch{}
  }
  return result.slice(0,3);
}
function playData(value,depth=0){
  if(depth>5||value==null)return null;
  if(Array.isArray(value))return value.map(v=>playData(v,depth+1)).find(Boolean)||null;
  if(typeof value==="string"){
    const v=value.trim();
    if(/^https?:\/\/\S{5,4090}$/i.test(v))return {url:v};
    try{return playData(JSON.parse(v),depth+1);}catch{return null;}
  }
  if(typeof value!=="object"||value.code!=null&&![1,200].includes(Number(value.code)))return null;
  for(const field of ["url","play_url","playUrl","video_url"]){
    const v=value[field];
    if(typeof v==="string"&&/^https?:\/\/\S{5,4090}$/i.test(v))return {url:v};
  }
  for(const field of ["data","result","play"]){
    if(value[field]&&value[field]!==value){
      const found=playData(value[field],depth+1);if(found)return found;
    }
  }
  return null;
}
function staticMediaFromHTML(html){
  const normalized=String(html||"").replace(/&amp;/gi,"&").replace(/\\\//g,"/")
    .replace(/\\u0026/gi,"&").replace(/&#38;/gi,"&");
  const values=[];
  const tags=normalized.match(/<(?:video|source)\b[^>]{0,2000}>/gi)||[];
  for(const tag of tags){
    const m=tag.match(/\bsrc\s*=\s*["'](https?:\/\/[^"']+)["']/i);
    if(m)values.push(m[1]);
  }
  const common=normalized.match(/https?:\/\/[^\s"'<>\\]{5,1600}?\.(?:m3u8|mp4|mov)(?:[?#][^\s"'<>\\]*)?/gi)||[];
  values.push(...common);
  for(let u of values.slice(0,15)){
    try{
      u=u.replace(/&quot;.*$/i,"").replace(/\\n.*$/i,"").trim();
      const parsed=new URL(u);
      if(!["http:","https:"].includes(parsed.protocol)||parsed.username||parsed.password)continue;
      if(!/\.(?:m3u8|mp4|mov)(?:[?#]|$)/i.test(parsed.href))continue;
      return {url:parsed.href};
    }catch{}
  }
  return null;
}

async function parserResponse(url){
  const r=await checkedFetch(url,{headers:{"User-Agent":"Dart/3.13 (dart:io)","Accept":"application/json,text/plain,*/*"}},9000);
  const status=r.status,contentType=r.headers.get("content-type")||"";
  if(status<200||status>=300){await r.body?.cancel();return {http:status,format:"non_2xx"};}
  const isHtml=/text\/html/i.test(contentType);
  const len=Number(r.headers.get("content-length")||"0");
  if(len>150000){await r.body?.cancel();return {http:status,format:"too_large"};}
  const reader=r.body?.getReader();let total=0,parts=[];
  if(reader){
    while(true){
      const q=await reader.read();if(q.done)break;
      total+=q.value.byteLength;
      if(total>150000){await reader.cancel();return {http:status,format:"too_large"};}
      parts.push(q.value);
    }
  }
  const text=new TextDecoder().decode(Buffer.concat(parts.map(x=>Buffer.from(x)))).trim();
  const result=isHtml?staticMediaFromHTML(text):playData(text);
  return {http:status,format:result?(isHtml?"html_public_media":"url"):isHtml?"html_no_public_media":
    text.startsWith("{")||text.startsWith("[")?"json_without_url":"unsupported_or_encoded",play:result};
}
async function probeLine(item,index){
  const source=item.source,original=item.part.url;
  const result={number:index+1,mode:source.parse_secret?"internal_secret":isDirect(original)?"direct":"external_parser",
    parserCount:0,status:"not_checked",mediaHost:null};
  try{
    let found=null;
    if(source.parse_secret){
      const response=await api("secret_parse_api_url",{url:original,player_code:String(source.code||"")});
      result.apiHttp=response.http;result.apiCode=response.code;
      found=playData(response.json?.data);
      if(!found)result.status="api_no_direct_url";
    }else if(isDirect(original)){
      found={url:original};
    }else{
      const targets=parsers(source,original);result.parserCount=targets.length;
      result.status=targets.length?"no_parse_success":"no_parser_endpoint";
      result.attempts=[];
      for(const target of targets){
        try{
          const response=await parserResponse(target);
          result.attempts.push({http:response.http,format:response.format});
          if(response.play){found=response.play;break;}
        }catch(e){result.attempts.push({error:err(e)});}
      }
    }
    if(found){
      const u=new URL(found.url);
      if(!["http:","https:"].includes(u.protocol))throw Error("not_http_url");
      const media=await mediaCheck(found.url);
      result.status=media.head>=200&&media.head<300&&
        (media.format!=="HLS"||(media.get>=200&&media.get<300&&media.manifest))?"media_header_pass":"media_unverified";
      result.mediaHost=media.host;result.media=media;
    }
  }catch(e){result.status="error";result.error=err(e);}
  return result;
}
async function probeAllLines(lines){
  const results=new Array(lines.length);let index=0;
  const run=async()=>{while(index<lines.length){const i=index++;results[i]=await probeLine(lines[i],i);}};
  await Promise.all(Array.from({length:Math.min(3,lines.length)},()=>run()));
  return results;
}

async function run(){
  try{
    try{
      const ips=await lookup(host,{all:true});
      report.dns={ok:ips.length>0,addresses:ips.length,allPublic:ips.every(x=>publicIP(x.address))};
    }catch(e){report.dns={ok:false,error:err(e)};}
    try{
      const r=await checkedFetch("https://"+host+"/ndsx.php/v7/logs",{method:"HEAD"},6000);
      report.https={ok:true,http:r.status};await r.body?.cancel();
    }catch(e){report.https={ok:false,error:err(e)};}
    let items=[];
    try{
      const r=await api("search",{text:title,pg:1});
      items=r.code===1&&Array.isArray(r.json?.data)?r.json.data:[];
      report.search={http:r.http,code:r.code,count:items.length,pages:r.json?.pagecount??null};
      if(r.code===1&&!items.some(x=>score(x)>=95)&&Number(r.json?.pagecount)>1){
        const second=await api("search",{text:title,pg:2});
        if(second.code===1&&Array.isArray(second.json?.data))items.push(...second.json.data);
        report.search.count=items.length;
      }
    }catch(e){report.search={error:err(e)};}
    report.matches=items.slice(0,10).map(x=>({title:name(x.vod_name),year:x.vod_year||null,score:score(x)}));
    const best=items.map(item=>({item,rank:score(item)})).filter(x=>x.rank>=95)
      .sort((a,b)=>b.rank-a.rank)[0];
    if(best){
      report.selected={title:name(best.item.vod_name),score:best.rank};
      try{
        const r=await api("video_detail",{id:best.item.vod_id,sign_md5:"",apk_path:"",apk_length:0});
        const d=r.json?.data?.vod_info;
        const valid=r.code===1&&d&&String(d.vod_id)===String(best.item.vod_id);
        const sources=valid&&Array.isArray(d.vod_url_with_player)?d.vod_url_with_player:[];
        const episodeLines=sources.map(s=>({source:s,part:selectedEpisode(s,Number(d.type_id)===1)}))
          .filter(x=>x.part?.url).slice(0,20);
        const direct=episodeLines.filter(x=>!x.source.parse_secret&&isDirect(x.part.url));
        report.detail={http:r.http,code:r.code,identityMatched:!!valid,sourceCount:sources.length,
          episodeMatches:episodeLines.length,directCount:direct.length,parserRequired:episodeLines.length-direct.length};
        report.lines=await probeAllLines(episodeLines);
        report.media=report.lines.filter(x=>x.media).map(x=>x.media);
        report.detail.resolvedUrlCount=report.lines.filter(x=>x.media).length;
        report.detail.mediaHeaderPass=report.lines.filter(x=>x.status==="media_header_pass").length;
        report.detail.unresolved=report.lines.filter(x=>!x.media).length;
      }catch(e){report.detail={error:err(e)};}
    }
  }catch(e){report.notes.push("Unexpected: "+err(e));}
  if(!report.search?.count)report.notes.push("未获取有效真实搜索结果；不能据此断定源站永久失效。");
  if(!report.media.length)report.notes.push("没有解析出可检查的直链；不代表其他播放器中也不可用。");
  if(report.lines.some(x=>x.status==="api_no_direct_url"||x.attempts?.some(a=>a.format==="unsupported_or_encoded")))
    report.notes.push("部分解析结果不含公开直链或需要额外解码；不会把模块自带的 RSA 私钥复制到公开仓库。");
  if(report.lines.some(x=>x.status==="media_header_pass"))
    report.notes.push("部分线路通过了服务端媒体头检查，但浏览器端 CORS、分片和播放授权仍需独立确认。");
  if(report.media.some(x=>!x.httpsCompatible))report.notes.push("HTTP 直链可能被 HTTPS GitHub Pages 阻止（混合内容）。");
  if(report.media.some(x=>x.cors===false))report.notes.push("部分媒体服务器未对本站 Origin 放行跨域。");
  report.notes.push("仅检测公开接口、直链元数据、HLS 清单及响应头；不下载视频片段或密钥。不绕过额外解析或访问控制。连通性通过不代表浏览器实际可播放或获得播放授权。");
  await mkdir(folder,{recursive:true});
  const rows=["# 大师兄 / 驰时录 · 手动检测","",
    "检测时间："+report.checkedAt,
    "影片："+name(title)+" / "+type+" / S"+season+" E"+episode,"",
    "- DNS："+JSON.stringify(report.dns),
    "- HTTPS："+JSON.stringify(report.https),
    "- 搜索："+JSON.stringify(report.search),
    "- 最佳匹配："+JSON.stringify(report.selected||null),
    "- 详情："+JSON.stringify(report.detail),"",
    "## 搜索结果","",
    "| 片名 | 年份 | 匹配分 |","|---|---|---|",
    ...report.matches.map(x=>"| "+x.title+" | "+(x.year||"-")+" | "+x.score+" |"),"",
    "## 线路解析结果（不记录完整地址）","",
    "| 线路编号 | 解析方式 | 状态 | 解析请求数 | 媒体域名 |",
    "|---|---|---|---|---|",
    ...report.lines.map(x=>"| "+x.number+" | "+x.mode+" | "+x.status+" | "+(x.parserCount||0)+
      " | "+(x.mediaHost||"-")+" |"),"",
    "## 解析尝试明细（仅状态）","",
    ...report.lines.map(x=>"- 线路 "+x.number+"："+JSON.stringify({apiHttp:x.apiHttp,apiCode:x.apiCode,
      attempts:x.attempts,error:x.error})).filter(Boolean),"",
    "## 视频地址状态（仅域名，不写入完整视频地址）","",
    "| 域名 | 协议 | 类型 | HTTP HEAD | HTTP GET | CORS | OPTIONS | HLS 清单 |",
    "|---|---|---|---|---|---|---|---|",
    ...report.media.map(x=>"| "+x.host+" | "+x.protocol+" | "+x.format+" | "+(x.head??x.headError??"-")+
      " | "+(x.get??"-")+" | "+(x.cors??"-")+" | "+(x.preflight?.http??x.preflight?.error??"-")+" | "+(x.manifest??"-")+" |"),"",
    "## 限制与结论","",...report.notes.map(x=>"- "+x),""];
  const markdown=rows.join("\n");
  await writeFile(folder+"/result.json",JSON.stringify(report,null,2)+"\n");
  await writeFile(folder+"/summary.md",markdown);
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,markdown+"\n");
  console.log("完成：搜索 "+(report.search?.count||0)+" 条，严格匹配 "+(report.selected?1:0)+
    " 条，解析线路 "+report.lines.length+" 条，媒体地址 "+report.media.length+
    " 条，服务端头验证通过 "+report.lines.filter(x=>x.status==="media_header_pass").length+" 条。");
}
if(process.argv.includes("--self-test")){
  if(!/^[\w-]+$/.test(encryptedRequest("search",{text:"test"}))||
     selectedEpisode({url:"第1集$https://example.test/1.m3u8#第2集$https://example.test/2.m3u8"},false)?.number!==1||
     score({vod_id:1,vod_name:title,type_id:type==="movie"?1:2})<95)throw Error("Self-test failed");
  console.log("Offline self-test PASS");
}else run().catch(e=>{console.error(err(e));process.exitCode=1;});

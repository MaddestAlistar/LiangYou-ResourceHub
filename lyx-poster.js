/* LYX review poster generator. Pure client-side canvas, no account or third-party render service. */
(function(){
"use strict";
const SIZE={w:1080,h:1440},EXPORT_SCALE=2,FONT='"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
const WEIGHTS=[.30,.20,.20,.10,.10,.10];
const AXES=["功能丰富度","使用便捷性","稳定与流畅","系统融合度","设备适配性","隐私与安全"];
const AUTHOR="./assets/lyx/author-avatar.svg",AUTHOR_NAME="@良哥看未来",AUTHOR_ID="116584042";
const $=id=>document.getElementById(id);
let objectUrl=null,generatedBlob=null,filename="良友APP指南-分享海报.png",working=false;
function grade(s){return s>=90?["旗舰推荐","90–100"]:s>=85?["优选推荐","85–89"]:s>=80?["值得尝试","80–84"]:s>=70?["可以尝试","70–79"]:["暂不推荐","70 以下"]}
function scoreData(r){const sc=WEIGHTS.map((_,i)=>Math.max(0,Math.min(100,Number(r.scores?.[i])||0)));return {sc,total:sc.reduce((n,v,i)=>n+v*WEIGHTS[i],0)}}
function rounded(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.lineTo(x+w-rr,y);ctx.quadraticCurveTo(x+w,y,x+w,y+rr);ctx.lineTo(x+w,y+h-rr);ctx.quadraticCurveTo(x+w,y+h,x+w-rr,y+h);ctx.lineTo(x+rr,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-rr);ctx.lineTo(x,y+rr);ctx.quadraticCurveTo(x,y,x+rr,y);ctx.closePath()}
function glowPanel(ctx,x,y,w,h,r=22){ctx.save();ctx.shadowColor="#159eff";ctx.shadowBlur=22;const g=ctx.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,"#11458fa6");g.addColorStop(.6,"#071e58ef");g.addColorStop(1,"#102e82e8");rounded(ctx,x,y,w,h,r);ctx.fillStyle=g;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle="#72c6ff";ctx.stroke();ctx.restore();
ctx.save();ctx.beginPath();ctx.moveTo(x+r,y+2);ctx.lineTo(x+w-r,y+2);ctx.strokeStyle="#a5efff9e";ctx.lineWidth=2;ctx.stroke();ctx.restore()}
function fill(ctx,x,y,w,h,color,r=0){ctx.save();ctx.fillStyle=color;rounded(ctx,x,y,w,h,r);ctx.fill();ctx.restore()}
function txt(ctx,s,x,y,size=24,color="#f1faff",weight=500,align="left"){ctx.fillStyle=color;ctx.font=weight+" "+size+"px "+FONT;ctx.textAlign=align;ctx.textBaseline="alphabetic";ctx.fillText(String(s??""),x,y)}
function fit(ctx,s,x,y,max,size=26,min=18,color="#fff",weight=700){let n=size;while(n>min){ctx.font=weight+" "+n+"px "+FONT;if(ctx.measureText(s).width<=max)break;n--}let t=String(s);ctx.font=weight+" "+n+"px "+FONT;while(t.length>1&&ctx.measureText(t).width>max)t=t.slice(0,-1);if(t!==s)t=t.slice(0,-1)+"…";txt(ctx,t,x,y,n,color,weight)}
function wrap(ctx,text,width,size,weight=400){ctx.font=weight+" "+size+"px "+FONT;const paras=String(text||"").replace(/\r/g,"").split("\n"),lines=[];for(let pi=0;pi<paras.length;pi++){const p=paras[pi].trim();if(!p){if(lines.length)lines.push("");continue}let line="";for(const ch of p){const next=line+ch;if(ctx.measureText(next).width>width&&line){lines.push(line);line=ch}else line=next}if(line)lines.push(line)}return lines}
function wrapped(ctx,text,x,y,width,{size=22,lineHeight=32,maxLines=8,color="#e4f4ff",weight=400}={}){const arr=wrap(ctx,text,width,size,weight);const cut=arr.length>maxLines,lines=arr.slice(0,maxLines);if(cut&&lines.length){let last=lines[lines.length-1];ctx.font=weight+" "+size+"px "+FONT;while(last&&ctx.measureText(last+"…").width>width)last=last.slice(0,-1);lines[lines.length-1]=last+"…"}for(let i=0;i<lines.length;i++)txt(ctx,lines[i],x,y+i*lineHeight,size,color,weight);return lines.length}
function line(ctx,x1,y1,x2,y2,color,width=1){ctx.save();ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();ctx.restore()}
function ring(ctx,x,y,r,total){ctx.save();ctx.shadowBlur=29;ctx.shadowColor="#22bfff";const g=ctx.createConicGradient(-Math.PI/2,x,y);g.addColorStop(0,"#54f4ff");g.addColorStop(.35,"#1476ff");g.addColorStop(.68,"#9d68f9");g.addColorStop(1,"#46eeff");ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.arc(x,y,r-17,0,2*Math.PI,true);ctx.fillStyle=g;ctx.fill("evenodd");ctx.restore();ctx.save();let core=ctx.createRadialGradient(x,y-40,10,x,y,r);core.addColorStop(0,"#174b94");core.addColorStop(1,"#07142d");ctx.fillStyle=core;ctx.beginPath();ctx.arc(x,y,r-18,0,2*Math.PI);ctx.fill();ctx.restore();txt(ctx,total.toFixed(0),x,y+21,83,"#ecfaff",900,"center");txt(ctx,"/ 100",x,y+60,26,"#d7edff",600,"center")}
function radar(ctx,sc,x,y,R){function p(i,n){const t=-Math.PI/2+i*Math.PI/3;return [x+Math.cos(t)*n,y+Math.sin(t)*n]}function poly(vals,stroke,fillcolor,width=1){ctx.beginPath();vals.forEach((d,i)=>{const z=p(i,d);i?ctx.lineTo(...z):ctx.moveTo(...z)});ctx.closePath();if(fillcolor){ctx.fillStyle=fillcolor;ctx.fill()}ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}
ctx.save();for(let i=1;i<=5;i++)poly(Array(6).fill(R*i/5),i===5?"#a4ecff":"#4b9cd6",null,i===5?2:1);
for(let i=0;i<6;i++){const pt=p(i,R);line(ctx,x,y,pt[0],pt[1],"#459de788",1)}
const g=ctx.createLinearGradient(x-R,y-R,x+R,y+R);g.addColorStop(0,"#37ffffaa");g.addColorStop(.55,"#0dbaff99");g.addColorStop(1,"#466aff86");poly(sc.map(v=>v/100*R),"#77f8ff",g,3);
for(let i=0;i<6;i++){const z=p(i,sc[i]/100*R);ctx.beginPath();ctx.arc(z[0],z[1],5,0,Math.PI*2);ctx.fillStyle="#f9ffff";ctx.shadowColor="#66eaff";ctx.shadowBlur=10;ctx.fill();ctx.shadowBlur=0}ctx.restore()}
function imageFit(ctx,img,x,y,w,h,r){ctx.save();rounded(ctx,x,y,w,h,r);ctx.clip();const ir=img.width/img.height,box=w/h;const dw=ir>box?h*ir:w,dh=ir>box?h:w/ir;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);ctx.restore()}
function pictureURL(v){v=String(v||"");if(/^data:image\/(?:webp|png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(v))return v;if(/^assets\/(?:lyx|collabs)\/[a-zA-Z0-9._/-]+\.(?:png|webp|svg)$/.test(v)&&!v.includes(".."))return "./"+v;return "./assets/lyx/shangdaoji.svg"}
function imageFrom(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("图片加载失败"));img.src=src})}
async function loadPicture(src){
 // The initial icon and author avatar are SVG wrappers around original WebP.
 // Extract the embedded image: Canvas on iOS Safari can otherwise reject nested SVG images.
 if(src.endsWith(".svg")){const res=await fetch(src,{cache:"force-cache"});if(!res.ok)throw Error("海报图片读取失败");const body=await res.text();const embedded=body.match(/(?:href|xlink:href)=["'](data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+)["']/i);if(embedded)return imageFrom(embedded[1])}
 return imageFrom(src)
}
function panelTitle(ctx,name,x,y,w){txt(ctx,name,x,y,26,"#f0fbff",850);line(ctx,x,y+14,x+w,y+14,"#6eaeea88",1)}
function tierBox(ctx,x,y,w,h,title,subtitle,active){glowPanel(ctx,x,y,w,h,13);if(active){ctx.save();ctx.shadowColor="#41edff";ctx.shadowBlur=22;fill(ctx,x+2,y+2,w-4,h-4,"#1373efaa",11);ctx.restore();ctx.strokeStyle="#93efff";ctx.lineWidth=2;rounded(ctx,x+1,y+1,w-2,h-2,12);ctx.stroke()}txt(ctx,title,x+w/2,y+36,20,"#f8fdff",800,"center");txt(ctx,subtitle,x+w/2,y+68,17,active?"#fff":"#c9e5ff",750,"center")}
function drawReview(ctx,review,x,y,width){
 const font=21,lh=29,maxLines=8;
 const paragraphs=String(review||"暂无简评").split(/\n\s*\n/).filter(Boolean);
 const clean=paragraphs.join("\n");
 wrapped(ctx,clean,x,y,width,{size:font,lineHeight:lh,maxLines,color:"#e8f5ff"});
}
async function renderPoster(r){
 const {w,h}=SIZE,canvas=document.createElement("canvas");canvas.width=w*EXPORT_SCALE;canvas.height=h*EXPORT_SCALE;const ctx=canvas.getContext("2d");if(!ctx)throw Error("此浏览器不支持海报绘制");ctx.setTransform(EXPORT_SCALE,0,0,EXPORT_SCALE,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
 const {sc,total}=scoreData(r),[rank,interval]=grade(total);
 const [appImg,avatarImg]=await Promise.all([loadPicture(pictureURL(r.icon)).catch(()=>null),loadPicture(AUTHOR)]);
 // Backdrop
 const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,"#093b89");bg.addColorStop(.23,"#071a4a");bg.addColorStop(.63,"#071b52");bg.addColorStop(1,"#0e2680");ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 const blue=ctx.createRadialGradient(25,35,8,70,30,380);blue.addColorStop(0,"#20b7ff8a");blue.addColorStop(1,"transparent");ctx.fillStyle=blue;ctx.fillRect(0,0,450,350);
 const purple=ctx.createRadialGradient(1060,1310,40,1000,1230,400);purple.addColorStop(0,"#6c45ef84");purple.addColorStop(1,"transparent");ctx.fillStyle=purple;ctx.fillRect(610,880,470,560);
 ctx.save();ctx.shadowColor="#21aaff";ctx.shadowBlur=20;ctx.beginPath();ctx.moveTo(0,150);ctx.bezierCurveTo(270,-20,760,-5,1080,154);ctx.strokeStyle="#4fe8ffcc";ctx.lineWidth=4;ctx.stroke();ctx.beginPath();ctx.moveTo(0,1275);ctx.bezierCurveTo(330,1178,660,1401,1080,1278);ctx.strokeStyle="#2dbfffbb";ctx.lineWidth=3;ctx.stroke();ctx.restore();
 // Brand header
 const heading=ctx.createLinearGradient(140,45,955,140);heading.addColorStop(0,"#e9f9ff");heading.addColorStop(.6,"#fff");heading.addColorStop(1,"#66e6ff");
 txt(ctx,"良友APP指南",540,99,65,heading,900,"center");txt(ctx,"AMAZING GUIDE",540,143,31,"#cfebff",780,"center");
 fill(ctx,260,158,560,45,"#0b4ca0dd",25);ctx.strokeStyle="#64daff";ctx.lineWidth=2;rounded(ctx,260,158,560,45,25);ctx.stroke();
 txt(ctx,(Array.isArray(r.tags)&&r.tags.includes("资料初评"))?"良友联名 · 资料初评（待真机复核）":"良友科技原创 · LYX 六维体验评分标准",540,188,23,"#ecfaff",720,"center");
 // Application identity panel
 glowPanel(ctx,34,228,412,406,28);glowPanel(ctx,458,228,588,406,28);
 if(appImg){imageFit(ctx,appImg,65,265,125,125,25)}else{fill(ctx,65,265,125,125,"#ebf6ff",24);fit(ctx,r.name?.slice(0,3)||"APP",78,340,99,28,18,"#122447")}
 fit(ctx,String(r.name||"未知应用"),216,307,200,42,28,"#f8fdff",900);
 fit(ctx,[r.category,r.subtitle].filter(Boolean).join(" · "),217,346,210,21,16,"#b9d9ff",600);
 fit(ctx,"版本 "+(r.version||"未标注"),216,373,208,19,15,"#c2e0ff",450);
 fit(ctx,"平台 "+(r.platform||"未标注"),216,396,208,19,15,"#c2e0ff",450);
 ring(ctx,236,518,99,total);
 fill(ctx,92,601,288,45,"#075dbee8",23);ctx.strokeStyle="#66ddff";ctx.lineWidth=2;rounded(ctx,92,601,288,45,23);ctx.stroke();
 txt(ctx,rank,236,630,26,"#f6ffff",900,"center");
 // Radar: clear six-axis labels arranged around hexagon
 txt(ctx,"六维体验雷达",479,268,23,"#a3efff",800);
 radar(ctx,sc,753,431,119);
 const labels=[
  [0,753,294,"center"],[1,913,350,"left"],[2,912,518,"left"],
  [3,753,595,"center"],[4,589,518,"right"],[5,588,350,"right"]
 ];
 for(const [i,x,y,align] of labels){txt(ctx,AXES[i],x,y,20,"#e8faff",770,align);txt(ctx,sc[i].toFixed(sc[i]%1?1:0),x,y+28,25,"#fff",900,align)}
 // Formula panel
 glowPanel(ctx,34,655,486,467,24);panelTitle(ctx,"评分逻辑与公式",58,700,435);
 fill(ctx,60,730,433,43,"#155abacc",22);
 txt(ctx,"综合得分 = Σ（维度分数 × 权重）",276,759,21,"#eafaff",780,"center");
 fill(ctx,60,789,433,96,"#071b51aa",14);
 txt(ctx,"LYX = Σ (Sᵢ × Wᵢ)",276,832,31,"#f9fdff",700,"center");
 txt(ctx,"Sᵢ：单项评分（0–100）   Wᵢ：该项权重",276,867,16,"#a9dfff",520,"center");
 txt(ctx,"六维权重分配",61,924,23,"#f2fbff",850);
 const shortNames=["功能丰富度","使用便捷性","稳定与流畅","系统融合度","设备适配性","隐私与安全"];
 for(let i=0;i<6;i++){const x=i<3?63:290,y=960+(i%3)*34;fit(ctx,shortNames[i],x,y,145,19,16,"#dbf1ff",600);txt(ctx,(WEIGHTS[i]*100).toFixed(0)+"%",x+205,y,18,"#9aeaff",750,"right")}
 fill(ctx,59,1061,434,44,"#094985c9",12);
 const partA=sc.slice(0,3).map((v,i)=>v+"×"+WEIGHTS[i].toFixed(2)).join(" + ");
 const partB=sc.slice(3).map((v,i)=>v+"×"+WEIGHTS[i+3].toFixed(2)).join(" + ");
 txt(ctx,"LYX "+total.toFixed(1)+" = "+partA+" +",73,1080,17,"#dcfaff",700);
 txt(ctx,partB,73,1100,17,"#dcfaff",700);
 // Review panel
 glowPanel(ctx,532,655,514,305,24);panelTitle(ctx,"良友简评",559,700,461);
 drawReview(ctx,r.review||r.summary,558,747,461);
 // Grade panel
 glowPanel(ctx,532,974,514,148,23);panelTitle(ctx,"综合推荐等级",557,1010,463);
 const levels=[["90–100","旗舰推荐"],["85–89","优选推荐"],["80–84","值得尝试"],["70–79","可以尝试"],["70 以下","暂不推荐"]];
 for(let i=0;i<5;i++){const x=545+i*99;fill(ctx,x,1034,93,73,levels[i][1]===rank?"#0c82e1":"#0c3d84",12);ctx.save();rounded(ctx,x,1034,93,73,12);ctx.strokeStyle=levels[i][1]===rank?"#8cf6ff":"#5c94c7";ctx.lineWidth=levels[i][1]===rank?2.5:1.3;ctx.stroke();ctx.restore();
  txt(ctx,levels[i][0],x+46,1063,16,"#f4fcff",800,"center");txt(ctx,levels[i][1],x+46,1092,16,"#f7fcff",800,"center")}
 // Author signature footer
 glowPanel(ctx,55,1150,971,222,95);
 const halo=ctx.createRadialGradient(250,1261,20,250,1261,132);halo.addColorStop(0,"#86efff66");halo.addColorStop(1,"transparent");ctx.fillStyle=halo;ctx.fillRect(111,1125,280,275);
 ctx.save();ctx.shadowBlur=19;ctx.shadowColor="#4dfaff";ctx.beginPath();ctx.arc(250,1261,92,0,Math.PI*2);ctx.fillStyle="#d8f4ff";ctx.fill();ctx.restore();
 ctx.save();ctx.beginPath();ctx.arc(250,1261,86,0,Math.PI*2);ctx.clip();ctx.drawImage(avatarImg,164,1175,172,172);ctx.restore();
 line(ctx,365,1201,365,1333,"#91d5ff",2);
 fit(ctx,AUTHOR_NAME,396,1250,542,49,34,"#ffffff",900);
 fill(ctx,398,1282,460,55,"#155faccc",26);ctx.strokeStyle="#7edbff";ctx.lineWidth=2;rounded(ctx,398,1282,460,55,26);ctx.stroke();
 txt(ctx,"小红书号："+AUTHOR_ID,626,1318,27,"#ffffff",720,"center");
 txt(ctx,(Array.isArray(r.tags)&&r.tags.includes("资料初评"))?"公开资料初评 · 联名不加分 · 待实测复核":"良友科技 · 真实体验 · 独立评价",540,1410,18,"#c4eaff",650,"center");
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("PNG 导出失败")),"image/png"));
 return blob;
}
function cleanFilename(v){return String(v||"应用").replace(/[\/\\:*?"<>|#%]/g,"").slice(0,45)}
function message(s){const n=$("posterStatus");if(n)n.textContent=s}
async function open(r){
 if(working||!r)return;
 const dlg=$("posterDialog");if(!dlg){alert("海报组件未载入，请刷新后重试");return}
 dlg.showModal();dlg.querySelectorAll(".poster-action").forEach(b=>b.disabled=true);
 const pic=$("posterPreview");pic.hidden=true;pic.removeAttribute("src");
 message("正在根据「"+r.name+"」的实时评分生成 2160×2880 超清海报…");working=true;
 try{
  const blob=await renderPoster(r);if(objectUrl)URL.revokeObjectURL(objectUrl);
  objectUrl=URL.createObjectURL(blob);generatedBlob=blob;
  filename="良友APP指南-"+cleanFilename(r.name)+"-小红书超清海报.png";
  pic.src=objectUrl;pic.alt=r.name+" 良友APP指南 Amazing Guide 小红书海报预览";pic.hidden=false;
  dlg.querySelectorAll(".poster-action").forEach(b=>b.disabled=false);
  message("已生成 2160×2880 PNG 超清原图。预览会缩小显示，保存和分享均使用完整分辨率。");
 }catch(e){message("海报生成失败："+(e?.message||"未知错误")+"。请刷新后重试。")}
 finally{working=false}
}
function save(){if(!objectUrl)return;const a=document.createElement("a");a.href=objectUrl;a.download=filename;document.body.appendChild(a);a.click();a.remove();message("已请求保存 PNG。如果 iPhone 没有直接保存到相册，请长按上方海报或点击「系统分享」。")}
async function share(){
 if(!generatedBlob)return;const file=new File([generatedBlob],filename,{type:"image/png"});
 if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){try{await navigator.share({files:[file],title:"良友APP指南 Amazing Guide"});return}catch(e){if(e.name==="AbortError")return}}
 message("此浏览器暂不支持直接分享图片。请长按海报保存，或使用「保存 PNG」后再分享。");
}
async function copy(){try{await navigator.clipboard.writeText(location.href);message("已复制当前 App 的评测详情链接。")}catch{message("复制未成功，请从浏览器地址栏复制当前详情链接。")}}
document.addEventListener("DOMContentLoaded",()=>{
 const dlg=$("posterDialog");if(!dlg)return;
 $("posterClose").onclick=()=>dlg.close();$("posterCloseSecondary").onclick=()=>dlg.close();
 $("posterSave").onclick=save;$("posterNativeShare").onclick=share;$("posterCopyLink").onclick=copy;
  $("posterPreview").onclick=()=>{if(objectUrl)window.open(objectUrl,"_blank","noopener")};
 dlg.addEventListener("close",()=>{if(!working){/* Keep blob until next generation for iOS download reliability. */}});
});
window.LYXPoster={open};
})();
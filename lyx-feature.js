/* Resource Lab featured review: only published records are shown. */
(function(){
"use strict";
var box=document.getElementById("lyx-review-spot");if(!box)return;
var weights=[.30,.20,.20,.10,.10,.10];
function txt(node,s){if(node)node.textContent=s}
function safeIcon(url){url=String(url||"");return /^assets\/lyx\/[a-z0-9._/-]+\.(svg|png|webp)$/i.test(url)||/^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(url)?url:"assets/lyx/shangdaoji.svg"}
fetch("./data/lyx-reviews.json?ts="+Date.now(),{cache:"no-store"})
.then(function(r){if(!r.ok)throw Error("HTTP "+r.status);return r.json()})
.then(function(d){
 var items=(Array.isArray(d.reviews)?d.reviews:[]).filter(function(a){return a&&a.status==="published"}).sort(function(a,b){return Number(a.order||999)-Number(b.order||999)});
 if(!items.length){box.querySelector(".lyx-preview").hidden=true;txt(box.querySelector(".lyx-micro"),"暂无公开评测，进入中心可查看后续更新。");return}
 var a=items[0],s=(a.scores||[]).reduce(function(n,v,i){return n+Number(v||0)*(weights[i]||0)},0),rank=s>=90?"旗舰推荐":s>=85?"优选推荐":s>=80?"值得尝试":s>=70?"可以尝试":"暂不推荐",range=s>=90?"90–100":s>=85?"85–89":s>=80?"80–84":s>=70?"70–79":"70 以下";
 var img=box.querySelector("#lyxFeaturedIcon");if(img){img.src="./"+safeIcon(a.icon);if(String(a.icon||"").startsWith("data:"))img.src=a.icon;img.alt=a.name+" 应用图标"}
 txt(box.querySelector(".lyx-appname"),a.name);
 var small=box.querySelector(".lyx-appname small");if(small){box.querySelector(".lyx-appname").appendChild(small);txt(small,(a.category||"")+(a.subtitle?" · "+a.subtitle:""))}
 txt(box.querySelector(".lyx-score strong"),s.toFixed(0));
 txt(box.querySelector(".lyx-rank"),rank+" · "+range+" 分");
 txt(box.querySelector(".lyx-hint"),"LYX 已发布 "+items.length+" 份应用评测");
 box.querySelector(".lyx-preview").setAttribute("aria-label","本期评测："+a.name+"，综合评分 "+s.toFixed(1)+"，"+rank);
}).catch(function(){ /* Static accessible fallback is already present in HTML. */ });
})();
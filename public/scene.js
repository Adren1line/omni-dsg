/* Omni DSG — сцены стадий: псевдо-3D диорама в аксонометрии (canvas 2D) */
(function(){
"use strict";
var LW=880, LH=470;
var RM=false; try{RM=window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){}
var BRK_KEY="omni-dsg-breaks";
var HOVER_TXT=["Привет!","Здравствуйте","Добрый день","Работаем","Рад видеть"];
var CLICK_TXT=["Ой","Не тыкайте, пожалуйста","Я работаю…","Щекотно","Хватит","Серьёзно?","Ещё раз — и ухожу на перерыв"];
var STEPS4=["Бетонная коробка","Каркас перегородок","Обшивка ГКЛ","Полы","Покраска","Молдинги и декор","Мебель","Шторы и ковры"];
var CAP=[
  function(f){return f<1?"Обмеряем объект: нивелир, лазерный уровень, рулетка":"Обмерный план готов"},
  function(f){return f<1?"Концепция: планировка с мебелью, референсы, материалы":"Концепция утверждена: альбом и макет"},
  function(f){return f<1?(f<.55?"Рабочий проект: архитектурные листы":"Рабочий проект: инженерия — электрика, вода, вентиляция"):"Рабочий проект выпущен"},
  function(f){return f<1?"Комплектация: звонки поставщикам, прайсы и КП":"Комплектация собрана"},
  function(f){var i=Math.min(7,Math.floor(f*8));return f<1?"Стройка: "+STEPS4[i].toLowerCase():"Ремонт завершён"},
  function(f){return f<1?"Сдача объекта: финальная уборка и проверка":"Объект сдан"}
];
/* палитра бренда */
var C={plinth:"#dcd7cc",wall:"#f6f1e6",concrete:"#a9a59d",stud:"#aab4bf",gkl:"#f7f4ec",paint:"#ecdcc3",oak:"#cf8d50",graphite:"#353a40",
  taupe:"#9a6f55",sand:"#7fa6cf",stone:"#96a0aa",fabric:"#4f9a8c",brass:"#e2a63c",sage:"#4f9d3f",glass:"#a7d8f0",marble:"#f2f0eb",white:"#fcfbf7",
  skin:"#f1c9a5",ochre:"#f5c400",laser:"#e8322a"};
var CLOTH=["#3d7cc9","#d9534f","#46a86a","#f2f1ec","#f2a33a","#7a5bb5","#2f9fb0"];
var SKINS=["#f3cba7","#e2ad86","#c98d64","#f6d8bd","#a8714c"];
var HAIRS=["#3b2a20","#6b4423","#1f1b18","#c9a36a","#8a3b22"];

function rnd(a,b){return a+Math.random()*(b-a)}
function pick(a){return a[Math.floor(Math.random()*a.length)]}
function hash(s){var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h)}
function clamp(v,a,b){return v<a?a:v>b?b:v}
function hex2(h){var n=parseInt(h.slice(1),16);return [n>>16,(n>>8)&255,n&255]}
function sh(h,f,a){var c=hex2(h);return "rgba("+Math.min(255,c[0]*f|0)+","+Math.min(255,c[1]*f|0)+","+Math.min(255,c[2]*f|0)+","+(a==null?1:a)+")"}
function mix(a,b,t){var x=hex2(a),y=hex2(b);return "#"+[0,1,2].map(function(i){var v=Math.round(x[i]+(y[i]-x[i])*t).toString(16);return v.length<2?"0"+v:v}).join("")}
function loadBreaks(){try{return JSON.parse(localStorage.getItem(BRK_KEY))||{}}catch(e){return {}}}
function saveBreaks(b){try{localStorage.setItem(BRK_KEY,JSON.stringify(b))}catch(e){}}

var S=null;

/* ---------- проекция ---------- */
var AX=[0.9,0.30], AZ=[-0.62,0.42], AY=0.9;
function P(x,y,z){return [S.cx+(x*AX[0]+z*AZ[0])*S.k, S.cy+(x*AX[1]+z*AZ[1]-y*AY)*S.k]}
function depth(x,y,z){return x*AX[1]+z*AZ[1]+y*0.12}
function fit(x0,x1,z0,z1,y1){
  var pts=[[x0,0,z0],[x1,0,z0],[x0,0,z1],[x1,0,z1],[x0,y1,z0],[x1,y1,z0],[x0,y1,z1],[x1,-.35,z1],[x0,-.35,z1]];
  S.k=1;S.cx=0;S.cy=0; var mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9;
  pts.forEach(function(p){var q=P(p[0],p[1],p[2]);mnx=Math.min(mnx,q[0]);mxx=Math.max(mxx,q[0]);mny=Math.min(mny,q[1]);mxy=Math.max(mxy,q[1])});
  var k=Math.min((LW-40)/(mxx-mnx),(LH-30)/(mxy-mny)); S.k=k; S.cx=LW/2-(mnx+mxx)/2*k; S.cy=LH/2-(mny+mxy)/2*k+4;
}
function poly(c,pts){c.beginPath();c.moveTo(pts[0][0],pts[0][1]);for(var i=1;i<pts.length;i++)c.lineTo(pts[i][0],pts[i][1]);c.closePath()}

/* ---------- примитивы ---------- */
function Box(x0,x1,y0,y1,z0,z1,col,o){o=o||{};return {t:"box",x0:x0,x1:x1,y0:y0,y1:y1,z0:z0,z1:z1,col:col,a:o.a==null?1:o.a,at:o.at,sh:o.sh!==false&&y0<.05,s:o.at==null?1:0,edge:o.edge!==false,key:o.key,tex:o.tex,colFn:o.colFn,grow:o.grow||"y",top:o.top,pre:!!o.pre,post:!!o.post,out:!!o.out}}
function Cyl(x,z,r,y0,y1,col,o){o=o||{};return {t:"cyl",x:x,z:z,r:r,y0:y0,y1:y1,col:col,a:o.a==null?1:o.a,at:o.at,s:o.at==null?1:0,sh:o.sh!==false&&y0<.05,rz:o.rz||r}}
function drawBox(c,b){
  var s=b.s, x0=b.x0,x1=b.x1,y0=b.y0,y1=b.y1,z0=b.z0,z1=b.z1;
  if(s<1){ if(b.grow==="y") y1=y0+(y1-y0)*s; else if(b.grow==="x") x1=x0+(x1-x0)*s; else if(b.grow==="z") z1=z0+(z1-z0)*s; else { var cx=(x0+x1)/2,cz=(z0+z1)/2; x0=cx+(x0-cx)*s;x1=cx+(x1-cx)*s;z0=cz+(z0-cz)*s;z1=cz+(z1-cz)*s;y1=y0+(y1-y0)*s } }
  var col=b.colFn?b.colFn():b.col, a=b.a*Math.min(1,s*1.5);
  var T=[P(x0,y1,z0),P(x1,y1,z0),P(x1,y1,z1),P(x0,y1,z1)], F=[P(x0,y0,z1),P(x1,y0,z1),P(x1,y1,z1),P(x0,y1,z1)], R=[P(x1,y0,z0),P(x1,y0,z1),P(x1,y1,z1),P(x1,y1,z0)];
  c.lineWidth=.7; c.lineJoin="round";
  var cool=mix(col,"#4d6189",.16), warm=mix(col,"#fff1cf",.18), tall=(y1-y0)>.7;
  function grad(face,f1,f2,base){ if(!tall) return sh(base,f1,a); var g=c.createLinearGradient(0,face[3][1],0,face[0][1]); g.addColorStop(0,sh(base,f1*1.04,a)); g.addColorStop(1,sh(base,f2,a)); return g }
  poly(c,R); c.fillStyle=grad(R,.78,.66,cool); c.fill(); if(b.edge){c.strokeStyle=sh(col,.55,.4*a);c.stroke()}
  poly(c,F); c.fillStyle=grad(F,.94,.8,col); c.fill(); if(b.edge){c.strokeStyle=sh(col,.55,.4*a);c.stroke()}
  poly(c,T); c.fillStyle=sh(warm,1.04,a); c.fill(); if(b.edge){c.strokeStyle=sh(col,.62,.35*a);c.stroke()}
  if(a>.5){ c.strokeStyle="rgba(255,255,255,"+(.55*a)+")"; c.lineWidth=1; c.beginPath(); c.moveTo(T[3][0],T[3][1]); c.lineTo(T[2][0],T[2][1]); if(b.edge) c.lineTo(T[1][0],T[1][1]); c.stroke() }
  if(b.top&&s>.98) b.top(c,b);
}
function hull(p){p=p.slice().sort(function(a,b){return a[0]-b[0]||a[1]-b[1]});function cr(o,a,b){return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])}
  var lo=[],up=[],i;for(i=0;i<p.length;i++){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p[i])<=0)lo.pop();lo.push(p[i])}
  for(i=p.length-1;i>=0;i--){while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p[i])<=0)up.pop();up.push(p[i])}up.pop();lo.pop();return lo.concat(up)}
function ring(x,y,z,r,rz,n){var o=[];for(var i=0;i<n;i++){var a=i/n*Math.PI*2;o.push(P(x+Math.cos(a)*r,y,z+Math.sin(a)*rz))}return o}
function drawCyl(c,b){
  var s=b.s, y1=b.y0+(b.y1-b.y0)*s, a=b.a*Math.min(1,s*1.5);
  var bot=ring(b.x,b.y0,b.z,b.r,b.rz,28), top=ring(b.x,y1,b.z,b.r,b.rz,28);
  var h=hull(bot.concat(top)); poly(c,h);
  var l=P(b.x-b.r,b.y0,b.z+b.rz*0)[0], r=P(b.x+b.r,b.y0,b.z)[0], g=c.createLinearGradient(Math.min(l,r)-b.r*S.k*.6,0,Math.max(l,r)+b.r*S.k*.6,0);
  g.addColorStop(0,sh(b.col,.98,a)); g.addColorStop(.55,sh(b.col,.86,a)); g.addColorStop(1,sh(b.col,.72,a)); c.fillStyle=g; c.fill();
  poly(c,top); c.fillStyle=sh(b.col,1.04,a); c.fill(); c.strokeStyle=sh(b.col,.7,.25*a); c.lineWidth=.6; c.stroke();
}
function shadowOf(c,b){
  var h=(b.t==="cyl"?b.y1-b.y0:b.y1-b.y0)*(b.s||1), dx=h*.32, dz=h*.22, pts;
  if(b.t==="cyl"){ pts=ring(b.x,0,b.z,b.r,b.rz,16).concat(ring(b.x+dx,0,b.z+dz,b.r,b.rz,16)) }
  else { var x0=b.x0,x1=b.x1,z0=b.z0,z1=b.z1; if(b.s<1&&b.grow!=="y"){} pts=[[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0+dx,z0+dz],[x1+dx,z0+dz],[x1+dx,z1+dz],[x0+dx,z1+dz]].map(function(q){return P(q[0],0.002,q[1])}) }
  poly(c,hull(pts)); c.fill();
}
/* плоскость с картинкой: O — левый верх, U — вправо (вся ширина), V — вниз (вся высота) */
function plane(c,img,O,U,V,sw,alpha){
  var o=P(O[0],O[1],O[2]), u=P(O[0]+U[0],O[1]+U[1],O[2]+U[2]), v=P(O[0]+V[0],O[1]+V[1],O[2]+V[2]);
  var w=img.width, h=img.height, f=sw==null?1:sw;
  c.save(); c.globalAlpha=alpha==null?1:alpha; c.setTransform(S.dpr*(u[0]-o[0])/w,S.dpr*(u[1]-o[1])/w,S.dpr*(v[0]-o[0])/h,S.dpr*(v[1]-o[1])/h,S.dpr*o[0],S.dpr*o[1]);
  if(f>0) c.drawImage(img,0,0,w*f,h,0,0,w*f,h); c.restore();
}
function cv(w,h){var e=document.createElement("canvas");e.width=w;e.height=h;return e}

/* ---------- текстуры ---------- */
var TX={};
function texWood(){ if(TX.wood) return TX.wood; var e=cv(800,560),c=e.getContext("2d"); c.fillStyle=C.oak; c.fillRect(0,0,800,560);
  for(var r=0;r<28;r++){ var y=r*20, off=(r*137)%160; for(var x=-off;x<800;x+=160){ var t=(hash("w"+r+"_"+x)%20-10)/100; c.fillStyle=sh(C.oak,1+t); c.fillRect(x+1,y+1,158,18); c.strokeStyle="rgba(120,85,50,.10)"; c.beginPath(); c.moveTo(x+10,y+9+t*20); c.bezierCurveTo(x+60,y+5,x+100,y+14,x+150,y+9); c.stroke() } }
  c.strokeStyle="rgba(90,60,35,.25)"; for(r=0;r<=28;r++){c.beginPath();c.moveTo(0,r*20);c.lineTo(800,r*20);c.stroke()} return TX.wood=e }
function texConcrete(){ if(TX.conc) return TX.conc; var e=cv(400,280),c=e.getContext("2d"); c.fillStyle="#b3aea5"; c.fillRect(0,0,400,280);
  for(var i=0;i<900;i++){var h=hash("c"+i);c.fillStyle="rgba("+(h%2?255:60)+","+(h%2?255:55)+","+(h%2?255:50)+",.07)";c.fillRect(h%400,(h>>9)%280,2+(h>>3)%3,2)} return TX.conc=e }
function texRug(){ if(TX.rug) return TX.rug; var e=cv(300,200),c=e.getContext("2d"); c.fillStyle="#c8714c"; c.fillRect(0,0,300,200); c.strokeStyle="rgba(255,236,200,.7)"; c.lineWidth=6; c.strokeRect(14,14,272,172); c.strokeStyle="rgba(70,60,50,.18)"; c.lineWidth=1; for(var i=0;i<300;i+=4){c.beginPath();c.moveTo(i,0);c.lineTo(i,200);c.stroke()} return TX.rug=e }

var PLAN=[[60,50,450,50],[450,50,450,270],[450,270,60,270],[60,270,60,50],[280,50,280,160],[280,200,280,270],[280,160,450,160],[360,160,360,270],
  [60,290,450,290],[60,284,60,296],[450,284,450,296],[36,50,36,270],[30,50,42,50],[30,270,42,270]];
var ENG=[[[90,80,230,80],[230,80,230,240],[150,240,230,240]],[[300,80,430,80],[430,80,430,140],[300,140,430,140]],[[90,250,250,250],[250,250,250,180],[380,230,430,230]]];
function segsDraw(c,segs,f){ var tot=0,i; for(i=0;i<segs.length;i++) tot+=Math.hypot(segs[i][2]-segs[i][0],segs[i][3]-segs[i][1]);
  var left=tot*clamp(f,0,1),tip=null; c.beginPath(); for(i=0;i<segs.length&&left>0;i++){var s=segs[i],L=Math.hypot(s[2]-s[0],s[3]-s[1]),k=Math.min(1,left/L); c.moveTo(s[0],s[1]); tip=[s[0]+(s[2]-s[0])*k,s[1]+(s[3]-s[1])*k]; c.lineTo(tip[0],tip[1]); left-=L} c.stroke(); return tip }
function paper(c,w,h){ c.fillStyle="#fbfaf8"; c.fillRect(0,0,w,h); c.strokeStyle="rgba(44,44,43,.25)"; c.lineWidth=1; c.strokeRect(8,8,w-16,h-16); c.strokeRect(w-150,h-44,142,36) }
function title(c,t,w,h){ c.fillStyle="#2c2c2b"; c.font="500 11px Montserrat, Arial"; c.fillText("OMNI DSG",w-142,h-30); c.fillStyle="#8b8378"; c.font="400 9px Montserrat, Arial"; c.fillText(t,w-142,h-17) }
function approved(c,x,y,t){ c.save(); c.translate(x,y); c.rotate(-.06); c.strokeStyle="#2c2c2b"; c.lineWidth=1.5; c.strokeRect(-70,-16,140,30); c.fillStyle="#2c2c2b"; c.font="600 12px Montserrat, Arial"; c.textAlign="center"; c.fillText(t,0,4); c.restore() }
function boardTex(st,f,t){
  var e=TX.board||(TX.board=cv(512,320)), c=e.getContext("2d"); c.setTransform(1,0,0,1,0,0); paper(c,512,320);
  if(st===1){ c.strokeStyle="rgba(44,44,43,.45)"; c.lineWidth=2; segsDraw(c,PLAN.slice(0,8),1);
    [[80,190,120,50],[90,70,90,60],[300,70,90,62],[380,190,58,58],[300,220,44,30]].forEach(function(r,i){var k=clamp(f*6-i,0,1); if(!k) return; c.globalAlpha=k; c.fillStyle=["#cfc8bc","#ddd6ca","#c9cdd0","#d8cfbf","#e1ddd5"][i]; c.fillRect(r[0],r[1],r[2],r[3]); c.strokeStyle="rgba(44,44,43,.55)"; c.lineWidth=1; c.strokeRect(r[0],r[1],r[2],r[3])}); c.globalAlpha=1;
    [[300,182,64,46,["#d7c7b2","#8b7a66"]],[372,182,46,46,["#b9b3aa","#5b6355"]],[300,232,46,30,["#e6e1d8","#9a7458"]]].forEach(function(m,i){var k=clamp((f-.3)*5-i,0,1); if(!k) return; c.globalAlpha=k; var g=c.createLinearGradient(0,m[1],0,m[1]+m[3]); g.addColorStop(0,m[4][0]); g.addColorStop(1,m[4][1]); c.fillStyle="#fff"; c.fillRect(m[0]-3,m[1]-3,m[2]+6,m[3]+6); c.fillStyle=g; c.fillRect(m[0],m[1],m[2],m[3])}); c.globalAlpha=1;
    ["#c7a47f","#e9e7e2","#9d968b","#2c2c2b"].forEach(function(col,i){var k=clamp((f-.5)*6-i,0,1); if(!k) return; c.globalAlpha=k; c.fillStyle=col; c.fillRect(356+i*22,238,18,18); c.strokeStyle="rgba(0,0,0,.15)"; c.strokeRect(356+i*22,238,18,18)}); c.globalAlpha=1;
    title(c,"Концепция",512,320); if(f>=1) approved(c,170,30,"УТВЕРЖДЕНО") }
  else if(st===2){ c.strokeStyle="#2c2c2b"; c.lineWidth=2; var tip=segsDraw(c,PLAN,Math.min(1,f/.55)); var ef=Math.max(0,(f-.55)/.45);
    ["#9a5a42","#4f6a83","#6b7a5e"].forEach(function(col,i){c.strokeStyle=col;c.lineWidth=1.6;c.setLineDash(i===2?[5,4]:[]);var k=ef*3-i,tp=segsDraw(c,ENG[i],k);if(tp&&k>0&&k<1)tip=tp}); c.setLineDash([]);
    if(f<1&&tip) pencil(c,tip[0],tip[1],t); title(c,"Рабочий проект · АР, ЭОМ, ВК",512,320); if(f>=1) approved(c,170,30,"В ПРОИЗВОДСТВО") }
  else if(st===3){ c.fillStyle="#d8d2c8"; c.fillRect(0,0,512,320); var n=Math.ceil(f*9);
    for(var i=0;i<n;i++){var px=26+(i%3)*160,py=20+Math.floor(i/3)*98; c.save(); c.translate(px+68,py+44); c.rotate(((hash("p"+i)%7)-3)*.015); c.fillStyle="rgba(0,0,0,.1)"; c.fillRect(-64,-38,132,84); c.fillStyle="#fbfaf8"; c.fillRect(-66,-42,132,84);
      c.fillStyle="#2c2c2b"; c.font="600 10px Montserrat, Arial"; c.fillText(["Прайс","КП","Счёт"][i%3]+" № "+(i+1),-56,-24); c.fillStyle="#cdc7bd"; for(var j=0;j<5;j++) c.fillRect(-56,-12+j*9,90-(j%2)*30,3);
      c.fillStyle="#8b8378"; c.beginPath(); c.arc(0,-40,3,0,7); c.fill(); c.restore()} }
  return e;
}
function pencil(c,x,y,t){ var b=Math.sin(t*18)*1.2; c.save(); c.translate(x,y+b); c.rotate(-.75); c.fillStyle="#2c2c2b"; c.fillRect(0,-3.5,42,7); c.fillStyle="#b0905f"; c.fillRect(38,-3.5,6,7); c.fillStyle="#e3d6c3"; c.beginPath(); c.moveTo(0,-3.5); c.lineTo(-10,0); c.lineTo(0,3.5); c.fill(); c.fillStyle="#2c2c2b"; c.beginPath(); c.moveTo(-6,-1.3); c.lineTo(-10,0); c.lineTo(-6,1.3); c.fill(); c.restore() }
function chalkTex(f){ var e=TX.chalk||(TX.chalk=cv(600,420)), c=e.getContext("2d"); c.clearRect(0,0,600,420); c.strokeStyle="rgba(255,255,255,.85)"; c.lineWidth=3; c.setLineDash([]);
  var s=[[30,30,570,30],[570,30,570,390],[570,390,30,390],[30,390,30,30],[396,30,396,264],[396,264,570,264],[30,410,570,410],[12,30,12,390]];
  segsDraw(c,s,f); if(f>.9){ c.fillStyle="rgba(255,255,255,.9)"; c.font="600 20px Montserrat, Arial"; c.fillText("10 000",260,404); c.save(); c.translate(26,240); c.rotate(-Math.PI/2); c.fillText("7 000",0,0); c.restore() } return e }

/* ---------- миры ---------- */
function wallRun(items,x0,z0,x1,z1,h,t,col,gaps,o){ // разбивает на куски по 0.5 м
  var L=Math.hypot(x1-x0,z1-z0), ux=(x1-x0)/L, uz=(z1-z0)/L, n=(o&&(o.pre||o.post))?1:Math.ceil(L/.5);
  if(o&&(o.pre||o.post)&&gaps&&gaps.length){ var cuts=[0]; gaps.forEach(function(q){cuts.push(q[0],q[1])}); cuts.push(L); for(var ci=0;ci+1<cuts.length;ci++){ var A0=cuts[ci],B0=cuts[ci+1]; (function(a,b){ var mid=(a+b)/2, g=null; gaps.forEach(function(q){ if(mid>q[0]&&mid<q[1]) g=q }); var oo={}; for(var kk in o) oo[kk]=o[kk]; if(oo.edge==null) oo.edge=false;
    function seg(y0,y1){ var xa=x0+ux*a, za=z0+uz*a, xb=x0+ux*b, zb=z0+uz*b; items.push(Box(Math.min(xa,xb)-(uz?t/2:0),Math.max(xa,xb)+(uz?t/2:0),y0,y1,Math.min(za,zb)-(ux?t/2:0),Math.max(za,zb)+(ux?t/2:0),col,oo)) }
    if(!g) seg(0,h); else { if(g[2]>0) seg(0,g[2]); if(g[3]<h) seg(g[3],h) } })(A0,B0) } return }
  for(var i=0;i<n;i++){ var a=i*L/n-(i>0?.01:0), b=(i+1)*L/n+(i<n-1?.01:0), mid=(a+b)/2, g=null; (gaps||[]).forEach(function(q){ if(mid>q[0]&&mid<q[1]) g=q });
    function seg(y0,y1){ var xa=x0+ux*a, za=z0+uz*a, xb=x0+ux*b, zb=z0+uz*b;
      var bx0=Math.min(xa,xb)-(uz?t/2:0), bx1=Math.max(xa,xb)+(uz?t/2:0), bz0=Math.min(za,zb)-(ux?t/2:0), bz1=Math.max(za,zb)+(ux?t/2:0);
      var oo={}; for(var k in (o||{})) oo[k]=o[k]; if(oo.edge==null) oo.edge=false; items.push(Box(bx0,bx1,y0,y1,bz0,bz1,col,oo)) }
    if(!g) seg(0,h); else { if(g[2]>0) seg(0,g[2]); if(g[3]<h) seg(g[3],h) } }
}
var GL={a:.45};
function entrance(it,dx,col,leaf){ // входная дверь в передней стене (проём 1 м)
  var o={post:true,sh:false};
  it.push(Box(dx-.56,dx-.48,0,2.15,3.36,3.64,col,o),Box(dx+.48,dx+.56,0,2.15,3.36,3.64,col,o),Box(dx-.56,dx+.56,2.07,2.17,3.36,3.64,col,o));
  if(leaf) it.push(Box(dx+.45,dx+.5,0,2.05,2.46,3.34,"#c4955f",{sh:false}),Box(dx+.42,dx+.45,.95,1.02,2.58,2.68,C.brass,{sh:false}));
  it.push(Box(dx-.45,dx+.45,0,.015,3.66,4.05,"#6b4f3a",{out:true,sh:false,edge:false}));
}
function innerDoor(it,x0,x1,z0,z1,at,st){ // проём в перегородке: коробка + приоткрытое полотно
  var a=st===5?undefined:at, col="#e9e1d4", along=(x1-x0)>(z1-z0), b=[];
  if(along){ b.push(Box(x0,x0+.06,0,2.1,z0-.02,z1+.02,col),Box(x1-.06,x1,0,2.1,z0-.02,z1+.02,col),Box(x0,x1,2.04,2.12,z0-.02,z1+.02,col),Box(x0+.06,x0+.1,0,2.02,z1,z1+.7,"#f3eee6"),Box(x0+.1,x0+.13,.95,1.0,z1+.55,z1+.62,C.brass)) }
  else { b.push(Box(x0-.02,x1+.02,0,2.1,z0,z0+.06,col),Box(x0-.02,x1+.02,0,2.1,z1-.06,z1,col),Box(x0-.02,x1+.02,2.04,2.12,z0,z1,col),Box(x1,x1+.7,0,2.02,z1-.1,z1-.06,"#f3eee6"),Box(x1+.55,x1+.62,.95,1.0,z1-.13,z1-.1,C.brass)) }
  b.forEach(function(q){ q.sh=false; q.at=a; q.s=a==null?1:0; it.push(q) });
}
function apartment(st,f){
  var it=[], fin=st===5||f>=1, step=st===5?8:st===4?f*8:0;
  function sp(k){return st===5?-1:k/8} // порог стадии стройки
  var paintCol=function(){var p=st===5?1:clamp(step-4,0,1); return mix(C.gkl,C.paint,p)};
  var ext= (st===0||(st===4&&step<2)) ? C.concrete : null;
  // наружные стены
  var wc=st===0||st===4?C.concrete:C.paint;
  wallRun(it,-5,-3.5,5,-3.5,2.6,.24,wc,[[1.2,2.9,.85,2.25],[6.9,8.4,.85,2.25]],{pre:true});
  wallRun(it,-5,-3.5,-5,3.5,2.6,.24,wc,[],{pre:true});
  wallRun(it,5,-3.5,5,3.5,.9,.24,wc,[],{post:true});
  wallRun(it,-5,3.5,5,3.5,.9,.24,wc,[[5.6,6.6,0,9]],{post:true});
  entrance(it,1.1,"#6b5646", st===5||(st===4&&step>=6));
  // стёкла
  it.push(Box(-3.8,-2.1,.85,2.25,-3.52,-3.48,C.glass,{a:.55,sh:false,pre:true})); it.push(Box(1.9,3.4,.85,2.25,-3.52,-3.48,C.glass,{a:.55,sh:false,pre:true}));
  if(st===4||st===5){
    // каркас перегородок
    if(st===4 && step<3){ for(var i=0;i<=6;i++){ var z=-3.4+i*.62; if(z>-0.7&&z<0.2) continue; it.push(Box(1.56,1.64,0,2.6,z-.03,z+.03,C.stud,{at:sp(1+i/7*.9),sh:false})) }
      for(i=0;i<=5;i++){ var x=1.7+i*.62; if(x>2.3&&x<3.1) continue; it.push(Box(x-.03,x+.03,0,2.6,.36,.44,C.stud,{at:sp(1+(i+7)/13*.9),sh:false})) }
      it.push(Box(1.56,1.64,2.55,2.6,-3.5,.4,C.stud,{at:sp(1),sh:false})); it.push(Box(1.6,5,2.55,2.6,.36,.44,C.stud,{at:sp(1.1),sh:false})) }
    // перегородки ГКЛ (+ покраска)
    var pc={colFn:paintCol};
    var pAt=function(i,n){return st===5?undefined:sp(2+i/n*.95)};
    var j=0; [[-3.5,-2.9],[-2.9,-2.3],[-2.3,-1.7],[-1.7,-1.1],[-1.1,-.7],[.2,.4]].forEach(function(r){ it.push(Box(1.54,1.66,0,2.6,r[0],r[1],C.gkl,{edge:false,colFn:paintCol,at:pAt(j++,12),sh:false})) });
    it.push(Box(1.54,1.66,2.1,2.6,-.7,.2,C.gkl,{edge:false,colFn:paintCol,at:pAt(6,12),sh:false}));
    [[1.66,2.3],[3.1,3.7],[3.7,4.3],[4.3,4.88]].forEach(function(r){ it.push(Box(r[0],r[1],0,2.6,.34,.46,C.gkl,{edge:false,colFn:paintCol,at:pAt(j++,12),sh:false})) });
    it.push(Box(2.3,3.1,2.1,2.6,.34,.46,C.gkl,{edge:false,colFn:paintCol,at:pAt(11,12),sh:false}));
    if(st===5||step>=2){ innerDoor(it,1.54,1.66,-.7,.2,2.96,st); innerDoor(it,2.3,3.1,.34,.46,2.98,st) }
    // облицовка наружных стен изнутри
    var L1=[]; wallRun(L1,-4.86,-3.36,4.86,-3.36,2.6,.04,C.gkl,[[1.06,2.76,.85,2.25],[6.76,8.26,.85,2.25]],{sh:false,pre:true});
    wallRun(L1,-4.86,-3.36,-4.86,3.36,2.6,.04,C.gkl,[],{sh:false,pre:true});
    L1.forEach(function(b,i){ b.colFn=paintCol; if(st===4){ b.at=sp(2+i/L1.length*.95); b.s=0 } it.push(b) });
    // молдинги
    function mold(b){ b.pre=true; b.at=st===5?undefined:sp(5+Math.random()*.9); b.s=st===5?1:0; b.sh=false; it.push(b) }
    if(step>=5||st===5){ [[-.2,.9],[1.2,2.5]].forEach(function(r){ [[r[0],r[1],.5,.53],[r[0],r[1],1.6,1.63]].forEach(function(q){ mold(Box(-4.84,-4.81,q[2],q[3],r[0],r[1],C.white)) }); mold(Box(-4.84,-4.81,.5,1.63,r[0],r[0]+.03,C.white)); mold(Box(-4.84,-4.81,.5,1.63,r[1]-.03,r[1],C.white)) });
      mold(Box(-4.86,4.86,2.48,2.6,-3.34,-3.24,C.white)); mold(Box(-4.84,-4.74,2.48,2.6,-3.34,3.3,C.white)); mold(Box(-4.86,4.86,0,.08,-3.34,-3.3,C.white)); mold(Box(-4.84,-4.8,0,.08,-3.34,3.3,C.white));
      var art=Box(-4.8,-4.76,.8,1.35,1.45,2.25,C.graphite); mold(art); var art2=Box(-4.76,-4.74,.86,1.29,1.52,2.18,C.brass); mold(art2) }
    // мебель
    if(step>=6||st===5){ var fa=function(k){return st===5?undefined:sp(6+k)};
      var F=[ // гостиная
        Box(-3.9,-1.4,0,.42,1.25,2.15,C.fabric,{at:fa(.05)}),Box(-3.9,-1.4,.42,.85,1.95,2.15,C.fabric,{at:fa(.1)}),Box(-3.9,-3.65,.42,.62,1.25,2.15,C.fabric,{at:fa(.1)}),Box(-1.65,-1.4,.42,.62,1.25,2.15,C.fabric,{at:fa(.1)}),
        Box(-3.1,-2.2,0,.36,.15,.75,C.marble,{at:fa(.2)}),
        // кухня
        Box(-4.86,-4.2,0,.88,-3.3,-.6,C.white,{at:fa(.3)}),Box(-4.86,-4.15,.88,.92,-3.3,-.6,C.graphite,{at:fa(.32)}),Box(-4.86,-4.5,1.45,2.2,-3.3,-.6,C.white,{at:fa(.36)}),
        Box(-2.9,-1.3,.72,.76,-2.6,-1.6,C.oak,{at:fa(.42)}),Box(-2.85,-2.8,0,.72,-2.55,-2.5,C.graphite,{at:fa(.42)}),Box(-1.4,-1.35,0,.72,-1.7,-1.65,C.graphite,{at:fa(.42)}),Box(-2.85,-2.8,0,.72,-1.7,-1.65,C.graphite,{at:fa(.42)}),Box(-1.4,-1.35,0,.72,-2.55,-2.5,C.graphite,{at:fa(.42)}),
        Box(-2.7,-2.3,0,.46,-1.45,-1.05,C.taupe,{at:fa(.48)}),Box(-1.9,-1.5,0,.46,-1.45,-1.05,C.taupe,{at:fa(.5)}),
        // спальня
        Box(1.7,3.75,0,.48,-3.2,-1.4,C.white,{at:fa(.58)}),Box(1.7,1.82,.48,1.1,-3.2,-1.4,C.taupe,{at:fa(.6)}),Box(1.85,2.5,.48,.62,-3.0,-1.6,C.sand,{at:fa(.62)}),
        Box(1.7,2.15,0,.5,-1.35,-.95,C.oak,{at:fa(.64)}),
        // прихожая
        Box(3.1,4.85,0,2.2,2.95,3.3,C.white,{at:fa(.7)}),
        Box(.4,.75,0,.5,2.6,2.95,C.graphite,{at:fa(.76)})
      ]; F.forEach(function(b){ if(st===5) b.s=1; it.push(b) });
      var lamp=Cyl(.6,2.8,.03,0,1.5,C.graphite,{at:fa(.78)}), shade=Cyl(.6,2.8,.18,1.5,1.72,"#efe6d4",{at:fa(.8)}); if(st===5){lamp.s=shade.s=1} it.push(lamp,shade);
      var pl=Cyl(-4.4,2.9,.18,0,.4,"#e7e3dc",{at:fa(.82)}),pl2=Cyl(-4.4,2.9,.3,.4,1.05,C.sage,{at:fa(.84)}); if(st===5){pl.s=pl2.s=1} it.push(pl,pl2);
      var pd=Cyl(-2.1,-2.1,.22,1.95,2.1,C.graphite,{at:fa(.86),sh:false}),pc2=Cyl(-2.1,-2.1,.01,2.1,2.6,C.graphite,{at:fa(.86),sh:false}); if(st===5) pd.s=pc2.s=1; it.push(pd,pc2) }
    // шторы
    if(step>=7||st===5){ [-3.95,-2.05,1.75,3.45].forEach(function(x,i){ for(var q=0;q<4;q++){ var b=Box(x-.16+q*.08,x-.08+q*.08,.05,2.45,-3.32+(q%2)*.05,-3.24+(q%2)*.05,"#d9cfbf",{at:st===5?undefined:sp(7+i*.08),sh:false,grow:"y"}); if(st===5)b.s=1; it.push(b) } });
      it.push(Box(-4.1,-1.9,2.45,2.48,-3.32,-3.28,C.graphite,{at:st===5?undefined:sp(7),sh:false}),Box(1.6,3.6,2.45,2.48,-3.32,-3.28,C.graphite,{at:st===5?undefined:sp(7),sh:false})) }
  }
  return {items:it, floor:function(c){
    var x0=-4.88,x1=4.88,z0=-3.38,z1=3.38;
    plane(c,texConcrete(),[x0,0,z0],[x1-x0,0,0],[0,0,z1-z0],1,1);
    if(st===0){ plane(c,chalkTex(f),[x0+.3,0.002,z0+.3],[x1-x0-.6,0,0],[0,0,z1-z0-.6],1,.95) }
    var wf=st===5?1:clamp(step-3,0,1); if(wf>0) plane(c,texWood(),[x0,.004,z0],[x1-x0,0,0],[0,0,z1-z0],wf,1);
    var rg=st===5?1:clamp((step-7)*2,0,1); if(rg>0) plane(c,texRug(),[-4.1,.008,.2],[3,0,0],[0,0,2.4],1,rg);
  }};
}
function studio(st,f){
  var it=[], car=true;
  wallRun(it,-5,-3.5,5,-3.5,2.6,.24,C.wall,[[1.4,3.1,.85,2.25],[6.8,8.2,.85,2.25]],{pre:true});
  wallRun(it,-5,-3.5,-5,3.5,2.6,.24,C.wall,[],{pre:true});
  wallRun(it,5,-3.5,5,3.5,.9,.24,C.wall,[],{post:true});
  wallRun(it,-5,3.5,5,3.5,.9,.24,C.wall,[[8.4,9.6,0,9]],{post:true});
  entrance(it,4,"#6b5646",true);
  it.push(Box(-3.6,-1.9,.85,2.25,-3.52,-3.48,C.glass,{a:.55,sh:false,pre:true}),Box(1.8,3.2,.85,2.25,-3.52,-3.48,C.glass,{a:.55,sh:false,pre:true}));
  // полка на задней стене
  it.push(Box(-1.6,1.6,1.55,1.6,-3.38,-3.05,C.oak,{sh:false,pre:true}),Box(-1.45,-1.4,1.35,1.55,-3.36,-3.2,C.graphite,{sh:false,pre:true}),Box(1.4,1.45,1.35,1.55,-3.36,-3.2,C.graphite,{sh:false,pre:true}));
  function desk(x,z){ it.push(Box(x-.8,x+.8,.72,.76,z-.4,z+.4,C.oak),Box(x-.78,x-.72,0,.72,z-.38,z-.32,C.graphite),Box(x+.72,x+.78,0,.72,z-.38,z-.32,C.graphite),Box(x-.78,x-.72,0,.72,z+.32,z+.38,C.graphite),Box(x+.72,x+.78,0,.72,z+.32,z+.38,C.graphite),
      Box(x-.3,x+.3,1.05,1.42,z-.3,z-.26,C.graphite,{sh:false,top:null}),Box(x-.04,x+.04,.76,1.05,z-.3,z-.24,C.graphite,{sh:false}),Box(x-.2,x+.2,.76,.78,z-.05,z+.12,C.stone,{sh:false}),
      Cyl(x,z+.68,.24,.42,.48,C.taupe),Cyl(x,z+.68,.04,0,.42,C.graphite,{sh:false})) }
  if(st===1){ desk(-1,-2.5) }
  if(st===2){ desk(-3.2,-2.5); desk(-.8,-2.5); it.push(Cyl(2.9,-1.4,.75,.7,.75,C.oak),Cyl(2.9,-1.4,.06,0,.7,C.graphite,{sh:false}),Box(2.5,3.2,.75,.76,-1.6,-1.2,"#fbfaf8",{sh:false})) }
  if(st===3){ desk(-3.2,-2.5); [[1.2,"tile"],[2.65,"light"],[4.1,"bath"]].forEach(function(q){ var x=q[0]; it.push(Box(x-.55,x+.55,0,.9,-3.1,-2.4,C.white));
      if(q[1]==="tile"){ for(var k=0;k<4;k++) it.push(Box(x-.4,x+.4,.9+k*.035,.93+k*.035,-2.95,-2.55,k%2?C.marble:C.stone,{sh:false})) }
      if(q[1]==="light"){ it.push(Box(x-.01,x+.01,1.25,2.6,-2.76,-2.74,C.graphite,{sh:false}),Cyl(x,-2.75,.22,1.05,1.25,C.brass,{sh:false})) }
      if(q[1]==="bath"){ it.push(Cyl(x,-2.75,.28,.9,1.08,C.white,{sh:false}),Box(x-.03,x+.03,1.08,1.28,-3.0,-2.95,C.brass,{sh:false})) } }) }
  // растения и мелочи
  it.push(Cyl(-4.4,2.8,.2,0,.42,"#e7e3dc"),Cyl(-4.4,2.8,.32,.42,1.1,C.sage));
  return {items:it, car:car, floor:function(c){ plane(c,texWood(),[-4.88,0,-3.38],[9.76,0,0],[0,0,6.76],1,1) },
    wall:function(c){ if(st>=1&&st<=3) plane(c,boardTex(st,S.f,S.t),[-4.86,2.55,-2.9],[0,0,3.6],[0,-1.75,0],1,1) }};
}
function trophies(it){
  var st=S.stage,f=S.f,done=function(k){return st>k||(st===k&&f>=1)};
  if(st<1||st>3) return;
  var x=-1.5, y=1.6, z0=-3.3, z1=-3.12;
  if(done(0)){ it.push(Cyl(x+.25,(z0+z1)/2,.05,y,y+.6,"#f6f4ef",{sh:false})); x+=.55 }
  if(done(1)){ ["#2c2c2b","#8b8378","#f3f1ec"].forEach(function(col,i){ it.push(Box(x+i*.09,x+i*.09+.07,y,y+.34,z0,z1,col,{sh:false})) }); x+=.32;
    it.push(Box(x,x+.42,y,y+.16,z0,z1,"#f6f4ef",{sh:false}),Box(x+.04,x+.38,y+.16,y+.26,z0+.02,z1-.02,C.taupe,{sh:false})); x+=.55 }
  if(done(2)){ for(var i=0;i<4;i++) it.push(Box(x+i*.08,x+i*.08+.065,y,y+.38,z0,z1,i%2?C.graphite:"#3d3d3b",{sh:false})); x+=.4;
    it.push(Cyl(x+.1,(z0+z1)/2,.09,y,y+.08,C.brass,{sh:false}),Box(x+.25,x+.28,y,y+.3,z0+.04,z0+.07,C.graphite,{sh:false}),Box(x+.25,x+.45,y,y+.03,z0+.04,z0+.07,C.graphite,{sh:false})); x+=.6 }
  if(done(3)){ it.push(Box(x,x+.3,y,y+.24,z0,z1,C.brass,{sh:false})) }
}

/* ---------- люди ---------- */
var FEM_NAMES=/^(Айгерим|Асель|Гульнар|Жанар|Айжан|Мерей|Сауле|Динара|Мадина|Карлыгаш|Шолпан|Ботагоз|Аружан|Жулдыз|Назерке|Камила|Кымбат|Перизат|Райхан|Гаухар|Ляззат)$/i;
var MALE_A=/^(Илья|Никита|Кузьма|Фома|Лука|Савва|Данила|Гаврила|Миша|Саша|Женя|Вова|Дима|Коля|Петя|Ваня|Лёша|Алёша|Серёжа|Паша|Костя|Гоша)$/i;
function isFemale(name){ var f=String(name||"").trim().split(/\s+/)[0]||""; if(FEM_NAMES.test(f)) return true; if(MALE_A.test(f)) return false; return /[ая]$/i.test(f) }
function mkPerson(id,name,role,x,z,gen){var h=hash(id), fem=!gen&&isFemale(name);return {fem:fem,beard:!fem&&((h>>14)%4===0),skirt:fem&&((h>>15)%2===0),id:id,name:name,role:role,x:x,z:z,fx:0,fz:1,cloth:gen?"#3d7cc9":CLOTH[h%CLOTH.length],leg:["#3c5d8a","#33363b","#6b5a48","#2f4f6f"][(h>>4)%4],skin:SKINS[(h>>6)%SKINS.length],hair:HAIRS[(h>>8)%HAIRS.length],hs:fem?1+((h>>10)%3):((h>>10)%2?0:4),plaid:gen||(!fem&&(h>>12)%3===0),task:null,pose:"idle",timer:rnd(.2,1.5),ph:rnd(0,6),bubble:null,react:null,clicks:[],off:false,sit:false,brk:0,generic:!!gen,slot:0,alpha:1}}
function say(p,t,d){p.bubble={t:t,life:d||2.6}}
function cast(st,team,o){
  var ppl=[];
  function u(fn){for(var i=0;i<team.length;i++) if(fn(team[i])) return team[i]; return null}
  function add(us,x,z,gen){ if(!us) return {}; var p=mkPerson(us.id,us.name,us.pos||"",x,z,gen); ppl.push(p); return p }
  var lead=team[0]||null, inSt=team.filter(function(t){return t.stages&&t.stages.indexOf(st)>=0});
  if(st===0){ add(inSt[0]||{id:"g-z1",name:"Замерщик",pos:"Замерщик"},-2,1,!inSt[0]).slot=0; add(inSt[1]||{id:"g-z2",name:"Помощник",pos:"Замерщик"},2.5,2,!inSt[1]).slot=1 }
  else if(st===1){ var d=inSt[0]||lead; add(d,-1,-1.82).slot=0; var v=inSt[1]; if(v) add(v,2,1).slot=1 }
  else if(st===2){ (inSt.length?inSt:[lead]).slice(0,3).forEach(function(t,i){ add(t,[-3.2,-.8,2.9][i],[-1.82,-1.82,-.5][i]).slot=i }) }
  else if(st===3){ add(inSt[0]||lead,0,0).slot=0 }
  else if(st===4){ inSt.slice(0,2).forEach(function(t,i){ add(t,[3.6,2.6][i],[2.2,2.8][i]).slot=9 }); add({id:"g-b1",name:"Нурлан",pos:"Бригада"},-2,0,true).slot=0; add({id:"g-b2",name:"Ахмет",pos:"Бригада"},1,1.5,true).slot=1 }
  else { add(inSt[0]||lead,-1.6,.6).slot=0; add(o.client||{id:"g-cl",name:"Заказчик",pos:"Заказчик"},-.7,.6).slot=1 }
  return ppl;
}
var FACE={back:[0,-1],front:[0,1],left:[-1,0],right:[1,0]};
function brain(p){
  var st=S.stage,f=S.f,i=p.slot;
  if(st===0){ var spots=[[-3.4,-2],[-1,-2.4],[-2.5,1.8],[0,1.2],[3,-1.8],[3.4,1.8],[-4,0]];
    if(i===0){ var s=pick(spots); return {x:s[0],z:s[1],pose:Math.random()<.75?"level":"note",dur:rnd(4,7),face:pick(["right","front"])} }
    var a=S.people[0]; s=pick(spots.filter(function(q){return !a||Math.hypot(q[0]-a.x,q[1]-a.z)>1.8})); return {x:s[0],z:s[1],pose:Math.random()<.7?"tape":"note",dur:rnd(3,5),faceTo:a} }
  if(st===1){ if(i===0){ if(Math.random()<.14&&carFree()) return {leave:true}; return {x:-1,z:-1.82,pose:"type",sit:true,dur:rnd(6,12),face:"back"} }
    var r=Math.random(); if(r<.45){var d=S.people[0]; if(d&&!d.off&&d.sit&&!d.away) return {x:-.1,z:-1.6,pose:"talk",dur:rnd(4,7),faceTo:d,talk:true}}
    if(r<.75) return {x:-3.8,z:-1,pose:"point",dur:rnd(3,5),face:"left"}; return {x:rnd(1.5,3.8),z:rnd(-.5,2.2),pose:"note",dur:rnd(3,6),face:"front"} }
  if(st===2){ var r2=Math.random(); if(r2<.12&&carFree()) return {leave:true};
    if(r2<.42){ var seat=[[2.1,-1.4],[3.7,-1.4],[2.9,-.55]][i]||[2.9,-.55]; return {x:seat[0],z:seat[1],pose:"talk",dur:rnd(4,7),face2:[2.9,-1.4],talk:true} }
    if(i<2) return {x:[-3.2,-.8][i],z:-1.82,pose:"type",sit:true,dur:rnd(6,11),face:"back"}; return {x:-3.8,z:rnd(-1.6,0),pose:"point",dur:rnd(3,5),face:"left"} }
  if(st===3){ var r3=Math.random(); if(r3<.55){ var x=pick([1.2,2.65,4.1]); return {x:x,z:-1.8,pose:Math.random()<.5?"phone":"talk",dur:rnd(3,5),face:"back",talk:true} }
    if(r3<.8) return {x:-3.2,z:-1.82,pose:"phone",sit:true,dur:rnd(4,7),face:"back"}; return {x:-3.8,z:rnd(-2.2,0),pose:"pin",dur:rnd(2,3),face:"left"} }
  if(st===4){ if(i===9) return {x:rnd(2.2,4.4),z:rnd(1.4,2.8),pose:Math.random()<.6?"note":"point",dur:rnd(3,6),face:pick(["back","left"])};
    var step=Math.min(7,Math.floor(f*8)), pose=["hammer","hammer","carry","hammer","roller","hammer","carry","reach"][step];
    var work=[[1.2,-2.4,"right"],[1.2,-1,"right"],[2.6,.0,"back"],[-3.5,-2.9,"back"],[-4.4,-.5,"left"],[-4.4,1.5,"left"],[3.6,-2.9,"back"],[-1,-2.9,"back"]];
    var w=pick(work); return {x:w[0],z:w[1],pose:pose,dur:rnd(3,6),face:w[2]} }
  if(i===0) return {x:-1.6,z:.6,pose:Math.random()<.5?"shake":"talk",dur:rnd(4,7),face:"right"};
  return {x:-.7,z:.6,pose:Math.random()<.5?"shake":"wave",dur:rnd(4,7),face:"left"};
}
function carFree(){return S.car&&S.car.st==="park"&&!S.people.some(function(q){return q.task&&q.task.leave})}
function update(p,dt){
  if(p.bubble){p.bubble.life-=dt; if(p.bubble.life<=0) p.bubble=null}
  if(p.react){p.react.t-=dt; if(p.react.t<=0) p.react=null; else return}
  if(p.brk){ if(Date.now()<p.brk){ if(!p.off){ p.sit=false; if(go(p,S.exit[0],S.exit[1],dt)) p.off=true } return }
    p.brk=0; p.off=false; p.x=S.exit[0]; p.z=S.exit[1]; p.task=null; p.path=null; p.goKey=null; say(p,"Вернулся. Только без тычков",3) }
  var t=p.task;
  if(!t){ p.timer-=dt; if(p.timer>0) return; t=p.task=brain(p); t.phase=0 }
  if(t.leave){
    if(t.phase===0){ p.sit=false; t.phase=.5; return }
    if(t.phase===.5){ if(go(p,S.car.x-.2,S.car.z+.75,dt)){ p.off=true; say(p,"Уехал на объект",2.2); t.phase=1; S.car.st="out"; t.back=rnd(10,18) } return }
    if(t.phase===1){ t.back-=dt; if(t.back<=0&&S.car.st==="gone"){ S.car.st="in"; t.phase=2 } return }
    if(t.phase===2){ if(S.car.st==="park"){ p.off=false; p.x=S.car.x-.2; p.z=S.car.z+.75; say(p,"С объекта, есть новости",2.4); p.task=null; p.timer=.2 } return }
  }
  if(t.phase===0){ p.sit=false; if(go(p,t.x,t.z,dt)){ t.phase=1; p.pose=t.pose; p.sit=!!t.sit;
      if(t.face){p.fx=FACE[t.face][0];p.fz=FACE[t.face][1]} if(t.faceTo){var dx=t.faceTo.x-p.x,dz=t.faceTo.z-p.z,l=Math.hypot(dx,dz)||1;p.fx=dx/l;p.fz=dz/l}
      if(t.face2){dx=t.face2[0]-p.x;dz=t.face2[1]-p.z;l=Math.hypot(dx,dz)||1;p.fx=dx/l;p.fz=dz/l}
      if(t.talk&&Math.random()<.6) say(p,pick(talkLines()),2.4) } return }
  t.dur-=dt; if(t.dur<=0){ p.task=null; p.pose="idle"; p.timer=rnd(.4,1.8) }
}
function talkLines(){return [[""],["Диван лучше к окну","Добавим тёплого дуба","Этот камень подходит"],["Узел у окна проверил?","Сверим розетки на кухне","Сдвинем трассу?"],["Пришлите прайс","Какие сроки поставки?","Есть в наличии?"],[""],["Держите ключи","Спасибо!"]][S.stage]}
function region(x,z){ if(z>3.55||x>5.15) return "out"; if(S.part&&x>1.6) return z<.4?"bed":"hall"; return "live" }
function doorEdges(){ var d=S.studioSt?4:1.1, E=[{a:"live",b:"out",pts:[[d,3.0],[d,3.95]]}];
  if(S.part) E.push({a:"live",b:"bed",pts:[[1.15,-.25],[2.05,-.25]]},{a:"bed",b:"hall",pts:[[2.7,-.1],[2.7,.85]]},{a:"live",b:"hall",pts:[[1.2,1.6],[2.0,1.6]]});
  return E }
function plan(x0,z0,x1,z1){ var A=region(x0,z0),B=region(x1,z1),out=[];
  if(A!==B){ var E=doorEdges(), prev={}, q=[A], seen={}; seen[A]=1;
    while(q.length){ var n=q.shift(); if(n===B) break; E.forEach(function(e){ var m=e.a===n?e.b:e.b===n?e.a:null; if(m&&!seen[m]){ seen[m]=1; prev[m]={from:n,e:e}; q.push(m) } }) }
    var chain=[], cur=B; while(cur!==A&&prev[cur]){ var pv=prev[cur], pts=pv.e.a===pv.from?pv.e.pts:pv.e.pts.slice().reverse(); chain.unshift(pts); cur=pv.from }
    chain.forEach(function(p){ out=out.concat(p) }) }
  out.push([x1,z1]); return out }
function go(p,x,z,dt){ var key=x.toFixed(2)+","+z.toFixed(2);
  if(p.goKey!==key||!p.path){ p.goKey=key; p.path=plan(p.x,p.z,x,z) }
  var w=p.path[0]; if(walkTo(p,w[0],w[1],dt)){ p.path.shift(); if(!p.path.length){ p.goKey=null; p.path=null; return true } } return false }
function walkTo(p,x,z,dt){ var dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz); if(d<.04){p.x=x;p.z=z;return true}
  if(RM){p.x=x;p.z=z;return true} p.fx=dx/d;p.fz=dz/d; p.pose="walk"; var st=Math.min(d,1.25*dt); p.x+=dx/d*st; p.z+=dz/d*st; p.ph+=dt*8; return false }

/* фигурка-манекен */
function drawPerson(c,p,t){
  if(p.off) return;
  var k=S.k, foot=P(p.x,0,p.z), x=foot[0], y=foot[1], u=k*.9*1.15;
  var sx=(p.fx*AX[0]+p.fz*AZ[0]); var s=sx>=0?1:-1; var back=(p.fx*AX[1]+p.fz*AZ[1])<-.12;
  var jump=0, pose=p.pose;
  if(p.react){var rt=p.react.t; if(p.react.k==="jump") jump=Math.abs(Math.sin(rt*8))*.25*u; if(p.react.k==="wave"||p.react.k==="hi") pose="wave"; if(p.react.k==="spin"){s=Math.sin(rt*12)>0?1:-1; back=Math.sin(rt*6)>0} if(p.react.k==="shy") pose="shy"; if(p.react.k==="bow") pose="bow"; if(p.react.k==="annoy") pose="annoy"}
  if(pose==="wave"||pose==="shy"||pose==="annoy"||pose==="bow") back=false;
  var sitDy=p.sit?.42*u:0; y-=jump;
  c.fillStyle="rgba(30,45,70,.25)"; c.beginPath(); c.ellipse(x+.1*u,y+jump+.02*u,.26*u,.09*u,0,0,7); c.fill();
  var hipY=y-.88*u+sitDy, shY=y-1.36*u+sitDy, headY=y-1.6*u+sitDy, bow=pose==="bow"?.18*u:0;
  c.lineCap="round"; c.lineJoin="round";
  function leg(off,sw,col){ c.strokeStyle=col; c.lineWidth=.17*u; c.beginPath(); var fx,fy;
    if(p.sit){ c.moveTo(x+off,hipY); c.lineTo(x+off+s*.42*u,hipY+.02*u); fx=x+off+s*.44*u; fy=y; c.lineTo(fx,fy-.03*u) }
    else { var kx=x+off+sw*.16*u, ky=hipY+.44*u; c.moveTo(x+off,hipY); c.lineTo(kx,ky); fx=x+off+sw*.26*u; fy=y; c.lineTo(fx,fy-.05*u) } c.stroke();
    c.fillStyle="#3a2c22"; c.beginPath(); c.ellipse(fx+s*.04*u,fy-.03*u,.1*u,.05*u,0,0,7); c.fill() }
  var sw=pose==="walk"?Math.sin(p.ph):0;
  leg(-.06*u*s,-sw,sh(p.leg,1.12)); leg(.06*u*s,sw,p.leg);
  var A=arms(p,pose,t,s,u,shY,x,bow);
  drawArm(c,A[1],sh(p.cloth,.82),u,p);
  // корпус-рубашка
  var tw=.44*u, th=.56*u, tx=x+bow*s*.6, ty=hipY-th;
  var g=c.createLinearGradient(tx-tw/2,0,tx+tw/2,0); g.addColorStop(0,sh(p.cloth,1.15)); g.addColorStop(.55,p.cloth); g.addColorStop(1,sh(p.cloth,.74));
  if(p.fem){ tw=.38*u; c.fillStyle=g; c.beginPath(); c.moveTo(tx-tw/2,ty+.08*u); c.quadraticCurveTo(tx-tw/2,ty,tx-tw/2+.08*u,ty); c.lineTo(tx+tw/2-.08*u,ty); c.quadraticCurveTo(tx+tw/2,ty,tx+tw/2,ty+.08*u); c.quadraticCurveTo(tx+tw*.32,ty+th*.6,tx+tw*.42,th+ty+.05*u); c.lineTo(tx-tw*.42,ty+th+.05*u); c.quadraticCurveTo(tx-tw*.32,ty+th*.6,tx-tw/2,ty+.08*u); c.fill();
    if(p.skirt&&!p.sit){ c.fillStyle=sh(p.cloth,.75); c.beginPath(); c.moveTo(tx-tw*.42,hipY-.04*u); c.lineTo(tx+tw*.42,hipY-.04*u); c.lineTo(tx+tw*.62,hipY+.42*u); c.lineTo(tx-tw*.62,hipY+.42*u); c.closePath(); c.fill() } }
  else { c.fillStyle=g; rr(c,tx-tw/2,ty,tw,th+.05*u,tw*.4); c.fill() }
  if(p.plaid){ c.save(); rr(c,tx-tw/2,ty,tw,th+.05*u,tw*.4); c.clip(); c.strokeStyle="rgba(20,30,60,.35)"; c.lineWidth=.035*u;
    for(var i=-3;i<=3;i++){ c.beginPath(); c.moveTo(tx+i*.09*u,ty); c.lineTo(tx+i*.09*u,ty+th+.05*u); c.stroke() } c.strokeStyle="rgba(255,255,255,.25)";
    for(i=0;i<6;i++){ c.beginPath(); c.moveTo(tx-tw/2,ty+i*.1*u); c.lineTo(tx+tw/2,ty+i*.1*u); c.stroke() } c.restore() }
  c.fillStyle=sh(p.leg,.9); c.fillRect(tx-tw/2+.02*u,hipY-.03*u,tw-.04*u,.06*u);
  if(!back){ c.fillStyle="rgba(255,255,255,.75)"; c.beginPath(); c.moveTo(tx-.08*u,ty+.02*u); c.lineTo(tx,ty+.12*u); c.lineTo(tx+.08*u,ty+.02*u); c.closePath(); c.fill() }
  // шея и голова
  var hx=x+bow*s*1.2, hy=headY+bow*.6;
  c.fillStyle=sh(p.skin,.88); c.fillRect(hx-.05*u,hy+.08*u,.1*u,.08*u);
  var hg=c.createRadialGradient(hx-s*.05*u,hy-.06*u,.02*u,hx,hy,.17*u); hg.addColorStop(0,sh(p.skin,1.08)); hg.addColorStop(1,sh(p.skin,.82));
  c.fillStyle=hg; c.beginPath(); c.ellipse(hx,hy,.13*u,.15*u,0,0,7); c.fill();
  var hat=p.generic||S.stage===0||S.stage===4;
  // волосы
  c.fillStyle=p.hair;
  if(back){ c.beginPath(); c.ellipse(hx,hy-.01*u,.135*u,.15*u,0,0,7); c.fill() }
  else if(!hat){ c.beginPath(); c.ellipse(hx-s*.02*u,hy-.07*u,.14*u,.1*u,0,Math.PI*1.02,Math.PI*1.98+.3*s); c.fill();
    c.beginPath(); c.ellipse(hx-s*.09*u,hy-.02*u,.06*u,.1*u,0,0,7); c.fill();
    if(p.hs===1){ c.beginPath(); c.ellipse(hx-s*.1*u,hy+.1*u,.08*u,.2*u,0,0,7); c.fill(); c.beginPath(); c.ellipse(hx+s*.1*u,hy+.04*u,.035*u,.13*u,0,0,7); c.fill() }
    if(p.hs===2){ c.beginPath(); c.arc(hx-s*.08*u,hy-.16*u,.075*u,0,7); c.fill() }
    if(p.hs===3){ c.beginPath(); c.ellipse(hx-s*.06*u,hy+.04*u,.15*u,.12*u,0,Math.PI*.95,Math.PI*2.05); c.fill(); c.beginPath(); c.ellipse(hx+s*.11*u,hy+.02*u,.035*u,.09*u,0,0,7); c.fill() }
    if(p.hs===4){ c.fillStyle=sh(p.hair,1.25); c.beginPath(); c.ellipse(hx-s*.02*u,hy-.09*u,.13*u,.07*u,0,Math.PI,0); c.fill() } }
  else if(hat&&p.fem){ c.beginPath(); c.ellipse(hx-s*.1*u,hy+.08*u,.07*u,.16*u,0,0,7); c.fill() }
  if(back&&p.fem&&!hat&&p.hs===1){ c.beginPath(); c.ellipse(hx,hy+.1*u,.12*u,.2*u,0,0,7); c.fill() }
  // лицо
  if(!back){ var ex=hx+s*.045*u, ey=hy-.005*u;
    c.fillStyle="#2a211c"; c.beginPath(); c.ellipse(ex,ey,.018*u,.026*u,0,0,7); c.ellipse(ex+s*.065*u,ey,.016*u,.024*u,0,0,7); c.fill();
    c.fillStyle="rgba(255,255,255,.8)"; c.beginPath(); c.arc(ex+.006*u,ey-.01*u,.006*u,0,7); c.fill();
    c.strokeStyle="#9a4e3c"; c.lineWidth=.018*u; c.beginPath();
    if(pose==="annoy"){ c.moveTo(ex,hy+.075*u); c.lineTo(ex+s*.06*u,hy+.065*u) } else c.arc(ex+s*.03*u,hy+.05*u,.04*u,.25,Math.PI-.25);
    c.stroke();
    if(p.fem){ c.strokeStyle="#2a211c"; c.lineWidth=.012*u; c.beginPath(); c.moveTo(ex+s*.008*u,ey-.026*u); c.lineTo(ex+s*.03*u,ey-.04*u); c.moveTo(ex+s*.07*u,ey-.024*u); c.lineTo(ex+s*.09*u,ey-.038*u); c.stroke();
      c.fillStyle="#d4626a"; c.beginPath(); c.ellipse(ex+s*.03*u,hy+.075*u,.03*u,.014*u,0,0,7); c.fill() }
    if(p.beard){ c.fillStyle=sh(p.hair,1.1); c.beginPath(); c.ellipse(hx+s*.02*u,hy+.08*u,.11*u,.07*u,0,0,Math.PI); c.fill() }
    if(pose==="shy"||pose==="annoy"){ c.fillStyle="rgba(230,90,80,.35)"; c.beginPath(); c.arc(ex+s*.08*u,hy+.05*u,.03*u,0,7); c.fill() } }
  // каска
  if(hat){ var hg2=c.createLinearGradient(hx-.15*u,0,hx+.15*u,0); hg2.addColorStop(0,"#ffe066"); hg2.addColorStop(1,"#e0a800");
    c.fillStyle=hg2; c.beginPath(); c.ellipse(hx,hy-.07*u,.15*u,.12*u,0,Math.PI,0); c.fill(); c.fillStyle="#f0b400"; rr(c,hx-.18*u,hy-.085*u,.36*u,.045*u,.02*u); c.fill();
    c.fillStyle="rgba(255,255,255,.6)"; c.beginPath(); c.ellipse(hx-.05*u,hy-.15*u,.04*u,.02*u,-.4,0,7); c.fill() }
  drawArm(c,A[0],sh(p.cloth,1.0),u,p);
  propDraw(c,p,pose,A,t,s,u);
}
function arms(p,pose,t,s,u,shY,x,bow){
  var w=Math.sin(t*10+p.ph);
  function A(dx,dy,ex,ey){ return {sx:x+s*.13*u+bow*s*.6,sy:shY+bow*.4,ex:x+s*ex*u+bow*s,ey:shY+ey*u,hx:x+s*dx*u+bow*s,hy:shY+dy*u} }
  function A2(dx,dy,ex,ey){ var a=A(dx,dy,ex,ey); a.sx=x-s*.1*u+bow*s*.6; return a }
  var walk=Math.sin(p.ph);
  switch(pose){
    case "walk": return [A(.13+walk*.18,.52,.13+walk*.1,.27),A2(-.08-walk*.18,.52,-.08-walk*.1,.27)];
    case "type": return [A(.42,.32+Math.sin(t*22)*.01,.26,.3),A2(.36,.33+Math.cos(t*19)*.01,.18,.3)];
    case "talk": return [A(.38,.12+w*.06,.24,.3),A2(-.06,.5,-.08,.26)];
    case "wave": return [A(.26+w*.06,-.45,.3,-.18),A2(-.06,.5,-.08,.26)];
    case "shy": return [A(.1,-.2,.24,.1),A2(.06,-.2,.18,.1)];
    case "annoy": return [A(.22,.4,.28,.22),A2(-.18,.4,-.24,.22)];
    case "bow": return [A(.1,.5,.12,.26),A2(-.04,.5,-.06,.26)];
    case "phone": return [A(.08,-.2,.26,.08),A2(-.06,.5,-.08,.26)];
    case "point": return [A(.62,-.2,.32,-.05),A2(-.06,.5,-.08,.26)];
    case "pin": return [A(.5,-.36+Math.abs(w)*.04,.28,-.14),A2(-.06,.5,-.08,.26)];
    case "level": return [A(.4,.18,.22,.3),A2(.32,.22,.14,.3)];
    case "tape": return [A(.55,.2,.3,.22),A2(-.06,.5,-.08,.26)];
    case "note": return [A(.3,.24,.2,.32),A2(.26,.26,.12,.32)];
    case "hammer": var hm=Math.max(0,Math.sin(t*8+p.ph)); return [A(.44,-.1+hm*.32,.3,.05+hm*.16),A2(.2,.28,.12,.3)];
    case "roller": var rl=Math.sin(t*2.6+p.ph)*.3; return [A(.36,-.2+rl,.24,.05+rl*.5),A2(.3,-.1+rl,.16,.1+rl*.5)];
    case "carry": return [A(.16,-.5,.22,-.24),A2(.08,-.5,.14,-.24)];
    case "reach": return [A(.3,-.6+w*.03,.26,-.3),A2(.2,-.56,.18,-.28)];
    case "shake": return [A(.42,.26+Math.sin(t*12)*.03,.26,.3),A2(-.06,.5,-.08,.26)];
    default: return [A(.15,.52,.16,.27),A2(-.1,.52,-.11,.27)];
  }
}
function drawArm(c,a,col,u,p){ c.strokeStyle=col; c.lineWidth=.11*u; c.beginPath(); c.moveTo(a.sx,a.sy); c.lineTo(a.ex,a.ey); c.lineTo(a.hx,a.hy); c.stroke(); c.fillStyle=p?p.skin:"#f1c9a5"; c.beginPath(); c.arc(a.hx,a.hy,.05*u,0,7); c.fill() }
function propDraw(c,p,pose,A,t,s,u){
  var h=A[0];
  if(pose==="phone"){ c.fillStyle=C.graphite; rr(c,h.hx-.03*u,h.hy-.08*u,.06*u,.12*u,.015*u); c.fill() }
  if(pose==="note"){ c.fillStyle="#fbfaf8"; c.strokeStyle="rgba(0,0,0,.25)"; c.lineWidth=1; rr(c,h.hx-.12*u,h.hy-.14*u,.18*u,.24*u,.02*u); c.fill(); c.stroke() }
  if(pose==="hammer"){ c.strokeStyle="#7a5a3c"; c.lineWidth=.04*u; c.beginPath(); c.moveTo(h.hx,h.hy); c.lineTo(h.hx+s*.12*u,h.hy-.1*u); c.stroke(); c.fillStyle=C.graphite; c.fillRect(h.hx+s*.12*u-.04*u,h.hy-.16*u,.08*u,.1*u) }
  if(pose==="roller"){ c.strokeStyle=C.graphite; c.lineWidth=.03*u; c.beginPath(); c.moveTo(h.hx,h.hy); c.lineTo(h.hx+s*.2*u,h.hy-.45*u); c.stroke(); c.fillStyle=C.paint; rr(c,h.hx+s*.2*u-.13*u,h.hy-.52*u,.26*u,.08*u,.03*u); c.fill() }
  if(pose==="carry"){ var cx=(A[0].hx+A[1].hx)/2; c.fillStyle=S.f*8<3?C.gkl:C.oak; c.strokeStyle="rgba(0,0,0,.2)"; c.lineWidth=1; rr(c,cx-.6*u,h.hy-.08*u,1.2*u,.07*u,.02*u); c.fill(); c.stroke() }
  if(pose==="tape"){ c.fillStyle=C.brass; rr(c,h.hx-.06*u,h.hy-.06*u,.12*u,.12*u,.03*u); c.fill();
    var a=S.people[0]; if(a&&a!==p&&!a.off){ var ap=P(a.x,1.05,a.z); c.strokeStyle=C.brass; c.lineWidth=1.6; c.beginPath(); c.moveTo(h.hx,h.hy); c.lineTo(ap[0],ap[1]); c.stroke();
      var mm=Math.round(Math.hypot(a.x-p.x,a.z-p.z)*100)*10; tag(c,(h.hx+ap[0])/2,(h.hy+ap[1])/2-10,mm.toLocaleString("ru-RU")+" мм") } }
  if(pose==="level"){ var tp=P(p.x+p.fx*.45,0,p.z+p.fz*.45), top=P(p.x+p.fx*.45,1.3,p.z+p.fz*.45);
    c.strokeStyle=C.graphite; c.lineWidth=1.4; [-.18,0,.18].forEach(function(o){ c.beginPath(); c.moveTo(top[0],top[1]); c.lineTo(tp[0]+o*u,tp[1]+(o?0:.05*u)); c.stroke() });
    c.fillStyle="#4f6a83"; rr(c,top[0]-.09*u,top[1]-.1*u,.18*u,.11*u,.02*u); c.fill();
    var end=P(p.x+(p.fx>=0?(4.86-p.x):-(p.x+4.86))*(Math.abs(p.fx)>.5?1:0),1.3,p.z+(Math.abs(p.fx)>.5?0:(p.fz>=0?(3.36-p.z):-(p.z+3.36))));
    c.strokeStyle="rgba(210,59,47,"+(.5+.3*Math.sin(t*6))+")"; c.lineWidth=1.2; c.beginPath(); c.moveTo(top[0],top[1]-.05*u); c.lineTo(end[0],end[1]-.05*u); c.stroke();
    c.fillStyle="rgba(210,59,47,.9)"; c.beginPath(); c.arc(end[0],end[1]-.05*u,2.2,0,7); c.fill() }
}
function rr(c,x,y,w,h,r){r=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath()}
function tag(c,x,y,t){ c.font="500 10px Montserrat, Arial"; var w=c.measureText(t).width+10; c.fillStyle="rgba(251,250,248,.95)"; rr(c,x-w/2,y-8,w,15,4); c.fill(); c.fillStyle="#2c2c2b"; c.textAlign="center"; c.fillText(t,x,y+3); c.textAlign="left" }
function bubble(c,p){
  if(p.off||!p.bubble||!p.bubble.t) return; var hp=P(p.x,p.sit?1.75:2.2,p.z), t=p.bubble.t;
  c.font="500 11.5px Montserrat, Arial"; var w=Math.min(220,c.measureText(t).width+20), x=clamp(hp[0]-w/2,6,LW-w-6), y=hp[1]-34;
  c.globalAlpha=Math.min(1,p.bubble.life*3);
  c.fillStyle="rgba(30,28,25,.10)"; rr(c,x+1,y+3,w,24,12); c.fill();
  c.fillStyle="#fbfaf8"; rr(c,x,y,w,24,12); c.fill(); c.beginPath(); c.moveTo(hp[0]-5,y+23); c.lineTo(hp[0],y+30); c.lineTo(hp[0]+5,y+23); c.fill();
  c.fillStyle="#2c2c2b"; c.fillText(t,x+10,y+16,w-16); c.globalAlpha=1 }

/* машина */
var CARP=[[-1.15,.28],[-1.17,.56],[-.95,.64],[-.58,.68],[-.34,1.0],[.36,1.0],[.74,.68],[1.1,.6],[1.18,.44],[1.17,.28]];
function carShape(it,x,z,col,dirx){
  it.push({t:"fn",s:1,out:true,x:x,y0:0,z:z,draw:function(c){ drawCar(c,x,z,col,dirx) }});
}
function drawCar(c,x,z,col,dir){
  var w=.47, z0=z-w, z1=z+w, pr=CARP.map(function(q){return [x+q[0]*dir,q[1]]});
  // тень
  c.fillStyle="rgba(30,45,70,.22)"; poly(c,hull([P(x-1.15,0,z0+.1),P(x+1.15,0,z0+.1),P(x+1.15,0,z1+.25),P(x-1.15,0,z1+.25),P(x+1.4,0,z1+.35),P(x-.9,0,z1+.35)])); c.fill();
  // колёса дальнего борта
  [-.72,.72].forEach(function(o){ wheel(c,x+o,z0+.05,.29) });
  // верхние грани профиля
  var n=pr.length, faces=[];
  for(var i=0;i<n-1;i++){ var a=pr[i],b=pr[i+1], dx=b[0]-a[0], dy=b[1]-a[1], nx=dy*dir, ny=-dx*dir;
    if(dir<0){ nx=-dy*-1; ny=dx*-1 }
    var L=Math.hypot(dx,dy)||1; nx=dy/L*(dir>0?1:-1)*(dir>0?1:-1); 
    faces.push({a:a,b:b,i:i}) }
  faces.forEach(function(f){ var a=f.a,b=f.b, q=[P(a[0],a[1],z0),P(b[0],b[1],z0),P(b[0],b[1],z1),P(a[0],a[1],z1)];
    var dx=b[0]-a[0], dy=b[1]-a[1], up=Math.abs(dx)>Math.abs(dy)*.6, glass=(f.i===3||f.i===5);
    var faceRight=(dy<0&&dx>=0)||(dy>0&&dx<0)? (b[0]+a[0])/2>x : false;
    var vis=up || ((a[0]+b[0])/2>x);
    if(!vis) return;
    poly(c,q); c.fillStyle=glass?(up?"#bfe4f6":"#7fb7d9"):up?sh(mix(col,"#fff4d8",.15),1.05):sh(mix(col,"#4d6189",.12),.8); c.fill();
    c.strokeStyle="rgba(0,0,0,.12)"; c.lineWidth=.6; c.stroke() });
  // ближний борт
  poly(c,pr.map(function(q){return P(q[0],q[1],z1)})); var g=c.createLinearGradient(0,P(x,1,z1)[1],0,P(x,.28,z1)[1]); g.addColorStop(0,sh(col,1.05)); g.addColorStop(.55,sh(col,.92)); g.addColorStop(1,sh(col,.72)); c.fillStyle=g; c.fill();
  c.strokeStyle="rgba(0,0,0,.18)"; c.lineWidth=.7; c.stroke();
  // окна борта
  var win=[[-.5,.71],[-.31,.95],[.33,.95],[.62,.71]].map(function(q){return P(x+q[0]*dir,q[1],z1+.005)}); poly(c,win);
  var wg=c.createLinearGradient(win[1][0],win[1][1],win[3][0],win[3][1]); wg.addColorStop(0,"#d6f0fb"); wg.addColorStop(1,"#6fa9cf"); c.fillStyle=wg; c.fill();
  var bp=[P(x+.04*dir,.71,z1+.006),P(x+.04*dir,.95,z1+.006)]; c.strokeStyle=sh(col,.7); c.lineWidth=2.2; c.beginPath(); c.moveTo(bp[0][0],bp[0][1]); c.lineTo(bp[1][0],bp[1][1]); c.stroke();
  // молдинг, ручки
  var m0=P(x-1.1,.5,z1+.006), m1=P(x+1.1,.5,z1+.006); c.strokeStyle="rgba(255,255,255,.35)"; c.lineWidth=1; c.beginPath(); c.moveTo(m0[0],m0[1]); c.lineTo(m1[0],m1[1]); c.stroke();
  // колёса ближнего борта
  [-.72,.72].forEach(function(o){ var arch=[]; for(var k=0;k<=12;k++){ var an=Math.PI*k/12; arch.push(P(x+o+Math.cos(an)*.36,.28+Math.sin(an)*.3,z1+.004)) } poly(c,arch); c.fillStyle="rgba(20,22,26,.85)"; c.fill(); wheel(c,x+o,z1-.02,.29) });
  // фары
  var fr=P(x+1.17*dir,.48,z+.3*(dir>0?1:-1)); c.fillStyle=dir>0?"#fff6c8":"#e04a3a"; c.beginPath(); c.ellipse(fr[0],fr[1],2.6,1.8,0,0,7); c.fill();
  var fr2=P(x+1.17*dir,.48,z1-.12); c.beginPath(); c.ellipse(fr2[0],fr2[1],2.6,1.8,0,0,7); c.fill();
}
function wheel(c,x,z,r){ var pts=[],hub=[]; for(var k=0;k<20;k++){ var an=k/20*Math.PI*2; pts.push(P(x+Math.cos(an)*r,.29+Math.sin(an)*r,z)); hub.push(P(x+Math.cos(an)*r*.48,.29+Math.sin(an)*r*.48,z+.01)) }
  poly(c,pts); c.fillStyle="#1d2024"; c.fill(); poly(c,hub); c.fillStyle="#c5cad0"; c.fill() }
function carItems(it){ var k=S.car, dt=S.dt;
  if(k){ var road=S.pz1+1.4;
    if(k.st==="out"){ if(k.z<road){ k.z=Math.min(road,k.z+2.5*dt) } else { k.x+=6*dt; if(k.x>24){k.st="gone"} } }
    else if(k.st==="in"){ if(k.x>k.x0){ k.x=Math.max(k.x0,k.x-6*dt); k.z=road } else { k.z=Math.max(k.z0,k.z-2.5*dt); if(k.z<=k.z0) k.st="park" } }
    if(k.st!=="gone") carShape(it,k.x,k.z,"#d6453b",1) }
  // проезжающие машины
  S.tr=S.tr||[]; S.trT=(S.trT==null?rnd(1,4):S.trT)-dt;
  if(S.trT<=0&&!RM){ S.trT=rnd(5,11); var d=Math.random()<.5?1:-1; S.tr.push({x:d>0?-24:24,z:S.pz1+(d>0?2.5:1.4),d:d,v:rnd(4,7),col:pick(["#3d7cc9","#f2a33a","#46a86a","#f2f1ec","#7a5bb5","#2f9fb0"])}) }
  S.tr=S.tr.filter(function(q){ q.x+=q.d*q.v*dt; carShape(it,q.x,q.z,q.col,q.d); return Math.abs(q.x)<26 });
}

/* ---------- кадр ---------- */
function frame(ts){
  if(!S||!S.cv.isConnected){ if(S) S.raf=0; return }
  var now=ts/1000, dt=Math.min(.05,now-(S.last||now)); S.last=now; S.dt=dt; S.t+=dt;
  var c=S.ctx; c.setTransform(S.dpr,0,0,S.dpr,0,0); c.clearRect(0,0,LW,LH);
  var W=S.world;
  if(S.env){ c.setTransform(1,0,0,1,0,0); c.drawImage(S.env,0,0); c.setTransform(S.dpr,0,0,S.dpr,0,0) }
  W.floor(c); floorAO(c);
  // элементы
  var it=W.items.slice(); trophies(it); carItems(it);
  it.forEach(function(b){ if(b.at!=null){ var tg=S.f>=b.at?1:0; b.s+=(tg-b.s)*Math.min(1,dt*5); if(Math.abs(tg-b.s)<.003) b.s=tg } });
  // тени
  c.fillStyle="rgba(30,45,70,.13)"; it.forEach(function(b){ if(b.sh&&b.s>.05) shadowOf(c,b) });
  it.forEach(function(b){ if(b.pre&&b.s>.01) drawBox(c,b) });
  if(W.wall) W.wall(c);
  var ppl=S.people.filter(function(p){return !p.away});
  ppl.forEach(function(p){update(p,dt)});
  var list=[];
  it.forEach(function(b){ if(b.s<=.01||b.pre||b.post||b.out) return; var k=b.t==="box"?depth((b.x0+b.x1)/2,b.y0,(b.z0+b.z1)/2)+(b.key||0):depth(b.x,b.y0,b.z); list.push({k:k,b:b}) });
  var outL=[];
  ppl.forEach(function(p){ if(p.off) return; var e={k:depth(p.x,p.sit?.5:.05,p.z)+.12,p:p}; (region(p.x,p.z)==="out"?outL:list).push(e) });
  it.forEach(function(b){ if(b.out&&b.s>.01) outL.push({k:b.t==="box"?depth((b.x0+b.x1)/2,b.y0,(b.z0+b.z1)/2):depth(b.x,b.y0,b.z),b:b}) });
  function drawList(L){ L.sort(function(a,b){return a.k-b.k}); L.forEach(function(e){ if(e.p) drawPerson(c,e.p,S.t); else if(e.b.t==="box") drawBox(c,e.b); else if(e.b.t==="fn") e.b.draw(c); else drawCyl(c,e.b) }) }
  drawList(list);
  it.forEach(function(b){ if(b.post&&b.s>.01) drawBox(c,b) });
  drawList(outL);
  // частицы
  if(S.stage===5&&!RM){ S.cft=(S.cft||0)-dt; if(S.cft<=0){ S.cft=rnd(5,8); var o=P(-1.15,2.4,.6); for(var i=0;i<34;i++) S.parts.push({x:o[0]+rnd(-30,30),y:o[1]+rnd(-10,10),vx:rnd(-50,50),vy:rnd(-70,-20),c:pick(["#3d7cc9","#e2a63c","#d9534f","#46a86a","#ffffff"]),r:rnd(0,6),life:3.2}) } }
  S.parts=S.parts.filter(function(q){ q.life-=dt; q.x+=q.vx*dt; q.y+=q.vy*dt; q.vy+=60*dt; q.r+=dt*7; c.fillStyle=q.c; c.save(); c.translate(q.x,q.y); c.rotate(q.r); c.fillRect(-3,-1.2,6,2.4); c.restore(); return q.life>0 });
  S.rip=S.rip.filter(function(r){ r.t+=dt; var a=1-r.t/.6; c.strokeStyle="rgba(44,44,43,"+(a*.6)+")"; c.lineWidth=1.4; c.beginPath(); c.ellipse(r.x,r.y,6+r.t*46,(6+r.t*46)*.5,0,0,7); c.stroke(); return r.t<.6 });
  ppl.forEach(function(p){bubble(c,p)});
  if(S.hover&&!S.hover.off){ var hp=S.hover, fp=P(hp.x,0,hp.z); c.font="500 10.5px Montserrat, Arial"; var tx=hp.name+(hp.role?" · "+hp.role:""), w=c.measureText(tx).width+14, x=clamp(fp[0]-w/2,4,LW-w-4);
    c.fillStyle="rgba(44,44,43,.92)"; rr(c,x,fp[1]+10,w,19,9.5); c.fill(); c.fillStyle="#f4f3f1"; c.fillText(tx,x+7,fp[1]+23) }
  S.raf=requestAnimationFrame(frame);
}
function resize(){ if(!S) return; var r=S.cv.getBoundingClientRect(), d=Math.min(2,window.devicePixelRatio||1); S.cv.width=Math.round(r.width*d)||LW; S.cv.height=Math.round((r.width||LW)*LH/LW*d); S.dpr=S.cv.width/LW; buildEnv() }
/* ---------- окружение: газон, деревья, пруд, дорога ---------- */
function rand(seed){ var x=Math.sin(seed*127.1)*43758.5453; return x-Math.floor(x) }
function buildEnv(){
  var e=S.env||(S.env=document.createElement("canvas")); e.width=S.cv.width; e.height=S.cv.height;
  var c=e.getContext("2d"); c.setTransform(S.dpr,0,0,S.dpr,0,0);
  // газон
  var g=c.createLinearGradient(0,0,0,LH); g.addColorStop(0,"#86c457"); g.addColorStop(1,"#6fb244"); c.fillStyle=g; c.fillRect(0,0,LW,LH);
  for(var i=0;i<70;i++){ var x=rand(i+1)*LW, y=rand(i+50)*LH, r=20+rand(i+99)*60, gg=c.createRadialGradient(x,y,0,x,y,r); var lt=rand(i+7)>.5; gg.addColorStop(0,lt?"rgba(170,220,110,.35)":"rgba(70,140,50,.28)"); gg.addColorStop(1,"rgba(0,0,0,0)"); c.fillStyle=gg; c.fillRect(x-r,y-r,2*r,2*r) }
  c.strokeStyle="rgba(60,120,40,.35)"; c.lineWidth=1; for(i=0;i<500;i++){ x=rand(i+300)*LW; y=rand(i+900)*LH; c.beginPath(); c.moveTo(x,y); c.lineTo(x+1.5,y-3); c.stroke() }
  // пруд
  var pc=P(-10.5,0,-6.5); c.save(); c.translate(pc[0],pc[1]); c.scale(1,.55);
  c.fillStyle="#e3d39b"; c.beginPath(); c.ellipse(0,0,3.4*S.k,2.6*S.k,.2,0,7); c.fill();
  var wg=c.createRadialGradient(-20,-10,10,0,0,3.2*S.k); wg.addColorStop(0,"#6cc3f0"); wg.addColorStop(1,"#2f88cf"); c.fillStyle=wg; c.beginPath(); c.ellipse(0,0,3.1*S.k,2.3*S.k,.2,0,7); c.fill();
  c.strokeStyle="rgba(255,255,255,.55)"; c.lineWidth=2; c.beginPath(); c.ellipse(-.4*S.k,-.3*S.k,1.6*S.k,.9*S.k,.2,3.6,4.6); c.stroke(); c.restore();
  // дорога и тротуар
  function band(z0,z1,col){ poly(c,[P(-40,0,z0),P(40,0,z0),P(40,0,z1),P(-40,0,z1)]); c.fillStyle=col; c.fill() }
  band(S.pz1+.25,S.pz1+.75,"#d9d5cc"); band(S.pz1+.75,S.pz1+.82,"#b9b4aa"); band(S.pz1+.82,S.pz1+3.0,"#5d636b");
  c.strokeStyle="rgba(255,255,255,.85)"; c.lineWidth=2; c.setLineDash([14,12]); var a1=P(-40,0,S.pz1+1.91),a2=P(40,0,S.pz1+1.91); c.beginPath(); c.moveTo(a1[0],a1[1]); c.lineTo(a2[0],a2[1]); c.stroke(); c.setLineDash([]);
  band(S.pz1+3.0,S.pz1+3.08,"#b9b4aa"); band(S.pz1+3.08,S.pz1+3.6,"#d9d5cc");
  // участок
  var x0=S.px0,x1=S.px1,z0=S.pz0,z1=S.pz1;
  c.fillStyle="rgba(30,45,70,.18)"; poly(c,hull([P(x0+.3,-.12,z0+.2),P(x1+.5,-.12,z0+.3),P(x1+.5,-.12,z1+.4),P(x0+.3,-.12,z1+.4)])); c.fill();
  drawBox(c,Box(x0,x1,-.12,0,z0,z1,C.plinth,{sh:false}));
  if(S.studioSt){ // парковка
    poly(c,[P(5.5,.002,-2.4),P(x1-.15,.002,-2.4),P(x1-.15,.002,z1),P(5.5,.002,z1)]); c.fillStyle="#666c73"; c.fill();
    c.strokeStyle="rgba(255,255,255,.8)"; c.lineWidth=1.5; for(var k=0;k<4;k++){ var zz=-2.2+k*1.6, q1=P(6.2,.003,zz),q2=P(x1-.4,.003,zz); c.beginPath(); c.moveTo(q1[0],q1[1]); c.lineTo(q2[0],q2[1]); c.stroke() } }
  // деревья
  var trees=[];
  for(i=0;i<160;i++){ var tx=-22+rand(i*3+1)*44, tz=-16+rand(i*3+2)*26;
    if(tx>x0-1.6&&tx<x1+1.6&&tz>z0-1.6&&tz<z1+4.3) continue;
    if(tz>z1-.5&&tz<z1+5.2) continue;
    if(tx>x1+.8&&tz>z0-.5) continue;
    if(Math.hypot((tx+10.5)/3.6,(tz+6.5)/2.8)<1.15) continue;
    var sp=P(tx,0,tz); if(sp[0]<-60||sp[0]>LW+60||sp[1]<-40||sp[1]>LH+80) continue;
    trees.push({x:tx,z:tz,t:rand(i*7)<.55?"pine":"oak",s:.8+rand(i*11)*.6,v:rand(i*13)}) }
  trees.sort(function(a,b){return depth(a.x,0,a.z)-depth(b.x,0,b.z)});
  trees.forEach(function(t){ tree(c,t) });
}
function tree(c,t){
  var b=P(t.x,0,t.z), u=S.k*.9*t.s, x=b[0], y=b[1];
  c.fillStyle="rgba(30,60,30,.28)"; c.beginPath(); c.ellipse(x+.5*u,y+.08*u,.95*u,.35*u,0,0,7); c.fill();
  c.fillStyle="#7a5232"; c.fillRect(x-.08*u,y-.7*u,.16*u,.72*u);
  if(t.t==="pine"){ var cols=t.v>.5?["#2f7d3a","#3f9644","#57ad4d"]:["#2a6e3a","#368a43","#4ba252"];
    for(var i=0;i<3;i++){ var w=(1.0-i*.24)*u, yb=y-.45*u-i*.75*u, yt=yb-1.2*u; var g=c.createLinearGradient(x-w,0,x+w,0); g.addColorStop(0,cols[2]); g.addColorStop(.55,cols[1]); g.addColorStop(1,cols[0]);
      c.fillStyle=g; c.beginPath(); c.moveTo(x-w,yb); c.quadraticCurveTo(x,yb+.18*u,x+w,yb); c.lineTo(x,yt); c.closePath(); c.fill() } }
  else { var cl=t.v>.5?["#4e9e3a","#6cbc48","#8fd35e"]:["#5aa03c","#77c04c","#9bd866"];
    [[-.45,-1.4,.62],[.42,-1.5,.6],[0,-2.0,.72],[0,-1.3,.7]].forEach(function(q){ var cx=x+q[0]*u, cy=y+q[1]*u, r=q[2]*u, g=c.createRadialGradient(cx-r*.35,cy-r*.4,r*.1,cx,cy,r);
      g.addColorStop(0,cl[2]); g.addColorStop(.6,cl[1]); g.addColorStop(1,cl[0]); c.fillStyle=g; c.beginPath(); c.arc(cx,cy,r,0,7); c.fill() }) }
}
function floorAO(c){
  function strip(a0,a1,b0,b1){ var g=c.createLinearGradient(a0[0],a0[1],b0[0],b0[1]); g.addColorStop(0,"rgba(40,40,60,.22)"); g.addColorStop(1,"rgba(40,40,60,0)"); c.fillStyle=g; poly(c,[a0,a1,b1,b0]); c.fill() }
  strip(P(-4.88,.01,-3.38),P(4.88,.01,-3.38),P(-4.88,.01,-2.7),P(4.88,.01,-2.7));
  strip(P(-4.88,.01,-3.38),P(-4.88,.01,3.38),P(-4.2,.01,-3.38),P(-4.2,.01,3.38));
}
function pt(e){ var r=S.cv.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width*LW,y:(e.clientY-r.top)/r.height*LH} }
function hit(q){ var best=null,bd=1e9; S.people.forEach(function(p){ if(p.off||p.away||p.brk) return; var f=P(p.x,0,p.z), u=S.k*.9*1.15, top=f[1]-(p.sit?1.35:1.8)*u;
  if(q.x>f[0]-.3*u&&q.x<f[0]+.3*u&&q.y>top&&q.y<f[1]+4){ var d=depth(p.x,0,p.z); if(-d<bd){bd=-d;best=p} } }); return best }
function onMove(e){ var p=hit(pt(e)); S.cv.style.cursor=p?"pointer":"default";
  if(p!==S.hover){ if(p&&!p.react){ var k=pick(["wave","jump","spin","hi","shy","bow"]); p.react={k:k,t:1.3}; if(k!=="spin") say(p,k==="shy"?"Ой, вы смотрите?":k==="bow"?"Моё почтение":pick(HOVER_TXT),1.6) } S.hover=p } }
function onClick(e){ var q=pt(e), p=hit(q);
  if(!p){ S.rip.push({x:q.x,y:q.y,t:0}); return }
  var now=Date.now(); p.clicks=p.clicks.filter(function(c){return now-c<15000}); p.clicks.push(now);
  var n=p.clicks.length;
  if(n>=8){ p.brk=now+300000; p.clicks=[]; p.task=null; p.react=null; p.sit=false; say(p,"Всё, я на перерыв. 5 минут",3);
    var b=loadBreaks(); b[S.pid+":"+p.id]=p.brk; saveBreaks(b); if(S.onBreak) S.onBreak(p); return }
  p.react={k:"annoy",t:.8}; say(p,CLICK_TXT[Math.min(CLICK_TXT.length-1,n-1)],1.8) }

window.OmniScene={
  mount:function(cv,opts){
    var key=opts.pid+":"+opts.stage, reuse=S&&S.key===key, old=S;
    if(S&&S.raf) cancelAnimationFrame(S.raf);
    S={key:key,pid:opts.pid,stage:opts.stage,f:opts.sp/100,cv:cv,ctx:cv.getContext("2d"),t:reuse?old.t:0,parts:[],rip:[],hover:null,onBreak:opts.onBreak};
    var studioSt=opts.stage>=1&&opts.stage<=3;
    S.px0=-5.6; S.px1=studioSt?9.6:5.6; S.pz0=-4.1; S.pz1=4.1; S.studioSt=studioSt;
    fit(S.px0,S.px1,S.pz0-.4,S.pz1+.5,2.4);
    S.world=studioSt?studio(opts.stage,S.f):apartment(opts.stage,S.f);
    if(reuse&&old.world&&old.world.items.length===S.world.items.length) S.world.items.forEach(function(b,i){ b.s=old.world.items[i].s });
    else S.world.items.forEach(function(b){ if(b.at!=null) b.s=S.f>=b.at?1:0 });
    S.car=studioSt?(reuse&&old.car?old.car:{x:7.6,x0:7.6,z:1.4,z0:1.4,st:"park"}):null; S.tr=reuse&&old.tr?old.tr:[];
    S.exit=[16,S.pz1+.55]; S.part=!studioSt&&(opts.stage===5||(opts.stage===4&&S.f>=1/8));
    S.people=reuse?old.people:cast(opts.stage,opts.team,opts);
    var br=loadBreaks(), now=Date.now();
    S.people.forEach(function(p){ var u=opts.team.filter(function(x){return x.id===p.id})[0]; p.away=!!(u&&u.away);
      var until=br[S.pid+":"+p.id]; if(until&&until>now&&!p.brk){ p.brk=until; p.off=true } });
    resize();
    cv.onpointermove=onMove; cv.onclick=onClick; cv.onpointerleave=function(){S.hover=null};
    S.raf=requestAnimationFrame(frame);
  },
  setProgress:function(sp){ if(!S) return; var nf=sp/100, of=S.f; S.f=nf; S.part=!S.studioSt&&(S.stage===5||(S.stage===4&&nf>=1/8)); S.people.forEach(function(p){p.path=null;p.goKey=null});
    if(S.stage===4||S.stage===0){ S.world=apartment(S.stage,nf); S.world.items.forEach(function(b){ if(b.at!=null) b.s=b.at<=of?1:0 }) } },
  caption:function(stage,sp){ return CAP[stage](sp/100) },
  breaksFor:function(pid){ var b=loadBreaks(), now=Date.now(), out=[]; for(var k in b){ if(k.indexOf(pid+":")===0&&b[k]>now) out.push({id:k.split(":")[1],until:b[k]}) } return out }
};
window.addEventListener("resize",function(){ if(S) resize() });
})();




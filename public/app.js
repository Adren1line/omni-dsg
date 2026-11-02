(function(){
"use strict";
/* Omni DSG — интерфейс. Данные приходят с сервера (/api/state), каждое изменение — запрос к API.
   Код намеренно на ES5: должен работать на старых iPhone. */
var KONTUR_URL = "https://claude.ai/artifact/5EEX3j7Bzf5khMWGUmB5jo";
var LOGO = '<svg width="34" height="34" viewBox="0 0 100 100" aria-hidden="true"><path fill="currentColor" d="M14 0h18c6 0 9 6 18 6s12-6 18-6h18c8 0 14 6 14 14v72c0 8-6 14-14 14H76c-3 0-4-6-9-6H33c-5 0-6 6-9 6H14C6 100 0 94 0 86V14C0 6 6 0 14 0z"/><circle cx="50" cy="49" r="17" fill="var(--graphite)"/></svg>';
var BRAND = LOGO + '<div class="wm">OMNI<small>DSG</small></div>';

var ROLES = {admin:"Администратор", director:"Директор", staff:"Сотрудник", client:"Заказчик"};
var STAGES = ["Обмер","Концепция","Рабочий проект","Комплектация","Стройка","Сдача"];
var LEAD_ST = [["cold","Холодные"],["warm","Тёплые"],["hot","Горячие"],["deal","Договор"]];
var PERMS=[["crm","Заявки и клиенты","CRM-воронка"],["projAll","Все проекты","иначе только свои"],["stage","Ведёт стадии","меняет стадию и её готовность"],["tasks","Ставит задачи","в проектах"],["money","Бюджет и оплаты","видит деньги проекта"],["storage","Хранилище","файлы проектов"],["pub","Открывает файлы заказчику","метка «заказчику»"],["gantt","График","диаграмма Ганта"],["bot","Бот","настройки и обучение"],["team","Команда","сотрудники и должности"]];
var KLEV=[["none","Нет доступа"],["view","Просмотр"],["notes","Просмотр и заметки"],["edit","Правка модели"]];

var db=emptyDb(), me=null, srvMe=null, view="home", sub=null, folder="all", leadDrag=null, TODAY=new Date().toISOString().slice(0,10);
function emptyDb(){ return {users:[],positions:[],projects:[],tasks:[],leads:[],files:[],feed:[],bot:[],botlog:[],botcfg:null,train:[],botupd:[]} }

/* ---------- связь с сервером ---------- */
function api(method,url,body,raw){
  var h={"X-Omni-Request":"1"}, o={method:method,headers:h,credentials:"same-origin"};
  if(raw){ o.body=raw.body; h["Content-Type"]=raw.type||"application/octet-stream"; h["X-File-Name"]=encodeURIComponent(raw.name) }
  else if(body!==undefined){ h["Content-Type"]="application/json"; o.body=JSON.stringify(body) }
  return fetch(url,o).then(function(r){
    return r.json().then(function(d){return d},function(){return {}}).then(function(d){
      if(r.status===401 && url!=="/api/auth/login" && url!=="/api/me/password" && me){ kicked(); }
      if(!r.ok){ var e=new Error((d.error&&d.error.message)||("Ошибка сервера: "+r.status)); e.status=r.status; throw e }
      return d });
  },function(){ throw new Error("Нет связи с сервером. Проверьте интернет и попробуйте ещё раз") });
}
function fail(e){ toast(e&&e.message?e.message:"Не получилось") }
function kicked(){ me=null; db=emptyDb(); $("app").hidden=true; $("login").hidden=false; $("lgErr").textContent="Сессия закончилась — войдите снова" }
/* id с сервера — числа; в интерфейсе им даётся префикс, чтобы не путать сущности */
function U(n){return n==null?null:"u"+n} function P(n){return n==null?null:"p"+n}
function num(s){ return s==null||s===""?null:+String(s).replace(/^\D+/,"") }

function fromState(s){
  TODAY=s.today||TODAY; srvMe=s.me;
  var d=emptyDb();
  d.positions=(s.positions||[]).map(function(p){return {id:"ps"+p.id,name:p.name,kontur:p.kontur,stages:p.stages,perms:p.perms}});
  d.users=s.users.map(function(u){return {id:U(u.id),name:u.name,role:u.role,posId:u.position?"ps"+u.position.id:null,pos:u.position?u.position.name:(u.role==="staff"?"Сотрудник":ROLES[u.role]),
    stg:u.stages||[],away:u.away,login:u.login,active:u.active!==false,projects:u.allProjects?"all":(u.projects||[]).map(P)}});
  d.projects=s.projects.map(function(p){return {id:P(p.id),name:p.name,addr:p.address||"",area:p.area||0,stage:p.stage,sp:p.stagePct,
    client:p.client?U(p.client.id):null,lead:p.lead?U(p.lead.id):null,leadInfo:p.lead,clientInfo:p.client,team:p.members.map(function(m){return U(m.id)}),members:p.members,
    money:p.budget!==undefined,budget:p.budget||0,paid:p.paid||0,due:p.due||"",kontur:p.konturFile||"",plan:p.plan}});
  d.tasks=s.tasks.map(function(t){return {id:"t"+t.id,p:P(t.projectId),text:t.text,who:U(t.assigneeId),due:t.due||"",done:t.done}});
  d.leads=s.leads.map(function(l){return {id:"l"+l.id,name:l.name,obj:l.obj||"",area:l.area,src:l.src||"",st:l.status,next:l.next||"",note:l.note||""}});
  d.files=s.files.map(function(f){return {id:"f"+f.id,n:f.id,p:P(f.projectId),name:f.name,size:f.size,date:String(f.createdAt||"").slice(0,10),pub:f.public,by:U(f.uploadedBy)}});
  d.feed=s.feed.map(function(f){return {p:P(f.projectId),date:f.date,text:f.text,pub:f.public}});
  var b=s.bot||{};
  d.botlog=(b.log||[]).map(function(x){return {id:"b"+x.id,date:x.date,lvl:x.lvl,p:P(x.projectId),text:x.text,done:x.done}});
  d.bot=d.botlog.filter(function(x){return !x.done}).slice(0,4);
  d.botcfg=b.cfg||null;
  d.train=(b.train||[]).map(function(t){return {id:t.id,sit:t.sit,ans:t.ans}});
  d.botupd=(b.updates||[]).map(function(u){return {date:u.date,p:P(u.projectId),who:U(u.userId),st:u.stage,pct:u.pct,src:u.src||"",text:u.text||""}});
  db=d;
  me=user(U(s.me.id))||{id:U(s.me.id),name:s.me.name,role:s.me.role,pos:ROLES[s.me.role],stg:[],projects:[]};
  me.away=!!s.me.away;
}
function reload(){ return api("GET","/api/state").then(function(s){ fromState(s); if(!me) return; shell(); render() }) }
/* выполнить изменение на сервере, затем перечитать данные */
function act(promise,okMsg){ return promise.then(function(r){ if(okMsg) toast(okMsg); return reload().then(function(){return r}) }).catch(function(e){ fail(e); return reload().then(function(){ throw e }) }) }

function posOf(u){ if(!u||!u.posId) return null; for(var i=0;i<db.positions.length;i++) if(db.positions[i].id===u.posId) return db.positions[i]; return null }
function posName(u){ var p=posOf(u); return p?p.name:(u?u.pos||"":"") }
function can(k,u){ u=u||me; if(!u) return false;
  if(u===me && srvMe) return srvMe.perms.indexOf(k)>=0;
  if(u.role==="admin") return true; if(u.role==="client") return false; if(u.role==="director") return k!=="bot"&&k!=="team"; var p=posOf(u); return !!(p&&p.perms[k]) }
function konturLevel(u){ u=u||me; if(u===me&&srvMe) return srvMe.kontur; if(u.role==="admin"||u.role==="director") return "edit"; if(u.role==="client") return "none"; var p=posOf(u); return p?p.kontur:"view" }
function stagesOf(u){ return (u&&u.stg)||[] }

/* ---------- helpers ---------- */
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function user(id){for(var i=0;i<db.users.length;i++) if(db.users[i].id===id) return db.users[i]; return null}
function proj(id){for(var i=0;i<db.projects.length;i++) if(db.projects[i].id===id) return db.projects[i]; return null}
function leadOf(p){ return user(p.lead)||(p.leadInfo?{id:U(p.leadInfo.id),name:p.leadInfo.name,pos:p.leadInfo.position||""}:null) }
function ini(n){return String(n||"?").split(" ").map(function(w){return w.charAt(0)}).slice(0,2).join("")}
function money(n){return Math.round(n||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g," ")+" ₸"}
function mln(n){return ((n||0)/1e6).toFixed(1).replace(".",",")+" млн ₸"}
function pctOf(a,b){ return b>0?Math.round(a/b*100):0 }
function size(b){return b>1e6?(b/1e6).toFixed(1).replace(".",",")+" МБ":Math.max(1,Math.round(b/1e3))+" КБ"}
var MON=["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
function dt(s){ if(!s) return "без срока"; var p=s.split("-");return (+p[2])+" "+MON[+p[1]-1]}
function dty(s){ return s? dt(s)+" "+s.slice(0,4) : "не задан" }
function days(a,b){return Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/864e5)}
function late(d){return !!d && d<TODAY}
function canSee(p){ return !!p }
function myProjects(){return db.projects}
function prog(p){return Math.round((p.stage*100+p.sp)/6)}
function isMgr(){return me.role==="admin"||me.role==="director"}
function greet(){ var h=new Date().getHours(); return h<5?"Доброй ночи":h<12?"Доброе утро":h<18?"Добрый день":"Добрый вечер" }
function toast(t){ [].forEach.call(document.querySelectorAll(".toast"),function(x){ if(x.parentNode) x.parentNode.removeChild(x) }); var d=document.createElement("div"); d.className="toast"; d.textContent=t; document.body.appendChild(d); setTimeout(function(){ if(d.parentNode) d.parentNode.removeChild(d) },2600) }

var IC={
  home:'<path d="M3 9.5L10 4l7 5.5V16a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1z"/>',
  crm:'<rect x="3" y="4" width="4" height="12" rx="1"/><rect x="8" y="4" width="4" height="8" rx="1"/><rect x="13" y="4" width="4" height="10" rx="1"/>',
  projects:'<path d="M3 6a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  storage:'<rect x="3" y="4" width="14" height="4" rx="1"/><rect x="3" y="10" width="14" height="6" rx="1"/><path d="M6 13h3"/>',
  kontur:'<path d="M4 16V7l6-3 6 3v9"/><path d="M4 7l6 3 6-3M10 10v6"/>',
  team:'<circle cx="7.5" cy="7.5" r="2.5"/><circle cx="13.5" cy="8.5" r="2"/><path d="M3 16c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M12 16c0-1.8 1-3 3-3 1.6 0 2.5 1 2.5 2.5"/>',
  object:'<path d="M3 16V8l7-4 7 4v8"/><path d="M8 16v-4h4v4"/>',
  files:'<path d="M6 3h6l4 4v10H6z"/><path d="M12 3v4h4"/>',
  bot:'<rect x="4" y="6" width="12" height="9" rx="3"/><path d="M10 3v3M7.5 10h.01M12.5 10h.01M8 13h4"/>',
  data:'<ellipse cx="10" cy="5" rx="6" ry="2.2"/><path d="M4 5v10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V5M4 10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2"/>',
  gantt:'<path d="M3 4v13h14"/><rect x="6" y="6" width="5" height="2" rx="1"/><rect x="8" y="9.5" width="6" height="2" rx="1"/><rect x="11" y="13" width="4" height="2" rx="1"/>'
};
function ic(n){return '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[n]+'</svg>'}

function navFor(){
  if(me.role==="client") return [["home","Мой объект","object"],["storage","Файлы","files"]];
  var n=[["home","Главная","home"]];
  if(can("crm")) n.push(["crm","Заявки","crm"]);
  n.push(["projects","Проекты","projects"]);
  if(can("storage")) n.push(["storage","Хранилище","storage"]);
  if(konturLevel()!=="none") n.push(["kontur","Контур","kontur"]);
  if(can("gantt")) n.push(["gantt","График","gantt"]);
  if(can("bot")) n.push(["bot","Бот","bot"]);
  if(can("team")) n.push(["team","Команда","team"]);
  if(me.role==="admin") n.push(["data","Данные","data"]);
  return n;
}

/* ---------- вход ---------- */
$("lgForm").addEventListener("submit",function(e){e.preventDefault(); signIn($("lgUser").value.trim(),$("lgPass").value)});
function signIn(l,p){
  if(!l||!p){ $("lgErr").textContent="Введите логин и пароль"; return }
  var btn=$("lgForm").querySelector("button"); btn.disabled=true; $("lgErr").textContent="";
  api("POST","/api/auth/login",{login:l,password:p}).then(function(){ return api("GET","/api/state") }).then(function(s){
    btn.disabled=false; $("lgPass").value=""; fromState(s); enter();
  }).catch(function(e){ btn.disabled=false; $("lgErr").textContent=e.status===401?"Неверный логин или пароль. Проверьте раскладку и регистр.":e.message });
}
function enter(){
  $("login").hidden=true; $("app").hidden=false;
  if(!location.hash) { view="home"; sub=null }
  route();
  if(srvMe && srvMe.mustChangePassword) passwordDialog(true);
}
function signOut(){ api("POST","/api/auth/logout").then(null,function(){}).then(function(){ me=null; srvMe=null; db=emptyDb(); $("app").hidden=true; $("login").hidden=false; $("lgPass").value=""; $("lgErr").textContent=""; history.replaceState(null,"",location.pathname+location.search) }) }
function passwordDialog(forced){
  $("layer").innerHTML='<div class="modal" id="mdl"><form class="dlg" id="pwF"><h3>'+(forced?'Задайте свой пароль':'Смена пароля')+'</h3>'+
    (forced?'<p class="muted" style="margin:0;font-size:13px">Вы вошли по временному паролю. Придумайте свой — от 8 символов, буквы и цифры.</p>':'')+
    '<label for="pwC">Текущий пароль<input class="field" id="pwC" type="password" autocomplete="current-password" required></label>'+
    '<label for="pwN">Новый пароль<input class="field" id="pwN" type="password" autocomplete="new-password" required></label>'+
    '<label for="pwR">Повторите новый<input class="field" id="pwR" type="password" autocomplete="new-password" required></label>'+
    '<div class="lg-err dlg-err" id="pwE" role="alert" style="color:var(--bad)"></div><div class="acts">'+(forced?'<button type="button" class="btn" data-act="out">Выйти</button>':'<button type="button" class="btn" data-act="close">Отмена</button>')+'<button type="submit" class="btn pri">Сохранить</button></div></form></div>';
  $("pwC").focus();
  $("pwF").addEventListener("submit",function(e){ e.preventDefault();
    if($("pwN").value!==$("pwR").value){ $("pwE").textContent="Новые пароли не совпадают"; return }
    api("POST","/api/me/password",{current:$("pwC").value,next:$("pwN").value}).then(function(){ $("layer").innerHTML=""; if(srvMe) srvMe.mustChangePassword=false; toast("Пароль сохранён") }).catch(function(er){ $("pwE").textContent=er.message });
  });
}

/* ---------- shell ---------- */
function shell(){
  $("railBrand").innerHTML=BRAND;
  var nav=navFor(), cnt={};
  if(me.role!=="client"){
    cnt.home=db.tasks.filter(function(t){return !t.done && t.who===me.id}).length || "";
    if(isMgr()) cnt.crm=db.leads.filter(function(l){return l.st==="hot"}).length||"";
    if(me.role==="admin") cnt.bot=db.botlog.filter(function(b){return !b.done}).length||"";
  }
  $("nav").innerHTML=nav.map(function(n){return '<a href="#'+n[0]+'" class="'+(view===n[0]?"on":"")+'">'+ic(n[2])+n[1]+(cnt[n[0]]?'<span class="cnt">'+cnt[n[0]]+'</span>':'')+'</a>'}).join("");
  $("mobNav").innerHTML=nav.map(function(n){return '<a href="#'+n[0]+'" class="'+(view===n[0]?"on":"")+'">'+ic(n[2])+'<span>'+n[1]+'</span></a>'}).join("");
  $("railUser").innerHTML='<b>'+esc(me.name)+'</b><span>'+ROLES[me.role]+(me.role==="staff"&&posName(me)?' · '+esc(posName(me)):'')+'</span><br>'+(me.role==="staff"?'<button type="button" class="away-btn'+(me.away?' on':'')+'" data-act="away">'+(me.away?'Я на объекте · вернуться':'Уехал на объект')+'</button>':'')+'<button type="button" data-act="pw">Пароль</button><button type="button" data-act="out">Выйти</button>';
  $("mobTop").innerHTML='<div class="rail-brand">'+BRAND+'</div><span>'+(me.role==="staff"?'<button type="button" data-act="away" style="margin-right:6px'+(me.away?';background:var(--accent);color:#fff;border-color:var(--accent)':'')+'">'+(me.away?'На объекте':'Уехал на объект')+'</button>':'')+'<button type="button" data-act="pw" style="margin-right:6px">Пароль</button><button type="button" data-act="out">Выйти</button></span>';
}
function head(t,s){return '<div class="top"><div><h1>'+t+'</h1>'+(s?'<div class="sub">'+s+'</div>':'')+'</div></div>'}

function route(){
  if(!me) return;
  var h=(location.hash||"#home").slice(1), allowed=navFor().map(function(n){return n[0]});
  var m=h.match(/^project-(p\d+)$/);
  if(m && me.role!=="client"){ var p=proj(m[1]); if(p && canSee(p)){view="projects"; sub=p.id} else {view="projects";sub=null} }
  else { view=allowed.indexOf(h)>=0?h:"home"; sub=null }
  shell(); render(); window.scrollTo(0,0);
}
window.addEventListener("hashchange",route);

function render(){
  var M=$("main");
  if(me.role==="client"){ M.innerHTML = view==="storage"?vStorage():vClient(); mountScene(); return }
  if(view==="home") M.innerHTML=vHome();
  else if(view==="crm") M.innerHTML=vCrm();
  else if(view==="projects") M.innerHTML= sub? vProject(proj(sub)) : vProjects();
  else if(view==="storage") M.innerHTML=vStorage();
  else if(view==="kontur") M.innerHTML=vKontur();
  else if(view==="team") M.innerHTML=vTeam();
  else if(view==="gantt") M.innerHTML=vGantt();
  else if(view==="bot") M.innerHTML=vBot();
  else if(view==="data") M.innerHTML=vData();
  var gg=document.querySelector('.gantt'); if(gg){ gg.scrollLeft=Math.max(0,(+gg.getAttribute('data-today'))-Math.min(360,gg.clientWidth*.35)) }
  mountScene();
}

/* ---------- scene ---------- */
function sceneCard(p,st,ctl){
  var h='<div class="card scene-card"><div class="scene-head"><div><div class="lbl">Стадия '+(p.stage+1)+' из 6 · '+STAGES[p.stage]+'</div><div class="cap" id="scCap">'+esc(OmniScene.caption(p.stage,p.sp))+'</div></div><div class="pct"><b id="scPct">'+p.sp+'%</b><span>готовность стадии</span></div></div>';
  h+='<canvas id="scene" width="880" height="470" aria-label="Анимация стадии «'+STAGES[p.stage]+'»" role="img"></canvas><div class="scene-foot"><div class="steps">'+st+'</div>';
  if(ctl) h+='<div class="scene-ctl"><span>Стадия</span><input type="range" id="spR" min="0" max="100" step="5" value="'+p.sp+'" aria-label="Готовность стадии"><span class="toolbar" style="margin:0"><button type="button" class="btn sm" data-stage="-1" aria-label="Предыдущая стадия">←</button><button type="button" class="btn sm" data-stage="1" aria-label="Следующая стадия">→</button></span></div>';
  h+='<div class="scene-hint">Наведите на человечка — он ответит. Лучше не тыкать в них слишком часто.</div></div></div>';
  return h;
}
function mountScene(){
  var cv=$("scene"); if(!cv||!window.OmniScene) return;
  var p= me.role==="client"? myProjects()[0] : proj(sub); if(!p) return;
  var team=p.team.map(user).filter(Boolean).map(function(u){ return {id:u.id,name:u.name,pos:posName(u),away:u.away,stages:stagesOf(u)} });
  OmniScene.mount(cv,{pid:p.id,stage:p.stage,sp:p.sp,team:team,client:p.client?(user(p.client)||{id:p.client,name:p.clientInfo?p.clientInfo.name:"Заказчик"}):null,
    onBreak:function(x){ toast(x.name+" ушёл на перерыв на 5 минут") }});
}

/* ---------- views ---------- */
function taskRow(t,showProj){
  var u=user(t.who), p=proj(t.p);
  return '<div class="task'+(t.done?' done':'')+'"><input type="checkbox" id="tk-'+t.id+'" data-task="'+t.id+'"'+(t.done?' checked':'')+(can("tasks")||t.who===me.id?'':' disabled')+' aria-label="Выполнено"><label for="tk-'+t.id+'"><div class="t">'+esc(t.text)+'</div><div class="s muted" style="font-size:12px">'+(showProj&&p?esc(p.name)+' · ':'')+esc(u?u.name:"без исполнителя")+'</div></label><span class="pill '+(t.done?'good':late(t.due)?'bad':'')+'">'+(t.done?'готово':late(t.due)?'просрочено':dt(t.due))+'</span></div>';
}
function projCard(p){
  var st=p.stage, segs="";
  for(var i=0;i<6;i++) segs+='<span class="'+(i<st?'d':i===st?'c':'')+'"></span>';
  var lu=leadOf(p);
  return '<button type="button" class="card proj" data-open="'+p.id+'"><span class="t">'+esc(p.name)+'</span><span class="muted" style="font-size:12px">'+esc([p.addr,p.area?p.area+' м²':''].filter(Boolean).join(' · ')||'адрес не указан')+'</span><span class="stages">'+segs+'</span><span style="display:flex;justify-content:space-between;font-size:12px"><span>'+STAGES[st]+'</span><span class="muted">'+esc(lu?lu.name:"")+'</span></span></button>';
}
function vHome(){
  var mine=db.tasks.filter(function(t){return !t.done && (isMgr()? canSee(proj(t.p)) : t.who===me.id)});
  mine.sort(function(a,b){return a.due<b.due?-1:1});
  var ps=myProjects(), lateN=mine.filter(function(t){return late(t.due)}).length;
  var h=head(greet()+", "+esc(me.name.split(" ")[0]), isMgr()?"Сводка по студии на "+dt(TODAY):"Ваши объекты и задачи");
  if(isMgr()){
    var budget=0,paid=0; ps.forEach(function(p){budget+=p.budget;paid+=p.paid});
    var hot=db.leads.filter(function(l){return l.st==="hot"}).length;
    h+='<div class="grid g4" style="margin-bottom:16px">'+
      '<div class="card stat"><div class="lbl">Объекты в работе</div><div class="v">'+ps.length+'</div><div class="d">'+ps.reduce(function(s,p){return s+p.area},0)+' м² в сумме</div></div>'+
      '<div class="card stat"><div class="lbl">Заявки</div><div class="v">'+db.leads.length+'</div><div class="d">горячих: '+hot+'</div></div>'+
      '<div class="card stat"><div class="lbl">К получению</div><div class="v">'+mln(budget-paid)+'</div><div class="d">оплачено '+pctOf(paid,budget)+'% бюджетов</div></div>'+
      '<div class="card stat'+(lateN?' alert':'')+'"><div class="lbl">Просрочено задач</div><div class="v">'+lateN+'</div><div class="d">из '+mine.length+' открытых</div></div></div>';
  }
  h+='<div class="grid g2"><div class="card"><h2>'+(isMgr()?'Задачи команды':'Мои задачи')+'</h2>'+(mine.length?mine.map(function(t){return taskRow(t,true)}).join(""):'<div class="empty">Открытых задач нет</div>')+'</div>';
  h+='<div class="grid" style="align-content:start">';
  if(isMgr()){
    h+='<div class="card"><h2>Бот сообщает'+(can("bot")?' <a href="#bot">Все</a>':'')+'</h2>'+(db.bot.length?'<div class="rows">'+db.bot.map(function(b){return '<div class="row"><div class="s" style="color:var(--fg);font-size:13px">'+esc(b.text)+'</div><span class="pill '+({warn:"warn",bad:"bad",acc:"acc",q:"acc",info:""}[b.lvl])+'">'+({warn:"сверка",bad:"контроль",acc:"заявка",q:"вопрос",info:"сделал сам"}[b.lvl])+'</span></div>'}).join("")+'</div>':'<div class="empty">Новых сообщений нет</div>')+'</div>';
  }
  h+='<div class="card"><h2>Объекты <a href="#projects">Все</a></h2>'+(ps.length?'':'<div class="empty">'+(isMgr()?'Проектов пока нет — создайте первый в разделе «Проекты»':'Вас пока не добавили ни в один проект')+'</div>')+'<div class="rows">'+ps.map(function(p){return '<div class="row"><div><div class="t">'+esc(p.name)+'</div><div class="s">'+STAGES[p.stage]+'</div><div class="bar"><i style="width:'+prog(p)+'%"></i></div></div><span class="muted" style="font-size:12px">'+prog(p)+'%</span></div>'}).join("")+'</div></div>';
  h+='</div></div>';
  return h;
}

function vCrm(){
  var h=head("Заявки","Перетащите карточку в другую колонку или нажмите стрелку");
  h+='<div class="toolbar"><button type="button" class="btn pri" data-act="lead-new">+ Новая заявка</button><span class="muted" style="font-size:12px">Горячие и договор ведёт менеджер, холодные и тёплые — бот</span></div>';
  h+='<div class="board">'+LEAD_ST.map(function(s,si){
    var ls=db.leads.filter(function(l){return l.st===s[0]});
    return '<div class="col" data-st="'+s[0]+'"><div class="col-h"><b>'+s[1]+'</b><span class="muted" style="font-size:12px">'+ls.length+'</span></div>'+
      (ls.length?ls.map(function(l){return '<div class="lead" draggable="true" data-lead="'+l.id+'"><div class="t">'+esc(l.name)+'</div><div class="s">'+esc(l.obj)+'</div>'+(l.note?'<div class="note">'+esc(l.note)+'</div>':'')+'<div class="meta"><span class="'+(late(l.next)?'pill bad':'muted')+'">'+(late(l.next)?'связаться':'связь '+dt(l.next))+' · '+esc(l.src)+'</span><span class="mv">'+(si>0?'<button type="button" data-mv="'+l.id+'" data-d="-1" aria-label="Назад">←</button>':'')+(si<3?'<button type="button" data-mv="'+l.id+'" data-d="1" aria-label="Дальше">→</button>':'')+'</span></div></div>'}).join(""):'<div class="empty">Пусто</div>')+'</div>';
  }).join("")+'</div>';
  return h;
}

function vProjects(){
  var ps=myProjects();
  return head("Проекты", isMgr()?"Все объекты студии":"Объекты, где вы в команде")+(isMgr()?'<div class="toolbar"><button type="button" class="btn pri" data-act="proj-new">+ Новый проект</button></div>':'')+(ps.length?'<div class="grid g3">'+ps.map(projCard).join("")+'</div>':'<div class="card empty">Проектов пока нет</div>');
}

function fileLink(f){ return '<a href="/api/files/'+f.n+'/download" download class="flink"><span class="ext">'+ext(f.name)+'</span>'+esc(f.name)+'</a>' }
function vProject(p){
  var st="";
  for(var i=0;i<6;i++) st+='<div class="step '+(i<p.stage?'d':i===p.stage?'c':'')+'"><i>'+(i<p.stage?'✓':i+1)+'</i>'+STAGES[i]+'</div>';
  var tasks=db.tasks.filter(function(t){return t.p===p.id});
  var files=db.files.filter(function(f){return f.p===p.id});
  var feed=db.feed.filter(function(f){return f.p===p.id}).slice(0,6);
  var h='<button type="button" class="back" data-act="back">← Все проекты</button>'+head(esc(p.name),esc([p.addr,p.area?p.area+' м²':''].filter(Boolean).join(' · ')));
  if(isMgr()) h+='<div class="toolbar"><button type="button" class="btn" data-act="proj-edit">Изменить проект и команду</button></div>';
  h+=sceneCard(p,st,can("stage"));
  h+='<div class="grid g2"><div class="grid" style="align-content:start">';
  h+='<div class="card"><h2>Задачи '+(can("tasks")?'<button type="button" data-act="task-new">+ Задача</button>':'')+'</h2>'+(tasks.length?tasks.map(function(t){return taskRow(t,false)}).join(""):'<div class="empty">Задач нет</div>')+'</div>';
  if(can("storage")) h+='<div class="card"><h2>Файлы <a href="#storage" data-folder="'+p.id+'">Хранилище</a></h2>'+(files.length?'<div class="rows">'+files.slice(0,8).map(function(f){return '<div class="row"><div class="t" style="font-weight:400;min-width:0">'+fileLink(f)+'</div><span class="pill'+(f.pub?' good':'')+'">'+(f.pub?'заказчику':'внутреннее')+'</span></div>'}).join("")+'</div>':'<div class="empty">Файлов пока нет</div>')+'</div>';
  var canFeed=isMgr()||can("stage");
  h+='<div class="card"><h2>Лента объекта</h2>'+(canFeed?'<div class="msg" style="margin:0 0 10px"><input class="field" id="feedT" placeholder="Что сделано сегодня" aria-label="Запись в ленту"><button type="button" class="btn pri" data-act="feed-add">Записать</button></div>'+(isMgr()||can("pub")?'<label class="perm" style="border:0;padding:0 0 8px"><input type="checkbox" id="feedPub" checked><span>Показать заказчику<small>в его кабинете, в разделе «Что сделано»</small></span></label>':''):'')+
    (feed.length?'<div class="rows">'+feed.map(function(f){return '<div class="row"><div class="t" style="font-weight:400">'+esc(f.text)+'</div><span class="muted" style="font-size:12px;white-space:nowrap">'+dt(f.date)+(f.pub?'':' · внутр.')+'</span></div>'}).join("")+'</div>':'<div class="empty">Записей пока нет</div>')+'</div>';
  h+='</div><div class="grid" style="align-content:start">';
  if(konturLevel()!=="none") h+='<div class="card mod-hero"><div class="lbl" style="color:var(--on-graphite-2)">Модель в Контуре</div><div style="font-size:15px;font-weight:500;margin-top:6px">'+(p.kontur?esc(p.kontur):'модель не привязана')+'</div><div class="muted" style="font-size:12px;margin-top:4px">'+'Ваш доступ: '+{none:"нет доступа",view:"просмотр",notes:"просмотр и заметки",edit:"правка модели"}[konturLevel()]+'</div><a class="btn-light" href="'+KONTUR_URL+'" target="_blank" rel="noopener">Открыть в Контуре</a></div>';
  var lu=leadOf(p), cu=p.client?(user(p.client)||p.clientInfo):null;
  h+='<div class="card"><h2>Команда</h2>'+(p.team.length?'<div class="team">'+p.team.map(function(id){var u=user(id); if(!u) return ''; return '<span class="who"><span class="ava">'+ini(u.name)+'</span>'+esc(u.name)+'<span class="muted" style="margin-left:6px;font-size:12px">'+esc(posName(u))+'</span>'+(u.away?'<span class="pill acc" style="margin-left:6px">на объекте</span>':'')+'</span>'}).join("")+'</div>':'<div class="empty">Команда не назначена</div>')+
    '<dl class="kv" style="margin-top:14px"><dt>Ответственный</dt><dd>'+(lu?esc(lu.name):'<span class="muted">не назначен</span>')+'</dd><dt>Заказчик</dt><dd>'+(cu?esc(cu.name):'<span class="muted">не подключён</span>')+'</dd><dt>Срок</dt><dd>'+dty(p.due)+'</dd>'+
    (p.money?'<dt>Оплачено</dt><dd>'+money(p.paid)+' из '+money(p.budget)+'<div class="bar"><i style="width:'+Math.min(100,pctOf(p.paid,p.budget))+'%;background:var(--good)"></i></div></dd>':'')+'</dl></div>';
  h+='<div class="card"><h2>Кто на какой стадии</h2><div class="rows">'+STAGES.map(function(sn,i){ var who=p.team.map(user).filter(function(u){return u&&stagesOf(u).indexOf(i)>=0});
    return '<div class="row"><div><div class="t" style="font-weight:'+(i===p.stage?600:400)+'">'+(i===p.stage?'● ':'')+sn+'</div><div class="s">'+(who.length?who.map(function(u){return esc(u.name)}).join(", "):'никто из команды — назначьте должность')+'</div></div>'+(i<p.stage?'<span class="pill good">готово</span>':i===p.stage?'<span class="pill acc">сейчас</span>':'<span class="muted" style="font-size:12px">'+(p.plan?dt(p.plan[i][0]):'')+'</span>')+'</div>' }).join("")+'</div></div>';
  h+='</div></div>';
  return h;
}

function ext(n){var m=n.match(/\.([a-z0-9]+)$/i);return m?m[1].toUpperCase():"FILE"}
function vStorage(){
  var ps=myProjects(), client=me.role==="client";
  if(client) folder=ps[0]?ps[0].id:"all";
  if(folder!=="all"&&!proj(folder)) folder="all";
  var files=db.files.filter(function(f){return (folder==="all"||f.p===folder) && (!client||f.pub)});
  var h=head(client?"Файлы":"Хранилище", client?"Документы, которые команда открыла для вас":"Файлы по проектам. Метка «заказчику» открывает файл в кабинете заказчика");
  h+='<div class="store">';
  if(!client){
    h+='<div class="folders"><button type="button" data-folder="all" class="'+(folder==="all"?"on":"")+'"><span>Все проекты</span><span class="muted">'+db.files.length+'</span></button>'+
      ps.map(function(p){return '<button type="button" data-folder="'+p.id+'" class="'+(folder===p.id?"on":"")+'"><span>'+esc(p.name.replace(/^Квартира в /,"Кв. "))+'</span><span class="muted">'+db.files.filter(function(f){return f.p===p.id}).length+'</span></button>'}).join("")+'</div>';
  }
  h+='<div class="card" style="min-width:0">';
  if(!client) h+='<label class="drop" id="drop" for="upl">'+(folder==="all"?'Выберите проект слева, чтобы загрузить файлы':'Перетащите файлы сюда или <u>выберите</u> — они попадут в «'+esc(proj(folder).name)+'»')+'</label><input type="file" id="upl" multiple hidden'+(folder==="all"?' disabled':'')+'>';
  function mayDel(f){ return isMgr()||f.by===me.id }
  h+='<div class="tbl-wrap"><table><thead><tr><th>Файл</th>'+(folder==="all"&&!client?'<th>Проект</th>':'')+'<th>Размер</th><th>Дата</th>'+(client?'':'<th>Видимость</th><th></th>')+'</tr></thead><tbody>'+
    (files.length?files.map(function(f){var fp=proj(f.p); return '<tr><td class="n">'+fileLink(f)+'</td>'+(folder==="all"&&!client?'<td class="muted">'+esc(fp?fp.name:"")+'</td>':'')+'<td class="muted">'+size(f.size)+'</td><td class="muted">'+dt(f.date)+'</td>'+
      (client?'':'<td><button type="button" class="vis'+(f.pub?' pub':'')+'" data-vis="'+f.id+'"'+(can("pub")?'':' disabled')+'>'+(f.pub?'заказчику':'внутреннее')+'</button></td><td>'+(mayDel(f)?'<button type="button" class="btn sm" data-fdel="'+f.id+'" aria-label="Удалить файл">×</button>':'')+'</td>')+'</tr>'}).join(""):'<tr><td colspan="6" class="empty">Файлов пока нет</td></tr>')+
    '</tbody></table></div></div></div>';
  return h;
}

function vKontur(){
  var ps=myProjects();
  var h=head("Контур","BIM/CAD для интерьеров — модуль Omni DSG");
  h+='<div class="mod" style="margin-bottom:16px"><div class="card mod-hero"><div class="lbl" style="color:var(--on-graphite-2)">Модуль подключён</div><div style="font-size:22px;font-weight:400;letter-spacing:.06em;margin-top:8px">КОНТУР CAD</div><p class="muted" style="margin:8px 0 0;max-width:46ch">Модели проектов открываются из карточки объекта. Права в Контуре берутся из вашей роли в Omni DSG: '+{none:"нет доступа",view:"просмотр",notes:"просмотр и заметки",edit:"правка модели"}[konturLevel()]+'.</p><a class="btn-light" href="'+KONTUR_URL+'" target="_blank" rel="noopener">Открыть Контур</a></div>';
  h+='<div class="card"><h2>Модели ваших проектов</h2><div class="rows">'+(ps.length?'':'<div class="empty">Проектов пока нет</div>')+ps.map(function(p){return '<div class="row"><div><div class="t">'+(p.kontur?esc(p.kontur):'<span class="muted">модель не привязана</span>')+'</div><div class="s">'+esc(p.name)+' · '+STAGES[p.stage]+'</div></div><a class="btn sm" href="#project-'+p.id+'" style="text-decoration:none">Проект</a></div>'}).join("")+'</div></div></div>';
  if(isMgr()){
    h+='<div class="card"><h2>Прямой доступ для сторонних</h2><p class="muted" style="margin:0 0 12px;max-width:70ch">Контур продаётся отдельно по подписке: свой вход, без платформы Omni DSG, бота и данных студии. Ваша команда работает в Контуре через Omni DSG.</p><div class="plans">'+
      '<div class="plan"><b>Студия</b><div class="muted" style="font-size:12px;margin-top:4px">Внутри Omni DSG · роли, проекты, бот</div></div>'+
      '<div class="plan"><b>Контур Pro</b><div class="muted" style="font-size:12px;margin-top:4px">Подписка на 1 место · все инструменты</div></div>'+
      '<div class="plan"><b>Контур Просмотр</b><div class="muted" style="font-size:12px;margin-top:4px">Для строителей и подрядчиков · листы, AR, заметки</div></div></div><p class="muted" style="font-size:12px;margin:10px 0 0">Цены и условия подписки ещё не определены.</p></div>';
  }
  return h;
}

/* ---------- график Ганта ---------- */
var gOpen={};
function vGantt(){
  var ps=db.projects.filter(function(p){return p.plan}), mn="9999", mx="0000";
  if(!ps.length) return head("График","Собирает бот: каждый вечер спрашивает сотрудников, что сделано, и сверяет с моделью")+'<div class="card empty">Нет проектов со сроком сдачи — укажите срок в карточке проекта, и план стадий построится сам</div>';
  ps.forEach(function(p){ if(p.plan[0][0]<mn) mn=p.plan[0][0]; if(p.plan[5][1]>mx) mx=p.plan[5][1] });
  var start=mn.slice(0,8)+"01", ey=+mx.slice(0,4), em=+mx.slice(5,7)+1; if(em>12){em=1;ey++} var end=ey+"-"+(em<10?"0":"")+em+"-01", PX=2.4, W=days(start,end)*PX;
  var months=[], d=start; while(d<end){ months.push(d); var y=+d.slice(0,4), m=+d.slice(5,7); m++; if(m>12){m=1;y++} d=y+"-"+(m<10?"0":"")+m+"-01" }
  function X(s){return Math.max(0,days(start,s))*PX}
  var h=head("График","Собирает бот: каждый вечер спрашивает сотрудников, что сделано, и сверяет с моделью");
  var lateN=0; ps.forEach(function(p){ var pe=p.plan[p.stage][1]; if(pe<TODAY&&p.sp<100) lateN++ });
  h+='<div class="toolbar"><span class="pill">Сегодня '+dt(TODAY)+'</span><span class="pill'+(lateN?' bad':' good')+'">'+(lateN?'Отстают: '+lateN:'Все в графике')+'</span><span class="muted" style="font-size:12px">Нажмите на объект, чтобы раскрыть стадии</span></div>';
  h+='<div class="card" style="padding:0"><div class="gantt" data-today="'+X(TODAY)+'"><div class="g-in" style="width:'+(220+W)+'px">';
  h+='<div class="g-row g-head"><div class="g-name lbl">Объект / стадия</div><div class="g-track">'+months.map(function(m){return '<span class="g-mon" style="left:'+X(m)+'px">'+MON[+m.slice(5,7)-1]+(m.slice(5,7)==="01"?' '+m.slice(0,4):'')+'</span>'}).join("")+'</div></div>';
  ps.forEach(function(p){
    var a=p.plan[0][0], b=p.plan[5][1], late=p.plan[p.stage][1]<TODAY&&p.sp<100;
    h+='<div class="g-row g-proj" data-g="'+p.id+'"><div class="g-name"><b>'+(gOpen[p.id]?'▾ ':'▸ ')+esc(p.name)+'</b><span class="muted">'+STAGES[p.stage]+' · '+prog(p)+'%</span></div><div class="g-track">'+grid(months,X)+
      p.plan.map(function(r,i){ var cls=i<p.stage?'done':i===p.stage?(late?'late':'cur'):'plan'; return '<span class="g-bar '+cls+'" style="left:'+X(r[0])+'px;width:'+Math.max(4,X(r[1])-X(r[0])-2)+'px" title="'+STAGES[i]+': '+dt(r[0])+' – '+dt(r[1])+'">'+(i===p.stage?'<i style="width:'+p.sp+'%"></i>':'')+'</span>' }).join("")+
      '<span class="g-today" style="left:'+X(TODAY)+'px"></span></div></div>';
    if(gOpen[p.id]) p.plan.forEach(function(r,i){
      var ups=db.botupd.filter(function(u){return u.p===p.id&&u.st===i}), last=ups[0], cls=i<p.stage?'done':i===p.stage?(late?'late':'cur'):'plan';
      h+='<div class="g-row g-stage"><div class="g-name"><span>'+STAGES[i]+'</span><span class="muted">'+dt(r[0])+' – '+dt(r[1])+' · '+(p.team.map(user).filter(function(u){return u&&stagesOf(u).indexOf(i)>=0}).map(function(u){return u.name.split(' ')[0]}).join(', ')||'—')+(last?' · '+esc((user(last.who)||{}).name||"")+': '+last.pct+'%':'')+'</span></div><div class="g-track">'+grid(months,X)+
        '<span class="g-bar thin '+cls+'" style="left:'+X(r[0])+'px;width:'+Math.max(4,X(r[1])-X(r[0])-2)+'px">'+(i===p.stage?'<i style="width:'+p.sp+'%"></i>':'')+'</span>'+
        ups.map(function(u){ var us=user(u.who); return '<span class="g-dot" style="left:'+X(u.date)+'px" title="'+dt(u.date)+' · '+esc(us?us.name:"")+' ('+u.src+'): '+esc(u.text)+'"></span>' }).join("")+
        '<span class="g-today" style="left:'+X(TODAY)+'px"></span></div></div>' });
  });
  h+='</div></div></div>';
  h+='<div class="g-key muted"><span><i class="g-bar done"></i>сделано</span><span><i class="g-bar cur"></i>идёт сейчас</span><span><i class="g-bar late"></i>отстаёт</span><span><i class="g-bar plan"></i>в плане</span><span><i class="g-dot" style="position:static;display:inline-block"></i>ответ сотрудника боту</span></div>';
  h+='<div class="card" style="margin-top:16px"><h2>Последние ответы сотрудников</h2>'+(db.botupd.length?'':'<div class="empty">Ответов пока нет — они появятся, когда бот начнёт опрашивать команду</div>')+'<div class="rows">'+db.botupd.slice(0,6).map(function(u){ var us=user(u.who), p=proj(u.p); return '<div class="row"><div><div class="t" style="font-weight:400">'+esc(u.text)+'</div><div class="s">'+esc(us?us.name:"")+' · '+esc(p?p.name:"")+' · '+STAGES[u.st]+' '+u.pct+'%</div></div><span class="muted" style="font-size:12px">'+dt(u.date)+' · '+u.src+'</span></div>' }).join("")+'</div></div>';
  return h;
}
function grid(months,X){ return months.map(function(m){return '<span class="g-grid" style="left:'+X(m)+'px"></span>'}).join("") }

/* ---------- бот ---------- */
function vBot(){
  var c=db.botcfg||{}, open=db.botlog.filter(function(b){return !b.done});
  var h=head("Бот","Офис-менеджер студии в Телеграме и WhatsApp");
  h+='<div class="grid g4" style="margin-bottom:16px">'+
    '<div class="card stat"><div class="lbl">Телеграм</div><div class="v" style="font-size:18px">'+(c.tg?'Подключён':'Выключен')+'</div><div class="d">@omni_dsg_bot</div></div>'+
    '<div class="card stat"><div class="lbl">WhatsApp</div><div class="v" style="font-size:18px">'+(c.wa?'Подключён':'Не подключён')+'</div><div class="d">нужен WhatsApp Business API</div></div>'+
    '<div class="card stat'+(open.length?' alert':'')+'"><div class="lbl">Ждут вас</div><div class="v">'+open.length+'</div><div class="d">флаги и вопросы бота</div></div>'+
    '<div class="card stat"><div class="lbl">Опрос команды</div><div class="v" style="font-size:18px">'+esc(c.pollAt)+'</div><div class="d">'+(c.poll?'каждый будний день':'выключен')+'</div></div></div>';
  h+='<div class="grid g2"><div class="grid" style="align-content:start">';
  h+='<div class="card"><h2>Флаги и вопросы</h2>'+(open.length?'':'<div class="empty">Всё разобрано</div>')+'<div class="rows">'+open.map(function(b){ var p=b.p?proj(b.p):null;
    return '<div class="row" style="align-items:start"><div><div class="t" style="font-weight:400">'+esc(b.text)+'</div><div class="s">'+dt(b.date)+(p?' · '+esc(p.name):'')+'</div>'+
      (b.lvl==="q"?'<div class="msg"><input class="field" id="ans-'+b.id+'" placeholder="Как поступать в таких случаях" aria-label="Ответ боту"><button type="button" class="btn sm pri" data-teach="'+b.id+'">Научить</button></div>':'')+
      '</div><span style="display:grid;justify-items:end;grid-gap:6px"><span class="pill '+({warn:"warn",bad:"bad",acc:"acc",q:"acc",info:""}[b.lvl])+'">'+({warn:"расхождение",bad:"контроль",acc:"заявка",q:"вопрос вам",info:"сделал сам"}[b.lvl])+'</span><button type="button" class="btn sm" data-done="'+b.id+'">Разобрано</button></span></div>' }).join("")+'</div></div>';
  h+='<div class="card"><h2>Обучение</h2><p class="muted" style="margin:0 0 10px;font-size:13px">Ситуация и как вы поступаете. Бот применяет это в похожих случаях и спрашивает, когда не уверен.</p><div class="rows">'+(db.train.length?'':'<div class="empty">Примеров пока нет</div>')+db.train.map(function(t){return '<div class="row" style="align-items:start"><div><div class="t">'+esc(t.sit)+'</div><div class="s" style="color:var(--fg)">→ '+esc(t.ans)+'</div></div><button type="button" class="btn sm" data-untrain="'+t.id+'" aria-label="Удалить пример">×</button></div>'}).join("")+'</div>'+
    '<div class="grid" style="grid-gap:8px;margin-top:12px"><input class="field" id="trSit" placeholder="Ситуация"><input class="field" id="trAns" placeholder="Как поступать"><button type="button" class="btn pri" data-act="train-add" style="justify-self:start">Добавить пример</button></div></div>';
  h+='</div><div class="grid" style="align-content:start">';
  function sw(k,t,d){return '<label class="sw"><input type="checkbox" data-cfg="'+k+'"'+(c[k]?' checked':'')+'><span><b>'+t+'</b><span class="muted">'+d+'</span></span></label>'}
  h+='<div class="card"><h2>Что бот делает сам</h2><div class="sws">'+sw("answer","Отвечает заказчикам","Только записи с меткой «для заказчика», без внутренней кухни")+sw("leads","Ведёт заявки","Холодные и тёплые; горячие передаёт менеджеру")+sw("poll","Опрашивает команду","Ответы попадают в график")+sw("remind","Напоминает о задачах","Если задачу не открыли или не приняли")+sw("draw","Дорисовывает размеры","Берёт из модели Контура, отправляет PDF подрядчику, пишет в журнал")+sw("tg","Канал Телеграм","")+sw("wa","Канал WhatsApp","Один и тот же бот и память")+'</div></div>';
  h+='<div class="card"><h2>Сроки</h2><dl class="kv" style="align-items:center;margin:0"><dt><label for="cfgPoll">Опрос команды</label></dt><dd><input class="field" type="time" id="cfgPoll" data-cfgv="pollAt" value="'+esc(c.pollAt)+'"></dd>'+
    '<dt><label for="cfgRem">Напомнить через, ч</label></dt><dd><input class="field" type="number" min="1" max="72" id="cfgRem" data-cfgv="remindH" value="'+c.remindH+'" style="width:90px"></dd>'+
    '<dt><label for="cfgEsc">Сообщить вам через, ч</label></dt><dd><input class="field" type="number" min="1" max="168" id="cfgEsc" data-cfgv="escH" value="'+c.escH+'" style="width:90px"></dd></dl></div>';
  h+='</div></div>';
  return h;
}
var auditF="", auditT=null, auditList=null, auditErr="";
function loadAudit(){ api("GET","/api/audit?limit=300&q="+encodeURIComponent(auditF)).then(function(r){ auditList=r.audit; auditErr=""; var el=$("auList"); if(el) el.innerHTML=auditRows() }).catch(function(e){ auditErr=e.message; var el=$("auList"); if(el) el.innerHTML=auditRows() }) }
function vData(){
  var h=head("Данные","Резервная копия базы и история действий");
  h+='<div class="grid g2"><div class="grid" style="align-content:start">';
  h+='<div class="card"><h2>Выгрузить всё</h2><p class="muted" style="margin:0 0 12px;font-size:13px">Пользователи и должности, проекты и команды, задачи, заявки, лента, список файлов, бот и график, история действий — одним файлом JSON. Сами файлы проектов лежат в папке данных сервера.</p>'+
    '<div class="toolbar" style="margin:0 -4px"><a class="btn pri" href="/api/admin/export" style="text-decoration:none">Скачать копию</a><a class="btn" href="/api/admin/export?hashes=1" style="text-decoration:none">С хешами паролей</a></div>'+
    '<p class="muted" style="font-size:12px;margin:10px 0 0">Пароли открытым текстом не хранятся нигде — только хеш scrypt. Копия с хешами нужна для полного переноса на другой сервер; храните её только у себя.</p></div>';
  h+='<div class="card"><h2>Восстановление</h2><p class="muted" style="margin:0;font-size:13px">Сервер хранит базу и файлы в папке данных (<code>DATA_DIR</code>). Полное восстановление — заменить эту папку копией. Забытый пароль сотрудника сбрасывается в разделе «Команда».</p></div>';
  h+='</div><div class="card"><h2>История действий</h2><input class="field" id="auF" placeholder="Поиск: имя, проект, действие" value="'+esc(auditF)+'" style="width:100%;margin-bottom:8px">'+
    '<div class="rows" id="auList">'+auditRows()+'</div></div></div>';
  setTimeout(loadAudit,0);
  return h;
}
function localTs(ts){ var d=new Date(String(ts).replace(" ","T")+"Z"); if(isNaN(d)) return String(ts); function z(n){return ("0"+n).slice(-2)} return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate())+" "+z(d.getHours())+":"+z(d.getMinutes()) }
function auditRows(){
  if(auditErr) return '<div class="empty">'+esc(auditErr)+'</div>';
  if(!auditList) return '<div class="empty">Загружаю…</div>';
  return auditList.length?auditList.map(function(a){return '<div class="row"><div><div class="t" style="font-weight:400">'+esc(a.text)+'</div><div class="s">'+esc(a.who)+' · '+esc(a.kind)+(a.ip?' · '+esc(a.ip):'')+'</div></div><span class="muted" style="font-size:12px;white-space:nowrap">'+esc(localTs(a.ts))+'</span></div>'}).join(""):'<div class="empty">Ничего не найдено</div>' }
var teamTab="people";
function vTeam(){
  var h=head("Команда","Сотрудники, роли, должности и доступы");
  h+='<div class="toolbar"><span class="seg"><button type="button" class="'+(teamTab==="people"?'on':'')+'" data-tab="people">Сотрудники</button><button type="button" class="'+(teamTab==="pos"?'on':'')+'" data-tab="pos">Должности и доступы</button></span>'+(teamTab==="people"?'<button type="button" class="btn pri" data-act="user-new">+ Сотрудник</button>':'<button type="button" class="btn pri" data-act="pos-new">+ Должность</button>')+'</div>';
  if(teamTab==="people"){
    h+='<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Имя</th><th>Уровень входа</th><th>Должность</th><th>Стадии</th><th>Объекты</th><th>Доступ</th></tr></thead><tbody>'+
      db.users.map(function(u){ var ps=posOf(u), stf=u.role==="staff", self=u.id===me.id, adm=u.role==="admin"&&me.role!=="admin";
        return '<tr'+(u.active?'':' style="opacity:.55"')+'><td class="n"><span class="who" style="margin:0"><span class="ava">'+ini(u.name)+'</span><span><b style="font-weight:500">'+esc(u.name)+'</b><br><span class="muted" style="font-size:12px">'+esc(u.login||"")+'</span></span></span></td>'+
        '<td><select class="field" data-role="'+u.id+'" aria-label="Уровень входа"'+(self||adm?' disabled':'')+'>'+Object.keys(ROLES).filter(function(r){return r!=="admin"||me.role==="admin"||u.role==="admin"}).map(function(r){return '<option value="'+r+'"'+(u.role===r?' selected':'')+'>'+ROLES[r]+'</option>'}).join("")+'</select></td>'+
        '<td>'+(stf?'<select class="field" data-pos="'+u.id+'" aria-label="Должность"><option value="">— не назначена —</option>'+db.positions.map(function(p){return '<option value="'+p.id+'"'+(u.posId===p.id?' selected':'')+'>'+esc(p.name)+'</option>'}).join("")+'</select>':'<span class="muted">'+(u.role==="client"?'—':'все права')+'</span>')+'</td>'+
        '<td>'+(stf&&ps?ps.stages.map(function(i){return '<span class="pill" style="margin:1px">'+STAGES[i]+'</span>'}).join(""):'<span class="muted">—</span>')+'</td><td>'+
        (u.projects==="all"?'<span class="pill">все объекты</span>':db.projects.length?db.projects.map(function(p){var on=u.role==="client"?p.client===u.id:p.team.indexOf(u.id)>=0;return '<button type="button" class="pill'+(on?' good':'')+'" style="margin:2px;cursor:pointer;background:none" data-acc="'+u.id+'" data-p="'+p.id+'" aria-pressed="'+on+'">'+esc(p.name.replace(/^Квартира в /,"Кв. "))+'</button>'}).join(""):'<span class="muted">проектов нет</span>')+'</td>'+
        '<td style="white-space:nowrap">'+(self||adm?'':'<button type="button" class="btn sm" data-reset="'+u.id+'">Сбросить пароль</button> <button type="button" class="btn sm" data-active="'+u.id+'">'+(u.active?'Отключить':'Включить')+'</button>')+'</td></tr>'}).join("")+
      '</tbody></table></div></div><p class="muted" style="font-size:12px">Уровень входа — админ, директор, сотрудник или заказчик. Права сотрудника задаёт должность; объекты открываются щелчком. Пароли система не хранит и не показывает — только сбрасывает на временный.</p>';
    return h;
  }
  h+='<div class="grid g2x">'+db.positions.map(function(p){ var n=db.users.filter(function(u){return u.posId===p.id}).length;
    return '<div class="card pos"><div class="pos-h"><input class="field pos-name" data-pname="'+p.id+'" value="'+esc(p.name)+'" aria-label="Название должности"><span class="muted" style="font-size:12px;white-space:nowrap">'+n+' чел.</span></div>'+
      '<div class="lbl" style="margin:12px 0 6px">Участвует в стадиях</div><div class="chips">'+STAGES.map(function(sn,i){var on=p.stages.indexOf(i)>=0;return '<button type="button" class="chip'+(on?' on':'')+'" data-pst="'+p.id+'" data-i="'+i+'" aria-pressed="'+on+'">'+sn+'</button>'}).join("")+'</div>'+
      '<div class="lbl" style="margin:14px 0 6px">Контур</div><select class="field" data-pk="'+p.id+'" aria-label="Доступ к Контуру">'+KLEV.map(function(k){return '<option value="'+k[0]+'"'+(p.kontur===k[0]?' selected':'')+'>'+k[1]+'</option>'}).join("")+'</select>'+
      '<div class="lbl" style="margin:14px 0 2px">Доступы</div><div class="perms">'+PERMS.map(function(q){return '<label class="perm"><input type="checkbox" data-pp="'+p.id+'" data-k="'+q[0]+'"'+(p.perms[q[0]]?' checked':'')+'><span>'+q[1]+'<small>'+q[2]+'</small></span></label>'}).join("")+'</div>'+
      '<div style="margin-top:12px;text-align:right"><button type="button" class="btn sm" data-pdel="'+p.id+'"'+(n?' disabled title="Сначала переназначьте сотрудников"':'')+'>Удалить должность</button></div></div>' }).join("")+'</div><p class="muted" style="font-size:12px">Изменения сохраняются сразу и действуют для всех сотрудников на этой должности.</p>';
  return h;
}

function vClient(){
  var p=myProjects()[0];
  if(!p) return head("Мой объект")+'<div class="card empty">Объект ещё не подключён. Менеджер добавит его после подписания договора.</div>';
  var st="";
  for(var i=0;i<6;i++) st+='<div class="step '+(i<p.stage?'d':i===p.stage?'c':'')+'"><i>'+(i<p.stage?'✓':i+1)+'</i>'+STAGES[i]+'</div>';
  var feed=db.feed.filter(function(f){return f.p===p.id && f.pub});
  var docs=db.files.filter(function(f){return f.p===p.id && f.pub}).slice(0,5);
  var lu=leadOf(p);
  var h=head(esc(p.name),esc([p.addr,p.area?p.area+' м²':''].filter(Boolean).join(' · ')));
  h+='<div class="grid g2" style="margin-bottom:16px"><div class="card hello"><div class="lbl" style="color:var(--on-graphite-2)">Готовность объекта</div><div class="big" id="bigPct">'+prog(p)+'%</div><div class="bar" style="background:#4a4846"><i id="bigBar" style="width:'+prog(p)+'%;background:var(--on-graphite)"></i></div><p class="muted" style="margin:12px 0 0">Сейчас идёт этап «'+STAGES[p.stage]+'».'+(p.due?' Плановая сдача — '+dty(p.due)+'.':'')+'</p></div>';
  h+='<div class="card"><h2>Ваш менеджер проекта</h2>'+(lu?'<span class="who"><span class="ava">'+ini(lu.name)+'</span><span><b style="font-weight:500">'+esc(lu.name)+'</b><br><span class="muted" style="font-size:12px">'+esc(lu.pos?lu.pos:posName(lu))+'</span></span></span>':'<div class="muted">Скоро назначим</div>')+'<div class="msg"><input class="field" id="cMsg" placeholder="Вопрос по объекту" aria-label="Вопрос по объекту"><button type="button" class="btn pri" data-act="c-send">Отправить</button></div><p class="muted" style="font-size:12px;margin:8px 0 0">Ответит бот или менеджер. Можно писать и в WhatsApp или Телеграм.</p></div></div>';
  h+=sceneCard(p,st,false);
  h+='<div class="grid g2"><div class="card feed"><h2>Что сделано</h2>'+(feed.length?'<div class="rows">'+feed.map(function(f){return '<div class="row"><div><div class="t" style="font-weight:400">'+esc(f.text)+'</div></div><span class="muted" style="font-size:12px">'+dt(f.date)+'</span></div>'}).join("")+'</div>':'<div class="empty">Команда скоро начнёт отмечать работы</div>')+'</div>';
  h+='<div class="card"><h2>Документы <a href="#storage">Все</a></h2>'+(docs.length?'<div class="rows">'+docs.map(function(f){return '<div class="row"><div class="t" style="font-weight:400;min-width:0">'+fileLink(f)+'</div><span class="muted" style="font-size:12px">'+dt(f.date)+'</span></div>'}).join("")+'</div>':'<div class="empty">Команда откроет вам проект, визуализации и акты здесь</div>')+'</div></div>';
  return h;
}

/* ---------- диалоги ---------- */
function dialog(title,body,onOk,okLabel){
  $("layer").innerHTML='<div class="modal" id="mdl"><form class="dlg" id="dlgF"><h3>'+title+'</h3>'+body+'<div class="dlg-err" id="dlgE" role="alert" style="color:var(--bad);font-size:13px;min-height:4px"></div><div class="acts"><button type="button" class="btn" data-act="close">Отмена</button><button type="submit" class="btn pri">'+(okLabel||'Сохранить')+'</button></div></form></div>';
  var f=$("dlgF"); var first=f.querySelector("input,select"); if(first) first.focus();
  f.addEventListener("submit",function(e){ e.preventDefault(); var d={};
    [].forEach.call(f.elements,function(x){ if(!x.name) return; if(x.type==="checkbox"){ if(!d[x.name]) d[x.name]=[]; if(x.checked) d[x.name].push(x.value) } else d[x.name]=x.value });
    var r=onOk(d); if(r===false) return;
    var sb=f.querySelector('[type="submit"]'); sb.disabled=true;
    Promise.resolve(r).then(function(){ if($("dlgF")===f) $("layer").innerHTML=""; return reload() }).catch(function(er){ sb.disabled=false; $("dlgE").textContent=er.message });
  });
}
function opt(list,sel){return list.map(function(o){return '<option value="'+esc(o[0])+'"'+(String(o[0])===String(sel)?' selected':'')+'>'+esc(o[1])+'</option>'}).join("")}
function info(title,html){ $("layer").innerHTML='<div class="modal" id="mdl"><div class="dlg"><h3>'+title+'</h3>'+html+'<div class="acts"><button type="button" class="btn pri" data-act="close">Понятно</button></div></div></div>' }
function showSecret(name,login,pw){
  info("Временный пароль",'<p style="margin:0">'+esc(name)+'</p><dl class="kv" style="margin:6px 0 0"><dt>Логин</dt><dd><b>'+esc(login)+'</b></dd><dt>Пароль</dt><dd><b style="font-family:ui-monospace,Menlo,monospace;font-size:16px;letter-spacing:.04em">'+esc(pw)+'</b></dd></dl>'+
    '<p class="muted" style="font-size:12px;margin:10px 0 0">Передайте лично или по телефону. Пароль показывается один раз — система его не хранит. При первом входе сотрудник задаст свой.</p>');
}
function projectDialog(p){
  var staff=db.users.filter(function(u){return u.active&&(u.role==="staff"||u.role==="director"||u.role==="admin")});
  var clients=db.users.filter(function(u){return u.active&&u.role==="client"});
  var team=p?p.team:[];
  dialog(p?"Проект":"Новый проект",
    '<label for="pn">Название<input class="field" id="pn" name="name" required value="'+esc(p?p.name:"")+'"></label>'+
    '<label for="pa">Адрес<input class="field" id="pa" name="address" value="'+esc(p?p.addr:"")+'"></label>'+
    '<div class="grid g2" style="grid-gap:10px"><label for="par">Площадь, м²<input class="field" id="par" name="area" type="number" min="0" step="0.1" value="'+(p&&p.area?p.area:"")+'"></label><label for="pd">Срок сдачи<input class="field" id="pd" name="due" type="date" value="'+esc(p?p.due:"")+'"></label></div>'+
    '<label for="pl">Ответственный<select class="field" id="pl" name="leadId"><option value="">— не назначен —</option>'+opt(staff.map(function(u){return [u.id,u.name+(u.role==="staff"?" · "+posName(u):"")]}),p?p.lead:"")+'</select></label>'+
    '<label for="pc">Заказчик<select class="field" id="pc" name="clientId"><option value="">— не подключён —</option>'+opt(clients.map(function(u){return [u.id,u.name]}),p?p.client:"")+'</select></label>'+
    '<div class="grid g2" style="grid-gap:10px"><label for="pb">Бюджет, ₸<input class="field" id="pb" name="budget" type="number" min="0" step="1000" value="'+(p?p.budget:"")+'"></label><label for="pp">Оплачено, ₸<input class="field" id="pp" name="paid" type="number" min="0" step="1000" value="'+(p?p.paid:"")+'"></label></div>'+
    '<label for="pk">Модель в Контуре<input class="field" id="pk" name="konturFile" placeholder="kvartira-80.kontur" value="'+esc(p?p.kontur:"")+'"></label>'+
    '<div class="lbl" style="margin-top:4px">Команда</div><div class="perms" style="max-height:180px;overflow:auto">'+staff.filter(function(u){return u.role==="staff"}).map(function(u){return '<label class="perm"><input type="checkbox" name="members" value="'+u.id+'"'+(team.indexOf(u.id)>=0?' checked':'')+'><span>'+esc(u.name)+'<small>'+esc(posName(u))+'</small></span></label>'}).join("")+'</div>',
    function(d){ if(!d.name.trim()) return false;
      var body={name:d.name.trim(),address:d.address,area:d.area?+d.area:null,due:d.due||null,leadId:num(d.leadId),clientId:num(d.clientId),budget:+d.budget||0,paid:+d.paid||0,konturFile:d.konturFile};
      var ids=(d.members||[]).map(num); if(body.leadId&&ids.indexOf(body.leadId)<0) ids.push(body.leadId);
      // руководство (не staff) в команде сохраняем как было
      if(p) p.team.forEach(function(id){ var u=user(id); if(u&&u.role!=="staff"&&ids.indexOf(num(id))<0) ids.push(num(id)) });
      if(!p) return api("POST","/api/projects",Object.assign(body,{members:ids})).then(function(r){ toast("Проект создан"); return reload().then(function(){ location.hash="#project-p"+r.project.id }) });
      return api("PATCH","/api/projects/"+num(p.id),body).then(function(){ return api("PUT","/api/projects/"+num(p.id)+"/members",{userIds:ids}) }).then(function(){ toast("Проект сохранён") });
    });
}

/* ---------- события ---------- */
document.addEventListener("click",function(e){
  var t=e.target, b;
  if((b=t.closest("[data-act]"))){
    var a=b.getAttribute("data-act");
    if(a==="out"){ $("layer").innerHTML=""; signOut() }
    else if(a==="away") act(api("PATCH","/api/me",{away:!me.away}), me.away?"С возвращением в офис":"Отмечено: вы на объекте");
    else if(a==="close") $("layer").innerHTML="";
    else if(a==="back") location.hash="#projects";
    else if(a==="pw") passwordDialog(false);
    else if(a==="lead-new") dialog("Новая заявка",
      '<label for="ln">Имя<input class="field" id="ln" name="name" required></label><label for="lo">Объект<input class="field" id="lo" name="obj" placeholder="Квартира 80 м², ЖК …"></label><label for="ls">Источник<select class="field" id="ls" name="src">'+opt([["Instagram","Instagram"],["Сайт","Сайт"],["Рекомендация","Рекомендация"],["Телеграм-бот","Телеграм-бот"],["WhatsApp","WhatsApp"]])+'</select></label><label for="lnx">Следующий контакт<input class="field" id="lnx" type="date" name="next" value="'+TODAY+'"></label><label for="lx">Заметка<input class="field" id="lx" name="note"></label>',
      function(d){ if(!d.name.trim()) return false; return api("POST","/api/leads",{name:d.name.trim(),obj:d.obj,src:d.src,next:d.next||null,note:d.note}).then(function(){ toast("Заявка добавлена") }) });
    else if(a==="task-new"){ var p=proj(sub); var cand=p.team.map(user).filter(Boolean); dialog("Новая задача",
      '<label for="tx">Что сделать<input class="field" id="tx" name="text" required></label><label for="tw">Кто<select class="field" id="tw" name="who">'+opt(cand.map(function(u){return [u.id,u.name]}),p.lead)+'</select></label><label for="td">Срок<input class="field" id="td" type="date" name="due" value="'+TODAY+'"></label>',
      function(d){ if(!d.text.trim()) return false; return api("POST","/api/projects/"+num(p.id)+"/tasks",{text:d.text.trim(),assigneeId:num(d.who),due:d.due||null}).then(function(){ toast("Задача поставлена — бот напомнит исполнителю") }) }); }
    else if(a==="proj-new") projectDialog(null);
    else if(a==="proj-edit") projectDialog(proj(sub));
    else if(a==="user-new") dialog("Новый пользователь",
      '<label for="un">Имя и фамилия<input class="field" id="un" name="name" required></label><label for="ul">Логин<input class="field" id="ul" name="login" required autocapitalize="none" spellcheck="false" placeholder="латиница, от 3 символов"></label><label for="ur">Уровень входа<select class="field" id="ur" name="role">'+opt(Object.keys(ROLES).filter(function(r){return r!=="admin"||me.role==="admin"}).map(function(r){return [r,ROLES[r]]}),"staff")+'</select></label><label for="upos">Должность (для сотрудника)<select class="field" id="upos" name="posId"><option value="">— не назначена —</option>'+opt(db.positions.map(function(p){return [p.id,p.name]}),"")+'</select></label><label for="uph">Телефон<input class="field" id="uph" name="phone" type="tel" placeholder="+7 …"></label><p class="muted" style="font-size:12px;margin:0">Пароль система придумает сама и покажет один раз.</p>',
      function(d){ if(!d.name.trim()||!d.login.trim()) return false; return api("POST","/api/users",{name:d.name.trim(),login:d.login.trim(),role:d.role,positionId:num(d.posId),phone:d.phone||null}).then(function(r){ setTimeout(function(){ showSecret(r.user.name,r.user.login,r.tempPassword) },0) }) },"Добавить");
    else if(a==="pos-new"){ var nn="Новая должность", k=2; while(db.positions.some(function(x){return x.name===nn})) nn="Новая должность "+(k++); act(api("POST","/api/positions",{name:nn,kontur:"view",stages:[],perms:["storage"]}),"Должность добавлена — настройте доступы") }
    else if(a==="train-add"){ var si=$("trSit").value.trim(), an=$("trAns").value.trim(); if(si&&an) act(api("POST","/api/bot/train",{sit:si,ans:an}),"Бот запомнил пример") }
    else if(a==="c-send"){ var i=$("cMsg"), cp=myProjects()[0]; if(i.value.trim()&&cp){ var q=i.value.trim(); api("POST","/api/projects/"+num(cp.id)+"/question",{text:q}).then(function(){ i.value=""; toast("Вопрос передан менеджеру проекта") }).catch(fail) } }
    else if(a==="feed-add"){ var fi=$("feedT"); if(fi.value.trim()) act(api("POST","/api/projects/"+num(sub)+"/feed",{text:fi.value.trim(),public:$("feedPub")?$("feedPub").checked:false}),"Записано в ленту") }
    else if(a==="audit-more"){ loadAudit(true) }
    return;
  }
  if((b=t.closest("[data-tab]"))){ teamTab=b.getAttribute("data-tab"); render(); return }
  if((b=t.closest("[data-pst]"))){ var ps=db.positions.filter(function(x){return x.id===b.getAttribute("data-pst")})[0], si2=+b.getAttribute("data-i"), st=ps.stages.slice(), k2=st.indexOf(si2); if(k2>=0) st.splice(k2,1); else st.push(si2); act(api("PATCH","/api/positions/"+num(ps.id),{stages:st})); return }
  if((b=t.closest("[data-pdel]"))){ act(api("DELETE","/api/positions/"+num(b.getAttribute("data-pdel"))),"Должность удалена"); return }
  if((b=t.closest("[data-g]"))){ var gid=b.getAttribute("data-g"); gOpen[gid]=!gOpen[gid]; render(); return }
  if((b=t.closest("[data-done]"))){ act(api("PATCH","/api/bot/log/"+num(b.getAttribute("data-done")),{done:true})); return }
  if((b=t.closest("[data-teach]"))){ var id=b.getAttribute("data-teach"), inp=$("ans-"+id); if(inp&&inp.value.trim()) act(api("POST","/api/bot/log/"+num(id)+"/teach",{answer:inp.value.trim()}),"Бот запомнил и ответит сам в похожих случаях"); return }
  if((b=t.closest("[data-untrain]"))){ act(api("DELETE","/api/bot/train/"+b.getAttribute("data-untrain"))); return }
  if((b=t.closest("[data-open]"))){ location.hash="#project-"+b.getAttribute("data-open"); return }
  if((b=t.closest("[data-folder]"))){ folder=b.getAttribute("data-folder"); if(view!=="storage"){ return } render(); return }
  if((b=t.closest("[data-mv]"))){ var l=db.leads.filter(function(x){return x.id===b.getAttribute("data-mv")})[0]; var ix=LEAD_ST.map(function(s){return s[0]}).indexOf(l.st)+(+b.getAttribute("data-d")); act(api("PATCH","/api/leads/"+num(l.id),{status:LEAD_ST[Math.max(0,Math.min(3,ix))][0]})); return }
  if((b=t.closest("[data-stage]"))){ var pp=proj(sub); var ns=Math.max(0,Math.min(5,pp.stage+(+b.getAttribute("data-stage")))); if(ns!==pp.stage) act(api("PATCH","/api/projects/"+num(pp.id),{stage:ns,stagePct:ns>pp.stage?0:100}),"Стадия: "+STAGES[ns]); return }
  if((b=t.closest("[data-vis]"))){ var f=db.files.filter(function(x){return x.id===b.getAttribute("data-vis")})[0]; act(api("PATCH","/api/files/"+f.n,{public:!f.pub}),!f.pub?"Файл виден заказчику":"Файл скрыт от заказчика"); return }
  if((b=t.closest("[data-fdel]"))){ var fd=db.files.filter(function(x){return x.id===b.getAttribute("data-fdel")})[0];
    if(b.getAttribute("data-sure")!=="1"){ b.setAttribute("data-sure","1"); b.textContent="Удалить?"; setTimeout(function(){ if(b.parentNode){ b.removeAttribute("data-sure"); b.textContent="×" } },3000); return }
    act(api("DELETE","/api/files/"+fd.n),"Файл удалён"); return }
  if((b=t.closest("[data-acc]"))){ var pa=proj(b.getAttribute("data-p")), uid=b.getAttribute("data-acc"); if(!pa) return; var ids=pa.team.slice(), k=ids.indexOf(uid); if(k>=0) ids.splice(k,1); else ids.push(uid);
    var ua=user(uid); if(ua&&ua.role==="client"){ act(api("PATCH","/api/projects/"+num(pa.id),{clientId:pa.client===uid?null:num(uid)})); return }
    act(api("PUT","/api/projects/"+num(pa.id)+"/members",{userIds:ids.map(num)})); return }
  if((b=t.closest("[data-reset]"))){ var ur=user(b.getAttribute("data-reset")); dialog("Сбросить пароль?",'<p style="margin:0">'+esc(ur.name)+' получит новый временный пароль, все его входы на устройствах завершатся.</p>',
      function(){ return api("POST","/api/users/"+num(ur.id)+"/reset-password").then(function(r){ setTimeout(function(){ showSecret(ur.name,ur.login,r.tempPassword) },0) }) },"Сбросить"); return }
  if((b=t.closest("[data-active]"))){ var uact=user(b.getAttribute("data-active")); act(api("PATCH","/api/users/"+num(uact.id),{active:!uact.active}),uact.active?"Доступ отключён":"Доступ включён"); return }
});
document.addEventListener("input",function(e){
  if(e.target.id==="auF"){ auditF=e.target.value; clearTimeout(auditT); auditT=setTimeout(function(){ loadAudit() },350); return }
  if(e.target.id!=="spR") return; var p=proj(sub); var v=+e.target.value;
  OmniScene.setProgress(v); $("scPct").textContent=v+"%"; $("scCap").textContent=OmniScene.caption(p.stage,v);
});
document.addEventListener("change",function(e){
  var t=e.target;
  if(t.id==="spR"){ act(api("PATCH","/api/projects/"+num(sub),{stagePct:+t.value})); return }
  if(t.hasAttribute("data-pos")){ act(api("PATCH","/api/users/"+num(t.getAttribute("data-pos")),{positionId:num(t.value)}),"Должность назначена"); return }
  if(t.hasAttribute("data-pp")){ var pid=t.getAttribute("data-pp"), list=[].map.call(document.querySelectorAll('[data-pp="'+pid+'"]:checked'),function(x){return x.getAttribute("data-k")}); act(api("PATCH","/api/positions/"+num(pid),{perms:list}),"Доступ обновлён"); return }
  if(t.hasAttribute("data-pk")){ act(api("PATCH","/api/positions/"+num(t.getAttribute("data-pk")),{kontur:t.value}),"Доступ к Контуру обновлён"); return }
  if(t.hasAttribute("data-pname")){ if(t.value.trim()) act(api("PATCH","/api/positions/"+num(t.getAttribute("data-pname")),{name:t.value.trim()}),"Название сохранено"); return }
  if(t.hasAttribute("data-cfg")){ var c={}; c[t.getAttribute("data-cfg")]=t.checked; act(api("PUT","/api/bot/config",c)); return }
  if(t.hasAttribute("data-cfgv")){ var c2={}; c2[t.getAttribute("data-cfgv")]=t.value; act(api("PUT","/api/bot/config",c2),"Сохранено"); return }
  if(t.hasAttribute("data-task")){ act(api("PATCH","/api/tasks/"+num(t.getAttribute("data-task")),{done:t.checked})); return }
  if(t.hasAttribute("data-role")){ act(api("PATCH","/api/users/"+num(t.getAttribute("data-role")),{role:t.value}),"Уровень входа изменён"); return }
  if(t.id==="upl"){ addFiles(t.files); t.value="" }
});
function addFiles(list){
  if(folder==="all"||!list||!list.length) return;
  var files=[].slice.call(list), done=0, pid=num(folder), errs=[];
  toast("Загружаю: "+files.length+" файл(ов)…");
  function next(){
    if(!files.length){ reload(); toast(errs.length?("Не загружено: "+errs.join("; ")):("Загружено файлов: "+done)); return }
    var f=files.shift();
    api("POST","/api/projects/"+pid+"/files",null,{body:f,type:f.type||"application/octet-stream",name:f.name}).then(function(){ done++; next() },function(e){ errs.push(f.name+" — "+e.message); next() });
  }
  next();
}
/* перетаскивание: заявки и файлы */
document.addEventListener("dragstart",function(e){var l=e.target.closest&&e.target.closest("[data-lead]"); if(l){ leadDrag=l.getAttribute("data-lead"); try{e.dataTransfer.setData("text/plain",leadDrag)}catch(x){} }});
document.addEventListener("dragover",function(e){
  var c=e.target.closest&&e.target.closest(".col"); if(c&&leadDrag){e.preventDefault(); c.classList.add("over")}
  var d=e.target.closest&&e.target.closest("#drop"); if(d&&!leadDrag){e.preventDefault(); d.classList.add("over")}
});
document.addEventListener("dragleave",function(e){var c=e.target.closest&&e.target.closest(".col,#drop"); if(c) c.classList.remove("over")});
document.addEventListener("drop",function(e){
  var c=e.target.closest&&e.target.closest(".col");
  if(c&&leadDrag){ e.preventDefault(); var lid=leadDrag; leadDrag=null; act(api("PATCH","/api/leads/"+num(lid),{status:c.getAttribute("data-st")})); return }
  var d=e.target.closest&&e.target.closest("#drop"); if(d){ e.preventDefault(); d.classList.remove("over"); addFiles(e.dataTransfer.files) }
});
document.addEventListener("dragend",function(){leadDrag=null});

/* ---------- запуск: если сессия жива — сразу в кабинет ---------- */
api("GET","/api/state").then(function(s){ fromState(s); enter() },function(){ $("login").hidden=false });
})();

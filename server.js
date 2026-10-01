const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');
let Pool;try{Pool=require('pg').Pool}catch{}
const db=process.env.DATABASE_URL&&Pool?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false}):null;
const memProfiles=new Map();
const CATALOG={body:['Nebula Pants','Solar Visor','Titan Helmet','Comet Suit','Chrome Pack'],pet:['Drone Pup','Moon Cat','Mini Rover','Star Blob','Orbit Chick'],random:['Nebula Pants','Solar Visor','Titan Helmet','Comet Suit','Chrome Pack','Drone Pup','Moon Cat','Mini Rover','Star Blob','Orbit Chick','Nova Nameplate','Warp Victory']};
async function initDB(){if(!db)return;await db.query(`CREATE TABLE IF NOT EXISTS profiles (username TEXT PRIMARY KEY, passhash TEXT NOT NULL, credits INT NOT NULL DEFAULT 0, xp INT NOT NULL DEFAULT 0, wins INT NOT NULL DEFAULT 0, games INT NOT NULL DEFAULT 0, inventory JSONB NOT NULL DEFAULT '[]'::jsonb, equipped JSONB NOT NULL DEFAULT '{}'::jsonb)`)}
initDB().catch(console.error);
function passhash(user,pin){return crypto.scryptSync(String(pin),String(user).toLowerCase(),32).toString('hex')}
async function getProfile(u){u=String(u||'').trim().toLowerCase();if(db){let q=await db.query('SELECT * FROM profiles WHERE username=$1',[u]);return q.rows[0]||null}return memProfiles.get(u)||null}
async function saveProfile(x){if(db)await db.query(`INSERT INTO profiles(username,passhash,credits,xp,wins,games,inventory,equipped) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(username) DO UPDATE SET credits=$3,xp=$4,wins=$5,games=$6,inventory=$7,equipped=$8`,[x.username,x.passhash,x.credits,x.xp,x.wins,x.games,JSON.stringify(x.inventory||[]),JSON.stringify(x.equipped||{})]);else memProfiles.set(x.username,x)}
function publicProfile(x){return x&&{username:x.username,credits:x.credits,xp:x.xp,wins:x.wins,games:x.games,inventory:x.inventory||[],equipped:x.equipped||{},persistent:!!db}}
const app=express(),server=http.createServer(app),io=new Server(server);

// One-file AI upgrade: this server injects ADD AI / REMOVE AI controls into the existing index.html.
app.get('/',(req,res)=>{
  try{
    let html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
    const patch=`<script>(function(){
      function install(){
        const hs=document.getElementById('hostSettings');
        if(!hs||document.getElementById('addAI')) return;
        const wrap=document.createElement('div');
        wrap.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px';
        wrap.innerHTML='<button id="addAI" type="button">+ ADD AI</button><button id="removeAI" type="button">− REMOVE AI</button>';
        const start=document.getElementById('start');
        hs.insertBefore(wrap,start);
        document.getElementById('addAI').onclick=()=>socket.emit('addAI');
        document.getElementById('removeAI').onclick=()=>socket.emit('removeAI');
      }
      if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
    })();</script>`;
    res.type('html').send(html.replace('</body>',patch+'</body>'));
  }catch(e){res.status(500).send('Missing index.html');}
});
app.use(express.static(__dirname));

const rooms=new Map();
const ROOMS=[[120,420,430,430],[610,160,470,360],[640,650,420,340],[1160,480,650,520],[1930,250,430,340],[2520,520,450,500],[1910,800,430,330],[1050,1190,430,350],[1570,1280,650,480],[480,1050,400,330],[520,1540,500,370],[2350,1320,450,350]];
const CORR=[[250,590,2750,170],[760,280,170,1500],[1380,650,170,800],[2010,370,170,1100],[650,1290,1900,180]];
const PROPS=[[1540,1400,55,48],[1610,1400,55,48],[1690,1400,65,50],[1880,1580,60,50],[1970,1580,65,50],[1300,560,100,50],[1500,560,100,50],[730,410,120,70],[680,1670,125,75],[2290,1460,55,90],[2390,1460,55,90]];
const TASKS=[[300,610],[790,310],[790,810],[1370,640],[1610,820],[2070,400],[2740,760],[2080,930],[1240,1350],[1770,1480],[700,1200],[760,1710],[2530,1460],[2450,1570]];
const VENTS=[[355,700],[850,430],[890,850],[1320,850],[1700,650],[2110,500],[2710,850],[2070,1000],[1180,1360],[1810,1570],[710,1230],[820,1720],[2530,1510]];
const EM=[1480,735];
const inside=(x,y,r,m=0)=>x>r[0]-m&&x<r[0]+r[2]+m&&y>r[1]-m&&y<r[1]+r[3]+m;
function floor(x,y){return ROOMS.some(r=>inside(x,y,[r[0]+18,r[1]+18,r[2]-36,r[3]-36]))||CORR.some(r=>inside(x,y,[r[0]+18,r[1]+18,r[2]-36,r[3]-36]));}
function walkable(x,y){return floor(x,y)&&!PROPS.some(r=>inside(x,y,r,22));}
const code=()=>Math.random().toString(36).slice(2,8).toUpperCase();
const safe=s=>String(s||'Player').replace(/[<>]/g,'').slice(0,14)||'Player';
const d2=(a,b)=>Math.hypot(a.x-b[0],a.y-b[1]);
const pd=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function publicPlayer(p){return{id:p.id,name:p.name,color:p.color,hat:p.hat,pet:p.pet,alive:p.alive,x:p.x,y:p.y,done:p.done,isBot:!!p.isBot};}
function view(r){return{code:r.code,host:r.host,started:r.started,settings:r.settings,bodies:r.bodies.map(b=>({...b})),players:[...r.players.values()].map(publicPlayer)};}
function emit(r){io.to(r.code).emit('room',view(r));}
async function end(r,title,text){if(!r.started)return;r.started=false;io.to(r.code).emit('victory',{title,text});const crewWin=title.startsWith('CREW');for(const p of r.players.values()){if(p.isBot||!p.account)continue;try{const a=await getProfile(p.account);if(!a)continue;a.games++;const won=crewWin?(p.role!=='Impostor'&&p.role!=='Viper'):(p.role==='Impostor'||p.role==='Viper');if(won){a.wins++;a.credits+=100;a.xp+=50}else{a.credits+=20;a.xp+=15}await saveProfile(a);io.to(p.id).emit('profile',publicProfile(a));}catch(e){console.error('reward',e)}}setTimeout(()=>emit(r),3500);}
function win(r){if(!r.started)return;const ps=[...r.players.values()],alive=ps.filter(p=>p.alive),imps=alive.filter(p=>p.role==='Impostor'||p.role==='Viper'),crew=alive.filter(p=>p.role!=='Impostor'&&p.role!=='Viper');if(!imps.length)return end(r,'CREW VICTORY','All Impostors were eliminated.');if(imps.length>=crew.length)return end(r,'IMPOSTOR VICTORY','Impostors reached parity.');const crewAll=ps.filter(p=>p.role!=='Impostor'&&p.role!=='Viper');if(crewAll.length&&crewAll.every(p=>p.done>=7))end(r,'CREW VICTORY','All crew tasks were completed.');}
function shuffled(n){let a=Array.from({length:n},(_,i)=>i);for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function playerBase(id,d,color){return{id,name:safe(d.name),color:d.color||color,hat:d.hat||'none',pet:d.pet||'none',alive:true,x:1450,y:760,done:0,role:null,judgeUsed:false,assignments:[],isBot:false,account:null,poisonedUntil:0};}

const BOT_NAMES=['Nova AI','Pixel AI','Orbit AI','Echo AI','Comet AI','Vega AI','Bolt AI','Mochi AI','Quasar AI'];
const BOT_COLORS=['#4fa65f','#d7b33d','#9560c4','#df7c42','#51a7a8','#d9689b','#7d8ba0','#8c6b4f','#6b7bd4'];
const BOT_HATS=['none','cap','beanie','hardhat','sprout','cowboy','tophat'];
const BOT_PETS=['none','robot','blob','chick','buddy','dog','cat'];
function rand(a){return a[Math.floor(Math.random()*a.length)];}
function makeBot(r){
  const used=new Set([...r.players.values()].map(p=>p.name));
  let name=BOT_NAMES.find(n=>!used.has(n))||('Crew AI '+(r.players.size+1));
  const id='bot_'+Math.random().toString(36).slice(2,10);
  const p=playerBase(id,{name,color:rand(BOT_COLORS),hat:rand(BOT_HATS),pet:rand(BOT_PETS)},rand(BOT_COLORS));
  p.isBot=true;
  p.ai={
    personality:{caution:.35+Math.random()*.55,teamwork:.25+Math.random()*.7,aggression:.2+Math.random()*.75,deception:.25+Math.random()*.7,confidence:.3+Math.random()*.65},
    suspicion:new Map(),memory:[],goal:null,path:[],pathAt:0,waitUntil:0,lastPlan:0,lastTaskAt:0,lastKillAt:0,lastVentAt:0,lastMeetingAt:0,lastBodySeen:null,escapeUntil:0,fakeTaskUntil:0,lastX:p.x,lastY:p.y,stuckFor:0
  };
  return p;
}

// Lightweight A* navigation across the same collision geometry as humans.
const CELL=110,MAX_X=3060,MAX_Y=2060;
function cellPoint(ix,iy){return{x:ix*CELL+35,y:iy*CELL+35};}
function nearestCell(x,y){
  const ix=Math.max(0,Math.min(Math.floor(MAX_X/CELL),Math.round((x-35)/CELL)));
  const iy=Math.max(0,Math.min(Math.floor(MAX_Y/CELL),Math.round((y-35)/CELL)));
  for(let rad=0;rad<6;rad++) for(let dx=-rad;dx<=rad;dx++) for(let dy=-rad;dy<=rad;dy++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==rad)continue;
    const a=ix+dx,b=iy+dy,p=cellPoint(a,b); if(a>=0&&b>=0&&p.x<=MAX_X&&p.y<=MAX_Y&&walkable(p.x,p.y))return[a,b];
  }
  return[ix,iy];
}
function astar(sx,sy,gx,gy){
  const s=nearestCell(sx,sy),g=nearestCell(gx,gy),sk=s.join(','),gk=g.join(',');
  if(sk===gk)return[{x:gx,y:gy}];
  const open=new Map([[sk,{ix:s[0],iy:s[1],g:0,f:0}]]),came=new Map(),score=new Map([[sk,0]]);
  let loops=0;
  while(open.size&&loops++<1200){
    let ck=null,cur=null;for(const [k,v] of open){if(!cur||v.f<cur.f){ck=k;cur=v;}}
    open.delete(ck); if(ck===gk){let keys=[ck],k=ck;while(came.has(k)){k=came.get(k);keys.push(k);}keys.reverse();let out=keys.slice(1).map(z=>{let [a,b]=z.split(',').map(Number);return cellPoint(a,b)});out.push({x:gx,y:gy});return out;}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const nx=cur.ix+dx,ny=cur.iy+dy,np=cellPoint(nx,ny);if(nx<0||ny<0||np.x>MAX_X||np.y>MAX_Y||!walkable(np.x,np.y))continue;
      if(dx&&dy){const p1=cellPoint(cur.ix+dx,cur.iy),p2=cellPoint(cur.ix,cur.iy+dy);if(!walkable(p1.x,p1.y)||!walkable(p2.x,p2.y))continue;}
      const nk=nx+','+ny,ng=cur.g+(dx&&dy?1.414:1);if(ng>=(score.get(nk)??1e9))continue;score.set(nk,ng);came.set(nk,ck);const h=Math.hypot(nx-g[0],ny-g[1]);open.set(nk,{ix:nx,iy:ny,g:ng,f:ng+h});
    }
  }
  return[{x:gx,y:gy}];
}
function setGoal(p,type,x,y,extra={}){p.ai.goal={type,x,y,...extra};p.ai.path=astar(p.x,p.y,x,y);p.ai.pathAt=Date.now();}
function stepPath(r,p,dt){
  if(!p.ai.path?.length)return false;let q=p.ai.path[0],dx=q.x-p.x,dy=q.y-p.y,m=Math.hypot(dx,dy);if(m<16){p.ai.path.shift();return true;}const speed=145+55*p.ai.personality.confidence,step=Math.min(m,speed*dt);let nx=p.x+dx/m*step,ny=p.y+dy/m*step;if(walkable(nx,ny)){p.x=nx;p.y=ny;}else{p.ai.path=astar(p.x,p.y,p.ai.goal.x,p.ai.goal.y);}io.to(r.code).emit('moved',{id:p.id,x:p.x,y:p.y,color:p.color,hat:p.hat,pet:p.pet,alive:p.alive});return true;
}
function addMemory(p,type,data={}){p.ai.memory.push({type,t:Date.now(),...data});if(p.ai.memory.length>30)p.ai.memory.shift();}
function suspect(p,id,amount){if(!id||id===p.id)return;p.ai.suspicion.set(id,Math.max(0,(p.ai.suspicion.get(id)||0)+amount));}
function visibleWitnesses(r,killer,victim){return[...r.players.values()].filter(q=>q.alive&&q.id!==killer.id&&q.id!==victim.id&&q.role!=='Impostor'&&q.role!=='Viper'&&pd(q,victim)<360).length;}
function doKill(r,k,v){
  if(!r.started||!k.alive||!v.alive||!(k.role==='Impostor'||k.role==='Viper')||((v.role==='Impostor'||v.role==='Viper')||v.role==='Viper')||pd(k,v)>110)return false;
  v.alive=false;const body={id:'b'+Date.now()+Math.random(),victim:v.id,x:v.x,y:v.y,name:v.name,color:v.color,reported:false};r.bodies.push(body);io.to(r.code).emit('killed',{id:v.id,body});
  for(const q of r.players.values())if(q.isBot&&q.alive&&q.id!==k.id&&q.id!==v.id&&pd(q,v)<430){suspect(q,k.id,72+Math.random()*28);addMemory(q,'saw_kill',{killer:k.id,victim:v.id});}
  win(r);return true;
}
function completeBotTask(r,p,i){if(!p.assignments.includes(i)||(p.role==='Impostor'||p.role==='Viper')||!p.alive)return;p.assignments=p.assignments.filter(x=>x!==i);p.done++;io.to(r.code).emit('taskProgress',{id:p.id,done:p.done,total:[...r.players.values()].filter(x=>x.role!=='Impostor'&&x.role!=='Viper').length*7});win(r);}
function botPlan(r,p,now){
  if(!p.alive||r.meeting)return;
  // Decay old suspicions so bots can change their minds.
  for(const [id,v] of p.ai.suspicion)p.ai.suspicion.set(id,v*.997);
  // Remember nearby people, useful if a body appears seconds later.
  for(const q of r.players.values())if(q.id!==p.id&&q.alive&&pd(p,q)<280)addMemory(p,'near',{id:q.id,x:q.x,y:q.y});
  const body=r.bodies.filter(b=>!b.reported).sort((a,b)=>Math.hypot(p.x-a.x,p.y-a.y)-Math.hypot(p.x-b.x,p.y-b.y))[0];
  if(body&&Math.hypot(p.x-body.x,p.y-body.y)<155&&p.role!=='Impostor'){
    const recent=p.ai.memory.filter(m=>m.type==='near'&&m.t>now-9000&&Math.hypot((m.x||0)-body.x,(m.y||0)-body.y)<420);for(const m of recent)suspect(p,m.id,10);
    body.reported=true;startMeeting(r,`${p.name} reported ${body.name}!`);return;
  }
  if(p.role==='Impostor'||p.role==='Viper')return planImpostor(r,p,now);
  // Crew sometimes investigates/shadows someone they distrust instead of robotically bee-lining a task.
  let top=null,topS=0;for(const [id,s] of p.ai.suspicion){const q=r.players.get(id);if(q?.alive&&s>topS){top=q;topS=s;}}
  if(top&&topS>55&&p.ai.personality.teamwork>.58&&Math.random()<.18){setGoal(p,'shadow',top.x,top.y,{target:top.id});return;}
  if(p.assignments.length){
    let best=p.assignments[0],bd=1e9;for(const i of p.assignments){const t=TASKS[i],dd=Math.hypot(p.x-t[0],p.y-t[1]);if(dd<bd){bd=dd;best=i;}}
    const t=TASKS[best];setGoal(p,'task',t[0],t[1],{task:best});return;
  }
  // Finished crew roam toward other living crew, which creates believable grouping.
  const mates=[...r.players.values()].filter(q=>q.id!==p.id&&q.alive&&q.role!=='Impostor'&&q.role!=='Viper');const q=rand(mates);if(q)setGoal(p,'group',q.x,q.y,{target:q.id});else setGoal(p,'wander',EM[0],EM[1]);
}
function planImpostor(r,p,now){
  const crew=[...r.players.values()].filter(q=>q.alive&&q.role!=='Impostor'&&q.role!=='Viper');if(!crew.length)return;
  let best=null,bestScore=-1e9;for(const q of crew){const witnesses=visibleWitnesses(r,p,q),distance=pd(p,q);const isolated=220-witnesses*180;const score=isolated-distance*.25+Math.random()*80+p.ai.personality.aggression*100;if(score>bestScore){best=q;bestScore=score;}}
  if(best&&pd(p,best)<108&&now-p.ai.lastKillAt>9000&&visibleWitnesses(r,p,best)<= (p.ai.personality.aggression>.8?1:0)){
    if(doKill(r,p,best)){p.ai.lastKillAt=now;p.ai.escapeUntil=now+5000;const v=VENTS.slice().sort((a,b)=>d2(p,a)-d2(p,b))[0];if(v&&d2(p,v)<250)setGoal(p,'escapeVent',v[0],v[1]);else{const far=rand(TASKS);setGoal(p,'escape',far[0],far[1]);}return;}
  }
  // During escape, prioritize leaving the body area.
  if(p.ai.escapeUntil>now){const far=TASKS.slice().sort((a,b)=>d2(p,b)-d2(p,a))[0];setGoal(p,'escape',far[0],far[1]);return;}
  // Stalk promising victim if reasonably isolated; otherwise fake a task.
  if(best&&visibleWitnesses(r,p,best)<=1&&Math.random()<.68){setGoal(p,'stalk',best.x,best.y,{target:best.id});return;}
  const fake=rand(TASKS);setGoal(p,'fakeTask',fake[0],fake[1]);
}
function botReached(r,p,now){const g=p.ai.goal;if(!g)return;
  if(g.type==='task'){
    if(!p.ai.waitUntil){const base={Easy:2400,Medium:3400,Hard:4700,Insane:6200}[r.settings.difficulty]||3400;p.ai.waitUntil=now+base*(.8+Math.random()*.55);return;}
    if(now>=p.ai.waitUntil){p.ai.waitUntil=0;completeBotTask(r,p,g.task);p.ai.goal=null;}
  }else if(g.type==='fakeTask'){
    if(!p.ai.fakeTaskUntil)p.ai.fakeTaskUntil=now+1800+Math.random()*4200;
    if(now>=p.ai.fakeTaskUntil){p.ai.fakeTaskUntil=0;p.ai.goal=null;}
  }else if(g.type==='escapeVent'&&p.role==='Impostor'){
    const i=VENTS.findIndex(v=>Math.hypot(p.x-v[0],p.y-v[1])<100);if(i>=0&&now-p.ai.lastVentAt>6000){const next=VENTS[(i+1+Math.floor(Math.random()*3))%VENTS.length];p.x=next[0];p.y=next[1];p.ai.lastVentAt=now;io.to(r.code).emit('moved',{id:p.id,x:p.x,y:p.y,color:p.color,hat:p.hat,pet:p.pet,alive:p.alive});}p.ai.goal=null;
  }else p.ai.goal=null;
}
function botTick(r,p,dt,now){
  if(!r.started||r.meeting||!p.alive)return;
  const moved=Math.hypot(p.x-p.ai.lastX,p.y-p.ai.lastY);p.ai.stuckFor=moved<3?p.ai.stuckFor+dt:0;p.ai.lastX=p.x;p.ai.lastY=p.y;if(p.ai.stuckFor>3.2){p.ai.goal=null;p.ai.path=[];p.ai.waitUntil=0;p.ai.fakeTaskUntil=0;p.ai.stuckFor=0;p.ai.lastPlan=0;}
  const g=p.ai.goal;
  if(g?.target){const q=r.players.get(g.target);if(q?.alive&&(g.type==='stalk'||g.type==='shadow'||g.type==='group')){g.x=q.x;g.y=q.y;if(now-p.ai.pathAt>3500){p.ai.path=astar(p.x,p.y,g.x,g.y);p.ai.pathAt=now;}}}
  if(!g||(!p.ai.path.length&&p.ai.waitUntil<=now&&p.ai.fakeTaskUntil<=now)){if(now-p.ai.lastPlan>1500+Math.random()*900){p.ai.lastPlan=now;botPlan(r,p,now);}}
  if(p.ai.path.length)stepPath(r,p,dt);else if(p.ai.goal&&Math.hypot(p.x-p.ai.goal.x,p.y-p.ai.goal.y)<85)botReached(r,p,now);
  // Impostor gets another kill check while stalking so it can react, not wait for a full replanning cycle.
  if((p.role==='Impostor'||p.role==='Viper')&&p.ai.goal?.target&&now-p.ai.lastKillAt>9000){const v=r.players.get(p.ai.goal.target);if(v?.alive&&v.role!=='Impostor'&&pd(p,v)<108&&visibleWitnesses(r,p,v)<=0){if(doKill(r,p,v)){p.ai.lastKillAt=now;p.ai.goal=null;}}}
}
let lastAI=Date.now();setInterval(()=>{const now=Date.now(),dt=Math.min(.75,(now-lastAI)/1000);lastAI=now;for(const r of rooms.values())if(r.started)for(const p of r.players.values())if(p.isBot)botTick(r,p,dt,now);},120);

io.on('connection',s=>{
 s.on('register',async d=>{try{const u=String(d.username||'').trim().toLowerCase(),pin=String(d.pin||'');if(!/^[a-z0-9_]{3,16}$/.test(u)||pin.length<4)return s.emit('accountError','Use 3–16 letters/numbers and a PIN of at least 4 characters.');if(await getProfile(u))return s.emit('accountError','That account already exists.');const a={username:u,passhash:passhash(u,pin),credits:150,xp:0,wins:0,games:0,inventory:['Basic Visor'],equipped:{}};await saveProfile(a);s.data.account=u;s.emit('profile',publicProfile(a));}catch(e){console.error(e);s.emit('accountError','Account service error.')}});
 s.on('login',async d=>{try{const u=String(d.username||'').trim().toLowerCase(),a=await getProfile(u);if(!a||a.passhash!==passhash(u,String(d.pin||'')))return s.emit('accountError','Wrong username or PIN.');s.data.account=u;s.emit('profile',publicProfile(a));}catch(e){console.error(e);s.emit('accountError','Account service error.')}});
 s.on('buyPack',async kind=>{try{const a=await getProfile(s.data.account);if(!a)return s.emit('accountError','Sign in first.');const prices={body:120,pet:150,random:80};if(!prices[kind]||a.credits<prices[kind])return s.emit('accountError','Not enough Credits.');const pool=CATALOG[kind].filter(x=>!(a.inventory||[]).includes(x));const item=pool.length?pool[Math.floor(Math.random()*pool.length)]:CATALOG[kind][Math.floor(Math.random()*CATALOG[kind].length)];a.credits-=prices[kind];if(!(a.inventory||[]).includes(item))a.inventory.push(item);else a.credits+=35;await saveProfile(a);s.emit('packResult',{item,kind});s.emit('profile',publicProfile(a));}catch(e){console.error(e);s.emit('accountError','Marketplace error.')}});
 s.on('host',d=>{let c;do c=code();while(rooms.has(c));const r={code:c,host:s.id,started:false,settings:{difficulty:'Medium',voteTime:45,impostors:1,vipers:0,engineers:0,scientists:0,judges:0,defenders:0,map:'Starship',maxPlayers:10},players:new Map(),meeting:null,bodies:[]};rooms.set(c,r);{const p=playerBase(s.id,d,'#d94b50');p.account=s.data.account||null;r.players.set(s.id,p);}s.join(c);s.data.room=c;emit(r);});
 s.on('join',d=>{const c=String(d.code||'').toUpperCase(),r=rooms.get(c);if(!r)return s.emit('errorMsg','Room not found.');if(r.started)return s.emit('errorMsg','Match already started.');if(r.players.size>=Math.min(20,+r.settings.maxPlayers||10))return s.emit('errorMsg','Room is full.');{const p=playerBase(s.id,d,'#3978d6');p.account=s.data.account||null;r.players.set(s.id,p);}s.join(c);s.data.room=c;emit(r);});
 s.on('addAI',()=>{const r=rooms.get(s.data.room);if(!r||r.host!==s.id||r.started)return;if(r.players.size>=Math.min(20,+r.settings.maxPlayers||10))return s.emit('errorMsg','Room is full.');const b=makeBot(r);r.players.set(b.id,b);emit(r);});
 s.on('removeAI',()=>{const r=rooms.get(s.data.room);if(!r||r.host!==s.id||r.started)return;const b=[...r.players.values()].reverse().find(p=>p.isBot);if(b){r.players.delete(b.id);emit(r);}});
 s.on('settings',d=>{const r=rooms.get(s.data.room);if(!r||r.host!==s.id||r.started)return;for(const k of ['difficulty','voteTime','impostors','vipers','engineers','scientists','judges','defenders','map','maxPlayers'])if(d[k]!==undefined)r.settings[k]=d[k];emit(r);});
 s.on('start',()=>{const r=rooms.get(s.data.room);if(!r||r.host!==s.id||r.started)return;const ps=[...r.players.values()],q=r.settings,total=(+q.impostors||0)+(+q.engineers||0)+(+q.scientists||0)+(+q.judges||0)+(+q.defenders||0);if(ps.length<2)return s.emit('errorMsg','Need at least 2 players. Add AI if you are playing solo.');if(((+q.impostors||0)+(+q.vipers||0))<1||(+q.vipers||0)>(+q.impostors||0)||total>ps.length)return s.emit('errorMsg','Role counts do not fit the lobby.');let deck=[];for(let i=0;i<(+q.vipers||0);i++)deck.push('Viper');for(let i=0;i<Math.max(0,(+q.impostors||0)-(+q.vipers||0));i++)deck.push('Impostor');for(const [role,key] of [['Engineer','engineers'],['Scientist','scientists'],['Judge','judges'],['Defender','defenders']])for(let i=0;i<(+q[key]||0);i++)deck.push(role);while(deck.length<ps.length)deck.push('Crewmate');deck=shuffled(deck.length).map(i=>deck[i]);r.bodies=[];ps.forEach((p,i)=>{p.role=deck[i];p.alive=true;p.done=0;p.judgeUsed=false;p.x=1450+(i%4)*55;p.y=760+Math.floor(i/4)*55;p.assignments=(p.role==='Impostor'||p.role==='Viper')?[]:shuffled(TASKS.length).slice(0,7);if(p.isBot){p.ai.suspicion.clear();p.ai.memory=[];p.ai.goal=null;p.ai.path=[];p.ai.waitUntil=0;p.ai.fakeTaskUntil=0;p.ai.lastKillAt=Date.now()-7000;}else io.to(p.id).emit('role',{role:p.role,assignments:p.assignments,settings:r.settings});});r.started=true;r.meeting=null;emit(r);io.to(r.code).emit('started',{settings:r.settings});});
 s.on('move',d=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id);if(!r?.started||!p||p.isBot)return;let nx=Math.max(80,Math.min(3020,+d.x||p.x)),ny=Math.max(80,Math.min(2020,+d.y||p.y));if(!p.alive||walkable(nx,ny)){p.x=nx;p.y=ny;}p.color=d.color||p.color;p.hat=d.hat||p.hat;p.pet=d.pet||p.pet;s.to(r.code).emit('moved',{id:p.id,x:p.x,y:p.y,color:p.color,hat:p.hat,pet:p.pet,alive:p.alive});});
 s.on('taskDone',taskId=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id),i=+taskId;if(!r?.started||!p||(p.role==='Impostor'||p.role==='Viper')||!p.alive||p.done>=7||!p.assignments.includes(i)||!TASKS[i]||d2(p,TASKS[i])>90)return;p.assignments=p.assignments.filter(x=>x!==i);p.done++;io.to(p.id).emit('assignments',{assignments:p.assignments});io.to(r.code).emit('taskProgress',{id:p.id,done:p.done,total:[...r.players.values()].filter(x=>x.role!=='Impostor'&&x.role!=='Viper').length*7});win(r);});
 s.on('vent',idx=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id),i=+idx;if(!r?.started||!p||!p.alive||!(p.role==='Impostor'||p.role==='Viper'||p.role==='Engineer')||!VENTS[i]||d2(p,VENTS[i])>90)return;const next=VENTS[(i+1)%VENTS.length];p.x=next[0];p.y=next[1];io.to(r.code).emit('moved',{id:p.id,x:p.x,y:p.y,color:p.color,hat:p.hat,pet:p.pet,alive:p.alive});io.to(p.id).emit('vented',{x:p.x,y:p.y});});
 s.on('bite',target=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id),v=r?.players.get(target);if(!r?.started||!p?.alive||p.role!=='Viper'||!v?.alive||(v.role==='Impostor'||v.role==='Viper')||pd(p,v)>110)return;v.poisonedUntil=Date.now()+6500;io.to(v.id).emit('poisoned',{seconds:6});setTimeout(()=>{if(!r.started||!v.alive||v.poisonedUntil>Date.now()+200)return;v.alive=false;const body={id:'b'+Date.now()+Math.random(),victim:v.id,x:v.x,y:v.y,name:v.name,color:v.color,reported:false};r.bodies.push(body);io.to(r.code).emit('killed',{id:v.id,body});win(r)},6600);});
 s.on('kill',target=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id),v=r?.players.get(target);if(!r?.started||!p||!v)return;doKill(r,p,v);});
 s.on('report',bodyId=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id),b=r?.bodies.find(x=>x.id===bodyId);if(!r?.started||!p?.alive||r.meeting||!b||b.reported||Math.hypot(p.x-b.x,p.y-b.y)>95)return;b.reported=true;startMeeting(r,`${p.name} reported ${b.name}!`);});
 s.on('meeting',()=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id);if(!r?.started||!p?.alive||r.meeting||Math.hypot(p.x-EM[0],p.y-EM[1])>110)return;startMeeting(r,`${p.name} called an emergency meeting.`);});
 s.on('vote',target=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id);if(!r?.meeting||!p?.alive||r.meeting.votes.has(s.id))return;if(target!==null&&!r.players.get(target)?.alive)return;r.meeting.votes.set(s.id,target);io.to(r.code).emit('voted',{id:s.id});if(r.meeting.votes.size>=[...r.players.values()].filter(x=>x.alive).length)finishMeeting(r);});
 s.on('judge',target=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id),v=r?.players.get(target);if(!r?.meeting||!p?.alive||p.role!=='Judge'||p.judgeUsed||!v?.alive||v.id===p.id)return;judgeResolve(r,p,v);});
 s.on('disconnect',()=>{const r=rooms.get(s.data.room);if(!r)return;r.players.delete(s.id);const humans=[...r.players.values()].filter(p=>!p.isBot);if(!humans.length){rooms.delete(r.code);return;}if(r.host===s.id)r.host=humans[0].id;emit(r);});
});
function judgeResolve(r,p,v){p.judgeUsed=true;io.to(r.code).emit('hammer',{target:v.id});setTimeout(()=>{if(!r.meeting)return;if((v.role==='Impostor'||v.role==='Viper')){v.alive=false;io.to(r.code).emit('judgeResult',{text:`${v.name} was an Impostor.`,dead:v.id});}else{p.alive=false;io.to(r.code).emit('judgeResult',{text:`Wrong judgment — ${p.name} was eliminated.`,dead:p.id});}emit(r);win(r);},700);}
function scheduleBotVotes(r){
  const alive=[...r.players.values()].filter(p=>p.alive),voteMs=Math.max(10,Math.min(180,+r.settings.voteTime||45))*1000;
  for(const p of alive.filter(x=>x.isBot)){
    // A thoughtful delay: bots do not all vote instantly.
    const delay=Math.max(1500,Math.min(voteMs-800,voteMs*(.22+Math.random()*.62)));
    setTimeout(()=>botVote(r,p),delay);
  }
}
function botVote(r,p){
  if(!r.meeting||!p.alive||r.meeting.votes.has(p.id))return;
  const alive=[...r.players.values()].filter(q=>q.alive&&q.id!==p.id),crewTargets=alive.filter(q=>(q.role!=='Impostor'&&q.role!=='Viper')||(p.role!=='Impostor'&&p.role!=='Viper'));
  let target=null;
  if(p.role==='Impostor'||p.role==='Viper'){
    const candidates=alive.filter(q=>q.role!=='Impostor'&&q.role!=='Viper');
    // Vote with the room's apparent suspicion when possible, otherwise frame a crewmate.
    target=candidates.sort((a,b)=>(p.ai.suspicion.get(b.id)||0)-(p.ai.suspicion.get(a.id)||0))[0]||null;
    if(target&&Math.random()<.18)p.ai.suspicion.set(target.id,(p.ai.suspicion.get(target.id)||0)+20);
  }else{
    let best=null,score=12+Math.random()*18;for(const q of alive){const s=p.ai.suspicion.get(q.id)||0;if(s>score){score=s;best=q;}}target=best;
    if(!target&&p.ai.personality.confidence>.72&&Math.random()<.35)target=rand(crewTargets); // occasional believable bad read
  }
  // Judge bots use their one hammer only when evidence is strong.
  if(p.role==='Judge'&&!p.judgeUsed&&target&&(p.ai.suspicion.get(target.id)||0)>82&&Math.random()<.6){judgeResolve(r,p,target);}
  r.meeting.votes.set(p.id,target?.id||null);io.to(r.code).emit('voted',{id:p.id});if(r.meeting.votes.size>=[...r.players.values()].filter(x=>x.alive).length)finishMeeting(r);
}
function startMeeting(r,reason){if(r.meeting)return;r.meeting={votes:new Map(),reason,ends:Date.now()+Math.max(10,Math.min(180,+r.settings.voteTime||45))*1000};io.to(r.code).emit('meeting',{reason,ends:r.meeting.ends,players:[...r.players.values()].filter(x=>x.alive).map(x=>({id:x.id,name:x.name}))});scheduleBotVotes(r);setTimeout(()=>finishMeeting(r),Math.max(10,+r.settings.voteTime||45)*1000+200);}
function finishMeeting(r){if(!r.meeting)return;const votes=[...r.meeting.votes.entries()],counts={};for(const [,t] of votes){const k=t||'SKIP';counts[k]=(counts[k]||0)+1;}const max=Math.max(0,...Object.values(counts)),tops=Object.keys(counts).filter(k=>counts[k]===max),ejected=tops.length===1&&tops[0]!=='SKIP'?tops[0]:null;if(ejected&&r.players.get(ejected))r.players.get(ejected).alive=false;io.to(r.code).emit('voteResult',{votes:votes.map(([v,t])=>({voter:r.players.get(v)?.name||'Left',target:t?r.players.get(t)?.name||'Left':'SKIP'})),ejected:ejected?r.players.get(ejected)?.name:null});r.meeting=null;for(const p of r.players.values())if(p.isBot){p.ai.goal=null;p.ai.path=[];p.ai.waitUntil=0;p.ai.fakeTaskUntil=0;}win(r);setTimeout(()=>emit(r),2500);}
process.on('uncaughtException',e=>console.error('Uncaught server error:',e));
process.on('unhandledRejection',e=>console.error('Unhandled promise rejection:',e));
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('SpaceCrew multiplayer + stable smart AI running on port '+(process.env.PORT||3000)));

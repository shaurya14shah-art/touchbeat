import {toPoints,bodyVisible,BallTracker,TouchDetector,Scorer,FormCoach,features,RULES,LM,torso,median} from './engine.js';
import {DRILLS,TEMPOS,chart,COUNT_IN,WARMUP_BEATS,SCORED_BEATS} from './drills.js';
import {createTracker} from './tracker.js';
import {Beat,speak} from './audio.js';
import {skeleton,ball as drawBall,ghostPoints,C} from './render.js';
import * as board from './leaderboard.js';

const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const screens=['home','stage','results','board'];
const show=id=>screens.forEach(s=>$(s).hidden=s!==id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let REF=null,tracker=null,stream=null,S={drill:'toe_taps',tempo:'match',virtual:false};
let run=null,mode='idle',latest=null,loopOn=false,replayOn=false,demoOn=true;
const video=$('video'),cv=$('canvas'),g=cv.getContext('2d');

/* ---------- picker ---------- */
const chip=(name,val,label,checked)=>`<label><input type="radio" name="${name}" value="${val}" ${checked?'checked':''}><span>${label}</span></label>`;
$('drills').innerHTML=Object.entries(DRILLS).map(([k,d])=>chip('drill',k,d.name,k===S.drill)).join('');
$('tempos').innerHTML=Object.entries(TEMPOS).map(([k,t])=>chip('tempo',k,`${t.name} · ${t.bpm}`,k===S.tempo)).join('');
const opts=(o,f)=>Object.entries(o).map(([k,v])=>`<option value="${k}">${f(v)}</option>`).join('');
$('bDrill').innerHTML=opts(DRILLS,d=>d.name);$('bTempo').innerHTML=opts(TEMPOS,t=>t.name);

fetch('data/reference.json').then(r=>r.json()).then(r=>{REF=r;startDemo();window.__tb.ref=true;});

/* ---------- landing demo: ghost loop ---------- */
function startDemo(){
  const c=$('demo'),x=c.getContext('2d'),G=REF.drills.toe_taps.ghost;if(!G)return;
  const draw=now=>{if(!demoOn)return;if(!$('home').hidden){
    const r=c.getBoundingClientRect(),d=devicePixelRatio||1;if(c.width!==Math.round(r.width*d)){c.width=r.width*d;c.height=r.height*d;}
    x.clearRect(0,0,c.width,c.height);
    const unit=c.height/4.6,ph=reduced?0:(now/1000/(2*60/92))%1,f=G.frames[Math.floor(ph*G.phases)%G.phases];
    const cx=c.width/2,cy=c.height*.48;
    skeleton(x,ghostPoints(f,cx,cy,unit),{color:C.cyan,width:unit*.07,vis:false});
    if(f.b)drawBall(x,cx-f.b[0]*unit,cy+f.b[1]*unit,f.b[2]*unit,{});
  }requestAnimationFrame(draw);};requestAnimationFrame(draw);
}

/* ---------- camera + setup ---------- */
$('picker').addEventListener('submit',async e=>{e.preventDefault();
  const fd=new FormData(e.target);S.drill=fd.get('drill');S.tempo=fd.get('tempo');S.virtual=false;
  const b=$('start');b.disabled=true;b.textContent='Loading tracking…';
  try{await enter();}catch(err){b.textContent='Turn on camera';b.disabled=false;
    alert(err.name==='NotAllowedError'?'Touchbeat needs your camera to see your feet. Allow it in your browser settings, then try again.':'The camera or tracking could not start: '+err.message);}
});
async function enter(){
  tracker??=await createTracker();
  if(!stream){stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:60}}});video.srcObject=stream;await video.play();}
  $('start').disabled=false;$('start').textContent='Turn on camera';
  demoOn=false;show('stage');beginSetup();
  if(!loopOn){loopOn=true;requestAnimationFrame(render);video.requestVideoFrameCallback(onFrame);}
}
function beginSetup(){
  mode='setup';run={ballT:new BallTracker(),baseL:[],baseH:[],stable:0,ball:null,seenBall:0};latest=null;
  $('setup').hidden=false;$('hud').hidden=true;$('virtual').textContent=S.virtual?'Use a real ball':'No ball? Use a virtual one';setChecks({});
}
$('virtual').onclick=()=>{S.virtual=!S.virtual;beginSetup();};
function setChecks(c){
  const items=[['frame','Head to toes in frame'],['ball',S.virtual?'Virtual ball placed':'Football by your feet'],['tall','Stand tall and hold still']];
  $('checks').innerHTML=items.map(([k,t])=>`<li class="${c[k]?'ok':''}">${t}</li>`).join('');
  $('setupTitle').textContent=c.frame?'Almost there':'Step back into frame';
}
function inFrame(lm){return lm[LM.NOSE].y>.01&&Math.max(lm[LM.L_TOE].y,lm[LM.R_TOE].y)<.985&&lm.slice(11,33).every(l=>l.x>-.01&&l.x<1.01);}

/* ---------- per-camera-frame processing ---------- */
let lastCapture=0,frameTimes=[];
function onFrame(_,meta){
  video.requestVideoFrameCallback(onFrame);
  if(mode==='idle')return;
  const tCap=(meta.captureTime??performance.now())/1000;
  frameTimes.push(tCap);if(frameTimes.length>60)frameTimes.shift();
  const r=tracker.detect(video,meta.mediaTime*1000);lastCapture=tCap;
  const asp=video.videoWidth/video.videoHeight;
  if(!r.landmarks){latest={lm:null};if(mode==='setup')setChecks({});return;}
  const p=toPoints(r.landmarks,asp);latest={lm:r.landmarks,p,balls:r.balls,asp};
  if(mode==='setup')setupFrame(p,r,asp);else if(mode==='play')playFrame(tCap,p,r,asp);
}
function setupFrame(p,r,asp){
  const frame=bodyVisible(p,.5)&&inFrame(latest.lm);let ballOk=false,tall=false;
  if(frame){const Su=torso(p);
    if(S.virtual){const hx=(p[LM.L_HIP].x+p[LM.R_HIP].x)/2,y=(p[LM.L_TOE].y+p[LM.R_TOE].y)/2+Su*.3;run.ball={x:hx,y,r:Su*.27,virtual:true,fresh:true};ballOk=true;}
    else{const b=run.ballT.update(lastCapture,r.balls,p,asp);if(b){run.seenBall++;run.ball=b;}ballOk=run.seenBall>8&&!!b;}
    if(ballOk){const f=features(p);run.baseL.push(f.legH);run.baseH.push(f.headH);if(run.baseL.length>30){run.baseL.shift();run.baseH.shift();}
      const spread=Math.max(...run.baseL)-Math.min(...run.baseL);tall=run.baseL.length>=24&&(spread<.14||params.get('hold')==='0');}
  }
  latest.ball=run.ball;setChecks({frame,ball:ballOk,tall});
  if(tall&&frame&&ballOk)startRound({legH:median(run.baseL),headH:median(run.baseH)},run.ball);
}

/* ---------- round ---------- */
const bpmOverride=+params.get('bpm')||0;
async function startRound(base,startBall){
  mode='play';$('setup').hidden=true;$('hud').hidden=false;$('cue').hidden=true;
  const bpm=bpmOverride||TEMPOS[S.tempo].bpm,beat=new Beat();await beat.resume();
  const spb=60/bpm,total=WARMUP_BEATS+SCORED_BEATS,t0=beat.play(spb,COUNT_IN,total);
  const c=chart(S.drill,bpm,t0),ref=REF.drills[S.drill];
  run={beat,t0,spb,chart:c,bpm,scorer:new Scorer(c.notes),detector:new TouchDetector(DRILLS[S.drill].kind,S.virtual?{contact:.6}:{}),ballT:new BallTracker(),coach:new FormCoach(ref,base),base,
    virtual:S.virtual?startBall:null,ball:S.virtual?startBall:null,offset:0,calibrated:false,popups:[],record:[],ballFrames:0,frames:0,lastCue:null,touches:0};
  window.__tb.run=run;
}
function playFrame(tCap,p,r,asp){
  const R=run;if(!R.scorer)return;
  R.frames++;
  const ball=R.virtual||R.ballT.update(tCap,r.balls,p,asp);R.ball=ball||null;if(ball&&!ball.virtual)R.ballFrames++;
  const fix=bodyVisible(p,.3)?R.coach.update(tCap,p,ball):null;
  if(fix!==R.lastCue){R.lastCue=fix;$('cue').hidden=!fix;if(fix){$('cue').textContent=RULES[fix].cue;speak(RULES[fix].say);}}
  if(tCap>R.t0)R.record.push({t:tCap-R.t0,p:p.map(q=>[+q.x.toFixed(4),+q.y.toFixed(4),+q.v.toFixed(2)]),b:ball?[ball.x,ball.y,ball.r]:null,bad:fix});
  for(const ev of R.detector.update(tCap,p,ball)){
    R.touches++;
    const e={...ev,t:ev.t-R.offset},res=R.scorer.judge(e);
    if(res){popup(res,ev);if(!res.warmup)R.beat.hit(res.grade);}
  }
  calibrate(R);
}
/** Uses the unscored warm-up beats to absorb this player's camera and audio delay. */
function calibrate(R){
  if(R.calibrated)return;const lastWarm=R.chart.notes[WARMUP_BEATS-1];
  if(performance.now()/1000<lastWarm.t+.3)return;
  const errs=R.scorer.notes.slice(0,WARMUP_BEATS).filter(n=>n.hit&&n.hit.err!=null).map(n=>n.hit.err);
  R.offset=errs.length>=2?Math.max(-.18,Math.min(.18,median(errs))):0;R.calibrated=true;
}
function popup(res,ev){
  const text=res.grade==='perfect'?'Perfect':res.grade==='good'?'Good':res.err<0?'Early':'Late';
  const col=res.grade==='perfect'?C.lime:res.grade==='good'?C.white:C.amber;
  run.popups.push({text,col,foot:ev.foot,born:performance.now()/1000});
}
function finishRound(){
  const R=run;mode='idle';R.beat.stop();speechSynthesis?.cancel();const sum=R.scorer.summary(),form=R.coach.formScore();
  const score=Math.round(sum.points*(.7+.3*form/100));
  const ballRate=R.frames?R.ballFrames/R.frames:0;
  showResults({sum,form,score,fix:R.coach.biggestFix(),withBall:!S.virtual&&ballRate>.6,record:R.record,spb:R.spb});
}

/* ---------- drawing ---------- */
function layout(){
  const d=Math.min(devicePixelRatio||1,2),w=Math.round(cv.clientWidth*d),h=Math.round(cv.clientHeight*d);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}
  const vw=video.videoWidth||16,vh=video.videoHeight||9,sc=Math.min(w/vw,h/vh),dw=vw*sc,dh=vh*sc;return{w,h,dx:(w-dw)/2,dy:(h-dh)/2,dw,dh};
}
/** Maps aspect-unit points into mirrored canvas pixels. */
const mapper=(L,asp)=>q=>({x:L.dx+L.dw*(1-q.x/asp),y:L.dy+L.dh*q.y,v:q.v});
function render(){
  requestAnimationFrame(render);if($('stage').hidden)return;
  const L=layout();g.fillStyle='#000';g.fillRect(0,0,L.w,L.h);
  if(video.readyState>=2){g.save();g.translate(L.dx+L.dw,L.dy);g.scale(-1,1);g.drawImage(video,0,0,L.dw,L.dh);g.restore();}
  g.fillStyle='rgba(5,14,9,.28)';g.fillRect(L.dx,L.dy,L.dw,L.dh);
  const unit=L.h/1000,now=performance.now()/1000;
  if(latest?.p){const m=mapper(L,latest.asp),pts=latest.p.map(m);
    const R=mode==='play'?run:null,fix=R?.lastCue;
    const b=(R||run)?.ball;
    if(b){const c=m(b);drawBall(g,c.x,c.y,b.r/1*L.dh,{virtual:b.virtual,fresh:b.fresh});}
    skeleton(g,pts,{width:7*unit,bad:fix?RULES[fix].seg:[]});
    if(R&&R.scorer)drawPlay(L,R,pts,now,unit);
  }
  if(mode==='play'&&run?.scorer){
    const R=run;
    const beatsIn=(now-R.t0)/R.spb;$('count').textContent=beatsIn>=-1&&beatsIn<COUNT_IN?Math.max(1,COUNT_IN-Math.floor(beatsIn)):'';
    if(!R.calibrated)calibrate(R);
    R.scorer.sweep(now-R.offset);$('combo').textContent=R.scorer.combo;$('score').textContent=Math.round(R.scorer.points);
    if(now>R.chart.end+.6)finishRound();
  }
}
function drawPlay(L,R,pts,now,unit){
  const lead=Math.max(R.spb*1.6,.9),up=R.scorer.notes.filter(n=>!n.hit&&n.t-now<lead&&n.t-now>-.2);
  const footI={L:LM.L_TOE,R:LM.R_TOE};
  // Beat pulse
  const ph=((now-R.t0)/R.spb)%1;if(!reduced&&now>R.t0){g.strokeStyle=`rgba(200,255,46,${(1-ph)*.55})`;g.lineWidth=16*unit;g.strokeRect(L.dx,L.dy,L.dw,L.dh);}
  // Approach rings close onto the foot that must touch next.
  for(const n of up.slice(0,2)){const q=pts[footI[n.foot]],k=Math.max(0,(n.t-now)/lead),col=n.foot==='L'?C.lime:C.amber;
    g.save();g.strokeStyle=col;g.shadowColor=col;g.shadowBlur=20;g.lineWidth=(8+10*(1-k))*unit;g.globalAlpha=.35+.65*(1-k);
    g.beginPath();g.arc(q.x,q.y,(46+k*260)*unit,0,7);g.stroke();g.restore();}
  const next=up[0];const co=$('callout');
  if(next&&now>R.t0+COUNT_IN*R.spb-R.spb){const t=next.foot==='L'?'Left':'Right';if(co.textContent!==t)co.textContent=t;co.style.color=next.foot==='L'?C.lime:C.amber;}else if(!next)co.textContent='';
  drawTimeline(L,R,now,unit);
  // Timing feedback beside the foot
  R.popups=R.popups.filter(p=>now-p.born<.55);
  for(const p of R.popups){const q=pts[footI[p.foot]],k=(now-p.born)/.55;g.save();g.globalAlpha=1-k;g.fillStyle=p.col;g.font=`${58*unit}px Anton,Impact,sans-serif`;g.textAlign='center';g.shadowColor='#000';g.shadowBlur=14;g.fillText(p.text.toUpperCase(),q.x,q.y-(70+90*k)*unit);g.restore();}
  drawCoach(L,R,now,unit);
}
function drawTimeline(L,R,now,unit){
  const y=L.dy+26*unit,h=46*unit,cx=L.w/2,span=L.dw*.2,pxs=span/(R.spb*2.6);
  g.save();g.fillStyle='rgba(0,0,0,.55)';g.fillRect(cx-span*1.15,y,span*2.3,h);g.textAlign='center';g.textBaseline='middle';g.font=`${30*unit}px Anton,Impact,sans-serif`;
  for(const n of R.scorer.notes){const dx=(n.t-now)*pxs;if(Math.abs(dx)>span*1.12)continue;const col=n.hit?(n.hit.grade==='miss'?C.red:'#2b5c3c'):n.foot==='L'?C.lime:C.amber;g.fillStyle=col;g.beginPath();g.arc(cx+dx,y+h/2,h*.4,0,7);g.fill();g.fillStyle='#07130d';g.fillText(n.foot,cx+dx,y+h/2+1);}
  g.fillStyle='#fff';g.fillRect(cx-2*unit,y-6*unit,4*unit,h+12*unit);g.restore();
}
function ghostFrame(drill,now,t0,spb){const G=REF.drills[drill].ghost;if(!G)return null;const cycle=spb*(DRILLS[drill].kind==='tap'?2:2);const ph=(((now-t0)/cycle)%1+1)%1;return G.frames[Math.floor(ph*G.phases)%G.phases];}
function drawCoach(L,R,now,unit){
  const f=ghostFrame(S.drill,now,R.t0,R.spb);if(!f)return;
  const bw=210*unit,bh=320*unit,x=L.w-bw-24*unit,y=L.h-bh-90*unit;
  g.save();g.fillStyle='rgba(5,14,9,.72)';g.fillRect(x,y,bw,bh);g.fillStyle=C.cyan;g.font=`700 ${22*unit}px "Barlow Condensed",sans-serif`;g.textAlign='center';g.fillText('COACH',x+bw/2,y+26*unit);
  const u=bh/4.9,cx=x+bw/2,cy=y+bh*.46;skeleton(g,ghostPoints(f,cx,cy,u),{color:C.cyan,width:4.5*unit,vis:false});if(f.b)drawBall(g,cx-f.b[0]*u,cy+f.b[1]*u,f.b[2]*u,{});g.restore();
}

/* ---------- results + replay ---------- */
let lastResult=null;
function gradeOf(x){return x>=.92?'S':x>=.8?'A':x>=.65?'B':x>=.45?'C':'D';}
function showResults(r){
  lastResult=r;show('results');const{sum,form,score,fix}=r;
  $('rDrill').textContent=`${DRILLS[S.drill].name} · ${TEMPOS[S.tempo].name}${r.withBall?' · real ball':S.virtual?' · virtual ball':' · ball not tracked'}`;
  $('rGrade').textContent=gradeOf(sum.accuracy*.75+form/100*.25);$('rScore').textContent=score.toLocaleString();
  const pc=x=>Math.round(x*100)+'%';
  $('rStats').innerHTML=[['On the beat',pc(sum.accuracy)],['Perfects',`${sum.perfect}/${sum.total}`],['L / R hit',`${Math.round(sum.left*100)} / ${Math.round(sum.right*100)}`],['Form',form+'/100'],['Best combo',sum.bestCombo]].slice(0,5).map(([a,b])=>`<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
  $('rFix').textContent=fix?fix.cue:'Clean. Try a faster tempo.';
  $('rTiming').textContent=sum.hits<4?'Too few touches landed to judge your timing.':Math.abs(sum.meanErrMs)<25?'Your timing was centred on the beat.':`You were on average ${Math.abs(sum.meanErrMs)}ms ${sum.meanErrMs<0?'ahead of':'behind'} the beat.`;
  $('submitMsg').textContent=board.isGlobal?'':'Global leaderboard not connected yet, so this saves on this device only.';$('submitForm').hidden=false;$('nick').value=localGet('nick')||'';
  startReplay(r);
}
function localGet(k){try{return localStorage.getItem('touchbeat.'+k);}catch{return null;}}
function localSet(k,v){try{localStorage.setItem('touchbeat.'+k,v);}catch{}}
$('submitForm').addEventListener('submit',async e=>{e.preventDefault();const n=$('nick').value.trim();
  if(!board.validName(n)){$('submitMsg').textContent='Use 2 to 16 letters, numbers, spaces or underscores, and keep it clean.';return;}
  const r=lastResult;localSet('nick',n);
  try{await board.submit({nickname:n,drill:S.drill,tempo:S.tempo,with_ball:r.withBall,score:r.score,accuracy:+r.sum.accuracy.toFixed(3),form:r.form,best_combo:r.sum.bestCombo});
    $('submitForm').hidden=true;openBoard(r.withBall);}
  catch(err){$('submitMsg').textContent=err.message;}
});
function startReplay(r){
  const c=$('replay'),x=c.getContext('2d'),rec=r.record.filter(f=>f.t>COUNT_IN*r.spb);if(rec.length<5)return;replayOn=true;
  const dur=rec.at(-1).t-rec[0].t,start=performance.now()/1000;
  const pts=f=>f.p.map(q=>({x:q[0],y:q[1],v:q[2]}));
  const asp=Math.max(...rec.slice(0,50).flatMap(f=>f.p.map(q=>q[0])))||1;
  const draw=()=>{if(!replayOn||$('results').hidden){replayOn=false;return;}
    const b=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);if(c.width!==Math.round(b.width*d)){c.width=b.width*d;c.height=b.height*d;}
    x.clearRect(0,0,c.width,c.height);
    const now=reduced?dur*.25:((performance.now()/1000-start)*.5)%dur,T=rec[0].t+now;let i=rec.findIndex(f=>f.t>=T);if(i<0)i=rec.length-1;const f=rec[i],P=pts(f),S0=torso(P)||.2;
    const hx=(P[LM.L_HIP].x+P[LM.R_HIP].x)/2,hy=(P[LM.L_HIP].y+P[LM.R_HIP].y)/2,u=c.height/4.8,cx=c.width/2,cy=c.height*.47;
    const fr=q=>({x:cx-(q.x-hx)/S0*u,y:cy+(q.y-hy)/S0*u,v:q.v});
    const gf=ghostFrame(S.drill,T,0,r.spb);if(gf)skeleton(x,ghostPoints(gf,cx,cy,u),{color:C.cyan,width:u*.055,alpha:.65,vis:false,glow:false});
    if(f.b){const q=fr({x:f.b[0],y:f.b[1]});drawBall(x,q.x,q.y,f.b[2]/S0*u,{});}
    skeleton(x,P.map(fr),{width:u*.07,bad:f.bad?RULES[f.bad].seg:[]});
    requestAnimationFrame(draw);};requestAnimationFrame(draw);
}
$('again').onclick=()=>{replayOn=false;show('stage');beginSetup();};
$('change').onclick=()=>exitToHome();
$('quit').onclick=()=>{if(run?.beat){run.beat.stop();}speechSynthesis?.cancel();exitToHome();};
function exitToHome(){mode='idle';replayOn=false;run=null;latest=null;demoOn=true;show('home');startDemo();}

/* ---------- leaderboard ---------- */
let boardFrom='home';
async function openBoard(withBall){
  boardFrom=$('results').hidden?'home':'results';
  $('bDrill').value=S.drill;$('bTempo').value=S.tempo;$('bBall').value=String(withBall??!S.virtual);
  $('boardMode').textContent=board.isGlobal?'Global':'On this device only';show('board');renderBoard();
}
async function renderBoard(){
  const ol=$('rows');ol.textContent='';
  try{const rows=await board.top($('bDrill').value,$('bTempo').value,$('bBall').value==='true');
    if(!rows.length){const li=document.createElement('li');li.className='empty';li.textContent='No scores yet. Be the first.';ol.append(li);return;}
    for(const r of rows){const li=document.createElement('li');const a=document.createElement('span');a.className='nm';a.textContent=r.nickname;const b=document.createElement('span');b.className='pc';b.textContent=Math.round(r.accuracy*100)+'% · form '+r.form;const c=document.createElement('span');c.className='sc';c.textContent=r.score.toLocaleString();li.append(a,b,c);ol.append(li);}
  }catch(err){const li=document.createElement('li');li.className='empty';li.textContent=err.message;ol.append(li);}
}
['bDrill','bTempo','bBall'].forEach(i=>$(i).onchange=renderBoard);
$('openBoard').onclick=()=>openBoard();$('seeBoard').onclick=()=>openBoard(lastResult?.withBall);
$('boardBack').onclick=()=>{if(boardFrom==='results')show('results');else exitToHome();};

window.__tb={get mode(){return mode;},get latest(){return latest;},get S(){return S;},frameTimes,finishRound,show};
if(params.has('autostart')){S.drill=params.get('drill')||S.drill;S.virtual=params.get('virtual')==='1';}

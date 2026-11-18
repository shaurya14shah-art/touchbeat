// Touchbeat core: pure logic shared by the browser and the offline evaluation tools.
export const LM = { NOSE:0, L_SH:11, R_SH:12, L_ELB:13, R_ELB:14, L_WR:15, R_WR:16, L_HIP:23, R_HIP:24,
  L_KNEE:25, R_KNEE:26, L_ANK:27, R_ANK:28, L_HEEL:29, R_HEEL:30, L_TOE:31, R_TOE:32 };

const mid = (a, b) => ({ x:(a.x+b.x)/2, y:(a.y+b.y)/2 });
const dist = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);
export const median = (arr) => { if (!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); return s[s.length>>1]; };

/** Convert normalised landmarks to aspect-correct points: x and y share one unit (frame heights). */
export function toPoints(lm, aspect) {
  return lm.map(l => Array.isArray(l)
    ? { x:l[0]*aspect, y:l[1], v:l[3] ?? 1 }
    : { x:l.x*aspect, y:l.y, v:l.visibility ?? 1 });
}

export function bodyVisible(p, min=0.5) {
  return [LM.L_SH,LM.R_SH,LM.L_HIP,LM.R_HIP,LM.L_ANK,LM.R_ANK].every(i => p[i].v > min);
}

/** Torso length, the unit for every body-relative threshold. */
export function torso(p) { return dist(mid(p[LM.L_SH],p[LM.R_SH]), mid(p[LM.L_HIP],p[LM.R_HIP])); }

/** Single-object tracker: gates detector boxes near the feet, coasts through missed detections. */
export class BallTracker {
  constructor({ coast=0.45, gain=0.55 }={}) { this.coast=coast; this.gain=gain; this.state=null; }
  reset() { this.state=null; }
  update(t, dets, p, aspect) {
    const S = torso(p);
    const feet = [LM.L_TOE,LM.R_TOE,LM.L_ANK,LM.R_ANK].map(i=>p[i]);
    const s = this.state;
    let pred = null;
    if (s) { const dt=Math.min(t-s.t,0.2); pred={ x:s.x+s.vx*dt, y:s.y+s.vy*dt }; }
    let best=null, bestCost=Infinity;
    for (const d of dets) {
      const c={ x:d[0]*aspect, y:d[1] }, r=(d[2]*aspect+d[3])/4;
      if (r<S*0.1 || r>S*0.75) continue;            // implausible size for a football near this player
      const footD=Math.min(...feet.map(f=>dist(f,c)))/S;
      if (footD>1.4) continue;                       // a ball far from the feet is someone else's
      const trackD=pred?dist(pred,c)/S:0;
      if (pred && trackD>1.1) continue;
      const cost=footD*0.4+trackD-d[4];
      if (cost<bestCost){bestCost=cost;best={...c,r};}
    }
    if (best) {
      if (!s) this.state={ x:best.x,y:best.y,r:best.r,vx:0,vy:0,t,seen:t };
      else {
        const dt=Math.max(t-s.t,1e-3), g=this.gain;
        const nx=pred.x+g*(best.x-pred.x), ny=pred.y+g*(best.y-pred.y);
        s.vx=0.6*s.vx+0.4*(nx-s.x)/dt; s.vy=0.6*s.vy+0.4*(ny-s.y)/dt;
        s.x=nx; s.y=ny; s.r+=0.25*(best.r-s.r); s.t=t; s.seen=t;
      }
    } else if (s) {
      if (t-s.seen>this.coast) this.state=null;
      else { s.x=pred.x; s.y=pred.y; s.vx*=0.7; s.vy*=0.7; s.t=t; }
    }
    return this.state && { x:this.state.x, y:this.state.y, r:this.state.r, fresh:!!best };
  }
}

/** Causal peak finder with prominence. Reports the true extremum time once the signal has turned. */
class Extremum {
  constructor(prominence, minGap) { this.prom=prominence; this.gap=minGap; this.reset(); }
  reset(){ this.dir=0; this.ext=null; this.extT=0; this.anchor=null; this.last=-Infinity; }
  push(t,v){
    if (this.ext===null){this.ext=v;this.extT=t;this.anchor=v;this.dir=1;return null;}
    if (this.dir>0){
      if (v>this.ext){this.ext=v;this.extT=t;}
      else if (this.ext-v>this.prom*0.5){
        const isPeak=this.ext-this.anchor>=this.prom, peak={t:this.extT,v:this.ext};
        this.dir=-1;this.anchor=this.ext;this.ext=v;this.extT=t;
        if(isPeak&&peak.t-this.last>=this.gap){this.last=peak.t;return peak;}
      }
    } else {
      if (v<this.ext){this.ext=v;this.extT=t;}
      else if (v-this.ext>this.prom*0.5){this.dir=1;this.anchor=this.ext;this.ext=v;this.extT=t;}
    }
    return null;
  }
}

const smooth=(prev,v,a)=>prev==null?v:prev+a*(v-prev);

/**
 * Turns body + ball motion into discrete touches.
 * tap: toe rises to the top of the ball and comes back (peak of foot height).
 * roll/nudge: the foot reverses direction sideways (extrema of foot x).
 */
export class TouchDetector {
  constructor(kind='tap', o={}) {
    this.kind=kind;
    this.o={ ambiguity:0.14, tapProm:0.16, contact:0.25, topOffset:0.75, lateralProm:0.16, minGap:0.14, horiz:1.9, ...o };
    this.reset();
  }
  reset(){
    this.S=null; this.f={ L:this.foot(), R:this.foot() };
  }
  foot(){ const o=this.o; return { up:new Extremum(o.tapProm,o.minGap), hi:new Extremum(o.lateralProm,o.minGap),
    lo:new Extremum(o.lateralProm,o.minGap), sx:null, sy:null, sx0:null, sy0:null }; }
  update(t,p,ball){
    const S0=torso(p); this.S=smooth(this.S,S0,0.08); const S=this.S, ev=[];
    const hip=mid(p[LM.L_HIP],p[LM.R_HIP]);
    for (const side of ['L','R']) {
      const toe=p[side==='L'?LM.L_TOE:LM.R_TOE], heel=p[side==='L'?LM.L_HEEL:LM.R_HEEL], f=this.f[side];
      if (toe.v<0.25) continue;
      // Light smoothing: heavy filters would blunt the sub-200ms touch peaks.
      f.sx=smooth(f.sx,(toe.x-hip.x)/S,0.75); f.sy=smooth(f.sy,(toe.y+heel.y)/2,0.75);
      f.sx0=smooth(f.sx0,toe.x,0.8); f.sy0=smooth(f.sy0,toe.y,0.8);
      const near=!ball||Math.abs(toe.x-ball.x)<ball.r*this.o.horiz+S*0.18;
      if (this.kind==='tap'){
        if(!ball) continue;
        // A touch is the instant the toe is closest to the top of the ball. Foot-height peaks are
        // about 150ms early: the foot lifts first and then lands on the ball.
        const top={x:ball.x,y:ball.y-ball.r*this.o.topOffset};
        const gap=Math.hypot(f.sx0-top.x,f.sy0-top.y)/S;
        const pk=f.up.push(t,-gap);
        if(pk&&-pk.v<this.o.contact){
          const other=this.f[side==='L'?'R':'L'];
          const oGap=other.sx0==null?Infinity:Math.hypot(other.sx0-top.x,other.sy0-top.y)/S;
          ev.push({t:pk.t,foot:side,kind:'tap',gap:-pk.v,ambiguous:oGap<-pk.v+this.o.ambiguity});
        }
      } else {
        const a=f.hi.push(t,f.sx), b=f.lo.push(t,-f.sx);
        if (a&&near) ev.push({t:a.t,foot:side,kind:this.kind,dir:'right'});
        if (b&&near) ev.push({t:b.t,foot:side,kind:this.kind,dir:'left'});
      }
    }
    return ev;
  }
}

/** Posture features. All are camera-framing independent. Used live and to learn from tutorial videos. */
export const FEATURES=['legDip','lean','shoulderTilt','headDrop','stance'];
export function features(p,base){
  const sh=mid(p[LM.L_SH],p[LM.R_SH]),hip=mid(p[LM.L_HIP],p[LM.R_HIP]);
  const ank=mid(p[LM.L_ANK],p[LM.R_ANK]);
  const S=Math.max(dist(sh,hip),1e-4), sw=Math.max(dist(p[LM.L_SH],p[LM.R_SH]),1e-4);
  const legH=(ank.y-hip.y)/S, headH=(sh.y-p[LM.NOSE].y)/S;
  return {
    legH, headH,
    legDip: base?1-legH/base.legH:0,
    lean: Math.abs(Math.atan2(sh.x-hip.x,hip.y-sh.y))*180/Math.PI,
    shoulderTilt: Math.abs(Math.atan2(p[LM.L_SH].y-p[LM.R_SH].y,Math.abs(p[LM.L_SH].x-p[LM.R_SH].x)))*180/Math.PI,
    headDrop: base?1-headH/base.headH:0,
    stance: Math.abs(p[LM.L_ANK].x-p[LM.R_ANK].x)/sw,
  };
}

/** Timing judge for a chart of notes. */
export class Scorer {
  constructor(notes,o={}) {
    this.notes=notes.map(n=>({...n,hit:null})); this.o={perfect:0.075,good:0.15,ok:0.24,...o};
    this.combo=0;this.best=0;this.points=0;this.errors=[];this.feet={L:{hit:0,total:0},R:{hit:0,total:0}};
    for(const n of this.notes) if(n.scored!==false) this.feet[n.foot].total++;
  }
  judge(ev){
    let b=null,bd=Infinity;
    for(const n of this.notes){ if(n.hit||(n.foot!==ev.foot&&!ev.ambiguous)) continue; const d=Math.abs(n.t-ev.t); if(d<bd){bd=d;b=n;} }
    if(!b||bd>this.o.ok) return null;
    const err=ev.t-b.t, grade=bd<=this.o.perfect?'perfect':bd<=this.o.good?'good':'ok';
    b.hit={grade,err};
    if(b.scored===false) return {grade,err,note:b,warmup:true};
    this.combo++;this.best=Math.max(this.best,this.combo);
    this.points+={perfect:100,good:60,ok:25}[grade]*(1+Math.min(this.combo,40)/20);
    this.errors.push(err);this.feet[b.foot].hit++;
    return {grade,err,note:b};
  }
  /** Marks notes that have passed their window as missed. */
  sweep(now){
    const out=[];
    for(const n of this.notes) if(!n.hit&&now-n.t>this.o.ok){n.hit={grade:'miss'};if(n.scored!==false){this.combo=0;out.push(n);}}
    return out;
  }
  summary(){
    const sc=this.notes.filter(n=>n.scored!==false), hits=sc.filter(n=>n.hit&&n.hit.grade!=='miss');
    const c=g=>sc.filter(n=>n.hit?.grade===g).length, {L,R}=this.feet;
    const rl=x=>x.total?x.hit/x.total:0;
    return {points:Math.round(this.points),total:sc.length,hits:hits.length,perfect:c('perfect'),good:c('good'),ok:c('ok'),miss:sc.length-hits.length,
      bestCombo:this.best,accuracy:sc.length?hits.length/sc.length:0,left:rl(L),right:rl(R),
      meanErrMs:this.errors.length?Math.round(1000*this.errors.reduce((a,b)=>a+b,0)/this.errors.length):0};
  }
}

/** Live posture coach. Shows one fix at a time, chosen by how persistently each rule is broken. */
export const RULES={
  knees:{feature:'legDip',cue:'Bend your knees',say:'Bend your knees',seg:[[23,25],[25,27],[24,26],[26,28]]},
  tall:{feature:'lean',cue:'Stay centred',say:'Stay centred',seg:[[11,23],[12,24]]},
  level:{feature:'shoulderTilt',cue:'Level your shoulders',say:'Level shoulders',seg:[[11,12]]},
  eyes:{feature:'headDrop',cue:'Eyes up',say:'Eyes up',seg:[[0,11],[0,12]]},
  narrow:{feature:'stance',cue:'Widen your feet',say:'Feet wider',seg:[[27,31],[28,32]]},
  wide:{feature:'stance',cue:'Bring your feet closer',say:'Feet closer',seg:[[27,31],[28,32]]},
  close:{feature:null,cue:'Keep the ball close',say:'Keep it close',seg:[[27,31],[28,32]]},
};
export class FormCoach{
  constructor(ref,base){
    this.ref=ref;this.base=base;this.level=Object.fromEntries(Object.keys(RULES).map(k=>[k,0]));
    this.badTime=Object.fromEntries(Object.keys(RULES).map(k=>[k,0]));this.current=null;this.since=0;this.last=null;this.total=0;this.fit=[];
  }
  breaches(v,ball,p,S){
    const s=this.ref.stats,b={};
    b.knees=v.legDip<Math.max(s.legDip.p10,0.03);   // a standing-tall player has a dip of about zero
    b.tall=v.lean>Math.max(s.lean.p95,6)+2;
    b.level=v.shoulderTilt>Math.max(s.shoulderTilt.p95,6)+2;
    b.eyes=v.headDrop>Math.max(s.headDrop.p95,0.15)+0.05;
    b.narrow=v.stance<s.stance.p05-0.05;
    b.wide=v.stance>s.stance.p90+0.25;
    if(ball&&!ball.virtual){const d=Math.min(...[LM.L_TOE,LM.R_TOE].map(i=>dist(p[i],ball)))/S;b.close=d>1.1;}
    return b;
  }
  update(t,p,ball){
    const v=features(p,this.base),S=torso(p),dt=this.last==null?0:Math.min(t-this.last,.1);this.last=t;this.total+=dt;
    const b=this.breaches(v,ball,p,S);
    for(const k of Object.keys(RULES)){this.level[k]+=((b[k]?1:0)-this.level[k])*Math.min(dt*1.4,1);if(b[k])this.badTime[k]+=dt;}
    const m=this.ref.model,x=FEATURES.map(k=>v[k]),d=x.map((q,i)=>q-m.mean[i]);
    this.fit.push(d.reduce((a,di,i)=>a+di*d.reduce((c,dj,j)=>c+m.inv[i][j]*dj,0),0));
    const top=Object.keys(RULES).sort((a,c)=>this.level[c]-this.level[a])[0];
    if(this.current&&t-this.since<2.4) return this.current;
    if(this.level[top]>0.55){if(this.current!==top){this.current=top;this.since=t;}}else this.current=null;
    return this.current;
  }
  /** 0-100. 100 means posture sits inside what the tutorial players did; decays beyond it. */
  formScore(){
    if(!this.fit.length) return 0;
    const m=median(this.fit),{p50,p95}=this.ref.model;
    const model=Math.max(0,Math.min(1,1-(m-p50)/(Math.max(p95-p50,1e-3)*2)));
    // The score must agree with the cues: time spent breaking a rule always costs form.
    const worst=this.total?Math.max(...Object.values(this.badTime))/this.total:0;
    return Math.round(100*model*(1-0.6*Math.min(worst,1)));
  }
  biggestFix(){
    const [k,t]=Object.entries(this.badTime).sort((a,b)=>b[1]-a[1])[0];
    return this.total&&t/this.total>0.15?{rule:k,cue:RULES[k].cue,share:t/this.total}:null;
  }
}

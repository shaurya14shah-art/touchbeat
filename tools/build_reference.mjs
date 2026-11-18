// Learns per-drill form statistics and a beat-synced ghost cycle from tutorial skeletons.
import fs from 'fs';
import {toPoints,bodyVisible,BallTracker,TouchDetector,features,FEATURES,LM,torso,median} from '../web/js/engine.js';
const DRILLS={
  toe_taps:{kind:'tap',clips:['I5Dy2xmbp8o','VT8KF3_ssqU'],ghost:{clip:'I5Dy2xmbp8o',from:7,to:20}},
  sole_rolls:{kind:'roll',clips:['FjilSOTyHQQ','2d0XwK1vE84','Ar6GfxJzx80'],ghost:{clip:'FjilSOTyHQQ',from:0,to:27}},
  inside_outside:{kind:'nudge',clips:['0jlxp2JhDxk','gHTQw4k2bYs','x_jiRxuUHIY'],ghost:{clip:'0jlxp2JhDxk',from:3,to:18}},
};
const load=c=>JSON.parse(fs.readFileSync(`data/skeletons/${c}.json`));
const pct=(a,q)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(q*s.length))];};
function clipFeatures(c){
  const d=load(c),asp=d.w/d.h,rows=[],T=new BallTracker();
  const good=d.frames.filter(f=>f.p).map(f=>({f,p:toPoints(f.p,asp)})).filter(x=>bodyVisible(x.p,.55));
  if(good.length<30) return [];
  const raw=good.map(x=>features(x.p));
  const base={legH:pct(raw.map(r=>r.legH),.92),headH:pct(raw.map(r=>r.headH),.92)};
  for(const {f,p} of good){const v=features(p,base);if(v.legH<.4||v.headH<.1)continue;const row=FEATURES.map(k=>v[k]);row.clip=c;rows.push(row);}
  return rows;
}
const mean=X=>X[0].map((_,j)=>X.reduce((a,r)=>a+r[j],0)/X.length);
function cov(X,m){const n=m.length,C=Array.from({length:n},()=>Array(n).fill(0));for(const r of X)for(let i=0;i<n;i++)for(let j=0;j<n;j++)C[i][j]+=(r[i]-m[i])*(r[j]-m[j])/X.length;for(let i=0;i<n;i++)C[i][i]+=1e-4+C[i][i]*.05;return C;}
function inv(A){const n=A.length,M=A.map((r,i)=>[...r,...r.map((_,j)=>+(i===j))]);for(let i=0;i<n;i++){let p=i;for(let k=i;k<n;k++)if(Math.abs(M[k][i])>Math.abs(M[p][i]))p=k;[M[i],M[p]]=[M[p],M[i]];const d=M[i][i];M[i]=M[i].map(v=>v/d);for(let k=0;k<n;k++)if(k!==i){const f=M[k][i];M[k]=M[k].map((v,j)=>v-f*M[i][j]);}}return M.map(r=>r.slice(n));}
const maha=(x,m,I)=>{const d=x.map((v,i)=>v-m[i]);return d.reduce((a,di,i)=>a+di*d.reduce((b,dj,j)=>b+I[i][j]*dj,0),0);};
function ghost(cfg,kind){
  const d=load(cfg.clip),asp=d.w/d.h,T=new BallTracker(),D=new TouchDetector(kind),frames=[];let ev=[];
  for(const f of d.frames){if(!f.p||f.t<cfg.from||f.t>cfg.to)continue;const p=toPoints(f.p,asp);if(!bodyVisible(p,.3))continue;const ball=T.update(f.t,f.b,p,asp);ev.push(...D.update(f.t,p,ball));
    const S=torso(p),hx=(p[LM.L_HIP].x+p[LM.R_HIP].x)/2,hy=(p[LM.L_HIP].y+p[LM.R_HIP].y)/2;
    frames.push({t:f.t,pts:p.map(q=>[(q.x-hx)/S,(q.y-hy)/S]),ball:ball?[(ball.x-hx)/S,(ball.y-hy)/S,ball.r/S]:null});}
  ev.sort((a,b)=>a.t-b.t);
  const key=e=>kind==='tap'?e.foot:e.foot+e.dir,ks=ev.filter(e=>e.foot===(kind==='tap'?'L':'R')&&(kind==='tap'||e.dir==='right'));
  const P=32,cycles=[];
  for(let i=0;i+1<ks.length;i++){const a=ks[i].t,b=ks[i+1].t;if(b-a<.45||b-a>1.6)continue;const seg=frames.filter(f=>f.t>=a&&f.t<b);if(seg.length<6)continue;
    cycles.push(Array.from({length:P},(_,k)=>{const t=a+(b-a)*k/P;let j=0;while(j<seg.length-1&&seg[j+1].t<=t)j++;return seg[j];}));}
  if(!cycles.length) return null;
  const out=Array.from({length:P},(_,k)=>({p:Array.from({length:33},(_,l)=>[0,1].map(a=>+median(cycles.map(c=>c[k].pts[l][a])).toFixed(3)))}));
  const ballSeq=Array.from({length:P},(_,k)=>{const b=cycles.map(c=>c[k].ball).filter(Boolean);return b.length>cycles.length/2?[0,1,2].map(a=>+median(b.map(x=>x[a])).toFixed(3)):null;});
  out.forEach((f,i)=>f.b=ballSeq[i]);
  return {phases:P,cycles:cycles.length,frames:out};
}
const out={generated:'tools/build_reference.mjs',features:FEATURES,drills:{}};
for(const [id,cfg] of Object.entries(DRILLS)){
  const X=cfg.clips.flatMap(clipFeatures); if(!X.length){console.log('no data',id);continue;}
  const clips=[...new Set(X.map(r=>r.clip))];
  const stats=Object.fromEntries(FEATURES.map((k,j)=>{const a=X.map(r=>r[j]);return [k,{p05:+pct(a,.05).toFixed(3),p10:+pct(a,.1).toFixed(3),p50:+pct(a,.5).toFixed(3),p90:+pct(a,.9).toFixed(3),p95:+pct(a,.95).toFixed(3)}];}));
  const m=mean(X),I=inv(cov(X,m));
  // Leave-one-video-out: how far do frames from an unseen tutorial sit from what the others taught?
  const held=[];for(const c of clips){const tr=X.filter(r=>r.clip!==c),te=X.filter(r=>r.clip===c);if(tr.length<50)continue;const mm=mean(tr),II=inv(cov(tr,mm));held.push(...te.map(r=>maha(r,mm,II)));}
  const h=held.length?held:X.map(r=>maha(r,m,I));
  const g=ghost(cfg.ghost,cfg.kind);
  out.drills[id]={samples:X.length,clips,stats,model:{mean:m.map(v=>+v.toFixed(4)),inv:I.map(r=>r.map(v=>+v.toFixed(4))),p50:+pct(h,.5).toFixed(3),p95:+pct(h,.95).toFixed(3)},ghost:g};
  console.log(id,'samples',X.length,'clips',clips.length,'ghostCycles',g?.cycles,JSON.stringify(stats));
}
fs.writeFileSync('web/data/reference.json',JSON.stringify(out));console.log('bytes',fs.statSync('web/data/reference.json').size);

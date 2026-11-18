// Scores the shipped engine against hand-labelled touches. Usage: eval.mjs [--grid]
import fs from 'fs'; import {toPoints,bodyVisible,BallTracker,TouchDetector} from '../web/js/engine.js';
const labels=JSON.parse(fs.readFileSync('data/labels.json')); const cache={};
const load=c=>cache[c]??=JSON.parse(fs.readFileSync(`data/skeletons/${c}.json`));
export function run(l,o={}){
  const d=load(l.clip),asp=d.w/d.h,T=new BallTracker(),D=new TouchDetector(l.kind,o);let ev=[];
  const start=Math.max(0,l.from-2);
  for(const f of d.frames){if(!f.p||f.t<start||f.t>l.to+1)continue;const p=toPoints(f.p,asp);if(!bodyVisible(p,.3))continue;ev.push(...D.update(f.t,p,T.update(f.t,f.b,p,asp)));}
  ev=ev.filter(e=>e.t>=l.from&&e.t<=l.to).sort((a,b)=>a.t-b.t);
  const used=new Set();let tp=0,sideOk=0,sideN=0,errs=[];
  for(const [t,foot] of l.touches){let b=-1,bd=.14;ev.forEach((e,i)=>{if(!used.has(i)&&Math.abs(e.t-t)<bd){bd=Math.abs(e.t-t);b=i;}});if(b>=0){used.add(b);tp++;errs.push(ev[b].t-t);if(foot&&ev[b].foot===foot)sideOk++;if(foot)sideN++;}}
  return {tp,fp:ev.length-tp,fn:l.touches.length-tp,sideOk,sideN,errs,ev};
}
function report(o={},verbose=false,split){let tp=0,fp=0,fn=0,side=0,sn=0,errs=[];
  for(const l of labels){if(split&&l.split!==split)continue;const r=run(l,o);tp+=r.tp;fp+=r.fp;fn+=r.fn;side+=r.sideOk;sn+=r.sideN;errs.push(...r.errs);if(verbose)console.log(l.clip,l.from,'tp',r.tp,'fp',r.fp,'fn',r.fn,'side',r.sideOk,'\n  ',r.ev.map(e=>e.t.toFixed(2)+e.foot).join(' '));}
  const p=tp/(tp+fp||1),rc=tp/(tp+fn||1),mae=errs.reduce((a,b)=>a+Math.abs(b),0)/(errs.length||1),bias=errs.reduce((a,b)=>a+b,0)/(errs.length||1);
  return {tp,fp,fn,precision:+p.toFixed(3),recall:+rc.toFixed(3),f1:+(2*p*rc/(p+rc||1)).toFixed(3),sideAcc:sn?+(side/sn).toFixed(3):null,maeMs:Math.round(mae*1000),biasMs:Math.round(bias*1000)};}
if(process.argv.includes('--grid')){let out=[];for(const tapProm of [.12,.16,.22])for(const contact of [.12,.16,.2,.25,.3,.35])for(const topOffset of [.5,.75,1]){out.push({tapProm,contact,topOffset,...report({tapProm,contact,topOffset},false,'tuning')});}out.sort((a,b)=>b.f1-a.f1);console.table(out.slice(0,10));}
else {const res={tuning:report({},false,'tuning'),holdout:report({},false,'holdout'),labelledTouches:{tuning:labels.filter(l=>l.split==='tuning').reduce((a,l)=>a+l.touches.length,0),holdout:labels.filter(l=>l.split==='holdout').reduce((a,l)=>a+l.touches.length,0)}};fs.writeFileSync('web/data/accuracy.json',JSON.stringify(res,null,1));console.log('tuning',report({},true,'tuning'));console.log('holdout',report({},true,'holdout'));}

import fs from 'fs'; import {toPoints,bodyVisible,BallTracker,TouchDetector} from '../web/js/engine.js';
const [,,file,kind='tap',a='0',b='1e9']=process.argv; const d=JSON.parse(fs.readFileSync(file)); const asp=d.w/d.h;
const T=new BallTracker(),D=new TouchDetector(kind); let ev=[],n=0,seen=0;
for(const f of d.frames){ if(!f.p||f.t<+a||f.t>+b)continue; const p=toPoints(f.p,asp); if(!bodyVisible(p,.3)){continue;} n++; const ball=T.update(f.t,f.b,p,asp); if(ball)seen++; ev.push(...D.update(f.t,p,ball)); }
ev.sort((x,y)=>x.t-y.t); console.log('frames',n,'ball',(seen/n).toFixed(2),'events',ev.length);
console.log(ev.map(e=>e.t.toFixed(2)+e.foot).join(' '));

export const BONES=[[11,12],[11,23],[12,24],[23,24],[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[31,27],[28,30],[30,32],[32,28]];
export const C={lime:'#c8ff2e',amber:'#ffb020',red:'#ff3b4e',cyan:'#53e6ff',white:'#ffffff'};
const key=(a,b)=>a<b?a+'-'+b:b+'-'+a;
export function skeleton(g,pts,{color=C.lime,width=6,alpha=1,bad=[],glow=true,vis=true}={}){
  const badSet=new Set(bad.map(([a,b])=>key(a,b)));g.save();g.lineCap='round';g.globalAlpha=alpha;
  for(const pass of [0,1]) for(const [a,b] of [...BONES,[0,11],[0,12]]){
    const A=pts[a],B=pts[b];if(!A||!B||(vis&&(A.v<.3||B.v<.3)))continue;const isBad=badSet.has(key(a,b));
    if(pass!==(isBad?1:0))continue;
    g.strokeStyle=isBad?C.red:color;g.lineWidth=isBad?width*1.8:width;g.shadowColor=g.strokeStyle;g.shadowBlur=glow?(isBad?26:12):0;
    g.beginPath();g.moveTo(A.x,A.y);g.lineTo(B.x,B.y);g.stroke();
  }
  g.shadowBlur=0;g.fillStyle=color;
  for(const i of [11,12,23,24,25,26,27,28]){const A=pts[i];if(!A||(vis&&A.v<.3))continue;g.beginPath();g.arc(A.x,A.y,width*.75,0,7);g.fill();}
  g.restore();
}
export function ball(g,x,y,r,{virtual=false,fresh=true}={}){
  g.save();g.strokeStyle=virtual?C.cyan:C.white;g.lineWidth=Math.max(3,r*.1);g.globalAlpha=virtual||fresh?1:.55;g.shadowColor=g.strokeStyle;g.shadowBlur=18;
  if(virtual){g.setLineDash([r*.4,r*.22]);g.fillStyle='rgba(83,230,255,.16)';}
  g.beginPath();g.arc(x,y,r,0,7);if(virtual)g.fill();g.stroke();g.restore();
}
/** Scale a torso-normalised ghost pose into a box. */
export function ghostPoints(frame,cx,cy,unit){return frame.p.map(([x,y])=>({x:cx-x*unit,y:cy+y*unit,v:1}));}

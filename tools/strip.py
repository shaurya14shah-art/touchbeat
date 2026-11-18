"""Contact sheet of foot crops for hand-labelling touches. strip.py VIDEO SKEL.json START END STEP OUT.jpg"""
import sys,json,cv2,numpy as np
v,sk,a,b,step,out=sys.argv[1:7];a,b=float(a),float(b);step=int(step)
d=json.load(open(sk));F=d['frames'];w,h=d['w'],d['h'];cap=cv2.VideoCapture(v);fps=cap.get(5)
cx=np.median([np.mean([f['p'][31][0],f['p'][32][0]]) for f in F if f['p'] and a<=f['t']<=b]);cy=np.median([np.mean([f['p'][31][1],f['p'][32][1]]) for f in F if f['p'] and a<=f['t']<=b])
S=int(.33*h) if h>w else int(.42*h);x0=max(0,int(cx*w-S/2));y0=max(0,int(cy*h-S*.62));tiles=[];i=0
while True:
    ok,im=cap.read()
    if not ok:break
    t=i/fps;i+=1
    if t<a or (i-1)%step:continue
    if t>b:break
    c=im[y0:y0+S,x0:x0+S];c=cv2.resize(c,(150,150),interpolation=cv2.INTER_CUBIC)
    cv2.rectangle(c,(0,0),(64,16),(0,0,0),-1);cv2.putText(c,f"{t:.2f}",(2,13),0,.45,(0,255,255),1,cv2.LINE_AA);tiles.append(c)
n=12;rows=[np.hstack(tiles[k:k+n]+[np.zeros((150,150,3),np.uint8)]*(n-len(tiles[k:k+n]))) for k in range(0,len(tiles),n)]
cv2.imwrite(out,np.vstack(rows),[cv2.IMWRITE_JPEG_QUALITY,88]);print(len(tiles),'tiles',fps)

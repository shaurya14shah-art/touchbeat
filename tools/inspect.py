import json,sys,statistics as s
for fn in sys.argv[1:]:
    d=json.load(open(fn)); F=d['frames']
    full=[f for f in F if f['p'] and min(f['p'][i][3] for i in (11,12,23,24,27,28))>.5 and max(f['p'][i][1] for i in (31,32))<1.02]
    near=0; sizes=[]
    for f in full:
        if f['b']:
            b=max(f['b'],key=lambda x:x[4]); sizes.append(b[2])
            ax=[(f['p'][i][0],f['p'][i][1]) for i in (29,30,31,32)]
            if min(abs(a[0]-b[0])*d['w']+abs(a[1]-b[1])*d['h'] for a in ax)<0.25*d['h']: near+=1
    print(d['source'],f"{d['w']}x{d['h']}",len(F),'full',round(len(full)/len(F),2),'ball_near_of_full',round(near/max(1,len(full)),2),'ballw',round(s.median(sizes),3) if sizes else None)

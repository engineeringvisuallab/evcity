# MAP-2 FIX 3 helper: groups of lines that do not touch a passing road + decision list. Run: python3 tools/map2_fix3_groups.py (after tools/map2_fix3.py), writes docs/STEP_MAP2_FIX3_DECISIONS.txt
import json, numpy as np, math
ROOTS = set(json.load(open('docs/map2_roots.json')))   # FIX 4: 8-lane + built 6-lane that reach an 8-lane road (tools/map2_roots.py)
J=json.load(open('docs/map_all_roads_v3.json'))
poly={};cl={};built=set()
for b in J['built']:
    if ':' in b['name']: continue
    poly[b['name']]=np.array(b['pts']);cl[b['name']]=b['lanes'];built.add(b['name'])
ids=[r['id'] for r in J['roads']]
for r in J['roads']: poly[r['id']]=np.array(r['pts']);cl[r['id']]=r['cls']
def dense(P,s=10):
    d=np.r_[0,np.cumsum(np.hypot(*np.diff(P,axis=0).T))];n=max(2,int(d[-1]//s)+1);t=np.linspace(0,d[-1],n)
    return np.c_[np.interp(t,d,P[:,0]),np.interp(t,d,P[:,1])]
D={k:dense(v) for k,v in poly.items()}
def dist(a,b):
    A=D[a];B=D[b]
    from scipy.spatial import cKDTree
    return cKDTree(B).query(A)[0].min()
# components by touch (<=25 m) among ids, via junction membership too
par={i:i for i in ids}
def f(x):
    while par[x]!=x: par[x]=par[par[x]]; x=par[x]
    return x
for j in J['junctions']:
    m=[r for r in j['roads'] if r in par]
    for a in m[1:]: par[f(a)]=f(m[0])
from scipy.spatial import cKDTree
T={k:cKDTree(D[k]) for k in D}
for a in ids:
    for b in ids:
        if a<b and f(a)!=f(b) and T[b].query(D[a])[0].min()<=25: par[f(a)]=f(b)
comp={}
for i in ids: comp.setdefault(f(i),[]).append(i)
roots=[k for k in poly if k in ROOTS]
import collections
res=[]
for c,m in comp.items():
    # connected to root?
    if any(T[r].query(D[i])[0].min()<=25 for i in m for r in roots): continue
    best=min((T[k].query(D[i])[0].min(),i,k) for i in m for k in roots)
    best8=min((T[k].query(D[i])[0].min(),i,k) for i in m for k in roots if cl[k]==8)
    res.append((len(m),round(sum(len(D[i])*10 for i in m)),round(best[0]),best[2],round(best8[0]),max(cl[i] for i in m),m[:3]))
res.sort(key=lambda x:-x[1])
print('components not touching any root:',len(res),'lines',sum(r[0] for r in res))
h=collections.Counter()
for r in res:
    d=r[2]; h['<=150' if d<=150 else '<=300' if d<=300 else '<=600' if d<=600 else '<=1000' if d<=1000 else '>1000']+=1
print(dict(h))
for r in res[:12]: print(r)

import re
A3=json.load(open('docs/a3_demand_x2.json')); NODE={n['id']:n for n in A3['nodes']}
TAPS={k:(NODE[k]['x'],NODE[k]['z']) for k in ['T7299','T8919','T13738','T18838','T-N880','T-E610','T-W960']}
JOINS={k:(NODE[k]['x'],NODE[k]['z']) for k in ['R1205','R4265','R12094','R16813']}
b=[x for x in J['built'] if x['name']=='R6-8:m1']; 
if b: TAPS['R6-8-tap']=tuple(b[0]['pts'][0])
J1C=(-117,-277)
reasons={}
for l in open('docs/STEP_MAP2_FIX3_OUTPUT.txt'):
    m=re.match(r'\s+R\d (\S+)\s+(.*?)\s+\| nearest',l)
    if m: reasons[m.group(1)]=m.group(2).strip()
out=['STEP MAP2-FIX3 DECISION LIST: %d groups of lines (%d lines) do not touch a passing road. ONE join per group is enough to pass the class-sequence rule.'%(len(res),sum(r[0] for r in res)),
     'group | lines | class max | nearest root, distance | contact on the root: nearest tap / nearest ring x arm join / J1 centre | blocker | smallest change',]
for n,(cnt,length,d,root,d8,cmax,mem) in enumerate(res,1):
    # find best pair
    best=None
    for i in [i for c,m in comp.items() if set(mem)<=set(m) for i in m]:
        for k in roots:
            dd,ix=T[k].query(D[i]); j=int(dd.argmin())
            if best is None or dd[j]<best[0]: best=(float(dd[j]),i,k,D[k][ix[j]])
    dd,i,k,q=best
    nt=min((math.hypot(q[0]-x,q[1]-z),n_) for n_,(x,z) in TAPS.items())
    nj=min((math.hypot(q[0]-x,q[1]-z),n_) for n_,(x,z) in JOINS.items())
    dj=math.hypot(q[0]-J1C[0],q[1]-J1C[1])
    if cl[k]==8:
        bl=[]
        if dj<900: bl.append('J1 plaza %.0f m < 900'%dj)
        if nj[0]<800: bl.append('join %s %.0f m (no branch / 800)'%(nj[1],nj[0]))
        if nt[0]<800: bl.append('tap %s %.0f m < 800'%(nt[1],nt[0]))
        bl=', '.join(bl) or 'spacing ok'
        change='relax spacing to %.0f m, or move the join to tap %s (%.0f m)'%(min(nt[0],nj[0]),nt[1],nt[0]) if bl!='spacing ok' else 'none for spacing'
    else:
        bl='built 6-lane root %s (no spacing rule)'%k; change='-'
    r_=reasons.get(i,'')
    out.append('G%02d | %d | R%d | %s %.0f m (line %s) | %s %.0f m / %s %.0f m / J1 %.0f m | %s | %s | line reason: %s'%(n,cnt,cmax,k,dd,i,nt[1],nt[0],nj[1],nj[0],dj,bl,change,r_[:70]))
open('docs/STEP_MAP2_FIX3_DECISIONS.txt','w').write('\n'.join(out)+'\n')
print('\n'.join(out[:14]))

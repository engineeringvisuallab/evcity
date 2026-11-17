"""STEP 2.2c: small local refit of PI 1 and PI 2 (south of the ring) so the straight between them is >= 1050 m, with hard rules: no more water on the centreline / ROW, no more steep ground in the 80 m ROW than version 2.
Start = version 2 PI table (docs/RingAlignment.v2.ts). Run: python3 tools/ring-refit-south.py <ring_raster.json> <ring_cost.npy> <out.npy>   (raster: scripts/ring-raster-export.ts, cost: tools/ring-route.py)"""
import sys
import json, math, importlib.util
import numpy as np
from scipy.ndimage import uniform_filter
spec = importlib.util.spec_from_file_location('rf', __file__.replace('ring-refit-south.py', 'ring-fit.py')); rf = importlib.util.module_from_spec(spec); spec.loader.exec_module(rf)
R_ = json.load(open(sys.argv[1])); cost = np.load(sys.argv[2])
N=R_['n']; C=R_['cell']; HALF=R_['half']
h=np.array(R_['h'],float).reshape(N,N); wet=np.array(R_['wet']).reshape(N,N)
gz,gx=np.gradient(h,C); slope=uniform_filter(np.hypot(gx,gz)*100,3)
PIS=[(398.13,1846.29,1396),(-459.03,2348.47,632),(-2453.85,2389.45,929),(-2658.75,-1947.51,591),(-600.49,-2901.43,1272),(515.58,-4324.18,1008),(2530.62,-2338.21,595),(3082.78,-776.58,1816),(2847.71,1193.03,591),(1495.26,1861.91,714)]
X0=np.array(PIS); PI0=X0[:,:2].copy(); R0=X0[:,2].copy(); n=10
def cells(al): return np.clip(((al+HALF)/C).astype(int),0,N-1)
def metrics(PI,R):
    al=rf.sample(PI,R,5); t=np.gradient(al,axis=0); t/= (np.hypot(t[:,0],t[:,1])[:,None]+1e-9); nrm=np.stack([-t[:,1],t[:,0]],1)
    W=[];S=[]
    for off in (-40,-20,0,20,40):
        c=cells(al+off*nrm); W.append(wet[c[:,1],c[:,0]]>0); S.append(slope[c[:,1],c[:,0]])
    W=np.array(W); S=np.array(S)
    return dict(wet=float(W[2].sum()*5), wetROW=float(W.any(0).sum()*5), steep=float((S[2]>25).sum()*5), steepROW=float((S.max(0)>25).sum()*5), vsteep=float((S.max(0)>60).sum()*5), L=len(al)*5)
B=metrics(PI0,R0); print('baseline (raster)',B)
TARGET=1050.0
def J(PI,R):
    h_,E,dl,ths,Ts,g,arc=rf.geometry(PI,R); pen=0.0
    for i in range(n):
        gm=rf.GSAME if dl[i]*dl[(i+1)%n]>0 else rf.GREV
        pen+=max(0.0,gm-g[i])*40+max(0.0,0.05-arc[i])*80000
    pen+=np.maximum(0,rf.RLIM-R).sum()*50 + max(0.0,TARGET-g[1])*60
    m=metrics(PI,R)
    pen+=max(0,m['wet']-B['wet'])*80 + max(0,m['wetROW']-B['wetROW'])*60 + max(0,m['steepROW']-B['steepROW'])*30 + max(0,m['vsteep']-B['vsteep'])*60
    al=rf.sample(PI,R,10); c=cells(al)
    return float(cost[c[:,1],c[:,0]].sum()*10/C)+pen+0.0004*len(al)*10 + 0.02*(np.hypot(*(PI-PI0).T).sum())
print('start',round(J(PI0,R0)))
best=None
for seed in range(10):
    rng=np.random.default_rng(seed); PI=PI0.copy(); R=R0.copy(); bj=J(PI,R)
    for it in range(3000):
        sc=max(0.08,1-it/3000); P2=PI.copy(); R2=R.copy(); k=rng.choice([1,2]); m=rng.random()
        if m<0.55: P2[k]+=rng.normal(0,70*sc,2)
        elif m<0.75: R2[k]=max(rf.RLIM,R2[k]*math.exp(rng.normal(0,0.15*sc)))
        else: P2[1]+=rng.normal(0,50*sc,2); P2[2]+=rng.normal(0,50*sc,2)
        j=J(P2,R2)
        if j<bj: bj,PI,R=j,P2,R2
    g=rf.geometry(PI,R)[5]; m=metrics(PI,R)
    print('seed',seed,'J',round(bj),'straight',round(g[1]),m)
    if best is None or bj<best[0]: best=(bj,PI,R)
bj,PI,R=best; np.save(sys.argv[3],np.column_stack([PI,R]))
for i in (1,2): print(i,'x %.2f z %.2f R %d moved %.0f m'%(PI[i,0],PI[i,1],round(R[i]),np.hypot(*(PI[i]-PI0[i]))))

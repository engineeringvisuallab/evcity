#!/usr/bin/env python3
"""R6 step G2c: instead of only cutting, try to RE-ROUTE each line that G2b cut around the bad ground:
cheapest path on the A1 ground map (50 m cells) between the two ends, kept inside a 400 m corridor round the user's line (R10: stay near the sketch).
Cell cost (MY proposal): A 1, B 1.2, C 2, D 5, E 40, F 3, R 2, X 1.5, sea blocked. Accept a re-route only if it passes the same ground test as G2b
(very steep + sea < 20 %, steep + very steep + sea < 50 %). Run after tools/r6-g2b.py. Writes docs/r6_g2c.json, docs/r6_g2c.png, docs/STEP_R6_G2C_OUTPUT.txt"""
import json, math
import numpy as np
from skimage.graph import route_through_array
from scipy.ndimage import binary_dilation
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import to_rgb
B=json.load(open('docs/r6_g2b.json')); T={l['id']:l for l in json.load(open('docs/r6_trace.json'))['lines']}
G=json.load(open('docs/a1_buildability.json')); rows=G['rows']; cell=G['cell']; half=G['half']
cost={'A':1,'B':1.2,'C':2,'D':5,'E':40,'F':3,'R':2,'X':1.5}
C=np.full((200,200),np.inf)
for j in range(200):
    for i in range(200):
        c=rows[j][i]
        if c in cost: C[j,i]=cost[c]
def ij(x,z): return (min(199,max(0,int((z+half)//cell))),min(199,max(0,int((x+half)//cell))))
def xz(j,i): return (-half+(i+.5)*cell,-half+(j+.5)*cell)
def cls(x,z):
    j,i=ij(x,z); return rows[j][i]
def resample(P,step=25):
    d=[0]
    for i in range(1,len(P)): d.append(d[-1]+math.dist(P[i-1],P[i]))
    n=max(2,int(d[-1]//step)+1); s=np.linspace(0,d[-1],n)
    return np.c_[np.interp(s,d,[p[0] for p in P]),np.interp(s,d,[p[1] for p in P])]
def shares(Q):
    cnt={}
    for i in range(len(Q)-1):
        m=(Q[i]+Q[i+1])/2; c=cls(*m); cnt[c]=cnt.get(c,0)+math.dist(Q[i],Q[i+1])
    L=sum(cnt.values()) or 1
    return cnt,(cnt.get('E',0)+cnt.get('~',0))/L,(cnt.get('D',0)+cnt.get('E',0)+cnt.get('~',0))/L,L
def minR(Q):
    m=1e9
    for i in range(1,len(Q)-1):
        a,b,c=Q[i-1],Q[i],Q[i+1]
        ab=np.linalg.norm(b-a);bc=np.linalg.norm(c-b);ac=np.linalg.norm(c-a)
        ar=abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))
        if ar>1e-6: m=min(m,ab*bc*ac/(2*ar))
    return m
def smooth(Q0):
    Q=Q0.copy()
    for it in range(600):
        if minR(Q)>=229 or len(Q)<5: break
        Q2=Q.copy(); Q2[1:-1]=(Q[:-2]+2*Q[1:-1]+Q[2:])/4
        if np.max(np.linalg.norm(Q2-Q0,axis=1))>120: break
        Q=Q2
    return Q
ok=[];no=[]
for c in B['cut']+B['dropped']:
    l=T[c['src_id']]; P=l['pts']
    mask=np.zeros((200,200),bool)
    for q in resample(P,20): mask[ij(*q)]=True
    cor=binary_dilation(mask,iterations=8)         # 8 cells = 400 m
    CC=np.where(cor,C,np.inf)
    s=ij(*P[0]);e=ij(*P[-1])
    if not np.isfinite(CC[s]) or not np.isfinite(CC[e]): no.append((l,'an end lies on sea / outside the corridor cells')); continue
    try: path,_=route_through_array(CC,s,e,fully_connected=True,geometric=True)
    except Exception as ex: no.append((l,'no path')); continue
    W=np.array([xz(*p) for p in path]); W[0]=P[0]; W[-1]=P[-1]
    Q=smooth(resample([tuple(p) for p in W]))
    cnt,e20,d50,L=shares(Q); R=minR(Q)
    if e20<0.20 and d50<0.50: ok.append((l,Q,L,cnt,R,d50))
    else: no.append((l,'best path still bad: very steep + sea %.0f %%, steep + very steep + sea %.0f %%'%(e20*100,d50*100)))
kept=B['lines']; ktot=sum(k['length_m'] for k in kept); otot=sum(o[2] for o in ok)
json.dump({'note':'G2c: re-routed lines (desire lines, not final)','rerouted':[{'src_id':o[0]['id'],'length_m':round(o[2]),'min_radius_m':None if o[4]>1e8 else round(o[4]),'pts':[[round(float(x),1),round(float(y),1)] for x,y in o[1]]} for o in ok],'still_cut':[{'src_id':n[0]['id'],'length_m':n[0]['length_m'],'why':n[1]} for n in no]},open('docs/r6_g2c.json','w'))
col={'~':'#9ecae1','R':'#756bb1','X':'#999999','F':'#fdae6b','A':'#e5f5e0','B':'#c7e9c0','C':'#a1d99b','D':'#fcbba1','E':'#d9d9d9','?':'#fff'}
img=np.zeros((200,200,3))
for j in range(200):
    for i in range(200): img[j,i]=to_rgb(col.get(rows[j][i],'#fff'))
fig,ax=plt.subplots(figsize=(11,11)); ax.imshow(img,extent=[-half,half,half,-half],interpolation='nearest',alpha=.55)
A3=json.load(open('docs/a3_demand_x2.json'))
for P in A3['links']:
    if P.get('fixed'): ax.plot([q[0] for q in P['pts']],[q[1] for q in P['pts']],color='#222',lw=3)
for n in no: ax.plot([p[0] for p in n[0]['pts']],[p[1] for p in n[0]['pts']],color='#d62728',lw=1.6,ls=':')
for k in kept: ax.plot([p[0] for p in k['pts']],[p[1] for p in k['pts']],color='#0051ba',lw=2.6)
for o in ok: ax.plot(o[1][:,0],o[1][:,1],color='#00a65a',lw=2.6)
ax.set_xlim(-4200,4200);ax.set_ylim(4600,-4400);ax.set_aspect('equal')
ax.set_title('R6 G2c: blue = kept (G2b), green = re-routed around bad ground, red dotted = still cut',fontsize=9)
plt.savefig('docs/r6_g2c.png',dpi=100,bbox_inches='tight')
t=['R6 G2c: re-route of the lines G2b cut (cost A 1, B 1.2, C 2, D 5, E 40, F 3, R 2, X 1.5, sea blocked; corridor 400 m round the sketch line; MY proposal)',
'G2b kept %.1f km | re-routed OK %d lines %.1f km | still cut %d lines %.1f km | TOTAL R6 NOW %.1f km (8-lane roads 31.4 km)'%(ktot/1000,len(ok),otot/1000,len(no),sum(n[0]['length_m'] for n in no)/1000,(ktot+otot)/1000),'','RE-ROUTED (src line, new length, old length, min radius, steep+very steep+sea share):']
for o in sorted(ok,key=lambda o:o[0]['id']): t.append('  line %d  %d m (sketch %d m)  R_min %s  bad %.0f %%'%(o[0]['id'],o[2],o[0]['length_m'],'straight' if o[4]>1e8 else round(o[4]),o[5]*100))
t.append('STILL CUT:')
for n in sorted(no,key=lambda n:n[0]['id']): t.append('  line %d  %d m  %s'%(n[0]['id'],n[0]['length_m'],n[1]))
open('docs/STEP_R6_G2C_OUTPUT.txt','w').write('\n'.join(t)); print('\n'.join(t))

#!/usr/bin/env python3
"""R6 step G2b: decide which traced blue lines stay (cut the ones on impossible ground), close the
hand-drawn gaps, smooth the kept lines (R3), check radius and the crossings with the 8-lane roads.
Run: python3 tools/r6-g2b.py (after tools/r6-trace.py).  Writes docs/r6_g2b.json, docs/r6_g2b.png, docs/STEP_R6_G2B_OUTPUT.txt
THRESHOLDS ARE MINE (proposal, printed in the output): cut a line if very steep E + sea >= 20 % of its length, or steep D + E + sea >= 50 %.
Rail (R) and fenced (F) do NOT cut a line (rail = bridge / underpass later, F lumps engineering land that is replaced after the roads)."""
import json, math
import numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import to_rgb
T=json.load(open('docs/r6_trace.json'))['lines']
A3=json.load(open('docs/a3_demand_x2.json'))
G=json.load(open('docs/a1_buildability.json')); rows=G['rows']; cell=G['cell']; half=G['half']
out=[]
def cut_reason(l):
    L=l['length_m']; c=l['class_m']
    e=(c.get('E',0)+c.get('~',0))/L; d=(c.get('D',0)+c.get('E',0)+c.get('~',0))/L
    if e>=0.20: return 'very steep + sea %.0f %% (>= 20 %%)'%(e*100)
    if d>=0.50: return 'steep + very steep + sea %.0f %% (>= 50 %%)'%(d*100)
    return None
keep=[];cut=[]
for l in T:
    r=cut_reason(l)
    (cut if r else keep).append((l,r))
# --- join: closing gaps between ends of kept lines (<= 150 m), then drop isolated kept pieces under 500 m
def ends(l): return [tuple(l['pts'][0]),tuple(l['pts'][-1])]
comp=list(range(len(keep)))
def find(i):
    while comp[i]!=i: comp[i]=comp[comp[i]]; i=comp[i]
    return i
for i in range(len(keep)):
    for j in range(i+1,len(keep)):
        if min(math.dist(a,b) for a in ends(keep[i][0]) for b in ends(keep[j][0]))<=150: comp[find(j)]=find(i)
groups={}
for i in range(len(keep)): groups.setdefault(find(i),[]).append(i)
final=[];dropped=[]
for g,ix in groups.items():
    km=sum(keep[i][0]['length_m'] for i in ix)
    if km>=500: final+= [keep[i][0] for i in ix]
    else: dropped+= [(keep[i][0],'isolated piece, group only %d m'%km) for i in ix]
# --- smoothing (Gaussian along arc length, ends fixed) until min radius >= 229 m (V80 minimum) or deviation 80 m
def resample(P,step=25):
    d=[0]
    for i in range(1,len(P)): d.append(d[-1]+math.dist(P[i-1],P[i]))
    n=max(2,int(d[-1]//step)+1); s=np.linspace(0,d[-1],n)
    return np.c_[np.interp(s,d,[p[0] for p in P]),np.interp(s,d,[p[1] for p in P])]
def minR(Q):
    m=1e9
    for i in range(1,len(Q)-1):
        a,b,c=Q[i-1],Q[i],Q[i+1]
        ab=np.linalg.norm(b-a);bc=np.linalg.norm(c-b);ac=np.linalg.norm(c-a)
        ar=abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))
        if ar>1e-6: m=min(m,ab*bc*ac/(2*ar))
    return m
def smooth(P):
    Q0=resample(P); Q=Q0.copy()
    for it in range(400):
        if minR(Q)>=229 or len(Q)<5: break
        Q2=Q.copy(); Q2[1:-1]=(Q[:-2]+2*Q[1:-1]+Q[2:])/4
        if np.max(np.linalg.norm(Q2-Q0,axis=1))>80: break
        Q=Q2
    return Q,Q0
fx=[]
for P in A3['links']:
    if P.get('fixed'):
        for i in range(len(P['pts'])-1): fx.append((P['pts'][i],P['pts'][i+1],P['id']))
def inter(p1,p2,p3,p4):
    def cr(a,b,c): return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    return cr(p1,p2,p3)*cr(p1,p2,p4)<0 and cr(p3,p4,p1)*cr(p3,p4,p2)<0
def xpt(p1,p2,p3,p4):
    x1,y1=p1;x2,y2=p2;x3,y3=p3;x4,y4=p4
    t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/((x1-x2)*(y3-y4)-(y1-y2)*(x3-x4))
    return (x1+t*(x2-x1),y1+t*(y2-y1))
res=[];crossings=[]
for k,l in enumerate(sorted(final,key=lambda l:l['id']),1):
    Q,Q0=smooth(l['pts']); dev=float(np.max(np.linalg.norm(Q-Q0,axis=1))); R=minR(Q)
    L=float(sum(np.linalg.norm(Q[1:]-Q[:-1],axis=1)))
    for i in range(len(Q)-1):
        for s in fx:
            if inter(Q[i],Q[i+1],s[0],s[1]): crossings.append({'line':l['id'],'on':s[2],'at':[round(v) for v in xpt(Q[i],Q[i+1],s[0],s[1])]})
    res.append({'src_id':l['id'],'length_m':round(L),'min_radius_m':None if R>1e8 else round(R),'max_shift_from_sketch_m':round(dev),'pts':[[round(float(x),1),round(float(y),1)] for x,y in Q]})
tot=sum(r['length_m'] for r in res)
# crossing spacing: compare to existing nodes on the 8-lane roads
nodes=[(n['id'],n['x'],n['z']) for n in A3['nodes'] if n['kind'] in ('ring','tap','j1')]
for c in crossings:
    dn=min((math.dist(c['at'],(x,z)),i) for i,x,z in nodes); c['nearest_node']=dn[1]; c['dist_m']=round(dn[0])
crossings.sort(key=lambda c:(c['on'],c['at']))
json.dump({'note':'G2b: smoothed desire lines, still NOT final alignments','thresholds':'cut E+sea>=20% or D+E+sea>=50%','lines':res,'crossings':crossings,'cut':[{'src_id':l['id'],'length_m':l['length_m'],'why':r} for l,r in cut],'dropped':[{'src_id':l['id'],'length_m':l['length_m'],'why':r} for l,r in dropped]},open('docs/r6_g2b.json','w'))
# picture
col={'~':'#9ecae1','R':'#756bb1','X':'#999999','F':'#fdae6b','A':'#e5f5e0','B':'#c7e9c0','C':'#a1d99b','D':'#fcbba1','E':'#d9d9d9','?':'#fff'}
img=np.zeros((200,200,3))
for j in range(200):
    for i in range(200): img[j,i]=to_rgb(col.get(rows[j][i],'#fff'))
fig,ax=plt.subplots(figsize=(11,11)); ax.imshow(img,extent=[-half,half,half,-half],interpolation='nearest',alpha=.55)
for P in A3['links']:
    if P.get('fixed'): ax.plot([q[0] for q in P['pts']],[q[1] for q in P['pts']],color='#222',lw=3)
for l,r in cut+dropped: ax.plot([p[0] for p in l['pts']],[p[1] for p in l['pts']],color='#d62728',lw=1.6,ls=':')
for r in res: ax.plot([p[0] for p in r['pts']],[p[1] for p in r['pts']],color='#0051ba',lw=2.6)
for c in crossings: ax.plot(*c['at'],'o',mfc='yellow',mec='k',ms=7)
ax.set_xlim(-4200,4200);ax.set_ylim(4600,-4400);ax.set_aspect('equal')
ax.set_title('R6 G2b: blue = kept and smoothed, red dotted = cut (ground) or dropped, yellow dot = crossing with an 8-lane road (needs the interchange decision)',fontsize=8)
plt.savefig('docs/r6_g2b.png',dpi=100,bbox_inches='tight')
t=['R6 G2b: keep / cut / smooth of the traced blue lines (thresholds are my proposal: cut if very steep + sea >= 20 % or steep + very steep + sea >= 50 %; rail and fenced do not cut)',
'traced %d segments %.1f km | cut for ground %d (%.1f km) | dropped isolated %d (%.1f km) | KEPT %d segments %.1f km (8-lane roads 31.4 km)'%(len(T),sum(l['length_m'] for l in T)/1000,len(cut),sum(l['length_m'] for l,_ in cut)/1000,len(dropped),sum(l['length_m'] for l,_ in dropped)/1000,len(res),tot/1000),
'smoothing: Gaussian, ends fixed, until min radius >= 229 m (V80 minimum, V60 needs about 123 m) or 80 m shift from the sketch',
'lines still under 229 m radius: %d; biggest shift from the sketch %d m'%(sum(1 for r in res if r['min_radius_m'] and r['min_radius_m']<229),max(r['max_shift_from_sketch_m'] for r in res)),
'crossings of kept lines with the fixed 8-lane roads: %d (need the interchange schedule; ring and arms have only 4 ring taps + 3 arm taps at 1.6 km spacing)'%len(crossings),'','CUT:']
for l,r in sorted(cut,key=lambda x:x[0]['id']): t.append('  line %d  %d m  %s'%(l['id'],l['length_m'],r))
t.append('DROPPED:')
for l,r in sorted(dropped,key=lambda x:x[0]['id']): t.append('  line %d  %d m  %s'%(l['id'],l['length_m'],r))
t.append('KEPT (src id, length after smoothing, min radius, max shift from sketch):')
for r in res: t.append('  line %d  %d m  R_min %s  shift %d m'%(r['src_id'],r['length_m'],r['min_radius_m'],r['max_shift_from_sketch_m']))
t.append('CROSSINGS (line, on road, position, nearest ring / arm node and distance):')
for c in crossings: t.append('  line %d on %s at %s  nearest %s %d m'%(c['line'],c['on'],c['at'],c['nearest_node'],c['dist_m']))
open('docs/STEP_R6_G2B_OUTPUT.txt','w').write('\n'.join(t)); print('\n'.join(t))

#!/usr/bin/env python3
"""R6 step G2a: trace the user's BLUE lines (docs/6 to 2 lane_plan.png) into world polylines
and check them against the A1 ground map and the fixed 8-lane roads.
Run: python3 tools/r6-trace.py   (from the project root; needs numpy, pillow, scikit-image, matplotlib)
Writes: docs/r6_trace.json, docs/r6_trace.png, docs/STEP_R6_G2A_OUTPUT.txt
The lines are DESIRE LINES from a freehand picture (R10): not smooth, not final alignments (R3)."""
import json, math, sys
import numpy as np
from PIL import Image
from skimage.morphology import skeletonize
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt

REF='docs/6 to 2 lane_plan.png'; BASE='docs/plan_20_chords_2026-11-15.png'
a=np.array(Image.open(REF).convert('RGB')).astype(int)
b=np.array(Image.open(BASE).convert('RGB')).astype(int)
assert a.shape==b.shape
diff=np.abs(a-b).sum(2)>60
mask=(np.abs(a-np.array((0,81,186))).sum(2)<70)&diff
mask[850:,500:]=False   # legend swatches
sk=skeletonize(mask)

# --- calibration pixel -> world (ring taps T7299, T18838 as in the plan picture)
A3=json.load(open('docs/a3_demand_x2.json'))
N={n['id']:n for n in A3['nodes']}
def find_px(x,z):
    return None
# fitted from the two tap markers: px = 396.2 + 0.1116*x ; py = 504.8 + 0.1119*z
SX,SZ=0.1116,0.1119; OX,OZ=396.2,504.8
def w(px,py): return ((px-OX)/SX,(py-OZ)/SZ)

# --- skeleton graph -> polylines
ys,xs=np.nonzero(sk); pts=set(zip(xs.tolist(),ys.tolist()))
def nb(p):
    x,y=p
    return [(x+dx,y+dy) for dx in(-1,0,1) for dy in(-1,0,1) if (dx or dy) and (x+dx,y+dy) in pts]
deg={p:len(nb(p)) for p in pts}
nodes={p for p in pts if deg[p]!=2}
seen=set(); paths=[]
def walk(start,nxt):
    path=[start,nxt]; prev,cur=start,nxt
    while cur not in nodes:
        c=[q for q in nb(cur) if q!=prev and q not in path[-3:]]
        if not c: break
        prev,cur=cur,c[0]; path.append(cur)
        if len(path)>20000: break
    return path
done=set()
for n in nodes:
    for m in nb(n):
        key=(n,m)
        if key in done: continue
        p=walk(n,m); done.add((p[-1],p[-2]) if len(p)>1 else key); done.add(key)
        paths.append(p)
# loops without nodes
used=set(q for p in paths for q in p)
for p0 in pts-used:
    if p0 in used: continue
    pth=walk(p0,nb(p0)[0]); used|=set(pth); paths.append(pth)
def dp(P,eps):
    if len(P)<3: return P
    (x1,y1),(x2,y2)=P[0],P[-1]; L=math.hypot(x2-x1,y2-y1) or 1
    dm,im=0,0
    for i in range(1,len(P)-1):
        d=abs((y2-y1)*P[i][0]-(x2-x1)*P[i][1]+x2*y1-y2*x1)/L
        if d>dm: dm,im=d,i
    if dm>eps: return dp(P[:im+1],eps)[:-1]+dp(P[im:],eps)
    return [P[0],P[-1]]
lines=[]
for p in paths:
    if len(p)<14: continue                      # drop spurs shorter than about 120 m
    s=dp(p,3.0)
    W=[w(*q) for q in s]
    L=sum(math.dist(W[i],W[i+1]) for i in range(len(W)-1))
    if L<150: continue
    lines.append(W)

# --- ground map (A1)
G=json.load(open('docs/a1_buildability.json')); rows=G['rows']; cell=G['cell']; half=G['half']
def cls(x,z):
    i=int((x+half)//cell); j=int((z+half)//cell)
    if 0<=i<200 and 0<=j<200: return rows[j][i]
    return '?'
# sanity: ring points must be class X
ring=[]
for l in A3['links']:
    if l.get('fixed'): ring.append(l['pts'])
ok=0;tot=0
for P in ring:
    for q in P[::5]:
        tot+=1; ok+= cls(*q)=='X'
print('grid orientation check: fixed road points on class X: %d of %d'%(ok,tot))
fixed_segs=[]
for P in ring:
    for i in range(len(P)-1): fixed_segs.append((P[i],P[i+1]))
def inter(p1,p2,p3,p4):
    def cr(a,b,c): return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    return cr(p1,p2,p3)*cr(p1,p2,p4)<0 and cr(p3,p4,p1)*cr(p3,p4,p2)<0

out=[]; rep=[]
tl=0
tot_cls={}
for k,W in enumerate(lines,1):
    L=0; cnt={}; samples=0
    for i in range(len(W)-1):
        d=math.dist(W[i],W[i+1]); n=max(1,int(d//25)); L+=d
        for t in range(n):
            f=(t+.5)/n; x=W[i][0]+f*(W[i+1][0]-W[i][0]); z=W[i][1]+f*(W[i+1][1]-W[i][1])
            c=cls(x,z); cnt[c]=cnt.get(c,0)+25; tot_cls[c]=tot_cls.get(c,0)+25
    cross=0
    for i in range(len(W)-1):
        for s in fixed_segs:
            if inter(W[i],W[i+1],s[0],s[1]): cross+=1
    tl+=L
    out.append({'id':k,'length_m':round(L),'class_m':cnt,'crosses_fixed_8lane':cross,'pts':[[round(x,1),round(z,1)] for x,z in W]})
    bad=cnt.get('E',0)+cnt.get('D',0)+cnt.get('~',0)+cnt.get('R',0)+cnt.get('F',0)
    rep.append((k,round(L),cnt,cross,bad/L))
json.dump({'note':'desire lines traced from the user picture, NOT final alignments','scale_m_per_px':1/SX,'lines':out},open('docs/r6_trace.json','w'))

# --- picture
col={'~':'#9ecae1','R':'#756bb1','X':'#999999','F':'#fdae6b','A':'#e5f5e0','B':'#c7e9c0','C':'#a1d99b','D':'#fcbba1','E':'#d9d9d9','?':'#fff'}
img=np.zeros((200,200,3))
from matplotlib.colors import to_rgb
for j in range(200):
    for i in range(200): img[j,i]=to_rgb(col.get(rows[j][i],'#fff'))
fig,ax=plt.subplots(figsize=(11,11))
ax.imshow(img,extent=[-half,half,half,-half],interpolation='nearest')
for P in ring:
    ax.plot([q[0] for q in P],[q[1] for q in P],color='#333',lw=2.5)
for o,(k,L,cnt,cross,bf) in zip(out,rep):
    xs=[p[0] for p in o['pts']]; zs=[p[1] for p in o['pts']]
    ax.plot(xs,zs,color='#0051ba' if bf<0.5 else '#d62728',lw=2.2)
    ax.text(xs[len(xs)//2],zs[len(zs)//2],str(k),fontsize=7,color='k',bbox=dict(fc='w',ec='none',pad=0.5,alpha=.7))
ax.set_xlim(-4200,4200); ax.set_ylim(4600,-4400); ax.set_aspect('equal')
ax.set_title('R6 blue lines traced from the picture on the A1 ground map (blue = under 50 % bad ground, red = 50 % or more steep / water / rail / fenced)\nground: light green flat-rolling, pink steep D, grey very steep E, light blue sea, orange fenced, purple rail',fontsize=8)
plt.savefig('docs/r6_trace.png',dpi=100,bbox_inches='tight')

# --- report
lines_txt=[]
lines_txt.append('R6 TRACE (step G2a): the blue lines of docs/6 to 2 lane_plan.png as world polylines, checked on the A1 ground map')
lines_txt.append('pixel scale %.2f m / pixel; lines are DESIRE LINES (R10 sketch first, R3 smoothing comes later)'%(1/SX))
lines_txt.append('segments %d, total length %.1f km (8-lane roads 31.4 km)'%(len(out),tl/1000))
lines_txt.append('ground along the lines (m): '+', '.join('%s %d'%(k,v) for k,v in sorted(tot_cls.items(),key=lambda x:-x[1])))
lines_txt.append('legend: ~ sea, R rail, X fixed road, F fenced, A flat, B gentle, C rolling, D steep 15-25 %, E very steep >25 %')
lines_txt.append('')
lines_txt.append('id  length_m  crosses_8lane  bad_ground_share(D,E,sea,rail,fenced)')
for k,L,cnt,cross,bf in rep: lines_txt.append('%3d %8d %8d %14.0f %%'%(k,L,cross,bf*100))
open('docs/STEP_R6_G2A_OUTPUT.txt','w').write('\n'.join(lines_txt))
print('\n'.join(lines_txt))

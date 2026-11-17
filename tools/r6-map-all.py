#!/usr/bin/env python3
"""STEP MAP: ONE map with every road centreline: built roads of the game (8-lane M8 / J1 arms, M6-1, R6-2..R6-8 + slips), the designed R6 lines of G5 (L numbers, not built yet),
and the user's RED (R4) and GREEN (R2) hand lines of docs/6_to_2_lane_plan.png traced into world polylines (DESIRE LINES, not alignments: R10 / R3).
Run: python3 tools/r6-map-all.py   (project root; needs numpy, pillow, scikit-image, matplotlib; needs docs/map_game_roads.json from scripts/r6-map-export.ts)
Writes: docs/map_r4_r2_trace.json, docs/map_all_roads.json, docs/map_all_roads.png, docs/map_all_roads_{NW,NE,SW,SE}.png, docs/STEP_MAP_OUTPUT.txt"""
import json, math
import numpy as np
from PIL import Image
from skimage.morphology import skeletonize
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import to_rgb

REF='docs/6_to_2_lane_plan.png'; BASE='docs/plan_20_chords_2026-11-15.png'
a=np.array(Image.open(REF).convert('RGB')).astype(int); b=np.array(Image.open(BASE).convert('RGB')).astype(int)
diff=np.abs(a-b).sum(2)>60
SX,SZ=0.1116,0.1119; OX,OZ=396.2,504.8   # same fit as tools/r6-trace.py (two ring taps)
def w(px,py): return ((px-OX)/SX,(py-OZ)/SZ)

def trace(rgb, tol, minpx):
    mask=(np.abs(a-np.array(rgb)).sum(2)<tol)&diff
    mask[850:,500:]=False   # legend swatches
    sk=skeletonize(mask)
    ys,xs=np.nonzero(sk); pts=set(zip(xs.tolist(),ys.tolist()))
    def nb(p):
        x,y=p; return [(x+dx,y+dy) for dx in(-1,0,1) for dy in(-1,0,1) if (dx or dy) and (x+dx,y+dy) in pts]
    deg={p:len(nb(p)) for p in pts}; nodes={p for p in pts if deg[p]!=2}
    def walk(start,nxt):
        path=[start,nxt]; prev,cur=start,nxt
        while cur not in nodes:
            c=[q for q in nb(cur) if q!=prev and q not in path[-3:]]
            if not c: break
            prev,cur=cur,c[0]; path.append(cur)
            if len(path)>20000: break
        return path
    done=set(); paths=[]
    for n in nodes:
        for m in nb(n):
            if (n,m) in done: continue
            p=walk(n,m); done.add((p[-1],p[-2]) if len(p)>1 else (n,m)); done.add((n,m)); paths.append(p)
    used=set(q for p in paths for q in p)
    for p0 in pts-used:
        if p0 in used or not nb(p0): continue
        pth=walk(p0,nb(p0)[0]); used|=set(pth); paths.append(pth)
    def dp(P,eps):
        if len(P)<3: return P
        (x1,y1),(x2,y2)=P[0],P[-1]; L=math.hypot(x2-x1,y2-y1) or 1; dm,im=0,0
        for i in range(1,len(P)-1):
            d=abs((y2-y1)*P[i][0]-(x2-x1)*P[i][1]+x2*y1-y2*x1)/L
            if d>dm: dm,im=d,i
        if dm>eps: return dp(P[:im+1],eps)[:-1]+dp(P[im:],eps)
        return [P[0],P[-1]]
    out=[]
    for p in paths:
        if len(p)<minpx: continue
        W=[w(*q) for q in dp(p,3.0)]
        L=sum(math.dist(W[i],W[i+1]) for i in range(len(W)-1))
        if L<minpx*8.96*0.9: continue
        out.append(W)
    return out, int(mask.sum())

R4,m4=trace((227,24,45),70,12)    # about 110 m minimum
R2,m2=trace((0,180,75),70,12)
def L_of(W): return sum(math.dist(W[i],W[i+1]) for i in range(len(W)-1))
def order(lines):   # deterministic numbering: clockwise from north round the map centre (0, 300), then by distance
    def key(W):
        cx=sum(p[0] for p in W)/len(W); cz=sum(p[1] for p in W)/len(W)
        ang=(math.degrees(math.atan2(cx-0,-(cz-300)))+360)%360
        return (round(ang/10), math.hypot(cx,cz-300))
    return sorted(lines,key=key)
R4=order(R4); R2=order(R2)

# ground classes (A1, 50 m cells)
G=json.load(open('docs/a1_buildability.json')); rows=G['rows']; cell=G['cell']; half=G['half']
def cls(x,z):
    i=int((x+half)//cell); j=int((z+half)//cell)
    return rows[j][i] if 0<=i<200 and 0<=j<200 else '?'
def share(W):
    cnt={}; tot=0
    for i in range(len(W)-1):
        d=math.dist(W[i],W[i+1]); n=max(1,int(d//25))
        for t in range(n):
            f=(t+.5)/n; c=cls(W[i][0]+f*(W[i+1][0]-W[i][0]),W[i][1]+f*(W[i+1][1]-W[i][1])); cnt[c]=cnt.get(c,0)+d/n; tot+=d/n
    bad=sum(cnt.get(k,0) for k in 'ED~RF')
    return bad/max(tot,1), cnt

game=json.load(open('docs/map_game_roads.json'))
g5=json.load(open('docs/r6_g5_lines.json'))['lines']
BUILT={65:'R6-2',3:'R6-3',25:'R6-4',8:'R6-5',20:'R6-6A',21:'R6-6B',48:'R6-7',33:'R6-8'}
r6plan=[]
for l in g5:
    sid=l['src_id']
    if sid in BUILT: continue   # built: drawn from the game data
    r6plan.append({'id':'R6-L%d'%sid,'pts':l['pts']})

data={'note':'ALL road centrelines, world metres (x east, z south). built = game; r6_planned = G5 design lines not in the game; r4 / r2 = traced from the user picture (DESIRE LINES, R10; numbers are a clockwise order, not final).',
 'built':[{'name':r['name'],'lanes':r['lanes'],'pts':[[x,z] for x,z in zip(r['xs'],r['zs'])]} for r in game['roads']],
 'r6_planned':r6plan,
 'r4':[{'id':'R4-%d'%(i+1),'length_m':round(L_of(W)),'bad_share':round(share(W)[0],2),'pts':[[round(x,1),round(z,1)] for x,z in W]} for i,W in enumerate(R4)],
 'r2':[{'id':'R2-%d'%(i+1),'length_m':round(L_of(W)),'bad_share':round(share(W)[0],2),'pts':[[round(x,1),round(z,1)] for x,z in W]} for i,W in enumerate(R2)]}
json.dump({'lines':data['r4']+data['r2']},open('docs/map_r4_r2_trace.json','w'))
json.dump(data,open('docs/map_all_roads.json','w'))

# ---------- picture
col={'~':'#bcd9ee','R':'#d9d0ea','X':'#e0e0e0','F':'#fde7cf','A':'#f4f8ee','B':'#eaf3e0','C':'#e0eed3','D':'#f7dccf','E':'#e6e1dc','?':'#ffffff'}
img=np.zeros((200,200,3))
for j in range(200):
    for i in range(200): img[j,i]=to_rgb(col.get(rows[j][i],'#fff'))
def draw(ax,labels,xlim,ylim,fs):
    ax.imshow(img,extent=[-half,half,half,-half],interpolation='nearest')
    for e in game['rail']: ax.plot(e['xs'],e['zs'],color='#7b5aa6',lw=1.0,ls=(0,(4,2)),zorder=2)
    for W in R2: ax.plot([p[0] for p in W],[p[1] for p in W],color='#00b44b',lw=1.0,alpha=.9,zorder=3)
    for W in R4: ax.plot([p[0] for p in W],[p[1] for p in W],color='#e3182d',lw=1.7,zorder=4)
    for l in r6plan: ax.plot([p[0] for p in l['pts']],[p[1] for p in l['pts']],color='#0051ba',lw=2.0,ls=(0,(5,2)),zorder=5)
    for r in game['roads']:
        if r['name']=='M6-1': c,lw='#1f78c8',3.2
        elif r['name'].startswith('R6-8:'): c,lw='#ff7f0e',1.6
        elif r['name'].startswith('R6'): c,lw='#0051ba',3.0
        else: c,lw='#333333',3.6
        ax.plot(r['xs'],r['zs'],color=c,lw=lw,zorder=6)
    def lab(x,z,t,c,f):
        if xlim[0]<x<xlim[1] and min(ylim)<z<max(ylim): ax.text(x,z,t,fontsize=f,color=c,ha='center',va='center',zorder=9,bbox=dict(fc='white',ec=c,lw=.5,pad=.6,alpha=.85))
    mid=lambda P:P[len(P)//2]
    for r in game['roads']:
        if r['name'].startswith('R6-8:'): continue
        m=len(r['xs'])//2 if r['name'] not in('M8',) else len(r['xs'])//7
        lab(r['xs'][m],r['zs'][m],r['name'],'#222' if r['lanes']==8 else '#0051ba',fs)
    for l in r6plan: lab(*mid(l['pts']),l['id'],'#0051ba',fs-1)
    for i,W in enumerate(R4): lab(*mid(W),'R4-%d'%(i+1),'#e3182d',fs-1)
    if labels:
        for i,W in enumerate(R2): lab(*mid(W),'R2-%d'%(i+1),'#00863a',fs-2)
    ax.set_xlim(*xlim); ax.set_ylim(*ylim); ax.set_aspect('equal'); ax.grid(alpha=.25,lw=.4)
def save(name,xlim,ylim,labels,fs,size,title):
    fig,ax=plt.subplots(figsize=size); draw(ax,labels,xlim,ylim,fs); ax.set_title(title,fontsize=10); fig.savefig(name,dpi=110,bbox_inches='tight'); plt.close(fig)
T='black thick = 8-lane (built) | blue thick = R6 built | blue dashed = R6 designed (L = G5 line id, not built) | red = R4 (traced) | green = R2 (traced) | orange = slips | purple dashed = rail\nx east, z south (m). R4 / R2 = freehand DESIRE LINES from your sketch, not alignments'
save('docs/map_all_roads.png',(-3000,3800),(4600,-4400),False,6,(13,16),'ALL ROADS (R2 numbers only in the quadrant maps)\n'+T)
Q={'NW':((-3000,400),(300,-4400)),'NE':((300,3800),(300,-4400)),'SW':((-3000,400),(4600,300)),'SE':((300,3800),(4600,300))}
for k,(xl,yl) in Q.items(): save('docs/map_all_roads_%s.png'%k,xl,yl,True,7,(13,13*abs(yl[1]-yl[0])/abs(xl[1]-xl[0])),'ALL ROADS, %s quarter (with R2 numbers)\n'%k+T)

# ---------- report
tx=[]
tx.append('ALL ROADS MAP (STEP MAP): numbers. Headless; nothing in src/ changed; game NOT run.')
tx.append('BUILT in the game (%d roads): '%len(game['roads'])+', '.join('%s(%d lane)'%(r['name'],r['lanes']) for r in game['roads']))
tx.append('R6 DESIGNED, not built (G5 set minus the 8 built lines): %d lines, %.1f km: '%(len(r6plan),sum(L_of(l['pts']) for l in r6plan)/1000)+', '.join(l['id'] for l in r6plan))
tx.append('R4 traced (red): %d lines, %.1f km; R2 traced (green): %d lines, %.1f km'%(len(R4),sum(L_of(W) for W in R4)/1000,len(R2),sum(L_of(W) for W in R2)/1000))
tx.append('')
tx.append('id      length_m  bad_ground_share (steep D, very steep E, sea, rail, fenced; A1 50 m cells)')
for d in data['r4']+data['r2']: tx.append('%-6s %8d %10.0f %%'%(d['id'],d['length_m'],d['bad_share']*100))
tx.append('')
tx.append('CAVEATS: R4 / R2 are traced from a freehand picture (pixel scale 8.96 m, fit by two ring taps); where a red / green line is drawn under a blue / other line the skeleton has a gap or a split; lines shorter than about 110 m are dropped; numbers are a clockwise order, NOT final; no crossing (R1), radius (R3) or grade (R11) check was run on R4 / R2.')
open('docs/STEP_MAP_OUTPUT.txt','w').write('\n'.join(tx)); print('\n'.join(tx[:5])); print(len(tx))

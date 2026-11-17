"""MAP-2 part 1: retrace R4 (red) / R2 (green) from the sketch, join broken pieces, fill gaps, drop small spurs.
Imported by tools/r6-map2.py. Pixel scale 8.96 m (same two-tap fit as G2a / MAP)."""
import math, numpy as np
from PIL import Image
from skimage.morphology import skeletonize, binary_closing, disk
import networkx as nx

REF='docs/6_to_2_lane_plan.png'; BASE='docs/plan_20_chords_2026-11-15.png'
SX,SZ=0.1116,0.1119; OX,OZ=396.2,504.8
def w(px,py): return ((px-OX)/SX,(py-OZ)/SZ)
def dist(a,b): return math.hypot(a[0]-b[0],a[1]-b[1])
def plen(P): return sum(dist(P[i],P[i+1]) for i in range(len(P)-1))

def load_masks():
    a=np.array(Image.open(REF).convert('RGB')).astype(int); b=np.array(Image.open(BASE).convert('RGB')).astype(int)
    diff=np.abs(a-b).sum(2)>60
    out={}
    for k,rgb in (('R4',(227,24,45)),('R2',(0,180,75)),('R6',(0,81,186))):
        m=(np.abs(a-np.array(rgb)).sum(2)<70)&diff; m[850:,500:]=False; out[k]=m
    return out

def nb8(pts,p):
    x,y=p; return [(x+dx,y+dy) for dx in(-1,0,1) for dy in(-1,0,1) if (dx or dy) and (x+dx,y+dy) in pts]

def prune(sk,minpx,rounds=3):
    """remove end branches shorter than minpx pixels (spurs); repeat"""
    for _ in range(rounds):
        ys,xs=np.nonzero(sk); pts=set(zip(xs.tolist(),ys.tolist()))
        deg={p:len(nb8(pts,p)) for p in pts}
        ends=[p for p in pts if deg[p]==1]; killed=False
        for e in ends:
            path=[e]; prev=None; cur=e
            while True:
                c=[q for q in nb8(pts,cur) if q!=prev and q not in path]
                if len(c)!=1: break
                prev,cur=cur,c[0]; path.append(cur)
                if len(path)>minpx: break
            # stopped because of a junction (>=2 next) within minpx -> spur
            if len(path)<=minpx and len(nb8(pts,cur))>=3:
                for q in path[:-1]: sk[q[1],q[0]]=False
                killed=True
        sk=skeletonize(sk)
        if not killed: break
    return sk

def skeleton_lines(mask,minspur_px=13):
    m=binary_closing(mask,disk(2))
    sk=skeletonize(m); sk=prune(sk,minspur_px)
    ys,xs=np.nonzero(sk); pts=set(zip(xs.tolist(),ys.tolist()))
    deg={p:len(nb8(pts,p)) for p in pts}
    nodes={p for p in pts if deg[p]!=2}
    # cluster adjacent node pixels
    G=nx.Graph(); G.add_nodes_from(nodes)
    for p in nodes:
        for q in nb8(pts,p):
            if q in nodes: G.add_edge(p,q)
    comp={}; cent={}
    for i,c in enumerate(nx.connected_components(G)):
        for p in c: comp[p]=i
        cent[i]=(sum(p[0] for p in c)/len(c),sum(p[1] for p in c)/len(c))
    # edges between clusters = walks over degree-2 pixels
    legs=[]  # (clusterA, clusterB, [pixel path excluding cluster pixels])
    seen=set()
    for n in nodes:
        for m_ in nb8(pts,n):
            if m_ in nodes or m_ in seen: continue
            path=[m_]; seen.add(m_); prev,cur=n,m_
            while True:
                c=[q for q in nb8(pts,cur) if q!=prev and q not in nodes and q not in seen]
                nxt=[q for q in nb8(pts,cur) if q!=prev and q in nodes]
                if nxt and (not c or True):
                    end=comp[nxt[0]]; break
                if not c: end=None; break
                prev,cur=cur,c[0]; path.append(cur); seen.add(cur)
            legs.append((comp[n],end,path))
    # closed loops without any node
    rest=pts-seen-nodes; loops=[]
    while rest:
        p0=next(iter(rest)); path=[p0]; rest.discard(p0); prev=None; cur=p0
        while True:
            c=[q for q in nb8(pts,cur) if q in rest]
            if not c: break
            cur=c[0]; path.append(cur); rest.discard(cur)
        if len(path)>6: loops.append(path)
    return legs,cent,loops

def dirvec(P,k=6):
    k=min(k,len(P)-1); a=P[0]; b=P[k]; l=math.hypot(b[0]-a[0],b[1]-a[1]) or 1
    return ((b[0]-a[0])/l,(b[1]-a[1])/l)

def build_lines(legs,cent,loops):
    """pair legs at every cluster (through lines), return list of pixel polylines"""
    inc={}   # cluster -> list of (leg index, which end)
    for i,(a,b,p) in enumerate(legs):
        inc.setdefault(a,[]).append((i,0))
        if b is not None: inc.setdefault(b,[]).append((i,1))
    pair={}  # (leg,end)->(leg,end)
    for cl,L in inc.items():
        def out(i,e):
            p=legs[i][2]; P=p if e==0 else p[::-1]
            # direction away from the cluster centre
            full=[cent[cl]]+list(P); return dirvec(full,min(8,len(full)-1))
        cand=[]
        for x in range(len(L)):
            for y in range(x+1,len(L)):
                d1=out(*L[x]); d2=out(*L[y]); ang=math.degrees(math.acos(max(-1,min(1,-(d1[0]*d2[0]+d1[1]*d2[1])))))  # 0 = straight through
                cand.append((ang,x,y))
        cand.sort(); used=set()
        for ang,x,y in cand:
            if x in used or y in used or ang>40: continue     # only near-straight continuations are joined
            used.add(x); used.add(y); pair[L[x]]=L[y]; pair[L[y]]=L[x]
    # chains
    visited=set(); lines=[]
    def walk_from(i,e):
        """start at leg i entering from end e (e = end index where we begin), follow pairs"""
        pts=[]; cur=(i,e)
        while True:
            li,en=cur; a,b,p=legs[li]; visited.add(li)
            seg=p if en==0 else p[::-1]
            cl_in=a if en==0 else b
            if not pts and cl_in is not None: pts.append(cent[cl_in])
            pts+=list(seg)
            cl_out=b if en==0 else a
            if cl_out is None: return pts
            pts.append(cent[cl_out])
            nxt=pair.get((li,1-en))
            if nxt is None: return pts
            if nxt[0] in visited: return pts
            cur=(nxt[0],nxt[1])
    # start legs: those whose start end has no partner (chain ends)
    for i,(a,b,p) in enumerate(legs):
        if i in visited: continue
        if (i,0) not in pair: lines.append(walk_from(i,0))
        elif (i,1) not in pair: lines.append(walk_from(i,1))
    for i,(a,b,p) in enumerate(legs):   # leftovers = chains that close on themselves
        if i not in visited: lines.append(walk_from(i,0))
    lines+=loops
    return lines

def resample(P,step=10.0):
    P=np.array(P,float); d=np.r_[0,np.cumsum(np.hypot(*np.diff(P,axis=0).T))]
    if d[-1]<step: return P
    s=np.arange(0,d[-1],step); s=np.r_[s,d[-1]]
    return np.c_[np.interp(s,d,P[:,0]),np.interp(s,d,P[:,1])]

def light_smooth(P,sig=2.0):
    """gaussian smoothing, ends fixed (removes the 9 m pixel staircase only)"""
    if len(P)<5: return P
    from scipy.ndimage import gaussian_filter1d
    Q=P.copy(); Q[:,0]=gaussian_filter1d(P[:,0],sig,mode='nearest'); Q[:,1]=gaussian_filter1d(P[:,1],sig,mode='nearest')
    k=int(3*sig)
    for i in range(min(k,len(P)//2)):   # blend towards fixed ends
        t=i/k; Q[i]=P[0]*(1-t)+Q[i]*t if i<k else Q[i]; Q[-1-i]=P[-1]*(1-t)+Q[-1-i]*t
    Q[0]=P[0]; Q[-1]=P[-1]; return Q

def trace_class(mask,minspur_m=120):
    legs,cent,loops=skeleton_lines(mask,int(minspur_m/8.96))
    px=build_lines(legs,cent,loops)
    out=[]
    for p in px:
        if len(p)<4: continue
        W=np.array([w(*q) for q in p])
        W=resample(W,10.0); W=light_smooth(W,2.0)
        if plen(W)<minspur_m: continue
        out.append(W)
    return out

def heading_out(P,end,k=6):
    """unit vector pointing out of the line at its start (end=0) or end (end=1)"""
    if end==0: a=P[min(k,len(P)-1)]; b=P[0]
    else: a=P[max(len(P)-1-k,0)]; b=P[-1]
    v=(b[0]-a[0],b[1]-a[1]); l=math.hypot(*v) or 1; return (v[0]/l,v[1]/l)

def join_gaps(lines,maxgap=90.0,maxang=40.0):
    """join free ends of the SAME class if they face each other (a broken line)"""
    lines=[np.array(l) for l in lines]
    changed=True; njoin=0
    while changed:
        changed=False; best=None
        for i in range(len(lines)):
            for ei in (0,1):
                pi=lines[i][0 if ei==0 else -1]; hi=heading_out(lines[i],ei)
                for j in range(i+1 if True else 0,len(lines)):
                    for ej in (0,1):
                        pj=lines[j][0 if ej==0 else -1]; d=dist(pi,pj)
                        if i==j or d>maxgap or d<0.01: continue
                        v=((pj[0]-pi[0])/d,(pj[1]-pi[1])/d); hj=heading_out(lines[j],ej)
                        a1=math.degrees(math.acos(max(-1,min(1,hi[0]*v[0]+hi[1]*v[1]))))
                        a2=math.degrees(math.acos(max(-1,min(1,hj[0]*(-v[0])+hj[1]*(-v[1])))))
                        if a1<=maxang and a2<=maxang and (best is None or d<best[0]): best=(d,i,ei,j,ej)
        if best:
            d,i,ei,j,ej=best; A=lines[i] if ei==1 else lines[i][::-1]; B=lines[j] if ej==0 else lines[j][::-1]
            lines[i]=np.vstack([A,B]); lines.pop(j); changed=True; njoin+=1
    return lines,njoin

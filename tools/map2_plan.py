"""MAP-2 part 4: touch-extension, intersections, junction placeholders J-xx, pieces (R1)."""
import math, numpy as np
from scipy.spatial import cKDTree
from map2_net import *

def extend_ends(lines,maxd=70.0,maxang=55.0,over=1.5):
    """free ends of unbuilt lines reach the nearest line of the same or a bigger class in front of them (gap fill / T touch)"""
    n=0; rep=[]
    for L in lines:
        if L.built: continue
        for e in (0,1):
            if getattr(L,'tapname',[None,None])[e] is not None: continue
            p=L.pts[0] if e==0 else L.pts[-1]; h=heading_out(L.pts,e)
            best=None
            for M in lines:
                if M is L or M.src==L.src: continue
                if M.cls<L.cls: continue
                c,q,d=project(M.pts,p)
                if d>maxd or d<0.5: continue
                v=(q-p)/d; ang=math.degrees(math.acos(max(-1,min(1,float(h@v)))))
                if ang<=maxang and (best is None or d<best[0]): best=(d,q,M.id,ang)
            if best:
                d,q,mid,ang=best; v=(q-p)/d; tgt=q+v*over
                L.pts=np.vstack([L.pts,tgt]) if e==1 else np.vstack([tgt,L.pts]); n+=1; rep.append((L.id,e,round(d),mid))
    return n,rep

def build_nodes(lines,tapnodes):
    """returns nodes (clusters) and the per-line cut lists"""
    ev=[]  # (xy, [(li,s,mode)])
    for i in range(len(lines)):
        for j in range(i+1,len(lines)):
            A=lines[i]; B=lines[j]
            if A.built and B.built: continue
            if A.src==B.src: continue
            for sa,sb,pt in seg_inter(A.pts,B.pts):
                ra,rb=A.cls,B.cls
                def mode(me,other,rme,roth):
                    if me.built: return 'through'
                    if rme<roth: return 'split'
                    if rme==roth: return 'split' if not other.built else 'split'
                    return 'through'
                ev.append((pt,[(i,sa,mode(A,B,ra,rb)),(j,sb,mode(B,A,rb,ra))],'X' if ra==rb else 'T'))
    for t in tapnodes: ev.append((t['xy'],t['members'],'TAP'))
    if not ev: return [],{}
    XY=np.array([e[0] for e in ev]); tree=cKDTree(XY); par=list(range(len(ev)))
    def f(x):
        while par[x]!=x: par[x]=par[par[x]]; x=par[x]
        return x
    for a,b in tree.query_pairs(60.0): par[f(a)]=f(b)
    cl={}
    for k in range(len(ev)): cl.setdefault(f(k),[]).append(k)
    nodes=[]
    for ks in cl.values():
        mem=[m for k in ks for m in ev[k][1]]; kinds={ev[k][2] for k in ks}
        tap=[ev[k] for k in ks if ev[k][2]=='TAP']
        xy=tap[0][0] if tap else XY[ks].mean(0)
        nodes.append(dict(xy=np.array(xy),members=mem,kinds=kinds,tap=tap[0][3] if tap and len(tap[0])>3 else None))
    return nodes

def make_pieces(lines,nodes,minstub=8.0):
    cuts={}  # line index -> list of (s,node index,mode)
    for k,nd in enumerate(nodes):
        per={}
        for li,s,m in nd['members']:
            per.setdefault(li,[]).append((s,m))
        for li,lst in per.items():
            s=float(np.mean([a for a,_ in lst])); m='split' if any(x=='split' or x=='end' for _,x in lst) else 'through'
            # re-project the node onto the line: cut at the chainage nearest to the node
            c,p,d=project(lines[li].pts,nd['xy']); cuts.setdefault(li,[]).append((c,k,m,d))
    pieces=[]
    for li,L in enumerate(lines):
        Ls=plen(L.pts); cs=sorted(cuts.get(li,[]))
        bounds=[(0.0,None)]; through=[]
        for s,k,m,d in cs:
            if s<minstub: bounds[0]=(0.0,k); continue
            if s>Ls-minstub: bounds.append((Ls,k)); continue
            if m=='split': bounds.append((s,k))
            else: through.append((s,k))
        if bounds[-1][0]!=Ls: bounds.append((Ls,None))
        for a,b in zip(bounds[:-1],bounds[1:]):
            if b[0]-a[0]<minstub: continue
            P=sub(L.pts,a[0],b[0]); 
            Q=dict(line=li,id=L.id,cls=L.cls,built=L.built,src=L.src,pts=P,n0=a[1],n1=b[1],s0=a[0],s1=b[0],
                   thru=[k for s,k in through if a[0]<s<b[0]],old=getattr(L,'old',None),oldL=getattr(L,'oldL',None),raw=getattr(L,'raw',None),fit=getattr(L,'fit',None))
            pieces.append(Q)
    return pieces

def snap_ends(pieces,nodes,blend=100.0):
    """end of a piece = node position; the shift (<= 30 m) is faded out over `blend` m so there is no kink"""
    for Q in pieces:
        if Q['built']: continue
        for e,k in ((0,Q['n0']),(1,Q['n1'])):
            if k is None: continue
            P=Q['pts']; tgt=nodes[k]['xy']; cur=P[0] if e==0 else P[-1]; sh=tgt-cur
            if math.hypot(*sh)<0.05: continue
            c=chain(P); dd=c if e==0 else c[-1]-c
            w=np.clip(1-dd/blend,0,1)**2; P=P+w[:,None]*sh; Q['pts']=P
    return pieces

def node_deg(pieces):
    cnt={}
    for Q in pieces:
        for k in (Q['n0'],Q['n1']):
            if k is not None: cnt[k]=cnt.get(k,0)+1
        for k in Q['thru']: cnt[k]=cnt.get(k,0)+2
    return cnt

def remove_spurs(pieces,nodes,minlen=110.0):
    """drop unbuilt pieces with a free end (no node, or a node that only this piece uses) and length < minlen; repeat"""
    dropped=[]
    while True:
        cnt=node_deg(pieces); kill=[]
        for Q in pieces:
            if Q['built']: continue
            fr=[(Q['n0'] is None) or cnt.get(Q['n0'],0)<=1,(Q['n1'] is None) or cnt.get(Q['n1'],0)<=1]
            ln=plen(Q['pts'])
            if (fr[0] or fr[1]) and ln<minlen: kill.append(Q)
            elif fr[0] and fr[1] and ln<2*minlen: kill.append(Q)
        if not kill: break
        ids={id(q) for q in kill}
        dropped+=kill; pieces=[q for q in pieces if id(q) not in ids]
    return pieces,dropped

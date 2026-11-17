"""MAP-2 part 3: network logic: clip at 8-lane roads, taps (R5/R6), planarize (R1), junction placeholders, spur removal."""
import math, numpy as np
from scipy.spatial import cKDTree
RANK={8:8,6:6,4:4,2:2}
J1C=(-87.0,-277.0)
def dist(a,b): return math.hypot(a[0]-b[0],a[1]-b[1])
def dense(P,step=5.0):
    P=np.asarray(P,float); d=np.r_[0,np.cumsum(np.hypot(*np.diff(P,axis=0).T))]
    if d[-1]<=0: return P,d
    s=np.arange(0,d[-1],step); s=np.r_[s,d[-1]]
    return np.c_[np.interp(s,d,P[:,0]),np.interp(s,d,P[:,1])],s
def plen(P): return float(np.hypot(*np.diff(np.asarray(P,float),axis=0).T).sum()) if len(P)>1 else 0.0
def chain(P):
    P=np.asarray(P,float); return np.r_[0,np.cumsum(np.hypot(*np.diff(P,axis=0).T))]
def point_at(P,s):
    c=chain(P); s=min(max(s,0),c[-1]); return np.array([np.interp(s,c,P[:,0]),np.interp(s,c,P[:,1])])
def sub(P,s0,s1):
    """part of polyline between chainages s0<s1"""
    c=chain(P); m=(c>s0+1e-6)&(c<s1-1e-6)
    return np.vstack([point_at(P,s0),np.asarray(P)[m],point_at(P,s1)])
def project(P,q):
    """nearest point of polyline P to q -> (chainage, point, distance)"""
    P=np.asarray(P,float); a=P[:-1]; b=P[1:]; d=b-a; L2=(d**2).sum(1); L2[L2==0]=1e-9
    t=np.clip(((q[0]-a[:,0])*d[:,0]+(q[1]-a[:,1])*d[:,1])/L2,0,1); pr=a+d*t[:,None]
    dd=np.hypot(pr[:,0]-q[0],pr[:,1]-q[1]); k=int(np.argmin(dd)); c=chain(P)
    return float(c[k]+t[k]*math.sqrt(L2[k])),pr[k],float(dd[k])
def seg_inter(A,B):
    """all proper intersections of polylines A,B -> list of (sA,sB,point)"""
    A=np.asarray(A,float); B=np.asarray(B,float)
    if (A[:,0].max()<B[:,0].min() or B[:,0].max()<A[:,0].min() or A[:,1].max()<B[:,1].min() or B[:,1].max()<A[:,1].min()): return []
    ca=chain(A); cb=chain(B)
    a0=A[:-1][:,None,:]; a1=A[1:][:,None,:]; b0=B[:-1][None,:,:]; b1=B[1:][None,:,:]
    r=a1-a0; s=b1-b0; den=r[...,0]*s[...,1]-r[...,1]*s[...,0]
    qp=b0-a0
    with np.errstate(divide='ignore',invalid='ignore'):
        t=(qp[...,0]*s[...,1]-qp[...,1]*s[...,0])/den; u=(qp[...,0]*r[...,1]-qp[...,1]*r[...,0])/den
    ok=(np.abs(den)>1e-9)&(t>=0)&(t<=1)&(u>=0)&(u<=1)
    out=[]
    for i,j in zip(*np.nonzero(ok)):
        la=math.hypot(*(A[i+1]-A[i])); lb=math.hypot(*(B[j+1]-B[j]))
        out.append((float(ca[i]+t[i,j]*la),float(cb[j]+u[i,j]*lb),A[i]+t[i,j]*(A[i+1]-A[i])))
    return out
def heading_out(P,end,k=4):
    P=np.asarray(P,float)
    if end==0: a=P[min(k,len(P)-1)]; b=P[0]
    else: a=P[max(len(P)-1-k,0)]; b=P[-1]
    v=b-a; l=math.hypot(*v) or 1; return v/l

class Line:
    def __init__(s,id,cls,pts,built=False,src=None,**kw):
        s.id=id; s.cls=cls; s.pts=np.asarray(pts,float); s.built=built; s.src=src or id; s.__dict__.update(kw)

def clip_at_8(lines,eight,buf=45.0):
    """cut every unbuilt line outside the buf-m strip of the 8-lane roads. returns pieces + ring-end records"""
    ep=[]; 
    for r in eight:
        d,_=dense(r['pts'],5.0)
        for i,p in enumerate(d): ep.append((p[0],p[1],r['name']))
    XY=np.array([[e[0],e[1]] for e in ep]); tree=cKDTree(XY); names=[e[2] for e in ep]
    pieces=[]; ends=[]
    for L in lines:
        if L.built: pieces.append(L); continue
        D,s=dense(L.pts,5.0); dd,ii=tree.query(D); inside=dd<buf
        runs=[]; i=0; n=len(D)
        while i<n:
            j=i
            while j<n and inside[j]==inside[i]: j+=1
            runs.append((inside[i],i,j)); i=j
        prev_in=None
        for k,(ins,i0,i1) in enumerate(runs):
            if ins: continue
            a=max(i0-1,0) if k>0 else i0; b=min(i1,n-1) if k<len(runs)-1 else i1-1
            P=D[a:b+1]
            if len(P)<2: continue
            piece=Line(L.id,L.cls,P,False,L.src,part=len(pieces),old=getattr(L,'old',None),oldL=getattr(L,'oldL',None),raw=getattr(L,'raw',None),fit=getattr(L,'fit',None)); piece.ring=[None,None]
            if k>0 and runs[k-1][0]:   # start touches the strip
                ii0=ii[i0-1] if i0>0 else ii[i0]; piece.ring[0]=(XY[ii0],names[ii0])
            if k<len(runs)-1 and runs[k+1][0]:
                ii1=ii[i1]; piece.ring[1]=(XY[ii1],names[ii1])
            pieces.append(piece)
    return pieces

def along(eight,name,q):
    r=[x for x in eight if x['name']==name][0]; c,p,d=project(r['pts'],q); return c,r

def choose_taps(pieces,eight,existing,spacing=1600.0,j1min=900.0,bridge=170.0):
    """groups of ring ends -> accepted taps (R5 / R6). existing = list of dict(name,xy). returns taps list, rejected list"""
    ends=[]
    for P in pieces:
        if P.built: continue
        for e in (0,1):
            if P.ring[e]: ends.append((P,e,P.ring[e][0],P.ring[e][1]))
    # group ends of the SAME road that are within `bridge` m along the road and belong to the same source line or are close
    groups=[]; used=set()
    for i,(P,e,xy,nm) in enumerate(ends):
        if i in used: continue
        g=[i]; used.add(i)
        for j in range(i+1,len(ends)):
            if j in used: continue
            P2,e2,xy2,nm2=ends[j]
            if nm2==nm and dist(xy,xy2)<=bridge and (P2.src==P.src): g.append(j); used.add(j)
        groups.append(g)
    ex=[]
    for x in existing:
        best=None
        for r in eight:
            c,p,d=project(r['pts'],x['xy'])
            if d<60 and (best is None or d<best[0]): best=(d,r['name'],c)
        ex.append(dict(name=x['name'],xy=np.array(x['xy']),road=best[1] if best else None,ch=best[2] if best else None))
    rl={r['name']:chain(r['pts'])[-1] for r in eight}
    def spacing_ok(xy,road,ch,others):
        if dist(xy,J1C)<j1min: return False,'J1 plaza %.0f m < %.0f'%(dist(xy,J1C),j1min)
        for o in others:
            if o['road']==road and o['ch'] is not None:
                d=abs(ch-o['ch'])
                if road=='M8': d=min(d,rl[road]-d)
            else: d=dist(xy,o['xy'])
            if d<spacing: return False,'%.0f m from %s'%(d,o['name'])
        return True,''
    cands=[]
    for g in groups:
        pts=np.array([ends[i][2] for i in g]); xy=pts.mean(0); nm=ends[g[0]][3]
        ch,r=along(eight,nm,xy); cl=max(ends[i][0].cls for i in g); ln=sum(plen(ends[i][0].pts) for i in g)
        cands.append(dict(g=g,xy=xy,road=nm,ch=ch,cls=cl,len=ln,two=len(g)>1))
    taps=[]; rej=[]; acc=list(ex)
    # snap to an existing tap within 70 m first
    rest=[]
    for c in cands:
        snap=None
        for o in ex:
            if o['road']==c['road'] and dist(c['xy'],o['xy'])<=70 or dist(c['xy'],o['xy'])<=70: snap=o; break
        if snap is not None and c['cls']>=4: taps.append(dict(c,xy=snap['xy'],name=snap['name'],existing=True)); continue
        rest.append(c)
    rest.sort(key=lambda c:(-c['cls'],-int(c['two']),-c['len']))
    for c in rest:
        if c['cls']<4: rej.append(dict(c,why='R2 does not join an 8-lane road (collector joins R4 / R6)')); continue
        ok,why=spacing_ok(c['xy'],c['road'],c['ch'],acc)
        if ok:
            o=dict(name='new',xy=c['xy'],road=c['road'],ch=c['ch']); acc.append(o); taps.append(dict(c,name='new',existing=False))
        else: rej.append(dict(c,why=why))
    return taps,rej,ends,ex

def apply_taps(pieces,ends,taps,rej,trim=90.0):
    """extend accepted ends to the tap point, trim rejected ends to `trim` m from the 8-lane road"""
    acc_ends={}
    for t in taps:
        for i in t['g']: acc_ends[i]=t
    out=[]
    for i,(P,e,xy,nm) in enumerate(ends):
        if i in acc_ends:
            t=acc_ends[i]; q=t['xy']
            raw=np.vstack([P.pts,q]) if e==1 else np.vstack([q,P.pts])
            import map2_trace as TR, map2_align as ALN
            f=ALN.fit_line(TR.resample(raw,10.0),P.cls); P.pts=f['pts']; P.fit=f
            P.tapname=getattr(P,'tapname',[None,None]); P.tapname[e]=t
        else:
            # cut so that the end is `trim` m from the road: move the end back along the line
            D=P.pts; 
            keep=[]
            cs=chain(D)
            dd=np.hypot(D[:,0]-xy[0],D[:,1]-xy[1])
            if e==1:
                m=np.nonzero(dd>=trim)[0]; 
                if len(m)==0: P.pts=D[:2]*0+D[:1]; P.dead=True; continue
                k=m[-1]; P.pts=D[:k+1]
            else:
                m=np.nonzero(dd>=trim)[0]
                if len(m)==0: P.dead=True; continue
                k=m[0]; P.pts=D[k:]
    return [P for P in pieces if not getattr(P,'dead',False) and len(P.pts)>=2]

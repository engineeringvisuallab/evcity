"""MAP-2 part 2: fit straight - spiral - arc - spiral - straight (R3, 3.12) to a traced desire line.
Class numbers are MY numbers (printed in the report): V = design speed, Rmin = minimum radius, Rdes = wanted radius, Ls = spiral length."""
import math, numpy as np
from scipy.spatial import cKDTree
PARAM={6:dict(V=80,Rmin=229,Rdes=320,Ls=80),4:dict(V=60,Rmin=130,Rdes=200,Ls=50),2:dict(V=50,Rmin=70,Rdes=110,Ls=30)}

def _dp(P,i0,i1,eps,keep):
    if i1<=i0+1: return
    a=P[i0]; b=P[i1]; d=b-a; L=np.hypot(*d) or 1.0
    seg=P[i0+1:i1]; dd=np.abs(d[0]*(seg[:,1]-a[1])-d[1]*(seg[:,0]-a[0]))/L
    k=int(np.argmax(dd))
    if dd[k]>eps: m=i0+1+k; keep.add(m); _dp(P,i0,m,eps,keep); _dp(P,m,i1,eps,keep)

def tangent_len(R,Ls,D):
    """R, Ls m, D deflection rad -> (Ts, theta_s, R_used)"""
    R=max(R,Ls/max(D,1e-6))
    p=Ls*Ls/(24*R); k=Ls/2-Ls**3/(240*R*R); ths=Ls/(2*R)
    return (R+p)*math.tan(D/2)+k,ths,R

def pis_geometry(pis):
    """directions, lengths, deflections (signed rad) of a tangent polygon"""
    P=np.array(pis); d=np.diff(P,axis=0); L=np.hypot(d[:,0],d[:,1]); u=d/L[:,None]
    ang=np.arctan2(u[:,1],u[:,0]); D=np.diff(ang); D=(D+np.pi)%(2*np.pi)-np.pi
    return P,u,L,D

def solve_radii(pis,par,level):
    """choose R per interior PI. returns list of (R,Ts,ths,Rused) or None if infeasible. level: 0 strict,1 medium,2 minimum"""
    P,u,L,D=pis_geometry(pis); n=len(D); V=par['V']; Ls=par['Ls']
    need_same=[6*V,2*V,0][level]; need_rev=[2*V,V,0][level]
    R=[par['Rdes']]*n
    for _ in range(40):
        T=[tangent_len(R[i],Ls,abs(D[i])) for i in range(n)]
        bad=None
        for i in range(n+1):            # segment i between PI i and i+1 (index in P): tangents of PI i (as interior idx i-1) and PI i+1
            t0=T[i-1][0] if i>=1 else 0.0; t1=T[i][0] if i<n else 0.0
            need=0.0
            if 1<=i<n:
                need=need_rev if D[i-1]*D[i]<0 else need_same
            if t0+t1+need>L[i]-0.01:
                bad=(i,t0,t1); break
        if bad is None: return [(R[i],)+T[i] for i in range(n)]
        i,t0,t1=bad; cand=[j for j in (i-1,i) if 0<=j<n and R[j]>par['Rmin']+1e-6]
        if not cand: return None
        j=max(cand,key=lambda j:(T[j][0])); R[j]=max(par['Rmin'],R[j]*0.85)
    return None

def curve_pts(P0,u0,Dsigned,R,Ls,step=0.5):
    """points of spiral-arc-spiral starting at P0 heading u0 turning by Dsigned (rad)"""
    D=abs(Dsigned); sg=1 if Dsigned>0 else -1
    ths=Ls/(2*R); La=max(0.0,R*(D-2*ths)); Lc=2*Ls+La
    n=max(2,int(math.ceil(Lc/step))); s=np.linspace(0,Lc,n+1); ds=Lc/n
    k=np.where(s<Ls,s/(Ls*R),np.where(s<Ls+La,1/R,(Lc-s)/(Ls*R)))
    # scale so that total turning = D exactly
    tot=np.trapezoid(k,s); k=k*(D/tot) if tot>0 else k
    th=np.r_[0,np.cumsum((k[1:]+k[:-1])/2*ds)]
    h0=math.atan2(u0[1],u0[0]); h=h0+sg*th
    x=np.r_[0,np.cumsum(np.cos((h[1:]+h[:-1])/2)*ds)]; y=np.r_[0,np.cumsum(np.sin((h[1:]+h[:-1])/2)*ds)]
    return np.c_[P0[0]+x,P0[1]+y],Lc

def build(pis,rad):
    """full centreline from PIs + radii"""
    P,u,L,D=pis_geometry(pis); out=[P[0]]; segs=[]
    for i in range(len(D)):
        R,Ts,ths,Ru=rad[i]
        cs=P[i+1]-u[i]*Ts
        out.append(cs)
        pts,Lc=curve_pts(cs,u[i],D[i],Ru,par_Ls[0])
        out.extend(pts[1:]); segs.append((len(out),Ru,Lc))
    out.append(P[-1])
    A=np.array(out); 
    return A

par_Ls=[30]

def densify(A,step=5.0):
    d=np.r_[0,np.cumsum(np.hypot(*np.diff(A,axis=0).T))]
    s=np.arange(0,d[-1],step); s=np.r_[s,d[-1]]
    return np.c_[np.interp(s,d,A[:,0]),np.interp(s,d,A[:,1])]

def hausdorff(A,B):
    a=densify(A); b=densify(B)
    d1=cKDTree(b).query(a)[0].max(); d2=cKDTree(a).query(b)[0].max(); return max(d1,d2)

def min_radius(A):
    """min radius from curvature of a 6 m resampled line (3-point circle)"""
    B=densify(A,6.0); 
    if len(B)<5: return 1e9
    p0,p1,p2=B[:-2],B[1:-1],B[2:]
    a=np.hypot(*(p1-p0).T); b=np.hypot(*(p2-p1).T); c=np.hypot(*(p2-p0).T)
    cr=np.abs((p1[:,0]-p0[:,0])*(p2[:,1]-p0[:,1])-(p1[:,1]-p0[:,1])*(p2[:,0]-p0[:,0]))
    with np.errstate(divide='ignore',invalid='ignore'): R=a*b*c/(2*cr)
    R=R[np.isfinite(R)]; return float(R.min()) if len(R) else 1e9

def fit_line(P,cls,maxdev=70.0,eps_list=(12,18,26,36,48,60)):
    """returns dict(pts,pis,R list,level,dev,minR,ncurves,ok)"""
    par=PARAM[cls]; par_Ls[0]=par['Ls']; P=np.asarray(P,float)
    best=None
    for level in (0,1,2):
        for eps in eps_list:
            keep={0,len(P)-1}; _dp(P,0,len(P)-1,eps,keep); idx=sorted(keep)
            pis=[P[i] for i in idx]
            # drop almost straight PIs, merge until solvable
            for _ in range(60):
                if len(pis)<3: rad=[]; break
                _,_,_,D=pis_geometry(pis)
                small=[i for i in range(len(D)) if abs(D[i])<math.radians(2.5)]
                if small:
                    del pis[small[0]+1]; continue
                rad=solve_radii(pis,par,level)
                if rad is not None: break
                # not solvable: remove the interior PI with the smallest deflection
                k=int(np.argmin(np.abs(D))); del pis[k+1]
            else: rad=None
            if rad is None: continue
            A=build(pis,rad) if len(pis)>=3 else np.array(pis)
            dev=hausdorff(A,P)
            mr=min_radius(A) if len(pis)>=3 else 1e9
            cand=dict(pts=A,pis=[list(map(float,p)) for p in pis],rad=[(float(r[0]),float(r[3])) for r in rad],level=level,dev=float(dev),minR=float(mr),eps=eps,ncurves=len(rad))
            if best is None or dev<best['dev']-1e-6: best=cand
            if dev<=maxdev:
                cand['ok']=True; return cand
        # no eps at this level within maxdev: try next (looser) level
    if best is None:   # straight chord fallback (keeps ends)
        A=np.array([P[0],P[-1]]); best=dict(pts=A,pis=[list(P[0]),list(P[-1])],rad=[],level=3,dev=float(hausdorff(A,P)),minR=1e9,eps=0,ncurves=0)
    best['ok']=best['dev']<=maxdev; return best

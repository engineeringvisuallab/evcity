# J0 concept picture OPTION A (not a game render, sizes ASSUMED): ring stays on its embankment (9.7 m high) and crosses on a bridge over a ROUNDABOUT at natural ground; R6 / R4 meet the roundabout; 4 ramps climb to the ring from both sides.
import math, random
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib.colors import to_rgb
random.seed(3)
W,H=1900,950; CAM=(-215.,-190.,55.); TGT=(10.,5.,6.); F=1150.
fx,fy,fz=[TGT[i]-CAM[i] for i in range(3)]; n=math.sqrt(fx*fx+fy*fy+fz*fz); f=(fx/n,fy/n,fz/n)
r=(f[1],-f[0],0.); rn=math.hypot(r[0],r[1]); r=(r[0]/rn,r[1]/rn,0.)
up=(r[1]*f[2]-r[2]*f[1], r[2]*f[0]-r[0]*f[2], r[0]*f[1]-r[1]*f[0])
def proj(p):
    q=(p[0]-CAM[0],p[1]-CAM[1],p[2]-CAM[2]); d=q[0]*f[0]+q[1]*f[1]+q[2]*f[2]
    if d<5: return None
    return (W/2+F*(q[0]*r[0]+q[1]*r[1])/d, H/2-F*(q[0]*up[0]+q[1]*up[1]+q[2]*up[2])/d)
HAZE=to_rgb('#d0d3d0')
faces=[]
def face(layer,pts,col):
    c=[sum(p[i] for p in pts)/len(pts) for i in range(3)]; faces.append((layer,math.dist(c,CAM),pts,col))
def quad(l,u0,u1,v0,v1,z0,col,z1=None):
    z1=z0 if z1 is None else z1; face(l,[(u0,v0,z0),(u1,v0,z1),(u1,v1,z1),(u0,v1,z0)],col)
ZR=9.7; RO,RI=62.,48.
for u in range(-700,701,50):
    for v in range(-500,501,50): quad(0,u,u+50,v,v+50,0,'#9db07a' if ((u+v)//50)%2 else '#a8b686')
# embankment (fill, slope 1:2) both sides + deck outside the bridge
for u in range(-700,700,25):
    if abs(u+12.5)<100: continue
    quad(2,u,u+25,-22.1,22.1,ZR,'#3f3f42')                                         # ring deck on fill
    for s in(-1,1):
        quad(2,u,u+25,s*22.1,s*(22.1+2*ZR),ZR,'#a98f6b',z1=None) if False else face(2,[(u,s*22.1,ZR),(u+25,s*22.1,ZR),(u+25,s*(22.1+2*ZR),0),(u,s*(22.1+2*ZR),0)],'#b59a73')
    for k in(-16,-8,8,16): quad(2,u,u+12,k-.1,k+.1,ZR+.03,'#f2f2f2')
    quad(2,u,u+25,-.6,.6,ZR+.05,'#9a9a95')
# bridge deck + piers over the roundabout (u -100 .. 100)
for u in range(-100,100,25): quad(3,u,u+25,-22.1,22.1,ZR,'#4a4a4d'); quad(3,u,u+25,-22.1,-21.4,ZR+.9,'#cfcac0'); quad(3,u,u+25,21.4,22.1,ZR+.9,'#cfcac0')
for u in range(-100,100,25):
    for s in(-1,1): face(3,[(u,s*22.1,ZR-1.8),(u+25,s*22.1,ZR-1.8),(u+25,s*22.1,ZR),(u,s*22.1,ZR)],'#b8b2a4')
for pu in(-100,-35,35,100):
    for pv in(-19,-6,6,19): face(3,[(pu-1.6,pv,0),(pu+1.6,pv,0),(pu+1.6,pv,ZR-1.8),(pu-1.6,pv,ZR-1.8)],'#a9a396')
# roundabout (ground) + arms
N=40
for i in range(N):
    a0=2*math.pi*i/N; a1=2*math.pi*(i+1)/N; P=lambda rr,a:(rr*math.cos(a),rr*math.sin(a))
    face(1,[P(RI,a0)+(0.3,),P(RO,a0)+(0.3,),P(RO,a1)+(0.3,),P(RI,a1)+(0.3,)],'#4e4e51')
    face(1,[P(RO,a0)+(0.35,),P(RO+.8,a0)+(0.35,),P(RO+.8,a1)+(0.35,),P(RO,a1)+(0.35,)],'#e6b400' if i%2 else '#222')
    face(1,[(0,0,.5),P(RI,a0)+(.5,),P(RI,a1)+(.5,)],'#5f9a4a' if i%2 else '#68a352')
    if i%2==0: face(1,[P(54.9,a0)+(.33,),P(55.1,a0)+(.33,),P(55.1,a1)+(.33,),P(54.9,a1)+(.33,)],'#f2f2f2')
for a in range(62,520,20):
    quad(1,-11,11,a,a+20,0.2,'#4b4b4e'); quad(1,-7.5,7.5,-a-20,-a,0.2,'#4b4b4e')
    if (a//20)%2==0: quad(1,-.1,.1,a,a+10,0.25,'#e6b400'); quad(1,-.1,.1,-a-10,-a,0.25,'#e6b400')
# 4 ramps: roundabout -> ring (climb 9.7 m in 245 m, beside the embankment toe), two on each side of the bridge
for s in(-1,1):
    for sg in(-1,1):
        u0=sg*70; u1=sg*(70+245)
        for k in range(10):
            a=u0+(u1-u0)*k/10; b=u0+(u1-u0)*(k+1)/10; za=ZR*k/10; zb=ZR*(k+1)/10
            face(3,[(a,s*24,za),(b,s*24,zb),(b,s*31.3,zb),(a,s*31.3,za)],'#505053')
            face(3,[(a,s*24,za),(b,s*24,zb),(b,s*24,zb-1.2),(a,s*24,za-1.2)],'#b0aa9c')
# trees and a few buildings in the distance
for _ in range(220):
    u=random.uniform(-650,650); v=random.choice([-1,1])*random.uniform(70,480)
    if abs(v)<120 and abs(u)<260: continue
    hh=random.uniform(6,12); rr=random.uniform(3,6)
    face(1.5,[(u-rr,v,0),(u+rr,v,0),(u+rr*.8,v,hh*.8),(u,v,hh),(u-rr*.8,v,hh*.8)],random.choice(['#2f6b2f','#3e7d3a','#285c2e']))
fig=plt.figure(figsize=(W/100,H/100),dpi=100); ax=fig.add_axes([0,0,1,1]); ax.set_xlim(0,W); ax.set_ylim(H,0); ax.axis('off'); fig.patch.set_facecolor('#c3d3e6')
for layer,d,pts,col in sorted(faces,key=lambda t:(t[0],-t[1])):
    pp=[proj(p) for p in pts]
    if any(q is None for q in pp): continue
    fg=1-math.exp(-d/1800.); c=to_rgb(col); c=tuple(c[i]*(1-fg)+HAZE[i]*fg for i in range(3))
    ax.add_patch(Polygon(pp,closed=True,facecolor=c,edgecolor=c,linewidth=.3))
ax.text(24,30,'OPTION A (concept, ASSUMED sizes): ring stays on its 9.7 m embankment and crosses on a bridge over a ROUNDABOUT at ground; 4 ramps climb to the 8-lane ring',fontsize=11,weight='bold')
fig.savefig('docs/j300_optionA_view.png',dpi=100)

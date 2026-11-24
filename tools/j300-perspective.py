# J0 concept picture, aerial perspective like the Purbachal photo (NOT a game render). Sizes ASSUMED (HANDOFF_JUNCTION_300FT.md section 3).
import math, random
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib.colors import to_rgb
random.seed(7)
W,Hh=1900,900
CAM=(-345.0,0.0,40.0); PITCH=math.radians(12.5); FOCAL=1150.0
cp,sp=math.cos(PITCH),math.sin(PITCH)
def proj(p):
    x,y,z=p[0]-CAM[0],p[1]-CAM[1],p[2]-CAM[2]
    fwd=x*cp-z*sp; up=x*sp+z*cp   # pitch down
    if fwd<2: return None
    return (W/2+FOCAL*y/fwd, Hh*0.40-FOCAL*up/fwd, fwd)
HAZE=to_rgb('#cfd2cf')
def fog(c,dist):
    f=1-math.exp(-dist/1500.0); c=to_rgb(c)
    return tuple(c[i]*(1-f)+HAZE[i]*f for i in range(3))
faces=[]  # (layer, key, pts3, color)
def face(layer,pts,col,bias=0):
    cx=sum(p[0] for p in pts)/len(pts);cy=sum(p[1] for p in pts)/len(pts);cz=sum(p[2] for p in pts)/len(pts)
    d=math.dist((cx,cy,cz),CAM)
    faces.append((layer,d+bias,pts,col))
def quad(layer,u0,u1,v0,v1,z,col,bias=0,z1=None):
    z1=z if z1 is None else z1
    face(layer,[(u0,v0,z),(u1,v0,z1),(u1,v1,z1),(u0,v1,z)],col,bias)
H=7.8; G=0.04
def dep(u):
    u=abs(u); return 0.0 if u>=450 else min(H,G*(450-u))
U0,U1=-380,1500
# L0 ground tiles
u=U0
while u<U1:
    step=40 if u<500 else 120
    for v in range(-1200,1200,150 if abs(u)>150 else 60):
        quad(0,u,u+step,v,v+(150 if abs(u)>150 else 60),0,'#9db07a' if (int(u/200)+v//150)%2 else '#a7b585')
    u+=step
# L1 ROW + roads at ground
def strip(layer,u0,u1,v0,v1,z,col,bias=0):
    a=u0
    while a<u1:
        b=min(a+20,u1); quad(layer,a,b,v0,v1,z,col,bias); a=b
for s in(-1,1):
    strip(1,U0,U1,s*17.5,s*19,0.02,'#8a8a82')            # barrier strip
    strip(1,U0,U1,s*19,s*30.5,0.03,'#4a4a4c')            # side carriageway
    strip(1,U0,U1,s*30.5,s*35.5,0.03,'#b7a98c')          # footpath
    strip(1,U0,U1,s*35.5,s*45.7,0.02,'#8fa56c')          # green strip
    # yellow-black kerb stripes (side road inner edge)
    a=U0;k=0
    while a<U1:
        quad(1,a,a+3,s*19,s*19.7,0.06,'#e6b400' if k%2==0 else '#222222',0); a+=3;k+=1
    # dashed lane lines side road
    for vv in(s*22.6,s*26.3):
        a=U0
        while a<U1: quad(1,a,a+3,vv-.1,vv+.1,0.05,'#f2f2f2'); a+=9
# ring main on ground outside trench
for a in range(U0,U1,20):
    if dep(a)==0 and dep(a+20)==0:
        for s in(-1,1): quad(1,a,a+20,s*0.8,s*16.7,0.04,'#3d3d3f')

# MERGE / DIVERGE at ground (u = -560..-450 diverge side, 450..560 merge side): side carriageway <-> main lane
for s_ in(-1,1):
    for (u0,u1) in((-560,-450),(450,560)):
        a_=u0;k_=0
        while a_<u1:
            quad(1,a_,a_+10,s_*16.7,s_*22.6,0.09,'#4a4a4c'); 
            quad(1,a_,a_+5,s_*17.0+ (0 if s_>0 else 0),s_*17.0+s_*0.4,0.1,'#f2f2f2')
            a_+=10;k_+=1
        # chevron gore on the barrier
        a_=u0
        while a_<u1-10:
            face(1,[(a_,s_*17.0,0.11),(a_+4,s_*17.0,0.11),(a_+8,s_*19.0,0.11),(a_+4,s_*19.0,0.11)],'#f2f2f2'); a_+=10
# L2 trench floor, walls, median
for a in range(-460,460,10):
    b=a+10
    if abs(a)<62 and abs(b)<=62: continue
    for s in(-1,1):
        quad(2,a,b,s*0.8,s*16.7,-dep(a),'#3b3b3d',z1=-dep(b)) if False else face(2,[(a,s*0.8,-dep(a)),(b,s*0.8,-dep(b)),(b,s*16.7,-dep(b)),(a,s*16.7,-dep(a))],'#3b3b3d')
        face(2,[(a,s*17.5,-dep(a)),(b,s*17.5,-dep(b)),(b,s*17.5,0.0),(a,s*17.5,0.0)],'#bdb6a6' if (a//10)%2 else '#b2ab9b')
        face(2,[(a,s*16.7,-dep(a)),(b,s*16.7,-dep(b)),(b,s*17.5,-dep(b)),(a,s*17.5,-dep(a))],'#6d6a63')
        for vv in(s*4.5,s*8.2,s*11.9):
            if (a//10)%2==0: face(2,[(a,vv-.08,-dep(a)+.02),(b,vv-.08,-dep(b)+.02),(b,vv+.08,-dep(b)+.02),(a,vv+.08,-dep(a)+.02)],'#e8e8e8')
        # wall top yellow-black edge
        face(2,[(a,s*17.5,0.0),(b,s*17.5,0.0),(b,s*18.2,0.0),(a,s*18.2,0.0)],'#e6b400' if (a//10)%2 else '#222222')
    # median wall
    face(2,[(a,-0.6,-dep(a)),(b,-0.6,-dep(b)),(b,-0.6,-dep(b)+1.1),(a,-0.6,-dep(a)+1.1)],'#a9a39a')
    face(2,[(a,0.6,-dep(a)),(b,0.6,-dep(b)),(b,0.6,-dep(b)+1.1),(a,0.6,-dep(a)+1.1)],'#a9a39a')
    face(2,[(a,-0.6,-dep(a)+1.1),(b,-0.6,-dep(b)+1.1),(b,0.6,-dep(b)+1.1),(a,0.6,-dep(a)+1.1)],'#d0cbc1')
# L3 tunnel mouth (dark) at u=-45, drawn before roof
for s in(-1,1):
    face(3,[(-62,s*0.8,-H),(-62,s*16.7,-H),(-62,s*16.7,-0.2),(-62,s*0.8,-0.2)],'#141416')
# L4 final sorted objects
# box roof and cross roads (tiled)
def tiles(u0,u1,v0,v1,z,col,su=15,sv=15,bias=0):
    a=u0
    while a<u1:
        v=v0
        while v<v1: quad(4,a,min(a+su,u1),v,min(v+sv,v1),z,col,bias); v+=sv
        a+=su
tiles(-62,62,-19,19,0.25,'#505053',12,19)               # box roof carries the roundabout
tiles(-11,11,62,260,0.2,'#4b4b4e',22,15,bias=-3)         # R6 arm (6 lane, 2 x 3)
tiles(-7.5,7.5,-260,-62,0.2,'#4b4b4e',15,15,bias=-3)     # R4 arm (4 lane, 2 x 2)
for vv in range(66,260,14): quad(4,-.12,.12,vv,vv+7,0.28,'#e6b400',bias=-5)
for vv in range(-258,-66,14): quad(4,-.12,.12,vv,vv+7,0.28,'#e6b400',bias=-5)
# ROUNDABOUT (ASSUMED outer radius 62 m, circulating 14 m, island radius 48 m; left-hand traffic = clockwise)
N=36; RO,RI=62.0,48.0
for i in range(N):
    a0=2*math.pi*i/N; a1=2*math.pi*(i+1)/N
    P=lambda r,a:(r*math.cos(a),r*math.sin(a))
    q=[P(RI,a0)+(0.3,),P(RO,a0)+(0.3,),P(RO,a1)+(0.3,),P(RI,a1)+(0.3,)]
    face(4,q,'#4e4e51',-4)
    # kerb (yellow-black) on outer edge
    q2=[P(RO,a0)+(0.35,),P(RO+0.8,a0)+(0.35,),P(RO+0.8,a1)+(0.35,),P(RO,a1)+(0.35,)]
    face(4,q2,'#e6b400' if i%2 else '#222222',-5)
    # island fan (grass)
    face(4,[(0,0,0.5),P(RI,a0)+(0.5,),P(RI,a1)+(0.5,)],'#5f9a4a' if i%2 else '#68a352',-2)
    # lane dash at mid radius
    if i%2==0: face(4,[P(54.9,a0)+(0.33,),P(55.1,a0)+(0.33,),P(55.1,a1)+(0.33,),P(54.9,a1)+(0.33,)],'#f2f2f2',-6)
for i in range(10):    # trees on the island
    a=2*math.pi*i/10; r=36; x,y=r*math.cos(a),r*math.sin(a)
    face(4,[(x-4,y,0.5),(x+4,y,0.5),(x+3,y,9),(x,y,11),(x-3,y,9)],'#2f6b2f',-8)
# zebra crossings on the arms + stop lines on side roads
for vv in(-75,75):
    for k in range(-5,6): quad(4,k*2.6-1.0,k*2.6+1.0,vv-1.5,vv+1.5,0.3,'#f4f4f4',bias=-6)
def box(cx,cy,cz,l,w,h,col):
    u0,u1,v0,v1=cx-l/2,cx+l/2,cy-w/2,cy+w/2
    face(4,[(u0,v0,cz+h),(u1,v0,cz+h),(u1,v1,cz+h),(u0,v1,cz+h)],col,-9)
    face(4,[(u0,v0,cz),(u0,v1,cz),(u0,v1,cz+h),(u0,v0,cz+h)],tuple(c*.75 for c in to_rgb(col)),-9)
    face(4,[(u0,v0,cz),(u1,v0,cz),(u1,v0,cz+h),(u0,v0,cz+h)],tuple(c*.6 for c in to_rgb(col)),-9)
    face(4,[(u0,v1,cz),(u1,v1,cz),(u1,v1,cz+h),(u0,v1,cz+h)],tuple(c*.6 for c in to_rgb(col)),-9)
cols=['#f2f2f2','#c0392b','#2c3e50','#e1e1e1','#d4a017','#2e86c1','#7f8c8d','#ecf0f1']
for _ in range(34):   # cars in trench and on side roads, same direction (left-hand traffic: +u on v>0 side as drawn)
    u=random.uniform(-330,1300); lane=random.choice([6.5,10.2,13.9,-6.5,-10.2,-13.9,22,26,-22,-26,24.5,-24.5])
    z=-dep(u) if abs(lane)<17 else 0.05
    if abs(lane)<17 and abs(u)<45: continue
    box(u,lane,z,4.4,1.9,1.5,random.choice(cols))
for _ in range(10):   # cars on cross roads
    v=random.uniform(30,250)*random.choice([1,-1]); box(random.choice([-3,3]),v,0.25,1.9,4.4,1.5,random.choice(cols))
# signal poles
for u,v in((-66,-38),(66,38),(-66,38),(66,-38)):
    face(4,[(u-.3,v,0),(u+.3,v,0),(u+.3,v,7),(u-.3,v,7)],'#222',-10); box(u,v,7,.8,.8,2.2,'#111111')
# street lamps
for u in range(-360,1300,45):
    for s in(-1,1):
        face(4,[(u-.25,s*32,0),(u+.25,s*32,0),(u+.25,s*32,9),(u-.25,s*32,9)],'#cfcfcf',-10)
        face(4,[(u,s*32,9),(u,s*27,9.4),(u,s*27,9.1),(u,s*32,8.7)],'#cfcfcf',-10)
# green gantry sign over the side roads + main (before dive), u=-210
for s in(-1,1):
    for v in(s*18.3,s*32):
        face(4,[(-210-.3,v,0),(-210+.3,v,0),(-210+.3,v,6.5),(-210-.3,v,6.5)],'#d9d9d9',-12)
face(4,[(-210,-34,6.0),(-210,34,6.0),(-210,34,6.4),(-210,-34,6.4)],'#d9d9d9',-12)
SIGN=((-210,-12,7.2),(-210,12,7.2),(-210,12,11.2),(-210,-12,11.2))
face(4,list(SIGN),'#0b7a3b',-13)
# trees (flat blobs as vertical diamonds) outside ROW and distant buildings
for _ in range(260):
    u=random.uniform(-340,1400); v=random.choice([1,-1])*random.uniform(52,420)
    h=random.uniform(6,12); r=random.uniform(3,6); g=random.choice(['#2f6b2f','#3e7d3a','#285c2e','#4a8a40'])
    face(4,[(u-r,v,0),(u+r,v,0),(u+r*.8,v,h*.8),(u,v,h),(u-r*.8,v,h*.8)],g,-8)
for _ in range(14):
    u=random.uniform(100,1400); v=random.choice([1,-1])*random.uniform(120,380); h=random.uniform(15,38); w=random.uniform(12,24)
    face(4,[(u,v-w/2,0),(u,v+w/2,0),(u,v+w/2,h),(u,v-w/2,h)],random.choice(['#c9b7a2','#d8cfc2','#b9aea0']),-7)
# render
fig=plt.figure(figsize=(W/100,Hh/100),dpi=100); ax=fig.add_axes([0,0,1,1]); ax.set_xlim(0,W); ax.set_ylim(Hh,0); ax.axis('off')
# sky gradient
import numpy as np
grad=np.linspace(0,1,256).reshape(-1,1); sky=np.dstack([0.62+0.15*(1-grad)*0+0.18*grad+0*grad,0.72+0.1*grad,0.82+0.05*grad]).clip(0,1)
ax.imshow(np.concatenate([np.dstack([0.60+0.20*grad,0.70+0.12*grad,0.82+0.07*grad])]),extent=[0,W,Hh*0.40,0],aspect='auto',zorder=0)
ax.add_patch(Polygon([(0,Hh*0.40-10),(W,Hh*0.40-10),(W,Hh),(0,Hh)],color=HAZE,zorder=0.5))
order=sorted(faces,key=lambda f:(f[0],-f[1]))
for layer,key,pts,col in order:
    pp=[proj(p) for p in pts]
    if any(q is None for q in pp): continue
    d=key if layer<4 else key
    ax.add_patch(Polygon([(q[0],q[1]) for q in pp],closed=True,facecolor=fog(col,abs(d)),edgecolor=fog(col,abs(d)),linewidth=.3,zorder=1+layer))
# text on sign
q=proj((-210,0,9.2)); ax.text(q[0],q[1],'Ring Road (main)  >>  Underpass',color='white',fontsize=7,ha='center',va='center',zorder=20)
ax.text(24,26,'EVCity 300 ft junction (roundabout on top) - CONCEPT (not a game render, sizes ASSUMED)',fontsize=11,color='#1d1d1d',weight='bold',zorder=30)
fig.savefig('docs/j300_concept_view.png',dpi=100)

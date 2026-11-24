# J1 pictures: vertical plan (profile) + 3D view of TYPE A with the J1 numbers (reads docs/J300_TYPEA.json). Concept pictures, sizes ASSUMED.
import json, math, random
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib.colors import to_rgb
D=json.load(open('docs/J300_TYPEA.json')); ring=D['ring']
def Hf(u):
    for a,b in zip(ring,ring[1:]):
        if a['u']<=u<=b['u']: t=(u-a['u'])/(b['u']-a['u']); return a['ring']+t*(b['ring']-a['ring'])
    return ring[-1]['ring'] if u>0 else ring[0]['ring']
def Nf(u):
    for a,b in zip(ring,ring[1:]):
        if a['u']<=u<=b['u']: t=(u-a['u'])/(b['u']-a['u']); return a['nat']+t*(b['nat']-a['nat'])
    return ring[-1]['nat'] if u>0 else ring[0]['nat']
# pick the 7 % row (u0 = -75) from cands: recompute here with the same rule
u0=-75; P=18.9; G=0.07
def meet(sg):
    for d in range(70,700,5):
        if P+G*(d-70)>=Hf(u0+sg*d)-0.5: return d
    return None
dE,dW=meet(1),meet(-1)
print('E',dE,'W',dW)
# ---- vertical plan
fig,ax=plt.subplots(figsize=(13,5.8))
us=[r['u'] for r in ring]
ax.fill_between(us,[r['nat'] for r in ring],10,color='#a98f6b',label='natural ground')
ax.plot(us,[r['ring'] for r in ring],'k',lw=2.5,label='ring surface (fixed)')
ax.fill_between(us,[r['nat'] for r in ring],[r['ring'] for r in ring],color='#e8c27a',alpha=.6,label='ring embankment')
ax.plot([u0-62,u0+62],[P+.3,P+.3],color='#c0392b',lw=4,label='roundabout (pad %.1f m)'%P)
ax.add_patch(plt.Rectangle((u0-67,Hf(u0)-2.0),134,2.0,color='#555',zorder=5)); ax.text(u0-70,Hf(u0)+1.5,'bridge 134 m (37+60+37)',fontsize=9)
for sg,d,c,name in((1,dE,'#2874a6','E ramps 7 %'),(-1,dW,'#117a65','W ramps 7 %')):
    xs=[u0+sg*x for x in range(70,d+1,5)]; ax.plot(xs,[P+G*(x-70) for x in range(70,d+1,5)],color=c,lw=3,label=name+' (length %d m)'%(d-70))
ax.axvline(-600,color='#c0392b',ls='--'); ax.text(-595,44,'rail',color='#c0392b'); ax.axvline(540,color='#2c6fa8',ls='--'); ax.text(545,44,'water',color='#2c6fa8')
ax.set_xlim(-650,600); ax.set_ylim(15,50); ax.grid(alpha=.3); ax.legend(loc='upper left',fontsize=8); ax.set_xlabel('u (m) along the ring from the old crossing'); ax.set_ylabel('height (m)')
ax.set_title('J1 vertical plan TYPE A: ring fixed, roundabout centre u0=-75 m, 4 ramps at 7 % (project limit is 5 %: needs the user OK)')
fig.savefig('docs/j300_typea_profile.png',dpi=110,bbox_inches='tight'); plt.close(fig)
# ---- 3D view
random.seed(5); W,Hh=1900,950; CAM=(-250.,-215.,62.); TGT=(15.,0.,8.); F=1150.
fx,fy,fz=[TGT[i]-CAM[i] for i in range(3)]; n=math.sqrt(fx*fx+fy*fy+fz*fz); f=(fx/n,fy/n,fz/n)
r=(f[1],-f[0],0.); rn=math.hypot(r[0],r[1]); r=(r[0]/rn,r[1]/rn,0.)
up=(r[1]*f[2]-r[2]*f[1], r[2]*f[0]-r[0]*f[2], r[0]*f[1]-r[1]*f[0])
def proj(p):
    q=(p[0]-CAM[0],p[1]-CAM[1],p[2]-CAM[2]); d=q[0]*f[0]+q[1]*f[1]+q[2]*f[2]
    if d<5: return None
    return (W/2+F*(q[0]*r[0]+q[1]*r[1])/d, Hh/2-F*(q[0]*up[0]+q[1]*up[1]+q[2]*up[2])/d)
HAZE=to_rgb('#d0d3d0'); faces=[]
def face(l,pts,col):
    c=[sum(p[i] for p in pts)/len(pts) for i in range(3)]; faces.append((l,math.dist(c,CAM),pts,col))
def quad(l,a,b,v0,v1,z0,col,z1=None):
    z1=z0 if z1 is None else z1; face(l,[(a,v0,z0),(b,v0,z1),(b,v1,z1),(a,v1,z0)],col)
ZR=lambda x:Hf(u0+x)-P   # ring height above pad at x metres from the roundabout centre
for x in range(-700,701,50):
    for v in range(-500,501,50): quad(0,x,x+50,v,v+50,0,'#9db07a' if ((x+v)//50)%2 else '#a8b686')
for x in range(-450,450,20):
    if abs(x+10)<67: continue
    a,b=x,x+20; za,zb=ZR(a),ZR(b)
    quad(2,a,b,-22.1,22.1,za,'#3f3f42',z1=zb)
    for s in(-1,1): face(2,[(a,s*22.1,za),(b,s*22.1,zb),(b,s*(22.1+2*zb),0),(a,s*(22.1+2*za),0)],'#b59a73')
    quad(2,a,b,-.6,.6,za+.05,'#9a9a95',z1=zb+.05)
    if (a//20)%2==0:
        for k in(-16,-8,8,16): quad(2,a,b,k-.1,k+.1,za+.03,'#f2f2f2',z1=zb+.03)
for x in range(-60,60,20):
    quad(3,x,x+20,-22.1,22.1,ZR(x),'#4a4a4d',z1=ZR(x+20)); quad(3,x,x+20,-22.1,-21.4,ZR(x)+.9,'#cfcac0',z1=ZR(x+20)+.9); quad(3,x,x+20,21.4,22.1,ZR(x)+.9,'#cfcac0',z1=ZR(x+20)+.9)
    for s in(-1,1): face(3,[(x,s*22.1,ZR(x)-2),(x+20,s*22.1,ZR(x+20)-2),(x+20,s*22.1,ZR(x+20)),(x,s*22.1,ZR(x))],'#b8b2a4')
for px in(-67,-30,30,67):
    for pv in(-19,-6,6,19): face(3,[(px-1.6,pv,0),(px+1.6,pv,0),(px+1.6,pv,ZR(px)-2),(px-1.6,pv,ZR(px)-2)],'#a9a396')
RO,RI=62.,48.; N=40
for i in range(N):
    a0=2*math.pi*i/N; a1=2*math.pi*(i+1)/N; Pp=lambda rr,a:(rr*math.cos(a),rr*math.sin(a))
    face(1,[Pp(RI,a0)+(.3,),Pp(RO,a0)+(.3,),Pp(RO,a1)+(.3,),Pp(RI,a1)+(.3,)],'#4e4e51')
    face(1,[Pp(RO,a0)+(.35,),Pp(RO+.8,a0)+(.35,),Pp(RO+.8,a1)+(.35,),Pp(RO,a1)+(.35,)],'#e6b400' if i%2 else '#222')
    face(1,[(0,0,.5),Pp(RI,a0)+(.5,),Pp(RI,a1)+(.5,)],'#5f9a4a' if i%2 else '#68a352')
for a in range(62,520,20):
    quad(1,-11,11,a,a+20,.2,'#4b4b4e') if False else face(1,[(-11,a,.2),(11,a,.2),(11,a+20,.2),(-11,a+20,.2)],'#4b4b4e'); face(1,[(-7.5,-a-20,.2),(7.5,-a-20,.2),(7.5,-a,.2),(-7.5,-a,.2)],'#4b4b4e')
# ramps (both sides of the ring) + merge / diverge lanes along the ring
for s in(-1,1):
    for sg,d in((1,dE),(-1,dW)):
        steps=max(4,(d-70)//12)
        for k in range(steps):
            xa=70+(d-70)*k/steps; xb=70+(d-70)*(k+1)/steps
            face(3,[(sg*xa,s*25,G*(xa-70)),(sg*xb,s*25,G*(xb-70)),(sg*xb,s*32,G*(xb-70)),(sg*xa,s*32,G*(xa-70))],'#505053')
            face(3,[(sg*xa,s*25,G*(xa-70)),(sg*xb,s*25,G*(xb-70)),(sg*xb,s*25,G*(xb-70)-1.2),(sg*xa,s*25,G*(xa-70)-1.2)],'#b0aa9c')
        for k in range(8):   # merge / diverge lane beside the ring (about 241 m / 207 m, ASSUMED)
            xa=d+(241 if sg>0 else 207)*k/8; xb=d+(241 if sg>0 else 207)*(k+1)/8
            face(3,[(sg*xa,s*22.1,ZR(sg*xa)),(sg*xb,s*22.1,ZR(sg*xb)),(sg*xb,s*26,ZR(sg*xb)),(sg*xa,s*26,ZR(sg*xa))],'#505053')
for _ in range(200):
    x=random.uniform(-650,650); v=random.choice([-1,1])*random.uniform(80,480)
    if abs(v)<120 and abs(x)<300: continue
    hh=random.uniform(6,12); rr=random.uniform(3,6); face(1.5,[(x-rr,v,0),(x+rr,v,0),(x+rr*.8,v,hh*.8),(x,v,hh),(x-rr*.8,v,hh*.8)],random.choice(['#2f6b2f','#3e7d3a','#285c2e']))
fig=plt.figure(figsize=(W/100,Hh/100),dpi=100); ax=fig.add_axes([0,0,1,1]); ax.set_xlim(0,W); ax.set_ylim(Hh,0); ax.axis('off'); fig.patch.set_facecolor('#c3d3e6')
for l,d,pts,col in sorted(faces,key=lambda t:(t[0],-t[1])):
    pp=[proj(p) for p in pts]
    if any(q is None for q in pp): continue
    fg=1-math.exp(-d/1800.); c=to_rgb(col); c=tuple(c[i]*(1-fg)+HAZE[i]*fg for i in range(3)); ax.add_patch(Polygon(pp,closed=True,facecolor=c,edgecolor=c,linewidth=.3))
ax.text(24,30,'J1 TYPE A (concept, ASSUMED sizes): ring on its embankment, bridge over a ground roundabout (centre u0 = -75 m), 4 ramps at 7 %',fontsize=11,weight='bold')
fig.savefig('docs/j300_typea_view.png',dpi=100)

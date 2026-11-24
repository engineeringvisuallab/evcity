# J1-B pictures: vertical plan + 3D view of TYPE B (ring unchanged in an underpass, RAISED roundabout on top). Reads docs/J300_TYPEB.json. Concept pictures, sizes ASSUMED.
import json, math, random
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib.colors import to_rgb
D=json.load(open('docs/J300_TYPEB.json')); ring=D['ring']; b=D['best']; u0=b['u0']; PT=b['Ptop']
def interp(key,u):
    for a,c in zip(ring,ring[1:]):
        if a['u']<=u<=c['u']: t=(u-a['u'])/(c['u']-a['u']); return a[key]+t*(c[key]-a[key])
    return ring[-1][key] if u>0 else ring[0][key]
Hf=lambda u:interp('ring',u); Nf=lambda u:interp('nat',u)
G0=Nf(u0); Ht=PT-G0; R=b['ramps']; keys=list(R.keys()); lenE=R[keys[0]]['len']; lenW=R[keys[2]]['len']; r6=b['r6Len']
# ---------- vertical plan
fig,ax=plt.subplots(figsize=(13,5.8)); us=[r['u'] for r in ring]
ax.fill_between(us,[r['nat'] for r in ring],10,color='#a98f6b',label='natural ground'); ax.fill_between(us,[r['nat'] for r in ring],[r['ring'] for r in ring],color='#e8c27a',alpha=.6,label='ring embankment (unchanged)')
ax.plot(us,[r['ring'] for r in ring],'k',lw=2.5,label='ring surface (FIXED, goes through the underpass)')
ax.add_patch(plt.Rectangle((u0-67,PT-2.0),134,2.0,color='#c0392b',label='roundabout deck %.1f m (roof of the underpass, 134 m)'%PT,zorder=5))
ax.fill_between([u0-62,u0+62],[PT,PT],[G0,G0],color='#b9a58a',alpha=.5,label='platform fill')
for sg,d,c,nm in((1,lenE,'#2874a6','E ramps 5 % down (110 m)'),(-1,lenW,'#117a65','W ramps 5 % down (110 m)')):
    xs=[u0+sg*x for x in range(70,70+int(d)+1,5)]; ax.plot(xs,[PT-0.05*(x-70) for x in range(70,70+int(d)+1,5)],color=c,lw=3,label=nm)
ax.plot([u0-62-r6*0.0,u0],[PT,PT],color='#7d3c98',lw=0)
ax.annotate('R6 arm climbs %.0f m at 3.5 %% (out of the plane)'%r6,(u0,PT),(u0+80,PT+5),fontsize=9)
ax.axvline(-600,color='#c0392b',ls='--'); ax.text(-595,45,'rail',color='#c0392b'); ax.axvline(540,color='#2c6fa8',ls='--'); ax.text(545,45,'water',color='#2c6fa8')
ax.set_xlim(-650,600); ax.set_ylim(15,50); ax.grid(alpha=.3); ax.legend(loc='upper left',fontsize=8); ax.set_xlabel('u (m) along the ring from the old crossing'); ax.set_ylabel('height (m)')
ax.set_title('J1-B vertical plan TYPE B: ring stays at its level in an underpass, roundabout RAISED to %.1f m, centre u0=%d m, ramps 5 %% (project limit OK)'%(PT,u0))
fig.savefig('docs/j300_typeb_profile.png',dpi=110,bbox_inches='tight'); plt.close(fig)
# ---------- 3D view
import os
VIEW=os.environ.get('VIEW','iso')
random.seed(11); W,Hh=1900,950
if VIEW=='along': CAM=(-300.,0.,Hf(u0-300)-G0+15.); TGT=(0.,0.,Ht*0.75); F=1000.
else: CAM=(-215.,-195.,52.); TGT=(5.,0.,Ht*0.55); F=1150.
fx,fy,fz=[TGT[i]-CAM[i] for i in range(3)]; n=math.sqrt(fx*fx+fy*fy+fz*fz); f=(fx/n,fy/n,fz/n)
r=(f[1],-f[0],0.); rn=math.hypot(r[0],r[1]); r=(r[0]/rn,r[1]/rn,0.); up=(r[1]*f[2]-r[2]*f[1], r[2]*f[0]-r[0]*f[2], r[0]*f[1]-r[1]*f[0])
def proj(p):
    q=(p[0]-CAM[0],p[1]-CAM[1],p[2]-CAM[2]); d=q[0]*f[0]+q[1]*f[1]+q[2]*f[2]
    if d<5: return None
    return (W/2+F*(q[0]*r[0]+q[1]*r[1])/d, Hh/2-F*(q[0]*up[0]+q[1]*up[1]+q[2]*up[2])/d)
HAZE=to_rgb('#d0d3d0'); faces=[]
def face(l,pts,col):
    c=[sum(p[i] for p in pts)/len(pts) for i in range(3)]; faces.append((l,math.dist(c,CAM),pts,col))
def quad(l,a,bb,v0,v1,z0,col,z1=None):
    z1=z0 if z1 is None else z1; face(l,[(a,v0,z0),(bb,v0,z1),(bb,v1,z1),(a,v1,z0)],col)
ZR=lambda x:Hf(u0+x)-G0
for x in range(-700,701,50):
    for v in range(-600,601,50): quad(0,x,x+50,v,v+50,0,'#9db07a' if ((x+v)//50)%2 else '#a8b686')
# ring embankment outside the underpass
for x in range(-450,450,20):
    if abs(x+10)<70: continue
    a,c=x,x+20; za,zc=ZR(a),ZR(c)
    quad(2,a,c,-22.1,22.1,za,'#3f3f42',z1=zc)
    for s in(-1,1): face(2,[(a,s*22.1,za),(c,s*22.1,zc),(c,s*(22.1+2*zc),0),(a,s*(22.1+2*za),0)],'#b59a73')
    quad(2,a,c,-.6,.6,za+.05,'#9a9a95',z1=zc+.05)
    if (a//20)%2==0:
        for k in(-16,-8,8,16): quad(2,a,c,k-.1,k+.1,za+.03,'#f2f2f2',z1=zc+.03)
# platform: vertical retaining walls at the ring corridor, fill slopes elsewhere, portals
RO,RI=62.,48.; N=48
for i in range(N):
    a0=2*math.pi*i/N; a1=2*math.pi*(i+1)/N; P=lambda rr,a,z:(rr*math.cos(a),rr*math.sin(a),z)
    ym=math.sin((a0+a1)/2)*RO
    face(3,[P(RI,a0,Ht),P(RO,a0,Ht),P(RO,a1,Ht),P(RI,a1,Ht)],'#4e4e51')
    face(3,[P(RO,a0,Ht+.05),P(RO+.8,a0,Ht+.05),P(RO+.8,a1,Ht+.05),P(RO,a1,Ht+.05)],'#e6b400' if i%2 else '#222')
    face(3,[(0,0,Ht+.5),P(RI,a0,Ht+.5),P(RI,a1,Ht+.5)],'#5f9a4a' if i%2 else '#68a352')
    if abs(ym)>30 and not (abs(math.cos((a0+a1)/2))<0.3 and False): face(2.5,[P(RO,a0,Ht),P(RO,a1,Ht),P(RO+2*Ht,a1,0),P(RO+2*Ht,a0,0)],'#b59a73')
for s in(-1,1):
    face(2.6,[(s*70,-28,0),(s*70,28,0),(s*70,28,Ht),(s*70,-28,Ht)],'#c9c3b5')
    face(2.7,[(s*69.8,-22.1,ZR(s*70)),(s*69.8,22.1,ZR(s*70)),(s*69.8,22.1,ZR(s*70)+5.5),(s*69.8,-22.1,ZR(s*70)+5.5)],'#101012')
# R6 arm (+y) climbing, R4 arm (-y)
def arm(sy,length,w,col):
    steps=max(6,int(length/20))
    for k in range(steps):
        d0=length*k/steps; d1=length*(k+1)/steps; z0=Ht*(1-d0/length); z1=Ht*(1-d1/length); y0=sy*(RO+d0); y1=sy*(RO+d1)
        face(3,[(-w/2,y0,z0),(w/2,y0,z0),(w/2,y1,z1),(-w/2,y1,z1)],col)
        for s in(-1,1): face(2,[(s*w/2,y0,z0),(s*w/2,y1,z1),(s*(w/2+2*z1),y1,0),(s*(w/2+2*z0),y0,0)],'#b59a73')
arm(1,r6,22,'#4b4b4e'); arm(-1,Ht/0.06,15,'#4b4b4e')
# 4 ramps from the roundabout down to the ring, both sides, with merge / diverge lanes
for s in(-1,1):
    for sg,d in((1,lenE),(-1,lenW)):
        steps=max(4,int(d/10))
        for k in range(steps):
            xa=70+d*k/steps; xb=70+d*(k+1)/steps; za=Ht-0.05*(xa-70); zb=Ht-0.05*(xb-70)
            face(3,[(sg*xa,s*25,za),(sg*xb,s*25,zb),(sg*xb,s*32,zb),(sg*xa,s*32,za)],'#505053')
            face(2,[(sg*xa,s*32,za),(sg*xb,s*32,zb),(sg*xb,s*32+s*.2*zb,0),(sg*xa,s*32+s*.2*za,0)],'#c9c3b5')
            face(2,[(sg*xa,s*25,za),(sg*xb,s*25,zb),(sg*xb,s*25,ZR(sg*xb)),(sg*xa,s*25,ZR(sg*xa))],'#c9c3b5')
        for k in range(8):
            xa=70+d+(241 if sg>0 else 207)*k/8; xb=70+d+(241 if sg>0 else 207)*(k+1)/8
            face(3,[(sg*xa,s*22.1,ZR(sg*xa)),(sg*xb,s*22.1,ZR(sg*xb)),(sg*xb,s*26,ZR(sg*xb)),(sg*xa,s*26,ZR(sg*xa))],'#505053')
for _ in range(180):
    x=random.uniform(-650,650); v=random.choice([-1,1])*random.uniform(100,520)
    if abs(v)<260 and abs(x)<300: continue
    hh=random.uniform(6,12); rr=random.uniform(3,6); face(1.5,[(x-rr,v,0),(x+rr,v,0),(x+rr*.8,v,hh*.8),(x,v,hh),(x-rr*.8,v,hh*.8)],random.choice(['#2f6b2f','#3e7d3a','#285c2e']))
fig=plt.figure(figsize=(W/100,Hh/100),dpi=100); ax=fig.add_axes([0,0,1,1]); ax.set_xlim(0,W); ax.set_ylim(Hh,0); ax.axis('off'); fig.patch.set_facecolor('#c3d3e6')
for l,d,pts,col in sorted(faces,key=lambda t:(t[0] if t[0] in (0,1.5) else 1,-t[1])):
    pp=[proj(p) for p in pts]
    if any(q is None for q in pp): continue
    fg=1-math.exp(-d/1800.); c=to_rgb(col); c=tuple(c[i]*(1-fg)+HAZE[i]*fg for i in range(3)); ax.add_patch(Polygon(pp,closed=True,facecolor=c,edgecolor=c,linewidth=.3))
ax.text(24,30,('J2 TYPE B view along the ring (concept, ASSUMED sizes): MSE walls on ramps, underpass portal under the raised roundabout' if VIEW=='along' else 'J1-B TYPE B (concept, ASSUMED sizes): ring unchanged in an underpass, roundabout RAISED to %.1f m on fill, R6 arm climbs, 4 ramps at 5 %% down to the ring'%PT),fontsize=11,weight='bold')
fig.savefig('docs/j300_typeb_view.png' if VIEW=='iso' else 'docs/j300_sections_view.png',dpi=100)

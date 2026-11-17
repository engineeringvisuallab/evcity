# STEP J1-c4a3 picture: gentle-bend N arm route (plan) + ground / road profile. python3 tools/j1-n-hybrid-plot.py docs j1c4_hyb_12.json out.png
import json, sys, numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt, math, csv
out=sys.argv[1]; fn=sys.argv[2]; png=sys.argv[3]
d=json.load(open(out+'/j1c4_raster.json')); nx,nz=d['nx'],d['nz']; h=np.array(d['h']).reshape(nz,nx)
r=json.load(open(out+'/'+fn)); P=np.array([[p['x'],p['z'],p['y']] for p in r['pts']])
fig,(ax,ax2)=plt.subplots(2,1,figsize=(9,12),gridspec_kw={'height_ratios':[3,1]})
ax.imshow(h,extent=[d['x0'],d['x0']+nx*20,d['z0']+nz*20,d['z0']],cmap='terrain',vmin=0,vmax=160)
xs=np.linspace(d['x0']+10,d['x0']+nx*20-10,nx); zs=np.linspace(d['z0']+10,d['z0']+nz*20-10,nz)
cs=ax.contour(xs,zs,h,levels=[30,50,80,120,200,300],colors='k',linewidths=.4); ax.clabel(cs,fontsize=6)
ax.contourf(xs,zs,np.array(d['wet']).reshape(nz,nx),levels=[.5,3],colors=['#3b8cff'],alpha=.7)
for q in d['rects']:
    ax.add_patch(plt.Rectangle((q['x0'],q['z0']),q['x1']-q['x0'],q['z1']-q['z0'],fill=False,ec='m',lw=1)); ax.text(q['x0']+10,q['z0']+60,q['id'],fontsize=6,color='m')
for e in d['rail']: ax.plot(e['xs'],e['zs'],'-',c='navy',lw=.8)
rg=np.array([(float(a[1]),float(a[2])) for a in csv.reader(open(out+'/ring_samples_5m.csv')) if a[0]!='station_m']); m=(rg[:,0]>d['x0'])&(rg[:,0]<d['x0']+nx*20)&(rg[:,1]<0); ax.plot(rg[m,0],rg[m,1],'.',c='darkorange',ms=1.5)
import os; jx=float(os.environ.get('J1X',-117)); jz=float(os.environ.get('J1Z',-277)); y=math.radians(float(os.environ.get('J1YAW',17.6))); ax.plot([jx,jx+340*math.sin(y)],[jz,jz-340*math.cos(y)],'k-',lw=3); ax.plot([jx],[jz],'ko'); ax.text(jx+25,jz+30,'J1',weight='bold')
ax.plot(P[:,0],P[:,1],'-',c='yellow',lw=2.5,label='gentle-bend search route, %.2f km'%((r['len']+280)/1000))
ax.set_xlim(-900,2500); ax.set_ylim(0,-3700); ax.set_aspect('equal'); ax.legend(loc='lower right'); ax.set_title('J1 N arm, nearly straight alignment (R >= 1000 m)')
s=np.concatenate([[0],np.cumsum(np.hypot(np.diff(P[:,0]),np.diff(P[:,1])))])
g=[h[int((p[1]-d['z0'])/20),int((p[0]-d['x0'])/20)] for p in P]
ax2.fill_between(s,g,0,color='#b08850',alpha=.6,label='ground'); ax2.plot(s,P[:,2],'r-',lw=2,label='road level'); ax2.set_xlabel('distance from J1 straight end (m)'); ax2.set_ylabel('level (m)'); ax2.legend(); ax2.set_ylim(0,max(70,max(g)+5))
fig.tight_layout(); fig.savefig(png,dpi=100); print('saved')

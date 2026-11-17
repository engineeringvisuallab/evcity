# STEP J1-c4a picture: N sector terrain, the old Roads.zip N line, rect zones, rail, J1, ring, search route. python3 tools/j1-n-plot.py docs [route.json] [out.png]
import json, sys, numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
out=sys.argv[1] if len(sys.argv)>1 else 'docs'; rj=sys.argv[2] if len(sys.argv)>2 else out+'/j1c4_route.json'; png=sys.argv[3] if len(sys.argv)>3 else out+'/j1c4a_route.png'
d=json.load(open(out+'/j1c4_raster.json')); nx,nz=d['nx'],d['nz']; h=np.array(d['h']).reshape(nz,nx)
ext=[d['x0'],d['x0']+nx*20,d['z0']+nz*20,d['z0']]
fig,ax=plt.subplots(figsize=(9,9.5))
ax.imshow(h,extent=ext,cmap='terrain',vmin=0,vmax=160,origin='upper'); 
cs=ax.contour(np.linspace(d['x0']+10,d['x0']+nx*20-10,nx),np.linspace(d['z0']+10,d['z0']+nz*20-10,nz),h,levels=[30,50,80,120,200,300],colors='k',linewidths=.4)
ax.clabel(cs,fontsize=6)
for r in d['rects']:
    ax.add_patch(plt.Rectangle((r['x0'],r['z0']),r['x1']-r['x0'],r['z1']-r['z0'],fill=False,ec='m',lw=1)); ax.text(r['x0']+10,r['z0']+60,r['id'],fontsize=6,color='m')
for e in d['rail']: ax.plot(e['xs'],e['zs'],'-',c='navy',lw=.8)
w=np.array(d['wet']).reshape(nz,nx); ax.contourf(np.linspace(d['x0']+10,d['x0']+nx*20-10,nx),np.linspace(d['z0']+10,d['z0']+nz*20-10,nz),w,levels=[.5,3],colors=['#3b8cff'],alpha=.7)
# old Roads.zip N line (record 3 = F4): x = E-5000, z = 5000-N
rec=json.load(open('/home/claude/roads.json')) if len(sys.argv)<5 else json.load(open(sys.argv[4]))
for r in rec:
    p=np.array(r['pts']); 
    if r['n']==3: ax.plot(p[:,0]-5000,5000-p[:,1],'r--',lw=1.4,label='Roads.zip N line (old shape)')
# J1, straight, ring
ax.plot([-117],[-277],'ko',ms=7); ax.text(-90,-250,'J1',fontsize=9,weight='bold')
import math; y=math.radians(17.6); ax.plot([-117,-117+340*math.sin(y)],[-277,-277-340*math.cos(y)],'k-',lw=2.5)
ax.plot([1711.5],[-3145.5],'s',c='darkorange',ms=8); ax.text(1730,-3120,'ring N st 11549',fontsize=8)
import csv
rg=[(float(a[1]),float(a[2])) for a in csv.reader(open(out+'/ring_samples_5m.csv')) if a[0]!='station_m']
rg=np.array(rg); m=(rg[:,0]>d['x0'])&(rg[:,0]<d['x0']+nx*20)&(rg[:,1]>d['z0'])&(rg[:,1]<0); ax.plot(rg[m,0],rg[m,1],'.',c='darkorange',ms=1.5)
for f,c,ls,lab in [('j1c4_route_3_10.json','yellow','-','A: cut<=3 m, fill<=10 m, zones kept  (6.16 km)'),('j1c4_route_free.json','cyan','--','B: zones ignored, fill<=10 m  (5.43 km)'),('j1c4_route_3_7.json','white',':','C: cut<=3 m, fill<=7 m  (7.90 km)')]:
    try:
        R=json.load(open(out+'/'+f)); p=np.array([[q['x'],q['z']] for q in R['path']]); ax.plot(p[:,0],p[:,1],ls,c=c,lw=2.2,label=lab)
    except Exception as e: print('no route',f,e)
ax.set_xlim(-900,2500); ax.set_ylim(0,-3700); ax.set_aspect('equal'); ax.legend(loc='lower right',fontsize=8); ax.set_title('J1 N arm: terrain (m), zones, rail, search route'); ax.set_xlabel('x east (m)'); ax.set_ylabel('z (south +)')
fig.tight_layout(); fig.savefig(png,dpi=110); print('saved',png)

# REDO 2026-11-20: plots are placed ONLY on land that is completely free in docs/city_nogo.json (scripts/city-nogo-map.ts). Order: move along the street, other side, another street, then shrink (not below table 4 minimum), else NOT PLACED.
# STEP 3 city plots: places the plots beside the 17 city streets and writes src/buildings/PlacementsPlots.ts (+ docs/city_plots_proposal.json, docs/city_plots_step2.png).
# Run from the project root: python3 tools/city-plots-plan.py   (input docs/city_plots_input.json = scripts/city-plots-dump.ts, made with the plots switch OFF)
import json, math, base64, collections
import numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MP
D=json.load(open('docs/city_plots_input.json'))
streets={s['name']:s['pts'] for s in D['streets']}
hand=D['hand']; fill=D['fill']
FRONT=14.0   # m from street centre to plot front edge (half road 7 + footpath 3 + gap 4)  ASSUMED
KEEP=12.0    # m min distance of a plot to ANY street centre line
def tang(pts,i):
    a=pts[max(0,i-1)];b=pts[min(len(pts)-1,i+1)];dx=b[0]-a[0];dz=b[1]-a[1];l=math.hypot(dx,dz);return dx/l,dz/l
def rect(pts,i,side,F,Dp):
    tx,tz=tang(pts,i);nx,nz=-tz*side,tx*side   # normal to chosen side
    cx,cz=pts[i][0]+nx*(FRONT+Dp/2),pts[i][1]+nz*(FRONT+Dp/2)
    c=[]
    for a,b in((-1,-1),(1,-1),(1,1),(-1,1)):
        c.append((cx+tx*F/2*a+nx*Dp/2*b, cz+tz*F/2*a+nz*Dp/2*b))
    gate=(pts[i][0]+nx*FRONT, pts[i][1]+nz*FRONT)
    return c,(cx,cz),gate
def sat(p,q):
    for poly in(p,q):
        for k in range(4):
            ax,az=poly[k];bx,bz=poly[(k+1)%4];ex,ez=bx-ax,bz-az;nx,nz=-ez,ex
            pa=[x*nx+z*nz for x,z in p];qa=[x*nx+z*nz for x,z in q]
            if max(pa)<min(qa) or max(qa)<min(pa):return False
    return True
def pt_poly_dist(px,pz,poly):
    # inside?
    ins=False
    for k in range(4):
        x1,z1=poly[k];x2,z2=poly[(k+1)%4]
        if (z1>pz)!=(z2>pz) and px<(x2-x1)*(pz-z1)/(z2-z1)+x1: ins=not ins
    if ins:return 0
    best=1e9
    for k in range(4):
        ax,az=poly[k];bx,bz=poly[(k+1)%4];dx,dz=bx-ax,bz-az
        t=max(0,min(1,((px-ax)*dx+(pz-az)*dz)/(dx*dx+dz*dz)));best=min(best,math.hypot(px-ax-t*dx,pz-az-t*dz))
    return best
def street_ok(poly):
    for n,p in streets.items():
        for i in range(len(p)):
            if pt_poly_dist(p[i][0],p[i][1],poly)<KEEP:
                # allow own-street front edge distance exactly FRONT (>KEEP) so this is a true conflict
                return False
    return True
KEEPOUT=[b for b in hand if not (b['id']=='hospital' and b['x']==220)]   # every hand placed building; only the old hospital is moved away
def bld_poly(b,m=4):
    r=max(b['W'],b['D'])/2+m;return [(b['x']-r,b['z']-r),(b['x']+r,b['z']-r),(b['x']+r,b['z']+r),(b['x']-r,b['z']+r)]
PLOTS=[]
NG=json.load(open('docs/city_nogo.json'))
MK=np.frombuffer(base64.b64decode(NG['mask']),dtype=np.uint8).reshape(NG['nz'],NG['nx'])
from scipy.ndimage import binary_dilation
WET=np.frombuffer(base64.b64decode(NG['wet']),dtype=np.uint8).reshape(NG['nz'],NG['nx'])>0
WETD=binary_dilation(WET,iterations=3)   # 3 cells x 4 m = 12 m around wet ground
HARD=1|4|8|16|32      # road, 17 streets (12 m), rail (30 m from axis), keep-out sites, water (+30 m), hand building (+4 m)
BITN={1:'road',2:'street<12m',4:'rail<30m',8:'keep-out site',16:'water',32:'building',128:'rail<100m'}
DIM={}
for b in hand:DIM.setdefault(b['id'],(b['W'],b['D']))
DIM['police_station']=(54,46)
# RELAXED 2026-11-20 (user: "kisu rule change and kisu area komiye bosatw") for the 4 plots that were NOT PLACED: hospital min 3.0 ha (was 5), university 2.2 ha compact campus (was 9), high school 0.7 ha (was 1.0), mall 0.7 ha (was 1.5); street keep 9 m (was 12), water only wet + 10 m (was 30 m), hospital rail >= 30 m (was 100 m). Rail 30 m from the axis stays.
RELAXED=('Hospital','University','Mall')
MINHA=[('Hospital',3.0),('University',2.2),('College',2.0),('Madrasah',0.8),('High school',0.7),('Primary school',0.4),('Police',0.3),('Mall',0.7),('Mosque',0.2),('Clinic',0.15),('Diagnostic',0.15),('Office tower',0.4),('Office mid',0.25),('Bank',0.25),('Hotel',0.25),('Park',0.3),('Empty reserve',0.3)]
def minha(prog):
    for k,v in MINHA:
        if prog.startswith(k):return v
    return 0.3
def inflate(poly,m):
    cx=sum(a for a,b in poly)/4;cz=sum(b for a,b in poly)/4;o=[]
    for a,b in poly:
        d=math.hypot(a-cx,b-cz);o.append((a+(a-cx)/d*m*1.41,b+(b-cz)/d*m*1.41))
    return o
def cells(poly,step=5.0):
    q=poly;L1=math.hypot(q[1][0]-q[0][0],q[1][1]-q[0][1]);L2=math.hypot(q[3][0]-q[0][0],q[3][1]-q[0][1])
    n1=max(2,int(L1/step)+2);n2=max(2,int(L2/step)+2);u=np.linspace(0,1,n1)[:,None];v=np.linspace(0,1,n2)[None,:]
    X=(1-u)*((1-v)*q[0][0]+v*q[3][0])+u*((1-v)*q[1][0]+v*q[2][0]);Z=(1-u)*((1-v)*q[0][1]+v*q[3][1])+u*((1-v)*q[1][1]+v*q[2][1])
    ii=np.floor((X-NG['x0'])/NG['cell']).astype(int);jj=np.floor((Z-NG['z0'])/NG['cell']).astype(int)
    if ii.min()<0 or jj.min()<0 or ii.max()>=NG['nx'] or jj.max()>=NG['nz']:return None
    return MK[jj,ii],X,Z
def land_ok(poly,kind,prog,why=None):
    r=cells(inflate(poly,1.5))
    if r is None:return False
    m,X,Z=r
    dd,_=STREET_TREE.query(np.stack([X.ravel(),Z.ravel()],1))
    rel=prog.startswith(RELAXED)
    if (dd<(9.0 if rel else KEEP)).any():
        if why is not None:why['street<12m']+=1
        return False
    bad=m&(HARD&~16 if rel else HARD)
    if rel:
        if (WETD[(np.floor((Z-NG['z0'])/NG['cell'])).astype(int),(np.floor((X-NG['x0'])/NG['cell'])).astype(int)]).any():
            if why is not None:why['water<10m']+=1
            return False
    if bad.any():
        if why is not None:
            for bit in BITN:
                if (bad&bit).any():why[BITN[bit]]+=1
        return False
    return float(((m&64)>0).mean())<=(0.12 if kind=='inst' else 0.35)
from scipy.spatial import cKDTree
def _dense(pts,step=3.0):
    o=[]
    for k in range(1,len(pts)):
        a=pts[k-1];b=pts[k];L=math.hypot(b[0]-a[0],b[1]-a[1]);n=max(1,int(L/step))
        for t in range(n+1):o.append((a[0]+(b[0]-a[0])*t/n,a[1]+(b[1]-a[1])*t/n))
    return o
STREET_TREE=cKDTree(np.array([q for p in streets.values() for q in _dense(p)]))
PLOTS=[]
EXTRA=[]   # buildings that STAY because their plot was NOT PLACED (the old hospital)
def free(poly,kind,prog,why=None):
    ip=inflate(poly,3)
    for b in EXTRA:
        if sat(ip,bld_poly(b,4)):return False
    for q in PLOTS:
        if sat(ip,inflate(q['poly'],3)):return False
    return land_ok(poly,kind,prog,why)
def resample(pts,step=6.0):
    o=[tuple(pts[0])]
    for k in range(1,len(pts)):
        a=pts[k-1];b=pts[k];L=math.hypot(b[0]-a[0],b[1]-a[1]);n=max(1,int(L/step))
        for t in range(1,n+1):o.append((a[0]+(b[0]-a[0])*t/n,a[1]+(b[1]-a[1])*t/n))
    return o
RS={n:resample(p) for n,p in streets.items()}
NOTPLACED=[]
def place(prog,kind,model,F,Dp,streets_pref,note='',skip_every=0):
    mh=minha(prog);W0,D0=(DIM.get(model.split('+')[0].split(' ')[0],(0,0)) if kind=='inst' else (0,0))
    if model.startswith('mosque'):W0,D0=DIM['mosque']
    others=sorted([n for n in streets if n not in streets_pref],key=lambda n:min(math.hypot(a[0]-streets[streets_pref[0]][len(streets[streets_pref[0]])//2][0],a[1]-streets[streets_pref[0]][len(streets[streets_pref[0]])//2][1]) for a in streets[n]))
    order=list(streets_pref)+others
    why=collections.Counter()
    for sc in((1.0,0.92,0.85,0.78,0.7,0.6,0.5,0.45) if prog.startswith(RELAXED) else (1.0,0.85,0.7,0.55)):
        F2,D2=F*sc,Dp*sc
        if F2*D2/1e4<mh-1e-9 and sc<1.0:break
        if kind=='inst' and (F2<W0+8 or D2<D0+10):break
        for sn in order:
            pts=RS[sn]
            for side in(1,-1):
                for i in range(1,len(pts)-1):
                    poly,c,g=rect(pts,i,side,F2,D2)
                    if free(poly,kind,prog,why if sc==1.0 and sn in streets_pref else None):
                        PLOTS.append(dict(prog=prog,kind=kind,model=model,street=sn,poly=poly,c=c,gate=g,F=F2,D=D2,ha=F2*D2/1e4,sc=sc,note=note+(' (shrunk x%.2f)'%sc if sc<1 else '')+(' (moved to %s)'%sn if sn not in streets_pref else '')));return True
    reason=', '.join('%s %d'%(k,v) for k,v in why.most_common(3)) or 'no free place'
    print('NOT PLACED',prog,'%.0fx%.0f'%(F,Dp),'| blocked by:',reason)
    NOTPLACED.append(dict(prog=prog,F=F,D=Dp,reason=reason))
    if prog.startswith('Hospital'):EXTRA.extend([b for b in hand if b['id']=='hospital' and b['x']==220]);print('   -> the OLD hospital (220,-250) STAYS where it is (not dropped)')
    return False
# ---- anchor: existing hospital (220,-250) beside SH-25 (plot 250 x 200 = 5 ha)
hos=[b for b in hand if b['id']=='hospital'][0]
pts=streets['SH-25'];bi=min(range(len(pts)),key=lambda i:math.hypot(pts[i][0]-hos['x'],pts[i][1]-hos['z']))
# choose side where hospital lies
def _in(x,z,poly):
    ins=False
    for k in range(4):
        x1,z1=poly[k];x2,z2=poly[(k+1)%4]
        if (z1>z)!=(z2>z) and x<(x2-x1)*(z-z1)/(z2-z1)+x1: ins=not ins
    return ins
place('Hospital (existing building moved here)','inst','hospital',250,200,['SH-25','SH-20'],'5 ha, outer side; 2nd gate needed')
# ---- WEST / EDU
place('University campus','inst','university-building+engineering-lab+dormitory',300,300,['SH-4','SH-5'],'9 ha')
place('College','inst','college',150,150,['SH-4','SH-5'])
place('Madrasah','inst','mosque (model) + empty yard',130,120,['SH-4','SH-5','SH-3'],'existing mosque model used')
place('Mosque','inst','mosque',80,76,['SH-4','SH-5','SH-1+2'])
# ---- CORE
for sn in ['SH-17','SH-6+15','SH-7+16']:pass
place('Office tower','inst','office-tower',70,70,['SH-17','SH-6+15'])
place('Office tower','inst','office-tower',70,70,['SH-6+15','SH-7+16'])
place('Office mid','inst','office-mid',50,50,['SH-17','SH-7+16'])
place('Office mid','inst','office-mid',50,50,['SH-9+13','SH-7+16'])
place('Bank','inst','bank',45,40,['SH-17','SH-9+13'])
place('Hotel','inst','hotel-3star',60,50,['SH-9+13','SH-12+14'])
place('Park (empty + trees)','park','',140,90,['SH-17','SH-7+16'])
place('Park (empty + trees)','park','',140,90,['SH-9+13','SH-12+14'])
place('Mosque','inst','mosque',80,76,['SH-6+15','SH-7+16'])
place('Primary school','inst','primary-school',80,70,['SH-6+15','SH-7+16'])
place('Clinic','inst','clinic',50,50,['SH-7+16','SH-17'])
place('Empty reserve (boundary only)','empty','',100,100,['SH-12+14','SH-8+11'])
# ---- STATION side / south
place('Mosque','inst','mosque',80,76,['SH-12+14','SH-8+11'])
place('Primary school','inst','primary-school',80,70,['SH-8+11','SH-10'])
place('High school','inst','high-school',110,100,['SH-8+11','SH-6+15'])
place('Clinic','inst','clinic',50,50,['SH-8+11','SH-10'])
place('Police (local)','inst','police_station',80,70,['SH-8+11','SH-19'])
place('Park (empty + trees)','park','',140,90,['SH-8+11','SH-10'])
# ---- BAZAAR south
place('Mall','inst','mall',200,150,['SH-19','SH-18'])
place('Mosque','inst','mosque',80,76,['SH-19','SH-18'])
place('Primary school','inst','primary-school',80,70,['SH-18','SH-19'])
place('Clinic','inst','clinic',50,50,['SH-19','SH-18'])
place('Park (empty + trees)','park','',140,90,['SH-18','SH-19'])
place('Empty reserve (boundary only)','empty','',100,100,['SH-10','SH-3','SH-18'])
# ---- SW homes
place('Mosque','inst','mosque',80,76,['SH-1+2','SH-3'])
place('Primary school','inst','primary-school',80,70,['SH-1+2','SH-3'])
place('Clinic','inst','clinic',50,50,['SH-1+2','SH-3'])
place('Park (empty + trees)','park','',140,90,['SH-1+2','SH-3'])
place('Empty reserve (boundary only)','empty','',100,100,['SH-1+2','SH-3'])
# ---- NE
place('Mall','inst','mall',200,150,['SH-20'])
place('Office mid','inst','office-mid',50,50,['SH-20','SH-25'])
place('Office tower','inst','office-tower',70,70,['SH-20','SH-25'])
place('Mosque','inst','mosque',80,76,['SH-20','SH-23+24','SH-21+22'])
place('Primary school','inst','primary-school',80,70,['SH-20','SH-23+24'])
place('Diagnostic','inst','diagnostic',50,40,['SH-25','SH-23+24'])
place('Clinic','inst','clinic',50,50,['SH-23+24','SH-21+22'])
place('Park (empty + trees)','park','',140,90,['SH-23+24','SH-21+22','SH-20'])
place('Empty reserve (boundary only)','empty','',100,100,['SH-21+22','SH-23+24','SH-20'])
# ---- report
tot={}
for p in PLOTS:tot[p['kind']]=tot.get(p['kind'],0)+p['ha']
print('plots',len(PLOTS),{k:round(v,1) for k,v in tot.items()},'total ha',round(sum(tot.values()),1))
for p in PLOTS:
    nf=sum(1 for b in fill if sat(p['poly'],[(b['x']-b['W']/2,b['z']-b['D']/2),(b['x']+b['W']/2,b['z']-b['D']/2),(b['x']+b['W']/2,b['z']+b['D']/2),(b['x']-b['W']/2,b['z']+b['D']/2)]))
    p['fill_houses']=nf
    print(f"{p['prog']:32s} {p['street']:9s} {p['F']:.0f}x{p['D']:.0f}={p['ha']:.2f} ha  centre({p['c'][0]:.0f},{p['c'][1]:.0f})  houses_inside={nf}")
json.dump([{k:v for k,v in p.items()} for p in PLOTS],open('docs/city_plots_proposal.json','w'))
# ---- picture
COL={'inst':'#4c78a8','park':'#59a14f','empty':'#bab0ac'}
fig,ax=plt.subplots(figsize=(18,13),dpi=90)
for b in fill:ax.add_patch(MP([(b['x']-b['W']/2,b['z']-b['D']/2),(b['x']+b['W']/2,b['z']-b['D']/2),(b['x']+b['W']/2,b['z']+b['D']/2),(b['x']-b['W']/2,b['z']+b['D']/2)],fc='#ddd',ec='none'))
for n,p in streets.items():
    ax.plot([a[0] for a in p],[a[1] for a in p],'k-',lw=2);ax.text(p[len(p)//2][0],p[len(p)//2][1],n,fontsize=7,color='#c00')
for b in hand:
    if b['x']>-900 and b['x']<1400 and b['z']>-700 and b['z']<1300 and b['id'] not in('petrol-pump',):
        ax.add_patch(MP([(b['x']-b['W']/2,b['z']-b['D']/2),(b['x']+b['W']/2,b['z']-b['D']/2),(b['x']+b['W']/2,b['z']+b['D']/2),(b['x']-b['W']/2,b['z']+b['D']/2)],fc='#f28e2b',ec='k',lw=.5));ax.text(b['x'],b['z'],b['id'],fontsize=5)
for p in PLOTS:
    ax.add_patch(MP(p['poly'],fc=COL[p['kind']],ec='k',lw=1,alpha=.55))
    ax.plot(*p['gate'],'rs',ms=4)
    ax.text(p['c'][0],p['c'][1],p['prog'].split(' (')[0],fontsize=6,ha='center',va='center')
ax.set_aspect('equal');ax.invert_yaxis();ax.set_xlim(-900,1300);ax.set_ylim(1250,-650)
ax.set_title('Step 2 proposal: blue=building plot, green=park (empty+trees), grey=empty reserve (boundary only), red square=gate, orange=existing hand-placed building, light grey=houses');
plt.savefig('docs/city_plots_step2.png',bbox_inches='tight')

# ---------------- STEP 3: buildings inside the plots + the TypeScript data file ----------------
DIM={}
for b in hand:DIM.setdefault(b['id'],(b['W'],b['D']))
DIM['police_station']=(54,46)
def layout(pl):
    """list of (model id, u along the road from the plot middle, v inward from the front edge to the model centre)"""
    m=pl['model'];kind=pl['kind']
    if kind!='inst':return []
    if m.startswith('university-building'):
        F,Dd2=pl['F'],pl['D'];return [('university-building',0,8+27),('engineering-lab',-F*0.25,Dd2*0.62),('dormitory',F*0.28,Dd2*0.70)]
    if m.startswith('mosque'):
        W,Dd=DIM['mosque'];return [('mosque',0,max(6,(pl['D']-Dd)/2*0.5)+Dd/2)]
    W,Dd=DIM[m];s=min(10,max(4,(pl['D']-Dd)/2))
    return [(m,0,s+Dd/2)]
OUT=[];BLD=[]
for k,pl in enumerate(PLOTS):
    q=pl['poly'];M=((q[0][0]+q[1][0])/2,(q[0][1]+q[1][1])/2);B=((q[2][0]+q[3][0])/2,(q[2][1]+q[3][1])/2)
    ln=math.hypot(B[0]-M[0],B[1]-M[1]);n=((B[0]-M[0])/ln,(B[1]-M[1])/ln);d=(-n[0],-n[1])
    tl=math.hypot(q[1][0]-q[0][0],q[1][1]-q[0][1]);t=((q[1][0]-q[0][0])/tl,(q[1][1]-q[0][1])/tl)
    gus=[-70,80] if pl['prog'].startswith('Hospital') else [0]
    gates=[(M[0]+t[0]*u,M[1]+t[1]*u) for u in gus]
    yaw=math.atan2(d[0],d[1])
    pid='PL-%02d'%(k+1);pl['id']=pid
    items=layout(pl);inside_ok=True
    for (mid,u,v) in items:
        W,Dd=DIM[mid];x=M[0]+t[0]*u+n[0]*v;z=M[1]+t[1]*u+n[1]*v
        BLD.append(dict(id=mid,x=round(x,1),z=round(z,1),yaw=round(yaw,4),W=W,D=Dd,zone='city-plot',seed=1000+k))
        # footprint must lie fully inside the plot, >= 2 m from the wall
        c,sn=math.cos(yaw),math.sin(yaw)
        for a in(-1,1):
            for b in(-1,1):
                px=x+(a*W/2)*c+(b*Dd/2)*sn;pz=z-(a*W/2)*sn+(b*Dd/2)*c
                lu=(px-M[0])*t[0]+(pz-M[1])*t[1];lv=(px-M[0])*n[0]+(pz-M[1])*n[1]
                if not(-pl['F']/2+2<=lu<=pl['F']/2-2 and 2<=lv<=pl['D']-2):inside_ok=False
    pl['inside_ok']=inside_ok
    OUT.append(dict(id=pid,prog=pl['prog'],kind=pl['kind'],street=pl['street'],ha=round(pl['ha'],2),c=[round(pl['c'][0],1),round(pl['c'][1],1)],poly=[[round(a,1),round(b,1)] for a,b in q],gates=[[round(a,1),round(b,1)] for a,b in gates],dir=[round(d[0],4),round(d[1],4)]))
print('buildings in plots:',len(BLD),' plots where a footprint leaves the plot:',[p['id'] for p in PLOTS if not p['inside_ok']])
js=lambda o:json.dumps(o,separators=(',',':'))
ts=[]
ts.append("// GENERATED by tools/city-plots-plan.py (STEP 3, city plots). Do not edit by hand: rerun the tool.")
ts.append("// Land plots beside the 17 city streets (City_Road.shp streets): each plot has a boundary wall, a gate ONLY on the road side (hospital: two) and trees inside; building plots also carry existing building models.")
ts.append("// Switch: Config.city.plots.enabled (false = no plot, no wall, no new building, the old hospital and the houses inside the plots stay as before).")
ts.append("// poly = 4 corners (corners 0-1 are the road-side edge), gates = gate centres on that edge, dir = unit vector plot -> street (the model front looks along it), world metres x east / z south.")
ts.append("import type { BuildingPlacement } from './Placements';")
ts.append("import { Config } from '../core/Config';")
ts.append("")
ts.append("export interface CityPlot { id: string; prog: string; kind: 'inst' | 'park' | 'empty'; street: string; ha: number; c: [number, number]; poly: [number, number][]; gates: [number, number][]; dir: [number, number] }")
ts.append("")
ts.append("const PLOTS_ALL: readonly CityPlot[] = [")
for o in OUT:ts.append("  "+js(o)+",")
ts.append("] as unknown as readonly CityPlot[];")
ts.append("")
ts.append("const BUILDINGS_ALL: readonly BuildingPlacement[] = [")
for b in BLD:ts.append("  "+js(b)+",")
ts.append("];")
ts.append("")
ts.append("export const CITY_PLOTS: readonly CityPlot[] = Config.city.plots.enabled ? PLOTS_ALL : [];")
ts.append("export const CITY_PLOT_BUILDINGS: readonly BuildingPlacement[] = Config.city.plots.enabled ? BUILDINGS_ALL : [];")
ts.append("/** The old hand placed hospital (Placements.ts, 220 / -250) is replaced by the hospital in its plot beside SH-25. */")
ts.append("export const CITY_PLOT_REPLACES: { id: string; x: number; z: number } | null = "+("Config.city.plots.enabled ? { id: 'hospital', x: 220, z: -250 } : null;" if any(p['prog'].startswith('Hospital') for p in PLOTS) else "null; // the hospital plot is NOT PLACED: the old hospital stays"))
ts.append("")
ts.append("/** Is (x, z) inside a plot (+ margin m)? Used to drop the city-fill houses that stand inside a plot. */")
ts.append("export function insideCityPlot(x: number, z: number, margin = 0): boolean {")
ts.append("  for (const p of CITY_PLOTS) {")
ts.append("    if (Math.abs(x - p.c[0]) > 260 || Math.abs(z - p.c[1]) > 260) continue;")
ts.append("    let neg = false, pos = false;")
ts.append("    for (let i = 0; i < 4; i++) {")
ts.append("      const a = p.poly[i]!, b = p.poly[(i + 1) % 4]!;")
ts.append("      const ex = b[0] - a[0], ez = b[1] - a[1], len = Math.hypot(ex, ez);")
ts.append("      const cr = (ex * (z - a[1]) - ez * (x - a[0])) / len; // signed distance to the edge line")
ts.append("      if (cr < -margin) neg = true; else if (cr > margin) pos = true;")
ts.append("    }")
ts.append("    if (!(neg && pos)) return true;")
ts.append("  }")
ts.append("  return false;")
ts.append("}")
open('src/buildings/PlacementsPlots.ts','w',newline='').write("\r\n".join(ts)+"\r\n")
print('wrote src/buildings/PlacementsPlots.ts',len(OUT),'plots',len(BLD),'buildings')

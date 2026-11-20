# plots-spread.py : plots er majher faka (gap) 1.2x kore.
# GAP = free distance between two neighbouring plots along the road. New gap = old gap x FACTOR (plot size does not change).
# Run (project root): python3 tools/plots-spread.py [FACTOR] [in.json] [out_prefix]
# Input : EVCity_Plots_1500m.json (+ .csv)   Output: <prefix>.json / .csv / _report.txt / _compare.png
import json, math, sys, csv, base64, heapq, collections
import numpy as np
F  = float(sys.argv[1]) if len(sys.argv) > 1 else 1.2
IN = sys.argv[2] if len(sys.argv) > 2 else 'EVCity_Plots_1500m.json'
OUT= sys.argv[3] if len(sys.argv) > 3 else 'EVCity_Plots_1500m_spaced'
NOGO = 'docs/city_nogo.json'
D = json.load(open(IN)); P = D['plots']
def edge(p):                      # road-side edge of plot = edge nearest to entry_point
    pg=p['polygon']; e=p['entry_point']; b=None
    for k in range(4):
        a=pg[k]; c=pg[(k+1)%4]; dx,dz=c[0]-a[0],c[1]-a[1]; L=math.hypot(dx,dz)
        t=max(0,min(1,((e[0]-a[0])*dx+(e[1]-a[1])*dz)/L/L)); d=math.hypot(e[0]-a[0]-t*dx,e[1]-a[1]-t*dz)
        if b is None or d<b[0]: b=(d,(dx/L,dz/L),L)
    return b[1],b[2]
for p in P:
    p['_t'],p['_fw']=edge(p)
    cx=sum(c[0] for c in p['polygon'])/4; cz=sum(c[1] for c in p['polygon'])/4; p['_c']=(cx,cz)
    nx,nz=p['entry_point'][0]-cx,p['entry_point'][1]-cz; l=math.hypot(nx,nz) or 1; p['_n']=(nx/l,nz/l)
# ---- rows = same road, same side, connected along the road
rows=[]
by=collections.defaultdict(list)
for i,p in enumerate(P): by[p['road']].append(i)
for road,ids in by.items():
    adj={i:[] for i in ids}
    for a in ids:
        for b in ids:
            if a>=b: continue
            pa,pb=P[a],P[b]
            if pa['_n'][0]*pb['_n'][0]+pa['_n'][1]*pb['_n'][1] < 0.8: continue
            dx=pb['entry_point'][0]-pa['entry_point'][0]; dz=pb['entry_point'][1]-pa['entry_point'][1]
            if math.hypot(dx,dz) > 140 or abs(dx*pa['_n'][0]+dz*pa['_n'][1]) > 25: continue
            adj[a].append((b,math.hypot(dx,dz))); adj[b].append((a,math.hypot(dx,dz)))
    seen=set()
    for s in ids:
        if s in seen: continue
        comp=[];st=[s];seen.add(s)
        while st:
            u=st.pop();comp.append(u)
            for v,_ in adj[u]:
                if v not in seen: seen.add(v);st.append(v)
        def dij(src):
            d={src:0.0};h=[(0.0,src)]
            while h:
                du,u=heapq.heappop(h)
                if du>d[u]: continue
                for v,w in adj[u]:
                    if du+w<d.get(v,1e18): d[v]=du+w;heapq.heappush(h,(d[v],v))
            return d
        if len(comp)>1:
            d0=dij(comp[0]); A=max(d0,key=d0.get); dA=dij(A)
            rows.append((road,sorted(comp,key=lambda i:dA[i]),dA))
        else: rows.append((road,comp,{comp[0]:0.0}))
# ---- geometry helpers
def sat(p,q):
    for poly in (p,q):
        for k in range(4):
            ax,az=poly[k];bx,bz=poly[(k+1)%4];nx,nz=-(bz-az),bx-ax;ln=math.hypot(nx,nz) or 1;nx,nz=nx/ln,nz/ln
            pa=[x*nx+z*nz for x,z in p];qa=[x*nx+z*nz for x,z in q]
            if max(pa)<=min(qa)+0.30 or max(qa)<=min(pa)+0.30: return False
    return True
def bb(poly): return (min(c[0] for c in poly),min(c[1] for c in poly),max(c[0] for c in poly),max(c[1] for c in poly))
def shifted(poly,dx,dz): return [[c[0]+dx,c[1]+dz] for c in poly]
NG=json.load(open(NOGO)); MK=np.frombuffer(base64.b64decode(NG['mask']),dtype=np.uint8).reshape(NG['nz'],NG['nx'])
WET=np.frombuffer(base64.b64decode(NG['wet']),dtype=np.uint8).reshape(NG['nz'],NG['nx'])>0
HARD=1|4|8|16   # road, rail, keep-out site, water (bit 2 = the 17 streets 12 m rule is NOT used: plots sit beside them by design)
def hard_count(poly):
    x0,z0,x1,z1=bb(poly);n=0
    gx=np.arange(math.floor(x0/4)*4,x1+4,4.0);gz=np.arange(math.floor(z0/4)*4,z1+4,4.0)
    for z in gz:
        for x in gx:
            # point inside polygon (convex quad)
            s=[(poly[(k+1)%4][0]-poly[k][0])*(z-poly[k][1])-(poly[(k+1)%4][1]-poly[k][1])*(x-poly[k][0]) for k in range(4)]
            if not(all(v>=0 for v in s) or all(v<=0 for v in s)): continue
            ix=int((x-NG['x0'])//NG['cell']);iz=int((z-NG['z0'])//NG['cell'])
            if 0<=ix<NG['nx'] and 0<=iz<NG['nz'] and ((MK[iz,ix]&HARD) or WET[iz,ix]): n+=1
    return n
base_hard=[hard_count(p['polygon']) for p in P]
shift=[(0.0,0.0)]*len(P); cur=[[c[:] for c in p['polygon']] for p in P]
boxes=[bb(c) for c in cur]
def conflicts(i,poly,skip=()):
    b=bb(poly)
    for j in range(len(P)):
        if j==i or j in skip: continue
        q=boxes[j]
        if b[2]<q[0] or q[2]<b[0] or b[3]<q[1] or q[3]<b[1]: continue
        if sat(poly,cur[j]): return j
    return None
base_ov=set()
for i in range(len(P)):
    for j in range(i+1,len(P)):
        a,b=bb(P[i]['polygon']),bb(P[j]['polygon'])
        if a[2]<b[0] or b[2]<a[0] or a[3]<b[1] or b[3]<a[1]: continue
        if sat(P[i]['polygon'],P[j]['polygon']): base_ov.add((i,j))
def core(poly,k=0.5):                       # polygon shrunk toward its centre (road/rail/water test only on the core)
    cx=sum(c[0] for c in poly)/4;cz=sum(c[1] for c in poly)/4
    return [[cx+(c[0]-cx)*k,cz+(c[1]-cz)*k] for c in poly]
base_core=[hard_count(core(p['polygon'])) for p in P]
def feasible(i,poly):
    j=conflicts(i,poly)
    if j is not None and (min(i,j),max(i,j)) not in base_ov: return False
    return hard_count(core(poly))<=base_core[i]
rowinfo=[];gapstat=[]
def fmid(p):                               # middle of the road-side edge and its tangent / width
    pg=p['polygon'];e=p['entry_point'];best=None
    for k in range(4):
        a=pg[k];c=pg[(k+1)%4];dx,dz=c[0]-a[0],c[1]-a[1];L=math.hypot(dx,dz)
        t=max(0,min(1,((e[0]-a[0])*dx+(e[1]-a[1])*dz)/L/L));d=math.hypot(e[0]-a[0]-t*dx,e[1]-a[1]-t*dz)
        if best is None or d<best[0]: best=(d,((a[0]+c[0])/2,(a[1]+c[1])/2),L)
    return best[1],best[2]
for road,order,dA in rows:
    n=len(order)
    if n<2: rowinfo.append((road,n,0.0,0.0,'single')); continue
    mids=[fmid(P[i]) for i in order]
    def tang(k):
        i=order[k];a=mids[max(0,k-1)][0];b=mids[min(n-1,k+1)][0]
        tx,tz=b[0]-a[0],b[1]-a[1];l=math.hypot(tx,tz) or 1;tx,tz=tx/l,tz/l
        ex,ez=P[i]['_t']
        return (ex,ez) if ex*tx+ez*tz>=0 else (-ex,-ez)
    # gap between plot k-1 and k along the road
    gaps=[0.0]
    for k in range(1,n):
        tx,tz=tang(k);m0,m1=mids[k-1][0],mids[k][0]
        du=(m1[0]-m0[0])*tx+(m1[1]-m0[1])*tz
        g=du-(mids[k-1][1]+mids[k][1])/2
        gaps.append(g)
    gapstat+=[g for g in gaps[1:]]
    cidx=n//2
    extra=[0.0]*n                              # signed extra shift (m) of plot k along its tangent, 0 at the centre plot
    for k in range(cidx+1,n): extra[k]=extra[k-1]+(F-1.0)*max(0.0,gaps[k])
    for k in range(cidx-1,-1,-1): extra[k]=extra[k+1]-(F-1.0)*max(0.0,gaps[k+1])
    full=0;red=0;prev=None
    for direction in (1,-1):
        k=cidx+direction;prevd=0.0
        while 0<=k<n:
            i=order[k];want=extra[k];got=None
            for fr in (1.0,0.75,0.5,0.25,0.0):
                d=prevd+(want-prevd)*fr;ex,ez=tang(k);poly=shifted(P[i]['polygon'],ex*d,ez*d)
                if feasible(i,poly): got=(d,poly,ex,ez,fr);break
            if got is None: d=prevd;ex,ez=tang(k);got=(d,shifted(P[i]['polygon'],ex*d,ez*d),ex,ez,-1.0)
            d,poly,ex,ez,fr=got;cur[i]=poly;boxes[i]=bb(poly);shift[i]=(ex*d,ez*d);prevd=d
            full+=(fr==1.0);red+=(fr<1.0);k+=direction
    mx=max(math.hypot(*shift[i]) for i in order)
    rowinfo.append((road,n,full/(n-1),mx,'%d of %d full, %d reduced, avg gap %.1f m'%(full,n-1,red,sum(gaps[1:])/(n-1))))
# ---- cleanup: no plot may end with a NEW overlap or NEW road/rail/water cells; such a plot goes back to its old place
def new_conf(i):
    b=bb(cur[i])
    for j in range(len(P)):
        if j==i or (min(i,j),max(i,j)) in base_ov: continue
        q=boxes[j]
        if b[2]<q[0] or q[2]<b[0] or b[3]<q[1] or q[3]<b[1]: continue
        if sat(cur[i],cur[j]): return True
    return False
def revert(i): cur[i]=[c[:] for c in P[i]['polygon']];boxes[i]=bb(cur[i]);shift[i]=(0.0,0.0)
reverted=set()
for _ in range(20):
    changed=False
    for i in range(len(P)):
        bad=new_conf(i) or hard_count(core(cur[i]))>base_core[i]
        if bad: revert(i);reverted.add(i);changed=True
    if not changed: break
# ---- write
for i,p in enumerate(P):
    dx,dz=shift[i]
    p['polygon']=[[round(c[0]+dx,2),round(c[1]+dz,2)] for c in p['polygon']]
    p['entry_point']=[round(p['entry_point'][0]+dx,2),round(p['entry_point'][1]+dz,2)]
    for b in p.get('buildings',[]): b['x']=round(b['x']+dx,2);b['z']=round(b['z']+dz,2)
    for k in ('_t','_fw','_c','_n'): p.pop(k)
D['note']=D['note']+' | spaced: plots slid along the road, pitch x%.2f (tools/plots-spread.py)'%F
json.dump(D,open(OUT+'.json','w'))
byid={p['plot_id']:p for p in P};sh={P[i]['plot_id']:shift[i] for i in range(len(P))}
rd=list(csv.DictReader(open(IN.replace('.json','.csv'),encoding='utf-8-sig'),delimiter=','))
with open(OUT+'.csv','w',newline='') as fh:
    w=csv.DictWriter(fh,fieldnames=list(rd[0].keys()));w.writeheader()
    for r in rd:
        if not r['plot_id'].strip().isdigit(): w.writerow(r); continue   # NO-ROAD-FRONTAGE rows: not placed, unchanged
        dx,dz=sh[int(r['plot_id'])]
        if r['bldg_x']!='' :
            r['bldg_x']=round(float(r['bldg_x'])+dx,1);r['bldg_z']=round(float(r['bldg_z'])+dz,1)
            if r.get('old_x','')!='': r['moved_m']=round(math.hypot(float(r['bldg_x'])-float(r['old_x']),float(r['bldg_z'])-float(r['old_z'])))
        w.writerow(r)
# ---- report
newov=0
for i in range(len(P)):
    for j in range(i+1,len(P)):
        a,b=bb(P[i]['polygon']),bb(P[j]['polygon'])
        if a[2]<b[0] or b[2]<a[0] or a[3]<b[1] or b[3]<a[1]: continue
        if sat(P[i]['polygon'],P[j]['polygon']) and (i,j) not in base_ov: newov+=1
nmv=sum(1 for s in shift if abs(s[0])+abs(s[1])>0.05)
L=['GAP FACTOR %.2f  plots %d  rows %d  plots moved %d  max shift %.1f m'%(F,len(P),len(rows),nmv,max(math.hypot(*s) for s in shift)),
   'plot-plot overlap deeper than 0.3 m: before %d, new %d'%(len(base_ov),newov),'neighbour gap (median / mean / share <0.5 m): %.1f / %.1f / %.2f m'%(float(np.median(gapstat)),float(np.mean(gapstat)),float(np.mean(np.array(gapstat)<0.5))),
   'plots put back to the old place because the new place hit a road, rail, water or another plot: %d'%len(reverted),'hard cells (road/rail/water) in plots: before %d, after %d'%(sum(base_hard),sum(hard_count([[c[0],c[1]] for c in p['polygon']]) for p in P)),'']
for r in sorted(rowinfo,key=lambda r:-r[1]): L.append('%-12s plots %3d  full-share %.2f  max shift %5.1f m  %s'%r)
open(OUT+'_report.txt','w').write('\n'.join(L))
print('\n'.join(L[:3]));

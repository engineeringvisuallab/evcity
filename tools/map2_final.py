"""MAP-2 part 5: extension + refit, clip, taps, planarize, R2 need rule, ground check, pictures, report."""
import sys, json, math, os, subprocess, pickle
import numpy as np
from scipy.spatial import cKDTree
import map2_align as AL
from map2_net import *
from map2_plan import *
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.colors import to_rgb

def near8_tree(eight):
    XY=np.vstack([dense(r['pts'],5)[0] for r in eight]); return cKDTree(XY)

def extend_and_refit(lines,eight,maxd=70.0,maxang=55.0,over=12.0):
    t8=near8_tree(eight); n=0; rep=[]
    for L in lines:
        if not hasattr(L,'ext'): L.ext=[False,False]
    for L in lines:
        if L.built: continue
        raw=np.array(L.raw); ch=False
        for e in (0,1):
            if L.ext[e]: continue
            p=L.pts[0] if e==0 else L.pts[-1]
            if t8.query(p)[0]<200: continue        # near an 8-lane road: handled by the tap rule
            h=heading_out(L.pts,e); best=None
            for M in lines:
                if M is L or M.src==L.src or M.cls<L.cls: continue
                c,q,d=project(M.pts,p)
                if d>maxd or d<0.5: continue
                v=(q-p)/d; ang=math.degrees(math.acos(max(-1,min(1,float(h@v)))))
                if ang<=maxang and (best is None or d<best[0]): best=(d,q,M.id)
            if best:
                d,q,mid=best; v=(q-p)/d; tgt=q+v*over
                raw=np.vstack([raw,tgt]) if e==1 else np.vstack([tgt,raw]); ch=True; L.ext[e]=True; rep.append((L.id,e,round(d),mid)); n+=1
        if ch:
            f=AL.fit_line(T_resample(raw),L.cls); L.pts=f['pts']; L.fit=f; L.raw=raw
    return n,rep
def T_resample(P,step=10.0):
    import map2_trace as T
    return T.resample(P,step)

def zones():
    z=json.load(open('docs/a2_zone_weights.json'))['zones']; A1=json.load(open('docs/a1_buildability.json')); hs=A1.get('housing',{})
    out=[]
    for q in z:
        if q['kind']=='sea' or q['id'].startswith('background'): continue
        r=max(math.sqrt(q['ha']*1e4/math.pi)*1.5,hs.get(q['id'],{}).get('r',0))
        out.append((q['id'],q['kind'],q['cx'],q['cz'],r))
    return out

def need_rule(pcs,Z,serve_m=250.0):
    """R2 only. KEEP if (a) both ends are on the network (CONNECT) or (b) every FREE end lies within serve_m of a zone / land use disc (SERVE).
    A piece with no end on the network must serve a zone at BOTH ends. Else DROP. Iterates because a drop frees other ends."""
    drop=[]
    zc=np.array([[a[2],a[3]] for a in Z]); zr=np.array([a[4] for a in Z])
    def nearest(p):
        d=np.hypot(zc[:,0]-p[0],zc[:,1]-p[1])-zr; k=int(np.argmin(d)); return float(d[k]),Z[k][0],Z[k][1]
    while True:
        cnt=node_deg(pcs); kill=[]
        for Q in pcs:
            if Q['built'] or Q['cls']!=2: continue
            cn=[(Q['n0'] is not None and cnt.get(Q['n0'],0)>=2),(Q['n1'] is not None and cnt.get(Q['n1'],0)>=2)]
            if all(cn): Q['need']='CONNECT (both ends on the network)'; continue
            fe=[Q['pts'][0] if not cn[0] else None,Q['pts'][-1] if not cn[1] else None]; sv=[nearest(p) for p in fe if p is not None]
            if all(x[0]<=serve_m for x in sv):
                Q['need']='SERVE %s (%s), free end %s %.0f m from the zone edge'%(sv[0][1],sv[0][2],'' if len(sv)==1 else 'and other end',max(max(x[0] for x in sv),0)); continue
            w=max(sv,key=lambda x:x[0])
            kill.append((Q,'free end with no demand / land use within %.0f m (nearest zone %s, %.0f m away)'%(serve_m,w[1],w[0])))
        if not kill: break
        ids={id(q) for q,_ in kill}
        for q,r in kill: drop.append((q,r))
        pcs=[q for q in pcs if id(q) not in ids]
    return pcs,drop

def run(lines,eight,game,r6map,skipped):
    # ---- 1. extension of free ends (gap fill / T touch) with a refit, so the shape stays straight-spiral-arc
    for _ in range(2):
        n,rep=extend_and_refit(lines,eight)
    ext_n=sum(L.ext[0]+L.ext[1] for L in lines if not L.built)
    print('free ends extended to a road in front (refit, R3 kept):',ext_n)
    # ---- 2. clip at the 8-lane roads, taps
    pieces=clip_at_8(lines,eight,45.0)
    A3=json.load(open('docs/a3_demand_x2.json')); NODE={n['id']:n for n in A3['nodes']}
    existing=[dict(name=k,xy=(NODE[k]['x'],NODE[k]['z'])) for k in ('T7299','T8919','T13738','T18838','T-N880','T-E610','T-W960','R1205','R4265','R12094','R16813')]
    je=[r for r in eight if r['name']=='J1-E'][0]; c,p,d=project(je['pts'],(1469.1,626.0)); existing.append(dict(name='R6-8 tap',xy=tuple(p)))
    taps,rej,ends,ex=choose_taps(pieces,eight,existing)
    for r in rej: r['lines']=sorted({ends[i][0].id for i in r['g']})
    pieces=apply_taps(pieces,ends,taps,rej)
    idx={id(P):i for i,P in enumerate(pieces)}; tapnodes=[]
    for t in taps:
        mem=[]
        for gi in t['g']:
            P,e=ends[gi][0],ends[gi][1]
            if id(P) in idx: mem.append((idx[id(P)],0.0 if e==0 else plen(P.pts),'end'))
        if mem: tapnodes.append(dict(xy=t['xy'],members=mem,tapinfo=t))
    nodes=build_nodes(pieces,tapnodes)
    pcs=make_pieces(pieces,nodes); pcs=snap_ends(pcs,nodes); pcs,drop_sp=remove_spurs(pcs,nodes)
    drop_sp=[q for q in drop_sp if plen(q['pts'])>=25]
    nref=0
    import map2_trace as TR
    for Q in pcs:   # the node snap can bend an end: refit those pieces (ends stay on their nodes, small tolerance)
        if Q['built'] or len(Q['pts'])<4: continue
        if AL.min_radius(Q['pts'])<AL.PARAM[Q['cls']]['Rmin']*0.97:
            f=AL.fit_line(TR.resample(Q['pts'],10.0),Q['cls'],eps_list=(3,5,8,12)); Q['pts']=f['pts']; Q['fit']=f; nref+=1
    print('pieces refitted after the node snap (radius):',nref)
    # ---- 3. R2 need rule
    Z=zones(); SERVE_M=100.0; pcs,drop_need=need_rule(pcs,Z,SERVE_M)
    # ---- 4. names and junction numbers
    by={}
    for Q in pcs: by.setdefault(Q['src'],[]).append(Q)
    for src,lst in by.items():
        lst.sort(key=lambda q:q['s0'])
        for k,Q in enumerate(lst): Q['rid']=src if len(lst)==1 else '%s.%d'%(src,k+1)
    for i,(q,_) in enumerate(drop_need): q['rid']='%s-x%d'%(q['src'],i+1)
    cnt=node_deg(pcs); used=sorted(k for k,v in cnt.items() if v>=2)
    def key(k):
        x,z=nodes[k]['xy']; return (round(((math.degrees(math.atan2(x,-(z-300)))+360)%360)/10),math.hypot(x,z-300))
    used.sort(key=key); jid={k:'J-%02d'%(i+1) for i,k in enumerate(used)}
    members={}
    for Q in pcs:
        for k in [Q['n0'],Q['n1']]+Q['thru']:
            if k is not None: members.setdefault(k,[]).append(Q['rid'])
    # ---- 5. checks R1 / R5 / spacing
    allp=[(Q['rid'],Q['pts'],Q['built']) for Q in pcs]+[(r['name'],r['pts'],True) for r in eight]
    cross=[]
    for i in range(len(allp)):
        for j in range(i+1,len(allp)):
            if allp[i][2] and allp[j][2]: continue
            la=plen(allp[i][1]); lb=plen(allp[j][1])
            for sa,sb,pt in seg_inter(allp[i][1],allp[j][1]):
                if min(sa,la-sa)<3 or min(sb,lb-sb)<3: continue
                cross.append((allp[i][0],allp[j][0],tuple(pt.round())))
    XY=np.array([nodes[k]['xy'] for k in used]); mind=min([dist(XY[i],XY[j]) for i in range(len(XY)) for j in range(i+1,len(XY))] or [1e9])
    finish(dict(pcs=pcs,nodes=nodes,used=used,jid=jid,members=members,taps=taps,rej=rej,drop_sp=drop_sp,drop_need=drop_need,cross=cross,mind=mind,Z=Z,ext=ext_n,existing=existing,eight=eight,r6map=r6map,skipped=skipped,lines=lines,ends=ends,SERVE_M=SERVE_M,game=game))
    print('pieces',len(pcs),'junction nodes',len(used),'R1 crossings',len(cross),'min node distance',round(mind),'spurs dropped',len(drop_sp),'R2 dropped by need rule',len(drop_need))

# =====================================================================================================
def finish(S):
    pcs=S['pcs']; nodes=S['nodes']; jid=S['jid']; members=S['members']; game=S['game']; eight=S['eight']
    G=json.load(open('docs/a1_buildability.json')); rows=G['rows']; cell=G['cell']; half=G['half']
    def cls_at(x,z):
        i=int((x+half)//cell); j=int((z+half)//cell); return rows[j][i] if 0<=i<200 and 0<=j<200 else '?'
    # ---- samples every 25 m for the water check (game terrain) -- RUN BEFORE ANYTHING ELSE (rule: water first)
    samples=[]
    for Q in pcs:
        L=plen(Q['pts']); n=max(1,int(L//25)); Q['smp']=[point_at(Q['pts'],(k+.5)*L/n).tolist() for k in range(n)]; Q['step']=L/n
        samples.append(dict(id=Q['rid'],pts=[[round(a,1),round(b,1)] for a,b in Q['smp']]))
    json.dump(samples,open('docs/map2_samples.json','w'))
    r=subprocess.run(['npx','tsx','scripts/r6-map2-water.ts','docs'],capture_output=True,text=True)
    water_line=(r.stdout.strip().splitlines() or ['(no output)'])[-1]; print(water_line)
    water_ok=r.returncode==0 and os.path.exists('docs/map2_water.json')
    W=json.load(open('docs/map2_water.json')) if water_ok else {}
    RL=[dense(e['pts'] if 'pts' in e else np.c_[e['xs'],e['zs']],10)[0] for e in game['rail']]; RT=cKDTree(np.vstack(RL)); RP=[np.c_[e['xs'],e['zs']] for e in game['rail']]
    BAD=set('ED~RF')
    tot={}
    for Q in pcs:
        cnt={}; wet=0; rail=0; bad=0; n=len(Q['smp'])
        for (x,z),wf in zip(Q['smp'],W.get(Q['rid'],[0]*n)):
            c=cls_at(x,z); cnt[c]=cnt.get(c,0)+1
            nr=RT.query((x,z))[0]<30; wet+=wf; rail+=int(nr)
            if c in BAD or wf or nr: bad+=1
        Q['cls_m']={k:round(v*Q['step']) for k,v in cnt.items()}; Q['wet_m']=round(wet*Q['step']); Q['rail_m']=round(rail*Q['step']); Q['bad']=bad/max(n,1)
        Q['fenced_m']=Q['cls_m'].get('F',0); Q['len']=plen(Q['pts'])
        Q['railx']=sum(len(seg_inter(Q['pts'],R_)) for R_ in RP)
        t=tot.setdefault(Q['cls'] if not Q['built'] else 66,[0,0]); t[0]+=Q['len']; t[1]+=Q['bad']*Q['len']
    # ---- shape and shift
    for Q in pcs:
        Q['minR']=AL.min_radius(Q['pts']) if len(Q['pts'])>3 else 1e9
        if Q['raw'] is not None:
            RD=dense(np.asarray(Q['raw']),5)[0]; Q['shift']=float(cKDTree(RD).query(dense(Q['pts'],5)[0])[0].max())
        else: Q['shift']=0.0
    S['tot']=tot; S['water_ok']=water_ok; S['water_line']=water_line
    outputs(S)

def outputs(S):
    pcs=S['pcs']; nodes=S['nodes']; jid=S['jid']; members=S['members']; game=S['game']; eight=S['eight']; taps=S['taps']; rej=S['rej']
    G=json.load(open('docs/a1_buildability.json')); rows=G['rows']; half=G['half']
    new=[Q for Q in pcs if not Q['built']]; built=[Q for Q in pcs if Q['built']]
    r6map=S['r6map']; P=AL.PARAM
    def jdesc(Q):
        out=[]
        for k in [Q['n0']]+Q['thru']+[Q['n1']]:
            if k is None or k not in jid: continue
            others=sorted({m for m in members[k] if m!=Q['rid']}); typ='TAP' if nodes[k].get('tap') is not None or 'TAP' in nodes[k]['kinds'] else ('X' if len(members[k])>=4 else 'T' if len(members[k])==3 else 'J')
            out.append('%s(%s:%s)'%(jid[k],typ,','.join(others)))
        return ' '.join(out) if out else '-'
    def order(Q):
        a=Q['rid'].split('-'); b=a[1].split('.'); 
        try: return (-Q['cls'],int(b[0]),int(b[1]) if len(b)>1 else 0)
        except: return (-Q['cls'],0,0)
    new.sort(key=order)
    # ---------- checks
    bad_shift=[(Q['rid'],round(Q['shift'])) for Q in new if Q['shift']>70.5]
    bad_R=[(Q['rid'],round(Q['minR'])) for Q in new if Q['minR']<P[Q['cls']]['Rmin']*0.97 and Q['minR']<1e8]
    j1=(-87.0,-277.0); r5bad=[]
    for k,nd in enumerate(nodes):
        if k in jid and ('TAP' in nd['kinds']) and dist(nd['xy'],j1)<900: r5bad.append((jid[k],round(dist(nd['xy'],j1))))
    ties=[]
    for Q in new:
        for e,k in ((0,Q['n0']),(1,Q['n1'])):
            if k is None: continue
            p=nodes[k]['xy']
            if any(dist(p,(x,z))<60 for x,z in ((2100.2,-2762.5),(2354.5,1437.0),(-1133.3,2301.8),(-2555.6,246.6))) or dist(p,j1)<300: ties.append((Q['rid'],jid.get(k)))
    free=[]
    for Q in new:
        cnt=node_deg(pcs)
        for e,k in ((0,Q['n0']),(1,Q['n1'])):
            if k is None or cnt.get(k,0)<=1:
                p=Q['pts'][0] if e==0 else Q['pts'][-1]; free.append((Q['rid'],Q['cls'],round(p[0]),round(p[1])))
    checks=[('R1 no crossing (own loops, all final pieces + 8-lane roads)',len(S['cross'])==0,'%d crossings'%len(S['cross'])),
            ('junction nodes >= 60 m apart',S['mind']>=60,'min %.0f m'%S['mind']),
            ('R5 no branch at J1 / ring x arm joins',not r5bad and not ties,'%s %s'%(r5bad,ties)),
            ('R10 shift from the sketch <= 70 m',not bad_shift,'%s'%bad_shift),
            ('R3 min radius >= 0.97 x class minimum',not bad_R,'%s'%bad_R),
            ('water check ran (sc.water > sc.h)',S['water_ok'],S['water_line'])]
    allpass=all(c[1] for c in checks)
    # ---------- text report
    T=[]; A=T.append
    A('STEP MAP-2: CORRECTED centreline map of all roads (R6 / R4 / R2). Headless run (python3 tools/r6-map2.py).')
    A('NOT RUN: npm run build, tsc, the game. NOTHING in src/ was changed (so there is nothing to build); water check (sc.water > sc.h) WAS run, first, on every line.')
    A('RESULT: '+('ALL PASS (headless run, %d checks)'%len(checks) if allpass else 'NOT ALL PASS: '+', '.join(c[0] for c in checks if not c[1])))
    for n,ok,info in checks: A('  %s  %s  [%s]'%('PASS' if ok else 'FAIL',n,info))
    A('')
    A('WHAT IS ON THE MAP: built in the game %d roads (unchanged); R6 designed proposal %d lines (R6-9..R6-%d; these are the G5 lines R6-L<id>, the 10 G5 lines that are already built are NOT drawn twice: L%s); R4 %d roads; R2 %d roads; J nodes %d.'%(len(set(Q['rid'] for Q in built)),len({Q['src'] for Q in new if Q['cls']==6}),8+len({Q['src'] for Q in new if Q['cls']==6}),', L'.join(str(a) for a,_ in S['skipped']),len([Q for Q in new if Q['cls']==4]),len([Q for Q in new if Q['cls']==2]),len(jid)))
    A('METHOD: R4 / R2 re-traced from the sketch (closing 2 px, skeleton, spurs < 120 m removed, near-straight pieces joined through the crossings, ends of the same colour that face each other within 90 m joined); each line refitted as straight - spiral - arc - spiral - straight (R3); free ends within 70 m of a road of the same or bigger class are extended to it with a refit (%d ends); lines cut 45 m round the 8-lane roads; crossings split (equal class: both roads split, 4 ends; smaller class ends at the bigger one); nodes closer than 60 m merged; pieces with a free end under 110 m dropped (%d, list below).'%(S['ext'],len(S['drop_sp'])))
    A('MY NUMBERS (change them if you say so): R6 V80 Rmin 229 R 320 Ls 80 | R4 V60 Rmin 130 R 200 Ls 50 | R2 V50 Rmin 70 R 110 Ls 30; shift limit 70 m; spur 110 m; 8-lane clip 45 m, trim 90 m where no tap; tap spacing 1600 m, 900 m from the J1 centre (= 600 m from the plaza edge R300); R2 need distance %.0f m.'%S['SERVE_M'])
    A('')
    A('R6 NUMBERING PROPOSAL (you say OK): '+', '.join('%s = R6-L%d'%(k,v) for k,v in r6map.items()))
    A('')
    A('ALL ROADS (new, not built): id | old name(s) | length m | curves | min radius m | shift from sketch m | junctions (J-xx (type:roads met)) | bad ground % | water m | rail m / rail crossings | fenced m | A1 class metres')
    for Q in new:
        old=','.join(Q['old']) if Q['old'] else '-'; fit=Q['fit']; nc=fit['ncurves'] if fit else 0
        A('%-9s | %s | %5d | %2d | %5s | %3d | %s | %3.0f %% | %4d | %4d / %d | %4d | %s'%(Q['rid'],old,Q['len'],nc,'-' if Q['minR']>1e8 else '%d'%Q['minR'],Q['shift'],jdesc(Q),Q['bad']*100,Q['wet_m'],Q['rail_m'],Q['railx'],Q['fenced_m'],' '.join('%s%d'%(k,v) for k,v in sorted(Q['cls_m'].items(),key=lambda x:-x[1]))))
    A('')
    A('BAD GROUND SHARE (steep D, very steep E, sea ~, rail R, fenced F, water sc.water > sc.h, or within 30 m of the rail; A1 50 m cells; lines are KEPT on the map, you judge):')
    for k,nm in ((6,'R6 proposal'),(4,'R4'),(2,'R2'),(66,'built roads')):
        t=S['tot'].get(k)
        if t and t[0]>0: A('  %-12s %6.1f km, bad ground %4.0f %%'%(nm,t[0]/1000,100*t[1]/t[0]))
    A('  note: F lumps airport, seaport, army AND engineering land (the engineering sites are re-placed after the roads, 19.0); no existing-building footprints were checked (NOT RUN).')
    A('')
    A('CROSSING LIST (junction placeholders J-xx; every crossing is a junction, no road crosses a road). type X = same class, both roads split (4 ends); T = smaller road ends at the bigger one; TAP = on an 8-lane road:')
    for k in S['used']:
        nd=nodes[k]; typ='TAP' if 'TAP' in nd['kinds'] else ('X' if len(members[k])>=4 else 'T' if len(members[k])==3 else 'JOIN')
        A('  %s  (%6.0f, %6.0f)  %-4s  %s'%(jid[k],nd['xy'][0],nd['xy'][1],typ,', '.join(sorted(set(members[k])))))
    A('')
    A('8-LANE TAPS (R5 / R6): accepted %d groups (all snapped to an EXISTING tap within 70 m: %s); no new tap fits: the 8-lane network already has taps / joins about every 1.2-1.6 km (rule 1600 m), so the ring has no free place. Every other line that reaches an 8-lane road is cut 90 m before it (free end).'%(len(taps),', '.join(sorted({t['name'] for t in taps})) or 'none'))
    ex=S['existing']
    A('SKETCH CONFLICTS at 8-lane roads (R10: not changed silently; smallest change shown, you decide). line(s) | 8-lane road, place | why no tap | nearest existing tap:')
    for r in sorted(rej,key=lambda r:(-r['cls'],-r['len'])):
        if r['cls']<4: continue
        nt=min(ex,key=lambda e:dist(e['xy'],r['xy'])); d=dist(nt['xy'],r['xy'])
        A('  %s | %s (%.0f, %.0f) | %s | %s %.0f m -> smallest change: move the crossing to that tap (shift %.0f m %s 70 m, ASK) or keep the 90 m cut (done)'%(','.join(r['lines']),r['road'],r['xy'][0],r['xy'][1],r['why'],nt['name'],d,d,'>' if d>70 else '<='))
    A('  R2 lines that reach an 8-lane road are all cut 90 m before it (R2 never joins an 8-lane road): %d ends.'%sum(1 for r in rej if r['cls']<4))
    A('')
    A('R2 (R2 = no random road): KEPT with reason:')
    for Q in new:
        if Q['cls']==2: A('  %-9s %5d m  %s'%(Q['rid'],Q['len'],Q.get('need') or '-'))
    A('R2 DROPPED by the need rule (%d, %.1f km; the lines are NOT on the map, grey dotted in the pictures; you look):'%(len(S['drop_need']),sum(plen(q['pts']) for q,_ in S['drop_need'])/1000))
    for q,rs in S['drop_need']: A('  %-9s %5d m  at (%.0f, %.0f)  %s'%(q['rid'],plen(q['pts']),q['pts'][len(q['pts'])//2][0],q['pts'][len(q['pts'])//2][1],rs))
    A('SPUR / SMALL PIECES DROPPED (free end, shorter than 110 m, or isolated shorter than 220 m; id, length, place):')
    for q in S['drop_sp']: A('  %-9s %4d m  (%.0f, %.0f)'%(q['id'],plen(q['pts']),q['pts'][len(q['pts'])//2][0],q['pts'][len(q['pts'])//2][1]))
    A('')
    A('FREE ENDS of R6 / R4 (dead ends, %d; most are the 90 m cut at an 8-lane road or the sketch line ends in open land):'%sum(1 for f in free if f[1]>=4))
    for f in free:
        if f[1]>=4: A('  %s  %s end at (%d, %d)'%(f[0],'R6' if f[1]==6 else 'R4',f[2],f[3]))
    A('')
    A('NEXT: you look at docs/map_all_roads_v2.png and the 4 quarter maps (R2 + J numbers), say OK / change; then one road at a time (profile, cut / fill, options i-v, game export).')
    open('STEP_MAP2_OUTPUT.txt','w').write('\n'.join(T)+'\n'); open('docs/STEP_MAP2_OUTPUT.txt','w').write('\n'.join(T)+'\n')
    print('\n'.join(T[:12]))
    # ---------- json
    J=dict(note='MAP-2: ALL road centrelines, world metres (x east, z south). built = game (unchanged); roads = new corrected lines (R6 proposal / R4 / R2); dropped = R2 lines removed by the need rule. Nothing in src/ changed.',
        params={str(k):v for k,v in P.items()},r6_numbering=r6map,
        built=[dict(name=r['name'],lanes=r['lanes'],pts=[[x,z] for x,z in zip(r['xs'],r['zs'])]) for r in game['roads']],
        junctions=[dict(id=jid[k],x=round(float(nodes[k]['xy'][0]),1),z=round(float(nodes[k]['xy'][1]),1),roads=sorted(set(members[k])),tap=('TAP' in nodes[k]['kinds'])) for k in S['used']],
        roads=[dict(id=Q['rid'],cls=Q['cls'],old=Q['old'],length_m=round(Q['len']),min_radius_m=None if Q['minR']>1e8 else round(Q['minR']),shift_m=round(Q['shift']),n0=jid.get(Q['n0']),n1=jid.get(Q['n1']),thru=[jid[k] for k in Q['thru'] if k in jid],bad_share=round(Q['bad'],2),water_m=Q['wet_m'],rail_m=Q['rail_m'],rail_crossings=Q['railx'],fenced_m=Q['fenced_m'],class_m=Q['cls_m'],need=Q.get('need'),pis=(Q['fit']['pis'] if Q['fit'] else None),pts=[[round(float(a),1),round(float(b),1)] for a,b in Q['pts']]) for Q in new],
        dropped=[dict(id=q['rid'],reason=rs,pts=[[round(float(a),1),round(float(b),1)] for a,b in q['pts']]) for q,rs in S['drop_need']],
        free_ends=free,checks=[dict(name=n,pass_=bool(o),info=i) for n,o,i in checks])
    json.dump(J,open('docs/map_all_roads_v2.json','w'))
    # ---------- pictures
    col={'~':'#bcd9ee','R':'#d9d0ea','X':'#e0e0e0','F':'#fde7cf','A':'#f4f8ee','B':'#eaf3e0','C':'#e0eed3','D':'#f7dccf','E':'#e6e1dc','?':'#ffffff'}
    img=np.zeros((200,200,3))
    for j in range(200):
        for i in range(200): img[j,i]=to_rgb(col.get(rows[j][i],'#fff'))
    def draw(ax,labels,xlim,ylim,fs):
        ax.imshow(img,extent=[-half,half,half,-half],interpolation='nearest')
        for e in game['rail']: ax.plot(e['xs'],e['zs'],color='#7b5aa6',lw=1.0,ls=(0,(4,2)),zorder=2)
        for q,_ in S['drop_need']: ax.plot(q['pts'][:,0],q['pts'][:,1],color='#888',lw=1.0,ls=(0,(1,2)),zorder=3)
        for Q in new:
            if Q['bad']>=0.5: ax.plot(Q['pts'][:,0],Q['pts'][:,1],color='#ff9f1c',lw=(4.5 if Q['cls']>2 else 3.2),alpha=.55,zorder=3)
        for Q in new:
            c={2:'#00b44b',4:'#e3182d',6:'#0051ba'}[Q['cls']]; ax.plot(Q['pts'][:,0],Q['pts'][:,1],color=c,lw={2:1.1,4:1.8,6:2.2}[Q['cls']],ls='-' if Q['cls']<6 else (0,(5,2)),zorder=4)
        for r in game['roads']:
            if r['name']=='M6-1': c,lw='#1f78c8',3.2
            elif ':' in r['name']: c,lw='#ff7f0e',1.4
            elif r['name'].startswith('R6'): c,lw='#0051ba',3.0
            else: c,lw='#333333',3.6
            ax.plot(r['xs'],r['zs'],color=c,lw=lw,zorder=6)
        for k in S['used']:
            x,z=nodes[k]['xy']
            if xlim[0]<x<xlim[1] and min(ylim)<z<max(ylim):
                ax.plot(x,z,'o',ms=3.2 if labels else 2.4,mfc='k',mec='w',mew=.3,zorder=8)
                if labels: ax.text(x+18,z-18,jid[k][2:],fontsize=4.5,color='#222',zorder=9)
        def lab(x,z,t,c,f):
            if xlim[0]<x<xlim[1] and min(ylim)<z<max(ylim): ax.text(x,z,t,fontsize=f,color=c,ha='center',va='center',zorder=9,bbox=dict(fc='white',ec=c,lw=.5,pad=.6,alpha=.85))
        for r in game['roads']:
            if ':' in r['name']: continue
            m=len(r['xs'])//2 if r['name']!='M8' else len(r['xs'])//7
            lab(r['xs'][m],r['zs'][m],r['name'],'#222' if r['lanes']==8 else '#0051ba',fs)
        for Q in new:
            if Q['cls']==2 and not labels: continue
            m=Q['pts'][len(Q['pts'])//2]; lab(m[0],m[1],Q['rid'],{2:'#00863a',4:'#e3182d',6:'#0051ba'}[Q['cls']],fs-(2 if Q['cls']==2 else 0))
        if labels:
            for q,_ in S['drop_need']:
                m=q['pts'][len(q['pts'])//2]; lab(m[0],m[1],'x '+q['rid'],'#666',fs-2)
        ax.set_xlim(*xlim); ax.set_ylim(*ylim); ax.set_aspect('equal'); ax.grid(alpha=.25,lw=.4)
    Tt='black thick = 8-lane | blue solid = R6 built | blue dashed = R6 proposal (R6-9..) | red = R4 | green = R2 | orange halo = 50 %+ bad ground | black dot = junction J-xx | grey dotted = R2 dropped (need rule)\nx east, z south (m); lines are fitted straight-spiral-arc-spiral-straight; MAP-2, nothing in src/ changed'
    def save(name,xlim,ylim,labels,fs,size,title):
        fig,ax=plt.subplots(figsize=size); draw(ax,labels,xlim,ylim,fs); ax.set_title(title,fontsize=9); fig.savefig(name,dpi=110,bbox_inches='tight'); plt.close(fig)
    save('docs/map_all_roads_v2.png',(-3000,3800),(4600,-4400),False,6,(13,16),'ALL ROADS v2 (R2 numbers and J numbers only in the quarter maps)\n'+Tt)
    Qd={'NW':((-3000,400),(300,-4400)),'NE':((300,3800),(300,-4400)),'SW':((-3000,400),(4600,300)),'SE':((300,3800),(4600,300))}
    for k,(xl,yl) in Qd.items(): save('docs/map_all_roads_v2_%s.png'%k,xl,yl,True,7,(13,13*abs(yl[1]-yl[0])/abs(xl[1]-xl[0])),'ALL ROADS v2, %s quarter (R2 numbers, J numbers)\n'%k+Tt)

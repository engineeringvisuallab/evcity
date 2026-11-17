#!/usr/bin/env python3
"""STEP MAP-2: corrected centreline map of ALL roads (R6 / R4 / R2). Run from the project root: python3 tools/r6-map2.py
Needs: numpy scipy pillow scikit-image networkx matplotlib; node + npx tsx (water check). NOTHING in src/ is changed."""
import sys, json, math, pickle, os
sys.path.insert(0,'tools')
import numpy as np
import map2_trace as T, map2_align as AL
from map2_net import *
from map2_plan import *

def load_inputs():
    game=json.load(open('docs/map_game_roads.json'))
    eight=[dict(name=r['name'],pts=np.c_[r['xs'],r['zs']]) for r in game['roads'] if r['lanes']==8]
    built=[Line(r['name'],6,np.c_[r['xs'],r['zs']],True) for r in game['roads'] if r['lanes']==6 and ':' not in r['name']]
    return game,eight,built

def r6_designed(built):
    g5=json.load(open('docs/r6_g5_lines.json'))['lines']
    bd=[dense(b.pts,10)[0] for b in built]; BT=cKDTree(np.vstack(bd))
    out=[]; skipped=[]
    for l in sorted(g5,key=lambda l:l['src_id']):
        P=np.array(l['pts'],float); D=T.resample(P,10.0)
        d=BT.query(D)[0]; share=float((d<25).mean())
        if share>0.6: skipped.append((l['src_id'],round(share*100))); continue
        out.append((l['src_id'],T.light_smooth(D,3.0)))
    return out,skipped

def old_names(new_lines,cls):
    """keep the old MAP names: the old piece (R4-n / R2-n) with the longest overlap gives its name"""
    old=json.load(open('docs/map_r4_r2_trace.json'))['lines']; old=[o for o in old if o['id'].startswith('R%d-'%cls)]
    trees=[]; 
    for o in old: trees.append((o['id'],T.resample(np.array(o['pts']),20.0)))
    pairs=[]
    for i,P in enumerate(new_lines):
        D=dense(P,10)[0]; tr=cKDTree(D)
        for oid,O in trees:
            ov=float((tr.query(O)[0]<35).sum())*20.0
            if ov>=60: pairs.append((ov,i,oid))
    pairs.sort(reverse=True); name={}; used=set(); olds={}
    for ov,i,oid in pairs:
        olds.setdefault(i,[]).append((oid,round(ov)))
        if i in name or oid in used: continue
        name[i]=oid; used.add(oid)
    mx=max(int(o['id'].split('-')[1]) for o in old); k=mx
    for i in range(len(new_lines)):
        if i not in name: k+=1; name[i]='R%d-%d'%(cls,k)
    return name,olds

if __name__=='__main__':
    game,eight,built=load_inputs()
    M=T.load_masks(); R={}
    lines=list(built)
    # --- R6 designed (G5) -> proposal R6-9..
    des,skipped=r6_designed(built); n6=9; r6map={}
    for sid,P in des:
        f=AL.fit_line(P,6); L=Line('R6-%d'%n6,6,f['pts'],False,'R6-%d'%n6,fit=f,oldL=sid,raw=P); L.old=['R6-L%d'%sid]; r6map[L.id]=sid; lines.append(L); n6+=1
    print('R6 designed lines fitted',len(des),'skipped (already built):',skipped)
    fits={}
    for cls in (4,2):
        raw,_=T.join_gaps(T.trace_class(M['R%d'%cls])); nm,olds=old_names([r for r in raw],cls)
        for i,P in enumerate(raw):
            f=AL.fit_line(P,cls); L=Line(nm[i],cls,f['pts'],False,nm[i],fit=f,raw=P); L.old=[o for o,_ in olds.get(i,[])]; lines.append(L)
    import map2_final as F
    F.run(lines,eight,game,r6map,skipped)

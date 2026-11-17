#!/usr/bin/env python3
"""ROADFIX merge: docs/map_all_roads_v2.json + docs/roadfix_result.json (re-routed lines) + docs/roadfix_tunnels.json (tunnels, cls 4 / 2 only) -> docs/map_all_roads_v3.json.
Then: python3 tools/roadfix-export-ts.py 6 4 2   (writes src/roads/debug/RoadCentreData.ts from v3)."""
import json
J=json.load(open('docs/map_all_roads_v2.json'))
R={x['id']:x for x in json.load(open('docs/roadfix_result.json'))}
T={x['id']:x for x in json.load(open('docs/roadfix_tunnels.json'))}
import os
# step 2 (second pass): full junction-to-junction re-routes + curved tunnels
if os.path.exists('docs/roadfix_result2.json'): R.update({x['id']:x for x in json.load(open('docs/roadfix_result2.json'))})
if os.path.exists('docs/roadfix_tunnels2.json'): T.update({x['id']:x for x in json.load(open('docs/roadfix_tunnels2.json'))})
S={}
if os.path.exists('docs/roadfix_struct.json'): S={x['id']:x for x in json.load(open('docs/roadfix_struct.json'))}
n_s=0
W={}
if os.path.exists('docs/roadfix_wet.json'): W={x['id']:x for x in json.load(open('docs/roadfix_wet.json'))}
n_w=0
RX={}
if os.path.exists('docs/roadfix_railx.json'): RX={x['id']:x for x in json.load(open('docs/roadfix_railx.json'))}
n_x=0
skip={'R4-45':'re-route 203 -> 1114 m is too long, original kept (open point)'}
n_r=n_t=0; log=[]
for r in J['roads']:
    i=r['id']
    if i in R and i not in skip:
        r['pts']=R[i]['pts']; r['length_m']=round(R[i]['new_len']); r['roadfix']={'rerouted':R[i]['was'],'old_len_m':R[i]['old_len']}; n_r+=1
        log.append("REROUTED %s cls %d %s %d -> %d m"%(i,r['cls'],R[i]['was'],R[i]['old_len'],R[i]['new_len']))
    if i in T:
        t=T[i]; r.setdefault('roadfix',{})['tunnel']={'s0':t['s0'],'s1':t['s1'],'len_m':t['len'],'a':t['a'],'b':t['b']}; n_t+=1
        if t.get('poly'): r['roadfix']['tunnel']['poly']=t['poly']
        log.append("TUNNEL   %s cls %d %d m at s %d-%d (original line kept)"%(i,r['cls'],t['len'],t['s0'],t['s1']))
    if i in S:
        x=S[i]; r['pts']=x['pts']; r.setdefault('roadfix',{})['struct']={'segs':x['segs'],'tunnel_m':x['tunnel_m'],'viaduct_m':x['viaduct_m'],'smooth':x['smooth'],'mode':x['mode'],'level':x['level']}; n_s+=1
        log.append('STRUCT   %s cls %d tunnel %d m, viaduct %d m, segments %s'%(i,r['cls'],x['tunnel_m'],x['viaduct_m'],[(q['kind'],q['s0'],q['s1']) for q in x['segs']]))
    if i in RX:
        x=RX[i]; r['pts']=x['pts']; rf=r.setdefault('roadfix',{}); rf.pop('tunnel',None); rf['struct']={'segs':x['segs'],'tunnel_m':x['tunnel_m'],'viaduct_m':x['viaduct_m'],'smooth':0,'mode':x['mode'],'level':x['level'],'x_m':x['x_m']}; rf['railx']=x['railx']; n_x+=1
        log.append('RAILX    %s cls %d %s'%(i,r['cls'],[(q['type'],q['at']) for q in x['railx']]))
    if i in W:
        w=W[i]
        if w['action']=='moved': r['pts']=w['pts']; r['length_m']=round(w['new_len'])
        r.setdefault('roadfix',{})['bridges']=[{'s0':q['s0'],'s1':q['s1'],'len':q['len']} for q in w['bridges']]; r['roadfix']['bridge_kind']=w['action']; n_w+=1
        log.append('BRIDGE   %s cls %d %s %s'%(i,r['cls'],w['action'],[q['len'] for q in w['bridges']]))
    if i in skip: log.append("KEPT     %s: %s"%(i,skip[i]))
J['note']=J['note']+' | ROADFIX v3: %d lines re-routed, %d tunnels added, %d lines with viaduct / tunnel profile, %d lines with water bridges, %d lines with rail crossings solved (field roadfix); other lines unchanged.'%(n_r,n_t,n_s,n_w,n_x)
json.dump(J,open('docs/map_all_roads_v3.json','w'),separators=(',',':'))
open('docs/roadfix_merge_log.txt','w').write('\n'.join(log)+'\n'); print(n_r,'rerouted',n_t,'tunnels',n_s,'struct',n_w,'bridge lines',n_x,'railx lines')

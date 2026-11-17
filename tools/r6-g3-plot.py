#!/usr/bin/env python3
"""R6 step G3 / G4 picture (python3 tools/r6-g3-plot.py g3|g4): left = map of the 42 R6 lines by G3 result, right = ground vs designed profile of the 5 WATCH lines present in the set (22, 29, 44, 62; 45 is dropped in G4).
Run after scripts/r6-profile-check.ts:  python3 tools/r6-g3-plot.py   (reads docs/r6_g3.json, writes docs/r6_g3.png)"""
import json, sys
TAG=sys.argv[1] if len(sys.argv)>1 else 'g3'
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
D=json.load(open(f'docs/r6_{TAG}.json')); L=D['lines']; OLD=json.load(open('docs/r6_g3.json'))['lines'] if TAG=='g4' else []; WATCH=[22,29,44,45,62]
fig=plt.figure(figsize=(16,9)); gs=fig.add_gridspec(5,2,width_ratios=[1.1,1])
ax=fig.add_subplot(gs[:,0]); ax.set_aspect('equal'); ax.invert_yaxis()
for o in OLD:
    if not any(q['id']==o['id'] and q['origin']==o['origin'] for q in L):
        ax.plot([p[1] for p in o['pts']],[p[2] for p in o['pts']],color='#999999',lw=1.5,ls='--')
for l in L:
    xs=[p[1] for p in l['pts']]; zs=[p[2] for p in l['pts']]
    heavy=l['maxCut']>=11.95
    col='#1a9850' if l['pass'] and not heavy else ('#fdae61' if l['pass'] else '#d73027')
    ax.plot(xs,zs,color=col,lw=3 if l['id'] in WATCH else 2)
    ax.text(xs[len(xs)//2],zs[len(zs)//2],str(l['id']),fontsize=7,weight='bold' if l['id'] in WATCH else None)
ax.set_title(f'R6 {TAG.upper()}: green PASS, orange PASS but cut at 12 m limit, red FAIL (wet or fill > 7 m)\nbold number = WATCH line; grey dashed = dropped / replaced line (G4)',fontsize=10)
ax.grid(alpha=.3)
for n,i in enumerate(WATCH):
    a=fig.add_subplot(gs[n,1]); l=next((q for q in L if q['id']==i),None)
    if not l:
        a.axis('off'); a.text(0.02,0.5,f'L{i}: dropped in G4',fontsize=9); continue
    s=[p[0] for p in l['pts']]; h=[p[3] for p in l['pts']]; y=[p[4] for p in l['pts']]
    a.plot(s,h,color='#8c6d31',label='natural ground'); a.plot(s,y,color='#08519c',label='designed level (grade <= 4 %)')
    a.set_ylabel(f'L{i} m'); a.grid(alpha=.3)
    a.set_title(f"L{i}: {'PASS' if l['pass'] else 'FAIL'}, steepest ground {l['natMaxG']:.0f} %, designed {l['maxG']:.1f} %, max cut {l['maxCut']:.1f} m",fontsize=9,loc='left')
    if n==0: a.legend(fontsize=7,loc='upper right')
fig.tight_layout(); fig.savefig(f'docs/r6_{TAG}.png',dpi=110); print('wrote', f'docs/r6_{TAG}.png')

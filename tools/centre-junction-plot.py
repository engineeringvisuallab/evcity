"""STEP 21.7-1 pictures (read only). Run: python3 tools/centre-junction-plot.py docs
Reads docs/centre_junction.json (scripts/centre-junction.ts) and docs/fit_chain/centre_fixed.json.
Writes docs/centre_junction.png (whole map, nodes by TYPE, 70-deg FAIL ringed) and docs/centre_junction_sharp.png (zoom on the sharpest T nodes)."""
import json, math, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

D = sys.argv[1] if len(sys.argv) > 1 else 'docs'
J = json.load(open(f'{D}/centre_junction.json'))
C = json.load(open(f'{D}/fit_chain/centre_fixed.json'))
LN = {l['id']: l for l in C['lines']}
COL = {'8': '#222222', '6': '#1f5fbf', '4': '#d62728', '2': '#2ca02c', 'C': '#8c564b', 'L': '#9467bd'}
LW = {'8': 2.4, '6': 1.6, '4': 1.3, '2': 0.7, 'C': 0.6, 'L': 0.6}
TYPES = [('T priority', 'T priority', '#7f7f7f', 'o'), ('T priority + left pocket', 'T priority + left pocket on the arterial', '#ff7f0e', 'o'),
         ('T signalised (A x A)', 'T signalised, turn pockets (A x A)', '#d62728', 's'), ('roundabout 1-lane', 'ROUNDABOUT 1-lane (30-45 m)', '#17becf', 'D'),
         ('roundabout 2-lane', 'ROUNDABOUT 2-lane (50-70 m)', '#1f5fbf', 'D'), ('continuation', 'CONTINUATION (no junction)', '#cccccc', '.'),
         ('grade-separated', 'GRADE-SEPARATED', '#000000', '*')]
tmap = {t[1]: t for t in TYPES}

fig, ax = plt.subplots(figsize=(15, 15), dpi=110)
for l in C['lines']:
    if l.get('dropped'): continue
    c = str(l['cls']); xs = [p[0] for p in l['pts']]; zs = [p[1] for p in l['pts']]
    ax.plot(xs, zs, color=COL.get(c, '#999'), lw=LW.get(c, 0.6), alpha=0.55 if c in '2CL' else 0.9, zorder=1)
for n in J['nodes']:
    t = tmap.get(n['type'])
    if not t: continue
    ax.scatter(n['x'], n['z'], c=t[2], marker=t[3], s=70 if t[3] == '*' else 26 if t[3] != '.' else 6, edgecolors='k' if t[3] != '.' else 'none', linewidths=0.4, zorder=3)
    if n['angleBad']:
        ax.scatter(n['x'], n['z'], s=150, facecolors='none', edgecolors='red', linewidths=1.6, zorder=4)
        if n['angle'] < 50: ax.annotate(f"{n['id']} {n['angle']:.0f}°", (n['x'], n['z']), xytext=(8, 8), textcoords='offset points', fontsize=8, color='red', weight='bold', zorder=6)
    if n['type'] == 'GRADE-SEPARATED': ax.annotate(n['id'], (n['x'], n['z']), xytext=(8, -12), textcoords='offset points', fontsize=9, weight='bold', zorder=6)
for t in J['taps']:
    ax.scatter(t['x'], t['z'], marker='^', s=75, c='#ffd700', edgecolors='k', linewidths=0.7, zorder=5)
    ax.annotate(t['id'], (t['x'], t['z']), xytext=(5, 4), textcoords='offset points', fontsize=6.5, zorder=6)
for c in J['corners']:
    if c['strict'] and not c['ok']:
        ln = LN[c['line']]; pts = ln['pts']; cum = [0]
        for i in range(1, len(pts)): cum.append(cum[-1] + math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]))
        j = min(range(len(cum)), key=lambda k: abs(cum[k] - c['s']))
        ax.scatter(pts[j][0], pts[j][1], marker='X', s=90, c='magenta', edgecolors='k', zorder=6)
        ax.annotate(f"{c['line']} R{c['R']:.0f}<{c['Rmin']:.0f}", (pts[j][0], pts[j][1]), xytext=(8, -12), textcoords='offset points', fontsize=7, color='magenta', zorder=6)
for s in J['s38']:
    n = next((q for q in J['nodes'] if q['id'] == s['node']), None)
    if n: ax.scatter(n['x'], n['z'], marker='s', s=120, facecolors='none', edgecolors='#8a2be2', linewidths=1.4, zorder=4)
h = [Line2D([0], [0], marker=t[3], color='w', markerfacecolor=t[2], markeredgecolor='k', markersize=8 if t[3] != '.' else 4, label=f"{t[0]}  {sum(1 for n in J['nodes'] if n['type']==t[1])}") for t in TYPES]
h += [Line2D([0], [0], marker='^', color='w', markerfacecolor='#ffd700', markeredgecolor='k', markersize=9, label=f"TAP interchange on an 8-lane road  {len(J['taps'])}"),
      Line2D([0], [0], marker='o', color='w', markerfacecolor='none', markeredgecolor='red', markersize=11, label=f"T skew angle < 70°  {sum(1 for n in J['nodes'] if n['angleBad'])} (numbers under 50°)"),
      Line2D([0], [0], marker='s', color='w', markerfacecolor='none', markeredgecolor='#8a2be2', markersize=10, label=f"3.8: local street (L) on an arterial  {len(J['s38'])}"),
      Line2D([0], [0], marker='X', color='w', markerfacecolor='magenta', markeredgecolor='k', markersize=9, label='R < Rmin bend not at a node')]
h += [Line2D([0], [0], color=COL[c], lw=2, label=n) for c, n in [('8', 'M8 / J1 arm (8 lane)'), ('6', 'R6'), ('4', 'R4'), ('2', 'R2'), ('C', 'C'), ('L', 'L')]]
ax.legend(handles=h, loc='lower left', fontsize=8, framealpha=0.92)
ax.set_aspect('equal'); ax.invert_yaxis(); ax.grid(alpha=0.15)
ax.set_title('STEP 21.7-1  junction TYPE of the 136 nodes + 22 TAPs on 8-lane roads (x east, z south; read only, nothing moved)')
fig.tight_layout(); fig.savefig(f'{D}/centre_junction.png'); plt.close(fig)

# ---- zoom panels: the sharpest T nodes
bad = sorted([n for n in J['nodes'] if n['angleBad']], key=lambda n: n['angle'])[:6]
fig, axs = plt.subplots(2, 3, figsize=(15, 10), dpi=110)
for a, n in zip(axs.flat, bad):
    R = 180
    for l in C['lines']:
        pts = l['pts']; seg = [p for p in pts if abs(p[0]-n['x']) < R*1.6 and abs(p[1]-n['z']) < R*1.6]
        if len(seg) < 2: continue
        c = str(l['cls']); a.plot([p[0] for p in pts], [p[1] for p in pts], color=COL.get(c, '#999'), lw=3 if l['id'] in n['legs'] else 1, alpha=1 if l['id'] in n['legs'] else 0.35)
        if l['id'] in n['legs']:
            m = min(range(len(pts)), key=lambda k: math.hypot(pts[k][0]-n['x'], pts[k][1]-n['z']))
            k2 = min(len(pts)-1, m+6) if m < len(pts)//2 else max(0, m-6)
            a.annotate(l['id'], pts[k2], xytext=(6, -6), textcoords='offset points', fontsize=9, color=COL.get(c, 'k'), weight='bold')
    a.scatter(n['x'], n['z'], s=120, facecolors='none', edgecolors='red', linewidths=2)
    a.set_xlim(n['x']-R, n['x']+R); a.set_ylim(n['z']+R, n['z']-R); a.set_aspect('equal'); a.grid(alpha=0.2)
    a.set_title(f"{n['id']}" + (f" (B3 {n['b3']})" if n['b3'] else '') + f"  {n['cls']}  skew {n['angle']:.1f}°  (needs {70-n['angle']:.0f}° more)", fontsize=10)
fig.suptitle('STEP 21.7-1  the six sharpest T junctions (skew angle < 70°, Step 8: realign); 360 m window, read only'); fig.tight_layout(); fig.savefig(f'{D}/centre_junction_sharp.png'); plt.close(fig)
print('wrote', f'{D}/centre_junction.png', f'{D}/centre_junction_sharp.png')

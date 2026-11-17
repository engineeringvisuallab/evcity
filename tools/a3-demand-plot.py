# STEP A3 picture: python3 tools/a3-demand-plot.py (reads docs/a3_demand_x1.json, a3_demand_x2.json, writes docs/a3_demand.png)
import json
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
COL = {'M8': '#c62828', 'M6': '#1565c0', 'M4': '#00897b', 'A-D6': '#ef6c00', 'A-D4': '#f9a825', 'A-2': '#6d4c41', 'none': '#bdbdbd'}
LAB = {'M8': 'M8 (8 lanes, fixed)', 'M6': 'M6 (6 lanes)', 'M4': 'M4 (4 lanes, outside)', 'A-D6': 'A-D6 (6 lanes arterial)', 'A-D4': 'A-D4 (4 lanes arterial)', 'A-2': 'A-2 (2 lanes)', 'none': 'under 1500 AADT: NO road in A3'}
fig, axs = plt.subplots(1, 2, figsize=(20, 10), dpi=100)
for ax, k in zip(axs, ['x1', 'x2']):
    d = json.load(open(f'docs/a3_demand_{k}.json')); N = d['nodes']
    # R2: only corridors that are roads (AADT >= 1500) are drawn; R1: the fixed roads use their real centrelines, junction placeholders are black diamonds
    for l in sorted(d['links'], key=lambda l: l['perDir']):
        if not l.get('road'): continue
        if l.get('pts'):
            xs = [p[0] for p in l['pts']]; zs = [p[1] for p in l['pts']]
        else:
            a, b = N[l['a']], N[l['b']]; xs = [a['x'], b['x']]; zs = [a['z'], b['z']]
        ax.plot(xs, zs, color=COL[l['cls']], lw=0.8 + 1.1 * l['perDir'], alpha=.9, solid_capstyle='round')
        if l['aadt'] > (20000 if k == 'x1' else 40000) and not l['fixed']:
            ax.text((xs[0] + xs[-1]) / 2, (zs[0] + zs[-1]) / 2, f"{l['aadt']/1000:.0f}k", fontsize=7, color='k', ha='center')
    served = set()
    for l in d['links']:
        if l.get('road') and not l['fixed']: served.add(l['a']); served.add(l['b'])
    for i, n in enumerate(N):
        if n['kind'] == 'taz': ax.plot(n['x'], n['z'], 'o', mfc='#555' if i in served else 'white', mec='#555', ms=4)
        if n['kind'] == 'jx': ax.plot(n['x'], n['z'], 'D', color='k', ms=6)
        if n['kind'] == 'tap': ax.plot(n['x'], n['z'], 's', color='#222', ms=6)
    ax.set_xlim(-4200, 4200); ax.set_ylim(4600, -4600); ax.set_aspect('equal'); ax.grid(alpha=.2)
    t = d['km']; ax.set_title(('NOW (A2 numbers, 142 000 persons)' if k == 'x1' else 'DESIGN HORIZON x2 (283 500 persons)') + '\nline width = lanes per direction; numbers = AADT (vehicles + pcu per day)')
axs[0].legend(handles=[plt.Line2D([], [], color=COL[c], lw=3, label=LAB[c]) for c in COL if c != 'none'] + [plt.Line2D([], [], marker='s', color='#222', ls='', label='tap: where a branch leaves an M8 (never at J1 or the 4 joins)'), plt.Line2D([], [], marker='D', color='k', ls='', label='junction placeholder J-xx (road ends, new road starts)'), plt.Line2D([], [], marker='o', mfc='white', mec='#555', ls='', label='zone with no A3 road (served in C / D)')], loc='upper center', bbox_to_anchor=(0.5, -0.04), fontsize=8, ncol=2)
plt.savefig('docs/a3_demand.png', bbox_inches='tight')

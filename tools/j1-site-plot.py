# STEP 6.1a picture: python3 tools/j1-site-plot.py docs/j1_site.json docs/j1_site_check.png
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle

d = json.load(open(sys.argv[1]))
fig, (a0, a1) = plt.subplots(1, 2, figsize=(17, 8.5), gridspec_kw={'width_ratios': [1, 1.15]})

def base(ax, rail_lw):
    ring = d['ring']
    ax.plot([p[0] for p in ring] + [ring[0][0]], [p[1] for p in ring] + [ring[0][1]], color='#888', lw=2.2, label='ring (M8)')
    for r in d['rail']:
        ax.plot(r['xs'], r['zs'], color='#c0392b', lw=rail_lw, label='rail (real plan)' if r['id'] == d['rail'][0]['id'] else None)
    for s in d['rivers']:
        ax.plot([s[0], s[2]], [s[1], s[3]], color='#2e86c1', lw=0.8, alpha=0.6)
    for st in d['stations']:
        if abs(st['x']) < 3600 and abs(st['z']) < 3600:
            ax.add_patch(Circle((st['x'], st['z']), st['r'], fill=False, ec='#c0392b', lw=0.8, ls=':'))
    for j in d['joins']:
        ax.plot(j['x'], j['z'], 's', color='green', ms=8)
        ax.annotate(j['dir'], (j['x'], j['z']), textcoords='offset points', xytext=(7, 7), color='green', weight='bold')
    ax.set_aspect('equal'); ax.invert_yaxis(); ax.grid(alpha=0.2)

base(a0, 1.2)
for c in d['cands']:
    col = '#e67e22' if c['best'] else '#444'
    a0.plot(c['x'], c['z'], 'o', color=col, ms=6)
    a0.annotate(c['id'], (c['x'], c['z']), textcoords='offset points', xytext=(5, -9), fontsize=8, color=col)
a0.set_xlim(-3300, 3300); a0.set_ylim(2700, -3600)
a0.set_title('J1 site check: ring, real rail, rivers and the 9 candidate points'); a0.set_xlabel('x east (m)'); a0.set_ylabel('z south (m)  [north is up]')
a0.legend(loc='lower left', fontsize=8)

base(a1, 1.8)
for a in d['areas']:
    sh = a['shape']
    if sh['t'] == 'rect':
        dense = a['density'] >= 4
        a1.add_patch(Rectangle((sh['x0'], sh['z0']), sh['x1'] - sh['x0'], sh['z1'] - sh['z0'], fc='#f5b7b1' if dense else '#d5f5e3', ec='#999', lw=0.6, alpha=0.55))
        a1.text((sh['x0'] + sh['x1']) / 2, (sh['z0'] + sh['z1']) / 2, a['id'].replace('s0-', ''), ha='center', va='center', fontsize=6.5, color='#555')
F = d['foot']
for c in d['cands']:
    if c['id'] in ('C3', 'C4', 'C6'):
        continue
    col = '#e67e22' if c['best'] else ('#1f618d' if c['id'] in ('C0', 'C1', 'C7') else '#7f8c8d')
    a1.add_patch(Rectangle((c['x'] - F, c['z'] - F), 2 * F, 2 * F, fill=False, ec=col, lw=1.6, ls='--' if c['maxF'] < F else '-'))
    if c['maxF'] > 0:
        a1.add_patch(Rectangle((c['x'] - c['maxF'], c['z'] - c['maxF']), 2 * c['maxF'], 2 * c['maxF'], fc=col, alpha=0.18, ec='none'))
    a1.plot(c['x'], c['z'], 'o', color=col, ms=5)
    a1.annotate(f"{c['id']}  flat box +-{c['maxF']} m", (c['x'], c['z']), textcoords='offset points', xytext=(6, 6), fontsize=8, color=col, weight='bold')
a1.set_xlim(-1300, 1300); a1.set_ylim(900, -1000)
a1.set_title(f"zoom on the city centre: dashed box = working footprint +-{F} m, filled box = largest flat, dry, rail-free box (3 % slope, 50 m from rail)")
a1.title.set_fontsize(9); a1.set_xlabel('x east (m)')
plt.tight_layout(); plt.savefig(sys.argv[2], dpi=110)
print('wrote', sys.argv[2])

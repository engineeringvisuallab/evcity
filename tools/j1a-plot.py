# J1-a picture: the four approaches of J1 (C8, yaw 17.6) with clear length, needed length (stop line + pocket/queue + step-down) and rail.
# Run: python3 tools/j1a-plot.py docs/j1a.json docs/j1_site.json docs/j1a_layout.png
import json, math, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
a = json.load(open(sys.argv[1])); site = json.load(open(sys.argv[2]))
fig, ax = plt.subplots(1, 2, figsize=(15, 7.2))
J = a['J1']; cx, cz = J['x'], J['z']
# left: map around J1 (x east, z south -> plotted with north up)
m = ax[0]
for e in site.get('rail', []):
    xs = e.get('xs') or [p[0] for p in e.get('pts', [])]; zs = e.get('zs') or [p[1] for p in e.get('pts', [])]
    m.plot(xs, [-z for z in zs], color='#8a5a2b', lw=2, zorder=2)
cols = {'N': '#1f77b4', 'E': '#d62728', 'S': '#2ca02c', 'W': '#9467bd'}
need = {d: a['dStop'] + a['fits'][d]['need'] for d in 'NESW'}
for d in 'NESW':
    c = a['clears'][d]; ux, uz = c['ux'], c['uz']
    L = c['clear']; N = need[d]
    m.plot([cx, cx + ux * 520], [-cz - uz * 520, -cz - uz * 520 + 0], alpha=0) # keep bounds
    m.plot([cx, cx + ux * L], [-cz, -(cz + uz * L)], color=cols[d], lw=7, alpha=0.35, solid_capstyle='butt')
    m.plot([cx, cx + ux * N], [-cz, -(cz + uz * N)], color=cols[d], lw=1.5, ls='--')
    m.plot([cx + ux * N], [-(cz + uz * N)], 'o', color=cols[d])
    m.annotate(f"{d}: clear {L:.0f} m, need {N:.0f} m", (cx + ux * (L + 20), -(cz + uz * (L + 20))), color=cols[d], fontsize=9, ha='center')
m.plot([cx], [-cz], 'k*', ms=14)
m.set_xlim(cx - 650, cx + 650); m.set_ylim(-cz - 650, -cz + 650); m.set_aspect('equal'); m.grid(alpha=.3)
m.set_title('J1 at C9 (-117, -277), yaw 17.6 deg: clear length (thick) and needed length (dashed) per approach; brown = real rail'); m.set_xlabel('x east (m)'); m.set_ylabel('north (m)')
# right: bar chart of lengths from the stop line
b = ax[1]
dS = a['dStop']
for i, d in enumerate('NESW'):
    f = a['fits'][d]
    base = 0
    parts = [('braking 56', 56, '#999999'), ('storage 95th', f['storageR'], '#e6a117'), ('taper 85', a['TAPER'], '#4a90d9'), ('step-down 99', a['STEP'], '#c0392b')]
    # right pocket chain; through queue is inside it
    for name, w, col in parts:
        b.barh(i, w, left=base, color=col, edgecolor='white', label=name if i == 0 else None); base += w
    b.plot([f['avail']] * 2, [i - .42, i + .42], 'k-', lw=3)
    b.text(base + 6, i, f"need {f['need']:.0f} m / available {f['avail']:.0f} m  {'FITS' if f['ok'] else 'FAIL'}", va='center', fontsize=10, color='green' if f['ok'] else 'red')
b.set_yticks(range(4)); b.set_yticklabels(list('NESW')); b.invert_yaxis(); b.set_xlim(0, 560)
b.set_xlabel('metres from the stop line (black bar = available = clear length - stop line 31 m)'); b.legend(loc='upper center', bbox_to_anchor=(0.5, -0.12), ncol=4); b.grid(axis='x', alpha=.3)
b.set_title('Right pocket + taper + speed step-down per approach')
plt.tight_layout(); plt.savefig(sys.argv[3], dpi=110)

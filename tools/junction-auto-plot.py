# Picture of the 2 auto-junction pilots (docs/junction_auto_pilot.json -> docs/junction_auto_pilot.png). Real road asphalt in grey, pad in blue, fillets, stop line, zebra.
import json, sys, math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from matplotlib.patches import Polygon
d = sys.argv[1] if len(sys.argv) > 1 else 'docs'
data = json.load(open(f'{d}/junction_auto_pilot.json'))
fig, axs = plt.subplots(1, len(data), figsize=(7.5 * len(data), 8))
if len(data) == 1: axs = [axs]
for ax, item in zip(axs, data):
    r = item['res']; cx, cz = r['x'], r['z']
    R = 60 if r['type'] == 'T' else 70
    # real roads: asphalt band = polyline buffered by halfWidth (drawn as thick line)
    for rd in item['roads']:
        pts = [(p[0] - cx, p[1] - cz) for p in rd['pts']]
        xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
        # line width in points: metres * points-per-metre (axes 2R m over ~ 7 inch)
        ppm = (7.0 * 72) / (2 * R)
        ax.plot(xs, zs, color='#9a9a9a', lw=2 * rd['hw'] * ppm, solid_capstyle='butt', zorder=1)
        ax.plot(xs, zs, color='#f5f5f5', lw=0.8, ls=(0, (6, 6)), zorder=4)
    out = [(p[0] - cx, p[1] - cz) for p in r['outline']]
    ax.add_patch(Polygon(out, closed=True, fc='#4a7fbf', ec='#123a73', lw=1.6, alpha=0.75, zorder=3))
    for f in r['fillets']:
        c = (f['c'][0] - cx, f['c'][1] - cz)
        ax.plot(*c, marker='+', color='#c0392b', ms=7, zorder=6)
    if r.get('ring'):
        ring = r['ring']
        ax.add_patch(plt.Circle((0, 0), ring['islandR'], fc='#7fb069', ec='#2e5a1f', lw=1.2, zorder=5))
    for m in r['markings']:
        p0 = (m['p0'][0] - cx, m['p0'][1] - cz); p1 = (m['p1'][0] - cx, m['p1'][1] - cz)
        if m['kind'] == 'stop':
            ax.plot([p0[0], p1[0]], [p0[1], p1[1]], color='white', lw=3.5, zorder=7)
        else:
            # zebra band: depth along the leg direction (from the leg heading)
            leg = r['legs'][m['leg']]
            ux, uz = math.cos(math.radians(leg['heading'])), math.sin(math.radians(leg['heading']))
            n = 8
            for k in range(n):
                t = (k + 0.5) / n
                q0 = (p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t)
                ax.plot([q0[0], q0[0] + ux * m['depth']], [q0[1], q0[1] + uz * m['depth']], color='white', lw=3.0, zorder=7, path_effects=[pe.withStroke(linewidth=4.2, foreground='#333333')])
    for l in r['legs']:
        e = (l['endXZ'][0] - cx, l['endXZ'][1] - cz)
        ax.plot(*e, marker='o', color='#e67e22', ms=5, zorder=8)
        ax.annotate(f"{l['name']}\ntrim {l['trim']:.0f} m\nstep {l['stepToPlane']:+.2f} m", e, textcoords='offset points', xytext=(6, 6), fontsize=7.5, zorder=9)
    ax.set_xlim(-R, R); ax.set_ylim(R, -R)  # z down = same as the plan of the game (north up)
    ax.set_aspect('equal'); ax.grid(alpha=0.25)
    ttl = f"{r['id']}  {r['type']}  {'PASS' if r['pass'] else 'FAIL'}   pad {r['area']:.0f} m2, level {r['plane']['y0']:.2f} m"
    ttl += f"\nfillet R {r['kerbR']:.0f} m (skew: {min(f['phi'] for f in r['fillets']):.0f}/{max(f['phi'] for f in r['fillets']):.0f} deg)" if r['type'] == 'T' else f"\n{r['ring']['lanes']}-lane ring, ICD {r['ring']['icd']} m, island R {r['ring']['islandR']:.1f} m"
    ax.set_title(ttl, fontsize=10)
    ax.set_xlabel('x (m from the junction point)'); ax.set_ylabel('z (m)')
fig.suptitle('Auto connect at grade, pilot: grey = real road asphalt (NOT moved), blue = new pad, orange dot = ribbon trim end, red + = fillet centre, white = stop line / zebra', fontsize=9)
fig.tight_layout()
fig.savefig(f'{d}/junction_auto_pilot.png', dpi=110)
print('ok')

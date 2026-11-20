# STEP CRR-6 picture: zoom on the Central hub ring RR-HUB (ring + the 5 corridor roads starting at its edge, rail lines, existing roads) and the buildings whose footprint (incl. yard) lies on the ring.
# Run: python3 tools/crr6-hub-plot.py docs [hub_buildings.json]   (needs docs/crr5b_geo.json from scripts/crr-check.ts; the buildings json is the --json output of scripts/building-on-road-check.ts, filtered to road RR-HUB, optional)
import json, sys, math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
d = sys.argv[1] if len(sys.argv) > 1 else 'docs'
G = json.load(open(d + '/crr5b_geo.json'))
B = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else []
CX, CZ, W = 0.0, 300.0, 190.0
fig, ax = plt.subplots(figsize=(11, 11))
for r in G['existing']:
    ax.plot(r['x'], r['z'], color='#bbbbbb', lw=1.6 if r['lanes'] >= 6 else 0.8, zorder=1)
for e in G['rail']:
    ax.plot([q[0] for q in e['pts']], [q[1] for q in e['pts']], '--', color='#555555', lw=1.2, zorder=2)
for p in G['pieces']:
    if p['name'] == 'RR-HUB':
        xs, zs = p['x'] + [p['x'][0]], p['z'] + [p['z'][0]]
        ax.fill([a for a in xs], [b for b in zs], color='none')
        ax.plot(xs, zs, color='#c01896', lw=9, alpha=0.55, solid_capstyle='round', zorder=4, label='RR-HUB ring (R 70 m, 2 + 2 lanes, V40)')
        ax.plot(xs, zs, color='#c01896', lw=1, zorder=5)
    elif p['kind'] == 'rail':
        ax.plot(p['x'], p['z'], color='#1f6fd1', lw=7, alpha=0.5, solid_capstyle='butt', zorder=3)
        ax.plot(p['x'], p['z'], color='#1f6fd1', lw=1, zorder=5)
        ax.plot(p['x'][0], p['z'][0], 'o', color='#1f6fd1', ms=5, zorder=6)
        ax.annotate(p['name'].replace('CRR-', ''), (p['x'][0], p['z'][0]), textcoords='offset points', xytext=(6, 6), fontsize=9, color='#1f6fd1')
ax.plot([CX], [CZ], '+', color='k', ms=12, label='Central station point (0, 300)')
for b in B:
    c, s = math.cos(b['yaw']), math.sin(b['yaw'])
    hx, hz = b['W'] / 2, b['D'] / 2
    pts = [(b['x'] + lx * c + lz * s, b['z'] - lx * s + lz * c) for lx, lz in [(-hx, -hz), (hx, -hz), (hx, hz), (-hx, hz)]]
    ax.add_patch(Polygon(pts, closed=True, fill=True, fc='#ff9999', ec='red', lw=1.5, zorder=7))
    ax.annotate('%s\n(gap %.1f m)' % (b['id'], b['roadGap']), (b['x'], b['z']), fontsize=8, color='darkred', ha='center', zorder=8)
ax.set_xlim(CX - W, CX + W); ax.set_ylim(CZ - W, CZ + W); ax.set_aspect('equal'); ax.grid(alpha=0.3)
ax.set_title('CRR-6: hub ring RR-HUB round Central (flag Config.roads.corridorRoads, default OFF).  magenta = ring, blue = the 5 corridor roads (start at the ring edge, T), red = buildings on the ring')
ax.legend(loc='upper right', fontsize=9)
fig.savefig(d + '/city_rail_road_hub.png', dpi=110, bbox_inches='tight')
print('written ' + d + '/city_rail_road_hub.png')

# J1-b picture: geometry data of the ground-level "+" J1 (local frame: x = E arm, y = N arm, north up, left-hand traffic).
# Left: whole junction. Top right: north-east corner (slip lane, 25 m kerb arc, corner island, zebra). Bottom right: the N arm along its axis (vertical scale x3) with the tapers.
# Run: python3 tools/j1b-plot.py docs/j1b.json docs/j1b_layout.png
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon

g = json.load(open(sys.argv[1]))
COL = {'box': '#c9ced2', 'through-in': '#9a9a9a', 'through-out': '#bdbdbd', 'pocket': '#f2a93b', 'island': '#dfe6d3',
       'slip-in': '#58b45e', 'slip-arc': '#58b45e', 'slip-out': '#a9d9ac', 'corner-island': '#dfe6d3'}

def draw(ax, arms='NESW', bars=True, edge=0.25):
    for e in g['elements']:
        if e['arm'] not in arms and e['kind'] != 'box':
            continue
        for c in e['cells']:
            ax.add_patch(Polygon(c, closed=True, fc=COL[e['kind']], ec='#ffffff' if e['kind'] not in ('island', 'corner-island') else COL[e['kind']], lw=edge, zorder=2))
    if bars:
        for b in g['bars']:
            if b['id'][0] in arms:
                ax.add_patch(Polygon(b['poly'], closed=True, fc='white', ec='none', zorder=3))
    for s in g['stopLines']:
        if s['arm'] in arms:
            ax.plot([s['a'][0], s['b'][0]], [s['a'][1], s['b'][1]], color='#d62728', lw=2.2, zorder=4, solid_capstyle='butt')
    for k in g['kerbArcs']:
        if k['arm'] in arms:
            cx, cy = k['centre']
            ax.plot([cx], [cy], '+', color='#444', ms=5, zorder=5)

D = g['derived']
fig = plt.figure(figsize=(16, 9))
gs = fig.add_gridspec(2, 2, width_ratios=[1.0, 1.05], height_ratios=[1, 0.62])
a0 = fig.add_subplot(gs[:, 0]); a1 = fig.add_subplot(gs[0, 1]); a2 = fig.add_subplot(gs[1, 1])

draw(a0)
R = 125
a0.set_xlim(-R, R); a0.set_ylim(-R, R); a0.set_aspect('equal'); a0.grid(alpha=.25)
for d, (x, y) in {'N': (0, R - 8), 'E': (R - 8, 0), 'S': (0, -R + 6), 'W': (-R + 8, 0)}.items():
    a0.text(x, y, d, fontsize=14, ha='center', va='center', color='#1f4e79', weight='bold')
a0.set_title('J1 ground-level "+", geometry data (J1-b): box %.1f m, stop line %.2f m, corner kerb R %d m\n(local frame, north up; the arms are drawn up to 125 m, lane zone ends at s = %.0f m)' % (2 * D['B'], D['sStop'], g['params']['slipR'], max(g['sZone'].values())), fontsize=10)
a0.set_xlabel('e (m)'); a0.set_ylabel('n (m)')
a0.text(-R + 4, -R + 4, 'grey = through lanes, orange = right pockets, green = slip lane (dark) and receiving lane (light),\nlight green-grey = islands, white bars = zebra, red = stop lines', fontsize=8, va='bottom')

draw(a1, arms='NE', edge=0.4)
a1.set_xlim(8, 66); a1.set_ylim(8, 66); a1.set_aspect('equal'); a1.grid(alpha=.25)
a1.set_title('North-east corner: N-arm slip lane (taper, straight, 25 m kerb arc) into the E-arm receiving lane, corner island, zebra', fontsize=9)
a1.annotate('corner island\n(nose 1.0 m wide)', (30, 24), (44, 14), fontsize=8, arrowprops=dict(arrowstyle='->'))
a1.annotate('slip zebra (45 deg of the arc)', (31.4, 31.4), (40, 44), fontsize=8, arrowprops=dict(arrowstyle='->'))
a1.annotate('kerb arc R 25 m\ncentre (48.4, 48.4)', (30.7 + 1.0, 30.7 + 1.0), (50, 56), fontsize=8, arrowprops=dict(arrowstyle='->'))
a1.annotate('stop line', (13, 24.0), (9, 38), fontsize=8, color='#d62728', arrowprops=dict(arrowstyle='->', color='#d62728'))

# long view of the N arm in (s, o), vertical x3
for e in g['elements']:
    if e['arm'] != 'N' or e['kind'] in ('box', 'corner-island', 'slip-arc'):
        continue
    for c in e['cells']:
        a2.add_patch(Polygon([(p[1], p[0]) for p in c], closed=True, fc=COL[e['kind']], ec='#ffffff', lw=0.3, zorder=2))
# receiving lane of the W arm slip lies on the -o side of the N arm (local frame x < 0, y >= 48.4)
for e in g['elements']:
    if e['arm'] == 'W' and e['kind'] == 'slip-out':
        for c in e['cells']:
            a2.add_patch(Polygon([(p[1], p[0]) for p in c], closed=True, fc=COL['slip-out'], ec='#ffffff', lw=0.3, zorder=2))
a2.set_xlim(15, 285); a2.set_ylim(-27, 27); a2.grid(alpha=.25)
a2.axvline(D['sStop'], color='#d62728', lw=1.5); a2.text(D['sStop'] + 2, 24, 'stop line', color='#d62728', fontsize=8)
a2.axvline(g['sZone']['N'], color='#333', lw=1, ls='--'); a2.text(g['sZone']['N'] + 2, -25, 'plain M8 from here', fontsize=8)
p = g['pockets']['N']
a2.text(D['sStop'] + p['R1end'] + 2, 8.2, 'R1 ends', fontsize=8, color='#a86a00'); a2.text(D['sStop'] + p['R2end'] - 6, 11.8, 'R2 ends', fontsize=8, color='#a86a00')
a2.text(D['sArc0'], 24.6, 'arc starts', fontsize=8, ha='center'); a2.text(D['sSlip0'], 24.6, 'slip taper-in starts', fontsize=8, ha='center')
a2.set_xlabel('s = distance from the J1 centre along the N arm (m)'); a2.set_ylabel('o (m), + = inbound side')
a2.set_title('N arm along its axis (o scale x3): pocket tapers staggered 30 m, slip taper-in, median shift back to M8 (receiving lane of the W slip: o = -23.4 .. -19.75)', fontsize=8)
plt.tight_layout(); plt.savefig(sys.argv[2], dpi=110)
print('wrote', sys.argv[2])

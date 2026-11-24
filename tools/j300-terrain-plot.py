# J6 pictures from docs/J300_TERRAIN.json (+ J300_GEOM.json frame). Writes docs/j300_terr_plan.png (plan of the toe lines + arm profiles) and docs/j300_terr_view.png (3D view).
# Concept pictures from the J6 numbers, NOT a game render.
import json, math
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Circle, Rectangle
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
T = json.load(open('docs/J300_TERRAIN.json')); F = T['frame']; yaw = F['yaw']; ux, uz = math.cos(yaw), math.sin(yaw)
def toL(x, z): return ((x - F['ox']) * ux + (z - F['oz']) * uz, (x - F['ox']) * uz - (z - F['oz']) * ux)
DECK = T['platform']['deckY']
fig = plt.figure(figsize=(18, 11))
ax = fig.add_axes([0.04, 0.38, 0.55, 0.57]); ax.set_aspect('equal'); ax.set_title('J6 plan (local frame u along the ring, v left): toe lines. blue = platform, brown = R6 / R4 arm toes (red where cut), orange = ramps (rail crossing of R6 at arm station 296, magenta line in the profile)', fontsize=9)
ax.add_patch(Rectangle((-460, -22.1), 1120, 44.2, color='#c9c9cc', lw=0)); ax.add_patch(Circle((0, 0), 62, color='#8a8a8f'))
ax.plot(*zip(*[toL(t[4], t[5]) for t in T['platform']['toe'] + [T['platform']['toe'][0]]]), color='#1f77b4', lw=1.5)
for k in ('R6', 'R4'):
    rows = T['arms'][k]['rows']; ctr = [toL(r[1], r[2]) for r in rows]; ax.plot(*zip(*ctr), color='k', lw=1)
    for (h, tx, tz) in ((5, 7, 8), (9, 11, 12)):
        for i in range(len(rows) - 1):
            ax.plot(*zip(toL(rows[i][tx], rows[i][tz]), toL(rows[i + 1][tx], rows[i + 1][tz])), color=('#c0392b' if rows[i][h] < 0 else '#8c6d3f'), lw=1)
for r in T['ramps']:
    pts = [toL(t[3], t[4]) for t in r['toe'] if t[2] > 0]
    if pts: ax.plot(*zip(*pts), color='#e67e22', lw=1)
ax.autoscale(); ax.grid(alpha=.3)
for i, (k, c) in enumerate((('R6', '#8c6d3f'), ('R4', '#c0392b'))):
    a = fig.add_axes([0.62, 0.68 - i * 0.30, 0.35, 0.25]); rows = T['arms'][k]['rows']
    a.plot([r[0] for r in rows], [r[3] for r in rows], color='k', lw=2, label=f'{k} road level'); a.plot([r[0] for r in rows], [r[4] for r in rows], color=c, lw=1.5, label='natural ground')
    a.set_title(f"{k} arm profile (fill max {T['arms'][k]['fillMax']} m, cut max {T['arms'][k]['cutMax']} m)", fontsize=9); a.legend(fontsize=7); a.grid(alpha=.3)
    if k == 'R6': a.axvline(296.5, color='m', lw=1); a.text(300, 30, 'rail crossing s 296', color='m', fontsize=7)
fig.savefig('docs/j300_terr_plan.png', dpi=100); plt.close(fig)
# 3D: platform disc at deck level, arms as ribbons (road level) with natural ground lines, VE x2
VE = 2.0; fig = plt.figure(figsize=(16, 9)); a = fig.add_subplot(111, projection='3d'); a.set_title('J6 3D concept: raised platform + R6 arm (fill) + R4 arm (deep cut), vertical scale x2', fontsize=10)
th = [i * math.pi / 60 for i in range(121)]; a.plot([62 * math.cos(t) for t in th], [62 * math.sin(t) for t in th], [DECK * VE] * len(th), color='k', lw=2)
for k, c in (('R6', '#8c6d3f'), ('R4', '#c0392b')):
    rows = T['arms'][k]['rows']; L = [toL(r[1], r[2]) for r in rows]
    a.plot([p[0] for p in L], [p[1] for p in L], [r[3] * VE for r in rows], color='k', lw=3); a.plot([p[0] for p in L], [p[1] for p in L], [r[4] * VE for r in rows], color=c, lw=1.2)
for r in T['ramps']:
    pts = [toL(t[3], t[4]) for t in r['toe'] if t[2] > 0]
    if pts: a.plot([p[0] for p in pts], [p[1] for p in pts], [DECK * VE * 0.0 + 19 * VE] * len(pts), color='#e67e22', lw=1)
a.set_box_aspect((1.2, 1.6, 0.5)); a.view_init(elev=30, azim=-120); a.set_xlabel('u'); a.set_ylabel('v')
fig.subplots_adjust(left=0, right=1, bottom=0, top=0.95); fig.savefig('docs/j300_terr_view.png', dpi=100); plt.close(fig); print('plotted')

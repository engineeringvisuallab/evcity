# J4 pictures from docs/J300_GEOM.json. Writes docs/j300_geom_plan.png (roundabout plan + arms plan + arm profiles) and docs/j300_geom_view.png (3D view of the deck and arms).
# Concept pictures from the J4 numbers, NOT a game render.
import json, math
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Polygon
J = json.load(open('docs/J300_GEOM.json')); RO, RI = 62, 48
fig = plt.figure(figsize=(17, 10.5))
ax = fig.add_axes([0.03, 0.34, 0.40, 0.62]); ax.set_aspect('equal'); ax.set_xlim(-140, 140); ax.set_ylim(-130, 130)
ax.set_title('J4 roundabout plan (local frame: u right = along the ring, v up = left of u)', fontsize=10)
ax.add_patch(Circle((0, 0), RO, color='#8a8a8f')); ax.add_patch(Circle((0, 0), RI, color='#cfd8c0'))
col = {'R6': '#c0392b', 'R4': '#1f6fb2', 'E-in': '#2e8b57', 'E-out': '#e67e22', 'W-in': '#2e8b57', 'W-out': '#e67e22'}
for l in J['legs']:
    for part in ('entry', 'exit'):
        q = l.get(part)
        if not q: continue
        L, R = q['left'], q['right']
        ax.add_patch(Polygon(L + R[::-1], closed=True, fc=col[l['id']], alpha=.45, ec='k', lw=.4))
    ax.text(*( (l.get('entry') or l['exit'])['centre'][0][:2] ), l['id'], fontsize=7)
for il in J['islands']: ax.add_patch(Polygon(il['polygon'], closed=True, fc='#3c7a3c', ec='k', lw=.5))
for c in J['crossings']:
    ax.plot(c['centre'][0], c['centre'][1], 's', color='w', mec='k', ms=5)
ax.grid(alpha=.2)
# arms plan (world)
ax2 = fig.add_axes([0.46, 0.34, 0.50, 0.62]); ax2.set_aspect('equal'); ax2.set_title('R6 and R4 arms in world plan (x east, z south). Red = R6, blue = R4 (re-route), dot = circle centre', fontsize=10)
for k, c in (('R6', '#c0392b'), ('R4', '#1f6fb2')):
    r = J['arms'][k]['rows']; ax2.plot([p['x'] for p in r], [p['z'] for p in r], color=c, lw=2, label=k)
ax2.plot(J['frame']['ox'], J['frame']['oz'], 'ko'); ax2.invert_yaxis(); ax2.grid(alpha=.3); ax2.legend()
# profiles
for i, k in enumerate(('R6', 'R4')):
    a = fig.add_axes([0.05 + i * 0.47, 0.06, 0.42, 0.21]); r = J['arms'][k]['rows']
    s = [p['s'] for p in r]; a.fill_between(s, [p['nat'] for p in r], [p['y'] for p in r], where=[p['y'] >= p['nat'] for p in r], color='#c8a97e', alpha=.7, label='fill')
    a.fill_between(s, [p['nat'] for p in r], [p['y'] for p in r], where=[p['y'] < p['nat'] for p in r], color='#7a9e7e', alpha=.7, label='cut')
    a.plot(s, [p['nat'] for p in r], 'k', lw=1, label='natural ground'); a.plot(s, [p['y'] for p in r], 'r' if k == 'R6' else 'b', lw=2, label='road')
    a.set_title(f"{k} profile from the circle edge (s m). max grade ok; R4 cut {max(p['nat']-p['y'] for p in r):.1f} m = FAIL vs 12 m" if k == 'R4' else f"{k} profile from the circle edge (s m)", fontsize=9); a.grid(alpha=.3); a.legend(fontsize=7)
fig.savefig('docs/j300_geom_plan.png', dpi=110); plt.close(fig)
# 3D
from mpl_toolkits.mplot3d import Axes3D
fig = plt.figure(figsize=(14, 8)); a = fig.add_subplot(111, projection='3d')
ox, oz = J['frame']['ox'], J['frame']['oz']; yaw = J['frame']['yaw']; ux, uz = math.cos(yaw), math.sin(yaw)
def W(u, v): return (ox + u * ux + v * uz, oz + u * uz - v * ux)
Y = J['frame']['deckY']
t = [i * math.pi / 90 for i in range(181)]
a.plot(*zip(*[(W(RO * math.cos(x), RO * math.sin(x))[0], W(RO * math.cos(x), RO * math.sin(x))[1], Y) for x in t]) if False else ([W(RO*math.cos(x),RO*math.sin(x))[0] for x in t], [W(RO*math.cos(x),RO*math.sin(x))[1] for x in t], [Y]*len(t)), 'k', lw=2)
for l in J['legs']:
    for part in ('entry', 'exit'):
        q = l.get(part)
        if not q: continue
        pts = [W(p[0], p[1]) for p in q['centre']]; a.plot([p[0] for p in pts], [p[1] for p in pts], [Y] * len(pts), color=col[l['id']], lw=2)
for k, c in (('R6', '#c0392b'), ('R4', '#1f6fb2')):
    r = J['arms'][k]['rows']; a.plot([p['x'] for p in r], [p['z'] for p in r], [p['y'] for p in r], color=c, lw=3, label=k + ' road')
    a.plot([p['x'] for p in r], [p['z'] for p in r], [p['nat'] for p in r], color='#7a6a4f', lw=1.2, label=k + ' ground')
a.set_zlim(0, 100); a.view_init(elev=28, azim=-55); a.legend(); a.set_title('J4 3D concept: roundabout deck at 35.3 m, R6 and R4 arms (road vs natural ground)')
a.set_box_aspect((2, 2, 0.5)); fig.savefig('docs/j300_geom_view.png', dpi=110)

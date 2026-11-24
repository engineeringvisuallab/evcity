# J5 pictures from docs/J300_RAMPS.json. Writes docs/j300_ramp_plan.png (plan along the ring + profiles) and docs/j300_ramp_view.png (3D view).
# Concept pictures from the J5 numbers, NOT a game render.
import json, math
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Circle, Rectangle
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
R = json.load(open('docs/J300_RAMPS.json')); U0 = -125; RO = 62
col = {'E-out': '#e67e22', 'W-out': '#e67e22', 'E-in': '#2e8b57', 'W-in': '#2e8b57'}
RT = R['ringTable']
def ringy(u):
    t = (u + 700) / 5; i = max(0, min(len(RT) - 2, int(math.floor(t)))); f = t - i
    return RT[i][1] + f * (RT[i + 1][1] - RT[i][1])
fig = plt.figure(figsize=(18, 11))
ax = fig.add_axes([0.04, 0.55, 0.93, 0.38]); ax.set_aspect('equal'); ax.set_xlim(-460, 660); ax.set_ylim(-70, 70)
ax.set_title('J5 ramps in plan (local frame: u along the ring, v = left). Ring 8 lane grey, roundabout in the middle. Orange = out (merge), green = in (diverge), dark = gore wedge', fontsize=10)
ax.add_patch(Rectangle((-460, -22.1), 1120, 44.2, color='#c9c9cc', lw=0)); ax.add_patch(Circle((0, 0), RO, color='#8a8a8f'))
ax.axvline(-435, color='r', ls='--', lw=1); ax.text(-433, 58, 'rail limit (ring u -560)', color='r', fontsize=8); ax.axvline(645, color='b', ls='--', lw=1); ax.text(560, 58, 'water limit (ring u 520)', color='b', fontsize=8)
for r in R['ramps']:
    A = [(x[7], x[8]) for x in r['rows']]; B = [(x[9], x[10]) for x in r['rows']]
    ax.add_patch(Polygon(A + B[::-1], closed=True, fc=col[r['id']], alpha=.65, ec='k', lw=.4))
    ax.add_patch(Polygon(r['gore'], closed=True, fc='#222', alpha=.85))
    ax.plot(r['noseU'], 0, 'k^', ms=5)
    ax.text(r['noseU'] + (6 if r['d'] > 0 else -6), (24 if r['sv'] > 0 else -33), f"{r['id']} nose u {r['noseU']}\naux {r['lane']['auxLen']:.0f} m + taper {r['lane']['taperLen']:.0f} m", fontsize=7, ha='left' if r['d'] > 0 else 'right')
zx = fig.add_axes([0.55, 0.475, 0.40, 0.065]); zx.set_xlim(130, 330); zx.set_ylim(14, 38); zx.set_title('zoom E-out: S-curve, lane drop; dark = area between ring edge and ramp edge (gore wedge, v stretched)', fontsize=7)
zx.add_patch(Rectangle((130, -22.1), 200, 22.1 + 19.1, color='#c9c9cc', lw=0))
for r in R['ramps']:
    if r['id'] != 'E-out': continue
    A = [(x[7], x[8]) for x in r['rows']]; B = [(x[9], x[10]) for x in r['rows']]
    zx.add_patch(Polygon(A + B[::-1], closed=True, fc=col[r['id']], alpha=.65, ec='k', lw=.4)); zx.add_patch(Polygon(r['gore'], closed=True, fc='#222', alpha=.85))
zx.tick_params(labelsize=7)
for i, (k, sx) in enumerate((('E', 1), ('W', -1))):
    a = fig.add_axes([0.05 + i * 0.47, 0.06, 0.42, 0.34])
    a.set_title(f"{k} side profiles vs distance from the circle edge (sigma m); black = ring level at the same u", fontsize=9)
    for r in R['ramps']:
        if r['d'] != sx: continue
        s = [x[3] for x in r['rows']]; y = [x[4] for x in r['rows']]
        a.plot(s, y, color=col[r['id']], ls='-' if r['type'] == 'merge' else '--', lw=2, label=f"{r['id']} grade {r['vert']['grade']:.2f} %, nose sigma {r['vert']['sigmaN']:.0f}")
        a.plot(s, [ringy(x[0]) for x in r['rows']], color='k', lw=.8)
        a.axvline(r['vert']['sigmaN'], color=col[r['id']], alpha=.3, lw=1)
    a.axhline(R['constants']['deck'], color='grey', lw=.6); a.grid(alpha=.3); a.legend(fontsize=7)
fig.savefig('docs/j300_ramp_plan.png', dpi=110); plt.close(fig)

# ---- 3D view (local frame, vertical exaggeration x4)
fig = plt.figure(figsize=(16, 9)); a = fig.add_subplot(111, projection='3d'); VE = 5.0
a.set_title('J5 3D concept: roundabout deck 35.3 m, 4 ramps down to the ring (vertical scale x5, central 700 m, ramp decks coloured, natural ground under them thin)')
sel = [q for q in RT if -330 <= q[0] <= 400]; rx = [q[0] for q in sel]; ry = [q[1] * VE for q in sel]
a.plot(rx, [0] * len(rx), ry, color='#444', lw=5, label='ring axis')
th = [i * math.pi / 90 for i in range(181)]
a.plot([RO * math.cos(t) for t in th], [RO * math.sin(t) for t in th], [R['constants']['deck'] * VE] * len(th), color='k', lw=2, label='roundabout deck')
for r in R['ramps']:
    quads = []
    rows = r['rows']
    for i in range(len(rows) - 1):
        p, q = rows[i], rows[i + 1]
        quads.append([(p[7], p[8], p[4] * VE), (p[9], p[10], p[4] * VE), (q[9], q[10], q[4] * VE), (q[7], q[8], q[4] * VE)])
    a.add_collection3d(Poly3DCollection(quads, facecolor=col[r['id']], edgecolor='none', alpha=.9))
    a.plot([x[0] for x in rows], [x[1] for x in rows], [x[5] * VE for x in rows], color='#8b7d5a', lw=.8)
    a.plot([r['noseU']], [r['sv'] * 19.1], [r['vert']['ringLevelNose'] * VE], 'k^')
a.set_xlim(-330, 400); a.set_ylim(-75, 75); a.set_zlim(25 * VE, 38 * VE); a.set_box_aspect((5, 1.6, 1.1)); a.view_init(elev=27, azim=-58)
a.set_xlabel('u (m)'); a.set_ylabel('v (m)'); a.set_zticks([27 * VE, 30 * VE, 33 * VE, 36 * VE]); a.set_zticklabels(['27', '30', '33', '36'])
fig.subplots_adjust(left=0, right=1, bottom=0, top=0.95); fig.savefig('docs/j300_ramp_view.png', dpi=110); plt.close(fig)
print('plotted')

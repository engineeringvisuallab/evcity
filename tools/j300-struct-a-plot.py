# J7-A pictures from docs/J300_STRUCT_A.json -> docs/j300_struct_a.png (cross-section, long section with the ring SAG, 3D view). Concept pictures from the numbers, NOT a game render.
import json, math
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
S = json.load(open('docs/J300_STRUCT_A.json')); B = S['box']; DECK = B['roof']['topY']; SOF = B['roof']['soffitY']
fig = plt.figure(figsize=(17, 10.5))
# ---- cross-section at u = 0
ax = fig.add_axes([0.04, 0.55, 0.30, 0.38]); ax.set_aspect('equal'); ax.set_title('J7-A cross-section at u = 0 (looking along the ring)', fontsize=10)
ry = [s['ring'] for s in S['stations'] if abs(s['u']) < 3][0]; fb = ry - B['baseSlab']
vi, vc, vo = B['centralWall'] / 2, B['centralWall'] / 2 + B['cellClear'], B['centralWall'] / 2 + B['cellClear'] + B['outerWall']
def rect(x0, x1, y0, y1, c): ax.fill([x0, x1, x1, x0], [y0, y0, y1, y1], color=c, ec='k', lw=.5)
rect(-vo, vo, DECK - B['roof']['thick'], DECK, '#9aa0a6'); rect(-vo, -vc, fb, SOF, '#b9bdc1'); rect(vc, vo, fb, SOF, '#b9bdc1'); rect(-vi, vi, fb, SOF, '#b9bdc1'); rect(-vo, vo, fb, ry, '#7d7f82')
rect(-vc, -vi, ry, ry + 0.1, '#333'); rect(vi, vc, ry, ry + 0.1, '#333')
ax.annotate('', xy=(-vc / 2, SOF), xytext=(-vc / 2, ry), arrowprops=dict(arrowstyle='<->')); ax.text(-vc / 2 + .5, ry + 0.4, f'{SOF - ry:.2f} m clear', fontsize=8)
ax.text(0, DECK + .5, f'roundabout deck {DECK} m (roof 2.0 m)', ha='center', fontsize=8); ax.text(0, fb - 1.4, 'base slab 0.8 m', ha='center', fontsize=8)
ax.text(-vc / 2 - 4, ry + 3.2, 'cell L (22.1 m clear)', ha='center', fontsize=8); ax.text(vc / 2 + 4, ry + 3.2, 'cell R (22.1 m clear)', ha='center', fontsize=8)
ax.set_xlim(-30, 30); ax.set_ylim(fb - 3, DECK + 3); ax.set_xlabel('v (m)'); ax.set_ylabel('level (m)')
# ---- long section
bx = fig.add_axes([0.40, 0.55, 0.57, 0.38]); bx.set_title('J7-A long section along the ring: the ring is a SAG, low point inside the box -> sump + pumps (not drained to the portals)', fontsize=10)
us = [s['u'] for s in S['stations']]; rs = [s['ring'] for s in S['stations']]
bx.fill_between([B['u0'], B['u1']], [DECK - 2, DECK - 2], [DECK, DECK], color='#9aa0a6', label='roof deck 2.0 m'); bx.plot(us, rs, 'k', lw=2, label='ring surface (real levels)')
bx.plot([B['u0'], B['u1']], [SOF, SOF], color='#c0392b', lw=1.2, label='soffit 33.3 m'); bx.plot([B['u0'], B['u1']], [rs[0] + 5.5] * 2 if False else [max(rs) + 5.5] * 2, '--', color='#2e8b57', lw=1, label='5.5 m over the highest ring point')
bx.plot([S['ring']['lowPointU']], [S['ring']['lowPointY']], 'bv', ms=9, label=f"sump (low point u {S['ring']['lowPointU']}, {S['ring']['lowPointY']} m)")
for w in S['wing']:
    if w['side'] == 'L': bx.fill_between([r['u'] for r in w['rows']], [r['ring'] for r in w['rows']], [r['top'] for r in w['rows']], color='#d98c5f', alpha=.6)
bx.set_xlim(-100, 100); bx.set_ylim(26.5, 36.5); bx.set_xlabel('u along the ring (m)', labelpad=2); bx.set_ylabel('level (m)'); bx.legend(fontsize=7, loc='upper center', ncol=3); bx.grid(alpha=.3)
# ---- 3D view
cx = fig.add_axes([0.04, 0.0, 0.93, 0.47], projection='3d'); cx.set_title('J7-A 3D concept (vertical scale x3): box under the raised roundabout, wing walls, ring surface', fontsize=10)
VE = 3.0
def box3(u0, u1, v0, v1, z0, z1, c, a=1):
    P = [(u0, v0, z0), (u1, v0, z0), (u1, v1, z0), (u0, v1, z0), (u0, v0, z1), (u1, v0, z1), (u1, v1, z1), (u0, v1, z1)]; P = [(p[0], p[1], p[2] * VE) for p in P]
    F = [[P[i] for i in f] for f in ((0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (0, 3, 7, 4))]; cx.add_collection3d(Poly3DCollection(F, facecolors=c, edgecolors='k', linewidths=.3, alpha=a))
box3(B['u0'], B['u1'], -vo, vo, DECK - 2, DECK, '#b0b4b8', .55)
box3(B['u0'], B['u1'], vc, vo, fb, SOF, '#8b8f93', 1); box3(B['u0'], B['u1'], -vo, -vc, fb, SOF, '#8b8f93', 1); box3(B['u0'], B['u1'], -vi, vi, fb, SOF, '#8b8f93', 1)

box3(-110, 110, -22.1, 22.1, ry - 0.15, ry, '#444', .35)
for w in S['wing']:
    for a, b in zip(w['rows'][:-1], w['rows'][1:]):
        sgn = 1 if w['side'] == 'L' else -1; box3(min(a['u'], b['u']), max(a['u'], b['u']), sgn * (abs(w['vFace']) - 0.0), sgn * (abs(w['vFace']) + a['t']), min(a['ring'], b['ring']) - 0.3, max(a['top'], b['top']), '#d98c5f', 1)
t = [i * math.pi / 90 for i in range(181)]; cx.plot([62 * math.cos(x) for x in t], [62 * math.sin(x) for x in t], [DECK * VE] * len(t), 'k', lw=1.5); cx.plot([48 * math.cos(x) for x in t], [48 * math.sin(x) for x in t], [DECK * VE] * len(t), color='#2e8b57', lw=1)
cx.set_xlim(-110, 110); cx.set_ylim(-70, 70); cx.set_zlim(24 * VE, 37 * VE); cx.set_box_aspect((2.2, 1.4, 0.6)); cx.view_init(elev=24, azim=-58); cx.set_xlabel('u'); cx.set_ylabel('v'); cx.set_zticks([])
fig.savefig('docs/j300_struct_a.png', dpi=110); print('plotted')

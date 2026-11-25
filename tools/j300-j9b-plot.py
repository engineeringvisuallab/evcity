# J9-b picture from docs/J300_J9B.json (written by scripts/j300-j9b-check.ts): plan of the ground lowering, cross sections, 3D of the R4 cutting. Writes docs/j300_j9b.png. Concept picture from the real game terrain numbers, NOT a game render.
import json, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
D = json.load(open('docs/J300_J9B.json')); G = {g['id']: g for g in D['grids']}
def arr(g, k): return np.array(g[k]).reshape(g['n'], g['n'])
fig = plt.figure(figsize=(19, 12.5))
def plan(ax, key, arm_ids, title):
    g = G[key]; a, b = arr(g, 'carve'), arr(g, 'nocarve'); xs = g['x0'] + np.arange(g['n']) * g['step']; zs = g['z0'] + np.arange(g['n']) * g['step']
    im = ax.pcolormesh(xs, zs, b - a, cmap='Reds', shading='auto', vmin=0, vmax=max(2, float((b - a).max()))); plt.colorbar(im, ax=ax, label='ground lowered by the carve (m)', shrink=0.8)
    ax.contour(xs, zs, a, levels=np.arange(20, 90, 5), colors='k', linewidths=0.4, alpha=0.6)
    for A in D['arms']:
        if A['id'] in arm_ids:
            r = np.array(A['rows']); ax.plot(r[:, 1], r[:, 2], color='#1f77b4', lw=2, label=f"{A['id']} arm centre line")
    ax.set_aspect('equal'); ax.set_xlim(xs[0], xs[-1]); ax.set_ylim(zs[0], zs[-1]); ax.set_title(title, fontsize=9); ax.legend(fontsize=7, loc='upper left'); ax.grid(alpha=.2)
plan(fig.add_axes([0.03, 0.54, 0.30, 0.42]), 'R4 hill saddle (join)', ['R4'], 'J9-b plan: R4 arm in the hill saddle (red = ground cut away by the new carve, contours = ground after the carve, 5 m)')
plan(fig.add_axes([0.36, 0.54, 0.26, 0.42]), 'R6 free end', ['R6'], 'J9-b plan: R6 arm free end (old R6-9 removed)')
S = D['sections']; pick = [('R4', 200), ('R4', 250), ('R4', 300), ('R4', 330), ('R6', 570), ('R6', 600)]
for i, (aid, sv) in enumerate(pick):
    s = min([q for q in S if q['id'] == aid], key=lambda q: abs(q['s'] - sv)); ax = fig.add_axes([0.65 + (i % 2) * 0.175, 0.77 - (i // 2) * 0.115, 0.155, 0.095])
    ax.fill_between(s['offs'], s['off'], min(s['off'] + s['on']) - 2, color='#d9c9a3', label='natural ground'); ax.plot(s['offs'], s['on'], color='#c0392b', lw=1.5, label='with carve')
    ax.plot([-s['top'], s['top']], [s['y'], s['y']], color='k', lw=3, label='road'); ax.set_title(f"{aid} s {s['s']:.0f}  (road {s['y']:.1f} m)", fontsize=7); ax.tick_params(labelsize=6); ax.grid(alpha=.3)
    if i == 0: ax.legend(fontsize=5, loc='upper right')
# 3D of the R4 saddle: ground with the carve and the road ribbon
from mpl_toolkits.mplot3d import Axes3D  # noqa
g = G['R4 hill saddle (join)']; a = arr(g, 'carve'); xs = g['x0'] + np.arange(g['n']) * g['step']; zs = g['z0'] + np.arange(g['n']) * g['step']; X, Z = np.meshgrid(xs, zs)
a3 = fig.add_axes([0.02, 0.0, 0.62, 0.52], projection='3d'); a3.plot_surface(X, Z, a, cmap='terrain', linewidth=0, antialiased=True, alpha=0.95, vmin=15, vmax=80)
r = np.array([A for A in D['arms'] if A['id'] == 'R4'][0]['rows']); a3.plot(r[:, 1], r[:, 2], r[:, 3] + 0.5, color='k', lw=4)
a3.set_box_aspect((1.3, 1.3, 0.45)); a3.view_init(elev=38, azim=-35); a3.set_title('J9-b 3D: R4 arm (black) in the hill cutting made by the carve (ground after the carve, 4 m grid, game terrain numbers)', fontsize=9); a3.set_xlabel('x'); a3.set_ylabel('z')
fig.text(0.66, 0.02, 'Numbers: docs/J300_J9B.txt (0 FAIL). Concept picture from game terrain samples, NOT an in-game render.', fontsize=8)
fig.savefig('docs/j300_j9b.png', dpi=90); plt.close(fig); print('plotted')

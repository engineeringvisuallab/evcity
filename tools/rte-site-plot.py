# STEP RE-0 picture: python3 tools/rte-site-plot.py docs   (needs docs/rte_site.json from scripts/rte-site-check.ts)
import json, sys, math
import numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
d = sys.argv[1] if len(sys.argv) > 1 else 'docs'
j = json.load(open(f'{d}/rte_site.json')); JX, JZ = j['J']; g = np.array(j['grid'])
ext = [JX - 700, JX + 700, JZ + 700, JZ - 700]
fig, ax = plt.subplots(figsize=(11, 10))
im = ax.imshow(g, extent=ext, cmap='terrain', vmin=g.min(), vmax=g.max(), alpha=.85)
cs = ax.contour(np.linspace(JX - 700, JX + 700, g.shape[1]), np.linspace(JZ - 700, JZ + 700, g.shape[0]), g, levels=np.arange(math.floor(g.min() / 5) * 5, g.max(), 5), colors='k', linewidths=.35)
ax.clabel(cs, fmt='%d', fontsize=6)
r = np.array(j['ringPts']); a = np.array(j['armPts'])
ax.plot(r[:, 0], r[:, 1], 'r-', lw=4, label='ring M8 (8 lane)'); ax.plot(a[:, 0], a[:, 1], color='orange', lw=4, label='J1-E arm (8 lane)')
rp = np.array(j['railPts']);
if len(rp): ax.plot(rp[:, 0], rp[:, 1], 'b--', lw=2, label='rail east-2')
for o in j['otherPts']:
    p = np.array(o['p']); ax.plot(p[:, 0], p[:, 1], color='gray', lw=1.5); ax.text(p[0, 0], p[0, 1], o['n'], fontsize=7)
tx, tz = j['t']; lx, lz = j['ln']
for sg in (-1, 1):
    for side in (1, -1):
        c = []
        for rel, lat in ((80, 25), (600, 25), (600, 200), (80, 200)):
            c.append((JX + sg * rel * tx + side * lat * lx, JZ + sg * rel * tz + side * lat * lz))
        c.append(c[0]); cc = np.array(c); far = side != j['sideStem']
        ax.plot(cc[:, 0], cc[:, 1], 'g-' if far else 'm-', lw=1.2)
        m = cc[:4].mean(0); ax.text(m[0], m[1], ('R- ' if sg < 0 else 'R+ ') + ('FAR' if far else 'STEM'), fontsize=9, ha='center', color='g' if far else 'm', weight='bold')
ax.plot([JX], [JZ], 'k*', ms=16); ax.set_title('RT-E site (RE-0): natural ground (contour 5 m), ring, arm, rail, boxes; x east, z south (down)')
ax.set_aspect('equal'); ax.legend(loc='upper left'); plt.colorbar(im, ax=ax, shrink=.6, label='natural ground (m)')
plt.savefig(f'{d}/rte_site.png', dpi=110, bbox_inches='tight')
# rail crossing of the ring centreline (lateral = 0) in the ring frame
pts = [(p[2], p[3]) for p in j['railPts']]
cross = [round(x1 + (x2 - x1) * (0 - y1) / (y2 - y1)) for (x1, y1), (x2, y2) in zip(pts, pts[1:]) if y1 * y2 < 0]
print('rail crosses the ring centreline at along-ring offsets (m from the T):', cross)

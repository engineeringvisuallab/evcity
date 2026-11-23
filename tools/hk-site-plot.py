# STEP HK-0 picture: python3 tools/hk-site-plot.py docs   (needs docs/hk_site.json from scripts/hk-site-check.ts)
import json, sys, math
import numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
d = sys.argv[1] if len(sys.argv) > 1 else 'docs'
j = json.load(open(f'{d}/hk_site.json')); JX, JZ = j['J']; g = np.array(j['grid'])
ext = [JX - 700, JX + 700, JZ + 700, JZ - 700]
fig, ax = plt.subplots(figsize=(11, 10))
im = ax.imshow(g, extent=ext, cmap='terrain', vmin=g.min(), vmax=g.max(), alpha=.85)
cs = ax.contour(np.linspace(JX - 700, JX + 700, g.shape[1]), np.linspace(JZ - 700, JZ + 700, g.shape[0]), g, levels=np.arange(math.floor(g.min() / 5) * 5, g.max(), 5), colors='k', linewidths=.35)
ax.clabel(cs, fmt='%d', fontsize=6)
for key, col, lab in (('ringPts', 'r', 'ring M8 (8 lane)'), ('armPts', 'orange', 'J1-S arm (8 lane)'), ('linkPts', 'm', 'island link M6-1 (6 lane)')):
    p = np.array(j[key]); ax.plot(p[:, 0], p[:, 1], color=col, lw=4, label=lab)
rp = np.array(j['railPts'])
if len(rp): ax.plot(rp[:, 0], rp[:, 1], 'b.', ms=2, label='rail')
for o in j['otherPts']:
    p = np.array(o['p']); ax.plot(p[:, 0], p[:, 1], color='gray', lw=1.5); ax.text(p[0, 0], p[0, 1], o['n'], fontsize=7)
tx, tz = j['t']; lx, lz = j['ln']
for q in j['quads']:
    sg, side = q['sg'], q['side']; c = []
    for rel, lat in ((100, 40), (450, 40), (450, 350), (100, 350)):
        c.append((JX + sg * rel * tx + side * lat * lx, JZ + sg * rel * tz + side * lat * lz))
    c.append(c[0]); cc = np.array(c); ok = q['wetShare'] == 0 and q['maxFill'] <= 7 and q['maxCut'] <= 12
    ax.plot(cc[:, 0], cc[:, 1], 'g-' if ok else 'r--', lw=1.2)
    m = cc[:4].mean(0); ax.text(m[0], m[1], q['name'], fontsize=8, ha='center', color='g' if ok else 'r', weight='bold')
ax.plot([JX], [JZ], 'k*', ms=16); ax.set_title('Ring S node (HK-0): natural ground (contour 5 m), ring, arm, island link, rail, boxes (green = passes, red = a FAIL); x east, z south (down)')
ax.set_aspect('equal'); ax.legend(loc='upper left'); plt.colorbar(im, ax=ax, shrink=.6, label='natural ground (m)')
plt.savefig(f'{d}/hk_site.png', dpi=110, bbox_inches='tight')

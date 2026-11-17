# STEP 17.1a picture: ground of the island link corridor + the 5 candidate lines. Run after scripts/island-link-ground-check.ts docs
import json, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap, BoundaryNorm
d = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'docs/island_link_ground.json'))
g = d['grid']; h = np.array(g['h']).reshape(g['gz'], g['gx'])
ext = [g['x0'], g['x1'], g['z1'], g['z0']]
fig, ax = plt.subplots(figsize=(9, 11))
sea = np.ma.masked_where(h >= 0, h)
land = np.ma.masked_where(h < 0, h)
ax.imshow(sea, extent=ext, cmap='Blues_r', vmin=-60, vmax=0, aspect='equal')
im = ax.imshow(land, extent=ext, cmap='terrain', vmin=0, vmax=45, aspect='equal')
ax.contour(np.linspace(g['x0'], g['x1'], g['gx']), np.linspace(g['z0'], g['z1'], g['gz']), h, levels=[0], colors='k', linewidths=0.8)
ax.contour(np.linspace(g['x0'], g['x1'], g['gx']), np.linspace(g['z0'], g['z1'], g['gz']), h, levels=list(range(5, 50, 5)), colors='k', linewidths=0.25, alpha=0.5)
cols = ['#888', '#888', '#888', '#e00', '#888']
for c in d['cands']:
    r = np.array(c['rows'])
    best = c['dx'] == d['best']
    ax.plot(r[:, 1], r[:, 2], color='#e00' if best else '#555', lw=2.2 if best else 1.1, label=f"DX {c['dx']}: {c['length']:.0f} m, bend {c['bend']:.1f} deg, wet {c['wetLen']:.0f} m" + ('  <- recommended' if best else ''))
ax.plot([d['A']['x']], [d['A']['z']], 'ys', mec='k', ms=9, label='ring S node (end of J1-S arm)')
ax.plot([d['island']['x']], [d['island']['z']], 'w*', mec='k', ms=14, label='island centre (Config)')
ax.set_xlim(g['x0'], g['x1']); ax.set_ylim(g['z1'], g['z0'])
ax.set_xlabel('x east (m)'); ax.set_ylabel('z south (m)')
ax.set_title('Step 17.1a: island link corridor (M6 ROW +-%.1f m), natural ground' % d['rowHalf'])
plt.colorbar(im, ax=ax, shrink=0.5, label='land height (m)')
ax.legend(loc='lower left', fontsize=7)
plt.tight_layout(); plt.savefig('docs/island_link_corridor.png', dpi=110)
print('wrote docs/island_link_corridor.png')

# STEP 17.1c picture: island link centreline on the ground map, ROW edges, curve points, zoom on the curve. Run after scripts/island-link-align.ts docs
import json, math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
a = json.load(open('docs/island_link_align.json')); g = json.load(open('docs/island_link_ground.json'))['grid']
h = np.array(g['h']).reshape(g['gz'], g['gx'])
smp = np.array(a['samples']); s, x, z, hd = smp[:, 0], smp[:, 1], smp[:, 2], np.radians(smp[:, 3])
row = a['rowHalf']
lx, lz = x - np.sin(hd) * row, z + np.cos(hd) * row
rx, rz = x + np.sin(hd) * row, z - np.cos(hd) * row
r0 = a['rows'][0]
def at(st):
    i = int(np.argmin(abs(s - st))); return x[i], z[i]
fig, axs = plt.subplots(1, 2, figsize=(13, 9), gridspec_kw={'width_ratios': [1, 1.15]})
for ax, (x0, x1, z0, z1) in zip(axs, [(-2000, -700, 2100, 4400), (-1450, -950, 3250, 4150)]):
    ext = [g['x0'], g['x1'], g['z1'], g['z0']]
    ax.imshow(np.ma.masked_where(h >= 0, h), extent=ext, cmap='Blues_r', vmin=-60, vmax=0, aspect='equal')
    im = ax.imshow(np.ma.masked_where(h < 0, h), extent=ext, cmap='terrain', vmin=0, vmax=45, aspect='equal')
    X = np.linspace(g['x0'], g['x1'], g['gx']); Z = np.linspace(g['z0'], g['z1'], g['gz'])
    ax.contour(X, Z, h, levels=[0], colors='k', linewidths=0.8)
    ax.contour(X, Z, h, levels=list(range(5, 50, 5)), colors='k', linewidths=0.25, alpha=0.5)
    ax.plot(lx, lz, 'k-', lw=0.6); ax.plot(rx, rz, 'k-', lw=0.6)
    ax.plot(x, z, color='#e00', lw=1.8)
    for nm, st, mk in [('TS', r0['ts'], 'o'), ('SC', r0['sc'], 's'), ('CS', r0['cs'], 's'), ('ST', r0['st'], 'o')]:
        px, pz = at(st); ax.plot([px], [pz], mk, color='w', mec='k', ms=6); ax.annotate(f"{nm} s {st:.0f}", (px, pz), xytext=(6, -4), textcoords='offset points', fontsize=7)
    ws = [r for r in a['wetRuns']][0]
    for nm, st in [('water starts', ws['a']), ('water ends', ws['b'])]:
        px, pz = at(st); ax.plot([px], [pz], 'v', color='c', mec='k', ms=7); ax.annotate(f"{nm} s {st:.0f}", (px, pz), xytext=(8, 0), textcoords='offset points', fontsize=7)
    pi = a['pis'][0]; ax.plot([pi['x']], [pi['z']], 'x', color='m', ms=8); ax.annotate('PI', (pi['x'], pi['z']), xytext=(6, 4), textcoords='offset points', fontsize=7, color='m')
    ax.plot([a['start']['x']], [a['start']['z']], 'ys', mec='k', ms=9); ax.plot([a['end']['x']], [a['end']['z']], 'w*', mec='k', ms=13)
    ax.set_xlim(x0, x1); ax.set_ylim(z1, z0); ax.set_xlabel('x east (m)')
axs[0].set_ylabel('z south (m)')
axs[0].set_title('Island link centreline (red), ROW +-%.2f m (black)' % row)
axs[1].set_title('zoom: island part, R %d m, Ls %d m, deflection %.1f deg' % (a['chosen']['R'], a['chosen']['Ls'], abs(math.degrees(r0['delta']))))
plt.colorbar(im, ax=axs, shrink=0.45, label='land height (m)')
plt.savefig('docs/island_link_align.png', dpi=100, bbox_inches='tight')
print('wrote docs/island_link_align.png')

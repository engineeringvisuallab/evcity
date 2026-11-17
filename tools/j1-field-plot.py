# J1 field picture: terrain, rail, zones, ring, J1 box + 4 axes, N arm c4b. Run: python3 tools/j1-field-plot.py docs
import json, sys, numpy as np, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LightSource
d = sys.argv[1] if len(sys.argv) > 1 else 'docs'
R = json.load(open(f'{d}/j1c4_raster.json')); A = json.load(open(f'{d}/j1c4b_align.json'))
c, x0, z0, nx, nz = R['cell'], R['x0'], R['z0'], R['nx'], R['nz']
H = np.array(R['h'], float).reshape(nz, nx); W = np.array(R['wet']).reshape(nz, nx)
ext = [x0, x0 + nx * c, z0 + nz * c, z0]
ls = LightSource(315, 45); sh = ls.hillshade(H, vert_exag=2, dx=c, dy=c)
ring = np.genfromtxt(f'{d}/ring_samples_5m.csv', delimiter=',', skip_header=1, usecols=(1, 2))
jx, jz, yaw = A['j1']['x'], A['j1']['z'], np.radians(A['j1']['yawDeg'])
dirs = {'N': (np.sin(yaw), -np.cos(yaw)), 'E': (np.cos(yaw), np.sin(yaw)), 'S': (-np.sin(yaw), np.cos(yaw)), 'W': (-np.cos(yaw), -np.sin(yaw))}
smp = np.array(A['samples'])
def base(ax):
    ax.imshow(H, extent=ext, cmap='terrain', alpha=.75, vmin=-80, vmax=float(np.percentile(H, 99)))
    ax.imshow(sh, extent=ext, cmap='gray', alpha=.35)
    ax.contour(np.linspace(x0 + c / 2, x0 + nx * c - c / 2, nx), np.linspace(z0 + c / 2, z0 + nz * c - c / 2, nz), H, levels=np.arange(0, 400, 20), colors='k', linewidths=.25, alpha=.5)
    ax.imshow(np.ma.masked_where(W == 0, W), extent=ext, cmap='cool', alpha=.95)
    for r in R['rects']: ax.add_patch(plt.Rectangle((r['x0'], r['z0']), r['x1'] - r['x0'], r['z1'] - r['z0'], fc='orange', ec='darkorange', alpha=.5)); ax.text(r['x0'], r['z0'], r['id'], fontsize=6)
    for e in R['rail']: ax.plot(e['xs'], e['zs'], 'm--', lw=1)
    ax.plot(ring[:, 0], ring[:, 1], 'k', lw=2, label='ring')
    for k, (dx, dz) in dirs.items(): ax.plot([jx, jx + 340 * dx], [jz, jz + 340 * dz], 'r', lw=2); ax.text(jx + 380 * dx, jz + 380 * dz, k, color='r', weight='bold', ha='center', va='center')
    ax.plot(smp[:, 1], smp[:, 2], 'r', lw=2.5); ax.plot(jx, jz, 'ws', mec='r', ms=8)
    ax.set_aspect('equal'); ax.set_xlabel('x east (m)'); ax.set_ylabel('z south (m)')
fig, (a, b) = plt.subplots(1, 2, figsize=(18, 9), gridspec_kw={'width_ratios': [1.25, 1]})
base(a); a.set_xlim(-500, 2300); a.set_ylim(300, -3400); a.set_title('J1 + N arm (c4b), terrain contours 20 m, rail magenta, zones orange, water blue')
base(b); b.set_xlim(jx - 600, jx + 600); b.set_ylim(jz + 600, jz - 600); b.set_title('J1 close-up (C10, yaw 37.5 deg), arms drawn to 340 m')
plt.tight_layout(); plt.savefig(f'{d}/j1_field.png', dpi=110); print('saved')

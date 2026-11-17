# STEP J1-c5: plot of the W arm route (docs/j1c5_hybrid.json) on the W raster. Run: python3 tools/j1-w-plot.py docs
import json, sys, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
d = sys.argv[1] if len(sys.argv) > 1 else 'docs'
R = json.load(open(f'{d}/j1c5_raster.json')); r = json.load(open(f'{d}/j1c5_hybrid.json'))
H = np.array(R['h']).reshape(R['nz'], R['nx']); c = R['cell']
ext = [R['x0'], R['x0'] + R['nx'] * c, R['z0'], R['z0'] + R['nz'] * c]
fig, ax = plt.subplots(1, 2, figsize=(15, 6.5), gridspec_kw={'width_ratios': [1.5, 1]})
a = ax[0]; im = a.imshow(H, origin='lower', extent=ext, cmap='terrain', vmin=0, vmax=200); plt.colorbar(im, ax=a, label='ground height (m)', shrink=.8)
for e in R['rail']: a.plot(e['xs'], e['zs'], color='k', lw=1, ls='--')
rs = np.genfromtxt(f'{d}/ring_samples_5m.csv', delimiter=',', skip_header=1); m = (rs[:, 1] > ext[0]) & (rs[:, 1] < ext[1]) & (rs[:, 2] > ext[2]) & (rs[:, 2] < ext[3]); a.plot(rs[m, 1], rs[m, 2], color='gray', lw=3, label='ring')
p = r['pts']; x = [q['x'] for q in p]; z = [q['z'] for q in p]; a.plot(x, z, 'r-', lw=2.5, label=f"W arm (cut {r['cutMax']:.1f} m, {r['len']:.0f} m)")
a.plot(x[:17], z[:17], color='yellow', lw=4, alpha=.8, label='tight first bend R 125 m (175 m, 80 deg)')
a.plot([-87], [-277], 'b*', ms=16, label='J1 (-87,-277)'); a.plot([-357], [-484], 'bo', label='arm start s 340')
a.set_xlim(ext[0], ext[1]); a.set_ylim(ext[2], ext[3]); a.set_aspect('equal'); a.legend(loc='lower left', fontsize=8); a.set_title('J1-c5 W arm route on the ground')
g = lambda xx, zz: H[min(R['nz']-1, int((zz - R['z0']) // c)), min(R['nx']-1, int((xx - R['x0']) // c))]
s = np.cumsum([0] + [np.hypot(x[k] - x[k-1], z[k] - z[k-1]) for k in range(1, len(p))])
b = ax[1]; b.fill_between(s, [g(a_, b_) for a_, b_ in zip(x, z)], color='#c8b08a', label='ground'); b.plot(s, [q['y'] for q in p], 'r-', lw=2, label='road level')
b.set_xlabel('distance from s 340 (m)'); b.set_ylabel('height (m)'); b.legend(); b.set_title('Vertical (grid level, not the final profile)'); b.grid(alpha=.3)
plt.tight_layout(); plt.savefig(f'{d}/j1c5_route.png', dpi=110)

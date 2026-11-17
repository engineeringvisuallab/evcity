# STEP J1-c6b: plan + vertical preview of the S arm alignment (docs/j1c6b_align.json). Run: python3 tools/j1-s-align-plot.py docs
import json, sys, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
d = sys.argv[1] if len(sys.argv) > 1 else 'docs'
R = json.load(open(f'{d}/j1c6_raster.json')); A = json.load(open(f'{d}/j1c6b_align.json'))
H = np.array(R['h']).reshape(R['nz'], R['nx']); c = R['cell']; ext = [R['x0'], R['x0'] + R['nx'] * c, R['z0'], R['z0'] + R['nz'] * c]
sm = np.array(A['samples']); fig, ax = plt.subplots(1, 2, figsize=(15, 6.5), gridspec_kw={'width_ratios': [1.5, 1]})
a = ax[0]; im = a.imshow(H, origin='lower', extent=ext, cmap='terrain', vmin=0, vmax=60); plt.colorbar(im, ax=a, label='ground height (m)', shrink=.8)
for e in R['rail']: a.plot(e['xs'], e['zs'], 'k--', lw=1)
rs = np.genfromtxt(f'{d}/ring_samples_5m.csv', delimiter=',', skip_header=1); m = (rs[:, 1] > ext[0]) & (rs[:, 1] < ext[1]) & (rs[:, 2] > ext[2]) & (rs[:, 2] < ext[3]); a.plot(rs[m, 1], rs[m, 2], color='gray', lw=3, label='ring')
a.plot(sm[:, 1], sm[:, 2], 'r-', lw=2.5, label=f"S arm alignment {A['length']:.0f} m")
for i, p in enumerate(A['pis']): a.plot(p['x'], p['z'], 'wo', mec='k'); a.annotate(f"PI {i}\nR {p['R']:.0f}", (p['x'], p['z']), fontsize=8, xytext=(6, 6), textcoords='offset points')
for k, sx in enumerate(A['railCrossS']):
    j = int(np.argmin(abs(sm[:, 0] - sx))); a.plot(sm[j, 1], sm[j, 2], 'ms', ms=9, label='rail crossing' if k == 0 else None)
a.plot([-87], [-277], 'b*', ms=16, label='J1'); a.plot([A['start']['x']], [A['start']['z']], 'bo', label='S (s 0 = end of lane zone)')
a.set_xlim(ext[0], ext[1]); a.set_ylim(ext[2], ext[3]); a.set_aspect('equal'); a.legend(loc='lower left', fontsize=8); a.set_title('J1-c5b S arm alignment (straight - spiral - arc - spiral - straight)')
s = np.arange(len(A['level'])) * A['levelDs']; b = ax[1]
b.fill_between(s, A['ground'], color='#c8b08a', label='ground'); b.plot(s, A['level'], 'r-', lw=2, label='road level (preview, grade <= 3 %)')
b.set_xlabel('station from S (m)'); b.set_ylabel('height (m)'); b.legend(); b.grid(alpha=.3); b.set_title(f"cut {A['cutMax']:.1f} m / fill {A['fillMax']:.1f} m (centre)")
plt.tight_layout(); plt.savefig(f'{d}/j1c6b_align.png', dpi=110)

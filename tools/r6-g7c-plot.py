# STEP G7c picture: J1-N between the rail bridge N3 and the river bridge N4, the G7b stem and the two SE slip ramps (V50) at the G7b tap.
# Run from the project root: python3 tools/r6-g7c-plot.py   (reads docs/r6_g7c.json, writes docs/r6_g7c.png)
import json, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
d = json.load(open('docs/r6_g7c.json'))
fig, ax = plt.subplots(1, 2, figsize=(15, 7), gridspec_kw={'width_ratios': [1.25, 1]})
a = ax[0]
arm = d['arm']; a.plot([p[0] for p in arm], [p[1] for p in arm], color='#444', lw=5, alpha=.35, label='J1-N arm (8 lane)')
rail = d['rail']; a.plot([p[0] for p in rail], [p[1] for p in rail], color='#a33', lw=1.5, ls='--', label='rail north-1')
st = d['stem']; a.plot([p[0] for p in st], [p[1] for p in st], color='#1a6', lw=2, label='R6-6B stem (G7b)')
t = d['taps'][0]
for k, c, l in (('es', '#06c', 'm1 exit slip (arm SW-bound -> stem)'), ('en', '#c60', 'm2 entry slip (stem -> arm SW-bound)')):
    p = t[k]['pts']; a.plot([q[0] for q in p], [q[1] for q in p], color=c, lw=2.2, label=l)
a.set_aspect('equal'); a.invert_yaxis(); a.set_title('JX-3 tap s %.0f: SE slips with real geometry (x east, z south)' % t['tapS']); a.legend(loc='lower left', fontsize=8)
a.set_xlim(t['es']['pts'][0][0] - 450, t['es']['pts'][0][0] + 450)
a.set_ylim(t['es']['pts'][0][1] + 450, t['es']['pts'][0][1] - 450)
b = ax[1]
b.barh(0, d['hi'] - d['lo'], left=d['lo'], height=.5, color='#9c9', label='free arm length %d .. %d' % (d['lo'], d['hi']))
b.barh(0, 1619 - 1527, left=1527, height=.5, color='#999', label='N3 rail bridge (1527-1619)')
b.barh(0, 2492 - 2355, left=2355, height=.5, color='#69c', label='N4 river bridge (2355-2492)')
for i, tp in enumerate(d['taps']):
    z = tp['zone']; b.barh(1 + i, z[1] - z[0], left=z[0], height=.5, color='#f90', alpha=.8)
    b.text(z[0], 1 + i + .35, 'tap %.0f: zones %.0f .. %.0f' % (tp['tapS'], z[0], z[1]), fontsize=8)
b.set_yticks([]); b.set_xlim(1450, 2550); b.set_xlabel('arm station s (m from J1)'); b.set_title('lane zones of the two slips (V50, taper 1:50) against the free length'); b.legend(loc='upper right', fontsize=8)
plt.tight_layout(); plt.savefig('docs/r6_g7c.png', dpi=110); print('docs/r6_g7c.png')

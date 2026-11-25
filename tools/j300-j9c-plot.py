# J9-c picture: (left) rail piers beside the R6 corridor, world plan, switch OFF (grey / red) and ON (green); (right) ring street lamps in the 300 ft reach, local frame (u along the ring, v left).
# Run: python3 tools/j300-j9c-plot.py   reads docs/J300_J9C.json (scripts/j300-j9c-check.ts) and src/roads/junction/J300StructB.ts. Writes docs/j300_j9c.png
import json, math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Rectangle

D = json.load(open('docs/J300_J9C.json'))
sb = open('src/roads/junction/J300StructB.ts').read()
B = json.loads(sb[sb.index('= ') + 2: sb.rindex(' as const')])
arm = [(p[0], p[1]) for p in B['armPoly']]
fig, (a, b) = plt.subplots(1, 2, figsize=(17, 7.5), gridspec_kw={'width_ratios': [1, 1.25]})

def rect(cx, cz, dx, dz, hl, ha):
    nx, nz = -dz, dx
    return [(cx + sa * hl * dx + sb_ * ha * nx, cz + sa * hl * dz + sb_ * ha * nz) for sa, sb_ in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
ax_, az_ = zip(*arm)
a.plot(ax_, az_, color='#444', lw=1, ls='--', label='R6 arm centre line')
L, R = [], []
for i in range(len(arm) - 1):
    dx, dz = arm[i + 1][0] - arm[i][0], arm[i + 1][1] - arm[i][1]; l = math.hypot(dx, dz); nx, nz = -dz / l, dx / l
    L.append((arm[i][0] + nx * D['need']['col'], arm[i][1] + nz * D['need']['col'])); R.append((arm[i][0] - nx * D['need']['col'], arm[i][1] - nz * D['need']['col']))
a.add_patch(Polygon(L + R[::-1], closed=True, fc='#ffd9a0', ec='#d08000', alpha=0.55, label='R6 corridor: pier column face must stay %.2f m away' % D['need']['col']))
xs = [p['x'] for p in D['pierOff']]; zs = [p['z'] for p in D['pierOff']]
a.plot(xs, zs, color='#888', lw=3, alpha=0.5, label='rail ring-north viaduct (through the piers)')
for p in D['pierOff']:
    bad = abs(p['s'] - 60) < .01 or abs(p['s'] - 90) < .01
    a.add_patch(Polygon(rect(p['x'], p['z'], p['dx'], p['dz'], 1.3, 2.2), closed=True, fc='#d33' if bad else '#999', ec='k', lw=.5, alpha=.9))
    if bad: a.annotate('OFF s %g' % p['s'], (p['x'], p['z']), textcoords='offset points', xytext=(-5, 9), fontsize=8, color='#a00')
on_new = [p for p in D['pierOn'] if not any(abs(p['s'] - q['s']) < .011 for q in D['pierOff'])]
for p in on_new:
    a.add_patch(Polygon(rect(p['x'], p['z'], p['dx'], p['dz'], 1.3, 2.2), closed=True, fc='#1a8f3a', ec='k', lw=.5))
    if p['s'] < 100: a.annotate('ON s %g' % p['s'], (p['x'], p['z']), textcoords='offset points', xytext=(-5, -14), fontsize=8, color='#0a6')
a.set_xlim(-1900, -1700); a.set_ylim(-2800, -2660); a.set_aspect('equal')
a.set_title('Rail piers beside the R6 corridor (world plan, m)\nred = old piers inside the corridor, green = piers moved to the J7-B table', fontsize=10)
a.legend(loc='lower left', fontsize=7); a.grid(alpha=.3)

b.add_patch(Rectangle((-700, -22.1), 1500, 44.2, fc='#cfcfcf', ec='none', label='ring 8 lanes'))
b.add_patch(Rectangle((-67, -23.7), 134, 47.4, fc='#7f9fbf', ec='k', alpha=.8, label='underpass box (u -67..67)'))
b.add_patch(Rectangle((-435, 22.1), 435 + 447, 6, fc='#f4c2c2', ec='none', alpha=.7))
b.add_patch(Rectangle((-435, -28.1), 435 + 645, 6, fc='#f4c2c2', ec='none', alpha=.7, label='ramp / aux lane / taper side'))
off = D['lampsOff']; on = D['lampsOn']
onset = {(round(p[0], 1), round(p[1], 1)) for p in on}
gone = [p for p in off if (round(p[0], 1), round(p[1], 1)) not in onset]
kept = [p for p in off if (round(p[0], 1), round(p[1], 1)) in onset]
b.scatter([p[0] for p in kept], [p[1] for p in kept], s=26, c='#555', label='ring lamps kept (%d)' % len(kept))
b.scatter([p[0] for p in gone], [p[1] for p in gone], s=40, c='#d33', marker='x', label='ring lamps not in the ON plan (%d); in the reach J300 has its own poles' % len(gone))
b.set_xlim(-650, 750); b.set_ylim(-60, 60); b.set_aspect('equal'); b.grid(alpha=.3)
b.set_xlabel('u along the ring (m), origin = roundabout centre'); b.set_ylabel('v left (m)')
b.set_title('Ring street lamps in the 300 ft reach (local frame)\nlamps that would stand on a ramp / wall / aux lane are not built', fontsize=10)
b.legend(loc='upper right', fontsize=7)
fig.suptitle('J9-c: rail piers + ring furniture (headless data, %d FAIL)' % D['fails'], fontsize=12)
fig.tight_layout(); fig.savefig('docs/j300_j9c.png', dpi=110)
print('docs/j300_j9c.png')

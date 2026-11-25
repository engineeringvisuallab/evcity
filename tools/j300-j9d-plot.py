# J9-d picture: world plan of the 300 ft junction as the minimap draws it (roundabout, 2 arms, 4 ramps) with the three old pieces that are hidden with the switch ON (cp-37, cp-38, sign-17).
# Run: python3 tools/j300-j9d-plot.py   reads docs/J300_J9D.json (scripts/j300-j9d-check.ts), src/parking/RoadStationSites.ts, src/signs/RoadSignData.ts. Writes docs/j300_j9d.png
import json, re, math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

D = json.load(open('docs/J300_J9D.json'))
sh = D['shapes']
fig, a = plt.subplots(figsize=(9, 11))
for ln in sh['lines']:
    xs = [p[0] for p in ln['pts']]; zs = [p[1] for p in ln['pts']]
    a.plot(xs, zs, color='#ffb347', lw=max(1.5, 2 * ln['half'] / 8), solid_capstyle='butt', zorder=2)
c = sh['circle']; a.add_patch(Circle((c['x'], c['z']), c['r'], fc='#ffb347', ec='#2d2016', lw=1, zorder=3))
st = open('src/parking/RoadStationSites.ts', encoding='utf8').read()
for i in ('cp-37', 'cp-38'):
    m = re.search(r"id: '%s'.*?x: (-?[\d.]+), z: (-?[\d.]+)" % i, st)
    x, z = float(m.group(1)), float(m.group(2)); a.plot([x], [z], 'rx', ms=10, mew=2, zorder=4); a.annotate(i + ' (hidden)', (x, z), textcoords='offset points', xytext=(6, 6), color='#a00', fontsize=9)
sg = open('src/signs/RoadSignData.ts', encoding='utf8').read()
m = re.search(r"id:'sign-17'.*?x:(-?[\d.]+),y:[\d.]+,z:(-?[\d.]+)", sg)
x, z = float(m.group(1)), float(m.group(2)); a.plot([x], [z], 'r^', ms=10, zorder=4); a.annotate('sign-17 (hidden)', (x, z), textcoords='offset points', xytext=(6, 6), color='#a00', fontsize=9)
a.plot([], [], color='#ffb347', lw=4, label='J300 as drawn on the minimap (switch ON)'); a.plot([], [], 'rx', label='charge point not built (switch ON)'); a.plot([], [], 'r^', label='sign gantry not built (switch ON)')
a.set_aspect('equal'); a.grid(alpha=.3); a.legend(loc='lower right', fontsize=8)
a.set_title('J9-d: 300 ft junction on the minimap + old R6-9 furniture hidden (%d FAIL)\nworld plan, x east, z south (m)' % D['fails'], fontsize=10)
a.invert_yaxis()
fig.tight_layout(); fig.savefig('docs/j300_j9d.png', dpi=100); print('docs/j300_j9d.png')

# STEP A1 picture: python3 tools/a1-buildability-plot.py   (reads docs/a1_buildability.json, writes docs/a1_buildability.png)
import json, re, csv
import numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from matplotlib.patches import Circle, Patch
d = json.load(open('docs/a1_buildability.json')); H = d['half']
order = ['~', 'R', 'X', 'F', 'A', 'B', 'C', 'D', 'E']
colr = ['#8fd0f0', '#444444', '#c62828', '#b39ddb', '#2e7d32', '#9ccc65', '#ffe082', '#ff9800', '#8d6e63']
a = np.array([[order.index(c) for c in r] for r in d['rows']])
fig, ax = plt.subplots(figsize=(13, 13), dpi=100)
ax.imshow(a, cmap=ListedColormap(colr), extent=[-H, H, H, -H], vmin=-.5, vmax=8.5, interpolation='nearest')
src = open('src/city/WorldZones.ts').read()
Z = {m[0]: (int(m[1]), int(m[2]), int(m[3])) for m in re.findall(r"Z\('([\w-]+)',\s*'[\w-]+',\s*(-?\d+),\s*(-?\d+),\s*(\d+)\)", src)}
for k, v in d['housing'].items():
    x, z, r = Z[k]; v_ = k.startswith('village')
    ax.add_patch(Circle((x, z), r, fill=False, ec='k', lw=1.6, ls='--' if v_ else '-'))
    ax.text(x, z, v['role'].split()[0] + '\n' + k, fontsize=7, ha='center', va='center', weight='bold', bbox=dict(fc='w', alpha=.65, lw=0, pad=1))
ax.set_title('A1 buildability map (50 m cells). Circles = proposed housing areas (solid: city / suburb, dashed: village)')
ax.legend(handles=[Patch(color=c, label=d['legend'][k]) for k, c in zip(order, colr)], loc='lower left', fontsize=8)
ax.set_xlim(-H, H); ax.set_ylim(H, -H); ax.grid(alpha=.2)
plt.savefig('docs/a1_buildability.png', bbox_inches='tight')

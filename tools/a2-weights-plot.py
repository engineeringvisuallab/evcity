# STEP A2 picture: python3 tools/a2-weights-plot.py  (reads docs/a2_zone_weights.json + docs/a1_buildability.json, writes docs/a2_zone_weights.png)
import json, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
d = json.load(open('docs/a2_zone_weights.json')); a1 = json.load(open('docs/a1_buildability.json')); H = a1['half']
order = ['~', 'R', 'X', 'F', 'A', 'B', 'C', 'D', 'E']
g = np.array([[0 if c == '~' else 1 for c in r] for r in a1['rows']])
fig, (ax, bx) = plt.subplots(1, 2, figsize=(18, 9), dpi=100, gridspec_kw={'width_ratios': [1.15, 1]})
ax.imshow(g, cmap=ListedColormap(['#bfe3f5', '#f1eee6']), extent=[-H, H, H, -H], vmin=0, vmax=1)
for z in d['zones']:
    x, y = z['cx'], z['cz']
    if z['pop'] > 0: ax.scatter(x, y, s=z['pop'] / 25, c='#f9a825', alpha=.65, ec='k', lw=.4)
    if z['jobs'] > 0: ax.scatter(x, y, s=z['jobs'] / 25, c='#5e35b1', alpha=.35, ec='none')
    if z['pop'] > 4000 or z['jobs'] > 4000: ax.text(x, y + 160, z['id'], fontsize=7, ha='center')
ax.set_xlim(-H, H); ax.set_ylim(H, -H); ax.set_aspect('equal'); ax.grid(alpha=.2)
ax.set_title('A2 zone weights: yellow = residents, purple = jobs (area ~ number)')
top = sorted(d['zones'], key=lambda z: -(z['pop'] + z['jobs']))[:18][::-1]
y = np.arange(len(top)); bx.barh(y - .2, [z['pop'] for z in top], .4, color='#f9a825', label='persons'); bx.barh(y + .2, [z['jobs'] for z in top], .4, color='#5e35b1', label='jobs')
bx.set_yticks(y); bx.set_yticklabels([z['id'] for z in top], fontsize=8); bx.legend(); bx.set_title('top 18 zones')
t = d['totals']; fig.suptitle(f"persons {t['pop']:,.0f}   jobs {t['jobs']:,.0f}   person trips/day: productions {t['prod']:,.0f}, attractions {t['attr']:,.0f}   trucks/day {t['trucks']:,.0f}")
plt.savefig('docs/a2_zone_weights.png', bbox_inches='tight')

# J1-g4 picture: reads docs/j1g4.json (written by scripts/j1-g4-check.ts), writes docs/j1g4_star.png (the open star, close) and docs/j1g4_layout.png (all four lane zones).
# Dark grey = asphalt, light grey = islands (median + corner), white = marking. Local frame x = e, y = n.
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
d = json.load(open('docs/j1g4.json'))
def draw(ax, lim, title):
    ax.set_facecolor('#b8c4a8')
    for s in d['surface']: ax.add_patch(Polygon(s, closed=True, fc='#3a3a3d', ec='none'))
    for i in d['islands']: ax.add_patch(Polygon(i['ring'], closed=True, fc='#b9b9b2', ec='#e8e8e0', lw=0.6))
    for m in d['marks']: ax.add_patch(Polygon(m['p'], closed=True, fc='#f2f2ee', ec='none'))
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_aspect('equal'); ax.set_title(title, fontsize=10)
    for t, (x, y) in {'N': (0, lim * 0.95), 'S': (0, -lim * 0.98), 'E': (lim * 0.95, 0), 'W': (-lim * 0.98, 0)}.items(): ax.text(x, y, t, ha='center', va='center', fontsize=11, weight='bold', color='#222')
fig, ax = plt.subplots(figsize=(10, 10)); draw(ax, 105, 'J1-g4 open star, centre (m): asphalt, kerbed islands, lane lines, stop lines, zebra, arrows, guide lines'); fig.savefig('docs/j1g4_star.png', dpi=130, bbox_inches='tight')
fig, ax = plt.subplots(figsize=(10, 10)); draw(ax, 325, 'J1-g4 open star, all four lane zones to S_END = 315 m'); fig.savefig('docs/j1g4_layout.png', dpi=110, bbox_inches='tight')
print('ok')

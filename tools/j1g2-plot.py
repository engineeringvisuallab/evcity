# J1-g2 picture: reads docs/j1g2.json (written by scripts/j1-g2-check.ts), writes docs/j1g2_layout.png (whole lane zones) and docs/j1g2_star.png (the open star). Local frame x = e, y = n.
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
d = json.load(open('docs/j1g2.json'))
col = {'left': '#d6336c', 'through': '#1c7ed6', 'right': '#2f9e44', 'uturn': '#f08c00'}
def draw(ax, lim, title, thin=False):
    ax.add_patch(Polygon(d['paved'], closed=True, fc='#dee2e6', ec='#495057', lw=0.8))
    for m in d['movements']:
        xs = [p[0] for p in m['pts']]; ys = [p[1] for p in m['pts']]
        ax.plot(xs, ys, color=col[m['kind']], lw=0.7 if m['kind'] == 'through' else 1.3, alpha=0.9)
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_aspect('equal'); ax.grid(alpha=0.25); ax.set_title(title, fontsize=10)
    for t, (x, y) in {'N': (0, lim * 0.93), 'S': (0, -lim * 0.97), 'E': (lim * 0.93, 0), 'W': (-lim * 0.97, 0)}.items(): ax.text(x, y, t, ha='center', va='center', fontsize=11, weight='bold')
fig, ax = plt.subplots(figsize=(9, 9)); draw(ax, 340, 'J1-g2 open star: whole lane zones (grey = paved, pink = left slip, blue = through, green = right, orange = U-turn)'); fig.savefig('docs/j1g2_layout.png', dpi=110, bbox_inches='tight')
fig, ax = plt.subplots(figsize=(9, 9)); draw(ax, 110, 'J1-g2 open star, centre (m)'); fig.savefig('docs/j1g2_star.png', dpi=110, bbox_inches='tight')
print('ok')

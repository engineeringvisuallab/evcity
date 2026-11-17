# G5 picture: R6 lines (green = PASS), ring + J1 arms (black), JX placeholders (red), trimmed lines (orange). Run: python3 tools/r6-g5-plot.py   (from the project root)
import json, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
g5 = json.load(open('docs/r6_g5_lines.json'))
ref = json.load(open('tools/ref-ring-game.json')) if False else None
fig, ax = plt.subplots(figsize=(11, 11))
for l in g5['lines']:
    xs = [p[0] for p in l['pts']]; zs = [p[1] for p in l['pts']]
    trimmed = 'trimmed' in l['origin']
    ax.plot(xs, zs, color='darkorange' if trimmed else 'seagreen', lw=2.2)
    ax.annotate('L%d' % l['src_id'], (xs[len(xs)//2], zs[len(zs)//2]), fontsize=7)
for q in g5['jx']:
    ax.plot(q['x'], q['z'], 'o', color='red', ms=8)
    ax.annotate('JX-%d' % q['n'], (q['x'], q['z']), fontsize=8, color='red', xytext=(5, 5), textcoords='offset points')
ax.set_aspect('equal'); ax.invert_yaxis(); ax.grid(alpha=.3)
ax.set_title('R6 G5: green = lines, orange = trimmed (free end), red = JX interchange placeholders on the 8-lane roads')
fig.savefig('docs/r6_g5.png', dpi=110, bbox_inches='tight')

# G7b picture: tap + stem. Run from the project root: python3 tools/r6-g7b-plot.py
import json, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
d = json.load(open('docs/r6_g7b.json'))
fig, ax = plt.subplots(figsize=(9, 8))
xs = lambda L: [p[0] for p in L]; zs = lambda L: [-p[1] for p in L]
ax.plot(xs(d['arm']), zs(d['arm']), color='#1f3a93', lw=6, alpha=.55, label='J1-N arm (8 lane)')
ax.plot(xs(d['rail']), zs(d['rail']), color='#444', lw=2, ls='--', label='rail north-1')
ax.plot(xs(d['B']), zs(d['B']), color='#2e8b57', lw=3, alpha=.4, label='R6-6B (G6d)')
ax.plot(xs(d['stem']), zs(d['stem']), color='#d62728', lw=3, label='NEW stem (replaces the first %d m of R6-6B)' % (d['k'] * 8))
ax.plot([544.2], [1776.5], 'ko'); ax.annotate('JX-3 (old)', (544.2, 1776.5), textcoords='offset points', xytext=(8, -12))
arm = d['arm']; tap = min(arm, key=lambda p: abs(((p[0]-d['stem'][0][0])**2 + (p[1]-d['stem'][0][1])**2) ** .5 - d['stem0']))
ax.plot([d['stem'][0][0]], [-d['stem'][0][1]], 'rs'); ax.annotate('stem start / tap s %.0f' % d['tapS'], (d['stem'][0][0], -d['stem'][0][1]), textcoords='offset points', xytext=(8, 6))
ax.set_aspect('equal'); ax.set_xlabel('x east (m)'); ax.set_ylabel('north (m)'); ax.grid(alpha=.3); ax.legend(loc='lower right', fontsize=8)
ax.set_title('G7b: trumpet tap on J1-N + stem of R6-6B (plan, numbers in STEP_R6_G7B_OUTPUT.txt)')
ax.set_xlim(300, 1300); ax.set_ylim(1300, 2200)
plt.tight_layout(); plt.savefig('docs/r6_g7b.png', dpi=110)

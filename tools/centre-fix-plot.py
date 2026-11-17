# STEP 21.3 picture: python3 tools/centre-fix-plot.py [dir]  (reads dir/centre_fixed.json, writes dir/centre_fixed.png, centre_fixed_zoom.png)
import json, sys, math
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
D = sys.argv[1] if len(sys.argv) > 1 else 'docs'
J = json.load(open(f'{D}/centre_fixed.json'))
COL = {'8': '#111111', '6': '#2a6bff', '4': '#ff2a3c', '2': '#12c24a', 'C': '#00a8c0', 'L': '#c8a000'}
LW = {'8': 2.4, '6': 1.6, '4': 1.3, '2': 0.9, 'C': 0.7, 'L': 0.6}
def draw(ax, xl=None, zl=None, lab=False):
    for l in J['lines']:
        if l['built']:
            ax.plot([p[0] for p in l['pts']], [p[1] for p in l['pts']], color=COL.get(l['cls'], '#555'), lw=LW.get(l['cls'], 1) * 1.2, alpha=.55, zorder=1)
            continue
        o = l['orig']
        ax.plot([p[0] for p in o], [p[1] for p in o], color='#aaaaaa', lw=LW[l['cls']] + 1.2, alpha=.8, zorder=2)
        ax.plot([p[0] for p in l['pts']], [p[1] for p in l['pts']], color=COL[l['cls']], lw=LW[l['cls']], zorder=3)
        if lab and (xl is not None) and l['shift'] >= 20:
            p = l['pts'][len(l['pts']) // 2]
            if xl[0] < p[0] < xl[1] and zl[0] < p[1] < zl[1]: ax.text(p[0], p[1], l['id'], fontsize=7, color='k')
    for s in J['shifts']:
        if s['m'] >= 15: ax.plot(s['x'], s['z'], 'o', ms=4, mfc='none', mec='#d000d0', mew=1, zorder=4)
    ax.set_aspect('equal'); ax.invert_yaxis()
    if xl: ax.set_xlim(*xl); ax.set_ylim(zl[1], zl[0])
fig, ax = plt.subplots(figsize=(13, 13)); draw(ax)
ax.set_title('STEP 21.3: grey thick = the line you drew, colour = after the fix (blue R6, red R4, green R2, cyan C, gold L, black 8-lane / built), magenta circle = shift of 15 m or more', fontsize=9)
fig.savefig(f'{D}/centre_fixed.png', dpi=110, bbox_inches='tight'); plt.close(fig)
big = sorted([l for l in J['lines'] if not l['built']], key=lambda l: -l['shift'])[:4]
fig, axs = plt.subplots(2, 2, figsize=(14, 14))
for ax, l in zip(axs.flat, big):
    xs = [p[0] for p in l['pts']] + [p[0] for p in l['orig']]; zs = [p[1] for p in l['pts']] + [p[1] for p in l['orig']]
    cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2; r = max(max(xs) - min(xs), max(zs) - min(zs)) / 2 + 150
    draw(ax, (cx - r, cx + r), (cz - r, cz + r), True); ax.set_title(f"{l['id']} max shift {l['shift']:.0f} m", fontsize=10)
fig.savefig(f'{D}/centre_fixed_zoom.png', dpi=100, bbox_inches='tight')
print('ok')

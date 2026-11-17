# STEP 17.1d picture: vertical profile of the island link for the reference + 3 deck options, ground band, sea, structures, grade diagram.
# Run after scripts/island-link-profile.ts docs   ->  docs/island_link_profile.png
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
d = json.load(open('docs/island_link_profile.json'))
st = np.array(d['stations']); s, hc, hmin, hmax, cross, wet = st[:, 0], st[:, 1], st[:, 2], st[:, 3], st[:, 4], st[:, 5]
col = {'R': '#777777', 'A': '#1a9850', 'B': '#f08000', 'C': '#d73027'}
wa, wb, cs = d['wetA'], d['wetB'], d['curveS']
fig, axs = plt.subplots(3, 1, figsize=(13, 12.5), gridspec_kw={'height_ratios': [1.0, 1.25, 0.6]})
def base(ax, x0, x1, y0, y1):
    ax.fill_between(s, hmin, hmax, color='#c9b48a', alpha=0.9, lw=0, label='ground at the pavement edges (min - max)')
    ax.plot(s, hc, color='#4a3b20', lw=1.0, label='ground on the centreline')
    ax.axhspan(-12, 0, color='#9ecae1', alpha=0.45, lw=0)
    ax.axhline(0, color='#2171b5', lw=0.8); ax.axhline(d['dhwl'], color='#2171b5', lw=0.8, ls='--')
    ax.axvspan(wa, wb, color='#6baed6', alpha=0.25, lw=0)
    ax.axvline(cs, color='m', lw=1.0, ls=':'); ax.text(cs + 4, y0 + 0.6, 'horizontal curve starts s %.0f' % cs, color='m', fontsize=8)
    ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); ax.grid(alpha=0.25)
for ax, (x0, x1, y0, y1) in zip(axs[:2], [(0, d['length'], -10, 36), (380, 1260, -9, 26)]):
    base(ax, x0, x1, y0, y1)
    for o in d['options']:
        y = np.array(o['y']); c = col[o['id']]
        ax.plot(s, y, color=c, lw=1.1 if o['ref'] else 1.6, ls='--' if o['ref'] else '-', label=o['name'])
        for r in o['structRuns']:
            m = (s >= r['a']) & (s <= r['b']); ax.plot(s[m], y[m], color=c, lw=5.0, alpha=0.55, solid_capstyle='butt')
        for v in o['pvi']:
            if v['Lc'] > 0 and x0 <= v['s'] <= x1: ax.plot([v['s']], [v['y']], 'o', ms=2.5, color=c)
    ax.set_ylabel('level (m)')
axs[0].set_title('Island link M6-1 vertical profile (s from the S node). Thick = structure (viaduct + strait bridge). Dots = PVIs.  Sea 0 m (solid), design high water %.1f m (dashed)' % d['dhwl'], fontsize=10)
axs[0].legend(loc='upper right', fontsize=7.5, ncol=2)
axs[1].set_title('zoom: the strait and both approaches', fontsize=10)
# labels for the island / mainland viaduct lengths
for o in d['options']:
    if o['ref']: continue
    r = o['structRuns'][0]; y = np.array(o['y']); yy = y[int(np.argmin(abs(s - r['b'])))]
    axs[1].annotate('%s: viaduct %d m | %d m' % (o['id'], round(o['viaW']), round(o['viaE'])), (r['b'], yy), xytext=(8, 6), textcoords='offset points', fontsize=7.5, color=col[o['id']])
def grade_at(pvi, q):
    for v in pvi:
        if v['Lc'] > 0 and abs(q - v['s']) <= v['Lc'] / 2:
            return v['g1'] + (v['g2'] - v['g1']) / v['Lc'] * (q - (v['s'] - v['Lc'] / 2))
    k = 0
    while k + 1 < len(pvi) and q > pvi[k + 1]['s'] - pvi[k + 1]['Lc'] / 2: k += 1
    return pvi[k]['g2'] if q >= pvi[k]['s'] else pvi[k]['g1']
ax = axs[2]
for o in d['options']:
    g = np.array([grade_at(o['pvi'], q) for q in s]) * 100
    ax.plot(s, g, color=col[o['id']], lw=1.3, ls='--' if o['ref'] else '-', label=o['id'])
for v in (4, -4): ax.axhline(v, color='k', lw=0.9)
for v in (3, -3): ax.axhline(v, color='k', lw=0.6, ls=':')
ax.axvspan(wa, wb, color='#6baed6', alpha=0.25, lw=0); ax.axvline(cs, color='m', lw=1.0, ls=':')
ax.set_xlim(0, d['length']); ax.set_ylim(-5, 5); ax.set_ylabel('grade (%)'); ax.set_xlabel('s from the S node (m)'); ax.grid(alpha=0.25)
ax.set_title('grade (limit 4 % solid, 3 % desirable dotted)', fontsize=10)
plt.tight_layout()
plt.savefig('docs/island_link_profile.png', dpi=100)
print('wrote docs/island_link_profile.png')

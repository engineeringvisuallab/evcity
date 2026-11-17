# W arm vertical profile (c5c: real PVIs and parabolic curves; falls back to c4b DP level). Run: python3 tools/j1-w-profile-plot.py docs
import json, os, sys, numpy as np, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
d = sys.argv[1] if len(sys.argv) > 1 else 'docs'
C = json.load(open(f'{d}/j1c5c_profile.json'))
rows = np.array(C['rows']); s, g, y = rows[:, 0], rows[:, 1], rows[:, 2]
fig, ax = plt.subplots(2, 1, figsize=(16, 8.5), sharex=True, gridspec_kw={'height_ratios': [3, 1]})
a = ax[0]
a.fill_between(s, g, y, where=g > y, color='tab:red', alpha=.45, label='cut (centre)')
a.fill_between(s, g, y, where=g < y, color='tab:blue', alpha=.45, label='fill (centre)')
a.plot(s, g, 'k', lw=1.5, label='ground'); a.plot(s, y, 'r', lw=2, label='road level with vertical curves')
for p in C['pvi']:
    a.plot(p['s'], p['y'], 'o', color='darkred', ms=5)
    if p['Lc'] > 0: a.axvspan(p['s'] - p['Lc'] / 2, p['s'] + p['Lc'] / 2, color='gold', alpha=.25, lw=0)
a.plot([], [], 'o', color='darkred', label='PVI'); a.axvspan(0, 0, color='gold', alpha=.4, label='vertical curve')
for c in C['crossings']:
    a.plot([c['s'], c['s']], [c['rail'], c['road']], 'm-', lw=3); a.annotate(f"rail {c['rail']:.1f} m, gap {c['gap']:.1f} m", (c['s'], c['road']), textcoords='offset points', xytext=(8, 10), color='m')
a.set_ylabel('level (m)'); a.legend(loc='upper right', ncol=3); a.grid(alpha=.3)
a.set_title(f"W arm c5c profile (V{C['V']}): {sum(1 for p in C['pvi'] if p['Lc']>0)} vertical curves, max cut {C['cutMax']:.1f} m, max fill {C['fillMax']:.1f} m; viaduct {'; '.join(C['viaduct']) or '-'}", fontsize=9)
cf = g - y; b = ax[1]
b.fill_between(s, cf, 0, where=cf > 0, color='tab:red', alpha=.6); b.fill_between(s, cf, 0, where=cf < 0, color='tab:blue', alpha=.6)
b.axhline(12, color='r', ls=':'); b.text(s[0], 12.3, 'cut limit 12 m', color='r'); b.axhline(-7, color='b', ls=':'); b.text(s[0], -6.7, 'viaduct above 7 m fill', color='b')
b.set_ylabel('cut (+) / fill (-) (m)'); b.set_xlabel('chainage from J1 centre (m)'); b.grid(alpha=.3)
plt.tight_layout(); plt.savefig(f'{d}/j1_w_profile.png', dpi=110); print('saved')

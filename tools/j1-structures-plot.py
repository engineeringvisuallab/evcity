# N and W arm profiles with the structures (6.1d). Run: python3 tools/j1-structures-plot.py docs
import json, sys, numpy as np, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
d = sys.argv[1] if len(sys.argv) > 1 else 'docs'
S = json.load(open(f'{d}/j1_structures_NW.json'))
fig, ax = plt.subplots(2, 1, figsize=(16, 9))
for a, key, pf, ttl in [(ax[0], 'N', 'j1c4c_profile', 'N arm'), (ax[1], 'W', 'j1c5c_profile', 'W arm')]:
    C = json.load(open(f'{d}/{pf}.json')); r = np.array(C['rows'])
    a.plot(r[:, 0], r[:, 1], 'k', lw=1.2, label='ground'); a.plot(r[:, 0], r[:, 2], 'r', lw=2, label='road')
    col = {'rail bridge': 'm', 'river bridge': 'tab:blue', 'viaduct': 'tab:orange'}
    for s in S[key]['structures']:
        c = col[s['kinds'][0]] if len(s['kinds']) == 1 else 'tab:green'
        a.axvspan(s['s0'], s['s1'], color=c, alpha=.3, lw=0)
        a.annotate(f"{s['id']}\n{' + '.join(s['kinds'])}\n{s['length']:.0f} m", ((s['s0'] + s['s1']) / 2, r[:, 2].max() + 1), ha='center', fontsize=8)
    for q in C['crossings']: a.plot([q['s']] * 2, [q['rail'], q['road']], 'm-', lw=3)
    a.axvline(S[key]['length'], color='gray', ls=':'); a.text(S[key]['length'], r[:, 1].min(), ' ring T', fontsize=8)
    a.set_ylim(r[:, 1].min() - 2, r[:, 2].max() + 8); a.set_title(f"{ttl}: structures (green = mixed, magenta = rail, blue = river, orange = viaduct)", fontsize=9); a.grid(alpha=.3); a.set_ylabel('level (m)')
ax[1].set_xlabel('chainage from J1 centre (m)'); ax[0].legend(loc='lower right')
plt.tight_layout(); plt.savefig(f'{d}/j1_structures_NW.png', dpi=105); print('saved')

# STEP J1-g3: picture of the finished level along the four arms (docs/j1g3_profiles.png) from docs/j1g3.json (made by scripts/j1-g3-check.ts)
# Run: python3 tools/j1g3-plot.py
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
D = json.load(open('docs/j1g3.json'))
fig, ax = plt.subplots(2, 2, figsize=(13, 8))
for a, arm in zip(ax.flat, 'NESW'):
    S = D['series'][arm]
    a.plot(S['s'], S['natural'], color='#8a7a5a', lw=1.2, label='natural ground (axis)')
    a.plot(S['s'], S['profile'], color='#2a6fb0', lw=1.2, ls='--', label='approved arm profile')
    a.plot(S['s'], S['level'], color='#c0392b', lw=2, label='finished level (J1-g3)')
    for x, t in ((D['SA'], 'SA %d' % D['SA']), (D['SB'], 'SB %d' % D['SB']), (D['S_END'], 'S_END %d' % D['S_END'])):
        a.axvline(x, color='#999', lw=0.8); a.text(x, a.get_ylim()[0], t, fontsize=8, rotation=90, va='bottom', ha='right')
    a.axvspan(0, 91.6, color='#f5e6a8', alpha=0.5)
    a.set_title('arm %s  (star yellow, s from the J1 centre)' % arm); a.set_xlabel('s (m)'); a.set_ylabel('height (m)'); a.grid(alpha=0.3)
    if arm == 'N': a.legend(fontsize=8, loc='upper left')
plt.tight_layout(); plt.savefig('docs/j1g3_profiles.png', dpi=110); print('docs/j1g3_profiles.png')

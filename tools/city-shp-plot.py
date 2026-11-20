# STEP CITY-SHP-1 picture: python3 tools/city-shp-plot.py   (reads docs/city_shp_raw.json, docs/city_shp_fit.json, docs/fit_chain/centre_fixed.json; writes docs/city_shp_fit.png)
# thin grey dashed = the user's drawn line, thick colour = fitted street (C blue, L teal), black = 8-lane, red = R6, orange = R4, grey = existing 2-lane / C / L. North is up (y = -z).
import json, sys
SUF = sys.argv[1] if len(sys.argv) > 1 else ''   # '' = SHP-1 picture, '2' = SHP-2 (joined + trimmed, as exported to the game)
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
raw = json.load(open('docs/city_shp_raw.json'))['lines']
fit = json.load(open('docs/city_shp_fit%s.json' % SUF))
fx = json.load(open('docs/fit_chain/centre_fixed.json'))['lines']
fig, ax = plt.subplots(figsize=(15, 13), dpi=80)
col = {'8': ('k', 3.0), '6': ('#c62828', 2.2), '4': ('#ef8f00', 1.6), '2': ('#9e9e9e', 1.0), 'C': ('#9e9e9e', 1.0), 'L': ('#bdbdbd', 0.8)}
for l in fx:
    c, w = col.get(str(l['cls']), ('#ccc', 0.8)); ax.plot([p[0] for p in l['pts']], [-p[1] for p in l['pts']], color=c, lw=w, zorder=1)
for l in raw:
    ax.plot([p[0] for p in l['pts']], [-p[1] for p in l['pts']], '--', color='#555', lw=1, zorder=2)
for l in fit['lines']:
    c = '#1565c0' if l['cls'] == 'C' else '#00897b'
    ax.plot([p[0] for p in l['pts']], [-p[1] for p in l['pts']], color=c, lw=2.6, zorder=3)
    m = l['pts'][len(l['pts']) // 2]; ax.text(m[0] + 8, -m[1] + 8, l['id'].replace('SH-', '') + l['cls'], fontsize=9, color=c, zorder=5)
mk = {'free': ('o', '#fb8c00'), 'T on drawn': ('s', '#2e7d32'), 'T on existing': ('s', '#2e7d32'), 'end-to-end': ('D', '#8e24aa'), 'BRANCH ON 8-LANE': ('X', '#d50000')}
for e in fit['ends']:
    m, c = mk[e['kind']]; ax.plot(e['x'], -e['z'], m, color=c, ms=9, mec='k', zorder=6)
ax.plot([-87], [277], '*', color='m', ms=20, zorder=6)
ax.set_xlim(-880, 1280); ax.set_ylim(-1280, 640); ax.set_aspect('equal'); ax.grid(True, alpha=.3)
ax.set_title('CITY-SHP-%s:' % (SUF or '1') + ' drawn (dashed) vs fitted street. orange o = free end, green = T, purple diamond = end-to-end gap, red X = ends on 8-lane road, star = J1', fontsize=11)
plt.tight_layout(); plt.savefig('docs/city_shp_fit%s.png' % SUF); print('docs/city_shp_fit%s.png' % SUF)

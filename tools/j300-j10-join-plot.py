# J10 step 0 picture: the two joins in plan (x east, z south drawn downwards) + level strips. Input: the two json dumps of scripts/j300-j10-join-dump.ts (OFF, ON). Usage: python3 tools/j300-j10-join-plot.py /tmp/join_OFF.json /tmp/join_ON.json docs/j300_j10_join.png
import json, sys, math
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
off = json.load(open(sys.argv[1])); on = json.load(open(sys.argv[2])); out = sys.argv[3]
fig, ax = plt.subplots(2, 2, figsize=(14, 9))
def plan(a, cx, cz, r, title, items):
    for (name, d, col, lw, ls) in items:
        a.plot(d[0], d[1], color=col, lw=lw, ls=ls, label=name)
    a.set_xlim(cx - r, cx + r); a.set_ylim(cz + r, cz - r); a.set_aspect('equal'); a.grid(alpha=.3); a.set_title(title, fontsize=10); a.legend(fontsize=7, loc='best')
a6 = [[p[0] for p in on['arm6']], [p[1] for p in on['arm6']]]
a4 = [[p[0] for p in on['arm4']], [p[1] for p in on['arm4']]]
r7 = [on['R6-7']['xs'], on['R6-7']['zs']]; r9 = [off['R6-9']['xs'], off['R6-9']['zs']]
plan(ax[0][0], -2002, -2972, 60, 'R6 far end: R6-7 end and the arm end are 21 m apart (not joined, also in the shipped game)', [('R6-7 (real road)', r7, '#c0392b', 3, '-'), ('J300 R6 arm', a6, '#2471a3', 3, '-'), ('old R6-9 (switch OFF)', r9, '#7f8c8d', 1.5, '--')])
ax[0][0].plot([-2000, -2004], [-2983, -2962], 'k:', lw=1)
ax[0][0].annotate('gap 21.4 m\nlevel 18.17 vs 16.35\nheading 3.6 deg', (-2002, -2972), fontsize=8, ha='left', xytext=(-1985, -2990))
r49 = [on['R4-9']['xs'], on['R4-9']['zs']]; r49o = [off['R4-9']['xs'], off['R4-9']['zs']]
plan(ax[0][1], -1425, -2140, 60, 'R4 join: R4-9 (switch ON, last 70 m bent 1.7 m max) meets the R4 arm, heading 4.05 -> 0.08 deg', [('R4-9 OFF (shipped)', r49o, '#7f8c8d', 1.5, '--'), ('R4-9 ON (trimmed + bent)', r49, '#c0392b', 3, '-'), ('J300 R4 arm', a4, '#2471a3', 3, '-')])
def prof(a, xs, zs, ys, name, col):
    s = [0]
    for i in range(1, len(xs)): s.append(s[-1] + math.hypot(xs[i]-xs[i-1], zs[i]-zs[i-1]))
    return s, ys
# level strips near the joins (distance from the join point)
def along(rows, jx, jz, sgn):
    return [sgn*math.hypot(p[0]-jx, p[1]-jz) for p in rows]
a = ax[1][0]
arm = on['arm6']; d = [math.hypot(p[0]+2004, p[1]+2962) for p in arm]; a.plot(d, [p[2] for p in arm], color='#2471a3', lw=2, label='J300 R6 arm (m from its free end)')
r = on['R6-7']; d = [-math.hypot(x+2000, z+2983) for x, z in zip(r['xs'], r['zs'])]; a.plot([x + 0 for x in d], r['ys'], color='#c0392b', lw=2, label='R6-7 (m before its end)')
a.set_xlim(-60, 60); a.set_ylim(14, 22); a.grid(alpha=.3); a.legend(fontsize=7); a.set_title('R6 levels: step 1.82 m, 21 m gap', fontsize=10); a.set_xlabel('m from the end'); a.set_ylabel('level m')
a = ax[1][1]
arm = on['arm4']; d = [math.hypot(p[0]+1406.96, p[1]+2127.41) for p in arm]; a.plot(d, [p[2] for p in arm], color='#2471a3', lw=2, label='J300 R4 arm (m from the join)')
r = on['R4-9']; d = [-math.hypot(x+1406.96, z+2127.41) for x, z in zip(r['xs'], r['zs'])]; a.plot(d, r['ys'], color='#c0392b', lw=2, label='R4-9 ON (m before the join)')
a.set_xlim(-60, 60); a.set_ylim(40, 52); a.grid(alpha=.3); a.legend(fontsize=7); a.set_title('R4 levels: no step (0.00 m). Section: arm asphalt 13.8 m half width vs R4-9 11.5 m (2.3 m step each side)', fontsize=9); a.set_xlabel('m from the join'); a.set_ylabel('level m')
fig.suptitle('J300 J10 step 0: join check (real game data)', fontsize=12); fig.tight_layout(); fig.savefig(out, dpi=110)

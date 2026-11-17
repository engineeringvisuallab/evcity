# STEP 17.1b picture: M6 cross-section (with the M8 outline) and the lane ladder 8 -> 6 at the ring S node. Run after scripts/island-link-section-calc.ts docs
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
d = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'docs/island_link_section.json'))
col = {'median': '#9aa', 'shoulder-in': '#bbb', 'lanes': '#444', 'shoulder-out': '#bbb', 'barrier': '#d33', 'ditch': '#7b5', 'clear-zone': '#cde8b0', 'row-strip': '#eed'}
fig, (a1, a2) = plt.subplots(2, 1, figsize=(12, 9), gridspec_kw={'height_ratios': [1, 1]})
for side in (1, -1):
    for e in d['m6']['elements']:
        x0, x1 = sorted((side * e['from'], side * e['to']))
        a1.add_patch(Rectangle((x0, 0), x1 - x0, 1.0 if e['kind'] != 'barrier' else 1.8, fc=col[e['kind']], ec='k', lw=0.4))
        if side == 1: a1.text((x0 + x1) / 2, 2.2 + {'barrier': 0.0, 'ditch': 0.7}.get(e['kind'], 0.0), f"{e['width']:.2f}", ha='center', fontsize=7)
for side in (1, -1):
    a1.plot([side * d['m8']['pavementEdge']] * 2, [0, 3.2], 'b--', lw=1)
a1.text(d['m8']['pavementEdge'] + 0.3, 3.4, 'M8 pavement edge 22.10', color='b', fontsize=7)
a1.text(0, 3.9, 'median 6.00 total', ha='center', fontsize=8)
a1.set_xlim(-38, 38); a1.set_ylim(-1, 5); a1.set_aspect(2.5)
a1.set_title('Step 17.1b: M6 cross-section (3 + 3 lanes of 3.65 m), widths in m, one side shown; ROW half 36.35 m, pavement edge 18.45 m (M8 dashed)')
a1.set_xlabel('distance from the centreline (m)'); a1.set_yticks([])
# plan sketch of the lane ladder, southbound drawn left to right; the exit zone is BEFORE the node (x = 0 = gore nose / node)
a2.set_xlim(-520, 1100); a2.set_ylim(-45, 45)
Ltap, Ldec = d['taper'], d['dec']
xs = -(Ltap + Ldec)           # start of the exit taper
ys0 = -9.0
def lane(x0, x1, k, fc='#eee', ec='#555'):
    a2.add_patch(Rectangle((x0, ys0 + k * 3.65), x1 - x0, 3.65, fc=fc, ec=ec, lw=0.6))
for k in range(3): lane(-500, 1050, k)          # three through lanes (bottom three)
lane(-500, xs, 3)                                # 4th lane of the arm up to the start of the exit
# exit lane: taper (widens), then parallel deceleration lane to the gore nose, then it leaves toward the ring (arrow)
a2.fill([xs, xs + Ltap, xs + Ltap, xs], [ys0 + 3 * 3.65, ys0 + 3 * 3.65, ys0 + 3 * 3.65 + 3.65, ys0 + 3 * 3.65 + 3.65], fc='#fdd', ec='#d33')
a2.add_patch(Rectangle((xs + Ltap, ys0 + 3 * 3.65), Ldec, 3.65, fc='#fdd', ec='#d33', lw=0.8))
a2.annotate('', xy=(85, 29), xytext=(0, ys0 + 3 * 3.65 + 1.8), arrowprops=dict(arrowstyle='->', color='#d33', lw=2))
a2.text(95, 31, '2-lane ramp to the ring (E and W)', color='#d33', fontsize=8)
a2.text(-500, 16, f"exit zone before the node: taper {Ltap:.0f} m + deceleration {Ldec:.0f} m = {Ltap + Ldec:.0f} m", color='#d33', fontsize=8)
a2.text(-510, -14.5, 'J1-S arm: 4 lanes southbound', fontsize=8)
a2.text(60, -14.5, 'island link M6: 3 lanes southbound, first straight >= 300 m', fontsize=8)
a2.text(-510, -40, 'lane balance 4 = 3 continuing + 2 exit - 1  -> the dropped 4th lane IS the exit lane (no taper, no merge). Ramp speed 60 and the ramp shape are a PROPOSAL (9.2 / 17.4c).', fontsize=7)
a2.axvline(0, color='k', lw=0.8, ls=':'); a2.text(5, 38, 'ring S node (T at ring st 1205, 4-leg, D17-1)', fontsize=8)
a2.set_title('Lane ladder 8 -> 6 at the S node (plan sketch, southbound only; the northbound side is the mirror: 3 + 2 - 1 = 4)')
a2.set_xlabel('distance along the road (m), schematic'); a2.set_yticks([])
plt.tight_layout(); plt.savefig('docs/island_link_section_M6.png', dpi=105)
print('wrote docs/island_link_section_M6.png')

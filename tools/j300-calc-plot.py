# J3 pictures. Reads docs/J300_CALC.json (J3) and docs/J300_TYPEB.json (J1-B). Writes docs/j300_calc_sheet.png (plan + corridor) and docs/j300_calc_view.png (3D concept view).
# Concept pictures from the calculation numbers, NOT a game render. Sizes ASSUMED as in HANDOFF_JUNCTION_300FT.md.
import json, math
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Wedge, FancyArrowPatch, Rectangle
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
C = json.load(open('docs/J300_CALC.json')); J = json.load(open('docs/J300_TYPEB.json'))
u0 = C['u0']; best = J['best']; PT = best['Ptop']; ring = J['ring']; RO, RI = 62, 48
def it(key, u):
    for a, b in zip(ring, ring[1:]):
        if a['u'] <= u <= b['u']:
            t = (u - a['u']) / (b['u'] - a['u']); return a[key] + t * (b[key] - a[key])
    return ring[0][key] if u < 0 else ring[-1][key]
E1 = {e['id']: e for e in C['entries1']}; E15 = {e['id']: e for e in C['entries15']}
OD = C['od']; legs = {l['id']: l for l in C['legs']}
mer = C['merge']; acc, nt, acc85, dec, xt = mer['acc'], mer['nt'], mer['acc85'], mer['dec'], mer['xt']
nose = {k: best['ramps'][n]['uMeet'] for k, n in zip(['E', 'W'], [list(best['ramps'])[0], list(best['ramps'])[2]])}
# ------------------------------------------------------------ sheet
fig = plt.figure(figsize=(16, 10.5))
ax = fig.add_axes([0.03, 0.30, 0.46, 0.66]); ax.set_aspect('equal'); ax.set_xlim(-135, 135); ax.set_ylim(-110, 110)
ax.set_title('J3 roundabout plan (ring runs left-right under the deck). Flows pcu/h at x1.0, x/c at design x1.0 (x1.5)', fontsize=10)
ax.add_patch(Rectangle((-135, -23.7), 270, 47.4, color='#bdbdbd', alpha=.55, lw=0)); ax.text(-130, -20, 'ring 8 lane in the underpass (box 134 m)', fontsize=7, color='#444')
ax.add_patch(Circle((0, 0), RO, color='#8a8a8f')); ax.add_patch(Circle((0, 0), RO - 14, color='#cfd8c0')); ax.add_patch(Circle((0, 0), RI, fill=False, ec='k', lw=.6))
ax.text(0, 0, 'island r 48\nno trees in the\nsight cones', ha='center', va='center', fontsize=8)
# arms and ramps as light strips
ax.add_patch(Rectangle((-16.6, RO - 4), 33.2, 60, color='#bdbdbd', alpha=.55, lw=0)); ax.add_patch(Rectangle((-14.4, -RO - 56), 28.8, 60, color='#bdbdbd', alpha=.55, lw=0))
for sx in (-1, 1):
    for sy in (-1, 1): ax.add_patch(Rectangle((sx * 55 if sx > 0 else -135, sy * 30 - 5.25), 80, 10.5, color='#9a9aa0', alpha=.6, lw=0))
for k in ['R6', 'R4', 'E-in', 'W-in', 'E-out', 'W-out']:
    a = math.radians(legs[k]['ang']); ex = E1.get(k)
    if k in ('R6', 'R4'): x, y = 0, (92 if k == 'R6' else -92)
    else: x, y = (96 if math.cos(a) > 0 else -96), (46 if math.sin(a) > 0 else -46)
    if ex: ax.text(x, y, '%s\nin %d | vc %d\nx/c %.2f (x1.5: %.2f)' % (k, round(ex['v'] / 10) * 10, round(ex['vc'] / 10) * 10, ex['x'], E15[k]['x']), ha='center', va='center', fontsize=7.5, weight='bold', color='#1b5e20')
    else: ax.text(x, y, k + '\n(exit only)', ha='center', va='center', fontsize=7.5, weight='bold')
mx = max(C['arcs'])
for i, l in enumerate(C['legs']):
    n = C['legs'][(i + 1) % 6]; a0, a1 = math.radians(l['ang']), math.radians(n['ang'])
    if a1 > a0: a1 -= 2 * math.pi
    am = (a0 + a1) / 2; r = RO - 7
    ax.add_patch(FancyArrowPatch((r * math.cos(a0 - .12), r * math.sin(a0 - .12)), (r * math.cos(a1 + .12), r * math.sin(a1 + .12)), connectionstyle='arc3,rad=-.0', arrowstyle='-|>', mutation_scale=9, lw=.8 + 5.5 * C['arcs'][i] / mx, color='#1f4e79', alpha=.55))
    ax.text((r - 15) * math.cos(am), (r - 15) * math.sin(am), '%d' % (round(C['arcs'][i] / 10) * 10), ha='center', va='center', fontsize=7, color='#1f4e79')
ax.annotate('', xy=(0, 105), xytext=(0, 70), arrowprops=dict(arrowstyle='-', lw=0)); ax.set_xticks([]); ax.set_yticks([])
ax.text(-132, 100, 'clockwise (left-hand traffic)\n3 circulating lanes, 3-lane entries R6 / R4,\n2-lane ramp entries, 6 legs', fontsize=8, va='top')
# corridor
ax2 = fig.add_axes([0.54, 0.30, 0.44, 0.66]); ax2.set_xlim(-780, 620); ax2.set_ylim(-5, 5); ax2.set_title('J3 ring corridor: merge / diverge lengths vs rail and water (u in m)', fontsize=10)
ax2.axvspan(-780, -560, color='#e6b0aa', alpha=.6); ax2.axvspan(520, 620, color='#aed6f1', alpha=.8); ax2.axvline(-600, color='#c0392b', lw=2); ax2.axvline(540, color='#2874a6', lw=2)
ax2.text(-770, 4.4, 'RAIL (u -600)\n+ 40 m margin', fontsize=8, color='#922b21'); ax2.text(525, 4.4, 'WATER\n(u +540)', fontsize=8, color='#1b4f72')
ax2.add_patch(Rectangle((u0 - 67, -2.6), 134, 5.2, color='#222')); ax2.text(u0, 0, 'underpass\n134 m', color='w', ha='center', va='center', fontsize=7)
ax2.add_patch(Rectangle((-780, -2.6), 1400, 5.2, fill=False, ec='#555', lw=.6)); ax2.text(-400, 3.1, 'EB carriageway (W-in diverge, E-out merge)', fontsize=7); ax2.text(-400, -3.1, 'WB carriageway (E-in diverge, W-out merge)', fontsize=7, va='top')
def bar(x0, x1, y, col, lab, ls='-', hatch=None):
    ax2.add_patch(Rectangle((min(x0, x1), y - .5), abs(x1 - x0), 1.0, fc=col, ec='k', lw=.8, ls=ls, alpha=.85, hatch=hatch)); ax2.text((x0 + x1) / 2, y, lab, ha='center', va='center', fontsize=7)
bar(nose['W'] - (dec + xt), nose['W'], 1.6, '#82e0aa', 'W-in diverge %d' % round(dec + xt)); bar(nose['E'], nose['E'] + acc + nt, 1.6, '#f9e79f', 'E-out merge %d (project rule)' % round(acc + nt))
bar(nose['E'], nose['E'] + dec + xt, -1.6, '#82e0aa', 'E-in diverge %d' % round(dec + xt))
bar(nose['W'] - (acc + nt), nose['W'], -1.6, '#f5b7b1', 'W-out merge %d (rule): crosses the rail' % round(acc + nt), ls='--')
ax2.add_patch(Rectangle((-560, -2.6 - 1.6 * 0 - 3.2), 255, .001)); ax2.annotate('', xy=(-560, -4.3), xytext=(nose['W'], -4.3), arrowprops=dict(arrowstyle='<->', color='#1e8449')); ax2.text((-560 + nose['W']) / 2, -4.0, 'OPTION A: only %d m exist (lane %d m, ends at about %d km/h)' % (nose['W'] + 560, nose['W'] + 560 - nt, 69), ha='center', va='bottom', fontsize=7, color='#1e8449')
ax2.set_yticks([]); ax2.set_xlabel('u (m)')
txt = ('J3 result: 25 PASS / 3 FAIL.  Roundabout: no signal needed (x/c max %.2f at x1.0, %.2f at x1.5, growth reserve x%.2f), 3 circulating lanes stay (J2).\n'
       'FAIL 1: consistent merge = lane %d + taper %d = %d m (J1 counted only %d); the 2 merges + roundabout + 4 ramps do not fit between rail and water (short by about 127 m).\n'
       'FAIL 2 + 3: ramp vertical curves E-out / W-out need 130 m, ramp has 126 m (+5 m ramp length in J5).   FINDING: ring sag (u -120) is INSIDE the box => sag inlets + gravity outfall DN 600 (J1 said "falls to both portals": wrong).'
       % (max(e['x'] for e in E1.values()), max(e['x'] for e in E15.values()), C['gcrit'], round(acc), round(nt), round(acc + nt), 241))
fig.text(0.03, 0.04, txt, fontsize=9, va='bottom', family='sans-serif')
fig.suptitle('J300 junction, step J3 calculation sheet (concept picture from the numbers, ASSUMED demand)', fontsize=12, y=1.02)
fig.savefig('docs/j300_calc_sheet.png', dpi=90, bbox_inches='tight'); plt.close(fig)
# ------------------------------------------------------------ 3D view
fig = plt.figure(figsize=(15, 8)); ax = fig.add_subplot(111, projection='3d'); ax.set_proj_type('persp')
polys = []
def P(pts, col, edge='none', alpha=1.0): polys.append((pts, col, edge, alpha))
def ribbon(f, u_a, u_b, v_c, w, col, step=10, z_off=0.0):
    us = list(range(int(u_a), int(u_b) + 1, step))
    for a, b in zip(us, us[1:]): P([(a, v_c - w / 2, f(a) + z_off), (b, v_c - w / 2, f(b) + z_off), (b, v_c + w / 2, f(b) + z_off), (a, v_c + w / 2, f(b) + z_off)], col)
G = lambda u: it('nat', u)
for a in range(-400, 300, 50):
    for b in range(-200, 300, 50): P([(a, b, G(a)), (a + 50, b, G(a)), (a + 50, b + 50, G(a)), (a, b + 50, G(a))], '#b9c79a', '#a9b88a', .5)
ribbon(lambda u: it('ring', u), -400, 300, 0, 44.2, '#3f3f42')
uo = u0
# deck + island
for k in range(72):
    a0, a1 = 2 * math.pi * k / 72, 2 * math.pi * (k + 1) / 72
    for (r0, r1, col) in [(RI, RO, '#6e6e72'), (0, RI, '#6a994e')]:
        P([(uo + r0 * math.cos(a0), r0 * math.sin(a0), PT), (uo + r1 * math.cos(a0), r1 * math.sin(a0), PT), (uo + r1 * math.cos(a1), r1 * math.sin(a1), PT), (uo + r0 * math.cos(a1), r0 * math.sin(a1), PT)], col)
    P([(uo + RO * math.cos(a0), RO * math.sin(a0), PT), (uo + RO * math.cos(a1), RO * math.sin(a1), PT), (uo + (RO + 3) * math.cos(a1), (RO + 3) * math.sin(a1), G(uo)), (uo + (RO + 3) * math.cos(a0), (RO + 3) * math.sin(a0), G(uo))], '#d8d2c4')
# ramps (centre line v = +-30), 110 m, 5 %
for side, dirn, nm in [(1, 1, 'E-out'), (-1, 1, 'E-in'), (1, -1, 'W-in'), (-1, -1, 'W-out')]:
    un = nose['E'] if dirn > 0 else nose['W']; ua = uo + dirn * 70
    f = lambda u, ua=ua, un=un, d=dirn: PT - 0.05 * abs(u - ua) if abs(u - ua) < abs(un - ua) else it('ring', u)
    ribbon(f, min(ua, un), max(ua, un), side * 30, 10.5, '#55555a', 5)
    for e in (-1, 1): P([(ua, side * 30 + e * 5.25, PT), (un, side * 30 + e * 5.25, f(un)), (un, side * 30 + e * 5.25 + side * 3, G(un)), (ua, side * 30 + e * 5.25 + side * 3, G(ua))], '#d8d2c4', alpha=.5)
# arms
r6L = best['r6Len']; f6 = lambda v: PT - (PT - G(uo)) * (v - RO) / (r6L - RO)
for a, b in zip(range(RO, min(int(r6L), 290), 12), range(RO + 12, min(int(r6L), 290) + 12, 12)):
    b = min(b, 290); P([(uo - 16.6, a, f6(a)), (uo + 16.6, a, f6(a)), (uo + 16.6, b, f6(b)), (uo - 16.6, b, f6(b))], '#4b4b4e')
    P([(uo - 16.6, a, f6(a)), (uo - 16.6, b, f6(b)), (uo - 16.6 - 3, b, G(uo)), (uo - 16.6 - 3, a, G(uo))], '#d8d2c4', alpha=.5)
for a in range(-RO - 130, -RO, 15): P([(uo - 14.4, a, PT - 0.0 * a), (uo + 14.4, a, PT), (uo + 14.4, a + 15, PT), (uo - 14.4, a + 15, PT)], '#4b4b4e')
col = Poly3DCollection([p[0] for p in polys], facecolors=[p[1] for p in polys], edgecolors=[p[2] for p in polys], linewidths=.2, alpha=.95); ax.add_collection3d(col)
for k in ['R6', 'R4', 'W-in', 'E-in', 'W-out', 'E-out']:
    a = math.radians(C['legs'][[l['id'] for l in C['legs']].index(k)]['ang']); ax.text(uo + 88 * math.cos(a), 88 * math.sin(a) * (1.25 if k in ('R6', 'R4') else 1), PT + 5, k, fontsize=10, weight='bold', ha='center')
ax.set_xlim(-400, 280); ax.set_ylim(-200, 290); ax.set_zlim(17, 60); ax.set_box_aspect((680, 490, 160)); ax.view_init(elev=24, azim=-58); ax.set_axis_off()
ax.set_title('J3 concept view: raised roundabout (deck %.1f m) over the ring underpass, 4 one-way ramps down to the ring, R6 arm climbing from the ground (vertical scale exaggerated)' % PT, fontsize=10)
fig.savefig('docs/j300_calc_view.png', dpi=90, bbox_inches='tight'); plt.close(fig); print('ok')

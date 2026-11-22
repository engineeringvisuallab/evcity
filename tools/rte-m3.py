# STEP RE-4: right-turn ramp M3 (ring direction B -> stem outbound) of RT-E: plan, profile, terminals, checks. Geometry DATA only (no mesh, no game layer).
# Run:  python3 -I tools/rte-m3.py docs     (needs docs/rte_site.json, docs/RTE_LEVELS.json, docs/RTE_SLIPS.json; reuses the helpers of tools/rte-levels.py)
# Writes docs/RTE_M3.txt, docs/RTE_M3.json, docs/rte_m3.png and src/roads/junction/RteM3Data.ts (GENERATED).
# NEW compared with RE-1 / RE-2 (a finding of this step): the RE-1 layout put M3 at u = +14 and M4 at u = -14, i.e. INSIDE the paved stem (the stem pavement is u 3 .. 22.1).
# That cannot be built. Here M3 runs OUTSIDE the stem pavement and outside the A2S slip lane of RE-3 (u = 31.1), so it must cross OVER the A2S slip arc.
import sys, json, math
_L = open('tools/rte-levels.py').read().split('\n')
_c = [k for k, l in enumerate(_L) if l.startswith("Q('RE-2 VERTICAL PLAN")][0]
exec('\n'.join(_L[:_c]))                      # helpers of RE-2 (+ the RE-1 prefix); OD = output dir
LOG4 = []
def Q(s=''): LOG4.append(s); print(s)

SL = json.load(open(f'{OD}/RTE_SLIPS.json'))['slips']
A2S = np.array(SL['RTE-A2S']['pts_uv']); A2S_Y = np.array(SL['RTE-A2S']['ys']); S2A = np.array(SL['RTE-S2A']['pts_uv']); S2A_Y = np.array(SL['RTE-S2A']['ys'])
SLIP_C = HW - LANE / 2 + LANE                                     # 23.925 added lane centre (RE-3)
U_RAMP = SLIP_C + LANE / 2 + 0.5 + RW / 2                         # 31.1: ramp centre outside the added slip lane, 0.5 m gap
U_OUT, U_IN = U_RAMP, -U_RAMP                                     # globals used by build_M3 / build_M4 of RE-2
# FIX of RE-1 / RE-2: their builders placed the arc as if it were a pure circle (R 80), but trace() draws spiral-arc-spiral, whose end is 109.6 m from the start (not 80 m):
# the ramps ended 29.6 m away from where RE-1 / RE-2 said. The builders below use the real end offset of the traced curve.
_a = trace(0, 0, 0, [('A', R_SEMI, 90, +1, VR_SEMI)]); ARC_D = float(_a[-1, 0]); ARC_L = float(_a[-1, 1])
def build_M3(T3, dn): return trace(U_OUT - ARC_D - T3, V_OUT, 0, [('S', T3), ('A', R_SEMI, 90, +1, VR_SEMI), ('S', max(dn - (V_OUT + ARC_L), 0.5))])
def build_M4(d): return trace(U_IN, d, -90, [('S', max(d - (V_OUT + ARC_D), 0.5)), ('A', R_SEMI, 90, +1, VR_SEMI), ('S', ENTRY_LEN + 10)])

# lateral room: while the ramp is still curving it must already be outside the paved stem (edge >= 0.5 m from u 22.1) wherever v > HW + 0.5. Scan the straight position U_OUT / U_IN.
U_MIN = HW + 0.5 + RW / 2                                         # 27.45
for _e in range(0, 150):
    U_OUT = U_RAMP + _e; _P = build_M3(100, 150); _s = _P[_P[:, 1] > HW + 0.5]
    if _s[:, 0].min() >= U_MIN - 1e-6: break
EXTRA3 = _e
for _e in range(0, 150):
    U_IN = -(U_RAMP + _e); _P = build_M4(250); _s = _P[_P[:, 1] > HW + 0.5]
    if _s[:, 0].max() <= -U_MIN + 1e-6: break
EXTRA4 = _e

def need_slip(slipP, slipY):
    def need(P_, f_):
        X = seg_hit(P_, slipP)
        if X is None: return -1.0
        j = int(np.hypot(slipP[:, 0] - X[0], slipP[:, 1] - X[1]).argmin())
        return RISE - (float(f_(at_s(P_, X))[0]) - float(slipY[j]))
    return need

# ---- M3 (lower ramp, as picked in RE-2): clearance over the ring + over the A2S slip arc ----
nA = need_slip(A2S, A2S_Y)
M3 = solve_M3(lambda o: nA, 'x')                                   # the builder ignores its argument; 'x' only switches it on
# ---- M4 (upper, PRELIMINARY, final in RE-5): clears the ring, the S2A slip and M3 + STEP_UP ----
nS = need_slip(S2A, S2A_Y)
def need_m4(P_, f_):
    return max(nS(P_, f_), make_need(M3['P'], M3['f'])(P_, f_))
M4 = solve_M4(need_m4)

Q('RE-4 RAMP M3 (B -> S)  RT-E, right turn, semi-direct flyover on the far (outside) side, then OVER the A2S slip beside the stem.')
Q(f'Frame: u along the ring (+ = R+), v toward the stem. Ring level at the T {yR(0):.2f}, stem level at the T {yS(0):.2f}.')
Q(f'FINDING 1: the RE-1 / RE-2 builders drew the 90 deg turn as a pure R {R_SEMI:.0f} m circle, but the spiral-arc-spiral curve ends {ARC_D:.1f} m (not {R_SEMI:.0f} m) from its start. All RE-1 / RE-2 ramp positions were therefore off by {ARC_D-R_SEMI:.1f} m in plan (the levels / grades were solved on that wrong layout). Fixed here for M3 (and for the preliminary M4); RE-2 numbers are SUPERSEDED by RE-4 / RE-5.')
Q(f'FINDING 2: the ramp must run OUTSIDE the stem pavement (u 3 .. 22.1) and outside the A2S slip lane of RE-3 (centre u >= {U_RAMP:.1f} = {SLIP_C:.3f} + {LANE/2:.3f} + 0.5 gap + {RW/2:.2f} half deck). The spiral-arc-spiral is {ARC_D:.0f} m long, so while it is still turning over the stem corner (v > {HW:.0f}) its edge must already be 0.5 m outside the stem pavement: the straight part along the stem is therefore at u = +{U_OUT:.1f} (M3, {EXTRA3} m wider than the minimum) and u = {U_IN:.1f} (M4, preliminary). M3 crosses OVER the A2S slip arc, M4 over the S2A slip arc.')
Q(f'Criteria: V 50 km/h, R {R_SEMI:.0f} m (min {minR(50):.1f}), spiral-arc-spiral, deck {RW} m (2 lanes + 2 shoulders), over the ring {RISE} m (5.5 + deck + girder), grade {GMAX*100:.0f} %, K crest {KR["crest"]:.1f} / sag {KR["sag"]:.1f}, exit lane {decel(VH, VR_SEMI):.0f} + taper {EXIT_TAPER*LANE:.0f} m.')
if not (M3 and M4): Q('NO SOLUTION within 700 m'); sys.exit(1)
P3, f3 = M3['P'], M3['f']; P4, f4 = M4['P'], M4['f']
def hk(P):
    d = np.diff(P[:, :2], axis=0); h = np.unwrap(np.arctan2(d[:, 1], d[:, 0])); s = P[:, 3][1:]; ds = np.diff(P[:, 3]); k = np.diff(h) / (0.5 * (ds[1:] + ds[:-1]) + 1e-9); return np.degrees(h), k
h3, k3 = hk(P3); rmin = 1 / max(np.abs(k3).max(), 1e-9)
m3 = measure(P3, M3['y0'], M3['yc'], M3['mk'], M3['y1'], 'M3')
X34 = seg_hit(P3, P4); sep34 = float(f4(at_s(P4, X34))[0]) - float(f3(at_s(P3, X34))[0])
XA = seg_hit(P3, A2S); jA = int(np.hypot(A2S[:, 0] - XA[0], A2S[:, 1] - XA[1]).argmin()); clrA = float(f3(at_s(P3, XA))[0]) - float(A2S_Y[jA])
XS = seg_hit(P4, S2A); jS = int(np.hypot(S2A[:, 0] - XS[0], S2A[:, 1] - XS[1]).argmin()); clrS = float(f4(at_s(P4, XS))[0]) - float(S2A_Y[jS])
# lateral distance to the A2S slip centreline where both run side by side on the stem (v > 100)
stemM3 = P3[P3[:, 1] > 100][:, :2]; stemA = A2S[A2S[:, 1] > 100]; dlat = float(np.sqrt(((stemM3[::3, None, :] - stemA[None, :, :]) ** 2).sum(-1)).min()) if len(stemM3) and len(stemA) else 999.0
need_lat = LANE / 2 + 0.5 + RW / 2
exitlen = decel(VH, VR_SEMI) + EXIT_TAPER * LANE
dn3 = M3['d']; T3 = M3['T3']
chk = []
def C(txt, ok, note=''): chk.append((txt, bool(ok), note)); Q(f"{'PASS' if ok else 'FAIL'}  {txt}  {note}")
Q('')
Q(f"M3 plan: start on ring B (u {P3[0,0]:.0f}, v {P3[0,1]:.1f}) heading +u, straight {T3} m, right turn spiral-arc-spiral R {R_SEMI:.0f} m (90 deg) to heading +v on u = {P3[-1,0]:.1f}, straight over the ring and along the stem, end at the nose d = {dn3} (v {P3[-1,1]:.0f}); length {P3[-1,3]:.0f} m.")
Q(f"M3 levels: start {M3['y0']:.2f} (ring B), deck {M3['yc']:.2f} m (ring + {M3['yc']-yR(0):.1f}), end {M3['y1']:.2f} (stem outbound level at d {dn3}). Ring clearance {M3['c']:.2f} m; over the A2S slip arc at ({XA[0]:.0f}, {XA[1]:.0f}) {clrA:.2f} m; vertical curves: " + '; '.join(f"{c['kind']} s={c['s']:.0f} A={c['A']:+.1f} % L={c['L']:.0f}" for c in M3['cur']))
Q(f"M4 (PRELIMINARY, final in RE-5): gore d {M4['d']}, deck {M4['yc']:.2f} m, ring clearance {M4['c']:.2f} m, over S2A slip arc {clrS:.2f} m, over M3 {sep34:+.2f} m at ({X34[0]:.0f}, {X34[1]:.0f}).")
Q('')
C(f'M1 plan radius >= minRadius(50) = {minR(50):.1f} m', rmin >= minR(50) - 0.5, f'{rmin:.1f} m')
C('M2 smooth: no curvature jump (<= 0.003 1/m per 2 m step), G1 by construction', np.abs(np.diff(k3)).max() <= 0.003, f'max step {np.abs(np.diff(k3)).max():.5f}')
mg = maxgrade(P3, f3); C('M3 grade <= 5 % on the curved profile', mg <= GMAX + 1e-4, f'{mg*100:.2f} %')
C(f'M4 clearance over the ring pavement >= {RISE} m', M3['c'] >= RISE - 0.01, f"{M3['c']:.2f} m")
C(f'M5 clearance over the A2S slip arc >= {RISE} m', clrA >= RISE - 0.01, f'{clrA:.2f} m')
bad = [c for c in M3['cur'] if not c['fits']]; C(f'M6 vertical curves L >= K*A and fit', not bad, f"{len(M3['cur'])} curves")
ok7 = abs(f3(np.array([0.0]))[0] - M3['y0']) < .05 and abs(f3(np.array([P3[-1, 3]]))[0] - M3['y1']) < .05
C('M7 tie-in levels: start = ring B level, end = stem level at the nose', ok7, f"{M3['y0']:.2f} -> {M3['y1']:.2f}")
C(f'M8 side by side with the A2S slip lane on the stem (v > 100): centre distance >= {need_lat:.2f} m', dlat >= need_lat - 0.05, f'{dlat:.2f} m')
umin = float(P3[P3[:, 1] > HW + 1][:, 0].min()); C(f'M9 outside the paved stem: ramp edge >= 0.5 m from u {HW} (actual centre line, v > {HW+1:.0f})', umin - RW / 2 >= HW + 0.5 - 1e-3, f'centre u {umin:.2f}, edge {umin-RW/2:.2f}')
C('M10 cut <= 12 m and fill <= 7 m (natural ground)', m3['max_cut'] <= MAXCUT and m3['max_fill'] <= MAXFILL, f"cut {m3['max_cut']:.1f} fill {m3['max_fill']:.1f}")
C(f'M11 rail >= {RAIL_CLEAR:.0f} m (ASSUMED, D3)', m3['rail_m'] >= RAIL_CLEAR, f"{m3['rail_m']:.0f} m")
C(f'M12 exit lane + taper ({exitlen:.0f} m) before the ramp start stays east of the ring bridge (u > {RING_BR_END})', P3[0, 0] - exitlen > RING_BR_END, f'taper starts u {P3[0,0]-exitlen:.0f}')
o = sum(max(0.0, min(dn3 + (decel(STEM_V, VR_SEMI) * 0 + accel(STEM_V, VR_SEMI) + ENTRY_TAPER * LANE), hi) - max(dn3, lo)) for lo, hi in (ARM_VIA, ARM_VIA2))
C('M13 stem: nose + entry taper keep clear of the arm viaducts', o == 0, f'overlap {o:.0f} m (same D1 fact)')
Q('NOT RUN  M14 merge / lane budget of M3 with the A2S slip lane on the stem outbound (A2S lane d 66..310, M3 nose d %d): RE-5.' % dn3)
Q('NOT RUN  M15 plan check of M3 against M4 final and the cross-check of all four ramps: RE-5. (M4 above is PRELIMINARY.)')
Q('NOT RUN  src/interchange/Validate.ts (needs the interchange builder types), full tsc, npm run build, the game, carved ground, trees, ring median U-turn openings, girder depth (7.8 m assumed).')

# ---- outputs ----
def wp(P): return [[round(float(x), 2), round(float(z), 2)] for x, z in (world(u, v) for u, v in P)]
L = float(P3[-1, 3]); ss = np.append(np.arange(0, L, 6.0), L); ii = [int(np.abs(P3[:, 3] - s_).argmin()) for s_ in ss]; ys = [round(float(f3(s_)[0]), 3) for s_ in ss]
J = dict(frame='u along ring, v toward stem; world = J + u*t - v*ln', J=[JX, JZ], t=T.tolist(), ln=LN.tolist(), M3=dict(length=L, u_ramp=U_RAMP, T3=T3, stem_nose_d=dn3, min_radius=rmin, max_grade=mg, deck_level=M3['yc'], ring_clearance=M3['c'], slip_clearance=clrA,
         ring_crossing_s=[float(M3['sp'][0]), float(M3['sp'][1])], curves=[dict(kind=c['kind'], s=round(c['s'], 1), A_percent=round(c['A'], 2), L=round(c['L'], 1)) for c in M3['cur']],
         pts_uv=[[round(float(P3[i, 0]), 2), round(float(P3[i, 1]), 2)] for i in ii], ys=ys, quantities=dict(deck_m2=m3['deck_m2'], fill_m3=m3['fill_m3'], cut_m3=m3['cut_m3'], max_cut=m3['max_cut'], max_fill=m3['max_fill'])),
     M4_preliminary=dict(gore_d=M4['d'], deck_level=M4['yc'], ring_clearance=M4['c'], slip_clearance=clrS, over_M3=sep34), checks=chk)
json.dump(J, open(f'{OD}/RTE_M3.json', 'w'), indent=1, default=float); open(f'{OD}/RTE_M3.txt', 'w').write('\n'.join(LOG4) + '\n')
ts = ['// GENERATED by tools/rte-m3.py (STEP RE-4). Do not edit: rerun the script (sources docs/rte_site.json, RTE_LEVELS.json, RTE_SLIPS.json).',
      '// RT-E ramp M3 (ring direction B -> stem outbound), semi-direct flyover, 2 lanes, one-way, points run in the direction of travel. World x, z; ys = finished deck / surface level (m).',
      f'// V 50 km/h, R {R_SEMI:.0f} m with spirals, ramp centre u = {U_RAMP:.1f} m beside the stem. Config switch: NOT wired yet (RE-9). Data only, not imported by the game.',
      'export interface RteRampData { name: string; from: string; to: string; deckWidth: number; pts: number[][]; ys: number[] }',
      'export const RTE_M3_DATA: RteRampData = ' + "{ name: 'RTE-M3', from: 'ring B (far carriageway) exit', to: 'stem outbound nose', deckWidth: %s, pts: %s, ys: %s };" % (RW, json.dumps(wp(P3[ii, :2]), separators=(',', ':')), json.dumps(ys, separators=(',', ':')))]
open('src/roads/junction/RteM3Data.ts', 'w', newline='').write('\r\n'.join(ts) + '\r\n')

fig, axs = plt.subplots(2, 1, figsize=(13, 13), gridspec_kw=dict(height_ratios=[2, 1]))
ax = axs[0]; uu = np.arange(-300, 500, 20.0); vv = np.arange(-120, 350, 20.0); G = np.array([[ground(u, v) for u in uu] for v in vv]); ax.contourf(uu, vv, G, levels=np.arange(10, 90, 5), cmap='terrain', alpha=.4)
ax.fill_between([-300, 500], -HW, -MEDH, color='#999'); ax.fill_between([-300, 500], MEDH, HW, color='#999'); ax.fill_between([-300, 500], -MEDH, MEDH, color='#ddd'); ax.fill_between([-HW, -3], HW, 350, color='#bbb'); ax.fill_between([3, HW], HW, 350, color='#999')
ax.add_patch(plt.Rectangle((-HW - 4, 160), 2 * HW + 8, 111, fill=False, ec='m', lw=1.5, ls='--'))
ax.plot(A2S[:, 0], A2S[:, 1], color='green', lw=2, label='A->S slip (RE-3)'); ax.plot(S2A[:, 0], S2A[:, 1], color='darkorange', lw=2, label='S->A slip (RE-3)')
ax.plot(P4[:, 0], P4[:, 1], color='navy', lw=1.8, ls='--', label='M4 (preliminary)'); ax.plot(P3[:, 0], P3[:, 1], color='crimson', lw=3.5, label='M3 B->S (RE-4)')
ax.plot([XA[0]], [XA[1]], 'kx', ms=10); ax.set_aspect('equal'); ax.set_xlim(-300, 500); ax.set_ylim(-120, 350); ax.legend(fontsize=8, loc='lower right'); ax.set_title('RE-4 ramp M3 (plan); x = crossing over the A2S slip arc'); ax.set_xlabel('u (m)'); ax.set_ylabel('v (m)')
ax = axs[1]; s_ = np.linspace(0, L, 300); ix = [int(np.abs(P3[:, 3] - a).argmin()) for a in s_]
ax.plot(s_, f3(s_), color='crimson', lw=2.5, label='M3 level'); ax.plot(s_, [yR(P3[i, 0]) for i in ix], 'r--', lw=.8, label='ring level'); ax.plot(s_, [ground(P3[i, 0], P3[i, 1]) for i in ix], 'k:', lw=.8, label='natural ground')
ax.axvspan(M3['sp'][0], M3['sp'][1], color='crimson', alpha=.08); ax.axvline(at_s(P3, XA), color='green', ls='--', lw=1, label='over A2S slip'); ax.legend(fontsize=8); ax.grid(alpha=.3); ax.set_xlabel('s along M3 (m)'); ax.set_ylabel('level (m)'); ax.set_title('M3 profile')
plt.tight_layout(); plt.savefig(f'{OD}/rte_m3.png', dpi=100); print('written')

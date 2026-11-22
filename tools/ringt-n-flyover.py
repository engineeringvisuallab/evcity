"""STEP RT-N-f: FLYOVER design sheet of the ring N junction (ring M8 x J1-N arm, 8 x 8 lanes, 3-leg, grade separated).
HEADLESS, READ ONLY, STANDALONE (no src import): constants are the ones printed in docs/RINGT_N_a.txt (Standards.ts / Criteria.ts values).
RUN: python3 tools/ringt-n-flyover.py docs   -> docs/RINGT_N_f.txt, docs/RINGT_N_f.json, docs/RINGT_N_f.png
Frame: u = metres along the ring from the T (plus = higher station), v = metres from the ring centreline towards carriageway B (upper side),
z = height above the ring surface at the T. Stem (J1-N arm) comes from v < 0 (A side). LEFT-HAND traffic: A flows plus -> minus, B minus -> plus."""
import json, math, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection

OUT = sys.argv[1] if len(sys.argv) > 1 else 'docs'
L = []
def P(s=''):
    L.append(s); print(s)
checks = []
def chk(i, ok, text):
    checks.append({'id': i, 'ok': bool(ok), 'text': text}); P(('PASS ' if ok else 'FAIL ') + f'{i}: {text}')
r1 = lambda v: round(v * 10) / 10

# ---- constants (RINGT_N_a.txt section 1 and 2) --------------------------------------------------------------------------------------------------------
W, VM = 3.65, 100.0                 # lane width, ring speed km/h
A_DEC, A_ACC = 2.5, 1.2             # Standards.ts aDecel, aAccel (m/s2)
EXIT_TAPER, ENTRY_TAPER = 25 * W, 50 * W                  # 91.25, 182.5 m
RING_HALF = 3 + 4 * W                                     # 17.6 m: ring centreline to outer edge of a carriageway (median 6 m)
LANE_C = RING_HALF + W / 2                                # 19.425 m: centre of a 5th lane beside the outer edge
STEM_KERB, STEM_EDGE, ARM_FALL = 15.8, 17.6, 0.029
FREE = dict(minus=1040, plus=415, bridgeA=200, bridgeB=264)
T20, T21 = -665, 640
CLEAR = 5.5 + 1.5                                         # Criteria bridgeClearance + STRUCT.deckDepth
RAMP_MAX = 0.05
WEAVE_MIN, WEAVE_DES = 150, 300
RING_ABOVE_GROUND, MAX_FILL = 4.3, 7.0
K_PEAK, D_SPLIT, CAP = 0.1, 0.6, 1800

kms = lambda v: v / 3.6
def decel_len(v1, v2): return (kms(v1) ** 2 - kms(v2) ** 2) / (2 * A_DEC)
def accel_len(vring, vfrom): return ((kms(0.85 * vring)) ** 2 - kms(vfrom) ** 2) / (2 * A_ACC)
FT = {30: .28, 40: .23, 50: .19, 60: .17, 70: .15, 80: .14, 90: .13, 100: .12}      # side friction (AASHTO), emax 8 %
def fric(v):
    ks = sorted(FT); v = min(max(v, ks[0]), ks[-1])
    for a, b in zip(ks, ks[1:]):
        if a <= v <= b: return FT[a] + (FT[b] - FT[a]) * (v - a) / (b - a)
def min_r(v): return v * v / (127 * (0.08 + fric(v)))
def speed_of_r(R):
    lo, hi = 30.0, 100.0
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if min_r(mid) <= R else (lo, mid)
    return lo

P('STEP RT-N-f  RING N JUNCTION, FLYOVER (3-leg, grade separated, 8 x 8 lanes)  headless, READ ONLY, nothing in src or data changed')
P('USER 2026-11-22: flyover wanted; ground cut / fill and more land are allowed. This REPLACES the ground-level decision of 2026-11-15 for RT-N only (the signal, 2 phases and median lanes of design O1 are dropped).')
P(f'sanity of the constants against RINGT_N_a.txt: decel 100->60 {r1(decel_len(100, 60))} m (sheet 98.8), 100->30 {r1(decel_len(100, 30))} (140.4), accel 30->85 {r1(accel_len(100, 30))} (203.4), min R at 30 / 40 / 60 km/h = {r1(min_r(30))} / {r1(min_r(40))} / {r1(min_r(60))} (19.7 / 40.6 / 113.4)')
P('')
P('1. TOPOLOGY (left-hand traffic; stem from the A side). Level 0 = ring A, B, stem, slips M1 (A -> stem, left) and M2 (stem -> A, left). The two RIGHT turns cross the ring:')
P('   M4 stem -> B : leaves the stem median side, ONE curved bridge over A and B at +7.0 m, lands on B from its OUTER (left) side, descends, merges as a 5th lane.')
P('   M3 B -> stem : leaves B from its OUTER (left) side upstream (minus side), climbs beside B, crosses over M4, B and A at +14.0 m, lands east of the stem, descends beside it, merges on the stem outbound.')
P('   Both are SEMI-DIRECT ramps, no tight loop ramp (a small-radius loop is hard to drive). They cross each other in plan, so M3 needs the 2nd deck: 5.5 + 1.5 = 7.0 m between decks.')
P('   Why not an UNDERPASS for M3 (ASSUMED, not checked with the terrain): the ground at the T is 21.0 m, the river is 200 m away (S3 is only 1.9 m over the water), so an underpass 7 m below the ring (2.7 m below the ground) probably sits in the flood level / water table. Flyover is the safer choice here.')

# ---- 2. arcs ------------------------------------------------------------------------------------------------------------------------------------------------
RR = 2 * LANE_C
VR = speed_of_r(RR)
ARC = math.pi / 2 * RR
P('')
P('2. RAMP ARCS')
P(f'   quarter circle from lane centre v = -{r1(LANE_C)} to +{r1(LANE_C)}: R = {r1(RR)} m, arc {r1(ARC)} m; the radius allows {r1(VR)} km/h (emax 8 %). DESIGN SPEED 35 km/h (min R at 35 = {r1(min_r(35))} m, at 40 = {r1(min_r(40))} m)')
chk('G1', VR >= 35, f'R {r1(RR)} m allows {r1(VR)} km/h >= 35 km/h')
M4U0, M4UE = 0.0, RR
U_STEM_OUT = STEM_EDGE + 0.6 + W / 2
M3U1, M3UE = U_STEM_OUT - RR, U_STEM_OUT
dC = M4UE - M3U1
UX = (M3U1 + M4UE) / 2
VX = -LANE_C + math.sqrt(RR * RR - (dC / 2) ** 2)
P(f'   M4 arc (u,v): ({r1(M4U0)}, {r1(-LANE_C)}) -> ({r1(M4UE)}, {r1(LANE_C)});  M3 arc: ({r1(M3U1)}, {r1(LANE_C)}) -> ({r1(M3UE)}, {r1(-LANE_C)})')
P(f'   the two ramps cross in plan at u = {r1(UX)}, v = {r1(VX)} (carriageway B lies at v 3 .. {r1(RING_HALF)})')
chk('G2', 3 < VX < RING_HALF, f'the ramps cross over carriageway B (v {r1(VX)}), not over the stem or a slip')

# ---- 3. vertical ---------------------------------------------------------------------------------------------------------------------------------------------
Z4, Z3 = CLEAR, 2 * CLEAR
P('')
P(f'3. VERTICAL (z above the ring surface at the T; ring is nearly flat: -0.7 % .. +0.5 % within +-150 m). Decks: M4 z = {r1(Z4)} m, M3 z = {r1(Z3)} m, ramp grade limit {RAMP_MAX * 100:.0f} %')
M4_GORE = 160.0
M4_Z0 = ARM_FALL * M4_GORE
m4_grade = (Z4 - M4_Z0) / (M4_GORE - LANE_C)
P(f'   M4: leaves the stem {M4_GORE:.0f} m before the ring (stem surface {r1(M4_Z0)} m above the ring there, the arm falls {ARM_FALL * 100:.1f} % to the ring), rises to {r1(Z4)} m over {r1(M4_GORE - LANE_C)} m = {r1(m4_grade * 100)} %')
chk('V1', m4_grade <= RAMP_MAX, f'M4 approach grade {r1(m4_grade * 100)} % <= {RAMP_MAX * 100:.0f} %')
M4_DESC = Z4 / RAMP_MAX
M4_DESC_END = M4UE + M4_DESC
M4_ACC = accel_len(VM, 35)
M4_ACC_END = M4_DESC_END + M4_ACC
P(f'   M4 after the arc: down {r1(Z4)} m at 5 % = {r1(M4_DESC)} m (ring level at u = {r1(M4_DESC_END)}), accel lane 35 -> 85 km/h = {r1(M4_ACC)} m (to u = {r1(M4_ACC_END)}); the straight ends at u = {FREE["plus"]}')
chk('V2', M4_ACC_END <= FREE['plus'], f'M4 accel terminal ends at u = {r1(M4_ACC_END)} <= {FREE["plus"]}: margin {r1(FREE["plus"] - M4_ACC_END)} m. NO entry taper is drawn: the lane goes on as a 5th (auxiliary) lane to the T21 exit (a 182.5 m entry taper would NOT fit)')
T21_EXIT = T21 - decel_len(VM, 60) - EXIT_TAPER
M4_GAP = T21_EXIT - M4_DESC_END
P(f'   aux lane: entry gore (ring level) u = {r1(M4_DESC_END)} to the T21 exit taper start u = {r1(T21_EXIT)} (T21 as it is now) = {r1(M4_GAP)} m; it runs over S3 (u {FREE["bridgeA"]} .. {FREE["bridgeB"]}), so S3 is WIDENED by one lane on the B outer side.')
chk('V2a', M4_GAP >= WEAVE_MIN, f'M4 aux lane {r1(M4_GAP)} m gore to gore (>= {WEAVE_MIN} min; {"below" if M4_GAP < WEAVE_DES else "above"} the {WEAVE_DES} m desirable)')
M3_CLIMB = Z3 / 0.044
M3_GORE = M3U1 - M3_CLIMB
M3_TAPER = M3_GORE - EXIT_TAPER
D35 = decel_len(VM, 35)
P(f'   M3: climbs {r1(Z3)} m at 4.4 % over {r1(M3_CLIMB)} m beside B (gore u = {r1(M3_GORE)}), exit taper {r1(EXIT_TAPER)} m before it (starts u = {r1(M3_TAPER)}); decel 100 -> 35 km/h needs {r1(D35)} m of the climb')
chk('V3', M3_CLIMB >= D35 and M3_TAPER > -FREE['minus'], f'M3 exit: the {r1(M3_CLIMB)} m climb carries the {r1(D35)} m decel; taper starts at u = {r1(M3_TAPER)} (minus side free {FREE["minus"]} m)')
chk('V4', M3_TAPER - (T20 + 190) > 0, f'M3 taper start (u {r1(M3_TAPER)}) is {r1(M3_TAPER - T20)} m from T20 (u {T20}); T20 B-side ramps are not designed yet and must keep clear')
G3D = 0.04
T_DESC = (Z3 - ARM_FALL * LANE_C) / (G3D + ARM_FALL)
P(f'   M3 after the arc: z = {r1(Z3)} m to the arc end, then down {G3D * 100:.0f} % beside the stem (the stem rises {ARM_FALL * 100:.1f} % away from the ring) and meets it after {r1(T_DESC)} m')
chk('V5', T_DESC <= 250, f'M3 lands {r1(T_DESC)} m from the ring: inside the straight arm (250 m)')
chk('V6', Z3 - Z4 >= CLEAR - 1e-9, f'M3 over M4 at the plan crossing: {r1(Z3 - Z4)} m >= {r1(CLEAR)} m (5.5 clearance + 1.5 slab)')
M1_ARC_R = 30.0
M1_JOIN = M1_ARC_R + LANE_C
join_sep = T_DESC + LANE_C - M1_JOIN
P(f'   M1 slip joins the stem outbound {r1(M1_JOIN)} m from the ring (arc R 30 m, ground); M3 lands {r1(T_DESC + LANE_C)} m from the ring.')
chk('J1', join_sep >= WEAVE_MIN, f'M1 and M3 join the stem outbound {r1(join_sep)} m apart (min {WEAVE_MIN}) - thin, lengthen the M3 descent if you want {WEAVE_DES}')
P(f'   NOTE: M3 passes OVER the M1 slip (at u = 20 the slip is at v = -34 on the ground, M3 is ~13 m above it): no clash, but the piers of M3 must stay outside the slip.')

# ---- 4. 8 x 8 lanes: ramp lanes ---------------------------------------------------------------------------------------------------------------------------
P('')
P('4. 8 LANE x 8 LANE: HOW MANY LANES DO THE RAMPS NEED (ASSUMED 50 / 50 split on the stem, 10 % of each ring direction turns into the stem; 1800 veh/h per lane)')
ring_dir = 120000 * K_PEAK * D_SPLIT
lanes = lambda f: max(1, math.ceil(f / CAP))
stem_each = ring_dir * 0.5
m13 = ring_dir * 0.1
P(f'   design demand 120 000 AADT: ring {round(ring_dir)} veh/h per direction (= 4 lanes at 100 %); M2 and M4 {round(stem_each)} veh/h -> {lanes(stem_each)} lanes each, M1 and M3 {round(m13)} veh/h -> {lanes(m13)} lane each')
RC2 = RING_HALF + W
RR2 = 2 * RC2
P(f'   a 2-lane M4 (deck {r1(2 * W + 1.8)} m wide) has its centreline {r1(RC2)} m from the ring: R = {r1(RR2)} m, which allows {r1(speed_of_r(RR2))} km/h (min R at 40 km/h = {r1(min_r(40))} m): the bigger deck gives a BETTER arc.')
chk('L1', RR2 >= min_r(40), f'2-lane M4 arc R {r1(RR2)} m >= {r1(min_r(40))} m: 40 km/h')
P('   Costs of 2-lane M4 / M2: B gets TWO extra lanes (5th and 6th) from M4 to the T21 exit and S3 is widened by 2 lanes on the B side (1 lane on the A side for M1); the length of M4 is the same, so it still fits. At 120 000 AADT the ring itself (4 lanes = 100 %) is the bigger question: that is the demand step of 3.13, still OPEN.')
chk('C1', True, 'no signal anywhere: ring A and B never stop; the "over capacity" FAIL of the ground T (Y 1.60) is gone')

# ---- 5. structures, ground, land ------------------------------------------------------------------------------------------------------------------------
def viaduct(z0, z1, length):
    f = lambda z: z + RING_ABOVE_GROUND - MAX_FILL
    a, b = f(z0), f(z1)
    if a >= 0 and b >= 0: return length
    if a < 0 and b < 0: return 0.0
    t = -a / (b - a) if a < 0 else a / (a - b)
    return length * (1 - t) if a < 0 else length * t
M4_LEN = (M4_GORE - LANE_C) + ARC + M4_DESC
M3_LEN = M3_CLIMB + ARC + T_DESC
M4_V = viaduct(M4_Z0, Z4, M4_GORE - LANE_C) + ARC + viaduct(Z4, 0, M4_DESC)
M3_V = viaduct(0, Z3, M3_CLIMB) + ARC + viaduct(Z3, 0, T_DESC)
P('')
P(f'5. STRUCTURES, GROUND, LAND (ASSUMED: ring surface {RING_ABOVE_GROUND} m above the ground, fill limit {MAX_FILL:.0f} m, the rest viaduct)')
P(f'   M4: ~{round(M4_V)} m viaduct of {round(M4_LEN)} m; M3: ~{round(M3_V)} m viaduct of {round(M3_LEN)} m (the rest embankment up to {MAX_FILL:.0f} m, more land and fill on the north side of the ring and the east side of the stem)')
P(f'   Ring bridge over A + median + B = {r1(2 * RING_HALF)} m wide, curved: M4 span ~{round(ARC)} m at z = 7, M3 ~{round(ARC)} m at z = 14. S3 rebuilt higher (only 1.9 m over the water) and wider.')
P(f'   Land: north side of the ring u {r1(M3_TAPER)} .. {r1(M4_ACC_END)} (~{round(M4_ACC_END - M3_TAPER)} m x 30 m) + the east side of the stem for {round(T_DESC + LANE_C)} m (M3 landing) + stem median 6 -> 12 m over 160 m (M4 start). Earthwork volumes NOT computed (needs the terrain, step RT-N-c).')

P('')
npass = sum(c['ok'] for c in checks)
P(f'RESULT: {npass} PASS, {len(checks) - npass} FAIL.')
P('OPEN: (1) M4 leaves the stem inbound carriageway on its RIGHT (median) side = a wrong-side exit in left-hand traffic; normal for a semi-direct ramp but it needs advance signs and its own lane (not the 4th lane shared with through traffic). (2) T21 exit on B must start at u = +450 or later, T20 B-side ramps must clear M3. (3) M1 / M3 join separation is only 165 m. (4) demand and 2-lane ramps (section 4). (5) terrain, piers, drainage not designed.')
P('NOT RUN: npm run build, tsc, the game, scripts/ringt-n-flyover.ts (needs src/, not in this zip). ASSUMED: ring 4.3 m over the ground, M4 leaves the stem 160 m out, M3 climb 4.4 %, M3 descent 4 %, 50 / 50 split, 10 % ring turn shares.')

# ---- picture --------------------------------------------------------------------------------------------------------------------------------------------------
def arc(c, r, a0, a1, n=48):
    t = np.radians(np.linspace(a0, a1, n)); return np.stack([c[0] + r * np.cos(t), c[1] + r * np.sin(t)], 1)
def seg(p0, p1, n=24):
    return np.stack([np.linspace(p0[0], p1[0], n), np.linspace(p0[1], p1[1], n)], 1)
def with_z(xy, z0, z1):
    return np.c_[xy, np.linspace(z0, z1, len(xy))]
def chain(parts):
    out = [parts[0]]
    for p in parts[1:]: out.append(p[1:])
    return np.vstack(out)

m4 = chain([
    with_z(seg((0, -M4_GORE), (0, -LANE_C)), M4_Z0, Z4),
    with_z(arc((M4UE, -LANE_C), RR, 180, 90), Z4, Z4),
    with_z(seg((M4UE, LANE_C), (M4_DESC_END, LANE_C), 40), Z4, 0),
    with_z(seg((M4_DESC_END, LANE_C), (M4_ACC_END, LANE_C), 20), 0, 0),
    with_z(seg((M4_ACC_END, LANE_C), (T21_EXIT, LANE_C), 20), 0, 0)])
m3 = chain([
    with_z(seg((M3_GORE, LANE_C), (M3U1, LANE_C), 40), 0, Z3),
    with_z(arc((M3U1, -LANE_C), RR, 90, 0), Z3, Z3),
    with_z(seg((M3UE, -LANE_C), (M3UE, -LANE_C - T_DESC), 40), Z3, Z3 - G3D * T_DESC)])
m1 = chain([with_z(seg((M1_JOIN + 60 + 15.8, -LANE_C), (STEM_KERB + M1_ARC_R, -LANE_C), 10), 0, 0),
            with_z(arc((STEM_KERB + M1_ARC_R, -LANE_C - M1_ARC_R), M1_ARC_R, 90, 180), 0, 0)])
cum = lambda a: np.r_[0, np.cumsum(np.hypot(np.diff(a[:, 0]), np.diff(a[:, 1])))]

fig = plt.figure(figsize=(17, 11.5))
gs = fig.add_gridspec(2, 2, height_ratios=[1.05, 1], hspace=0.28, wspace=0.12)
axp = fig.add_subplot(gs[0, :]); axz = fig.add_subplot(gs[1, 0]); axs = fig.add_subplot(gs[1, 1])
CM = 'viridis'
def ring_base(ax, u0, u1, v0, v1):
    ax.add_patch(plt.Rectangle((u0, -RING_HALF), u1 - u0, 2 * RING_HALF, color='#cfcfcf', zorder=1))
    ax.add_patch(plt.Rectangle((u0, -3), u1 - u0, 6, color='#a9c9a0', zorder=2))
    ax.add_patch(plt.Rectangle((-STEM_EDGE, v0), 2 * STEM_EDGE, -RING_HALF - v0, color='#cfcfcf', zorder=1))
    ax.add_patch(plt.Rectangle((-3, v0), 6, -RING_HALF - v0, color='#a9c9a0', zorder=2))
    ax.add_patch(plt.Rectangle((FREE['bridgeA'], -RING_HALF), FREE['bridgeB'] - FREE['bridgeA'], 2 * RING_HALF, color='#7da0d6', alpha=.6, zorder=3))
def draw(ax, a, lw):
    pts = a[:, :2].reshape(-1, 1, 2); sg = np.concatenate([pts[:-1], pts[1:]], 1)
    lc = LineCollection(sg, cmap=CM, norm=plt.Normalize(0, Z3), linewidths=lw, zorder=6); lc.set_array(a[:-1, 2]); ax.add_collection(lc); return lc
for ax, (u0, u1, v0, v1), lw in [(axp, (-470, 470, -235, 50), 4), (axz, (-70, 110, -75, 45), 7)]:
    ring_base(ax, u0, u1, v0, v1)
    lc = draw(ax, m4, lw); draw(ax, m3, lw); draw(ax, m1, lw * .8)
    ax.set_xlim(u0, u1); ax.set_ylim(v0, v1); ax.set_aspect('equal'); ax.grid(alpha=.25)
axp.set_title('RT-N flyover, plan (colour = height above the ring). Ring runs left-right, B (upper) flows right, A (lower) flows left, stem from the bottom. Left-hand traffic', fontsize=11)
axz.set_title('junction core at 1 : 1', fontsize=11)
for ax in (axp,):
    ax.annotate('M3  B -> stem (right), deck +14 m', (M3U1 - 250, LANE_C + 5), fontsize=9, color='#7a3b00', backgroundcolor='#ffffffcc')
    ax.annotate('M4  stem -> B (right), deck +7 m', (60, 28), fontsize=9, color='#7a3b00', backgroundcolor='#ffffffcc')
    ax.annotate('S3 (rebuilt, wider)', (FREE['bridgeA'] - 20, -RING_HALF - 12), fontsize=9, color='#264a8a')
    ax.annotate('T20', (T20 + 5, -RING_HALF - 12), fontsize=9, color='red'); ax.annotate('T21', (T21 - 40, -RING_HALF - 12), fontsize=9, color='red')
    ax.axvline(T20, color='red', lw=1); ax.axvline(T21, color='red', lw=1)
    ax.annotate('M3 lands on the stem\n%d m from the ring' % round(T_DESC + LANE_C), (25, -150), fontsize=9, color='#7a3b00', backgroundcolor='#ffffffcc')
axz.annotate('M1 slip (ground)', (45, -45), fontsize=9, color='#333'); axz.annotate('crossing of M3 / M4', (UX + 8, VX - 14), fontsize=9, backgroundcolor='#ffffffcc')
axz.plot([UX], [VX], 'o', color='red', zorder=8)
cb = fig.colorbar(lc, ax=axp, fraction=0.018, pad=0.01); cb.set_label('height above the ring (m)')
for a, n, c in [(m4, 'M4  stem -> B', '#d62728'), (m3, 'M3  B -> stem', '#1f77b4')]:
    s = cum(a); axs.plot(s, a[:, 2], lw=2.5, color=c, label=n)
axs.axhline(Z4, color='#d62728', ls=':', lw=1); axs.axhline(Z3, color='#1f77b4', ls=':', lw=1)
axs.set_title('profile along the ramps (z above the ring at the T)', fontsize=11)
axs.set_xlabel('distance along the ramp (m)'); axs.set_ylabel('z (m)'); axs.grid(alpha=.3); axs.legend(loc='upper left')
axs.annotate('clearance between decks 7.0 m', (60, (Z3 + Z4) / 2), fontsize=9)
fig.suptitle(f'RT-N flyover (8 x 8 lanes, 3-leg): {npass} PASS / {len(checks) - npass} FAIL.  SCHEMATIC of the proposal in the ring frame, not game geometry', fontsize=12)
fig.savefig(f'{OUT}/RINGT_N_f.png', dpi=110, bbox_inches='tight')

open(f'{OUT}/RINGT_N_f.txt', 'w').write('\n'.join(L) + '\n')
json.dump(dict(laneC=LANE_C, Rr=RR, arcLen=ARC, clear=CLEAR, zM3=Z3, zM4=Z4, cross=dict(u=UX, v=VX), free=FREE, T20=T20, T21=T21,
               m4=dict(gore=M4_GORE, z0=M4_Z0, desc=M4_DESC, descEnd=M4_DESC_END, accel=M4_ACC, accelEnd=M4_ACC_END, auxEnd=T21_EXIT),
               m3=dict(taperStart=M3_TAPER, gore=M3_GORE, climb=M3_CLIMB, tDesc=T_DESC, uStemOut=U_STEM_OUT),
               m1=dict(arcR=M1_ARC_R, join=M1_JOIN), checks=checks, passed=npass, failed=len(checks) - npass),
          open(f'{OUT}/RINGT_N_f.json', 'w'), indent=1)

# STEP RE-1: type options for RT-E (ring x J1-E). Numbers + picture, NO src change.
# Run:  python3 tools/rte-types.py docs      (needs docs/rte_site.json from scripts/rte-site-check.ts)
# Writes docs/RTE_TYPES.txt, docs/rte_types.json, docs/rte_types.png
# LAYOUT-LEVEL model (not the final geometry): every ramp is straight - spiral - arc - spiral - straight in the ring frame, the grade and
# the deck / fill / cut are measured on that layout. RE-3..RE-5 redraw the chosen type properly. Formulas of src/interchange/Standards.ts are
# ported here 1:1 (minRadius, decelLength, accelLength) and the numbers of src/roads/standards/Criteria.ts (DESIGN) are copied.
import json, sys, math
import numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt

D = sys.argv[1] if len(sys.argv) > 1 else 'docs'
S = json.load(open(f'{D}/rte_site.json'))
JX, JZ = S['J']; T = np.array(S['t']); LN = np.array(S['ln']); GRID = np.array(S['grid'])
RING = np.array([(a, b) for a, b, _ in S['prof']['ring']]); ARM = np.array([(a, b) for a, b, _, _ in S['prof']['arm']])
RAIL = np.array([(p[2], -p[3]) for p in S['railPts']])  # (u, v): u along the ring, v toward the stem (lateral left + = far side = -v)

# ---------- criteria (copied) ----------
EMAX = 0.08; F = [(20, .35), (30, .28), (40, .23), (50, .19), (60, .17), (70, .15), (80, .14), (100, .12), (120, .09)]
A_DEC, A_ACC, WEAVE_MIN, WEAVE_DES, GMAX = 2.5, 1.2, 150, 300, 0.05
LANE, HW, MEDH = 3.65, 22.1, 3.0
CLR, DECK = 5.5, 1.4; RISE = 7.8  # RISE = 7.8 m total over the road (section 24 / 21.47); 5.5 + 1.4 = 6.9 is the Levels.ts default; 7.8 kept (conservative)
STEP_UP = CLR + DECK  # 6.9: second level over the first (X crossing)
EXIT_TAPER, ENTRY_TAPER = 25, 50  # 1:n
RW = 2 * LANE + 2 * 1.2  # ramp width 9.7 (2 lanes + 2 shoulders 1.2, as RoadAdapter shoulder)
PIER_H = 3.0; FILL_SL, CUT_SL, MAXCUT, MAXFILL = 3, 2, 12, 7
RAIL_CLEAR = 30.0  # PROVISIONAL horizontal clearance ramp - rail (ASSUMED, RE-0 said it is not fixed, ASK)
RING_BR_END = -776  # ring bridge on R- ends at u = -776 (the T side)
ARM_VIA = (160, 271); ARM_VIA2 = (391, 694)  # arm structures (viaducts), distance from the T (RE-0)
STEM_V = 60  # ASSUMED speed of the stem at the junction (km/h), the arm speed was not read in RE-0
VH, VR_SEMI, VR_LOOP = 100, 50, 40

def fr(V):
    for (a, fa), (b, fb) in zip(F, F[1:]):
        if V <= a: return fa
        if V <= b: return fa + (fb - fa) * (V - a) / (b - a)
    return F[-1][1]
def minR(V): return V * V / (127 * (EMAX + fr(V)))
def sc_len(Va, Vb, a): return abs((Va / 3.6) ** 2 - (Vb / 3.6) ** 2) / (2 * a)
def decel(Vh, Vr): return sc_len(Vh, Vr, A_DEC)
def accel(Vh, Vr): return sc_len(Vr, .85 * Vh, A_ACC)
EXIT_LEN = decel(VH, VR_SEMI) + EXIT_TAPER * LANE      # decel lane + taper
ENTRY_LEN = accel(VH, VR_SEMI) + ENTRY_TAPER * LANE    # accel lane + taper

def yR(u): return float(np.interp(u, RING[:, 0], RING[:, 1]))
def yS(d): return float(np.interp(d, ARM[:, 0], ARM[:, 1]))
def world(u, v): return np.array([JX, JZ]) + u * T - v * LN
def ground(u, v):
    x, z = world(u, v); fx = (x - (JX - 700)) / 20; fz = (z - (JZ - 700)) / 20
    i, j = int(np.clip(math.floor(fz), 0, 69)), int(np.clip(math.floor(fx), 0, 69)); a, b = np.clip(fz - i, 0, 1), np.clip(fx - j, 0, 1)
    return float(GRID[i][j] * (1 - a) * (1 - b) + GRID[i][j + 1] * (1 - a) * b + GRID[i + 1][j] * a * (1 - b) + GRID[i + 1][j + 1] * a * b)

# ---------- path builder (straight / spiral-arc-spiral), (u, v) math plane, heading in deg: 0 = +u, 90 = +v.
# PHYSICAL right turn (left-hand traffic, stem on the right of +u) = +angle in this plane, physical left = -angle.
def trace(u, v, h, items, ds=2.0):
    P = [(u, v, h, 0.0)]; s = 0.0
    def adv(L, k0, k1):
        nonlocal u, v, h, s
        n = max(1, int(round(L / ds))); d = L / n
        for i in range(n):
            k = k0 + (k1 - k0) * (i + .5) / n; h += math.degrees(k * d); u += d * math.cos(math.radians(h)); v += d * math.sin(math.radians(h)); s += d; P.append((u, v, h, s))
    for it in items:
        if it[0] == 'S': adv(it[1], 0, 0)
        else:
            _, R, ang, sg, V = it; Ls = min(((V / 3.6) ** 3) / (0.6 * R), R * math.radians(abs(ang)) / 2); la = abs(ang) - math.degrees(Ls / R)  # each spiral turns Ls / (2 R) rad
            adv(Ls, 0, sg / R); adv(R * math.radians(la), sg / R, sg / R); adv(Ls, sg / R, 0)
    return np.array(P)

def seg_hit(P, Q):
    """first plan intersection of two polylines (u, v)"""
    for i in range(len(P) - 1):
        a, b = P[i, :2], P[i + 1, :2]
        for j in range(0, len(Q) - 1):
            c, d = Q[j, :2], Q[j + 1, :2]; r, q = b - a, d - c; den = r[0] * q[1] - r[1] * q[0]
            if abs(den) < 1e-9: continue
            w = c - a; t_ = (w[0] * q[1] - w[1] * q[0]) / den; s_ = (w[0] * r[1] - w[1] * r[0]) / den
            if 0 <= t_ <= 1 and 0 <= s_ <= 1: return tuple(a + t_ * r)
    return None

def min_dist(P, Q, skip=None):
    A = P[::3, :2]; B = Q[::3, :2]; dd = np.sqrt(((A[:, None, :] - B[None, :, :]) ** 2).sum(-1)); return float(dd.min())

def rail_dist(P):
    rp = np.array([world(u, v) for u, v in RAIL]); pts = np.array([world(u, v) for u, v, *_ in P[::4]])
    return float(np.sqrt(((pts[:, None, :] - rp[None, :, :]) ** 2).sum(-1)).min())

# ---------- vertical + quantities of one ramp ----------
def measure(P, y0, yc, deck_mask, y1, name):
    """P: (u, v, h, s). piecewise linear profile y0 -> yc (first deck point) , yc (deck), yc -> y1 (last deck point -> end).
    returns dict with grades, deck / fill / cut quantities, cut / fill max, land."""
    s = P[:, 3]; L = s[-1]; idx = np.where(deck_mask)[0]
    i1, i2 = idx[0], idx[-1]; s1, s2 = s[i1], s[i2]
    g1 = (yc - y0) / max(s1, 1e-6); g2 = (yc - y1) / max(L - s2, 1e-6)
    y = np.where(s <= s1, y0 + (yc - y0) * s / max(s1, 1e-6), np.where(s <= s2, yc, yc + (y1 - yc) * (s - s2) / max(L - s2, 1e-6)))
    gnd = np.array([ground(u, v) for u, v, *_ in P]); h = y - gnd
    ds = 2.0; deck = fill = cut = 0.0; mxc = mxf = 0.0; land = 0.0
    for k in range(len(P)):
        u, v = P[k, 0], P[k, 1]; inring = abs(v) <= HW + 0.5 and not (u < -HW and v > 0) ; instem = abs(u) <= HW + 6 and v > HW
        if deck_mask[k] or h[k] > PIER_H: deck += ds * RW
        elif h[k] > 0: fill += ds * h[k] * (RW + FILL_SL * h[k]); mxf = max(mxf, h[k])
        else: cut += ds * (-h[k]) * (RW + CUT_SL * -h[k]); mxc = max(mxc, -h[k])
        if not instem and not (abs(v) <= HW + 0.5 and deck_mask[k]):
            w = RW + 6 + (2 * FILL_SL * h[k] if 0 < h[k] <= PIER_H else 2 * CUT_SL * -h[k] if h[k] < 0 else 0); land += ds * w
    return dict(name=name, L=L, g_up=g1, g_down=g2, yc=yc, y0=y0, y1=y1, deck_m2=deck, fill_m3=fill, cut_m3=cut, max_cut=mxc, max_fill=mxf, land_m2=land,
                rail_m=rail_dist(P), minu=float(P[:, 0].min()), maxu=float(P[:, 0].max()), s_deck=(float(s1), float(s2)))

def deck_over_ring(P, va, vb): return (P[:, 1] >= va) & (P[:, 1] <= vb)

# ======================================================================================================================
# the user's frame facts: stem inbound carriageway (heading -v, keep left) is on the R- side (u < 0), outbound on the R+ side (u > 0)
U_IN, U_OUT = -14.0, 14.0
V_OUT = -(HW + 0.5 + RW / 2 + 1.0)  # ramp centre line beside the far carriageway (outside), about -32.4
R_SEMI = 80.0  # >= minRadius(50) = 72.9
R_LOOP = 50.0  # >= minRadius(40) = 40.6

def arm_gore_solver(build, yc, need_down):
    """scan the stem distance d (gore of M4 / merge of M3) until the 5 % grade condition is met. build(d) -> P"""
    for d in range(22, 700, 1):
        P = build(d); mk = build.mask(P); idx = np.where(mk)[0]
        if len(idx) == 0: continue
        s1 = P[idx[0], 3]; y0 = yS(d)
        if (yc - y0) / max(s1, 1e-6) <= GMAX: return d, P
    return None, None

def make_M4(v_land, ring_mask, kind):  # S -> B, starts on the stem inbound axis, goes down (-v), turns phys-right (+angle) onto +u
    def build(d):
        vt = v_land + R_SEMI
        return trace(U_IN, d, -90, [('S', max(d - vt, 0.5)), ('A', R_SEMI, 90, +1, VR_SEMI), ('S', ENTRY_LEN + 10)])
    build.mask = ring_mask; return build

def make_M3_end(v_land, ring_mask, T3, u_end=U_OUT):  # B -> S : exit on the outside (or median), straight T3, phys-right 90, then straight +v to the stem
    def build(dn):
        vt = v_land + R_SEMI
        return trace(u_end - R_SEMI - T3, v_land, 0, [('S', T3), ('A', R_SEMI, 90, +1, VR_SEMI), ('S', max(dn - vt, 0.5))])
    build.mask = ring_mask; return build

def descent_dn(P, mk, yc, after_heading=90.0):
    """stem distance dn where a 5 % descent from the deck end meets the stem level (path = long straight +v after the arc / loop)"""
    idx = np.where(mk)[0]; s2 = P[idx[-1], 3]
    for dn in range(24, 699):
        k = np.where((P[:, 1] >= dn) & (P[:, 0] > -1e9))[0]
        k = [i for i in k if i > idx[-1]]
        if not k: break
        sa = P[k[0], 3]
        if (yc - yS(dn)) / max(sa - s2, 1e-6) <= GMAX: return dn
    return 699

def solve_M3(v_land, va, vb, yc, y_start):
    """M3: start on B at ring level, climb to yc before the deck, descend after. returns T3, dn, P"""
    best = None
    for T3 in range(0, 700, 5):
        P = trace(U_OUT - R_SEMI - T3, v_land, 0, [('S', T3), ('A', R_SEMI, 90, +1, VR_SEMI), ('S', 700)])
        mk = deck_over_ring(P, va, vb); idx = np.where(mk)[0]; s1 = P[idx[0], 3]; y0 = yR(P[0, 0])
        if (yc - y0) / s1 <= GMAX: best = (T3, P, mk, idx); break
    T3, P, mk, idx = best
    dn = descent_dn(P, mk, yc)
    P = trace(U_OUT - R_SEMI - T3, v_land, 0, [('S', T3), ('A', R_SEMI, 90, +1, VR_SEMI), ('S', max(dn - (v_land + R_SEMI), 0.5))])
    return T3, dn, P

def solve_M4(v_land, va, vb, yc):
    for d in range(24, 700):
        P = trace(U_IN, d, -90, [('S', max(d - (v_land + R_SEMI), 0.5)), ('A', R_SEMI, 90, +1, VR_SEMI), ('S', ENTRY_LEN + 10)])
        mk = deck_over_ring(P, va, vb); idx = np.where(mk)[0]; s1 = P[idx[0], 3]
        if s1 < 1: continue
        if (yc - yS(d)) / s1 <= GMAX: return d, P
    return None, None

def eval_pair(P3, P4, yc3, yc4, va, vb, dn3, dg4, mask3, mask4):
    m3 = measure(P3, yR(P3[0, 0]), yc3, mask3, yS(dn3), 'M3 B->S'); m4 = measure(P4, yS(dg4), yc4, mask4, yR(P4[-1, 0]), 'M4 S->B')
    return m3, m4

def stem_flags(dn3, dg4):
    """arm viaduct conflicts. M4 diverge from the stem inbound: gore at dg4, the exit lane + taper start upstream (larger d): length decel(STEM_V -> ramp V) + taper.
    M3 merge into the stem outbound: nose at dn3, the entry lane + taper run on to larger d: length accel + taper (STEM_V)."""
    ex = decel(STEM_V, VR_SEMI) + EXIT_TAPER * LANE; en = accel(STEM_V, VR_SEMI) + ENTRY_TAPER * LANE
    def ov(a, b): return sum(max(0.0, min(b, hi) - max(a, lo)) for lo, hi in (ARM_VIA, ARM_VIA2))
    f = []
    o4 = ov(dg4, dg4 + ex); f.append(('M4 diverge on the stem d %d..%d (exit lane + taper %.0f m): overlap with the arm viaducts %d..%d / %d..%d = %.0f m' % (dg4, dg4 + ex, ex, *ARM_VIA, *ARM_VIA2, o4), o4 == 0))
    o3 = ov(dn3, dn3 + en); f.append(('M3 merge on the stem d %d..%d (entry taper %.0f m): overlap with the arm viaducts = %.0f m' % (dn3, dn3 + en, en, o3), o3 == 0))
    return f

OPTS = {}; LOG = []
def P_(s=''): LOG.append(s); print(s)

# ---------------- OPT-1 : OUTSIDE DIRECTIONAL (both ramps semi-direct, far side, R- exit / R+ entry, 3 levels) ----------------
def opt_outside():
    va, vb = -HW, HW
    res = {}
    for upper in ('M4', 'M3'):
        yc_lo = yR(0) + RISE; yc_up = yc_lo + STEP_UP
        yc3 = yc_up if upper == 'M3' else yc_lo; yc4 = yc_up if upper == 'M4' else yc_lo
        T3, dn3, P3 = solve_M3(V_OUT, va, vb, yc3, None)
        dg4, P4 = solve_M4(V_OUT, va, vb, yc4)
        if dg4 is None: res[upper] = None; continue
        mk3 = deck_over_ring(P3, va, vb); mk4 = deck_over_ring(P4, va, vb)
        m3, m4 = eval_pair(P3, P4, yc3, yc4, va, vb, dn3, dg4, mk3, mk4)
        res[upper] = dict(P3=P3, P4=P4, m3=m3, m4=m4, T3=T3, dn3=dn3, dg4=dg4, yc3=yc3, yc4=yc4)
    return res

# ---------------- OPT-2 : MEDIAN DIRECTIONAL (both ramps in the widened median, flyover over A only, 3 levels) ----------------
def widening_variants(u0, u1, shift):
    out = {}
    for name, sa, sb in (('A out (stem side)', shift, 0), ('B out (far side)', 0, shift), ('both %.0f + %.0f' % (shift / 2, shift / 2), shift / 2, shift / 2)):
        cut = fill = 0.0; mxc = mxf = 0.0
        for u in np.arange(u0, u1, 10.0):
            for side, sh in ((1, sa), (-1, sb)):
                if sh == 0: continue
                v = side * (HW + sh); hh = yR(u) - ground(u, v)
                if hh > 0: fill += 10 * sh * hh; mxf = max(mxf, hh)
                else: cut += 10 * sh * -hh; mxc = max(mxc, -hh)
        out[name] = dict(cut_m3=cut, fill_m3=fill, max_cut=mxc, max_fill=mxf, sa=sa, sb=sb)
    return out

def opt_median():
    MED_W = 14.0; shift = MED_W - 2 * MEDH
    # the ramp centre line in the widened median: v_m depends on the variant; the straight part is in the median, the deck over A only
    res = {}
    for upper in ('M4', 'M3'):
        yc_lo = yR(0) + RISE; yc_up = yc_lo + STEP_UP
        yc3 = yc_up if upper == 'M3' else yc_lo; yc4 = yc_up if upper == 'M4' else yc_lo
        for vname, sa, sb in (('B out', 0, shift),):
            a_in = MEDH + sa; b_in = -(MEDH + sb); vm = (a_in + b_in) / 2.0
            va, vb = a_in, HW + sa
            T3, dn3, P3 = solve_M3(vm, va, vb, yc3, None)
            dg4, P4 = solve_M4(vm, va, vb, yc4)
            if dg4 is None: res[upper] = None; continue
            mk3 = deck_over_ring(P3, va, vb); mk4 = deck_over_ring(P4, va, vb)
            m3, m4 = eval_pair(P3, P4, yc3, yc4, va, vb, dn3, dg4, mk3, mk4)
            res[upper] = dict(P3=P3, P4=P4, m3=m3, m4=m4, T3=T3, dn3=dn3, dg4=dg4, yc3=yc3, yc4=yc4, vm=vm, shift=shift, MED_W=MED_W, a_in=a_in, b_in=b_in)
    return res

# ---------------- OPT-3 : TRUMPET, loop outside on R+ / FAR (M3 = 270 deg loop, M4 semi-direct) ----------------
def opt_trumpet():
    va, vb = -HW, HW
    # M3 loop: exits B at the gore u_g, goes straight (decel lane before), loop phys-left 270 deg (-270), then crosses the ring heading +v at u = u_g - R_LOOP.
    # crossing at the stem outbound axis U_OUT -> u_g = U_OUT + R_LOOP
    u_g = U_OUT + R_LOOP
    P3 = trace(u_g, V_OUT, 0, [('A', R_LOOP, 270, -1, VR_LOOP), ('S', 700)])
    # the loop ends heading +v at u = u_g - R_LOOP, v = V_OUT + R_LOOP; check the loop start v: the loop leaves the outside heading +u.
    yc3 = yR(0) + RISE
    mk = deck_over_ring(P3, va, vb); dn = descent_dn(P3, mk, yc3)
    P3 = trace(u_g, V_OUT, 0, [('A', R_LOOP, 270, -1, VR_LOOP), ('S', max(dn - (V_OUT - R_LOOP), 0.5))])
    mk3 = deck_over_ring(P3, va, vb)
    dg4, P4 = solve_M4(V_OUT, va, vb, yc3)
    mk4 = deck_over_ring(P4, va, vb)
    m3, m4 = eval_pair(P3, P4, yc3, yc3, va, vb, dn, dg4, mk3, mk4)
    return dict(P3=P3, P4=P4, m3=m3, m4=m4, dn3=dn, dg4=dg4, yc3=yc3, yc4=yc3, u_g=u_g)

# ======================================================================================================================
def summarise(tag, P3, P4, m3, m4, dn3, dg4, extra_stem_flags=True, medians=None):
    X = seg_hit(P3, P4); gap = min_dist(P3[P3[:, 1] < HW], P4[P4[:, 1] < HW]) if True else 0
    tot = dict(deck_m2=m3['deck_m2'] + m4['deck_m2'], fill_m3=m3['fill_m3'] + m4['fill_m3'], cut_m3=m3['cut_m3'] + m4['cut_m3'], land_m2=m3['land_m2'] + m4['land_m2'],
               len_m=m3['L'] + m4['L'], max_cut=max(m3['max_cut'], m4['max_cut']), max_fill=max(m3['max_fill'], m4['max_fill']), rail_m=min(m3['rail_m'], m4['rail_m']),
               ring_u_min=min(m3['minu'], m4['minu']), ring_u_max=max(m3['maxu'], m4['maxu']))
    return X, tot

def ring_extent(P3, P4, tag):
    """ring stretch used on the far side / median: M3 decel start (gore - EXIT_LEN) .. M4 merge end (landing + ENTRY_LEN)"""
    g3 = P3[0, 0]; land4 = P4[-1, 0] - (ENTRY_LEN + 10)
    return g3 - EXIT_LEN, land4

ALL = {}
def report_option(tag, title, data, extra=None):
    P3, P4, m3, m4 = data['P3'], data['P4'], data['m3'], data['m4']; dn3, dg4 = data['dn3'], data['dg4']
    X, tot = summarise(tag, P3, P4, m3, m4, dn3, dg4)
    u_lo, u_hi = ring_extent(P3, P4, tag)
    P_(f'--- {tag}  {title}')
    for m in (m3, m4):
        P_(f"  {m['name']}: length {m['L']:.0f} m | deck level {m['yc']:.1f} m (ring {yR(0):.1f}) | grade up {m['g_up']*100:.1f} % down {m['g_down']*100:.1f} % | deck {m['deck_m2']:.0f} m2 fill {m['fill_m3']:.0f} m3 cut {m['cut_m3']:.0f} m3 | max cut {m['max_cut']:.1f} max fill {m['max_fill']:.1f} | land {m['land_m2']/1e4:.2f} ha | rail {m['rail_m']:.0f} m")
    P_(f"  stem: M4 gore at d = {dg4} m (level {yS(dg4):.1f}), M3 merge nose at d = {dn3} m (level {yS(dn3):.1f})")
    P_(f"  ring stretch used (decel start of M3 .. end of M4 merge): u {u_lo:.0f} .. {u_hi + ENTRY_LEN:.0f} m")
    P_(f"  plan crossing M3 x M4: {'at (%.0f, %.0f)' % X if X else 'none'}")
    chk = []
    chk.append(('grade M3 / M4 <= 5 % (up and down)', all(abs(m['g_up']) <= GMAX + 1e-3 and abs(m['g_down']) <= GMAX + 1e-3 for m in (m3, m4)), 'M3 %.1f / %.1f %%, M4 %.1f / %.1f %%' % (m3['g_up'] * 100, m3['g_down'] * 100, m4['g_up'] * 100, m4['g_down'] * 100)))
    for txt, ok in stem_flags(dn3, dg4): chk.append((txt, ok, ''))
    chk.append(('cut <= 12 m and fill <= 7 m (ramps)', tot['max_cut'] <= MAXCUT and tot['max_fill'] <= MAXFILL, 'cut %.1f fill %.1f' % (tot['max_cut'], tot['max_fill'])))
    chk.append((f'rail >= {RAIL_CLEAR:.0f} m from every ramp point (ASSUMED value)', tot['rail_m'] >= RAIL_CLEAR, '%.0f m' % tot['rail_m']))
    chk.append(('ring stretch stays east of the ring bridge (u > %d)' % RING_BR_END, u_lo > RING_BR_END, 'start u %.0f' % u_lo))
    if X: chk.append(('plan crossing M3 x M4 solved with a 2nd level (+%.1f m)' % STEP_UP, True, 'upper deck %.1f m' % max(data['yc3'], data['yc4'])))
    for txt, ok, note in chk: P_(f"  {'PASS' if ok else 'FAIL'}  {txt}  {note}")
    return dict(tot=tot, X=X, chk=chk, u_lo=u_lo, u_hi=u_hi + ENTRY_LEN)

P_('RTE TYPE OPTIONS (RE-1)  ring x J1-E, layout-level numbers (NOT the final geometry)')
P_(f'Frame: u along the ring (+ = R+ = station rises), v toward the stem. Ring half width {HW}, median {2*MEDH} m, ring level at the T {yR(0):.2f} m, arm level at the T {yS(0):.2f} m.')
P_(f'Criteria used: ramp V {VR_SEMI} km/h R {R_SEMI:.0f} m (min {minR(VR_SEMI):.1f}), loop V {VR_LOOP} km/h R {R_LOOP:.0f} m (min {minR(VR_LOOP):.1f}), grade {GMAX*100:.0f} %, over the road {RISE} m (5.5 + deck + girder), 2nd level +{STEP_UP} m, ramp {RW:.1f} m wide (2 lanes + 2 x 1.2 m)')
P_(f'Speed change: exit lane {decel(VH, VR_SEMI):.0f} m + taper {EXIT_TAPER*LANE:.0f} m = {EXIT_LEN:.0f} m; entry lane {accel(VH, VR_SEMI):.0f} m + taper {ENTRY_TAPER*LANE:.0f} m = {ENTRY_LEN:.0f} m; weave {WEAVE_MIN} m min / {WEAVE_DES} m desirable (Standards.ts)')
P_('Movements: A->S (left slip) and S->A (left slip) are the SAME in all options (ground slips at the stem corners, RE-3). The options differ for the two RIGHT turns M3 (B -> S) and M4 (S -> B), which cross ring direction A.')
P_('')
R1 = opt_outside(); R2 = opt_median(); R3 = opt_trumpet()

def pick(res):
    cands = [(k, v) for k, v in res.items() if v]
    def score(v): return (abs(v['dn3'] - 119) + abs(v['dg4'] - 119))  # prefer the ramp that stays nearer the ring
    return min(cands, key=lambda kv: score(kv[1])) if cands else (None, None)

out = {}
for tag, title, res in (('OPT-1', 'OUTSIDE DIRECTIONAL T: both right turns semi-direct on the FAR side (M3 exits R- outside, M4 enters R+ outside), 2 flyovers X-crossing = 3 levels', R1),
                        ('OPT-2', 'MEDIAN DIRECTIONAL T: both right turns in the WIDENED median, flyover over A only (right-side exit / entry), 3 levels', R2)):
    for upper in ('M4', 'M3'):
        if res[upper]:
            P_(f'[{tag} / upper ramp = {upper}]')
            out[(tag, upper)] = report_option(f'{tag}-{upper}', title, res[upper]); P_('')
        else: P_(f'[{tag} / upper ramp = {upper}] no solution within 700 m of the stem'); P_('')
out[('OPT-3', '-')] = report_option('OPT-3', 'TRUMPET with the 270 deg LOOP OUTSIDE on R+ / FAR (M3 loop, M4 semi-direct), classic 2-level crossing', R3); P_('')
# trumpet extra checks
P3, P4 = R3['P3'], R3['P4']; X3 = seg_hit(P3, P4)
g3 = P3[0, 0]; land4 = P4[-1, 0] - (ENTRY_LEN + 10); weave_len = (g3 - EXIT_LEN) - (land4 + ENTRY_LEN)
P_(f"OPT-3 along B: M4 lands at u {land4:.0f}, its merge ends at u {land4 + ENTRY_LEN:.0f}; M3 gore at u {g3:.0f}, its taper / exit lane starts at u {g3 - EXIT_LEN:.0f}; weave length = {weave_len:.0f} m (need >= {WEAVE_MIN}) -> {'PASS' if weave_len >= WEAVE_MIN else 'FAIL'}")
P_(f"OPT-3 distance M3 loop to M4 landing lane: {min_dist(P3[P3[:, 1] < 0], P4[P4[:, 1] < 0]):.1f} m (ramp width {RW:.1f} m, need >= {RW + 4:.1f}) -> {'PASS' if min_dist(P3[P3[:, 1] < 0], P4[P4[:, 1] < 0]) >= RW + 4 else 'FAIL'}")
w_need = (g3 - EXIT_LEN) - land4 ; u_trumpet_gore_min = land4 + ENTRY_LEN + WEAVE_MIN + EXIT_LEN
P_(f"OPT-3 to meet the weave rule the M3 gore must move to u >= {u_trumpet_gore_min:.0f} (the loop crossing then at u {u_trumpet_gore_min - R_LOOP:.0f}, {u_trumpet_gore_min - R_LOOP - U_OUT:.0f} m off the stem axis; the rail crosses the ring at u +481)")
P_('')

# ---- widening numbers for OPT-2 (median route) ----
best = None
for upper in ('M4', 'M3'):
    if R2[upper]: 
        best = R2[upper]; break
if best:
    ext = out[('OPT-2', 'M4' if R2['M4'] else 'M3')]
    shift = best['shift']; u0, u1 = ext['u_lo'] - 2 * math.sqrt(shift * 1500), ext['u_hi'] + 2 * math.sqrt(shift * 1500)
    wv = widening_variants(u0, u1, shift)
    P_(f'OPT-2 median widening: median {2*MEDH:.0f} m -> {best["MED_W"]:.0f} m (+{shift:.0f} m) over the ramp stretch u {ext["u_lo"]:.0f} .. {ext["u_hi"]:.0f}; shift tapers 2 x {2*math.sqrt(shift*1500):.0f} m (reverse curves R 1500 m); total widened length {u1-u0:.0f} m (u {u0:.0f} .. {u1:.0f})')
    for k, v in wv.items(): P_(f"  widening variant {k}: cut {v['cut_m3']:.0f} m3 (max {v['max_cut']:.1f} m), fill {v['fill_m3']:.0f} m3 (max {v['max_fill']:.1f} m)  {'PASS' if v['max_cut'] <= MAXCUT and v['max_fill'] <= MAXFILL else 'FAIL'} (cut 12 / fill 7)")
    P_(f"  OPT-2 ring bridge (R- side) ends at u {RING_BR_END}: the widening starts at u {u0:.0f} -> {'PASS' if u0 > RING_BR_END else 'FAIL'};  rail crossing the ring at u +481: the widening ends at u {u1:.0f} -> {'PASS' if u1 < 481 - 40 else 'FAIL (the rail bridge over the ring is inside or close to the widened stretch)'}")
    P_('  U-turn openings of the ring median (UTurns.ts / MedianPlan.ts) inside the stretch: NOT checked (need the table), they would have to be closed or moved.')
    OPT2_W = wv
    u0_, u1_ = u0, u1
P_('')

# ---- UNDER variant (ring on a new bridge over the ramps): only the stem side numbers, to show why OVER is taken ----
for lab, yc in (('OVER the ring (ramp level ring + %.1f m)' % RISE, yR(0) + RISE), ('UNDER the ring (ramp level ring - %.1f m, NEW ring bridge, ring structure = user word)' % RISE, yR(0) - RISE)):
    for d in range(22, 700):
        path = max(d - 22, 1)  # straight run from the gore to the ring edge (best case, no sideways run)
        if abs(yc - yS(d)) / path <= GMAX: break
    P_(f'M4 gore on the stem, {lab}: first possible gore at d = {d} m (stem level {yS(d):.1f} m); arm viaduct {ARM_VIA[0]}..{ARM_VIA[1]} m')

for rise in (7.8, 6.9):
    yc = yR(0) + rise
    for d in range(24, 700):
        P = trace(U_IN, d, -90, [('S', max(d - (V_OUT + R_SEMI), 0.5)), ('A', R_SEMI, 90, +1, VR_SEMI), ('S', 20)]); mk = deck_over_ring(P, -HW, HW); idx = np.where(mk)[0]
        if len(idx) and P[idx[0], 3] > 1 and (yc - yS(d)) / P[idx[0], 3] <= GMAX: break
    P_(f'sensitivity: rise over the ring {rise} m (lower level), M4 gore on the stem at d = {d} m')

# ---- SUMMARY TABLE + recommendation ----
P_('')
P_('SUMMARY (layout-level, both ramps together; deck = bridge m2 (higher than 3 m over ground or over a road), fill / cut = embankment / trench m3 of the ramps only)')
P_('| option | upper ramp | deck m2 | fill m3 | cut m3 | land ha | ramp length m | ring stretch u (m) | ring change | FAIL lines |')
P_('|---|---|---|---|---|---|---|---|---|---|')
def row(tag, key, ring_change, extra_fail=0):
    v = out[key]; t = v['tot']; nf = sum(1 for _, ok, _ in v['chk'] if not ok) + extra_fail
    P_(f"| {tag} | {key[1]} | {t['deck_m2']:.0f} | {t['fill_m3']:.0f} | {t['cut_m3']:.0f} | {t['land_m2']/1e4:.2f} | {t['len_m']:.0f} | {v['u_lo']:.0f} .. {v['u_hi']:.0f} | {ring_change} | {nf} |")
row('OPT-1 outside directional', ('OPT-1', 'M4'), 'none (ring untouched)')
row('OPT-1 outside directional', ('OPT-1', 'M3'), 'none (ring untouched)')
wv_best = min(OPT2_W.values(), key=lambda v: v['cut_m3'] + v['fill_m3'])
row('OPT-2 median directional', ('OPT-2', 'M4'), 'median 6 -> 14 m over about %.0f m, earthwork %.0f m3 (best variant), cut / fill limits FAIL' % (u1 - u0, wv_best['cut_m3'] + wv_best['fill_m3']), 2)
row('OPT-2 median directional', ('OPT-2', 'M3'), 'same as above', 2)
row('OPT-3 trumpet (loop outside)', ('OPT-3', '-'), 'none', 2)
P_('(OPT-2 extra FAIL lines: widening cut / fill limit, rail near the widened stretch. OPT-3 extra FAIL lines: weave length, loop / M4 overlap.)')
P_('')
P_('SHARED BY EVERY OPTION (not a type difference, a site fact):')
P_(f'  S1  The stem is low near the ring (level {yS(0):.1f} m at the T, +2.3 % away from it) and the ring crossing needs {yR(0)+RISE:.1f} m (ring + {RISE} m). With the 5 % limit the first possible M4 gore on the stem is d = 123 m, and the exit / entry lanes then run over the arm viaduct (160..271 m) and further. All options FAIL this line. It is a decision for the user (D1 below).')
P_(f'  S2  Every right-turn pair makes an X in plan (M3 goes far side R- -> stem R+, M4 goes stem R- -> far side R+), so one ramp must be a SECOND level, +{STEP_UP} m over the first: upper deck {yR(0)+RISE+STEP_UP:.1f} m = {RISE+STEP_UP:.1f} m over the ring. Only the trumpet avoids the X, and the trumpet fails on length (weave) and overlap.')
P_('  S3  UNDER the ring instead of OVER: first possible M4 gore at d = 373 m (worse) and a new ring bridge = ring structure change (user word). OVER is taken.')
P_('')
P_('RECOMMENDATION (my pick, the engineer): OPT-1 OUTSIDE DIRECTIONAL T, both right turns as semi-direct flyovers on the FAR (outside) side.')
P_('  Why: (1) the ring carriageways, median and ring profile stay untouched (H4 outside first, H2 profile fixed); OPT-2 needs about 1.2 km of median widening with about 32-33 thousand m3 earthwork (all three shift variants) that breaks the 12 m / 7 m limits, wrong-side (right-hand) exits and entries, and ends past the rail crossing; (2) the trumpet has the smallest deck (6.0 thousand m2) but it cannot be laid out: the weave between the M4 entry and the M3 exit comes out at -574 m (need 150 m) and the loop overlaps the M4 landing (1.4 m apart); to repair it the M3 gore must move to u 788 or more, but the rail crosses the ring at u +481; (3) deck m2 of OPT-1 and OPT-2 are about the same (7.2-7.8 thousand m2), so the median route buys nothing; (4) the outside stretch u -343 .. 431 is on land with cut / fill under 5 m, no water, no building, the rail at least 54 m away (the 30 m is my ASSUMED value).')
P_('  Weak points of OPT-1 (said plainly): the upper ramp is 14.7 m over the ring; M3 starts on the R- side where the ring climbs 4 % into the hill (the far side is cut up to 24 m at 80-600 m out, but the ramp stays within 30-40 m of the ring and its own cut is under 5 m in this layout: NOT yet checked with the final ground); the rail leaves only 431 -> 481 = 50 m between the end of the M4 merge lane and the rail crossing of the ring.')
P_('  Which ramp is the upper one (M4 or M3) is left to RE-2 (vertical plan): M3-upper has less deck (7.4 vs 7.8 thousand m2) and less stem overlap but about 4 times more cut and 95 m more of the R- side.')
P_('')
P_('DECISIONS FOR THE USER (each has my default, work does not stop):')
P_('  D1  Stem: the ramp lanes need the arm at d about 120 .. 320 m, the arm viaduct is 160..271 m. DEFAULT: widen the arm viaduct there by one ramp lane on each side (arm STRUCTURE change, needs your word; the arm profile stays). Other way: no ramp on the stem side before d = 271 (then a 300 m flyover along the stem, not designed).')
P_('  D2  Second level: upper deck 14.7 m over the ring (43.1 m) is accepted? DEFAULT yes (rise 7.8 m; with the Levels.ts default 6.9 m the first gore moves to d = 112 m).')
P_('  D3  Rail clearance ramp - rail: I used 30 m (ASSUMED). Tell me the value you want.')
P_('  D4  Stem speed at the junction: I used 60 km/h (ASSUMED, the arm speed was not read).')
P_('')
P_('NOT DONE / NOT RUN: layout-level model only (arcs with spirals, solved for the 5 % grade), not final geometry; natural ground, not the carved ground; trees, drainage, buildings of the city plan not checked; U-turn openings of the ring median not checked; the left slips A->S and S->A are not in these numbers; stem lane positions (inbound R- / outbound R+, axes at u -14 / +14) are my reading; tsc / npm run build / game: nothing run (no src change).')

json.dump({'options': {f'{k[0]}-{k[1]}': {'tot': v['tot'], 'u_lo': v['u_lo'], 'u_hi': v['u_hi'], 'X': v['X'], 'checks': [(a, bool(b), c) for a, b, c in v['chk']]} for k, v in out.items()}},
          open(f'{D}/rte_types.json', 'w'), indent=1, default=float)
open(f'{D}/RTE_TYPES.txt', 'w').write('\n'.join(LOG) + '\n')

# ---------------- picture ----------------
fig, axs = plt.subplots(3, 1, figsize=(13, 17))
uu = np.arange(-700, 760, 20.0); vv = np.arange(-260, 420, 20.0); G = np.array([[ground(u, v) for u in uu] for v in vv])
def draw(ax, title, P3, P4, extra=None):
    ax.contourf(uu, vv, G, levels=np.arange(10, 90, 5), cmap='terrain', alpha=.55); cs = ax.contour(uu, vv, G, levels=np.arange(10, 90, 5), colors='k', linewidths=.3)
    ax.fill_between([-700, 760], -HW, -MEDH, color='#999999'); ax.fill_between([-700, 760], MEDH, HW, color='#999999'); ax.fill_between([-700, 760], -MEDH, MEDH, color='#cfcfcf')
    ax.text(-690, -12, 'B (far, keep left, +u)', fontsize=8); ax.text(-690, 10, 'A (near, -u)', fontsize=8)
    ax.fill_between([-HW, 0], HW, 420, color='#bbbbbb'); ax.fill_between([0, HW], HW, 420, color='#999999'); ax.text(-HW, 395, 'stem in', fontsize=8, ha='right'); ax.text(HW, 395, 'stem out', fontsize=8)
    ax.axhspan(HW, 420, xmin=0, xmax=0, color='k'); ax.plot([RING_BR_END, RING_BR_END], [-260, -HW], 'k:', lw=1); pass
    ax.axvspan(-22, 22, ymin=(HW + 260) / 680, ymax=1, alpha=0) 
    ax.add_patch(plt.Rectangle((-HW, 160 - 160), 0, 0))
    ax.fill_between([-HW, HW], 160, 271, color='none')
    ax.plot([-HW, -HW + 0.01], [160, 271], 'm-', lw=0); ax.add_patch(plt.Rectangle((-HW - 4, 160), 2 * HW + 8, 111, fill=False, ec='m', lw=1.5, ls='--')); ax.text(HW + 8, 215, 'arm viaduct 160-271', fontsize=7, color='m')
    ax.plot(RAIL[:, 0], RAIL[:, 1], 'b--', lw=2); ax.text(RAIL[len(RAIL) // 2, 0] + 8, RAIL[len(RAIL) // 2, 1], 'rail (elevated)', color='b', fontsize=8)
    ax.plot(P3[:, 0], P3[:, 1], color='crimson', lw=3, label='M3  B -> S (right turn)'); ax.plot(P4[:, 0], P4[:, 1], color='navy', lw=3, label='M4  S -> B (right turn)')
    for P, c in ((P3, 'crimson'), (P4, 'navy')): ax.annotate('', xy=(P[-1, 0], P[-1, 1]), xytext=(P[-6, 0], P[-6, 1]), arrowprops=dict(arrowstyle='->', color=c, lw=2))
    ax.plot([0], [0], 'k*', ms=12); ax.set_xlim(-700, 760); ax.set_ylim(-260, 420); ax.set_aspect('equal'); ax.set_title(title, fontsize=10); ax.legend(loc='lower right', fontsize=8)
    ax.set_xlabel('u along the ring (m)  <- R- (hill, ring climbs)      R+ (flat) ->'); ax.set_ylabel('v toward the stem (m)')
k1 = pick(R1); k2 = pick(R2)
draw(axs[0], 'OPT-1 outside directional T (3 levels), upper ramp = %s' % k1[0], k1[1]['P3'], k1[1]['P4'])
draw(axs[1], 'OPT-2 median directional T (3 levels), upper ramp = %s, median widened to %.0f m' % (k2[0], k2[1]['MED_W']), k2[1]['P3'], k2[1]['P4'])
draw(axs[2], 'OPT-3 trumpet with the loop outside on R+ / FAR (2 levels, weave and overlap FAIL)', R3['P3'], R3['P4'])
plt.tight_layout(); plt.savefig(f'{D}/rte_types.png', dpi=100)
print('written', f'{D}/RTE_TYPES.txt', f'{D}/rte_types.json', f'{D}/rte_types.png')

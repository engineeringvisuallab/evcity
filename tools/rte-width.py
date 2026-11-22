# STEP RE-6: WIDTH CHANGES of RT-E (stem lane budget D6 + arm viaduct widening D1 + list of every added lane). Geometry data only.
# Run:  python3 -I tools/rte-width.py docs   (needs docs/rte_site.json, RTE_LEVELS.json, RTE_SLIPS.json; reuses tools/rte-m4.py up to the M4 solve and the cross-check helpers)
# Writes docs/RTE_WIDTH.txt, docs/RTE_WIDTH.json, docs/rte_width.png and src/roads/junction/RteWidthData.ts (GENERATED).
import sys, json, math
_L = open('tools/rte-m4.py').read().split('\n')
_c = [k for k, l in enumerate(_L) if l.startswith("Q('RE-5 RAMP M4 (S -> B)")][0]
exec('\n'.join(_L[:_c]))
exitlen = decel(VH, VR_SEMI) + EXIT_TAPER * LANE
u_end = float(P4[-1, 0]); u_entry0 = u_end - (ENTRY_LEN + 10)
LOG6 = []
def Q(s=''): LOG6.append(s); print(s)
chk = []
def C(txt, ok, note=''): chk.append((txt, bool(ok), note)); Q(f"{'PASS' if ok else 'FAIL'}  {txt}  {note}")

# ---------------- decisions (the user delegated D1 and D6 to the engineer, 2026-11-22) ----------------
BAR = 0.5                        # edge / barrier strip outside an added lane (ASSUMED)
SHIFT_RATIO, DROP_RATIO = 15, 25 # lateral shift of the M3 lane 1:15, lane drop (merge of two lanes into one) 1:25  (ASSUMED, no ramp-to-ramp number in Standards.ts)
ENTRY_T = ENTRY_TAPER * LANE     # 182.5 m final entry taper 1:50 (Standards)
INNER_C, OUTER_C = HW + LANE / 2, HW + LANE * 1.5      # 23.925 (A2S lane, flush with the paved edge), 27.575 (second lane beside it)
RAMP_LANE_C = U_OUT - RW / 2 + LANE / 2 + 1.2          # centre of the inner ramp lane of M3 (deck edge + shoulder + half lane) = 33.275
dn = float(M3['d'])                                    # M3 nose d 151
d_shift0 = dn; d_shift1 = d_shift0 + (RAMP_LANE_C - OUTER_C) * SHIFT_RATIO
d_drop1 = d_shift1 + LANE * DROP_RATIO
d_ent1 = d_drop1 + ENTRY_T
A2S_START = 66.0                                       # A2S lane full width from here (RE-3)

Q('RE-6 WIDTH CHANGES RT-E.  Decisions D1 and D6 were delegated to the engineer by the user (2026-11-22); defaults of D2 .. D5 kept.')
Q(f'D6 DECISION (stem outbound lane budget): TWO added lanes join in order, no entry overlaps another. A2S lane (centre u {INNER_C:.3f}) is full width from d {A2S_START:.0f}. The M3 ramp narrows to ONE lane (the ramp deck is 2 lanes, convention of RE-3 / RE-4: one added lane + taper per terminal) and at its nose d {dn:.0f} its lane is {RAMP_LANE_C-OUTER_C:.2f} m outside the second lane position, so it SHIFTS 1:{SHIFT_RATIO} to u {OUTER_C:.3f} (d {d_shift0:.0f} .. {d_shift1:.1f}), runs beside the A2S lane, then the OUTER lane is dropped into the A2S lane 1:{DROP_RATIO} (d {d_shift1:.1f} .. {d_drop1:.1f}), and the ONE combined lane enters the stem outbound with the Standards entry taper 1:{ENTRY_TAPER} ({ENTRY_T:.1f} m, d {d_drop1:.1f} .. {d_ent1:.1f}). This REPLACES the A2S entry taper of RE-3 (d 128 .. 310): the A2S lane now ends at d {d_ent1:.0f}.')
Q('D1 DECISION (arm viaducts): the arm pavement and profile are NOT changed. The viaduct deck is widened as a WEDGE that follows the added lanes (width = outer edge of the added lanes + 0.5 m barrier - the paved edge u 22.1), the wedge ends are the abutments / the point where the lane ends. Widths are computed below from the lanes, not assumed.')
Q('D2 (upper deck over the ring, now M4 deck %.1f m above the ring) accepted; D3 rail 30 m; D4 stem 60 km/h; D5 retaining wall on the S2A / A2S outer edge where the fill passes 7 m = YES (wall, 1 : 0 slope, the wall itself is RE-7).' % (M4['yc'] - yR(0)))
Q('')

# ---------------- lane geometry along the stem (d = distance from the T) ----------------
def lanes_outbound(d):
    """list of (name, centre u, width) of the ADDED lanes beside the stem outbound carriageway (u > 22.1) at distance d"""
    out = []
    if A2S_START <= d <= d_ent1:
        w = LANE if d <= d_drop1 else LANE * (d_ent1 - d) / ENTRY_T
        out.append(('A2S/combined lane', HW + w / 2, w))
    if d_shift0 <= d <= d_drop1:
        c = OUTER_C + (RAMP_LANE_C - OUTER_C) * max(0.0, (d_shift1 - d) / (d_shift1 - d_shift0)) if d <= d_shift1 else OUTER_C
        w = LANE if d <= d_shift1 else LANE * (d_drop1 - d) / (LANE * DROP_RATIO)
        ce = c if d <= d_shift1 else HW + LANE + w / 2
        out.append(('M3 lane', ce, w))
    return out
M4_T0 = M4['d'] + exitlen                                # M4 exit taper starts here (d 482)
def lanes_inbound(d):
    out = []
    # S2A exit lane: use the RE-3 centreline (u, v) for v >= HW, lane edge = |u| + half lane
    if 94.0 <= d <= float(S2A[0, 1]):                              # taper + decel lane beside the stem; below d 94 the slip arc leaves the stem corridor
        o = np.argsort(S2A[:, 1]); u = abs(float(np.interp(d, S2A[o, 1], S2A[o, 0]))); out.append(('S2A exit lane', u, LANE))
    if M4['d'] <= d <= M4_T0:
        w = LANE * min(1.0, (M4_T0 - d) / (EXIT_TAPER * LANE)); out.append(('M4 exit lane', HW + w / 2, w))
    return out
def env(side, d):
    ls = lanes_outbound(d) if side == 'out' else lanes_inbound(d)
    e = 0.0
    for nm, c, w in ls: e = max(e, c + w / 2)
    ew = max(0.0, e - HW); return (ew + BAR if ew > 0.05 else 0.0), ls
DD = np.arange(40, 540, 1.0)
W = {s: np.array([env(s, d)[0] for d in DD]) for s in ('out', 'in')}
ZONES = {}
for side in ('out', 'in'):
    for nm, (lo, hi) in (('viaduct1', ARM_VIA), ('viaduct2', ARM_VIA2)):
        m = (DD >= lo) & (DD <= hi) & (W[side] > 0)
        if m.any(): ZONES[f'{side}_{nm}'] = dict(window=[lo, hi], d_range=[float(DD[m].min()), float(DD[m].max())], max_widening_m=round(float(W[side][m].max()), 2), at_d=float(DD[m][W[side][m].argmax()]), length_m=float(DD[m].max() - DD[m].min()),
                                                  first=round(float(W[side][m][0]), 2), last=round(float(W[side][m][-1]), 2))
Q('VIADUCT WIDENING (D1), wedge widths = outer edge of the added lanes + 0.5 m barrier - paved edge, from the lane geometry above:')
for k, z in ZONES.items(): Q(f"  {k}: viaduct d {z['window'][0]}..{z['window'][1]}, widened on d {z['d_range'][0]:.0f}..{z['d_range'][1]:.0f} ({z['length_m']:.0f} m), width {z['first']} m at d {z['d_range'][0]:.0f} -> max {z['max_widening_m']} m at d {z['at_d']:.0f} -> {z['last']} m at d {z['d_range'][1]:.0f}")
Q('')
# ---------------- checks ----------------
# W1 no overlap of entries: A2S lane is the only lane that enters the stem (the M3 lane is dropped into it first)
C('W1 stem outbound: one entry only (M3 lane is merged into the A2S lane before the entry taper starts)', d_drop1 <= d_ent1 - ENTRY_T + 1e-6, f'drop ends d {d_drop1:.1f}, entry taper d {d_drop1:.1f} .. {d_ent1:.1f}')
C(f'W2 the A2S lane is full width {dn - A2S_START:.0f} m before the M3 lane joins (accel lane 32 m needed, RE-3)', dn - A2S_START >= 32 - 0.5, f'{dn - A2S_START:.0f} m')
C(f'W3 shift taper >= 1:{SHIFT_RATIO}, drop taper >= 1:{DROP_RATIO}, entry taper = 1:{ENTRY_TAPER} (Standards)', True, f'shift {d_shift1 - d_shift0:.1f} m for {RAMP_LANE_C - OUTER_C:.2f} m, drop {d_drop1 - d_shift1:.1f} m for {LANE} m, entry {ENTRY_T:.1f} m')
inb_gap = M4['d'] - (float(S2A[0, 1]))
C('W4 stem inbound: M4 exit lane (d %d .. %d) and S2A exit lane (d 66 .. %d) do not overlap' % (M4['d'], M4_T0, float(S2A[0, 1])), M4['d'] - float(S2A[0, 1]) > 0, f'gap {inb_gap:.0f} m between the M4 lane end and the S2A taper start')
# W5 earthwork of the NEW outbound lane part (d > 310 where RE-3 had no lane), outside the viaducts, at the outer edge
def hmax(side, lo, hi):
    mc = mf = 0.0
    for d in np.arange(lo, hi + 1, 4.0):
        if any(a <= d <= b for a, b in (ARM_VIA, ARM_VIA2)): continue
        e, ls = env(side, d)
        if e <= 0: continue
        u = (HW + e) * (1 if side == 'out' else -1); h = yS(d) - ground(u, d)
        mf = max(mf, h); mc = max(mc, -h)
    return mc, mf
cutO, fillO = hmax('out', 310, d_ent1); C('W5 new outbound lane part (d 310 .. %.0f, outside the viaducts): cut <= 12 m and fill <= 7 m (natural ground)' % d_ent1, cutO <= MAXCUT and fillO <= MAXFILL, f'cut {cutO:.1f} fill {fillO:.1f}')
cutS, fillS = hmax('out', 66, 310); C('W5b outbound lane part d 66 .. 310 (outside the viaducts)', cutS <= MAXCUT and fillS <= MAXFILL, f'cut {cutS:.1f} fill {fillS:.1f}')
cutI, fillI = hmax('in', 66, M4_T0); C('W5c inbound lanes d 66 .. %.0f (outside the viaducts)' % M4_T0, cutI <= MAXCUT and fillI <= MAXFILL, f'cut {cutI:.1f} fill {fillI:.1f}')
pts = np.array([[(HW + 3.0) * s, d, 0, 0] for d in np.arange(66, d_ent1 + 1, 4.0) for s in (1, -1) if not any(a <= d <= b for a, b in (ARM_VIA, ARM_VIA2))]); rd = rail_dist(pts)
C(f'W6 rail >= {RAIL_CLEAR:.0f} m from the added lanes OUTSIDE the arm viaducts (ASSUMED D3)', rd >= RAIL_CLEAR, f'{rd:.0f} m')
# the arm itself passes the rail (its viaduct 391..694 goes over / beside the rail): find where the ARM EDGE is closer than the clearance, the widening wedge there is a RE-8 item
near = [d for d in range(391, 695, 4) if min(rail_dist(np.array([[HW * s, d, 0, 0]] * 4)) for s in (1, -1)) < RAIL_CLEAR]
RAILZ = (min(near), max(near)) if near else None
Q(f'INFO  the arm viaduct 391..694 itself is within {RAIL_CLEAR:.0f} m of the rail on d {RAILZ[0]}..{RAILZ[1]} (the arm crosses the rail there, existing). The widening wedges (outbound to d 507, inbound to d 480) overlap that range: pier positions and rail clearance of the widened deck are a RE-8 item, NOT checked here.' if RAILZ else 'INFO  the arm edge is clear of the rail on the viaduct.')
# W7 lateral: the M3 ramp deck vs the outer lane before the nose: ramp deck inner edge to the A2S lane outer edge at the nose
gap_nose = (U_OUT - RW / 2) - (HW + LANE)
C('W7 gore at the M3 nose: ramp deck edge is >= 3.65 m (one lane) from the A2S lane edge, no overlap', gap_nose >= LANE - 0.01, f'{gap_nose:.2f} m (u {U_OUT - RW / 2:.2f} vs {HW + LANE:.2f})')
# W8 M3 / ring-side entry sequence has no new conflict with the M3 over A2S crossing (d 47): lane narrowing of the ramp 91 m before the nose
ramp_narrow = (dn - DROP_RATIO * LANE, dn)
C('W8 M3 ramp narrows 2 -> 1 lane in the last 91 m before the nose (d %.0f .. %.0f), after the crossing over the A2S arc (d 47)' % ramp_narrow, ramp_narrow[0] > 47.5, f'narrowing starts d {ramp_narrow[0]:.0f}')
# W9 RE-3 / RE-4 / RE-5 added lanes and the ring cross-section
C('W9 ring carriageways, median and profile are NOT changed (the ring is fixed): only added lanes outside the paved edge', True, 'by design, see the list below (nothing measured)')
Q('')
Q('WIDTH CHANGE LIST (H4): every added lane, length, taper. Ring and stem pavements are not changed.')
LST = [
 ('Ring B, M3 exit lane + taper', 'added lane 3.65 m outside the ring far edge', f'u {P3[0,0]-exitlen:.0f} .. {P3[0,0]:.0f}', f'{exitlen:.0f} m, taper 1:{EXIT_TAPER} = {EXIT_TAPER*LANE:.0f} m, decel lane {decel(VH, VR_SEMI):.0f} m'),
 ('Ring B, M4 entry lane + taper', 'added lane 3.65 m outside the ring far edge', f'u {u_entry0:.0f} .. {u_end:.0f}', f'{ENTRY_LEN:.0f} m, accel lane {accel(VH, VR_SEMI):.0f} m + taper 1:{ENTRY_TAPER} = {ENTRY_T:.1f} m'),
 ('Ring A (stem side), A2S exit lane + taper', 'added lane 3.65 m outside the ring near edge', 'u 315 .. 94', 'taper 91 m + decel lane 130 m (RE-3)'),
 ('Ring A (stem side), S2A entry lane + taper', 'added lane 3.65 m outside the ring near edge', 'u -96 .. -459', 'accel lane 181 m + taper 182 m (RE-3); D5 retaining wall where fill > 7 m'),
 ('Stem inbound, S2A exit lane', 'added lane 3.65 m', 'd 216 .. 66', 'taper 91 m then lane, then the slip arc (RE-3)'),
 ('Stem inbound, M4 exit lane + taper', 'added lane 3.65 m', f'd {M4_T0:.0f} .. {M4["d"]}', f'taper 91 m + decel lane {decel(VH, VR_SEMI):.0f} m; gore at d {M4["d"]}'),
 ('Stem outbound, A2S + M3 combined lane', 'added lane 3.65 m (second lane d %.0f .. %.0f)' % (d_shift0, d_drop1), f'd {A2S_START:.0f} .. {d_ent1:.0f}', f'M3 lane shift {d_shift1-d_shift0:.0f} m, drop {d_drop1-d_shift1:.0f} m, entry taper {ENTRY_T:.0f} m; REPLACES the RE-3 A2S entry (d 66 .. 310)'),
 ('M3 ramp deck', 'narrows 9.7 m -> 6.1 m (1 lane + 2 x 1.2 m shoulder)', f'd {ramp_narrow[0]:.0f} .. {ramp_narrow[1]:.0f}', f'{DROP_RATIO*LANE:.0f} m (1:{DROP_RATIO}), ASSUMED convention, detailed in RE-8 / RE-9'),
 ('M4 ramp deck', 'narrows 9.7 m -> 6.1 m before the ring B entry', f'last {DROP_RATIO*LANE:.0f} m before u {u_entry0:.0f}', 'same convention, ASSUMED'),
]
for a, b, c_, d_ in LST: Q(f'  {a}: {b}; {c_}; {d_}')
Q('NOT RUN  RE-3 A2S polyline is NOT rewritten (the new combined lane is data here: lanes_outbound in RteWidthData.ts replaces the A2S end d 128 .. 310), Validate.ts, full tsc / npm run build, the game, carved ground, trees, ring median U-turn openings, viaduct structural design (RE-8), girder depth (7.8 m assumed), ramp deck narrowing geometry (lengths only).')

# ---------------- outputs ----------------
def tab(side, lo, hi, step=5.0):
    rows = []
    for d in np.arange(lo, hi + 0.01, step):
        e, ls = env(side, float(d)); rows.append([round(float(d), 1), round(float(e), 2), [[n, round(float(c), 3), round(float(w), 3)] for n, c, w in ls]])
    return rows
J = dict(frame='d = distance from the T along the stem; u offset from the stem axis (outbound + , inbound - ); widening = outer edge of added lanes + 0.5 m barrier - 22.1', decisions=dict(D1='viaduct widened as a wedge that follows the added lanes (widths computed)', D2='accepted', D3='30 m', D4='60 km/h', D5='retaining wall yes', D6=f'two lanes, M3 lane shift 1:{SHIFT_RATIO}, drop 1:{DROP_RATIO}, entry taper 1:{ENTRY_TAPER}'),
         outbound_plan=dict(a2s_start=A2S_START, m3_nose=dn, shift=[d_shift0, d_shift1], drop=[d_shift1, d_drop1], entry_taper=[d_drop1, d_ent1], inner_c=INNER_C, outer_c=OUTER_C, ramp_lane_c=RAMP_LANE_C),
         inbound_plan=dict(m4_exit=[M4['d'], M4_T0], s2a_taper_start=float(S2A[0, 1])), viaduct_widening=ZONES, rail_zone_on_arm=RAILZ, outbound_table=tab('out', 40, 540), inbound_table=tab('in', 40, 540), width_list=LST, checks=chk)
json.dump(J, open(f'{OD}/RTE_WIDTH.json', 'w'), indent=1, default=float); open(f'{OD}/RTE_WIDTH.txt', 'w').write('\n'.join(LOG6) + '\n')
ts = ['// GENERATED by tools/rte-width.py (STEP RE-6). Do not edit: rerun the script (sources docs/rte_site.json, RTE_LEVELS.json, RTE_SLIPS.json).',
      '// RT-E stem width changes: added lanes beside the J1-E arm (d = distance from the T) and the arm viaduct widening wedges. Config switch NOT wired yet (RE-9). Data only, not imported by the game.',
      'export interface RteWidthRow { d: number; widen: number; lanes: [string, number, number][] }',
      'export const RTE_STEM_OUTBOUND: RteWidthRow[] = ' + json.dumps([{'d': r[0], 'widen': r[1], 'lanes': r[2]} for r in tab('out', 40, 540)], separators=(',', ':')) + ';',
      'export const RTE_STEM_INBOUND: RteWidthRow[] = ' + json.dumps([{'d': r[0], 'widen': r[1], 'lanes': r[2]} for r in tab('in', 40, 540)], separators=(',', ':')) + ';',
      'export const RTE_VIADUCT_WIDENING = ' + json.dumps(ZONES, separators=(',', ':')) + ';']
open('src/roads/junction/RteWidthData.ts', 'w', newline='').write('\r\n'.join(ts) + '\r\n')
fig, axs = plt.subplots(1, 2, figsize=(15, 12), gridspec_kw=dict(width_ratios=[1.3, 1]))
ax = axs[0]
for lo, hi in (ARM_VIA, ARM_VIA2): ax.axhspan(lo, hi, color='m', alpha=.08)
ax.fill_betweenx([HW, 540], -HW, -3, color='#bbb'); ax.fill_betweenx([HW, 540], 3, HW, color='#999')
for side, sg, col in (('out', 1, 'green'), ('in', -1, 'darkorange')):
    dd = np.arange(40, 540, 2.0)
    for d_ in dd[:1]: pass
    ee = [HW + env(side, d)[0] for d in dd]; ax.plot([sg * e if e > HW else np.nan for e in ee], dd, color=col, lw=2, label=f'envelope of added lanes ({"outbound" if side=="out" else "inbound"}) + barrier')
    for nm in (('A2S/combined lane', 'M3 lane') if side == 'out' else ('S2A exit lane', 'M4 exit lane')):
        xs = []; ys_ = []
        for d in dd:
            for n, c, w in (lanes_outbound(d) if side == 'out' else lanes_inbound(d)):
                if n == nm: xs.append(sg * c); ys_.append(d)
        if xs: ax.plot(xs, ys_, lw=1, ls='--', color=col)
ax.plot(P3[:, 0], P3[:, 1], color='crimson', lw=1.8, label='M3'); ax.plot(P4[:, 0], P4[:, 1], color='navy', lw=1.8, label='M4')
ax.set_xlim(-60, 60); ax.set_ylim(40, 540); ax.legend(fontsize=7, loc='upper center'); ax.set_xlabel('u (m)'); ax.set_ylabel('d (m)'); ax.set_title('RE-6 stem: added lanes (dashed centres) and the widening envelope; magenta = arm viaducts')
ax = axs[1]; ax.plot(W['out'], DD, color='green', label='outbound widening (m)'); ax.plot(W['in'], DD, color='darkorange', label='inbound widening (m)')
for lo, hi in (ARM_VIA, ARM_VIA2): ax.axhspan(lo, hi, color='m', alpha=.08)
ax.set_ylim(40, 540); ax.grid(alpha=.3); ax.legend(fontsize=8); ax.set_xlabel('widening beyond the paved edge (m)'); ax.set_ylabel('d (m)'); ax.set_title('Widening width vs d')
plt.tight_layout(); plt.savefig(f'{OD}/rte_width.png', dpi=100); print('written')

// STEP 4.2 (headless, pure math): superelevation diagram of the ring. Which curves rotate the outer carriageway, runoff / runout lengths,
// and whether the four radial meeting points still have >= 500 m of free straight on both sides once the tilt zones are subtracted.
// Run: npx tsx scripts/ring-superelevation.ts [rule] [Lt_in_spiral]
//   rule: nc018 (default, e + f = 0.018 normal-crown rule, TAC/TxDOT style) | fminus (V2/127R <= f - 0.02, old script) | fonly (handoff, V2/127R <= f)
//   second argument "inspiral": put the crown-removal runout inside the spiral (tangent runout 0 m) when Lr + Lt <= Ls.
import { DESIGN, CRITERIA, frictionAt } from '../src/roads/standards/Criteria';
import { SECTION_M8 as S } from '../src/roads/standards/SectionTable';
import { buildAlignment } from '../src/roads/alignment/PiAlignment';
import { RING_PIS, RING_DESIGN_SPEED as V, RING_RADIAL_JOINS } from '../src/roads/alignment/RingAlignment';

const rule = (process.argv[2] ?? 'nc018') as 'nc018' | 'fminus' | 'fonly';
const inSpiral = process.argv[3] === 'inspiral';
const f = frictionAt(V);
const crown = DESIGN.crown; // 0.02
const C_E_PLUS_F_NC = 0.018; // PROJECT ASSUMPTION from TAC / BC supplement; confirm against the Green Book table
const MAX_REL_GRADIENT = 0.0044; // PROJECT ASSUMPTION, "verify with the project engineer"
const need = 500; // clear straight each side of a radial meeting point (m)

/** Smallest radius that keeps the normal crown (m) under each rule. */
const rNC = { nc018: V * V / (127 * C_E_PLUS_F_NC), fminus: V * V / (127 * (f - crown)), fonly: V * V / (127 * f) }[rule];

const lanes = S.elements.find((e) => e.kind === 'lanes')!;
const n1 = S.lanesPerDir;
const w = lanes.width / n1; // 3.65
const bw = (1 + 0.5 * (n1 - 1)) / n1; // 0.625, rotation about the median edge, 4 lanes
const eFull = crown; // full tilt 2 % (project decision; e needed is <= 1.3 % on every ring curve)
const Lr0 = (w * n1 * eFull * bw) / MAX_REL_GRADIENT; // runoff from 0 to +2 %
const Lr = Math.ceil(Lr0 / 5) * 5;
const Lt0 = (crown / eFull) * Lr; // runout from -2 % to 0
const Lt = Math.ceil(Lt0 / 5) * 5;
const relGrad = (w * n1 * bw * eFull) / Lr;

const L = (s = '') => console.log(s);
const al = buildAlignment([...RING_PIS]);
const len = al.length;
L(`=== 4.2 RING SUPERELEVATION (V${V}, f ${f}, normal cross fall ${crown * 100} %, full tilt ${eFull * 100} %, rule ${rule}) ===`);
L(`  smallest radius that keeps the normal crown: R >= ${rNC.toFixed(1)} m`);
L(`  runoff Lr = w n1 e bw / delta = ${w} x ${n1} x ${eFull} x ${bw} / ${MAX_REL_GRADIENT} = ${Lr0.toFixed(1)} m, rounded to ${Lr} m; runout Lt = ${Lt} m; total -2 % to +2 % = ${Lr + Lt} m`);
L(`  relative gradient ${(relGrad * 100).toFixed(2)} % vs limit ${(MAX_REL_GRADIENT * 100).toFixed(2)} %`);
L(`  Lr + Lt = ${Lr + Lt} m vs spiral Ls ${RING_PIS[0].Ls} m -> ${Lr + Lt <= RING_PIS[0].Ls ? 'whole transition FITS inside the spiral' : 'does not fit inside the spiral'}`);
const Ltan = inSpiral && Lr + Lt <= Math.min(...RING_PIS.map((p) => p.Ls)) ? 0 : Lt; // tangent runout length used for the free-straight maths
L(`  tangent runout placed on the straight: ${Ltan} m ${Ltan === 0 ? '(runout inside the spiral)' : '(before TS and after ST)'}`);

L('\n  Curve decisions');
L('   PI      R   e needed (e+f-f)  e+f      decision');
const rotate: boolean[] = [];
for (const r of al.rows) {
  const p = RING_PIS[r.index];
  const ePlusF = (V * V) / (127 * p.R);
  const eNeed = Math.max(0, ePlusF - f);
  const keep = p.R >= rNC;
  rotate.push(!keep);
  L(`  ${String(r.index).padStart(3)} ${String(p.R).padStart(6)}   ${(eNeed * 100).toFixed(1).padStart(8)} %   ${ePlusF.toFixed(4)}   ${keep ? 'keep crown' : 'rotate to +2 %'}${!keep && Lr > p.Ls ? '   !! Lr > Ls' : ''}`);
}
L(`  rotate ${rotate.filter(Boolean).length} of ${rotate.length}`);

// free straight = straight between ST of curve i and TS of curve i+1, minus the tangent runout at each rotated end
L('\n  Straights and tilt zones');
const straights = al.rows.map((r, i) => {
  const next = al.rows[(i + 1) % al.rows.length];
  const a = r.st, bRaw = next.ts;
  const b = bRaw > a ? bRaw : bRaw + len;
  return { from: a + (rotate[r.index] ? Ltan : 0), to: b - (rotate[next.index] ? Ltan : 0), a, b, i, j: next.index };
});
for (const s of straights) L(`  PI ${s.i} -> PI ${s.j}: straight ${s.a.toFixed(0)}-${s.b.toFixed(0)} (${(s.b - s.a).toFixed(0)} m), free ${s.from.toFixed(0)}-${s.to.toFixed(0)} (${(s.to - s.from).toFixed(0)} m)`);

L(`\n  Radial meeting points, need >= ${need} m free straight on both sides`);
let fails = 0;
for (const j of RING_RADIAL_JOINS) {
  const st = j.station;
  const s = straights.find((q) => (st >= q.a && st <= q.b) || (st + len >= q.a && st + len <= q.b));
  if (!s) { fails++; L(`  FAIL  ${j.dir} station ${st}: not on a straight`); continue; }
  const pos = st >= s.a && st <= s.b ? st : st + len;
  const before = pos - s.from, after = s.to - pos;
  const tol = 0.5; // stations in RING_RADIAL_JOINS are rounded to whole metres
  const ok = before >= need - tol && after >= need - tol;
  const lo = s.from + need, hi = s.to - need;
  if (!ok) fails++;
  L(`  ${ok ? 'PASS' : 'FAIL'}  ${j.dir} station ${st}: free ${before.toFixed(0)} before / ${after.toFixed(0)} after` + (ok ? '' : lo <= hi ? `   valid window ${(lo % len).toFixed(0)}-${(hi % len).toFixed(0)} (${(hi - lo).toFixed(0)} m wide), move ${Math.min(Math.abs(lo - pos), Math.abs(hi - pos)).toFixed(0)} m` : `   NO valid window: free straight ${(s.to - s.from).toFixed(0)} m < ${2 * need} m, short by ${(2 * need - (s.to - s.from)).toFixed(0)} m`));
}
L(`\n${fails === 0 ? 'ALL RADIAL POINTS PASS' : fails + ' RADIAL POINT(S) FAIL'}`);

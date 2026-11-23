// STEP HK-9c-2 sub-step 2 (generator): cuts the 8 pieces of docs/hk_cd_roads.json to their DRY stretches (no water, not beside the old arm / link structures), resamples them at 8 m
// (the step of a ramp RoadSpec) and writes src/roads/ring/HkCdRoadData.ts + docs/HK_CD_DRY.txt.
// Run: HK=1 npx tsx scripts/hk-ring-run.ts hk-cd-road-data
import { readFileSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { hkFrame, hkWorld } from '../src/roads/ring/HkRamps';

const out: string[] = [];
const say = (s: string): void => { out.push(s); console.log(s); };
const f1 = (v: number): string => v.toFixed(1);
const STEP_OUT = 8; // RoadNetwork KIND.ramp.step
const MARGIN_WET = 12; // m kept clear of a wet sample (3 samples of 4 m)
const MARGIN_STRUCT = 20; // m kept clear of an old arm / link structure (twin bridge zone = sub-step 3)
const CAP_Y = 36, CAP_BELOW = 0.06;
const crossCut = new Set<string>();
let passed = 0, passMax = 0, capped = 0, capMax = 0, fixed = 0, fixMax = 0, lifted = 0, liftMax = 0;
// STEP 9c-2 sub-step 3b: optional list of old roads that a C-D road PASSES OVER (raised, the old road is not changed), grade <= G_LIFT.
const PASS_OVER: string[] = [], G_LIFT = 0.048; // TRIED with R2-8.2: IMPOSSIBLE (the C-D overlaps the link taper for 128 m and must keep the link level there, so it would need 11 % grade to reach 21 m at the crossing); list left empty
const R_WANT = 94;
const RING_FOOT = 4.2 + 22.1; // ring half width (8 lanes + shoulders) + slip half width: the slip overlaps the ring pavement inside this lateral distance
const G_FIX = 0.048, CLR_NEED = 4.9, CLR_MARGIN = 0.1; // grade limit used by the repair (the check limit is 5 %)
const LAT = 4.2 + 1.2 + 2; // pavement half + shoulder + 2 m: the ground is tested at the centre and at +-LAT

const D = JSON.parse(readFileSync('docs/hk_cd_roads.json', 'utf8')) as { pieces: { id: string; dir: string; pts: number[][] }[] };
const gen = new TerrainGenerator(Config.world.seed);
const net: any = gen.roads;
const f = hkFrame(net);
if (!f) { say('FAIL frame missing (HK=1 needed)'); process.exit(1); }
const arm = net.roads.find((r: any) => r.name === 'J1-S');
const link = net.roads.find((r: any) => r.name === 'M6-1');
const ring = net.roads.find((r: any) => r.name === 'M8');
const ringLv: { x: number; lev: number }[] = [];
for (let k = 0; k < ring.xs.length; k++) { const dx = ring.xs[k] - f.ox, dz = ring.zs[k] - f.oz; const lx = dx * f.ex + dz * f.ez, ly = dx * f.nx + dz * f.nz; if (lx > 200 && lx < 1100 && Math.abs(ly) < 80) ringLv.push({ x: lx, lev: ring.ys[k] }); }
ringLv.sort((a, b) => a.x - b.x);
const ringLevelAt = (x: number): number => { let i = 0; while (i + 2 < ringLv.length && ringLv[i + 1].x < x) i++; const a = ringLv[i], b = ringLv[i + 1], t = (x - a.x) / (b.x - a.x); return a.lev + (b.lev - a.lev) * t; };
const oldRoads: any[] = net.roads.filter((r: any) => !String(r.name).startsWith('HK-')); // the roads that exist without the new C-D / slip roads

const o = { h: 0, water: NaN, fx: 0, fz: 0 } as any;
const wetAt = (wx: number, wz: number): boolean => { gen.sampleNatural(wx, wz, o); return !Number.isNaN(o.water) && (o.water > o.h || o.h < o.water + 0.3); };

// structures along the real roads: distance from the node ALONG the road (same definition as hk-cd-roads.ts)
const brOf = (r: any): { i0: number; i1: number }[] => net.bridges.filter((b: any) => b.roadId === r.id).map((b: any) => ({ i0: b.i0, i1: b.i1 }));
const armSt = brOf(arm).map((b) => ({ a: arm.cum[arm.xs.length - 1] - arm.cum[b.i1], b: arm.cum[arm.xs.length - 1] - arm.cum[b.i0] }));
const linkSt = brOf(link).map((b) => ({ a: link.cum[b.i0] + 24.95, b: link.cum[b.i1] + 24.95 }));
const nearest = (r: any, wx: number, wz: number): { k: number; d: number } => { let bi = 0, bd = 1e18; for (let k = 0; k < r.xs.length; k++) { const d = Math.hypot(r.xs[k] - wx, r.zs[k] - wz); if (d < bd) { bd = d; bi = k; } } return { k: bi, d: bd }; };
// ring structures (river arch bridge east of the node ...): a point is 'beside' when its nearest ring point lies within the bridge + RING_PAD ring points (8 m each) and the ring is < 90 m away.
// (first version missed this: the slip embankments ended beside the arch bridge and raised the ground under it, ring-structures-check 4 FAIL)
const RING_PAD = 8;
const ringBr = net.bridges.filter((b: any) => b.roadId === ring.id && Math.hypot(ring.xs[(b.i0 + b.i1) >> 1] - f.ox, ring.zs[(b.i0 + b.i1) >> 1] - f.oz) > 150).map((b: any) => ({ a: b.i0 - RING_PAD, b: b.i1 + RING_PAD }));
// STEP 9c-2 sub-step 3: the ring river arch bridge stays a BLOCK (the east slips cannot merge on it without changing the ring: open decision), the old arm / link structures become TWIN BRIDGE ZONES.
const ringBeside = (wx: number, wz: number): boolean => { const nr = nearest(ring, wx, wz); return nr.d < 90 && ringBr.some((q: any) => nr.k >= q.a && nr.k <= q.b); };
const armLinkBeside = (wx: number, wz: number): boolean => {
  const na = nearest(arm, wx, wz), nl = nearest(link, wx, wz);
  const da = arm.cum[arm.xs.length - 1] - arm.cum[na.k], dl = link.cum[nl.k] + 24.95;
  return (na.d < 120 && armSt.some((q) => da >= q.a && da <= q.b)) || (nl.d < 120 && linkSt.some((q) => dl >= q.a && dl <= q.b));
};

say('HK-9c-2 SUB-STEP 2 (generator): dry stretches of the 8 pieces -> src/roads/ring/HkCdRoadData.ts');
say('WATER CHECK FIRST: sc.water > sc.h (and the game rule h < water + 0.3) on natural ground at the centre and +-' + LAT + ' m, every ~4 m. Margins: ' + MARGIN_WET + ' m from water, ' + MARGIN_STRUCT + ' m from the old arm / link structures.');
say('Old structures along the roads (m from the node): arm ' + armSt.map((q) => `${f1(q.a)}..${f1(q.b)}`).join(' | ') + '; link ' + linkSt.map((q) => `${f1(q.a)}..${f1(q.b)}`).join(' | '));

interface Row { id: string; dir: string; kind: 'cd' | 'slip'; startM: number; endM: number; fullM: number; pts: number[][]; ys: number[]; zones: number[][] }
const rows: Row[] = [];
for (const p of D.pieces) {
  const n = p.pts.length;
  const s: number[] = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]));
  // UNDER THE NODE DECK (|y| <= CAP_Y): the old ring check 4 forbids ANY rise of the ground under a ring structure (tolerance 0.05 m, no earth dam). The design levels of the C-D roads
  // (arm / link level, 19.68 .. 20.3 m) are up to 0.4 m ABOVE the natural ground there, so the levels are capped at (lowest natural ground over the pavement width) - CAP_BELOW. Only lowers, never raises.
  if (p.id.startsWith('CD')) {
    for (let i = 0; i < n; i++) {
      if (Math.abs(p.pts[i][1]) > CAP_Y) continue;
      const a = p.pts[Math.max(0, i - 1)], b = p.pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      let low = 1e9;
      for (const l of [0, 5.4, -5.4]) { const [wx, wz] = hkWorld(f, p.pts[i][0] - ty * l, p.pts[i][1] + tx * l); gen.sampleNatural(wx, wz, o); low = Math.min(low, o.h); }
      const cap = low - CAP_BELOW;
      if (p.pts[i][2] > cap) { capped++; capMax = Math.max(capMax, p.pts[i][2] - cap); p.pts[i][2] = +cap.toFixed(2); }
    }
  }
  // GRADE REPAIR + CROSSING LIFT (found by hk-cd-roads-build-check): (a) the level cap above creates a step (CD-E-S 5.14 %): the C-D levels are lowered again so no grade is steeper than G_FIX (lower only, never raises).
  // (b) a SLIP that crosses an OLD road at a lower level needs the girder clearance 4.9 m + 1.4 m girder: the slip level is raised there (the old road is fixed) and the grade is repaired by raising neighbours only.
  const gStep = (i: number): number => G_FIX * (s[i + 1] - s[i]);
  if (p.id.startsWith('CD')) {
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < n; i++) { const m = p.pts[i - 1][2] + gStep(i - 1); if (p.pts[i][2] > m) { fixed++; fixMax = Math.max(fixMax, p.pts[i][2] - m); p.pts[i][2] = +m.toFixed(3); } }
      for (let i = n - 2; i >= 0; i--) { const m = p.pts[i + 1][2] + gStep(i); if (p.pts[i][2] > m) { fixed++; fixMax = Math.max(fixMax, p.pts[i][2] - m); p.pts[i][2] = +m.toFixed(3); } }
    }
    const c0 = p.pts[0][2], c1 = p.pts[n - 1][2];
    for (let i = 0; i < n; i++) {
      const [cx, cz] = hkWorld(f, p.pts[i][0], p.pts[i][1]);
      for (const q of oldRoads) {
        if (!PASS_OVER.includes(q.name)) continue;
        const lim = 4.2 + q.halfWidth + 2;
        for (let k = 0; k < q.xs.length; k++) {
          if (Math.abs(q.xs[k] - cx) > lim || Math.abs(q.zs[k] - cz) > lim || Math.hypot(q.xs[k] - cx, q.zs[k] - cz) >= lim) continue;
          const need = q.ys[k] + 1.4 + CLR_NEED + CLR_MARGIN;
          if (p.pts[i][2] < need) { passed++; passMax = Math.max(passMax, need - p.pts[i][2]); p.pts[i][2] = +need.toFixed(3); }
        }
      }
    }
    if (passed) {
      for (let it = 0; it < 4; it++) {
        for (let i = 1; i < n; i++) { const m = p.pts[i - 1][2] - G_LIFT * (s[i] - s[i - 1]); if (p.pts[i][2] < m) { p.pts[i][2] = +m.toFixed(3); passed++; } }
        for (let i = n - 2; i >= 0; i--) { const m = p.pts[i + 1][2] - G_LIFT * (s[i + 1] - s[i]); if (p.pts[i][2] < m) { p.pts[i][2] = +m.toFixed(3); passed++; } }
      }
      say(`  PASS-OVER ${p.id}: raised over ${PASS_OVER.join(', ')} by up to ${passMax.toFixed(2)} m at the crossing (grade <= ${G_LIFT * 100} %); ends ${c0} -> ${p.pts[0][2]}, ${c1} -> ${p.pts[n - 1][2]}`);
    }
  } else {
    // STEP 3d: the EAST slips overlap the ring pavement for the first / last ~50 m (gore + aux lane). The ring level there differs from the design level by up to 1 m (the ring rises toward the node),
    // which the build check counted as a crossing under the ring (SLIP-SE -0.46 m clearance). Inside the ring footprint (|y| < RING_FOOT) the slip level is the ring level; the repair below fixes the grade.
    if (p.id === 'SLIP-NE' || p.id === 'SLIP-SE') {
      let moved = 0, mv = 0;
      for (let i = 0; i < n; i++) {
        if (Math.abs(p.pts[i][1]) >= RING_FOOT || p.pts[i][0] < 250) continue;
        const rl = ringLevelAt(p.pts[i][0]);
        if (Math.abs(rl - p.pts[i][2]) > 0.001) { mv = Math.max(mv, Math.abs(rl - p.pts[i][2])); p.pts[i][2] = +rl.toFixed(3); moved++; }
      }
      say(`  RING LEVEL ${p.id}: ${moved} points inside the ring footprint (|y| < ${RING_FOOT} m) set to the ring level, worst change ${mv.toFixed(2)} m`);
    }
    const y0 = p.pts[0][2], y1 = p.pts[n - 1][2];
    for (let i = 0; i < n; i++) {
      const [cx, cz] = hkWorld(f, p.pts[i][0], p.pts[i][1]);
      for (const q of oldRoads) {
        const lim = 4.2 + q.halfWidth + 2;
        for (let k = 0; k < q.xs.length; k++) {
          if (Math.abs(q.xs[k] - cx) > lim || Math.abs(q.zs[k] - cz) > lim || Math.hypot(q.xs[k] - cx, q.zs[k] - cz) >= lim) continue;
          if (q.ys[k] < p.pts[i][2] - 0.8) { const need = q.ys[k] + 1.4 + CLR_NEED + CLR_MARGIN; if (p.pts[i][2] < need) { lifted++; liftMax = Math.max(liftMax, need - p.pts[i][2]); p.pts[i][2] = +need.toFixed(3); } }
        }
      }
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < n; i++) { const m = p.pts[i - 1][2] - gStep(i - 1); if (p.pts[i][2] < m) { p.pts[i][2] = +m.toFixed(3); lifted++; } }
      for (let i = n - 2; i >= 0; i--) { const m = p.pts[i + 1][2] - gStep(i); if (p.pts[i][2] < m) { p.pts[i][2] = +m.toFixed(3); lifted++; } }
    }
    if (Math.abs(p.pts[0][2] - y0) > 0.001 || Math.abs(p.pts[n - 1][2] - y1) > 0.001) say(`  NOTE ${p.id}: an END level moved by the crossing lift (${y0} -> ${p.pts[0][2]}, ${y1} -> ${p.pts[n - 1][2]})`);
  }
  const wetI: boolean[] = [], stI: boolean[] = [], blockI: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const a = p.pts[Math.max(0, i - 1)], b = p.pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let w = false;
    for (const l of [0, LAT, -LAT]) { const [wx, wz] = hkWorld(f, p.pts[i][0] - ty * l, p.pts[i][1] + tx * l); if (wetAt(wx, wz)) w = true; }
    wetI.push(w);
    const [cx, cz] = hkWorld(f, p.pts[i][0], p.pts[i][1]);
    let bad = false; // a C-D point that crosses an OLD road with less than the needed clearance (cannot be lifted: the C-D levels are tied to the deck): the stretch is cut here, a later step (twin bridge / junction) decides
    if (p.id.startsWith('CD')) {
      for (const q of oldRoads) {
        if (PASS_OVER.includes(q.name)) continue; // lifted over instead
        if (q.name === 'J1-S' || q.name === 'M6-1') continue; // HK-9c-2 step 4: the arm / link run PARALLEL beside the C-D (exit / entry taper), not across it: comparing with arm points further along (other level by the grade) gave a false 'crossing' (CD-E-N s 41 m, -0.59 m)
        const lim = 4.2 + q.halfWidth;
        for (let k = 0; k < q.xs.length && !bad; k++) {
          if (Math.abs(q.xs[k] - cx) > lim + 1 || Math.abs(q.zs[k] - cz) > lim + 1 || Math.hypot(q.xs[k] - cx, q.zs[k] - cz) >= lim + 4) continue;
          const dy = q.ys[k] - p.pts[i][2];
          if (Math.abs(dy) <= 0.8) continue;
          const clr = dy < 0 ? p.pts[i][2] - 1.4 - q.ys[k] : q.ys[k] - 1.4 - p.pts[i][2];
          if (clr < CLR_NEED) { bad = true; crossCut.add(`${p.id} x ${q.name} (clearance ${clr.toFixed(2)} m at piece s ${s[i].toFixed(0)} m)`); }
        }
        if (bad) break;
      }
    }
    stI.push(armLinkBeside(cx, cz));
    blockI.push(ringBeside(cx, cz) || bad);
  }
  const ok: boolean[] = [];
  for (let i = 0; i < n; i++) {
    let good = true;
    for (let j = 0; j < n && good; j++) { const dd = Math.abs(s[j] - s[i]); if (blockI[j] && dd <= MARGIN_STRUCT) good = false; }
    ok.push(good);
  }
  let bestA = -1, bestB = -1, runA = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && ok[i]) { if (runA < 0) runA = i; }
    else if (runA >= 0) { if (bestA < 0 || s[i - 1] - s[runA] > s[bestB] - s[bestA]) { bestA = runA; bestB = i - 1; } runA = -1; }
  }
  const nWet = wetI.filter(Boolean).length, nSt = stI.filter(Boolean).length, nBl = blockI.filter(Boolean).length;
  if (bestA < 0 || s[bestB] - s[bestA] < 40) { say(`\n${p.id}: no dry stretch (wet ${nWet} / ${n}, beside arm / link structure ${nSt} / ${n}, blocked ${nBl} / ${n})`); continue; }
  const L = s[bestB] - s[bestA];
  const m = Math.max(2, Math.ceil(L / STEP_OUT));
  const pts: number[][] = [], ys: number[] = [], flag: boolean[] = [];
  let j = bestA;
  for (let k = 0; k <= m; k++) {
    const ds = s[bestA] + (L * k) / m;
    while (j < bestB - 1 && s[j + 1] < ds) j++;
    const t = s[j + 1] > s[j] ? Math.min(1, Math.max(0, (ds - s[j]) / (s[j + 1] - s[j]))) : 0;
    // Catmull-Rom (not linear): the linear mid-chord points lie inside the curve and made the 8 m radius 2 - 6 % smaller than the design radius (CD-W-S 91.4 m instead of 93.7 m)
    const q0 = p.pts[Math.max(bestA, j - 1)], q1 = p.pts[j], q2 = p.pts[j + 1], q3 = p.pts[Math.min(bestB, j + 2)];
    const cr = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    pts.push([+cr(q0[0], q1[0], q2[0], q3[0]).toFixed(2), +cr(q0[1], q1[1], q2[1], q3[1]).toFixed(2)]);
    ys.push(+(p.pts[j][2] + (p.pts[j + 1][2] - p.pts[j][2]) * t).toFixed(2));
    let fl = false; // twin bridge zone: water or beside an old arm / link structure within 8 m of this point
    for (let q = bestA; q <= bestB; q++) if ((wetI[q] || stI[q]) && Math.abs(s[q] - ds) <= STEP_OUT) { fl = true; break; }
    flag.push(fl);
  }
  // RADIUS RELAX: the S-bend of the C-D roads measures 92.3 m on the 8 m polyline (design 93.7 m on the noisy 4 m data). Points with R < R_WANT are pulled toward the mean of their neighbours (<= 0.5 m from the original), ends fixed.
  const orig = pts.map((q) => q.slice());
  const rad = (a: number[], b: number[], c: number[]): number => { const cr2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])); return cr2 > 1e-9 ? (Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]) * Math.hypot(c[0] - a[0], c[1] - a[1])) / (2 * cr2) : 1e9; };
  let minR0 = 1e9; for (let k = 1; k + 1 < pts.length; k++) minR0 = Math.min(minR0, rad(pts[k - 1], pts[k], pts[k + 1]));
  let relaxed = 0;
  for (let it = 0; it < 200 && minR0 < R_WANT; it++) {
    let any = false;
    for (let k = 1; k + 1 < pts.length; k++) {
      if (rad(pts[k - 1], pts[k], pts[k + 1]) >= R_WANT) continue;
      const nx2 = pts[k][0] * 0.6 + 0.2 * (pts[k - 1][0] + pts[k + 1][0]), ny2 = pts[k][1] * 0.6 + 0.2 * (pts[k - 1][1] + pts[k + 1][1]);
      if (Math.hypot(nx2 - orig[k][0], ny2 - orig[k][1]) > 0.5) continue;
      pts[k] = [+nx2.toFixed(2), +ny2.toFixed(2)]; any = true; relaxed++;
    }
    if (!any) break;
  }
  let minR1 = 1e9; for (let k = 1; k + 1 < pts.length; k++) minR1 = Math.min(minR1, rad(pts[k - 1], pts[k], pts[k + 1]));
  if (relaxed) say(`  RADIUS RELAX ${p.id}: min radius ${minR0.toFixed(1)} -> ${minR1.toFixed(1)} m (${relaxed} point moves, <= 0.5 m)`);
  const zones: number[][] = [];
  for (let k = 0; k < flag.length; k++) if (flag[k]) { const z = zones[zones.length - 1]; if (z && z[1] === k - 1) z[1] = k; else zones.push([k, k]); }
  rows.push({ id: p.id, dir: p.dir, kind: p.id.startsWith('CD') ? 'cd' : 'slip', startM: +s[bestA].toFixed(1), endM: +s[bestB].toFixed(1), fullM: +s[n - 1].toFixed(1), pts, ys, zones });
  const why = (cutStart: boolean, cutEnd: boolean): string => `${cutStart ? 'start cut (water / structure)' : 'start = piece start'}, ${cutEnd ? 'end cut (water / structure)' : 'end = piece end'}`;
  say(`\n${p.id}  ${p.dir}\n  full piece ${f1(s[n - 1])} m; wet samples ${nWet} / ${n}; beside old structure ${nSt} / ${n}`);
  say(`  DRY STRETCH ${f1(s[bestA])} .. ${f1(s[bestB])} m = ${f1(L)} m (${(100 * L / s[n - 1]).toFixed(0)} % of the piece), ${pts.length} points at <= ${STEP_OUT} m; ${why(bestA > 0, bestB < n - 1)}`);
  say(`  TWIN BRIDGE ZONES (point index ranges, 8 m apart): ${zones.length ? zones.map((z) => `${z[0]}..${z[1]}`).join(' | ') : 'none'}`);
  say(`  levels ${ys[0].toFixed(2)} -> ${ys[ys.length - 1].toFixed(2)} m`);
}

say(`\nC-D POINTS CUT AWAY because they cross an old road with too little clearance (decision: HK-9c-2 sub-step 3): ${crossCut.size ? [...crossCut].join('; ') : 'none'}`);
say(`\nLEVEL CAP under the node deck (|y| <= ${CAP_Y} m, ground - ${CAP_BELOW} m): ${capped} points lowered, worst ${capMax.toFixed(2)} m below the design level (HK_CD_ROADS.txt)`);
say(`GRADE REPAIR of the C-D roads (limit ${G_FIX * 100} %): ${fixed} level corrections, worst ${fixMax.toFixed(2)} m; CROSSING LIFT of the slips (old road below: clearance ${CLR_NEED} m + 1.4 m girder + ${CLR_MARGIN} m): ${lifted} level corrections, worst raise ${liftMax.toFixed(2)} m`);
// ---------- write the data file (CRLF like the other files of src/roads/ring) ----------
const L: string[] = [];
L.push('// GENERATED by scripts/hk-cd-road-data.ts (STEP HK-9c-2 sub-steps 2 + 3). Do not edit: rerun the script (source docs/hk_cd_roads.json).');
L.push('// The DRY stretches of the 8 pieces (4 C-D roads + 4 slips) of the Hatikamrul-type interchange, local frame (x EAST along the ring, y NORTH along the J1-S arm, node = arm end),');
L.push('// finished surface levels (used exactly, fixedY), points <= 8 m apart (the step of a ramp road). `zones` = twin bridge ranges (water, old arm / link structure beside). Cut away: beside the ring river arch bridge, and where an old road is crossed with too little clearance.');
L.push('export interface HkCdRoad { id: string; dir: string; kind: \'cd\' | \'slip\'; /** metres from the start of the full piece (docs/HK_CD_ROADS.txt) */ startM: number; endM: number; fullM: number; pts: number[][]; ys: number[]; /** point index ranges over water or beside an old arm / link structure: bridge (twin) */ zones: number[][] }');
L.push('export const HK_CD_ROADS: HkCdRoad[] = [');
for (const r of rows) {
  L.push(`  { id: '${r.id}', dir: '${r.dir}', kind: '${r.kind}', startM: ${r.startM}, endM: ${r.endM}, fullM: ${r.fullM},`);
  L.push(`    pts: [${r.pts.map((q) => `[${q[0]},${q[1]}]`).join(',')}],`);
  L.push(`    ys: [${r.ys.join(',')}],
    zones: [${r.zones.map((z) => `[${z[0]},${z[1]}]`).join(',')}] },`);
}
L.push('];');
writeFileSync('src/roads/ring/HkCdRoadData.ts', L.join('\r\n') + '\r\n');
say(`\nWROTE src/roads/ring/HkCdRoadData.ts (${rows.length} of ${D.pieces.length} pieces, ${rows.reduce((a, r) => a + r.pts.length, 0)} points)`);
writeFileSync('docs/HK_CD_DRY.txt', out.join('\n') + '\n');

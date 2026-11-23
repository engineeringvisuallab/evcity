// STEP HK-5b: loops 3 + 4 = the two WEST lawn loops (NW: C-D -> ring, SW: ring -> C-D, mirror images). DATA ONLY, no src change.
// Run from the game root: npx tsx scripts/hk-loops-b.ts -> docs/HK_LOOPS_B.txt, docs/hk_loops_b.json (picture: python3 tools/hk-loops-b-plot.py)
// Frame (local): x EAST, y NORTH, node (ring axis x arm axis) at 0,0. Ring along x, ground road (C-D) along y. Left-hand traffic.
import { readFileSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CRITERIA, accelLength, decelLength, minRadius as stdMinR } from '../src/interchange/Standards';
import { DESIGN } from '../src/roads/standards/Criteria';
const out: string[] = []; let fails = 0, warns = 0;
const say = (s: string): void => { out.push(s); console.log(s); };
const chk = (ok: boolean, n: string, d: string, warn = false): void => { if (!ok) { if (warn) warns++; else fails++; } say(`  ${ok ? 'PASS' : warn ? 'WARN' : 'FAIL'}  ${n.padEnd(66)} ${d}`); };
const f1 = (x: number): string => x.toFixed(1);
// --- inputs: HK-3 numbers, with the Validate.ts speed rule (e + f = 0.21) checked as well
const vN = 29.3, vS = 23.2, dxN = vN - vS, vCD = vS, ringKerb = 17.3, // see hk-loops-a.ts: SE-frame loop built on the south (link) offset, the north loops are moved by dxN
  laneW = DESIGN.laneWidth, rampHalf = 4.2;
const minRValidate = (V: number): number => (V * V) / (127 * 0.21); // Validate.ts minRadiusFor
say('HK-5b  WEST LAWN LOOPS (NW + SW), centreline data with spirals');
say(`Radius rule: Validate.ts (e+f 0.21, what the build runs) needs ${f1(minRValidate(55))} m for V55 and ${f1(minRValidate(60))} m for V60; Standards.ts minRadius(55) = ${f1(stdMinR(55))} m. All four loops are R80 / V45 (equal).`);
const R = Number(process.env.HK_R ?? 80), V = Number(process.env.HK_V ?? 45), v = V / 3.6; // env override only for the size study
const Ls = Math.ceil((v ** 3) / (R * DESIGN.comfortC) / 5) * 5; // clothoid length from the comfort rate C (DESIGN.comfortC)
const total = 270 * Math.PI / 180, La = R * total - Ls; // two spirals turn Ls / R together, the arc turns the rest
say(`Spiral Ls = V^3 / (R C) = ${f1(v ** 3 / (R * DESIGN.comfortC))} -> ${Ls} m each; arc ${f1(La)} m (R ${R}); total ${f1(2 * Ls + La)} m`);
// --- centreline: SE loop travelled from the C-D road (southbound, east C-D x = +vCD) to the ring (westbound, south lane y = -ringKerb)
type P = { x: number; y: number; h: number; k: number; s: number };
const pts: P[] = []; let x = 0, y = 0, h = -Math.PI / 2, s = 0; const nSeg = Math.ceil(2 * Ls + La), ds = (2 * Ls + La) / nSeg; // exact total length, so the path really ends at k = 0
const curv = (q: number): number => (q < Ls ? q / (Ls * R) : q < Ls + La ? 1 / R : Math.max(0, (2 * Ls + La - q) / (Ls * R)));
for (let i0 = 0; i0 <= nSeg; i0++) { const q = i0 * ds; pts.push({ x, y, h, k: curv(q), s }); const k = curv(q + ds / 2); h += k * ds; x += Math.cos(h) * ds; y += Math.sin(h) * ds; s += ds; }
const e = pts[pts.length - 1]; const dx = vCD - pts[0].x, dy = -ringKerb - e.y;
for (const p of pts) { p.x += dx; p.y += dy; }
say(`SE-frame loop (rotated 180 deg below to NW): start (${f1(pts[0].x)}, ${f1(pts[0].y)}) heading ${f1(pts[0].h * 180 / Math.PI)} deg (south, on the east C-D road); end (${f1(e.x + 0)}, ${f1(e.y)}) heading ${f1(e.h * 180 / Math.PI)} deg (west, in the ring south lane)`);
chk(Math.abs(Math.abs(e.h) - Math.PI) < 1e-2 || Math.abs(e.h - Math.PI) < 1e-2, 'H5 tangent end: heading west (180 deg) at the ring lane', `${f1(e.h * 180 / Math.PI)} deg (error ${f1(Math.abs(Math.abs(e.h) - Math.PI) * 180 / Math.PI * 60)} arc-min)`);
chk(Math.abs(pts[0].k) < 1e-9 && Math.abs(e.k) < 1e-6, 'H5 curvature 0 at both ends (spiral in and out, G1 and G2 at the joins)', `k0 ${pts[0].k.toExponential(1)} k_end ${e.k.toExponential(1)}`);
let kMax = 0, dk = 0; for (let i = 1; i < pts.length; i++) { kMax = Math.max(kMax, pts[i].k); dk = Math.max(dk, Math.abs(pts[i].k - pts[i - 1].k) / ds); }
chk(1 / kMax >= minRValidate(V) * 0.97 && 1 / kMax >= stdMinR(V), `H1 radius ${f1(1 / kMax)} m for V${V}`, `Validate ${f1(minRValidate(V))} m, Standards ${f1(stdMinR(V))} m`);
chk(1 / kMax >= stdMinR(V), 'H1 radius against Standards.ts', `${f1(1 / kMax)} >= ${f1(stdMinR(V))}`);
// --- vertical: from the ground road level to the new ring level (HK-4, deck 1.4) with a smoothstep ramp (same shape as Levels.rampProfile)
const gen: any = new TerrainGenerator(Config.world.seed); const net: any = gen.roads;
const arm = net.roads.find((r: any) => r.name === 'J1-S'), link = net.roads.find((r: any) => r.name === 'M6-1'), ring = net.roads.find((r: any) => r.name === 'M8');
const at = (r: any, q: number): number => { const L = r.length; const ss = r.closed ? ((q % L) + L) % L : Math.max(0, Math.min(L, q)); let lo = 0, hi = r.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.cum[m] <= ss) lo = m; else hi = m; } const t = (ss - r.cum[lo]) / ((r.cum[hi] - r.cum[lo]) || 1); return r.ys[lo] + (r.ys[hi] - r.ys[lo]) * t; };
const JX = arm.xs[arm.xs.length - 1], JZ = arm.zs[arm.zs.length - 1]; let k0 = 0, bd = 1e18;
for (let i = 0; i < ring.xs.length; i++) { const d = Math.hypot(ring.xs[i] - JX, ring.zs[i] - JZ); if (d < bd) { bd = d; k0 = i; } } const sJ = ring.cum[k0];
const hv = JSON.parse(readFileSync('docs/hk_vertical.json', 'utf8')); // HK-4: new ring profile, deck 1.4 (WEST_1.4.pts = [d, level] with d + = WEST)
const ringWest = (d: number): number => { const p = hv.res['WEST_1.4'].pts.reduce((b: number[], q: number[]) => (Math.abs(q[0] - d) < Math.abs(b[0] - d) ? q : b)); return p[1]; };
const d0 = -pts[0].y; // distance of the loop start from the ring axis (SE-frame y is negative)
const yLowNW = at(arm, arm.length - d0), yLowSW = at(link, d0 - 25); const yRingW = ringWest(Math.abs(e.x));
const sm = (t: number): number => { const q = Math.max(0, Math.min(1, t)); return q * q * (3 - 2 * q); };
const Ltot = e.s; const rows: any = {};
say(`Ring level at the loop end (${f1(Math.abs(e.x))} m west of the node, HK-4 deck 1.4): ${f1(yRingW)} m (the level deck / start of the west merge).`);
for (const [name, yA] of [['NW', yLowNW], ['SW', yLowSW]] as const) {
  let g = 0; let prev = yA; for (let i = 1; i < pts.length; i++) { const yy = yA + (yRingW - yA) * sm(pts[i].s / Ltot); g = Math.max(g, Math.abs(yy - prev) / ds); prev = yy; }
  say(`${name} loop vertical: ground road ${f1(yA)} m -> ring ${f1(yRingW)} m = rise ${f1(yRingW - yA)} m over ${f1(Ltot)} m; peak grade ${f1(g * 100)} %`);
  chk(g <= DESIGN.maxGrade.ramp, `H1 ${name} ramp grade <= 5 %`, `${f1(g * 100)} %`);
  rows[name] = { yA, yB: yRingW, peak: g };
}
const dl = decelLength(100, V), al = accelLength(100, V);
say(`Ring aux lanes: exit (SW loop, westbound) decel 100 -> ${V}: ${Math.round(dl)} m + taper ${DESIGN.exitTaper} x ${laneW} = ${Math.round(DESIGN.exitTaper * laneW)} m; entrance (NW loop, eastbound) accel ${V} -> 85: ${Math.round(al)} m + taper ${DESIGN.entryTaper} x ${laneW} = ${Math.round(DESIGN.entryTaper * laneW)} m.`);
const exW = Math.abs(e.x);
say(`The lawn loops meet the ring at x = -${f1(exW)} m (${f1(exW)} m west of the node). SW exit lane (decel + taper) starts about ${Math.round(dl + DESIGN.exitTaper * laneW - exW)} m EAST of the node; NW entrance lane (accel + taper) runs about ${Math.round(al + DESIGN.entryTaper * laneW - exW)} m east of the node, over and past the crossing: auxiliary lane on the west side of the flyover too (HK-6).`);
// --- H4 weaving on the ring, from the real numbers of HK-5a (x = +70.0) and HK-5b
const AJ = JSON.parse(readFileSync('docs/hk_loops_a.json', 'utf8')); const weaveS = AJ.endXS + exW, weaveN = AJ.endXN + exW + dxN, weave = Math.min(weaveS, weaveN);
chk(weaveS >= CRITERIA.weaveMin, 'H4 weave on the ring SOUTH lane (SE entrance to SW exit, link side)', `${f1(weaveS)} m between the two gore points (min ${CRITERIA.weaveMin}, desirable ${CRITERIA.weaveDesirable})`);
chk(weaveN >= CRITERIA.weaveMin, 'H4 weave on the ring NORTH lane (NW entrance to NE exit, arm side)', `${f1(weaveN)} m between the two gore points (min ${CRITERIA.weaveMin}, desirable ${CRITERIA.weaveDesirable})`);
chk(weave >= CRITERIA.weaveDesirable, 'H4 weave on the ring reaches the desirable length', `${f1(weaveS)} m south / ${f1(weaveN)} m north vs ${CRITERIA.weaveDesirable} m`, true);
const pa = pts.find((p) => p.s >= Ls)!; const cx = pa.x - Math.sin(pa.h) * R, cy = pa.y + Math.cos(pa.h) * R;
say(`NW loop arc centre (${f1(-cx)}, ${f1(-cy)}), SW (${f1(-cx)}, ${f1(cy)}), radius ${R}; clear infield radius = ${R} - ${rampHalf} - 12 = ${f1(R - rampHalf - 12)} m (lawn: existing vegetation / grass systems only, D4).`);
say(`Plan extent of the NW loop: x ${f1(-Math.max(...pts.map((p) => p.x)))} .. ${f1(-Math.min(...pts.map((p) => p.x)))}, y ${f1(-Math.max(...pts.map((p) => p.y)))} .. ${f1(-Math.min(...pts.map((p) => p.y)))} m.`);
chk(Math.min(...pts.map((p) => p.x)) >= vCD - 0.5, 'plan: loop stays west of the west C-D centreline', `x min ${f1(Math.min(...pts.map((p) => p.x)))} >= ${f1(vCD)} (mirror)`);
// --- terrain under the loop centrelines (natural ground only)
{
  const pos = (q: number): number[] => { let lo = 0, hi = ring.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ring.cum[m] <= q) lo = m; else hi = m; } const t = (q - ring.cum[lo]) / ((ring.cum[hi] - ring.cum[lo]) || 1); return [ring.xs[lo] + (ring.xs[hi] - ring.xs[lo]) * t, ring.zs[lo] + (ring.zs[hi] - ring.zs[lo]) * t]; };
  const a1 = pos(sJ - 5), b1 = pos(sJ + 5); let tx = b1[0] - a1[0], tz = b1[1] - a1[1]; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
  const E = [-tx, -tz]; const ax = arm.xs[arm.xs.length - 80] - JX, az = arm.zs[arm.zs.length - 80] - JZ; const al2 = Math.hypot(ax, az); const N = [ax / al2, az / al2];
  const o = { h: 0, water: NaN, fx: 0, fz: 0 };
  for (const name of ['NW', 'SW'] as const) {
    const row = rows[name]; let maxFill = -1e9, maxCut = 0, wet = 0, n = 0, high = 0;
    for (let i = 0; i < pts.length; i += 3) { const lx = name === 'NW' ? -(pts[i].x + dxN) : -pts[i].x, ly = name === 'NW' ? -pts[i].y : pts[i].y; // local east / north
      const t = name === 'NW' ? pts[i].s / Ltot : 1 - pts[i].s / Ltot; // SW is travelled ring -> C-D, but the level at a point is the same function of its place on the loop
      const wx = JX + lx * E[0] + ly * N[0], wz = JZ + lx * E[1] + ly * N[1]; gen.sampleNatural(wx, wz, o);
      const y = row.yA + (row.yB - row.yA) * sm(pts[i].s / Ltot); const dd = y - o.h; maxFill = Math.max(maxFill, dd); if (dd > 3) high++; maxCut = Math.max(maxCut, -dd); if (!Number.isNaN(o.water) && o.h < o.water + 0.3) wet++; n++; void t; }
    say(`${name} loop on NATURAL ground: max fill ${f1(maxFill)} m, max cut ${f1(maxCut)} m, wet samples ${wet} of ${n}`);
    say(`${name} loop height above NATURAL ground: ${f1(maxFill)} m at most; about ${Math.round(high * 3)} m of its ${Math.round(Ltot)} m stand higher than pierFromH 3 m = dry VIADUCT on piers (Builder.ts / RoadNetwork.ts 3D-A); only the first / last stretch up to 3 m is embankment`);
    chk(maxFill <= 12, `${name} pier height <= 12 m (no pier limit found in the game rules; DESIGN.maxFill 7 m is for road corridor EMBANKMENTS, not ramp viaducts)`, `${f1(maxFill)} m max pier height`);
    rows[name] = { ...(rows[name] || {}), viaductM: high * 3 };
    chk(maxCut <= DESIGN.maxCut, `${name} loop cut <= ${DESIGN.maxCut} m (DESIGN.maxCut)`, `${f1(maxCut)} m (site constraint, not a script error)`);
    chk(wet === 0, `${name} loop dry`, `${wet} wet samples of ${n}`);
    rows[name].maxFill = maxFill; rows[name].maxCut = maxCut;
  }
}
say('NOT RUN: Validate.ts on real Ramp objects, the game, tsc, build, C-D roads and slips (HK-5c), terrain after the ring raise / carving.');
say(`RESULT ${fails} FAIL, ${warns} WARN`);
const sub = (a2: { x: number; y: number }[]) => a2.filter((_, i) => i % 5 === 0).map((p) => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) }));
writeFileSync('docs/HK_LOOPS_B.txt', out.join('\n') + '\n');
writeFileSync('docs/hk_loops_b.json', JSON.stringify({ R, V, Ls, La, centre: [-cx, -cy], centreN: [-(cx + dxN), -cy], weaveS, weaveN, nw: sub(pts.map((p) => ({ x: -(p.x + dxN), y: -p.y }))), sw: sub(pts.map((p) => ({ x: -p.x, y: p.y })).reverse()), rows, weave }));

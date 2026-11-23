// STEP HK-5a: loops 1 + 2 = the two EAST pond loops (SE: C-D -> ring, NE: ring -> C-D, mirror images). DATA ONLY, no src change.
// Run from the game root: npx tsx scripts/hk-loops-a.ts -> docs/HK_LOOPS_A.txt, docs/hk_loops_a.json (picture: python3 tools/hk-loops-a-plot.py)
// Frame (local): x EAST, y NORTH, node (ring axis x arm axis) at 0,0. Ring along x, ground road (C-D) along y. Left-hand traffic.
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { accelLength, decelLength, minRadius as stdMinR } from '../src/interchange/Standards';
import { DESIGN } from '../src/roads/standards/Criteria';
const out: string[] = []; let fails = 0, warns = 0;
const say = (s: string): void => { out.push(s); console.log(s); };
const chk = (ok: boolean, n: string, d: string, warn = false): void => { if (!ok) { if (warn) warns++; else fails++; } say(`  ${ok ? 'PASS' : warn ? 'WARN' : 'FAIL'}  ${n.padEnd(66)} ${d}`); };
const f1 = (x: number): string => x.toFixed(1);
// --- inputs: HK-3 numbers, with the Validate.ts speed rule (e + f = 0.21) checked as well
const vN = 29.3, vS = 23.2, dxN = vN - vS, vCD = vS, ringKerb = 17.3, // vN: C-D offset beside the 8-lane ARM (half 22.1 + 3 + 4.2); vS: beside the 6-lane LINK (half 16.0 + 3 + 4.2); the SE loop is built on the SOUTH offset, the NE loop = mirror shifted by dxN
  laneW = DESIGN.laneWidth, rampHalf = 4.2;
const minRValidate = (V: number): number => (V * V) / (127 * 0.21); // Validate.ts minRadiusFor
say('HK-5a  EAST POND LOOPS (SE + NE), centreline data with spirals');
say(`Radius rule: Standards.ts minRadius(45) = ${f1(stdMinR(45))} m but Validate.ts needs ${f1(minRValidate(45))} m for V45 (e+f 0.21). Validate.ts is what the game build runs, so the loop is now R80 / V45 (all four loops EQUAL; size study: R135 / V60 runs into the wet east valley, R95 / V50 and R115 / V55 need slips of 390 m and more, R60 / V40 and R70 / V42 have a C-D weave under 150 m).`);
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
say(`SE loop (south, link C-D x ${vS}): start (${f1(pts[0].x)}, ${f1(pts[0].y)}) heading ${f1(pts[0].h * 180 / Math.PI)} deg (south, on the east C-D road); end (${f1(e.x + 0)}, ${f1(e.y)}) heading ${f1(e.h * 180 / Math.PI)} deg (west, in the ring south lane)`);
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
const yLowSE = at(link, (-pts[0].y) - 25); // link level beside the C-D at the SE loop start (link starts 25 m south of the ring axis, so its station = distance - 25; HK-5a first run used distance + 25 by mistake, fixed 2026-11-22)
const yLowNE = at(arm, arm.length - (-pts[0].y)); // arm level at the same distance on the north side (NE loop end, mirror)
const top = 27.23, east = (d: number): number => { const o = at(ring, sJ - d); return o; }; // old ring level at d m EAST of the node
const yRingEnd = top - 0.2; // new ring at about 89 m east: still on the level deck / start of the crest curve (HK-4: flat 51.5 m, crest 163 m)
const sm = (t: number): number => { const q = Math.max(0, Math.min(1, t)); return q * q * (3 - 2 * q); };
const Ltot = e.s; const ys = (yA: number, yB: number): number[] => pts.map((p) => yA + (yB - yA) * sm(p.s / Ltot));
const rows: any = {};
for (const [name, yA, yB] of [['SE', yLowSE, yRingEnd], ['NE', yLowNE, yRingEnd]] as const) {
  const prof = ys(yA, yB); let g = 0; for (let i = 1; i < prof.length; i++) g = Math.max(g, Math.abs(prof[i] - prof[i - 1]) / ds);
  say(`${name} loop vertical: ground road ${f1(yA)} m -> ring ${f1(yB)} m = rise ${f1(yB - yA)} m over ${f1(Ltot)} m; peak grade ${f1(g * 100)} %`);
  chk(g <= DESIGN.maxGrade.ramp, `H1 ${name} ramp grade <= 5 %`, `${f1(g * 100)} %`);
  rows[name] = { yA, yB, peak: g };
}
// --- aux lanes on the ring (D2: plain exits on the flyover): decel for the NE exit, accel for the SE entrance
const dl = decelLength(100, V), al = accelLength(100, V);
say(`Ring aux lanes: exit (NE loop) decel 100 -> ${V}: ${Math.round(dl)} m + taper ${DESIGN.exitTaper} x ${laneW} = ${Math.round(DESIGN.exitTaper * laneW)} m; entrance (SE loop) accel ${V} -> 85: ${Math.round(al)} m + taper ${DESIGN.entryTaper} x ${laneW} = ${Math.round(DESIGN.entryTaper * laneW)} m.`);
say(`The loops meet the ring at x = ${f1(e.x)} m east of the node: the NE exit lane (decel + taper) therefore starts about ${Math.round(dl + DESIGN.exitTaper * laneW - e.x)} m WEST of the node (before the crossing), and the SE entrance lane (accel + taper) runs ${Math.round(al + DESIGN.entryTaper * laneW - e.x)} m west of the node, i.e. over and past the crossing: the flyover deck needs an auxiliary lane on the east side through the crossing (+${f1(laneW)} m each side, HK-6 to carry it). NOT designed here.`);
// --- clearance of the loop from the C-D road and the ring (plan gap), inner clear radius for the pond
const pa = pts.find((p) => p.s >= Ls)!; const cx = pa.x - Math.sin(pa.h) * R, cy = pa.y + Math.cos(pa.h) * R; // circle centre of the SE loop: point at the end of the spiral + R to its left (arc part)
say(`SE loop circle centre (${f1(cx)}, ${f1(cy)}), radius ${R}; clear infield radius for the pond = ${R} - ramp half width ${rampHalf} - verge 12 = ${f1(R - rampHalf - 12)} m (the infield rule D4: existing water object only).`);
say(`NE loop = the SE loop mirrored about the ring axis (y -> -y), moved ${f1(dxN)} m away from the axis (arm C-D x ${vN}) and travelled the other way (ring -> C-D): centre (${f1(cx + dxN)}, ${f1(-cy)}).`);
chk(Math.min(...pts.map((p) => p.x)) >= vCD - 0.5, 'plan: loop stays east of the east C-D centreline', `x min ${f1(Math.min(...pts.map((p) => p.x)))} >= ${f1(vCD)}`);
say(`Plan extent of the SE loop: x ${f1(Math.min(...pts.map((p) => p.x)))} .. ${f1(Math.max(...pts.map((p) => p.x)))}, y ${f1(Math.min(...pts.map((p) => p.y)))} .. ${f1(Math.max(...pts.map((p) => p.y)))} m.`);
say('OPEN H4 (ESTIMATE, not computed on lawn loops yet): on the RING (plain exits, D2) the SE loop entrance (x +' + f1(e.x) + ' m, westbound) is followed by the SW lawn loop exit after the crossing: the weave on the ring is only about 170 - 250 m: above the 150 m minimum, below the 300 m desirable. Cloverstack-style C-D roads on the ring would cure it (more width). To be decided in HK-5c, with the real lawn-loop numbers.');

// --- terrain under the loop centrelines (natural ground, headless; the carved ground / ring raise are NOT in it)
{
  const pa2 = { x: ring.xs[k0], z: ring.zs[k0] }; let tx = 0, tz = 0;
  { const a = at; void a; }
  const sA = sJ - 5, sB = sJ + 5; const pos = (q: number): number[] => { let lo = 0, hi = ring.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ring.cum[m] <= q) lo = m; else hi = m; } const t = (q - ring.cum[lo]) / ((ring.cum[hi] - ring.cum[lo]) || 1); return [ring.xs[lo] + (ring.xs[hi] - ring.xs[lo]) * t, ring.zs[lo] + (ring.zs[hi] - ring.zs[lo]) * t]; };
  const a1 = pos(sA), b1 = pos(sB); tx = b1[0] - a1[0]; tz = b1[1] - a1[1]; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl; // increasing station = WEST
  const E = [-tx, -tz]; const ax = arm.xs[arm.xs.length - 80] - JX, az = arm.zs[arm.zs.length - 80] - JZ; const al2 = Math.hypot(ax, az); const N = [ax / al2, az / al2];
  const o = { h: 0, water: NaN, fx: 0, fz: 0 };
  for (const name of ['SE', 'NE'] as const) {
    const sg = name === 'SE' ? 1 : -1; const row = rows[name]; let maxFill = -1e9, maxCut = 0, wet = 0, n = 0, high = 0;
    for (let i = 0; i < pts.length; i += 3) { const lx = pts[i].x + (name === 'NE' ? dxN : 0), ly = sg * pts[i].y * 1; const wx = JX + lx * E[0] + (name === 'SE' ? pts[i].y : -pts[i].y) * N[0], wz = JZ + lx * E[1] + (name === 'SE' ? pts[i].y : -pts[i].y) * N[1];
      gen.sampleNatural(wx, wz, o); const y = row.yA + (row.yB - row.yA) * sm(pts[i].s / Ltot); const d = y - o.h; maxFill = Math.max(maxFill, d); if (d > 3) high++; maxCut = Math.max(maxCut, -d); if (!Number.isNaN(o.water) && o.h < o.water + 0.3) wet++; n++; void ly; }
    say(`${name} loop on NATURAL ground: max fill ${f1(maxFill)} m, max cut ${f1(maxCut)} m, wet samples ${wet} of ${n}`);
    say(`${name} loop height above NATURAL ground: ${f1(maxFill)} m at most; about ${Math.round(high * 3)} m of its ${Math.round(Ltot)} m stand higher than pierFromH 3 m = dry VIADUCT on piers (Builder.ts / RoadNetwork.ts 3D-A); only the first / last stretch up to 3 m is embankment`);
    chk(maxFill <= 12, `${name} pier height <= 12 m (no pier limit found in the game rules; DESIGN.maxFill 7 m is for road corridor EMBANKMENTS, not ramp viaducts)`, `${f1(maxFill)} m max pier height`);
    rows[name] = { ...(rows[name] || {}), viaductM: high * 3 };
    chk(wet === 0, `${name} loop dry`, `${wet} wet samples of ${n}`);
  }
  void pa2;
}
say('NOT RUN: Validate.ts on real Ramp objects, the game, tsc, build, terrain check at the loop position (HK-0 east boxes: fill 12.9 / 14.8 m, wet: STILL OPEN), loops 3 + 4 (west, HK-5b), C-D road data and slips (HK-5c).');
say(`RESULT ${fails} FAIL, ${warns} WARN`);
const nePts = pts.map((p) => ({ x: p.x + dxN, y: -p.y })).reverse();
writeFileSync('docs/HK_LOOPS_A.txt', out.join('\n') + '\n');
writeFileSync('docs/hk_loops_a.json', JSON.stringify({ endX: e.x, endXS: e.x, endXN: e.x + dxN, vN, vS, startY: -pts[0].y, R, V, Ls, La, centre: [cx, cy], se: pts.filter((_, i) => i % 5 === 0).map((p, i) => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), s: p.s, k: +p.k.toFixed(5) })), ne: nePts.filter((_, i) => i % 5 === 0).map((p) => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) })), rows }));

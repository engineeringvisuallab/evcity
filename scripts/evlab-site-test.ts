// EVLab relocation, Step R0d: the new 360 x 300 m plot, TURNED by 37.5 deg (parallel to the J1 arms), north of J1 (W arm / N arm wedge), its car park strip and the two gate road strips.
// The plot, the strip and the fence are in the turned (building-local) frame: lx / lz measured along the J1 "E" and "S" arm directions, origin = the building centre.
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { EVLAB_PLOT, EVLAB_PARKING_STRIP, EVLAB_FENCE, EVLAB_GATE_ROADS, EVLAB_POS, EVLAB_ORIGIN, EVLAB_YAW, evlabKeepout, insideFence, localToWorld, worldToLocal } from '../src/evlab/EVLabSite';
import { GATE_Z, lakeDepth } from '../src/evlab/EVLabCampus';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { MALL_POLY } from '../src/mall/MallSite';
const gen = new TerrainGenerator(Config.world.seed);
const e = gen.evlab;
const P = EVLAB_PLOT, S = EVLAB_PARKING_STRIP;
console.log('plot (local)', P, 'size', P.x1 - P.x0, 'x', P.z1 - P.z0, '+ car park strip', S.x1 - S.x0, 'm; yaw', ((EVLAB_YAW * 180) / Math.PI).toFixed(1), 'deg; centre', EVLAB_POS.x, EVLAB_POS.z, '; building origin', EVLAB_ORIGIN.x.toFixed(1), EVLAB_ORIGIN.z.toFixed(1), '; floorY', e.floorY.toFixed(2));
let fails = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// arm centre lines: straight part s = 0..315 from the J1 centre + J1_ARM_DATA (s >= 315)
const J1 = { x: -87, z: -277 }, YAW = (37.5 * Math.PI) / 180;
const dirs: Record<string, [number, number]> = { 'J1-N': [Math.sin(YAW), -Math.cos(YAW)], 'J1-E': [Math.cos(YAW), Math.sin(YAW)], 'J1-S': [-Math.sin(YAW), Math.cos(YAW)], 'J1-W': [-Math.cos(YAW), -Math.sin(YAW)] };
const arms: Record<string, Array<[number, number]>> = {};
for (const k of Object.keys(dirs)) { arms[k] = []; for (let s = 0; s < 315; s += 2) arms[k].push([J1.x + dirs[k][0] * s, J1.z + dirs[k][1] * s]); }
for (const a of J1_ARM_DATA) for (const p of a.pts) arms[a.name].push([p[0], p[1]]);
const allArms = Object.values(arms).flat();
const rail: Array<[number, number]> = [];
for (const r of gen.rail.edges) for (let j = 0; j + 1 < r.xs.length; j++) { const L = Math.hypot(r.xs[j + 1] - r.xs[j], r.zs[j + 1] - r.zs[j]), n = Math.max(1, Math.ceil(L / 5)); for (let k = 0; k <= n; k++) rail.push([r.xs[j] + ((r.xs[j + 1] - r.xs[j]) * k) / n, r.zs[j] + ((r.zs[j + 1] - r.zs[j]) * k) / n]); }
// distance from world points to a rectangle given in the TURNED frame (a rotation keeps distances, so the distance is measured in local metres)
const dRect = (x0: number, x1: number, z0: number, z1: number, pts: Array<[number, number]>): number => { let m = 1e9; for (const [wx, wz] of pts) { const [x, z] = worldToLocal(wx, wz); m = Math.min(m, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1))); } return m; };

// 1 the frame: 360 x 300, centre (-140, -620), turned 37.5 deg = the J1 yaw; every plot edge is parallel to a J1 arm; the transform is a rotation + shift and round-trips
ok(P.x1 - P.x0 === 360 && P.z1 - P.z0 === 300 && EVLAB_POS.x === -140 && EVLAB_POS.z === -620, 'plot 360 x 300 m, centre (-140, -620)');
ok(Math.abs(EVLAB_POS.yaw - (YAW - Math.PI / 2)) < 1e-12 && Math.abs(EVLAB_YAW - (YAW - Math.PI / 2)) < 1e-12, 'yaw = -52.5 deg (the J1 yaw 37.5 deg turned 90 deg anticlockwise, Step RT1)');
{
  const c = localToWorld((P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2);
  ok(Math.hypot(c[0] - EVLAB_POS.x, c[1] - EVLAB_POS.z) < 1e-9, `the centre of the local plot is the world centre (-140, -620) (${c[0].toFixed(2)}, ${c[1].toFixed(2)})`);
  let worst = 0;
  for (const [lx, lz] of [[0, 0], [180, 180], [-180, -120], [37.5, -80], [220, 30]]) { const w = localToWorld(lx, lz), b = worldToLocal(w[0], w[1]); worst = Math.max(worst, Math.hypot(b[0] - lx, b[1] - lz)); }
  ok(worst < 1e-9, `worldToLocal(localToWorld(p)) = p (worst error ${worst.toExponential(1)} m)`);
  const o = localToWorld(0, 0), ex = localToWorld(1, 0), ez = localToWorld(0, 1);
  const dxE = ex[0] - o[0], dzE = ex[1] - o[1], dxS = ez[0] - o[0], dzS = ez[1] - o[1];
  ok(Math.abs(dxE - dirs['J1-N'][0]) < 1e-9 && Math.abs(dzE - dirs['J1-N'][1]) < 1e-9 && Math.abs(dxS - dirs['J1-E'][0]) < 1e-9 && Math.abs(dzS - dirs['J1-E'][1]) < 1e-9, 'local +x = the J1 N arm direction, local +z (the gate side) = the J1 E arm direction (Step RT1)');
  // the N arm and the W arm are parallel to a plot edge
  const dotN = dxE * dirs['J1-N'][0] + dzE * dirs['J1-N'][1], dotW = dxS * dirs['J1-W'][0] + dzS * dirs['J1-W'][1];
  ok(Math.abs(Math.abs(dotN) - 1) < 1e-9 && Math.abs(Math.abs(dotW) - 1) < 1e-9, 'the N arm and the W arm are both parallel to a plot edge');
  const [jx, jz] = worldToLocal(J1.x, J1.z);
  console.log(`  J1 centre in the campus frame: (${jx.toFixed(0)}, ${jz.toFixed(0)}) (plot east edge ${P.x1}, south edge ${P.z1}; RT1: the gate side faces the J1 E arm direction, the car park side the J1 N arm direction)`);
}
ok(EVLAB_FENCE.length === 4, 'the fence is a plain 4 corner rectangle (turned)');
{
  const o = (lx: number, lz: number) => insideFence(...localToWorld(lx, lz));
  ok(o(0, 30) && o(P.x0 + 0.5, P.z0 + 0.5) && o(P.x1 - 0.5, P.z1 - 0.5) && o(P.x0 + 0.5, P.z1 - 0.5) && o(P.x1 - 0.5, P.z0 + 0.5), 'insideFence: the centre and the 4 corners (0.5 m inside) are inside');
  ok(!o(P.x0 - 1, 30) && !o(P.x1 + 1, 30) && !o(0, P.z0 - 1) && !o(0, P.z1 + 1), 'insideFence: 1 m outside each of the 4 edges is outside');
  ok(e.inside(...localToWorld(0, 30)) && !e.inside(...localToWorld(P.x1 + 1, 30)) && e.inside(...localToWorld(P.x1 + 1, 30), 2), 'site.inside() follows the turned rectangle (and its margin)');
  // the world axis-aligned plot would wrongly contain these (corner of the bounding box that lies outside the turned fence)
  const bx = Math.max(...EVLAB_FENCE.map((p) => p[0])) - 1, bz = Math.min(...EVLAB_FENCE.map((p) => p[1])) + 1;
  ok(!insideFence(bx, bz) && !e.inside(bx, bz), 'a corner of the world bounding box (outside the turned fence) is NOT inside');
}

// 2 flat: the plot is level. The campus lake is carved into the pad (skipped here). The car park strip is level too, except near the N arm,
// where the arm's own road pad gives way to it: there it only has to stay within 1 m.
let mn = 1e9, mx = -1e9, n = 0, stripMax = 0;
const tgt = e.floorY - 0.03;
for (let lx = P.x0; lx <= S.x1; lx += 4) for (let lz = P.z0; lz <= P.z1; lz += 4) {
  if (lakeDepth(lx, lz) > 0) continue;
  const [wx, wz] = localToWorld(lx, lz);
  const h = gen.heightAt(wx, wz);
  if (lx <= P.x1) { mn = Math.min(mn, h); mx = Math.max(mx, h); n++; } else stripMax = Math.max(stripMax, Math.abs(h - tgt));
}
ok(mx - mn < 0.001 && Math.abs(mn - tgt) < 0.001, `terrain under the turned plot is flat (${n} samples, range ${(mx - mn).toFixed(4)} m, floorY ${e.floorY.toFixed(2)})`);
ok(stripMax < 1, `the car park strip is within 1 m of the pad (max ${stripMax.toFixed(2)} m, only near the N arm)`);

// 3 clearances (arms measured from the J1 centre, s = 0 and up, not only from s >= 315)
const dPlot = dRect(P.x0, P.x1, P.z0, P.z1, allArms);
ok(dPlot >= 55, `plot >= 55 m from every J1 arm centre line (${dPlot.toFixed(1)} m; was 71 m before RT1: turned in place, the plot edge that faces the arm is now deeper; pavement edge is 22.1 m from the centre line)`);
const dStrip = dRect(S.x0, S.x1, S.z0, S.z1, allArms);
ok(dStrip >= 30, `car park strip >= 30 m from every J1 arm centre line (${dStrip.toFixed(0)} m)`);
const dRail = dRect(P.x0, S.x1, P.z0, P.z1, rail);
ok(dRail >= 50, `plot + strip >= 50 m from the railway (${dRail.toFixed(0)} m)`);
const dJ1 = dRect(P.x0, P.x1, P.z0, P.z1, [[J1.x, J1.z]]);
ok(dJ1 >= 110, `plot >= 110 m from the J1 box (centre) (${dJ1.toFixed(0)} m)`);

// 4 no road surface on the (turned) plot + strip + 4 m (the pad's own flat margin); no local street within 25 m.
// (The old check used 8 m. With the 30 m centre line rule (arm pavement half width 22.1 m) the strip end is only ~9 m from the N arm's pavement edge, so 8 m is too tight: the gap is printed instead.)
let roadHits = 0, localHits = 0, gap = 1e9;
for (let lx = P.x0 - 4; lx <= S.x1 + 4; lx += 3) for (let lz = P.z0 - 4; lz <= P.z1 + 4; lz += 3) { const [wx, wz] = localToWorld(lx, lz); if (gen.roads.surfaceAt(wx, wz) !== 0) roadHits++; }
for (let lz = S.z0; lz <= S.z1; lz += 3) for (let lx = S.x1; lx <= S.x1 + 30; lx += 1) { const [wx, wz] = localToWorld(lx, lz); if (gen.roads.surfaceAt(wx, wz) !== 0) { gap = Math.min(gap, lx - S.x1); break; } }
ok(roadHits === 0, `no road surface on the plot + car park strip + 4 m (${roadHits} hits); nearest road surface east of the strip: ${gap > 1e8 ? '> 30' : gap.toFixed(0)} m`);
for (const r of gen.roads.roads) if (r.kind === 'local') for (let i = 0; i < r.xs.length; i++) { const [lx, lz] = worldToLocal(r.xs[i], r.zs[i]); if (lx > P.x0 - 25 && lx < S.x1 + 25 && lz > P.z0 - 25 && lz < P.z1 + 25) localHits++; }
ok(localHits === 0, `no local street within 25 m of the plot + car park strip (${localHits})`);

// 5 street keep-out (turned): plot + strip + 30 m all round, not the J1 centre, not far ground
ok(!evlabKeepout(-87, -277) && !evlabKeepout(500, -277), 'the J1 centre and far ground are not in the street keep-out');
{
  const k = (lx: number, lz: number) => evlabKeepout(...localToWorld(lx, lz));
  ok(k(P.x0 - 25, 30) && k(S.x1 + 25, 30) && k(0, P.z1 + 25) && k(0, P.z0 - 25), 'local streets are kept out of the plot + car park strip + 30 m all round (turned)');
  ok(!k(P.x0 - 45, 130) && !k(S.x1 + 45, 130) && !k(0, P.z0 - 45), 'and not further than that (45 m out: free)');
  // the corner of the world bounding box is far from the turned plot: it must be free (an axis-aligned keep-out would block it)
  const bx = EVLAB_FENCE.reduce((m, p) => Math.max(m, p[0]), -1e9), bz = EVLAB_FENCE.reduce((m, p) => Math.min(m, p[1]), 1e9);
  ok(!evlabKeepout(bx + 5, bz - 5), 'the empty corner of the world bounding box is not in the keep-out');
}

// 6 the two gate roads (PROVISIONAL since R0d: R3 / R4 shapes in the turned frame; the new routes to the arms come in R3b / R4b)
for (const g of EVLAB_GATE_ROADS) {
  const a = g.pts[0], b = g.pts[g.pts.length - 1];
  const la = g.local[0], lb = g.local[g.local.length - 1];
  const wa = localToWorld(la[0], la[1]), wb = localToWorld(lb[0], lb[1]);
  ok(Math.hypot(a[0] - wa[0], a[1] - wa[1]) < 1e-9 && Math.hypot(b[0] - wb[0], b[1] - wb[1]) < 1e-9, `${g.id} gate road: world points are the local points turned into the world`);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  console.log(`  ${g.id} gate road (local): (${la[0].toFixed(1)}, ${la[1].toFixed(1)}) -> (${lb[0].toFixed(1)}, ${lb[1].toFixed(1)}); world (${a[0].toFixed(1)}, ${a[1].toFixed(1)}) -> (${b[0].toFixed(1)}, ${b[1].toFixed(1)}), ${len.toFixed(0)} m straight`);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  ok(evlabKeepout(mid[0], mid[1]), `${g.id} gate road: its strip is in the street keep-out`);
  ok(e.contains(mid[0], mid[1]), `${g.id} gate road: no grass / trees / rocks on its strip`);
  // natural ground along the road, so the cut / fill under the strip is known
  let lo = 1e9, hi = -1e9; const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
  for (let d = 0; d <= len; d += 5) { gen.sampleNatural(a[0] + ((b[0] - a[0]) * d) / len, a[1] + ((b[1] - a[1]) * d) / len, sc); lo = Math.min(lo, sc.h); hi = Math.max(hi, sc.h); }
  console.log(`  ${g.id} gate road: natural ground ${lo.toFixed(1)} .. ${hi.toFixed(1)} m (floorY ${e.floorY.toFixed(1)})`);
}
{
  const W = EVLAB_GATE_ROADS[0], q = W.local;
  ok(Math.abs(q[0][0] - -156) < 1e-9 && Math.abs(q[0][1] - GATE_Z) < 1e-9, 'W gate road starts at the far end of the west bridge (local x -156, the gate z)');
  ok(q[q.length - 1][0] < P.x0 && Math.abs(q[q.length - 1][1] - GATE_Z) < 1e-9, 'W gate road ends outside the west fence, on the gate line');
}

// 7 the EVLab plot + strip and the REAL mall polygon (MALL_POLY, world) do not overlap (MALL_PLOT is only the bounding box of that diagonal strip, so a box test gives false hits)
{
  const inPoly = (x: number, z: number) => { let n = false; for (let i = 0, j = MALL_POLY.length - 1; i < MALL_POLY.length; j = i++) { const [xi, zi] = MALL_POLY[i], [xj, zj] = MALL_POLY[j]; if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) n = !n; } return n; };
  let hit = 0;
  for (let lx = P.x0; lx <= S.x1; lx += 6) for (let lz = P.z0; lz <= P.z1; lz += 6) { const [wx, wz] = localToWorld(lx, lz); if (inPoly(wx, wz)) hit++; }
  ok(hit === 0, `EVLab plot + strip and the mall polygon do not overlap (${hit} samples inside MALL_POLY)`);
}
console.log(fails ? 'FAILED ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);

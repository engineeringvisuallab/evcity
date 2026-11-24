// STEP HK-9c-1 check: the PAVING that joins the loop ramps to the ring on the node viaduct (HkDeckPaving.ts, drawn by HkInterchangeLayer).
// Headless: real TerrainGenerator / RoadNetwork, real RingStructureLayer solid of the node viaduct (the deck top the cars drive on). No Rapier needed (pure triangle height lookup).
// Run: HK=1 npx tsx scripts/hk-ring-run.ts hk-paving-check      (HK=0: proves that the switch OFF builds no paving)
import * as THREE from 'three';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RingStructureLayer } from '../src/roads/ring/RingStructureLayer';
import { HkInterchangeLayer } from '../src/roads/ring/HkInterchangeLayer';
import { hkFrame, hkRamps, hkRingOffset } from '../src/roads/ring/HkRamps';
import { buildHkAuxStrip, buildHkConnector, buildHkLaneMarks, buildHkTail, hkDeckLevel, hkTailIndices, HM9D, HP } from '../src/roads/ring/HkDeckPaving';
import { NODE_VIADUCT as N } from '../src/roads/ring/NodeViaductData';
import type { MeshData } from '../src/roads/ring/RingBridgeGeometry';
import RAPIER from '@dimforge/rapier3d-compat';
import { RingStructurePhysics } from '../src/roads/ring/RingStructurePhysics';
import { GM, CB, buildHkCrashBarrier, buildHkGoreMarks, hkArmAt } from '../src/roads/ring/HkGoreMarks';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(66)} ${detail}`); };
const f2 = (v: number): string => v.toFixed(2);

/** Highest solid surface under (x, z): triangles of the node-viaduct solid containing the point (top face), or NaN. */
function topAt(pos: Float32Array, idx: Uint32Array, x: number, z: number): number {
  let best = NaN;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const x0 = pos[a], z0 = pos[a + 2], x1 = pos[b], z1 = pos[b + 2], x2 = pos[c], z2 = pos[c + 2];
    const den = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
    if (Math.abs(den) < 1e-9) continue;
    const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / den, l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / den, l2 = 1 - l0 - l1;
    if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
    const y = l0 * pos[a + 1] + l1 * pos[b + 1] + l2 * pos[c + 1];
    if (!(y <= best)) best = y;
  }
  return best;
}

const vertsOf = (d: MeshData): number[][] => { const o: number[][] = []; for (let i = 0; i < d.positions.length; i += 3) o.push([d.positions[i], d.positions[i + 1], d.positions[i + 2]]); return o; };

const on = !!Config.roads.hatikamrul.enabled;
const gen = new TerrainGenerator(Config.world.seed);
const net = gen.roads;
console.log(`switch ${on ? 'ON' : 'OFF'}`);
const layer = new HkInterchangeLayer(new THREE.Group(), net, (x, z) => gen.heightAt(x, z));
if (!on) {
  check(layer.pavingMeshes === 0 && layer.safetyMeshes === 0 && layer.safetySolids.length === 0, 'P0 switch OFF: no paving, no cushion / barrier, no safety solid built', `${layer.pavingMeshes} + ${layer.safetyMeshes} meshes, ${layer.safetySolids.length} solids`);
  console.log(fails ? `FAILED ${fails}` : 'ALL PASS (OFF)');
  process.exit(fails ? 1 : 0);
}
const f = hkFrame(net)!;
const ramps = hkRamps(f);
const off = hkRingOffset(net);
const deckY = hkDeckLevel(net);
const ring = net.roads.find((r) => r.name === 'M8')!;

// P1 the layer builds 1 aux strip + 4 tails and still only the 4 ramp colliders (paving is visual only)
check(layer.pavingMeshes === 8, 'P1 paving meshes: 1 aux strip + 1 connector + 1 lane marks + 1 C-D gore marks + 4 loop tails', `${layer.pavingMeshes}`);
check(layer.solids.length === 4, 'P1 colliders unchanged: only the 4 ramps (paving is visual)', `${layer.solids.length} solids`);

// P2 aux strip geometry: finite, between the ring pavement edge and the deck edge, only on the node viaduct stretch, both sides
const aux = buildHkAuxStrip(net);
const av = vertsOf(aux);
let fin = true, uMin = Infinity, uMax = -Infinity, dMin = Infinity, dMax = -Infinity, left = 0, right = 0;
const kNode = Math.round(N.stationM / ring.step);
for (const [x, y, z] of av) {
  if (!Number.isFinite(x + y + z)) fin = false;
  const u = off(x, z); uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
  let bk = 0, bd = Infinity; for (let k = kNode - 40; k <= kNode + 40; k++) { const dd = Math.hypot(x - ring.xs[k], z - ring.zs[k]); if (dd < bd) { bd = dd; bk = k; } }
  const d = (bk - kNode) * ring.step; dMin = Math.min(dMin, d); dMax = Math.max(dMax, d);
  const side = (x - ring.xs[bk]) * ring.nx[bk] + (z - ring.zs[bk]) * ring.nz[bk]; if (side > 0) left++; else right++;
}
check(fin && av.length > 0, 'P2 aux strip: finite numbers, not empty', `${av.length} vertices, ${aux.indices.length / 3} triangles`);
check(uMin >= HP.pavementHalf - 0.3 && uMax <= N.deckHalf + 0.3, `P2 aux strip lies between ${HP.pavementHalf} m and the deck edge ${N.deckHalf} m`, `u ${f2(uMin)} .. ${f2(uMax)} m`);
check(left > 0 && right > 0, 'P2 aux strip on BOTH sides of the ring', `left ${left}, right ${right} vertices`);
check(dMin >= N.deckD0 - ring.step && dMax <= N.deckD1 + ring.step, `P2 aux strip only on the node deck (d ${N.deckD0} .. ${N.deckD1} m)`, `d ${f2(dMin)} .. ${f2(dMax)} m`);

// P3 the strip lies on the real deck top (the node-viaduct collider): level difference (strip - lift - deck top)
const rl = new RingStructureLayer(new THREE.Group(), net);
const sol = rl.solids[rl.solids.length - 1];
let worst = 0, nS = 0, missing = 0;
for (let i = 0; i < av.length; i += 4) { const [x, y, z] = av[i]; const top = topAt(sol.positions, sol.indices, x, z); if (Number.isNaN(top)) { missing++; continue; } nS++; worst = Math.max(worst, Math.abs(y - HP.stripLift - top)); }
check(nS > 20 && worst <= 0.05, 'P3 aux strip sits on the deck top (strip level - lift - deck top)', `${nS} samples, worst ${f2(worst)} m, ${missing} outside the collider`);

// P4 loop tails: 4, each starts where the ramp mesh stops (30 m from the ring axis) and ends on the ring lane (17.3 m), narrowing to a point
let okStart = true, okEnd = true, okTaper = true, worstLvl = 0, nT = 0, tails = 0, txt = '';
for (const rp of ramps) {
  const idx = hkTailIndices(rp, off); const t = buildHkTail(rp, off, deckY);
  if (idx.length < 2 || t.indices.length === 0) continue;
  tails++;
  const s = off(rp.xs[idx[0]], rp.zs[idx[0]]), e = off(rp.xs[idx[idx.length - 1]], rp.zs[idx[idx.length - 1]]);
  if (!(s > 29.9 && s < 36)) okStart = false;
  if (Math.abs(e - 17.3) > 0.4) okEnd = false;
  const tv = vertsOf(t), per = 6; const last = tv.slice(tv.length - per);
  const w = Math.hypot(last[0][0] - last[1][0], last[0][2] - last[1][2]); if (w > 0.2) okTaper = false;
  for (let i = 0; i < tv.length; i += per) { // the centre of every section (mean of the two asphalt edge vertices)
    const x = (tv[i][0] + tv[i + 1][0]) / 2, z = (tv[i][2] + tv[i + 1][2]) / 2, y = (tv[i][1] + tv[i + 1][1]) / 2;
    if (off(x, z) > N.deckHalf - 1) continue; const top = topAt(sol.positions, sol.indices, x, z); if (Number.isNaN(top)) continue; nT++; worstLvl = Math.max(worstLvl, Math.abs(y - HP.lift - top));
  }
  txt += `${rp.id} ${f2(s)}->${f2(e)} m, ${idx.length} pts; `;
}
check(tails === 4, 'P4 four loop tails exist', `${tails}: ${txt}`);
check(okStart, 'P4 every tail starts where the ramp mesh stops (30 m from the ring axis)', okStart ? 'start offsets 30 .. 36 m' : 'a tail starts elsewhere');
check(okEnd, 'P4 every tail ends on the ring lane (17.3 m from the axis +- 0.4)', okEnd ? 'yes' : 'a tail ends elsewhere');
check(okTaper, 'P4 every tail narrows to a point at the ring end (width <= 0.2 m)', okTaper ? 'yes' : 'too wide');
check(nT > 10 && worstLvl <= 0.2, 'P5 tail level equals the deck top where it lies on the deck (+- 0.2 m)', `${nT} samples, worst ${f2(worstLvl)} m`);

// P7 (HK-9c-3) under-deck connector arm end -> link start: ends match, width 22.1 -> 16.0, level linear, under the deck, close to the ground
{
  const cd = buildHkConnector(net, f, (x, z) => gen.heightAt(x, z)); const cv = vertsOf(cd), per = 6, rows = cv.length / per;
  const arm = net.roads.find((r) => r.name === 'J1-S')!, link = net.roads.find((r) => r.name === 'M6-1')!;
  const loc = (x: number, z: number): number[] => { const dx = x - f.ox, dz = z - f.oz; return [dx * f.ex + dz * f.ez, dx * f.nx + dz * f.nz]; };
  const row = (r: number): number[][] => cv.slice(r * per, r * per + per);
  const wOf = (r: number): number => Math.hypot(row(r)[0][0] - row(r)[1][0], row(r)[0][2] - row(r)[1][2]) / 2;
  const yAt = (r: number): number => (row(r)[0][1] + row(r)[1][1]) / 2;
  const [, yFirst] = loc((row(0)[0][0] + row(0)[1][0]) / 2, (row(0)[0][2] + row(0)[1][2]) / 2);
  const [, yLast] = loc((row(rows - 1)[0][0] + row(rows - 1)[1][0]) / 2, (row(rows - 1)[0][2] + row(rows - 1)[1][2]) / 2);
  check(rows > 2 && cv.every((v) => Number.isFinite(v[0] + v[1] + v[2])), 'P7 connector: built, finite', `${rows} sections`);
  check(Math.abs(yFirst) < 0.05 && yLast < -20 && yLast > -30, 'P7 connector runs from the arm end (y 0) to the link start (~ -25 m)', `y ${f2(yFirst)} .. ${f2(yLast)} m`);
  check(Math.abs(wOf(0) - arm.halfWidth) < 0.05 && Math.abs(wOf(rows - 1) - link.halfWidth) < 0.05, 'P7 connector half width = arm 22.1 at the start, link 16.0 at the end', `${f2(wOf(0))} -> ${f2(wOf(rows - 1))} m`);
  let gap = 0, under = true; for (let r = 0; r < rows; r++) { const [cx, cz] = [(row(r)[0][0] + row(r)[1][0]) / 2, (row(r)[0][2] + row(r)[1][2]) / 2]; gap = Math.max(gap, Math.abs(yAt(r) - HP.lift - gen.heightAt(cx, cz))); if (Math.abs(loc(cx, cz)[1]) > N.deckHalf) under = false; }
  check(under, 'P7 connector lies under the deck (|y| <= 25.75)', under ? 'yes' : 'sticks out');
  check(gap <= 0.5, 'P7 connector level vs ground on the axis (<= 0.5 m, no collider needed)', `worst ${f2(gap)} m`);
  console.log(`  INFO  connector level start ${f2(yAt(0) - HP.lift)} (arm end ${f2(arm.ys[arm.ys.length - 1])}), end ${f2(yAt(rows - 1) - HP.lift)} (link first ${f2(link.ys[0])}); ground may lift it a little`);
}


// P8 (HK-9d-1) lane-drop markings on the J1-S arm: east taper line y +260 .. +30, hatching y 0 .. +30, west lane-gain line y +25.75 .. +116
{
  const lm = buildHkLaneMarks(net, f), v = vertsOf(lm);
  const arm = net.roads.find((r) => r.name === 'J1-S')!;
  const loc = (x: number, z: number): number[] => { const dx = x - f.ox, dz = z - f.oz; return [dx * f.ex + dz * f.ez, dx * f.nx + dz * f.nz]; };
  let nearOk = true, gapMax = 0, yMin = Infinity, yMax = -Infinity, uEastMin = Infinity, uEastMax = -Infinity, uWestMin = Infinity, uWestMax = -Infinity;
  for (const p of v) {
    let bi = 0, bd = Infinity; for (let k = 0; k < arm.xs.length; k++) { const d = Math.hypot(arm.xs[k] - p[0], arm.zs[k] - p[2]); if (d < bd) { bd = d; bi = k; } }
    const k0 = Math.max(0, Math.min(arm.xs.length - 2, bi)); const k1 = k0 + 1;
    const tx = arm.xs[k1] - arm.xs[k0], tz = arm.zs[k1] - arm.zs[k0], tl = Math.hypot(tx, tz) || 1;
    let px = -tz / tl, pz = tx / tl; if (px * f.ex + pz * f.ez < 0) { px = -px; pz = -pz; }
    const u = (p[0] - arm.xs[bi]) * px + (p[2] - arm.zs[bi]) * pz;
    const [, ly] = loc(p[0], p[2]);
    yMin = Math.min(yMin, ly); yMax = Math.max(yMax, ly);
    gapMax = Math.max(gapMax, Math.abs(p[1] - HP.lift - 0.006 - arm.ys[bi]));
    if (u > 0) { uEastMin = Math.min(uEastMin, u); uEastMax = Math.max(uEastMax, u); } else { uWestMin = Math.min(uWestMin, -u); uWestMax = Math.max(uWestMax, -u); }
    if (!Number.isFinite(p[0] + p[1] + p[2])) nearOk = false;
  }
  check(v.length > 100 && nearOk, 'P8 lane marks: built, finite', `${v.length} vertices, ${lm.indices.length / 3} triangles`);
  check(yMin > -1.5 && yMax < 262, 'P8 lane marks lie between the arm end and the taper start (y 0 .. 260)', `y ${f2(yMin)} .. ${f2(yMax)} m`);
  check(uEastMin >= 15.3 && uEastMax <= 19.3, 'P8 east marks stay inside the closed outer lane (u 15.45 .. 19.10 +- 0.2)', `u ${f2(uEastMin)} .. ${f2(uEastMax)} m`);
  check(uWestMin >= 15.3 && uWestMax <= 19.3, 'P8 west lane-gain line stays inside the gained lane (u 15.45 .. 19.10 +- 0.2)', `u ${f2(uWestMin)} .. ${f2(uWestMax)} m`);
  check(gapMax <= 0.25, 'P8 lane marks lie on the arm surface level (the arm level + lift, +- 0.25 m)', `worst ${f2(gapMax)} m`);
}

// P9 (HK-9d-2) GORE markings of the 4 C-D roads + P10 CRASH CUSHION / BARRIER at the closed east lane (y +30 .. 0), with a collider probe through the real RingStructurePhysics + Rapier
await RAPIER.init();
{
  type Poly = { xs: ArrayLike<number>; zs: ArrayLike<number>; ys: ArrayLike<number> };
  const roadOf = (n: string): Poly & { halfWidth: number } => net.roads.find((r) => r.name === n)! as never;
  const polyHit = (r: Poly, x: number, z: number): { d: number; lvl: number } => {
    let best = Infinity, lvl = 0;
    for (let i = 0; i < r.xs.length - 1; i++) {
      const bx = r.xs[i + 1] - r.xs[i], bz = r.zs[i + 1] - r.zs[i], l2 = bx * bx + bz * bz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - r.xs[i]) * bx + (z - r.zs[i]) * bz) / l2)) : 0;
      const d = Math.hypot(x - r.xs[i] - bx * t, z - r.zs[i] - bz * t);
      if (d < best) { best = d; lvl = r.ys[i] + (r.ys[i + 1] - r.ys[i]) * t; }
    }
    return { d: best, lvl };
  };
  const locY = (x: number, z: number): number => (x - f.ox) * f.nx + (z - f.oz) * f.nz;
  const gs = buildHkGoreMarks(net, f), gv = vertsOf(gs.mesh);
  const want: Record<string, string> = { 'CD-E-N': 'diverge', 'CD-W-S': 'diverge', 'CD-W-N': 'merge', 'CD-E-S': 'merge' };
  check(gs.zones.length === 4 && gv.length > 0 && gv.every((v) => Number.isFinite(v[0] + v[1] + v[2])), 'P9 gore marks: 4 gores found, mesh built, finite', `${gs.zones.length} gores, ${gv.length} vertices, ${gs.mesh.indices.length / 3} triangles`);
  console.log(gs.zones.map((z) => `  INFO  ${z.id.padEnd(7)} ${z.kind.padEnd(8)} on ${z.main.padEnd(4)} paved wedge y ${f2(z.yTip)} (tip) .. ${f2(z.yWide)}, ${f2(z.length)} m long, ${f2(z.wMax)} m wide at the wide end, ${z.nHatch} hatch + ${z.nChevron} chevrons`).join('\n'));
  check(gs.zones.every((z) => want[z.id] === z.kind), 'P9 exits / entries read right: diverge CD-E-N, CD-W-S; merge CD-W-N, CD-E-S', gs.zones.map((z) => `${z.id} ${z.kind}`).join(', '));
  check(gs.zones.every((z) => z.nChevron >= 3 && z.nHatch >= 2), 'P9 every gore has hatching (>= 2 stripes) and chevrons (>= 3)', gs.zones.map((z) => `${z.id} ${z.nHatch}/${z.nChevron}`).join(', '));
  const cds = ['CD-E-N', 'CD-W-N', 'CD-E-S', 'CD-W-S'].map((id) => ({ id, cd: roadOf(`HK-${id}`), main: gs.zones.find((z) => z.id === id)! }));
  let nInMain = 0, nInCd = 0, nAsph = 0, worstLvl = 0, minYArm = Infinity;
  for (const [x, y, z] of gv) {
    let bi = 0, bd = Infinity; cds.forEach((c, i) => { const d = polyHit(c.cd, x, z).d; if (d < bd) { bd = d; bi = i; } });
    const c = cds[bi], mr = roadOf(c.main.main), dM = polyHit(mr, x, z);
    if (dM.d < c.main.edgeMain + 0.075 - 0.02) nInMain++;
    if (bd < GM.edgeC + GM.edgeHalf - 0.02) nInCd++;
    if (!(dM.d <= c.main.mainHalf + 0.02 || bd <= GM.rampHalf + 0.02)) nAsph++;
    worstLvl = Math.max(worstLvl, Math.abs(y - HP.lift - GM.mark - dM.lvl));
    if (c.main.main === 'J1-S') minYArm = Math.min(minYArm, locY(x, z));
  }
  check(nInMain === 0 && nInCd === 0, 'P9 paint stays between the main lane edge line and the C-D edge line (no vertex on a line)', `${nInMain} on the main edge line, ${nInCd} on the C-D edge line`);
  check(nAsph === 0, 'P9 paint lies on asphalt (main pavement or C-D pavement), not on the unpaved verge', `${nAsph} vertices off asphalt`);
  check(worstLvl <= 0.25, 'P9 paint lies on the surface (main road level + lift, +- 0.25 m)', `worst ${f2(worstLvl)} m`);
  check(minYArm >= 260 + 100, 'P9 arm gores are >= 100 m from the lane-drop marks (taper starts y 260)', `lowest arm gore vertex y ${f2(minYArm)} m`);

  // P10 crash cushion + barrier
  const cb = buildHkCrashBarrier(net, f), cv = vertsOf(cb.mesh), arm = roadOf('J1-S');
  check(cv.length > 0 && cv.every((v) => Number.isFinite(v[0] + v[1] + v[2])) && layer.safetyMeshes === 1, 'P10 cushion + barrier: built, finite, one mesh in the layer', `${cv.length} vertices, ${cb.info.triangles} triangles`);
  let latMin = Infinity, latMax = -Infinity, yMin = Infinity, yMax = -Infinity, hMin = Infinity, hMax = -Infinity, clear = Infinity, nClear = 0;
  for (const [x, y, z] of cv) {
    const h = polyHit(arm, x, z); latMin = Math.min(latMin, h.d); latMax = Math.max(latMax, h.d);
    const ly = locY(x, z); yMin = Math.min(yMin, ly); yMax = Math.max(yMax, ly);
    hMin = Math.min(hMin, y - h.lvl); hMax = Math.max(hMax, y - h.lvl);
    if (Math.abs(ly) <= N.deckHalf) { const top = topAt(sol.positions, sol.indices, x, z); if (!Number.isNaN(top)) { nClear++; clear = Math.min(clear, top - N.depthMid - y); } }
  }
  check(latMin >= HM9D.laneInner && latMax <= HM9D.laneOuter, `P10 everything lies inside the closed lane (u ${HM9D.laneInner} .. ${HM9D.laneOuter} m from the arm axis)`, `u ${f2(latMin)} .. ${f2(latMax)} m`);
  check(Math.abs(yMax - CB.y0) <= 0.1 && yMin <= 0.1 && yMin >= -0.1, 'P10 cushion nose at y +30 (end of the taper), barrier ends at y 0', `y ${f2(yMin)} .. ${f2(yMax)} m`);
  check(Math.abs(hMin) <= 0.05 && Math.abs(hMax - CB.cushionH) <= 0.05, 'P10 stands on the road surface (lowest 0 m) and the cushion is 0.9 m high', `height over the surface ${f2(hMin)} .. ${f2(hMax)} m`);
  check(nClear > 5 && clear >= 4.5, 'P10 clearance under the node deck soffit (deck top - 1.4 m) >= 4.5 m', `${nClear} samples, least ${f2(clear)} m`);
  check(latMin - HM9D.laneInner >= 1.0, 'P10 gap from the barrier to the edge of the open lane 3 >= 1.0 m', `${f2(latMin - HM9D.laneInner)} m`);

  // P10 collider decision, in numbers. Real RingStructurePhysics, Rapier, no gravity; ball r 0.4 m, CCD on.
  check(layer.safetySolids.length === 1 && layer.solids.length === 4, 'P10 collider: 1 safety solid; the 4 ramp solids are unchanged', `${layer.safetySolids.length} + ${layer.solids.length}`);
  const sl = layer.safetySolids[0], rampTris = layer.solids.reduce((a, s) => a + s.indices.length / 3, 0);
  console.log(`  INFO  collider cost: ${sl.indices.length / 3} triangles, 1 fixed body, radius ${f2(sl.radius)} m, alive within ${300 + Math.round(sl.radius)} m of it (PhysicsConfig.activeRadius 300); the 4 ramps hold ${rampTris} triangles, so +${(100 * sl.indices.length / 3 / rampTris).toFixed(1)} %`);
  const shoot = (withSolid: boolean, sx: number, sy: number, sz: number, vx: number, vy: number, vz: number, steps: number): { x: number; y: number; z: number } => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const phys = new RingStructurePhysics({ RAPIER, world } as never, { origin: { x: 0, z: 0 } } as never, withSolid ? layer.safetySolids : []);
    phys.update(1, sl.cx, sl.cz);
    const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(sx, sy, sz).setLinvel(vx, vy, vz).setCcdEnabled(true));
    world.createCollider(RAPIER.ColliderDesc.ball(0.4), ball);
    for (let s = 0; s < steps; s++) world.step();
    const t = ball.translation(); phys.dispose(); return { x: t.x, y: t.y, z: t.z };
  };
  {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const phys = new RingStructurePhysics({ RAPIER, world } as never, { origin: { x: 0, z: 0 } } as never, layer.safetySolids);
    phys.update(1, sl.cx + sl.radius + 300 + 800, sl.cz); const far = phys.activeCount; phys.update(1, sl.cx, sl.cz);
    check(far === 0 && phys.activeCount === 1, 'P10 collider is created / removed by the player distance (RingStructurePhysics)', `far ${far}, near ${phys.activeCount}`);
  }
  const uc = (HM9D.laneInner + HM9D.laneOuter) / 2, a60 = hkArmAt(net, f, 60, uc)!, a30 = hkArmAt(net, f, 30, uc)!, a12 = hkArmAt(net, f, 12, uc)!, a12s = hkArmAt(net, f, 12, uc + 3)!;
  const V = 25; // m/s = 90 km/h head-on shot along the lane centre at 0.5 m height, from y +60 southbound
  const hy = a30.y + 0.5;
  const withS = shoot(true, a60.x, hy, a60.z, -a60.tx * V, 0, -a60.tz * V, 120), noS = shoot(false, a60.x, hy, a60.z, -a60.tx * V, 0, -a60.tz * V, 120);
  check(locY(withS.x, withS.z) >= 29.5, 'P10 ball 90 km/h head-on at the cushion nose is STOPPED at y +30 (with collider)', `ends y ${f2(locY(withS.x, withS.z))} m`);
  check(locY(noS.x, noS.z) < 25, 'P10 same shot WITHOUT a collider drives straight through the nose (y < 25)', `ends y ${f2(locY(noS.x, noS.z))} m`);
  const nE = { x: a12s.x - a12.x, z: a12s.z - a12.z }, nl = Math.hypot(nE.x, nE.z);
  const sideS = shoot(true, a12s.x, a12.y + 0.5, a12s.z, -nE.x / nl * 15, 0, -nE.z / nl * 15, 120), sideN = shoot(false, a12s.x, a12.y + 0.5, a12s.z, -nE.x / nl * 15, 0, -nE.z / nl * 15, 120);
  const latOf = (p: { x: number; z: number }): number => polyHit(arm, p.x, p.z).d - uc;
  check(latOf(sideS) > 0.55 && latOf(sideS) < 0.9, 'P10 ball from the side stops at the barrier face (half 0.3 m + ball 0.4 m)', `rests ${f2(latOf(sideS))} m from the barrier axis`);
  check(latOf(sideN) < 0, 'P10 same side shot WITHOUT a collider passes through the barrier', `ends ${f2(latOf(sideN))} m from the barrier axis`);
}

// P6 triangles face up (normal y > 0) so the polygon-offset surface lights like the road
let up = 0, tot = 0;
const countUp = (d: MeshData): void => { for (let t = 0; t < d.indices.length; t += 3) { const a = d.indices[t] * 3, b = d.indices[t + 1] * 3, c = d.indices[t + 2] * 3; const ux = d.positions[b] - d.positions[a], uz = d.positions[b + 2] - d.positions[a + 2], vx = d.positions[c] - d.positions[a], vz = d.positions[c + 2] - d.positions[a + 2]; tot++; if (uz * vx - ux * vz > 0) up++; } };
countUp(aux); for (const rp of ramps) countUp(buildHkTail(rp, off, deckY));
console.log(`  INFO  triangles facing up ${up} of ${tot} (the material is double sided, so a mixed result is only a lighting matter)`);

console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);

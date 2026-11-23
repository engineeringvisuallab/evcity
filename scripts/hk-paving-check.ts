// STEP HK-9c-1 check: the PAVING that joins the loop ramps to the ring on the node viaduct (HkDeckPaving.ts, drawn by HkInterchangeLayer).
// Headless: real TerrainGenerator / RoadNetwork, real RingStructureLayer solid of the node viaduct (the deck top the cars drive on). No Rapier needed (pure triangle height lookup).
// Run: HK=1 npx tsx scripts/hk-ring-run.ts hk-paving-check      (HK=0: proves that the switch OFF builds no paving)
import * as THREE from 'three';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RingStructureLayer } from '../src/roads/ring/RingStructureLayer';
import { HkInterchangeLayer } from '../src/roads/ring/HkInterchangeLayer';
import { hkFrame, hkRamps, hkRingOffset } from '../src/roads/ring/HkRamps';
import { buildHkAuxStrip, buildHkConnector, buildHkLaneMarks, buildHkTail, hkDeckLevel, hkTailIndices, HP } from '../src/roads/ring/HkDeckPaving';
import { NODE_VIADUCT as N } from '../src/roads/ring/NodeViaductData';
import type { MeshData } from '../src/roads/ring/RingBridgeGeometry';

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
  check(layer.pavingMeshes === 0, 'P0 switch OFF: no paving built', `${layer.pavingMeshes} meshes`);
  console.log(fails ? `FAILED ${fails}` : 'ALL PASS (OFF)');
  process.exit(fails ? 1 : 0);
}
const f = hkFrame(net)!;
const ramps = hkRamps(f);
const off = hkRingOffset(net);
const deckY = hkDeckLevel(net);
const ring = net.roads.find((r) => r.name === 'M8')!;

// P1 the layer builds 1 aux strip + 4 tails and still only the 4 ramp colliders (paving is visual only)
check(layer.pavingMeshes === 7, 'P1 paving meshes: 1 aux strip + 1 connector + 1 lane marks + 4 loop tails', `${layer.pavingMeshes}`);
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

// P6 triangles face up (normal y > 0) so the polygon-offset surface lights like the road
let up = 0, tot = 0;
const countUp = (d: MeshData): void => { for (let t = 0; t < d.indices.length; t += 3) { const a = d.indices[t] * 3, b = d.indices[t + 1] * 3, c = d.indices[t + 2] * 3; const ux = d.positions[b] - d.positions[a], uz = d.positions[b + 2] - d.positions[a + 2], vx = d.positions[c] - d.positions[a], vz = d.positions[c + 2] - d.positions[a + 2]; tot++; if (uz * vx - ux * vz > 0) up++; } };
countUp(aux); for (const rp of ramps) countUp(buildHkTail(rp, off, deckY));
console.log(`  INFO  triangles facing up ${up} of ${tot} (the material is double sided, so a mixed result is only a lighting matter)`);

console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);

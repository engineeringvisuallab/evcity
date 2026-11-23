// STEP HK-9a check: the four loop ramps (HkRampData) put on the REAL ring / J1-S arm / M6-1 link of the game (switch ON): frame, joins, levels, grade, radius, fill.
// Run: HK=1 npx tsx scripts/hk-ring-run.ts hk-ramps-check
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { hkFrame, hkRamps } from '../src/roads/ring/HkRamps';
import { HK_LOOPS } from '../src/roads/ring/HkRampData';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(66)} ${detail}`); };
const f2 = (v: number): string => v.toFixed(2);
const DEG = 180 / Math.PI;
const gen = new TerrainGenerator(Config.world.seed);
const net = gen.roads;
const ring = net.roads.find((r) => r.name === 'M8')!, arm = net.roads.find((r) => r.name === 'J1-S')!, link = net.roads.find((r) => r.name === 'M6-1')!;
const f = hkFrame(net);
if (!f) { console.log('  FAIL  frame: ring M8 or arm J1-S missing (switch OFF? the arms / island link need Config defaults)'); process.exit(1); }
const ramps = hkRamps(f);

type R = typeof ring;
const nearest = (r: R, x: number, z: number): number => { let bi = 0, bd = Infinity; for (let k = 0; k < r.xs.length; k++) { const d = Math.hypot(r.xs[k] - x, r.zs[k] - z); if (d < bd) { bd = d; bi = k; } } return bi; };
// lateral offset (m, absolute) of a point from a road polyline: distance to the nearest SEGMENT
const lateral = (r: R, x: number, z: number): { d: number; k: number } => { let bd = Infinity, bk = 0; for (let k = 0; k + 1 < r.xs.length; k++) { const ax = r.xs[k], az = r.zs[k], bx = r.xs[k + 1] - ax, bz = r.zs[k + 1] - az, l2 = bx * bx + bz * bz; let t = l2 > 0 ? ((x - ax) * bx + (z - az) * bz) / l2 : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(x - ax - bx * t, z - az - bz * t); if (d < bd) { bd = d; bk = k; } } return { d: bd, k: bk }; };

// R1 frame
check(f.squareErrDeg <= 1, 'R1 ring direction and arm direction are square (90 deg +- 1)', `error ${f2(f.squareErrDeg)} deg`);
const l0 = [link.xs[0] - f.ox, link.zs[0] - f.oz]; const a0 = [arm.xs[nearest(arm, f.ox, f.oz) > 5 ? 0 : arm.xs.length - 1] - f.ox, arm.zs[nearest(arm, f.ox, f.oz) > 5 ? 0 : arm.xs.length - 1] - f.oz];
check(l0[0] * f.nx + l0[1] * f.nz < -20, 'R1 the link starts SOUTH of the node (local y < -20)', `link start local y ${f2(l0[0] * f.nx + l0[1] * f.nz)} m, local x ${f2(l0[0] * f.ex + l0[1] * f.ez)} m`);
void a0;

let worstEndOff = 0, worstEndHead = 0, worstEndY = 0, worstStartY = 0, worstStartOff = 0, worstPeak = 0, worstPeakDiff = 0, minR = Infinity;
const info: string[] = [];
for (const rp of ramps) {
  const n = rp.xs.length, ringEnd = rp.ringEnd, cdEnd = ringEnd === 0 ? n - 1 : 0;
  const lat = lateral(ring, rp.xs[ringEnd], rp.zs[ringEnd]);
  // R2 the ring end lies on the lane centre (17.3 m from the ring centreline, HK-5 numbers) 
  const offEnd = Math.abs(lat.d - 17.3); worstEndOff = Math.max(worstEndOff, offEnd);
  // R3 heading at the ring end parallel to the ring
  const k = ringEnd === 0 ? 1 : n - 2; const hx = rp.xs[ringEnd] - rp.xs[k], hz = rp.zs[ringEnd] - rp.zs[k]; const rx = ring.xs[lat.k + 1] - ring.xs[lat.k], rz = ring.zs[lat.k + 1] - ring.zs[lat.k];
  let ang = Math.acos(Math.max(-1, Math.min(1, Math.abs(hx * rx + hz * rz) / (Math.hypot(hx, hz) * Math.hypot(rx, rz))))) * DEG; worstEndHead = Math.max(worstEndHead, ang);
  // R4 level at the ring end = ring level there
  const ky = nearest(ring, rp.xs[ringEnd], rp.zs[ringEnd]); const dy = Math.abs(rp.ys[ringEnd] - ring.ys[ky]); worstEndY = Math.max(worstEndY, dy);
  // R5 the C-D end: offset from the arm (NE, NW: 29.3 m) / the link (SE, SW: 23.2 m) and level
  const onArm = rp.id === 'HK-NE' || rp.id === 'HK-NW'; const road = onArm ? arm : link; const want = onArm ? 29.3 : 23.2;
  const l2 = lateral(road, rp.xs[cdEnd], rp.zs[cdEnd]); worstStartOff = Math.max(worstStartOff, Math.abs(l2.d - want));
  const roadY = road.ys[l2.k]; const dyS = Math.abs(rp.ys[cdEnd] - roadY); worstStartY = Math.max(worstStartY, dyS);
  // R6 grade; R7 radius (circumradius of every 3rd point triple, 3 x ~4 m apart)
  let peak = 0; for (let i = 1; i < n; i++) peak = Math.max(peak, Math.abs(rp.ys[i] - rp.ys[i - 1]) / (rp.cum[i] - rp.cum[i - 1]));
  worstPeak = Math.max(worstPeak, peak); const L = HK_LOOPS.find((q) => q.id === rp.id)!; worstPeakDiff = Math.max(worstPeakDiff, Math.abs(peak - L.peak));
  for (let i = 3; i + 3 < n; i += 3) { const ax = rp.xs[i - 3], az = rp.zs[i - 3], bx = rp.xs[i], bz = rp.zs[i], cx = rp.xs[i + 3], cz = rp.zs[i + 3]; const A = Math.hypot(bx - ax, bz - az), B = Math.hypot(cx - bx, cz - bz), C = Math.hypot(cx - ax, cz - az); const area2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)); if (area2 > 1e-6) minR = Math.min(minR, (A * B * C) / (2 * area2)); }
  // fill under the ramp (natural + carved ground at the centreline): INFO against the HK-5 numbers
  let fill = -Infinity; for (let i = 0; i < n; i++) fill = Math.max(fill, rp.ys[i] - gen.heightAt(rp.xs[i], rp.zs[i]));
  info.push(`${rp.id}: ring end ${f2(lat.d)} m off the ring axis, ${f2(ang)} deg, level ${f2(rp.ys[ringEnd])} vs ring ${f2(ring.ys[ky])}; C-D end ${f2(l2.d)} m off the ${onArm ? 'arm' : 'link'}, level ${f2(rp.ys[cdEnd])} vs road ${f2(roadY)}; peak grade ${(peak * 100).toFixed(2)} %; max height over the ground ${f2(fill)} m`);
}
for (const s of info) console.log('  info  ' + s);
check(worstEndOff <= 0.3, 'R2 loop ends lie on the ring lane centre (17.3 m from the axis +- 0.3)', `worst ${f2(worstEndOff)} m`);
check(worstEndHead <= 1.5, 'R3 loop ends are parallel to the ring (+- 1.5 deg)', `worst ${f2(worstEndHead)} deg`);
check(worstEndY <= 0.15, 'R4 loop end level equals the ring level there (+- 0.15 m)', `worst ${f2(worstEndY)} m`);
check(worstStartOff <= 0.3, 'R5 loop start lies on the C-D line (arm 29.3 m, link 23.2 m, +- 0.3)', `worst ${f2(worstStartOff)} m`);
check(worstStartY <= 0.15, 'R5 loop start level equals the arm / link level there (+- 0.15 m)', `worst ${f2(worstStartY)} m`);
check(worstPeak <= 0.05, 'R6 ramp grade <= 5 % (H1)', `worst ${(worstPeak * 100).toFixed(2)} %`);
check(worstPeakDiff <= 0.003, 'R6 grade equals the HK-5 number (+- 0.3 %)', `worst difference ${(worstPeakDiff * 100).toFixed(2)} %`);
check(minR >= 75.9, 'R7 radius >= 75.9 m (Validate.ts for V45)', `min circumradius ${f2(minR)} m`);
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);

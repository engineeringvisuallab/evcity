// Part 2: J6 design candidates through the real interchange model. Run: npx tsx scripts/j6-design.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { buildInterchange, decelLength, accelLength, stoppingSight } from '../src/interchange';
import { minRadius as minRadiusPts } from '../src/interchange/Geometry2D';
import { minRadius } from '../src/interchange/Standards';
const g: any = new TerrainGenerator(Config.world.seed);
const R = g.roads; const pad = R.pads.find((p: any) => p.id === 6); const hw = R.roads[5]; const s4 = R.roads[24];
const ground = (x: number, z: number): number => (g.heightAt ? g.heightAt(x, z) : g.getHeight(x, z));
const k0 = hw.xs.reduce((b: number, _: number, i: number) => (Math.hypot(hw.xs[i] - pad.x, hw.zs[i] - pad.z) < Math.hypot(hw.xs[b] - pad.x, hw.zs[b] - pad.z) ? i : b), 0);
const yaw = Math.atan2(hw.zs[k0 + 1] - hw.zs[k0 - 1], hw.xs[k0 + 1] - hw.xs[k0 - 1]);
const cy = Math.cos(yaw), sy = Math.sin(yaw);
const W = (u: number, v: number) => ({ x: pad.x + u * cy + v * sy, z: pad.z + u * sy - v * cy });
// F6 profile y(u)
const f6y = (u: number): number => { let best = 0, bd = 1e9; for (let i = 0; i < hw.xs.length; i++) { const d = Math.hypot(hw.xs[i] - W(u, 0).x, hw.zs[i] - W(u, 0).z); if (d < bd) { bd = d; best = i; } } return hw.ys[best]; };
const sec = (r: any, lanes: number) => ({ roadId: r.id, halfWidth: r.halfWidth, kerbLane: r.medianHalf > 0 ? r.medianHalf + r.laneW * (lanes - 0.5) : r.halfWidth - r.laneW / 2, laneW: r.laneW, lanesPerDir: lanes, designKmh: r.speedKmh });
const main = sec(hw, 3), cross = sec(s4, 1);
console.log('main', main, '\ncross', cross);
console.log('\nStandards at 100 km/h highway: decel to 50 km/h =', decelLength(100, 50).toFixed(0), 'm, accel 50->85 =', accelLength(100, 50).toFixed(0), 'm; SSD 100 =', stoppingSight(100).toFixed(0), 'm; Rmin(50)=', minRadius(50).toFixed(0), 'm; Rmin(35)=', minRadius(35).toFixed(0), 'm, Rmin(100)=', minRadius(100).toFixed(0));
const cases: Array<[string, string, number, 'main' | 'cross']> = [
  ['diamond u=-68 (F6 over)', 'diamond', -68, 'main'],
  ['diamond u=-68 (cross over)', 'diamond', -68, 'cross'],
  ['parclo u=-68', 'parclo', -68, 'main'],
  ['cloverleaf u=-68', 'cloverleaf', -68, 'main'],
];
for (const [name, pattern, u0, upper] of cases) {
  const c = W(u0, 0);
  const y0 = ground(c.x, c.z);
  const spec: any = { id: 'J6', pattern, x: c.x, z: c.z, y: f6y(u0) - 0, yaw, main, cross, upper };
  const m = buildInterchange(spec, ground);
  console.log(`\n=== ${name}: y0=${spec.y.toFixed(1)} (ground ${y0.toFixed(1)}) footprintR=${m.footprintR.toFixed(0)} rise=${m.levels.rise.toFixed(1)} flat=${m.levels.flat.toFixed(0)} rampLen=${m.levels.rampLen.toFixed(0)}`);
  for (const r of m.ramps) {
    let maxCut = -99, maxFill = -99;
    for (let i = 0; i < r.xs.length; i++) { const d = r.ys[i] - ground(r.xs[i], r.zs[i]); maxFill = Math.max(maxFill, d); maxCut = Math.max(maxCut, -d); }
    console.log(`  ${r.id.padEnd(12)} ${r.role.padEnd(10)} len=${r.length.toFixed(0).padStart(4)} V=${r.designKmh} Rmin=${minRadiusPts(r.local).toFixed(0)} fill<=${maxFill.toFixed(1)} cut<=${maxCut.toFixed(1)} elevated=${r.elevated.length}`);
  }
  // how far the level plan departs from the real F6 / S4 profile (flat-ground assumption)
  let dm = 0; for (let t = -m.levels.flat - m.levels.rampLen; t <= m.levels.flat + m.levels.rampLen; t += 10) dm = Math.max(dm, Math.abs(m.yOf('main', t) - f6y(u0 + t)));
  console.log(`  level plan vs real F6 profile: max |dy| = ${dm.toFixed(1)} m (flat-ground assumption)`);
  console.log('  issues:', m.issues.length ? m.issues.map((i: any) => `${i.level}:${i.code}:${i.message}`).join(' | ') : 'none');
}

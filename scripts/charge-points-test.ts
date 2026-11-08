// Small stations + charge points (headless): npx tsx scripts/charge-points-test.ts
// every CHARGE_LOTS rectangle: no overlap with a parking lot, a small station, the main station or another charge point; not inside the mall; dry and nearly flat;
// chargeAreaAt finds it (paid), the old free EV Lab depot is gone; the structures module builds (browser canvas stubbed).
import * as THREE from 'three';
import { CHARGE_LOTS, FUEL_LOTS, MAIN_STATION_LOT, PARKING_LOTS, lotToWorld } from '../src/parking/ParkingSite';
import { chargeAreaAt, fuelAreaAt } from '../src/vehicles/FuelAreas';
import { MALL_BUILDING } from '../src/mall/MallSite';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';

const ctx: unknown = new Proxy(function () {}, { get: (_t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => ctx), set: () => true });
(globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
const { StationStructures } = await import('../src/parking/StationStructures');

let bad = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const g = new TerrainGenerator(Config.world.seed);
const sc = g.makeSample(), s2 = g.makeSample();
const overlap = (a: { s0: number; s1: number; n0: number; n1: number }, b: { s0: number; s1: number; n0: number; n1: number }, m = 0): boolean => a.s0 < b.s1 + m && a.s1 > b.s0 - m && a.n0 < b.n1 + m && a.n1 > b.n0 - m;
function inMall(x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = MALL_BUILDING.length - 1; i < MALL_BUILDING.length; j = i++) {
    const [xi, zi] = MALL_BUILDING[i], [xj, zj] = MALL_BUILDING[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
ok(CHARGE_LOTS.length === 8, '8 charge points (CP-01 .. CP-08)');
for (const c of CHARGE_LOTS) {
  const lots = [...PARKING_LOTS.filter((l) => l.id !== 'evlab'), ...FUEL_LOTS, MAIN_STATION_LOT, ...CHARGE_LOTS.filter((o) => o !== c)];
  const hit = lots.find((l) => overlap(c, l, 0.5));
  let wet = 0, mall = 0, lo = 1e9, hi = -1e9;
  for (let s = c.s0; s <= c.s1; s += 1) for (let n = c.n0; n <= c.n1; n += 1) {
    const w = lotToWorld(s, n); g.sample(w.x, w.z, sc); lo = Math.min(lo, sc.h); hi = Math.max(hi, sc.h);
    if (!Number.isNaN(sc.water) && sc.h <= sc.water + 0.3) wet++;
    if (inMall(w.x, w.z)) mall++;
  }
  ok(!hit && wet === 0 && mall === 0 && hi - lo < 1.5, `${c.id}: free of lots/stations (${hit ? 'hits ' + hit.id : 'ok'}), dry, outside the mall, relief ${(hi - lo).toFixed(2)} m`);
  const w = lotToWorld((c.s0 + c.s1) / 2, (c.n0 + c.n1) / 2);
  const a = chargeAreaAt(w.x, w.z);
  ok(!!a && a.id === c.id && !a.free && fuelAreaAt(w.x, w.z) === null, `${c.id}: chargeAreaAt finds it (paid)`);
}
// the EV Lab lot is no longer a free depot
const ev = lotToWorld(48, 28);
ok(chargeAreaAt(ev.x, ev.z) === null, 'EV Lab lot (outside CP-01) is no longer a free charge depot');
// structures build
const root = new THREE.Group();
const st = new StationStructures({ root, terrain: { heightAt: () => 0 } });
let meshes = 0; root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
console.log(`  ${meshes} meshes for ${FUEL_LOTS.length} stations + ${CHARGE_LOTS.length} charge points`);
ok(meshes > 100 && meshes < 600, 'structures are light (under 600 meshes)');
st.dispose();
console.log(bad === 0 ? 'ALL PASS' : `${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);

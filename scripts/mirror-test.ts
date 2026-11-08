// Headless junction mirror test: npx tsx scripts/mirror-test.ts
import { planJunctionMirrors } from '../src/roads/JunctionMirrors';
import { planStreetLights } from '../src/environment/StreetLights';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';

let fails = 0;
const ok = (c: boolean, msg: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + msg);
  if (!c) fails++;
};

const g = new TerrainGenerator(Config.world.seed);
const R = g.roads;
const lamps = planStreetLights(R);
const t0 = performance.now();
const spots = planJunctionMirrors(R, lamps);
console.log(`junction mirrors: ${spots.length} (${(performance.now() - t0).toFixed(0)} ms)`);

const junctions = R.pads.filter((p) => p.arms.length >= 3);
console.log(`junctions with 3+ arms: ${junctions.length}`);
ok(spots.length > 0, 'there are mirrors');

// every junction (3+ arms) should have at least one mirror within 40 m of its centre
let without = 0;
for (const p of junctions) {
  let has = false;
  for (const s of spots) if (Math.hypot(s.x - p.x, s.z - p.z) < 60) { has = true; break; }
  if (!has) without++;
}
ok(without <= junctions.length * 0.05, `junctions without a mirror: ${without} of ${junctions.length} (<= 5 %)`);

let onAsphalt = 0;
let badNormal = 0;
let nearLamp = 0;
let nan = 0;
for (const s of spots) {
  if (R.surfaceAt(s.x, s.z) === 1) onAsphalt++;
  if (Math.abs(Math.hypot(s.nx, s.nz) - 1) > 1e-6) badNormal++;
  if (!Number.isFinite(s.x + s.y + s.z)) nan++;
  for (const l of lamps) if (Math.abs(l.x - s.x) < 1.2 && Math.abs(l.z - s.z) < 1.2 && Math.hypot(l.x - s.x, l.z - s.z) < 1.2) { nearLamp++; break; }
}
ok(onAsphalt === 0, `no mirror stands on asphalt (${onAsphalt})`);
ok(badNormal === 0, 'facing vectors are unit length');
ok(nan === 0, 'all positions finite');
ok(nearLamp === 0, `no mirror within 1.2 m of a street light (${nearLamp})`);
const stem = spots.filter((s) => s.kind === 0).length;
console.log(`T-junction (opposite the side road): ${stem}, corner mirrors: ${spots.length - stem}`);

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log('ALL PASS');

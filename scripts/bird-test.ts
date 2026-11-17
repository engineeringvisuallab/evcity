// Headless bird test: npx tsx scripts/bird-test.ts
import * as THREE from 'three';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BirdManager } from '../src/birds/BirdManager';
import { createBirdGeometry } from '../src/birds/BirdModel';
import { BIRD_NAMES, BIRD_SPECS, buildBirdData } from '../src/birds/BirdShapes';
import { Config } from '../src/core/Config';

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};
const gen = new TerrainGenerator(Config.world.seed);
const root = new THREE.Group();
const birds = new BirdManager(root, gen, Config.world.seed);
console.log(`${birds.flockCount} flocks / single birds, ${birds.total} birds, ${birds.soloCount} single birds, ${birds.speciesCount} species`);
ok(birds.soloCount >= 2, 'there are single birds');
ok(birds.speciesCount >= 6, 'several species at once');
const g = createBirdGeometry();
ok(g.getAttribute('aWing').count === g.getAttribute('position').count, 'every bird vertex has a wing weight');

// --- the shapes: 10 species, each a real bird (head, beak, eyes, tail, legs, wings) ---
ok(BIRD_NAMES.length >= 10, `at least 10 species (${BIRD_NAMES.join(', ')})`);
for (const name of BIRD_NAMES) {
  const d = buildBirdData(name);
  const s = BIRD_SPECS[name];
  const nv = d.pos.length / 3;
  let maxX = 0;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let wingMin = 1;
  let wingMax = 0;
  for (let i = 0; i < nv; i++) {
    maxX = Math.max(maxX, Math.abs(d.pos[i * 3]));
    minZ = Math.min(minZ, d.pos[i * 3 + 2]);
    maxZ = Math.max(maxZ, d.pos[i * 3 + 2]);
    wingMin = Math.min(wingMin, d.wing[i]);
    wingMax = Math.max(wingMax, d.wing[i]);
  }
  const finite = d.pos.every(Number.isFinite) && d.col.every(Number.isFinite) && d.wing.every(Number.isFinite);
  const valid = d.index.every((v) => Number.isInteger(v) && v >= 0 && v < nv);
  ok(finite && valid && d.col.length === d.pos.length && d.wing.length === nv, `${name}: ${nv} vertices, ${d.index.length / 3} triangles, all valid`);
  ok(maxX > 0.45 && maxX < 0.52, `${name}: wingspan is 1 (half ${maxX.toFixed(3)})`);
  ok(wingMin === 0 && wingMax > 0.95, `${name}: wing weights run from the body (0) to the tip (1)`);
  ok(d.index.length / 3 < 1400, `${name}: light enough for instancing (${d.index.length / 3} triangles)`);
  ok(maxZ > s.body / 2 + s.neck + s.head && minZ < -s.body / 2 - s.tail.len * 0.5, `${name}: head + beak in front, tail behind`);
}
// the two sides of a bird are mirror images
{
  const d = buildBirdData('eagle');
  let left = 0;
  let right = 0;
  for (let i = 0; i < d.wing.length; i++) {
    if (d.wing[i] > 0.5) d.pos[i * 3] > 0 ? right++ : left++;
  }
  ok(left === right && left > 0, 'both wings have the same number of tip vertices');
}

for (const focus of [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-2400, 20, 150)]) {
  const b = new BirdManager(root, gen, Config.world.seed);
  const p = new THREE.Vector3();
  let bad = 0;
  let minAgl = Infinity;
  let maxDist = 0;
  let near = 0;
  const t0 = performance.now();
  const N = 60 * 240;
  for (let s = 0; s < N; s++) {
    b.update(1 / 60, s / 60, focus);
    if (s % 60 !== 0) continue;
    near = 0;
    for (let i = 0; i < b.total; i++) {
      b.positionOf(i, p);
      if (![p.x, p.y, p.z].every(Number.isFinite)) bad++;
      minAgl = Math.min(minAgl, p.y - Math.max(0, gen.heightAt(p.x, p.z)));
      const d = Math.hypot(p.x - focus.x, p.z - focus.z);
      maxDist = Math.max(maxDist, d);
      if (d < 900) near++;
    }
  }
  const ms = (performance.now() - t0) / N;
  console.log(`focus (${focus.x}, ${focus.z}): min height above ground ${minAgl.toFixed(1)} m, max distance ${maxDist.toFixed(0)} m, ${near}/${b.total} birds within 900 m, ${ms.toFixed(3)} ms per update`);
  ok(bad === 0, 'all bird positions are finite');
  ok(minAgl > 5, 'birds never fly into the ground (> 5 m clearance)');
  ok(maxDist < 1500, 'flocks stay within 1.5 km of the player');
  ok(near > b.total * 0.6, 'most birds are near enough to be seen');
  ok(ms < 1, 'updating all birds costs under 1 ms');
  b.dispose();
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);

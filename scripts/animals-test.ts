// Wildlife headless simulation: deer herds, predators hunting, fish schools. Run: npx tsx scripts/animals-test.ts
const mkCtx = () => new Proxy({}, { get: (_t, p) => (p === 'createLinearGradient' || p === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => mkCtx(), style: {} }) };
import * as THREE from 'three';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { AnimalManager } from '../src/animals/AnimalManager';
import { getWorldZoneAt } from '../src/city/WorldZones';

const g = new TerrainGenerator(Config.world.seed);
const s = g.makeSample();
let bad = 0;
const fail = (t: string) => { console.log('FAIL', t); bad++; };

// 1) the safari park: land, dry, gentle
const sp = { x: 3000, z: 1900 };
g.sample(sp.x, sp.z, s);
console.log('safari centre zone', getWorldZoneAt(sp.x, sp.z).kind, 'h', s.h.toFixed(1), 'water', s.water);
if (!Number.isNaN(s.water) && s.h < s.water) fail('safari centre is under water');

// 2) land simulation: player stands in the safari park for 5 minutes
const root = new THREE.Group();
const m = new AnimalManager(root, g, Config.world.seed);
const player = new THREE.Vector3(sp.x, s.h + 1, sp.z);
let t = 0, kills = 0, lastDead = 0, maxPred = 0, stalks = 0, chases = 0, attacks = 0, flees = 0, bad3 = 0;
const seenStates = new Set<string>();
for (let i = 0; i < 30 * 600; i++) {
  const dt = 1 / 30; t += dt;
  m.update(dt, t, player);
  const st = m.stats();
  if (st.dead > lastDead) kills++;
  lastDead = st.dead;
  maxPred = Math.max(maxPred, st.tigers + st.lions);
  for (const a of m.animals) {
    seenStates.add(`${a.sp}:${a.state}`);
    if (a.state === 'stalk') stalks++; if (a.state === 'chase') chases++; if (a.state === 'attack') attacks++; if (a.state === 'flee') flees++;
    if (!Number.isFinite(a.x + a.y + a.z)) bad3++;
    g.sample(a.x, a.z, s);
    if (!Number.isNaN(s.water) && s.h < s.water - 0.1 && a.state !== 'dead') bad3++;
    if (BUILT(a.x, a.z)) bad3++;
  }
}
function BUILT(x: number, z: number): boolean { const k = getWorldZoneAt(x, z).kind; return k === 'urban-core' || k === 'sea' || k === 'seaport' || k === 'airport'; }
console.log('10 min: max predators', maxPred, 'kills', kills, 'states', [...seenStates].sort().join(' '));
console.log('frames in stalk/chase/attack/flee', stalks, chases, attacks, flees, 'illegal positions', bad3);
console.log('final stats', m.stats());
if (maxPred < 1) fail('no predator spawned in the safari park');
if (kills < 1) fail('no deer was ever hunted down in 10 minutes');
if (bad3) fail('animals in water / towns / NaN');

// 3) fish: stand on the river / lake / sea shore
let water: { x: number; z: number } | null = null;
for (let r = 50; r < 4600 && !water; r += 50) for (let a = 0; a < 6.28 && !water; a += 0.2) {
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  g.sample(x, z, s);
  if (!Number.isNaN(s.water) && s.water - s.h > 2.5) water = { x, z };
}
console.log('deep water found at', water);
if (water) {
  const m2 = new AnimalManager(new THREE.Group(), g, Config.world.seed);
  const pl = new THREE.Vector3(water.x, 5, water.z);
  let tt = 0, bad4 = 0, maxFish = 0;
  for (let i = 0; i < 30 * 60; i++) {
    tt += 1 / 30; m2.update(1 / 30, tt, pl);
    maxFish = Math.max(maxFish, m2.stats().fish);
  }
  // every fish must be under the water surface and above the bed
  const mesh = (m2 as any).fishMesh as THREE.InstancedMesh; const mat = new THREE.Matrix4(); const v = new THREE.Vector3();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, mat); v.setFromMatrixPosition(mat); g.sample(v.x, v.z, s);
    if (Number.isNaN(s.water) || v.y > s.water || v.y < s.h) bad4++;
  }
  console.log('fish:', maxFish, 'max, outside water:', bad4);
  if (maxFish < 20) fail('too few fish near deep water');
  if (bad4 > mesh.count * 0.05) fail('fish outside the water');
}
console.log(bad ? 'FAILED' : 'ALL OK');
process.exit(bad ? 1 : 0);

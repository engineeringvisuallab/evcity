// Draw-call proxy of every engineering site: meshes (each one = one draw call, twice with a shadow), unique materials, triangles, shadow casters.
// Run: npx tsx scripts/site-drawcalls-report.ts
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { InfraManager } from '../src/engineering/InfraManager';

const stubEl = (): Record<string, unknown> => ({ style: {}, appendChild() {}, remove() {}, textContent: '', getContext: () => null });
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).document = { createElement: stubEl };
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const g = new TerrainGenerator(Config.world.seed);
const origin = { origin: new THREE.Vector3(), toLocal: (w: THREE.Vector3, out = new THREE.Vector3()) => out.set(w.x, w.y, w.z), toWorld: (l: THREE.Vector3, out = new THREE.Vector3()) => out.set(l.x, l.y, l.z) };
const root = new THREE.Group();
const t0 = performance.now();
const mgr = new InfraManager({
  root, physics: { RAPIER, world } as never, origin: origin as never, terrain: g,
  input: { wasPressed: () => false } as never, voice: { speakText: async () => {}, stop() {} }, container: { appendChild() {} } as never,
  playerWorld: (out) => out.set(0, 0, 0),
});
console.log(`built ${mgr.plants.length} sites in ${(performance.now() - t0).toFixed(0)} ms`);
let total = { meshes: 0, shadow: 0, tris: 0, mats: 0, nonStatic: 0 };
console.log('site'.padEnd(18), 'meshes inst  mats  shadowCasters  tris(k)  autoUpdate  buildMs');
for (const pl of mgr.plants) {
  const mats = new Set<THREE.Material>();
  let meshes = 0, inst = 0, shadow = 0, tris = 0, auto = 0;
  pl.infra.root.traverse((o) => {
    if (o.matrixAutoUpdate) auto++;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    if ((m as THREE.InstancedMesh).isInstancedMesh) inst++;
    if (m.castShadow) shadow++;
    const idx = m.geometry.index;
    const c = idx ? idx.count : m.geometry.getAttribute('position').count;
    tris += (c / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mt);
  });
  total.meshes += meshes; total.shadow += shadow; total.tris += tris; total.mats += mats.size;
  console.log(pl.site.id.padEnd(18), String(meshes).padStart(6), String(inst).padStart(4), String(mats.size).padStart(5), String(shadow).padStart(10), (tris / 1000).toFixed(0).padStart(11), String(auto).padStart(11));
}
console.log('TOTAL'.padEnd(18), String(total.meshes).padStart(6), ''.padStart(4), String(total.mats).padStart(5), String(total.shadow).padStart(10), (total.tris / 1000).toFixed(0).padStart(11));

// Render optimisation of the engineering sites: merging must keep the picture (same triangles in the same places, same part boxes, same colliders,
// same animation), only with far fewer meshes. Compares every site built plain vs built + optimised.
// Run: npx tsx scripts/site-optimize-test.ts
import * as THREE from 'three';
import { getInfrastructureDef, registerBuiltinInfrastructure, type Infrastructure } from '../src/engineering';
import { optimizeInfrastructure } from '../src/engineering/core/optimize';

const stubEl = (): Record<string, unknown> => ({ style: {}, appendChild() {}, remove() {}, textContent: '', getContext: () => null });
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).document = { createElement: stubEl };
registerBuiltinInfrastructure();
let bad = 0;
const ok = (c: boolean, m: string): void => { if (!c) { console.log('FAIL', m); bad++; } };

const IDS = ['swtp', 'stp', 'thermal', 'grid', 'mech', 'dam', 'chem', 'auto', 'renew', 'vehicle', 'tech', 'aircraft', 'textile'];
const make = (id: string): Infrastructure => getInfrastructureDef(id)!.create({ withEnvironment: false, groundY: () => 0, riverReach: 25, waterRel: -3, skirtDepth: 0 });

/** Sum of triangle areas, triangle count and a position hash in world space (non-instanced meshes only: instanced ones are never touched). */
function fingerprint(infra: Infrastructure): { tris: number; area: number; hash: number; meshes: number; box: THREE.Box3 } {
  infra.root.updateMatrixWorld(true);
  let tris = 0, area = 0, hash = 0, meshes = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  infra.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    meshes++;
    const pos = m.geometry.getAttribute('position');
    const idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld);
      tris++;
      area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      hash += (a.x + b.x + c.x) * 0.31 + (a.y + b.y + c.y) * 0.17 + (a.z + b.z + c.z) * 0.07;
    }
  });
  return { tris, area, hash, meshes, box: new THREE.Box3().setFromObject(infra.root) };
}

let sumBefore = 0, sumAfter = 0;
for (const id of IDS) {
  const plain = make(id);
  const opt = make(id);
  const plainSolids = JSON.stringify(plain.solids()); // InfraManager reads the solids right after the build (before any animation)
  // same animation history: the optimiser probes 300 x 0.1 s, so the plain one runs the same
  if (id !== 'aircraft') for (let i = 0; i < 300; i++) plain.update?.(0.1);
  const t0 = performance.now();
  const rep = optimizeInfrastructure(opt, { merge: true, shadowMinRadius: 0, skipMerge: id === 'aircraft' });
  const ms = performance.now() - t0;
  const fp = fingerprint(plain), fo = fingerprint(opt);
  ok(fp.tris === fo.tris, `${id}: same triangle count (${fp.tris} vs ${fo.tris})`);
  ok(Math.abs(fp.area - fo.area) < 1e-3 * Math.max(1, fp.area), `${id}: same total surface area (${fp.area.toFixed(1)} vs ${fo.area.toFixed(1)})`);
  ok(Math.abs(fp.hash - fo.hash) < 1e-6 * Math.max(1, Math.abs(fp.hash)), `${id}: same triangle positions in world space`);
  ok(fp.box.min.distanceTo(fo.box.min) < 1e-3 && fp.box.max.distanceTo(fo.box.max) < 1e-3, `${id}: same overall bounding box`);
  for (const p of plain.parts) {
    const q = opt.parts.find((x) => x.id === p.id);
    ok(!!q, `${id}: part ${p.id} exists`);
    if (!q) continue;
    plain.root.updateMatrixWorld(true); opt.root.updateMatrixWorld(true);
    const b1 = new THREE.Box3().setFromObject(p.group), b2 = new THREE.Box3().setFromObject(q.group);
    ok(b1.min.distanceTo(b2.min) < 1e-3 && b1.max.distanceTo(b2.max) < 1e-3, `${id}: part ${p.id} keeps its tour box`);
  }
  ok(!!plain.root.getObjectByName('ground-pad') === !!opt.root.getObjectByName('ground-pad'), `${id}: ground-pad kept`);
  ok(plainSolids === JSON.stringify(opt.solids()), `${id}: colliders (solids) unchanged`);
  // animation keeps running identically
  for (let i = 0; i < 100; i++) { plain.update?.(0.05); opt.update?.(0.05); }
  const fp2 = fingerprint(plain), fo2 = fingerprint(opt);
  ok(Math.abs(fp2.hash - fo2.hash) < 1e-6 * Math.max(1, Math.abs(fp2.hash)), `${id}: still identical after 5 more seconds of animation (moving parts really move)`);
  if (id !== 'aircraft') ok(rep.meshesAfter < rep.meshesBefore * 0.8, `${id}: far fewer meshes (${rep.meshesBefore} -> ${rep.meshesAfter})`);
  sumBefore += rep.meshesBefore; sumAfter += rep.meshesAfter;
  console.log(`${id.padEnd(9)} meshes ${String(rep.meshesBefore).padStart(5)} -> ${String(rep.meshesAfter).padStart(4)}  merged ${String(rep.merged).padStart(5)}  dynamic objects ${String(rep.dynamic).padStart(4)}  optimise ${ms.toFixed(0)} ms`);
  // dispose twice must not throw
  opt.dispose(); plain.dispose();
}
console.log(`TOTAL meshes ${sumBefore} -> ${sumAfter} (${((sumAfter / sumBefore) * 100).toFixed(0)} %)`);
// shadow policy
const s = make('swtp');
const casters = (i: Infrastructure): number => { let n = 0; i.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.castShadow) n++; }); return n; };
const before = casters(s);
const r = optimizeInfrastructure(s, { merge: false, shadowMinRadius: 1.2 });
console.log(`shadow policy 1.2 m on swtp: casters ${before} -> ${casters(s)} (${r.shadowOff} switched off)`);
ok(casters(s) < before, 'shadow policy switches small casters off');
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Infrastructure } from './types';

/**
 * RENDER OPTIMISATION of a finished plant (depends only on `three`, safe in Node).
 *
 * 1. MERGE: a plant is built from 800-2600 small static meshes (every pipe, bolt, railing ...). Each one is a draw call (two with the sun shadow).
 *    The static ones are merged into few meshes per (part, material, 64 m cell). Nothing visible changes: same materials, same triangles,
 *    same part groups (the tour boxes keep their size), same colliders (solids() is data, 'ground-pad' keeps its name).
 *    What is NOT merged: anything that ever moves or changes visibility (found by running the plant's own animation for 30 s of its time and
 *    comparing every object's transform), instanced meshes, sprites, named meshes ('ground-pad', 'fx'), transparent / multi-material meshes,
 *    mirrored meshes, and every mesh of a plant that follows the game clock (opts.skipMerge).
 * 2. SHADOW: meshes whose bounding radius is below `shadowMinRadius` stop casting a sun shadow (low / medium tier only).
 */
export interface OptimizeOptions {
  merge: boolean;
  /** Small decorative meshes stop casting shadows below this bounding radius (m). 0 = leave all as they are. */
  shadowMinRadius: number;
  /** Cell size (m) of the spatial merge grid (keeps frustum culling useful). */
  cell?: number;
  /** Plants whose motion follows an outside clock cannot be probed here: merge nothing. */
  skipMerge?: boolean;
}

export interface OptimizeReport {
  meshesBefore: number;
  meshesAfter: number;
  merged: number;
  shadowOff: number;
  dynamic: number;
}

const PROBE_STEPS = 300;
const PROBE_DT = 0.1; // AnimSet clamps dt to 0.1 s: 300 steps = 30 s of the plant's own time

function isPlainMesh(o: THREE.Object3D): o is THREE.Mesh {
  const m = o as THREE.Mesh;
  return m.isMesh === true && !(m as THREE.InstancedMesh).isInstancedMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh;
}

/** Objects whose transform / visibility changes while the plant runs its own animation. */
function probeDynamic(infra: Infrastructure, all: THREE.Object3D[]): Set<THREE.Object3D> {
  const dyn = new Set<THREE.Object3D>();
  if (!infra.update) return dyn;
  const snap = new Float64Array(all.length * 11);
  const vis = new Uint8Array(all.length);
  const take = (init: boolean): void => {
    for (let i = 0; i < all.length; i++) {
      const o = all[i];
      const b = i * 11;
      const cur = [o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z];
      if (init) {
        for (let k = 0; k < 10; k++) snap[b + k] = cur[k];
        vis[i] = o.visible ? 1 : 0;
      } else {
        for (let k = 0; k < 10; k++) if (Math.abs(snap[b + k] - cur[k]) > 1e-9) dyn.add(o);
        if (vis[i] !== (o.visible ? 1 : 0)) dyn.add(o);
      }
    }
  };
  take(true);
  for (let s = 0; s < PROBE_STEPS; s++) {
    infra.update(PROBE_DT);
    take(false);
  }
  return dyn;
}

export function optimizeInfrastructure(infra: Infrastructure, o: OptimizeOptions): OptimizeReport {
  const root = infra.root;
  // solids() reads the collision shapes from the visual meshes (Box / Cylinder geometries) lazily: take them NOW, before any mesh is merged away
  const solids = infra.solids();
  (infra as { solids: () => ReturnType<Infrastructure['solids']> }).solids = () => solids;
  const all: THREE.Object3D[] = [];
  root.traverse((x) => all.push(x));
  const rep: OptimizeReport = { meshesBefore: 0, meshesAfter: 0, merged: 0, shadowOff: 0, dynamic: 0 };
  for (const x of all) if (isPlainMesh(x)) rep.meshesBefore++;

  const dyn = o.merge && !o.skipMerge ? probeDynamic(infra, all) : new Set<THREE.Object3D>();
  rep.dynamic = dyn.size;
  root.updateMatrixWorld(true);

  // ---- 1. merge ----
  if (o.merge && !o.skipMerge) {
    const partGroups = new Set<THREE.Object3D>(infra.parts.map((p) => p.group));
    const cell = o.cell ?? 64;
    const rel = new THREE.Matrix4();
    const inv = new THREE.Matrix4();
    const wp = new THREE.Vector3();
    interface Bucket { target: THREE.Object3D; mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[]; verts: number; srcs: THREE.Mesh[]; box: THREE.Box3 }
    const open = new Map<string, Bucket>(); // the bucket that is still being filled, per key
    const buckets: Bucket[] = []; // all buckets (a full one is closed and a new one opened)

    const movesOrHidden = (m: THREE.Object3D): boolean => {
      for (let p: THREE.Object3D | null = m; p; p = p.parent) {
        if (dyn.has(p) || !p.visible) return true;
        if (p.name === 'labels' || p.name === 'environment' || p.name === 'fx') return true; // toggled from outside (setLabelsVisible) / effects
        if (p === root) break;
      }
      return false;
    };
    const targetOf = (m: THREE.Object3D): THREE.Object3D => {
      for (let p: THREE.Object3D | null = m.parent; p && p !== root; p = p.parent) if (partGroups.has(p)) return p;
      return root;
    };

    for (const x of all) {
      if (!isPlainMesh(x)) continue;
      const mat = x.material;
      if (Array.isArray(mat) || x.name !== '' || x.userData && Object.keys(x.userData).length) continue;
      if (mat.transparent || mat.opacity < 1 || x.renderOrder !== 0 || x.frustumCulled === false) continue;
      const geo = x.geometry;
      if (!geo.getAttribute('position') || geo.morphAttributes.position) continue; // (geometry.groups of Box / Cylinder only matter with an array material, excluded above)
      if (movesOrHidden(x)) continue;
      if (x.matrixWorld.determinant() < 0) continue; // mirrored: would flip the winding
      const target = targetOf(x);
      inv.copy(target.matrixWorld).invert();
      rel.multiplyMatrices(inv, x.matrixWorld);
      wp.setFromMatrixPosition(x.matrixWorld);
      const attrs = Object.keys(geo.attributes).sort().join(',');
      const sig = `${attrs}|${geo.index ? 'i' : 'n'}`;
      const key = `${target.uuid}|${mat.uuid}|${x.castShadow ? 1 : 0}${x.receiveShadow ? 1 : 0}|${sig}|${Math.floor(wp.x / cell)},${Math.floor(wp.z / cell)}`;
      let b = open.get(key);
      if (!b || b.verts > 150000) {
        b = { target, mat, cast: x.castShadow, recv: x.receiveShadow, geos: [], verts: 0, srcs: [], box: new THREE.Box3() };
        open.set(key, b);
        buckets.push(b);
      }
      if (!geo.boundingBox) geo.computeBoundingBox();
      b.box.union(looseBox.copy(geo.boundingBox!).applyMatrix4(rel)); // the box the tour / Box3.setFromObject measured before (so part boxes stay identical)
      const g = geo.clone();
      g.applyMatrix4(rel);
      b.geos.push(g);
      b.srcs.push(x);
      b.verts += g.getAttribute('position').count;
    }

    const made: THREE.BufferGeometry[] = [];
    for (const b of buckets) {
      if (b.geos.length < 2) {
        for (const g of b.geos) g.dispose();
        continue; // one mesh alone: nothing to gain
      }
      let merged: THREE.BufferGeometry | null = null;
      try {
        merged = mergeGeometries(b.geos, false);
      } catch {
        merged = null;
      }
      for (const g of b.geos) g.dispose();
      if (!merged) continue;
      merged.boundingBox = b.box.clone();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.recv;
      mesh.matrixAutoUpdate = false; // static, identity transform inside its part group
      b.target.add(mesh);
      for (const s of b.srcs) s.removeFromParent();
      rep.merged += b.srcs.length;
      made.push(merged);
    }
    if (made.length) {
      const orig = infra.dispose.bind(infra);
      (infra as { dispose: () => void }).dispose = (): void => {
        for (const g of made) g.dispose();
        made.length = 0;
        orig();
      };
    }
  }

  // ---- 2. shadows of small decorative meshes (the merged meshes are big, so they keep theirs) ----
  if (o.shadowMinRadius > 0) {
    const sph = new THREE.Sphere();
    const sc = new THREE.Vector3();
    root.updateMatrixWorld(true);
    root.traverse((x) => {
      if (!isPlainMesh(x) || !x.castShadow || x.name === 'ground-pad') return;
      if (!x.geometry.boundingSphere) x.geometry.computeBoundingSphere();
      sph.copy(x.geometry.boundingSphere!);
      x.matrixWorld.decompose(wpDummy, qDummy, sc);
      const r = sph.radius * Math.max(sc.x, sc.y, sc.z);
      if (r < o.shadowMinRadius) {
        x.castShadow = false;
        rep.shadowOff++;
      }
    });
  }

  root.traverse((x) => {
    if (isPlainMesh(x)) rep.meshesAfter++;
  });
  return rep;
}

const looseBox = new THREE.Box3();
const wpDummy = new THREE.Vector3();
const qDummy = new THREE.Quaternion();

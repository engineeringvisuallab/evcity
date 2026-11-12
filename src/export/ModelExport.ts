// 3D export of what is around the player: the visible meshes inside a radius become a .glb (glTF binary: Blender, Unity, Unreal, web viewers)
// or an .obj (geometry only: AutoCAD / SketchUp / any CAD). Nothing in the live scene is changed: the export works on light clones that share geometry.
//   - coordinates: metres, centred on the export centre (x east, y up, z south, like the game)
//   - custom shader materials (terrain, water ...) cannot be written to glTF: they become a plain grey standard material
//   - instanced meshes (trees, grass ...): only the instances inside the radius are written; OBJ writes each instance (max 3000 per mesh)
import * as THREE from 'three';

export type ModelFormat = 'glb' | 'obj';
export interface ModelExportOptions {
  format: ModelFormat;
  /** Metres around the centre (horizontal). */
  radius: number;
  /** Centre in render space (what the camera sees: world position minus the floating origin). */
  centerX: number;
  centerZ: number;
}
export interface ModelExportResult {
  name: string;
  data: BlobPart;
  mime: string;
  /** Short lines for the player (counts, notes). */
  info: string[];
}

export const MAX_RADIUS = 1500;
const MAX_VERTS = 6_000_000;
const MAX_OBJ_INSTANCES = 3000;
const BIG_OBJECT = 800; // a mesh wider than this (sky dome, sea plane ...) is never exported

type AnyMesh = THREE.Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean };

function isSupported(m: THREE.Material): boolean {
  const k = m as unknown as Record<string, boolean>;
  return !!(k.isMeshStandardMaterial || k.isMeshBasicMaterial || k.isMeshLambertMaterial || k.isMeshPhongMaterial);
}

class MaterialMap {
  private cache = new Map<THREE.Material, THREE.Material>();
  constructor(private stripMaps: boolean) {}
  get(m: THREE.Material): THREE.Material {
    let r = this.cache.get(m);
    if (!r) {
      if (!isSupported(m)) r = new THREE.MeshStandardMaterial({ color: 0x8c9187, roughness: 1, metalness: 0, name: m.name || 'shader-material' });
      else if (this.stripMaps) {
        r = m.clone();
        const k = r as unknown as Record<string, unknown>;
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap']) if (key in k) k[key] = null;
      } else r = m;
      this.cache.set(m, r);
    }
    return r;
  }
}

interface Collected {
  group: THREE.Group;
  meshes: number;
  instances: number;
  verts: number;
  skippedBig: number;
  trimmedInstances: number;
}

function collect(scene: THREE.Object3D, o: ModelExportOptions, flatten: boolean, mats: MaterialMap): Collected {
  scene.updateMatrixWorld(true);
  const group = new THREE.Group();
  const shift = new THREE.Matrix4().makeTranslation(-o.centerX, 0, -o.centerZ);
  const out: Collected = { group, meshes: 0, instances: 0, verts: 0, skippedBig: 0, trimmedInstances: 0 };
  const c = new THREE.Vector3();
  const tmp = new THREE.Matrix4();
  const inst = new THREE.Matrix4();

  const add = (mesh: AnyMesh): void => {
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    if (!pos) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material || material.visible === false || material.opacity < 0.05) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const bs = g.boundingSphere;
    if (!bs) return;
    const scale = mesh.matrixWorld.getMaxScaleOnAxis();
    const wr = bs.radius * scale;
    c.copy(bs.center).applyMatrix4(mesh.matrixWorld);
    const mapped = Array.isArray(mesh.material) ? mesh.material.map((m) => mats.get(m)) : mats.get(mesh.material);

    if (mesh.isInstancedMesh) {
      const im = mesh as unknown as THREE.InstancedMesh;
      const keep: THREE.Matrix4[] = [];
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, inst);
        tmp.multiplyMatrices(mesh.matrixWorld, inst);
        c.setFromMatrixPosition(tmp);
        if (Math.hypot(c.x - o.centerX, c.z - o.centerZ) <= o.radius + wr) keep.push(inst.clone());
      }
      if (!keep.length) return;
      if (flatten) {
        const n = Math.min(keep.length, MAX_OBJ_INSTANCES);
        out.trimmedInstances += keep.length - n;
        for (let i = 0; i < n; i++) {
          const m = new THREE.Mesh(g, mapped);
          m.matrixAutoUpdate = false;
          m.matrix.copy(shift).multiply(mesh.matrixWorld).multiply(keep[i]);
          group.add(m);
          out.verts += pos.count;
        }
        out.instances += n;
      } else {
        const m = new THREE.InstancedMesh(g, mapped as THREE.Material, keep.length);
        keep.forEach((k, i) => m.setMatrixAt(i, k));
        m.matrixAutoUpdate = false;
        m.matrix.copy(shift).multiply(mesh.matrixWorld);
        m.name = mesh.name;
        group.add(m);
        out.instances += keep.length;
        out.verts += pos.count;
      }
      out.meshes++;
      return;
    }

    if (wr > BIG_OBJECT) { out.skippedBig++; return; }
    if (Math.hypot(c.x - o.centerX, c.z - o.centerZ) > o.radius + wr) return;
    const m = new THREE.Mesh(g, mapped);
    m.name = mesh.name;
    m.matrixAutoUpdate = false;
    m.matrix.copy(shift).multiply(mesh.matrixWorld);
    group.add(m);
    out.meshes++;
    out.verts += pos.count;
  };

  const walk = (obj: THREE.Object3D): void => {
    if (!obj.visible) return;
    const m = obj as AnyMesh;
    if (m.isMesh && !m.isSkinnedMesh) add(m);
    for (const ch of obj.children) walk(ch);
  };
  walk(scene);
  if (out.verts > MAX_VERTS) throw new Error(`এক্সপোর্ট খুব বড় (${Math.round(out.verts / 1000)} হাজার ভার্টেক্স): ব্যাসার্ধ কমান`);
  group.updateMatrixWorld(true);
  return out;
}

export async function exportModel(scene: THREE.Object3D, o: ModelExportOptions): Promise<ModelExportResult> {
  const radius = Math.max(20, Math.min(MAX_RADIUS, o.radius));
  const opts = { ...o, radius };
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const info: string[] = [];

  if (opts.format === 'obj') {
    const col = collect(scene, opts, true, new MaterialMap(false));
    if (!col.group.children.length) throw new Error('এই এলাকায় এক্সপোর্ট করার মতো কিছু পাওয়া যায়নি');
    const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js');
    const text = new OBJExporter().parse(col.group);
    info.push(`${col.group.children.length} টি মেশ, ব্যাসার্ধ ${radius} মিটার`);
    info.push('OBJ শুধু আকৃতি রাখে (রং/টেক্সচার নেই)');
    if (col.trimmedInstances) info.push(`${col.trimmedInstances} টি ইনস্ট্যান্স (গাছ ইত্যাদি) বাদ গেছে (প্রতি মেশে সর্বোচ্চ ${MAX_OBJ_INSTANCES})`);
    if (col.skippedBig) info.push(`${col.skippedBig} টি বিশাল অবজেক্ট (আকাশ/সমুদ্র) বাদ`);
    return { name: `evcity_3d_${stamp}.obj`, data: text, mime: 'text/plain', info };
  }

  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const run = async (strip: boolean): Promise<{ col: Collected; buf: ArrayBuffer }> => {
    const col = collect(scene, opts, false, new MaterialMap(strip));
    if (!col.group.children.length) throw new Error('এই এলাকায় এক্সপোর্ট করার মতো কিছু পাওয়া যায়নি');
    const res = await new GLTFExporter().parseAsync(col.group, { binary: true, maxTextureSize: 2048 });
    return { col, buf: res as ArrayBuffer };
  };
  let r: { col: Collected; buf: ArrayBuffer };
  try {
    r = await run(false);
  } catch (e) {
    if (e instanceof Error && e.message.includes('এক্সপোর্ট')) throw e;
    r = await run(true); // a texture could not be written (compressed / data texture): try again without textures
    info.push('কিছু টেক্সচার লেখা যায়নি, তাই টেক্সচার ছাড়া সেভ হয়েছে');
  }
  info.unshift(`${r.col.meshes} টি মেশ${r.col.instances ? ` (${r.col.instances} ইনস্ট্যান্স)` : ''}, ব্যাসার্ধ ${radius} মিটার`);
  info.push('টেরেন/পানির শেডার-ম্যাটেরিয়াল ধূসর সাধারণ ম্যাটেরিয়াল হিসেবে গেছে');
  if (r.col.skippedBig) info.push(`${r.col.skippedBig} টি বিশাল অবজেক্ট (আকাশ/সমুদ্র) বাদ`);
  return { name: `evcity_3d_${stamp}.glb`, data: r.buf, mime: 'model/gltf-binary', info };
}

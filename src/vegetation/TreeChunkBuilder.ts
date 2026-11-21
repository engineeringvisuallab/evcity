import * as THREE from 'three';
import { Config } from '../core/Config';
import type { RockAssets } from './RockAssets';
import type { TreeAssets } from './TreeAssets';
import { ROCK_KIND_COUNT, TREE_KIND_COUNT, TREE_STRIDE, TreeKind, treeWidth, type TreeChunkData } from './TreeTypes';

/** Broadleaf kinds that get the full range of real leaf colours (not pine, palms, banana, bamboo, krishnachura with its red flowers, undergrowth). */
const FULL_COLOUR_KINDS = new Set<number>([TreeKind.broadleaf, TreeKind.oak, TreeKind.vase, TreeKind.slender, TreeKind.sal, TreeKind.segun, TreeKind.koroi, TreeKind.bot, TreeKind.shimul, TreeKind.debdaru, TreeKind.gum, TreeKind.gum2]);
/** Leaf colour families: [cumulative chance, r, g, b multipliers of the green leaf texture]. */
const LEAF_FAMILIES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.34, 0.92, 1.0, 0.9], // normal green
  [0.52, 1.2, 1.08, 0.62], // yellow-green
  [0.64, 0.8, 0.98, 1.0], // deep blue-green
  [0.75, 1.08, 0.97, 0.72], // olive
  [0.84, 1.1, 1.15, 0.7], // fresh lime
  [0.91, 1.55, 1.2, 0.55], // golden yellow
  [0.96, 1.8, 0.95, 0.5], // rust orange
  [1.0, 1.55, 0.85, 0.6], // red bronze
];

const dummy = new THREE.Object3D();

/** The instanced meshes built for a chunk's tree data (index = tree kind), found again through the data array (TreeDestruction). */
export const treeMeshes = new WeakMap<TreeChunkData, (THREE.InstancedMesh | null)[]>();
const color = new THREE.Color();

/** Turns the worker's tree and rock lists into instanced meshes (one per kind), parented to the chunk group (chunk-local coordinates). */
export class TreeChunkBuilder {
  constructor(
    private assets: TreeAssets,
    private rockAssets: RockAssets,
  ) {}

  /** `lod` 0 = detailed models + shadows, higher = simple models. Returns null when the chunk has no trees or rocks. */
  build(trees: TreeChunkData | null, rocks: TreeChunkData | null, lod: number): THREE.Group | null {
    let group: THREE.Group | null = null;
    const detail = lod === 0 ? 0 : 1;
    if (rocks) {
      for (let k = 0; k < ROCK_KIND_COUNT; k++) {
        const mesh = this.instanced(rocks[k], this.rockAssets.geometries[k][detail], this.rockAssets.material, `rocks kind${k}`, lod, 1, 1, 1);
        if (mesh) (group ??= this.makeGroup()).add(mesh);
      }
    }
    if (trees) {
      const meshes: (THREE.InstancedMesh | null)[] = [];
      for (let k = 0; k < TREE_KIND_COUNT; k++) {
        const mesh = this.instanced(trees[k], this.assets.geometries[k][detail], this.assets.materialFor(k), `trees kind${k}`, lod, 1, 1.01, 0.96, true, k);
        meshes.push(mesh);
        if (mesh) (group ??= this.makeGroup()).add(mesh);
      }
      treeMeshes.set(trees, meshes);
    }
    return group;
  }

  /** One InstancedMesh for `data` (TREE_STRIDE floats per instance: x y z scale yaw tint). Null when there are none. */
  private instanced(
    data: Float32Array | undefined,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    name: string,
    lod: number,
    tr: number,
    tg: number,
    tb: number,
    hue = false,
    treeKind = -1,
  ): THREE.InstancedMesh | null {
    const count = data ? data.length / TREE_STRIDE : 0;
    if (!data || count === 0) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    for (let i = 0; i < count; i++) {
      const o = i * TREE_STRIDE;
      dummy.position.set(data[o], data[o + 1], data[o + 2]);
      dummy.rotation.set(0, data[o + 4], 0);
      const sc = data[o + 3];
      const wd = treeKind === TreeKind.bamboo ? treeWidth(treeKind, sc) : sc; // tall jungle bamboo: height scale sc, slimmer width
      dummy.scale.set(wd, sc, wd);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const t = data[o + 5];
      if (hue) {
        const D = Config.vegetation.leafDark;
        if (treeKind >= 0 && FULL_COLOUR_KINDS.has(treeKind)) {
          // like cars of one model in many paint colours: same tree shape, but each tree its own REAL leaf colour (most green, some yellow-green, olive,
          // blue-green, a few golden / rust / red-bronze). The colour comes from the tree's position, so it never changes. Green stays >= 0.85 (leaf transmission uses it).
          const hh = Math.sin(data[o] * 12.9898 + data[o + 2] * 78.233) * 43758.5453;
          const h1 = hh - Math.floor(hh);
          const h2 = hh * 7.31 - Math.floor(hh * 7.31);
          const f = LEAF_FAMILIES.find((q) => h1 < q[0]) ?? LEAF_FAMILIES[LEAF_FAMILIES.length - 1];
          const j = 0.94 + 0.12 * h2;
          mesh.setColorAt(i, color.setRGB(t * f[1] * j * D[0], t * f[2] * D[1], t * f[3] * (2 - j) * D[2]));
        } else {
          // every tree its own shade: the brighter ones lean yellow-green, the darker ones blue-green
          const u = Math.min(1, Math.max(0, (t - 0.82) / 0.32));
          mesh.setColorAt(i, color.setRGB(t * (0.9 + 0.2 * u) * D[0], t * (1.03 - 0.05 * u) * D[1], t * (0.96 - 0.1 * u) * D[2]));
        }
      } else mesh.setColorAt(i, color.setRGB(t * tr, t * tg, t * tb));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = lod === 0 && Config.vegetation.treeShadows; // tree shadows off by default (Config vegetation.treeShadows)
    mesh.receiveShadow = lod === 0;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  private makeGroup(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'vegetation';
    g.matrixAutoUpdate = false;
    g.updateMatrix();
    return g;
  }

  /** Frees the per-chunk instance buffers. The shared geometries and materials stay. */
  dispose(group: THREE.Group): void {
    for (const c of group.children) (c as THREE.InstancedMesh).dispose();
  }
}

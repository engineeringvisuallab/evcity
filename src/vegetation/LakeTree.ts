import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TerrainGenerator } from '../terrain';

/**
 * THE LONE SEA TREE (Wanaka-style): ONE gnarled, leaning tree that stands alone in the shallow sea on the south-west side of the world,
 * trunk and roots under the water, a few twisting bare limbs and thin clumps of autumn leaves (gold, orange, rust) - the only tree of
 * its colour in the game and the only tree that stands in the sea. Not part of the normal tree system (no chunks, no forest atlas):
 * one small merged mesh for the bark and one for the leaves, placed once in world coordinates under the world root.
 */

/** The search starts here (world metres, x east, z south = the south-west side of the 10 km world) and goes outwards until it finds shallow sea. */
const TARGET = { x: -3500, z: 3500 };
const MAX_SEARCH = 3200;

/** Tiny seeded random (the tree always looks the same). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Make a geometry mergeable: non-indexed, only position / normal / color. */
function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') n.deleteAttribute(k);
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  return n;
}

function paint(g: THREE.BufferGeometry, color: (x: number, y: number, z: number) => [number, number, number]): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = color(pos.getX(i), pos.getY(i), pos.getZ(i));
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A tapered tube along a curve (radius r0 at the start, r1 at the end). */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, segs: number, sides: number): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(p.x + r * (c * N.x + s * B.x), p.y + r * (c * N.y + s * B.y), p.z + r * (c * N.z + s * B.z));
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      const c = (i + 1) * sides + j;
      const d = (i + 1) * sides + ((j + 1) % sides);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const AUTUMN: [number, number, number][] = [
  [0.96, 0.66, 0.14], // gold
  [0.93, 0.5, 0.1], // orange
  [0.85, 0.36, 0.09], // deep orange
  [0.78, 0.27, 0.1], // rust
  [0.88, 0.74, 0.22], // yellow
  [0.7, 0.62, 0.16], // olive-gold
];

export interface TreeBuild {
  bark: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  /** Height of the highest leaf above the water (m). */
  height: number;
}

/** Build the tree. Local y = 0 is the WATER SURFACE; the trunk goes down to y = -depth - 0.4 (into the sea floor). */
export function buildLakeTree(depth: number, seed = 7): TreeBuild {
  const R = rng(seed);
  const bark: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const tips: THREE.Vector3[] = [];
  let top = 0;

  const barkColor = (y: number) => (x: number, yy: number, z: number): [number, number, number] => {
    const n = 0.85 + 0.3 * Math.abs(Math.sin(x * 7.3 + yy * 3.1 + z * 5.7));
    const wet = yy < 0.2 ? 0.55 : 1; // the part in the water is darker
    const k = n * wet * (0.9 + 0.1 * Math.min(1, y / 4));
    return [0.33 * k, 0.26 * k, 0.2 * k];
  };

  // --- trunk: leans a little, twists, thick root flare at the water ---
  const d = depth + 0.4;
  const trunkPts = [
    new THREE.Vector3(0, -d, 0),
    new THREE.Vector3(0.05, -0.2, 0.02),
    new THREE.Vector3(0.28, 1.6, 0.1),
    new THREE.Vector3(0.8, 3.2, -0.15),
    new THREE.Vector3(1.25, 4.8, 0.2),
    new THREE.Vector3(1.35, 6.2, 0.5),
  ];
  const trunk = new THREE.CatmullRomCurve3(trunkPts, false, 'catmullrom', 0.5);
  bark.push(paint(clean(taperedTube(trunk, 0.62, 0.2, 26, 9)), barkColor(2)));
  // a few roots / buttresses spreading at the water line
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + R() * 0.7;
    const len = 0.9 + R() * 0.8;
    const root = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 0.15, 0.5, Math.sin(a) * 0.15),
      new THREE.Vector3(Math.cos(a) * len * 0.5, -0.05, Math.sin(a) * len * 0.5),
      new THREE.Vector3(Math.cos(a) * len, -0.5, Math.sin(a) * len),
    ]);
    bark.push(paint(clean(taperedTube(root, 0.2, 0.06, 6, 6)), barkColor(0)));
  }

  // --- limbs: grow out of the upper trunk, bend upwards, fork once or twice ---
  const limb = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, level: number): void => {
    const p1 = from.clone().addScaledVector(dir, len * 0.4).add(new THREE.Vector3((R() - 0.5) * 0.7, 0.15 * len, (R() - 0.5) * 0.7));
    const p2 = from.clone().addScaledVector(dir, len * 0.75).add(new THREE.Vector3((R() - 0.5) * 0.8, 0.45 * len, (R() - 0.5) * 0.8));
    const end = from.clone().addScaledVector(dir, len).add(new THREE.Vector3((R() - 0.5) * 0.5, 0.75 * len, (R() - 0.5) * 0.5));
    const c = new THREE.CatmullRomCurve3([from, p1, p2, end]);
    bark.push(paint(clean(taperedTube(c, r, r * 0.35, 8, 6)), barkColor(5)));
    top = Math.max(top, end.y);
    if (level < 2) {
      const forks = level === 0 ? 2 : 2;
      for (let f = 0; f < forks; f++) {
        const t = 0.45 + f * 0.28 + R() * 0.1;
        const at = c.getPointAt(Math.min(0.95, t));
        const a = R() * Math.PI * 2;
        const nd = new THREE.Vector3(Math.cos(a) * 0.9 + dir.x * 0.5, 0.35 + R() * 0.3, Math.sin(a) * 0.9 + dir.z * 0.5).normalize();
        limb(at, nd, len * (0.55 + R() * 0.15), r * 0.55, level + 1);
      }
      if (level === 1) tips.push(end.clone());
    } else {
      tips.push(end.clone());
    }
  };
  const limbStarts: [number, number][] = [
    [0.52, 0],
    [0.62, 2.2],
    [0.74, 4.1],
    [0.86, 0.9],
    [0.95, 3.3],
  ];
  for (const [t, a0] of limbStarts) {
    const from = trunk.getPointAt(t);
    const a = a0 + R() * 0.5;
    const dir = new THREE.Vector3(Math.cos(a), 0.3 + R() * 0.25, Math.sin(a)).normalize();
    limb(from, dir, 2.3 + R() * 1.3, 0.2 - t * 0.07, 0);
  }
  tips.push(trunk.getPointAt(1));

  // --- autumn leaf clumps: a few at every twig tip, flat low-poly blobs in gold / orange / rust, thin so the sky shows through ---
  const base = new THREE.IcosahedronGeometry(1, 1);
  for (const tip of tips) {
    const n = 4 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const g = base.clone();
      const s = 0.45 + R() * 0.55;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(tip.x + (R() - 0.5) * 1.5, tip.y + (R() - 0.35) * 1.1, tip.z + (R() - 0.5) * 1.5),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3)),
        new THREE.Vector3(s * 1.25, s * 0.62, s * 1.25),
      );
      g.applyMatrix4(m);
      const col = AUTUMN[Math.floor(R() * AUTUMN.length)];
      const v = 0.88 + R() * 0.24;
      const gg = clean(g);
      leaves.push(paint(gg, (x, y, z) => {
        const k = v * (0.92 + 0.16 * Math.sin(x * 9 + y * 6 + z * 8));
        return [col[0] * k, col[1] * k, col[2] * k];
      }));
      top = Math.max(top, tip.y + 0.6);
    }
  }
  base.dispose();
  return { bark: mergeGeometries(bark, false)!, leaves: mergeGeometries(leaves, false)!, height: top };
}

export interface LakeTreeSpot {
  x: number;
  z: number;
  /** Water surface height (m). */
  level: number;
  /** Water depth at the foot (m). */
  depth: number;
}

/**
 * Finds the nearest SHALLOW sea (1 - 3.5 m deep, with calm shallow water within 6 m all round) to the south-west target, searching in growing rings.
 * Falls back to deeper water (up to 10 m) if there is no shallow spot; null if there is no sea at all within reach.
 */
export function findLakeTreeSpot(terrain: TerrainGenerator, cx = TARGET.x, cz = TARGET.z): LakeTreeSpot | null {
  const sc = terrain.makeSample();
  const depthAt = (x: number, z: number): number => {
    terrain.sample(x, z, sc);
    return Number.isNaN(sc.water) ? -1 : sc.water - sc.h;
  };
  const STEP = 20;
  for (const [lo, hi, around] of [[1.0, 3.5, [0.5, 4.5]], [1.0, 10, [0.5, 12]]] as const) {
    for (let r = 0; r <= MAX_SEARCH; r += STEP) {
      const n = r === 0 ? 1 : Math.max(8, Math.ceil((Math.PI * 2 * r) / STEP));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        const dp = depthAt(x, z);
        if (dp < lo || dp > hi) continue;
        let ok = true;
        for (let k = 0; k < 8 && ok; k++) {
          const b = (k / 8) * Math.PI * 2;
          const q = depthAt(x + Math.cos(b) * 6, z + Math.sin(b) * 6);
          ok = q >= around[0] && q <= around[1];
        }
        if (!ok) continue;
        terrain.sample(x, z, sc);
        return { x, z, level: sc.water, depth: sc.water - sc.h };
      }
    }
  }
  return null;
}

export class LakeTree {
  readonly group = new THREE.Group();
  readonly spot: LakeTreeSpot | null;
  private crown: THREE.Mesh | null = null;
  private baseRot = 0;

  constructor(root: THREE.Object3D, terrain: TerrainGenerator) {
    this.group.name = 'LakeTree';
    this.spot = findLakeTreeSpot(terrain);
    if (!this.spot) return;
    const { x, z, level, depth } = this.spot;
    const b = buildLakeTree(depth);
    const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, flatShading: true, side: THREE.DoubleSide });
    const barkMesh = new THREE.Mesh(b.bark, barkMat);
    const leafMesh = new THREE.Mesh(b.leaves, leafMat);
    for (const m of [barkMesh, leafMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = true;
      this.group.add(m);
    }
    this.crown = leafMesh;
    this.group.position.set(x, level, z);
    this.group.rotation.y = 0.6;
    this.baseRot = this.group.rotation.y;
    // the tree is big (~9 m): keep it visible from afar like the other landmarks
    root.add(this.group);
  }

  /** A very gentle sway of the leaves in the wind. */
  update(time: number): void {
    if (!this.crown) return;
    this.crown.rotation.z = Math.sin(time * 0.7) * 0.012;
    this.crown.rotation.x = Math.sin(time * 0.53 + 1.3) * 0.009;
    this.group.rotation.y = this.baseRot;
  }
}

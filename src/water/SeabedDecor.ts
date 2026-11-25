import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain';
import type { TerrainSample } from '../terrain/Lakes';
import { hash2, mergeParts, part, vnoise } from './GeoUtil';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyCoralTexture, applyRockTexture, buildRockGeometry } from '../vegetation/RockAssets';

/**
 * The sea floor comes alive: swaying seaweed and kelp, branching and brain corals, rocks. Placed on a 5 m grid around the
 * camera (the same cell always gives the same plants), only where the water is deep enough to cover them (sea, lakes, rivers).
 * Four InstancedMeshes; cells near the camera are computed a few per frame, far cells are dropped.
 */

const CELL = 5;

type Kind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; // seaweed, branch coral, dome coral, rock, sea grass, flower, lily pad, lotus bloom
interface Inst {
  kind: Kind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  tint: number;
}

/** [radius m, seaweed, branch coral, dome coral, rock, sea grass, flower, lily pad, lotus bloom] per quality. */
const QUALITY = [
  { reach: 42, caps: [450, 140, 100, 90, 500, 60, 120, 40] },
  { reach: 70, caps: [1000, 300, 220, 180, 1300, 150, 300, 90] },
  { reach: 100, caps: [1900, 500, 360, 280, 2400, 300, 600, 180] },
] as const;
const KINDS = 8;

const SEAWEED_TINTS: [number, number, number][] = [
  [1.0, 1.0, 1.0],
  [0.85, 1.05, 0.8],
  [1.15, 1.0, 0.55],
  [1.3, 0.62, 0.5],
  [0.8, 0.95, 1.1],
];
const CORAL_TINTS: [number, number, number][] = [
  [1.5, 0.75, 0.35],
  [1.5, 0.45, 0.6],
  [0.95, 0.55, 1.3],
  [1.5, 1.3, 0.4],
  [1.1, 0.5, 0.45],
  [0.5, 1.2, 1.0],
];
const DOME_TINTS: [number, number, number][] = [
  [1.1, 1.0, 0.65],
  [0.75, 1.1, 0.8],
  [1.3, 0.75, 0.7],
  [0.9, 0.85, 1.15],
];
const SEAGRASS_TINTS: [number, number, number][] = [
  [1.0, 1.0, 1.0],
  [0.8, 1.1, 0.75],
  [1.1, 1.05, 0.7],
  [0.7, 0.95, 0.9],
  [1.2, 1.0, 0.6],
];
/** Petal colours (the petals are white-ish; the stem, leaves and the yellow centre keep their own colour). */
const FLOWER_TINTS: [number, number, number][] = [
  [1.5, 0.55, 0.8], // pink
  [1.3, 1.3, 1.3], // white
  [1.6, 1.35, 0.3], // yellow
  [0.95, 0.5, 1.5], // purple
  [1.5, 0.3, 0.3], // red
  [1.6, 0.75, 0.25], // orange
  [0.5, 0.7, 1.6], // blue
  [1.4, 0.35, 1.1], // magenta
];
const LOTUS_TINTS: [number, number, number][] = [
  [1.5, 0.65, 0.85],
  [1.3, 1.25, 1.3],
  [1.45, 0.5, 0.95],
  [1.6, 1.4, 0.45],
];
const ROCK_TINTS: [number, number, number][] = [
  [0.85, 0.82, 0.78],
  [0.7, 0.7, 0.72],
  [0.8, 0.9, 0.75],
  [0.95, 0.85, 0.7],
];

/**
 * PLANT-REAL: kelp / seaweed clump. Before: 5 thin straight strips. Now 7 ribbon blades of different height and width: widest in the
 * middle, pointed tip, a raised midrib (3 vertices per row), ruffled edges, a gentle S bend, dark olive base -> yellow-green tip, a few
 * brown blades. The sway is the vertex shader of the material; the veins are drawn in its fragment shader.
 */
export function bladeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blades = 7;
  const segs = 5;
  for (let b = 0; b < blades; b++) {
    const r1 = hash2(b, 3, 1), r2 = hash2(b, 5, 2), r3 = hash2(b, 7, 3), r4 = hash2(b, 11, 4);
    const H = 0.6 + 0.4 * r1; // height (the instance scale does the rest)
    const hw0 = 0.055 + 0.05 * r2; // half width at the widest
    const lean = 0.1 + 0.28 * r3;
    const ph = r4 * 6.28, fr = 7 + 5 * r2; // ruffle phase and frequency
    const brown = r4 > 0.72;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let s = 0; s <= segs; s++) {
      const y = s / segs;
      const prof = (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, 0.12 + 0.88 * y))) * (1 - 0.85 * y * y * y);
      const w = hw0 * prof;
      const cx = lean * y * y + 0.035 * y * Math.sin(y * fr * 0.6 + ph);
      const ruf = 0.022 * Math.min(1, y * 2) * Math.sin(y * fr + ph * 1.7);
      pos.push(cx - w, y * H, ruf, cx, y * H, 0.014 * prof, cx + w, y * H, -ruf);
      const c0 = brown ? [0.2, 0.14, 0.05] : [0.08, 0.15, 0.05], c1 = brown ? [0.5, 0.38, 0.15] : [0.42, 0.55, 0.18];
      const k = Math.pow(y, 0.8);
      const base = [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
      col.push(base[0] * 0.9, base[1] * 0.92, base[2] * 0.9, base[0] * 1.25 + 0.03, base[1] * 1.22 + 0.03, base[2] * 1.15, base[0] * 0.9, base[1] * 0.92, base[2] * 0.9);
      if (s < segs) {
        const k0 = s * 3;
        idx.push(k0, k0 + 1, k0 + 3, k0 + 1, k0 + 4, k0 + 3, k0 + 1, k0 + 2, k0 + 4, k0 + 2, k0 + 5, k0 + 4);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.rotateY((b / blades) * Math.PI * 2 + r1);
    g.translate(Math.cos(b * 2.4) * 0.1, 0, Math.sin(b * 2.4) * 0.1);
    parts.push(g);
  }
  return mergeParts(parts);
}

/**
 * PLANT-REAL: staghorn coral. Before: a bare Y-shaped twig (2 levels, grey). Now a bushy colony: 3 levels (22 tapered branches), each
 * child leans outward-up, dark base -> pale tips. The polyp pits and the mottling come from applyCoralTexture('polyp').
 */
export function branchCoralGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  let seed = 1;
  const rnd = (): number => hash2(seed++, 77, 5);
  const grow = (base: THREE.Matrix4, len: number, rad: number, depth: number): void => {
    const leaf = depth <= 0;
    const cyl = new THREE.CylinderGeometry(rad * (leaf ? 0.3 : 0.64), rad, len, 5, 1, true);
    cyl.translate(0, len / 2, 0);
    cyl.applyMatrix4(base);
    parts.push(
      part(cyl, (_x, y) => {
        const k = 0.42 + 0.62 * Math.min(1, Math.max(0, y / 0.6));
        return [k, k * 0.97, k * 0.92];
      }),
    );
    if (leaf) return;
    const tip = base.clone().multiply(new THREE.Matrix4().makeTranslation(0, len * 0.92, 0));
    const n = depth === 3 ? 3 : 2;
    const az0 = rnd() * 6.28;
    for (let i = 0; i < n; i++) {
      const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.3 + rnd() * 0.45, az0 + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.7, 0, 'YXZ'));
      grow(tip.clone().multiply(rot), len * (0.7 + rnd() * 0.08), rad * (0.64 + rnd() * 0.06), depth - 1);
    }
  };
  grow(new THREE.Matrix4(), 0.3, 0.07, 3);
  return mergeParts(parts);
}

/** PLANT-REAL: brain / dome coral. A smooth hemisphere (before: flat-faceted); the meandering grooves are drawn by applyCoralTexture('brain'). */
export function domeCoralGeometry(): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, 3);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const lobe = 1 + 0.05 * Math.sin(x * 11 + y * 3) * Math.sin(z * 11 - y * 2);
    x *= lobe;
    z *= lobe;
    y = y > 0 ? y * 0.7 * lobe : y * 0.15;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = 0.78 + 0.22 * Math.min(1, Math.max(0, p.getY(i) / 0.35));
    col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Adds `color` (from a function of the position) and `aPet` (1 = petal: takes the instance colour; 0 = everything else) to an indexed geometry. */
function paint(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => [number, number, number], pet: number): THREE.BufferGeometry {
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i));
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPet', new THREE.BufferAttribute(new Float32Array(p.count).fill(pet), 1));
  return g;
}

type RGB3 = [number, number, number];
/** One ribbon blade (2 or 3 vertices per row), height H, half width hw, leaning by `lean`; c0 -> c1 base to tip. */
function ribbon(H: number, hw: number, lean: number, segs: number, c0: RGB3, c1: RGB3, az: number, rad: number, pet = 0, mid = false): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const cols = mid ? 3 : 2;
  for (let s = 0; s <= segs; s++) {
    const y = s / segs;
    const w = hw * (1 - 0.8 * y * y);
    const cx = lean * y * y;
    const yy = y * H * (1 - 0.08 * y * y);
    const k = Math.pow(y, 0.85);
    const c = [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    if (mid) { pos.push(cx - w, yy, 0, cx, yy, 0.01, cx + w, yy, 0); col.push(...c, c[0] * 1.2, c[1] * 1.2, c[2] * 1.1, ...c); }
    else { pos.push(cx - w, yy, 0, cx + w, yy, 0); col.push(...c, ...c); }
    if (s < segs) {
      const b = s * cols;
      if (mid) idx.push(b, b + 1, b + 3, b + 1, b + 4, b + 3, b + 1, b + 2, b + 4, b + 2, b + 5, b + 4);
      else idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aPet', new THREE.BufferAttribute(new Float32Array(pos.length / 3).fill(pet), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.rotateY(az);
  g.translate(Math.cos(az + 1.3) * rad, 0, Math.sin(az + 1.3) * rad);
  return g;
}

/**
 * PLANT-REAL 2: SEA GRASS (eelgrass). A tuft of 12 long thin ribbons (half width 1.4 - 2.6 cm), each leaning its own way, dark green
 * base -> light green tip, some yellowish. Many tufts per cell make a meadow. Sways in the current (grassMat).
 */
export function seaGrassGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 12; b++) {
    const r1 = hash2(b, 13, 31), r2 = hash2(b, 17, 32), r3 = hash2(b, 19, 33), r4 = hash2(b, 23, 34);
    const yel = r4 > 0.8;
    parts.push(
      ribbon(0.55 + 0.45 * r1, 0.014 + 0.012 * r2, 0.08 + 0.3 * r3, 3, yel ? [0.16, 0.2, 0.06] : [0.05, 0.13, 0.04], yel ? [0.55, 0.62, 0.2] : [0.3, 0.55, 0.16], r3 * 6.28, 0.1 * r2),
    );
  }
  return mergeParts(parts);
}

/** A flat petal along +Z (length len, width wid, cupped up), tilted `tilt` rad up from flat, turned `az`, base at (0, y0, 0). 12 triangles. */
function petal(len: number, wid: number, tilt: number, az: number, y0: number, c0: RGB3, c1: RGB3): THREE.BufferGeometry {
  const rows = [0, 0.35, 0.7, 1], wp = [0.35, 1.0, 0.8, 0.1];
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  rows.forEach((t, r) => {
    const w = wid * wp[r], cup = 0.18 * wid * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1));
    pos.push(-w, 0, t * len, 0, cup, t * len, w, 0, t * len);
    const k = t;
    const c = [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    col.push(...c, c[0] * 1.06, c[1] * 1.06, c[2] * 1.06, ...c);
    if (r < 3) { const b = r * 3; idx.push(b, b + 1, b + 3, b + 1, b + 4, b + 3, b + 1, b + 2, b + 4, b + 2, b + 5, b + 4); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aPet', new THREE.BufferAttribute(new Float32Array(pos.length / 3).fill(1), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.rotateX(-tilt);
  g.rotateY(az);
  g.translate(0, y0, 0);
  return g;
}

/** A bloom: rings of petals (n, length, width, tilt) + a yellow centre. Petal colour white-ish, tinted per instance (aPet = 1). */
function bloomParts(y0: number, rings: [number, number, number, number][]): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  rings.forEach(([n, len, wid, tilt], ri) => {
    for (let i = 0; i < n; i++) out.push(petal(len, wid, tilt, (i / n) * Math.PI * 2 + ri * 0.5 + hash2(i, ri, 41) * 0.25, y0, [0.78, 0.74, 0.74], [1.1, 1.08, 1.08]));
  });
  const c0 = new THREE.IcosahedronGeometry(0.035, 0);
  c0.deleteAttribute('uv');
  c0.deleteAttribute('normal');
  const c = mergeVertices(c0, 1e-4); // indexed, like every other part of the bloom
  c.scale(1, 0.7, 1);
  c.translate(0, y0 + 0.012, 0);
  out.push(paint(c, () => [1.5, 1.15, 0.15], 0));
  return out;
}

/** PLANT-REAL 2: an underwater FLOWER: curved-free stem (1 unit), 3 leaves at the base, a 12-petal bloom on top (petals take the instance colour). */
export function flowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.009, 0.017, 0.9, 5, 2, true);
  stem.translate(0, 0.45, 0);
  parts.push(paint(stem, (_x, y) => [0.1 + 0.12 * y, 0.28 + 0.2 * y, 0.08], 0));
  for (let i = 0; i < 3; i++) parts.push(ribbon(0.38 + 0.12 * i, 0.03, 0.18 + 0.08 * i, 2, [0.08, 0.22, 0.06], [0.28, 0.5, 0.15], (i / 3) * Math.PI * 2 + 0.5, 0.012, 0, true));
  parts.push(...bloomParts(0.9, [[7, 0.2, 0.055, 0.55], [5, 0.15, 0.045, 1.0]]));
  return mergeParts(parts);
}

/** PLANT-REAL 2: a LILY PAD on the water surface (fresh water): a round leaf with a notch, cupped rim, radius 0.5. y = 0 is the water. */
export function lilyPadGeometry(): THREE.BufferGeometry {
  const N = 13, gap = 0.45, a0 = 1.2;
  const pos: number[] = [0, 0.004, 0, ], col: number[] = [0.1, 0.28, 0.07], idx: number[] = [];
  const rings = [[0.3, 0.0], [0.5, 0.035]];
  for (let r = 0; r < rings.length; r++) {
    for (let i = 0; i <= N; i++) {
      const a = a0 + gap / 2 + (i / N) * (Math.PI * 2 - gap);
      const wob = 1 + 0.03 * Math.sin(i * 2.7);
      pos.push(Math.cos(a) * rings[r][0] * wob, rings[r][1], Math.sin(a) * rings[r][0] * wob);
      col.push(r === 0 ? 0.14 : 0.24, r === 0 ? 0.34 : 0.46, r === 0 ? 0.09 : 0.12);
    }
  }
  for (let i = 0; i < N; i++) {
    idx.push(0, 1 + i + 1, 1 + i); // centre -> ring 1
    const a = 1 + i, b = 1 + i + 1, c = 1 + (N + 1) + i, d = 1 + (N + 1) + i + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aPet', new THREE.BufferAttribute(new Float32Array(pos.length / 3), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** PLANT-REAL 2: a LOTUS / water-lily BLOOM that sits on a pad: 3 rings of petals opening outward, yellow centre (18 petals). */
export function lotusBloomGeometry(): THREE.BufferGeometry {
  return mergeParts(bloomParts(0.02, [[7, 0.26, 0.075, 0.28], [6, 0.21, 0.065, 0.7], [5, 0.15, 0.05, 1.1]]));
}


function rockGeometry(): THREE.BufferGeometry {
  // ROCK-REAL: the same smooth noisy stone as the land rocks (radius 0.5, centred; the instance scale sets the size)
  return buildRockGeometry({ detail: 2, sx: 0.55, sy: 0.375, sz: 0.5, lumpy: 0.2, chip: 0.45, bottom: 0.47, base: 0xdcdcdc, seed: 31, grounded: false });
}

export class SeabedDecor {
  private meshes: THREE.InstancedMesh[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private uTime = { value: 0 };
  private cells = new Map<number, Inst[]>();
  private offsets: { dx: number; dz: number; d: number }[] = [];
  private offsetsReach = 0;
  private quality = 1;
  private sc: TerrainSample;
  private dirty = true;
  private rebuildTimer = 0;
  private evictTimer = 0;
  private lastGx = 1e9;
  private lastGz = 1e9;
  private mtx = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private pos = new THREE.Vector3();
  private scl = new THREE.Vector3();
  private col = new THREE.Color();
  private yAxis = new THREE.Vector3(0, 1, 0);

  constructor(
    root: THREE.Object3D,
    private terrain: TerrainGenerator,
  ) {
    this.sc = terrain.makeSample();
    const seaweedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    seaweedMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.8;
          float sw = position.y * position.y;
          transformed.x += sin(uTime * 1.4 + ph + position.y * 3.0) * 0.2 * sw;
          transformed.z += cos(uTime * 1.1 + ph * 1.3 + position.y * 2.5) * 0.15 * sw;
          vWP = position;`,
        )
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;');
      // PLANT-REAL: fine veins running along the blade + a slow light / dark mottling (object-space value noise)
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vWP;
float swH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float swN(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(swH(i), swH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(swH(i + vec3(0.0, 1.0, 0.0)), swH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(swH(i + vec3(0.0, 0.0, 1.0)), swH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(swH(i + vec3(0.0, 1.0, 1.0)), swH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          diffuseColor.rgb *= (0.8 + 0.4 * swN(vec3(vWP.x * 70.0, vWP.y * 4.0, vWP.z * 70.0))) * (0.85 + 0.3 * swN(vec3(vWP.x * 6.0, vWP.y * 5.0, vWP.z * 6.0)));`,
        );
    };
    seaweedMat.customProgramCacheKey = () => 'evc-seaweed-v2';
    const branchMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    applyCoralTexture(branchMat, 'evc-coral-polyp-v1', 'polyp');
    const domeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });
    applyCoralTexture(domeMat, 'evc-coral-brain-v1', 'brain');
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    applyRockTexture(rockMat, 'evc-searock-v2', 0.2); // procedural stone surface (little moss under water)
    // sea grass: same sway idea, faster and smaller (thin ribbons), no veins
    const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    grassMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 1.1 + position.x * 7.0;
          float sw = position.y * position.y;
          transformed.x += sin(uTime * 1.9 + ph + position.y * 4.0) * 0.16 * sw;
          transformed.z += cos(uTime * 1.5 + ph * 1.3 + position.y * 3.0) * 0.12 * sw;`,
        );
    };
    grassMat.customProgramCacheKey = () => 'evc-seagrass-v1';
    // flowers + lotus blooms: `aPet` (1 = petal) decides whether the per-instance colour is applied; the stem sways a little
    const petalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
    petalMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aPet;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
          float sw = position.y * position.y;
          transformed.x += sin(uTime * 1.2 + ph) * 0.07 * sw;
          transformed.z += cos(uTime * 1.0 + ph * 1.3) * 0.05 * sw;`,
        )
        .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nvColor.xyz = mix(color.xyz, vColor.xyz, aPet);\n#endif');
    };
    petalMat.customProgramCacheKey = () => 'evc-petal-v1';
    // lily pad: radial veins + mottling in the fragment shader
    const padMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
    padMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            float pa = atan(vWP.z, vWP.x);
            float pr = length(vWP.xz);
            float vein = smoothstep(0.75, 1.0, abs(sin(pa * 11.0)));
            diffuseColor.rgb *= 1.0 - 0.24 * vein * smoothstep(0.03, 0.2, pr);
            diffuseColor.rgb *= 0.88 + 0.24 * fract(sin(dot(floor(vWP.xz * 16.0), vec2(12.9898, 78.233))) * 43758.5453);
          }`,
        );
    };
    padMat.customProgramCacheKey = () => 'evc-lilypad-v1';
    this.mats.push(seaweedMat, branchMat, domeMat, rockMat, grassMat, petalMat, padMat);
    const geos = [bladeGeometry(), branchCoralGeometry(), domeCoralGeometry(), rockGeometry(), seaGrassGeometry(), flowerGeometry(), lilyPadGeometry(), lotusBloomGeometry()];
    const mats = [seaweedMat, branchMat, domeMat, rockMat, grassMat, petalMat, padMat, petalMat];
    const maxCaps = QUALITY[2].caps;
    for (let i = 0; i < KINDS; i++) {
      const m = new THREE.InstancedMesh(geos[i], mats[i], maxCaps[i]);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = false;
      m.name = ['seaweed', 'branchCoral', 'domeCoral', 'seaRock', 'seaGrass', 'seaFlower', 'lilyPad', 'lotusBloom'][i];
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(m);
      this.meshes.push(m);
      this.geos.push(geos[i]);
    }
    this.setQuality(1);
  }

  setQuality(q: number): void {
    this.quality = Math.max(0, Math.min(2, Math.round(q)));
    this.cells.clear();
    this.dirty = true;
    this.lastGx = 1e9;
  }

  private ensureOffsets(reach: number): void {
    if (this.offsetsReach === reach) return;
    this.offsetsReach = reach;
    this.offsets = [];
    const r = Math.ceil(reach / CELL);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dz) * CELL;
        if (d <= reach) this.offsets.push({ dx, dz, d });
      }
    }
    this.offsets.sort((a, b) => a.d - b.d);
  }

  private key(gx: number, gz: number): number {
    return (gx + 5000) * 20000 + (gz + 5000);
  }

  /** Plants of one grid cell (can be empty). */
  private makeCell(gx: number, gz: number): Inst[] {
    const out: Inst[] = [];
    const x = (gx + hash2(gx, gz, 11)) * CELL;
    const z = (gz + hash2(gx, gz, 12)) * CELL;
    this.terrain.sample(x, z, this.sc);
    const s = this.sc;
    if (Number.isNaN(s.water)) return out;
    const depth = s.water - s.h;
    if (depth < 0.5) return out;
    const reef = vnoise(x * 0.013 + 10, z * 0.013, 3); // > 0.55: coral reef zone, otherwise sea-grass meadow
    const rocky = vnoise(x * 0.035, z * 0.035 + 40, 4);
    const r1 = hash2(gx, gz, 21);
    const r2 = hash2(gx, gz, 22);
    const r3 = hash2(gx, gz, 23);
    const r4 = hash2(gx, gz, 24);

    // PLANT-REAL 2: lily pads + lotus blooms on FRESH water (the sea is at level 0; lakes, ponds and rivers lie above it)
    if (s.water > 0.5 && depth <= 4.5) {
      const pond = vnoise(x * 0.05 + 20, z * 0.05, 9);
      if (pond > 0.35 && hash2(gx, gz, 140) < 0.7) {
        const nP = 2 + Math.floor(hash2(gx, gz, 141) * 4);
        for (let c = 0; c < nP; c++) {
          const px = x + (hash2(gx, gz, 150 + c) - 0.5) * CELL * 0.95, pz = z + (hash2(gx, gz, 160 + c) - 0.5) * CELL * 0.95;
          const sc = 0.6 + hash2(gx, gz, 170 + c) * 0.9, yaw = hash2(gx, gz, 180 + c) * 6.28;
          out.push({ kind: 6, x: px, y: s.water + 0.03, z: pz, yaw, sx: sc, sy: sc, sz: sc, tint: 0 });
          if (hash2(gx, gz, 190 + c) < 0.38) out.push({ kind: 7, x: px, y: s.water + 0.03, z: pz, yaw, sx: sc * 0.9, sy: sc * 0.9, sz: sc * 0.9, tint: Math.floor(hash2(gx, gz, 200 + c) * LOTUS_TINTS.length) });
        }
      }
    }
    if (depth < 1.0) return out;

    // sea grass meadows (eelgrass): many tufts per cell where the meadow noise is high
    if (depth <= 14 && reef < 0.62) {
      const mead = vnoise(x * 0.02 + 3, z * 0.02, 7);
      if (mead > 0.38) {
        const nT = 3 + Math.floor(hash2(gx, gz, 100) * 4);
        for (let c = 0; c < nT; c++) {
          const jx = (hash2(gx, gz, 110 + c) - 0.5) * CELL * 1.1, jz = (hash2(gx, gz, 120 + c) - 0.5) * CELL * 1.1;
          const hgt = Math.min(0.55 + hash2(gx, gz, 125 + c) * 0.9 + (mead - 0.38) * 0.8, depth * 0.85);
          const w = 0.8 + hash2(gx, gz, 128 + c) * 0.6;
          out.push({ kind: 4, x: x + jx, y: s.h - 0.03, z: z + jz, yaw: hash2(gx, gz, 130 + c) * 6.28, sx: w, sy: hgt, sz: w, tint: Math.floor(hash2(gx, gz, 133 + c) * SEAGRASS_TINTS.length) });
        }
      }
    }
    // underwater flowers: small patches of one colour
    if (depth <= 10 && reef < 0.62 && hash2(gx, gz, 136) < 0.2) {
      const nF = 1 + Math.floor(hash2(gx, gz, 137) * 3);
      const patch = Math.floor(vnoise(x * 0.05 + 40, z * 0.05, 15) * FLOWER_TINTS.length * 0.999);
      for (let c = 0; c < nF; c++) {
        const sc = Math.min(0.55 + hash2(gx, gz, 138 + c) * 0.7, (depth * 0.9) / 0.95);
        out.push({
          kind: 5, x: x + (hash2(gx, gz, 142 + c) - 0.5) * 3.5, y: s.h - 0.03, z: z + (hash2(gx, gz, 146 + c) - 0.5) * 3.5, yaw: hash2(gx, gz, 148 + c) * 6.28,
          sx: sc, sy: sc, sz: sc, tint: hash2(gx, gz, 149 + c) < 0.25 ? Math.floor(hash2(gx, gz, 151 + c) * FLOWER_TINTS.length) : patch,
        });
      }
    }
    // seaweed meadows and kelp forests
    if (depth <= 30 && reef < 0.6 && r1 < 0.42) {
      const clumps = 1 + (r2 > 0.55 ? 1 : 0) + (r2 > 0.85 ? 1 : 0);
      for (let c = 0; c < clumps; c++) {
        const jx = (hash2(gx, gz, 30 + c) - 0.5) * CELL * 0.9;
        const jz = (hash2(gx, gz, 40 + c) - 0.5) * CELL * 0.9;
        let height = 0.7 + hash2(gx, gz, 50 + c) * 1.8;
        if (depth > 6 && r3 > 0.6) height = Math.min(depth * 0.7, 3 + hash2(gx, gz, 60 + c) * 6); // kelp
        height = Math.min(height, depth * 0.9); // never sticks out of the water
        const w = 0.85 + hash2(gx, gz, 70 + c) * 0.9;
        out.push({
          kind: 0, x: x + jx, y: s.h - 0.08, z: z + jz, yaw: hash2(gx, gz, 80 + c) * 6.28,
          sx: w, sy: height, sz: w, tint: Math.floor(hash2(gx, gz, 90 + c) * SEAWEED_TINTS.length),
        });
      }
    }
    // coral reef (clear shallow water)
    if (reef > 0.52 && depth >= 1.5 && depth <= 18) {
      if (r1 < 0.55) {
        const sc = 0.7 + r2 * 1.5;
        out.push({
          kind: 1, x: x + (r3 - 0.5) * 3, y: s.h - 0.05, z: z + (r4 - 0.5) * 3, yaw: r2 * 6.28,
          sx: sc, sy: Math.min(sc * (0.8 + r3 * 0.8), (depth - 0.4) / 0.85), sz: sc, tint: Math.floor(r4 * CORAL_TINTS.length),
        });
      }
      if (r2 < 0.45) {
        const sc = 0.6 + r3 * 1.4;
        out.push({
          kind: 2, x: x - (r4 - 0.5) * 3, y: s.h - 0.02, z: z + (r1 - 0.5) * 3, yaw: r3 * 6.28,
          sx: sc, sy: sc * (0.8 + r1 * 0.4), sz: sc * (0.8 + r2 * 0.4), tint: Math.floor(r1 * DOME_TINTS.length),
        });
      }
    }
    // rocks
    if (rocky > 0.55 && r4 < 0.45) {
      const sc = 0.4 + r1 * r1 * 2.4;
      out.push({
        kind: 3, x: x + (r2 - 0.5) * 3, y: s.h + 0.05 * sc, z: z + (r3 - 0.5) * 3, yaw: r1 * 6.28,
        sx: sc * (0.9 + r2 * 0.6), sy: sc * (0.6 + r3 * 0.5), sz: sc, tint: Math.floor(r4 * ROCK_TINTS.length),
      });
    }
    return out;
  }

  /** cx, cz = where the player / camera is (absolute world metres). */
  update(dt: number, time: number, cx: number, cz: number): void {
    this.uTime.value = time;
    const Q = QUALITY[this.quality];
    this.ensureOffsets(Q.reach);
    const gx0 = Math.floor(cx / CELL);
    const gz0 = Math.floor(cz / CELL);
    if (gx0 !== this.lastGx || gz0 !== this.lastGz) {
      this.lastGx = gx0;
      this.lastGz = gz0;
      this.dirty = true;
    }
    // compute a few missing cells per frame, nearest first
    let budget = 36;
    for (let i = 0; i < this.offsets.length && budget > 0; i++) {
      const o = this.offsets[i];
      const k = this.key(gx0 + o.dx, gz0 + o.dz);
      if (this.cells.has(k)) continue;
      this.cells.set(k, this.makeCell(gx0 + o.dx, gz0 + o.dz));
      this.dirty = true;
      budget--;
    }
    // forget far cells
    this.evictTimer -= dt;
    if (this.evictTimer <= 0) {
      this.evictTimer = 1.5;
      const lim = Math.ceil((Q.reach + 15) / CELL);
      for (const k of this.cells.keys()) {
        const gx = Math.floor(k / 20000) - 5000;
        const gz = (k % 20000) - 5000;
        if (Math.abs(gx - gx0) > lim || Math.abs(gz - gz0) > lim) this.cells.delete(k);
      }
    }
    this.rebuildTimer -= dt;
    if (this.dirty && this.rebuildTimer <= 0) {
      this.rebuildTimer = 0.25;
      this.dirty = false;
      this.rebuild(gx0, gz0);
    }
  }

  private rebuild(gx0: number, gz0: number): void {
    const caps = QUALITY[this.quality].caps;
    const n = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < this.offsets.length; i++) {
      const o = this.offsets[i];
      const list = this.cells.get(this.key(gx0 + o.dx, gz0 + o.dz));
      if (!list) continue;
      for (const it of list) {
        const k = it.kind;
        if (n[k] >= caps[k]) continue;
        const mesh = this.meshes[k];
        this.quat.setFromAxisAngle(this.yAxis, it.yaw);
        this.pos.set(it.x, it.y, it.z);
        this.scl.set(it.sx, it.sy, it.sz);
        this.mtx.compose(this.pos, this.quat, this.scl);
        mesh.setMatrixAt(n[k], this.mtx);
        const t = k === 0 ? SEAWEED_TINTS[it.tint] : k === 1 ? CORAL_TINTS[it.tint] : k === 2 ? DOME_TINTS[it.tint] : k === 3 ? ROCK_TINTS[it.tint] : k === 4 ? SEAGRASS_TINTS[it.tint] : k === 5 ? FLOWER_TINTS[it.tint] : k === 6 ? SEAGRASS_TINTS[0] : LOTUS_TINTS[it.tint];
        this.col.setRGB(t[0], t[1], t[2]);
        mesh.setColorAt(n[k], this.col);
        n[k]++;
      }
    }
    for (let k = 0; k < KINDS; k++) {
      const m = this.meshes[k];
      m.count = n[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** Total number of plants / rocks drawn (debug). */
  get count(): number {
    return this.meshes.reduce((a, m) => a + m.count, 0);
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.removeFromParent();
      m.dispose();
    }
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

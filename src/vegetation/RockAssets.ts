import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROCK_KIND_COUNT, RockKind } from './TreeTypes';

/**
 * Rock models (built from code) + the shared rock material.
 * ROCK-REAL (2026-11-25): before, a rock was a squashed icosahedron with ONE random flat colour per face (no texture, hard
 * triangles, a lumpy ball). Now:
 *   - SHAPE: smooth normals + 3 octaves of 3D value noise + a ridged "chip" term (cracks / worn edges), the bottom squashed so the
 *     stone sits in the ground. Near model = icosahedron detail 2 (180 triangles), far = detail 1 (80).
 *   - TEXTURE: no image file. `applyRockTexture` adds a procedural surface in the fragment shader (object-space 3D noise:
 *     mottling, mineral grains, wobbly strata, cracks, a little moss on the top faces). The seabed rocks use the SAME function.
 * Two kinds x two detail levels (0 = near, 1 = far), base at y = 0, radius ~1 m at scale 1.  round: a boulder, slab: a flat wide stone.
 */

function h3(x: number, y: number, z: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 3D value noise 0..1 (lattice of 1 unit). */
function vn3(x: number, y: number, z: number, s: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  return l(
    l(l(h3(ix, iy, iz, s), h3(ix + 1, iy, iz, s), fx), l(h3(ix, iy + 1, iz, s), h3(ix + 1, iy + 1, iz, s), fx), fy),
    l(l(h3(ix, iy, iz + 1, s), h3(ix + 1, iy, iz + 1, s), fx), l(h3(ix, iy + 1, iz + 1, s), h3(ix + 1, iy + 1, iz + 1, s), fx), fy),
    fz,
  );
}

export interface RockShape {
  /** icosahedron detail (1 = 80 triangles, 2 = 180) */
  detail: number;
  /** radii (x, y of the TOP half, z) */
  sx: number; sy: number; sz: number;
  /** size of the noise bumps (0.2 = strong) */
  lumpy: number;
  /** how deep the cracks / chips go (0 = none) */
  chip: number;
  /** the part below y = 0 is this fraction as tall as the top */
  bottom: number;
  /** vertex colour base */
  base: number;
  /** noise seed (a different number = a different stone) */
  seed: number;
  /** true: lowest point moved to y = 0 (land rocks); false: centred (seabed rocks, the instance sets the height) */
  grounded: boolean;
}

/** One smooth, noisy stone. Attributes: position, normal, color (no uv: the surface is procedural, see applyRockTexture). */
export function buildRockGeometry(o: RockShape): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, o.detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4); // shared corners -> smooth normals and no cracks between faces
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i); // on the unit sphere
    const a = vn3(x * 1.5 + 3.1, y * 1.5, z * 1.5, o.seed), b = vn3(x * 3.3 + 7.7, y * 3.3, z * 3.3, o.seed + 1), c = vn3(x * 7.5, y * 7.5 + 5.3, z * 7.5, o.seed + 2);
    const ridge = 1 - Math.abs(2 * vn3(x * 2.6 + 9, y * 2.6, z * 2.6 + 2, o.seed + 3) - 1);
    const k = 1 + o.lumpy * (2 * (0.55 * a + 0.3 * b + 0.15 * c) - 1) - o.chip * 0.5 * Math.pow(ridge, 5);
    p.setXYZ(i, x * k * o.sx, (y >= 0 ? y * o.sy : y * o.sy * o.bottom) * k, z * k * o.sz);
  }
  g.computeVertexNormals();
  if (o.grounded) {
    g.computeBoundingBox();
    g.translate(0, -g.boundingBox!.min.y, 0);
  }
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const c0 = new THREE.Color(o.base);
  for (let i = 0; i < p.count; i++) {
    const up = Math.max(0, n.getY(i)); // lighter on faces that look up, a little variation from the noise
    const v = vn3(p.getX(i) * 4 + 1.3, p.getY(i) * 4, p.getZ(i) * 4, o.seed + 9) - 0.5;
    const f = 0.8 + 0.28 * up + v * 0.16;
    col[i * 3] = c0.r * f; col[i * 3 + 1] = c0.g * f; col[i * 3 + 2] = c0.b * f;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * Procedural stone surface for a material with vertexColors (Lambert or Standard): object-space 3D noise in the fragment shader.
 * Needs the `position` / `normal` attributes only. Shared by the land rocks and the seabed rocks.
 */
export function applyRockTexture(m: THREE.Material, key: string, moss = 1): void {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockP;\nvarying vec3 vRockN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockP = position;\nvRockN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRockP;
varying vec3 vRockN;
float rkH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rkN(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rkH(i), rkH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(rkH(i + vec3(0.0, 1.0, 0.0)), rkH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(rkH(i + vec3(0.0, 0.0, 1.0)), rkH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(rkH(i + vec3(0.0, 1.0, 1.0)), rkH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 q = vRockP;
          float n1 = rkN(q * 3.0), n2 = rkN(q * 9.0 + 7.0), n3 = rkN(q * 27.0 + 3.0);
          float tex = 0.72 + 0.3 * n1 + 0.16 * n2 + 0.12 * (n3 - 0.5);
          // strata: soft wobbly bands
          float band = sin((q.y * 6.0 + n1 * 2.5) * 3.14159);
          tex *= 1.0 - 0.09 * smoothstep(0.5, 1.0, band);
          // mineral grains: light and dark specks
          tex *= 1.0 + 0.16 * step(0.87, n3) - 0.12 * step(n3, 0.09);
          // cracks: thin dark lines where a ridged noise peaks
          float cr = 1.0 - abs(rkN(q * 5.5 + 13.0) * 2.0 - 1.0);
          tex *= 1.0 - 0.34 * smoothstep(0.92, 0.985, cr);
          diffuseColor.rgb *= tex;
          // a little moss / lichen on the faces that look up
          float up = smoothstep(0.55, 0.95, vRockN.y);
          float mo = up * smoothstep(0.5, 0.72, n1 * 0.6 + n2 * 0.4) * ${moss.toFixed(2)};
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.28, 0.1), mo * 0.5);
        }`,
      );
  };
  m.customProgramCacheKey = () => key;
}

/** Geometries (shared by all chunks, never disposed per chunk) + one material. */
export class RockAssets {
  /** [kind][detail] */
  readonly geometries: THREE.BufferGeometry[][] = [];
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });

  constructor() {
    applyRockTexture(this.material, 'evc-rock-v1');
    for (let k = 0; k < ROCK_KIND_COUNT; k++) this.geometries.push([]);
    const round = { sx: 1.0, sy: 0.74, sz: 0.92, bottom: 0.5, base: 0x7b766d, grounded: true };
    const slab = { sx: 1.5, sy: 0.32, sz: 1.15, bottom: 0.5, base: 0x86806f, grounded: true };
    this.geometries[RockKind.round] = [
      buildRockGeometry({ ...round, detail: 2, lumpy: 0.2, chip: 0.5, seed: 11 }),
      buildRockGeometry({ ...round, detail: 1, lumpy: 0.16, chip: 0.3, seed: 11 }),
    ];
    this.geometries[RockKind.slab] = [
      buildRockGeometry({ ...slab, detail: 2, lumpy: 0.15, chip: 0.5, seed: 23 }),
      buildRockGeometry({ ...slab, detail: 1, lumpy: 0.12, chip: 0.3, seed: 23 }),
    ];
  }

  dispose(): void {
    for (const pair of this.geometries) for (const g of pair) g.dispose();
    this.material.dispose();
  }
}

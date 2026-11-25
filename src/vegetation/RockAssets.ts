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

/** GLSL shared by every procedural surface (rocks, corals): value noise, fbm, and a screen-derivative bump (like three's bumpmap). */
const GLSL_COMMON = `
varying vec3 vRockP;
varying vec3 vRockN;
float rkH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rkN(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rkH(i), rkH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(rkH(i + vec3(0.0, 1.0, 0.0)), rkH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(rkH(i + vec3(0.0, 0.0, 1.0)), rkH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(rkH(i + vec3(0.0, 1.0, 1.0)), rkH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float rkF(vec3 p){
  float a = 0.5; float s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * rkN(p); p = p * 2.03 + vec3(11.7, 3.1, 7.3); a *= 0.5; }
  return s / 0.9375;
}
vec3 rkBump(vec3 sp, vec3 sn, vec2 dh, float fd){
  dh *= 1.0 / (1.0 + 8.0 * length(dh)); // far away the derivative explodes (aliasing): soft limit
  vec3 sx = normalize(dFdx(sp)); vec3 sy = normalize(dFdy(sp));
  vec3 r1 = cross(sy, sn); vec3 r2 = cross(sn, sx);
  float det = dot(sx, r1) * fd;
  vec3 g = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * sn - g);
}
`;

/** Same position -> same pattern: everything is computed from the OBJECT-space position (no uv, no image file). */
function injectProc(m: THREE.Material, key: string, fragCommon: string, colorBlock: string, bumpBlock: string): void {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockP;\nvarying vec3 vRockN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockP = position;\nvRockN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>${GLSL_COMMON}${fragCommon}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n{\n${colorBlock}\n}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n{\n${bumpBlock}\n}`);
  };
  m.customProgramCacheKey = () => key;
}

/**
 * Procedural stone surface for a material with vertexColors (Lambert or Standard). ROCK-REAL 2: no cartoon crack lines any more.
 *   - three stone tones (grey / warm sandstone / cool dark) in large soft patches, a domain-warped fbm for the mottling,
 *   - fine grain (2 scales) + light / dark mineral specks, faint strata, hairline cracks only in some patches,
 *   - rust stains running down the sides, lichen dots and a little moss on the faces that look up,
 *   - a screen-derivative bump from fine noise, so the light catches the grain.
 * `moss` 0..1 scales the moss (seabed rocks use less).
 */
export function applyRockTexture(m: THREE.Material, key: string, moss = 1): void {
  const color = `
  vec3 q = vRockP;
  vec3 w = q + 0.22 * vec3(rkN(q * 2.0), rkN(q * 2.0 + 5.0), rkN(q * 2.0 + 9.0));
  float big = rkF(w * 2.0);
  float mid = rkF(w * 6.5 + 3.0);
  float g1 = rkN(q * 48.0);
  float g2 = rkN(q * 130.0 + 4.0);
  float up = smoothstep(0.45, 0.95, vRockN.y);
  vec3 tone = mix(vec3(0.95, 0.95, 0.96), vec3(1.12, 1.0, 0.8), smoothstep(0.38, 0.7, big));
  tone = mix(tone, vec3(0.66, 0.67, 0.72), smoothstep(0.55, 0.85, mid) * 0.55);
  float lum = 0.86 + 0.28 * mid + 0.16 * (g1 - 0.5) + 0.12 * (g2 - 0.5);
  float band = sin((w.y * 4.5 + big * 3.5) * 3.14159);
  lum *= 1.0 - 0.07 * smoothstep(0.3, 1.0, band) * smoothstep(0.3, 0.6, big);
  lum *= 1.0 + 0.18 * step(0.9, g2) - 0.16 * step(g2, 0.07);
  float cr = 1.0 - abs(rkN(w * 11.0 + 21.0) * 2.0 - 1.0);
  lum *= 1.0 - 0.22 * smoothstep(0.965, 0.995, cr) * smoothstep(0.35, 0.65, big);
  float st = rkN(vec3(q.x * 5.0, q.y * 1.1, q.z * 5.0) + 17.0);
  tone = mix(tone, vec3(1.15, 0.82, 0.58), smoothstep(0.62, 0.8, st) * 0.4 * (1.0 - up));
  diffuseColor.rgb *= tone * lum;
  float lc = smoothstep(0.74, 0.82, rkN(q * 16.0 + 2.0)) * up;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.4, 0.2), lc * 0.45);
  float mo = up * smoothstep(0.52, 0.74, big * 0.55 + mid * 0.45) * ${moss.toFixed(2)};
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.11, 0.025) * (0.8 + 0.5 * g1), mo * 0.7);`;
  const bump = `
  float h = rkN(vRockP * 26.0) * 0.55 + rkN(vRockP * 70.0 + 4.0) * 0.3 + rkN(vRockP * 9.0) * 0.35;
  normal = rkBump(-vViewPosition, normal, vec2(dFdx(h), dFdy(h)) * 0.45, faceDirection);`;
  injectProc(m, key, '', color, bump);
}

/**
 * Procedural coral skin. 'polyp' = branching coral: small round polyp pits all over + mottling. 'brain' = dome coral: the
 * meandering grooves of a brain coral, made from the iso-lines of a noise (dark valleys, light ridges, bump from the same height).
 */
export function applyCoralTexture(m: THREE.Material, key: string, mode: 'polyp' | 'brain'): void {
  const color = mode === 'brain' ? `
  vec3 q = vRockP;
  float bh = rkBrainH(q);
  float mot = rkF(q * 5.0);
  diffuseColor.rgb *= (0.5 + 0.6 * smoothstep(0.05, 0.95, bh)) * (0.85 + 0.3 * mot);` : `
  vec3 q = vRockP;
  float pd = rkN(q * 60.0);
  float pit = smoothstep(0.58, 0.82, pd);
  float mot = rkF(q * 7.0);
  diffuseColor.rgb *= (1.0 - 0.38 * pit) * (0.78 + 0.4 * mot);`;
  const bump = mode === 'brain' ? `
  float h = rkBrainH(vRockP);
  normal = rkBump(-vViewPosition, normal, vec2(dFdx(h), dFdy(h)) * 0.05, faceDirection);` : `
  float h = rkN(vRockP * 60.0);
  normal = rkBump(-vViewPosition, normal, vec2(dFdx(h), dFdy(h)) * 0.12, faceDirection);`;
  const common = mode === 'brain' ? 'float rkBrainH(vec3 q){ float f = rkN(q * 13.0) * 0.6 + rkN(q * 27.0 + 3.0) * 0.4; return abs(fract(f * 7.0) - 0.5) * 2.0; }' : '';
  injectProc(m, key, common, color, bump);
}

/** Geometries (shared by all chunks, never disposed per chunk) + one material. */
export class RockAssets {
  /** [kind][detail] */
  readonly geometries: THREE.BufferGeometry[][] = [];
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });

  constructor() {
    applyRockTexture(this.material, 'evc-rock-v2');
    for (let k = 0; k < ROCK_KIND_COUNT; k++) this.geometries.push([]);
    const round = { sx: 1.0, sy: 0.74, sz: 0.92, bottom: 0.5, base: 0x8f897e, grounded: true };
    const slab = { sx: 1.5, sy: 0.32, sz: 1.15, bottom: 0.5, base: 0x9a9484, grounded: true };
    this.geometries[RockKind.round] = [
      buildRockGeometry({ ...round, detail: 3, lumpy: 0.2, chip: 0.5, seed: 11 }),
      buildRockGeometry({ ...round, detail: 1, lumpy: 0.16, chip: 0.3, seed: 11 }),
    ];
    this.geometries[RockKind.slab] = [
      buildRockGeometry({ ...slab, detail: 3, lumpy: 0.15, chip: 0.5, seed: 23 }),
      buildRockGeometry({ ...slab, detail: 1, lumpy: 0.12, chip: 0.3, seed: 23 }),
    ];
  }

  dispose(): void {
    for (const pair of this.geometries) for (const g of pair) g.dispose();
    this.material.dispose();
  }
}

// CITY MALL, STEP C5: small low-poly product models for the shelves (NOT the big showroom models of ProductModels.ts: those carry their own stands). One merged BufferGeometry per
// ProductKind, vertex colours baked in: a part coloured 'p' is white (the instance colour = the product colour tints it), every other part keeps its fixed colour (times the instance
// colour). The geometry is normalised: standing on y = 0, centred on x / z, the longest side = 1 m (the InstancedMesh scale = the size of the slot). ~60-250 triangles each.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ProductKind } from './MallCatalog';

type Col = number | 'p';
const DK = 0x1f2937, WH = 0xf8fafc, ST = 0x94a3b8, WD = 0x92400e;
interface Part { geo: THREE.BufferGeometry; x: number; y: number; z: number; rx: number; ry: number; rz: number; c: Col }
// helpers: (x, y, z) = the CENTRE of the part
const bx = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: Col, rx = 0, ry = 0, rz = 0): Part => ({ geo: new THREE.BoxGeometry(sx, sy, sz), x, y, z, rx, ry, rz, c });
const cy = (x: number, y: number, z: number, r: number, h: number, c: Col, rx = 0, rz = 0, r2 = r): Part => ({ geo: new THREE.CylinderGeometry(r2, r, h, 8), x, y, z, rx, ry: 0, rz, c });
const sp = (x: number, y: number, z: number, r: number, c: Col): Part => ({ geo: new THREE.SphereGeometry(r, 8, 5), x, y, z, rx: 0, ry: 0, rz: 0, c });
const arc = (x: number, y: number, z: number, r: number, t: number, c: Col): Part => ({ geo: new THREE.TorusGeometry(r, t, 4, 10, Math.PI), x, y, z, rx: 0, ry: 0, rz: 0, c });

const MODELS: Partial<Record<ProductKind, () => Part[]>> = {
  box: () => [bx(0, 0.35, 0, 1, 0.7, 0.8, 'p'), bx(0, 0.35, 0, 0.16, 0.72, 0.82, 0xfacc15), bx(0, 0.7, 0, 1.02, 0.04, 0.82, WH)],
  cake: () => [cy(0, 0.22, 0, 0.7, 0.45, 0xfde68a), cy(0, 0.54, 0, 0.72, 0.18, 'p'), cy(0, 0.78, 0, 0.46, 0.3, 0xfef3c7), cy(0, 1.0, 0, 0.48, 0.1, 'p'), sp(0, 1.1, 0, 0.1, 0xef4444)],
  bottle: () => [-0.55, 0, 0.55].flatMap((x) => [cy(x, 0.38, 0, 0.18, 0.75, 'p'), cy(x, 0.95, 0, 0.09, 0.4, 'p', 0, 0, 0.09)]),
  shirt: () => [bx(0, 0.5, 0, 0.2, 1.0, 0.06, ST), bx(0, 1.0, 0, 0.8, 0.05, 0.05, ST), bx(0, 0.62, 0, 0.78, 0.75, 0.14, 'p'), bx(-0.5, 0.7, 0, 0.3, 0.55, 0.12, 'p', 0, 0, 0.35), bx(0.5, 0.7, 0, 0.3, 0.55, 0.12, 'p', 0, 0, -0.35), bx(0, 1.0, 0.02, 0.24, 0.05, 0.16, WH)],
  shoe: () => [bx(0, 0.04, 0, 0.4, 0.08, 1.1, WH), bx(0, 0.19, 0.2, 0.4, 0.22, 0.6, 'p'), bx(0, 0.35, -0.28, 0.4, 0.5, 0.4, 'p'), bx(0, 0.6, -0.28, 0.3, 0.04, 0.3, DK), bx(0, 0.27, 0.15, 0.42, 0.06, 0.3, WH)],
  bag: () => [bx(0, 0.35, 0, 0.9, 0.7, 0.4, 'p'), bx(0, 0.52, 0, 0.92, 0.12, 0.42, DK), arc(0, 0.7, 0, 0.28, 0.035, 0x1c1917), bx(0, 0.5, 0.22, 0.18, 0.1, 0.02, 0xd4a017)],
  watch: () => [bx(0, 0.5, -0.02, 0.26, 1.0, 0.06, DK), cy(0, 0.5, 0, 0.38, 0.1, 'p', Math.PI / 2), cy(0, 0.5, 0.01, 0.31, 0.11, 0x0b1220, Math.PI / 2), bx(0, 0.55, 0.07, 0.04, 0.22, 0.02, WH)],
  phone: () => [bx(0, 0.5, 0, 0.52, 1.0, 0.06, 'p', -0.15), bx(0, 0.5, 0.03, 0.46, 0.92, 0.02, 0x0b1220, -0.15), bx(-0.12, 0.88, -0.04, 0.1, 0.1, 0.03, DK, -0.15)],
  laptop: () => [bx(0, 0.025, 0.1, 1.2, 0.05, 0.85, 'p'), bx(0, 0.055, 0.18, 1.0, 0.03, 0.55, DK), bx(0, 0.45, -0.32, 1.2, 0.8, 0.04, 'p', -0.22), bx(0, 0.45, -0.3, 1.1, 0.7, 0.02, 0x0b1220, -0.22)],
  tv: () => [bx(0, 0.9, 0, 2.1, 1.2, 0.08, 'p'), bx(0, 0.9, 0.05, 2.0, 1.1, 0.02, 0x0b1220), bx(0, 0.2, -0.05, 0.1, 0.4, 0.1, DK), bx(0, 0.03, 0, 0.9, 0.05, 0.4, DK)],
  headphone: () => [arc(0, 0.45, 0, 0.42, 0.06, 'p'), cy(-0.42, 0.45, 0, 0.2, 0.16, 'p', 0, Math.PI / 2), cy(0.42, 0.45, 0, 0.2, 0.16, 'p', 0, Math.PI / 2)],
  toy: () => [bx(-0.3, 0.25, 0, 0.5, 0.5, 0.5, 'p'), bx(0.3, 0.25, 0.05, 0.5, 0.5, 0.5, 0xfacc15), bx(0, 0.75, 0, 0.5, 0.5, 0.5, 0x3b82f6), sp(0, 1.2, 0, 0.28, WH), cy(0.5, 0.15, 0.5, 0.15, 0.3, 0xef4444)],
  pot: () => [cy(0, 0.28, 0, 0.55, 0.55, 'p'), cy(0, 0.58, 0, 0.58, 0.06, ST), cy(0, 0.66, 0, 0.12, 0.1, DK), bx(0.72, 0.45, 0, 0.5, 0.1, 0.1, DK), bx(-0.72, 0.45, 0, 0.5, 0.1, 0.1, DK)],
  lamp: () => [cy(0, 0.03, 0, 0.3, 0.06, DK), cy(0, 0.8, 0, 0.03, 1.5, ST), cy(0, 1.5, 0, 0.55, 0.6, 'p', 0, 0, 0.2), sp(0, 1.45, 0, 0.14, 0xfff1a8)],
  book: () => [0, 1, 2, 3, 4, 5].map((i) => bx(-0.6 + i * 0.24, 0.5 + (i % 3) * 0.06, 0, 0.2, 0.9 + (i % 3) * 0.12, 0.7, i % 2 ? 0xe2e8f0 : 'p')),
  ball: () => [sp(0, 0.5, 0, 0.5, 'p'), arc(0, 0.5, 0, 0.5, 0.02, DK), cy(0, 0.02, 0, 0.4, 0.04, DK)],
  bike: () => [-0.75, 0.75].map((x): Part => ({ geo: new THREE.TorusGeometry(0.42, 0.06, 4, 10), x, y: 0.48, z: 0, rx: 0, ry: 0, rz: 0, c: DK })).concat([bx(0, 0.92, 0, 1.0, 0.07, 0.07, 'p'), bx(0.68, 0.75, 0, 0.07, 0.85, 0.07, 'p', 0, 0, -0.35), bx(-0.45, 0.7, 0, 0.07, 0.6, 0.07, 'p', 0, 0, 0.3), bx(-0.45, 1.05, 0, 0.42, 0.07, 0.2, DK), bx(0.82, 1.2, 0, 0.07, 0.07, 0.6, DK)]),
  sofa: () => [bx(0, 0.25, 0, 2.3, 0.45, 1.0, 'p'), bx(0, 0.8, -0.4, 2.3, 0.7, 0.28, 'p'), bx(-1.1, 0.55, 0, 0.2, 0.65, 1.0, 'p'), bx(1.1, 0.55, 0, 0.2, 0.65, 1.0, 'p'), bx(-0.55, 0.55, 0.08, 1.0, 0.18, 0.75, 0xe2e8f0), bx(0.55, 0.55, 0.08, 1.0, 0.18, 0.75, 0xe2e8f0)],
  bed: () => [bx(0, 0.2, 0, 2.0, 0.35, 2.2, WD), bx(0, 0.45, 0.05, 1.9, 0.25, 2.0, WH), bx(0, 0.6, 0.5, 1.9, 0.08, 1.0, 'p'), bx(0, 0.7, -1.05, 2.0, 1.0, 0.12, WD), bx(-0.5, 0.65, -0.7, 0.6, 0.12, 0.4, 'p'), bx(0.5, 0.65, -0.7, 0.6, 0.12, 0.4, 'p')],
  chair: () => [bx(0, 0.5, 0, 0.6, 0.1, 0.6, 'p'), bx(0, 0.95, -0.28, 0.6, 0.7, 0.08, 'p'), ...[-0.25, 0.25].flatMap((x) => [-0.25, 0.25].map((z) => bx(x, 0.25, z, 0.06, 0.5, 0.06, DK)))],
  appliance: () => [bx(0, 0.85, 0, 1.0, 1.7, 0.8, 'p'), bx(0.3, 0.9, 0.41, 0.04, 1.5, 0.02, 0xe2e8f0), bx(0, 1.0, 0.41, 0.8, 0.02, 0.02, DK), bx(-0.2, 1.5, 0.41, 0.3, 0.12, 0.02, 0x22d3ee)],
};

const cache = new Map<ProductKind, THREE.BufferGeometry>();
/** The merged, normalised, vertex-coloured geometry of a kind (shared by every shop; ProductKinds without a shelf model use the gift box). */
export function shelfGeometry(kind: ProductKind): THREE.BufferGeometry {
  const key = MODELS[kind] ? kind : 'box';
  let g = cache.get(key);
  if (g) return g;
  const m4 = new THREE.Matrix4(), eul = new THREE.Euler(), col = new THREE.Color();
  const geos = MODELS[key]!().map((p) => {
    const geo = p.geo.clone(); p.geo.dispose();
    m4.makeRotationFromEuler(eul.set(p.rx, p.ry, p.rz)); m4.setPosition(p.x, p.y, p.z);
    geo.applyMatrix4(m4);
    col.set(p.c === 'p' ? 0xffffff : p.c);
    const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geo.deleteAttribute('uv');
    return geo;
  });
  g = mergeGeometries(geos, false)!;
  for (const q of geos) q.dispose();
  g.computeBoundingBox();
  const b = g.boundingBox!, longest = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) || 1;
  g.translate(-(b.max.x + b.min.x) / 2, -b.min.y, -(b.max.z + b.min.z) / 2);
  g.scale(1 / longest, 1 / longest, 1 / longest);
  g.computeBoundingBox(); g.computeBoundingSphere();
  cache.set(key, g);
  return g;
}
export function disposeShelfGeometries(): void { for (const g of cache.values()) g.dispose(); cache.clear(); }
/** One shared material (vertex colours x instance colour). */
export const shelfMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0.15 });

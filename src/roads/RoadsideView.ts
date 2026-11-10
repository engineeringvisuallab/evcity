import * as THREE from 'three';
import { Config } from '../core/Config';
import { Q } from '../core/Quality';
import { mulberry32 } from '../world/Seed';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { planRoadside, type RoadsidePlan, type RoadsideStats } from './Roadside';

/**
 * ROADSIDE LAYER (GRASS 4): everything beside the roads that is a model, all INSTANCED and static (no per-frame cost except a 2 Hz visibility pass):
 *   pits     square kerbed tree pit (kerb frame + soil)            city sidewalks, every 12..15 m  (the street tree itself is a normal tree, see Roadside.streetTreesInChunk)
 *   hedges   low flowering hedge piece, 0.6..0.9 m                 freeway medians in the city, parking lot edges
 *   shrubs   dense green shrub with small white / pink flowers      highway verge
 *   posts    galvanized guardrail post (every 4 m)                  highways, embankment and curve sides
 *   beams    W-beam rail piece between two posts
 * Instances are grouped in 500 m squares (one InstancedMesh per type and square) so the GPU never sees the far ones: squares farther than
 * `drawRadius` (Config.city.roadside, scaled by the quality preset) from the player are hidden. Children use absolute world coordinates (parent = world.root).
 */
type Rgb = [number, number, number];

class Geo {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  tri(a: number[], b: number[], c: number[], color: Rgb, flat = true, na?: number[], nb?: number[], nc?: number[]): void {
    let n = [0, 1, 0];
    if (flat) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / l, n[1] / l, n[2] / l];
    }
    const ns = [na ?? n, nb ?? n, nc ?? n];
    [a, b, c].forEach((p, i) => {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(ns[i][0], ns[i][1], ns[i][2]);
      this.col.push(color[0], color[1], color[2]);
    });
  }
  quad(a: number[], b: number[], c: number[], d: number[], color: Rgb): void {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: Rgb): void {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], color); // top
    this.quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], color);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color);
  }
  /** A lumpy leaf blob: a squashed icosahedron (20 faces), smooth normals, per-face colour variation. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, base: Rgb, r: () => number): void {
    const t = (1 + Math.sqrt(5)) / 2;
    const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((p) => {
      const l = Math.hypot(p[0], p[1], p[2]);
      const j = 0.9 + r() * 0.2;
      return [(p[0] / l) * j, (p[1] / l) * j, (p[2] / l) * j];
    });
    const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (const [a, b, c] of f) {
      const k = 0.82 + r() * 0.36;
      const col: Rgb = [base[0] * k, base[1] * k, base[2] * k];
      const P = [a, b, c].map((i) => [cx + v[i][0] * rx, cy + v[i][1] * ry, cz + v[i][2] * rz]);
      const N = [a, b, c].map((i) => [v[i][0] / (rx || 1), v[i][1] / (ry || 1), v[i][2] / (rz || 1)]);
      this.tri(P[0], P[1], P[2], col, false, N[0], N[1], N[2]);
    }
  }
  /** A small flower: a flat diamond facing outwards (white / pink), a yellow dot is not needed at this size. */
  flower(x: number, y: number, z: number, nx: number, ny: number, nz: number, size: number, color: Rgb): void {
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    // two tangents
    let ux = -nz, uy = 0, uz = nx;
    if (Math.hypot(ux, uz) < 1e-3) { ux = 1; uz = 0; }
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const c = [x + nx * 0.02, y + ny * 0.02, z + nz * 0.02];
    const p = (a: number, b: number): number[] => [c[0] + ux * a + vx * b, c[1] + uy * a + vy * b, c[2] + uz * a + vz * b];
    this.tri(p(size, 0), p(0, size), p(-size, 0), color, false, [nx, ny, nz], [nx, ny, nz], [nx, ny, nz]);
    this.tri(p(size, 0), p(-size, 0), p(0, -size), color, false, [nx, ny, nz], [nx, ny, nz], [nx, ny, nz]);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const GREENS: Rgb[] = [[0.10, 0.30, 0.07], [0.13, 0.35, 0.08], [0.09, 0.27, 0.07], [0.16, 0.38, 0.09]];
const WHITE: Rgb = [0.96, 0.96, 0.93];
const PINK: Rgb = [0.95, 0.55, 0.70];

/** Dense low flowering hedge: a long row of overlapping leaf blobs, 0.75 m high, 0.8 m wide, `pieceLen` m long (local +Z = along the road), ~55 % of the surface studded with small white / pink flowers. */
export function buildHedgeGeometry(): THREE.BufferGeometry {
  const H = Config.city.roadside.hedge;
  const r = mulberry32(0x6ed9e);
  const g = new Geo();
  const n = 6;
  const L = H.pieceLen;
  const items: { x: number; y: number; z: number; rx: number; ry: number; rz: number }[] = [];
  for (let k = 0; k < n; k++) {
    const z = -L / 2 + 0.35 + ((L - 0.7) * k) / (n - 1);
    const rx = H.width / 2 * (0.95 + r() * 0.2);
    const ry = 0.36 + r() * 0.05;
    items.push({ x: (r() - 0.5) * 0.06, y: ry * 0.95, z, rx, ry, rz: (L / n) * 0.85 });
  }
  for (const b of items) g.blob(b.x, b.y, b.z, b.rx, b.ry, b.rz, GREENS[Math.floor(r() * GREENS.length)], r);
  // flowers on the upper half of the blobs
  for (const b of items) {
    for (let k = 0; k < 5; k++) {
      const a = r() * Math.PI * 2;
      const e = 0.15 + r() * 0.85; // 0 = horizon, 1 = top
      const nx = Math.cos(a) * Math.sqrt(1 - e * e), nz = Math.sin(a) * Math.sqrt(1 - e * e), ny = e;
      if (r() > 0.78) continue;
      g.flower(b.x + nx * b.rx, b.y + ny * b.ry, b.z + nz * b.rz, nx, ny, nz, 0.035 + r() * 0.02, r() < 0.55 ? WHITE : PINK);
    }
  }
  return g.build();
}

/** Verge shrub: a dome of 7 blobs about 1 m high and 1.3 m wide with a few flowers. */
export function buildShrubGeometry(): THREE.BufferGeometry {
  const r = mulberry32(0x5b7b);
  const g = new Geo();
  const blobs: number[][] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + r();
    const d = k === 0 ? 0 : 0.28 + r() * 0.2;
    const ry = 0.3 + r() * 0.12;
    blobs.push([Math.cos(a) * d, ry * (k === 0 ? 1.7 : 1.15), Math.sin(a) * d, 0.3 + r() * 0.1, ry, 0.3 + r() * 0.1]);
  }
  for (const b of blobs) g.blob(b[0], b[1], b[2], b[3], b[4], b[5], GREENS[Math.floor(r() * GREENS.length)], r);
  for (const b of blobs) for (let k = 0; k < 4; k++) {
    const a = r() * Math.PI * 2, e = 0.3 + r() * 0.7;
    const nx = Math.cos(a) * Math.sqrt(1 - e * e), nz = Math.sin(a) * Math.sqrt(1 - e * e);
    if (r() > 0.6) continue;
    g.flower(b[0] + nx * b[3], b[1] + e * b[4], b[2] + nz * b[5], nx, e, nz, 0.04 + r() * 0.02, r() < 0.5 ? WHITE : PINK);
  }
  return g.build();
}

/** Square kerbed tree pit (local origin = pit centre on the sidewalk): concrete kerb frame 0.14 m high and a dark soil square. */
export function buildPitGeometry(): THREE.BufferGeometry {
  const s = Config.city.roadside.pitSize;
  const w = 0.1;
  const kerb: Rgb = [0.80, 0.79, 0.76];
  const g = new Geo();
  const h = s / 2;
  g.box(0, 0.07, h + w / 2, s + 2 * w, 0.14, w, kerb);
  g.box(0, 0.07, -h - w / 2, s + 2 * w, 0.14, w, kerb);
  g.box(h + w / 2, 0.07, 0, w, 0.14, s, kerb);
  g.box(-h - w / 2, 0.07, 0, w, 0.14, s, kerb);
  g.quad([-h, 0.07, h], [h, 0.07, h], [h, 0.07, -h], [-h, 0.07, -h], [0.80, 0.79, 0.75]); // light stone / gravel, not dark brown soil
  return g.build();
}

/** Guardrail post: galvanized C-section approximated by a box, 1.15 m long (0.4 m in the ground, top 0.75 m above it). */
export function buildPostGeometry(): THREE.BufferGeometry {
  const g = new Geo();
  g.box(0, 0.175, 0, 0.1, 1.15, 0.14, [0.7, 0.72, 0.74]);
  return g.build();
}

/** W-beam rail piece, 1 m long along local +Z (instances are scaled to the post distance), cross-section 0.31 m high with two bulges. Double-sided. */
export function buildBeamGeometry(): THREE.BufferGeometry {
  const prof: [number, number][] = [[0.0, 0.0], [0.03, 0.02], [0.045, 0.075], [0.0, 0.115], [-0.03, 0.155], [0.0, 0.195], [0.045, 0.235], [0.03, 0.29], [0.0, 0.31]];
  const g = new Geo();
  const col: Rgb = [0.74, 0.76, 0.78];
  for (let i = 0; i + 1 < prof.length; i++) {
    const a = prof[i], b = prof[i + 1];
    g.quad([a[0], a[1] - 0.155, -0.5], [a[0], a[1] - 0.155, 0.5], [b[0], b[1] - 0.155, 0.5], [b[0], b[1] - 0.155, -0.5], col);
  }
  return g.build();
}

/** Squares of 250 m; each model type is drawn up to `drawRadius * RANGE[type]` (hedges are the heaviest, so they stop first). */
const SQUARE = 250;
const RANGE: Record<string, number> = { pit: 1, hedge: 0.6, shrub: 0.8, post: 0.8, beam: 0.8 };
interface Group { mesh: THREE.InstancedMesh; cx: number; cz: number; range: number }

export class RoadsideView {
  readonly group = new THREE.Group();
  readonly stats: RoadsideStats;
  readonly plan: RoadsidePlan;
  private groups: Group[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private timer = 9;
  /** Number of triangles / instances currently drawn (debug HUD, measurements). */
  drawnInstances = 0;
  drawnTriangles = 0;

  constructor(parent: THREE.Object3D, gen: TerrainGenerator) {
    const p = planRoadside(gen);
    this.plan = p;
    this.stats = p.stats;
    const lam = (side: THREE.Side = THREE.FrontSide): THREE.MeshLambertMaterial => {
      const m = new THREE.MeshLambertMaterial({ vertexColors: true, side });
      this.mats.push(m);
      return m;
    };
    const dummy = new THREE.Object3D();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, 'YXZ');
    const tint = new THREE.Color();
    const S = SQUARE;
    const HALF = Config.world.size / 2;

    const make = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, stride: number, data: number[], matrixOf: (o: number, d: THREE.Object3D) => void, tinted: boolean): void => {
      this.geos.push(geo);
      const byChunk = new Map<string, number[]>();
      for (let o = 0; o < data.length; o += stride) {
        const cx = Math.floor((data[o] + HALF) / S);
        const cz = Math.floor((data[o + 2] + HALF) / S);
        const k = cx + ',' + cz;
        const l = byChunk.get(k);
        if (l) l.push(o);
        else byChunk.set(k, [o]);
      }
      for (const [k, list] of byChunk) {
        const mesh = new THREE.InstancedMesh(geo, mat, list.length);
        mesh.name = `roadside ${name} ${k}`;
        list.forEach((o, i) => {
          dummy.position.set(0, 0, 0);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          matrixOf(o, dummy);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          if (tinted) {
            const b = 0.9 + 0.1 * ((Math.sin(data[o] * 12.9898 + data[o + 2] * 78.233) * 43758.5453) % 1 + 1) % 1;
            mesh.setColorAt(i, tint.setRGB(b, b, b));
          }
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.matrixAutoUpdate = false;
        mesh.visible = false;
        parent.add(mesh);
        this.group.add(mesh);
        const [cx, cz] = k.split(',').map(Number);
        this.groups.push({ mesh, cx, cz, range: RANGE[name] });
      }
    };

    make('pit', buildPitGeometry(), lam(), 4, p.pits, (o, d) => { d.position.set(p.pits[o], p.pits[o + 1] + 0.03, p.pits[o + 2]); d.rotation.y = p.pits[o + 3]; }, false);
    make('hedge', buildHedgeGeometry(), lam(THREE.DoubleSide), 7, p.hedges, (o, d) => { d.position.set(p.hedges[o], p.hedges[o + 1], p.hedges[o + 2]); d.rotation.y = p.hedges[o + 3]; d.scale.set(1, p.hedges[o + 5], p.hedges[o + 4]); }, true);
    make('shrub', buildShrubGeometry(), lam(THREE.DoubleSide), 6, p.shrubs, (o, d) => { d.position.set(p.shrubs[o], p.shrubs[o + 1], p.shrubs[o + 2]); d.rotation.y = p.shrubs[o + 4]; d.scale.setScalar(p.shrubs[o + 3]); }, true);
    make('post', buildPostGeometry(), lam(), 4, p.posts, (o, d) => { d.position.set(p.posts[o], p.posts[o + 1], p.posts[o + 2]); d.rotation.y = p.posts[o + 3]; }, false);
    make('beam', buildBeamGeometry(), lam(THREE.DoubleSide), 6, p.beams, (o, d) => {
      d.position.set(p.beams[o], p.beams[o + 1], p.beams[o + 2]);
      e.set(-p.beams[o + 4], p.beams[o + 3], 0, 'YXZ');
      q.setFromEuler(e);
      d.quaternion.copy(q);
      d.scale.set(1, 1, p.beams[o + 5]);
    }, false);
    void Q;
  }

  /** 2 Hz: show the squares near the player, hide the rest. Player position in WORLD metres. */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < 0.5) return;
    this.timer = 0;
    const S = SQUARE;
    const HALF = Config.world.size / 2;
    const base = Config.city.roadside.drawRadius * Q.roadsideMul;
    let inst = 0;
    let tris = 0;
    for (const g of this.groups) {
      const mx = g.cx * S - HALF + S / 2;
      const mz = g.cz * S - HALF + S / 2;
      const on = Math.hypot(mx - px, mz - pz) < base * g.range + S * 0.71;
      g.mesh.visible = on;
      if (on) {
        inst += g.mesh.count;
        tris += g.mesh.count * ((g.mesh.geometry.getAttribute('position').count) / 3);
      }
    }
    this.drawnInstances = inst;
    this.drawnTriangles = tris;
  }

  dispose(): void {
    for (const g of this.groups) { g.mesh.parent?.remove(g.mesh); g.mesh.dispose(); }
    for (const geo of this.geos) geo.dispose();
    for (const m of this.mats) m.dispose();
    this.groups = [];
  }
}

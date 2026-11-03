// LOFT / GEOMETRY BUILDER for aircraft (pure numbers, no three.js): smooth lofted bodies (fuselage, nacelles, wings, fins) from cross-section rings, plus flat boxes
// and cylinders, with vertex colours, UVs and smooth normals. Used by AirplaneMesh / FighterMesh. Winding is fixed automatically (outwards) per solid.
import type { RGB } from '../army/ArmyPlan';

export type V3 = [number, number, number];

export interface GeoArrays {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export class Geo {
  private pos: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];
  /** Number of triangles. */
  get triangles(): number { return this.idx.length / 3; }

  private vert(p: V3, c: RGB, u = 0, v = 0): number {
    this.pos.push(p[0], p[1], p[2]);
    this.col.push(c[0], c[1], c[2]);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }

  /** Make the triangles added since `from` face away from the centre of the vertices added since `v0` (the solid is closed and roughly convex). */
  private orient(from: number, v0: number): void {
    let cx = 0, cy = 0, cz = 0;
    const n = this.pos.length / 3 - v0;
    for (let i = v0; i < this.pos.length / 3; i++) { cx += this.pos[3 * i]; cy += this.pos[3 * i + 1]; cz += this.pos[3 * i + 2]; }
    cx /= n; cy /= n; cz /= n;
    for (let t = from; t < this.idx.length; t += 3) {
      const a = this.idx[t], b = this.idx[t + 1], c = this.idx[t + 2];
      const ax = this.pos[3 * a], ay = this.pos[3 * a + 1], az = this.pos[3 * a + 2];
      const ux = this.pos[3 * b] - ax, uy = this.pos[3 * b + 1] - ay, uz = this.pos[3 * b + 2] - az;
      const vx = this.pos[3 * c] - ax, vy = this.pos[3 * c + 1] - ay, vz = this.pos[3 * c + 2] - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const mx = (ax + this.pos[3 * b] + this.pos[3 * c]) / 3 - cx, my = (ay + this.pos[3 * b + 1] + this.pos[3 * c + 1]) / 3 - cy, mz = (az + this.pos[3 * b + 2] + this.pos[3 * c + 2]) / 3 - cz;
      if (nx * mx + ny * my + nz * mz < 0) { this.idx[t + 1] = c; this.idx[t + 2] = b; }
    }
  }

  /**
   * Loft a closed solid through `rings` (each ring = the same number of points, going round once). `color(r, j)` colours ring r point j; `uv(r, j)` gives its UV.
   * `capStart` / `capEnd` close the ends with a fan (a flat disc).
   */
  loft(rings: V3[][], color: (r: number, j: number) => RGB, uv?: (r: number, j: number) => [number, number], caps: { start?: boolean; end?: boolean } = { start: true, end: true }): void {
    const v0 = this.pos.length / 3, t0 = this.idx.length;
    const n = rings[0].length;
    const ids: number[][] = rings.map((ring, r) => {
      const row: number[] = [];
      for (let j = 0; j <= n; j++) { // j = n repeats point 0 so the UVs can wrap (seam)
        const jj = j % n;
        const [u, v] = uv ? uv(r, j) : [0, 0];
        row.push(this.vert(ring[jj], color(r, jj), u, v));
      }
      return row;
    });
    for (let r = 0; r + 1 < rings.length; r++) for (let j = 0; j < n; j++) {
      const a = ids[r][j], b = ids[r][j + 1], c = ids[r + 1][j + 1], d = ids[r + 1][j];
      this.idx.push(a, b, c, a, c, d);
    }
    const cap = (r: number): void => {
      let cx = 0, cy = 0, cz = 0;
      for (const p of rings[r]) { cx += p[0]; cy += p[1]; cz += p[2]; }
      const c = this.vert([cx / n, cy / n, cz / n], color(r, 0), 0, 0);
      const base: number[] = rings[r].map((p, j) => this.vert(p, color(r, j), 0, 0));
      for (let j = 0; j < n; j++) this.idx.push(c, base[j], base[(j + 1) % n]);
    };
    if (caps.start) cap(0);
    if (caps.end) cap(rings.length - 1);
    this.orient(t0, v0);
  }

  /** Axis-aligned box (flat shading), x/y/z sizes, bottom at y0. */
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, c: RGB): void {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const f = (a: V3, b: V3, cc: V3, dd: V3): void => {
      const v0 = this.pos.length / 3, t0 = this.idx.length;
      const i = [this.vert(a, c), this.vert(b, c), this.vert(cc, c), this.vert(dd, c)];
      this.idx.push(i[0], i[1], i[2], i[0], i[2], i[3]);
      void v0; void t0;
    };
    const v0 = this.pos.length / 3, t0 = this.idx.length;
    f([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    f([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    f([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    f([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    f([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    f([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    this.orient(t0, v0);
  }

  /** A cylinder (rings of `segs` points) along an axis: 'x', 'y' or 'z'; centre (cx, cy, cz), radius r, length len. */
  cylinder(axis: 'x' | 'y' | 'z', cx: number, cy: number, cz: number, r: number, len: number, c: RGB, segs = 14): void {
    const rings: V3[][] = [];
    for (const s of [-0.5, 0.5]) {
      const ring: V3[] = [];
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2, p = r * Math.cos(a), q = r * Math.sin(a);
        ring.push(axis === 'x' ? [cx + s * len, cy + p, cz + q] : axis === 'y' ? [cx + p, cy + s * len, cz + q] : [cx + p, cy + q, cz + s * len]);
      }
      rings.push(ring);
    }
    this.loft(rings, () => c);
  }

  build(): GeoArrays {
    const nv = this.pos.length / 3;
    const normals = new Float32Array(nv * 3);
    for (let t = 0; t < this.idx.length; t += 3) {
      const a = this.idx[t], b = this.idx[t + 1], c = this.idx[t + 2];
      const ux = this.pos[3 * b] - this.pos[3 * a], uy = this.pos[3 * b + 1] - this.pos[3 * a + 1], uz = this.pos[3 * b + 2] - this.pos[3 * a + 2];
      const vx = this.pos[3 * c] - this.pos[3 * a], vy = this.pos[3 * c + 1] - this.pos[3 * a + 1], vz = this.pos[3 * c + 2] - this.pos[3 * a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // area weighted
      for (const i of [a, b, c]) { normals[3 * i] += nx; normals[3 * i + 1] += ny; normals[3 * i + 2] += nz; }
    }
    for (let i = 0; i < nv; i++) {
      const l = Math.hypot(normals[3 * i], normals[3 * i + 1], normals[3 * i + 2]) || 1;
      normals[3 * i] /= l; normals[3 * i + 1] /= l; normals[3 * i + 2] /= l;
    }
    return { positions: new Float32Array(this.pos), normals, colors: new Float32Array(this.col), uvs: new Float32Array(this.uv), indices: new Uint32Array(this.idx) };
  }
}

/* ------------------------------------------------------------------ helpers for sections */

/** Points of a closed airfoil outline (upper surface from the trailing edge to the leading edge, then the lower surface back). x runs 1 (TE) -> 0 (LE) -> 1 (TE). */
export function airfoilOutline(n: number, thick: number, camber: number): [number, number][] {
  const pts: [number, number][] = [];
  const yt = (x: number): number => 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
  const yc = (x: number): number => camber * Math.sin(Math.PI * x);
  for (let i = 0; i < n; i++) { const x = 0.5 * (1 + Math.cos((i / n) * Math.PI)); pts.push([x, yc(x) + yt(x)]); } // upper: x 1 -> 0
  for (let i = 1; i < n; i++) { const x = 0.5 * (1 - Math.cos((i / n) * Math.PI)); pts.push([x, yc(x) - yt(x)]); } // lower: x 0 -> 1 (the last point ~ TE)
  return pts;
}

/** Join several meshes into one. */
export function concatGeo(parts: GeoArrays[]): GeoArrays {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.positions.length / 3; ni += p.indices.length; }
  const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), colors = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2), indices = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const p of parts) {
    positions.set(p.positions, vo * 3); normals.set(p.normals, vo * 3); colors.set(p.colors, vo * 3); uvs.set(p.uvs, vo * 2);
    for (let i = 0; i < p.indices.length; i++) indices[io + i] = p.indices[i] + vo;
    vo += p.positions.length / 3; io += p.indices.length;
  }
  return { positions, normals, colors, uvs, indices };
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Mix two colours. */
export function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

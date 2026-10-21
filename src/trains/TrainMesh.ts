import { RAIL_DESIGN as D } from '../rail/RailPlan';
import { RAIL_HEAD, type CarKind } from './TrainConfig';

/**
 * STAGE 14 / Step 5a: low-poly train car geometry (pure arrays, no three.js, so it can be built and measured in a headless test).
 * Local car frame: +x = the nose (front) of the car, y up with y = 0 at the TOP OF THE RAIL HEAD, z = across. Origin = middle of the car.
 * Flat-coloured faces with their own normals and vertex colours, the same format as RailMeshData.
 */
export interface TrainMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint16Array;
}

type V = [number, number, number];
type P2 = [number, number];

const C = {
  locoBody: [0.72, 0.12, 0.1] as V,
  locoStripe: [0.93, 0.93, 0.9] as V,
  coachBody: [0.88, 0.89, 0.86] as V,
  coachStripe: [0.1, 0.45, 0.28] as V,
  glass: [0.06, 0.1, 0.16] as V,
  roofGear: [0.55, 0.57, 0.6] as V,
  under: [0.12, 0.12, 0.13] as V,
  bogie: [0.16, 0.16, 0.18] as V,
  wheel: [0.3, 0.3, 0.33] as V,
  door: [0.62, 0.64, 0.62] as V,
  panto: [0.62, 0.64, 0.68] as V,
  insulator: [0.8, 0.55, 0.3] as V,
};

/** Highest point of the raised pantograph collector above the rail head: it touches the contact wire (design height + contactHeight above the top of ballast). */
export const PANTOGRAPH_TOP = D.contactHeight - RAIL_HEAD;

class Emit {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  /** Quad wound counter-clockwise seen from the side the normal points to. */
  quad(a: V, b: V, c: V, d: V, n: V, col: V): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const dot = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    const q = dot >= 0 ? [a, b, c, d] : [a, d, c, b];
    const base = this.pos.length / 3;
    for (const p of q) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(col[0], col[1], col[2]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  tri(a: V, b: V, c: V, n: V, col: V): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const dot = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    const q = dot >= 0 ? [a, b, c] : [a, c, b];
    const base = this.pos.length / 3;
    for (const p of q) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(col[0], col[1], col[2]);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  /** Axis-aligned box: centre, half length (x), half height (y), half width (z). */
  box(cx: number, cy: number, cz: number, hl: number, hh: number, hw: number, col: V): void {
    this.prism([[cx - hl, cy - hh], [cx + hl, cy - hh], [cx + hl, cy + hh], [cx - hl, cy + hh]], cz - hw, cz + hw, col);
  }

  /** Convex side profile (x, y) extruded across z0..z1. */
  prism(profile: P2[], z0: number, z1: number, col: V): void {
    let area = 0;
    for (let i = 0; i < profile.length; i++) {
      const p = profile[i], q = profile[(i + 1) % profile.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    const pr = area >= 0 ? profile : [...profile].reverse(); // counter-clockwise
    const m = pr.length;
    for (let i = 0; i < m; i++) {
      const p = pr[i], q = pr[(i + 1) % m];
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const l = Math.hypot(dx, dy) || 1;
      const n: V = [dy / l, -dx / l, 0];
      this.quad([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1], n, col);
    }
    for (let i = 1; i < m - 1; i++) {
      this.tri([pr[0][0], pr[0][1], z1], [pr[i][0], pr[i][1], z1], [pr[i + 1][0], pr[i + 1][1], z1], [0, 0, 1], col);
      this.tri([pr[0][0], pr[0][1], z0], [pr[i][0], pr[i][1], z0], [pr[i + 1][0], pr[i + 1][1], z0], [0, 0, -1], col);
    }
  }

  /** A thin bar from (x0, y0) to (x1, y1) of thickness t, across z0..z1. */
  strut(x0: number, y0: number, x1: number, y1: number, t: number, z0: number, z1: number, col: V): void {
    const dx = x1 - x0, dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * (t / 2), ny = (dx / l) * (t / 2);
    this.prism([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], z0, z1, col);
  }

  /** Octagonal wheel, axis along z. */
  wheel(cx: number, cy: number, cz: number, r: number, hw: number, col: V): void {
    const pr: P2[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      pr.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    this.prism(pr, cz - hw, cz + hw, col);
  }

  data(): TrainMeshData {
    return {
      positions: Float32Array.from(this.pos),
      normals: Float32Array.from(this.nrm),
      colors: Float32Array.from(this.col),
      indices: Uint16Array.from(this.idx),
    };
  }
}

/** Body dimensions (m), shared with the tests. */
export const BODY = {
  width: 3.0,
  loco: { length: 20, bottom: 0.95, roof: 3.95 },
  coach: { length: 22, bottom: 0.85, roof: 3.75 },
};

function bogie(em: Emit, x: number): void {
  em.box(x, 0.53, 0, 1.6, 0.22, 1.05, C.bogie);
  for (const ax of [-1.25, 1.25]) for (const sz of [-1, 1]) em.wheel(x + ax, 0.46, sz * 0.7175, 0.46, 0.065, C.wheel);
}

function sideWindows(em: Emit, len: number, y0: number, y1: number, col: V): void {
  for (const sz of [-1, 1]) em.box(0, (y0 + y1) / 2, sz * 1.505, len / 2, (y1 - y0) / 2, 0.012, col);
}

function pantograph(em: Emit, x: number, roof: number): void {
  for (const sx of [-0.6, 0.6]) for (const sz of [-0.7, 0.7]) em.box(x + sx, roof + 0.15, sz, 0.1, 0.15, 0.1, C.insulator);
  em.box(x, roof + 0.35, 0, 0.8, 0.05, 0.85, C.panto);
  const y0 = roof + 0.4;
  for (const sz of [-0.45, 0.45]) {
    em.strut(x - 0.6, y0, x + 0.8, y0 + 0.6, 0.1, sz - 0.05, sz + 0.05, C.panto); // lower arm up to the knee
    em.strut(x + 0.8, y0 + 0.6, x - 0.4, y0 + 0.85, 0.1, sz - 0.05, sz + 0.05, C.panto); // upper arm back to the collector
  }
  // collector head: its top is exactly the contact wire height
  em.box(x - 0.4, PANTOGRAPH_TOP - 0.035, 0, 0.25, 0.035, 0.95, C.panto);
}

/** The geometry of one car kind. */
export function buildCarMesh(kind: CarKind): TrainMeshData {
  const em = new Emit();
  const hw = BODY.width / 2;
  if (kind === 'loco') {
    const { length: L, bottom: b, roof } = BODY.loco;
    const h = L / 2;
    // double-ended: a sloped cab nose at both ends
    em.prism([[-h, b], [h, b], [h, 2.5], [h - 2, roof], [-h + 2, roof], [-h, 2.5]], -hw, hw, C.locoBody);
    for (const sz of [-1, 1]) {
      em.box(0, 1.5, sz * 1.505, 8.6, 0.12, 0.012, C.locoStripe);
      for (const sx of [-1, 1]) em.box(sx * 7.2, 3.1, sz * 1.505, 0.9, 0.45, 0.012, C.glass);
    }
    for (const sx of [-1, 1]) em.box(sx * (h - 0.6), 3.0, 0, 0.12, 0.45, 1.0, C.glass); // cab windscreens
    em.box(0, 0.75, 0, 6.5, 0.2, 1.3, C.under);
    em.box(3.5, roof + 0.1, 0, 1.2, 0.1, 0.9, C.roofGear);
    em.box(-6, roof + 0.1, 0, 1.2, 0.1, 0.9, C.roofGear);
    pantograph(em, -3, roof);
    bogie(em, -6.2);
    bogie(em, 6.2);
  } else {
    const { length: L, bottom: b, roof } = BODY.coach;
    const h = L / 2;
    if (kind === 'cab') {
      em.prism([[-h, b], [h, b], [h, 2.5], [h - 2.4, roof], [-h + 1, roof], [-h, roof - 0.35]], -hw, hw, C.coachBody);
      em.box(h - 0.5, 3.0, 0, 0.12, 0.45, 1.0, C.glass);
    } else {
      em.prism([[-h, b], [h, b], [h, roof - 0.35], [h - 1, roof], [-h + 1, roof], [-h, roof - 0.35]], -hw, hw, C.coachBody);
    }
    for (const sz of [-1, 1]) em.box(0, 1.55, sz * 1.505, h - 0.4, 0.14, 0.012, C.coachStripe);
    sideWindows(em, L - 5, 2.05, 3.0, C.glass);
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) em.box(sx * 8.4, 2.1, sz * 1.506, 0.6, 1.0, 0.012, C.door);
    em.box(-3, roof + 0.1, 0, 1.4, 0.1, 0.9, C.roofGear);
    em.box(4, roof + 0.1, 0, 1.4, 0.1, 0.9, C.roofGear);
    em.box(0, 0.7, 0, 6.5, 0.18, 1.2, C.under);
    bogie(em, -8);
    bogie(em, 8);
  }
  return em.data();
}

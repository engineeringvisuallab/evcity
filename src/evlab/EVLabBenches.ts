// EVLab Step 11: the outdoor benches (pure numbers + functions, no three.js / DOM: the builder, the colliders, Step 12 (people who sit) and the tests use it).
// Building-local metres (x east, z south), same frame as EVLabLayout / EVLabCampus.
//
// WHERE (Step R2: 36 benches, all deterministic):
//  - plaza:  a ring of 6 benches round the big fountain (radius 15 m, looking at the fountain; the two in the mouth of the south link road are left out),
//            2 benches at each of the two small fountains, and a row along the east and west edge of the plaza.
//  - island: along the quay of the island (2.2 m inside the quay wall), looking out over the lake, about every 36 m.
//  - bank:   none any more: the lake now touches the plot's fence on the west, south and east side, and behind the island there is no lake (the area stays in the type for Step 12).
// A bench never stands on a road / bridge / promenade, in the car park, on the cycle rack, near a lamp or a flag pole, and never closer than 0.9 m (edge to trunk) to a park tree
// (the trees are NOT changed: a spot that would hit a tree moves along the shore, or is dropped).
//
// A bench is described in its own frame: origin = the middle of the seat on the ground, +z = the way a person on it looks, +x = along its length.
// yaw = rotation about +y (three.js: x' = x cos + z sin, z' = -x sin + z cos), so the front of the bench points to (sin yaw, cos yaw). Same convention as the cycle slots (yaw 0 = nose to +z).

import { FOUNTAINS, ISLAND, PLAZA, PLAZA_FOUNTAIN, ROAD_RECTS, contour, parkTrees, sdRR } from './EVLabCampus';
import { inParkingZone } from './EVLabParking';
import { inRackZone } from './EVLabCycleRack';

export const BENCH = {
  /** Length (m), depth of the seat, depth of the whole bench (seat + back), height of the seat and of the back rest. */
  len: 1.8, seatDepth: 0.46, depth: 0.52, seatH: 0.45, backH: 0.9,
  /** Local z of the middle of the seat, and of the back rest. */
  seatZ: 0.0, backZ: -0.265,
  /** Local z of the middle of the whole footprint (rear posts at z -0.29 .. front of the seat at z 0.23): the centre of the collider box. */
  footZ: -0.03,
  /** Places for people: how many, and the distance between two of them along the bench (m). */
  seats: 3, seatPitch: 0.58,
  /** Free space kept round a bench: to park trees (m), to lamps and flag poles (m). */
  treeGap: 0.9, lampGap: 2.5,
} as const;

export type BenchArea = 'plaza' | 'island' | 'bank';

export interface Bench {
  id: string;
  area: BenchArea;
  x: number;
  z: number;
  /** Heading of the person sitting (0 = looking to +z). */
  yaw: number;
  /** Height of the ground under the bench, above the floor level (the plaza stone is 0.05 m up, the lawns 0). */
  y: number;
}

export interface BenchSeat {
  id: string;
  bench: number;
  /** Position of the middle of the seat (hips of a sitting person); `y` = top of the seat above the floor level. */
  x: number;
  y: number;
  z: number;
  /** Heading of a person sitting here (the way he looks). */
  yaw: number;
}

/** Local -> building coordinates of a point on / beside bench `b`. */
export function benchPoint(b: Bench, lx: number, lz: number): [number, number] {
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
  return [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
}

/** Axis the people on bench `b` look along. */
export const benchFacing = (b: Bench): [number, number] => [Math.sin(b.yaw), Math.cos(b.yaw)];

/** Rectangles (x0, x1, z0, z1) that are road / bridge / promenade / avenue (the island ring road is tested separately): no benches there. */
const PROMENADES: ReadonlyArray<readonly [number, number, number, number]> = [...ROAD_RECTS];

/** Lamp / flag pole spots on the plaza (the same loops as EVLabGrounds). Benches keep `lampGap` away from them. */
export function plazaPoles(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const zs = PLAZA.z0; // = BLD.hz + 2
  for (let x = -60; x <= 60; x += 20) { out.push([x, zs + 8]); out.push([x, PLAZA.z1 - 2]); }
  for (const x of [-40, -32, 32, 40]) out.push([x, zs + 14]); // flag poles
  return out;
}

const bearing = (nx: number, nz: number): number => Math.atan2(nx, nz);

/** Unit outward normal of a rounded rectangle at (x, z) (gradient of the signed distance). */
function outward(s: Parameters<typeof sdRR>[2], x: number, z: number): [number, number] {
  const e = 0.05;
  const gx = sdRR(x + e, z, s) - sdRR(x - e, z, s), gz = sdRR(x, z + e, s) - sdRR(x, z - e, s);
  const l = Math.hypot(gx, gz) || 1;
  return [gx / l, gz / l];
}

/** `contour()` only has points on the corner arcs (the straight sides are one long segment): walk the closed polyline and return a point every `step` metres. */
function resample(poly: Array<[number, number]>, step: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.round(len / step));
    for (let k = 0; k < m; k++) out.push([a[0] + ((b[0] - a[0]) * k) / m, a[1] + ((b[1] - a[1]) * k) / m]);
  }
  out.push(out[0]);
  return out;
}

let cache: Bench[] | null = null;

/** All the benches (deterministic). */
export function benches(): Bench[] {
  if (cache) return cache;
  const out: Bench[] = [];
  const trees = parkTrees();
  const poles = plazaPoles();
  /** Is the spot (x, z) with a bench that looks along (fx, fz) clear of roads, the car park, the rack, lamps and trees? Trees are tested against the whole bench (a trunk 0.9 m from its edge is the limit). */
  const free = (x: number, z: number, fx: number, fz: number): boolean => {
    for (const q of PROMENADES) if (x > q[0] - 5 && x < q[1] + 5 && z > q[2] - 5 && z < q[3] + 5) return false;
    if (inParkingZone(x, z, 6) || inRackZone(x, z, 3)) return false;
    for (const [px, pz] of poles) if (Math.hypot(px - x, pz - z) < BENCH.lampGap) return false;
    const yaw = bearing(fx, fz), sn = Math.sin(yaw), cs = Math.cos(yaw);
    for (const t of trees) {
      const dx = t.x - x, dz = t.z - z;
      if (Math.abs(dx) > BENCH.len || Math.abs(dz) > BENCH.len) continue;
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; // the tree in the bench frame
      if (Math.abs(lx) < BENCH.len / 2 + BENCH.treeGap && Math.abs(lz - BENCH.footZ) < BENCH.depth / 2 + BENCH.treeGap) return false;
    }
    return true;
  };
  const add = (area: BenchArea, x: number, z: number, faceX: number, faceZ: number): void => {
    const l = Math.hypot(faceX, faceZ) || 1;
    out.push({ id: 'B' + out.length, area, x, z, yaw: bearing(faceX / l, faceZ / l), y: area === 'plaza' ? 0.05 : 0 });
  };

  // ---------------------------------------------------------------- plaza
  // a ring round the big fountain (basin 10.4 m, so the ring is at 15 m: R = r + 5); 22.5 + 45 k deg leaves a gap in front of the portal and in the south
  const F = PLAZA_FOUNTAIN, R = F.r + 5;
  for (let k = 0; k < 8; k++) {
    const a = ((22.5 + 45 * k) * Math.PI) / 180;
    const bx = F.x + Math.cos(a) * R, bz = F.z + Math.sin(a) * R;
    if (Math.abs(bx) < 14 && bz > PLAZA.z1 - 8) continue; // the south link road enters the plaza here: keep its mouth free
    add('plaza', bx, bz, -Math.cos(a), -Math.sin(a));
  }
  // the two small fountains: one bench on the south side, one on the outer side (the inner side is the cycle riders' lane)
  for (const f of FOUNTAINS) {
    if (f.x === F.x || Math.abs(f.z - F.z) > 0.01 || Math.abs(f.x) > 60) continue;
    const sx = Math.sign(f.x);
    add('plaza', f.x, f.z + 8.2, 0, -1);
    add('plaza', f.x + sx * 8.2, f.z, -sx, 0);
  }
  // along the east and west edge of the plaza, looking in
  for (const sx of [-1, 1]) for (const z of [68, 77.5, 87]) add('plaza', sx * (PLAZA.x1 - 3.8), z, -sx, 0);

  // ---------------------------------------------------------------- island quay and the outer bank of the lake
  const along = (area: BenchArea, s: Parameters<typeof sdRR>[2], off: number, step: number, sign: 1 | -1, accept: (x: number, z: number) => boolean): void => {
    const pts = resample(contour(s, off, 2), 1.5);
    let acc = step * 0.5; // the first bench half a step along
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc < step) continue;
      // look ahead (up to 10 m) for the first spot that is free; if none, try again from the next point
      let hit = -1;
      for (let j = i; j < Math.min(pts.length, i + 7); j++) {
        if (!accept(pts[j][0], pts[j][1])) continue;
        const [nx, nz] = outward(s, pts[j][0], pts[j][1]);
        if (free(pts[j][0], pts[j][1], nx * sign, nz * sign)) { hit = j; break; }
      }
      if (hit < 0) continue;
      const [x, z] = pts[hit];
      const [nx, nz] = outward(s, x, z);
      add(area, x, z, nx * sign, nz * sign);
      acc = 0;
      i = hit;
    }
  };
  // island: 2.2 m inside the quay, looking out (+1 = along the outward normal)
  along('island', ISLAND, -2.2, 36, 1, () => true);
  // (no outer bank benches: the lake edge is the plot's fence)

  out.forEach((b, i) => { b.id = 'B' + i; });
  cache = out;
  return cache;
}

let seatCache: BenchSeat[] | null = null;

/** Every place to sit (3 per bench), ordered by bench then west to east in the bench's own frame. Step 12 puts people on them. */
export function benchSeats(): BenchSeat[] {
  if (seatCache) return seatCache;
  const out: BenchSeat[] = [];
  benches().forEach((b, i) => {
    for (let s = 0; s < BENCH.seats; s++) {
      const lx = (s - (BENCH.seats - 1) / 2) * BENCH.seatPitch;
      const [x, z] = benchPoint(b, lx, BENCH.seatZ);
      out.push({ id: b.id + '.' + s, bench: i, x, y: b.y + BENCH.seatH, z, yaw: b.yaw });
    }
  });
  seatCache = out;
  return out;
}

/** Walk collider of a bench: a box turned about y (building-local, y above the floor level). Same shape as the Obb of EVLabTowerLayout. */
export interface BenchObb { cx: number; cz: number; hx: number; hz: number; yaw: number; y0: number; y1: number }
export function benchObbs(): BenchObb[] {
  return benches().map((b) => {
    const [cx, cz] = benchPoint(b, 0, BENCH.footZ);
    return { cx, cz, hx: BENCH.len / 2, hz: BENCH.depth / 2, yaw: b.yaw, y0: 0, y1: BENCH.backH };
  });
}

/** True near any bench (+ margin): for the tests and for anything that must keep clear of the benches. */
export function inBenchZone(x: number, z: number, margin = 0): boolean {
  for (const b of benches()) {
    if (Math.abs(b.x - x) > BENCH.len + margin || Math.abs(b.z - z) > BENCH.len + margin) continue;
    const dx = x - b.x, dz = z - b.z, s = Math.sin(b.yaw), c = Math.cos(b.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c; // into the bench frame
    if (Math.abs(lx) <= BENCH.len / 2 + margin && Math.abs(lz - BENCH.footZ) <= BENCH.depth / 2 + margin) return true;
  }
  return false;
}

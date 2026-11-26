import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { classifySurface, SURFACE_SPEC, type PartKind, type Surface, type SurfaceOverrides } from './SurfaceMap';
import { getSurfaceMaterial } from './BuildingTextures';
import { carveRect, emptyInfo, type ModelInfo, type Rect2 } from './ModelInfo';

/**
 * BUILDING KIT - small helper to build low-poly buildings from code (no model files), same style as the
 * rocks / vehicles: flat shaded, vertex colours, ONE merged body mesh + ONE merged glass mesh per building.
 *
 * Every part also gets a real-world SURFACE (brick, plaster, tin, thatch ...) chosen from its colour + kind (see SurfaceMap.ts);
 * the parts are grouped per surface and get UVs in metres, so the textures keep the same real size on every wall.
 *
 * Conventions: metres, origin = centre of the footprint at ground level (y = 0), the front (street side) faces +Z.
 * Nothing in here knows about the game world: a building is just a THREE.Group you can place anywhere later.
 */

export type Side = 'front' | 'back' | 'left' | 'right';
const SIDE_ANGLE: Record<Side, number> = { front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 };

/** Typical storey height (m). */
export const FLOOR_H = 3.0;

export interface BuiltBuilding {
  root: THREE.Group;
  /** Footprint (m) including yard / boundary wall if the model has one. */
  width: number;
  depth: number;
  height: number;
  /** Floors, stairs, partitions and furniture of the walk-in rooms (a child of `root`); the owner may hide it when the player is far away. Undefined if the model has none. */
  interior?: THREE.Group;
  /** Solid parts, doors and wudu taps of the model (model frame), see ModelInfo.ts. */
  info: ModelInfo;
  /** Frees the geometry (materials are shared). */
  dispose(): void;
}

/** Thickness (m) of the walls of a walk-in building. */
export const WALL_T = 0.3;
/** Thickness (m) of the roof / ceiling slabs of a walk-in building. */
const SLAB_T = 0.3;
/** One step (tread) of the stoop in front of a door that stands higher than the ground. */
const STEP_RISE = 0.2;
const STEP_RUN = 0.34;

/** WALK-UP STOREYS (Kit.storeys): width and tread depth of a straight flight, the highest riser (the real riser is FLOOR_H / steps), floor slab and handrail. */
const STAIR_W = 1.0;
const STAIR_RUN = 0.27;
const STAIR_RISE_MAX = 0.19;
const FLOOR_SLAB_T = 0.2;
const RAIL_H = 0.95;
const RAIL_T = 0.08;
const STAIR_COLOR = 0xbdb5a4;
const FLOOR_COLOR = 0xd8cfbd;
const RAIL_COLOR = 0x6b4a2f;
/** Thickness (m) of the partition walls inside a walk-in building (Kit.interiorWall). */
const INNER_WALL_T = 0.12;

/** Options for the door(s) of the next walk-in boxes (Kit.doorStyle). */
export interface DoorOpts {
  /** Opening width / height (m); default by the width of the building. */
  w?: number;
  h?: number;
  /** Number of doors along the front wall; default by the width of the building. */
  n?: number;
  /** No door at all (a hall that is entered through another building). */
  none?: boolean;
  /** The main door of a mosque prayer hall. */
  hall?: boolean;
  /** Door leaf colour. */
  leaf?: number;
}

/** A box that was big enough to be a room: it becomes a hollow shell (4 walls with a door, ceiling, roof) in finish(). Plan rectangle in the model frame. */
interface Mass {
  x0: number; x1: number; z0: number; z1: number;
  y0: number; h: number;
  color: number;
  dims: readonly [number, number, number];
  ceil: number; // height of the room (m above y0)
  slabT: number; // thickness of the roof slab
  opts: DoorOpts;
  doors: { x: number; w: number; h: number }[];
}

/** Request from a model: the room whose floor is at y0 is `floors` storeys tall and gets real floors + stairs (see Kit.storeys). */
/** What a `furnish` callback of Kit.storeys gets: the inside of the room, the walking level of every storey and the stair flights (all in the model frame, metres). */
export interface StoreyCtx {
  k: Kit;
  /** The inside of the room (walls not included). Front (street side) = +z. */
  x0: number; x1: number; z0: number; z1: number;
  floors: number;
  /** Height (m) of every storey (floor to floor). */
  heights: number[];
  /** Walking surface (y) of every storey, 0 = ground floor. */
  levelY: number[];
  /** Clear height (m) between the floor of a storey and the ceiling above it. */
  clearH: number[];
  /** Flight f joins storey f and f + 1: x range, z range (back end .. front end of the steps) and the wall it stands on. The upper floor has its hole over it. */
  flights: { xa: number; xb: number; zf0: number; zf1: number; left: boolean }[];
  /** x of the front door(s) of the ground floor. */
  doorX: number[];
}

/** `heights` = height (m) of every storey from the ground floor up (they may differ: a tall shop floor under flats). */
interface StoreyReq { y0: number; heights: number[]; side: 'left' | 'right'; furnish?: (c: StoreyCtx) => void }

/** A finished piece of geometry: kept until finish() so that parts standing in a doorway can still be dropped. */
interface Part {
  surf: Surface;
  geo: THREE.BufferGeometry;
  decor: boolean;
  /** Made inside Kit.storeys (floors, stairs, partitions, furniture): drawn in the `interior` group that is only shown near the building. */
  interior: boolean;
  mn: [number, number, number];
  mx: [number, number, number];
}

/** Small deterministic random generator (for colour variants). */
export function rng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick<T>(seed: number, list: readonly T[]): T {
  return list[Math.abs(Math.floor(seed)) % list.length]!;
}

export interface WindowGridOpts {
  y0: number;
  floors: number;
  floorH?: number;
  cols: number;
  ww: number;
  wh: number;
  sill: number;
  glass?: number;
  frame?: number | null;
  skip?: (floor: number, col: number) => boolean;
}

export class Kit {
  private parts: Part[] = [];
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private toGlass = false;
  private force: Surface | null = null;
  /** WALK-IN BUILDINGS: what the game needs besides the looks (collision, doors, wudu taps). */
  private info: ModelInfo = emptyInfo();
  private masses: Mass[] = [];
  private noSolid = 0;
  private noHollow = 0;
  private doorOpt: DoorOpts = {};
  private inInterior = 0;
  private storeyReqs: StoreyReq[] = [];

  /** @param overrides colour -> surface for this model (e.g. clay colours -> 'mud'). */
  constructor(private overrides?: SurfaceOverrides) {}

  private get cur(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1]!;
  }

  /** Draw everything inside `fn` with one fixed surface, whatever its colour. */
  withSurface(surface: Surface, fn: () => void): void {
    const prev = this.force;
    this.force = surface;
    fn();
    this.force = prev;
  }

  /** Draw everything inside `fn` into the glass mesh. */
  asGlass(fn: () => void): void {
    const prev = this.toGlass;
    this.toGlass = true;
    fn();
    this.toGlass = prev;
  }

  /** Door(s) of the walk-in boxes drawn inside `fn` (size, count, a mosque hall door ...). */
  doorStyle(opts: DoorOpts, fn: () => void): void {
    const prev = this.doorOpt;
    this.doorOpt = { ...prev, ...opts };
    fn();
    this.doorOpt = prev;
  }

  /** Boxes drawn inside `fn` stay SOLID blocks (no room inside, no door): a plinth, a tank house, a parked vehicle ... */
  solidBlock(fn: () => void): void {
    this.noHollow++;
    fn();
    this.noHollow--;
  }

  /**
   * WALK-UP STOREYS: the tall room (one big box) whose floor is at `y0` and whose height is `floors` x `floorH` gets a real floor slab at every storey
   * and a straight stair (solid steps, handrail round the hole) between every two storeys. The flights alternate between the left and the right wall,
   * the first one on `side`. Call it once per model before finish(). If the room is too small for the stairs nothing is added.
   */
  storeys(y0: number, floors: number, opts: { floorH?: number; heights?: number[]; side?: 'left' | 'right'; furnish?: (c: StoreyCtx) => void } = {}): void {
    const heights = opts.heights ?? Array.from({ length: floors }, () => opts.floorH ?? FLOOR_H);
    if (heights.length < 2) return;
    this.storeyReqs.push({ y0, heights, side: opts.side ?? 'left', furnish: opts.furnish });
  }

  /**
   * FURNITURE for walk-in rooms (the `furnish` callback of storeys): one box in MODEL coordinates (y0 = bottom), drawn and, when `solid`, a collider.
   * It never turns a box into a room (unlike Kit.box), so it is safe inside the callback. Boxes thinner than 0.2 m are looks only.
   */
  furn(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number, solid = true): void {
    this.boxVisual(cx, y0, cz, w, h, d, color, [w, h, d], IDENT);
    if (solid && Math.min(w, d) >= 0.2 && h >= 0.08) this.info.solids.push({ x: cx, y: y0 + h / 2, z: cz, hx: w / 2, hy: h / 2, hz: d / 2, yaw: 0 });
  }

  /**
   * A partition wall inside a walk-in room, from y0 up `h`. axis 'x' = the wall runs along x at z = `fixed`; axis 'z' = it runs along z at x = `fixed`;
   * a0..a1 = the extent along the wall. `gaps` = doorways (centre along the wall, width), open to `doorH`. Solid.
   */
  interiorWall(axis: 'x' | 'z', fixed: number, a0: number, a1: number, y0: number, h: number, gaps: readonly { c: number; w: number }[], color: number, doorH = 2.05): void {
    const cuts: Rect2[] = gaps.map((g) => ({ a0: g.c - g.w / 2, a1: g.c + g.w / 2, b0: y0 - 1, b1: y0 + doorH }));
    const t = INNER_WALL_T;
    for (const r of carveRect({ a0, a1, b0: y0, b1: y0 + h }, cuts)) {
      if (axis === 'x') this.slab(r.a0, r.a1, r.b0, r.b1, fixed - t / 2, fixed + t / 2, color, [r.a1 - r.a0, r.b1 - r.b0, t]);
      else this.slab(fixed - t / 2, fixed + t / 2, r.b0, r.b1, r.a0, r.a1, color, [t, r.b1 - r.b0, r.a1 - r.a0]);
    }
  }

  /** Parts drawn inside `fn` are looks only: nobody collides with them (a hanging sign, a flag, a pond sheet ...). */
  decor(fn: () => void): void {
    this.noSolid++;
    fn();
    this.noSolid--;
  }

  /** A row of wudu (ablution) taps, positions in the current frame, y = height of the spout. */
  wudu(taps: readonly { x: number; z: number }[], y: number): void {
    const f = this.frame();
    if (!f) return;
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
    this.info.wudu.push({ y: f.y + y, taps: taps.map((p) => ({ x: f.x + c * p.x + s * p.z, z: f.z - s * p.x + c * p.z })) });
  }

  /** The current transform when it is only a move + turns about Y (else null: a tilted part is never solid). */
  private frame(): { yaw: number; x: number; y: number; z: number } | null {
    const e = this.cur.elements;
    if (Math.abs(e[1]!) > 1e-6 || Math.abs(e[9]!) > 1e-6 || Math.abs(e[4]!) > 1e-6 || Math.abs(e[6]!) > 1e-6 || Math.abs(e[5]! - 1) > 1e-6 || Math.abs(Math.hypot(e[0]!, e[8]!) - 1) > 1e-6) return null;
    return { yaw: Math.atan2(e[8]!, e[0]!), x: e[12]!, y: e[13]!, z: e[14]! };
  }

  /**
   * Called for every box: a big box standing on the ground becomes a Mass (a room: walls + door + ceiling are made in finish()) and returns true (nothing is drawn now);
   * any other box that is big enough is recorded as a solid block and the caller draws it as usual.
   */
  private claimBox(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number): boolean {
    const f = this.frame();
    if (!f) return false;
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
    const mx = f.x + c * cx + s * cz, mz = f.z - s * cx + c * cz, gy = f.y + y0;
    const q = Math.round(f.yaw / (Math.PI / 2));
    const axis = Math.abs(f.yaw - (q * Math.PI) / 2) < 1e-3;
    const odd = Math.abs(q) % 2 === 1;
    const pw = odd ? d : w, pd = odd ? w : d;
    if (this.noHollow === 0 && axis && gy > -0.06 && gy < 2.0 && h >= 2.0 && pw - 2 * WALL_T >= 2 && pd - 2 * WALL_T >= 2) {
      const o = this.doorOpt;
      const dw = Math.min(o.w ?? (pw < 8 ? 1.1 : pw < 20 ? 1.5 : 2.2), pw - 1.6);
      const slabT = h < 3.2 ? 0.15 : SLAB_T;
      const dh = Math.min(o.h ?? (pw < 8 ? 1.95 : pw < 20 ? 2.2 : 2.6), h - slabT - 0.1);
      const n = o.n ?? (pw >= 44 ? 3 : pw >= 22 ? 2 : 1);
      const xs = n <= 1 ? [mx] : n === 2 ? [mx - pw / 4, mx + pw / 4] : [mx - pw / 3, mx, mx + pw / 3];
      this.masses.push({
        x0: mx - pw / 2, x1: mx + pw / 2, z0: mz - pd / 2, z1: mz + pd / 2, y0: gy, h, color, dims: [w, h, d],
        ceil: h <= 10 ? h : Math.min(h, Math.max(4.2, dh + 0.9)),
        slabT,
        opts: o,
        doors: o.none ? [] : xs.map((x) => ({ x, w: dw, h: dh })),
      });
      return true;
    }
    if (Math.min(w, d) >= 0.2 && h >= 0.15 && (gy < 2.5 || (h >= 3 && Math.min(w, d) >= 2))) {
      this.info.solids.push({ x: mx, y: gy + h / 2, z: mz, hx: w / 2, hy: h / 2, hz: d / 2, yaw: f.yaw });
    }
    return false;
  }

  /** A part of a room (wall piece, slab, step) in MODEL coordinates: drawn and solid. */
  private slab(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number, dims: readonly [number, number, number]): void {
    if (x1 - x0 < 0.03 || y1 - y0 < 0.03 || z1 - z0 < 0.03) return;
    this.boxVisual((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, color, dims, IDENT);
    this.info.solids.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hy: (y1 - y0) / 2, hz: (z1 - z0) / 2, yaw: 0 });
  }

  private stepsOf(h: number): number {
    return Math.ceil(h / STAIR_RISE_MAX - 1e-6);
  }

  /** Does the room have space for the flights of this request? (else it stays as it was: no floors at all, a floor nobody can reach is worse than none) */
  private storeysFit(m: Mass, r: StoreyReq): boolean {
    const T = WALL_T;
    let longest = 0;
    for (let i = 0; i < r.heights.length - 1; i++) longest = Math.max(longest, (this.stepsOf(r.heights[i]!) - 1) * STAIR_RUN);
    return m.x1 - m.x0 - 2 * T >= 2 * STAIR_W + 1.6 && m.z1 - m.z0 - 2 * T >= STAIR_W + longest + 1.8;
  }

  /**
   * Floors + stairs inside one room (model frame). Flight f climbs from storey f to f+1: it starts at the FRONT end (low) and rises towards the BACK wall
   * where a 1 m landing is part of the upper floor. The upper floor has a hole over the flight (handrail on the two open sides). Flights alternate
   * left / right wall, so the next flight stands on solid floor.
   */
  private buildStoreys(m: Mass, r: StoreyReq): void {
    const T = WALL_T;
    const hs = r.heights, n = hs.length;
    const x0 = m.x0 + T, x1 = m.x1 - T, z0 = m.z0 + T, z1 = m.z1 - T;
    const levelY: number[] = [];
    let yy = r.y0;
    for (const h of hs) { levelY.push(yy); yy += h; }
    const flight = (f: number): { xa: number; xb: number; zf0: number; zf1: number; left: boolean } => {
      const left = (f % 2 === 0) === (r.side === 'left');
      const xa = left ? x0 : x1 - STAIR_W;
      return { xa, xb: xa + STAIR_W, zf0: z0 + STAIR_W, zf1: z0 + STAIR_W + (this.stepsOf(hs[f]!) - 1) * STAIR_RUN, left };
    };
    for (let f = 0; f < n - 1; f++) {
      const fl = flight(f);
      const steps = this.stepsOf(hs[f]!), rise = hs[f]! / steps;
      const base = levelY[f]!;
      for (let k = 1; k < steps; k++) {
        const top = base + k * rise;
        this.slab(fl.xa, fl.xb, base, top, fl.zf1 - k * STAIR_RUN, fl.zf1 - (k - 1) * STAIR_RUN, STAIR_COLOR, [STAIR_W, top - base, STAIR_RUN]);
      }
    }
    for (let j = 1; j < n; j++) {
      const lvl = levelY[j]!;
      const hole = flight(j - 1);
      const cuts: Rect2[] = [{ a0: hole.xa, a1: hole.xb, b0: hole.zf0, b1: hole.zf1 }];
      for (const q of carveRect({ a0: x0, a1: x1, b0: z0, b1: z1 }, cuts)) {
        this.slab(q.a0, q.a1, lvl - FLOOR_SLAB_T, lvl, q.b0, q.b1, FLOOR_COLOR, [q.a1 - q.a0, FLOOR_SLAB_T, q.b1 - q.b0]);
      }
      const rx0 = hole.left ? hole.xb : hole.xa - RAIL_T;
      this.slab(rx0, rx0 + RAIL_T, lvl, lvl + RAIL_H, hole.zf0, hole.zf1 + RAIL_T, RAIL_COLOR, [RAIL_T, RAIL_H, hole.zf1 - hole.zf0]);
      this.slab(hole.xa, hole.xb, lvl, lvl + RAIL_H, hole.zf1, hole.zf1 + RAIL_T, RAIL_COLOR, [STAIR_W, RAIL_H, RAIL_T]);
    }
    if (r.furnish) {
      const clearH: number[] = [], flights: StoreyCtx['flights'] = [];
      for (let i = 0; i < n; i++) clearH.push(i < n - 1 ? hs[i]! - FLOOR_SLAB_T : r.y0 + m.h - m.slabT - levelY[i]!);
      for (let f = 0; f < n - 1; f++) flights.push(flight(f));
      r.furnish({ k: this, x0, x1, z0, z1, floors: n, heights: hs, levelY, clearH, flights, doorX: m.doors.map((d) => d.x) });
    }
  }

  /** finish(): turn the Masses into rooms. */
  private buildRooms(): void {
    const T = WALL_T;
    const ms = this.masses;
    const covers = (n: Mass, x: number, z: number, y: number): boolean =>
      x > n.x0 + T && x < n.x1 - T && z > n.z0 + T && z < n.z1 - T && y >= n.y0 - 0.1 && y < n.y0 + n.ceil;
    for (const m of ms) {
      const top = m.y0 + m.h;
      const others = ms.filter((n) => n !== m);
      // doors that open into another room's wall are dropped
      const doors = m.doors.filter((d) => !others.some((n) => covers(n, d.x, m.z1 - T / 2, m.y0 + 1)));
      m.doors = doors;
      // floor: a room that stands higher than the ground needs something under it
      let supportFront = m.z1;
      if (m.y0 > 0.06) {
        const cx = (m.x0 + m.x1) / 2, cz = (m.z0 + m.z1) / 2;
        let sup: { z1: number } | null = null;
        for (const sd of this.info.solids) {
          if (Math.abs(sd.y + sd.hy - m.y0) > 0.07) continue;
          const sn = Math.abs(Math.sin(sd.yaw)), cs = Math.abs(Math.cos(sd.yaw));
          const ex = cs * sd.hx + sn * sd.hz, ez = sn * sd.hx + cs * sd.hz;
          if (Math.abs(cx - sd.x) <= ex && Math.abs(cz - sd.z) <= ez && sd.z + ez >= m.z1 - 0.01) { if (!sup || sd.z + ez > sup.z1) sup = { z1: sd.z + ez }; }
        }
        if (sup) supportFront = sup.z1;
        else this.slab(m.x0, m.x1, 0, m.y0, m.z0, m.z1, 0xcfc7b6, [m.x1 - m.x0, m.y0, m.z1 - m.z0]);
      }
      // walls: front (+z), back, left, right; each = a rectangle (along the wall x height) minus doors and the rooms that overlap it
      const yCut = (n: Mass): [number, number] | null => {
        const b0 = Math.max(m.y0, n.y0), b1 = Math.min(top, n.y0 + n.ceil);
        return b1 > b0 + 0.05 ? [b0, b1] : null;
      };
      for (const side of ['F', 'B', 'L', 'R'] as const) {
        const alongX = side === 'F' || side === 'B';
        const zc = side === 'F' ? m.z1 - T / 2 : m.z0 + T / 2;
        const xc = side === 'L' ? m.x0 + T / 2 : m.x1 - T / 2;
        const base: Rect2 = alongX ? { a0: m.x0, a1: m.x1, b0: m.y0, b1: top } : { a0: m.z0 + T, a1: m.z1 - T, b0: m.y0, b1: top };
        const cuts: Rect2[] = [];
        for (const n of others) {
          const yc = yCut(n);
          if (!yc) continue;
          if (alongX && zc > n.z0 + T && zc < n.z1 - T) cuts.push({ a0: n.x0 + T, a1: n.x1 - T, b0: yc[0], b1: yc[1] });
          if (!alongX && xc > n.x0 + T && xc < n.x1 - T) cuts.push({ a0: n.z0 + T, a1: n.z1 - T, b0: yc[0], b1: yc[1] });
        }
        if (side === 'F') for (const d of doors) cuts.push({ a0: d.x - d.w / 2, a1: d.x + d.w / 2, b0: m.y0 - 1, b1: m.y0 + d.h });
        for (const r of carveRect(base, cuts)) {
          if (alongX) this.slab(r.a0, r.a1, r.b0, r.b1, zc - T / 2, zc + T / 2, m.color, m.dims);
          else this.slab(xc - T / 2, xc + T / 2, r.b0, r.b1, r.a0, r.a1, m.color, m.dims);
        }
      }
      const sreq = this.storeyReqs.find((q) => Math.abs(q.y0 - m.y0) < 0.1 && Math.abs(m.h - q.heights.reduce((u, v) => u + v, 0)) < 0.3);
      const storeysOk = !!sreq && this.storeysFit(m, sreq);
      // roof (and a lower ceiling when the building is taller than one room)
      const plan = (inset: number): Rect2 => ({ a0: m.x0 + inset, a1: m.x1 - inset, b0: m.z0 + inset, b1: m.z1 - inset });
      const slabs: { inset: number; y: number }[] = [{ inset: 0, y: top - m.slabT }];
      if (!storeysOk && m.ceil < m.h - 0.05) slabs.push({ inset: T, y: m.y0 + m.ceil - 0.2 });
      for (const sl of slabs) {
        const upper = sl.y + (sl.inset ? 0.2 : m.slabT);
        const cuts: Rect2[] = [];
        for (const n of others) if (n.y0 <= sl.y + 0.05 && n.y0 + n.ceil >= upper - 0.05) cuts.push({ a0: n.x0 + T, a1: n.x1 - T, b0: n.z0 + T, b1: n.z1 - T });
        for (const r of carveRect(plan(sl.inset), cuts)) this.slab(r.a0, r.a1, sl.y, upper, r.b0, r.b1, m.color, m.dims);
      }
      if (sreq && storeysOk) { this.inInterior++; this.buildStoreys(m, sreq); this.inInterior--; }
      // the doors: record them + a stoop of steps when the floor is higher than the ground
      for (const d of doors) {
        this.info.doors.push({ x: d.x, y: m.y0, z: m.z1, w: d.w, h: d.h, t: T, leaf: m.opts.leaf ?? (d.w >= 2 ? 0x39505e : 0x6b4a2f), hall: !!m.opts.hall });
        if (m.y0 > 0.12) {
          const n = Math.ceil(m.y0 / STEP_RISE - 1e-6), rise = m.y0 / n;
          for (let j = 1; j < n; j++) {
            const z0 = supportFront + (n - 1 - j) * STEP_RUN;
            this.slab(d.x - d.w / 2 - 0.4, d.x + d.w / 2 + 0.4, 0, rise * j, z0, z0 + STEP_RUN, 0xcfc7b6, [d.w + 0.8, rise * j, STEP_RUN]);
          }
        }
      }
    }
    // nothing solid in the way right outside a door (a sign post, a pot ...): it stays drawn, you just walk through it
    const spots = this.info.doors;
    if (spots.length) {
      const hit = (x: number, z: number, y0: number, y1: number, hx: number, hz: number): boolean =>
        spots.some((d) => Math.abs(x - d.x) < d.w / 2 + 0.3 + hx && z + hz > d.z + 0.02 && z - hz < d.z + 1.0 && y0 < d.y + d.h && y1 > d.y + 0.1);
      this.info.solids = this.info.solids.filter((s) => {
        const sn = Math.abs(Math.sin(s.yaw)), cs = Math.abs(Math.cos(s.yaw));
        return !hit(s.x, s.z, s.y - s.hy, s.y + s.hy, cs * s.hx + sn * s.hz, sn * s.hx + cs * s.hz);
      });
      this.info.cyls = this.info.cyls.filter((c) => !hit(c.x, c.z, c.y - c.hh, c.y + c.hh, c.r, c.r));
    }
    // painted doors / windows / frames in a doorway go away
    this.parts = this.parts.filter((pt) => {
      if (!pt.decor) return true;
      const gone = spots.some((d) =>
        pt.mx[0] > d.x - d.w / 2 - 0.05 && pt.mn[0] < d.x + d.w / 2 + 0.05 && pt.mx[1] > d.y - 0.05 && pt.mn[1] < d.y + d.h + 0.05 && pt.mx[2] > d.z - d.t - 0.05 && pt.mn[2] < d.z + 0.9);
      if (gone) pt.geo.dispose();
      return !gone;
    });
  }

  private put(g: THREE.BufferGeometry, color: number, kind: PartKind, dims: readonly [number, number, number], matrix: THREE.Matrix4 = this.cur): void {
    const geo = g.index ? g.toNonIndexed() : g;
    geo.deleteAttribute('uv');
    geo.applyMatrix4(matrix);
    const surf: Surface = this.toGlass ? 'glass' : this.force ?? classifySurface(kind, color, dims, this.overrides);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const n = pos.count;
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    const mn: [number, number, number] = [1e9, 1e9, 1e9], mx: [number, number, number] = [-1e9, -1e9, -1e9];
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < mn[0]) mn[0] = x; if (x > mx[0]) mx[0] = x;
      if (y < mn[1]) mn[1] = y; if (y > mx[1]) mx[1] = y;
      if (z < mn[2]) mn[2] = z; if (z > mx[2]) mx[2] = z;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (surf !== 'plain') geo.setAttribute('uv', new THREE.BufferAttribute(planarUVs(pos, SURFACE_SPEC[surf].size), 2));
    // thin boxes and glass are paint (windows, frames, painted doors): they are dropped where a real door opening is cut
    this.parts.push({ surf, geo, decor: kind === 'box' && (surf === 'glass' || Math.min(dims[0], dims[1], dims[2]) < 0.3), interior: this.inInterior > 0, mn, mx });
  }

  // ---------- transforms ----------

  withMatrix(m: THREE.Matrix4, fn: () => void): void {
    this.stack.push(this.cur.clone().multiply(m));
    fn();
    this.stack.pop();
  }

  /** Draw in a local frame: translated to (x,y,z) and turned `ry` radians about Y. */
  local(x: number, y: number, z: number, ry: number, fn: () => void): void {
    const m = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry));
    this.withMatrix(m, fn);
  }

  /** Draw in the frame of one wall of a box-shaped building: local +x runs along the wall, local +z points outwards. */
  onSide(side: Side, cx: number, cz: number, w: number, d: number, fn: (len: number, half: number) => void): void {
    const fb = side === 'front' || side === 'back';
    this.local(cx, 0, cz, SIDE_ANGLE[side], () => fn(fb ? w : d, fb ? d / 2 : w / 2));
  }

  // ---------- primitives (y0 = bottom) ----------

  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number): void {
    if (this.toGlass || this.noSolid > 0 || !this.claimBox(cx, y0, cz, w, h, d, color)) this.boxVisual(cx, y0, cz, w, h, d, color);
  }

  private boxVisual(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number, dims?: readonly [number, number, number], matrix?: THREE.Matrix4): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(cx, y0 + h / 2, cz);
    this.put(g, color, 'box', dims ?? [w, h, d], matrix);
  }

  glass(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number): void {
    this.toGlass = true;
    this.box(cx, y0, cz, w, h, d, color);
    this.toGlass = false;
  }

  cyl(cx: number, y0: number, cz: number, rBottom: number, rTop: number, h: number, color: number, seg = 14): void {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1);
    g.translate(cx, y0 + h / 2, cz);
    this.put(g, color, 'cyl', [2 * Math.max(rBottom, rTop), h, 2 * Math.max(rBottom, rTop)]);
    const r = Math.max(rBottom, rTop);
    const f = this.frame();
    if (f && !this.toGlass && this.noSolid === 0 && r >= 0.09 && h >= 1 && f.y + y0 < 2.5) {
      const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
      this.info.cyls.push({ x: f.x + c * cx + s * cz, y: f.y + y0 + h / 2, z: f.z - s * cx + c * cz, r, hh: h / 2 });
    }
  }

  sphere(cx: number, cy: number, cz: number, r: number, color: number, sy = 1): void {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1, sy, 1);
    g.translate(cx, cy, cz);
    this.put(g, color, 'sphere', [2 * r, 2 * r * sy, 2 * r]);
  }

  /** Gable roof: span across X, ridge along Z (length). */
  gable(cx: number, y0: number, cz: number, span: number, length: number, h: number, color: number): void {
    const s = new THREE.Shape();
    s.moveTo(-span / 2, 0);
    s.lineTo(span / 2, 0);
    s.lineTo(0, h);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
    g.translate(cx, y0, cz - length / 2);
    this.put(g, color, 'roof', [span, h, length]);
  }

  /** Mono-pitch (shed) roof: low edge at -X, high edge at +X, runs along Z. */
  shed(cx: number, y0: number, cz: number, span: number, length: number, hLow: number, hHigh: number, color: number): void {
    const s = new THREE.Shape();
    s.moveTo(-span / 2, 0);
    s.lineTo(span / 2, 0);
    s.lineTo(span / 2, hHigh);
    s.lineTo(-span / 2, hLow);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
    g.translate(cx, y0, cz - length / 2);
    this.put(g, color, 'roof', [span, hHigh, length]);
  }

  /** Half-sphere dome (base radius r, height h), sitting at y0. Use withSurface() to choose its material. */
  dome(cx: number, y0: number, cz: number, r: number, h: number, color: number, seg = 20): void {
    const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg / 2), 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(r, h, r);
    g.translate(cx, y0, cz);
    this.put(g, color, 'roof', [2 * r, h, 2 * r]);
  }

  /** Pointed (gothic / mughal) arch panel facing +Z: width w, total height h, thickness d. glass = true puts it in the glass mesh. */
  arch(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number, glass = false): void {
    const s = new THREE.Shape();
    const sh = h * 0.58;
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, sh);
    s.quadraticCurveTo(w / 2, sh + (h - sh) * 0.75, 0, h);
    s.quadraticCurveTo(-w / 2, sh + (h - sh) * 0.75, -w / 2, sh);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 6 });
    g.translate(cx, y0, cz - d / 2);
    this.toGlass = glass;
    this.put(g, color, 'box', [w, h, d]);
    this.toGlass = false;
  }

  /** Four-sided pyramid / hip roof. */
  hip(cx: number, y0: number, cz: number, w: number, d: number, h: number, color: number): void {
    const g = new THREE.ConeGeometry(1, 1, 4, 1);
    g.rotateY(Math.PI / 4);
    g.translate(0, 0.5, 0);
    g.scale(w / Math.SQRT2, h, d / Math.SQRT2);
    g.translate(cx, y0, cz);
    this.put(g, color, 'roof', [w, h, d]);
  }

  // ---------- composite helpers ----------

  /** Corrugated tin roof: gable with ribs running down both slopes. Ridge along Z. */
  tinRoof(cx: number, y0: number, cz: number, span: number, length: number, h: number, base: number, rib: number): void {
    this.withSurface('tin', () => this.tinRoofParts(cx, y0, cz, span, length, h, base, rib));
  }

  private tinRoofParts(cx: number, y0: number, cz: number, span: number, length: number, h: number, base: number, rib: number): void {
    this.gable(cx, y0, cz, span, length, h, base);
    const slope = Math.hypot(span / 2, h);
    const ang = Math.atan2(h, span / 2);
    const n = Math.max(2, Math.round(length / 0.42));
    for (const s of [1, -1]) {
      for (let i = 0; i < n; i++) {
        const z = cz - length / 2 + (length * (i + 0.5)) / n;
        const m = new THREE.Matrix4()
          .makeTranslation(cx + (s * span) / 4, y0 + h / 2, z)
          .multiply(new THREE.Matrix4().makeRotationZ(-s * ang));
        this.withMatrix(m, () => this.box(0, 0.0, 0, slope, 0.07, 0.07, rib));
      }
    }
    // ridge cap
    this.box(cx, y0 + h - 0.04, cz, 0.35, 0.1, length + 0.05, rib);
  }

  /** Window grid on one wall (glass + optional frame). Wall box is (cx,cz,w,d). */
  windowGrid(side: Side, cx: number, cz: number, w: number, d: number, o: WindowGridOpts): void {
    const fh = o.floorH ?? FLOOR_H;
    const glass = o.glass ?? 0x2f4f66;
    this.onSide(side, cx, cz, w, d, (len, half) => {
      for (let f = 0; f < o.floors; f++) {
        for (let c = 0; c < o.cols; c++) {
          if (o.skip?.(f, c)) continue;
          const t = -len / 2 + (len * (c + 0.5)) / o.cols;
          const y = o.y0 + f * fh + o.sill;
          if (o.frame != null) this.box(t, y - 0.07, half + 0.01, o.ww + 0.14, o.wh + 0.14, 0.05, o.frame);
          this.glass(t, y, half + 0.04, o.ww, o.wh, 0.05, glass);
        }
      }
    });
  }

  /** One balcony (slab + railing) on a wall, spanning t0..t1 along the wall (wall-centred coordinates). */
  balcony(side: Side, cx: number, cz: number, w: number, d: number, y: number, t0: number, t1: number, depth: number, slab: number, rail: number, glassRail = false): void {
    this.onSide(side, cx, cz, w, d, (_len, half) => {
      const mid = (t0 + t1) / 2;
      const L = t1 - t0;
      this.box(mid, y, half + depth / 2, L, 0.16, depth, slab);
      const ry = y + 0.16;
      const put = glassRail
        ? (a: number, b: number, c: number, ww: number, hh: number, dd: number) => this.glass(a, b, c, ww, hh, dd, rail)
        : (a: number, b: number, c: number, ww: number, hh: number, dd: number) => this.box(a, b, c, ww, hh, dd, rail);
      put(mid, ry, half + depth - 0.04, L, 1.0, 0.06);
      put(t0 + 0.03, ry, half + depth / 2, 0.06, 1.0, depth);
      put(t1 - 0.03, ry, half + depth / 2, 0.06, 1.0, depth);
    });
  }

  /** Parapet wall around a flat roof of a box (roof top at y). */
  parapet(cx: number, y: number, cz: number, w: number, d: number, h: number, t: number, color: number): void {
    this.box(cx, y, cz + d / 2 - t / 2, w, h, t, color);
    this.box(cx, y, cz - d / 2 + t / 2, w, h, t, color);
    this.box(cx - w / 2 + t / 2, y, cz, t, h, d - 2 * t, color);
    this.box(cx + w / 2 - t / 2, y, cz, t, h, d - 2 * t, color);
  }

  /** Plastic roof water tank on a small plinth. */
  waterTank(cx: number, y: number, cz: number, r = 0.85, color = 0x1d2530): void {
    this.box(cx, y, cz, r * 2.3, 0.3, r * 2.3, 0x9a9a95);
    this.cyl(cx, y + 0.3, cz, r, r, 1.15, color, 14);
    this.cyl(cx, y + 1.45, cz, r * 0.85, r * 0.6, 0.18, color, 14);
    this.cyl(cx, y + 1.63, cz, r * 0.22, r * 0.22, 0.12, 0xc9c9c9, 8);
  }

  /** Boundary wall with a gate gap in the front. Wall centred at (cx,cz). */
  boundaryWall(cx: number, cz: number, W: number, D: number, color: number, cap: number, gate = 3.4, h = 1.8): void {
    const t = 0.22;
    this.box(cx, 0, cz - D / 2 + t / 2, W, h, t, color);
    this.box(cx - W / 2 + t / 2, 0, cz, t, h, D - 2 * t, color);
    this.box(cx + W / 2 - t / 2, 0, cz, t, h, D - 2 * t, color);
    const seg = (W - gate) / 2;
    this.box(cx - gate / 2 - seg / 2, 0, cz + D / 2 - t / 2, seg, h, t, color);
    this.box(cx + gate / 2 + seg / 2, 0, cz + D / 2 - t / 2, seg, h, t, color);
    for (const s of [-1, 1]) {
      this.box(cx + (s * gate) / 2, 0, cz + D / 2 - t / 2, 0.45, h + 0.45, 0.45, color);
      this.box(cx + (s * gate) / 2, h + 0.45, cz + D / 2 - t / 2, 0.6, 0.1, 0.6, cap);
      // open iron gate leaf
      this.box(cx + s * (gate / 2 - 0.05), 0.15, cz + D / 2 + 0.55, 0.05, 1.5, 1.1, 0x2d3439);
    }
  }

  tree(x: number, z: number, h = 4.5, crown = 0x4b8a42): void {
  void [x, z, h, crown]; // no fake trees in buildings: the game's real trees (plot trees / street trees) stand there
  return;
    this.cyl(x, 0, z, 0.2, 0.14, h * 0.55, 0x6b4a2f, 7);
    this.sphere(x, h * 0.75, z, h * 0.32, crown, 0.9);
    this.sphere(x + h * 0.14, h * 0.62, z + h * 0.06, h * 0.22, crown);
  }

  // ---------- output ----------

  finish(width: number, depth: number, height: number): BuiltBuilding {
    this.buildRooms();
    const root = new THREE.Group();
    const geos: THREE.BufferGeometry[] = [];
    let interior: THREE.Group | undefined;
    for (const inside of [false, true]) {
      const buckets = new Map<Surface, THREE.BufferGeometry[]>();
      for (const pt of this.parts) {
        if (pt.interior !== inside) continue;
        let list = buckets.get(pt.surf);
        if (!list) buckets.set(pt.surf, (list = []));
        list.push(pt.geo);
      }
      let target: THREE.Group = root;
      if (inside && buckets.size > 0) {
        interior = new THREE.Group();
        interior.name = 'interior';
        root.add(interior);
        target = interior;
      }
      for (const [surf, list] of buckets) {
        const g = mergeGeometries(list, false)!;
        geos.push(g);
        const m = new THREE.Mesh(g, getSurfaceMaterial(surf));
        m.name = surf;
        m.castShadow = surf !== 'glass' && !inside; // nothing inside a building casts a shadow
        m.receiveShadow = true;
        target.add(m);
        for (const x of list) x.dispose();
      }
    }
    this.parts = [];
    this.masses = [];
    this.storeyReqs = [];
    return {
      root,
      interior,
      width,
      depth,
      height,
      info: this.info,
      dispose: () => geos.forEach((g) => g.dispose()),
    };
  }
}

const IDENT = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _bt = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Planar UVs per triangle, in metres / texture size. The texture's u axis runs horizontally along a wall, v runs up the wall
 * (or up the slope on a roof), so brick courses are level, tin ribs run down the roof, thatch strands follow the slope.
 */
function planarUVs(pos: THREE.BufferAttribute, size: [number, number]): Float32Array {
  const out = new Float32Array(pos.count * 2);
  for (let i = 0; i + 2 < pos.count; i += 3) {
    _a.fromBufferAttribute(pos, i);
    _b.fromBufferAttribute(pos, i + 1);
    _c.fromBufferAttribute(pos, i + 2);
    _n.copy(_b).sub(_a).cross(_c.clone().sub(_a));
    if (_n.lengthSq() < 1e-12) continue;
    _n.normalize();
    if (Math.abs(_n.y) > 0.9) _t.set(1, 0, 0);
    else _t.crossVectors(UP, _n).normalize();
    _bt.crossVectors(_n, _t);
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? _a : k === 1 ? _b : _c;
      out[(i + k) * 2] = p.dot(_t) / size[0];
      out[(i + k) * 2 + 1] = p.dot(_bt) / size[1];
    }
  }
  return out;
}

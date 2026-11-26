// CITY MALL, STEP C2: the stair cores and lift cores (pure numbers + lists, NO three.js, so the headless test and the builder share ONE truth).
// Local frame of the mall block: x along the corridor (west -, east +), z across, y up. Floor f = f * 5 m, slab of floor f = y (f*5 - 0.4) .. (f*5).
// Decisions of the user (26 Nov): ONE stair + ONE lift on each of two sides (west, east) of the atrium; stair 2.4 m wide; lift 8 m/s.
// STEP R1 (26 Nov): the atrium is now 100 m across, so the cores moved out with it: they stand just OUTSIDE the atrium edge (every x is measured from the atrium centre,
// STAIR.x0 = atrium radius + 3 m, LIFT.xc = atrium radius + 6.5 m); the shapes and the z positions (aisle |z| < 8 free) are exactly as in C2.
//
// EACH SIDE (side = -1 west, +1 east; the east one is described, the west one is its mirror in x):
//   (numbers below are the C2 ones for an atrium of radius 10; add (atrium radius - 10) to every x for the R1 positions)
//   STAIR (switchback, z 9.5 .. 14.5, south of the aisle): flight A (lane z 9.5..11.9, next to the aisle) climbs from floor f at x = 13 outwards to a mid landing
//     (+2.5 m), flight B (lane z 12.1..14.5) comes back to floor f+1 at x = 13. 15 steps of 0.3 m per flight (rise 0.1667 m). Walking surface = a smooth ramp.
//     Slab f+1 has a hole over flight B (x 13..17.7, z 12..14.6); flight A runs UNDER the slab (head room >= 2.06 m).
//   LIFT (z -13.2 .. -10.4, north of the aisle): a glass shaft 2.8 x 2.8 m, the cabin door faces the aisle (+z). 10 stops (floor 0..9).
// The aisle |z| < 8 stays free (the lift lobby is z -10.4 .. -8).
import { MALL_ATRIUM_R, MALL_FH, MALL_FLOORS, MALL_SLAB } from './MallSite';

/** What a click on a lift button does (carried in PickInfo.action by MallBuilder). */
export type PickAction = { kind: 'call'; lift: number; level: number } | { kind: 'panel'; lift: number };

export type Side = -1 | 1;
export const SIDES: ReadonlyArray<Side> = [-1, 1];
export type Pt = [number, number];
/** Same shape as Solid in MallBuilder (axis-aligned box, local space). */
export interface Box { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
/** Same shape as Ramp in MallBuilder: the TOP surface runs from (x0, y0) to (x1, y1), `width` wide, centred on z = zc. */
export interface RampSpec { x0: number; y0: number; x1: number; y1: number; zc: number; width: number; thick: number }
/** Same shape as rampRails in MallBuilder: a box turned about z. */
export interface RailSpec { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number; rotZ: number }
export interface MeshSpec { vertices: Float32Array; indices: Uint32Array }
/** One visual box: k = concrete / glass / steel, centre, full size, turn about z. */
export interface Vis { k: 'c' | 'g' | 's'; cx: number; cy: number; cz: number; sx: number; sy: number; sz: number; rz: number }

export const FH = MALL_FH;
export const NF = MALL_FLOORS;
export const SLAB = MALL_SLAB;
/** Underside of the floor-1 slab = ceiling of the ground concourse. */
export const CEIL = FH - SLAB;
/** Top of the shaft: the underside of the roof slab. */
export const SHAFT_TOP = FH * NF - SLAB;

// ---------------------------------------------------------------- STAIR numbers
export const STAIR = {
  x0: MALL_ATRIUM_R + 3, // near end (the foot of flight A / the top of flight B), distance from the atrium centre (R1: 3 m outside the atrium rail)
  run: 4.5,          // length of one flight (15 treads of 0.3 m)
  landing: 2.6,      // depth of the mid landing (>= the 2.4 m width)
  zc: 12,            // centre line between the two lanes
  laneW: 2.4,        // USER: stair 2.4 m wide
  gap: 0.2,          // gap between the two lanes (the well)
  rise: FH / 2,      // one flight climbs half a storey
  steps: 15,
  bias: 0.04,        // the walking ramp lies 4 cm above the line through the tread noses
  rail: 1.1,         // railing height
  holeEnd: 4.7,      // the slab hole over flight B ends here (x distance from x0)
  skirtT: 0.1,
} as const;
export const STAIR_LEN = STAIR.run + STAIR.landing; // 7.1
const SLOPE = STAIR.rise / STAIR.run;
/** z range of lane A (next to the aisle) and lane B (far lane). */
export const LANE_A: Pt = [STAIR.zc - STAIR.gap / 2 - STAIR.laneW, STAIR.zc - STAIR.gap / 2];
export const LANE_B: Pt = [STAIR.zc + STAIR.gap / 2, STAIR.zc + STAIR.gap / 2 + STAIR.laneW];
export const LANE_A_C = (LANE_A[0] + LANE_A[1]) / 2;
export const LANE_B_C = (LANE_B[0] + LANE_B[1]) / 2;
const Z_N = LANE_A[0];   // 9.5: north edge of the core (the aisle side)
const Z_S = LANE_B[1];   // 14.5: south edge
/** x of the point at distance u from the near end of the stair on this side. */
export const stairX = (side: Side, u: number): number => side * (STAIR.x0 + u);

// ---------------------------------------------------------------- LIFT numbers
export const LIFT = {
  xc: MALL_ATRIUM_R + 6.5, // shaft centre x (distance from the atrium centre)
  zc: -11.8,         // cabin centre z
  innerX: 2.4, innerZ: 2.4, wall: 0.2,
  cabX: 2.0, cabZ: 2.2, cabH: 2.5, floorT: 0.2,
  doorW: 1.2, doorH: 2.2,
  speed: 8,          // USER: fast, 8 m/s
  accel: 2.5,        // m/s2 (assumed: 8 m/s reached after 3.2 s; short trips stay slower)
  doorTime: 1.4, dwell: 3,
} as const;
const LZ_BACK_IN = LIFT.zc - 1.1 - 0.1;   // -13.0 inner face of the back wall
const LZ_FRONT_IN = LZ_BACK_IN + LIFT.innerZ; // -10.6 inner face of the front wall
export const LIFT_FRONT_Z = LZ_FRONT_IN + LIFT.wall; // -10.4 outer face of the front wall (the lobby starts here)

export interface LiftSpec { id: number; side: Side; xc: number }
/** id 0 = west lift, id 1 = east lift. */
export const LIFTS: ReadonlyArray<LiftSpec> = SIDES.map((side, id) => ({ id, side, xc: side * LIFT.xc }));

export const levelY = (l: number): number => l * FH;
export const levelNear = (y: number): number => Math.max(0, Math.min(NF - 1, Math.round(y / FH)));

// ---------------------------------------------------------------- floor names (the department names come in C3)
const BN_ORD = ['নিচতলা', '১ম তলা', '২য় তলা', '৩য় তলা', '৪র্থ তলা', '৫ম তলা', '৬ষ্ঠ তলা', '৭ম তলা', '৮ম তলা', '৯ম তলা'];
const EN_ORD = ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', '4th Floor', '5th Floor', '6th Floor', '7th Floor', '8th Floor', '9th Floor'];
export const floorNameBn = (f: number): string => BN_ORD[f] ?? `${f} তলা`;
export const floorNameEn = (f: number): string => EN_ORD[f] ?? `Floor ${f}`;

// ---------------------------------------------------------------- slab holes
const rect = (x0: number, x1: number, z0: number, z1: number): Pt[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
/** Hole over flight B in the slab of floor f (f >= 1). */
export function stairHole(side: Side): Pt[] {
  const a = stairX(side, 0), b = stairX(side, STAIR.holeEnd);
  return rect(Math.min(a, b), Math.max(a, b), LANE_B[0] - 0.1, LANE_B[1] + 0.1);
}
/** Hole for the lift shaft (the cabin passes through every slab). */
export function liftHole(l: LiftSpec): Pt[] {
  return rect(l.xc - LIFT.innerX / 2, l.xc + LIFT.innerX / 2, LZ_BACK_IN, LZ_FRONT_IN);
}
/** All stair + lift holes in the slab of floor f. */
export function coreHoles(_f: number): Pt[][] {
  return [...SIDES.map(stairHole), ...LIFTS.map(liftHole)];
}
/** Rectangles [x0, x1, z0, z1] the cores occupy (+ the lift lobby): nothing else (lights, shops) may stand there. */
export function coreFootprints(): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const s of SIDES) {
    const a = stairX(s, -0.2), b = stairX(s, STAIR_LEN + 0.2);
    out.push([Math.min(a, b), Math.max(a, b), Z_N - 0.1, Z_S + 0.2]);
  }
  for (const l of LIFTS) out.push([l.xc - LIFT.innerX / 2 - LIFT.wall, l.xc + LIFT.innerX / 2 + LIFT.wall, LZ_BACK_IN - LIFT.wall, LIFT_FRONT_Z + 2.4]);
  return out;
}

// ---------------------------------------------------------------- helpers
const mkBox = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box => ({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: y0, maxY: y1, minZ: z0, maxZ: z1 });

/** A box lying on the sloped line (xa, ya) -> (xb, yb), standing `h` high ABOVE it (perpendicular), `len` along it, `t` thick (z). Returns collider + visual numbers. */
function onSlope(xa: number, ya: number, xb: number, yb: number, z: number, t: number, h: number): { rail: RailSpec; v: { cx: number; cy: number; cz: number; len: number; rz: number; nx: number; ny: number } } {
  const dx = xb - xa, dy = yb - ya, L = Math.hypot(dx, dy);
  let nx = -dy / L, ny = dx / L; // unit normal, pointing up
  if (ny < 0) { nx = -nx; ny = -ny; }
  const cx = (xa + xb) / 2 + nx * (h / 2), cy = (ya + yb) / 2 + ny * (h / 2);
  const rz = Math.atan(dy / dx);
  return { rail: { cx, cy, cz: z, hx: L / 2, hy: h / 2, hz: t / 2, rotZ: rz }, v: { cx, cy, cz: z, len: L, rz, nx, ny } };
}

/** A closed prism (convex polygon in the u / y plane, fan-triangulated) standing in the plane z .. z + t: used as collider AND as the visual of the stair skirts. */
export function prism(side: Side, poly: Pt[], y0: number, z: number, t: number): MeshSpec {
  const n = poly.length, v = new Float32Array(n * 2 * 3);
  poly.forEach(([u, y], i) => {
    v.set([stairX(side, u), y0 + y, z], i * 3);
    v.set([stairX(side, u), y0 + y, z + t], (n + i) * 3);
  });
  const idx: number[] = [];
  for (let i = 1; i + 1 < n; i++) { idx.push(0, i, i + 1); idx.push(n, n + i + 1, n + i); }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(i, j, n + j, i, n + j, n + i); }
  return { vertices: v, indices: Uint32Array.from(idx) };
}

// ---------------------------------------------------------------- STAIR model of one side
export interface StairModel {
  side: Side;
  solids: Box[];         // axis aligned colliders (landings, rails, enclosure)
  ramps: RampSpec[];     // walking surfaces
  rails: RailSpec[];     // sloped rail colliders
  meshSolids: MeshSpec[]; // skirts (also drawn)
  vis: Vis[];            // everything drawn as boxes
  skirts: MeshSpec[];    // the same skirts, for the visual
}

export function stairModel(side: Side): StairModel {
  const m: StairModel = { side, solids: [], ramps: [], rails: [], meshSolids: [], vis: [], skirts: [] };
  const X = (u: number) => stairX(side, u);
  const { run, rise, steps, bias, rail } = STAIR;
  const th = run / steps, rh = rise / steps;
  const vis = (k: Vis['k'], b: Box) => m.vis.push({ k, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, cz: (b.minZ + b.maxZ) / 2, sx: b.maxX - b.minX, sy: b.maxY - b.minY, sz: b.maxZ - b.minZ, rz: 0 });
  const solid = (b: Box, draw: Vis['k'] | null) => { m.solids.push(b); if (draw) vis(draw, b); };
  const slopeRail = (xa: number, ya: number, xb: number, yb: number, z: number) => {
    const r = onSlope(xa, ya, xb, yb, z, 0.1, rail);
    m.rails.push(r.rail);
    m.vis.push({ k: 'g', cx: r.v.cx, cy: r.v.cy, cz: r.v.cz, sx: r.v.len, sy: rail, sz: 0.03, rz: r.v.rz });
    // hand rail along the top edge of the glass
    m.vis.push({ k: 's', cx: r.v.cx + r.v.nx * (rail / 2 + 0.03), cy: r.v.cy + r.v.ny * (rail / 2 + 0.03), cz: z, sx: r.v.len, sy: 0.06, sz: 0.07, rz: r.v.rz });
  };

  for (let f = 0; f < NF - 1; f++) {
    const y0 = f * FH;
    const aTop = { xa: X(0), ya: y0 + bias, xb: X(run), yb: y0 + rise + bias };           // flight A surface (rises with u)
    const bTop = { xa: X(run), ya: y0 + rise + bias, xb: X(0), yb: y0 + FH + bias };      // flight B surface (rises as u falls)
    // walking ramps (smooth)
    for (const [r, zc] of [[aTop, LANE_A_C], [bTop, LANE_B_C]] as const) m.ramps.push({ x0: r.xa, y0: r.ya, x1: r.xb, y1: r.yb, zc, width: STAIR.laneW, thick: 0.2 });
    // the mid landing
    solid(mkBox(X(run), X(STAIR_LEN), y0 + rise - 0.3, y0 + rise, Z_N, Z_S), 'c');
    // drawn: the steps (15 per flight) + a sloped slab under each flight
    for (const lane of ['A', 'B'] as const) {
      const zc = lane === 'A' ? LANE_A_C : LANE_B_C;
      for (let k = 0; k < steps; k++) {
        const u = lane === 'A' ? (k + 0.5) * th : run - (k + 0.5) * th;
        const yTop = y0 + (lane === 'A' ? (k + 1) * rh : rise + (k + 1) * rh);
        m.vis.push({ k: 'c', cx: X(u), cy: yTop - rh / 2, cz: zc, sx: th, sy: rh, sz: STAIR.laneW, rz: 0 });
      }
      const ln = lane === 'A' ? aTop : bTop;
      const sl = onSlope(ln.xa, ln.ya, ln.xb, ln.yb, zc, 0.1, 0.25); // a 0.25 thick slab standing ON the line ...
      // ... moved down so that its top face lies on the line through the tread noses (bias under the walking ramp): centre = line centre - normal * (0.125 + bias)
      const nx = sl.v.nx, ny = sl.v.ny, mx = (ln.xa + ln.xb) / 2, my = (ln.ya + ln.yb) / 2;
      m.vis.push({ k: 'c', cx: mx - nx * (0.125 + bias), cy: my - ny * (0.125 + bias), cz: zc, sx: sl.v.len, sy: 0.25, sz: STAIR.laneW, rz: sl.v.rz });
    }
    // rails along both flights (outer edge + the well) and round the landing
    slopeRail(aTop.xa, aTop.ya, aTop.xb, aTop.yb, Z_N - 0.05);
    slopeRail(aTop.xa, aTop.ya, aTop.xb, aTop.yb, LANE_A[1] + 0.05);
    slopeRail(bTop.xa, bTop.ya, bTop.xb, bTop.yb, LANE_B[0] - 0.05);
    slopeRail(bTop.xa, bTop.ya, bTop.xb, bTop.yb, Z_S + 0.05);
    const ly = y0 + rise, rh1 = rail + 0.2; // landing rails
    solid(mkBox(X(run), X(STAIR_LEN), ly, ly + rh1, Z_N - 0.1, Z_N), null);
    solid(mkBox(X(run), X(STAIR_LEN), ly, ly + rh1, Z_S, Z_S + 0.1), null);
    solid(mkBox(X(STAIR_LEN), X(STAIR_LEN) + side * 0.1, ly, ly + rh1, Z_N - 0.1, Z_S + 0.1), null);
    for (const [x0, x1, z0, z1] of [[X(run), X(STAIR_LEN), Z_N - 0.1, Z_N], [X(run), X(STAIR_LEN), Z_S, Z_S + 0.1], [X(STAIR_LEN), X(STAIR_LEN) + side * 0.1, Z_N - 0.1, Z_S + 0.1]] as const) {
      m.vis.push({ k: 'g', cx: (x0 + x1) / 2, cy: ly + rail / 2, cz: (z0 + z1) / 2, sx: Math.max(0.03, Math.abs(x1 - x0)), sy: rail, sz: Math.max(0.03, z1 - z0), rz: 0 });
      m.vis.push({ k: 's', cx: (x0 + x1) / 2, cy: ly + rail + 0.03, cz: (z0 + z1) / 2, sx: Math.max(0.07, Math.abs(x1 - x0)), sy: 0.06, sz: Math.max(0.07, z1 - z0), rz: 0 });
    }
    // the hole in the slab of floor f + 1: a rail round the edges that people can reach (south edge, far end, the well side)
    const sy = (f + 1) * FH, hy = rail + 0.2;
    const hs = Z_S + 0.1, hn = LANE_B[0] - 0.1, he = STAIR.holeEnd;
    solid(mkBox(X(0), X(he), sy, sy + hy, hs, hs + 0.1), null);
    solid(mkBox(X(he), X(he) + side * 0.1, sy, sy + hy, hn, hs + 0.1), null);
    solid(mkBox(X(0), X(he), sy, sy + hy, hn - 0.1, hn), null);
    for (const [x0, x1, z0, z1] of [[X(0), X(he), hs, hs + 0.1], [X(he), X(he) + side * 0.1, hn, hs + 0.1], [X(0), X(he), hn - 0.1, hn]] as const) {
      m.vis.push({ k: 'g', cx: (x0 + x1) / 2, cy: sy + rail / 2, cz: (z0 + z1) / 2, sx: Math.max(0.03, Math.abs(x1 - x0)), sy: rail, sz: Math.max(0.03, z1 - z0), rz: 0 });
      m.vis.push({ k: 's', cx: (x0 + x1) / 2, cy: sy + rail + 0.03, cz: (z0 + z1) / 2, sx: Math.max(0.07, Math.abs(x1 - x0)), sy: 0.06, sz: Math.max(0.07, z1 - z0), rz: 0 });
    }
    // skirts: close the empty space under the flights + the landing (nobody can walk in under the stair)
    const lineN = (u: number) => Math.min(2.2, Math.max(0, bias + SLOPE * u - 0.28));
    const u1 = (0.28 - bias) / SLOPE, u2 = (2.2 + 0.28 - bias) / SLOPE;
    const pieces: [Pt[], number][] = [[[[u1, 0], [STAIR_LEN, 0], [STAIR_LEN, 2.2], [u2, lineN(u2)]], Z_N - 0.1]]; // north (aisle side)
    if (f === 0) { // ground storey: the south side is closed too (the room under flight B), up to the ceiling
      const topB = (u: number) => Math.min(CEIL, FH + bias - 0.25 - SLOPE * u);
      const uc = (FH + bias - 0.25 - CEIL) / SLOPE;
      pieces.push([[[0, 0], [run, 0], [run, topB(run)], [uc, CEIL], [0, CEIL]], Z_S]);
      pieces.push([[[run, 0], [STAIR_LEN, 0], [STAIR_LEN, 2.2], [run, 2.2]], Z_S]);
    } else {
      pieces.push([[[STAIR.holeEnd, 0], [STAIR_LEN, 0], [STAIR_LEN, 2.2], [STAIR.holeEnd, 2.2]], Z_S]);
    }
    for (const [poly, z] of pieces) {
      const p = prism(side, poly, y0, z, STAIR.skirtT);
      m.meshSolids.push(p); m.skirts.push(p);
    }
    // the far end of the space under the landing
    solid(mkBox(X(STAIR_LEN), X(STAIR_LEN) + side * 0.1, y0, y0 + 2.2, Z_N - 0.1, Z_S + 0.1), 'c');
    if (f === 0) solid(mkBox(X(-0.1), X(0), 0, CEIL, LANE_B[0], LANE_B[1] + 0.1), 'c'); // front panel of the room under flight B
  }
  return m;
}

// ---------------------------------------------------------------- LIFT model
/** Static colliders of one lift shaft (side walls, back wall, the front wall with a door opening at every floor). */
export function liftShaftSolids(l: LiftSpec): Box[] {
  const out: Box[] = [];
  const hx = LIFT.innerX / 2, w = LIFT.wall, dw = LIFT.doorW / 2;
  out.push(mkBox(l.xc - hx - w, l.xc - hx, 0, SHAFT_TOP, LZ_BACK_IN - w, LIFT_FRONT_Z));
  out.push(mkBox(l.xc + hx, l.xc + hx + w, 0, SHAFT_TOP, LZ_BACK_IN - w, LIFT_FRONT_Z));
  out.push(mkBox(l.xc - hx, l.xc + hx, 0, SHAFT_TOP, LZ_BACK_IN - w, LZ_BACK_IN));
  out.push(mkBox(l.xc - hx - w, l.xc - dw, 0, SHAFT_TOP, LZ_FRONT_IN, LIFT_FRONT_Z)); // front wall, left of the door
  out.push(mkBox(l.xc + dw, l.xc + hx + w, 0, SHAFT_TOP, LZ_FRONT_IN, LIFT_FRONT_Z));  // right of the door
  for (let f = 0; f < NF; f++) out.push(mkBox(l.xc - dw, l.xc + dw, levelY(f) + LIFT.doorH, f === NF - 1 ? SHAFT_TOP : levelY(f + 1), LZ_FRONT_IN, LIFT_FRONT_Z)); // lintel over every door
  return out;
}
/** The door blockers of one lift: [level, box]; enabled = the door at that floor is shut. */
export function liftLanding(l: LiftSpec): { level: number; box: Box }[] {
  const dw = LIFT.doorW / 2;
  return Array.from({ length: NF }, (_, f) => ({ level: f, box: mkBox(l.xc - dw, l.xc + dw, levelY(f), levelY(f) + LIFT.doorH, LZ_FRONT_IN, LIFT_FRONT_Z) }));
}
/** The cabin colliders in the cabin's own frame (origin = centre of the cabin floor, y = floor top). `door` = the sliding door (enabled while shut). */
export function cabinParts(): { box: Box; door?: boolean; friction?: number }[] {
  const hx = LIFT.cabX / 2, hz = LIFT.cabZ / 2, H = LIFT.cabH, t = 0.06, dw = LIFT.doorW / 2;
  return [
    { box: mkBox(-hx - 0.05, hx + 0.05, -LIFT.floorT, 0, -hz - 0.06, hz + 0.1), friction: 1 }, // floor (a little proud of the walls)
    { box: mkBox(-hx - t, -hx, 0, H, -hz - t, hz + t) },
    { box: mkBox(hx, hx + t, 0, H, -hz - t, hz + t) },
    { box: mkBox(-hx, hx, 0, H, -hz - t, -hz) },
    { box: mkBox(-hx, -dw, 0, H, hz, hz + t) },
    { box: mkBox(dw, hx, 0, H, hz, hz + t) },
    { box: mkBox(-dw, dw, LIFT.doorH, H, hz, hz + t) },
    { box: mkBox(-hx - t, hx + t, H, H + 0.2, -hz - t, hz + t) },
    { box: mkBox(-dw, dw, 0, LIFT.doorH, hz, hz + t), door: true },
  ];
}
/** The cabin centre (x, z) of a lift in the block's local frame. */
export const cabinXZ = (l: LiftSpec): Pt => [l.xc, LIFT.zc];
/** Is the point (lx, lz, feetY) inside the cabin of lift l standing at height carY? */
export function inCabin(l: LiftSpec, lx: number, lz: number, feetY: number, carY: number): boolean {
  return Math.abs(lx - l.xc) < LIFT.cabX / 2 + 0.1 && Math.abs(lz - LIFT.zc) < LIFT.cabZ / 2 + 0.05 && Math.abs(feetY - carY) < 1.5;
}
/** In the doorway / lobby strip in front of the door at height `y` (the doors must not close on somebody there). */
export function inDoorway(l: LiftSpec, lx: number, lz: number, feetY: number, y: number): boolean {
  return Math.abs(lx - l.xc) < 1.2 && lz > LIFT.zc + LIFT.cabZ / 2 - 0.3 && lz < LIFT_FRONT_Z + 1.6 && Math.abs(feetY - y) < 1.5;
}
/** In the lobby in front of a lift door (the spot where G calls the lift): returns the floor level, or -1. */
export function lobbyLevel(l: LiftSpec, lx: number, lz: number, feetY: number): number {
  if (Math.abs(lx - l.xc) > 5 || lz < LIFT_FRONT_Z || lz > LIFT_FRONT_Z + 6) return -1;
  const lv = levelNear(feetY);
  return Math.abs(feetY - levelY(lv)) < 1.2 ? lv : -1;
}
/** Inside the shaft but NOT in the cabin (nobody should stay there). */
export function inShaft(l: LiftSpec, lx: number, lz: number): boolean {
  return Math.abs(lx - l.xc) < LIFT.innerX / 2 - 0.1 && lz > LZ_BACK_IN + 0.1 && lz < LZ_FRONT_IN - 0.1;
}

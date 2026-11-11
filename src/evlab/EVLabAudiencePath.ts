// EVLab step 5: where each person of the Presentation Hall audience walks (pure data + maths, no three.js, so it can be tested in node).
// A person starts in the lobby at the foot of one of the 3 entrance ramps, walks up the ramp and through the opening, along the rear aisle,
// down a side aisle to the row, sidesteps along the row (in the leg room in front of the seats) and sits down facing the stage (north = -z).
// Building-local metres, same frame as EVLabLayout.
import { DIVIDER, HALL, REAR_Y, RAMP, SEAT_BLOCKS, hallFloorY } from './EVLabLayout';

export interface Seat { x: number; y: number; z: number }
export interface Way { x: number; y: number; z: number }

/** The four aisles of the seating area (x centres): two outer ones between the seat blocks and the side walls, two inner ones between the blocks. */
export const AISLES: readonly number[] = [
  (HALL.x0 + SEAT_BLOCKS[0][0]) / 2,
  (SEAT_BLOCKS[0][1] + SEAT_BLOCKS[1][0]) / 2,
  (SEAT_BLOCKS[1][1] + SEAT_BLOCKS[2][0]) / 2,
  (SEAT_BLOCKS[2][1] + HALL.x1) / 2,
];
/** Distance in front of a seat (towards the stage) where a person stands in the row before sitting down: inside the leg room, clear of the seat colliders. */
export const ROW_LANE = 0.85;
/** A seated body sits this far (m) in front of the seat's z (towards the stage), so the back rest is behind it. */
export const SEAT_SETBACK = 0.05;

export interface Plan {
  /** Waypoints (building-local); first = foot of the ramp in the lobby, last = standing in the row in front of the seat. */
  way: Way[];
  /** Cumulative walked length at each waypoint. */
  cum: number[];
  /** Walking speed (m/s), seconds until this person starts walking, seconds the sitting-down takes. */
  speed: number; delay: number; sitTime: number;
  seat: Seat;
  /** Step 6: the way out = the way in backwards; seconds after the dismissal when this person gets up; seconds the standing up takes. */
  rway: Way[]; rcum: number[]; leaveDelay: number; riseTime: number;
}

/** Which of the 4 aisles a seat is reached from: the nearest one that touches its seat block. */
export function aisleFor(seatX: number): number {
  let b = 0;
  for (let i = 0; i < SEAT_BLOCKS.length; i++) if (seatX >= SEAT_BLOCKS[i][0] && seatX <= SEAT_BLOCKS[i][1]) b = i;
  const a = AISLES[b], c = AISLES[b + 1];
  return Math.abs(seatX - a) <= Math.abs(seatX - c) ? a : c;
}

/** The opening (index into DIVIDER.openings) nearest to a given x. */
export function doorFor(x: number): number {
  let best = 0, bd = Infinity;
  DIVIDER.openings.forEach(([a, b], i) => { const d = Math.abs((a + b) / 2 - x); if (d < bd) { bd = d; best = i; } });
  return best;
}

/** Timing of the arrival: people come in over this many seconds (the first ones at once), so the hall fills up bit by bit. */
export const ARRIVE_SPAN = 16;
/** Step 6: after the mission ends people get up over this many seconds (the first ones at once) and leave through the doors. */
export const LEAVE_SPAN = 12;

export function planPerson(seat: Seat, r: () => number): Plan {
  const aisle = aisleFor(seat.x) + (r() - 0.5) * 1.6;
  const door = DIVIDER.openings[doorFor(aisle)];
  const dx = door[0] + 0.8 + r() * (door[1] - door[0] - 1.6);
  const zl0 = DIVIDER.z + 0.5; // the ramp meets the rear aisle here (same as the lobby ramps)
  const rear = HALL.slopeZ1 + 1.2 + r() * (zl0 - HALL.slopeZ1 - 2.4); // a lane of the rear aisle
  const rowZ = seat.z - ROW_LANE;
  const way: Way[] = [
    { x: dx, y: 0, z: RAMP.z1 },
    { x: dx, y: REAR_Y, z: zl0 },
    { x: dx, y: REAR_Y, z: rear },
    { x: aisle, y: REAR_Y, z: rear },
    { x: aisle, y: REAR_Y, z: HALL.slopeZ1 }, // the raked floor starts here
    { x: aisle, y: hallFloorY(rowZ), z: rowZ },
    { x: seat.x, y: seat.y, z: rowZ },
  ];
  const cum = [0];
  for (let i = 1; i < way.length; i++) cum.push(cum[i - 1] + Math.hypot(way[i].x - way[i - 1].x, way[i].z - way[i - 1].z));
  const total = cum[cum.length - 1];
  return {
    way, cum, seat,
    speed: 1.6 + r() * 0.6, // a purposeful walk: people are hurrying to their seats
    delay: Math.pow(r(), 0.8) * ARRIVE_SPAN,
    sitTime: 1.1 + r() * 0.7,
    rway: way.slice().reverse(), rcum: cum.map((c) => total - c).reverse(),
    leaveDelay: Math.pow(r(), 0.9) * LEAVE_SPAN,
    riseTime: 0.8 + r() * 0.5,
  };
}

export type Phase = 'away' | 'walk' | 'turn' | 'sit' | 'seated';
export interface Sample {
  phase: Phase;
  x: number; y: number; z: number;
  /** Heading (rad): forward = (sin h, cos h) in x / z. The stage is north (-z): h = PI. */
  h: number;
  /** 0..1 while sitting down (0 = standing at the row, 1 = seated). */
  sit: number;
  /** Walking cycle phase (rad), only meaningful while phase = 'walk'. */
  stride: number;
}

const NORTH = Math.PI;
const angDiff = (a: number, b: number): number => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const TURN = 0.45; // seconds to turn to face the stage before sitting down


/** Walk along a waypoint list: `s` metres from the start. Heading follows the leg; corners are smoothed over 1.2 m on both sides. */
function along(way: Way[], cum: number[], s: number, out: Sample): Sample {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const a = way[i - 1], b = way[i], len = cum[i] - cum[i - 1];
  const f = len > 1e-6 ? Math.min(1, Math.max(0, (s - cum[i - 1]) / len)) : 1;
  out.phase = 'walk';
  out.x = a.x + (b.x - a.x) * f; out.y = a.y + (b.y - a.y) * f; out.z = a.z + (b.z - a.z) * f;
  const h0 = Math.atan2(b.x - a.x, b.z - a.z);
  const toEnd = cum[i] - s, fromStart = s - cum[i - 1];
  let h = len > 1e-6 ? h0 : NORTH;
  if (i < way.length - 1 && toEnd < 1.2) {
    const nx = way[i + 1], hn = Math.atan2(nx.x - b.x, nx.z - b.z);
    h = h0 + angDiff(h0, hn) * (1 - toEnd / 1.2) * 0.5;
  } else if (i > 1 && fromStart < 1.2) {
    const pv = way[i - 2], hp = Math.atan2(a.x - pv.x, a.z - pv.z);
    h = hp + angDiff(hp, h0) * (0.5 + 0.5 * (fromStart / 1.2));
  }
  out.h = h; out.sit = 0; out.stride = s * 3.2;
  return out;
}

export function walkTime(p: Plan): number { return p.cum[p.cum.length - 1] / p.speed; }
/** Time (s after the arrival started) when this person is fully seated. */
export function seatedAt(p: Plan): number { return p.delay + walkTime(p) + TURN + p.sitTime; }

export function sample(p: Plan, t: number, out: Sample): Sample {
  const last = p.way[p.way.length - 1];
  const t1 = t - p.delay, tw = walkTime(p);
  if (t1 < 0) { out.phase = 'away'; out.x = p.way[0].x; out.y = 0; out.z = p.way[0].z; out.h = 0; out.sit = 0; out.stride = 0; return out; }
  if (t1 < tw) return along(p.way, p.cum, t1 * p.speed, out);
  const hEnd = p.way.length > 1 ? Math.atan2(last.x - p.way[p.way.length - 2].x, last.z - p.way[p.way.length - 2].z) : NORTH;
  const t2 = t1 - tw;
  out.x = last.x; out.stride = 0;
  if (t2 < TURN) {
    const f = t2 / TURN, e = f * f * (3 - 2 * f);
    out.phase = 'turn'; out.y = last.y; out.z = last.z; out.h = hEnd + angDiff(hEnd, NORTH) * e; out.sit = 0;
    return out;
  }
  const t3 = t2 - TURN;
  out.h = NORTH;
  if (t3 < p.sitTime) {
    const f = t3 / p.sitTime, e = f * f * (3 - 2 * f);
    out.phase = 'sit'; out.sit = e;
    out.z = last.z + (p.seat.z - SEAT_SETBACK - last.z) * e; // moves back onto the seat
    out.y = last.y + (p.seat.y - last.y) * e;
    return out;
  }
  out.phase = 'seated'; out.sit = 1; out.z = p.seat.z - SEAT_SETBACK; out.y = p.seat.y;
  return out;
}

/** Time (s after the dismissal) when this person has left the hall (is back in the lobby, out of sight). */
export function leftAt(p: Plan): number { return p.leaveDelay + p.riseTime + walkTime(p); }

/**
 * Step 6: the way out. `t` = seconds since the dismissal. Seated until `leaveDelay`, then gets up (turns to the row lane while standing up),
 * walks the way in backwards, and is 'away' (gone) at the end.
 */
export function sampleLeave(p: Plan, t: number, out: Sample): Sample {
  const first = p.rway[0], nxt = p.rway[1];
  const t1 = t - p.leaveDelay;
  out.stride = 0;
  if (t1 < 0) { out.phase = 'seated'; out.sit = 1; out.x = p.seat.x; out.y = p.seat.y; out.z = p.seat.z - SEAT_SETBACK; out.h = NORTH; return out; }
  if (t1 < p.riseTime) {
    const f = t1 / p.riseTime, e = f * f * (3 - 2 * f);
    const hOut = Math.atan2(nxt.x - first.x, nxt.z - first.z);
    out.phase = 'sit'; out.sit = 1 - e;
    out.x = first.x; out.z = p.seat.z - SEAT_SETBACK + (first.z - (p.seat.z - SEAT_SETBACK)) * e; out.y = p.seat.y + (first.y - p.seat.y) * e;
    out.h = NORTH + angDiff(NORTH, hOut) * e;
    return out;
  }
  const s = (t1 - p.riseTime) * p.speed, total = p.rcum[p.rcum.length - 1];
  if (s >= total) { out.phase = 'away'; out.x = p.way[0].x; out.y = 0; out.z = p.way[0].z; out.h = 0; out.sit = 0; return out; }
  return along(p.rway, p.rcum, s, out);
}

// ROAD NUMBERS - Step 1: the pure part (no three.js, no DOM), so it can be tested headless (scripts/road-number-test.ts).
//
// OUR STANDARD for a road number marking ("EVCity road number mark"):
//   text     the road code exactly as the road is named in the game: H1, P3, S2, IR1, E4 ... (English letters + digits, one short word)
//   plate    a rounded plate PAINTED on the road, lying flat 100 mm above the asphalt (ROAD_NUMBER_LIFT_M)
//   colour   by road class (same colours as the direction boards): highway green, arterial blue, collector amber, local grey, earth track brown
//   shape    wide as ~80 % of one lane, and stretched ALONG the road (like real painted road text: the driver sees it from a low angle)
//   reading  the text reads upright for the way the camera is looking along the road (it turns round only when the camera turns round)
//   place    ONE label per road: on the road point nearest to the camera, in the middle lane of the carriageway on the camera's side.
//            It slides along the road as the camera moves. Divided roads: never on the median.
//   keep out (Step 3) a plate never touches a junction pad (the road keeps lane offset + half plate width extra away), straddles a sharp corner of the road,
//            lies on the first / last 8 m of a bridge deck, or on a bridge deck that is too narrow for it:
//            the label then waits at the nearest free spot (before or after) and a road with no free spot gets no label.
//   bends    (Step 3) the plate is a strip of 8 rows; every row follows the road (bend, hill, crest), so it lies on the road, not above it.
//            On a very tight bend the plate moves a little towards the inside (it never folds): see stripVertices.
import { isDivided, laneCentre, laneWidth, lanesPerDir } from './RoadSection';

/** The label lies this far above the road surface (m) = 100 mm. */
export const ROAD_NUMBER_LIFT_M = 0.1;
/** A road gets a label while the camera is nearer than this to it (m); it loses it beyond HIDE (a little more: no flicker at the edge). */
export const SHOW_RADIUS_M = 140;
export const HIDE_RADIUS_M = 170;
/** At most this many labels at once (the nearest roads win). */
export const MAX_LABELS = 10;
/** Roads whose surface is more than this above / below the camera get no label (a road under a bridge, a camera high above on a plane). */
export const MAX_HEIGHT_GAP_M = 80;

/** Step 3: how far a plate keeps away from a junction pad (m, beyond the pad outline) and how much of each bridge end stays free (m). */
export const PAD_MARGIN_M = 1.5;
export const BRIDGE_END_M = 8;
/** Rows of the bending plate (the plate is cut in this many strips along the road). */
export const STRIP_ROWS = 8;

/** A stretch of road, as distances along it (m): [from, to]. */
export type Interval = [number, number];
/** What this module needs of a junction pad / a bridge (PadSpec and BridgeSpec have all of it). */
export interface PadLike {
  x: number;
  z: number;
  outline: ArrayLike<number>;
}
export interface BridgeLike {
  roadId: number;
  i0: number;
  i1: number;
  deckHalfWidth: number;
}

export type RoadNumberClass = 'highway' | 'arterial' | 'collector' | 'local' | 'earth';

/** What this module needs of a road (RoadSpec has all of it). */
export interface NumberRoad {
  id: number;
  name: string;
  tier: number;
  kind: string;
  earth?: boolean;
  closed: boolean;
  halfWidth: number;
  medianHalf: number;
  laneW: number;
  shyOuter: number;
  lanes: number;
  xs: ArrayLike<number>;
  zs: ArrayLike<number>;
  ys: ArrayLike<number>;
  nx: ArrayLike<number>;
  nz: ArrayLike<number>;
  cum: ArrayLike<number>;
  length: number;
}

export interface LabelStyle {
  cls: RoadNumberClass;
  /** Plate colour (CSS). The text is always white. */
  color: string;
  /** Plate size (m): across the road (text width) and along the road (text height, stretched). */
  across: number;
  along: number;
}

/** Plate colours of the standard. */
export const CLASS_COLOR: Readonly<Record<RoadNumberClass, string>> = {
  highway: '#0a6a3c',
  arterial: '#0b4f9e',
  collector: '#a85d00',
  local: '#3a4047',
  earth: '#6b4a2b',
};

export function classOf(r: Pick<NumberRoad, 'kind' | 'earth'>): RoadNumberClass {
  if (r.earth) return 'earth';
  if (r.kind === 'highway') return 'highway';
  if (r.kind === 'arterial') return 'arterial';
  if (r.kind === 'collector') return 'collector';
  return 'local';
}

/** Plate size: 80 % of a lane wide (1.8 .. 2.8 m), 1.6 x as long along the road as it is wide (the canvas is 4:3, so the letters are stretched about 2 x along the road). */
export function styleOf(r: NumberRoad): LabelStyle {
  const lw = laneWidth(r);
  const across = Math.min(2.8, Math.max(1.8, lw * 0.8));
  return { cls: classOf(r), color: CLASS_COLOR[classOf(r)], across, along: across * 1.6 };
}

/** The lane the label sits in: the middle lane of one carriageway (3 lanes -> the middle one; 2 -> the inner one; 1 -> the only one). */
export function labelLane(r: NumberRoad): number {
  return Math.min(lanesPerDir(r) - 1, Math.floor(lanesPerDir(r) / 2));
}

/** Distance from the centreline to the centre of the label (m). */
export function labelOffset(r: NumberRoad): number {
  const k = labelLane(r);
  // an undivided 2-lane road has its single lane per direction: lane 0 (laneCentre handles it); a divided road: the middle lane
  return isDivided(r) ? laneCentre(r, k) : laneCentre(r, 0);
}

// ---------------------------------------------------------------------------------------------------------------------------
// where is a road near the camera

export interface RoadIndexEntry {
  road: NumberRoad;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Stretches of this road where no plate may lie (junction pads, bridge ends, narrow bridges), sorted and merged. */
  blocked: Interval[];
  /** false = the whole road is blocked or too short: it never gets a label. */
  labelOk: boolean;
}

/** One bounding box per road, so a frame only looks at the roads that are near; plus the stretches where no plate may lie. */
export function buildRoadIndex(roads: readonly NumberRoad[], pads: readonly PadLike[] = [], bridges: readonly BridgeLike[] = []): RoadIndexEntry[] {
  const out: RoadIndexEntry[] = [];
  const padR = pads.map(padRadius);
  const bridgesOf = new Map<number, BridgeLike[]>();
  for (const b of bridges) {
    const l = bridgesOf.get(b.roadId);
    if (l) l.push(b);
    else bridgesOf.set(b.roadId, [b]);
  }
  for (const road of roads) {
    if (road.xs.length < 2 || !road.name) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < road.xs.length; i++) {
      const x = road.xs[i];
      const z = road.zs[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const blocked = blockedIntervals(road, minX, maxX, minZ, maxZ, pads, padR, bridgesOf.get(road.id) ?? []);
    out.push({ road, minX, maxX, minZ, maxZ, blocked, labelOk: hasFreeSpot(road, blocked) });
  }
  return out;
}

/** Radius of the circle around the pad centre that holds the whole asphalt outline, plus PAD_MARGIN_M. */
export function padRadius(pad: PadLike): number {
  let m = 0;
  for (let k = 0; k + 1 < pad.outline.length; k += 2) m = Math.max(m, Math.hypot(pad.outline[k] - pad.x, pad.outline[k + 1] - pad.z));
  return m + PAD_MARGIN_M;
}

function mergeIntervals(list: Interval[]): Interval[] {
  list.sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  for (const iv of list) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

/**
 * Where on road r no plate may lie: inside a junction pad circle (exact segment / circle cut), a sharp corner of the centreline, the first and last
 * BRIDGE_END_M of a bridge deck, and the whole deck of a bridge that is too narrow for the plate in its lane.
 */
export function blockedIntervals(
  r: NumberRoad, minX: number, maxX: number, minZ: number, maxZ: number, pads: readonly PadLike[], padR: readonly number[], bridges: readonly BridgeLike[],
): Interval[] {
  const list: Interval[] = [];
  for (let p = 0; p < pads.length; p++) {
    const pad = pads[p];
    // the plate lies up to (lane offset + half its width) beside the centreline, so the centreline must keep that much further away from the pad
    const R = padR[p] + labelOffset(r) + styleOf(r).across / 2;
    if (pad.x < minX - R || pad.x > maxX + R || pad.z < minZ - R || pad.z > maxZ + R) continue;
    for (let i = 0; i + 1 < r.xs.length; i++) {
      const ax = r.xs[i] - pad.x;
      const az = r.zs[i] - pad.z;
      const dx = r.xs[i + 1] - r.xs[i];
      const dz = r.zs[i + 1] - r.zs[i];
      const A = dx * dx + dz * dz;
      if (A < 1e-9) continue;
      const B = 2 * (ax * dx + az * dz);
      const C = ax * ax + az * az - R * R;
      const disc = B * B - 4 * A * C;
      if (disc <= 0) continue;
      const q = Math.sqrt(disc);
      const t1 = Math.max(0, (-B - q) / (2 * A));
      const t2 = Math.min(1, (-B + q) / (2 * A));
      if (t1 >= t2) continue;
      const seg = r.cum[i + 1] - r.cum[i];
      list.push([r.cum[i] + seg * t1, r.cum[i] + seg * t2]);
    }
  }
  // a sharp corner of the centreline: on its inside the sideways copy of the road folds over itself, so no plate may straddle it
  const st = styleOf(r);
  const thetaMax = 2 * Math.atan((0.6 * (st.along / STRIP_ROWS)) / (labelOffset(r) + st.across / 2));
  let last = 0; // last point that started a real segment
  for (let i = 1; i + 1 < r.xs.length; i++) {
    const ax = r.xs[i] - r.xs[last];
    const az = r.zs[i] - r.zs[last];
    const bx = r.xs[i + 1] - r.xs[i];
    const bz = r.zs[i + 1] - r.zs[i];
    if (Math.hypot(ax, az) < 0.05) continue;
    if (Math.hypot(bx, bz) < 0.05) continue;
    const turn = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
    if (turn > thetaMax) {
      // the sideways copy of a corner overlaps itself over about (distance to the plate edge) x tan(turn / 2) on both sides of the corner
      const m = Math.min(8, (labelOffset(r) + st.across / 2) * Math.tan(Math.min(turn, 2.6) / 2)) + 0.2;
      list.push([r.cum[i] - m, r.cum[i] + m]);
    }
    last = i;
  }
  const need = labelOffset(r) + styleOf(r).across / 2 + 0.2;
  for (const b of bridges) {
    const a = r.cum[Math.max(0, b.i0)];
    const z = r.cum[Math.min(r.cum.length - 1, b.i1)];
    if (b.deckHalfWidth < need) list.push([a, z]);
    else list.push([a, a + BRIDGE_END_M], [z - BRIDGE_END_M, z]);
  }
  return mergeIntervals(list);
}

/**
 * The nearest allowed centre of a plate to distance s: inside the road (the whole plate on it) and with the whole plate clear of every blocked
 * stretch. NaN when there is none.
 */
export function constrainS(s: number, half: number, length: number, blocked: readonly Interval[]): number {
  const lo = half;
  const hi = length - half;
  if (lo > hi) return NaN;
  const free = (t: number): boolean => {
    if (t < lo - 1e-9 || t > hi + 1e-9) return false;
    for (const iv of blocked) if (t > iv[0] - half + 1e-9 && t < iv[1] + half - 1e-9) return false;
    return true;
  };
  const t0 = Math.max(lo, Math.min(hi, s));
  if (free(t0)) return t0;
  // the nearest free edge of any blocked stretch (or the road ends)
  let best = NaN;
  let bd = Infinity;
  const tryIt = (t: number): void => {
    const d = Math.abs(t - s);
    if (d < bd && free(t)) {
      bd = d;
      best = t;
    }
  };
  tryIt(lo);
  tryIt(hi);
  for (const iv of blocked) {
    tryIt(iv[0] - half);
    tryIt(iv[1] + half);
  }
  return best;
}

/** true if a plate can lie somewhere on the road. */
export function hasFreeSpot(r: NumberRoad, blocked: readonly Interval[]): boolean {
  const half = styleOf(r).along / 2;
  if (Number.isFinite(constrainS(half, half, r.length, blocked))) return true;
  for (const iv of blocked) if (Number.isFinite(constrainS(iv[1] + half, half, r.length, blocked))) return true;
  return false;
}

export interface Nearest {
  /** Segment index (point i .. i + 1), fraction 0..1 along it, distance along the road (m), horizontal distance to the centreline (m). */
  i: number;
  t: number;
  s: number;
  d: number;
}

/** Nearest point of the centreline to (x, z). `hint` = segment index of the last answer: only a window around it is scanned (falls back to a full scan when that is far). */
export function nearestOnRoad(r: NumberRoad, x: number, z: number, hint = -1): Nearest {
  const n = r.xs.length;
  let a = 0;
  let b = n - 2;
  if (hint >= 0) {
    a = Math.max(0, hint - 150);
    b = Math.min(n - 2, hint + 150);
  }
  let best = scan(r, x, z, a, b);
  if (hint >= 0 && best.d > 40) best = scan(r, x, z, 0, n - 2);
  return best;
}

function scan(r: NumberRoad, x: number, z: number, a: number, b: number): Nearest {
  let bi = a;
  let bt = 0;
  let bd2 = Infinity;
  for (let i = a; i <= b; i++) {
    const ax = r.xs[i];
    const az = r.zs[i];
    const dx = r.xs[i + 1] - ax;
    const dz = r.zs[i + 1] - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - x;
    const ez = az + dz * t - z;
    const d2 = ex * ex + ez * ez;
    if (d2 < bd2) {
      bd2 = d2;
      bi = i;
      bt = t;
    }
  }
  return { i: bi, t: bt, s: r.cum[bi] + (r.cum[bi + 1] - r.cum[bi]) * bt, d: Math.sqrt(bd2) };
}

/** Point, height, unit tangent (horizontal) and unit left normal of a road at distance s from its start. */
export function pointAt(r: NumberRoad, s: number): { x: number; y: number; z: number; tx: number; tz: number; nx: number; nz: number; i: number } {
  const sc = Math.max(0, Math.min(r.length, s));
  let lo = 0;
  let hi = r.xs.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (r.cum[mid] <= sc) lo = mid;
    else hi = mid - 1;
  }
  const i = lo;
  const seg = r.cum[i + 1] - r.cum[i];
  const f = seg > 1e-6 ? Math.min(1, Math.max(0, (sc - r.cum[i]) / seg)) : 0;
  let tx = r.xs[i + 1] - r.xs[i];
  let tz = r.zs[i + 1] - r.zs[i];
  const tl = Math.hypot(tx, tz) || 1;
  tx /= tl;
  tz /= tl;
  let nx = r.nx[i] + (r.nx[i + 1] - r.nx[i]) * f;
  let nz = r.nz[i] + (r.nz[i + 1] - r.nz[i]) * f;
  const nl = Math.hypot(nx, nz) || 1;
  nx /= nl;
  nz /= nl;
  return {
    x: r.xs[i] + (r.xs[i + 1] - r.xs[i]) * f,
    y: r.ys[i] + (r.ys[i + 1] - r.ys[i]) * f,
    z: r.zs[i] + (r.zs[i + 1] - r.zs[i]) * f,
    tx,
    tz,
    nx,
    nz,
    i,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// where the label of one road is, now

/** The memory of one label between frames (so it slides, does not jump, and does not flip at every small move of the camera). */
export interface LabelState {
  /** Distance along the road (m) of the label centre; NaN = not placed yet. */
  s: number;
  /** +1 = left side of the centreline (the side of the stored left normal), -1 = right; 0 = not chosen yet. */
  side: number;
  /** +1 = text reads along increasing s, -1 = against it. */
  dir: number;
  /** Last nearest segment (speeds up the search). */
  hint: number;
}

export function newLabelState(): LabelState {
  return { s: NaN, side: 0, dir: 1, hint: -1 };
}

export interface Camera2D {
  x: number;
  y: number;
  z: number;
  /** Horizontal unit direction the camera looks to (0, 0 when it looks straight up or down). */
  fx: number;
  fz: number;
}

export interface LabelPose {
  /** Distance along the road of the plate centre (m). */
  s: number;
  /** Centre of the plate (absolute world coordinates, y already includes the 100 mm lift). */
  x: number;
  y: number;
  z: number;
  /** Unit direction of the text "up" (the reading direction): horizontal part and the slope of the road along it. */
  fx: number;
  fz: number;
  /** Rise per metre along (fx, fz) (road grade). */
  grade: number;
  /** Horizontal distance from the camera to the road centreline (m) and the height of the road above (+) / below (-) the camera. */
  d: number;
  gapY: number;
}

/**
 * Moves the memory one frame on and returns where the plate is. `dt` in seconds. Returns null if the road has no usable geometry.
 * The label follows the nearest FREE road point with a smooth slide (about 0.2 s); it jumps when the target is more than 25 m away (camera teleport,
 * or the camera is in the middle of a junction and the free spot changes to the other side).
 */
export function placeLabel(r: NumberRoad, st: LabelState, cam: Camera2D, dt: number, blocked: readonly Interval[] = []): LabelPose | null {
  if (r.xs.length < 2 || r.length < 1) return null;
  const near = nearestOnRoad(r, cam.x, cam.z, st.hint);
  st.hint = near.i;
  // the nearest spot where the whole plate is on the road and clear of pads / bridge ends, then slide there
  const half = styleOf(r).along / 2;
  const target = constrainS(near.s, half, r.length, blocked);
  if (!Number.isFinite(target)) return null;
  if (!Number.isFinite(st.s) || Math.abs(target - st.s) > 25) st.s = target;
  else st.s += (target - st.s) * Math.min(1, Math.max(0, dt) * 6);
  const s = constrainS(st.s, half, r.length, blocked); // the slide itself must not cross a blocked stretch
  if (!Number.isFinite(s)) return null;
  const p = pointAt(r, s);

  // side of the camera (hysteresis: it changes side only when the camera is clearly on the other side)
  const lat = (cam.x - p.x) * p.nx + (cam.z - p.z) * p.nz;
  if (st.side === 0) st.side = lat >= 0 ? 1 : -1;
  else if (lat * st.side < -3) st.side = -st.side;

  // reading direction (hysteresis: it turns round only when the camera looks clearly against it)
  const dot = cam.fx * p.tx + cam.fz * p.tz;
  if (dot * st.dir < -0.35) st.dir = -st.dir;

  const off = labelOffset(r) * st.side;
  const px = p.x + p.nx * off;
  const pz = p.z + p.nz * off;

  // grade along the road: height 3 m ahead and 3 m behind
  const a = pointAt(r, s - 3);
  const b = pointAt(r, s + 3);
  const grade = (b.y - a.y) / Math.max(0.01, Math.min(r.length, s + 3) - Math.max(0, s - 3));

  return {
    s,
    x: px,
    y: p.y + ROAD_NUMBER_LIFT_M,
    z: pz,
    fx: p.tx * st.dir,
    fz: p.tz * st.dir,
    grade: grade * st.dir,
    d: near.d,
    gapY: p.y - cam.y,
  };
}

/** Floats in a plate's position buffer: 2 vertices (left, right) per row, STRIP_ROWS + 1 rows, 3 numbers each. */
export const STRIP_FLOATS = (STRIP_ROWS + 1) * 2 * 3;

/**
 * The corners of the bending plate (Step 3): row k lies at distance s + dir x (-along/2 + along x k / STRIP_ROWS) and has its own point, tangent and
 * height on the road, so the plate follows bends, hills and crests. Row 0 = bottom of the text, last row = top. Vertex 2k = left of the text, 2k+1 = right.
 * `side` / `dir` as in LabelState. Writes into out (length STRIP_FLOATS), absolute world coordinates, y = road height + ROAD_NUMBER_LIFT_M.
 */
export function stripVertices(r: NumberRoad, s: number, side: number, dir: number, across: number, along: number, out: Float32Array | number[]): void {
  const offAbs = labelOffset(r);
  const w = across / 2;
  for (let k = 0; k <= STRIP_ROWS; k++) {
    const sk = s + dir * (-along / 2 + (along * k) / STRIP_ROWS);
    const p = pointAt(r, sk);
    // how sharply the road curves towards the side of the plate here (1 / radius, 0 when it curves away or is straight). On the inside of a very tight
    // bend the strip would fold, so the plate may only go as far in as 75 % of the radius allows (minus its half width).
    const sa = Math.max(0, sk - 1.5);
    const sb = Math.min(r.length, sk + 1.5);
    let off = offAbs * side;
    if (sb - sa > 0.5) {
      const pa = pointAt(r, sa);
      const pb = pointAt(r, sb);
      const kIn = (side * ((pb.tx - pa.tx) * p.nx + (pb.tz - pa.tz) * p.nz)) / (sb - sa);
      if (kIn > 1e-4) off = Math.min(offAbs, Math.max(0, 0.75 / kIn - w)) * side;
    }
    const cx = p.x + p.nx * off;
    const cz = p.z + p.nz * off;
    const y = p.y + ROAD_NUMBER_LIFT_M;
    // text up f = dir x tangent, text right = f turned 90 degrees clockwise seen from above = (-fz, fx)
    const rx = -dir * p.tz;
    const rz = dir * p.tx;
    const o = k * 6;
    out[o] = cx - rx * w;
    out[o + 1] = y;
    out[o + 2] = cz - rz * w;
    out[o + 3] = cx + rx * w;
    out[o + 4] = y;
    out[o + 5] = cz + rz * w;
  }
}

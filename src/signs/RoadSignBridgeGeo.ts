// ROAD SIGN OVERBRIDGE - STEP 4-3: the GEOMETRY of one overbridge as a list of simple parts (boxes and pipes along X), in the local frame of RoadSignBridgeSpec.ts
// (origin on the road centreline at the road surface height, +X = driver's right, +Z = towards the driver of growing s, +Y up). Pure numbers (no three.js): RoadSignLayer draws the
// parts, SignSolids turns the parts marked `solid` into colliders, scripts/road-sign-bridge-geo-test.ts checks them. The numbers come from BR / stairDesign (RoadSignBridgeSpec.ts).
import { GANTRY } from './RoadSignSpec';
import { BR, deckTop, stairDesign } from './RoadSignBridgeSpec';

/** One part: t 'b' = box (a, b, c = sizes X, Y, Z), t 'px' = round pipe along X (a = radius, b = length). rx / rz = turn about X / Z (rad). vis = drawn, solid = collider. */
export interface Part {
  t: 'b' | 'px';
  cx: number;
  cy: number;
  cz: number;
  a: number;
  b: number;
  c: number;
  rx: number;
  rz: number;
  vis: boolean;
  solid: boolean;
}

export interface BridgeGeoInput {
  /** Lateral distance of the outer pier axes from the centreline (m). */
  edge: number;
  /** Width of each of the two boards (m). */
  boardW: number;
  chordD: number;
  panels: number;
  feetL: number;
  feetR: number;
}

/** Local Z of the board centre planes (+ board A, - board B) and the face offset from a board centre. */
export const BRIDGE_ZB = BR.trussGap / 2 + BR.memberW / 2 + GANTRY.boardDepth / 2 + 0.02;

export function bridgeParts(p: BridgeGeoInput): Part[] {
  const out: Part[] = [];
  const box = (cx: number, cy: number, cz: number, a: number, b: number, c: number, o: { rx?: number; rz?: number; vis?: boolean; solid?: boolean } = {}): void => {
    out.push({ t: 'b', cx, cy, cz, a, b, c, rx: o.rx ?? 0, rz: o.rz ?? 0, vis: o.vis ?? true, solid: o.solid ?? false });
  };
  const pipe = (cx: number, cy: number, cz: number, r: number, len: number): void => {
    out.push({ t: 'px', cx, cy, cz, a: r, b: len, c: 0, rx: 0, rz: 0, vis: true, solid: false });
  };
  const E = p.edge;
  const dT = deckTop();
  const H = BR.trussH;
  const zT = BR.trussGap / 2;
  const endX = E + BR.capX / 2 + 0.1;

  // ---- floor system (the walking surface is its top)
  box(0, BR.clearance + BR.floorDepth / 2, 0, 2 * endX, BR.floorDepth, BR.trussGap + BR.memberW, { solid: true });

  // ---- two Warren trusses: chord pipes, a vertical at every panel node, a diagonal in every panel, over both spans
  const yb = dT + p.chordD / 2, yt = dT + H - p.chordD / 2, hc = yt - yb, ym = (yb + yt) / 2;
  for (const sz of [-1, 1]) {
    const z = sz * zT;
    pipe(0, yb, z, p.chordD / 2, 2 * E);
    pipe(0, yt, z, p.chordD / 2, 2 * E);
    for (const sp of [0, 1]) {
      const x0 = sp === 0 ? -E : 0;
      const dx = E / p.panels;
      for (let i = 0; i <= p.panels; i++) box(x0 + i * dx, ym, z, 0.12, hc, 0.12);
      for (let i = 0; i < p.panels; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        box(x0 + (i + 0.5) * dx, ym, z, Math.hypot(dx, hc), 0.1, 0.1, { rz: Math.atan2(hc * dir, dx) });
      }
    }
  }

  // ---- the two sign boards on the OUTSIDE of the trusses (they are the solid parapet): A on +Z, B on -Z, from the floor up to the top of the truss
  for (const sz of [-1, 1]) box(0, dT + H / 2, sz * BRIDGE_ZB, p.boardW + 0.12, H + 0.12, GANTRY.boardDepth, { solid: true });

  // ---- three hammerhead piers with a concrete safety barrier each
  const capBottom = BR.clearance - BR.bearingH - BR.capDepth;
  for (const x of [-E, 0, E]) {
    const ground = x === 0 ? 0 : x < 0 ? p.feetL : p.feetR;
    const foot = ground - 0.8;
    box(x, (foot + capBottom) / 2, 0, BR.colX, capBottom - foot, BR.colZ, { solid: true });
    box(x, BR.clearance - BR.bearingH - BR.capDepth / 2, 0, BR.capX, BR.capDepth, BR.capZ, { solid: true });
    box(x, ground + 0.35, 0, BR.colX + 2 * (BR.barrierW + BR.barrierGap), BR.barrierH, 8, { solid: true });
  }

  // ---- the two stair towers (left: -X, runs +Z; right: +X, runs -Z); top landing meets the deck end at z = 0
  for (const k of [-1, 1] as const) {
    const feet = k < 0 ? p.feetL : p.feetR;
    const T = stairDesign(dT - feet);
    const F = T.flights.length;
    const d0 = k < 0 ? 1 : -1;
    const x0 = k * endX;
    const nMax = Math.max(...T.flights);
    const R = Math.max(1, nMax - 1) * BR.going;
    const Lg = BR.landing;
    const vTop = F % 2 === 0 ? -Lg / 2 : R + Lg / 2;
    const zOf = (v: number): number => d0 * (v - vTop);
    const xOf = (u: number): number => x0 + k * u;
    const colU = (c: number): number => BR.stairW / 2 + c * (BR.stairW + BR.stairGap);
    const tw = T.towerW;
    let y = feet;
    for (let i = 0; i < F; i++) {
      const n = T.flights[i];
      const c = F >= 2 ? i % 2 : 0;
      const up = i % 2 === 0 ? 1 : -1; // direction of the flight along v
      const g = n > 1 ? R / (n - 1) : R;
      const ux = xOf(colU(c));
      for (let j = 1; j <= n - 1; j++) {
        const vc = up === 1 ? (j - 0.5) * g : R - (j - 0.5) * g;
        const top = y + j * T.riser;
        box(ux, top - 0.025, zOf(vc), BR.stairW, 0.05, g); // tread (drawn)
        box(ux, (y + top) / 2, zOf(vc), BR.stairW, top - y, g, { vis: false, solid: true }); // solid step block (collider only)
      }
      // two stringers and two hand rails along the flight, sloped
      const rise = (n - 1) * T.riser;
      const len = Math.hypot(R, rise);
      const ang = -Math.atan2(rise, R) * (d0 * up); // +Z end goes up when the flight climbs towards +Z
      const vm = R / 2;
      const ym2 = y + T.riser + rise / 2;
      for (const side of [-1, 1]) {
        const xs = xOf(colU(c) + side * (BR.stairW / 2 - 0.05));
        box(xs, ym2 - 0.18, zOf(vm), 0.08, 0.3, len, { rx: ang });
        box(xs, ym2 + 0.95, zOf(vm), 0.05, 0.06, len, { rx: ang });
        box(xs, ym2 + 0.45, zOf(vm), 0.03, 0.9, len, { rx: ang }); // infill panel (one thin plate) under the rail
      }
      y += n * T.riser;
      // landing at the end of the flight: far end (v 0..R+Lg) after an even flight, near end after an odd flight; the top landing is the last one
      const vl = up === 1 ? R + Lg / 2 : -Lg / 2;
      box(xOf(tw / 2), y - 0.1, zOf(vl), tw, 0.2, Lg, { solid: true });
      for (const su of [0.15, tw - 0.15]) for (const sv of [-Lg / 2 + 0.15, Lg / 2 - 0.15]) box(xOf(su), (feet + y - 0.2) / 2, zOf(vl + sv), 0.25, y - 0.2 - feet, 0.25);
    }
  }
  return out;
}

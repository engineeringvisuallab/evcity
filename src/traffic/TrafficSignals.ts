// TRAFFIC SIGNALS (logic only: no three.js, no DOM, so the headless test can run it).
//
// Every engineered junction pad of the road network (src/roads/Junctions.ts) with 3 or more legs gets a signal, except
//   - 'bend' pads (only 2 legs: nothing to control) and
//   - (T-junctions where ALL legs are local streets DO get a signal now: SIGNAL_LOCAL_T = true, so the whole map is covered).
//     Flip SIGNAL_LOCAL_T to false to leave those quiet T-junctions uncontrolled again.
// The legs of a pad are split into PHASE GROUPS: opposite legs (about 180 degrees apart) go green together, a leg with no opposite
// leg (the stem of a T) gets its own phase. One group at a time is green -> yellow -> all red, then the next group. The state is a pure
// function of the clock (`now`, seconds) + a per-junction offset, so every system sees the same light without any message passing.
//
// Used by:
//   - AIDriver        `brakeLimit()`  = the highest speed an AI car may have right now so it can still stop at the stop line of a red / late-yellow light
//   - TrafficLightLayer   draws the poles and the lamps (`light()` per leg)
//   - Engine          `redLightCrossing()` = did the PLAYER'S vehicle cross a stop line on red (-> a Gold fine, see src/economy)
import type { PadSpec } from '../roads/RoadTypes';
import type { RoadGraph } from './RoadGraph';
import { OPEN_PARAMS, deriveOpen } from '../roads/junction/OpenJ1Geometry';
import { MAST_ISLAND_H, MAST_S_IN, mastHeadY, type MastSpec } from './J1MastSpec';

export type Light = 'green' | 'yellow' | 'red';

/** Set true to also put signals on T-junctions that only join local streets. */
export const SIGNAL_LOCAL_T = true;

const YELLOW = 3.2; // s
const ALL_RED = 2.2; // s: clearing time after every yellow
const GREEN_MAJOR = 26; // s: a group that contains an arterial / collector / highway
const GREEN_MINOR = 16; // s: a group made of local streets only
const OPPOSITE_TOL = 0.6; // rad (~34 deg): how far from exactly opposite two legs may be and still share a phase
/** AI braking: comfortable deceleration (m/s^2) used to stop at a red light, and the reaction margin. */
const AI_DECEL = 2.6;
/** How far before a stop line (m) an AI car starts to look at a signal. */
const AI_LOOK = 75;
/** A car whose front is already this far (m) past the stop line is committed: it clears the junction. */
const COMMITTED = 2.5;
/** Give the player this long (s) of yellow-to-red leniency: a car that crosses within it of the red is not booked. */
const RED_GRACE = 0.4;

export interface SignalArm {
  roadId: number;
  /** Unit vector pointing from the junction centre OUT along the leg, and its left normal (-dz, dx). */
  dx: number;
  dz: number;
  lx: number;
  lz: number;
  /** Half width (m) of the asphalt of the leg. */
  hw: number;
  /** Distance (m) from the centre along the leg where a car must stop (front bumper behind this). */
  stopS: number;
  /** Side of the leg axis (+1 / -1 along the left normal) where the INCOMING traffic lane is. */
  side: number;
  /** Phase group of this leg. */
  group: number;
  /** Pole position (world x, z) and ground height there. */
  poleX: number;
  poleZ: number;
  poleY: number;
  /** STEP J1-AI: only traffic whose lateral position (m along the normal (lx, lz) from the leg axis) lies in this band belongs to the leg (J1: the through lanes or the right pockets of one arm). Not given = the whole leg width. */
  latMin?: number;
  latMax?: number;
  /** STEP J1-SIG: the head hangs from a corner mast arm (no own pole is drawn). poleX / poleZ are then the head position under the arm, `headH` the height (m) of the head centre above poleY, `extraHeads` more heads of the same leg on the same arm (same colour). */
  mast?: boolean;
  headH?: number;
  extraHeads?: Array<{ x: number; z: number; h: number }>;
}

export interface SignalPad {
  /** Index in `net.pads`. */
  padId: number;
  pad: PadSpec;
  arms: SignalArm[];
  /** Per group: length of its green (s). */
  green: number[];
  cycle: number;
  /** Time offset (s) so neighbouring junctions are not all in step. */
  offset: number;
  /** STEP J1-SIG: the four corner masts of J1 (only the J1 pad has them). */
  masts?: MastSpec[];
}

export interface RedLightHit {
  padId: number;
  arm: number;
}

const wrapPi = (a: number): number => {
  let t = a % (Math.PI * 2);
  if (t > Math.PI) t -= Math.PI * 2;
  if (t < -Math.PI) t += Math.PI * 2;
  return t;
};

export class TrafficSignals {
  readonly pads: SignalPad[] = [];
  /** The clock (s). The engine sets it every frame; it never has to start at 0. */
  now = 0;
  private lastHit = new Map<number, number>();

  constructor(private graph: RoadGraph) {
    const net = graph.net;
    for (let i = 0; i < net.pads.length; i++) {
      const pad = net.pads[i];
      if (pad.arms.length < 3) continue;
      const allLocal = pad.arms.every((a) => a.kind === 'local');
      if (allLocal && pad.arms.length === 3 && !SIGNAL_LOCAL_T) continue;
      const sp = this.make(i, pad);
      if (sp) this.pads.push(sp);
    }
    const j1 = graph.j1 ? this.makeJ1(net.pads.length) : null; // STEP J1-AI
    if (j1) this.pads.push(j1);
  }

  /**
   * STEP J1-AI: the signal of the ground-level J1 (the star is not a pad of the road network, so it is made here from the J1Link). FOUR phases like the design (OpenJ1Geometry.buildMovements):
   * P1 N + S through lanes, P2 N + S right pockets, P3 E + W through lanes, P4 E + W right pockets. The left slips are free (they merge into the outbound lanes).
   * Eight legs (a pole each). For a J1 leg (lx, lz) is the normal that points to the INBOUND side of the arm axis, so the lateral position of a car is its arm-frame offset o.
   */
  private makeJ1(padId: number): SignalPad | null {
    const j1 = this.graph.j1;
    if (!j1) return null;
    const c = j1.centre;
    const arms: SignalArm[] = [];
    // STEP J1-SIG: ONE mast per arm, on the head of its MEDIAN ISLAND (the user's pointers: the ash-coloured island head, arm frame o = -W = centre of the 3 m island at o -5.15 .. -2.15, s = box half + 0.8).
    // The mast arm runs from there over the inbound side (+o): the 2 pockets and the 4 through lanes; the heads hang from it.
    const D = deriveOpen();
    const W = OPEN_PARAMS.W;
    const sM = D.B + MAST_S_IN;
    const oP = -W; // centre of the median island (-5.15 .. -2.15); o = 0 would be the road (right pockets)
    const pocketO = D.t0 - (OPEN_PARAMS.nPocket * W) / 2; // 1.5: centre of the two pockets
    const farO = D.t0 + 3.5 * W; // 17.92: the farthest head (over lane 4)
    const tipO = farO + 1.0; // the arm ends 1 m beyond it
    const plane = (x: number, z: number): number => c.y + c.a * (x - c.x) + c.b * (z - c.z);
    const masts: MastSpec[] = [];
    for (let k = 0; k < 4; k++) {
      const [px, pz] = j1.armWorld(k, oP, sM);
      const [qx, qz] = j1.armWorld(k, tipO, sM);
      const tl = Math.hypot(qx - px, qz - pz);
      const cl = Math.hypot(c.x - px, c.z - pz);
      masts.push({ arm: k, x: px, z: pz, y: plane(px, pz) + MAST_ISLAND_H, tx: (qx - px) / tl, tz: (qz - pz) / tl, len: tl, lx: (c.x - px) / cl, lz: (c.z - pz) / cl });
    }
    for (const leg of j1.signalLegs()) {
      const k = ['N', 'E', 'S', 'W'].indexOf(leg.dir);
      const [ox, oz] = j1.armWorld(k, 0, 0);
      const [ex, ez] = j1.armWorld(k, 0, 1);
      const [nx, nz] = j1.armWorld(k, 1, 0);
      const stopS = j1.stopS;
      const pocket = leg.latMax <= D.t0 + 1e-6;
      // head positions (arm-frame o): the pocket head over the middle of the two pockets; the through leg two heads, over lane 2 and lane 4 of the four through lanes
      const o1 = pocket ? pocketO : D.t0 + 1.5 * W;
      const o2 = pocket ? null : D.t0 + 3.5 * W;
      const m = masts[k];
      const [hx, hz] = j1.armWorld(k, o1, sM);
      const extra: Array<{ x: number; z: number; h: number }> = [];
      if (o2 !== null) {
        const [ex2, ez2] = j1.armWorld(k, o2, sM);
        extra.push({ x: ex2, z: ez2, h: mastHeadY(o2 - oP, m.len) + MAST_ISLAND_H });
      }
      arms.push({
        roadId: j1.roadOfArm[k],
        dx: ex - ox,
        dz: ez - oz,
        lx: nx - ox,
        lz: nz - oz,
        hw: this.graph.roads[j1.roadOfArm[k]].halfWidth,
        stopS,
        side: 1,
        group: leg.group,
        poleX: hx,
        poleZ: hz,
        poleY: plane(hx, hz),
        latMin: leg.latMin,
        latMax: leg.latMax,
        mast: true,
        headH: mastHeadY(o1 - oP, m.len) + MAST_ISLAND_H,
        extraHeads: extra,
      });
    }
    // phase lengths: the through phases are long, the right-turn phases short (a pocket holds a few cars)
    const green = [24, 9, 24, 9];
    let cycle = 0;
    for (const gr of green) cycle += gr + YELLOW + ALL_RED;
    const pad = { id: padId, x: c.x, z: c.z, y: c.y, a: c.a, b: c.b, rCore: 100, emb: 30, outline: new Float32Array(0), gravel: new Float32Array(0), marks: new Float32Array(0), arms: [], kind: 'multi' } as unknown as PadSpec;
    return { padId, pad, arms, green, cycle, offset: 0, masts };
  }

  /** Is the lateral position `lat` (m along the normal) inside the lane band of leg `a` (J1: its through lanes or its pockets) or, for an ordinary leg, inside its road width? */
  private onLeg(a: SignalArm, lat: number, margin: number): boolean {
    if (a.latMin !== undefined && a.latMax !== undefined) return lat >= a.latMin - margin && lat <= a.latMax + margin;
    return Math.abs(lat) <= a.hw + margin + 1;
  }

  private make(padId: number, pad: PadSpec): SignalPad | null {
    const g = this.graph;
    const n = pad.arms.length;
    // ---- phase groups: opposite legs together ----
    const group = new Array<number>(n).fill(-1);
    let groups = 0;
    for (let i = 0; i < n; i++) {
      if (group[i] >= 0) continue;
      group[i] = groups;
      let best = -1;
      let bestDiff = Infinity;
      for (let j = i + 1; j < n; j++) {
        if (group[j] >= 0) continue;
        const diff = Math.abs(wrapPi(pad.arms[j].theta - pad.arms[i].theta - Math.PI));
        if (diff < bestDiff) {
          bestDiff = diff;
          best = j;
        }
      }
      if (best >= 0 && bestDiff < OPPOSITE_TOL) group[best] = groups;
      groups++;
    }
    // ---- per leg geometry ----
    const arms: SignalArm[] = [];
    const tmp0 = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
    const tmp1 = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
    for (let k = 0; k < n; k++) {
      const a = pad.arms[k];
      const road = g.roads[a.roadId];
      if (!road) return null;
      const dx = Math.cos(a.theta);
      const dz = Math.sin(a.theta);
      const lx = -dz;
      const lz = dx;
      const hw = road.halfWidth;
      // the mouth of the leg: the farthest outline vertex that lies on the leg axis (within the road width)
      let mouth = 0;
      for (let q = 0; q < pad.outline.length; q += 2) {
        const rx = pad.outline[q] - pad.x;
        const rz = pad.outline[q + 1] - pad.z;
        const s = rx * dx + rz * dz;
        const l = rx * lx + rz * lz;
        if (s > 0 && Math.abs(l) <= hw + 0.6 && s > mouth) mouth = s;
      }
      if (mouth < 4) mouth = Math.max(8, pad.rCore * 0.6);
      const stopS = mouth - 3.2;
      // which side of the axis is the INCOMING lane? (ask the road itself: left-hand traffic, lane offset to the left of travel)
      let side = 1;
      const st = g.stations(a.roadId).find((q) => q.pad === padId);
      if (st) {
        g.at(a.roadId, st.s, 1, 0, tmp0);
        // does the road run TOWARD the junction centre in the + direction? (the leg points away from the centre)
        const toward = tmp0.hx * -dx + tmp0.hz * -dz >= 0 ? 1 : -1;
        const sBack = st.s - toward * 24;
        g.at(a.roadId, sBack, toward as 1 | -1, 0, tmp0);
        g.at(a.roadId, sBack, toward as 1 | -1, g.laneOffset(a.roadId), tmp1);
        const dot = (tmp1.x - tmp0.x) * lx + (tmp1.z - tmp0.z) * lz;
        side = dot >= 0 ? 1 : -1;
      }
      const ps = stopS + 0.8;
      const pl = side * (hw + 1.1);
      const poleX = pad.x + dx * ps + lx * pl;
      const poleZ = pad.z + dz * ps + lz * pl;
      const poleY = pad.y + pad.a * (poleX - pad.x) + pad.b * (poleZ - pad.z);
      arms.push({ roadId: a.roadId, dx, dz, lx, lz, hw, stopS, side, group: group[k], poleX, poleZ, poleY });
    }
    // ---- timing ----
    const green: number[] = [];
    for (let gi = 0; gi < groups; gi++) {
      let major = false;
      for (let k = 0; k < n; k++) if (group[k] === gi && pad.arms[k].kind !== 'local') major = true;
      green.push(major ? GREEN_MAJOR : GREEN_MINOR);
    }
    let cycle = 0;
    for (const gr of green) cycle += gr + YELLOW + ALL_RED;
    const offset = (padId * 7.31) % cycle;
    return { padId, pad, arms, green, cycle, offset };
  }

  /** The light that group `group` of junction `sp` shows now. */
  groupLight(sp: SignalPad, group: number, t = this.now): Light {
    let tt = (t + sp.offset) % sp.cycle;
    if (tt < 0) tt += sp.cycle;
    for (let gi = 0; gi < sp.green.length; gi++) {
      const g = sp.green[gi];
      if (gi === group) {
        if (tt < g) return 'green';
        if (tt < g + YELLOW) return 'yellow';
        return 'red';
      }
      tt -= g + YELLOW + ALL_RED;
      if (tt < 0) return 'red'; // another group's phase is running
    }
    return 'red';
  }

  /** The light that leg `k` of junction `sp` shows now. */
  light(sp: SignalPad, k: number, t = this.now): Light {
    return this.groupLight(sp, sp.arms[k].group, t);
  }

  /** Seconds since the leg turned red (0 while it is not red). */
  redFor(sp: SignalPad, k: number): number {
    const group = sp.arms[k].group;
    if (this.groupLight(sp, group) !== 'red') return 0;
    let tt = (this.now + sp.offset) % sp.cycle;
    if (tt < 0) tt += sp.cycle;
    let start = 0;
    for (let gi = 0; gi < group; gi++) start += sp.green[gi] + YELLOW + ALL_RED;
    const redStart = start + sp.green[group] + YELLOW;
    let since = tt - redStart;
    if (since < 0) since += sp.cycle;
    return since;
  }

  /**
   * AI cars: the highest speed (m/s) a car at (px, pz) driving along (fx, fz) may have so it can still stop at the stop line of a red
   * (or late yellow) light ahead. Infinity = no signal restricts it. `frontOff` = distance from the car's centre to its front bumper.
   */
  brakeLimit(px: number, pz: number, fx: number, fz: number, speed: number, frontOff: number): number {
    let limit = Infinity;
    const bx = px + fx * frontOff;
    const bz = pz + fz * frontOff;
    for (const sp of this.pads) {
      const cx = bx - sp.pad.x;
      const cz = bz - sp.pad.z;
      if (cx * cx + cz * cz > (AI_LOOK + 60) * (AI_LOOK + 60)) continue;
      for (let k = 0; k < sp.arms.length; k++) {
        const a = sp.arms[k];
        const s = cx * a.dx + cz * a.dz; // distance of the bumper from the centre, along this leg
        if (s < a.stopS - COMMITTED || s > a.stopS + AI_LOOK) continue;
        if (!this.onLeg(a, cx * a.lx + cz * a.lz, 0.5)) continue; // not on this leg
        if (fx * a.dx + fz * a.dz > -0.5) continue; // not driving toward the junction
        const light = this.groupLight(sp, a.group);
        if (light === 'green') continue;
        const gap = s - a.stopS - 0.4;
        if (light === 'yellow') {
          // too close to stop comfortably: a yellow is run (the car is already committed), otherwise stop
          const need = (speed * speed) / (2 * (AI_DECEL + 0.8)) + speed * 0.3;
          if (gap < need) continue;
        }
        const v = gap <= 0.3 ? 0 : Math.sqrt(2 * AI_DECEL * gap);
        if (v < limit) limit = v;
      }
    }
    return limit;
  }

  /**
   * The PLAYER'S vehicle moved its front bumper from (x0, z0) to (x1, z1) this frame: did it cross a stop line on a red light?
   * Returns the junction + leg (once per junction every 8 s, so one run is one case) or null.
   */
  redLightCrossing(x0: number, z0: number, x1: number, z1: number, speed: number): RedLightHit | null {
    if (speed < 2) return null;
    const mx = x1 - x0;
    const mz = z1 - z0;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-4) return null;
    const ux = mx / ml;
    const uz = mz / ml;
    for (const sp of this.pads) {
      const cx = x1 - sp.pad.x;
      const cz = z1 - sp.pad.z;
      if (cx * cx + cz * cz > 120 * 120) continue;
      for (let k = 0; k < sp.arms.length; k++) {
        const a = sp.arms[k];
        const s0 = (x0 - sp.pad.x) * a.dx + (z0 - sp.pad.z) * a.dz;
        const s1 = (x1 - sp.pad.x) * a.dx + (z1 - sp.pad.z) * a.dz;
        if (!(s0 > a.stopS && s1 <= a.stopS)) continue; // did not cross this leg's stop line inward
        if (!this.onLeg(a, (x1 - sp.pad.x) * a.lx + (z1 - sp.pad.z) * a.lz, 0.5)) continue;
        if (ux * a.dx + uz * a.dz > -0.3) continue; // moving toward the centre
        if (this.groupLight(sp, a.group) !== 'red') continue;
        if (this.redFor(sp, k) < RED_GRACE) continue; // it had just turned red
        const last = this.lastHit.get(sp.padId);
        if (last !== undefined && this.now - last < 8) continue;
        this.lastHit.set(sp.padId, this.now);
        return { padId: sp.padId, arm: k };
      }
    }
    return null;
  }
}

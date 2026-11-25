import { Config } from '../core/Config';
import type { RoadNetwork } from '../roads';
import type { RoadSpec } from '../roads';
import { isDivided, isDual, laneCentre, lanesPerDir, passShift } from '../roads/RoadSection';
import { planMedians } from '../roads/MedianPlan';
import type { UTurnOpening } from '../roads/UTurns';
import { J1Link } from './J1Link';
import { RteLink } from './RteLink';
import { HkLink } from './HkLink';
import { J300Link } from './J300Link';
import { hkFrame, hkRamps } from '../roads/ring/HkRamps';

export interface RoadPoint {
  x: number;
  z: number;
  y: number;
  /** Unit heading of the requested travel direction. */
  hx: number;
  hz: number;
}

const NO_UTURNS: readonly UTurnOpening[] = [];

export interface Station {
  /** Distance along the road (m) of the junction pad centre. */
  s: number;
  pad: number;
}

/**
 * AUTO CONNECT AT GRADE, A-6 step 1 (HANDOFF_ROAD_DESIGN.md 24.15): where a leg road meets an AUTO pad (Config.roads.autoJunction, src/roads/JunctionAuto*.ts).
 * Separate from `Station` on purpose: this list holds EVERY leg of EVERY auto pad (T and roundabout), nothing in the routing reads it. A-6 step 2: the auto T pads
 * (Config.roads.autoJunction.traffic) are ALSO in the normal stations() / arms() lists, with the pad number net.pads.length + autoPad (the old pads keep 0 .. length - 1);
 * roundabouts are not (step 3). Empty with the flag OFF.
 */
export interface AutoStation {
  /** Distance along the road (m) of the point on the road closest to the auto pad centre. */
  s: number;
  /** Index into net.autoPads (padAt(autoPad)). */
  autoPad: number;
  /** Index of the leg inside that pad (padAt(autoPad).legs[leg]). */
  leg: number;
  /** Distance (m) from that road point to the pad centre. */
  dist: number;
}

/**
 * Walking / driving helper on top of the road splines: position at distance s along a road,
 * lane offset (left-hand traffic, as in Bangladesh) and the junction "stations" where a road meets a pad.
 * Pure functions of the (already built) RoadNetwork - no state, no physics.
 */
export class RoadGraph {
  readonly roads: RoadSpec[];
  private stationsByRoad: Station[][];
  private armsByPad: { roadId: number; s: number }[][] = [];
  /** A-6 step 1: auto pad stations per road, sorted by s (read only, not used by the routing yet). */
  private autoStationsByRoad: AutoStation[][];
  private autoArmsByPad: { roadId: number; s: number; leg: number }[][] = [];
  private cumLen: number[] = [];
  /** ROADS STEP 4: the U-turn openings of each divided road, sorted by s. */
  private uturnsByRoad: Map<number, UTurnOpening[]>;
  totalLength = 0;
  /** STEP J1-AI: the AI paths through the open star of the ground-level J1 (null = no J1 / no arm roads). */
  readonly j1: J1Link | null;
  /** STEP J1-AI: where the far end of each J1 arm meets the ring (a T without a pad): arm road, its end s, the ring road and the ring s of the T. */
  readonly tLinks: Array<{ arm: number; sArm: number; ring: number; sRing: number }> = [];
  /** RT-E interchange (ring M8 x arm J1-E): the AI paths of its four movements; null = off / not complete. When set, the old T stand-in of the J1-E arm is removed from tLinks. */
  readonly rte: RteLink | null = null;
  /** HK-11b: the AI paths of the Hatikamrul interchange (ring M8 over the arm J1-S / island link M6-1); null = off / not complete. When set, the T stand-in of the J1-S arm is removed from tLinks. */
  readonly hk: HkLink | null = null;
  /** J10: the AI paths of the 300 ft junction (R6-7 / R4-9 arm ends, roundabout deck, 4 ramps to M8); null = switch OFF / not complete. */
  readonly j300: J300Link | null = null;
  /** H2: junctions WITHOUT a pad: the end of road `a` (s = sA, `endDir` = travel direction towards that end) lies on / beside road `q` (foot point sQ). See Config.roads... aiEndLinks. */
  readonly endLinks: Array<{ a: number; endDir: 1 | -1; sA: number; q: number; sQ: number; gap: number }> = [];
  /** H2: the same links grouped by road + direction towards the end (key = a * 2 + (endDir > 0 ? 1 : 0)). */
  readonly endByRoad = new Map<number, number[]>();
  /** H2: the links whose road q is road r (cars passing the foot point may turn into the ending road). */
  readonly endByTarget = new Map<number, number[]>();
  /** H3: two roads that cross at the same level (both continue): one entry per road, `s` = the crossing on this road, `other` / `sOther` = the crossing road. Key = road id. */
  readonly crossByRoad = new Map<number, Array<{ s: number; other: number; sOther: number }>>();
  crossCount = 0;
  /** Sample spots every ~30 m along every road: lets us find "a road 110-260 m from the player" without scanning splines. */
  private spotX: number[] = [];
  private spotZ: number[] = [];
  private spotRoad: number[] = [];
  private spotS: number[] = [];

  constructor(readonly net: RoadNetwork) {
    this.roads = net.roads;
    const armNames = ['J1-N', 'J1-E', 'J1-S', 'J1-W'];
    const armIds = armNames.map((n) => net.roads.findIndex((r) => r.name === n));
    this.j1 = net.j1 && armIds.every((i) => i >= 0) ? new J1Link(net.j1, armNames, (n) => net.roads.findIndex((r) => r.name === n)) : null;
    this.uturnsByRoad = planMedians(net).uturns.byRoad;
    this.stationsByRoad = this.roads.map(() => []);
    if (this.j1) {
      for (const arm of this.j1.roadOfArm) {
        const a = this.roads[arm];
        const ex = a.xs[a.xs.length - 1];
        const ez = a.zs[a.zs.length - 1];
        let best = -1;
        let bi = 0;
        let bd = 8;
        this.roads.forEach((q, j) => {
          if (j === arm || q.earth || q.kind === 'ramp') return;
          for (let i = 0; i < q.xs.length; i++) {
            const d = Math.hypot(q.xs[i] - ex, q.zs[i] - ez);
            if (d < bd) { bd = d; best = j; bi = i; }
          }
        });
        if (best >= 0) this.tLinks.push({ arm, sArm: a.length, ring: best, sRing: this.roads[best].cum[bi] });
      }
    }
    if (Config.roads.junctionRteTraffic.enabled && Config.roads.junctionRte.enabled && Config.roads.junctionRteLanes.enabled) {
      const l = new RteLink(net.roads);
      if (l.complete) {
        this.rte = l;
        for (let k = this.tLinks.length - 1; k >= 0; k--) if (this.tLinks[k].arm === l.armRoad) this.tLinks.splice(k, 1);
      }
    }
    if (Config.roads.hkTraffic.enabled && Config.roads.hatikamrul.enabled) {
      const fr = hkFrame(net);
      if (fr) {
        const l = new HkLink(net.roads, hkRamps(fr));
        if (l.complete) {
          this.hk = l;
          for (let k = this.tLinks.length - 1; k >= 0; k--) if (this.tLinks[k].arm === l.armRoad) this.tLinks.splice(k, 1);
        }
      }
    }
    if (Config.roads.junctionJ300Traffic.enabled) {
      const l = new J300Link(net.roads);
      if (l.complete) this.j300 = l; // empty while the J300 switch is OFF (buildJ300Moves)
    }
    for (let p = 0; p < net.pads.length; p++) {
      const pad = net.pads[p];
      const seen = new Set<number>();
      const arms: { roadId: number; s: number }[] = [];
      for (const a of pad.arms) {
        if (seen.has(a.roadId)) continue;
        seen.add(a.roadId);
        const r = this.roads[a.roadId];
        if (!r) continue;
        let bi = 0;
        let bd = Infinity;
        for (let i = 0; i < r.xs.length; i++) {
          const d = Math.hypot(r.xs[i] - pad.x, r.zs[i] - pad.z);
          if (d < bd) {
            bd = d;
            bi = i;
          }
        }
        if (bd > 30) continue;
        const s = r.cum[bi];
        this.stationsByRoad[a.roadId].push({ s, pad: p });
        arms.push({ roadId: a.roadId, s });
      }
      this.armsByPad.push(arms);
    }
    this.autoStationsByRoad = this.roads.map(() => []);
    const ap = net.autoPads;
    if (ap) {
      for (let k = 0; k < ap.count; k++) {
        const pad = ap.padAt(k);
        const arms: { roadId: number; s: number; leg: number }[] = [];
        // A-6 step 2: the auto T pads are junctions for the routing, with the pad number net.pads.length + k (roundabouts: an EMPTY arm list, no station, until A-6 step 3)
        const asJunction = Config.roads.autoJunction.traffic && pad.type === 'T';
        const padNo = net.pads.length + k;
        const jSeen = new Set<number>();
        const jArms: { roadId: number; s: number }[] = [];
        pad.legs.forEach((lg, li) => {
          const r = this.roads[lg.roadId];
          if (!r) return;
          let bi = 0;
          let bd = Infinity;
          for (let i = 0; i < r.xs.length; i++) {
            const d = Math.hypot(r.xs[i] - pad.x, r.zs[i] - pad.z);
            if (d < bd) { bd = d; bi = i; }
          }
          if (bd > 40) return; // a leg whose road is not near the pad centre is not linked
          this.autoStationsByRoad[lg.roadId].push({ s: r.cum[bi], autoPad: k, leg: li, dist: bd });
          arms.push({ roadId: lg.roadId, s: r.cum[bi], leg: li });
          if (asJunction && !jSeen.has(lg.roadId)) { jSeen.add(lg.roadId); this.stationsByRoad[lg.roadId].push({ s: r.cum[bi], pad: padNo }); jArms.push({ roadId: lg.roadId, s: r.cum[bi] }); }
        });
        this.autoArmsByPad.push(arms);
        this.armsByPad.push(jArms);
      }
      for (const st of this.autoStationsByRoad) st.sort((a, b) => a.s - b.s);
    }
    for (const st of this.stationsByRoad) st.sort((a, b) => a.s - b.s);
    this.buildEndLinks();
    this.buildCrossLinks();
    let acc = 0;
    for (const r of this.roads) {
      this.cumLen.push(acc);
      if (!r.earth && r.kind !== 'ramp') acc += r.length; // interchange ramps: no random AI spawn until the AI knows ramp links (interchange Step 4)
    }
    this.totalLength = acc;
    const p: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
    for (let i = 0; i < this.roads.length; i++) {
      if (this.roads[i].earth || this.roads[i].kind === 'ramp') continue;
      for (let s = 0; s <= this.roads[i].length; s += 30) {
        this.at(i, s, 1, 0, p);
        this.spotX.push(p.x);
        this.spotZ.push(p.z);
        this.spotRoad.push(i);
        this.spotS.push(s);
      }
    }
  }

  /**
   * H2: every road end that lies on / beside another road and has no junction station within 45 m is a junction for the AI (a T, or a continuation when the foot is the end of the other road).
   * Road ends of the J1 arms are the J1-AI / RT-E business and are left out; so are earth tracks and ramps.
   */
  private buildEndLinks(): void {
    const C = Config.roads.aiEndLinks;
    if (!C.enabled) return;
    const arms = new Set<number>(this.j1 ? this.j1.roadOfArm : []);
    const ok = (r: RoadSpec): boolean => !r.earth && r.kind !== 'ramp';
    const cosMax = Math.cos((C.maxAngleDeg * Math.PI) / 180);
    for (let a = 0; a < this.roads.length; a++) {
      const A = this.roads[a];
      if (!ok(A) || A.closed || arms.has(a) || A.xs.length < 3) continue;
      for (const atEnd of [false, true]) {
        const sA = atEnd ? A.length : 0;
        if (this.stationsByRoad[a].some((q) => Math.abs(q.s - sA) < 45)) continue;
        const ie = atEnd ? A.xs.length - 1 : 0, ii = atEnd ? Math.max(0, ie - 2) : Math.min(A.xs.length - 1, 2);
        const ex = A.xs[ie], ez = A.zs[ie], ey = A.ys[ie];
        let hx = ex - A.xs[ii], hz = ez - A.zs[ii];
        const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
        const endDir: 1 | -1 = atEnd ? 1 : -1;
        for (let q = 0; q < this.roads.length; q++) {
          const Q = this.roads[q];
          if (q === a || !ok(Q) || arms.has(q)) continue;
          let best = Infinity, sQ = 0, yQ = 0;
          for (let k = 0; k + 1 < Q.xs.length; k++) {
            const vx = Q.xs[k + 1] - Q.xs[k], vz = Q.zs[k + 1] - Q.zs[k], l2 = vx * vx + vz * vz || 1;
            const t = Math.max(0, Math.min(1, ((ex - Q.xs[k]) * vx + (ez - Q.zs[k]) * vz) / l2));
            const d = Math.hypot(ex - (Q.xs[k] + t * vx), ez - (Q.zs[k] + t * vz));
            if (d < best) { best = d; sQ = Q.cum[k] + t * Math.sqrt(l2); yQ = Q.ys[k] + (Q.ys[k + 1] - Q.ys[k]) * t; }
          }
          if (best > C.maxGap || Math.abs(yQ - ey) > C.levelDiff) continue;
          if (best > 3) {   // not a plain T: the other road must lie ahead of the end, not behind it
            const px = this.at(q, sQ, 1, 0, { x: 0, z: 0, y: 0, hx: 0, hz: 0 });
            const dx = px.x - ex, dz = px.z - ez, dl = Math.hypot(dx, dz) || 1;
            if ((dx * hx + dz * hz) / dl < cosMax) continue;
          }
          if (this.onBridge(q, sQ) || this.onBridge(a, sA)) continue;
          const id = this.endLinks.length;
          this.endLinks.push({ a, endDir, sA, q, sQ, gap: best });
          const ka = a * 2 + (endDir > 0 ? 1 : 0);
          (this.endByRoad.get(ka) ?? this.endByRoad.set(ka, []).get(ka)!).push(id);
          (this.endByTarget.get(q) ?? this.endByTarget.set(q, []).get(q)!).push(id);
        }
      }
    }
  }

  /**
   * H3: crossings of two roads at the same level in the middle of both (no junction station within 45 m on either road, no end link foot within 45 m, not near an end, no J1 arm, no ramp / earth).
   * Intersections of the two centre lines closer than 40 m along road a are one crossing (divided roads / bends).
   */
  private buildCrossLinks(): void {
    const C = Config.roads.aiCrossLinks;
    if (!C.enabled) return;
    const arms = new Set<number>(this.j1 ? this.j1.roadOfArm : []);
    const ok = (r: RoadSpec): boolean => !r.earth && r.kind !== 'ramp';
    const bb = this.roads.map((r) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (let i = 0; i < r.xs.length; i++) { x0 = Math.min(x0, r.xs[i]); x1 = Math.max(x1, r.xs[i]); z0 = Math.min(z0, r.zs[i]); z1 = Math.max(z1, r.zs[i]); } return [x0, x1, z0, z1]; });
    const blocked = (rid: number, s: number): boolean => {
      const R = this.roads[rid];
      if (s < C.endMargin || s > R.length - C.endMargin) return !R.closed;
      if (this.stationsByRoad[rid].some((q) => Math.abs(q.s - s) < 45)) return true;
      const t = this.endByTarget.get(rid);
      return !!t && t.some((id) => Math.abs(this.endLinks[id].sQ - s) < 45);
    };
    for (let a = 0; a < this.roads.length; a++) {
      const A = this.roads[a];
      if (!ok(A) || arms.has(a)) continue;
      for (let b = a + 1; b < this.roads.length; b++) {
        const B = this.roads[b];
        if (!ok(B) || arms.has(b)) continue;
        if (bb[a][1] < bb[b][0] || bb[b][1] < bb[a][0] || bb[a][3] < bb[b][2] || bb[b][3] < bb[a][2]) continue;
        const found: Array<{ sA: number; sB: number }> = [];
        for (let i = 0; i + 1 < A.xs.length; i++) {
          const ax = A.xs[i], az = A.zs[i], bx = A.xs[i + 1], bz = A.zs[i + 1];
          for (let j = 0; j + 1 < B.xs.length; j++) {
            const cx = B.xs[j], cz = B.zs[j], dx = B.xs[j + 1], dz = B.zs[j + 1];
            if (Math.max(ax, bx) < Math.min(cx, dx) || Math.max(cx, dx) < Math.min(ax, bx) || Math.max(az, bz) < Math.min(cz, dz) || Math.max(cz, dz) < Math.min(az, bz)) continue;
            const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
            if (Math.abs(den) < 1e-9) continue;
            const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
            if (t < 0 || t > 1 || u < 0 || u > 1) continue;
            const yA = A.ys[i] + (A.ys[i + 1] - A.ys[i]) * t, yB = B.ys[j] + (B.ys[j + 1] - B.ys[j]) * u;
            if (Math.abs(yA - yB) > C.levelDiff) continue;
            const sA = A.cum[i] + t * (A.cum[i + 1] - A.cum[i]), sB = B.cum[j] + u * (B.cum[j + 1] - B.cum[j]);
            if (found.some((f) => Math.abs(f.sA - sA) < 40)) continue;
            found.push({ sA, sB });
          }
        }
        for (const f of found) {
          if (blocked(a, f.sA) || blocked(b, f.sB) || this.onBridge(a, f.sA) || this.onBridge(b, f.sB)) continue;
          (this.crossByRoad.get(a) ?? this.crossByRoad.set(a, []).get(a)!).push({ s: f.sA, other: b, sOther: f.sB });
          (this.crossByRoad.get(b) ?? this.crossByRoad.set(b, []).get(b)!).push({ s: f.sB, other: a, sOther: f.sA });
          this.crossCount++;
        }
      }
    }
  }

  /** A random point on some road whose distance from (cx, cz) is between rmin and rmax (null if no road is there). */
  randomSpotInRing(cx: number, cz: number, rmin: number, rmax: number, r: () => number): { roadId: number; s: number } | null {
    let n = 0;
    let pick = -1;
    const a = rmin * rmin;
    const b = rmax * rmax;
    for (let i = 0; i < this.spotX.length; i++) {
      const dx = this.spotX[i] - cx;
      const dz = this.spotZ[i] - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < a || d2 > b) continue;
      n++;
      if (r() * n < 1) pick = i; // reservoir sampling: uniform over the matches
    }
    if (pick < 0) return null;
    const road = this.roads[this.spotRoad[pick]];
    const s = Math.max(0, Math.min(road.length, this.spotS[pick] + (r() - 0.5) * 30));
    return { roadId: this.spotRoad[pick], s };
  }

  stations(roadId: number): Station[] {
    return this.stationsByRoad[roadId];
  }

  /** ROADS STEP 4: the U-turn openings of a road (empty list for undivided roads). */
  uturns(roadId: number): readonly UTurnOpening[] {
    return this.uturnsByRoad.get(roadId) ?? NO_UTURNS;
  }

  arms(pad: number): { roadId: number; s: number }[] {
    return this.armsByPad[pad];
  }

  /** A-6 step 1: the auto pad stations of a road (empty with the flag OFF). Not used by the routing yet. */
  autoStations(roadId: number): readonly AutoStation[] {
    return this.autoStationsByRoad[roadId];
  }

  /** A-6 step 1: the road / s / leg index of every leg of an auto pad (index into net.autoPads). */
  autoArms(autoPad: number): ReadonlyArray<{ roadId: number; s: number; leg: number }> {
    return this.autoArmsByPad[autoPad] ?? [];
  }

  /** Closest sampled road point to a WORLD coordinate, useful for deterministic roadside structures. */
  nearestSpot(x: number, z: number, maxDistance = Infinity): { roadId: number; s: number; distance: number } | null {
    const max2 = maxDistance * maxDistance;
    let best = -1;
    let best2 = max2;
    for (let i = 0; i < this.spotX.length; i++) {
      const dx = this.spotX[i] - x;
      const dz = this.spotZ[i] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best2) { best2 = d2; best = i; }
    }
    if (best < 0) return null;
    return { roadId: this.spotRoad[best], s: this.spotS[best], distance: Math.sqrt(best2) };
  }

  /** Closest cached road sample inside a rectangular map district (used for area-based Tour stops). */
  nearestSpotInBounds(
    x: number,
    z: number,
    bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
    maxDistance = Infinity,
  ): { roadId: number; s: number; distance: number; x: number; z: number; y: number; hx: number; hz: number } | null {
    let bestIndex = -1;
    let bestD2 = maxDistance * maxDistance;
    for (let i = 0; i < this.spotX.length; i++) {
      const px = this.spotX[i];
      const pz = this.spotZ[i];
      if (px < bounds.minX || px >= bounds.maxX || pz < bounds.minZ || pz >= bounds.maxZ) continue;
      const dx = px - x;
      const dz = pz - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; bestIndex = i; }
    }
    if (bestIndex < 0) return null;

    const roadId = this.spotRoad[bestIndex];
    const road = this.roads[roadId];
    let bestS = this.spotS[bestIndex];
    const best: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
    this.at(roadId, bestS, 1, 0, best);
    const p: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
    const start = Math.max(0, bestS - 32);
    const end = Math.min(road.length, bestS + 32);
    for (let ss = start; ss <= end + 0.01; ss += 3) {
      this.at(roadId, ss, 1, 0, p);
      if (p.x < bounds.minX || p.x >= bounds.maxX || p.z < bounds.minZ || p.z >= bounds.maxZ) continue;
      const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestS = ss;
        best.x = p.x; best.z = p.z; best.y = p.y; best.hx = p.hx; best.hz = p.hz;
      }
    }
    if (bestD2 >= maxDistance * maxDistance) return null;
    return { roadId, s: bestS, distance: Math.sqrt(bestD2), ...best };
  }

  /** Random (road, s) with probability proportional to road length. */
  randomSpot(r: () => number): { roadId: number; s: number } {
    let t = r() * this.totalLength;
    for (let i = 0; i < this.roads.length; i++) {
      const len = this.roads[i].earth || this.roads[i].kind === 'ramp' ? 0 : this.roads[i].length;
      if (t < len) return { roadId: i, s: t };
      t -= len;
    }
    const last = this.roads.length - 1;
    return { roadId: last, s: this.roads[last].length * r() };
  }

  /** Index i such that cum[i] <= s < cum[i+1]. */
  private seg(road: RoadSpec, s: number): number {
    const cum = road.cum;
    let lo = 0;
    let hi = cum.length - 2;
    if (hi < 0) return 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** True if (road, s) is on a bridge deck. */
  onBridge(roadId: number, s: number): boolean {
    const r = this.roads[roadId];
    return r.bridgeOf[this.seg(r, s)] >= 0 || r.bridgeOf[Math.min(r.bridgeOf.length - 1, this.seg(r, s) + 1)] >= 0;
  }

  /**
   * Point at distance `s` along road `roadId`, shifted sideways by `lateral` metres to the LEFT of the travel
   * direction `dir` (negative = right). Heading is the travel direction. The surface height comes from the road profile.
   */
  at(roadId: number, s: number, dir: 1 | -1, lateral: number, out: RoadPoint): RoadPoint {
    const r = this.roads[roadId];
    const sc = Math.max(0, Math.min(r.length, s));
    const i = this.seg(r, sc);
    const j = Math.min(r.xs.length - 1, i + 1);
    const span = r.cum[j] - r.cum[i];
    const t = span > 1e-6 ? (sc - r.cum[i]) / span : 0;
    const x = r.xs[i] + (r.xs[j] - r.xs[i]) * t;
    const z = r.zs[i] + (r.zs[j] - r.zs[i]) * t;
    out.y = r.ys[i] + (r.ys[j] - r.ys[i]) * t;
    let tx = r.xs[j] - r.xs[i];
    let tz = r.zs[j] - r.zs[i];
    if (tx * tx + tz * tz < 1e-9 && i > 0) {
      tx = r.xs[i] - r.xs[i - 1];
      tz = r.zs[i] - r.zs[i - 1];
    }
    const l = Math.hypot(tx, tz) || 1;
    out.hx = (tx / l) * dir;
    out.hz = (tz / l) * dir;
    // left of the travel direction (the car faces +Z, its left is +X): (hz, -hx)
    out.x = x + out.hz * lateral;
    out.z = z - out.hx * lateral;
    return out;
  }

  /** Lane centre offset from the road centreline for left-hand traffic (kerb-side lane). */
  laneOffset(roadId: number, lane = 0): number {
    const r = this.roads[roadId];
    return laneCentre(r, Math.max(0, Math.min(lane, lanesPerDir(r) - 1))); // ROADS STEP 1: from the road cross-section (median, lane width); undivided roads keep the old formula
  }

  /** Overtaking data for (road, s): sideways shift into the passing lane and whether that lane carries oncoming traffic (shift 0 = never overtake here). */
  passInfo(roadId: number, s: number): { shift: number; oncoming: boolean } {
    const r = this.roads[roadId];
    if (r.halfWidth < 2.6 || this.onBridge(roadId, s)) return { shift: 0, oncoming: false };
    return { shift: -passShift(r), oncoming: !isDual(r) }; // a divided road (median) never has oncoming cars in the passing lane
  }

  /**
   * OVERTAKING: how many lanes towards the median a car may move out of its kerb lane at (road, s). 0 = never overtake here: a narrow road,
   * a bridge deck, or a road WITHOUT a median (the passing lane would carry oncoming traffic). A divided road with 2 lanes per direction gives 1,
   * a freeway / avenue with 3 gives 2. Built on passInfo (shift + oncoming).
   */
  passLanes(roadId: number, s: number): number {
    const r = this.roads[roadId];
    if (r.earth || !isDivided(r)) return 0;
    const pi = this.passInfo(roadId, s);
    if (pi.shift === 0 || pi.oncoming) return 0;
    return Math.max(0, lanesPerDir(r) - 1);
  }

  /** A big freeway (6 lanes or more): AI traffic drives much faster here, cars in the fast lanes, trucks in the kerb lane (Config.traffic.highway). */
  isBigHighway(roadId: number): boolean {
    const r = this.roads[roadId];
    return r.kind === 'highway' && !r.earth && r.lanes >= Config.traffic.highway.minLanes;
  }

  /** Cruise speed limit (m/s) of a road. */
  limit(roadId: number): number {
    return this.roads[roadId].speedKmh / 3.6;
  }
}

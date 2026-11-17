import { ROAD_STATION_SITES, type RoadStationSite } from '../parking/RoadStationSites';
import { detourPlan, type DetourPlan } from './StationDetour';
import type { RoadPoint } from './RoadGraph';

/** What StationStops needs from the road graph (RoadGraph has all of it; a test can give a small fake). */
export interface StopsGraph {
  roads: ReadonlyArray<{ kind: string; earth?: boolean; length: number }>;
  nearestSpot(x: number, z: number, maxDistance?: number): { roadId: number; s: number; distance: number } | null;
  at(roadId: number, s: number, dir: 1 | -1, lateral: number, out: RoadPoint): RoadPoint;
  laneOffset(roadId: number, lane?: number): number;
  stations(roadId: number): ReadonlyArray<{ s: number; pad: number }>;
}

/** One fuel station / charge point seen from the road: where the detour leaves the kerb lane and where it comes back, for the ONE direction of travel that serves the site. */
export interface StationEntry {
  site: RoadStationSite;
  kind: 'fuel' | 'charge';
  roadId: number;
  dir: 1 | -1;
  /** Distance along the road of the point beside the site centre. */
  s0: number;
  /** Local frame (site): distance of the kerb lane centre from the lot centre (z) and local x of the point s0. */
  zl: number;
  lx0: number;
  plan: DetourPlan;
  /** Road positions (m) where the detour leaves / rejoins the kerb lane. */
  sEntry: number;
  sExit: number;
  /** A charge bay that is long enough for a bus (12 m). */
  bus: boolean;
  /** The driver who has reserved the site (one car at a time), and when. */
  user: unknown;
  since: number;
}

/** The state of one visit, shared by the route (which builds the detour) and the driver (who stops at the pump and fills up). */
export interface VisitState {
  entry: StationEntry;
  /** Seconds the car stands at the pump, the energy it gets per second, seconds stood so far, seconds since the visit began. */
  need: number;
  rate: number;
  dwell: number;
  t: number;
  /** The car has filled up (the pump point lets it go). */
  done: boolean;
  /** The route left the road of the station before the detour was built (a junction): nothing happens. */
  cancelled: boolean;
}

const P: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
/** A reservation is dropped after this many seconds even if the driver never reports back (removed far away, stuck ...). */
const HOLD_MAX = 240;
/** No junction closer than this to the site (the detour spans ~100 m, the junction logic of the route must not meet it). */
const JUNCTION_FREE = 230;

/**
 * Where the AI cars can fuel / charge: the stations of RoadStationSites.ts matched with the highway they stand beside. Only cars driving in the direction whose
 * kerb lane is next to the site can turn in (the other carriageway is across the median). One car at a time may use a site: a reservation is made when the driver
 * decides to go there and given back when he is gone again, so nobody queues up on the freeway - a second car simply drives on.
 */
export class StationStops {
  readonly entries: StationEntry[] = [];
  private clock = 0;

  constructor(private g: StopsGraph, sites: ReadonlyArray<RoadStationSite> = ROAD_STATION_SITES) {
    for (const s of sites) this.add(s);
  }

  private add(site: RoadStationSite): void {
    const g = this.g;
    const near = g.nearestSpot(site.x, site.z, 90);
    if (!near) return;
    const road = g.roads[near.roadId];
    if (road.kind !== 'highway' || road.earth) return;
    // the point of the road centreline beside the site centre
    let s0 = near.s;
    let bd = Infinity;
    for (let s = Math.max(0, near.s - 40); s <= Math.min(road.length, near.s + 40); s += 1) {
      g.at(near.roadId, s, 1, 0, P);
      const d = Math.hypot(P.x - site.x, P.z - site.z);
      if (d < bd) {
        bd = d;
        s0 = s;
      }
    }
    // site frame: local +x = (cos yaw, -sin yaw), local +z (towards the road) = (sin yaw, cos yaw); the traffic that serves the site drives along +x
    const rx = Math.sin(site.yaw);
    const rz = Math.cos(site.yaw);
    g.at(near.roadId, s0, 1, 0, P);
    const dir: 1 | -1 = P.hx * rz - P.hz * rx >= 0 ? 1 : -1;
    g.at(near.roadId, s0, dir, g.laneOffset(near.roadId, 0), P);
    const dx = P.x - site.x;
    const dz = P.z - site.z;
    const lx0 = dx * rz - dz * rx;
    const zl = dx * rx + dz * rz;
    if (zl < site.hd + 3 || zl > 45) return; // the kerb lane is not on the side of the site
    const plan = detourPlan(site.kind, site.hw, zl);
    const sA = s0 + dir * (plan.xStart - lx0);
    const sB = s0 + dir * (plan.xEnd - lx0);
    if (Math.min(sA, sB) < 5 || Math.max(sA, sB) > road.length - 5) return;
    // the road must be straight over the whole detour (the plan is drawn for a straight lane at local z = zl)
    for (let k = 0; k <= 20; k++) {
      g.at(near.roadId, sA + ((sB - sA) * k) / 20, dir, g.laneOffset(near.roadId, 0), P);
      const lz = (P.x - site.x) * rx + (P.z - site.z) * rz;
      if (Math.abs(lz - zl) > 0.6) return;
    }
    for (const st of g.stations(near.roadId)) if (Math.abs(st.s - s0) < JUNCTION_FREE) return;
    this.entries.push({ site, kind: site.kind, roadId: near.roadId, dir, s0, zl, lx0, plan, sEntry: sA, sExit: sB, bus: site.hw >= 6, user: null, since: 0 });
  }

  /**
   * The nearest free station of this kind AHEAD on the road (the detour starts between `minAhead` and `maxAhead` metres in front of `sFront`, in the travel
   * direction `dir`) with no junction in between (the driver could turn off there), or null. `bus` = the vehicle needs a bay of 12 m.
   */
  find(roadId: number, dir: 1 | -1, sFront: number, kind: 'fuel' | 'charge', bus: boolean, minAhead: number, maxAhead: number): StationEntry | null {
    let best: StationEntry | null = null;
    let bestA = Infinity;
    for (const e of this.entries) {
      if (e.roadId !== roadId || e.dir !== dir || e.kind !== kind || e.user !== null) continue;
      if (bus && !e.bus) continue;
      const a = (e.sEntry - sFront) * dir;
      if (a < minAhead || a > maxAhead || a >= bestA) continue;
      let turnOff = false;
      for (const st of this.g.stations(roadId)) {
        const sa = (st.s - sFront) * dir;
        if (sa > -20 && sa < a + 20) turnOff = true;
      }
      if (turnOff) continue;
      best = e;
      bestA = a;
    }
    return best;
  }

  reserve(e: StationEntry, who: unknown): void {
    e.user = who;
    e.since = this.clock;
  }

  /** Give back every site this driver holds. */
  release(who: unknown): void {
    for (const e of this.entries) if (e.user === who) e.user = null;
  }

  /** Every frame: the clock, and reservations nobody gave back. */
  update(dt: number): void {
    this.clock += dt;
    for (const e of this.entries) if (e.user !== null && this.clock - e.since > HOLD_MAX) e.user = null;
  }

  /** A new visit of this car: how long it stands and how fast it fills, from the energy it has now. `fullSeconds` = seconds for an empty -> full refill. */
  visit(e: StationEntry, level: number, fullSeconds: number): VisitState {
    const missing = Math.max(0.02, 1 - level);
    const need = Math.min(fullSeconds, Math.max(3, missing * fullSeconds));
    return { entry: e, need, rate: missing / need, dwell: 0, t: 0, done: false, cancelled: false };
  }
}

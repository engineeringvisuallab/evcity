import { Config } from '../core/Config';
import type { RoadKind } from '../roads/RoadTypes';
import type { SectionId } from '../roads/RoadSection';
import type { UTurnOpening } from '../roads/UTurns';
import { RoadGraph, type RoadPoint } from './RoadGraph';
import type { VisitState } from './StationStops';
import { J1_ROAD_START, type J1Link, type J1Move } from './J1Link';

/** Where a driver may go: the route never uses a road kind / place (city area or world zone) this refuses (see vehicles/VehicleUse). */
export interface RouteRule {
  roadOk(kind: RoadKind): boolean;
  placeOk(x: number, z: number): boolean;
  /** ROADS STEP 4: may this vehicle turn round in a median opening of this road section? (Not given = never.) */
  uturnOk?(section: SectionId): boolean;
  /** Big highways: the most this vehicle cruises at there (m/s) - cargo trucks and tankers are far slower than cars. Not given = the freeway limit of Config.traffic.highway. */
  highwayMax?: number;
  /** Big highways: the freeway limit (m/s) for THIS vehicle instead of Config.traffic.highway.limitKmh (sports cars, race cars). */
  highwayLimit?: number;
}

/** One point of the path an AI driver follows (WORLD coordinates). */
export interface RoutePt {
  x: number;
  z: number;
  y: number;
  /** Speed this point allows (m/s): road limit, bends, dead ends. */
  vmax: number;
  /** Overtaking: sideways shift (m, <0 = right) into the passing lane here; 0 = never overtake at this point. */
  os: number;
  /** The passing lane carries oncoming traffic. */
  oc: boolean;
  /** The point is in / right before a junction (a car must be back in its own lane there). */
  jn: boolean;
  /** OVERTAKING: how many lanes towards the median a car may move out of its kerb lane here (0 = no overtaking: narrow road, bridge, no median, junction). */
  pl?: number;
  /** AI STATION VISIT: the point where the car stands to fill up / charge (the driver stops here until `done`, see AIDriver). */
  pump?: VisitState;
  /** ROADS STEP 4: 1 = the point where a U-turn starts (the driver waits here for a gap in the traffic), 2 = a point of the half circle itself. */
  ut?: 0 | 1 | 2;
  /** U-turn start point only: radius (m) of the half circle, i.e. how far to the right of the lane the car sweeps. */
  ur?: number;
}

/** One planned junction decision: at pad `pad` leave on road `roadId` in direction `dir` (tour cars). */
export interface PlanStep {
  pad: number;
  roadId: number;
  dir: 1 | -1;
}

const STEP = 5;
const TURN_RADIUS_DIST = 12;
const LATERAL_ACCEL = 2.2;
const FAST_LATERAL_ACCEL = 5.5; // tour car: wider, smoother curves and a higher bend speed
const FAST_TURN_DIST = 22;
/** STEP J1-AI: an inbound car on a J1 arm plans its way through the star when it is this close (m along the arm road) to the road start (= 315 m from the J1 centre). */
const J1_ENTER = 140;
/** STEP J1-AI: speed (m/s) in the zone of J1 (design approach speed 60 km/h): the signal must be able to stop the car (AI_LOOK 75 m, 2.6 m/s2). */
const J1_ZONE_V = 16.6;

/**
 * Builds the path in front of a car, a few metres at a time: follow the road in the left lane; when a junction
 * pad is near, choose straight / left / right and join the other road with a smooth curve. No driver ever reverses
 * or turns around: a road that simply ends (no junction) is a dead end and the car stops there.
 */
export class RouteBuilder {
  pts: RoutePt[] = [];
  terminal = false;
  /** Tour cars: junction decisions to follow, the place to stop at, and fast driving (much above the normal limit). */
  plan: PlanStep[] | null = null;
  target: { roadId: number; s: number } | null = null;
  fast = false;
  /** Big highways: which lane to drive in (0 = kerb lane, slow: trucks; 1, 2 = faster cars). On every other road the kerb lane is used. */
  lane = 0;
  /** The route is being built on a big highway (the driver then ignores cars in the lane next to him). */
  onBigHw = false;
  /** AI STATION VISIT: the station the driver has decided to use. When the route reaches its entry the detour (lane -> pump -> lane) is built, see beginVisit. */
  visit: VisitState | null = null;
  /** The lane offset of the last normal point (a car moves from one lane to another gradually, never with a jump of metres between two points). */
  private laneCur: number | null = null;
  private laneRoad = -1;
  private laneDirOf: 1 | -1 = 1;
  private skipPad = -1;
  /** ROADS STEP 4: the last U-turn opening the driver has already decided about (never twice). */
  private skipOp = -1;
  private tmp: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  private tmp2: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  private tmp3: RoadPoint = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  private lastHx = 0;
  private lastHz = 1;

  constructor(
    private g: RoadGraph,
    private rnd: () => number,
    public roadId: number,
    public s: number,
    public dir: 1 | -1,
    /** 0.7 .. 1.0: how fast this driver likes to go compared with the limit. */
    private temper: number,
    /** Optional limits on road kinds / zones (AI traffic). Without it the driver goes anywhere. */
    private rule?: RouteRule,
  ) {}

  /** Seed the route with the lane point we start on. */
  start(): void {
    this.laneCur = this.laneOff(this.roadId);
    this.laneRoad = this.roadId;
    this.laneDirOf = this.dir;
    const p = this.g.at(this.roadId, this.s, this.dir, this.laneCur, this.tmp);
    this.lastHx = p.hx;
    this.lastHz = p.hz;
    this.push(p.x, p.z, p.y, this.cruise());
  }

  private get turnDist(): number {
    return this.fast ? FAST_TURN_DIST : TURN_RADIUS_DIST;
  }

  /** Is the route position within reach of a junction station of the current road? */
  private nearJunction(): boolean {
    const reach = this.turnDist + 16;
    for (const st of this.g.stations(this.roadId)) if (Math.abs(st.s - this.s) < reach) return true;
    return false;
  }

  /** Speed (m/s) this driver cruises at on the road the route is being built on. */
  cruise(): number {
    if (this.fast) return Math.min(Math.max(this.g.limit(this.roadId) * 1.9, 22), 42);
    if (this.g.isBigHighway(this.roadId)) {
      // big highway: its own, much higher limit (cars), or the lower one of a truck / tanker
      const H = Config.traffic.highway;
      return Math.min(this.rule?.highwayLimit ?? H.limitKmh / 3.6, this.rule?.highwayMax ?? Infinity) * this.temper;
    }
    return Math.min(this.g.limit(this.roadId) * 0.85, 22) * this.temper;
  }

  /** AI STATION VISIT: go to this station. The car takes the kerb lane (gradually, over ~80 m) and the detour is built when the route gets to its entry. */
  beginVisit(v: VisitState): void {
    this.visit = v;
    this.lane = 0;
  }

  /** The detour of the visit: the planned path of the station (site frame -> world), ending on the kerb lane again. The route goes on from the exit. */
  private detour(v: VisitState): void {
    const e = v.entry;
    const site = e.site;
    const rx = Math.sin(site.yaw);
    const rz = Math.cos(site.yaw);
    for (const q of e.plan.pts) {
      // site frame -> world: x = cx + lx * cos(yaw) + lz * sin(yaw), z = cz - lx * sin(yaw) + lz * cos(yaw); the pad follows the road (grade along local x)
      this.push(site.x + q.x * rz + q.z * rx, site.z - q.x * rx + q.z * rz, site.y + site.slope * q.x, q.v, true, 2);
      if (q.pump) {
        const last = this.pts[this.pts.length - 1];
        last.vmax = 0;
        last.pump = v;
      }
    }
    this.s = e.sExit;
    const p = this.g.at(this.roadId, this.s, this.dir, this.laneOff(this.roadId), this.tmp);
    this.lastHx = p.hx;
    this.lastHz = p.hz;
    this.visit = null;
    this.laneCur = null;
  }

  /** Lane centre offset of the road: on a big highway the lane this driver prefers, otherwise the kerb lane. */
  private laneOff(roadId: number): number {
    return this.g.laneOffset(roadId, this.g.isBigHighway(roadId) ? this.lane : 0);
  }

  private push(x: number, z: number, y: number, vmax: number, junction = false, ut: 0 | 1 | 2 = 0, ur = 0): void {
    const n = this.pts.length;
    this.onBigHw = this.g.isBigHighway(this.roadId);
    const pi = !junction ? this.g.passInfo(this.roadId, this.s) : { shift: 0, oncoming: false };
    const pl = junction || ut > 0 ? 0 : this.g.passLanes(this.roadId, this.s);
    this.pts.push({ x, z, y, vmax, os: pi.shift, oc: pi.oncoming, jn: junction || (this.fast && this.nearJunction()), pl, ut, ur });
    if (n >= 2) {
      // bend limit for the middle point: v = sqrt(a_lat / curvature)
      const a = this.pts[n - 2];
      const b = this.pts[n - 1];
      const c = this.pts[n];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const bcx = c.x - b.x;
      const bcz = c.z - b.z;
      const cr = Math.abs(abx * bcz - abz * bcx);
      const den = Math.hypot(abx, abz) * Math.hypot(bcx, bcz) * Math.hypot(c.x - a.x, c.z - a.z);
      if (den > 1e-6) {
        const k = (2 * cr) / den;
        if (k > 1e-4) b.vmax = Math.min(b.vmax, Math.max(3.5, Math.sqrt((this.fast ? FAST_LATERAL_ACCEL : LATERAL_ACCEL) / k)));
      }
    }
  }

  /** Extend the route until at least `minLen` metres exist beyond index `from`. */
  fill(from: number, minLen: number): void {
    let guard = 200;
    while (!this.terminal && guard-- > 0) {
      let len = 0;
      for (let i = Math.max(from, 1); i < this.pts.length; i++) len += Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].z - this.pts[i - 1].z);
      if (len >= minLen) return;
      this.step();
    }
  }

  private step(): void {
    const r = this.g.roads[this.roadId];
    // tour: the stopping place is right here -> finish exactly there
    if (this.target && this.roadId === this.target.roadId && (!this.plan || this.plan.length === 0)) {
      const ahead = (this.target.s - this.s) * this.dir;
      if (ahead <= STEP && ahead >= -STEP) {
        const p = this.g.at(this.roadId, this.target.s, this.dir, this.laneOff(this.roadId), this.tmp);
        this.lastHx = p.hx;
        this.lastHz = p.hz;
        this.push(p.x, p.z, p.y, 0);
        this.terminal = true;
        return;
      }
    }
    // AI station visit: the entry of the detour is here -> build it (leaving the road of the station cancels the visit)
    if (this.visit) {
      const v = this.visit;
      const ahead = (v.entry.sEntry - this.s) * this.dir;
      if (this.roadId !== v.entry.roadId || this.dir !== v.entry.dir || ahead < -1) {
        v.cancelled = true;
        this.visit = null;
      } else if (ahead <= STEP) {
        this.detour(v);
        return;
      }
    }
    // STEP J1-AI: the T between the far end of a J1 arm and the ring (no pad there): arm -> ring and ring -> arm
    if (!this.plan && this.tLink()) return;
    // STEP J1-AI: an inbound car on an arm of the ground-level J1 goes through the star (the star is not a road: its paths come from the design movements)
    if (this.dir < 0 && !this.plan && this.g.j1) {
      const k = this.g.j1.armOfRoad(this.roadId);
      if (k >= 0 && this.s <= J1_ENTER && this.enterJ1(this.g.j1, k)) return;
    }
    // a junction ahead within reach?
    for (const st of this.g.stations(this.roadId)) {
      const ahead = (st.s - this.s) * this.dir;
      if (st.pad !== this.skipPad && ahead > 0 && ahead <= this.turnDist) {
        this.junction(st.pad, st.s);
        return;
      }
    }
    if (this.uturnAhead()) return;
    const next = this.s + this.dir * STEP;
    if (next < 0 || next > r.length) {
      // end of the road: finish at the very end, then stop
      const p = this.g.at(this.roadId, this.dir > 0 ? r.length : 0, this.dir, this.laneOff(this.roadId), this.tmp);
      this.push(p.x, p.z, p.y, 0);
      this.terminal = true;
      return;
    }
    this.s = next;
    // the lane offset moves towards the wanted lane by at most 0.45 m per point (5 m): a change of lane (towards the kerb lane of a station) is a gentle drift
    const want = this.laneOff(this.roadId);
    if (this.laneCur === null || this.laneRoad !== this.roadId || this.laneDirOf !== this.dir) this.laneCur = want;
    else this.laneCur += Math.max(-0.45, Math.min(0.45, want - this.laneCur));
    this.laneRoad = this.roadId;
    this.laneDirOf = this.dir;
    const p = this.g.at(this.roadId, this.s, this.dir, this.laneCur, this.tmp);
    this.lastHx = p.hx;
    this.lastHz = p.hz;
    if (this.rule && !this.rule.placeOk(p.x, p.z)) {
      // the road leaves the area this vehicle belongs to: it stops just before the border (and is removed like at any dead end)
      this.pts[this.pts.length - 1].vmax = 0; // the last point that is still inside becomes the stopping point
      this.terminal = true;
      return;
    }
    this.push(p.x, p.z, p.y, this.cruise());
    // a pad we already passed is forgotten once we are well beyond it
    if (this.skipPad >= 0) {
      const st = this.g.stations(this.roadId).find((q) => q.pad === this.skipPad);
      if (!st || Math.abs(st.s - this.s) > this.turnDist + STEP) this.skipPad = -1;
    }
  }

  /**
   * ROADS STEP 4: an opening of the median is coming up. Some drivers (Config.city.uturn.useChance) turn round there: the route runs straight to the start of
   * the half circle (in the kerb lane), then swings right through all lanes and the gap into the kerb lane of the other carriageway and goes on the other way.
   * Only AI traffic (a rule that says the vehicle fits), never a tour car.
   */
  private uturnAhead(): boolean {
    if (this.fast || this.plan || this.target || !this.rule?.uturnOk) return false;
    if (this.g.isBigHighway(this.roadId) && this.lane > 0) return false; // a fast-lane car never turns round in a median opening
    const ops = this.g.uturns(this.roadId);
    if (ops.length === 0) return false;
    const R = this.g.laneOffset(this.roadId);
    for (const op of ops) {
      if (op.id === this.skipOp) continue;
      const sStart = op.s - this.dir * R;
      const ahead = (sStart - this.s) * this.dir;
      if (ahead <= 0 || ahead > STEP) continue; // the stepping crosses each start exactly once
      this.skipOp = op.id;
      if (this.rnd() >= Config.city.uturn.useChance || !this.rule.uturnOk(op.section)) return false;
      this.uturn(op, R, sStart);
      return true;
    }
    return false;
  }

  private uturn(op: UTurnOpening, R: number, sStart: number): void {
    const U = Config.city.uturn;
    const vTurn = Math.min(U.turnSpeed, this.cruise());
    // 1. the start of the half circle, in the kerb lane (the driver waits here until the lanes are free)
    const p = this.g.at(this.roadId, sStart, this.dir, R, this.tmp);
    this.push(p.x, p.z, p.y, vTurn, true, 1, R);
    // 2. the half circle: in the frame of the OLD travel direction the car goes from lateral +R (left) to -R (right) and from sStart forward to the apex
    //    (the middle of the gap, on the centreline) and back to sStart. (along, lateral) = (R sin t, R cos t), t = 0 .. pi.
    const N = 14;
    for (let i = 1; i <= N; i++) {
      const t = (Math.PI * i) / N;
      const q = this.g.at(this.roadId, sStart + this.dir * R * Math.sin(t), this.dir, R * Math.cos(t), this.tmp);
      this.push(q.x, q.z, q.y, vTurn, true, 2);
    }
    // 3. from here on we drive the other way, in the kerb lane of the other carriageway
    this.dir = (this.dir > 0 ? -1 : 1) as 1 | -1;
    this.s = sStart;
    const h = this.g.at(this.roadId, sStart, this.dir, R, this.tmp);
    this.lastHx = h.hx;
    this.lastHz = h.hz;
    void op;
  }

  /** STEP J1-AI: the movement a car on arm k (in its lane `this.lane`) chooses: through in the own lane, left slip from the kerb lane, right pocket. Null = nothing allowed for this vehicle. */
  pickJ1Move(j1: J1Link, k: number): J1Move | null {
    const hw = this.g.isBigHighway(this.roadId);
    const lane = Math.max(0, Math.min(3, hw ? this.lane : 0));
    const opts: Array<{ m: J1Move; w: number }> = [];
    for (const m of j1.moves) {
      if (m.from !== k) continue;
      const toRoad = j1.roadOfArm[m.to];
      if (toRoad < 0 || (this.rule && !this.rule.roadOk(this.g.roads[toRoad].kind))) continue;
      const w = m.kind === 'through' ? (m.lane === lane ? 6 : 0) : m.kind === 'left' ? (lane === 0 ? 3 : 0.4) : lane === 0 ? 0.3 : 0.8;
      if (w > 0) opts.push({ m, w });
    }
    if (opts.length === 0) return null;
    let tot = 0;
    for (const o of opts) tot += o.w;
    let t = this.rnd() * tot;
    for (const o of opts) {
      if (t < o.w) return o.m;
      t -= o.w;
    }
    return opts[0].m;
  }

  /** STEP J1-AI2: where inside the lane zone of arm k (arm-frame s) a car may be PLACED for movement m: between the start of the movement and the arm road start (smallest / largest s). */
  static j1ZoneRange(m: J1Move): [number, number] {
    return [Math.min(m.s0, J1_ROAD_START - 1) + 3 * STEP, J1_ROAD_START - 2 * STEP];
  }

  /**
   * STEP J1-AI2: start the route INSIDE the open star of J1 (lane zone of arm k, arm-frame s = sa), already inbound in the start lane of movement m, then through the star and out on the target arm.
   * WHY: the arms start 315 m from the J1 centre, but AI cars only appear 110-260 m around the player and only live inside the physics radius, so a player standing in the star never saw a car.
   * Call on a fresh builder (no start()); false = not possible for this vehicle (the caller tries again).
   */
  startInJ1(k: number, m: J1Move, sa: number): boolean {
    const j1 = this.g.j1;
    if (!j1 || m.from !== k) return false;
    const [lo, hi] = RouteBuilder.j1ZoneRange(m);
    if (sa < lo || sa > hi) return false;
    this.roadId = j1.roadOfArm[k];
    this.dir = -1;
    this.s = 0;
    return this.enterJ1(j1, k, { m, sa });
  }

  /**
   * STEP J1-AI: plans the whole way through the open star of J1 and returns true (false = no movement allowed for this vehicle: the car just runs to the road start like before).
   * 1. choose a movement (through in the own lane, left slip from the kerb lane, right pocket), 2. approach: the rest of the arm road and the lane zone, drifting smoothly from the
   * own lane to the start lane of the movement, 3. the movement itself (design centre line), 4. the exit lane of the target arm: from here the normal stepping goes on, outward.
   */
  private enterJ1(j1: J1Link, k: number, zone?: { m: J1Move; sa: number }): boolean {
    // zone = the car STARTS inside the lane zone of arm k (arm-frame s = sa) with the movement m already chosen (STEP J1-AI2: spawn inside the star)
    const pick = zone ? zone.m : this.pickJ1Move(j1, k);
    if (!pick) return false;
    if (zone && this.rule && !this.rule.roadOk(this.g.roads[j1.roadOfArm[pick.to]].kind)) return false;
    const road = this.roadId;
    const lat0 = zone ? pick.o0 : this.laneCur !== null && this.laneRoad === road && this.laneDirOf === this.dir ? this.laneCur : this.laneOff(road);
    const sRoad = zone ? 0 : this.s;
    const sZ1 = Math.min(pick.s0, J1_ROAD_START - 1);
    const total = sRoad + (J1_ROAD_START - sZ1);
    const blend = (d: number): number => {
      const u = Math.max(0, Math.min(1, d / total));
      return lat0 + (pick.o0 - lat0) * u * u * (3 - 2 * u);
    };
    const cr = this.cruise();
    // 2a. the rest of the arm road (inbound = direction -1), the lateral offset drifts towards the start lane of the movement
    for (let d = zone ? Infinity : STEP; d < sRoad + STEP; d += STEP) {
      const s = Math.max(0, sRoad - d); // the last point is the road start itself (s = 0, 315 m from the centre)
      this.s = s;
      const p = this.g.at(road, s, -1, blend(d), this.tmp);
      this.lastHx = p.hx;
      this.lastHz = p.hz;
      this.push(p.x, p.z, p.y, Math.min(cr, J1_ZONE_V + Math.max(0, s - 60) * 0.4));
      if (s <= 0) break;
    }
    // 2b. the lane zone, straight along the arm axis (arm frame), down to the first point of the movement
    const dRoad = sRoad;
    for (let sa = zone ? zone.sa : J1_ROAD_START - STEP; sa > sZ1; sa -= STEP) {
      const d = dRoad + (J1_ROAD_START - sa);
      const [x, z] = j1.armWorld(k, blend(d), sa);
      this.pushJ1(x, z, Math.min(cr, J1_ZONE_V));
    }
    // 3. the movement
    const v = Math.min(cr, J1_ZONE_V, pick.v);
    for (let i = 0; i < pick.pts.length; i++) this.pushJ1(pick.pts[i][0], pick.pts[i][1], i === 0 ? Math.min(cr, J1_ZONE_V) : v);
    // 4. the exit: straight outward in the exit lane of the target arm up to its road start, then the normal stepping takes over
    const toRoad = j1.roadOfArm[pick.to];
    const lastO = Math.abs(pick.o1);
    for (let sa = pick.s1 + STEP; sa < J1_ROAD_START; sa += STEP) {
      const [x, z] = j1.armWorld(pick.to, pick.o1, sa);
      this.pushJ1(x, z, Math.min(cr, J1_ZONE_V + 4));
    }
    this.roadId = toRoad;
    this.dir = 1;
    this.s = 0;
    this.skipPad = -1;
    this.laneCur = lastO; // the exit lane offset: the normal stepping continues from here (and drifts to the preferred lane)
    this.laneRoad = toRoad;
    this.laneDirOf = 1;
    if (this.g.isBigHighway(toRoad)) this.lane = pick.exitLane; // keep the lane the movement ended in
    const e = this.g.at(toRoad, 0, 1, lastO, this.tmp);
    this.lastHx = e.hx;
    this.lastHz = e.hz;
    this.push(e.x, e.z, e.y, Math.min(cr, J1_ZONE_V + 6));
    return true;
  }

  /** STEP J1-AI: a route point inside the zone / star of J1 (a junction point: no overtaking, the ground level comes from the finished J1 surface). */
  private skipT = -1;
  /** STEP J1-AI: at the T of a J1 arm on the ring. Outbound arm car: joins the ring (either way). Ring car close to the T: sometimes turns into the arm. Returns true when a curve was built. */
  private tLink(): boolean {
    const links = this.g.tLinks;
    for (let i = 0; i < links.length; i++) {
      const L = links[i];
      if (this.roadId === L.arm && this.dir > 0 && this.skipT !== i && L.sArm - this.s <= this.turnDist) {
        const ring = this.g.roads[L.ring];
        const opts: Array<1 | -1> = [];
        for (const d of [1, -1] as const) {
          const so = L.sRing + d * 30;
          if (so > 5 && so < ring.length - 5) opts.push(d);
        }
        if (opts.length === 0 || (this.rule && !this.rule.roadOk(ring.kind))) return false;
        const d = opts[Math.floor(this.rnd() * opts.length)];
        this.lane = 0;
        this.curveOnto(L.ring, d, L.sRing + d * 30);
        this.skipT = i;
        return true;
      }
      if (this.roadId === L.ring && this.skipT !== i) {
        const ahead = (L.sRing - this.s) * this.dir;
        if (ahead > 0 && ahead <= this.turnDist) {
          this.skipT = i;
          const arm = this.g.roads[L.arm];
          if (this.rnd() < 0.2 && (!this.rule || this.rule.roadOk(arm.kind))) {
            this.lane = 0;
            this.curveOnto(L.arm, -1, L.sArm - 30);
            return true;
          }
          return false;
        }
      }
      if (this.skipT === i && this.roadId !== L.ring && this.roadId !== L.arm) this.skipT = -1;
      else if (this.skipT === i && this.roadId === L.ring && Math.abs(L.sRing - this.s) > 60) this.skipT = -1;
      else if (this.skipT === i && this.roadId === L.arm && L.sArm - this.s > 60) this.skipT = -1;
    }
    return false;
  }

  /** A smooth curve from the last route point to the kerb lane of road `rid` at `sOut`, travelling in direction `dir`; the route goes on from there. */
  private curveOnto(rid: number, dir: 1 | -1, sOut: number): void {
    const last = this.pts[this.pts.length - 1];
    const q = this.g.at(rid, sOut, dir, this.laneOff(rid), this.tmp);
    const p0x = last.x, p0z = last.z, p2x = q.x, p2z = q.z;
    const den = this.lastHx * q.hz - this.lastHz * q.hx;
    let cx = (p0x + p2x) / 2, cz = (p0z + p2z) / 2;
    if (Math.abs(den) > 0.15) {
      const t0 = ((p2x - p0x) * q.hz - (p2z - p0z) * q.hx) / den;
      if (t0 > 0 && t0 < 70) { cx = p0x + this.lastHx * t0; cz = p0z + this.lastHz * t0; }
    }
    const y0 = last.y, y2 = q.y, N = 10, vmax = Math.min(this.cruise(), 12);
    const hx = q.hx, hz = q.hz;
    for (let i = 1; i <= N; i++) {
      const u = i / N, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      this.push(a * p0x + b * cx + c * p2x, a * p0z + b * cz + c * p2z, y0 + (y2 - y0) * u, vmax, true);
    }
    this.lastHx = hx;
    this.lastHz = hz;
    this.roadId = rid;
    this.dir = dir;
    this.s = sOut;
    this.laneCur = null;
  }

  private pushJ1(x: number, z: number, vmax: number): void {
    const j1 = this.g.j1!;
    this.push(x, z, j1.levelAt(x, z), vmax, true);
    const q = this.pts[this.pts.length - 1];
    const prev = this.pts[this.pts.length - 2];
    if (prev) {
      const dx = q.x - prev.x;
      const dz = q.z - prev.z;
      const l = Math.hypot(dx, dz);
      if (l > 1e-6) {
        this.lastHx = dx / l;
        this.lastHz = dz / l;
      }
    }
  }

  private junction(pad: number, sStation: number): void {
    interface Exit {
      roadId: number;
      s: number;
      dir: 1 | -1;
      w: number;
    }
    const exits: Exit[] = [];
    const here = this.tmp2;
    for (const arm of this.g.arms(pad)) {
      const r2 = this.g.roads[arm.roadId];
      if (this.rule && arm.roadId !== this.roadId && !this.rule.roadOk(r2.kind)) continue; // not a road for this vehicle
      for (const d of [1, -1] as const) {
        const remaining = d > 0 ? r2.length - arm.s : arm.s;
        if (remaining < 45) continue;
        const straight = arm.roadId === this.roadId && d === this.dir;
        if (arm.roadId === this.roadId && !straight) continue; // never back where we came from
        const h = this.g.at(arm.roadId, arm.s, d, 0, here);
        if (h.hx * this.lastHx + h.hz * this.lastHz < -0.7) continue; // no U-turns
        if (this.rule) {
          // the junction itself and the place a turn would end up must both be somewhere this vehicle belongs
          if (!this.rule.placeOk(h.x, h.z)) continue;
          const so = Math.min(Math.max(arm.s + d * this.turnDist, 0), r2.length);
          const q = this.g.at(arm.roadId, so, d, 0, this.tmp3);
          if (!this.rule.placeOk(q.x, q.z)) continue; // leads out of its area
        }
        exits.push({ roadId: arm.roadId, s: arm.s, dir: d, w: straight ? 3 : 1 });
      }
    }
    this.skipPad = pad;
    if (exits.length === 0) {
      // nowhere to go: stop at the pad
      this.terminal = true;
      this.push(this.pts[this.pts.length - 1].x + this.lastHx, this.pts[this.pts.length - 1].z + this.lastHz, this.pts[this.pts.length - 1].y, 0);
      return;
    }
    let pick = exits[0];
    // tour: follow the planned decision for this pad if that exit exists, otherwise choose like normal traffic
    const want = this.plan && this.plan.length > 0 && this.plan[0].pad === pad ? this.plan.shift()! : null;
    const planned = want ? exits.find((e) => e.roadId === want.roadId && e.dir === want.dir) : undefined;
    if (planned) pick = planned;
    else {
      let tot = 0;
      for (const e of exits) tot += e.w;
      let t = this.rnd() * tot;
      for (const e of exits) {
        if (t < e.w) {
          pick = e;
          break;
        }
        t -= e.w;
      }
    }
    if (pick.roadId === this.roadId && pick.dir === this.dir) return; // straight on: the normal stepping continues through the pad

    // curve from where we are to the lane of the new road, TURN_RADIUS_DIST past the pad centre
    const last = this.pts[this.pts.length - 1];
    const sOut = pick.s + pick.dir * this.turnDist;
    const q = this.g.at(pick.roadId, sOut, pick.dir, this.laneOff(pick.roadId), this.tmp);
    const p0x = last.x;
    const p0z = last.z;
    const p2x = q.x;
    const p2z = q.z;
    // control point = intersection of the two tangent lines (fallback: midpoint)
    const d0x = this.lastHx;
    const d0z = this.lastHz;
    const d2x = q.hx;
    const d2z = q.hz;
    const den = d0x * d2z - d0z * d2x;
    let cx = (p0x + p2x) / 2;
    let cz = (p0z + p2z) / 2;
    if (Math.abs(den) > 0.15) {
      const t0 = ((p2x - p0x) * d2z - (p2z - p0z) * d2x) / den;
      if (t0 > 0 && t0 < 70) {
        cx = p0x + d0x * t0;
        cz = p0z + d0z * t0;
      }
    }
    const y0 = last.y;
    const y2 = q.y;
    const N = this.fast ? 12 : 8;
    const vmax = Math.min(this.cruise(), this.fast ? 14 : 7);
    for (let i = 1; i <= N; i++) {
      const u = i / N;
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const c = u * u;
      this.push(a * p0x + b * cx + c * p2x, a * p0z + b * cz + c * p2z, y0 + (y2 - y0) * u, vmax, true);
    }
    this.lastHx = d2x;
    this.lastHz = d2z;
    this.roadId = pick.roadId;
    this.dir = pick.dir;
    this.s = sOut;
    void sStation;
  }
}

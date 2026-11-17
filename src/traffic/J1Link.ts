// STEP J1-AI: the AI traffic link of the ground-level J1 (open star). Pure data + math, no three.js.
// WHY: the four arms J1-N / J1-E / J1-S / J1-W are game roads that START 315 m from the J1 centre (the lane zone and the star are NOT roads, they are terrain + mesh),
// so an AI car driving in simply ended at the road start. This class turns the design movements of OpenJ1Geometry.buildMovements (through T1..T4, left slip, right pockets R1 / R2)
// into WORLD paths, and the RouteBuilder (Route.ts) uses them: inbound car on an arm -> approach (lane change inside the zone) -> movement through the star -> outbound lane of the target arm.
// The data is built once (RoadGraph constructor). The four-phase signal of the star is made in TrafficSignals.makeJ1 from the same data.
import type { J1Terrain } from '../roads/junction/GroundJ1Terrain';
import { DIRS, rotCW, type Dir } from '../roads/junction/GroundJ1Geometry';
import { OPEN_PARAMS, buildArm, buildMovements, deriveOpen, type OpenArm } from '../roads/junction/OpenJ1Geometry';

/** Where the arm roads start (m from the J1 centre): the end of the lane zone, J1_S_END of GroundJ1Terrain. */
export const J1_ROAD_START = 315;

export interface J1Move {
  id: string;
  /** Arm index (0 N, 1 E, 2 S, 3 W) the car comes from / goes to. */
  from: number;
  to: number;
  kind: 'left' | 'through' | 'right';
  /** Approach lane the movement belongs to on the arm road (0 = kerb lane .. 3 = inner lane); -1 = any (left uses 0, right uses 3 as the natural lane). */
  lane: number;
  /** Arm-frame (o, s) of the FIRST point (where the approach ends) and of the LAST point (where the exit road takes over). */
  o0: number;
  s0: number;
  o1: number;
  s1: number;
  /** World points (x, z) of the movement, in driving order, and the speed (m/s) it allows. */
  pts: Array<[number, number]>;
  v: number;
  /** Exit lane on the target arm road: 0 = kerb lane .. 3 = inner lane. */
  exitLane: number;
}

export interface J1SignalLeg {
  dir: Dir;
  /** 0: N+S through, 1: N+S pockets, 2: E+W through, 3: E+W pockets. */
  group: number;
  /** Lateral band (m, + = inbound side of the arm axis) that belongs to this leg, and the lateral position of its pole. */
  latMin: number;
  latMax: number;
  poleLat: number;
}

export class J1Link {
  readonly roadOfArm: number[] = [-1, -1, -1, -1];
  readonly arms: OpenArm[];
  readonly moves: J1Move[] = [];
  readonly centre: { x: number; z: number; y: number; a: number; b: number };
  /** Distance (m) of the stop line from the centre. */
  readonly stopS: number;

  constructor(private readonly terrain: J1Terrain, roadNames: string[], findRoad: (name: string) => number) {
    const c = terrain.cfg;
    this.centre = { x: c.x, z: c.z, y: c.y, a: c.a, b: c.b };
    for (let k = 0; k < 4; k++) this.roadOfArm[k] = findRoad(roadNames[k]);
    this.arms = DIRS.map((d) => buildArm(d));
    const D = deriveOpen();
    this.stopS = D.sStop;
    const armRec = Object.fromEntries(DIRS.map((d, k) => [d, this.arms[k]])) as Record<Dir, OpenArm>;
    const flows = Object.fromEntries(DIRS.map((d) => [d, { L: 1, T: 1, R: 1 }])) as Record<Dir, { L: number; T: number; R: number }>;
    for (const m of buildMovements(armRec, flows)) {
      if (m.kind === 'uturn') continue; // AI cars do not U-turn in the star
      const from = DIRS.indexOf(m.from);
      const to = DIRS.indexOf(m.to);
      const a = this.arms[from];
      const n = this.arms[to];
      const pts = m.pts.map((p): [number, number] => terrain.toWorld(p[0], p[1]));
      // arm-frame (o, s) of the first and last point: the arm frame of arm k is the local frame turned k x 90 deg clockwise (rotCW), so turn back (4 - k)
      const first = rotCW(m.pts[0], (4 - from) % 4);
      const last = rotCW(m.pts[m.pts.length - 1], (4 - to) % 4);
      let lane = -1;
      let exitLane = 0;
      if (m.kind === 'through') {
        const i = Number(m.id.slice(m.id.lastIndexOf('T') + 1)); // T1 .. T4 (inner .. kerb)
        lane = 4 - i;
        exitLane = 4 - i;
      } else if (m.kind === 'left') {
        lane = 0;
        exitLane = 0;
      } else {
        const j = Number(m.id.slice(m.id.lastIndexOf('R') + 1)); // R1 / R2: R2 -> O1, R1 -> O2
        lane = 3;
        exitLane = 4 - (3 - j); // O(3-j): O1 = lane 3, O2 = lane 2
      }
      void a;
      void n;
      this.moves.push({ id: m.id, from, to, kind: m.kind as 'left' | 'through' | 'right', lane, o0: first[0], s0: first[1], o1: last[0], s1: last[1], pts, v: Math.min(m.speed, 60) / 3.6, exitLane });
    }
  }

  /** Arm index of a road, or -1 when the road is not one of the four J1 arms. */
  armOfRoad(roadId: number): number {
    return this.roadOfArm.indexOf(roadId);
  }

  /** World (x, z) of the arm-frame point (o, s) of arm k. */
  armWorld(k: number, o: number, s: number): [number, number] {
    const p = rotCW([o, s], k);
    return this.terrain.toWorld(p[0], p[1]);
  }

  /** Finished road level at a world point inside the J1 footprint. */
  levelAt(x: number, z: number): number {
    return this.terrain.levelAt(x, z);
  }

  /** The eight signal legs of the star (a pole each): through lanes and right pockets of the four arms, phases like OpenJ1Geometry.buildMovements (P1 .. P4). */
  signalLegs(): J1SignalLeg[] {
    const P = OPEN_PARAMS;
    const D = deriveOpen();
    const W = P.W;
    const out: J1SignalLeg[] = [];
    for (let k = 0; k < 4; k++) {
      const ns = k % 2 === 0;
      // through lanes: o from the median island edge (t0) to the kerb side of T4
      out.push({ dir: DIRS[k], group: ns ? 0 : 2, latMin: D.t0, latMax: D.t0 + P.nThrough * W, poleLat: D.t0 + P.nThrough * W + 1.0 });
      // pockets: from the far edge of R2 to the island edge; their pole stands on the median island
      out.push({ dir: DIRS[k], group: ns ? 1 : 3, latMin: D.t0 - P.nPocket * W, latMax: D.t0, poleLat: D.t0 - P.nPocket * W / 2 });
    }
    return out;
  }
}

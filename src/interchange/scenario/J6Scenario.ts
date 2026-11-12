// J6 SCENARIO (T01/T02/T04). Deterministic edits applied to the procedural road network AFTER the roads are generated and BEFORE the junction pads.
// Spec: docs/j6/03_SCENARIO_SPEC_BN.md. Data: docs/j6/data/j6-scenario-data.json. Applied by RoadNetwork.applyScenarios() (T01) when Config.roads.scenario.enabled.
// Pure module (no three, no RoadNetwork): the frame maths and the snapping live here so scripts/j6-scenario-test.ts can check them without a world.
// Frame (u,v): origin = interchange centre, u along the main road F6 (screen-up), v across (screen-LEFT / west = +v, east = -v).
// x = cx + u cos(yaw) + v sin(yaw), z = cz + u sin(yaw) - v cos(yaw).

export interface UV {
  u: number;
  v: number;
}

/**
 * Cut one end off a generated road. `keep: 'head'` keeps the points from the road start up to the point nearest to `at` (everything after it is removed),
 * `keep: 'tail'` keeps from the point nearest to `at` to the road end (everything before it is removed). The snapped point stays and becomes the new road end.
 * Snapping is by DISTANCE to the road points, never by index (indices change when the seed / road plan changes).
 */
export interface RoadCut {
  roadId: number;
  /** Safety check: the road name must be this (a different road id after a plan change must never be cut by mistake). */
  name: string;
  keep: 'head' | 'tail';
  at: UV;
  /** The snapped point must be within this distance (m) of `at` (default 25). */
  maxSnap?: number;
  why: string;
}

export interface RoadAddition {
  name: string;
  kind: 'collector' | 'local';
  /** Waypoints in (u,v) from the first to the last. The builder smooths them (Catmull-Rom) and drapes them on the terrain. */
  waypoints: UV[];
  /**
   * FUSE into an existing road instead of making a new one: `at: 'end'` = the polyline starts at the last point of that road and is appended to it (the road keeps its id and name),
   * `at: 'start'` = the polyline ends at the first point of that road and is prepended. One road instead of two end-to-end roads, so the pad generator sees no fake 2-arm junction and no too-short leg.
   */
  join?: { roadName: string; at: 'start' | 'end' };
  /** The FREE end (the one that is not fused / not the start of a new road) can be snapped onto the nearest point of another road (by name; generated, or added earlier in this list). */
  startSnap?: { roadName: string };
  endSnap?: { roadName: string };
  /** PROVISIONAL grade limit (rise/run) for a placeholder alignment that cannot meet the class limit (T04 removes it). */
  maxGrade?: number;
  why: string;
}

export interface ScenarioSpec {
  id: string;
  centre: { x: number; z: number; yaw: number };
  /** After the edits NO junction pad may remain within `radius` m of this (u,v) (the old at-grade pad). Checked, reported in RoadNetwork.scenarios[].issues. */
  clearPads: { at: UV; radius: number; why: string }[];
  cuts: RoadCut[];
  addRoads: RoadAddition[];
}

/** First estimate from the user's sketch (docs/j6/01_USER_INTENT_BN.md). T04 replaces the west-leg waypoints with the alignment chosen by Analysis. */
export const J6_SCENARIO: ScenarioSpec = {
  id: 'J6',
  centre: { x: -1774.0, z: -190.3, yaw: 0.9018 },
  clearPads: [{ at: { u: 68, v: 0 }, radius: 60, why: 'old at-grade pad J6 (S4 / S5 / F6 meet there)' }],
  cuts: [
    { roadId: 24, name: 'S4', keep: 'head', at: { u: -3, v: -45 }, why: 'S4 tail: the bend north to the old pad is removed; S4 ends on its last straight point and J6-S4-ext continues it to the centre' },
    { roadId: 25, name: 'S5', keep: 'tail', at: { u: -198, v: 89 }, why: 'S5 head: the part that runs parallel to F6 from the old pad to the branch join is removed; S5 starts at the join' },
  ],
  addRoads: [
    // east leg of the cross road: S4 itself continues from its new end straight to the centre (the end ON F6 gets a pad until T08 builds the interchange)
    { name: 'J6-S4-ext', kind: 'collector', waypoints: [{ u: -3, v: -45 }, { u: 0, v: -22 }, { u: 0, v: 0 }], join: { roadName: 'S4', at: 'end' }, why: 'S4 straight to the interchange centre (east leg of the cross road)' },
    // west leg: centre -> west -> J57 (on S5). PLACEHOLDER alignment: the straight chord climbs 14.5 % (collector limit 10 %): provisional maxGrade, T04 decides the real alignment.
    { name: 'J6-west', kind: 'collector', waypoints: [{ u: 0, v: 0 }, { u: 0, v: 100 }, { u: -14, v: 250 }, { u: -35, v: 463 }], endSnap: { roadName: 'S5' }, maxGrade: 0.18, why: 'West leg to J57 (USER SKETCH 2026-11-12: straight to J57, no south branch).' },
  ],
};

export const SCENARIOS: Record<string, ScenarioSpec> = { J6: J6_SCENARIO };

export function uvToWorld(c: ScenarioSpec['centre'], p: UV): [number, number] {
  const cy = Math.cos(c.yaw);
  const sy = Math.sin(c.yaw);
  return [c.x + p.u * cy + p.v * sy, c.z + p.u * sy - p.v * cy];
}

export function worldToUV(c: ScenarioSpec['centre'], x: number, z: number): UV {
  const cy = Math.cos(c.yaw);
  const sy = Math.sin(c.yaw);
  return { u: (x - c.x) * cy + (z - c.z) * sy, v: (x - c.x) * sy - (z - c.z) * cy };
}

/** Index of the point (xs[i], zs[i]) nearest to (x, z) and the distance to it. */
export function nearestPoint(xs: ArrayLike<number>, zs: ArrayLike<number>, x: number, z: number): { i: number; d: number } {
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = (xs[i] - x) ** 2 + (zs[i] - z) ** 2;
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  return { i: bi, d: Math.sqrt(best) };
}

/** Which points of a road of `n` points survive a cut: [lo, hi] inclusive. */
export function cutRange(n: number, keep: 'head' | 'tail', snapIndex: number): { lo: number; hi: number } {
  return keep === 'head' ? { lo: 0, hi: snapIndex } : { lo: snapIndex, hi: n - 1 };
}

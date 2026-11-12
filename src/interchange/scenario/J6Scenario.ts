// J6 SCENARIO (T01/T02/T04). Deterministic edits applied to the procedural road network AFTER generation and BEFORE pads.
// Spec: docs/j6/03_SCENARIO_SPEC_BN.md. Data: docs/j6/data/j6-scenario-data.json. NOT wired anywhere yet (stub).
// Frame (u,v): origin = interchange centre, u along the main road F6 (screen-up), v across (screen-LEFT / west = +v). x = cx + u cos(yaw) + v sin(yaw), z = cz + u sin(yaw) - v cos(yaw).

export interface UV {
  u: number;
  v: number;
}
export interface RoadRemoval {
  /** Road id in the generated network (stable for a seed). */
  roadId: number;
  /** Remove the points between two positions (u,v); snap by DISTANCE to the road polyline, never by index. */
  from: UV;
  to: UV;
  why: string;
}
export interface RoadAddition {
  name: string;
  kind: 'collector' | 'local';
  /** Waypoints in (u,v) from the first to the last. The builder smooths them and drapes them on the terrain. */
  waypoints: UV[];
  /** Join to an existing road / pad by snapping the ends. */
  startSnap?: { roadId?: number; padId?: number };
  endSnap?: { roadId?: number; padId?: number };
  why: string;
}
export interface ScenarioSpec {
  id: string;
  enabled: boolean;
  centre: { x: number; z: number; yaw: number };
  removePads: number[];
  removeRoadParts: RoadRemoval[];
  addRoads: RoadAddition[];
}

/** First estimate from the user's sketch (docs/j6/01_USER_INTENT_BN.md). T04 replaces the west-leg waypoints with the alignment chosen by Analysis. */
export const J6_SCENARIO: ScenarioSpec = {
  id: 'J6',
  enabled: false,
  centre: { x: -1774.0, z: -190.3, yaw: 0.9018 },
  removePads: [6],
  removeRoadParts: [
    { roadId: 24, from: { u: 3, v: -45 }, to: { u: 68, v: 0 }, why: 'S4 tail: bend north to the old pad' },
    { roadId: 25, from: { u: 68, v: 0 }, to: { u: -198, v: 102 }, why: 'S5 head: runs parallel to F6 from the old pad to the branch join' },
  ],
  addRoads: [
    { name: 'J6-S4-ext', kind: 'collector', waypoints: [{ u: 0, v: -45 }, { u: 0, v: 0 }], why: 'S4 straight to the interchange centre (east leg of the cross road)' },
    { name: 'J6-west', kind: 'collector', waypoints: [{ u: 0, v: 0 }, { u: 0, v: 100 }, { u: -14, v: 250 }, { u: -35, v: 463 }], endSnap: { padId: 57 }, why: 'West leg to J57 (PLACEHOLDER alignment, T04 decides). T junction >= 250 m.' },
    { name: 'J6-south-branch', kind: 'collector', waypoints: [{ u: -14, v: 250 }, { u: -120, v: 180 }, { u: -198, v: 102 }], endSnap: { roadId: 25 }, why: 'South branch from the T to S5 (PLACEHOLDER)' },
  ],
};

/** T01: apply the edits to a generated network. Must be a no-op when `spec.enabled` is false. */
export function applyScenario(_net: unknown, _spec: ScenarioSpec): void {
  throw new Error('T01 not implemented: see docs/j6/04_TASKS_BN.md');
}

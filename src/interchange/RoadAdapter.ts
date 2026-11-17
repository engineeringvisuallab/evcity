// INTERCHANGE FOUNDATION: Ramp -> RoadSpec, so a ramp can go through the SAME ribbon mesh / terrain cut / road physics as every other road (no second road renderer).
// This file imports the real RoadSpec TYPE: if roads/RoadTypes.ts changes, `npm run typecheck` fails here instead of at runtime.
//
// What the wiring step must still do (docs/INTERCHANGE_SYSTEM_BN.md, "Wiring"):
//  - RoadKind 'ramp' exists now (Step 2a: RoadTypes, StreetLights, Junctions, VehicleUse); RoadNetwork.KIND has no 'ramp' row yet because no network road is a ramp until Step 2b.
//  - one-way: RoadSpec has no oneWay flag. RoadGraph must treat a ramp as dir = +1 only (see Link.kind / Ramp.oneWay).
//  - bridgeOf: filled with -1; the stretches in Ramp.elevated become bridge decks (BridgeSpec 'over road') in the wiring step.

import type { RoadSpec } from '../roads/RoadTypes';
import type { Ramp } from './InterchangeTypes';

export function rampToRoadSpec(r: Ramp, id: number, name: string, step = 8): RoadSpec {
  const n = r.xs.length;
  const xs = Float64Array.from(r.xs);
  const zs = Float64Array.from(r.zs);
  const ys = Float64Array.from(r.ys);
  const cum = Float64Array.from(r.cum);
  const nx = new Float32Array(n);
  const nz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const tx = xs[b] - xs[a];
    const tz = zs[b] - zs[a];
    const l = Math.hypot(tx, tz) || 1;
    nx[i] = tz / l; // left normal, as in RoadNetwork
    nz[i] = -tx / l;
  }
  return {
    id,
    tier: 3,
    kind: 'ramp',
    name,
    closed: false,
    step,
    halfWidth: r.halfWidth,
    medianHalf: 0,
    laneW: r.halfWidth * 2 - 1,
    shyOuter: 0.5,
    planHalfWidth: r.halfWidth,
    shoulder: 1.2,
    lanes: 1,
    speedKmh: r.designKmh,
    maxGrade: 0.05,
    xs,
    zs,
    ys,
    hNat: Float32Array.from(r.ys, () => r.ys[0]),
    nx,
    nz,
    cum,
    length: r.length,
    bridgeOf: new Int16Array(n).fill(-1),
  };
}

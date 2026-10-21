// STAGE B: where the airport stands in the world, plus the level pad it needs.
// Pure numbers + one height function (no three.js / DOM), so the terrain generator and its worker can use it safely.
// Only the land the airport really needs is levelled: the module's own pad (runway, taxiway, apron, terminal, hangars, fence) + a soft skirt.
import { createAirportPlan, worldToLocal, type AirportPlan } from './AirportPlan';

/** Runway centre, heading 0 = runway runs west-east, terminal + parking on the SOUTH side (towards the railway station). */
export const AIRPORT_POS = { cx: 2500, cz: -4000, heading: 0, seed: 1 };
/** The soft skirt (m) between the level pad and the natural ground. */
const BLEND = 60;
/** The pad is sunk a little so the pavement (0.04+ m above the floor) never floats above the ground. */
export const AIRPORT_PAD_SINK = 0.03;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export class AirportSite {
  /** The layout (groundY is 0 here: the model is lifted to `floorY` when it is placed). */
  readonly plan: AirportPlan = createAirportPlan({ cx: AIRPORT_POS.cx, cz: AIRPORT_POS.cz, heading: AIRPORT_POS.heading, groundY: 0, seed: AIRPORT_POS.seed });
  /** Floor height (m): the MEDIAN natural ground over the pad. Set once by the TerrainGenerator. */
  floorY = 0;

  /** World rectangle of the pad (heading 0, so it is axis-aligned). */
  get rect(): { x0: number; x1: number; z0: number; z1: number } {
    const p = this.plan;
    const cx = p.site.cx + p.pad.cx, cz = p.site.cz + p.pad.cz;
    return { x0: cx - p.pad.w / 2, x1: cx + p.pad.w / 2, z0: cz - p.pad.d / 2, z1: cz + p.pad.d / 2 };
  }

  /** Distance outside the pad rectangle (0 inside). */
  private outside(x: number, z: number): number {
    const l = worldToLocal(this.plan.site, x, z);
    const dx = Math.max(0, Math.abs(l.x - this.plan.pad.cx) - this.plan.pad.w / 2);
    const dz = Math.max(0, Math.abs(l.z - this.plan.pad.cz) - this.plan.pad.d / 2);
    return Math.hypot(dx, dz);
  }

  /** True on the pad (+ margin): no trees, rocks or grass here. */
  contains(x: number, z: number, margin = 0): boolean {
    return this.outside(x, z) <= BLEND * 0.5 + margin;
  }

  /** Cheap pre-check: on the pad or its skirt? */
  near(x: number, z: number): boolean {
    return this.outside(x, z) < BLEND;
  }

  /** Level the ground: new height for ground height `h` at (x, z). `k` (0..1) weakens the pad where a road is. */
  height(x: number, z: number, h: number, k = 1): number {
    const d = this.outside(x, z);
    if (d >= BLEND) return h;
    const t = (1 - smoothstep(0, BLEND, d)) * k;
    return h + (this.floorY - AIRPORT_PAD_SINK - h) * t;
  }
}

/** Local streets (LocalRoads) may not be planned on the airport (+ 30 m all round). Main roads are never touched. */
export function airportKeepout(x: number, z: number): boolean {
  const l = worldToLocal(createdPlan().site, x, z);
  const p = createdPlan().pad;
  return Math.abs(l.x - p.cx) <= p.w / 2 + 30 && Math.abs(l.z - p.cz) <= p.d / 2 + 30;
}

let cached: AirportPlan | null = null;
function createdPlan(): AirportPlan {
  return (cached ??= createAirportPlan({ cx: AIRPORT_POS.cx, cz: AIRPORT_POS.cz, heading: AIRPORT_POS.heading, groundY: 0, seed: AIRPORT_POS.seed }));
}

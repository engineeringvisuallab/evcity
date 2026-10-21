// Parking lots across the F4 road from the City Mall's west door, plus the start point + the parked fleet slots.
// Pure numbers and a few functions (no three.js / DOM): the terrain's vegetation code and the engine both use it.
//
// Lot frame: origin P0 on the F4 centre line, `s` runs along F4 away from the crossing, `n` is the distance from the F4 centre line
// towards the SOUTH-WEST side (away from the mall), so a lot at n 13..40 starts 13 m from the F4 centre line (kerb + 3.8 m).

const UX = 0.33303786, UZ = -0.94291345; // along F4
const NX = -0.94291345, NZ = -0.33303786; // away from the mall, across F4
const OX = 15, OZ = -93.4;

export function lotToWorld(s: number, n: number): { x: number; z: number } {
  return { x: OX + UX * s + NX * n, z: OZ + UZ * s + NZ * n };
}

/** Yaw (about +y) of a vehicle whose nose points along lot direction (ds, dn). */
export function lotYaw(ds: number, dn: number): number {
  return Math.atan2(UX * ds + NX * dn, UZ * ds + NZ * dn);
}

export interface LotRect { id: 'mall' | 'evlab'; s0: number; s1: number; n0: number; n1: number }

/** Mall parking: straight across F4 from the mall's west door. EVLAB parking: the next lot along the road, beside the EVLAB fence. */
export const MALL_LOT: LotRect = { id: 'mall', s0: -4, s1: 40, n0: 13, n1: 40 };
export const EVLAB_LOT: LotRect = { id: 'evlab', s0: 48, s1: 92, n0: 13, n1: 44 };
export const PARKING_LOTS: ReadonlyArray<LotRect> = [MALL_LOT, EVLAB_LOT];

/** True on a lot (+ margin): no trees, rocks or grass here. */
export function parkingContains(x: number, z: number, margin = 0): boolean {
  const dx = x - OX, dz = z - OZ;
  const s = dx * UX + dz * UZ, n = dx * NX + dz * NZ;
  for (const l of PARKING_LOTS) {
    if (s >= l.s0 - margin && s <= l.s1 + margin && n >= l.n0 - margin && n <= l.n1 + margin) return true;
  }
  return false;
}

/** Row A (nose to the road): the eight small road vehicles. Row B: bus (along the road), tank and helicopter pad. */
export const EVLAB_SLOTS = {
  bike: { s: 52.5, n: 16.6 },
  evbike: { s: 56.5, n: 16.6 },
  rickshaw: { s: 60.5, n: 16.8 },
  auto: { s: 64.5, n: 16.8 },
  sedan: { s: 68.5, n: 17.2 },
  jeep: { s: 72.5, n: 17.2 },
  hypercar: { s: 76.5, n: 17.2 },
  evhypar: { s: 80.5, n: 17.2 },
  bus: { s: 61, n: 33 },
  tank: { s: 74.5, n: 34 },
  heli: { s: 85, n: 34 },
};
/** Bay lines of row A (s positions): eight 4 m bays. */
export const EVLAB_ROW_A_LINES = [50.5, 54.5, 58.5, 62.5, 66.5, 70.5, 74.5, 78.5, 82.5];

/** Where the player starts: on the mall lot's front apron, looking across F4 at the mall's west door. */
export const START_LOT_POS = { s: 16.8, n: 16 };

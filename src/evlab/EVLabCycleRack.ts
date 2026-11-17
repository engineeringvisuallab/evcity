// EVLab Step 10: the cycle rack in front of the portal (pure numbers, no three.js / DOM: the tree placer, the builder, the cyclists and the tests use it).
// Building-local metres (x east, z south), same frame as EVLabLayout / EVLabCampus.
//
// LAYOUT: one row of steel hoops ("Sheffield stands") on the plaza, east of the portal, between the lamp row (z 68) and the south wall.
// Every hoop stands in a vertical plane that runs north - south; a cycle is parked on each side of it, alongside the hoop (two cycles per hoop).
// All cycles are parked with the nose to the NORTH (towards the building, heading PI) and ride in from the plaza (south) along their own bay.
//
//        north (the building)
//        |  |   |  |   |  |      <- hoops (the cycles lean beside them, nose up)
//        v  v   v  v   v  v
//   -----slot slot slot slot----- z = RACK.z
//        ^  ^   ^  ^   ^  ^
//        |  |   |  |   |  |      <- each cycle rides in along x = its slot x, coming from the plaza (z 72)

export const RACK = {
  /** Centre x and z of the row (z = the middle of the parked cycles). */
  cx: 29, z: 65,
  hoops: 6,
  /** Distance between two hoops (m) and between a hoop and the cycle beside it. */
  pitch: 1.5, offset: 0.36,
  /** Hoop: half width along z, height, tube radius. */
  hoopHalf: 0.45, hoopH: 0.85, tube: 0.025,
  /** Paved pad under the rack (x pad around the outer cycles, z half depth). */
  pad: 0.9, padHalfZ: 1.55,
} as const;

export interface CycleSlot { id: string; hoop: number; side: -1 | 1; x: number; z: number; /** Heading of a cycle parked here (yaw about +y, 0 = nose to +z): nose to the north. */ yaw: number }

/** x of a hoop. */
export const hoopX = (h: number): number => RACK.cx + (h - (RACK.hoops - 1) / 2) * RACK.pitch;

/** Every cycle bay: two per hoop, ordered west to east (id R0 .. R11). */
export const CYCLE_SLOTS: readonly CycleSlot[] = (() => {
  const out: CycleSlot[] = [];
  for (let h = 0; h < RACK.hoops; h++) {
    for (const side of [-1, 1] as const) out.push({ id: 'R' + out.length, hoop: h, side, x: hoopX(h) + side * RACK.offset, z: RACK.z, yaw: Math.PI });
  }
  return out;
})();

/** The pad under the rack: [x0, x1, z0, z1]. */
export const RACK_PAD: readonly [number, number, number, number] = [
  hoopX(0) - RACK.offset - RACK.pad, hoopX(RACK.hoops - 1) + RACK.offset + RACK.pad, RACK.z - RACK.padHalfZ, RACK.z + RACK.padHalfZ,
];

/** True on the rack pad (+ margin). The park-tree placer keeps trees out of it. */
export function inRackZone(x: number, z: number, margin = 0): boolean {
  return x >= RACK_PAD[0] - margin && x <= RACK_PAD[1] + margin && z >= RACK_PAD[2] - margin && z <= RACK_PAD[3] + margin;
}

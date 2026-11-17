// EVLab parking lot (Step 7, moved in Step R3): the car park of the campus, on the flat strip EAST of the plot's fence (EVLAB_PARKING_STRIP), beside the landing of the east bridge.
// Pure numbers + functions (no three.js / DOM): the terrain generator, the tree placer, the builder (EVLabParkingLot) and the tests use it.
// Building-local metres (x = east, z = south), same frame as EVLabLayout / EVLabCampus. World = (EVLAB_POS.x + x, BUILDING_Z + z).
//
// LAYOUT (west -> east, bays are 2.6 x 4.8 m, perpendicular to the aisles; the arrow is where the nose of a parked car points):
//   x 157 (the east bridge lands here, one metre beyond the end of its deck)
//   row A -> | aisle 1 | <- row B  <- | row C -> | aisle 2 | <- row D
//   The south end (z 74 .. 81) is a cross aisle that joins both aisles; the entry road leaves it to the south, bends east and ends at the pavement edge of the N arm of J1 (Step R3).
//   Row A has a gap (the walkway) where the east promenade runs into the lot, so people can walk from the lot to the bridge.
// This step builds the lot only. The slots below are data for the next step (cars that arrive and park).

/** z of the east / west bridges (= GATE_Z in EVLabCampus; the test checks that they match) and the half width of the paved strip. */
export const LINK = { z: 48.5, halfW: 8 };

export const BAY = { w: 2.6, d: 4.8, aisle: 6.2, edge: 0.5, line: 0.12 };

/** The paved lot: x0 touches the landing of the east bridge (deck ends at x 156). It lies inside the 40 m parking strip (local x 150 .. 190). */
export const LOT = { x0: 157, x1: 189.6, z0: 2, z1: 81, bayZ0: 4, bayZ1: 74 };

/**
 * The entry road. It leaves the middle of the cross aisle to the south (straight, x = DRIVE.x, down to z = DRIVE.z1), then bends east (a quadratic curve) and ends at the
 * pavement edge of the N arm of J1, 24 m from the arm's centre line (world (64.4, -513.8) = local (204.4, 146.2)); it meets the arm square (heading 0.793, 0.609).
 * The real junction with the arm is Step R6.
 */
export const DRIVE = { x: 173.3, halfW: 5, z0: LOT.z1, z1: 85 };
export const DRIVE_END: readonly [number, number] = [204.4, 146.2];
/** Control point of the bend: on the line x = DRIVE.x, so the curve leaves the straight part along it and arrives with the arm's perpendicular heading. */
const DRIVE_CTRL: readonly [number, number] = [DRIVE.x, 122.4];

/** Centre line of the entry road from the lot (first point) to the arm (last), about every 3 m. */
export const DRIVE_PTS: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<[number, number]> = [];
  for (let z = DRIVE.z0; z < DRIVE.z1 - 1e-6; z += 3) out.push([DRIVE.x, z]);
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    out.push([u * u * DRIVE.x + 2 * u * t * DRIVE_CTRL[0] + t * t * DRIVE_END[0], u * u * DRIVE.z1 + 2 * u * t * DRIVE_CTRL[1] + t * t * DRIVE_END[1]]);
  }
  return out;
})();
/** Length of the entry road (m) from the south edge of the lot to the arm. */
export const DRIVE_LEN = DRIVE_PTS.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - DRIVE_PTS[i - 1][0], p[1] - DRIVE_PTS[i - 1][1]) : 0), 0);

/** Centre line of the entry road shifted sideways by `off` metres to the LEFT of the direction lot -> arm (off < 0: right). Used for the two lanes of the cars. */
export function driveOffset(off: number): Array<[number, number]> {
  const n = DRIVE_PTS.length;
  return DRIVE_PTS.map((p, i) => {
    const a = DRIVE_PTS[Math.max(0, i - 1)], b = DRIVE_PTS[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [p[0] + (dz / l) * off, p[1] - (dx / l) * off] as [number, number];
  });
}

/** Distance from (x, z) to the entry road's centre line. */
export function driveDist(x: number, z: number): number {
  let m = 1e9;
  for (let i = 1; i < DRIVE_PTS.length; i++) {
    const a = DRIVE_PTS[i - 1], b = DRIVE_PTS[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    m = Math.min(m, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)));
  }
  return m;
}

export interface Row { id: 'A' | 'B' | 'C' | 'D'; x0: number; x1: number; /** +1: nose points east (+x), -1: west. */ face: 1 | -1 }

const ax0 = LOT.x0 + BAY.edge;
export const ROWS: readonly Row[] = (() => {
  const A: Row = { id: 'A', x0: ax0, x1: ax0 + BAY.d, face: 1 };
  const B: Row = { id: 'B', x0: A.x1 + BAY.aisle, x1: A.x1 + BAY.aisle + BAY.d, face: -1 };
  const C: Row = { id: 'C', x0: B.x1, x1: B.x1 + BAY.d, face: 1 };
  const D: Row = { id: 'D', x0: C.x1 + BAY.aisle, x1: C.x1 + BAY.aisle + BAY.d, face: -1 };
  return [A, B, C, D];
})();

/** Aisle centre lines (x) and the cross aisle (z). */
export const AISLE_X: readonly [number, number] = [(ROWS[0].x1 + ROWS[1].x0) / 2, (ROWS[2].x1 + ROWS[3].x0) / 2];
export const CROSS_Z = (LOT.bayZ1 + LOT.z1) / 2;

/** Number of bays per row and the z of the first bay (the bays are centred between bayZ0 and bayZ1). */
export const BAYS_PER_ROW = Math.floor((LOT.bayZ1 - LOT.bayZ0) / BAY.w);
const BAY_START = LOT.bayZ0 + (LOT.bayZ1 - LOT.bayZ0 - BAYS_PER_ROW * BAY.w) / 2;
/** z range of the walkway gap in row A (the promenade is 16 m wide; the gap is a little wider). */
export const WALK_GAP: readonly [number, number] = [LINK.z - LINK.halfW - 0.5, LINK.z + LINK.halfW + 0.5];

/** z of bay line i (0 .. BAYS_PER_ROW). */
export const bayLineZ = (i: number): number => BAY_START + i * BAY.w;

export interface Slot { id: string; row: Row['id']; index: number; /** centre of the parked car */ x: number; z: number; /** yaw (about +y, 0 = nose to +z) of a car parked nose-in */ yaw: number; w: number; d: number }

const inGap = (z0: number, z1: number): boolean => z1 > WALK_GAP[0] && z0 < WALK_GAP[1];

/** Every parking bay (building-local). Row A skips the walkway gap. */
export const SLOTS: readonly Slot[] = (() => {
  const out: Slot[] = [];
  for (const r of ROWS) {
    for (let i = 0; i < BAYS_PER_ROW; i++) {
      const z0 = bayLineZ(i), z1 = z0 + BAY.w;
      if (r.id === 'A' && inGap(z0, z1)) continue;
      out.push({ id: `${r.id}${i + 1}`, row: r.id, index: i, x: (r.x0 + r.x1) / 2, z: (z0 + z1) / 2, yaw: r.face > 0 ? Math.PI / 2 : -Math.PI / 2, w: BAY.w, d: BAY.d });
    }
  }
  return out;
})();

/** The way in (waypoints, building-local x, z): the arm -> up the entry road -> cross aisle. */
export const ENTRY_ROUTE: ReadonlyArray<readonly [number, number]> = [
  [DRIVE_END[0], DRIVE_END[1]],
  [DRIVE.x, DRIVE.z1],
  [DRIVE.x, CROSS_Z],
];

/** True on the lot, its entry road, or the strip where the promenade runs into it (+ margin). */
export function inParkingZone(x: number, z: number, margin = 0): boolean {
  if (x >= LOT.x0 - margin && x <= LOT.x1 + margin && z >= LOT.z0 - margin && z <= LOT.z1 + margin) return true;
  if (z >= DRIVE.z0 - margin && driveDist(x, z) <= DRIVE.halfW + margin) return true;
  return false;
}

/** Lamp posts (x, z): on the line between the back-to-back rows B and C, every six bays. */
export const LAMPS: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<[number, number]> = [];
  const x = ROWS[1].x1;
  for (let i = 3; i < BAYS_PER_ROW; i += 6) out.push([x, bayLineZ(i)]);
  return out;
})();

/** [x0, x1, z0, z1] rectangles of white paint: the bay lines (and the line between the back-to-back rows B and C). */
export function paintRects(): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  const h = BAY.line / 2;
  for (const r of ROWS) {
    for (let i = 0; i <= BAYS_PER_ROW; i++) {
      const z = bayLineZ(i);
      // a line belongs to the bays beside it: skip it if neither neighbour bay exists (inside the walkway gap of row A)
      const left = i > 0 && !(r.id === 'A' && inGap(bayLineZ(i - 1), z));
      const right = i < BAYS_PER_ROW && !(r.id === 'A' && inGap(z, bayLineZ(i + 1)));
      if (!left && !right) continue;
      out.push([r.x0, r.x1, z - h, z + h]);
    }
  }
  const bc = ROWS[1].x1;
  out.push([bc - h, bc + h, bayLineZ(0), bayLineZ(BAYS_PER_ROW)]);
  return out;
}

/** Low concrete kerb strips [x0, x1, z0, z1]: round the lot, open at the entry road and at the promenade walkway. */
export function kerbRects(): Array<[number, number, number, number]> {
  const t = 0.35;
  const g0 = LINK.z - LINK.halfW, g1 = LINK.z + LINK.halfW; // the promenade runs in here
  const d0 = DRIVE.x - DRIVE.halfW, d1 = DRIVE.x + DRIVE.halfW; // the entry road
  return [
    [LOT.x0, LOT.x1, LOT.z0, LOT.z0 + t], // north
    [LOT.x1 - t, LOT.x1, LOT.z0, LOT.z1], // east
    [LOT.x0, d0, LOT.z1 - t, LOT.z1], // south, west of the entry road
    [d1, LOT.x1, LOT.z1 - t, LOT.z1], // south, east of the entry road
    [LOT.x0, LOT.x0 + t, LOT.z0, g0], // west, north of the walkway
    [LOT.x0, LOT.x0 + t, g1, LOT.z1], // west, south of the walkway
  ];
}

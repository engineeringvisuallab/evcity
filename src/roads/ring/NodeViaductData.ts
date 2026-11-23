// STEP HK-8d-2: numbers of the NODE VIADUCT of the Hatikamrul-type interchange (ring OVER the J1-S arm / island link / C-D roads). Source: HANDOFF_HATIKAMRUL.md sections 11 - 14
// (docs/HK_STRUCTURES.txt span layout, docs/HK_PIERS.txt columns). Only used when Config.roads.hatikamrul.enabled (default OFF).
// d = ring station - NODE_STATION: + WEST (station grows westwards), - EAST.
export const NODE_VIADUCT = {
  /** Ring station (m) of the node = where the J1-S arm axis meets the ring (HK-9a: measured 1206.4462; HK-6 used 1207.798, 1.35 m too far west, which moved every pier line 1.35 m off the loop ramps). */
  stationM: 1206.4462,
  /** Deck between the two approach slabs (d, m): the slabs (STRUCT.approach 16 m) lie outside, so the structure is d -112 .. +160 (ring points every 8 m: -96 was a ring point with the old station; with 1206.4462 the first ring point inside is d -94.45 and the last d +145.55 (deckD1 146 keeps it), HK-9b). */
  deckD0: -96, deckD1: 146,
  /** Deck half width (m): ring pavement 22.1 + the auxiliary lane 3.65 of the loops through the crossing (HK-6): 51.5 m wide. The game ring deck alone is 23.0 m; the aux lanes are paved in HK-9. */
  deckHalf: 25.75,
  /** Pier lines (d): two main piers either side of the node (100 m main span over the arm, link and C-D roads), one west side pier. */
  piersD: [-50, 50, 97] as readonly number[],
  /** Column offsets across the ring (m from the centreline): 4 columns per pier line (HK-8b: clear of the west loop ramps at y +-17.3). */
  colU: [-24.2, -8, 8, 24.2] as readonly number[],
  /** Column section along the ring / across (m). */
  colAlong: 3.0, colAcross: 2.5,
  /** The column goes this far below the lowest natural ground around it. */
  embed: 6,
  /** Deck depth (m): 1.4 over the lower roads (clearance 5.5 m over 20.33 m: ZERO margin, do not thicken), haunch up to HAUNCH_MAIN / HAUNCH_SIDE at the pier faces, parabola over HAUNCH_LEN. */
  depthMid: 1.4, haunchMain: 3.4, haunchSide: 2.4, haunchLen: 15,
} as const;

/** Index of the pier line that has the main span (the two first ones). */
const MAIN_PIERS = 2;

/** Deck depth (m) at d: 1.4 m, thickening to the pier faces (haunch). */
export function nodeDepth(d: number): number {
  const N = NODE_VIADUCT;
  let depth: number = N.depthMid;
  N.piersD.forEach((p, q) => {
    const H = q < MAIN_PIERS ? N.haunchMain : N.haunchSide;
    const dist = Math.abs(d - p) - N.colAlong / 2;
    if (dist >= N.haunchLen) return;
    const t = dist <= 0 ? 1 : 1 - dist / N.haunchLen;
    depth = Math.max(depth, N.depthMid + (H - N.depthMid) * t * t);
  });
  return depth;
}

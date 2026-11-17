// STEP 5.3b: shared numbers of the ring's structures (bridges / viaducts). One place, used by RoadNetwork (terrain rule) and by scripts/ring-structures-check.ts.
// The mesh and the individual designs of each structure come in Step 5.3c+ (every bridge gets its own engineered, modern design, see HANDOFF_ROAD_DESIGN.md section 12).
export const STRUCT = {
  /** Length (m) of the approach slab at each end of a structure: it stands on the embankment and is part of the structure (BridgeSpec.i0 / i1 include it). */
  approach: 16,
  /** Depth (m) of the deck slab: the underside is this far below the road surface (HANDOFF 3.6: deck depth 0.8-1.5 m, the worst case is used). */
  deckDepth: 1.5,
  /** The ground stays at least this far (m) below the underside of the slab (no ground inside the slab). */
  groundGap: 0.3,
  /** Under the inner part of a structure the ground is never raised by a neighbouring daylight embankment up to this distance (m) beyond the platform edge (no earth dam in the valley). */
  protectReach: 60,
} as const;

/** How far (m) below the road surface the ground is carved away under a ring structure. */
export const STRUCT_CARVE = STRUCT.deckDepth + STRUCT.groundGap;

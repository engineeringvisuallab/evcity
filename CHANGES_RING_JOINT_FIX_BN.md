# Ring: road-bridge joint fix
- Changed: `src/roads/ring/RingBridgeGeometry.ts` (collider top runs 2 road points past each end, winding up), `src/roads/ring/RingStructurePhysics.ts` (FIX_INTERNAL_EDGES), `scripts/ring-bridge-physics-check.ts`, `HANDOFF.md`.
- Tests: tsc clean, ring-bridge-physics-check ALL PASS (30 balls), ring-bridge-mesh-check ALL PASS. Not checked in a running game.

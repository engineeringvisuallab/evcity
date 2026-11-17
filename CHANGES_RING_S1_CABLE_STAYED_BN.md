# Ring Step 5.3c-1: S1 cable-stayed bridge

- New: `src/roads/ring/RingBridgeGeometry.ts`, `src/roads/ring/RingStructureLayer.ts`, `scripts/ring-bridge-mesh-check.ts`.
- Changed: `src/core/Engine.ts` (import, field, create after StreetLights, dispose).
- All 6 structures now have a mesh; S1 = cable-stayed, S2-S6 = plain girder until their own designs.
- Tests: tsc clean, ring-bridge-mesh-check ALL PASS. Not checked visually in a running game.

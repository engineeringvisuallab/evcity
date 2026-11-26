# HANDOFF: REAL BUILDINGS - INTERIOR + EXTERIOR (evcity)

Language: English only. ONE small step per chat, PASS / FAIL list (a check not run = NOT RUN), then STOP for the user's look. Changed files only, in a versioned zip.

## 0. THE USER'S ORDER
"Game er building gular vitore kisu nai. faka. building gula k real building banate hobe. mane building er exterior and interior. sob. desing korte hobe. sob akbare korte parbe na. step by step korte hobe."

## 1. HOW BUILDINGS WORK TODAY (read before any step)
- Models: `src/buildings/models/*.ts`, built with `Kit` (`BuildingKit.ts`). A big box standing on the ground becomes a hollow room (walls + door + roof) in `Kit.buildRooms()`; every part is also a Rapier solid (`info.solids`).
- Drawn instanced (4 colour variants per model) by `FillBuildings.ts`; colliders `BuildingPhysics.ts`; door leaves `BuildingInteract.ts`.
- Before S1 a 2-3 storey house was ONE tall empty room: no floor slabs, no stairs.

## 2. PLAN (user said "start" = go with this order)
S1 floors + stairs engine (`Kit.storeys`), test on `house-brick-2` / `-3` | S2 furniture library + room dividers | S3 residential models | S4 commercial | S5 civic / health / education / religious | S6 exterior polish | S7 LOD + lighting + performance.

## 3. STATUS TABLE
| Step | Status | Note |
|------|--------|------|
| S1 | CODE WRITTEN, user look pending | `Kit.storeys(y0, floors, {side})` in BuildingKit.ts; called in `buildBrickHouse` (urban.ts). Floor slab 0.2 m at every storey, straight stair (16 steps, riser 0.1875 m, tread 0.27 m, 1 m wide) between storeys, flights alternate left / right wall, 1 m landing at the back wall, hole + handrail on the upper floor. Skipped if the room is too small. |
| S2 | CODE WRITTEN, user look pending | `Kit.furn` (furniture box, solid), `Kit.interiorWall` (partition with doorways), `furnish` callback of `Kit.storeys`. NEW `Furniture.ts` (bed, sofa, coffee table, TV unit, dining table, chair, wardrobe, bedside, kitchen counter, fridge, toilet, basin, plant) and `HouseInterior.ts` (`furnishBrickHouse`: ground = living room + kitchen/dining + bathroom, upper floors = 2 bedrooms). Only brick house uses it. |
| S3-S7 | not started | S3 next: the other residential models (tin / semi-pucca house, townhouse, flats, shop house) |

## 4. CHECKS
S2 PASS: TypeScript of BuildingKit / urban / Furniture / HouseInterior has no error of its own. Layout test (fake Kit, /tmp script, 2 and 3 floors): every box inside the room, no furniture overlaps furniture or wall, nothing in the stair columns, front door corridor free (0 problems).

## 4b. S1 CHECKS
PASS: TypeScript of BuildingKit.ts + urban.ts has no error of its own (checked with global tsc, `three` types missing here).
NOT RUN: `npm run build`, `npm run test:tower`, `scripts/mission-test.ts`, the game LOOK (can the player walk up? step climb with 0.1875 m riser, handrail, FPS), other models unchanged (only brick house calls `storeys`).

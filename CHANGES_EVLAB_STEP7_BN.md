# EVLab Step 7: parking lot (shudhu lot, gari ekhono na)

## Ki holo
- EVLab campus-er jonno parking lot, lake-er purbo dike, east bridge-er promenade-er shesh-e (world x -75..-42, z -258..-179). Lake, ring road, bridge theke 30 m+ dure.
- 4 row bay (nose-in, 2.6 x 4.8 m), moto 96 slot, 26 bay per row. Aisle 6.2 m, dokkhin prante cross aisle. Row A-te promenade (16 m) jekhane lot-e dhukche sekhane walkway-er gap, jate lot theke bridge-e hete jaoa jay.
- Entry road (10 m, edge line + dashed centre line): lot-er dokkhin theke F6 highway porjonto (world x -58.7, z -7). Shesh 15 m highway-er level-e namche (0.54 m), road ribbon terrain-er sathe namche.
- White bay line (1 ta merged mesh), low kerb (entry road ar walkway-te khola), 4 lamp. Collider nei (baki parking lot-er moto).
- Terrain: entry road-er niche access road-er moto flat strip. Local street ei strip-e dhukbe na. Grass/gach/pathor-o na.
- Park tree: lot ar entry road-er upor theke bad (shesh-e filter, tai baki gach ager jaygay-i).

## File
- Notun: `src/evlab/EVLabParking.ts` (pure layout + slot data), `src/evlab/EVLabParkingLot.ts` (mesh), `scripts/evlab-parking-test.ts`, `CHANGES_EVLAB_STEP7_BN.md`.
- Bodlano: `EVLabGrounds.ts`, `EVLabSite.ts`, `EVLabCampus.ts`, `EVLabRoads.ts`, `EVLabManager.ts`, `package.json` (`test:evlab-parking`), `HANDOFF_EVLAB.md`, `HANDOFF.md`.

## Adjust korte chaile
`EVLabParking.ts`-er `LOT` (x0/x1/z0/z1, bayZ0/bayZ1), `BAY` (w, d, aisle), `DRIVE.x`. Slot barate/komate `LOT.bayZ1` bodlao.

## Step 8-er jonno
`SLOTS` (id, x, z, yaw), `ENTRY_ROUTE`, `AISLE_X`, `CROSS_Z`. World = (EVLAB_POS.x + x, BUILDING_Z + z).

## Test
`npm run test:evlab-parking` (31 check, sob pass), evlab-tower-test, evlab-structure-test, evlab-audience tests, mission-test, `tsc --noEmit`, `npm run build` pass.
Ager theke fail (amar change-er na): `evlab-site-test` (lake 4.2 m kata, tai plot flat na), `road-test` (2 fail, original zip-eo ekoi).

# INTERCHANGE — Step 3D-A: ramp-er flyover (existing bridge pipeline), flag off

Age apply koro: Step 1, 2a, 2b (ar structures zip). Eta tar upor.

## Ki
Ramp-er jei ongsho ground-er **3 m-er beshi upore**, shegulo ekhon **bridge (dry viaduct)** — alada nijer 3D code na likhe **existing bridge pipeline** e dewa hoyeche (`RoadNetwork.bridgeRamp`):
- **BridgeBuilder:** deck slab, parapet, pier (25 m-er moddhe) — amar notun view lage ni.
- **Terrain:** deck-er niche matir bandh (earth dam) hoy na; valley/nodi ager moto thake. Deck-er upor uthe thaka matir ongsho kete dey.
- **BridgePhysics:** gari-r jonno collider.
- **StreetLights:** bridge deck-er dhar-e boshe.
- 3 m-er kom uchchota = embankment (ager moto); 4 point-er chhoto stretch o embankment.
- Ramp-er shuru/shesh-e 12 m approach (pier chhara), duto-i ground-er sathe milbe.

Flag off (default) thakle kichu bodlay na.

## Verify
- `interchange-network-test.ts` ALL OK (notun 5 check): cloverleaf-e **7 ramp bridge**; ager bridge gulo hubohu same; prottek bridge-er `bridgeOf` thik, span/length/width/clearance sane; **3 m-er upor kono ramp point embankment-e pore thake na**; **deck-er niche terrain shobcheye kom 2.31 m niche (earth dam nai)**; deck-er height = level plan; `stats.bridges` mile.
- `tsc` pura project: original main-er sathe error-er list hubohu ek.
- `road-test.ts` (flag off): 79 PASS, 2 FAIL — main-eo ager theke ekii (amar noy).
- `scripts/interchange-profile.ts` (notun): ramp-er side view asol terrain-e (`docs/interchange-preview/profile.png`): deck shoja, pier matir upor, valley-r upor viaduct.
  (Test location = longest highway-r majh, obhhabe obhoddho/valley, tai boro uchchota (12–16 m) dekhabe. Bhalo jaygay (candidates: pad 11, 13) kom hobe.)

## Jante rakho
- **Game-e chalie chokhe dekha hoy ni** (`three` ei machine-e nai). BridgeBuilder/BridgePhysics-er code ami bodli ni, shudhu data (`BridgeSpec`) diyechi, tai shei ekii pipeline.
- Flag on korle ramp-er gore/merge-e road-er lane-er sathe overlap (z-fight) ager moto ache (junction pad/taper pore).
- **Upper road (main) ekhono ground-e** — ramp-er moto uporer bridge hoy ni (Step 3D-B).
- Rail-er plan `roads.bridges` dekhe, tai flag on korle rail-er clearance-e ramp bridge-o ashe (flag off-e na).

## File
`src/roads/RoadNetwork.ts` (2a + 2b + `bridgeRamp`), `scripts/interchange-network-test.ts`, `scripts/interchange-profile.ts`, `docs/INTERCHANGE_SYSTEM_BN.md`, `docs/interchange-preview/profile.svg|png`.

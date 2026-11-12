# APPLY — ei zip ekshathe shob (interchange system + analysis + J6 handoff)

GitHub build fail korechilo (`Cannot find module './Builder'`...): repo-te `src/interchange/`-er baki module chhilo na. Ei zip **complete overlay**, `evcity/`-er upor paste/unzip korun, tarpor commit + push. Ager `evcity_j6_handoff.zip` / `evcity_changed_files.zip` ar lagbe na.

## 7 ta existing file BODLAY (shudhu interchange-er ongsho jora; apnar repo-r nijer feature RoadCorrections, tree shade etc. KOTHAO MUSHE NA)
- `src/core/Config.ts` — `roads.interchange` block jora (enabled=false)
- `src/roads/RoadNetwork.ts` — interchange import, `ramp` kind, `fixedY`, `interchanges`, `layoutInterchanges()` (+ method)
- `src/roads/Junctions.ts`, `src/roads/RoadTypes.ts`, `src/traffic/RoadGraph.ts`, `src/vehicles/VehicleUse.ts`, `src/environment/StreetLights.ts` — `ramp` kind support
Baki shob **notun file** (`src/interchange/*`, `scripts/*`, `docs/*`, `CHANGES_INTERCHANGE_*`).
`Config.roads.interchange.enabled = false` thakle game ager moto.

## Shotorko
- 1 ta test check (`interchange-network-test`: ramp deck-er niche earth 1 m) repo-r ekhon-kar network-e fail kore; game-e prabhab nei (flag OFF). `docs/j6/05_RULES_AND_TESTS_BN.md` dekhun.
- `src/interchange/InterchangeView.ts`, `viewer.ts` `three` import kore: ami `three` chhara check korechi, tai CI-te eder type error asle seta ei overlay-r moddhe; error pathan.

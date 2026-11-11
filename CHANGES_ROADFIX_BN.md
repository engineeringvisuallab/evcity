# CHANGES_ROADFIX_BN - Road correction system + RC01 (F3/F6 kona)

## Ki hoyeche
- Notun system: `src/roads/RoadCorrections.ts` (sob hat-e-aka road correction ek jaygay, data + geometry). `RoadNetwork.layoutMain` er shesh-e `applyMainCorrections` call kore.
- RC01: F3 (dakshin theke) ar F6 (purbo-mukhi) er W node-er sharp ~90 digree kona-ta bad. Screenshot-er green line onujayi ekta smooth curve (radius minimum 180 m).
- W node (-2830,-520) theke notun jayga (-2714,-453) e shorlo. Purono kona-r stub nei. Ei node-e ar pad nei (duto road shoja cholche, boro bank 2.8 digree).
- Highway prai 168 m choto holo.
- Rail: notun road-er sathe nijei mile gelo (issue 7 ta-i, agei-o 7); F6-r upor rail-over-road crossing 45 m purbe shorlo (-2580,-539 -> -2535,-549).

## Check
- `npx tsc --noEmit` OK. `scripts/road-correction-test.ts` ALL PASS. `road-number-test`, `road-section-check` pass.
- `road-fit-test` er 5 summary line correction er age ar pore hubohu ek (highway sample 3334 -> 3314 chhara).
- Game-e dekha jayni (headless): chokhe dekhe nao: kona-r jaygar look, F6 e rail bridge-er nicher crossing, Minimap, road number plate.

## Jante rakho
- Hat-e-aka line-er shesh/shuru road-er heading-er sathe mile na, tai 50 m `lead` diye road-er heading-e mishano hoyeche ar hat-er kapa smooth kora hoyeche. Final curve green line theke ~9 m vitor-er dike.
- Notun correction: `ROAD_CORRECTION_SYSTEM.md` section 5.

## RC02 - F4/F1 hairpin (node N)
- F4 ar F1 N node-e ekta teekhno V (hairpin) banachchilo, pad "bend sharper than 50 deg" bole skip hoyechhilo (tai grey dead-end blob). Blob ar stub bad.
- Notun curve F4 theke F1-e ghure mishlo. Node N (340,-3670) theke (479,-3577) e shorlo. Highway aro ~233 m choto.
- Tomar aka line 105 digree ghurche ~160 m-e (radius ~60 m, highway-er jonno onek tight). Tai `minR: 100` diye wide kora (radius 126 m), curve aka line theke ~50 m bhitor-e. As drawn chaile `minR: 60` dao (src/roads/RoadCorrections.ts, RC02).
- Rail: 7 issue ager moto-i, rail-over-road crossing (417,-3482) -> (435,-3470). north-hub station nirapod.
- road-fit highway: worst sink/float kome (0.211/0.205 -> 0.124/0.151) kintu out-of-tolerance 38 -> 44 (sample 3334 -> 3300): game-e dekho.
- Screenshot-er camera 50 digree ghorano chhilo (north-up na): ROAD_CORRECTION_SYSTEM.md section 2 te likha.

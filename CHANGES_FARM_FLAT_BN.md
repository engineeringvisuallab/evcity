# Krishi (agriculture) area: full flat + merged fields (2026-11-22)

**User:** "agriculture farm area full flat hobe, field gula akta arektar sathe merge hobe, field area 2x boro hobe"

## Ki hoyeche
1. **Full flat:** 6 ta krishi area (`FarmAreas.ts`) er prottekta poro circle (radius + 40 m) ek-i floor height-e flat. Floor = oi circle er natural ground er median. Baire 60 m skirt diye natural ground-e fire jay. Notun file `src/farm/FarmPads.ts`; `TerrainGenerator.ts` e `sample()` er moddhe road earthwork er **age** apply hoy (jate road er dhal flat ground-er sathe mishe jay).
2. **Merged fields:** area mode-e prottek field puro 96 m cell bhore (96 x 96, yaw 0), tai pashapashi field er majhe kono lane nai. Random "gap" (2 %) o bondho. Road / nodi pashe thakle chhoto (0.62 x) field-e fallback ager motoi.
3. **2x area:** field-er gor area ~3 700 m2 theke ~7 200 m2 (mot 33 ha -> 64 ha). Crop gach MAX_PLANTS = 1800 cap, tai performance bare na.
4. `FarmFields.ts` abar generate kora (`scripts/gen-farm-fields.ts`): 90 field, gor relief 5.3 m -> 0.6 m.

## Jegulo ekhono flat noy
- Road er upor / road er dhal (road nijer height rakhe).
- North-East farm er ~2 ta field (relief 12 m): oikhane high road / embankment ache.

## Test
`npm run test:farm` (table current ki na) ar game-e 6 ta krishi area ghure dekho.

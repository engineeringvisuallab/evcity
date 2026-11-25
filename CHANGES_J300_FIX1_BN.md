# STEP J300-FIX-1: ramp mukh-e wall / parapet roundabout-er lane-er bhetor (Banglish) -- screenshot 1 (2 ar 4 er-o ekoi karon)

## Somossha
J300 (300 ft junction) er 4-ta ramp-er INNER wall (`W-in-I1`, `W-out-I1`, `E-in-I1`, `E-out-I1`) roundabout centre theke r 57.9 m e shuru hoy, kintu roundabout-er gari-r lane r 48..62 m. Mane prothom 4..5 m wall + 0.9 m parapet lane-er bhetor dariye thake (chobi-te lane-er opor safed parapet line / dhal slab). Ramp-surface-er lighter shoulder strip-o lane-er opor diye jeto.

## Ki kora hoyeche (shudhu `src/roads/junction/J300SolidMesh.ts`, data / generated file bodlano hoyni)
1. `clipToDeckFace` (notun function): ramp-in wall-er je point r < deck.face (62.6 m), ta kete first point ta thik r = 62.6 e interpolate kora.
2. Ramp surface-er shoulder strip: je row duto-i r < 62 m (ring lane-er bhetor) sekhane shoulder strip ar ankbe na (asphalt ager moto thake).

## Check
- `npx tsx scripts/j300-fix1-check.ts` (NOTUN): age FAIL (132 concrete triangle deck-er upor lane-er bhetor, nearest r 57.9), ekhon PASS.
- `scripts/mission-test.ts`: missions: all ok. `j300-struct-c-check`, `j300-paint-check`: age-o 0 FAIL, ekhon-o 0 FAIL.
- NOT RUN: npm run build / full tsc (node_modules nai), game-e dekha.

## Baki (screenshot 1 er je ongsho ami bujhini / kori ni)
- Bam dik-er lomba komola line (bus-er ramp-er dhar) -- ki thik korte hobe bolo.
- Screenshot 2 ar 4 (ekoi karon, tumi dekhe bolo thik holo kina), screenshot 3 (arm-er dhar-er komola line) ekhono baki.

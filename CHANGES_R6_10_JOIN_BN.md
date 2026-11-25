# STEP R6-10-JOIN: uttor-er road (R6-10) arc road (R6-7) er sathe join (Banglish)

## Somossha (last screenshot)
R6-10 er shuru (-2220, -3457) R6-7 theke 80 m dure chilo, ar level 37.8 m, R6-7 er level oikhane ~20 m. Tai road 15 m uchu fill-er opor majhe thame gechilo, join hoy ni.

## Ki kora hoyeche (shudhu data, terrain / mesh code bodlano hoyni)
1. `src/roads/r6/R6TenLink.ts` (NOTUN): R6-7 er point 30 (s 300.7 m) theke R6-10 er ager shuru porjonto smooth link curve (tangent merge, R6-7 er nijer heading-e). Join bridge-er 25 m AGE (R6-7 river bridge s 326..366), bridge-er opor na.
2. Level: join-e R6-7 er level (21.57 m). Ekhan theke 4 % grade-e uthe ager R6-10 profile-er sathe cubic-e mile jay, tarpor ager profile. R6-10 er prothom ~400 m (51 point) niche namano hoyeche, max 11.3 m.
3. `src/roads/RoadNetwork.ts` `layoutR6Roads`: R6-10 er jonno `r6TenWithLink` call (import + 2 line). R6-10 speed 60 (link curve min R 136 m, R6-7 er moto V60).
4. `src/parking/RoadStationSites.ts`: station-24 y 48.09 -> 36.91 (road niche namlo, station uthe thakbe na).
5. `src/signs/RoadSignData.ts`: sign-11 s 1238 -> 1364 (link 126 m age jog hoyeche; x/y/z same).
6. `scripts/r6-ten-join-check.ts` (NOTUN): `npx tsx scripts/r6-ten-join-check.ts` -> RESULT ALL PASS.

## Result
R6-10: 236 -> 252 point, 1877 -> 2003 m, level 21.57 -> 55.77, grade 4.04 % max, link min radius 136 m. Road id / road sonkha (218) same, bridge shudhu 126 m shift.
Cut: max centre cut ager 15.6 m theke 25.6 m (point 44, x -2452, hill-er opor). Eta bera. Daylight slope-e pahar kete jabe.

## Test (ami ja chalalam)
- r6-ten-join-check: ALL PASS
- mission-test: 'missions: all ok'
- b7-r6new-check / r6-game-check: ager moto-i 2 FAIL (R6-9 J300 arm diye replace, R6-7 ground), amar change-er age-o same chilo.
- NOT RUN: npm run build, tsc poro puro (node_modules / npm install nai), game-e dekha.

## Baki
- Last image-er crossed-out dan dik (arc-er east half) amar bujhte parini: ami kichu mucchi ni. Mucte chaile bolo.
- AI traffic (gari) R6-10 <-> R6-7 e jabe na: R6 free-end road, graph-e link nai.
- Image 1-4 er correction ekhono kora hoyni.

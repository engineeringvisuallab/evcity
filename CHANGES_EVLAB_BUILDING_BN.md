# EVLab Building v1.4: boro building, khola lobby, stair/lift dui pase, 3 ta door

## Ki bodlalo
- **Building boro:** footprint 150 x 100 m  ->  **176 x 116 m** (15 000 m2 theke ~20 400 m2, +36%). `BLD` in `EVLabLayout.ts`.
  Ring road-er kona (`RING.r` 40 -> 15) chhoto kora hoyeche jate boro podium ring road-er bhitore thake. Plaza (`PLAZA.z0` 60) ar park-tree blocked area-o update.
- **Entrance lobby:** portal diye dhukle ekta boro khola lobby (174 x 42 m). Majhkhane carpet portal theke hall porjonto.
- **Stair + lift dui pase:** age majhkhane ek core chhilo. Ekhon `SPLIT = 11.5` diye duita block:
  - West block = **Stair A + Lift 1**
  - East block = **Lift 2 + Stair B**
  Majhkhane khola jayga. Tower (89 floor) er shob floor-e core duita alada, slab hole, roof, facade, collider shob update.
- **Lobby-r samne 3 ta door:**
  - West door -> **MAIN OFFICE** (open-plan 24 desk, reception, 2 glass meeting room)
  - Majher 3 ramp -> **CONFERENCE / PRESENTATION HALL**
  - East door -> **ENGINEERING LAB** (12 bench, instrument, equipment rack, 2 ghurano motor test rig)
- Hall-er stage ar screen pichone boro (hall ekhon z -57 porjonto), lectern/presenter position update.
- Notun file: `src/evlab/EVLabWings.ts`. Lobby file notun kore lekha.

## Test
`scripts/evlab-tower-test.ts` (footprint 176 x 116, core split) ar `mission-test` pass. `tsc` ar `vite build` ok.
(eng-zones-test ar evlab-site-test-er je FAIL ache sheta age theke-i chhilo.)

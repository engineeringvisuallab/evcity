# J6 facts (survey, `scripts/j6-survey.ts`, `j6-dump.ts`)

- World seed: `Config.world.seed`; headless: `new TerrainGenerator(seed)` -> `.roads` (RoadNetwork) with `.roads[]`, `.pads[]`, `.bridges[]`.
- **Pad J6** (id 6): x=-1731.8, z=-137.0, y=33.73, rCore 43.9. **Pad J57** (id 57): x=-1432.4, z=-505.1, rCore 34.1.
- **Interchange centre (proposed):** x=-1774.0, z=-190.3 (= pad J6 + (-68 m) along F6), yaw 0.9018 rad (51.67 deg), F6 surface y ~ 31.5.
- Roads: **F6** (id 5, kind highway, 3+3 lane, laneW 3.5, median 2.4, 100 km/h, grade 4-5 % here); **S4** (id 24, collector, 1+1 lane, halfW 4.8, 50 km/h, bridge id 21 over river: span 32, len 56, clearance 3.5; bridge at ~109..172 m east of the axis); **S5** (id 25, collector).
- Frame used everywhere: **u along F6 (screen-up = +u), v across (screen-LEFT/west = +v, east = -v), origin = interchange centre.** `x = cx + u cos(yaw) + v sin(yaw)`, `z = cz + u sin(yaw) - v cos(yaw)`.
- Terrain (relative to centre y): west (+v) = hill: +8 m at v=100, +16 m at 150, +60 m at 300 (straight west). East (-v) = river valley (-10..-16 m).
- Nearest other junction: **J57 at 463 m** (u=-35, v=463). Guide spacing 1000 m (warning).
- S4 geometry: straight along u~0 from the south-east up to v~-45, then bends NORTH to the old pad (crosses F6 at u~+30). S5: from the pad goes (48,-45) then SW parallel to F6: (-57,18), (-116,41), (-173,71), (-225,109), (-270,154), (-313,201)... (all u,v rel centre).
- Pic: `assets/existing-plan-uv.png` (terrain contours, roads, pad outline).
- NOTE: `existing-plan-uv.png` origin = PAD J6 (centre is at u=-68 in that image). All other docs/data: origin = interchange centre.

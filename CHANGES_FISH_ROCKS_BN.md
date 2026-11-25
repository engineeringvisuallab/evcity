# CHANGES: FISH-REAL + ROCK-REAL (2026-11-25)

User: "game er onek old fish ase, real shape na, texture o na. stone gulao."

## Fish (pond / river / lake / sea fish of AnimalManager)
- BEFORE: `buildFishGeometry` (AnimalExtra.ts) = a sphere + 2 cones, one grey vertex colour, no pattern.
- NOW: `AnimalManager` uses the SAME lofted body as the reef fish (`buildReefFishGeometry(1)`, 208 triangles: smooth body, forked tail, dorsal / anal fin) and `buildReefFishMaterial` (procedural patterns in the shader, tail wag).
- One school = one species (table `POND_FISH` in AnimalManager.ts): silver carp/rui/hilsa, goldfish/koi, spotted tilapia, barred perch, striped minnow, catfish. Pattern, 2 colours (70 / 30 %) and body aspect come from the species. Colour and pattern are written per fish every frame (`ic.setXYZ`, `fishPat`), because the instance slot of a fish changes when schools appear / vanish.
- Old `buildFishGeometry / buildFishMaterial` stay in AnimalExtra.ts (unused now, still exported).
- The reef / sea fish (MarineLife.ts) were already on ReefFish: untouched.

## Stones
- `src/vegetation/RockAssets.ts` rewritten: `buildRockGeometry` (smooth normals, 3-octave 3D value noise + ridged chips, bottom squashed, base at y = 0; near = icosahedron detail 2 = 180 tris, far = detail 1 = 80 tris; before 80 / 20) and `applyRockTexture` (procedural fragment shader: mottling, grains, strata, cracks, a little moss on the top; no image file).
- Seabed rocks (SeabedDecor.ts) use the same geometry builder + the same texture function (less moss).
- NOT touched: the armour stones of the port breakwater (boxes in PortLayout.ts), park / garden stones (CentralParkLayer, HkGardenLayer), EVLab stones.

## Checks
- `npx tsc --noEmit` exit 0, `npm run build` (tsc + vite) exit 0 (this time the real one, deps installed with npm ci).
- Headless: rock geometry 4 / 4 no NaN, minY 0.000, attributes position / normal / color.
- NOT RUN: in-game look (WebGL not available here). If the stone texture looks too strong / too weak, tune `tex` in `applyRockTexture`; moss: third argument.

---

# ROUND 2: ROCK-REAL 2 + PLANT-REAL (2026-11-25, user screenshots: land rock with big wavy cartoon lines + very dark; seabed plants = bare sticks)

## Stones (RockAssets.ts `applyRockTexture`, rewritten)
- Removed the big wavy crack lines and the dark look. New surface (all procedural, object-space noise, no image): 3 stone tones (grey / sandstone / cool dark) in soft patches, domain-warped fbm mottling, 2 grain scales, mineral specks, faint strata, hairline cracks only in some patches, rust stains on the sides, lichen dots + a little moss on top faces, and a screen-derivative bump (`rkBump`) so light catches the grain.
- Brighter base colours (round 0x8f897e, slab 0x9a9484). Near rock = icosahedron detail 3 (320 tris), far = 80. Program key `evc-rock-v2`.
- Seabed rocks use the same function (moss 0.2).

## Seabed plants (SeabedDecor.ts)
- Seaweed `bladeGeometry`: 7 ribbon blades (140 tris; before 5 strips / 50): widest in the middle, pointed tip, raised midrib, ruffled edge, S bend, olive base -> yellow-green tip, some brown blades. Fragment shader adds lengthwise veins + mottling (`evc-seaweed-v2`). Sway shader unchanged.
- Branch coral `branchCoralGeometry`: staghorn colony, 3 levels, 22 tapered branches (220 tris), dark base -> pale tips; own material `branchMat` with `applyCoralTexture(..., 'polyp')` = polyp pits + mottling + bump.
- Dome coral `domeCoralGeometry`: smooth hemisphere (before: flat faceted); own material `domeMat` with `applyCoralTexture(..., 'brain')` = meandering brain-coral grooves (iso-lines of a noise) with bump.
- `coralMat` is split into `branchMat` / `domeMat`. The 3 geometry functions are exported (for headless checks). Instance caps unchanged (worst case at quality 2: seaweed 1900 x 140 tris).

## Checks
- `npm run build` (tsc + vite) exit 0. All 4 new fragment-shader pieces compile with glslang (glslangValidator, GLSL 450 stub of the three chunks). Headless geometry: 0 NaN.
- Look checked on a CPU preview of the same shader maths (rock sphere, brain coral sphere), NOT in the game. Seaweed / staghorn look not seen at all yet.
- NOT touched: port breakwater armour stones, park / garden / EVLab stones, the old fish in AnimalExtra (unused).

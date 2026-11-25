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

---

# ROUND 3: FISH-MORE + FISH-COLOR + sea grass + flowers + lily (2026-11-25)

User: "water er fish er poriman aro barate hobe, onek color rong berong er fish add korte hobe. sea grass gula real and flower add koro water a."

## Fish
- Pond / river / lake fish (AnimalManager.ts): `FISH_PER` 12 -> 18, `fishSchools` (Quality.ts) 4/7/10 -> 8/14/20: high quality 360 fish (before 120). `POND_FISH` table now 16 species, mostly bright: orange-white koi, blue betta, red platy, yellow cichlid, green barb, purple tetra, orange clown loach, neon tetra, pink molly, goldfish + the older silver / olive tilapia / barred / striped / catfish.
- Sea / reef fish (MarineLife.ts): `MAX_SCHOOLS` 22 -> 36, QUALITY schools 7/14/22 -> 11/22/36, Quality.ts marineSchools 8/14/22 -> 12/22/36 and drawn caps (Hi/Mid/Far) 160/240/528 -> 200/360/864 (high), 64/110/200 -> 90/180/330 (medium), 32/64/120 -> 40/90/180 (low). Min water depth for a school 2.6 / 3.5 -> 1.7 / 2.4, so fish also swim in the shallows near the shore.
- `FISH_SPECIES`: +15 bright species (neon tetra, red snapper, purple anthias, green chromis, yellowtail fusilier, pink wrasse, orange-white banded; lionfish, yellow tang, mandarin, boxfish, queen angelfish, pink-blue parrotfish; napoleon wrasse, golden trevally).
- Cost: fish triangles roughly x1.5 on high quality. If FPS drops: lower the three caps in Quality.ts first.

## Water plants (SeabedDecor.ts, kinds 4-7; caps per quality in `QUALITY`)
- 4 SEA GRASS `seaGrassGeometry`: tuft of 12 long thin ribbons (72 tris), dark -> light green, some yellowish, sways (`grassMat`). Meadows: `vnoise` meadow > 0.38 -> 3-6 tufts per 5 m cell, depth 1-14 m. Seaweed (kelp) is less frequent now (0.62 -> 0.42) so the meadow reads as grass.
- 5 FLOWER `flowerGeometry`: stem + 3 leaves + 12-petal bloom (208 tris). 8 petal colours (pink, white, yellow, purple, red, orange, blue, magenta) in patches of one colour. Only the petals take the instance colour (attribute `aPet`, `petalMat`); stem, leaves and the yellow centre keep their own colour.
- 6 LILY PAD `lilyPadGeometry` + 7 LOTUS BLOOM `lotusBloomGeometry` (236 tris, 4 colours), only on FRESH water (`s.water > 0.5`; the sea is at 0), depth <= 4.5 m, floating at water + 0.03 m. 2-5 pads per cell, 38 % of them with a bloom. Pad shader: radial veins + mottling (`padMat`).
- `Kind` = 0..7, `KINDS = 8`, caps array has 8 entries (seaweed, branch, dome, rock, grass, flower, pad, bloom).

## Checks
- `npm run build` exit 0. Headless: 0 NaN, all parts of a merged geometry indexed. Pad fragment shader + petal vertex logic compile in glslang. Shapes checked on a software render of the dumped geometry (flower, lotus, pad, grass tuft).
- NOT seen in the game: lily pad height vs the wave surface (if the pads sink / flicker, raise `s.water + 0.03`), flower size, meadow density.

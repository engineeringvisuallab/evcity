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

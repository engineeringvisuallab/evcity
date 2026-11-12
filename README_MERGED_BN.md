# EVCity interchange — MERGED (shob ek jaygay)

Tomar upload kora `evcity_interchange_ALL.zip`-er upor ei session-er shob kaj overlay kora.

## Notun / bodlano (ei session)
- `src/interchange/InterchangeView.ts` — 3D (three.js): ramp (gore/merge wedge taper), road strip, pier/lamp/rail, structure, wall, garden/pond; `buildJunction3Object` (T/Y 3-way, flyover chhara).
- `src/interchange/view.ts` — three-wala export (index.ts three-free, test headless cholbe).
- `src/interchange/Junction3Geometry.ts` — 3-way junction-er pure math (corner fillet, pad outline).
- `src/interchange/Standards.ts` — AASHTO formula (Rmin, SSD, decel/accel lane, crest K, weaving); `CRITERIA` bodlale standard bodlay.
- `src/interchange/PatternCD.ts` — `cloverleaf-cd`: C-D road soho cloverleaf (real-world design).
- `src/interchange/Validate.ts`, `Levels.ts` — C-D lane join / diverge-merge / overpass level support.
- `src/interchange/viewer.ts` + `interchange-viewer.html` — vite dev viewer (`npm run dev` -> /interchange-viewer.html).
- `docs/interchange-viewer-standalone.html` — self-contained viewer (internet lage, three.js CDN), browser-e double-click.
- `scripts/junction3-test.ts`, `scripts/standards-report.ts` — headless test / design audit.
- `CHANGES_INTERCHANGE_3DC / JUNCTION3 / STANDARDS _BN.md` — details.

## Test (headless)
- `npx tsx scripts/interchange-test.ts` -> ALL OK
- `npx tsx scripts/junction3-test.ts`, `npx tsx scripts/standards-report.ts`
- `interchange-network-test.ts` tomar full repo lage (terrain file ei zip-e nai), ami chalate pari ni.

## Jante rakho
3D (view) code browser-e ami chalai ni, tomar chokhe dekhe bolo. Baki: clothoid transition, superelevation, C-D barrier mesh, sign gantry, 3-way junction-e turn lane/signal.

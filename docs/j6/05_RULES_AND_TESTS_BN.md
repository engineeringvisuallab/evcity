# Rules, commands, baseline

## Delivery rule (user)
Prottek step-er shesh-e **changed + notun file zip**, `evcity/` path soho (user seta unzip kore game folder-er upor paste kore). Sathe handoff update (`HANDOFF_J6_INTERCHANGE_BN.md` status table). Choto part, ekta ekta kore.
Flag: interchange / scenario **OFF thakle game exactly ager moto** (road count, pad count, traffic same). Seta test kora chai.

## Commands (repo root `evcity/`)
- Headless world (no three/vite needed): `npx tsx scripts/j6-survey.ts` (~1-2 min)
- Analysis: `npx tsx scripts/j6-analysis.ts` (env `J6_NORTH=straight|west`, `J6_MAIN=`, `J6_CROSS=`)
- Analysis tests: `npx tsx scripts/analysis-test.ts` (20 ok)
- Interchange tests: `npx tsx scripts/interchange-test.ts` (ALL OK), `interchange-network-test.ts` (~40 s)
- Roads: `npx tsx scripts/road-test.ts`
- Typecheck: `npx tsc --noEmit -p .`
## Baseline noise (original main-eo ache, bhul na)
`tsc` ~109 existing error (three/vite types nai); `road-test` 2 FAIL (79 pass). **Notun error 0, notun FAIL 0** hote hobe.
## Environment
Game browser-e chole (three.js); dev machine-e game chalano jay na, tai proman = headless test + SVG/PNG. Game visual check user kore.
## Style
Pure modules (no three) jekhane possible (Analysis.ts moto). Constants export kore editable. Bangla UI string `src/i18n/bn.ts`-e (key add). Comment English.
## Do not
`Analysis.ts`-er number "ager-e thik" dhore niba na: HCM constants smriti theke (verify). Hand-edit generated files. Seed / unrelated roads bodlano.

## Update (build fix, 2026-11-12)
- GitHub build fail: `src/interchange/` er baki module repo-te chhilo na. Fix = `evcity_COMPLETE_overlay.zip` (interchange system + analysis). `APPLY_FIRST_BN.md` poro.
- **RoadNetwork.ts / Config.ts**: MERGED zip-er version repo-r cheye purano (repo-te `RoadCorrections` + tree `shadeFloor` ache). Tai MERGED file overwrite KORA HOY NI; shudhu interchange hunk gulo repo-r file-e patch kora hoyeche. Future-e kono "MERGED"/purano zip theke file overwrite korbe na, diff koro.
- Real typecheck (CI-er moto): `tsc` ekhane `vite/client` type na thakay semantic check-i chole na. Proman = `tsconfig.check.json` (`types: []`) diye chalano; `three` missing error ignore koro, baki shob 0 hote hobe. Overlay-r por baseline-er cheye notun error shudhu `three` import (sandbox-e three nai).
- **Known failing check:** `scripts/interchange-network-test.ts` ekta check FAIL kore repo-r **ekhon-kar network-e** (`ground under every ramp bridge deck stays >= 2 m below the slab (worst 1.00 m)`): purano network-e (RoadCorrections chhara) ALL OK. Karon: repo-r RoadCorrections road-gulo bodleche, test-er built-in site-e ramp deck-er niche earth 1 m. Flag OFF = game-e kono prabhab nei. Fix T08-e (site / ramp height).

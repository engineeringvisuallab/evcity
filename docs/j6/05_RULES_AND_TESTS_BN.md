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

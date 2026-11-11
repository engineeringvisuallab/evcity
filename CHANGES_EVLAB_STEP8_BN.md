# EVLab Step 8: gari ese park kore, driver building-e jay

Presentation mission shuru hole kichu gari F6 highway theke entry road diye EVLab parking lot-e ashe, nose-in park kore, driver nere east bridge ar plaza diye portal-e dhoke. Mission shesh hole driver ber hoye ferot jay, gari-te uthe, gari reverse kore ber hoye highway-e chole jay.

## Kibhabe kaj kore
- Mission shuru (`EVLabManager.enterStage`) -> `arrivals.start()`. Mission shesh (`endPresentation`) ba stage theke fire asha (`leaveStage`) -> `arrivals.dismiss()`.
- Gari ar manush game-er nijer model (`VehicleModel`, `PersonModel`), shudhu dekhano (physics nei). Cockpit-er speedometer update hoy na (gari-r bhitore keu dekhe na).
- Phase: `wait -> driveIn -> park -> walkIn -> inside` (ashar somoy), `walkOut -> board -> back -> turn -> driveOut -> gone` (jawar somoy).
- Mission shesh howar somoy je gari ekhono ashchhe, se age park kore tarpor ber hoy (driver nambe na). Je driver hete jachhe, jekhane ache sekhane ghure fire jay. Je gari ekhono highway-e ashe-i ni, se ashbe-i na.
- Gari-r bay: B26, C24, D26, A24, B20 (entrance-er kachhe, char row-e chhorano). Gari: sedan, jeep, evhypar, hypercar. Steering bicycle model-e (hater chaka ghure), chaka speed onujayi ghure.
- Quality: `Q.evlabArrivals` (low 2, medium 4, high 5 ta gari).

## File
- Notun: `src/evlab/EVLabArrivalPath.ts` (pure: route, round corner, plan, speed), `src/evlab/EVLabArrivals.ts` (state machine, model), `scripts/evlab-arrivals-test.ts`, `CHANGES_EVLAB_STEP8_BN.md`.
- Bodlano: `src/evlab/EVLabManager.ts` (arrivals group, start/dismiss/update/dispose), `src/core/Quality.ts` (`evlabArrivals`, CRLF thik rakha), `package.json` (`test:evlab-arrivals`), `HANDOFF_EVLAB.md`.

## Adjust korte chaile
- Kon gari kon bay-e: `ARRIVAL_CARS` (EVLabArrivalPath.ts). Songkha: `Q.evlabArrivals` (Quality.ts).
- Gari-r gotir: `speedIn` / `speedOut`, `BACK_SPEED`. Manush-er gotir: `walkSpeed` (planArrivals). Lane: `LANE`. Moron-er radius: `CORNER`.

## Jene rakho
- Gari park korte shuru theke ~40 s, bhitore dhukte ~200 s lage (route lomba, ~300 m hete). Tai ses gari mission-er majhe-i dhuke. Mission aage shesh hole upore-r niyome ber hoy.
- Real `VehicleModel` node-e chole na (Cockpit canvas laage, `document` nei), tai test-e stand-in model diye state machine check kora hoyeche; real model browser-e (`npm run dev`) chokh diye dekhte hobe: park-er direction (nose bhitorer dike), chaka ghora, driver-er bay theke ber hoya.

## Test
`npm run test:evlab-arrivals` (route, bay, smooth turn, state machine ashar-jaoar phase, majh-pothe dismiss, restart, dispose), `test:evlab-parking`, `test:evlab-audience`, mission-test, `tsc --noEmit`, `npm run build` pass.
Ager theke fail (amar change-er na): `test:quality` (grass-er test, original zip-eo ekoi fail).

# EVLab Step 10: cycle rack ar cycle-wala manush

Presentation mission shuru hole kichu manush cycle chalaye avenue, south bridge ar plaza diye ese portal-er purbo dike cycle rack-e cycle rekhe, cycle theke nere building-e dhoke. Mission shesh hole tara ber hoye, cycle-e uthe, cycle rack theke pichone thele ber kore, ghure, cycle chalaye chole jay.

## Cycle rack
- Jaiga: plaza-r purbo dike (building-local x 24..34, z 63.5..66.5), portal-er dan pashe, lamp row (z 68) ar south wall-er majhkhane. 6 ta steel hoop (Sheffield stand, ekta InstancedMesh), hoop-er dui pashe duita cycle = 12 bay. Niche halka concrete pad. Collider nei (hoop sru, cycle shudhu dekhano).
- Shob cycle nose uttore (building-er dike). Bay-er majhe duri 0.72 m (handlebar 0.62 m).
- Rack-er pad-e porha ekta plaza debdaru (x 34, z 64) park tree list theke bad jay (`EVLabCampus.parkTrees`). Baki gach ager moto.

## Cyclist (mission-e)
- Mission shuru (`EVLabManager.enterStage`) -> `cyclists.start(Q.evlabCyclists)`. Shesh (`endPresentation`) ba stage theke fire asha (`leaveStage`) -> `cyclists.dismiss()`.
- Route: F6 highway-er kache avenue (left lane, x -3.2) -> south bridge -> plaza-e (fountain-er purbo dike) -> nijer bay-te sidha dhuke. Gari-r moto left-hand traffic. Ashar somoy ~230 m, ~55 s.
- Phase: `wait -> rideIn -> park -> walkIn -> inside` (ashar), `walkOut -> mount -> back -> turn -> rideOut -> gone` (jawar). Bay-te thame, rider nambe, portal-e hete jabe (~35 m).
- Jawar somoy: rider uthe, cycle 1.6 m pichone sore, jaygay ghure (turn), tarpor ride kore ber hoy (other lane). Ekhono ashchhe emon cyclist age park kore tarpor ber hoy. Je hete jachhe se ghure fire jay. Je ekhono highway-e ashe-i ni, se ashbe-i na.
- Rider: game-er `PersonModel`. Seat-e boshe, pa pedal-er sathe ghore (2-link IK: pa pedal-e, haat grip-e), cycle-er steering ar chaka/crank ghore (Step 9-er `Cycle`). Rider-ra ektu lomba (min scale 1.02) jate saddle (1.0 m) theke pa pedal-e pouchay.
- Cycle shob ekta `CycleKit` share kore (prothom cycle-e banay, shesh e release).
- Quality: `Q.evlabCyclists` (low 2, medium 3, high 4).

## File
- Notun: `src/evlab/EVLabCycleRack.ts`, `EVLabCycleRackMesh.ts`, `EVLabCyclistPath.ts`, `EVLabCyclistPose.ts`, `EVLabCyclists.ts`, `EVLabCyclistModels.ts`, `scripts/evlab-cyclists-test.ts`, `CHANGES_EVLAB_STEP10_BN.md`.
- Bodlano: `src/evlab/EVLabManager.ts`, `EVLabGrounds.ts`, `EVLabCampus.ts`, `src/people/PersonModel.ts` (`setSeatedLimbs`, CRLF thik rakha), `src/core/Quality.ts` (`evlabCyclists`, CRLF thik rakha), `package.json` (`test:evlab-cyclists`), `scripts/evlab-cycle-test.ts` (RIDE = CYCLE check), `HANDOFF_EVLAB.md`.

## Adjust korte chaile
- Rack jaiga / hoop songkha: `RACK` (EVLabCycleRack.ts). Kon bay-e kon rong-er cycle: `CYCLISTS` (EVLabCyclistPath.ts). Songkha: `Q.evlabCyclists` (Quality.ts).
- Gotir: `cruise` (planCyclists), `rideInSpeed` / `rideOutSpeed`, `BACK_SPEED` ar `TURN_TIME` (EVLabCyclists.ts), walk speed (planCyclists). Lane: `AVENUE.lane`, `PLAZA_RIDE`.
- Rider-er bosar bhongi: `LEAN`, `BODY`, `RIDER_MIN_SCALE` (EVLabCyclistPose.ts).

## Jene rakho
- Ei sandbox-e `three` install kora chhilo na (network nei), tai `npm run build` / `tsc --noEmit` / real `Cycle` + `PersonModel` ekhane chalano jayni. Pure part (rack, route, pose IK, state machine) ekta chhoto `three` stand-in diye test kora hoyeche (pass). Tomar machine-e `npm run test:evlab-cyclists`, `npm run test:evlab-cycle`, `npx tsc --noEmit`, `npm run build` chalaio.
- Browser-e (`npm run dev`) chokh diye dekhte hobe: rider-er pa pedal-e/haat grip-e thik boshe kina, cycle rack-er jaiga, cycle ghorar somoy (turn), plaza-e fountain/flag-er sathe lagche kina.

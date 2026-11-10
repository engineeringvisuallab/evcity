# CAR RACE — outer freeway, north theke west

## Kemon cholbe
- **Start**: uttor (north) dike, `F1` e north junction-er ~170 m pore. Sekhane sobuj marker (mission-er moto chhoto sobuj post + road-e sobuj ring). Minimap-e `!` pin.
- Marker-er kachhe (30 m) gele likha ashbe: **Enter** chaple race-er **Jeep** pabe (on foot hole jeep start line-e spawn hoye tumi sit korbe; ager theke Jeep-e thakle sei Jeep). Onno gari/heli/boat-e thakle age nambo bolbe.
- 3-2-1-GO countdown, tarpor timer.
- Road-er majhkhane (middle lane) ~1 km por por **circle** (holud = porer circle, nil = tar por-er ta). **Prottek circle chhute hobe, krome krome.** Ekta miss korle porer circle count hobe na, finish-o khulbe na: ghure giye chhute hobe.
- **Finish**: west (pochchim) dike `F3`-er shesh, west junction-er ~45 m age (lal boro circle). Kul prai 15 km, 15 ti circle (finish shoho).
- Race-er Jeep-er fuel kokhono sesh hoy na. Jeep theke nambe ba Jeep wreck hole race cancel.
- Shesh hole time + best time dekhay. Abar Enter dile notun race.

## Notun file
- `src/race/RaceCourse.ts` — course banay (F1 -> F2 -> F3), pure function.
- `src/race/RaceSystem.ts` — circle, marker, HUD, rules.
- `src/race/index.ts`
- `scripts/race-test.ts` — headless test (course: start north, finish west, ~1 km gap, road ulto thakleo kaj kore). `npx tsx scripts/race-test.ts`

## Bodlano file
- `src/core/Engine.ts` — RaceSystem toiri/update/dispose + `beginRace()` (CRLF rakha).
- `src/vehicles/VehicleManager.ts` — `enter()` `private` theke public (ek shobd).

## Jana kotha
- Finish "west" = `F3`-er west prante (west junction-er ager). Onno jayga chaile `RACE_FINISH_BACK` / road bodlano jabe.
- Gamer bhetore chalano jayni: tsc node_modules chhara chalano jay na. Tai race module-ta stub `three` diye typecheck korechi (0 error) ar course logic headless test pass.
- AI competitor nei, shudhu timer. Pore chaile add kora jabe.

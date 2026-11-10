# OVERTAKE + 5 AI RACER (race-er shathe) — eta evcity-race.zip-er jaygay boshbe (shob kichu ache)

## 1. Overtake (shob AI gari, boro highway-te)
- Highway-te (3 lane + 3 lane) AI gari jodi nijer iccha-r speed-er cheye **2.5 m/s (~9 km/h) ba beshi slow** gari-r pichone atke jay, se **median-er dike porer lane-e** jay, jodi sei lane-e pashe/samne/pichone (fast gari) kono gari na thake.
- Pass kore (22 m age-e gele) abar nijer lane-e fire ashe. Junction/U-turn-er ~140 m age-e abar nijer lane-e fire ashe, tokhon overtake kore na.
- Mane **je gari-r speed beshi, se-i overtake kore.** Hypercar/EVHypar ekhon freeway-te 175 km/h-er moddhe chole (sadharon car 130), tai truck/bus/sedan ke pass korbe. Truck kokhono hypercar-ke pass korbe na.
- Ek lane change-er por 3 s cool-down. Shudhu fast lane-er dike (kerb-er dike overtake nai).
- Logic: `src/traffic/Overtake.ts` (pure) + `AIDriver.ts` (target point `shift` diye sorano).
- Test: `scripts/overtake-test.ts` (13 ti check).

## 2. 5 AI racer
- Enter chaple tomar Jeep-er pashe ar pichone **5 ti AI gari** start line-e dariye jabe (hypercar, evhypar, sedan, jeep, hypercar; alada alada rong). Countdown-e handbrake-e thake, GO hole ek sathe chole.
- Tara F1 -> F2 -> F3 dhore west-e finish-e jay (`planRoute`), race speed 175 km/h x (0.88..0.98), overtake kore.
- **Position** HUD-te: "Position 2/6". Je age finish circle-e pouchay se jite. Shesh-e "YOU WIN!" ba tomar position.
- Racer onek age-e giye gele (170 m+) tomar speed-er shathe opekkha kore (nahole 300 m dure gari freeze hoye jay).
- Race shesh/cancel hole racer-ra choley jay.

## Bodlano file
- notun: `src/traffic/Overtake.ts`, `scripts/overtake-test.ts`
- bodlano: `src/traffic/AIDriver.ts` (overtake, `hold`, `speedCap`), `src/traffic/Route.ts` (`highwayLimit`), `src/traffic/TrafficManager.ts` (`spawnRacers`, `removeRacer`, sports `highwayLimit`), `src/core/Config.ts` (`traffic.target` 40 + `highway.sportKmh` 175), `src/core/Engine.ts`, `src/race/*`, `scripts/race-test.ts`
- `VehicleSpec.ts` (traffic-mix zip) ar eta alada, duto-i lagbe.

## Jana kotha
- Gamer bhetore chalano jayni, `tsc` chalano jayni (node_modules nai). Pure logic headless test pass; race module stub-typecheck pass; AIDriver/TrafficManager/Engine-er edit gulo chokh diye dekha.
- AI racer gulo dhakka khele ba ulte gele atke thakte pare (tokhon pichone porbe).

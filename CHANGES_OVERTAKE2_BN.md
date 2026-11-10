# OVERTAKE STEP 1 — shob dual road-e (median) overtake

## Ager obostha (zip dekhe)
- `Overtake.ts` (pure logic) ar `AIDriver.ts`-e overtake already chhilo, kintu **shudhu big highway-te** (`route.onBigHw`).
- `passInfo` / `os` / `oc` shudhu tour car (`fast`) er jonno bhora hoto; normal AI gari ta use korto na.

## Ekhon
- **Highway (3 lane)**, **arterial (2 lane/dir)**, **avenue (downtown 3 lane/dir)** — shob median-wala dual road-e overtake hoy.
- **Bondho**: narrow road (`halfWidth < 2.6`), bridge deck, median chhara road (oncoming lane), junction / U-turn-er ~140 m age, bus stop-e thaka obosthay, kache-i overtake-bondho jaygay (90 m age theke fire ashe).
- Je gari-r cruise beshi (`vFree` samner gari-r cheye 2.5 m/s beshi) shei-i pass kore: hypercar/evhypar -> truck/bus/sedan. Truck kokhono hypercar-ke pass kore na.
- Lane change-er dhoron ager moto: median-er dike, 3 s cool-down, pass hole fire ashe.
- Lane-er chowra ekhon road theke ney (`-pts[].os`): avenue 3.25 m, baki 3.5 m.

## Bodlano file
- `src/traffic/RoadGraph.ts` — notun `passLanes(roadId, s)` (passInfo-r upor): kothay koy lane median-er dike jaowa jabe (0 = overtake nai).
- `src/traffic/Route.ts` — `RoutePt.pl` notun; `push()` ekhon shob gari-r jonno `passInfo` + `passLanes` bhore.
- `src/traffic/AIDriver.ts` — `onBigHw` er jaygay `pts[head].pl`; `maxExtra = pl - route.lane`; pashe-r lane-er gari obstacle na (`halfW`) ekhon shob overtake-able road-e.
- `Overtake.ts` onno rakha — `scripts/overtake-test.ts` ager moto ALL OK.

## Jana kotha
- Game chalano jayni, `node_modules` nai. Shudhu pure logic test pass; traffic file gulo type-check-e notun error nai (three type chhara).
- Avenue-te (40 km/h, onek junction) overtake kom hobe karon `nearJunction` beshi bar ashe — eta intended.

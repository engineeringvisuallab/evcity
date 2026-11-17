# STEP J1-AI: J1-e AI gari chola (Banglish)

## Somossha
J1 (ground-level open star) e kono AI gari cholachol korchilo na. Karon: 4-ta arm road (J1-N/E/S/W) centre theke 315 m dure shuru hoy; lane zone ar star ashole road na (terrain + mesh). Tai AI gari arm-er shesh-e eshe dead end pelo, ar star-e chukte parto na. Signal-o chilo na.

## Ki kora hoyeche
1. `src/traffic/J1Link.ts` (NOTUN): design-er movement (OpenJ1Geometry.buildMovements) theke AI path banay: 4 through lane, left slip, right pocket R1/R2 (28-ta movement, U-turn AI kore na). Notun kono road/model banano hoyni, ager design-i reuse.
2. `src/traffic/RoadGraph.ts`: `graph.j1` (J1Link) toiri kore (J1-N/E/S/W road ar net.j1 thakle).
3. `src/traffic/Route.ts`: inbound gari arm-road-er shesh 140 m-e eshe movement bachhe nei (through = nijer lane, left = kerb lane theke slip, right = pocket), tarpor approach (lane zone-e dhire lane change), star-er bhetor design centre line, then target arm-er outbound lane-e beriye jay. Zone-e gati max 60 km/h (signal-e thamte pare).
4. `src/traffic/TrafficSignals.ts`: J1-er 4-phase signal (8 leg): P1 N+S through, P2 N+S right pocket, P3 E+W through, P4 E+W right pocket. Left slip free. Stop line s = 23.75 m. Lamp-pole TrafficLightLayer ager moto 8-ta dekhabe. Player-er red light fine-o kaj korbe.
5. `scripts/j1-ai-check.ts` (NOTUN): headless check, run: `npx tsx scripts/j1-ai-check.ts` -> ALL PASS (28 movement, prottek arm theke notun arm-e route, jump nai, signal-er through/pocket/slip).

## Test (game-e dekho)
- J1-er kache giye dekho: gari arm theke star-e dhuke, red-e stop line-e thame, green-e through/left/right kore onno arm-e jay.
- Right-turn gari pocket-e (median-er pashe) thame, P2/P4 phase-e jay.

## Ring-er T (shesh korlam)
- `RoadGraph.tLinks`: prottek J1 arm-er dur-er shesh ring road-er kothay mile (pad nai, tai alada).
- `Route.ts` `tLink()`: arm theke outbound gari shesh-e ring-e uthe jay (dui dik-er ekta, smooth curve). Ring-er gari T-er kache ese 20% somoy arm-e dhuke inbound J1-er dike jay. Ekhon gari dead end-e thame na, ring <-> J1 chole.
- Check: `npx tsx scripts/j1-ai-check.ts` ALL PASS (4 T link, arm->ring, ring->arm).

## Baki
- Tour/race gari (plan-wala) J1 star-e ekhono jay na (ore plan-e pad nai).
- Ring T-te interchange ramp ekhono nai: gari shudhu ring-er kerb lane-e mishe, conflict check nai.

## STEP J1-AI2: gari star-er bhetore spawn (2026-11-15)
### Somossha
Path thik chilo (j1-ai-check ALL PASS), kintu player J1 star-er majhe thakle kono gari-i ashto na. Karon: gari sudhu player theke 110-260 m-er road-e spawn hoy, kintu arm road shuru hoy centre theke 315 m dure. Physics-o sudhu player-er 300 m-er moddhe chole, ar 285 m-er bahire gari despawn hoy. Mane star-e gari pouchanor kono rasta chilo na (centre theke 0 / 50 m-e spawn spot = 0).
### Ki kora hoyeche
1. `src/traffic/Route.ts`: `pickJ1Move` (movement bachha, ager code alada kora), `RouteBuilder.j1ZoneRange(m)` (zone-er kothay gari boshano jay), `startInJ1(k, m, sa)` (route star-er lane zone-er bhetor theke shuru). `enterJ1` ager moto-i kaj kore, shudhu optional `zone` neya.
2. `src/traffic/TrafficManager.ts`: `trySpawnJ1`. Player J1 centre theke 575 m-er moddhe thakle (centre-er kache 85%, dure 40% somoy) gari star-er approach zone-e boshe (110-260 m ring, ager moto gap / collider check), already cholche (zone speed-er adhek), tarpor signal / stop line / star / target arm. Ager normal spawn ager moto-i ache.
3. Left slip zone-e boshe na (tar start 315 m-er bahire), tai oi movement bad, onno movement-e retry.
### Test
`npx tsx scripts/j1-ai-spawn-check.ts` -> ALL PASS (player 0..400 m-e zone spawn place ase; 192 route zone theke shuru, smooth, thik arm-e beriye jay). `j1-ai-check.ts` ager moto ALL PASS.
### Chalano jayni (game-e dekho)
`TrafficManager.trySpawnJ1` nijei (Rapier / vehicle / people lage) headless chalano jayni. `tsc` / `npm run build` chalano jayni (node_modules nai). Game-e J1 centre-e dariye dekho: gari star-er bhetor dhuke signal-e thamche kina.

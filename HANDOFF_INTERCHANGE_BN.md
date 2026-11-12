# HANDOFF — evcity: AI Station merge + Interchange system (ei porjonto)

Ei zip-ta main `evcity`-r upor **shob kaj ek-sathe**. `evcity/`-r upor copy (overwrite) korlei hobe, same folder path. Game ager moto-i chole: interchange **flag off** (default).

## 1. Ei zip-e ki ache
### A. AI Station (evcity_aistation.zip-er update, main-er sathe nirapod merge)
AI gari station-e (charge/fuel) jawar logic. Main-er notun `sixLaneJunction` (Config.ts) **rakha ache**; shudhu notun `traffic.energy` block jora.
- Notun: `src/traffic/StationDetour.ts`, `StationStops.ts`, `scripts/station-detour-test.ts`, `scripts/station-visit-test.ts`, `CHANGES_AISTATION_BN.md`
- Bodlano: `AIDriver.ts`, `Route.ts`, `TrafficManager.ts`, `traffic/index.ts`, `vehicles/Energy.ts`, `vehicles/Vehicle.ts`, `core/Config.ts` (shudhu energy block)

### B. Interchange system (flag off)
Cloverleaf / diamond / parclo interchange-er foundation + game-er sathe prothom jora.
| Notun | Kaj |
|---|---|
| `src/interchange/*` (12 file) | Pure module (three.js nai): pattern table, ramp geometry, level/height, validator, AI link data, instanced part data, structure kit (arch/pavilion/fountain/palm/billboard/wall), `RoadSpec` adapter |
| `scripts/interchange-test.ts` | 56 headless check |
| `scripts/interchange-network-test.ts` | Asol `RoadNetwork`-e (~40 s): flag off/on, ramp road, bridge, terrain, AI spawn, deterministic |
| `scripts/interchange-candidates.ts` | Kon junction-e interchange boshe (auto) |
| `scripts/interchange-preview.ts`, `interchange-profile.ts` | Top-view SVG, ramp-er side view |
| `docs/INTERCHANGE_SYSTEM_BN.md` | **Mool design doc** (parameter, pattern, load niyom, wiring table, shimana) |
| `docs/INTERCHANGE_CANDIDATES_BN.md`, `docs/interchange-preview/*` | Candidate table + chhobi |
| `CHANGES_*_BN.md` (7 ta) | Prottek step-er alada note |

| Bodlano game file | Ki bodlalo | Behaviour |
|---|---|---|
| `roads/RoadTypes.ts` | `RoadKind`-e `'ramp'` | Kono road ramp na, tai ek |
| `roads/RoadNetwork.ts` | `KIND.ramp`, `RawRoad.fixedY`, `buildFixedProfile`, `layoutInterchanges`, `bridgeRamp`, `interchanges` | Flag off = return, kichu hoy na |
| `roads/Junctions.ts`, `environment/StreetLights.ts`, `vehicles/VehicleUse.ts` | `ramp` row | Ek |
| `traffic/RoadGraph.ts` | AI ramp-e spawn kore na (`kind === 'ramp'` bad) | Flag off-e ek |
| `core/Config.ts` | `roads.interchange = { enabled: false, list: [] }` + AI energy block | Default off |

## 2. Apply korar por (5 minute)
```
npm run typecheck          # (tomar project-e) notun error asha uchit na
npx tsx scripts/interchange-test.ts           # ALL OK, 56 PASS
npx tsx scripts/station-detour-test.ts ; npx tsx scripts/station-visit-test.ts   # ALL OK
npx tsx scripts/interchange-network-test.ts   # ALL OK (~40 s)
npx tsx scripts/road-test.ts                  # 79 PASS, 2 FAIL — **duto FAIL original main-eo ager theke ache** ("terrain equals the pad plane 0.4451 m", "341 roads one connected network (128)")
```
**Flag on kore chokhe dekha** (ami game chalate pari ni, `three`/`vite` ei machine-e nai). `Config.roads.interchange`:
```ts
{ enabled: true, list: [
  { id: 'I11', pattern: 'cloverleaf', x: 2602, z: 1821, yaw: 1.783, main: 'highway', cross: 'arterial' }, // F2 x P10
  { id: 'I13', pattern: 'parclo',     x: 262,  z: -2820, yaw: 1.865, main: 'highway', cross: 'arterial' }, // F4 x P13
] }
```
Ei 2 ta-i "auto-candidate" (pani/dhal/onno road check pass). Chokhe dekhar checklist:
1. Ramp road gulo jaygay ase, shoja, junction-er por (bhul jaygay na).
2. Uchu ongsho bridge/viaduct (deck + pier), niche matir bandh nai.
3. Gari ramp-er upor chalano jay (collider).
4. Gore/merge-e road-er lane-er upor **overlap/z-fight** dekha jabe (jana shimana, Step 2c).
5. Frame rate/load ager moto.

## 3. Ki hoyeche (step-gulo)
| Step | Kaj | Zip |
|---|---|---|
| AI-station merge | Main-er notun update-er sathe | (ei zip) |
| 1 Foundation | `src/interchange` module + 3 pattern + test | ✅ |
| 2a | `RoadKind 'ramp'` | ✅ |
| 2b | Ramp road `RoadNetwork`-e (flag off), AI ramp-e spawn kore na | ✅ |
| Candidates | Auto junction finder (pad 11, 13 fit) | ✅ |
| Structures | Structure kit data (arch, pavilion, fountain, palm, billboard, wall) | ✅ |
| 3D-A | Ramp-er uchu ongsho = bridge (existing BridgeBuilder/BridgePhysics) | ✅ |

## 4. Ki ki baki (ekta ekta kore, ei kromey)
Prottek step-er shesh-e: `tsc` (notun error 0), `interchange-test` + `interchange-network-test` + `road-test` (79/2 same), tarpor game-e chokhe dekha. **Flag off thaka obosthay game ager moto thakbe** — eta sob step-er niyom.

| # | Kaj | Kothay | Jhuki | Kivabe jabe (acceptance) |
|---|---|---|---|---|
| **2c** | Ramp-er gore/merge-e **junction pad / taper**: ramp road-er lane theke tangentially berobe, overlap/z-fight na hoy. Diamond-er `terminal` (at-grade) mane pad. | `Junctions.ts`, `RoadNetwork.layoutInterchanges` | Medium: pad logic pad-er por ramp dekhe na (ei-ta bodlate hobe) | Chokhe z-fight nai; `road-test` same 79/2 |
| **3D-B** | **Upper road (main) ke bridge kora**: main road ekhono ground-e. Uthte hole oi road-er `ys` local-e `levels.yOf('main', t)` dhore bodlate hobe + `BridgeSpec` "over road" + niche cross road-er cut thik. | `RoadNetwork` (profile override after `buildProfile`), `BridgeBuilder`, terrain cut | **Shobcheye risky** (ager road-er profile/grade/pad-er sathe dhonddo) | Main-er ys = level plan; niche cross road clear (5.5 m); old road-er onno ongsho hubohu same |
| **4 AI** | AI ramp-e chale: `RoadGraph`-e ramp link (diverge/merge, one-way `dir=+1`), `Route` ramp-e dhoke/berobe, spawn ramp-e (shesh-e). `model.links` ready data. | `traffic/RoadGraph.ts`, `Route.ts`, `AIDriver.ts` | High: AI-er graph pad dhore | AI gari main -> ramp -> cross jay, abar fire; stuck 0 (headless sim) |
| **3D-C** | Structure-er asol 3D mesh + renderer: arch/pavilion/fountain/palm/billboard `InstancedMesh` (`model.structures`), wall ribbon (`model.walls`), garden/pond zone. Pattern: `StreetLights.ts`. Config entry-te `dressing` field. | notun `interchange/InterchangeView.ts`, `core/Engine.ts` | Low (alada layer), kintu **shudhu game-e dekha jay** | Chokhe; LOD (`STRUCTURE_DEFS.lodNear/lodFar`); draw call ~ def-er sonkha |
| **5 Interchange-aware** | `footprintR`-er bhitore: median, U-turn, sign gantry, `sixLaneJunction`, gach/hedge, street light, rail crossing | `MedianPlan`, `UTurns`, `signs/*`, `Roadside` | Medium | Ramp-er upor gach/sign/median-er bhul nai |
| **6 Physics check** | Ramp-er upor chaka-r physics (`BridgePhysics`-er moto kaj kore kina) | `BridgePhysics.ts` | Low-med | Gari ramp-e chalano, loop-e |
| **7 Aro pattern** | trumpet (3-leg T), stack/turbine (semi-direct flyover), collector-distributor, roundabout interchange | `Patterns.ts` (`registerPattern`) | Low (table row) | `interchange-test` e pattern + validator |
| **8 Perf** | Lazy build (`LazyInfra`-r moto), cache `buildInterchange`, LOD | `Engine.ts` | Low | Frame time ager moto, 50 interchange-e o |

**Notun interchange boshanor niyom:** `Config.roads.interchange.list`-e ek line (`scripts/interchange-candidates.ts` chalaile fit jaygar list pabe). Notun pattern = `registerPattern` e ek row.

## 5. Shimana / jana jinis
- Cross road ke main-er **90°** dhora hoy (sin >= 0.9); skew pore.
- Left-hand traffic (Bangladesh): slip = left turn (structure-er age), loop = right turn (pore).
- Candidate checker-er threshold (9 m cut/fill, 20 m onno road) shabdhani; shohortoli (avenue x avenue) bad.
- `Parts.ts` pier/lamp/railPost data ekhono renderer-e jora hoy ni (ramp-er bridge-er pier `BridgeBuilder` nije banay, tai ota lage na).
- Flag on korle `RailNetwork` `roads.bridges` dekhe, ramp bridge-o ashe (flag off-e na).
- **Game chalano jayni** ei machine-e. Shob proman: headless test + `tsc` + top/side SVG.

## 6. Pre-existing (amar bodol-er na)
`road-test.ts`-e 2 FAIL, `tsc`-e ~109 noise error (missing `three`/`rapier` type) — original main-eo hubohu ekii.

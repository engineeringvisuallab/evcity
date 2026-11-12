# INTERCHANGE SYSTEM — foundation (Step 1)

Ei foundation-e **game-er kono purono file bodlay ni**. Shob kichu notun `src/interchange/` folder-e, ar game ekhono eta use kore na. Tai game nosto howar kono jhuki nai. Ekhon porjonto jeta ache: ramp-er geometry, height, validation, AI link, instanced part-er sonkha, decoration zone. Jeta nai: road network / renderer / AI-er sathe jora (niche "Wiring" dekho).

## Mool idea: interchange = DATA
```
InterchangeSpec  ->  buildInterchange()  ->  InterchangeModel
(kothay, kon 2 road,                          (ramps, levels, links, zones, parts, issues)
 kon pattern, kichu number)
```
Renderer / road network / traffic shudhu **model porbe**. Notun pattern mane notun table-row, notun renderer na. Eta-i load kom rakhe: mesh/geometry ekbar, number onek.

## Folder
| File | Kaj |
|---|---|
| `Geometry2D.ts` | Turtle (straight + arc), bezier, resample, radius, distance, crossing. Pure math. |
| `InterchangeTypes.ts` | Shob type + `INTERCHANGE_DEFAULTS` (ekta jaygay shob number). |
| `Patterns.ts` | **Pattern table** (`diamond`, `cloverleaf`, `parclo`) + role builder (`slip`, `loop`, `diamondOff`, `diamondOn`) + `registerPattern()`. |
| `Levels.ts` | Kon road bridge, height profile (smoothstep, grade limit), ramp height. |
| `Builder.ts` | `buildInterchange(spec)` — shob joro kore model banay. |
| `Validate.ts` | Radius / grade / gap / clearance / lane-join check. |
| `Parts.ts` | Pier, lamp, rail post: `Float32Array` row (x, y, z, yaw, size). |
| `RoadAdapter.ts` | `Ramp -> RoadSpec` (asol `RoadSpec` type import kore, tai type bodlale typecheck fail kore). |
| `index.ts` | Export. |

`scripts/interchange-test.ts` (headless test), `scripts/interchange-preview.ts` (top-view SVG banay), `docs/interchange-preview/*.svg|png` (3 pattern-er chhobi).

## Coordinate / traffic niyom
- Local frame: `u` = main road-er travel direction, `v` = tar **bam (left)**. Cross road `v`-er dike chole.
- World: `x = cx + u*cos(yaw) + v*sin(yaw)`, `z = cz + u*sin(yaw) - v*cos(yaw)` — `RoadSpec.nx/nz` (left normal) er sathe ek.
- Game **left-hand traffic**. Tai:
  - **slip** = left turn: road-er aage (structure-er age) bam dike berobe, 90° ghure cross road-e jabe.
  - **loop** = right turn: structure-er **pore** bam dike berobe, 270° ghure cross road-e fire ashbe.
- Prottek ramp **one-way**; `Join.t` = road-er center theke signed doori (main-e `u`, cross-e `v`).

## Pattern table
| Pattern | Ramp | Kokhon |
|---|---|---|
| `diamond` | 4 | Chhoto jaygay. Cross road at-grade thake, 4 ta terminal (junction pad) lage. |
| `cloverleaf` | 8 (4 slip + 4 loop) | Light/crossing chhara full interchange. Footprint ~285 m radius. Loop-er bhitore bagan/pukur. |
| `parclo` | 4 (2 slip + 2 loop, opposite quadrant) | Ekdike nodi/pahar/building thakle; baki 2 quadrant faka. |

**Notun pattern:** `registerPattern({ id, label, approaches, roles, note })`. `approaches` = 0 main-forward, 1 cross-forward, 2 main-backward, 3 cross-backward. Role gulo ekbar canonical frame-e ankha, builder 90° ghuriye baki approach-e boshay. Role table-e na paile `custom(main, cross, P)` diye nijer ramp (local frame) dao.

Ja ekhono nai (pore add hobe, ekta ekta role/pattern): trumpet (3-leg T), turbine/stack (semi-direct flyover ramp, 2 level-er upor), collector-distributor, roundabout interchange.

## Structure kit (arch, pavilion, fountain, palm, billboard, retaining wall)
Tomar reference chhobi-r moto onek rokom structure thakbe, tai structure = **table-er ekta row**, interchange-er pattern theke alada.

| Def | Kothay boshe | Kivabe draw |
|---|---|---|
| `arch` | Upper road-er upor, crossing-er dui pashe (`lowerHalf + 22` m), pura carriageway jure (`scale` = chawra m) | Instanced |
| `pavilion` | `garden` loop-er majhkhane | Instanced |
| `fountain` | `pond` loop-er majhkhane | Instanced |
| `palm` | Loop-er bhitore ring (radius-er 0.7 / 0.82) | Instanced |
| `billboard` | Prottek `slip` / `diamondOff` ramp-er 30 % jaygay, baire, oncoming traffic-er dike mukh | Instanced |
| `wall` | Ramp-er embankment stretch (1.2 m < height <= `pierFromH`), duidik | **Ribbon** (`model.walls`, ramp point `i0..i1`), instance na |

- **Dressing:** `InterchangeSpec.dressing = 'plain' | 'garden' | 'grand' | ['arch', 'palm', ...]`. Default `plain` = kichu na (ager moto). `garden` = pavilion + fountain + palm. `grand` = shob.
- **Output:** `model.structures[]` = `{ def, data: Float32Array, stride: 6 }` (x, y, z, yaw, scale, variant) — ek def = **ekta InstancedMesh**, shob interchange-er jonno. `model.walls[]`, `model.budget` = `{ instances, trisHint }`.
- **Budget:** ekta interchange-e 600 instance-er beshi hole `issues`-e `budget` warn. Mesh ekbar, instance sasta: 50 interchange x 40 structure = ~5 draw call.
- **LOD:** `STRUCTURE_DEFS[x].lodNear / lodFar` — dur theke skip, majhari doorte shoja mesh.
- **Deterministic:** interchange `id` theke seeded random; same id = same arrangement, alada id = alada.
- **Notun structure** (gazebo, gate, statue, bus shelter ...): `STRUCTURE_DEFS`-e ek row + `placeStructures()`-e ekta case. Pattern / builder / renderer loop bodlay na.
- **Ramp-er upor 'river bridge' jatiyo structure** (reference-e nodi-r upor bridge) — eta ager `BridgeBuilder` (existing bridge) kore; Step 2c-te "over road" ar "over water" ramp-e ek-i bridge pipeline hobe.

## Parameter (`InterchangeSpec.params`, default `INTERCHANGE_DEFAULTS`)
| Naam | Default | Mane |
|---|---|---|
| `clearance` / `deckThickness` | 5.5 / 1.4 m | Niche-r road theke deck-er niche porjonto; upper road ei-ta + oi-ta uthe. Minimum 4.6 m (`clearance-min` error). |
| `upperMaxGrade` | 0.04 | Upper road-er dhal. Smoothstep, tai shobcheye khara jaygay = ei-ta. |
| `rampMaxGrade` | 0.05 | Ramp-er dhal. |
| `rampHalfWidth` | 4.2 m | One-way ramp (1 lane + shy). |
| `loopR` | 48 m | Loop radius (35 km/h design). |
| `slipR`, `slipSize` | 110 / 250 m | Slip-er bend radius, footprint (S). |
| `diamondNose`, `diamondTerminalV` | 240 / 75 m | Diamond-er gore doori, terminal-er doori. |
| `designKmh` | loop 35, slip 50, diamond 50 | Radius check + AI speed hint. `R >= V²/(127·0.21)`. |
| `minGap` | 14 m | Duita ramp-er moddhe minimum doori. |
| `pierFromH` | 3 m | Ei-r upor = pier/bridge, niche = embankment. |
| `decor` | `mixed` | Loop infield: `none / garden / pond / mixed`. |

`upper: 'main' | 'cross'` — kon road bridge (default `main`). Dui-tai test kora.

## Validation (`model.issues`)
`radius`, `grade`, `gap`, `clearance` (ramp×ramp, ramp×road), `clearance-min`, `join-heading` (lane-er dik thik ache kina — left-hand check), `join-lane` (kerb-lane offset). **Wiring-er shomoy `errors.length === 0` na hole interchange boshano jabe na** — eta asol safety net.

## Load kom rakhar niyom (wiring-er shomoy mene chola)
1. **Ek geometry, shob interchange:** pier / lamp / rail post `InstancedMesh` — kind-prottek **ekta** draw call, shob interchange-er jonno. `model.parts[i].data` e shudhu number.
2. **Ramp = road-chunk-er mesh:** `rampToRoadSpec()` diye ramp-ke normal `RoadSpec` kore **ager ribbon mesh / terrain cut** e dao. Alada mesh pipeline banio na.
3. **Lazy build:** `LazyInfra`-r moto — player `footprintR + margin`-er moddhe ashle build/attach, dure gele drop. `buildInterchange` ~1–8 ms, deterministic (same spec = same output), tai cache kora jay.
4. **Decoration LOD:** `model.zones` (garden/pond) shudhu kachhe; dur theke ekta flat color circle.
5. **Culling radius = `footprintR`.** Chunk/LOD er jonno ei-ta e use koro.
6. Ramp-er `elevated` range-ei bridge/pier; baki embankment (mesh lagbe na, terrain-er cut/fill).

## Wiring (porer step-gulo, ekta ekta kore)
| # | Kaj | Kon file |
|---|---|---|
| 1 | ✅ **Hoyeche (Step 2a):** `RoadKind`-e `'ramp'` (1 lane) — `RoadTypes`, `RoadNetwork.KIND`, `StreetLights`, `Junctions`, `VehicleUse`. Kono road ekhono `ramp` na, tai behaviour bodlay ni. | `roads/RoadTypes.ts`, `RoadNetwork.ts` (`KIND`) |
| 2a | ✅ **Hoyeche:** `RoadKind 'ramp'`. | (uporer row) |
| 2b | ✅ **Hoyeche (flag off):** `Config.roads.interchange` theke ramp road gulo `RoadNetwork`-e (`layoutInterchanges`, pad-er por). Ramp-er height hubohu level plan (`fixedY`). AI ramp-e spawn kore na. | `core/Config.ts`, `RoadNetwork.ts`, `traffic/RoadGraph.ts` |
| 3D-A | ✅ **Hoyeche (flag off):** ramp-er `elevated` stretch (>3 m ground-er upor) **existing bridge pipeline-e** (dry viaduct `BridgeSpec`, `bridgeOf`): deck, parapet, pier (`BridgeBuilder`), collider (`BridgePhysics`), street light, terrain deck-er niche **chhara thake** (earth dam hoy na). 3 m-er kom = embankment. | `RoadNetwork.ts` (`bridgeRamp`) |
| 3D-B | **Upper road (main) ke bridge kora:** main road ekhono ground-e, uthte hole oi road-er height local-e bodlate hobe + niche cross road-er cut thik rakha. Shobcheye risky. | `RoadNetwork.ts`, `BridgeBuilder.ts` |
| 3 | `Join.kind === 'terminal'` mane junction pad (diamond). Gore/merge-e taper (`Link.taperLen`, 80 m). | `Junctions.ts` |
| 4 | **AI:** `RoadGraph`-e ramp-link (diverge/merge) + one-way (`dir = +1` shudhu). Pad chhara jora lagbe. | `traffic/RoadGraph.ts`, `Route.ts` |
| 5 | Median, U-turn, sign gantry, `sixLaneJunction`, gach/hedge, street light, rail crossing — `footprintR` er bhitore interchange-aware. | `MedianPlan`, `UTurns`, `signs/*`, `Roadside` |
| 6 | Renderer: `model.parts` -> InstancedMesh; `model.zones` -> garden/pond. | notun `interchange/InterchangeView.ts` |
| 7 | Ramp physics (chaka) — `BridgePhysics` er moto; **ekhono check kora hoy ni.** | `roads/BridgePhysics.ts` |

## Shimana (jene rakho)
- Cross road ke main-er sathe **90°** dhora hoy (`Junctions.ts` ager moto arm shoja kore dey; skew pore).
- Ramp-er piers/embankment-er jonno `ground(x, z)` callback dite paro (`buildInterchange(spec, ground)`); na dile flat `spec.y`.
- Ei step-e game chalano jayni (`node_modules` nai). Module + test headless chole, `tsc` (strict, noUnused*) e interchange file-e error nai, `RoadSpec` type-er sathe mile.

## Chalu korbe kivabe (Step 2b theke)
`Config.roads.interchange` — default **off**:
```ts
interchange: { enabled: true, list: [
  { id: 'I1', pattern: 'cloverleaf', x: -1969, z: -200, yaw: 1.57, main: 'highway', cross: 'avenue' },
] }
```
`yaw` = main road-er world heading (`Math.atan2(dz, dx)`), `x/z` = junction-er center (HUD-er X/Z). Ground height default = oi jaygar road surface. Bhul entry (unknown pattern / validation error) skip hoy, console.warn dey, world build bhange na.

## Chalano
```
npx tsx scripts/interchange-test.ts      # 41 check, ALL OK
npx tsx scripts/interchange-network-test.ts   # asol RoadNetwork-e, ~40 s
npx tsx scripts/interchange-profile.ts   # docs/interchange-preview/profile.svg: ramp-er side view asol terrain-e
npx tsx scripts/interchange-preview.ts   # docs/interchange-preview/*.svg
```

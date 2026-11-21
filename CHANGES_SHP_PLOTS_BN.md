# CHANGES_SHP_PLOTS_BN - shapefile plot gula game e (plot + building)

## Ki kora hoyeche
- `Plot/Plot.shp` er 18ta polygon (tomar aka plot) game er city te boshano hoyeche: **18 plot**, protita te **1ta building**.
- Plot gula SH-6+15 ar SH-7+16 street er majher block e, tomar drawing er moto 2 column e. Protita plot e deyal (wall) + **1ta gate (street er dike)** + kichu gach, thik ager plot gular moto.
- Drawing er sathe **samanno poriborton** (tumi bolechile): plot gula drawing er bhitore thake, kintu road/footpath, rail, site theke dure sore ashe. Tai 14ta plot drawing er ~90% e ache, 15 ar 17 ~80%, ar uttor tip er 1 ar 2 rail er jonno ~50%. Area soman na, tai building o plot onujai alada.
- Street theke wall 7.4 m (road 3.6 + footpath 3.0 + 0.8 gap). Tumi 6.6 m e akechile (footpath er kinara), 0.8 m bhitore sorano.

## Plot table (game metre, drawing record no. = plot no.)
| Plot | Street | Drawn m2 | Now m2 | % | Building |
|---|---|---|---|---|---|
| 1 | SH-6+15 | 2432 | 1283 | 53% | pharmacy 9x11 |
| 2 | SH-7+16 | 2534 | 1255 | 50% | pharmacy 9x11 |
| 3 | SH-6+15 | 2350 | 2148 | 91% | office-mid 27x26 |
| 4 | SH-7+16 | 2462 | 2271 | 92% | cinema 27x35 |
| 5 | SH-6+15 | 2090 | 1920 | 92% | bank 26x24 |
| 6 | SH-7+16 | 2361 | 2193 | 93% | office-mid 27x26 |
| 7 | SH-6+15 | 2064 | 1864 | 90% | bank 26x24 |
| 8 | SH-7+16 | 2341 | 2164 | 92% | office-mid 27x26 |
| 9 | SH-6+15 | 1885 | 1738 | 92% | clinic 22x25 |
| 10 | SH-7+16 | 2177 | 2009 | 92% | apartment-high 27x20 |
| 11 | SH-6+15 | 1909 | 1754 | 92% | villa 24x28 |
| 12 | SH-7+16 | 2175 | 2002 | 92% | apartment-high 27x20 |
| 13 | SH-6+15 | 1908 | 1757 | 92% | restaurant 24x26 |
| 14 | SH-7+16 | 2011 | 1845 | 92% | restaurant 24x26 |
| 15 | SH-6+15 | 1761 | 1420 | 81% | apartment-mid 18x13 |
| 16 | SH-6+15 | 2256 | 2099 | 93% | apartment-high 27x20 |
| 17 | SH-7+16 | 1687 | 1353 | 80% | apartment-mid 18x13 |
| 18 | SH-7+16 | 2221 | 2021 | 91% | apartment-high 27x20 |

Building choose: jei boro model plot e fit kore (footprint + 10 m ucchu jayga wall o uthan er jonno). Hotel/supermarket fit korena (plot chhoto), tai office, cinema, bank, restaurant, clinic, villa, apartment, pharmacy.

## Ja replace hoyeche (ager jinis ja ei jayga te chilo)
- Old plot **PL-06 ar PL-07 (2ta Office tower)** - ei block er majhe chilo, drop kora hoyeche. Office tower (45x45) ei plot e fit korena. Office tower dorkar hole bolo, onno jayga e boshabo.
- Vacant plot **V-730, V-772, V-773** drop.
- Hand placed **office-mid (-222, 182)** drop (notun plot 2 / ei area te notun office ache).
- City-fill ghor je plot er bhitore chilo (29ta) agei auto drop hoy (insideAnyPlot), notun kono ghor plot e dhoke nai.

## Files (changed files only)
- NEW `src/buildings/PlacementsShpPlots.ts` (GENERATED: 18 plot, 18 building, drop list). Upore `SHP_PLOTS_ON = true` - `false` korle sob ager moto.
- NEW `src/buildings/CityPlotsAll.ts` (old plot + vacant + notun plot merge, drop list apply). Generated file gula abar run korleo merge hariye jabe na.
- CHANGED `src/buildings/PlotYards.ts` (merge list use kore; gach/tree 4-kon plot e o thik jayga e - rectangle na hole bilinear mapping + deyal theke 4 m door; ager rectangle plot gular tree position **ek i** thake, 135803 jayga check korechi, 0 poriborton).
- CHANGED `src/buildings/Placements.ts` (building list merge + replace list), `src/buildings/PlacementsResidential.ts` (ghor drop test merge).
- NEW `tools/shp-plots-build.py` (rerun: `python3 tools/shp-plots-build.py Plot/Plot.shp`), `Plot/Plot.*` (tomar shapefile), `docs/shp_plots_preview.png` (chobi), `docs/shp_plots_result.json`.

## Check (ki chalalam)
- Typecheck (tsc, strict + noUnusedLocals) amar 6 file e: **0 error** (three/rapier node_modules nai bole stub diye).
- 18 plot er deyal line: road surface e 0 point, rail corridor e 0 point; jomi slope <= 0.8 m (+-20 m).
- Notun building gula kono building/city-fill ghor er sathe overlap kore na (0), plot er bhitore sob footprint.
- `scripts/placements-test.ts`: **2 FAILED, ager moto ek i 2ta** (duplicate id + `zone != city-plot`; ager 87 spot e o same fail, ekhon 102 spot). Notun kono road/rail/water/slope fail nai.
- `scripts/mission-test.ts`: all ok.
- **Chalate parini:** `npm run build` (node_modules/vite nai, network off), game e charakter diye dekha, `npm run test:tower` (ei zip er package.json e ei script nai).
- Tumi game e ekbar dekho: SH-6+15 / SH-7+16 er majher block (x -460..-160, z 130..500).

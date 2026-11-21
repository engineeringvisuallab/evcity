// The city plots as the game uses them: the generated rows of PlacementsPlots.ts (STEP 3) and PlacementsVacant.ts, plus the plots the user drew
// (PlacementsShpPlots.ts, tools/shp-plots-build.py), minus the old rows that stood in the same land.
// PlotYards (wall, gate, trees), Placements (the buildings) and PlacementsResidential (city-fill houses inside a plot are dropped) read THIS file,
// so the generated files can be re-run without losing the plot merge.
import { CITY_PLOTS, CITY_PLOT_BUILDINGS, CITY_PLOT_REPLACES, insideCityPlot, type CityPlot } from './PlacementsPlots';
import { VACANT_PLOTS, insideVacantPlot, type VacantPlot } from './PlacementsVacant';
import type { BuildingPlacement } from './Placements';
import {
  SHP_PLOTS, SHP_PLOT_BUILDINGS, SHP_DROP_PLOT_IDS, SHP_DROP_PLOT_BUILDING_SEEDS, SHP_DROP_VACANT_IDS, SHP_REPLACES,
} from './PlacementsShpPlots';

/** Old city plots (the ones the drawn plots replace are gone) + the drawn plots. */
export const ALL_CITY_PLOTS: readonly CityPlot[] = [...CITY_PLOTS.filter((p) => !SHP_DROP_PLOT_IDS.includes(p.id)), ...SHP_PLOTS];
/** Vacant plots without the ones the drawn plots replace. */
export const ALL_VACANT_PLOTS: readonly VacantPlot[] = VACANT_PLOTS.filter((p) => !SHP_DROP_VACANT_IDS.includes(p.id));
/** One building per building plot (old plot buildings of replaced plots removed, drawn plot buildings added). */
export const ALL_PLOT_BUILDINGS: readonly BuildingPlacement[] = [
  ...CITY_PLOT_BUILDINGS.filter((b) => b.seed === undefined || !SHP_DROP_PLOT_BUILDING_SEEDS.includes(b.seed)),
  ...SHP_PLOT_BUILDINGS,
];
/** Hand placed buildings (Placements.ts) that a plot building replaces: matched by id + x + z. */
export const PLOT_HAND_REPLACES: readonly { id: string; x: number; z: number }[] = [...(CITY_PLOT_REPLACES ? [CITY_PLOT_REPLACES] : []), ...SHP_REPLACES];

/** Is (x, z) inside a drawn plot (+ margin m)? Same test as insideCityPlot (convex 4-corner plot). */
function insideShpPlot(x: number, z: number, margin: number): boolean {
  for (const p of SHP_PLOTS) {
    if (Math.abs(x - p.c[0]) > 120 || Math.abs(z - p.c[1]) > 120) continue;
    let neg = false, pos = false;
    for (let i = 0; i < 4; i++) {
      const a = p.poly[i]!, b = p.poly[(i + 1) % 4]!;
      const ex = b[0] - a[0], ez = b[1] - a[1], len = Math.hypot(ex, ez);
      const cr = (ex * (z - a[1]) - ez * (x - a[0])) / len;
      if (cr < -margin) neg = true; else if (cr > margin) pos = true;
    }
    if (!(neg && pos)) return true;
  }
  return false;
}

/** Is (x, z) in land that a plot owns (old city plot, vacant plot or drawn plot)? The city-fill houses whose centre is in such land are dropped. The old rows
 *  stay in this test even when a drawn plot replaced them, so the houses around do not come back. */
export function insideAnyPlot(x: number, z: number, margin = 0): boolean {
  return insideCityPlot(x, z, margin) || insideVacantPlot(x, z, margin) || insideShpPlot(x, z, margin);
}

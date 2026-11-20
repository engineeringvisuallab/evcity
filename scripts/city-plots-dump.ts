// Step 3 helper: dumps the 17 city streets + all buildings to docs/city_plots_input.json for tools/city-plots-plan.py.
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/city-plots-dump.ts
import { writeFileSync } from 'node:fs';
import { CITY_SHP_LINE_DATA } from '../src/roads/city/CityShpLineData';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
import { RESIDENTIAL_PLACEMENTS } from '../src/buildings/PlacementsResidential';
writeFileSync('docs/city_plots_input.json', JSON.stringify({streets: CITY_SHP_LINE_DATA.map(l=>({name:l.name,cls:l.cls,pts:l.pts})), hand: BUILDING_PLACEMENTS, nfill: FILL_PLACEMENTS.length, fill: [...FILL_PLACEMENTS, ...RESIDENTIAL_PLACEMENTS].map(b=>({id:b.id,x:b.x,z:b.z,W:b.W,D:b.D,yaw:b.yaw}))}));
console.log('ok');

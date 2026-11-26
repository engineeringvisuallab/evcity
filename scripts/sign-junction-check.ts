// DIAG: which existing sign gantries stand near a junction / interchange (read only)
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildJunctionRegistry } from '../src/roads/JunctionRegistry';
import { ROAD_SIGN_SPOTS } from '../src/signs/RoadSignData';
import { RTE_M3_DATA } from '../src/roads/junction/RteM3Data';
import { RTE_M4_DATA } from '../src/roads/junction/RteM4Data';
const g: any = new TerrainGenerator(Config.world.seed);
const roads = g.roads.roads;
const reg = buildJunctionRegistry(roads);
const hubs: { id: string; x: number; z: number }[] = reg.nodes.map((n: any) => ({ id: n.id + ' ' + n.type + ' ' + n.legs.map((l: any) => l.name).join('+'), x: n.x, z: n.z }));
hubs.push({ id: 'RTE', x: 2335, z: 1438 }, { id: 'ringN', x: 2106, z: -2761 }, { id: 'J1', x: -87, z: -277 });
for (const r of [RTE_M3_DATA, RTE_M4_DATA]) for (const p of r.pts) hubs.push({ id: r.name, x: p[0], z: p[1] });
const out: string[] = [];
let bad = 0;
for (const s of ROAD_SIGN_SPOTS) {
  const big = s.sections >= 3;
  let bd = 1e9, bn = '';
  for (const h of hubs) { const d = Math.hypot(h.x - s.x, h.z - s.z); if (d < bd) { bd = d; bn = h.id; } }
  // nearest OTHER road point (any road with a different name)
  let rd = 1e9, rn = '';
  for (const r of roads) { if (r.earth || r.name === s.road) continue; for (let k = 0; k < r.xs.length; k++) { const d = Math.hypot(r.xs[k] - s.x, r.zs[k] - s.z); if (d < rd) { rd = d; rn = r.name; } } }
  const lim = big ? 150 : 60;
  const flag = bd < lim || rd < (big ? 120 : 50);
  if (flag) bad++;
  out.push(`${flag ? 'BAD ' : 'ok  '}${s.id} ${s.road} s${s.s} (${s.x},${s.z}) hub ${bd.toFixed(0)} m [${bn}] otherRoad ${rd.toFixed(0)} m [${rn}]`);
}
console.log(out.filter((l) => l.startsWith('BAD')).join('\n'));
console.log(`\n${bad} of ${ROAD_SIGN_SPOTS.length} flagged; roads ${roads.length}, junction nodes ${reg.nodes.length}`);

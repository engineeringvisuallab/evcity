// ROAD SIGN BOARDS - Step 1 (headless): checks every gantry of src/signs/RoadSignData.ts with its OWN loops (independent of the generator). Run: npx tsx scripts/road-signs-test.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { ROAD_SIGN_SPOTS } from '../src/signs/RoadSignData';
import { BOARD_H, BOARD_TOP, GANTRY, POST_TOP, gantryLayout, sectionsForLanes } from '../src/signs/RoadSignSpec';
import { ROADSIDE_ALL } from '../src/buildings/PlacementsRoadside';
import { gantrySolids } from '../src/signs/SignSolids';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const g = new TerrainGenerator(Config.world.seed);
const sc = g.makeSample();
const roads = g.roads.roads;
ok(ROAD_SIGN_SPOTS.length >= 60, `gantries: ${ROAD_SIGN_SPOTS.length}`);
ok(BOARD_TOP - BOARD_H >= 5.5 - 1e-9 && GANTRY.clearance >= 5.5, `board lower edge ${GANTRY.clearance} m >= 5.5 m, posts top ${POST_TOP.toFixed(2)} m`);
for (const s of ROAD_SIGN_SPOTS) {
  const r = roads.find((q) => q.name === s.road && !q.earth)!;
  let bi = 0, bd = 1e9;
  for (let i = 0; i < r.xs.length; i++) { const d = Math.hypot(r.xs[i] - s.x, r.zs[i] - s.z); if (d < bd) { bd = d; bi = i; } }
  const tag = `${s.id} (${s.road} s ${s.s})`;
  ok(bd < 0.3, `${tag}: origin on the centreline (${bd.toFixed(2)} m)`);
  ok(Math.abs(r.ys[bi] - s.y) < 0.02, `${tag}: origin height = road surface`);
  ok(s.edge >= r.halfWidth + r.shoulder + 1.5, `${tag}: posts ${s.edge} m from the centreline, outside kerb + shoulder (${(r.halfWidth + r.shoulder).toFixed(1)} m)`);
  const lay = gantryLayout(r.halfWidth, r.shoulder, r.lanes);
  ok(s.sections === sectionsForLanes(r.lanes) && s.sections === lay.sections && s.sections >= 2 && s.sections <= 4, `${tag}: ${r.lanes} lanes -> ONE board with ${s.sections} coloured sections`);
  ok(Math.abs(s.boardW - lay.boardW) < 1e-6 && s.boardW <= 2 * s.edge - 2 * GANTRY.postR && s.boardW >= 2 * (r.halfWidth) - 1, `${tag}: board ${s.boardW} m wide, from post to post, covers the whole road (${(2 * r.halfWidth).toFixed(1)} m)`);
  // frame: +X (driver's right) is opposite to the road's left normal
  const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
  ok(rx * r.nx[bi] + rz * r.nz[bi] < -0.95, `${tag}: +X is the driver's right (left normal of the road is -X)`);
  // no bridge, no other road, no rail, no water at the posts
  let bridge = false;
  for (let k = Math.max(0, bi - (r.lanes >= 6 ? 9 : 5)); k <= Math.min(r.xs.length - 1, bi + (r.lanes >= 6 ? 9 : 5)); k++) if (r.bridgeOf[k] >= 0) bridge = true;
  ok(!bridge, `${tag}: no bridge within 70 m (6 / 8 lane) or 35 m (2 / 4 lane)`);
  let other = 1e9, oname = '';
  for (const o of roads) if (o.id !== r.id && !o.earth) for (let k = 0; k < o.xs.length; k++) { const d = Math.hypot(o.xs[k] - s.x, o.zs[k] - s.z); if (d < other) { other = d; oname = o.name; } }
  const need = r.lanes >= 6 ? 120 : 50;
  ok(other >= need, `${tag}: nearest other road ${oname} ${other.toFixed(0)} m (>= ${need})`);
  let rail = 1e9;
  for (const e of g.rail.edges) for (let k = 0; k < e.xs.length; k++) rail = Math.min(rail, Math.hypot(e.xs[k] - s.x, e.zs[k] - s.z));
  ok(rail >= 30 + s.edge, `${tag}: rail ${rail.toFixed(0)} m away`);
  let wet = false;
  for (const sg of [-1, 1]) { g.sample(s.x + rx * s.edge * sg, s.z + rz * s.edge * sg, sc); if (!Number.isNaN(sc.water) && sc.h <= sc.water + 0.5) wet = true; }
  ok(!wet, `${tag}: posts on dry ground`);
  let rb = '';
  for (const sg of [-1, 1]) for (const b of ROADSIDE_ALL) if (Math.hypot(s.x + rx * s.edge * sg - b.x, s.z + rz * s.edge * sg - b.z) < Math.hypot(b.W, b.D) / 2 + 8) rb = b.id;
  ok(rb === '', `${tag}: posts clear of the city roadside buildings ${rb}`);
  ok(Math.abs(s.feetL) <= 7 && Math.abs(s.feetR) <= 7, `${tag}: post feet ${s.feetL} / ${s.feetR} m from the road surface`);
  ok(gantrySolids(s.edge, [s.feetL, s.feetR], POST_TOP, GANTRY.postR, GANTRY.postBelow, GANTRY.baseSize, GANTRY.baseHeight, 0).length === 4, `${tag}: 4 solids (2 posts, 2 bases)`);
}
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);

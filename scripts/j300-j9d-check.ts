// J9-d CHECK (headless, real game data): (1) old furniture of the removed R6-9 (cp-37, cp-38, sign-17), (2) the junction ground as a vegetation mask (grass / trees / rocks),
// (3) the ring floor under the box (collision ground), (4) minimap shapes. Run: npx tsx scripts/j300-j9d-check.ts docs   Writes docs/J300_J9D.txt (+ .json for tools/j300-j9d-plot.py).
// Two child runs (switch OFF and ON). PASS / FAIL on every line, NOT RUN is printed.
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { roadStationSites } from '../src/parking/ActiveStationSites';
import { ROAD_STATION_SITES } from '../src/parking/RoadStationSites';
import { parkingContains } from '../src/parking/ParkingSite';
import { StationPads } from '../src/parking/StationPads';
import { roadSignSpots } from '../src/signs/ActiveSigns';
import { ROAD_SIGN_SPOTS } from '../src/signs/RoadSignData';
import { j300InFootprint, j300MapShapes } from '../src/roads/junction/J300Footprint';
import { j300Local } from '../src/roads/junction/J300Zone';
import { J300_STRUCT_C as C } from '../src/roads/junction/J300StructC';
import { J300_ARMS, J300_FRAME as F } from '../src/roads/junction/J300Geometry';
import { buildJ300Mesh } from '../src/roads/junction/J300SolidMesh';

const mode = process.argv[2];
const r2 = (x: number): number => Math.round(x * 100) / 100;
const CC: any = C;

if (mode === 'ON' || mode === 'OFF') {
  Config.roads.junctionJ300.enabled = mode === 'ON';
  const g: any = new TerrainGenerator(Config.world.seed);
  // --- furniture
  const sites = roadStationSites(), signs = roadSignSpots();
  const cp = ROAD_STATION_SITES.filter((s) => s.id === 'cp-37' || s.id === 'cp-38');
  const others = ROAD_STATION_SITES.filter((s) => s.id !== 'cp-37' && s.id !== 'cp-38');
  const furn = {
    sites: sites.length, signs: signs.length,
    hasCp: ['cp-37', 'cp-38'].map((id) => sites.some((s) => s.id === id)),
    hasSign17: signs.some((s) => s.id === 'sign-17'),
    cpKeepOut: cp.map((s) => parkingContains(s.x + Math.sin(s.yaw) * 0, s.z, 0)),
    otherKeepOut: others.filter((s) => parkingContains(s.x, s.z, 0)).length, others: others.length,
    pads: (new StationPads() as any).pads.length,
  };
  // --- footprint mask on the real road network: vegMaskAt vs maskAt over a grid of the footprint bounding box
  const roads: any = g.roads;
  const m1 = new Float32Array(2), m2 = new Float32Array(2);
  const STEP = 6;
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const a of CC.surfArms) for (const p of a.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  for (const r of CC.surfRamps) for (const q of r.rows) { x0 = Math.min(x0, q[0], q[6]); x1 = Math.max(x1, q[0], q[6]); z0 = Math.min(z0, q[1], q[7]); z1 = Math.max(z1, q[1], q[7]); }
  x0 -= 60; x1 += 60; z0 -= 60; z1 += 60;
  let cells = 0, fp = 0, diff = 0, diffOutsideFp = 0, maskedBefore = 0;
  for (let x = x0; x <= x1; x += STEP) for (let z = z0; z <= z1; z += STEP) {
    cells++;
    roads.maskAt(x, z, 1, m1); roads.vegMaskAt(x, z, 1, m2);
    const inF = j300InFootprint(x, z);
    if (inF) fp++;
    if (m1[1] > 0.01) maskedBefore++;
    if (Math.abs(m1[1] - m2[1]) > 1e-6 || Math.abs(m1[0] - m2[0]) > 1e-6) { diff++; if (!inF) diffOutsideFp++; }
  }
  // --- real trees (same trees the chunk worker places) inside the junction ground
  const plan = new CityPlan(g.sites);
  const tp: any = new TreePlacer(g, plan, Config.world.seed);
  const trees = tp.treesInRect(x0, z0, x1, z1) as { x: number; z: number }[];
  const treesInFp = trees.filter((t) => j300InFootprint(t.x, t.z)).length;
  // --- ring floor under the box (collision ground): terrain height vs the ring table of J7-C
  const tab: number[][] = CC.ringTable; const lvl = (u: number): number => { let i = 0; while (i < tab.length - 2 && tab[i + 1][0] < u) i++; const a = tab[i], b = tab[i + 1]; return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]); };
  const c = Math.cos(F.yaw), s = Math.sin(F.yaw); const sc = g.makeSample();
  let worst = 0, worstAt = '';
  for (let u = -60; u <= 60; u += 10) for (const v of [-14, -6, 6, 14]) {
    const x = F.ox + u * c + v * s, z = F.oz + u * s - v * c;
    g.sample(x, z, sc); const d = Math.abs(sc.h - lvl(u)); if (d > worst) { worst = d; worstAt = `u ${u} v ${v}: ground ${r2(sc.h)} ring ${r2(lvl(u))}`; }
  }
  console.log('JSON' + JSON.stringify({ furn, mask: { cells, fp, diff, diffOutsideFp, maskedBefore, bbox: [x0, z0, x1, z1].map(r2) }, trees: { n: trees.length, inFp: treesInFp }, floor: { worst: r2(worst), worstAt } }));
  process.exit(0);
}

const dir = process.argv[2] ?? 'docs';
const out: string[] = []; let fails = 0;
const P = (s = ''): void => { out.push(s); console.log(s); };
const CHK = (t: string, ok: boolean, n = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${t}${n ? '  ' + n : ''}`); };
const run = (m: string): any => { const o = execFileSync('npx', ['tsx', 'scripts/j300-j9d-check.ts', m], { encoding: 'utf8', maxBuffer: 1 << 28 }); const l = o.split('\n').find((q) => q.startsWith('JSON')); return JSON.parse((l ?? 'JSON{}').slice(4)); };
P('J9-d CHECK (headless, real game: road station sites, signs, vegetation mask, ring floor, minimap shapes, switch OFF vs ON)');
const off = run('OFF'), on = run('ON');

P(''); P('1) OLD FURNITURE OF THE REMOVED R6-9 (J9-a finding: cp-37, cp-38, sign-17)');
CHK('switch OFF: all ' + ROAD_STATION_SITES.length + ' station sites and ' + ROAD_SIGN_SPOTS.length + ' sign gantries exist (shipped state)', off.furn.sites === ROAD_STATION_SITES.length && off.furn.signs === ROAD_SIGN_SPOTS.length && off.furn.hasCp.every((q: boolean) => q) && off.furn.hasSign17, `${off.furn.sites} sites, ${off.furn.signs} signs`);
CHK('switch ON: cp-37 and cp-38 are gone, every other site is kept', on.furn.sites === ROAD_STATION_SITES.length - 2 && on.furn.hasCp.every((q: boolean) => !q), `${on.furn.sites} sites`);
CHK('switch ON: sign-17 is gone, every other gantry is kept', on.furn.signs === ROAD_SIGN_SPOTS.length - 1 && !on.furn.hasSign17, `${on.furn.signs} gantries`);
CHK('switch ON: the lot keep-out (trees / grass / rocks) of cp-37 / cp-38 is gone, all other sites keep theirs', off.furn.cpKeepOut.every((q: boolean) => q) && on.furn.cpKeepOut.every((q: boolean) => !q) && on.furn.otherKeepOut === off.furn.otherKeepOut, `cp keep-out OFF ${off.furn.cpKeepOut.join('/')}, ON ${on.furn.cpKeepOut.join('/')}; other sites ${on.furn.otherKeepOut} of ${on.furn.others}`);
CHK('switch ON: two terrain pads less (no flat pad is dug on the removed road)', on.furn.pads === off.furn.pads - 2, `OFF ${off.furn.pads}, ON ${on.furn.pads}`);

P(''); P('2) JUNCTION GROUND = VEGETATION MASK (grass, trees, rocks keep off the platform, arms, ramps, walls, slopes)');
const mesh = buildJ300Mesh(); const pos = mesh.positions, idx = mesh.indices; let nv = 0, hit = 0; const miss: number[][] = [];
for (const [a, b] of [mesh.parts.surface, mesh.parts.concrete, mesh.parts.slope, mesh.parts.furniture]) for (let t = a; t < b; t++) for (let k = 0; k < 3; k++) { const v = idx[t * 3 + k]; nv++; if (j300InFootprint(pos[v * 3], pos[v * 3 + 2])) hit++; else if (miss.length < 5) miss.push([r2(pos[v * 3]), r2(pos[v * 3 + 2])]); }
CHK('every vertex of the J7-C surface / concrete / slope / furniture mesh stands inside the footprint (the footprint is the mesh seen from above + 3 m, so 100 %)', hit === nv, `${hit} of ${nv} (${(100 * hit / nv).toFixed(2)} %)` + (miss.length ? '; first outside ' + JSON.stringify(miss) : ''));
const sh = j300MapShapes(); let armOk = 0, armN = 0;
for (const a of CC.surfArms) for (const p of a.pts) { armN++; if (j300InFootprint(p[0], p[1])) armOk++; }
CHK('every arm centre-line point and the roundabout centre are in the footprint', armOk === armN && j300InFootprint(CC.deck.cx, CC.deck.cz), `${armOk} of ${armN} arm points`);
CHK('far from the junction (600 m south-east of the roundabout, and 1 km west of the R6 free end) nothing is masked', !j300InFootprint(CC.deck.cx + 600, CC.deck.cz + 600) && !j300InFootprint(J300_ARMS.R6.end.x - 1000, J300_ARMS.R6.end.z), '');
CHK('switch OFF: vegMaskAt equals maskAt on every sampled cell (shipped state)', off.mask.diff === 0, `${off.mask.cells} cells, ${off.mask.diff} differ`);
CHK('switch ON: vegMaskAt differs from maskAt only inside the footprint, and does differ there (ground not yet masked by roads)', on.mask.diffOutsideFp === 0 && on.mask.diff > 0, `${on.mask.cells} cells (6 m), footprint ${on.mask.fp}, extra masked ${on.mask.diff}, outside ${on.mask.diffOutsideFp}`);
P(`INFO  masked by the old road mask before J9-d: ${on.mask.maskedBefore} of ${on.mask.cells} cells; footprint area about ${Math.round(on.mask.fp * 36)} m2 (${on.mask.fp} cells of 6 m), bbox ${JSON.stringify(on.mask.bbox)}`);
CHK('switch ON: no real tree (the ones the chunk worker places) stands inside the junction ground', on.trees.inFp === 0, `ON ${on.trees.inFp} of ${on.trees.n} trees in the area; OFF ${off.trees.inFp} of ${off.trees.n}`);
P('INFO  rocks and grass use the same vegMaskAt (rocks: all 5 probes, grass: blocked()); only the tree placement is run here with real data.');

P(''); P('3) RING FLOOR UNDER THE BOX (collision ground of the underpass; the box walls / roof / ramps are J7-C solids, wired in Engine since J7-C)');
const solid = mesh.parts; const tri = (r: [number, number]): number => r[1] - r[0];
CHK('J7-C collision parts are not empty (surface / concrete / slope triangles)', tri(solid.surface) > 0 && tri(solid.concrete) > 0 && tri(solid.slope) > 0, `${tri(solid.surface)} / ${tri(solid.concrete)} / ${tri(solid.slope)}`);
CHK('switch ON: the ground under the box (u -60..60, 4 lines) is within 0.35 m of the ring table level (cars and the player drive on it)', on.floor.worst <= 0.35, `worst ${on.floor.worst} m at ${on.floor.worstAt}; OFF worst ${off.floor.worst} m`);

P(''); P('4) MINIMAP SHAPES (the vector roads of the map come from the road list, the junction is added from the J7-C data)');
CHK('6 lines (2 arms + 4 ramps) and the roundabout circle of radius ' + CC.deck.ro + ' m', sh.lines.length === 6 && Math.abs(sh.circle.r - CC.deck.ro) < 1e-9, `${sh.lines.length} lines, half widths ${sh.lines.map((l) => r2(l.half)).join(' / ')}`);
CHK('every shape point lies within 1.2 km of the roundabout centre (nothing wild)', sh.lines.every((l) => l.pts.every((p) => Math.hypot(p[0] - sh.circle.x, p[1] - sh.circle.z) < 1200)), '');
const loc = j300Local(sh.circle.x, sh.circle.z);
CHK('the circle centre is the roundabout centre of the J300 frame (u 0, v 0)', Math.abs(loc.u) < 0.5 && Math.abs(loc.v) < 0.5, `u ${r2(loc.u)}, v ${r2(loc.v)}`);

P(''); P('NOT RUN: npm run build (vite) and tsc (no npm network in this chat, the check runs with a test stub for three), the in-game look, the real minimap worker (the flag is passed in code only: Minimap.ts -> MinimapRequest.j300 -> Config before the generator), the baked minimap picture, a driving / walking collision test in the box, rock and grass placement with real data (same mask, not run), buildings / homesteads inside the footprint, traffic (J10), signs and lights of J11.');
P(''); P(`${fails} FAIL`);
writeFileSync(`${dir}/J300_J9D.txt`, out.join('\n') + '\n');
writeFileSync(`${dir}/J300_J9D.json`, JSON.stringify({ fails, bbox: on.mask.bbox, shapes: sh, footprintCells: on.mask.fp }));

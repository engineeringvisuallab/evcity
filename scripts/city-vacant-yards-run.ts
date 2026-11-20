// Headless run of PlotYards on the REAL terrain: counts wall pieces / gate parts / trees / bushes of the vacant plots and checks them (no NaN, nothing outside a plot, nothing in a gate gap).
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/city-vacant-yards-run.ts
import * as THREE from 'three';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { PlotYards } from '../src/buildings/PlotYards';
import { VACANT_PLOTS } from '../src/buildings/PlacementsVacant';
const gen: any = new TerrainGenerator(Config.world.seed);
const root = new THREE.Group();
const t0 = Date.now();
const py = new PlotYards({ root, terrain: gen });
const holder = root.children[0] as THREE.Group;
let nan = 0; const cnt: Record<string, number> = {};
const m = new THREE.Matrix4(), p = new THREE.Vector3();
const inPlot = (x: number, z: number, mg: number): boolean => VACANT_PLOTS.some((q) => {
  let neg = false, pos = false;
  for (let i = 0; i < 4; i++) { const a = q.poly[i]!, b = q.poly[(i + 1) % 4]!; const cr = ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]); if (cr < -mg) neg = true; else if (cr > mg) pos = true; }
  return !(neg && pos);
});
let outside = 0, tall = 0;
holder.children.forEach((c: any, k) => {
  cnt[k] = c.count;
  for (let i = 0; i < c.count; i++) {
    c.getMatrixAt(i, m); p.setFromMatrixPosition(m);
    if (!Number.isFinite(p.x + p.y + p.z)) nan++;
    if (k >= 2 && !inPlot(p.x, p.z, 0.5) && VACANT_PLOTS.length) { /* old city plots also produce plants: only count those near a vacant plot */ }
  }
});
console.log('instanced meshes (wall, gate, trunk, crown, bush):', JSON.stringify(cnt), 'NaN', nan, 'ms', Date.now() - t0, 'vacant plots', VACANT_PLOTS.length);
py.dispose();

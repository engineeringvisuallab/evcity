// G7a (read-only search): where can R6-6 pass the railway north-1 AND the arm J1-N with a legal level difference?
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
const gen: any = new TerrainGenerator(Config.world.seed);
const rail = gen.rail.edges.find((e: any) => e.id === 'north-1'); const arm = gen.roads.roads.find((r: any) => r.name === 'J1-N');
const buf = Config.roads.roadRailBuffer; const DECK_R = 0.45 + 2.2; // rail ballast + deck
const DECK_A = 2.0, CLR = 5.5; // arm deck depth (assumed), road clearance
const sc = gen.makeSample(); const gnd = (x: number, z: number) => { gen.sample(x, z, sc); return sc.h; };
const G = +(process.env.GR ?? 0.04), DMAX = +(process.env.DMAX ?? 700), FILL = +(process.env.FILL ?? 12); const res: any[] = [];
for (let i = 0; i < rail.xs.length; i++) {
  if (rail.zs[i] > -1600 || rail.zs[i] < -2400 || Math.hypot(rail.xs[i] - 495, 0) > 700) continue;
  const rx = rail.xs[i], rz = rail.zs[i], ry = rail.design[i], rg = rail.ground[i];
  const railU = ry - DECK_R - buf.railOverRoad;   // R6 surface when it passes UNDER the rail
  const railO = ry + buf.roadOverRail;            // R6 surface when it passes OVER the rail
  for (let j = 0; j < arm.xs.length; j++) {
    const ax = arm.xs[j], az = arm.zs[j], ay = arm.ys[j]; const d = Math.hypot(ax - rx, az - rz); if (d < 40 || d > DMAX) continue;
    if (az > -1650) continue;
    const armU = ay - DECK_A - CLR - 0.3; const armO = ay + CLR + DECK_A; // R6 under / over the arm
    const gr = gnd(rx, rz), ga = gnd(ax, az);
    for (const [rn, rl] of [['rail-under', railU], ['rail-over', railO]] as [string, number][]) for (const [an, al] of [['arm-under', armU], ['arm-over', armO]] as [string, number][]) {
      const need = Math.abs(rl - al) / d; if (need > G) continue;
      const cutR = gr - rl, cutA = ga - al; // + = cut
      if (Math.max(cutR, cutA) > 12 || Math.min(cutR, cutA) < -FILL) continue;
      res.push({ i, j, rn, an, d, need, rx, rz, ax, az, rl, al, cutR, cutA, sarm: arm.cum[j] });
    }
  }
}
res.sort((a, b) => a.d - b.d);
console.log('feasible pairs', res.length);
const seen = new Set<string>();
for (const r of res) { const key = r.rn + r.an + Math.round(r.rz / 60) + Math.round(r.az / 60); if (seen.has(key)) continue; seen.add(key); if (seen.size > 12) break;
  console.log(`${r.rn}/${r.an} rail(${r.rx.toFixed(0)},${r.rz.toFixed(0)}) R6 ${r.rl.toFixed(1)} cut ${r.cutR.toFixed(1)} | arm s${r.sarm.toFixed(0)} (${r.ax.toFixed(0)},${r.az.toFixed(0)}) R6 ${r.al.toFixed(1)} cut ${r.cutA.toFixed(1)} | gap ${r.d.toFixed(0)} m grade ${(r.need * 100).toFixed(1)}%`); }

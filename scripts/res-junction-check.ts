// RL3 step 1 check: height step at every junction (end of a C / L / R2 / R4 road on another road) inside the 9 residential areas, and the grade of the roads after the junction pass.
// Run: npx tsx scripts/res-junction-check.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { areaWeight } from '../src/terrain/ResidentialAreas';
const gen: any = new TerrainGenerator(Config.world.seed);
const rep = gen.roads.junctionReport;
for (const q of gen.roads.stubReport) console.log(`stub cut back (RL3 step 2): ${q.road} ${q.end}, ${q.cut} points = ${q.metres.toFixed(0)} m, other road ${q.other} is ${q.dy.toFixed(1)} m higher`);
const isRes = (r: any) => !r.earth && /^(C|L|R2|R4)-/.test(r.name);
const roads: any[] = gen.roads.roads;
const touch = (b: any, x: number, z: number) => { let best = 1e9, y = 0; for (let k = 0; k + 1 < b.xs.length; k++) { const vx = b.xs[k + 1] - b.xs[k], vz = b.zs[k + 1] - b.zs[k]; const l2 = vx * vx + vz * vz || 1; const t = Math.max(0, Math.min(1, ((x - b.xs[k]) * vx + (z - b.zs[k]) * vz) / l2)); const d = Math.hypot(x - b.xs[k] - t * vx, z - b.zs[k] - t * vz); if (d < best) { best = d; y = b.ys[k] + (b.ys[k + 1] - b.ys[k]) * t; } } return { d: best, y }; };
// independent scan (not the pass's own list): every end of a res road inside an area (weight > 0.5) within 8 m of another road
let n = 0, worst = 0, over = 0; const bad: string[] = [], crossing: string[] = [];
for (const a of roads) {
  if (!isRes(a) || a.closed) continue;
  for (const e of [0, a.xs.length - 1]) {
    if (areaWeight(a.xs[e], a.zs[e]) < 0.5) continue;
    let best: any = null;
    for (const b of roads) { if (b === a) continue; const t = touch(b, a.xs[e], a.zs[e]); if (t.d < 8 && (!best || t.d < best.d)) best = { ...t, b }; }
    if (!best) continue;
    const dy0 = Math.abs(a.ys[e] - best.y);
    if (!isRes(best.b) && dy0 > 1.5) { crossing.push(`${a.name}[${e ? 'end' : 'start'}] -> ${best.b.name} dy ${dy0.toFixed(2)} @ ${a.xs[e].toFixed(0)},${a.zs[e].toFixed(0)}`); continue; } // viaduct / cut-and-cover crossing, not a junction: RL3 step 2
    n++; const dy = dy0; if (dy > worst) worst = dy; if (dy > 0.25) { over++; bad.push(`${a.name}[${e ? 'end' : 'start'}] -> ${best.b.name} dy ${dy.toFixed(2)} @ ${a.xs[e].toFixed(0)},${a.zs[e].toFixed(0)}`); }
  }
}
console.log(`pass: ${rep.found} junction ends found, ${rep.fixed} had a step > 0.03 m; worst step ${rep.worstBefore.toFixed(2)} m -> ${rep.worstAfter.toFixed(2)} m`);
for (const x of rep.list.filter((q: any) => Math.abs(q.before) > 0.25)) console.log(`  ${x.a}[${x.e ? 'end' : 'start'}] -> ${x.b}: ${x.before.toFixed(2)} -> ${x.after.toFixed(2)} m, ramp ${x.ramp.toFixed(0)} m`);
console.log(`independent scan (area weight >= 0.5): ${n} junction ends, worst step ${worst.toFixed(2)} m, ${over} over 0.25 m`);
for (const b of bad) console.log('  LEFT: ' + b);
for (const c of crossing) console.log('  NOT A JUNCTION (crossing, step 2): ' + c);
// grade after the pass (limit of the kind; roads that already had a steeper old grade are not counted as new violations: compare against max grade 10 %)
let gmax = 0, gl = 0, gn = '';
for (const r of roads) { if (!isRes(r)) continue; for (let i = 1; i < r.xs.length; i++) { if (areaWeight(r.xs[i], r.zs[i]) < 0.5 || r.bridgeOf[i] >= 0 || r.bridgeOf[i - 1] >= 0) continue; const g = Math.abs(r.ys[i] - r.ys[i - 1]) / (r.cum[i] - r.cum[i - 1]); const ex = g - r.maxGrade; if (ex > gl) { gl = ex; gn = `${r.name}[${i}] ${(g * 100).toFixed(1)} % (limit ${(r.maxGrade * 100).toFixed(0)})`; } if (g > gmax) gmax = g; } }
console.log(`max grade of the res roads inside the areas ${(gmax * 100).toFixed(1)} %, worst excess over the kind limit ${(gl * 100).toFixed(1)} % ${gn}`);
const fail = over > 0 || gl > 0.0015;
console.log(fail ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(fail ? 1 : 0);

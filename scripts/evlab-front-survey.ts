// Headless survey: where do the two blue marks sit on the J1 arms, and how much ground is moved for a smaller EVLab plot?
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';

const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const g = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };

// pixel -> world estimate (camera X -298, Z -206, ~0.67 px/m, centre of picture 938,440)
const px = (u: number, v: number) => ({ x: -298 + (u - 938) / 0.67, z: -206 + (v - 440) / 0.67 });
const marks = [px(970, 280), px(1215, 225)];
console.log('marks (rough from screenshot):', marks.map(m => `(${m.x.toFixed(0)}, ${m.z.toFixed(0)})`).join('  '));

for (const m of marks) {
  let best = { arm: '', d: 1e9, i: 0 };
  for (const a of J1_ARM_DATA) a.pts.forEach((p, i) => { const d = Math.hypot(p[0] - m.x, p[1] - m.z); if (d < best.d) best = { arm: a.name, d, i }; });
  const a = J1_ARM_DATA.find(x => x.name === best.arm)!;
  console.log(`mark (${m.x.toFixed(0)},${m.z.toFixed(0)}) -> nearest ${best.arm} s=${a.s[best.i]} at (${a.pts[best.i][0].toFixed(0)}, ${a.pts[best.i][1].toFixed(0)}) y=${a.ys[best.i].toFixed(1)} dist ${best.d.toFixed(0)} m`);
}
for (const a of J1_ARM_DATA) {
  const pick = [315, 400, 500, 600, 700].map(s => { const i = a.s.findIndex(v => v >= s); return i < 0 ? '' : `s${s}:(${a.pts[i][0].toFixed(0)},${a.pts[i][1].toFixed(0)})`; }).join(' ');
  console.log(a.name, pick);
}
// ground profile N/S through the old campus + north of it
console.log('natural ground height (m), rows z, cols x');
const xs = [-520, -440, -360, -280, -200, -120, -40, 40, 120];
console.log('z\\x ' + xs.join('\t'));
for (let z = -700; z <= -100; z += 60) console.log(z + '\t' + xs.map(x => g(x, z).toFixed(0)).join('\t'));

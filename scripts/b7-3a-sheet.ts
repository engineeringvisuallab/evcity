// B7-3a-1 headless survey of the 3 tap ends (R6-11 on M8, R6-14 on J1-E, R6-15 on M8): numbers only, nothing changed.
// Run: npx tsx scripts/b7-3a-sheet.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RING_RADIAL_JOINS } from '../src/roads/alignment/RingAlignment';
Config.roads.r6New.enabled = true;
const gen = new TerrainGenerator(Config.world.seed);
const roads = gen.roads.roads;
const dg = (a: number) => (a * 180 / Math.PI);
const taps: Array<{ id: string; line: string; end: 'first' | 'last'; main: string }> = [
  { id: 'T22', line: 'R6-11', end: 'last', main: 'M8' },
  { id: 'T03', line: 'R6-14', end: 'last', main: 'J1-E' },
  { id: 'T11', line: 'R6-15', end: 'last', main: 'M8' },
];
const near = (r: any, x: number, z: number) => { let b = 0, bd = 1e18; for (let i = 0; i < r.xs.length; i++) { const d = Math.hypot(r.xs[i] - x, r.zs[i] - z); if (d < bd) { bd = d; b = i; } } return { i: b, d: bd }; };
const hdg = (r: any, i: number) => { const a = Math.max(0, i - 1), b = Math.min(r.xs.length - 1, i + 1); return Math.atan2(r.zs[b] - r.zs[a], r.xs[b] - r.xs[a]); };
const curvR = (r: any, i: number, h = 3) => { const a = Math.max(0, i - h), b = Math.min(r.xs.length - 1, i + h); const h1 = Math.atan2(r.zs[i] - r.zs[a], r.xs[i] - r.xs[a]), h2 = Math.atan2(r.zs[b] - r.zs[i], r.xs[b] - r.xs[i]); let dh = h2 - h1; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; const L = r.cum[b] - r.cum[a]; return Math.abs(dh) < 1e-6 ? Infinity : L / Math.abs(dh); };
console.log('Main roads in network:'); for (const n of ['M8', 'J1-E']) { const r = roads.find((q) => q.name === n)!; console.log(`  ${n}: pts ${r.xs.length} len ${r.length.toFixed(0)} halfWidth ${r.halfWidth} medianHalf ${r.medianHalf} laneW ${r.laneW} shyOuter ${r.shyOuter} shoulder ${r.shoulder} lanes ${r.lanes} speed ${r.speedKmh}`); }
console.log('Ring joins:', RING_RADIAL_JOINS.map((j) => `${j.dir} st ${j.station} (${j.x.toFixed(0)},${j.z.toFixed(0)})`).join(' | '));
for (const t of taps) {
  const r6 = roads.find((q) => q.name === t.line)!; const m = roads.find((q) => q.name === t.main)!;
  const n = r6.xs.length, e = t.end === 'last' ? n - 1 : 0;
  const x = r6.xs[e], z = r6.zs[e];
  const nm = near(m, x, z);
  console.log(`\n=== ${t.id} ${t.line} end on ${t.main} ===`);
  console.log(`R6 end (${x.toFixed(1)}, ${z.toFixed(1)}), nearest ${t.main} point idx ${nm.i} at distance ${nm.d.toFixed(1)} m, main station s = ${m.cum[nm.i].toFixed(0)} of ${m.length.toFixed(0)}`);
  // direction of R6 arriving at the end
  const k = t.end === 'last' ? e - 1 : e + 1; const hr = Math.atan2(z - r6.zs[k], x - r6.xs[k]) * (t.end === 'last' ? 1 : 1);
  const hrA = t.end === 'last' ? Math.atan2(r6.zs[e] - r6.zs[e - 2], r6.xs[e] - r6.xs[e - 2]) : Math.atan2(r6.zs[e] - r6.zs[e + 2], r6.xs[e] - r6.xs[e + 2]);
  const hm = hdg(m, nm.i); let ang = Math.abs(dg(hrA - hm)) % 180; if (ang > 90) ang = 180 - ang;
  console.log(`main heading ${dg(hm).toFixed(1)} deg, R6 arrival heading ${dg(hrA).toFixed(1)} deg, angle between ${ang.toFixed(1)} deg; main radius here ${curvR(m, nm.i).toFixed(0)} m`);
  // which side of the main road does the R6 come from (left normal)
  const side = ((r6.xs[t.end === 'last' ? e - 8 : e + 8] ?? x) - m.xs[nm.i]) * m.nx[nm.i] + ((r6.zs[t.end === 'last' ? e - 8 : e + 8] ?? z) - m.zs[nm.i]) * m.nz[nm.i];
  console.log(`R6 comes from the ${side > 0 ? 'LEFT-normal' : 'RIGHT-normal'} side of ${t.main} (point-order direction); side value ${side.toFixed(0)} m`);
  console.log(`LEVELS: R6 end y ${r6.ys[e].toFixed(2)} (ground ${r6.hNat[e].toFixed(2)}); main y ${m.ys[nm.i].toFixed(2)} (ground ${m.hNat[nm.i].toFixed(2)}), diff ${(r6.ys[e] - m.ys[nm.i]).toFixed(2)} m`);
  // main profile +-700 m
  let line = 'main y every 100 m (s-700 .. s+700): ';
  for (let d = -700; d <= 700; d += 100) { let j = nm.i; const target = m.cum[nm.i] + d; let bd = 1e9; for (let i = 0; i < m.xs.length; i++) { const dd = Math.abs(m.cum[i] - target); if (dd < bd) { bd = dd; j = i; } } line += `${m.ys[j].toFixed(1)}/${m.hNat[j].toFixed(1)}${m.bridgeOf[j] >= 0 ? 'B' : ''} `; }
  console.log(line);
  // max grade of main within +-500 m
  let gm = 0, brs = new Set<number>(); for (let i = 1; i < m.xs.length; i++) if (Math.abs(m.cum[i] - m.cum[nm.i]) <= 800) { gm = Math.max(gm, Math.abs(m.ys[i] - m.ys[i - 1]) / Math.hypot(m.xs[i] - m.xs[i - 1], m.zs[i] - m.zs[i - 1])); if (m.bridgeOf[i] >= 0) brs.add(m.bridgeOf[i]); }
  console.log(`main max grade within +-800 m: ${(gm * 100).toFixed(2)} %; bridges within +-800 m: ${[...brs].join(',') || 'none'}`);
  const bs = (gen.roads as any).bridges as any[] | undefined;
  if (bs) for (const id of brs) { const b = bs.find((q) => q.id === id); if (b) console.log(`  bridge ${id}: road idx ${b.i0}..${b.i1} s ${m.cum[b.i0].toFixed(0)}..${m.cum[b.i1].toFixed(0)}, type ${b.type}, span ${b.spanM}, length ${b.lengthM}, distance from tap ${(m.cum[b.i0] - m.cum[nm.i]).toFixed(0)} / ${(m.cum[b.i1] - m.cum[nm.i]).toFixed(0)} m`); }
  // R6 last 800 m
  let acc = 0, mg = 0, cut = 0, fill = 0, j0 = e; const step = t.end === 'last' ? -1 : 1;
  for (let i = e; i >= 0 && i < n; i += step) { acc = Math.abs(r6.cum[i] - r6.cum[e]); if (acc > 800) break; j0 = i; cut = Math.max(cut, r6.hNat[i] - r6.ys[i]); fill = Math.max(fill, r6.ys[i] - r6.hNat[i]); if (i !== e) mg = Math.max(mg, Math.abs(r6.ys[i] - r6.ys[i - step]) / Math.hypot(r6.xs[i] - r6.xs[i - step], r6.zs[i] - r6.zs[i - step])); }
  console.log(`R6 last 800 m: y ${r6.ys[j0].toFixed(1)} -> ${r6.ys[e].toFixed(1)}, max grade ${(mg * 100).toFixed(2)} %, max cut ${cut.toFixed(1)}, max fill ${fill.toFixed(1)}, min radius ${(() => { let mr = Infinity; for (let i = Math.min(e, j0) + 3; i < Math.max(e, j0) - 3; i++) mr = Math.min(mr, curvR(r6, i)); return mr.toFixed(0); })()} m`);
  console.log(`R6 section: halfWidth ${r6.halfWidth} medianHalf ${r6.medianHalf} laneW ${r6.laneW} lanes ${r6.lanes} speed ${r6.speedKmh}`);
  // other roads near
  const oth: string[] = []; for (const o of roads) { if (o === r6 || o === m) continue; const q = near(o, x, z); if (q.d < 900) oth.push(`${o.name} ${q.d.toFixed(0)} m`); } console.log('other roads within 900 m of the tap: ' + (oth.join(', ') || 'none'));
  // distance along main to the other tap ends / joins
  const stations: Array<[string, number]> = [];
  for (const j of RING_RADIAL_JOINS) { const q = near(m, j.x, j.z); if (q.d < 30) stations.push([`join ${j.dir}`, m.cum[q.i]]); }
  console.log('joins on this main road (station): ' + (stations.map(([a, b]) => `${a} s ${b.toFixed(0)} (${(b - m.cum[nm.i]).toFixed(0)} m from tap)`).join(', ') || 'none'));
  const rail = (gen as any).rail; void rail;
}

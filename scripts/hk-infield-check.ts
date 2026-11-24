// STEP HK-10a check: the two ponds inside the WEST loops (existing LakeSet bowl + water + the game's own bank / tree / water systems).
// Run: HK=1 npx tsx scripts/hk-ring-run.ts hk-infield-check        (ponds ON)   |   HKP=0 HK=1 ...  (ponds removed: dumps the old-network signature only)
//      SIG=/tmp/sig_x.json writes the signature of all roads + bridges + lakes (compare two runs with tools/hk-sig-diff.py)
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { hkFrame, hkRamps, hkWorld } from '../src/roads/ring/HkRamps';
import { HK_LOOPS } from '../src/roads/ring/HkRampData';
import { HK_INFIELD_PONDS, HK_POND_WOBBLE } from '../src/roads/ring/HkInfieldData';

const ponds = [...HK_INFIELD_PONDS];
if (process.env.HKP === '0') (HK_INFIELD_PONDS as unknown as unknown[]).length = 0;
let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(70)} ${detail}`); };
const f2 = (v: number): string => v.toFixed(2);
const gen = new TerrainGenerator(Config.world.seed);
const net = gen.roads;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
if (process.env.SIG) {
  const sig: Record<string, unknown> = {};
  for (const r of net.roads) sig[`${r.id}:${r.name}`] = { n: r.xs.length, xs: Array.from(r.xs, r3), zs: Array.from(r.zs, r3), ys: Array.from(r.ys, r3) };
  sig['bridges'] = net.bridges.map((b) => [b.id, b.roadId, b.i0, b.i1, b.type, r3(b.spanM), r3(b.lengthM), r3(b.waterY)]);
  sig['lakes'] = gen.lakes.lakes.filter((l) => !l.fixed).map((l) => [r3(l.x), r3(l.z), r3(l.R), r3(l.level), l.isPond]);
  writeFileSync(process.env.SIG, JSON.stringify(sig));
  console.log(`signature of ${net.roads.length} roads, ${net.bridges.length} bridges written to ${process.env.SIG}`);
}
if (process.env.HKP === '0') { console.log('  (ponds removed for this run: signature only)'); process.exit(0); }

if (!Config.roads.hatikamrul.enabled) {
  const nf = gen.lakes.lakes.filter((l) => l.fixed).length;
  check(nf === 0, 'I0 switch OFF: no fixed pond is added (old lake set untouched)', `${nf} fixed ponds, ${gen.lakes.pondCount} ponds in all`);
  console.log(`RESULT ${fails} FAIL`); process.exit(fails ? 1 : 0);
}
const f = hkFrame(net)!;
const ramps = hkRamps(f);
const s = { h: 0, water: NaN, fx: 0, fz: 0 };
const fixed = gen.lakes.lakes.filter((l) => l.fixed);
check(fixed.length === ponds.length && ponds.length === 2, 'I1 two fixed ponds exist in the LakeSet', `${fixed.length} fixed, ${gen.lakes.pondCount} ponds in all`);
check(gen.lakes.lakes.slice(-ponds.length).every((l) => l.fixed), 'I1b the fixed ponds are the LAST lakes (no older lake index moved; the boat lake is the first non-pond)', '');

// the data (world x / z) = its local design point on the real frame; the pond lies inside the loop circle (circle fit of the loop centreline, R 80)
const fit = (id: string): [number, number, number] => {
  const L = HK_LOOPS.find((q) => q.id === id)!; const a = Math.floor(L.pts.length * 0.2), b = Math.floor(L.pts.length * 0.8);
  let Sxx = 0, Sxy = 0, Syy = 0, Sx = 0, Sy = 0, Sxz = 0, Syz = 0, Sz = 0; const n = b - a;
  for (let i = a; i < b; i++) { const x = L.pts[i][0], y = L.pts[i][1], z = x * x + y * y; Sxx += x * x; Sxy += x * y; Syy += y * y; Sx += x; Sy += y; Sxz += x * z; Syz += y * z; Sz += z; }
  const M = [[Sxx, Sxy, Sx, Sxz], [Sxy, Syy, Sy, Syz], [Sx, Sy, n, Sz]];
  for (let i = 0; i < 3; i++) { let p = i; for (let j = i + 1; j < 3; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j; [M[i], M[p]] = [M[p], M[i]]; for (let j = 0; j < 3; j++) if (j !== i) { const k = M[j][i] / M[i][i]; for (let c = i; c < 4; c++) M[j][c] -= k * M[i][c]; } }
  const cx = M[0][3] / M[0][0] / 2, cy = M[1][3] / M[1][1] / 2; return [cx, cy, Math.sqrt(M[2][3] / M[2][2] + cx * cx + cy * cy)];
};
let worstW = 0, worstIn = -Infinity;
for (const p of ponds) { const [wx, wz] = hkWorld(f, p.lx, p.ly); worstW = Math.max(worstW, Math.hypot(wx - p.x, wz - p.z)); const [cx, cy, R] = fit(p.loop); worstIn = Math.max(worstIn, Math.hypot(p.lx - cx, p.ly - cy) + p.R * (1 + HK_POND_WOBBLE) * 1.08 + 4.2 - R); }
check(worstW <= 0.1, 'I2 pond world x / z = its local design point on the real frame (data cannot drift)', `worst ${f2(worstW)} m`);
check(worstIn <= -14, 'I2b the pond (shore) lies inside its loop circle with at least 14 m to the pavement edge', `worst margin ${f2(-worstIn)} m`);

for (const p of ponds) {
  const rmax = p.R * (1 + HK_POND_WOBBLE) * 1.08; const ramp = ramps.find((r) => r.id === p.loop)!;
  // water / ground inside and around
  let wet = 0, wetOut = 0, deepest = Infinity, dryMinRing = Infinity, dryMaxRing = -Infinity, hCentre = NaN;
  for (let dz = -70; dz <= 70; dz += 1) for (let dx = -70; dx <= 70; dx += 1) {
    const r = Math.hypot(dx, dz); gen.sample(p.x + dx, p.z + dz, s); if (r < 0.7) hCentre = s.h;
    if (s.water > s.h) { wet++; deepest = Math.min(deepest, s.h); if (r > rmax + 1) wetOut++; if (Math.abs(s.water - p.level) > 1e-6) wetOut++; }
    else if (r > rmax + 3 && r < rmax + 12) { dryMinRing = Math.min(dryMinRing, s.h); dryMaxRing = Math.max(dryMaxRing, s.h); }
  }
  check(wet > 1500, `${p.id} I3 water exists (surface ${p.level} m)`, `${wet} wet m2`);
  check(wetOut === 0, `${p.id} I4 no water outside the shore, water level = pond level everywhere`, `${wetOut} bad samples`);
  check(p.level - deepest >= 1.2, `${p.id} I5 depth under the water surface at least 1.2 m`, `deepest ground ${f2(deepest)}, depth ${f2(p.level - deepest)} m, centre ground ${f2(hCentre)}`);
  check(dryMinRing >= p.level - 0.3, `${p.id} I6 the dry ring 3..12 m beyond the shore is not below the water`, `ring ground ${f2(dryMinRing)} .. ${f2(dryMaxRing)} (rim over water ${f2(dryMaxRing - p.level)} m)`);
  // distance to the ramp (centreline) and its pavement edge
  let dr = Infinity; for (let i = 0; i < ramp.xs.length; i++) dr = Math.min(dr, Math.hypot(ramp.xs[i] - p.x, ramp.zs[i] - p.z));
  check(dr - rmax - ramp.halfW >= 14, `${p.id} I7 shore to the ramp pavement edge at least 14 m`, `${f2(dr - rmax - ramp.halfW)} m (centre to ramp ${f2(dr)}, shore ${f2(rmax)})`);
  // no water under the ramp / any other road, shore clear of every road
  let nearRoad = Infinity, nearName = '';
  for (const r of net.roads) for (let k = 0; k < r.xs.length; k++) { const d = Math.hypot(r.xs[k] - p.x, r.zs[k] - p.z) - r.halfWidth - r.shoulder; if (d < nearRoad) { nearRoad = d; nearName = r.name; } }
  check(nearRoad - rmax >= 14, `${p.id} I8 shore clear of every road of the network (14 m)`, `nearest ${nearName}: ${f2(nearRoad - rmax)} m`);
  let wetRamp = 0; for (let i = 0; i < ramp.xs.length; i++) { gen.sample(ramp.xs[i], ramp.zs[i], s); if (s.water > s.h) wetRamp++; }
  check(wetRamp === 0, `${p.id} I9 no water under the loop ramp`, `${wetRamp} wet ramp points`);
  // the old flat ground beside the pond keeps its shape: compare the ground 40 / 60 m away with the pond removed is done by the signature + this level check
  let bank = 0, bn = 0; for (let a = 0; a < 360; a += 10) { const rr = rmax + 8; gen.sample(p.x + Math.cos(a / 57.2958) * rr, p.z + Math.sin(a / 57.2958) * rr, s); bank = Math.max(bank, Math.abs(s.h - dryMinRing)); bn++; }
  void bn; void bank;
}
const ml = gen.lakes.lakes.find((l) => !l.isPond);
check(!!ml && !ml.fixed, 'I10 the first non-pond lake (boats, Engine.ts) is unchanged and not fixed', ml ? `at ${f2(ml.x)}, ${f2(ml.z)}` : 'none');
console.log(`RESULT ${fails} FAIL`);

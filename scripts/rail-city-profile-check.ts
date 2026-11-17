// STEP RAIL-A + RAIL-C2 (headless): the railway of the NEW game next to the railway of the OLD game (evcity.zip, 341 local roads, Central elevated) and next to the J1 arms.
// Run: npx tsx scripts/rail-city-profile-check.ts
// Reference of the old game: docs/rail_old_profile.json (read-only extract: x, z, ground / bridge every 20 m, station levels; made once from evcity.zip, seed 20260101).
// 1. the railway PLAN (x, z) is identical with the J1 arms on / off, and the stations stand where they stood;
// 2. Central is ELEVATED like in the old game (platform level >= 31 m, old = 31.04 m) and the city railway shows as a viaduct: how much of the line inside 800 m of Central is a bridge / viaduct
//    in both games, and how often the new point has the same kind (ground / bridge) as the nearest old point (whole line and metro core);
// 3. grade <= 2.5 %, no grade exception, no design issue (spans, crossings at grade), steel spans <= 120 m;
// 4. every crossing of a J1 arm with the railway keeps its vertical clearance (rail over arm: underside >= 5.2 m over the road; arm over rail: >= 7.0 m over the rail top);
// 5. the railway earthworks do not touch the arms (carriageway, shoulder, 6 m beyond): 0 probes within 60 m of the rail corridor, decks of the arms excluded (nothing is built under them by the rail ground work).
import fs from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RAIL_DESIGN as D, STATION_LEVELS } from '../src/rail/RailPlan';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const f1 = (v: number): string => v.toFixed(1), pc = (a: number, b: number): string => (b ? ((100 * a) / b).toFixed(0) : '0') + ' %';

Config.roads.junctionJ1Arms.enabled = false;
const off = new TerrainGenerator(Config.world.seed);
Config.roads.junctionJ1Arms.enabled = true;
const gen = new TerrainGenerator(Config.world.seed);
const rail = gen.rail;
const old = JSON.parse(fs.readFileSync(new URL('../docs/rail_old_profile.json', import.meta.url), 'utf8')) as { stations: { id: string; x: number; z: number; level: number; elevated: boolean }[]; edges: { id: string; p: [number, number, string][] }[] };

// 1. plan
let planDiff = 0;
ok(off.rail.edges.length === rail.edges.length, `${rail.edges.length} lines with the arms on, ${off.rail.edges.length} with the arms off`);
for (let i = 0; i < rail.edges.length; i++) {
  const a = off.rail.edges[i], b = rail.edges[i];
  if (a.xs.length !== b.xs.length) { planDiff = Infinity; break; }
  for (let j = 0; j < a.xs.length; j++) planDiff = Math.max(planDiff, Math.hypot(a.xs[j] - b.xs[j], a.zs[j] - b.zs[j]));
}
ok(planDiff < 1e-6, `railway PLAN identical with the arms on / off (max difference ${planDiff.toExponential(1)} m)`);
ok(off.rail.stations.every((s, i) => Math.hypot(s.x - rail.stations[i].x, s.z - rail.stations[i].z) < 1e-6), 'station positions identical with the arms on / off');

// 2. Central like the old game
const central = rail.stationById('central')!;
const oldCentral = old.stations.find((s) => s.id === 'central')!;
ok(central.elevated && central.level >= oldCentral.level, `Central is ELEVATED at ${f1(central.level)} m (old game ${f1(oldCentral.level)} m, ground ${f1(central.y)} m, STATION_LEVELS ${JSON.stringify(STATION_LEVELS)})`);

interface P { x: number; z: number; k: string }
const oldPts: P[] = old.edges.flatMap((e) => e.p.map(([x, z, k]) => ({ x, z, k })));
const newPts: P[] = [];
for (const e of rail.edges) for (let s = 0; s <= e.length; s += 20) {
  const p = rail.pointAt(e, s);
  const seg = e.segments.find((q) => s >= q.s0 - 1e-6 && s <= q.s1 + 1e-6) ?? e.segments[e.segments.length - 1];
  newPts.push({ x: p.x, z: p.z, k: seg.kind === 'bridge' ? 'b' : seg.kind === 'ground' ? 'g' : 't' });
}
const nearestOld = (x: number, z: number): P => { let b = oldPts[0], bd = Infinity; for (const q of oldPts) { const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; b = q; } } return b; };
const CORE = 800;
const inCore = (p: P): boolean => Math.hypot(p.x - central.x, p.z - central.z) < CORE;
const share = (a: P[], core: boolean): number => { const q = core ? a.filter(inCore) : a; return q.length ? q.filter((p) => p.k === 'b').length / q.length : 0; };
let same = 0, sameCore = 0, nCore = 0;
for (const p of newPts) {
  const o = nearestOld(p.x, p.z), hit = (o.k === 'b') === (p.k === 'b') ? 1 : 0;
  same += hit;
  if (inCore(p)) { nCore++; sameCore += hit; }
}
const km = (e: typeof rail.edges): number => e.reduce((t, q) => t + q.segments.filter((g) => g.kind === 'bridge').reduce((u, g) => u + g.s1 - g.s0, 0), 0) / 1000;
console.log(`bridge / viaduct: new ${km(rail.edges).toFixed(2)} km (old game 17.72 km, new game before this step 5.64 km); share inside ${CORE} m of Central: new ${pc(newPts.filter(inCore).filter((p) => p.k === 'b').length, nCore)}, old ${pc(oldPts.filter(inCore).filter((p) => p.k === 'b').length, oldPts.filter(inCore).length)}`);
ok(share(newPts, true) >= 0.85, `metro core: ${(share(newPts, true) * 100).toFixed(0)} % of the railway inside ${CORE} m of Central is a viaduct (old game ${(share(oldPts, true) * 100).toFixed(0)} %, limit 85 %)`);
ok(sameCore / nCore >= 0.85, `metro core: ${pc(sameCore, nCore)} of the points have the same kind (ground / bridge) as the nearest old point (limit 85 %)`);
console.log(`(info) whole railway: ${pc(same, newPts.length)} of the points have the same kind as the nearest old point (the plan is different outside the city, so this cannot be 100 %)`);

// 3. design limits
const maxG = Math.max(...rail.edges.map((e) => e.maxGrade));
ok(maxG <= D.maxGrade + 1e-6, `max grade ${(maxG * 100).toFixed(2)} % (limit ${(D.maxGrade * 100).toFixed(1)} %), grade notes: ${rail.gradeNotes.length}`);
ok(rail.gradeNotes.length === 0, 'no grade exception');
ok(rail.issues.length === 0, `design issues: ${rail.issues.length}${rail.issues.length ? ' - ' + rail.issues.join(' | ') : ''}`);
ok(rail.steelSpans.every((s) => s.s1 - s.s0 <= D.spanSteelMax + 1e-6), `${rail.steelSpans.length} steel spans, longest ${f1(Math.max(0, ...rail.steelSpans.map((s) => s.s1 - s.s0)))} m (limit ${D.spanSteelMax} m)`);

// 4. clearance at every arm x rail crossing
const arms = gen.roads.roads.filter((r) => r.name.startsWith('J1-'));
let nCross = 0, worstOver = Infinity, worstUnder = Infinity;
for (const c of rail.crossings) {
  const road = gen.roads.roads[c.roadId];
  if (!road.name.startsWith('J1-')) continue;
  nCross++;
  const e = rail.edges.find((q) => q.id === c.edgeId)!;
  let i = 0;
  while (i < e.cum.length - 2 && e.cum[i + 1] < c.s) i++;
  const t = (c.s - e.cum[i]) / (e.cum[i + 1] - e.cum[i] || 1);
  const dz = e.design[i] + (e.design[i + 1] - e.design[i]) * t;
  let k = 0, bd = Infinity, tt = 0;
  for (let q = 0; q + 1 < road.xs.length; q++) {
    const abx = road.xs[q + 1] - road.xs[q], abz = road.zs[q + 1] - road.zs[q], l2 = abx * abx + abz * abz || 1;
    const u = Math.max(0, Math.min(1, ((c.x - road.xs[q]) * abx + (c.z - road.zs[q]) * abz) / l2));
    const d = Math.hypot(c.x - road.xs[q] - abx * u, c.z - road.zs[q] - abz * u);
    if (d < bd) { bd = d; k = q; tt = u; }
  }
  const ry = road.ys[k] + (road.ys[k + 1] - road.ys[k]) * tt;
  if (c.kind === 'rail-over-road') worstOver = Math.min(worstOver, dz - D.ballast - D.deckThick - ry);
  else if (c.kind === 'rail-under-bridge' || c.kind === 'road-over-rail') worstUnder = Math.min(worstUnder, ry - dz);
  console.log(`  ${road.name} x ${c.edgeId} s ${c.s.toFixed(0)} (${c.x.toFixed(0)}, ${c.z.toFixed(0)}): ${c.kind}, road ${ry.toFixed(1)} m, rail ${dz.toFixed(1)} m`);
}
ok(nCross === 9, `${nCross} crossings of the J1 arms with the railway (E: north-1, east-1, east-2 with the T at ring st 16813)`);
ok(worstOver >= D.roadClearance - 0.05, `rail over an arm: smallest clearance under the viaduct ${f1(worstOver)} m (needs ${D.roadClearance} m)`);
ok(worstUnder >= 7.0, `arm over the rail: smallest height of the arm over the rail top ${f1(worstUnder)} m (needs 7.0 m)`);

// 5. railway earthworks vs arms
const sA = { h: 0 } as any, sB = { h: 0 } as any;
let probes = 0, hurt = 0, maxHurt = 0;
for (const r of arms) for (let i = 0; i + 1 < r.xs.length; i++) {
  const dx = r.xs[i + 1] - r.xs[i], dz = r.zs[i + 1] - r.zs[i], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
  const steps = Math.max(1, Math.round(l / 10));
  for (let k = 0; k < steps; k++) {
    const cx = r.xs[i] + (dx * k) / steps, cz = r.zs[i] + (dz * k) / steps;
    if (!gen.railForm.inCorridor(cx, cz, 60) || r.bridgeOf[i] >= 0) continue;
    for (const u of [0, r.halfWidth * 0.5, -r.halfWidth * 0.5, r.halfWidth, -r.halfWidth, r.halfWidth + r.shoulder, -(r.halfWidth + r.shoulder), r.halfWidth + r.shoulder + 6, -(r.halfWidth + r.shoulder + 6)]) {
      const x = cx + nx * u, z = cz + nz * u;
      gen.sampleNatural(x, z, sA); gen.roads.apply(x, z, sA); gen.sample(x, z, sB);
      probes++;
      const d = Math.abs(sA.h - sB.h);
      if (d > 0.02) { hurt++; maxHurt = Math.max(maxHurt, d); }
    }
  }
}
ok(hurt === 0, `${probes} probes on / beside the arms within 60 m of the rail corridor (decks excluded): changed by the rail ${hurt} (max ${maxHurt.toFixed(2)} m)`);

console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);

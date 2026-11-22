import * as fs from 'fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildJunctionRegistry } from '../src/roads/JunctionRegistry';
import { buildAutoJunction, AUTO } from '../src/roads/JunctionAuto';
// AUTO CONNECT AT GRADE, PILOT (headless, READ ONLY: no road, no height, no terrain, no game file is changed).
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/junction-auto-pilot.ts docs [JNxxx JNyyy]
//   -> docs/JUNCTION_AUTO_PILOT.txt, docs/junction_auto_pilot.json (the 2 pilots, for tools/junction-auto-plot.py)
const out = process.argv[2] ?? 'docs';
const pilotT = process.argv[3] ?? 'JN163';
const pilotR = process.argv[4] ?? 'JN033';
const gen: any = new TerrainGenerator(Config.world.seed);
const roads = gen.roads.roads;
const hash = (): string => { let h = 0; for (const r of roads) { for (let i = 0; i < r.xs.length; i++) h = (h * 31 + Math.round(r.xs[i] * 100) + 7 * Math.round(r.zs[i] * 100) + 13 * Math.round(r.ys[i] * 100)) | 0; } return String(h); };
const h0 = hash();
const reg = buildJunctionRegistry(roads);
const others = reg.nodes.map((n) => ({ id: n.id, x: n.x, z: n.z }));
const tmp: any = { h: 0, water: NaN, fx: 0, fz: 0 };
const ground = (x: number, z: number): { h: number; water: boolean } => { gen.sampleGround(x, z, tmp); return { h: tmp.h, water: !Number.isNaN(tmp.water) }; };
const lines: string[] = [];
const P = (s: string): void => { lines.push(s); console.log(s); };
const f1 = (v: number): string => v.toFixed(1);
const f2 = (v: number): string => v.toFixed(2);

const results: any[] = [];
for (const n of reg.nodes) {
  if (n.type !== 'T' && n.type !== 'roundabout') continue;
  const t0 = Date.now();
  const res = buildAutoJunction({ node: n, roads, others, ground });
  results.push({ n, res, ms: Date.now() - t0 });
}
const sum = (t: string): { all: number; pass: number; fail: number; why: Record<string, number> } => {
  const s = { all: 0, pass: 0, fail: 0, why: {} as Record<string, number> };
  for (const r of results) {
    if (r.n.type !== t) continue;
    s.all++;
    if (r.res.pass) s.pass++; else { s.fail++; for (const c of r.res.checks) if (c.ok === false) s.why[c.name] = (s.why[c.name] ?? 0) + 1; }
  }
  return s;
};
const pr = (r: any): void => {
  const res = r.res;
  P(`--- ${res.id} ${res.type} at (${f1(res.x)}, ${f1(res.z)}), legs ${res.legs.map((l: any) => `${l.name} (${l.cls}, hw ${f2(l.halfW)})`).join(', ')}`);
  P(`pad area ${f1(res.area)} m2, plane y ${f2(res.plane.y0)} m at the junction point, tilt gx ${(res.plane.gx * 100).toFixed(2)} % gz ${(res.plane.gz * 100).toFixed(2)} %, cut ${f2(res.cut)} m, fill ${f2(res.fill)} m, water samples ${res.waterSamples}`);
  for (const l of res.legs) P(`  leg ${l.name}: heading ${f1(l.heading)} deg, trim (ribbon cut) at ${f1(l.trim)} m, road height at the junction ${f2(l.yAtJ)} m, at the trim end ${f2(l.endY)} m (grade ${(l.gradeInTrim * 100).toFixed(2)} %), step to the pad plane ${f2(l.stepToPlane)} m, straight-axis offset ${f2(l.axisOffset)} m, deviation ${f2(l.straightDev)} m, road left after the trim ${f1(l.avail - l.trim)} m`);
  for (const f of res.fillets) P(`  fillet ${f.kind} leg ${res.legs[f.a].name}${f.b >= 0 ? ' x ' + res.legs[f.b].name : ' x ring'}: R ${f1(f.r)} m, sweep ${f1(f.sweepDeg)} deg${f.phi ? ', corner angle ' + f1(f.phi) + ' deg' : ''}`);
  for (const m of res.markings) P(`  marking ${m.kind} on ${res.legs[m.leg].name}: (${f1(m.p0[0])}, ${f1(m.p0[1])}) -> (${f1(m.p1[0])}, ${f1(m.p1[1])})${m.depth ? ', depth ' + m.depth + ' m' : ''}`);
  for (const c of res.checks) P(`  [${c.ok === null ? 'INFO' : c.ok ? 'PASS' : 'FAIL'}] ${c.name}: ${c.text}`);
  P(`  RESULT ${res.pass ? 'PASS' : 'FAIL'}`);
};

P(`AUTO CONNECT AT GRADE, PILOT (A-3 / A-4 geometry; no road, height or terrain changed)`);
P(`constants: ${JSON.stringify(AUTO)}`);
const sT = sum('T'), sR = sum('roundabout');
P(`SWEEP of the registry (geometry + checks only): T ${sT.all}: PASS ${sT.pass}, FAIL ${sT.fail} ${JSON.stringify(sT.why)}; roundabout-size ${sR.all}: PASS ${sR.pass}, FAIL ${sR.fail} ${JSON.stringify(sR.why)}`);
const pick = (id: string): any => results.find((r) => r.n.id === id);
const pilots = [pick(pilotT), pick(pilotR)].filter(Boolean);
for (const r of pilots) pr(r);
P('PASS list of the sweep (ids): ' + results.filter((r) => r.res.pass).map((r) => r.n.id).join(' '));
P('FAIL list of the sweep (id: reasons): ' + results.filter((r) => !r.res.pass).map((r) => `${r.n.id}[${r.res.checks.filter((c: any) => c.ok === false).map((c: any) => c.name).join(';')}]`).join(' '));
const h1 = hash();
P(`ROAD DATA HASH before ${h0} after ${h1}: ${h0 === h1 ? 'PASS, no road point moved' : 'FAIL, a road changed'}`);
fs.writeFileSync(`${out}/JUNCTION_AUTO_PILOT.txt`, lines.join('\n') + '\n');
// plot data
const plot = pilots.map((r) => {
  const near: any[] = [];
  for (const rd of roads) {
    const pts: number[][] = [];
    for (let i = 0; i < rd.xs.length; i++) if (Math.hypot(rd.xs[i] - r.res.x, rd.zs[i] - r.res.z) < 90) pts.push([rd.xs[i], rd.zs[i]]);
    if (pts.length > 1) near.push({ name: rd.name, hw: rd.halfWidth, pts });
  }
  return { res: r.res, roads: near };
});
fs.writeFileSync(`${out}/junction_auto_pilot.json`, JSON.stringify(plot));
if (h0 !== h1) process.exit(1);

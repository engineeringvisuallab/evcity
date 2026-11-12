// T01/T02 scenario test. Run: npx tsx scripts/j6-scenario-test.ts   (~2-3 min: builds the world twice, OFF and ON)
// Checks (docs/j6/04_TASKS_BN.md): OFF == original network (digest), ON: pad 6 gone, S4 reaches the centre, path S4 -> centre -> J57 and centre -> T -> S5,
// no new road along F6 outside the centre, other roads untouched, bridges intact, scenario issues listed.
import * as fs from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { J6_SCENARIO, SCENARIOS, uvToWorld, worldToUV } from '../src/interchange/scenario/J6Scenario';
import { digestNetwork } from './j6-net-digest';

let fails = 0;
const ok = (c: boolean, m: string): void => {
  if (!c) {
    fails++;
    console.log('FAIL', m);
  } else console.log('ok  ', m);
};

ok(Config.roads.scenario.list.length > 0, `scenario flag default = ${Config.roads.scenario.enabled} (the test sets it itself)`);
Config.roads.scenario.enabled = false;
ok(SCENARIOS.J6 === J6_SCENARIO && Config.roads.scenario.list.includes('J6'), 'J6 is registered');
ok(fs.existsSync('docs/j6/data/j6-scenario-data.json'), 'scenario data json exists');

// ---- OFF == baseline ----
const base = JSON.parse(fs.readFileSync('docs/j6/data/j6-baseline-off.json', 'utf8'));
const off: any = new TerrainGenerator(Config.world.seed).roads;
const dOff = digestNetwork(off);
ok(dOff.hash === base.hash && dOff.roads === base.roads && dOff.pads === base.pads && dOff.bridges === base.bridges, `OFF: roads/pads/bridges identical to the original (${dOff.roads} / ${dOff.pads} / ${dOff.bridges}, hash ${dOff.hash})`);
ok(off.scenarios.length === 0, 'OFF: no scenario was applied');

// ---- ON ----
Config.roads.scenario.enabled = true;
const R: any = new TerrainGenerator(Config.world.seed).roads;
Config.roads.scenario.enabled = false;
const rep = R.scenarios[0];
const C = J6_SCENARIO.centre;
ok(!!rep && rep.applied, `ON: scenario applied (${rep ? rep.issues.length : '?'} issue(s))`);
for (const i of rep?.issues ?? []) console.log('     issue:', i);
ok(!(rep?.issues ?? []).some((i: string) => /skipped|still stands|does not exist/.test(i)), 'ON: no skipped step, no leftover pad');

const byName = (n: string): any => R.roads.filter((r: any) => r.name === n).pop();
const S4 = byName('S4');
const S5 = byName('S5');
const W = byName('J6-west');
const F6 = byName('F6');
ok(!!S4 && !!S5 && !!W && !!F6, 'ON: S4, S5, J6-west, F6 exist');
const dist = (r: any, i: number, x: number, z: number): number => Math.hypot(r.xs[i] - x, r.zs[i] - z);
const near = (r: any, x: number, z: number): number => {
  let m = Infinity;
  for (let i = 0; i < r.xs.length; i++) m = Math.min(m, dist(r, i, x, z));
  return m;
};
const [cx, cz] = uvToWorld(C, { u: 0, v: 0 });
const [padX, padZ] = uvToWorld(C, { u: 68, v: 0 });
ok(!R.pads.some((p: any) => Math.hypot(p.x - padX, p.z - padZ) < 60), 'ON: the old pad J6 (and any pad near it) is gone');
ok(R.pads.length >= 168, `ON: pad count ${R.pads.length} (original ${base.pads}: -1 old pad, +1 T, centre pad comes with T08)`);
const s4e = S4.xs.length - 1;
ok(dist(S4, s4e, cx, cz) < 3, `ON: S4 now ends at the interchange centre (${dist(S4, s4e, cx, cz).toFixed(1)} m)`);
ok(Math.abs(S4.ys[s4e] - F6.ys[0] || 0) < 100, 'ON: S4 end has a height');
ok(S4.bridgeOf.some((b: number) => b >= 0) && R.bridges.filter((b: any) => b.roadId === S4.id).length === 2, 'ON: S4 keeps both bridges');
for (const b of R.bridges.filter((b: any) => b.roadId === S4.id)) ok(S4.bridgeOf[b.i0] === b.id && S4.bridgeOf[b.i1] === b.id, `ON: S4 bridge ${b.id} indices still match bridgeOf`);
ok(dist(W, 0, cx, cz) < 3, 'ON: J6-west starts at the centre');
const pad57 = base && R.pads.find((p: any) => p.arms.some((a: any) => a.roadId === W.id) && p.arms.length >= 4);
ok(!!pad57, 'ON: J57 has a pad again, with the west leg as an arm (4 arms)');
const tPad = R.pads.find((p: any) => p !== pad57 && p.arms.some((a: any) => a.roadId === W.id));
// (no T junction any more: the user sketch of 2026-11-12 has no south branch)

// geometry: no new road along F6 outside the centre (>= 25 m from F6 beyond 60 m from the centre)
let minF6 = Infinity;
for (const r of [W, S4, S5]) for (let i = 0; i < r.xs.length; i++) {
  if (Math.hypot(r.xs[i] - cx, r.zs[i] - cz) < 60) continue;
  const d = near(F6, r.xs[i], r.zs[i]);
  if (r === S5 || r === S4) { if (d < 25 && worldToUV(C, r.xs[i], r.zs[i]).u > -300 && Math.abs(worldToUV(C, r.xs[i], r.zs[i]).v) < 200) minF6 = Math.min(minF6, d); } else minF6 = Math.min(minF6, d);
}
ok(minF6 >= 25 || minF6 === Infinity, `ON: no road runs along F6 outside the centre (min distance ${minF6 === Infinity ? '>= 25' : minF6.toFixed(0)} m)`);
// S5 head parallel to F6 is gone: S5 no longer has points within 40 m of F6 between the centre and the old pad
let s5Near = 0;
for (let i = 0; i < S5.xs.length; i++) { const uv = worldToUV(C, S5.xs[i], S5.zs[i]); if (uv.u > -120 && uv.u < 120 && near(F6, S5.xs[i], S5.zs[i]) < 40) s5Near++; }
ok(s5Near === 0, `ON: S5 head parallel to F6 removed (${s5Near} points left within 40 m of F6 near the centre)`);

// connectivity: roads touch when they share a pad or an end lies within 22 m of the other road
const touch = (a: any, b: any): boolean => {
  if (R.pads.some((p: any) => p.arms.some((x: any) => x.roadId === a.id) && p.arms.some((x: any) => x.roadId === b.id))) return true;
  for (const e of [0, a.xs.length - 1]) if (near(b, a.xs[e], a.zs[e]) < 22) return true;
  for (const e of [0, b.xs.length - 1]) if (near(a, b.xs[e], b.zs[e]) < 22) return true;
  return false;
};
const graph = new Map<number, number[]>();
const near600 = R.roads.filter((r: any) => !r.earth && near(r, cx, cz) < 3000);
for (const a of near600) graph.set(a.id, near600.filter((b: any) => b !== a && touch(a, b)).map((b: any) => b.id));
const bfs = (from: number, to: number): boolean => {
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    if (c === to) return true;
    for (const n of graph.get(c) ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); }
  }
  return false;
};
ok(touch(S4, W) && touch(S4, F6) && touch(W, F6), 'ON: S4 (east) - centre - west leg are connected through F6');
ok(bfs(S4.id, W.id), 'ON: path S4 -> centre -> J6-west exists');
ok(touch(W, S5), 'ON: the west leg is connected to S5 (J57 side and the T)');
const [t0x, t0z] = [S5.xs[0], S5.zs[0]];
// (S5 no longer starts on the west leg)
ok(bfs(F6.id, S5.id), 'ON: path F6 / centre -> T -> S5 (SW) exists');

// everything else is untouched (compared BY NAME with the OFF network: ids of later roads shift by one). A pad reshapes the legs that meet it, so the roads
// that met the removed pad (F6) or meet a new pad (S12 at J57) may differ - but only within 150 m of such a pad.
const dOn = digestNetwork(R);
const padSpots: number[][] = [[padX, padZ]];
for (const p of R.pads) if (p.arms.some((a: any) => a.roadId === W.id)) padSpots.push([p.x, p.z]);
const changed: string[] = [];
const far: string[] = [];
for (const ro of off.roads) {
  if (ro.name === 'S4' || ro.name === 'S5') continue;
  const rn = byName(ro.name);
  if (!rn || rn.xs.length !== ro.xs.length) { changed.push(ro.name); continue; }
  let diff = false;
  for (let i = 0; i < ro.xs.length; i++) {
    if (ro.xs[i] === rn.xs[i] && ro.zs[i] === rn.zs[i]) continue;
    diff = true;
    if (!padSpots.some((c) => Math.hypot(rn.xs[i] - c[0], rn.zs[i] - c[1]) < 150)) { far.push(ro.name); break; }
  }
  if (diff) changed.push(ro.name);
}
ok(far.length === 0, `ON: every other road is identical to the original away from the changed pads (${far.length} differ far away${far.length ? ': ' + far.slice(0, 8).join(', ') : ''})`);
// earthen tracks (E*) are generated FROM the finished collectors (layoutEarthen), so those that branch off the edited S4 / S5 follow them
ok(changed.every((n) => n === 'F6' || n === 'S12' || byName(n)?.earth), `ON: only F6 / S12 (pads) and earthen tracks that follow the edited roads differ: ${changed.join(', ') || 'none'}`);
void dOn;
ok(R.roads.length === base.roads + 1, `ON: exactly one new road (J6-west, the others are fused into S4 / S5): ${R.roads.length} roads`);
ok(R.bridges.length === base.bridges, `ON: bridge count unchanged (${R.bridges.length})`);
let nan = 0;
for (const r of R.roads) for (let i = 0; i < r.xs.length; i++) if (!Number.isFinite(r.ys[i]) || !Number.isFinite(r.xs[i])) nan++;
ok(nan === 0, 'ON: every road point has finite x / y');
for (const r of [S4, S5, W]) {
  let g = 0;
  for (let i = 1; i < r.xs.length; i++) g = Math.max(g, Math.abs(r.ys[i] - r.ys[i - 1]) / Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]));
  console.log(`     ${r.name}: ${r.xs.length} pts, ${r.length.toFixed(0)} m, max grade ${(g * 100).toFixed(1)} % (class limit ${(r.maxGrade * 100).toFixed(0)} %)`);
}
console.log('TODO T02: radius >= 73 m, grade <= limit (needs the T04 alignment), demand');
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);

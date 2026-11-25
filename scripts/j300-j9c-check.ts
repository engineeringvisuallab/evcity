// J9-c CHECK (headless, real game data): (1) the rail piers beside the R6 corridor, (2) the rail is otherwise the same with the switch ON, (3) the ring furniture (lamps, median, roadside) in the 300 ft junction reach.
// Run: npx tsx scripts/j300-j9c-check.ts docs   Writes docs/J300_J9C.txt.  Two child runs (switch OFF and ON), about 1 minute each. PASS / FAIL on every line, NOT RUN is printed.
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { planStreetLights } from '../src/environment/StreetLights';
import { planMedians, MS } from '../src/roads/MedianPlan';
import { planRoadside } from '../src/roads/Roadside';
import { j300InBox, j300Local, j300RampSide } from '../src/roads/junction/J300Zone';
import { j300PierGap, J300_PIER_NEED } from '../src/roads/junction/J300RailPiers';
import { J300_STRUCT_B as SB } from '../src/roads/junction/J300StructB';

const mode = process.argv[2];
const r2 = (x: number): number => Math.round(x * 100) / 100;

if (mode === 'ON' || mode === 'OFF') {
  Config.roads.junctionJ300.enabled = mode === 'ON';
  const g: any = new TerrainGenerator(Config.world.seed);
  const R = g.rail;
  const rail = {
    stations: (R.stations as any[]).map((s) => ({ id: s.id, elevated: s.elevated, level: s.level })),
    edges: (R.edges as any[]).map((e) => ({ id: e.id, length: e.length, kinds: kindRuns(e.segments), segs: (e.segments as any[]).map((q) => `${q.kind[0]}/${q.why ?? ''}@${r2(q.s0)}-${r2(q.s1)}`) })),
    piers: (R.piers as any[]).map((p) => ({ e: p.edgeId, s: r2(p.s), x: p.x, z: p.z, dx: p.dx, dz: p.dz })),
    steel: (R.steelSpans as any[]).map((s) => ({ e: s.edgeId, s0: r2(s.s0), s1: r2(s.s1) })),
    issues: (R.issues as any[]).length,
  };
  const pierGaps = rail.piers.filter((p) => j300Local(p.x, p.z) && Math.hypot(p.x - SB.crossing.x, p.z - SB.crossing.z) < 150).map((p) => ({ e: p.e, s: p.s, col: r2(j300PierGap(p.x, p.z, p.dx, p.dz, 'col')), cap: r2(j300PierGap(p.x, p.z, p.dx, p.dz, 'cap')) }));
  const countLamps = (): { total: number; inZone: number; pts: number[][] } => {
    const l = planStreetLights(g.roads) as any[];
    const z = l.filter((q) => j300RampSide(q.x, q.z, 0) || j300InBox(q.x, q.z, 0));
    const near = l.map((q) => j300Local(q.x, q.z)).filter((p) => p.u > -700 && p.u < 800 && Math.abs(p.v) < 80).map((p) => [r2(p.u), r2(p.v)]);
    return { total: l.length, inZone: z.length, pts: z.map((q) => { const p = j300Local(q.x, q.z); return [r2(p.u), r2(p.v)]; }), near };
  };
  const lamps = countLamps();
  const mp: any = planMedians(g.roads);
  let medBox = 0, medTotal = 0, medMin = 1e9;
  for (const run of mp.runs as any[]) for (let k = 0; k < run.n; k++) {
    const x = run.p[k * MS], z = run.p[k * MS + 2]; medTotal++;
    const p = j300Local(x, z);
    if (Math.abs(p.v) < 40) { if (j300InBox(x, z, 0)) medBox++; else if (Math.abs(p.u) > 67) medMin = Math.min(medMin, Math.abs(p.u) - 67); }
  }
  const countRoadside = (): Record<string, [number, number, number]> => {
    const rp: any = planRoadside(g);
    const out: Record<string, [number, number, number]> = {};
    for (const [k, st] of [['pits', 4], ['trees', 8], ['hedges', 7], ['shrubs', 6], ['posts', 4], ['beams', 6]] as [string, number][]) {
      const a: number[] = rp[k]; let inZ = 0, inZ30 = 0; const n = a.length / st;
      for (let i = 0; i < n; i++) { const x = a[i * st], z = a[i * st + 2]; if (j300RampSide(x, z, 0) || j300InBox(x, z, 0)) inZ++; if (j300RampSide(x, z, 30) || j300InBox(x, z, 30)) inZ30++; }
      out[k] = [n, inZ, inZ30];
    }
    return out;
  };
  const roadside = countRoadside();
  // the same plan with the furniture rule switched off again (what the game would draw without J9-c), to see what was taken away
  let without: any = null;
  if (mode === 'ON') {
    Config.roads.junctionJ300.enabled = false;
    const l0 = countLamps();
    const rs0 = countRoadside();
    Config.roads.junctionJ300.enabled = true;
    without = { lamps: l0, roadside: rs0 };
  }
  console.log('JSON' + JSON.stringify({ rail, pierGaps, lamps, medBox, medTotal, medMin: medMin > 1e8 ? null : r2(medMin), roadside, without }));
  process.exit(0);
}

function kindRuns(segs: any[]): string {
  const out: string[] = [];
  for (const q of segs) { const k = q.kind[0]; const last = out[out.length - 1]; if (last && last.startsWith(k + '@')) out[out.length - 1] = last.replace(/-[\d.]+$/, '-' + r2(q.s1)); else out.push(`${k}@${r2(q.s0)}-${r2(q.s1)}`); }
  return out.join(' ');
}

const dir = process.argv[2] ?? 'docs';
const out: string[] = []; let fails = 0;
const P = (s = ''): void => { out.push(s); console.log(s); };
const CHK = (t: string, ok: boolean, n = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${t}${n ? '  ' + n : ''}`); };
const run = (m: string): any => { const o = execFileSync('npx', ['tsx', 'scripts/j300-j9c-check.ts', m], { encoding: 'utf8', maxBuffer: 1 << 28 }); const l = o.split('\n').find((q) => q.startsWith('JSON')); return JSON.parse((l ?? 'JSON{}').slice(4)); };
P('J9-c CHECK (headless, real game: rail + roads + street lights + median + roadside, switch OFF vs ON)');
const off = run('OFF'), on = run('ON');
const T: any = SB; const EDGE: string = T.crossing.edge;
const need = J300_PIER_NEED;

P(''); P('1) RAIL PIERS BESIDE THE R6 CORRIDOR (J7-B table, section 23)');
const offNear = off.pierGaps.filter((p: any) => p.e === EDGE), onNear = on.pierGaps.filter((p: any) => p.e === EDGE);
CHK('switch OFF: the 2 old piers at rail s 60 and 90 stand inside the corridor (finding of J7-B reproduced)', [60, 90].every((s) => offNear.some((p: any) => Math.abs(p.s - s) < 0.01 && (p.col < need.col || p.cap < need.cap))), offNear.filter((p: any) => p.s === 60 || p.s === 90).map((p: any) => `s ${p.s}: ${p.col} / ${p.cap}`).join('   '));
const bad = on.pierGaps.filter((p: any) => p.col < need.col || p.cap < need.cap);
CHK('switch ON: no pier of any rail edge inside the R6 corridor (column gap >= ' + need.col + ' m, cap gap >= ' + need.cap + ' m)', bad.length === 0, `${on.pierGaps.length} piers within 150 m checked` + (bad.length ? '; BAD ' + JSON.stringify(bad) : ''));
const sOn: number[] = on.rail.piers.filter((p: any) => p.e === EDGE).map((p: any) => p.s).filter((s: number) => s >= 25 && s <= 125);
const want: number[] = [T.piers.keptNeighbours[0], ...T.piers.added.map((p: any) => p.s), T.piers.keptNeighbours[1]];
CHK('switch ON: piers at rail s ' + want.join(' / ') + ' = the J7-B table', want.length === sOn.length && want.every((s, i) => Math.abs(s - sOn[i]) < 0.011), `game: ${sOn.join(' / ')}`);
const spans = sOn.slice(1).map((s, i) => r2(s - sOn[i]));
CHK('switch ON: every span <= 46 m (concrete limit) and no steel span between s 30 and 120', spans.every((s) => s <= 46) && !on.rail.steel.some((q: any) => q.e === EDGE && q.s1 > 30 && q.s0 < 120), `spans ${spans.join(' / ')} m (table ${T.piers.spans.join(' / ')})`);
const gOn = onNear.filter((p: any) => p.s > 51 && p.s < 97);
CHK('switch ON: gaps of the two moved piers equal the table (column 20.34, cap 18.65 m, within 0.02)', gOn.length === 2 && gOn.every((p: any) => Math.abs(p.col - 20.34) < 0.02 && Math.abs(p.cap - 18.65) < 0.02), gOn.map((p: any) => `s ${p.s}: ${p.col} / ${p.cap}`).join('   '));

P(''); P('2) THE REST OF THE RAILWAY (user rule: the railway cannot change)');
CHK('stations: same ids, same elevated flag, same level (to 1e-9)', off.rail.stations.length === on.rail.stations.length && off.rail.stations.every((s: any, i: number) => s.id === on.rail.stations[i].id && s.elevated === on.rail.stations[i].elevated && Math.abs(s.level - on.rail.stations[i].level) < 1e-9), 'nw-town is pinned (J300_RAIL_PIN), without the pin it dropped from 35.26 m (viaduct) to 19.40 m (ground)');
CHK('rail edges: same ids and lengths', off.rail.edges.length === on.rail.edges.length && off.rail.edges.every((e: any, i: number) => e.id === on.rail.edges[i].id && Math.abs(e.length - on.rail.edges[i].length) < 1e-6), `${off.rail.edges.length} edges`);
const diffKinds = off.rail.edges.filter((e: any, i: number) => e.kinds !== on.rail.edges[i].kinds);
CHK('bridge / ground / cutting / tunnel runs of every edge identical (ignoring the label inside a run)', diffKinds.length === 0, diffKinds.map((e: any) => e.id).join(', '));
const pk = (m: any): Map<string, number[]> => { const q = new Map<string, number[]>(); for (const p of m.rail.piers) { const l = q.get(p.e) ?? []; l.push(p.s); q.set(p.e, l); } return q; };
const pOff = pk(off), pOn = pk(on); const edgesDiff: string[] = [];
for (const [e, l] of pOff) { const m = pOn.get(e) ?? []; if (l.length !== m.length || l.some((s, i) => Math.abs(s - m[i]) > 0.011)) edgesDiff.push(e); }
CHK('piers of every other edge identical (positions to 0.01 m)', edgesDiff.filter((e) => e !== EDGE).length === 0, `edges that differ: ${edgesDiff.join(', ') || 'none'}`);
const a = pOff.get(EDGE) ?? [], b = pOn.get(EDGE) ?? [];
const onlyOff = a.filter((s) => !b.some((t) => Math.abs(s - t) < 0.011)), onlyOn = b.filter((s) => !a.some((t) => Math.abs(s - t) < 0.011));
CHK('ring-north: piers beyond rail s 500 identical', onlyOff.concat(onlyOn).every((s) => s < 500), `OFF only: ${onlyOff.join(' ')}   ON only: ${onlyOn.join(' ')}`);
P(`INFO  ring-north before s 500 differs: besides the 2 moved piers the OFF rail has a STEEL through-girder at s ${JSON.stringify(off.rail.steel.filter((q: any) => q.e === EDGE).map((q: any) => [q.s0, q.s1]))} and 7 piers at s 270 .. 471 over the OLD R6-9 crossing (conflict run 240 .. 300); the old R6-9 is gone with the switch ON, so the game puts normal 30 m piers there (ON piers beyond s 150: ${b.filter((s) => s > 150 && s < 500).join(' ')}). A decision for the user (see section 28).`);
CHK('rail issues count not higher than OFF', on.rail.issues <= off.rail.issues, `OFF ${off.rail.issues}, ON ${on.rail.issues}`);
CHK('switch OFF = shipped state: 422 piers and 10 steel spans (counted before the J9-c patch)', off.rail.piers.length === 422 && off.rail.steel.length === 10, `${off.rail.piers.length} piers, ${off.rail.steel.length} steel spans`);

P(''); P('3) RING FURNITURE IN THE 300 FT REACH (box u -67 .. 67; ramp side u -435 .. +645, minus 25 m taper tail)');
CHK('switch OFF: ring lamps stand in the reach (so the rule has something to do)', off.lamps.inZone > 0, `${off.lamps.inZone} lamps (u, v): ${off.lamps.pts.slice(0, 4).map((p: number[]) => p.join(',')).join('  ')} ...`);
CHK('switch ON: no street lamp left in the reach', on.lamps.inZone === 0, `${on.lamps.inZone} left`);
const w = on.without;
CHK('switch ON: only lamps of the reach were taken away (total = total without the rule - lamps in the reach)', on.lamps.total === w.lamps.total - w.lamps.inZone, `${w.lamps.total} - ${w.lamps.inZone} = ${on.lamps.total}`);
CHK('switch ON: no median-plan sample inside the box', on.medBox === 0, `OFF ${off.medBox}, ON ${on.medBox}`);
P(`INFO  the ring has NO median run in the median plan (${off.medTotal} samples in the whole plan, none within 40 m of the box): the ring median is part of the ring surface, so nothing is removed there. The median hedges / trees of the roadside plan are counted below.`);
for (const k of ['pits', 'trees', 'hedges', 'shrubs', 'posts', 'beams']) {
  CHK(`switch ON: no roadside ${k} in the reach`, on.roadside[k][1] === 0, `OFF ${off.roadside[k][1]} of ${off.roadside[k][0]}, without the rule ${w.roadside[k][1]} of ${w.roadside[k][0]}, ON ${on.roadside[k][1]} of ${on.roadside[k][0]}`);
}
const KINDS = ['pits', 'trees', 'hedges', 'shrubs', 'posts', 'beams'];
CHK('switch ON: nothing is taken away outside the reach + 30 m (removed items between the reach and reach + 30 m, the median stops before the box like before a pad)', KINDS.every((k) => { const rem = w.roadside[k][0] - on.roadside[k][0]; return rem >= w.roadside[k][1] && rem <= w.roadside[k][2]; }), KINDS.map((k) => `${k} -${w.roadside[k][0] - on.roadside[k][0]} (reach ${w.roadside[k][1]}, +30 m ${w.roadside[k][2]})`).join('  '));

P(''); P('NOT RUN: npm run build (vite) and the in-game look (browser), the real browser chunk workers, ring through the box visually (lamps, median, trees only checked as data), ring asphalt / barriers inside the box, ground and grass vegetation inside the footprint (J9-d), minimap, collision, old ring signs, cp-37 / cp-38 / sign-17 (J9-d), traffic (J10), steel-span variant of the 45 m middle span (not chosen).');
P(''); P(`${fails} FAIL`);
writeFileSync(`${dir}/J300_J9C.txt`, out.join('\n') + '\n');
const pick = (m: any): any => m.rail.piers.filter((p: any) => p.e === EDGE && p.s < 260).map((p: any) => ({ s: p.s, x: p.x, z: p.z, dx: p.dx, dz: p.dz }));
writeFileSync(`${dir}/J300_J9C.json`, JSON.stringify({ edge: EDGE, pierOff: pick(off), pierOn: pick(on), steelOff: off.rail.steel.filter((q: any) => q.e === EDGE), steelOn: on.rail.steel.filter((q: any) => q.e === EDGE), lampsOff: off.lamps.near, lampsOn: on.lamps.near, need, fails }));

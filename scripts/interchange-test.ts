// Headless test of the interchange foundation (src/interchange). Run: npx tsx scripts/interchange-test.ts
import { buildInterchange, getPattern, patternIds, registerPattern, rampToRoadSpec, type InterchangeSpec, type RoadSection } from '../src/interchange';

let fails = 0;
const ok = (cond: boolean, msg: string): void => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) fails++;
};

// real numbers of Config.city.roadSections (highway 3+3 lanes of 3.5 m, 2.0 m median; avenue 3+3 of 3.25 m, 1.5 m median)
const HIGHWAY: RoadSection = { roadId: 1, halfWidth: 12.7, kerbLane: 10.45, laneW: 3.5, lanesPerDir: 3, designKmh: 100 };
const AVENUE: RoadSection = { roadId: 2, halfWidth: 11.65, kerbLane: 9.525, laneW: 3.25, lanesPerDir: 3, designKmh: 40 };

const spec = (pattern: string, over: Partial<InterchangeSpec> = {}): InterchangeSpec => ({ id: `t-${pattern}`, pattern, x: 1000, z: -500, y: 12, yaw: 0.4, main: HIGHWAY, cross: AVENUE, ...over });

const COUNT: Record<string, number> = { diamond: 4, cloverleaf: 8, parclo: 4 };
for (const id of ['diamond', 'cloverleaf', 'parclo']) {
  const t0 = performance.now();
  const m = buildInterchange(spec(id));
  const ms = performance.now() - t0;
  const errs = m.issues.filter((i) => i.level === 'error');
  for (const e of m.issues) console.log(`      ${e.level} ${e.code}: ${e.message}`);
  ok(getPattern(id) !== undefined, `${id}: registered`);
  ok(m.ramps.length === COUNT[id], `${id}: ${m.ramps.length} ramps (expected ${COUNT[id]})`);
  ok(errs.length === 0, `${id}: no validation errors (${m.issues.length} issues)`);
  ok(ms < 100, `${id}: builds in ${ms.toFixed(1)} ms`);
  ok(m.ramps.every((r) => r.xs.length === r.ys.length && r.xs.length === r.cum.length && r.length > 50), `${id}: ramp arrays consistent`);
  ok(m.ramps.every((r) => r.ys.every((y) => y >= 12 - 1e-6 && y <= 12 + m.levels.rise + 1e-6)), `${id}: every ramp height between ground and the bridge`);
  ok(m.parts.every((p) => p.data.length % p.stride === 0), `${id}: part batches have whole rows`);
  ok(m.footprintR >= 120 && m.footprintR < 500, `${id}: footprint ${m.footprintR.toFixed(0)} m`);
  const rs = m.ramps.map((r, i) => rampToRoadSpec(r, 100 + i, `RP${i}`));
  ok(rs.every((r) => r.xs.length === r.nx.length && r.length > 0), `${id}: RoadSpec adapter ok`);
}

// the same spec twice = the same model
{
  const a = buildInterchange(spec('cloverleaf'));
  const b = buildInterchange(spec('cloverleaf'));
  ok(JSON.stringify(a.ramps.map((r) => [r.xs, r.zs, r.ys])) === JSON.stringify(b.ramps.map((r) => [r.xs, r.zs, r.ys])), 'deterministic: same spec -> same ramps');
}

// orientation does not matter (rotate the whole thing): lengths and issues stay the same
{
  const base = buildInterchange(spec('cloverleaf', { yaw: 0 }));
  for (const yaw of [0.7, 2.5, -1.9, Math.PI]) {
    const m = buildInterchange(spec('cloverleaf', { yaw }));
    const same = m.ramps.every((r, i) => Math.abs(r.length - base.ramps[i].length) < 1e-6);
    ok(same && m.issues.filter((i) => i.level === 'error').length === 0, `cloverleaf yaw ${yaw.toFixed(2)}: same shape, no errors`);
  }
}

// the cross road can be the bridge too
{
  const m = buildInterchange(spec('cloverleaf', { upper: 'cross' }));
  ok(m.issues.filter((i) => i.level === 'error').length === 0, 'cloverleaf with the cross road as the bridge: no errors');
  ok(m.yOf('cross', 0) > m.yOf('main', 0) + 6, 'cross road is above the main road at the centre');
}

// left-hand traffic: the slip of "main forward" leaves on the LEFT (v > 0) of the road and ends on the cross road going away (+v) on the left of it (u < 0)
{
  const m = buildInterchange(spec('cloverleaf', { yaw: 0 }));
  const s = m.ramps.find((r) => r.id === 'mf-slip')!;
  ok(s.from.v > 0 && s.to.u < 0 && s.to.v > 0, 'left-hand traffic: mf-slip leaves on the left, joins the cross road going +v on its left side');
  const l = m.ramps.find((r) => r.id === 'mf-loop')!;
  ok(l.to.u > 0 && l.to.v > 0, 'left-hand traffic: mf-loop returns on the +u side of the cross road (going -v on its left)');
}

// a custom pattern can be registered (no new renderer code)
{
  registerPattern({ id: 'test-single', label: 'one slip', approaches: [0], roles: ['slip'], note: 'test' });
  const m = buildInterchange(spec('test-single'));
  ok(m.ramps.length === 1 && patternIds().includes('test-single'), 'custom pattern from the table: 1 ramp');
}


// STRUCTURE KIT (dressing)
{
  const plain = buildInterchange(spec('cloverleaf'));
  ok(plain.structures.length === 0 && plain.walls.length === 0 && plain.budget.instances === 0, 'dressing plain (default): no structures, no walls');
  const grand = buildInterchange(spec('cloverleaf', { dressing: 'grand' }));
  const n = (m: typeof grand, def: string): number => (m.structures.find((b) => b.def === def)?.data.length ?? 0) / 6;
  ok(n(grand, 'arch') === 2, `grand cloverleaf: 2 arches (${n(grand, 'arch')})`);
  ok(n(grand, 'pavilion') === 2 && n(grand, 'fountain') === 2, `grand cloverleaf: 2 pavilions + 2 fountains (4 loops, mixed garden / pond): ${n(grand, 'pavilion')} / ${n(grand, 'fountain')}`);
  ok(n(grand, 'palm') >= 24, `grand cloverleaf: palm rings (${n(grand, 'palm')})`);
  ok(n(grand, 'billboard') === 4, `grand cloverleaf: 1 billboard per slip (${n(grand, 'billboard')})`);
  ok(grand.budget.instances <= 600 && !grand.issues.some((i) => i.code === 'budget'), `budget: ${grand.budget.instances} instances, ~${grand.budget.trisHint} triangles of shared mesh`);
  ok(grand.structures.every((b) => b.data.length % 6 === 0 && b.data.every((v) => Number.isFinite(v))), 'structure rows are whole and finite');
  const cx = 1000;
  const cz = -500;
  const inside = grand.structures.every((b) => {
    for (let i = 0; i < b.data.length; i += 6) if (Math.hypot(b.data[i] - cx, b.data[i + 2] - cz) > grand.footprintR) return false;
    return true;
  });
  ok(inside, 'every structure is inside the footprint circle');
  // arches stand across the upper road: on its centreline, lowerHalf + 22 m from the centre
  const yaw = 0.4;
  const arches = grand.structures.find((b) => b.def === 'arch')!.data;
  let archOk = true;
  for (let i = 0; i < arches.length; i += 6) {
    const dx = arches[i] - cx;
    const dz = arches[i + 2] - cz;
    const v = dx * Math.sin(yaw) - dz * Math.cos(yaw);
    const u = dx * Math.cos(yaw) + dz * Math.sin(yaw);
    if (Math.abs(v) > 0.01 || Math.abs(Math.abs(u) - (AVENUE.halfWidth + 22)) > 0.01 || Math.abs(arches[i + 4] - (HIGHWAY.halfWidth * 2 + 3)) > 0.01) archOk = false;
    if (arches[i + 1] < 12 + grand.levels.rise - 3) archOk = false; // stands on the raised deck
  }
  ok(archOk, 'arches span the upper (main) road, on its centreline, on the raised deck');
  // palms stay inside their loop garden
  const palms = grand.structures.find((b) => b.def === 'palm')!.data;
  let palmOk = true;
  for (let i = 0; i < palms.length; i += 6) {
    const near = grand.zones.some((z) => Math.hypot(palms[i] - z.x, palms[i + 2] - z.z) < z.radius);
    if (!near) palmOk = false;
  }
  ok(palmOk, 'every palm is inside a loop infield');
  const again = buildInterchange(spec('cloverleaf', { dressing: 'grand' }));
  ok(JSON.stringify(grand.structures.map((b) => [b.def, Array.from(b.data)])) === JSON.stringify(again.structures.map((b) => [b.def, Array.from(b.data)])), 'dressing is deterministic');
  const other = buildInterchange({ ...spec('cloverleaf', { dressing: 'grand' }), id: 'other' });
  ok(JSON.stringify(Array.from(other.structures.find((b) => b.def === 'palm')!.data)) !== JSON.stringify(Array.from(palms)), 'a different interchange id gives a different (but fixed) arrangement');
  const only = buildInterchange(spec('cloverleaf', { dressing: ['palm'] }));
  ok(only.structures.length === 1 && only.structures[0].def === 'palm', 'dressing as an explicit list: only palms');
  const dia = buildInterchange(spec('diamond', { dressing: 'grand' }));
  ok(n(dia, 'arch') === 2 && n(dia, 'billboard') === 2 && n(dia, 'palm') === 0, 'grand diamond: arches + 2 billboards, no loop gardens');
  const emb = buildInterchange(spec('cloverleaf', { dressing: ['wall'] }), () => 12 - 2.2); // ground 2.2 m below the ramps: embankments
  ok(emb.walls.length > 0 && emb.walls.every((w) => w.i1 - w.i0 >= 3 && w.maxH > 1.2 && w.maxH <= 3), `retaining walls on embankment stretches (${emb.walls.length} runs)`);
}

// bad input
{
  let threw = false;
  try {
    buildInterchange(spec('nope'));
  } catch {
    threw = true;
  }
  ok(threw, 'unknown pattern throws a clear error');
  const m = buildInterchange(spec('cloverleaf', { params: { loopR: 15 } }));
  ok(m.issues.some((i) => i.code === 'radius'), 'a loop that is too tight is reported (radius)');
  const m2 = buildInterchange(spec('cloverleaf', { params: { rampMaxGrade: 0.01 } }));
  ok(m2.issues.some((i) => i.code === 'grade'), 'a ramp that is too steep is reported (grade)');
  const m3 = buildInterchange(spec('cloverleaf', { params: { clearance: 0.2, deckThickness: 0.2 } }));
  ok(m3.issues.some((i) => i.code === 'clearance-min'), 'no clearance between roads is reported');
}

console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);

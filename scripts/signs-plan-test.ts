// ROAD SIGNS Step 3 test: npx tsx scripts/signs-plan-test.ts
//   Part A  a small hand-made road network (runs anywhere): checks arrows (left / ahead / right), km, dead-end roads, the "behind you" rule, styles.
//   Part B  the real game map (needs the game's node_modules, ~10 s): builds the plan, prints the numbers and a list of boards, checks the rules.
import { planRoadSigns, isOverhead, overheadAt, SIGN_RULES, type PlanNet, type PlanRoad, type PlannedSign } from '../src/signs/SignPlan';
import type { Destination } from '../src/signs/SignDestinations';

let fails = 0;
const ok = (c: boolean, msg: string): void => {
  console.log((c ? 'PASS ' : 'FAIL ') + msg);
  if (!c) fails++;
};
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

function line(id: number, name: string, kind: string, lanes: number, x0: number, z0: number, x1: number, z1: number): PlanRoad {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.round(length / 10) + 1;
  const xs: number[] = [];
  const zs: number[] = [];
  const cum: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    xs.push(x0 + (x1 - x0) * f);
    zs.push(z0 + (z1 - z0) * f);
    cum.push(length * f);
  }
  return { id, name, kind, lanes, halfWidth: 7, shoulder: 1.5, step: 10, xs, zs, cum, length, closed: false, bridgeOf: new Array(n).fill(-1) };
}
const dest = (id: string, en: string, rank: 1 | 2 | 3, x: number, z: number): Destination => ({ id, en, bn: en + '-bn', rank, x, z });

function partA(): void {
  console.log('--- Part A: hand-made network ---');
  // road 0 runs west-east, road 1 north-south through the origin, road 2 north-south at x = -1500 (a short one)
  const roads = [line(0, 'E0', 'arterial', 2, -3000, 0, 3000, 0), line(1, 'N1', 'collector', 2, 0, -3000, 0, 3000), line(2, 'N2', 'local', 2, -1500, -1000, -1500, 1000)];
  const pads = [
    { x: -1500, z: 0, arms: [{ roadId: 0 }, { roadId: 2 }] },
    { x: 0, z: 0, arms: [{ roadId: 0 }, { roadId: 1 }] },
  ];
  const net: PlanNet = { roads, pads, padAt: () => null, surfaceAt: () => 0 };
  const dests = [
    dest('e', 'East', 1, 2800, 0),
    dest('n', 'North', 1, 0, -2800),
    dest('s', 'South', 2, 0, 2800),
    dest('w', 'West', 1, -2900, 0),
    // near the two ends of the short road at x = -1500
    dest('nw', 'NorthWest', 2, -1500, -900),
    dest('sw', 'SouthWest', 2, -1500, 900),
  ];
  const plan = planRoadSigns(net, dests, { x: 0, z: 0 });
  console.log(plan.summary);

  // a driver coming from the west towards the origin: East ahead, North on the LEFT (north = -z), South on the RIGHT, West is behind
  const west = plan.signs.find((q) => q.purpose === 'advance' && q.padId === 1 && q.roadId === 0 && q.hx > 0.9);
  ok(!!west, 'advance board for the driver coming from the west at the origin');
  if (west) {
    const by = (en: string) => west.rows.find((r) => r.en === en);
    ok(by('East')?.arrow === 'ahead', 'East is ahead');
    ok(by('North')?.arrow === 'left', 'North is on the left (driver heads east)');
    ok(by('South')?.arrow === 'right', 'South is on the right');
    ok(!by('West') && !by('NorthWest'), 'West and NorthWest (behind the driver) are not listed');
    ok(near(by('East')?.km ?? 0, (west.dM + 2800) / 1000, 0.01), `East distance = board distance ${west.dM} m + 2800 m`);
    ok(near(by('North')?.km ?? 0, (west.dM + 2800) / 1000, 0.01), 'North distance');
    ok(west.style === 'overhead' && west.color === 'green', 'arterial: overhead board, green');
    ok(near(west.dM, SIGN_RULES.advanceM.arterial, 0.01), `arterial board stands ${SIGN_RULES.advanceM.arterial} m before the junction`);
    // the board stands before the junction on the driver's side of it: x < 0 (junction at x = 0), on the left = north side (z < 0)
    ok(west.x < 0 && near(west.x, -west.dM, 1), 'board is west of the junction, dM metres from it');
    ok(west.sz < west.z, 'side spot is on the LEFT of an eastbound driver (north, smaller z)');
  }
  // a driver coming from the east at pad 0 (x = -1500), heading west: West ahead, North on the RIGHT, South on the LEFT
  const east = plan.signs.find((q) => q.purpose === 'advance' && q.padId === 0 && q.roadId === 0 && q.hx < -0.9);
  ok(!!east, 'advance board for the driver coming from the east at x = -1500');
  if (east) {
    const by = (en: string) => east.rows.find((r) => r.en === en);
    ok(by('West')?.arrow === 'ahead', 'West is ahead (dead-end stretch of the road behind the last junction)');
    ok(by('NorthWest')?.arrow === 'right', 'NorthWest is on the right (driver heads west, dead-end stretch of the short road)');
    ok(by('SouthWest')?.arrow === 'left', 'SouthWest is on the left');
    ok(near(by('NorthWest')?.km ?? 0, (east.dM + 900) / 1000, 0.01), 'NorthWest distance = board distance + 900 m');
    ok(!by('East') && !by('North'), 'East and North (behind the driver, via the other junction) are not listed');
  }
  ok(plan.signs.every((q) => q.rows.length >= 1 && q.rows.length <= SIGN_RULES.maxRows), 'every board has 1..4 rows');
  ok(plan.signs.every((q) => q.rows.every((r) => (r.km ?? 0) > 0)), 'every row has a positive distance');
  ok(isOverhead({ kind: 'local', lanes: 4 }) && isOverhead({ kind: 'highway', lanes: 2 }) && !isOverhead({ kind: 'collector', lanes: 2 }), 'overhead is possible on highway / arterial / 4+ lane roads only');
  ok(
    overheadAt({ kind: 'highway', lanes: 4 }, false) &&
      overheadAt({ kind: 'arterial', lanes: 2 }, false) &&
      overheadAt({ kind: 'local', lanes: 4 }, true) &&
      !overheadAt({ kind: 'local', lanes: 4 }, false) &&
      !overheadAt({ kind: 'collector', lanes: 2 }, true) &&
      !overheadAt({ kind: 'local', lanes: 2 }, true),
    'style rule: highway / arterial always overhead; 4+ lane city road overhead only at a special junction; small roads always side',
  );
}

function boardText(q: PlannedSign): string {
  return q.rows.map((r) => `${r.arrow} ${r.en} ${(r.km ?? 0).toFixed(1)}`).join(' | ');
}

/** STEP 6: where do boards stand and where do they not? Printed numbers only (no pass/fail), the decision what to fill is the user's. */
function coverageReport(net: { roads: readonly PlanRoad[]; pads: readonly { x: number; z: number; arms: readonly { roadId: number }[] }[] }, signs: PlannedSign[], skipped: Record<string, number>): void {
  console.log('\n--- coverage (Step 6) ---');
  const padsOf = new Map<number, number>();
  for (const p of net.pads) for (const a of new Set(p.arms.map((x) => x.roadId))) padsOf.set(a, (padsOf.get(a) ?? 0) + 1);
  const byRoad = new Map<number, PlannedSign[]>();
  for (const q of signs) (byRoad.get(q.roadId) ?? byRoad.set(q.roadId, []).get(q.roadId)!).push(q);

  type Row = { roads: number; withPad: number; withBoard: number; boards: number; km: number; kmBoard: number };
  const kinds = new Map<string, Row>();
  const get = (k: string): Row => kinds.get(k) ?? (kinds.set(k, { roads: 0, withPad: 0, withBoard: 0, boards: 0, km: 0, kmBoard: 0 }), kinds.get(k)!);
  for (const r of net.roads) {
    const key = r.kind + (r.lanes >= 4 && r.kind !== 'highway' && r.kind !== 'arterial' ? ' (4+ lane)' : '');
    const k = get(key);
    const n = byRoad.get(r.id)?.length ?? 0;
    k.roads++;
    k.km += r.length / 1000;
    if ((padsOf.get(r.id) ?? 0) > 0) k.withPad++;
    if (n > 0) {
      k.withBoard++;
      k.boards += n;
      k.kmBoard += r.length / 1000;
    }
  }
  console.log('road kind'.padEnd(22) + 'roads  w/pad  w/board  boards    km  km-with-board');
  for (const [key, k] of [...kinds].sort())
    console.log(key.padEnd(22) + [k.roads, k.withPad, k.withBoard, k.boards].map((n) => String(n).padStart(5)).join('  ') + k.km.toFixed(1).padStart(7) + k.kmBoard.toFixed(1).padStart(10));

  // roads with NO board, grouped by why
  const noPad: PlanRoad[] = [];
  const padNoBoard: PlanRoad[] = [];
  for (const r of net.roads) {
    if (byRoad.has(r.id)) continue;
    ((padsOf.get(r.id) ?? 0) === 0 ? noPad : padNoBoard).push(r);
  }
  const list = (title: string, rs: PlanRoad[]): void => {
    console.log(`\n${title}: ${rs.length} roads, ${(rs.reduce((a, r) => a + r.length, 0) / 1000).toFixed(1)} km`);
    const perKind = new Map<string, number>();
    for (const r of rs) perKind.set(r.kind, (perKind.get(r.kind) ?? 0) + 1);
    console.log('  by kind: ' + [...perKind].map(([k, n]) => `${k} ${n}`).join(', '));
    for (const r of [...rs].sort((a, b) => b.length - a.length).slice(0, 12)) console.log(`  #${r.id} ${r.name} (${r.kind} L${r.lanes}) ${r.length.toFixed(0)} m, pads ${padsOf.get(r.id) ?? 0}`);
  };
  list('roads with no junction pad at all (not in the sign graph)', noPad);
  list('roads that touch a pad but got no board', padNoBoard);

  // long stretches without a board, per road and driving direction (boards only help the driver who passes them in their own direction)
  const gaps: { r: PlanRoad; dir: number; gap: number; from: number }[] = [];
  for (const r of net.roads) {
    if (r.kind === 'local' && r.length < 800) continue;
    for (const dir of [1, -1]) {
      const ss = (byRoad.get(r.id) ?? []).filter((q) => q.dir === dir).map((q) => q.s).sort((a, b) => a - b);
      const pts = [0, ...ss, r.length];
      for (let i = 1; i < pts.length; i++) {
        const gap = pts[i] - pts[i - 1];
        if (gap > 1500) gaps.push({ r, dir, gap, from: pts[i - 1] });
      }
    }
  }
  console.log(`\nstretches over 1500 m with no board in that driving direction: ${gaps.length}`);
  for (const g of gaps.sort((a, b) => b.gap - a.gap).slice(0, 12)) console.log(`  #${g.r.id} ${g.r.name} (${g.r.kind}) dir ${g.dir > 0 ? '+' : '-'}: ${g.gap.toFixed(0)} m from s=${g.from.toFixed(0)}`);

  // the four gaps the user listed
  console.log('\nthe four known gaps:');
  console.log(`  (a) short blocks: ${skipped['advance: block too short'] ?? 0} advance candidates dropped (block too short)`);
  const small = net.roads.filter((r) => r.kind === 'local' && r.lanes >= 4);
  console.log(`  (d) 4+ lane local roads: ${small.length}, with a board: ${small.filter((r) => byRoad.has(r.id)).length}, lengths ${small.map((r) => r.length.toFixed(0)).join(' ')} m`);
  const sea = net.roads.filter((r) => /sea\s*airport/i.test(r.name));
  for (const r of sea) console.log(`  (d) ${r.name} #${r.id} (${r.kind} L${r.lanes}) ${r.length.toFixed(0)} m, pads ${padsOf.get(r.id) ?? 0}, boards ${byRoad.get(r.id)?.length ?? 0}`);
  const confirmEligible = net.roads.filter((r) => SIGN_RULES.confirmKinds.includes(r.kind));
  const confirmCount = signs.filter((q) => q.purpose === 'confirm').length;
  console.log(`  (c) confirm boards: ${confirmCount} on ${confirmEligible.length} highway/arterial/collector roads (${(confirmEligible.reduce((a, r) => a + r.length, 0) / 1000).toFixed(1)} km)`);
}

async function partB(): Promise<void> {
  console.log('\n--- Part B: real map ---');
  let TerrainGenerator: typeof import('../src/terrain/TerrainGenerator').TerrainGenerator;
  let Config: typeof import('../src/core/Config').Config;
  try {
    ({ TerrainGenerator } = await import('../src/terrain/TerrainGenerator'));
    ({ Config } = await import('../src/core/Config'));
  } catch (e) {
    console.log('SKIPPED (needs the game node_modules):', (e as Error).message.split('\n')[0]);
    return;
  }
  const net = new TerrainGenerator(Config.world.seed).roads;
  const t0 = performance.now();
  const plan = planRoadSigns(net);
  console.log(`planned in ${(performance.now() - t0).toFixed(0)} ms`);
  console.log(plan.summary);
  console.log('dropped / skipped:', plan.skipped);
  if (plan.sameArrowBoards > 0) console.log(`WARN  ${plan.sameArrowBoards} boards have two arms with the same arrow (ambiguous board)`);

  const byId = new Map(net.roads.map((r) => [r.id, r]));
  const signs = plan.signs;
  ok(signs.length > 0, `${signs.length} boards planned`);
  ok(signs.every((q) => Number.isFinite(q.x + q.z + q.sx + q.sz + q.fx + q.fz)), 'all positions are finite numbers');
  ok(signs.every((q) => q.rows.length >= 1 && q.rows.length <= SIGN_RULES.maxRows), 'every board has 1..4 rows');
  ok(signs.every((q) => q.rows.every((r) => Number.isFinite(r.km) && (r.km ?? 0) > 0 && !!r.arrow && !!r.bn && !!r.en)), 'every row has names, an arrow and a positive distance');
  ok(signs.every((q) => q.rows.every((r) => (r.km ?? 0) <= 20)), 'no distance above 20 km');
  ok(signs.every((q) => q.style === 'side' || isOverhead(byId.get(q.roadId)!)), 'overhead boards only on highway / arterial / 4+ lane roads');
  ok(signs.every((q) => q.purpose === 'advance' || q.style === 'side'), 'confirm boards are always side boards');
  ok(
    signs.every((q) => {
      if (q.purpose !== 'advance' || q.short) return true;
      const r = byId.get(q.roadId)!;
      if (r.kind === 'highway' || r.kind === 'arterial') return q.style === 'overhead';
      if (r.lanes < 4) return q.style === 'side';
      return true; // 4+ lane city road: either, decided by the junction
    }),
    'advance boards: highway / arterial overhead, roads under 4 lanes side (short-block boards are always side)',
  );
  const wideCity = signs.filter((q) => q.purpose === 'advance' && q.roadKind !== 'highway' && q.roadKind !== 'arterial' && q.lanes >= 4);
  console.log(`4+ lane city roads: ${wideCity.filter((q) => q.style === 'overhead').length} overhead (special junction), ${wideCity.filter((q) => q.style === 'side').length} side`);
  ok(signs.every((q) => q.style !== 'side' || q.sideOk), 'every side board has a free spot');
  ok(signs.every((q) => !net.padAt(q.x, q.z)), 'no board inside a junction');
  ok(
    signs.every((q) => {
      const r = byId.get(q.roadId)!;
      let i = 0;
      while (i < r.xs.length - 1 && r.cum[i] < q.s) i++;
      for (let k = Math.max(0, i - 3); k <= Math.min(r.xs.length - 1, i + 3); k++) if (r.bridgeOf[k] >= 0) return false;
      return true;
    }),
    'no board on or next to a bridge',
  );
  ok(signs.every((q) => Math.abs(q.hx * q.hx + q.hz * q.hz - 1) < 1e-6 && Math.abs(q.fx * q.fx + q.fz * q.fz - 1) < 1e-6), 'heading and facing are unit vectors');
  ok(signs.every((q) => q.fx * q.hx + q.fz * q.hz < 0), 'every board faces back at the oncoming driver');

  // spacing: same road + direction, overhead vs side at least 400 m apart
  let tooClose = 0;
  for (let i = 0; i < signs.length; i++) {
    for (let j = i + 1; j < signs.length; j++) {
      const a = signs[i];
      const b = signs[j];
      if (a.roadId !== b.roadId || a.dir !== b.dir || a.style === b.style) continue;
      const r = byId.get(a.roadId)!;
      const raw = Math.abs(a.s - b.s);
      const d = r.closed ? Math.min(raw, r.length - raw) : raw;
      if (d < SIGN_RULES.mixedGapM) tooClose++;
    }
  }
  ok(tooClose === 0, `overhead and side boards of one road and direction are >= ${SIGN_RULES.mixedGapM} m apart (${tooClose} too close)`);

  // numbers
  const perKind = new Map<string, number>();
  for (const q of signs) {
    const key = `${q.roadKind}/${q.style}/${q.purpose}`;
    perKind.set(key, (perKind.get(key) ?? 0) + 1);
  }
  console.log('\nboards by road kind / style / purpose:');
  for (const [k, n] of [...perKind].sort()) console.log('  ' + k.padEnd(32) + String(n).padStart(4));
  const dMs = signs.filter((q) => q.purpose === 'advance').map((q) => q.dM);
  console.log(`advance distance before the junction: min ${Math.min(...dMs).toFixed(0)} m, max ${Math.max(...dMs).toFixed(0)} m`);
  const maxKm = new Map<string, number>();
  for (const q of signs) for (const r of q.rows) maxKm.set(r.en, Math.max(maxKm.get(r.en) ?? 0, r.km ?? 0));
  console.log(`places that appear on boards: ${maxKm.size}`);

  // independent plausibility check: the arrow should roughly agree with the STRAIGHT-LINE bearing to the place (roads bend, so only gross
  // contradictions count: the place is clearly on one side by air but the arrow says the other side)
  const { DESTINATIONS } = await import('../src/signs/SignDestinations');
  const pos = new Map(DESTINATIONS.map((d) => [d.en, d]));
  let contradictions = 0;
  let rowsChecked = 0;
  const examples: string[] = [];
  for (const q of signs) {
    if (q.purpose !== 'advance') continue;
    const th = q.padHeading;
    const pad = plan.pads[q.padId];
    for (const r of q.rows) {
      const d = pos.get(r.en);
      if (!d) continue;
      let rel = Math.atan2(d.z - pad.z, d.x - pad.x) - th;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      rowsChecked++;
      const bad = (rel > 1.2 && r.arrow === 'left') || (rel < -1.2 && r.arrow === 'right') || (Math.abs(rel) > 2.4 && r.arrow === 'ahead');
      if (bad) {
        contradictions++;
        if (examples.length < 8) examples.push(`#${q.id} ${q.roadName}: ${r.en} arrow ${r.arrow}, straight-line angle ${((rel * 180) / Math.PI).toFixed(0)} deg`);
      }
    }
  }
  console.log(`arrow vs straight-line bearing: ${contradictions} clear contradictions in ${rowsChecked} rows`);
  for (const e of examples) console.log('  WARN  ' + e);

  // ---- STEP 6 rules
  const nReal = net.pads.length;
  ok(plan.pads.length === nReal + plan.virtualPads, `junction list = ${nReal} real + ${plan.virtualPads} virtual pads`);
  let nearReal = 0;
  for (const v of plan.pads.slice(nReal)) if (net.pads.some((p) => Math.hypot(p.x - v.x, p.z - v.z) < SIGN_RULES.virtualPadMinGapM - 1e-6)) nearReal++;
  ok(nearReal === 0, `no virtual pad within ${SIGN_RULES.virtualPadMinGapM} m of a real pad (${nearReal})`);
  const shorts = signs.filter((q) => q.short);
  ok(shorts.every((q) => q.style === 'side' && q.purpose === 'advance'), `${shorts.length} short-block boards are all side advance boards`);
  ok(shorts.every((q) => q.dM >= SIGN_RULES.shortBlockMinM - SIGN_RULES.shortBlockFromBehindM - 10), 'short-block boards stand at least ~35 m before their junction');
  ok(signs.filter((q) => q.purpose === 'advance' && !q.short).every((q) => q.dM >= SIGN_RULES.minAdvanceM - 1e-6), 'normal advance boards stand at least 70 m before the junction');
  const confirms = signs.filter((q) => q.purpose === 'confirm');
  let confirmGapBad = 0;
  for (const a of confirms) for (const b of confirms) if (a !== b && a.roadId === b.roadId && a.dir === b.dir && Math.abs(a.s - b.s) < SIGN_RULES.sameGapM) confirmGapBad++;
  ok(confirmGapBad === 0, `confirm boards of one road and direction are >= ${SIGN_RULES.sameGapM} m apart`);
  ok(signs.every((q) => q.purpose !== 'confirm' || q.dM >= 60), 'confirm boards stand at least 60 m after their junction');
  ok(signs.every((q) => q.padId >= 0 && q.padId < plan.pads.length), 'every board points to an existing junction');
  coverageReport({ roads: net.roads, pads: plan.pads }, signs, plan.skipped);

  console.log('\nfirst 20 boards (id purpose style road D | rows):');
  for (const q of signs.slice(0, 20)) console.log(`  #${q.id} ${q.purpose} ${q.style} ${q.roadName} (${q.roadKind} L${q.lanes}) ${q.dM.toFixed(0)} m | ${boardText(q)}`);
}

partA();
partB()
  .catch((e) => {
    console.log('Part B error:', e);
    fails++;
  })
  .finally(() => {
    console.log(fails ? `\nFAILED ${fails}` : '\nALL PASS');
    process.exit(fails ? 1 : 0);
  });

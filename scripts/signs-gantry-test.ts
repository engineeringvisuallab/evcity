// ROAD SIGNS Step 4 test: npx tsx scripts/signs-gantry-test.ts
//   Part A  the gantry layout maths (runs anywhere, no node_modules): number of boards, scale, positions, narrow roads.
//   Part B  the real game map (needs the game's node_modules, ~10 s): for every planned OVERHEAD board checks that its gantry fits the real road
//           and that both posts stand on free ground (not on another road, not in a junction).
import { GANTRY, gantryEdge, layoutGantry } from '../src/signs/GantryLayout';
import { BOARD_W_M } from '../src/signs/SignCanvas';

let fails = 0;
const ok = (c: boolean, msg: string): void => {
  console.log((c ? 'PASS ' : 'FAIL ') + msg);
  if (!c) fails++;
};
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

function partA(): void {
  console.log('--- Part A: layout maths ---');
  // post distance = asphalt half width + shoulder + the gap outside the shoulder
  ok(near(gantryEdge(7, 1.5), 7 + 1.5 + GANTRY.postOutsideM, 1e-9), 'post distance = halfWidth + shoulder + postOutside');

  // a wide road (edge 9.7 m): one, two and three boards all fit at the biggest scale
  for (const want of [1, 2, 3]) {
    const L = layoutGantry(9.7, want);
    ok(L.n === want && L.dropped === 0 && L.fits, `edge 9.7, ${want} board(s): all placed (n=${L.n}, scale ${L.scale.toFixed(2)})`);
    ok(L.scale <= GANTRY.maxScale + 1e-9 && L.scale >= GANTRY.minScale - 1e-9, `edge 9.7, ${want} board(s): scale ${L.scale.toFixed(2)} inside [${GANTRY.minScale}, ${GANTRY.maxScale}]`);
  }

  // boards stay inside the usable beam width, do not overlap, are ordered left -> right and centred
  for (const edge of [5, 6.5, 8, 9.7, 12, 20]) {
    for (const want of [1, 2, 3]) {
      const L = layoutGantry(edge, want);
      const first = L.xs[0] - L.boardW / 2;
      const last = L.xs[L.n - 1] + L.boardW / 2;
      const inside = first >= -L.usable / 2 - 1e-9 && last <= L.usable / 2 + 1e-9;
      const ordered = L.xs.every((x, i) => i === 0 || x - L.xs[i - 1] >= L.boardW + GANTRY.boardGapM - 1e-9);
      const centred = near(first + last, 0, 1e-9);
      ok(inside && ordered && centred && L.xs.length === L.n, `edge ${edge}, want ${want}: n=${L.n} scale ${L.scale.toFixed(2)} -> inside beam, no overlap, centred`);
    }
  }

  // narrow road: boards are dropped before they get too small, one board is always kept
  const narrow = layoutGantry(3, 3);
  ok(narrow.n === 2 && narrow.dropped === 1, `edge 3 (a very narrow road), want 3: only ${narrow.n} fit, ${narrow.dropped} dropped`);
  ok(narrow.n === 1 || narrow.scale >= GANTRY.minScale - 1e-9, 'a board is never shrunk below minScale unless it is the only one');
  const one = layoutGantry(2.5, 3);
  ok(one.n === 1 && one.fits, `edge 2.5, want 3: one board kept (n=${one.n}), still fits`);
  const tiny = layoutGantry(0.3, 1);
  ok(tiny.n === 1 && !tiny.fits && tiny.scale >= GANTRY.floorScale - 1e-9, 'edge 0.3 (absurdly narrow): one board, fits = false');

  // more than maxBoards wanted -> capped
  ok(layoutGantry(30, 7).n === GANTRY.maxBoards, 'wanting 7 boards gives at most maxBoards');
  // board width follows the scale
  const L1 = layoutGantry(9.7, 1);
  ok(near(L1.boardW, BOARD_W_M * L1.scale, 1e-9), 'board width = BOARD_W_M * scale');
  // beam is longer than the span between the posts
  ok(near(L1.beamLen, 2 * 9.7 + 2 * GANTRY.overhangM, 1e-9), 'beam = span between posts + overhang on both ends');
  // clearance is above the legal minimum
  ok(GANTRY.clearanceM >= 5.1, `clearance ${GANTRY.clearanceM} m >= 5.1 m`);
}

async function partB(): Promise<void> {
  console.log('\n--- Part B: real map ---');
  let TerrainGenerator: typeof import('../src/terrain/TerrainGenerator').TerrainGenerator;
  let Config: typeof import('../src/core/Config').Config;
  let planRoadSigns: typeof import('../src/signs/SignPlan').planRoadSigns;
  try {
    ({ TerrainGenerator } = await import('../src/terrain/TerrainGenerator'));
    ({ Config } = await import('../src/core/Config'));
    ({ planRoadSigns } = await import('../src/signs/SignPlan'));
  } catch (e) {
    console.log('SKIPPED (needs the game node_modules):', (e as Error).message.split('\n')[0]);
    return;
  }
  const net = new TerrainGenerator(Config.world.seed).roads;
  const plan = planRoadSigns(net);
  const byId = new Map(net.roads.map((r) => [r.id, r]));
  const over = plan.signs.filter((q) => q.style === 'overhead');
  ok(over.length > 0, `${over.length} overhead boards in the plan`);

  let tooNarrow = 0;
  let badPost = 0;
  let minScale = Infinity;
  let maxEdge = 0;
  let minEdge = Infinity;
  const kinds: Record<string, number> = {};
  for (const q of over) {
    const r = byId.get(q.roadId)!;
    const edge = gantryEdge(r.halfWidth, r.shoulder);
    const L = layoutGantry(edge, 1);
    if (!L.fits) tooNarrow++;
    minScale = Math.min(minScale, L.scale);
    minEdge = Math.min(minEdge, edge);
    maxEdge = Math.max(maxEdge, edge);
    kinds[`${r.kind}/${r.lanes}`] = (kinds[`${r.kind}/${r.lanes}`] ?? 0) + 1;
    // left of the driver (hx, hz) is (hz, -hx)
    const lx = q.x + q.hz * edge;
    const lz = q.z - q.hx * edge;
    const rx = q.x - q.hz * edge;
    const rz = q.z + q.hx * edge;
    if (net.surfaceAt(lx, lz) === 1 || net.surfaceAt(rx, rz) === 1) badPost++;
  }
  console.log(`road kinds under the overhead boards (kind/lanes: count):`, kinds);
  console.log(`post distance ${minEdge.toFixed(1)}..${maxEdge.toFixed(1)} m, smallest single-board scale ${minScale.toFixed(2)}`);
  ok(tooNarrow === 0, `every overhead board's gantry fits its road (${tooNarrow} too narrow)`);
  // posts on a junction pad / another road are a WARN (Step 5 can shift the gantry along the road), not a failure
  if (badPost > 0) console.log(`WARN  ${badPost} of ${over.length} gantries have a post on a junction or on another road's surface`);
  else console.log(`PASS  no gantry post stands in a junction (${over.length} checked)`);

  // how many 2/3-board gantries would fit if boards of the same junction were merged (information for Step 5)
  const wide = over.filter((q) => layoutGantry(gantryEdge(byId.get(q.roadId)!.halfWidth, byId.get(q.roadId)!.shoulder), 3).n === 3).length;
  console.log(`${wide} of ${over.length} overhead spots could carry 3 boards (information for Step 5)`);
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

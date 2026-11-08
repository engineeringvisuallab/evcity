// (Step 6 added: solid parts of the boards, no gantry post on a junction / road, texture memory estimate.)
// (Step 7 added: double-sided boards - solids of a double-sided side sign / gantry, mirrored back layout, texture memory counts both faces of a board.)
// ROAD SIGNS Step 4 test: npx tsx scripts/signs-gantry-test.ts
//   Part A  the gantry layout maths (runs anywhere, no node_modules): panels fill the whole width, narrow roads, how rows are split into panels.
//   Part B  the real game map (needs the game's node_modules, ~10 s): for every planned OVERHEAD board checks that its gantry fits the real road
//           and that both posts stand on free ground (not on another road, not in a junction), and counts panels per gantry.
import { GANTRY, gantryEdge, layoutGantry, splitPanels } from '../src/signs/GantryLayout';
import type { SignArrow, SignRow } from '../src/signs/SignFormat';
import { gantrySolids, sideSolids, solidsRadius, SOLID } from '../src/signs/SignSolids';
import { BOARD_PX_PER_M, BOARD_W_PX, boardHeightPx } from '../src/signs/SignCanvas';

let fails = 0;
const ok = (c: boolean, msg: string): void => {
  console.log((c ? 'PASS ' : 'FAIL ') + msg);
  if (!c) fails++;
};
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
const row = (en: string, arrow: SignArrow): SignRow => ({ en, bn: en + '-bn', arrow, km: 1 });

function partA(): void {
  console.log('--- Part A: layout maths ---');
  ok(near(gantryEdge(7, 1.5), 7 + 1.5 + GANTRY.postOutsideM, 1e-9), 'post distance = halfWidth + shoulder + postOutside');

  // the panels FILL the whole width: first panel starts at the left end, last ends at the right end, gaps are exact
  for (const edge of [4, 5, 6.5, 8, 9.7, 12, 20]) {
    for (const want of [1, 2, 3]) {
      const L = layoutGantry(edge, want);
      const first = L.xs[0] - L.panelW / 2;
      const last = L.xs[L.n - 1] + L.panelW / 2;
      const filled = near(first, -L.span / 2, 1e-9) && near(last, L.span / 2, 1e-9);
      const gaps = L.xs.every((x, i) => i === 0 || near(x - L.xs[i - 1], L.panelW + GANTRY.panelGapM, 1e-9));
      ok(filled && gaps && L.xs.length === L.n && L.n + L.merged === want, `edge ${edge}, want ${want}: ${L.n} panel(s) of ${L.panelW.toFixed(2)} m fill ${L.span.toFixed(1)} m`);
    }
  }
  // the face is wider than the span between the posts (it covers the road edge to edge)
  const L9 = layoutGantry(9.7, 3);
  ok(L9.span > 2 * 9.7, 'sign face is wider than the distance between the posts');
  ok(L9.n === 3 && L9.merged === 0 && L9.fits, 'a normal wide road (edge 9.7) takes all 3 panels');
  // narrow road: panels are merged before they get narrower than minPanelM, one panel is always kept
  const narrow = layoutGantry(3, 3);
  ok(narrow.n === 2 && narrow.merged === 1 && narrow.panelW >= GANTRY.minPanelM, `edge 3, want 3: ${narrow.n} panels, ${narrow.merged} merged`);
  const tiny = layoutGantry(0.3, 3);
  ok(tiny.n === 1 && !tiny.fits, 'edge 0.3 (absurdly narrow): one panel, fits = false');
  ok(layoutGantry(30, 7).n === GANTRY.maxPanels, 'wanting 7 panels gives at most maxPanels');
  ok(GANTRY.clearanceM >= 5.1, `clearance ${GANTRY.clearanceM} m >= 5.1 m`);

  // splitPanels: order left, ahead, right; same arrow stays together; fewer than 3 groups are spread to fill the width
  const names = (p: SignRow[][]): string => p.map((g) => g.map((r) => r.en).join('+')).join(' | ');
  let p = splitPanels([row('R', 'right'), row('A', 'ahead'), row('L', 'left')]);
  ok(names(p) === 'L | A | R', `3 arrows -> left, ahead, right panels (${names(p)})`);
  p = splitPanels([row('A1', 'ahead'), row('A2', 'ahead'), row('A3', 'ahead')]);
  ok(p.length === 3 && names(p) === 'A1 | A2 | A3', `3 rows all ahead -> 3 panels, same order (${names(p)})`);
  p = splitPanels([row('A1', 'ahead'), row('A2', 'ahead')]);
  ok(names(p) === 'A1 | A2', `2 rows ahead -> 2 panels (${names(p)})`);
  p = splitPanels([row('A1', 'ahead')]);
  ok(p.length === 1 && names(p) === 'A1', 'one row -> one panel (full width)');
  p = splitPanels([row('L', 'left'), row('A1', 'ahead'), row('A2', 'ahead'), row('A3', 'ahead')]);
  ok(p.length === 3 && names(p) === 'L | A1+A2 | A3' || names(p) === 'L | A1 | A2+A3', `4 rows (1 left, 3 ahead) -> 3 panels (${names(p)})`);
  ok(splitPanels([row('L', 'left'), row('A', 'ahead'), row('R', 'right'), row('X', 'ahead')]).length === 3, '4 rows still give at most 3 panels');
  const total = (pp: SignRow[][]): number => pp.reduce((n, g) => n + g.length, 0);
  ok(total(splitPanels([row('a', 'left'), row('b', 'left'), row('c', 'right'), row('d', 'ahead')])) === 4, 'no row is lost when splitting');
}

function partASolids(): void {
  console.log('\n--- Part A (Step 6): solid parts ---');
  const edge = 9;
  const g = gantrySolids(edge, [-0.4, 1.2], 8, GANTRY.postR, GANTRY.postBelowM, GANTRY.baseSizeM, GANTRY.baseHeightM, -0.15);
  ok(g.length === 4, 'a gantry has 4 solids: 2 posts + 2 concrete bases');
  const posts = g.filter((x) => x.k === 1);
  ok(posts.length === 2 && Math.abs(posts[0].cx + edge) < 1e-9 && Math.abs(posts[1].cx - edge) < 1e-9, 'posts stand exactly at +-edge, left and right');
  ok(posts.every((p) => p.cy + p.hy >= 8 - 1e-9 && p.cy - p.hy <= -GANTRY.postBelowM + 1e-9), 'a post reaches from below the road / its foot up to the top');
  ok(posts[0].cy - posts[0].hy <= -0.4 - GANTRY.postBelowM + 1e-9, 'a post whose foot is lower than the road goes below its own foot');
  ok(g.filter((x) => x.k === 0).every((b) => Math.abs(b.hx * 2 - GANTRY.baseSizeM) < 1e-9), 'concrete bases have the model size');
  ok(g.every((x) => Math.abs(x.cx) <= edge + 1e-9), 'no solid sticks into the carriageway (all at |x| >= post edge - base)');
  ok(g.every((x) => Math.abs(x.cx) - x.hx >= edge - GANTRY.baseSizeM / 2 - 1e-9), 'the inner side of a post / base is at most half a base from the post axis');
  const sd = sideSolids(3.2, 1.2, 2, 1.2, -0.14, 0.8);
  ok(sd.length === 3 && sd.filter((x) => x.k === 1).length === 2, 'a side sign has 2 posts + the board');
  const board = sd.find((x) => x.k === 0)!;
  ok(Math.abs(board.cy - (2 + 0.6)) < 1e-9 && board.hx > 1.6, 'the side board box sits 2 m above the ground, as wide as the board');
  ok(sd.filter((x) => x.k === 1).every((p) => Math.abs(p.hx - SOLID.sidePostR) < 1e-9 && p.cy - p.hy <= -0.8 + 1e-9), 'side posts go into the ground');
  ok(solidsRadius(g) > edge && solidsRadius(sd) > 1.2, 'activation radius covers the solids');

  // ---- Step 7: double-sided boards
  console.log('\n--- Part A (Step 7): double-sided boards ---');
  const sd2 = sideSolids(3.2, 1.2, 2, 1.2, 0, 0.8, true);
  const board2 = sd2.find((x) => x.k === 0)!;
  ok(sd2.length === 3 && sd2.filter((x) => x.k === 1).length === 2, 'a double-sided side sign still has 2 posts + the board (one collider group)');
  ok(Math.abs(board2.cz) < 1e-9 && board2.hz >= SOLID.sideBoardDepthDouble / 2, 'the double-sided board box is centred on the posts and as thick as the visible body');
  ok(sd2.filter((x) => x.k === 1).every((p) => Math.abs(p.cz) < 1e-9), 'the posts of a double-sided sign stand inside the board thickness');
  ok(Math.abs(board2.cy - board.cy) < 1e-9 && board2.hx === board.hx, 'same height and width as a single-sided board');
  ok(GANTRY.bodyDepthDoubleM >= 2 * GANTRY.postR - 1e-9, 'the body of a double-sided gantry is at least as deep as a post is thick (posts do not cover the panels)');
  const g2 = gantrySolids(edge, [-0.4, 1.2], 8, GANTRY.postR, GANTRY.postBelowM, GANTRY.baseSizeM, GANTRY.baseHeightM, 0);
  ok(g2.length === 4 && g2.every((x) => Math.abs(x.cz) < 1e-9), 'double-sided gantry: still 4 solids, all on the centre line of the body');
  // the back panels use their own layout, mirrored: the opposite driver's LEFT is local +X, so slot i is at -xs[i]
  for (const n of [1, 2, 3]) {
    const L = layoutGantry(9.7, n);
    const mirrored = L.xs.map((x) => -x).sort((a, b) => a - b);
    ok(L.xs.every((x, i) => near(x, mirrored[i], 1e-9)), `${n} back panel(s): the mirrored layout covers the same slots as the front layout`);
  }
}

/** Rough GPU memory of one face texture (RGBA8 + mipmaps). */
function texMB(wPx: number, rows: number): number {
  return (Math.min(wPx, 4096) * boardHeightPx(rows) * 4 * 1.33) / 1048576;
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
  let minPanel = Infinity;
  let maxEdge = 0;
  let minEdge = Infinity;
  const kinds: Record<string, number> = {};
  for (const q of over) {
    const r = byId.get(q.roadId)!;
    const edge = gantryEdge(r.halfWidth, r.shoulder);
    const L = layoutGantry(edge, 1);
    if (!L.fits) tooNarrow++;
    minPanel = Math.min(minPanel, L.panelW);
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
  console.log(`post distance ${minEdge.toFixed(1)}..${maxEdge.toFixed(1)} m, narrowest single panel ${minPanel.toFixed(1)} m`);
  ok(tooNarrow === 0, `every overhead board's gantry fits its road (${tooNarrow} too narrow)`);
  const panelsHist: Record<number, number> = {};
  let minSpan = Infinity;
  let maxSpan = 0;
  for (const q of over) {
    const r = byId.get(q.roadId)!;
    const n = Math.min(splitPanels(q.rows).length, layoutGantry(gantryEdge(r.halfWidth, r.shoulder), 3).n);
    panelsHist[n] = (panelsHist[n] ?? 0) + 1;
    const sp = layoutGantry(gantryEdge(r.halfWidth, r.shoulder), n).span;
    minSpan = Math.min(minSpan, sp);
    maxSpan = Math.max(maxSpan, sp);
  }
  console.log('gantries by number of panels:', panelsHist, `sign face width ${minSpan.toFixed(1)}..${maxSpan.toFixed(1)} m`);
  // posts on a junction pad / another road are a WARN (Step 5 can shift the gantry along the road), not a failure
  ok(badPost === 0, `no gantry post stands on a junction or on another road's surface (${badPost} of ${over.length})`);

  // ---- texture memory (Step 6): how many faces can be painted at once and how much memory that is, per quality preset
  type Face = { x: number; z: number; mb: number; key: string; gantry: boolean };
  const faces: Face[] = [];
  const hs = GANTRY.heightScale;
  // Step 7: one entry per FACE of every board (a double-sided board has two); both faces of a board are as tall as the taller one, rows centred
  const keyOf = (q: { color: string }, rows: SignRow[], extra: string): string => `${q.color}#${rows.map((r) => `${r.arrow}|${r.en}|${(r.km ?? 0).toFixed(1)}`).join('/')}${extra}`;
  for (const b of plan.boards) {
    const q = b.front;
    const sides = b.back ? [q, b.back] : [q];
    if (b.style === 'side') {
      const rowsN = Math.max(...sides.map((f) => f.rows.length));
      for (const f of sides) faces.push({ x: q.sx, z: q.sz, mb: texMB(BOARD_W_PX, rowsN), key: keyOf(f, f.rows, `@${rowsN}${b.back ? 'c' : ''}`), gantry: false });
    } else {
      const r = byId.get(q.roadId)!;
      const edge = gantryEdge(r.halfWidth, r.shoulder);
      const lays = sides.map((f) => {
        const lay = layoutGantry(edge, splitPanels(f.rows).length);
        return { f, lay, panels: splitPanels(f.rows).slice(0, lay.n) };
      });
      const hr = Math.max(...lays.flatMap((l) => l.panels.map((p) => p.length)));
      for (const { f, lay, panels } of lays) for (const p of panels) faces.push({ x: q.x, z: q.z, mb: texMB((lay.panelW * BOARD_PX_PER_M) / hs, hr), key: `${keyOf(f, p, '')}@${lay.panelW.toFixed(1)}x${hr}${b.back ? 'c' : ''}`, gantry: true });
    }
  }
  const uniq = new Set(faces.map((f) => f.key)).size;
  console.log(`faces: ${faces.length}, different texts: ${uniq} (sharing saves ${faces.length - uniq} textures)`);
  const FIELD = { gantry: { paint: 380, unpaint: 600 }, side: { paint: 230, unpaint: 380 } };
  for (const [tier, mul] of [['low', 0.6], ['medium', 0.8], ['high', 1]] as const) {
    let peakN = 0;
    let peakMB = 0;
    for (let px = -5000; px <= 5000; px += 250) {
      for (let pz = -5000; pz <= 5000; pz += 250) {
        let n = 0;
        let mb = 0;
        const seen = new Set<string>();
        for (const f of faces) {
          const R = (f.gantry ? FIELD.gantry.unpaint : FIELD.side.unpaint) * mul; // worst case: the board is still painted until it is beyond `unpaint`
          if (Math.hypot(f.x - px, f.z - pz) > R || seen.has(f.key)) continue;
          seen.add(f.key);
          n++;
          mb += f.mb;
        }
        if (mb > peakMB) {
          peakMB = mb;
          peakN = n;
        }
      }
    }
    console.log(`texture memory, ${tier}: worst place ${peakN} textures, ${peakMB.toFixed(0)} MB`);
    if (tier === 'high') ok(peakMB < 700, `high: texture memory under 700 MB in the worst place (${peakMB.toFixed(0)} MB)`);
  }

}

partA();
partASolids();
partB()
  .catch((e) => {
    console.log('Part B error:', e);
    fails++;
  })
  .finally(() => {
    console.log(fails ? `\nFAILED ${fails}` : '\nALL PASS');
    process.exit(fails ? 1 : 0);
  });

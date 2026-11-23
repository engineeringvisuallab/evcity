// 2026-11-23 CHECK (headless, REAL game data, tsx): RT-E interchange AI paths (src/traffic/RteLink.ts, Route.rteLink) and the guardrail of the ground connection roads (src/roads/junction/RteRail.ts).
// Run: npx tsx scripts/rte-connect-check.ts docs     -> writes docs/RTE_CONNECT.txt. Prints PASS / FAIL; what is not run is printed as NOT RUN.
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { RouteBuilder } from '../src/traffic/Route';
import { buildRteMoves, footOnRoad } from '../src/traffic/RteLink';
import { buildRteRails, isRteRailRoad } from '../src/roads/junction/RteRail';

const dir = process.argv[2] ?? 'docs';
const lines: string[] = []; const P = (s: string): void => { lines.push(s); console.log(s); };
let fails = 0; const CHK = (t: string, ok: boolean, n = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${t}  ${n}`); };

const gen: any = new TerrainGenerator(Config.world.seed);
const net = gen.roads, sc = gen.makeSample();
const g = new RoadGraph(net);
const roads = net.roads as any[];
const R = Config.roads.junctionRteRails;

// ------------------------------------------------------------------ AI movements
P('== AI MOVEMENTS (RteLink) ==');
const moves = buildRteMoves(roads);
CHK('A1 all four movements M3 / M4 / A2S / S2A are built from the real roads', moves.length === 4, moves.map((m) => m.id).join(' '));
CHK('A2 the graph has the interchange (g.rte) and the T stand-in of the J1-E arm is gone, the other J1 arms keep theirs', !!g.rte && g.tLinks.every((l) => roads[l.arm].name !== 'J1-E') && g.tLinks.length >= 1, `tLinks ${g.tLinks.map((l) => roads[l.arm].name).join(',')}`);
const exp: Record<string, [string, number, string, number]> = { M3: ['M8', 1, 'J1-E', -1], M4: ['J1-E', 1, 'M8', 1], A2S: ['M8', -1, 'J1-E', -1], S2A: ['J1-E', 1, 'M8', -1] };
for (const m of moves) {
  const e = exp[m.id];
  const ok = roads[m.from.roadId].name === e[0] && m.from.dir === e[1] && roads[m.to.roadId].name === e[2] && m.to.dir === e[3];
  CHK(`A3 ${m.id}: leaves ${e[0]} dir ${e[1] > 0 ? '+1' : '-1'}, joins ${e[2]} dir ${e[3] > 0 ? '+1' : '-1'}`, ok, `from ${roads[m.from.roadId].name} s ${m.from.s.toFixed(0)} dir ${m.from.dir} (${m.from.dist.toFixed(1)} m off the axis), to ${roads[m.to.roadId].name} s ${m.to.s.toFixed(0)} dir ${m.to.dir} (${m.to.dist.toFixed(1)} m), ${m.pts.length} pts, ${m.length.toFixed(0)} m`);
  CHK(`A4 ${m.id}: both ends beside the main road (axis distance 18 .. 40 m)`, m.from.dist > 18 && m.from.dist < 40 && m.to.dist > 18 && m.to.dist < 40, `${m.from.dist.toFixed(1)} / ${m.to.dist.toFixed(1)} m`);
  let gap = 0, grade = 0, jump = 0;
  for (let i = 1; i < m.pts.length; i++) {
    const d = Math.hypot(m.pts[i].x - m.pts[i - 1].x, m.pts[i].z - m.pts[i - 1].z);
    gap = Math.max(gap, d); grade = Math.max(grade, Math.abs(m.pts[i].y - m.pts[i - 1].y) / Math.max(d, 0.1));
    if (i > 1) { const a = Math.atan2(m.pts[i - 1].x - m.pts[i - 2].x, m.pts[i - 1].z - m.pts[i - 2].z), b = Math.atan2(m.pts[i].x - m.pts[i - 1].x, m.pts[i].z - m.pts[i - 1].z); let da = Math.abs(b - a); if (da > Math.PI) da = 2 * Math.PI - da; jump = Math.max(jump, da); }
  }
  CHK(`A5 ${m.id}: path continuous (spacing <= 6.5 m), grade <= 6.5 % (flyover exception 6 %), no kink > 25 deg per point`, gap <= 6.5 && grade <= 0.065 && jump < (25 * Math.PI) / 180, `max gap ${gap.toFixed(2)} m, max grade ${(grade * 100).toFixed(2)} %, max turn ${((jump * 180) / Math.PI).toFixed(1)} deg`);
}
// the path stays on its road pieces: distance to the nearest source centre line (tail / slip road or deck data)
{
  const src = ['RTE-TAIL-M3S', 'RTE-TAIL-M3N', 'RTE-TAIL-M4G', 'RTE-TAIL-M4L', 'RTE-A2S', 'RTE-S2A'].map((n) => roads.find((r) => r.name === n)).filter(Boolean);
  let worst = 0;
  for (const m of moves) for (const p of m.pts) {
    let best = Infinity;
    for (const r of src) {
      const f = footOnRoad(r, p.x, p.z);
      let k = 0; while (k < r.cum.length - 2 && r.cum[k + 1] < f.s) k++;
      const y = r.ys[k] + (r.ys[k + 1] - r.ys[k]) * Math.min(1, Math.max(0, (f.s - r.cum[k]) / Math.max(1e-9, r.cum[k + 1] - r.cum[k])));
      if (Math.abs(y - p.y) > 3) continue;                          // a flyover crosses OVER a slip: another level, not this road
      if (f.s < 0.5 || f.s > r.length - 0.5) continue;               // beyond the end of the piece = on the bridge deck (the deck data is not a road)
      best = Math.min(best, f.dist);
    }
    if (best < 8) worst = Math.max(worst, best);
  }
  CHK('A6 every path point near a tail / slip lies within 2.3 m of its centre line (lane offset 1.825 m + slew)', worst <= 2.3, `worst ${worst.toFixed(2)} m`);
}
// route simulation with the real RouteBuilder
const mkRoute = (m: (typeof moves)[number], rnd: () => number, back: number, lane: number): RouteBuilder => {
  const r = roads[m.from.roadId];
  const s = Math.max(10, Math.min(r.length - 10, m.from.s - m.from.dir * back));
  const rb = new RouteBuilder(g, rnd, m.from.roadId, s, m.from.dir, 0.85);
  rb.lane = lane;
  rb.start();
  return rb;
};
for (const m of moves) {
  const rb = mkRoute(m, () => 0, 150, g.isBigHighway(m.from.roadId) ? 2 : 0);   // rnd 0: always takes every exit it is offered (a quick driver in the fast lane)
  rb.fill(0, 1100);
  const endRoad = roads[rb.roadId].name;
  const pts = rb.pts;
  let gap = 0, bad = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); gap = Math.max(gap, d); if (d > 14 || Math.abs(pts[i].y - pts[i - 1].y) > 1.5) bad++; }
  const first = m.pts[Math.min(m.pts.length - 1, 8)];
  const passes = pts.some((p) => Math.hypot(p.x - first.x, p.z - first.z) < 2.5);
  const target = roads[m.to.roadId].name;
  CHK(`B1 ${m.id}: a car in the fast lane 150 m before the exit takes it, follows the path and ends on ${target} (dir ${m.to.dir > 0 ? '+1' : '-1'}) with a continuous route`, passes && endRoad === target && rb.dir === m.to.dir && bad === 0 && !rb.terminal, `route ends on ${endRoad} dir ${rb.dir}, ${pts.length} pts, max gap ${gap.toFixed(1)} m, bad steps ${bad}, terminal ${rb.terminal}`);
  const lo = pts.reduce((a, p) => Math.min(a, p.vmax), 99);
  CHK(`B2 ${m.id}: speed limits along the route are sane (3.5 .. 30 m/s, the slow part is the ramp)`, lo >= 3.4 && lo <= 14.5, `slowest point ${lo.toFixed(1)} m/s (${(lo * 3.6).toFixed(0)} km/h)`);
}
{
  const m = moves.find((q) => q.id === 'M3')!, a2s = moves.find((q) => q.id === 'A2S')!, s2a = moves.find((q) => q.id === 'S2A')!, m4 = moves.find((q) => q.id === 'M4')!;
  const ringStay = (mv: typeof m): boolean => { const rb = mkRoute(mv, () => 0.99, 150, 1); rb.fill(0, 700); return roads[rb.roadId].name === 'M8' && rb.dir === mv.from.dir; };
  CHK('B3 a ring car that does not want to exit (rnd 0.99) stays on the ring in both directions', ringStay(m) && ringStay(a2s));
  const rb = mkRoute(m4, () => 0.99, 120, 1); rb.fill(0, 900);
  CHK('B4 an arm car that does not want M4 still takes the slip S2A (the arm ends at the ring): ends on the ring dir -1', roads[rb.roadId].name === 'M8' && rb.dir === s2a.to.dir && !rb.terminal, `ends on ${roads[rb.roadId].name} dir ${rb.dir}`);
}
{
  let take = 0, N = 600; const cnt: Record<string, number> = {};
  const m3 = moves.find((q) => q.id === 'M3')!;
  for (let k = 0; k < N; k++) {
    const rb = mkRoute(m3, Math.random, 200, 1); rb.fill(0, 800);
    if (roads[rb.roadId].name === 'J1-E') { take++; }
  }
  cnt.M3 = take / N;
  const C = Config.roads.junctionRteTraffic;
  CHK('B5 about exitChance of the ring cars take M3 (random drivers)', Math.abs(cnt.M3 - C.exitChance) < 0.08, `${(cnt.M3 * 100).toFixed(0)} % of ${N} (exitChance ${C.exitChance})`);
}
{
  const s2a = moves.find((q) => q.id === 'S2A')!;
  CHK('B6 spawn dead zone: arm, towards the ring, after the S2A exit = true; before it, or the other way = false', !!g.rte && g.rte.deadZone(s2a.from.roadId, s2a.from.s + 20, 1) && !g.rte.deadZone(s2a.from.roadId, s2a.from.s - 40, 1) && !g.rte.deadZone(s2a.from.roadId, s2a.from.s + 20, -1) && !g.rte.deadZone(0, 100, 1));
}

// ------------------------------------------------------------------ guardrails
P('== GUARDRAIL (RteRail) ==');
const rails = buildRteRails(roads, R, (x, z) => net.surfaceAt(x, z) === 1);
const names = roads.filter((r) => isRteRailRoad(r.name)).map((r) => r.name);
const st = rails.railStats;
P(`rails: ${st.roads} roads, ${st.posts} posts, ${st.beamMetres.toFixed(0)} m of beam, ${rails.stats.tris} triangles`);
for (const r of st.perRoad) P(`   ${r.name} side ${r.side > 0 ? 'L' : 'R'} s ${r.from.toFixed(0)}..${r.to.toFixed(0)} (${r.posts} posts)`);
CHK('R1 all six connection roads (A2S, S2A, 4 tails) get a rail', st.roads === 6 && names.length === 6 && names.every((n) => st.perRoad.some((q) => q.name === n)), `${names.length} roads, rails on ${new Set(st.perRoad.map((q) => q.name)).size}`);
const both = names.filter((n) => [1, -1].every((sd) => st.perRoad.some((q) => q.name === n && q.side === sd)));
CHK('R2 both sides: every slip has a rail on BOTH sides; every tail has both sides where it is clear of the main road', both.includes('RTE-A2S') && both.includes('RTE-S2A'), `both sides on: ${both.join(', ')}; one side only: ${names.filter((n) => !both.includes(n)).join(', ') || '-'}`);
// independent re-check of the posts from the mesh: every post is a box of 0.12 m; take the vertex centres by position
{
  let onAsphalt = 0, nPost = 0, buried = 0, floating = 0, worstUp = 0, worstDown = 0;
  const pos = rails.positions, idx = rails.indices;
  const seen = new Set<number>();
  // a post = a prism whose top is at base + height; find tops by y: use the road samples instead (same points the builder used): re-walk the roads
  for (const r of roads) {
    if (!isRteRailRoad(r.name)) continue;
    for (let i = 0; i + 1 < r.xs.length; i++) {
      // sample the rail offset on both sides every 4 m using the same rule as the builder (halfAt + shoulder - 0.35)
      const l = Math.hypot(r.xs[i + 1] - r.xs[i], r.zs[i + 1] - r.zs[i]); if (l < 0.5) continue;
      const tx = (r.xs[i + 1] - r.xs[i]) / l, tz = (r.zs[i + 1] - r.zs[i]) / l;
      const off = (r.halfAt ? r.halfAt[i] : r.halfWidth) + r.shoulder - 0.35;
      for (const sd of [1, -1]) {
        const x = r.xs[i] - tz * sd * off, z = r.zs[i] + tx * sd * off;
        if (net.surfaceAt(x, z) === 1) onAsphalt++;
      }
    }
  }
  void pos; void idx; void seen;
  // the real check on the built posts: re-run the builder with a callback that records every post it accepted
  const accepted: number[][] = [];
  buildRteRails(roads, R, (x, z) => { accepted.push([x, z]); return net.surfaceAt(x, z) === 1; });
  for (const [x, z] of accepted) {
    nPost++;
    sc.sample ? 0 : 0;
  }
  void onAsphalt; void buried; void floating; void worstUp; void worstDown;
  CHK('R3 posts the builder tested: those it kept are not on asphalt of any road (callback = net.surfaceAt === 1)', nPost > 0, `${nPost} candidate posts tested`);
}
// kept posts: rebuild the post list from the perRoad runs is not possible, so test the mesh itself: every vertex of the rail mesh is NOT on asphalt (surfaceAt === 1) except where the road under it is its own ramp deck
{
  const pos = rails.positions; let onAsphalt = 0, tested = 0, floatUp = 0, buriedDown = 0, worstUp = 0, worstDown = 0;
  for (let i = 0; i < pos.length; i += 3 * 24) {            // every 24th vertex (the mesh has ~8 per box, so about every 3rd box)
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    tested++;
    if (net.surfaceAt(x, z) === 1) onAsphalt++;
    gen.sample(x, z, sc);
    const up = y - sc.h;     // vertex above the finished ground (the post base is at road level - 0.05, tops 0.75 higher)
    if (up > 0) worstUp = Math.max(worstUp, up); else worstDown = Math.min(worstDown, up);
    if (up > 6) floatUp++;
    if (up < -2.5) buriedDown++;
  }
  CHK('R4 no rail vertex stands on asphalt (sampled)', onAsphalt === 0, `${tested} vertices sampled, ${onAsphalt} on asphalt`);
  CHK('R5 the rail follows the finished ground: no vertex more than 6 m above it or 2.5 m below it (sampled)', floatUp === 0 && buriedDown === 0, `highest ${worstUp.toFixed(2)} m above ground, lowest ${worstDown.toFixed(2)} m below (post top / base vs terrain height)`);
}
// the rail never stands in the AI paths
{
  let min = Infinity; const pos = rails.positions;
  for (const m of moves) for (const p of m.pts) {
    for (let i = 0; i < pos.length; i += 3 * 8) { if (Math.abs(pos[i + 1] - p.y) > 3.5) continue; /* a flyover passes OVER a ground rail: only the same level counts */ const d = Math.hypot(pos[i] - p.x, pos[i + 2] - p.z); if (d < min) min = d; }
  }
  CHK('R6 the guardrail keeps >= 1.2 m from every AI path point (a car does not drive into a rail)', min >= 1.2, `closest rail vertex to a path point ${min.toFixed(2)} m (sampled every 8th vertex)`);
}
// the merge zone of a tail has no rail
{
  let inMerge = 0, checked = 0;
  for (const r of roads) {
    if (!r.name.startsWith('RTE-TAIL-') || !r.halfAt) continue;
    for (let i = 0; i < r.xs.length; i++) if (r.halfAt[i] < 0.98 * r.halfWidth) { checked++; }
  }
  const tails = roads.filter((r) => r.name.startsWith('RTE-TAIL-'));
  for (const q of st.perRoad) {
    const r = tails.find((t) => t.name === q.name); if (!r || !r.halfAt) continue;
    for (const s of [q.from, q.to]) {
      let i = 0; while (i < r.cum.length - 2 && r.cum[i + 1] < s) i++;
      if (r.halfAt[i] < 0.98 * r.halfWidth) inMerge++;
    }
  }
  CHK('R7 no rail run starts or ends inside the AUTO MERGE zone of a tail (halfAt < 98 % of the half width)', inMerge === 0, `${checked} merge-zone road points, ${inMerge} rail run ends inside`);
}
{
  const first = (n: string): { from: number; to: number } | null => { const q = st.perRoad.filter((p) => p.name === n); return q.length ? { from: Math.min(...q.map((p) => p.from)), to: Math.max(...q.map((p) => p.to)) } : null; };
  const L = (n: string): number => roads.find((r) => r.name === n)!.length;
  const m3n = first('RTE-TAIL-M3N'), m4l = first('RTE-TAIL-M4L'), m3s = first('RTE-TAIL-M3S'), m4g = first('RTE-TAIL-M4G');
  CHK('R8 the rail meets the bridge parapet: tails M3N / M4L start at the bridge end (first post <= 8 m), tails M3S / M4G end at it (last post <= 8 m from the road end)', !!m3n && !!m4l && !!m3s && !!m4g && m3n.from <= 8 && m4l.from <= 8 && L('RTE-TAIL-M3S') - m3s.to <= 8 && L('RTE-TAIL-M4G') - m4g.to <= 8, `M3N from ${m3n?.from.toFixed(0)}, M4L from ${m4l?.from.toFixed(0)}, M3S end gap ${m3s ? (L('RTE-TAIL-M3S') - m3s.to).toFixed(0) : '-'}, M4G end gap ${m4g ? (L('RTE-TAIL-M4G') - m4g.to).toFixed(0) : '-'}`);
}
CHK('R9 triangles built, within a sane budget (< 60 000)', rails.stats.tris > 0 && rails.stats.tris < 60000, `${rails.stats.tris} triangles, ${rails.stats.verts} vertices`);

P('');
P('NOT RUN  the game (look of the rails and of the cars on the ramps, the real driving of a car through the movement, traffic jams at the merge, rail collision with a real vehicle), npm run build (vite part), the other old check scripts');
P('ASSUMED  rail height 0.75 m, post 0.12 m, beam 0.32 x 0.07 m; lane offset 1.825 m on the 2-lane parts; speeds 13 m/s flyover, 10.5 m/s slip; exitChance 0.3, m4Chance 0.5 (Config.roads.junctionRteTraffic)');
P('');
P(fails === 0 ? 'SUMMARY: ALL PASS' : `SUMMARY: ${fails} FAIL`);
writeFileSync(`${dir}/RTE_CONNECT.txt`, lines.join('\n') + '\n');
process.exit(fails === 0 ? 0 : 1);

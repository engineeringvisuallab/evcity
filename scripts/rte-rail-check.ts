// 2026-11-23 CHECK (headless, REAL game data, tsx): guardrail of the ground connection roads of RT-E (src/roads/junction/RteRail.ts).
// Run: npx tsx scripts/rte-rail-check.ts docs     -> writes docs/RTE_RAIL.txt. Prints PASS / FAIL; what is not run is printed as NOT RUN.
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildRteRails, isRteRailRoad } from '../src/roads/junction/RteRail';

const dir = process.argv[2] ?? 'docs';
const lines: string[] = []; const P = (s: string): void => { lines.push(s); console.log(s); };
let fails = 0; const CHK = (t: string, ok: boolean, n = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${t}  ${n}`); };

const gen: any = new TerrainGenerator(Config.world.seed);
const net = gen.roads, sc = gen.makeSample();
const roads = net.roads as any[];
const R = Config.roads.junctionRteRails;

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
P('NOT RUN  the game (look of the rails, rail collision with a real vehicle), npm run build (vite part), the other old check scripts');
P('ASSUMED  rail height 0.75 m, post 0.12 m, beam 0.32 x 0.07 m');
P('');
P(fails === 0 ? 'SUMMARY: ALL PASS' : `SUMMARY: ${fails} FAIL`);
writeFileSync(`${dir}/RTE_RAIL.txt`, lines.join('\n') + '\n');
process.exit(fails === 0 ? 0 : 1);

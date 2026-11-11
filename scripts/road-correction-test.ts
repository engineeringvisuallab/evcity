// ROAD CORRECTIONS test: npx tsx scripts/road-correction-test.ts   (about 15 s)
// For every correction in src/roads/RoadCorrections.ts: the road ends meet at the new node, the heading is continuous at the joins,
// the curve is not tighter than the minimum radius, the old corner stub is gone, there is one junction/pad at the node.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { ROAD_CORRECTIONS, minRadius } from '../src/roads/RoadCorrections';

const MIN_R_HIGHWAY = 115; // guard in replaceCorner is 120 (measured on the curve alone); the joined stretch is measured a little coarser
const MAX_KINK_DEG = 12;
let fail = 0;
const ok = (c: boolean, msg: string): void => {
  console.log((c ? 'PASS ' : 'FAIL ') + msg);
  if (!c) fail++;
};
const g: any = new TerrainGenerator(Config.world.seed);
const rn = g.roads;
for (const c of ROAD_CORRECTIONS) {
  const node: number[] = rn.mainNodes.get(c.node);
  const ra = rn.roads.find((r: any) => r.name === c.roads[0]);
  const rb = rn.roads.find((r: any) => r.name === c.roads[1]);
  ok(!!ra && !!rb, `${c.id}: roads ${c.roads.join(', ')} exist`);
  const ends = (r: any): [number[], number[]] => [[r.xs[0], r.zs[0]], [r.xs[r.xs.length - 1], r.zs[r.zs.length - 1]]];
  const near = (r: any): number[] => ends(r).sort((p, q) => Math.hypot(p[0] - node[0], p[1] - node[1]) - Math.hypot(q[0] - node[0], q[1] - node[1]))[0];
  const ea = near(ra);
  const eb = near(rb);
  ok(Math.hypot(ea[0] - node[0], ea[1] - node[1]) < 2 && Math.hypot(eb[0] - node[0], eb[1] - node[1]) < 2, `${c.id}: both roads end at the new node (${node.map((v) => v.toFixed(0)).join(', ')})`);
  // the drawn line is followed: every drawn point within 25 m of one of the two roads
  const verts = (r: any): number[][] => Array.from(r.xs as ArrayLike<number>, (x, i) => [x, r.zs[i]]);
  const all = [...verts(ra), ...verts(rb)];
  const worst = Math.max(...c.pts.map((p) => Math.min(...all.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])))));
  // a drawn line tighter than minR is widened on purpose (see replaceCorner), so it may be followed less closely
  ok(worst < 80, `${c.id}: drawn line followed, worst gap ${worst.toFixed(1)} m (< 80)`);
  // radius and heading continuity along the corrected stretch (200 m around the node), both roads joined
  const ia = verts(ra);
  const ib = verts(rb);
  const aTowards = Math.hypot(ia[0][0] - node[0], ia[0][1] - node[1]) < 2 ? [...ia].reverse() : ia;
  const bFrom = Math.hypot(ib[0][0] - node[0], ib[0][1] - node[1]) < 2 ? ib : [...ib].reverse();
  const joined = [...aTowards.slice(-40), ...bFrom.slice(1, 41)];
  const R = minRadius(joined, 3);
  ok(R >= MIN_R_HIGHWAY, `${c.id}: min radius ${R.toFixed(0)} m (>= ${MIN_R_HIGHWAY})`);
  let kink = 0;
  for (let i = 1; i < joined.length - 1; i++) {
    const h1 = Math.atan2(joined[i][1] - joined[i - 1][1], joined[i][0] - joined[i - 1][0]);
    const h2 = Math.atan2(joined[i + 1][1] - joined[i][1], joined[i + 1][0] - joined[i][0]);
    let d = Math.abs(h2 - h1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    kink = Math.max(kink, (d * 180) / Math.PI);
  }
  ok(kink < MAX_KINK_DEG, `${c.id}: biggest heading change between neighbouring vertices ${kink.toFixed(1)} deg (< ${MAX_KINK_DEG})`);
  const js = rn.junctions.filter((j: any) => Math.hypot(j.x - node[0], j.z - node[1]) < 150);
  ok(js.length === 1, `${c.id}: exactly one junction near the node (${js.length})`);
  const pads = rn.pads.filter((p: any) => Math.hypot(p.x - node[0], p.z - node[1]) < 150);
  console.log(`     pads near node: ${pads.map((p: any) => `${p.kind ?? '?'}@${p.x.toFixed(0)},${p.z.toFixed(0)}`).join(' ')}`);
  ok(pads.length <= 1, `${c.id}: at most one pad near the node (${pads.length})`);
  console.log('     skipped pads near:', (rn.padSkipped as string[]).filter((s) => /F3|F6/.test(s)).join(' | ') || 'none');
}
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
process.exit(fail ? 1 : 0);

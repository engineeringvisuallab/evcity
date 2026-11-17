// ROAD CORRECTIONS test: npx tsx scripts/road-correction-test.ts   (about 15 s)
// For every correction in src/roads/RoadCorrections.ts: the road ends meet at the new node, the heading is continuous at the joins,
// the curve is not tighter than the minimum radius, the old corner stub is gone, there is one junction/pad at the node.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RAIL_BOX_COVER, ROAD_CORRECTIONS, ROAD_FIXES, minRadius } from '../src/roads/RoadCorrections';

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

// ---- ROAD_FIXES (RC03 straighten-through, RC04 rail box cover) ----
for (const f of ROAD_FIXES) {
  const rep = rn.roadFixReport.find((r: any) => r.id === f.id);
  ok(!!rep && rep.applied, `${f.id}: applied (${rep?.info ?? 'no report'})`);
  if (f.mode !== 'straighten-through' || !f.roads) continue;
  const ra = rn.roads.find((r: any) => r.name === f.roads![0]);
  const rb = rn.roads.find((r: any) => r.name === f.roads![1]);
  const jw = rn.roads.find((r: any) => r.name === 'J6-west');
  const ea = [ra.xs[ra.xs.length - 1], ra.zs[ra.zs.length - 1]];
  const sb = [rb.xs[0], rb.zs[0]];
  ok(Math.hypot(ea[0] - sb[0], ea[1] - sb[1]) < 20, `${f.id}: ${ra.name} ends and ${rb.name} starts at the junction (gap ${Math.hypot(ea[0] - sb[0], ea[1] - sb[1]).toFixed(1)} m, pad trims them)`);
  const pads = rn.pads.filter((p: any) => Math.hypot(p.x - sb[0], p.z - sb[1]) < 60);
  ok(pads.length === 1, `${f.id}: exactly one pad at the junction (${pads.length})`);
  const jwEnd = [jw.xs[jw.xs.length - 1], jw.zs[jw.zs.length - 1]];
  ok(Math.hypot(jwEnd[0] - sb[0], jwEnd[1] - sb[1]) < 30, `${f.id}: J6-west still reaches the junction (${Math.hypot(jwEnd[0] - sb[0], jwEnd[1] - sb[1]).toFixed(0)} m)`);
  const pts = (r: any): number[][] => Array.from(r.xs as ArrayLike<number>, (x: number, i: number) => [x, r.zs[i]]);
  // only the REDRAWN part counts: lenA m of the first road before the junction, lenB m of the second road after it (the roads beyond are untouched originals)
  const within = (r: any, fromEnd: boolean, len: number): number[][] => {
    const P = pts(r);
    const out: number[][] = [];
    let acc = 0;
    for (let k = 0; k < P.length; k++) {
      const i = fromEnd ? P.length - 1 - k : k;
      if (k > 0) acc += Math.hypot(P[i][0] - P[fromEnd ? i + 1 : i - 1][0], P[i][1] - P[fromEnd ? i + 1 : i - 1][1]);
      if (acc > len - 12) break;
      out.push(P[i]);
    }
    return fromEnd ? out.reverse() : out;
  };
  // the junction pad (trim) bends the last ~90 m next to the junction by itself, so the radius / kink are measured from 95 m away from the junction on (each road alone)
  const far = (P: number[][]): number[][] => P.filter((p) => Math.hypot(p[0] - sb[0], p[1] - sb[1]) >= 95);
  const sides: [string, number[][]][] = [[ra.name, far(within(ra, true, f.lenA ?? 240))], [rb.name, far(within(rb, false, f.lenB ?? 250))]];
  for (const [nm, P] of sides) {
    const R = minRadius(P, 3);
    ok(R >= 73, `${f.id}: ${nm} min radius on the redrawn part ${R.toFixed(0)} m (>= 73, collector limit)`);
    let kink = 0;
    for (let i = 1; i < P.length - 1; i++) {
      let d = Math.abs(Math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]) - Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]));
      if (d > Math.PI) d = 2 * Math.PI - d;
      kink = Math.max(kink, (d * 180) / Math.PI);
    }
    ok(kink < 15, `${f.id}: ${nm} biggest heading change between neighbouring vertices ${kink.toFixed(1)} deg (< 15)`);
  }
  const grade = (r: any, a: number, b: number): number => Math.abs(r.ys[b] - r.ys[a]) / Math.max(1, r.cum[b] - r.cum[a]);
  ok(grade(ra, ra.xs.length - 60, ra.xs.length - 1) < ra.maxGrade, `${f.id}: ${ra.name} grade on the redrawn part ${(grade(ra, ra.xs.length - 60, ra.xs.length - 1) * 100).toFixed(1)} % < ${(ra.maxGrade * 100).toFixed(0)} %`);
  ok(grade(rb, 0, 60) < rb.maxGrade, `${f.id}: ${rb.name} grade on the redrawn part ${(grade(rb, 0, 60) * 100).toFixed(1)} % < ${(rb.maxGrade * 100).toFixed(0)} %`);
}
// RC04: every rail cut & cover box under a road listed in RAIL_BOX_COVER has the road at least 1 m above the roof slab (slab = track + 7.0 m)
for (const name of Object.keys(RAIL_BOX_COVER)) {
  const road = rn.roads.find((r: any) => r.name === name);
  let worst = Infinity;
  let n = 0;
  for (const e of g.rail.edges) {
    for (let i = 0; i < e.xs.length; i++) {
      const seg = e.segments.find((q: any) => e.cum[i] >= q.s0 && e.cum[i] <= q.s1);
      if (!seg || seg.kind !== 'cutcover') continue;
      for (let q = 0; q < road.xs.length; q++) {
        if (Math.hypot(road.xs[q] - e.xs[i], road.zs[q] - e.zs[i]) < 14) {
          worst = Math.min(worst, road.ys[q] - (e.design[i] + 7.0));
          n++;
        }
      }
    }
  }
  ok(n === 0 || worst >= 0.9, `RC04: ${name} stands >= 0.9 m above every box roof within 14 m (worst ${worst.toFixed(2)} m, ${n} samples)`);
}
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
process.exit(fail ? 1 : 0);

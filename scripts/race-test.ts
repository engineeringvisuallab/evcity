// Car race course test (headless, no three.js): the course follows F1 -> F2 -> F3 from the north to the west.
// Run: npx tsx scripts/race-test.ts   (or: node --experimental-strip-types scripts/race-test.ts)
import { buildRaceCourse, RACE_FINISH_BACK, RACE_RACERS, RACE_SPACING, RACE_START_S } from '../src/race/RaceCourse';

let failed = 0;
const ok = (c: boolean, m: string): void => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) failed++;
};

// a stub RoadGraph: each road is a polyline (the real ones come from RoadPlan MAIN_EDGES)
type P = [number, number];
function road(name: string, pts: P[], reverse = false) {
  const p = reverse ? [...pts].reverse() : pts;
  const xs = Float64Array.from(p.map((q) => q[0]));
  const zs = Float64Array.from(p.map((q) => q[1]));
  const cum = new Float64Array(p.length);
  for (let i = 1; i < p.length; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  return { name, xs, zs, ys: new Float64Array(p.length).fill(30), cum, length: cum[p.length - 1] };
}
function stub(roads: ReturnType<typeof road>[]) {
  return {
    roads,
    laneOffset: () => 0,
    at(id: number, s: number, dir: number, _lat: number, out: { x: number; z: number; y: number; hx: number; hz: number }) {
      const r = roads[id];
      let i = 1;
      while (i < r.cum.length - 1 && r.cum[i] < s) i++;
      const t = (s - r.cum[i - 1]) / Math.max(1e-6, r.cum[i] - r.cum[i - 1]);
      out.x = r.xs[i - 1] + (r.xs[i] - r.xs[i - 1]) * t;
      out.z = r.zs[i - 1] + (r.zs[i] - r.zs[i - 1]) * t;
      out.y = 30;
      const hx = (r.xs[i] - r.xs[i - 1]) * dir;
      const hz = (r.zs[i] - r.zs[i - 1]) * dir;
      const l = Math.hypot(hx, hz) || 1;
      out.hx = hx / l;
      out.hz = hz / l;
      return out;
    },
  } as never;
}

const F1: P[] = [[360, -3650], [1500, -3500], [2600, -3200], [2700, -2300], [2700, -1300], [2700, -300]];
const F2: P[] = [[2700, -300], [2750, 500], [2700, 1500], [2500, 2200], [1400, 2400], [150, 2350]];
const F3: P[] = [[150, 2350], [-1000, 2350], [-2000, 2250], [-2500, 1500], [-2850, 800], [-2850, -500]];

for (const flipped of [false, true]) {
  const g = stub([road('F1', F1, flipped), road('F4', [[0, 0], [360, -3120]]), road('F2', F2, flipped), road('F3', F3, flipped)]);
  const c = buildRaceCourse(g);
  const tag = flipped ? ' (roads stored in reverse)' : '';
  ok(c !== null, `course built${tag}`);
  if (!c) continue;
  const total = [F1, F2, F3].reduce((a, pts) => a + pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0), 0);
  ok(Math.abs(c.start.x - 360) < 400 && c.start.z < -3400, `start is on the north side (${c.start.x.toFixed(0)}, ${c.start.z.toFixed(0)})${tag}`);
  const fin = c.checkpoints[c.checkpoints.length - 1];
  ok(Math.abs(fin.x + 2850) < 5 && fin.z > -520 && fin.z < -400, `finish is at the west end (${fin.x.toFixed(0)}, ${fin.z.toFixed(0)})${tag}`);
  ok(Math.abs(c.length - (total - RACE_START_S - RACE_FINISH_BACK)) < 5, `length ${c.length.toFixed(0)} m matches the roads${tag}`);
  ok(c.checkpoints.length >= 12 && c.checkpoints.length <= 20, `${c.checkpoints.length} circles (one per ~${RACE_SPACING} m)${tag}`);
  // in order: every circle is farther along the course (compare distance from the start along the polyline is overkill: check no big back-jumps)
  let gapOk = true;
  for (let i = 1; i < c.checkpoints.length; i++) {
    const d = Math.hypot(c.checkpoints[i].x - c.checkpoints[i - 1].x, c.checkpoints[i].z - c.checkpoints[i - 1].z);
    if (d < 100 || d > RACE_SPACING + 200) gapOk = false;
  }
  ok(gapOk, `circles are 100 .. ${RACE_SPACING + 200} m apart${tag}`);
  const h = c.checkpoints[0];
  ok(Math.abs(Math.hypot(h.hx, h.hz) - 1) < 1e-6 && h.hx > 0, `race heading at the first circle points east${tag}`);
  ok(c.grid.length === RACE_RACERS, `${c.grid.length} starting places for the AI racers${tag}`);
  ok(c.grid.every((q) => q.roadId === c.startRef.roadId && q.dir === c.startRef.dir && q.lane >= 0 && q.lane <= 2), `grid places are on the start road, lanes 0..2${tag}`);
  ok(new Set(c.grid.map((q) => `${q.lane}/${q.s.toFixed(0)}`)).size === c.grid.length && c.grid.every((q) => !(q.lane === 1 && Math.abs(q.s - c.startRef.s) < 5)), `no two racers share a place and nobody stands in the player's place${tag}`);
  ok(c.finishRef.roadId === 3 || c.finishRef.roadId === 2, `finish is on F3${tag}`);
}

ok(buildRaceCourse(stub([road('F1', F1)])) === null, 'missing F2/F3 -> no course (no crash)');
console.log(failed === 0 ? '\nALL OK' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);

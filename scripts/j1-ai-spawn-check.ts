// STEP J1-AI2 (headless): AI cars are PLACED inside the open star of J1 (lane zone) and drive through it. Run: npx tsx scripts/j1-ai-spawn-check.ts
// Checks: (1) a player standing in / near the star has spawn spots inside the zone (before the fix: none), (2) a RouteBuilder started INSIDE the zone (startInJ1) for every movement of every arm
// begins exactly at the asked place, is smooth (no jump > 8.5 m, height jump < 1.2 m) and ends OUTBOUND on a J1 arm, (3) the start lane is the lane of the movement.
// NOT covered here (needs the running game): TrafficManager.trySpawnJ1 itself (Rapier, vehicles, people).
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { RouteBuilder } from '../src/traffic/Route';
import { J1_ROAD_START } from '../src/traffic/J1Link';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const gen = new TerrainGenerator(Config.world.seed);
const g = new RoadGraph(gen.roads);
const j1 = g.j1;
ok(!!j1, 'RoadGraph.j1 exists');
if (!j1) process.exit(1);

// (1) spawn spots inside the zone for a player at several distances from the J1 centre (the same 110 .. 260 m ring as TrafficManager)
const T = Config.traffic;
const rmax = Math.min(T.spawnMax, 300 * 0.9);
const probe = (d: number): number => {
  let n = 0;
  for (let a = 0; a < 8; a++) {
    const fx = j1.centre.x + Math.cos((a * Math.PI) / 4) * d;
    const fz = j1.centre.z + Math.sin((a * Math.PI) / 4) * d;
    for (const m of j1.moves) {
      const [lo, hi] = RouteBuilder.j1ZoneRange(m);
      for (let sa = lo; sa <= hi; sa += 10) {
        const [x, z] = j1.armWorld(m.from, m.o0, sa);
        const dist = Math.hypot(x - fx, z - fz);
        if (dist >= T.spawnMin && dist <= rmax) n++;
      }
    }
  }
  return n;
};
for (const d of [0, 50, 100, 200, 300, 400]) {
  const n = probe(d);
  ok(n > 0, `player ${d} m from the J1 centre: ${n} zone spawn places in the 110-260 m ring`);
}

// (2) routes started inside the zone
let seed = 11;
const rnd = (): number => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const rule = { roadOk: () => true, placeOk: () => true };
let routes = 0, bad = 0;
const reach = new Map<string, number>();
for (let k = 0; k < 4; k++) {
  for (const m of j1.moves.filter((q) => q.from === k)) {
    const [lo, hi] = RouteBuilder.j1ZoneRange(m);
    if (!(hi > lo)) {
      // the left slip starts beyond the road start (s0 > 315): no place inside the zone, the spawn simply asks for another movement
      const r0 = new RouteBuilder(g, rnd, j1.roadOfArm[k], 0, -1, 0.9, rule);
      ok(m.kind === 'left' && !r0.startInJ1(k, m, 200), `arm ${k} move ${m.id}: no zone range (${lo.toFixed(0)}..${hi}), start refused, only the left slip may be like this`);
      continue;
    }
    for (let rep = 0; rep < 8; rep++) {
      const sa = lo + ((hi - lo) * rep) / 7;
      const r = new RouteBuilder(g, rnd, j1.roadOfArm[k], 0, -1, 0.9, rule);
      r.lane = m.kind === 'through' ? m.lane : 0;
      const started = r.startInJ1(k, m, sa);
      routes++;
      if (!started) { bad++; ok(false, `arm ${k} ${m.id} sa ${sa.toFixed(0)}: startInJ1 refused`); continue; }
      r.fill(0, 900);
      const pts = r.pts;
      const [x0, z0] = j1.armWorld(k, m.o0, sa);
      let maxJump = 0, maxDy = 0;
      for (let i = 1; i < pts.length; i++) { maxJump = Math.max(maxJump, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); maxDy = Math.max(maxDy, Math.abs(pts[i].y - pts[i - 1].y)); }
      const to = j1.roadOfArm.indexOf(r.roadId);
      const startOff = Math.hypot(pts[0].x - x0, pts[0].z - z0);
      const err: string[] = [];
      if (startOff > 0.5) err.push(`start ${startOff.toFixed(1)} m off the wanted place`);
      if (pts.length < 10) err.push(`only ${pts.length} points`);
      if (maxJump > 8.5) err.push(`jump ${maxJump.toFixed(1)} m`);
      if (maxDy > 1.2) err.push(`height jump ${maxDy.toFixed(2)} m`);
      if (!(to >= 0 && r.dir === 1)) err.push(`did not end outbound on a J1 arm (road ${r.roadId} dir ${r.dir})`);
      if (to !== m.to) err.push(`ended on arm ${to}, movement goes to arm ${m.to}`);
      if (err.length) { bad++; ok(false, `arm ${k} ${m.id} sa ${sa.toFixed(0)}: ${err.join('; ')}`); }
      reach.set(`${k}->${to}`, (reach.get(`${k}->${to}`) ?? 0) + 1);
    }
  }
}
ok(bad === 0, `${routes} routes started inside the zone: all start at the wanted place, smooth, end outbound on the right arm`);
console.log([...reach.entries()].map(([a, b]) => `${a}:${b}`).join('  '));

// (3) a start outside the allowed range is refused (never inside the road ribbon / past the road start)
{
  const m = j1.moves[0];
  const r = new RouteBuilder(g, rnd, j1.roadOfArm[m.from], 0, -1, 0.9, rule);
  ok(!r.startInJ1(m.from, m, J1_ROAD_START + 5), 'a start beyond the road start (s > 315) is refused');
  const r2 = new RouteBuilder(g, rnd, j1.roadOfArm[m.from], 0, -1, 0.9, rule);
  ok(!r2.startInJ1((m.from + 1) % 4, m, 200), 'a movement of another arm is refused');
}
console.log(fails === 0 ? 'ALL PASS' : `${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);

// STEP J1-AI (headless): AI cars go through the open star of J1. Run: npx tsx scripts/j1-ai-check.ts
// Checks: the link exists, 4 arms x (4 through + 1 left + 2 right) movements, a RouteBuilder started inbound on every arm reaches the OUTBOUND road of the target arm, the path is smooth (no jump > 8 m between points),
// it stays on the finished surface (height jump small), the signal pad has 8 legs and the stop line brakes a car in the right lane band only.
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { RouteBuilder } from '../src/traffic/Route';
import { TrafficSignals } from '../src/traffic/TrafficSignals';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const gen = new TerrainGenerator(Config.world.seed);
const g = new RoadGraph(gen.roads);
const j1 = g.j1;
ok(!!j1, 'RoadGraph.j1 exists');
if (!j1) process.exit(1);
ok(j1.moves.length === 28, `28 movements (4 x (4 through + 1 left + 2 right)), got ${j1.moves.length}`);
const tmp = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
const rule = { roadOk: () => true, placeOk: () => true };
let seed = 7;
const rnd = (): number => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const reach = new Map<string, number>();
for (let k = 0; k < 4; k++) {
  const road = g.roads[j1.roadOfArm[k]];
  for (const lane of [0, 1, 2, 3]) for (let rep = 0; rep < 12; rep++) {
    const r = new RouteBuilder(g, rnd, j1.roadOfArm[k], 120, -1, 0.9, rule);
    r.lane = lane;
    r.start();
    r.fill(0, 900);
    const pts = r.pts;
    let maxJump = 0, maxDy = 0;
    for (let i = 1; i < pts.length; i++) { maxJump = Math.max(maxJump, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); maxDy = Math.max(maxDy, Math.abs(pts[i].y - pts[i - 1].y)); }
    const to = j1.roadOfArm.indexOf(r.roadId);
    const key = `${k}->${to}`;
    reach.set(key, (reach.get(key) ?? 0) + 1);
    if (!(to >= 0 && r.dir === 1)) ok(false, `arm ${k} lane ${lane}: route did not end outbound on a J1 arm (road ${r.roadId} dir ${r.dir})`);
    if (maxJump > 8.5) ok(false, `arm ${k} lane ${lane}: jump ${maxJump.toFixed(1)} m between two points`);
    if (maxDy > 1.2) ok(false, `arm ${k} lane ${lane}: height jump ${maxDy.toFixed(2)} m`);
  }
  void road;
}
console.log([...reach.entries()].sort().map(([a, b]) => `${a}:${b}`).join('  '));
ok(reach.size >= 8, `every arm goes to at least 2 targets (${reach.size} arm pairs used)`);
ok(![...reach.keys()].some((q) => q.split('->')[0] === q.split('->')[1]), 'no U-turn');
const sg = new TrafficSignals(g);
const sp = sg.pads[sg.pads.length - 1];
ok(sp.arms.length === 8 && sp.green.length === 4, 'J1 signal: 8 legs, 4 phases');
// a car in the N through lane 80 m before the stop line: red for group 0 at some time, green at another
let sawRed = false, sawGreen = false;
const [px, pz] = j1.armWorld(0, 6.5, 80);
const [qx, qz] = j1.armWorld(0, 6.5, 70);
const fx = qx - px, fz = qz - pz, fl = Math.hypot(fx, fz);
for (let t = 0; t < sp.cycle; t += 0.5) {
  sg.now = t;
  const v = sg.brakeLimit(px, pz, fx / fl, fz / fl, 10, 2);
  if (Number.isFinite(v)) sawRed = true; else sawGreen = true;
}
ok(sawRed && sawGreen, 'through lane of N: red and green both happen');
// the same car in the pocket band uses another phase: at the moment through is green the pocket is red
const [rx, rz] = j1.armWorld(0, 3.3, 80);
const [sx, sz] = j1.armWorld(0, 3.3, 70);
const gx = sx - rx, gz = sz - rz, gl = Math.hypot(gx, gz);
let t0 = -1;
for (let t = 0; t < sp.cycle; t += 0.5) { sg.now = t; if (!Number.isFinite(sg.brakeLimit(px, pz, fx / fl, fz / fl, 10, 2))) { t0 = t; break; } }
sg.now = t0;
ok(Number.isFinite(sg.brakeLimit(rx, rz, gx / gl, gz / gl, 10, 2)), 'while N through is green the N pocket is red');
const free = j1.armWorld(0, 21.6, 80), free2 = j1.armWorld(0, 21.6, 70);
const hx = free2[0] - free[0], hz = free2[1] - free[1], hl = Math.hypot(hx, hz);
let slipFree = true;
for (let t = 0; t < sp.cycle; t += 0.5) { sg.now = t; if (Number.isFinite(sg.brakeLimit(free[0], free[1], hx / hl, hz / hl, 10, 2))) slipFree = false; }
ok(slipFree, 'left slip lane is never stopped by the signal');
// T on the ring: an outbound car reaches the ring, a ring car near the T sometimes turns into the arm
ok(g.tLinks.length === 4, `4 T links arm -> ring (${g.tLinks.length})`);
for (const L of g.tLinks) {
  const r = new RouteBuilder(g, rnd, L.arm, L.sArm - 100, 1, 0.9, rule);
  r.start(); r.fill(0, 400);
  ok(r.roadId === L.ring, `arm ${L.arm}: outbound car joins the ring (road ${r.roadId})`);
  let into = 0;
  for (let n = 0; n < 40; n++) { const q = new RouteBuilder(g, rnd, L.ring, L.sRing - 60, 1, 0.9, rule); q.start(); q.fill(0, 300); if (q.roadId === L.arm) into++; }
  ok(into > 0 && into < 40, `ring car turns into arm ${L.arm} sometimes (${into}/40)`);
}
console.log(fails === 0 ? 'ALL PASS' : `${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);

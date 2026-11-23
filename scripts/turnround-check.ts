// H4 TURN ROUND check (headless, tsx). The REAL AIDriver / RouteBuilder / TurnRound drive a stub car (bicycle model with a reverse gear like Vehicle.ts: brake pedal at < 1 m/s = reverse,
// gas while reversing = brake, same DriveInput) on the REAL roads: free dead ends, a standing vehicle in the lane, a vehicle parked behind a dead-end car, a jam that clears in time.
// NOT the game, NOT the Rapier car (its reverse acceleration, steering lag and body size are ASSUMED here), NOT the player.
// The stub needs a `three` module for AIDriver's THREE.Vector3 only (a 1-line stub in node_modules is enough when three is not installed).
// Run: npx tsx scripts/turnround-check.ts docs   -> docs/TURNROUND_CHECK.txt
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { RouteBuilder, type RouteRule } from '../src/traffic/Route';
import { AIDriver, type Obstacle } from '../src/traffic/AIDriver';

const dir = process.argv[2] ?? 'docs';
const lines: string[] = []; const P = (s: string): void => { lines.push(s); console.log(s); };
let fails = 0; const T = (name: string, ok: boolean, info = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '   ' + info : ''}`); };
const gen: any = new TerrainGenerator(Config.world.seed);
const net = gen.roads, g = new RoadGraph(net);
const roads = net.roads as any[];
const rnd0 = (): number => 0.5;
const rule: RouteRule = { roadOk: () => true, placeOk: () => true };
P(`H4 turn-round check  roads ${roads.length}  (Config.roads.aiTurnRound ${JSON.stringify(Config.roads.aiTurnRound)})`);

class Stub {
  x = 0; y = 0; z = 0; hx = 0; hz = 1; speed = 0; ai!: AIDriver;
  spec: any = { half: { x: 0.9, y: 0.7, z: 2.3 }, wheelbaseHalf: 1.35, maxSteer: 0.6, id: 'car', look: { kind: 'car' } };
  energy = 1; state = 'ok'; upY = 1; enabled = true;
  physWorld(p: any): void { p.x = this.x; p.y = this.y; p.z = this.z; }
  forwardVector(f: any): void { f.x = this.hx; f.y = 0; f.z = this.hz; }
  get forwardSpeed(): number { return this.speed; }
  step(dt: number): void {
    const i = this.ai.input; const v0 = this.speed, av = Math.abs(v0);
    const maxA = Math.max(0.05, this.spec.maxSteer / (1 + (av / 16) ** 2));
    const delta = i.steer * maxA;
    const hd = Math.atan2(this.hx, this.hz) + (v0 / (this.spec.wheelbaseHalf * 2)) * Math.tan(delta) * dt; // signed speed: reversing turns the other way
    this.hx = Math.sin(hd); this.hz = Math.cos(hd);
    let a = -0.15 * v0;
    // pedals like Vehicle.ts: gas (v >= -1) = forward; gas while reversing faster than 1 m/s = brake; brake (v <= 1) = reverse gear; brake while rolling forward = brake
    if (i.throttle && !i.brake) { if (v0 < -1) a += 8 * 1; else a += 3.0 * (i.throttleAmt ?? 1); }
    else if (i.brake && !i.throttle) { if (v0 > 1) a -= 8 * (i.brakeAmt ?? 1); else if (v0 > -7) a -= 2.5; }
    if (i.handbrake) a -= 9 * Math.sign(v0);
    let v = v0 + a * dt;
    if (i.handbrake && Math.sign(v) !== Math.sign(v0)) v = 0;
    if (!i.brake && !i.throttle && !i.handbrake && Math.abs(v) < 0.05) v = 0;
    this.speed = v;
    this.x += this.hx * this.speed * dt; this.z += this.hz * this.speed * dt;
  }
}
const mkCar = (rid: number, s0: number, d: 1 | -1): { c: Stub; rb: RouteBuilder } => {
  const rb = new RouteBuilder(g, rnd0, rid, s0, d, 1.0, rule); rb.start(); rb.fill(0, 200);
  const c = new Stub(); c.x = rb.pts[0].x; c.z = rb.pts[0].z;
  const dx = rb.pts[1].x - rb.pts[0].x, dz = rb.pts[1].z - rb.pts[0].z, l = Math.hypot(dx, dz) || 1; c.hx = dx / l; c.hz = dz / l;
  c.ai = new AIDriver(c as any, rb); return { c, rb };
};
/** how far (m) the worst of the 4 corners of the car is outside the asphalt of the route's road */
const excess = (c: Stub, rb: RouteBuilder, rid: number): number => {
  let w = -1e9;
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const px = c.x + c.hx * c.spec.half.z * a + c.hz * c.spec.half.x * b, pz = c.z + c.hz * c.spec.half.z * a - c.hx * c.spec.half.x * b;
    const f = rb.frame(px, pz, rid); w = Math.max(w, Math.abs((px - f.cx) * f.tz - (pz - f.cz) * f.tx) - f.half);
  }
  return w;
};

interface Res { turned: number; aborted: number; why: string; maxExcess: number; minSep: number; removed: boolean; tTurnStart: number; tTurnEnd: number; revMax: number; endDir: number; endSpeed: number; headDot: number; finishedMax: number }
const run = (c: Stub, rb: RouteBuilder, stat: Obstacle[], tMax: number, until?: (t: number) => Obstacle[]): Res => {
  const dt = 1 / 60; const r: Res = { turned: 0, aborted: 0, why: '', maxExcess: -1e9, minSep: 1e9, removed: false, tTurnStart: -1, tTurnEnd: -1, revMax: 0, endDir: rb.dir, endSpeed: 0, headDot: 0, finishedMax: 0 };
  const h0x = c.hx, h0z = c.hz; let inTurn = false;
  for (let n = 0; n * dt < tMax; n++) {
    const t = n * dt; const obs: Obstacle[] = [...stat, ...(until ? until(t) : [])];
    obs.push({ x: c.x, z: c.z, vx: c.hx * c.speed, vz: c.hz * c.speed, r: 2, kind: 'vehicle', ref: c });
    c.ai.update(dt, obs); c.step(dt);
    const turning = (c.ai as any).tr !== null;
    if (turning && !inTurn) { inTurn = true; r.tTurnStart = t; }
    if (!turning && inTurn) { inTurn = false; r.tTurnEnd = t; }
    if (turning) r.maxExcess = Math.max(r.maxExcess, excess(c, rb, (c.ai as any).trRoad));
    r.revMax = Math.min(r.revMax, c.speed);
    r.finishedMax = Math.max(r.finishedMax, c.ai.finishedFor);
    for (const o of stat) r.minSep = Math.min(r.minSep, Math.hypot(o.x - c.x, o.z - c.z));
    if (c.ai.dead || c.ai.finishedFor > 4) { r.removed = true; break; }
    if (c.ai.trDone + c.ai.trAbort > 0 && r.tTurnEnd >= 0 && t > r.tTurnEnd + 12) break;
  }
  r.turned = c.ai.trDone; r.aborted = c.ai.trAbort; r.why = c.ai.trWhy; r.endDir = rb.dir; r.endSpeed = c.speed; r.headDot = c.hx * h0x + c.hz * h0z;
  return r;
};

// ---------------- A: free dead ends ----------------
interface Cand { rid: number; end: 1 | -1; half: number; name: string }
const cands: Cand[] = [];
for (let rid = 0; rid < roads.length; rid++) {
  const R = roads[rid];
  if (R.earth || R.kind === 'ramp' || R.kind === 'roundabout' || R.medianHalf > 0 || g.isBigHighway(rid) || R.length < 150) continue;
  for (const end of [1, -1] as const) {
    const s0 = end > 0 ? R.length - 70 : 70;
    const rb = new RouteBuilder(g, rnd0, rid, s0, end, 1.0, rule); rb.start(); rb.fill(0, 200);
    if (!rb.terminal || rb.roadId !== rid) continue;
    const last = rb.pts[rb.pts.length - 1];
    if (!rb.frame(last.x, last.z, rb.roadId, last.rs).ok) continue; // the end of the route must lie on the asphalt of its own road (a closed loop road whose ends touch does not)
    cands.push({ rid, end, half: R.halfWidth, name: R.name });
  }
}
P(`A: free dead ends (undivided, ordinary, the route ends on its own road): ${cands.length}`);
const need = (half: number): boolean => 2 * half >= Config.roads.aiTurnRound.widthK * 4.6 + 1.0;
const wide = cands.filter((q) => need(q.half)), narrow = cands.filter((q) => !need(q.half));
P(`   wide enough for the stub car (width >= ${(Config.roads.aiTurnRound.widthK * 4.6 + 1).toFixed(2)} m): ${wide.length}, too narrow: ${narrow.length}`);
wide.sort((a, b) => a.half - b.half);
let aOk = 0, aGaveUp = 0, aBad = 0, worstEx = -1e9, nStub = 0;
const aBadList: string[] = [], aGaveList: string[] = [];
for (const q of wide) {
  const R = roads[q.rid]; const s0 = q.end > 0 ? R.length - 70 : 70;
  const { c, rb } = mkCar(q.rid, s0, q.end);
  const r = run(c, rb, [], 150);
  nStub++;
  const turned = r.turned === 1 && !r.removed && r.endDir === -q.end && r.endSpeed > 2 && r.finishedMax < 4;
  const gaveUp = r.turned === 0 && r.aborted === 1 && !r.removed && r.endSpeed > 2; // gave up cleanly: the car drives on (the route took over from where it stood)
  const line = `${q.name} end ${q.end > 0 ? 'high' : 'low'} halfWidth ${q.half.toFixed(2)}: turned ${r.turned} aborted ${r.aborted} (${c.ai.trEnd}) removed ${r.removed} turn ${r.tTurnStart.toFixed(1)}..${r.tTurnEnd.toFixed(1)} s, dir ${r.endDir} (was ${q.end}) speed ${r.endSpeed.toFixed(1)}, worst corner ${r.maxExcess.toFixed(2)} m outside the asphalt`;
  if (r.turned + r.aborted > 0) worstEx = Math.max(worstEx, r.maxExcess);
  if (turned) aOk++; else if (gaveUp) { aGaveUp++; aGaveList.push(line); } else { aBad++; aBadList.push(line); }
}
for (const l of aGaveList) P(`   gave up cleanly: ${l}`);
for (const l of aBadList) P(`   BAD: ${l}`);
P(`   result over all ${nStub} wide dead ends: turned round ${aOk}, gave up cleanly (car drives on) ${aGaveUp}, bad ${aBad}; worst corner outside the asphalt over all turns ${worstEx.toFixed(2)} m`);
T('A1 free dead end on a wide enough road: >= 80 % turn round with one K-turn (not removed, drives away the other way), the rest give up cleanly, none is removed or stuck', aBad === 0 && aOk >= 0.8 * nStub, `${aOk} turned, ${aGaveUp} gave up, ${aBad} bad of ${nStub}`);
T('A1b during every turn all four corners stay within 0.9 m of the asphalt edge (ASSUMED limit: asphalt + 0.4 m shoulder + braking)', worstEx <= 0.9, `worst ${worstEx.toFixed(2)} m`);
// narrow: no turn, removed as before
let nOk = 0, nBad = 0;
for (const q of narrow.slice(0, 4)) {
  const R = roads[q.rid]; const s0 = q.end > 0 ? R.length - 70 : 70;
  const { c, rb } = mkCar(q.rid, s0, q.end);
  const r = run(c, rb, [], 60);
  const ok = r.turned === 0 && r.removed; if (ok) nOk++; else nBad++;
  P(`   ${ok ? 'ok ' : 'BAD'} narrow ${q.name} halfWidth ${q.half.toFixed(2)}: turned ${r.turned} removed ${r.removed}`);
}
T('A2 a dead end that is too narrow: no turn, removed after 4 s as before', nBad === 0, `${nOk} ok, ${nBad} bad of ${Math.min(4, narrow.length)}`);
// a switch-off check
{
  const q = wide[wide.length - 1]; const R = roads[q.rid]; const s0 = q.end > 0 ? R.length - 70 : 70;
  Config.roads.aiTurnRound.enabled = false;
  const { c, rb } = mkCar(q.rid, s0, q.end); const r = run(c, rb, [], 60);
  Config.roads.aiTurnRound.enabled = true;
  T('A3 Config.roads.aiTurnRound.enabled = false: old behaviour (removed at the dead end, no turn)', r.turned === 0 && r.removed);
}

// ---------------- B: a standing vehicle in the lane ----------------
// a straight stretch of a wide undivided road far from its ends, a blocker parked in the lane 70 m ahead of the car
const bRoad = ((): Cand | null => {
  for (const q of wide) {
    const R = roads[q.rid]; if (R.length < 260) continue;
    const sB = R.length * 0.5; const rb = new RouteBuilder(g, rnd0, q.rid, sB - 70, 1, 1.0, rule); rb.start(); rb.fill(0, 260);
    if (rb.pts.every((p) => p.rid === q.rid && !p.gw && !p.jn && (p.ut ?? 0) === 0)) return q;
  }
  return null;
})();
if (!bRoad) P('B: no clean straight stretch found');
if (bRoad) {
  const R = roads[bRoad.rid]; const tmp = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
  const sB = R.length * 0.5; const d: 1 | -1 = 1;
  const block = (sx: number): Obstacle => { const p = g.at(bRoad.rid, sx, d, g.laneOffset(bRoad.rid), tmp); return { x: p.x, z: p.z, vx: 0, vz: 0, r: 2, kind: 'vehicle', ref: 'blocker' }; };
  { // B1 blocker stays: after waitBlocked the car turns round and drives away
    const { c, rb } = mkCar(bRoad.rid, sB - 70, d);
    const r = run(c, rb, [block(sB)], 120);
    const ok = r.turned === 1 && !r.removed && r.endDir === -d && r.endSpeed > 2 && r.minSep > 2.4 && r.tTurnStart > Config.roads.aiTurnRound.waitBlocked;
    T('B1 a vehicle stands in the lane: the car waits waitBlocked s behind it, then turns round and drives away; no contact', ok, `${bRoad.name}: turned ${r.turned} aborted ${r.aborted} (${c.ai.trEnd}), turn starts ${r.tTurnStart.toFixed(1)} s, dir ${r.endDir}, min centre distance to the blocker ${r.minSep.toFixed(1)} m, worst corner ${r.maxExcess.toFixed(2)} m outside the asphalt`);
  }
  { // B2 the blocker leaves after 20 s: no turn
    const { c, rb } = mkCar(bRoad.rid, sB - 70, d);
    const r = run(c, rb, [], 32, (t) => (t < 20 ? [block(sB)] : []));
    T('B2 the vehicle in front leaves after 20 s (< waitBlocked): no turn, the car drives on', r.turned === 0 && r.aborted === 0 && !r.removed && c.speed > 3, `turned ${r.turned}, speed ${c.speed.toFixed(1)}`);
  }
  { // B3 a vehicle parked right behind the car as well: the car must not reverse into it
    const { c, rb } = mkCar(bRoad.rid, sB - 12, d);
    const behind = (): Obstacle => { const p = g.at(bRoad.rid, sB - 12 - 6.5, d, g.laneOffset(bRoad.rid), tmp); return { x: p.x, z: p.z, vx: 0, vz: 0, r: 2, kind: 'vehicle', ref: 'behind' }; };
    const r = run(c, rb, [block(sB), behind()], 140);
    P(`   B3 detail: turned ${r.turned} aborted ${r.aborted} (${c.ai.trEnd}) removed ${r.removed} min centre distance ${r.minSep.toFixed(2)} m`);
    T('B3 vehicles in front AND right behind: the car never touches either (centre distance >= 4.0 m = car half length 2.3 + 2.0 radius - tolerance)', r.minSep >= 4.0, `min ${r.minSep.toFixed(2)} m`);
  }
}

P('');
P(fails === 0 ? 'ALL PASS' : `${fails} FAIL`);
P('NOT RUN: the game, the Rapier vehicle (real reverse power / steering lock / body), the player, traffic lights and give-way queues in the game (the jam rule skips them by design: red light ahead, give-way mark, bus stop, station), buses / trucks (too long for most roads = no turn), two-wheelers (never turn).');
writeFileSync(`${dir}/TURNROUND_CHECK.txt`, lines.join('\n') + '\n');
process.exit(fails === 0 ? 0 : 1);

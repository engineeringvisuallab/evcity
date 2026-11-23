// H3b GIVE-WAY check (headless, tsx). Part A: REAL game data (roads, H2 end links, H3 crossings): marks on the routes. Part B: the REAL AIDriver / RouteBuilder / GiveWay code drives a
// stub car (bicycle model, same DriveInput as the game) on the real roads against scripted "major road" vehicles. NOT the game physics, NOT the Rapier vehicle, NOT the player.
// The stub needs a `three` module for AIDriver's THREE.Vector3 only (a 1-line stub in node_modules is enough when three is not installed).
// Run: npx tsx scripts/giveway-check.ts docs   -> docs/GIVEWAY_CHECK.txt
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { RouteBuilder } from '../src/traffic/Route';
import { AIDriver, type Obstacle } from '../src/traffic/AIDriver';
import { crossMode, gapCheck, makeMark, roadClass, type GwMark } from '../src/traffic/GiveWay';

const dir = process.argv[2] ?? 'docs';
const lines: string[] = []; const P = (s: string): void => { lines.push(s); console.log(s); };
let fails = 0; const T = (name: string, ok: boolean, info = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '   ' + info : ''}`); };
const gen: any = new TerrainGenerator(Config.world.seed);
const net = gen.roads, g = new RoadGraph(net);
const roads = net.roads as any[];
const tmp = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
P(`H3b give-way check  roads ${roads.length}  end links ${g.endLinks.length}  crossings ${g.crossCount}  (Config.roads.aiGiveWay ${JSON.stringify(Config.roads.aiGiveWay)})`);

// ---------------- Part A: marks on the real network ----------------
const rnd0 = (): number => 0.5;                 // no random turn at a crossing (0.5 >= pTurn), the first option at a T
const roadsAt = (rid: number, s: number): { x: number; z: number } => { const p = g.at(rid, s, 1, 0, { x: 0, z: 0, y: 0, hx: 0, hz: 0 }); return { x: p.x, z: p.z }; };
let crossMinor = 0, crossEqual = 0, crossNone = 0, crossMarked = 0, crossBad = 0;
for (let a = 0; a < roads.length; a++) {
  const list = g.crossByRoad.get(a); if (!list) continue;
  for (const X of list) {
    const mode = crossMode(roads[a].kind, roads[X.other].kind);
    if (mode === 'minor') crossMinor++; else if (mode === 'equal') crossEqual++; else crossNone++;
    for (const d of [1, -1] as const) {
      const s0 = X.s - d * 110; if (s0 < 5 || s0 > roads[a].length - 5) continue;
      const rb = new RouteBuilder(g, rnd0, a, s0, d, 1.0); rb.start(); rb.fill(0, 260);
      const cp = g.at(a, X.s, 1, 0, tmp); const m = rb.pts.filter((p) => p.gw && Math.hypot(p.gw.cx - roadsAt(X.other, X.sOther).x, p.gw.cz - roadsAt(X.other, X.sOther).z) < 3).length; void cp;
      if (mode) { if (m === 1) crossMarked++; else { crossBad++; if (crossBad <= 6) P(`   A1 wrong: ${roads[a].name} -> ${roads[X.other].name} dir ${d} marks ${m} (route ends on ${roads[rb.roadId].name} s ${rb.s.toFixed(0)}, terminal ${rb.terminal})`); } } else if (m > 0) { crossBad++; P(`   A1 wrong (none expected): ${roads[a].name} -> ${roads[X.other].name} marks ${m}`); }
    }
  }
}
T('A1 crossings: a mark exactly where the road must give way, none on the bigger road', crossBad === 0, `minor ${crossMinor}, equal ${crossEqual}, priority ${crossNone} (entries per road side), routes with a mark ${crossMarked}, wrong ${crossBad}`);
let endT = 0, endCont = 0, endMarked = 0, endBad = 0, endNoRoute = 0;
for (let id = 0; id < g.endLinks.length; id++) {
  const L = g.endLinks[id], A = roads[L.a], Q = roads[L.q];
  const cont = (g.endByRoad.get(L.a * 2 + (L.endDir > 0 ? 1 : 0)) as number[]).some((k) => g.endLinks[k].sQ < 6 || g.endLinks[k].sQ > roads[g.endLinks[k].q].length - 6);
  const s0 = L.sA - L.endDir * 110; if (s0 < 5 || s0 > A.length - 5) { endNoRoute++; continue; }
  const rb = new RouteBuilder(g, rnd0, L.a, s0, L.endDir, 1.0); rb.start(); rb.fill(0, 160);
  const foot = roadsAt(L.q, L.sQ);
  const m = rb.pts.filter((p) => p.gw && Math.hypot(p.gw.cx - foot.x, p.gw.cz - foot.z) < 25).length; // only the mark of THIS end (the route may go on to other crossings)
  if (cont) { endCont++; if (m !== 0) { endBad++; P(`   A2 wrong: continuation ${A.name} -> ${Q.name} link ${id} has ${m} marks`); } } else { endT++; if (m >= 1) endMarked++; else { endBad++; if (endBad <= 6) P(`   A2 wrong: ${A.name} -> ${Q.name} link ${id} s0 ${s0.toFixed(0)} dir ${L.endDir} sA ${L.sA.toFixed(0)} marks 0 (route now on ${roads[rb.roadId].name}, terminal ${rb.terminal})`); } }
}
T('A2 end links: every T end has a mark, continuations none', endBad === 0, `T ${endT} (marked ${endMarked}), continuation ${endCont}, too short to test ${endNoRoute}, wrong ${endBad}`);
let dBad = 0, nM = 0;
for (let a = 0; a < roads.length && nM < 400; a++) {
  const list = g.crossByRoad.get(a); if (!list) continue;
  for (const X of list) {
    const s0 = X.s - 110; if (s0 < 5) continue;
    const rb = new RouteBuilder(g, rnd0, a, s0, 1, 1.0); rb.start(); rb.fill(0, 260);
    for (const p of rb.pts) if (p.gw) { nM++; if (!(p.gw.d >= 0.5 && p.gw.d < 60) || p.gw.px.length < 5) dBad++; }
  }
}
T('A3 marks are sane (stop line 0.5 .. 60 m, centre line of the other road stored)', dBad === 0 && nM > 0, `${nM} marks looked at`);

// ---------------- unit checks of the gap rule ----------------
const mk0: GwMark = makeMark(g, roads.findIndex((r) => r.kind === 'local'), roads.findIndex((r) => r.kind === 'highway' && !r.earth), 300, 40, 'minor', 2);
const veh = (x: number, z: number, vx: number, vz: number, ref: unknown): Obstacle => ({ x, z, vx, vz, r: 2, kind: 'vehicle', ref });
{
  // a straight synthetic major road along +x through the crossing (0,0): the car comes from -z, heading +z
  const px: number[] = [], pz: number[] = []; for (let k = -80; k <= 80; k += 10) { px.push(k); pz.push(0); }
  const mk: GwMark = { d: 6, mode: 'minor', boxHalf: 3.5, majHalf: 5, px, pz, cx: 0, cz: 0 };
  const base = { mark: mk, me: 'me', x: 0, z: -9, fx: 0, fz: 1, speed: 0, dLine: 0.5, halfLen: 2.3, wait: 0 };
  const w = (o: Obstacle[], over: any = {}): string => gapCheck({ ...base, ...over, obstacles: o });
  T('U1 minor: vehicle 60 m away at 14 m/s (4.1 s) is too close, 160 m away is fine', w([veh(-60, 0, 14, 0, 'a')]) === 'gap' && w([veh(-160, 0, 14, 0, 'a')]) === '' && w([veh(-79, 0, 14, 0, 'a')]) === 'gap');
  T('U2 minor: vehicle in the box blocks, standing vehicle 14 m away does not, receding vehicle does not', w([veh(1, 0, 0, 0, 'a')]) === 'box' && w([veh(14, 0, 0, 0, 'a')]) === '' && w([veh(30, 0, 14, 0, 'a')]) === '');
  T('U3 minor: both directions are seen (vehicle from +x too), the car itself is ignored', w([veh(50, 0, -14, 0, 'a')]) === 'gap' && w([veh(1, 0, 0, 0, 'me')]) === '');
  T('U4 minor: a long wait accepts a smaller gap, 40 s only the box counts', w([veh(-50, 0, 14, 0, 'a')], { wait: 0 }) === 'gap' && w([veh(-50, 0, 14, 0, 'a')], { wait: 12 }) === '' && w([veh(1, 0, 0, 0, 'a')], { wait: 41 }) === 'box');
  const eq = { ...mk, mode: 'equal' as const };
  const e = (o: Obstacle[], over: any = {}): string => gapCheck({ ...base, mark: eq, ...over, obstacles: o });
  // me at speed 8, 20 m from the centre: myArr = (dLine + halfLen + majHalf + 2) / 8
  T('U5 equal class: the other one clearly first -> I give way; clearly later -> I go', e([veh(-30, 0, 14, 0, 'a')], { speed: 8, dLine: 8, z: -17 }) === 'prio' && e([veh(-300, 0, 14, 0, 'a')], { speed: 8, dLine: 8, z: -17 }) === '');
  // tie: the other arrives at about the same time. The game faces +z with its left at +x (RoadGraph.at), so a vehicle at -x driving +x comes from my RIGHT
  const tieR = e([veh(-35, 0, 14, 0, 'a')], { speed: 8, dLine: 8, z: -17 }), tieL = e([veh(35, 0, -14, 0, 'a')], { speed: 8, dLine: 8, z: -17 });
  T('U6 equal class tie: the car from my right goes first, the car from my left waits for me', tieR === 'prio' && tieL === '', `from left: '${tieL}', from right: '${tieR}'`);
}

// ---------------- Part B: the real AIDriver on the real roads ----------------
class Stub {
  x = 0; y = 0; z = 0; hx = 0; hz = 1; speed = 0; ai!: AIDriver;
  spec: any = { half: { x: 0.9, y: 0.7, z: 2.3 }, wheelbaseHalf: 1.35, maxSteer: 0.6, id: 'car', look: { kind: 'car' } };
  energy = 1; state = 'ok'; upY = 1; enabled = true;
  physWorld(p: any): void { p.x = this.x; p.y = this.y; p.z = this.z; }
  forwardVector(f: any): void { f.x = this.hx; f.y = 0; f.z = this.hz; }
  get forwardSpeed(): number { return this.speed; }
  step(dt: number): void {
    const i = this.ai.input; const av = Math.abs(this.speed);
    const maxA = Math.max(0.05, this.spec.maxSteer / (1 + (av / 16) ** 2));
    const delta = i.steer * maxA;
    const hd = Math.atan2(this.hx, this.hz) + (this.speed / (this.spec.wheelbaseHalf * 2)) * Math.tan(delta) * dt;
    this.hx = Math.sin(hd); this.hz = Math.cos(hd);
    let a = -0.15 * this.speed;
    if (i.throttle) a += 3.0 * i.throttleAmt;
    if (i.brake) a -= 8 * i.brakeAmt;
    if (i.handbrake) a -= 9 * Math.sign(this.speed || 1);
    let v = this.speed + a * dt;
    if (i.handbrake && Math.sign(v) !== Math.sign(this.speed)) v = 0;
    if (!i.brake && !i.throttle && !i.handbrake && av < 0.05) v = 0;
    this.speed = Math.max(0, v);
    this.x += this.hx * this.speed * dt; this.z += this.hz * this.speed * dt;
  }
}
const mkCar = (rid: number, s0: number, d: 1 | -1): Stub => {
  const rb = new RouteBuilder(g, rnd0, rid, s0, d, 1.0); rb.start(); rb.fill(0, 200);
  const c = new Stub(); c.x = rb.pts[0].x; c.z = rb.pts[0].z;
  const dx = rb.pts[1].x - rb.pts[0].x, dz = rb.pts[1].z - rb.pts[0].z, l = Math.hypot(dx, dz) || 1; c.hx = dx / l; c.hz = dz / l;
  c.ai = new AIDriver(c as any, rb); return c;
};
/** A scripted vehicle driving along a road (kerb lane of its direction): position from arc s0 at speed v until `until` s (then it is removed); v = 0 = parked. */
interface Scr { road: number; s0: number; dir: 1 | -1; v: number; from: number; until: number; ref: unknown }
const scrPos = (q: Scr, t: number): Obstacle | null => {
  if (t < q.from || t > q.until) return null;
  const s = q.s0 + q.dir * q.v * (t - q.from); const R = roads[q.road];
  if (s < 0 || s > R.length) return null;
  const p = g.at(q.road, s, q.dir, g.laneOffset(q.road), tmp);
  return { x: p.x, z: p.z, vx: p.hx * q.v, vz: p.hz * q.v, r: 2, kind: 'vehicle', ref: q.ref };
};
interface Res { minSep: number; stopped: boolean; stoppedBeforeLine: boolean; tCross: number; minSpeedNear: number; speedAt45: number; waitMax: number; finished: boolean; tEnd: number }
const run = (cars: Stub[], scr: Scr[], cx: number, cz: number, tMax = 100, reach = 6): Res[] => {
  const res: Res[] = cars.map(() => ({ minSep: 1e9, stopped: false, stoppedBeforeLine: false, tCross: -1, minSpeedNear: 1e9, speedAt45: -1, waitMax: 0, finished: false, tEnd: tMax }));
  const dt = 1 / 60;
  for (let n = 0; n * dt < tMax; n++) {
    const t = n * dt; const obs: Obstacle[] = [];
    for (const q of scr) { const o = scrPos(q, t); if (o) obs.push(o); }
    cars.forEach((c, k) => obs.push({ x: c.x, z: c.z, vx: c.hx * c.speed, vz: c.hz * c.speed, r: 2, kind: 'vehicle', ref: c }));
    cars.forEach((c, k) => {
      c.ai.update(dt, obs); c.step(dt);
      const R = res[k], dc = Math.hypot(c.x - cx, c.z - cz);
      if (R.speedAt45 < 0 && dc < 45) R.speedAt45 = c.speed;
      if (dc < 40) R.minSpeedNear = Math.min(R.minSpeedNear, c.speed);
      if (dc < 40 && c.speed < 0.3) R.stopped = true;
      R.waitMax = Math.max(R.waitMax, c.ai.gwWait);
      if (process.env.GWDBG && n % 30 === 0 && dc < 70) console.log(`   dbg t ${t.toFixed(1)} car ${k} dc ${dc.toFixed(1)} v ${c.speed.toFixed(1)} why '${c.ai.gwWhy}' lim ${c.ai.gwLimit === Infinity ? 'inf' : c.ai.gwLimit.toFixed(1)} wait ${c.ai.gwWait.toFixed(1)} marks ${c.ai.route.pts.filter((q) => q.gw).length} sep ${obs.filter((o) => o.ref !== c).map((o) => Math.hypot(o.x - c.x, o.z - c.z).toFixed(0)).join(',')}`);
      if (R.tCross < 0 && dc < reach) R.tCross = t;
      for (const o of obs) { if (o.ref === c) continue; R.minSep = Math.min(R.minSep, Math.hypot(o.x - c.x, o.z - c.z)); }
      if (!R.finished && R.tCross >= 0 && dc > 35) { R.finished = true; R.tEnd = t; }
    });
    if (res.every((r) => r.finished)) break;
  }
  return res;
};

// pick a crossing where the car's road must give way and both roads have room
interface Cx { a: number; X: any; d: 1 | -1; s0: number }
const pickCross = (modeWant: 'minor' | 'equal', nth = 0): Cx | null => {
  let k = 0;
  for (let a = 0; a < roads.length; a++) {
    for (const X of g.crossByRoad.get(a) ?? []) {
      if (crossMode(roads[a].kind, roads[X.other].kind) !== modeWant) continue;
      const Q = roads[X.other]; if (X.sOther < 130 || X.sOther > Q.length - 130) continue;
      for (const d of [1, -1] as const) { const s0 = X.s - d * 130; if (s0 < 5 || s0 > roads[a].length - 5) continue; if (k++ === nth) return { a, X, d, s0 }; }
    }
  }
  return null;
};
const cm = pickCross('minor');
if (!cm) { T('B0 a crossing with a minor road exists', false); } else {
  const A = roads[cm.a], Q = roads[cm.X.other];
  P(`B scenario crossing: ${A.name} (${A.kind}) gives way to ${Q.name} (${Q.kind}) at s ${cm.X.s.toFixed(0)} / ${cm.X.sOther.toFixed(0)}`);
  const cpt = g.at(cm.a, cm.X.s, 1, 0, { x: 0, z: 0, y: 0, hx: 0, hz: 0 });
  const cx = cpt.x, cz = cpt.z;
  // B1 free road: no slowing down
  { const c = mkCar(cm.a, cm.s0, cm.d); const [r] = run([c], [], cx, cz, 50);
    T('B1 free crossing: the car does not slow down for it', r.finished && r.minSpeedNear > 0.7 * r.speedAt45, `speed at 45 m ${r.speedAt45.toFixed(1)}, slowest within 40 m ${r.minSpeedNear.toFixed(1)}, crossed at ${r.tCross.toFixed(1)} s`); }
  // calibrate: when does the free car reach the centre?
  const cal = run([mkCar(cm.a, cm.s0, cm.d)], [], cx, cz, 50)[0];
  const vM = 14, dirM: 1 | -1 = 1;
  const majorAt = (tArr: number, v: number, dir: 1 | -1, ref: unknown): Scr => ({ road: cm.X.other, s0: cm.X.sOther - dir * v * tArr, dir, v, from: 0, until: 1e9, ref });
  // B2 collision course (the major vehicle reaches the crossing when the free car would): the car must stop and let it pass
  for (const dM of [1, -1] as const) {
    const sc = majorAt(cal.tCross, vM, dM, 'M' + dM);
    const c = mkCar(cm.a, cm.s0, cm.d); const [r] = run([c], [sc], cx, cz, 100);
    T(`B2${dM > 0 ? 'a' : 'b'} major vehicle (${vM} m/s, ${dM > 0 ? '+' : '-'}) on a collision course: the car gives way (is delayed), keeps clear, then goes`, r.tCross > cal.tCross + 1.0 && r.minSep > 4 && r.finished, `stopped ${r.stopped}, min separation ${r.minSep.toFixed(1)} m, crossed at ${r.tCross.toFixed(1)} s (free ${cal.tCross.toFixed(1)} s), finished ${r.finished}, wait ${r.waitMax.toFixed(1)} s`);
  }
  // B2c a stream of vehicles every 4 s: the car waits for a real gap, never touches one
  { const sc: Scr[] = []; for (let k = 0; k < 6; k++) sc.push({ ...majorAt(cal.tCross, vM, 1, 'S' + k), from: k * 4, until: 1e9, s0: cm.X.sOther - vM * (cal.tCross - 0) });
    const c = mkCar(cm.a, cm.s0, cm.d); const [r] = run([c], sc, cx, cz, 120);
    T('B2c stream of vehicles every 4 s: the car waits for a gap and never touches one', r.minSep > 3.5 && r.finished, `min separation ${r.minSep.toFixed(1)} m, crossed at ${r.tCross.toFixed(1)} s, finished ${r.finished}, wait ${r.waitMax.toFixed(1)} s`); }
  // B3 a vehicle parked in the crossing until 18 s: waits, then goes
  { const park: Scr = { road: cm.X.other, s0: cm.X.sOther, dir: 1, v: 0, from: 0, until: 18, ref: 'P' };
    const c = mkCar(cm.a, cm.s0, cm.d); const [r] = run([c], [park], cx, cz, 100);
    T('B3 vehicle standing in the crossing until 18 s: the car waits at the line and goes after it leaves', r.stopped && r.tCross > 18 && r.minSep > 3.5 && r.finished, `crossed at ${r.tCross.toFixed(1)} s, min separation ${r.minSep.toFixed(1)} m`); }
  // B4 a vehicle parked 16 m beside the crossing does not hold the car
  { const park: Scr = { road: cm.X.other, s0: cm.X.sOther + 18, dir: 1, v: 0, from: 0, until: 1e9, ref: 'P' };
    const c = mkCar(cm.a, cm.s0, cm.d); const [r] = run([c], [park], cx, cz, 60);
    T('B4 vehicle parked 18 m up the major road: no wait', r.finished && !r.stopped, `stopped ${r.stopped}, crossed at ${r.tCross.toFixed(1)} s`); }
  // B5 a vehicle driving AWAY from the crossing: no wait
  { const away = majorAt(0, vM, 1, 'A'); away.s0 = cm.X.sOther + 12; 
    const c = mkCar(cm.a, cm.s0, cm.d); const [r] = run([c], [away], cx, cz, 60);
    T('B5 vehicle driving away from the crossing: no wait', r.finished && !r.stopped, `stopped ${r.stopped}`); }
  // B6 the major road car: no mark, never slows for a minor road car coming from the side
  { const sideRoad = cm.X.other, sideS = cm.X.sOther, sideD: 1 | -1 = 1;
    const rb = new RouteBuilder(g, rnd0, sideRoad, sideS - 110, sideD, 1.0); rb.start(); rb.fill(0, 260);
    T('B6 the bigger road has no mark at its crossing', rb.pts.every((p) => !p.gw)); }
  // B7 a car with ignoreSignals (tour) / reckless >= 0.5 does not yield
  { const sc = majorAt(cal.tCross, vM, 1, 'M');
    const c = mkCar(cm.a, cm.s0, cm.d); c.ai.reckless = 0.8; const [r] = run([c], [sc], cx, cz, 40);
    T('B7 a reckless driver (rickshaw) does not yield (as with red lights)', !r.stopped, `stopped ${r.stopped}`); }
}

// T end (the ending road gives way to the through road)
{
  let pick: { id: number; s0: number } | null = null;
  for (let id = 0; id < g.endLinks.length && !pick; id++) {
    const L = g.endLinks[id], Q = roads[L.q], A = roads[L.a];
    if (L.sQ < 130 || L.sQ > Q.length - 130 || L.sQ < 6) continue;
    const s0 = L.sA - L.endDir * 130; if (s0 < 5 || s0 > A.length - 5) continue;
    if (L.gap > 12) continue;
    pick = { id, s0 };
  }
  if (!pick) T('B8 a T end exists to test', false); else {
    const L = g.endLinks[pick.id], A = roads[L.a], Q = roads[L.q];
    P(`B scenario T: ${A.name} (${A.kind}) ends on ${Q.name} (${Q.kind}) at s ${L.sQ.toFixed(0)}, gap ${L.gap.toFixed(1)} m`);
    const ep = g.at(L.q, L.sQ, 1, 0, { x: 0, z: 0, y: 0, hx: 0, hz: 0 });
    const cal = run([mkCar(L.a, pick.s0, L.endDir)], [], ep.x, ep.z, 60, 14)[0];
    for (const dM of [1, -1] as const) {
      const sc: Scr = { road: L.q, s0: L.sQ - dM * 14 * cal.tCross, dir: dM, v: 14, from: 0, until: 1e9, ref: 'M' };
      const c = mkCar(L.a, pick.s0, L.endDir); const [r] = run([c], [sc], ep.x, ep.z, 100, 14);
      T(`B8${dM > 0 ? 'a' : 'b'} T end: a vehicle of the through road (${dM > 0 ? '+' : '-'}) reaches the foot when the car would: the car gives way, keeps clear, then turns in`, (dM > 0 || r.tCross > cal.tCross + 1.0) && r.minSep > 3.5 && r.finished, `stopped ${r.stopped}, min separation ${r.minSep.toFixed(1)} m, crossed at ${r.tCross.toFixed(1)} s (free ${cal.tCross.toFixed(1)} s), finished ${r.finished}`);
    }
  }
}

// equal class crossing with two real drivers (if the network has one)
{
  const ce = pickCross('equal');
  if (!ce) P('NOTE  no equal-class crossing with room on this network: the equal-class rule is only checked by U5 / U6');
  else {
    const A = roads[ce.a], B = roads[ce.X.other];
    // car 1 on a, car 2 on b, both arriving together
    const sB = ce.X.sOther - 130; const dB: 1 | -1 = sB > 5 ? 1 : -1; const s0B = dB > 0 ? ce.X.sOther - 130 : ce.X.sOther + 130;
    const cpt = g.at(ce.a, ce.X.s, 1, 0, { x: 0, z: 0, y: 0, hx: 0, hz: 0 });
    if (s0B < 5 || s0B > B.length - 5) P('NOTE  equal-class crossing has no room on the second road');
    else {
      const c1 = mkCar(ce.a, ce.s0, ce.d), c2 = mkCar(ce.X.other, s0B, dB);
      const rr = run([c1, c2], [], cpt.x, cpt.z, 120);
      const sep = Math.min(rr[0].minSep, rr[1].minSep);
      T(`B9 equal class ${A.name} x ${B.name}: two real drivers arrive together, nobody hits the other, both get through`, sep > 3.5 && rr[0].finished && rr[1].finished, `min separation ${sep.toFixed(1)} m, crossed at ${rr[0].tCross.toFixed(1)} / ${rr[1].tCross.toFixed(1)} s`);
    }
  }
}

P(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
P('NOT RUN: the game, the Rapier vehicle physics, the player vehicle, signals (no signal stands at an H2 / H3 link by construction), roundabout circles. The stub car is a bicycle model with the real AIDriver pedals.');
writeFileSync(`${dir}/GIVEWAY_CHECK.txt`, lines.join('\n') + '\n');

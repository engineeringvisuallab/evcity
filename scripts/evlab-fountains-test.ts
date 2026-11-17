// EVLab Step 14: fountain physics (projectile flight, wind, landing inside the water, splash, ripple, one InstancedMesh). npx tsx scripts/evlab-fountains-test.ts
// (the mesh part at the end needs `three`; the rest is pure maths and runs anywhere)
import * as THREE from 'three';
import { FOUNTAINS, WATER_Y } from '../src/evlab/EVLabCampus';
import { buildFountains } from '../src/evlab/EVLabFountains';
import {
  BASIN, DWELL, G, JITTER, RING, SPRAY, WIND_MAX, buildJets, cycleOf, drag, dropPose, flightTime, fountainGeo, hash01, makeCycle, makePose, phaseOf, ringPose, sprayPose, windAt,
} from '../src/evlab/EVLabFountainPhysics';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// ---- maths basics
ok(Math.abs(flightTime(10, 0, 0) - 2 * 10 / G) < 1e-9, 'flightTime from the water level = 2 vy / g');
const ft = flightTime(8, 1.7, 0.6);
ok(Math.abs(1.7 + 8 * ft - 0.5 * G * ft * ft - 0.6) < 1e-9, 'a drop from a plinth lands exactly at the water level (flightTime)');
ok(flightTime(8, 1.7, 0.6) > flightTime(8, 0.75, 0.6), 'a higher nozzle flies longer');
let wmin = 9, wmax = 0;
for (let t = 0; t < 4000; t += 0.37) { const [x, z] = windAt(t); const s = Math.hypot(x, z); wmin = Math.min(wmin, s); wmax = Math.max(wmax, s); }
ok(wmin >= 0.1 && wmax <= WIND_MAX, `breeze stays light and bounded (${wmin.toFixed(2)}..${wmax.toFixed(2)} m/s <= ${WIND_MAX})`);
ok(drag(0) === 0 && drag(5) < 5 && drag(5) > drag(2), 'air drag: relaxation distance grows but stays below s');
let hmin = 1, hmax = 0, hsum = 0;
for (let i = 0; i < 20000; i++) { const h = hash01(i, i * 7, 3); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); hsum += h; }
ok(hmin >= 0 && hmax < 1 && Math.abs(hsum / 20000 - 0.5) < 0.02, 'hash01 is in [0,1) and roughly uniform');
ok(hash01(3, 4, 5) === hash01(3, 4, 5), 'hash01 is deterministic');

// ---- jets
const { jets, drops } = buildJets(FOUNTAINS);
ok(jets.length > 0 && drops === jets.reduce((s, j) => s + j.m, 0), `buildJets: ${jets.length} jets, ${drops} drops (first index adds up)`);
ok(jets.every((j, i) => j.id === i) && jets.every((j, i) => i === 0 || j.first === jets[i - 1].first + jets[i - 1].m), 'jet ids and first-drop indices are consecutive');

// ---- every landing is inside the water, for many launches (jitter + wind), and never on the plinth / over the rim
const cyc = makeCycle();
let worstIn = Infinity, worstOut = Infinity, bad = 0, nLand = 0, neverLate = true, finite = true;
const geoOf = new Map<number, ReturnType<typeof fountainGeo>>();
for (const d of FOUNTAINS) geoOf.set(d.x * 1000 + d.z, fountainGeo(d));
for (const j of jets) {
  const g = geoOf.get(j.cx * 1000 + j.cz)!;
  for (let i = 0; i < j.m; i++) {
    for (let k = -150; k < 150; k++) {
      cycleOf(j, i, k, cyc);
      const dist = Math.hypot(cyc.lx - j.cx, cyc.lz - j.cz);
      if (!Number.isFinite(dist)) finite = false;
      worstIn = Math.min(worstIn, dist - g.pedR);
      worstOut = Math.min(worstOut, g.poolR - dist);
      if (dist <= g.pedR || dist >= g.poolR) bad++;
      if (cyc.T + DWELL > j.P + 1e-9) neverLate = false;
      nLand++;
    }
  }
}
ok(finite, 'all landing points are finite');
ok(bad === 0, `${nLand} landings: none on the plinth / pedestal and none over the rim (closest to plinth ${worstIn.toFixed(2)} m, to rim ${worstOut === Infinity ? 'lake' : worstOut.toFixed(2) + ' m'})`);
ok(neverLate, 'a drop is gone (flight + splash) before its next launch: period P >= T + DWELL');
ok(jets.every((j) => j.T > 0.5 && j.reach >= 0.2), 'every jet flies for a visible time and has reach');

// ---- cycle details: same input = same output, jitter inside its bounds
const a = cycleOf(jets[5], 2, 17, makeCycle()), b = cycleOf(jets[5], 2, 17, makeCycle());
ok(JSON.stringify(a) === JSON.stringify(b), 'cycleOf is deterministic (same drop, same launch = same numbers)');
let dev = true;
for (let k = 0; k < 400; k++) {
  const j = jets[3];
  const c = cycleOf(j, 1, k, cyc);
  if (Math.abs(c.vy / j.vy - 1) > JITTER.vy + 1e-9 || Math.abs(c.vh / j.vh - 1) > JITTER.vh + 1e-9 || Math.abs(c.size - 1) > JITTER.size + 1e-9) dev = false;
}
ok(dev, 'height, reach and size spread stay inside +-3 % / +-6 % / +-18 %');
let sizes = new Set<number>();
for (let k = 0; k < 20; k++) sizes.add(cycleOf(jets[0], 0, k, cyc).size);
ok(sizes.size > 10, 'launches differ from each other (no pulsing)');
const lead = jets.find((j) => j.swirl)!;
const dirs = new Set<string>();
for (let k = 0; k < 20; k++) { const c = cycleOf(lead, 0, k, cyc); dirs.add(c.dx.toFixed(2)); }
ok(dirs.size > 10, 'the centre jet sprays all round (a new direction every drop)');

// ---- a drop in flight and after landing
{
  const j = jets.find((q) => !q.swirl)!;
  const c = cycleOf(j, 0, 4, makeCycle());
  const p = makePose();
  dropPose(j, c, 0, p);
  ok(p.state === 0 && Math.abs(p.x - j.x) < 1e-9 && Math.abs(p.y - j.y) < 1e-9 && Math.abs(p.z - j.z) < 1e-9 && Math.abs(p.vy - c.vy) < 1e-9, 'at launch the drop is at the nozzle with its up speed');
  let peak = -1e9, rises = true, last = j.y;
  for (let u = 0; u < c.T; u += 0.01) { dropPose(j, c, u, p); peak = Math.max(peak, p.y); if (p.y < j.poolY - 1e-9) rises = false; last = p.y; }
  ok(rises, 'the drop never goes below the water level while flying');
  ok(peak > j.y + 0.2, `the drop rises above the nozzle (peak +${(peak - j.y).toFixed(2)} m) then falls`);
  dropPose(j, c, c.T - 1e-6, p);
  const x1 = p.x, z1 = p.z, y1 = p.y;
  dropPose(j, c, c.T + 1e-6, p);
  ok(p.state === 1 && Math.abs(p.x - x1) < 1e-3 && Math.abs(p.z - z1) < 1e-3 && Math.abs(p.y - y1) < 1e-3 && Math.abs(p.y - j.poolY) < 1e-9 && p.x === c.lx && p.z === c.lz, 'no jump at landing: it turns into a splash puff on the water at the landing point');
  dropPose(j, c, c.T + DWELL + 1e-6, p);
  ok(p.state === 2, 'the splash puff is gone after DWELL');
  // wind: later drops are pushed along the wind relative to no wind
  const noWind = j.x + c.dx * c.vh * drag(c.T);
  const push = (c.lx - noWind) * c.wx + (c.lz - (j.z + c.dz * c.vh * drag(c.T))) * c.wz;
  ok(push > 0, 'the breeze pushes the drop the way the wind blows');
}

// ---- time: the phase of a drop is continuous and periodic
{
  const j = jets[10], ph2 = { k: 0, u: 0 };
  let okp = true;
  for (let t = 0; t < 200; t += 0.173) {
    phaseOf(j, 0.3, t, ph2);
    if (ph2.u < 0 || ph2.u >= j.P + 1e-9) okp = false;
    const c = cycleOf(j, 0, ph2.k, makeCycle());
    if (Math.abs(t - (c.tl + ph2.u)) > 1e-6) okp = false; // tl + u = t (cycleOf and phaseOf agree when off = ph + i/m)
  }
  ok(okp, 'phaseOf: u is inside one period');
  const same = (() => { const A = { k: 0, u: 0 }, B = { k: 0, u: 0 }; phaseOf(j, 0.3, 12.34, A); phaseOf(j, 0.3, 12.34, B); return A.k === B.k && A.u === B.u; })();
  ok(same, 'the same time gives the same picture');
}

// ---- ripple and splash droplets
{
  const j = jets.find((q) => !q.swirl)!;
  const c = cycleOf(j, 0, 6, makeCycle());
  const r = { r: 0, a: 0 };
  ok(!ringPose(c, -0.1, r) && !ringPose(c, RING.life + 0.01, r), 'no ring before the landing or after it faded');
  ringPose(c, 0.5, r);
  const r05 = r.r;
  ringPose(c, 1.2, r);
  ok(r.r > r05 && Math.abs(r05 - (RING.r0 + RING.speed * 0.5)) < 1e-9, 'the ring grows outwards at RING.speed');
  const peaks: number[] = [];
  for (let age = 0; age < RING.life; age += 0.05) { ringPose(c, age, r); peaks.push(r.a); }
  ok(peaks.every((v) => v >= 0 && v <= 1.2 + 1e-9) && peaks[peaks.length - 1] < 0.05 && peaks[0] === 0, 'ring brightness starts at 0, stays <= 1.2 and fades out');
  const pose = makePose();
  let okSpray = true, flew = 0;
  for (let n = 0; n < SPRAY.n; n++) {
    ok(!sprayPose(j, c, n, -0.01, pose), `splash droplet ${n} is not there before the landing`);
    for (let age = 0; age < 1.5; age += 0.01) {
      if (sprayPose(j, c, n, age, pose)) { flew++; if (pose.y < j.poolY - 1e-9) okSpray = false; if (Math.hypot(pose.x - c.lx, pose.z - c.lz) > 3) okSpray = false; }
    }
    ok(!sprayPose(j, c, n, 2, pose), `splash droplet ${n} has fallen back after < 2 s`);
  }
  ok(flew > 20 && okSpray, 'splash droplets fly up from the water, stay above it, and stay near the landing');
  const fast = cycleOf(jets.find((q) => q.vy > 15)!, 0, 1, makeCycle()), slow = cycleOf(jets.find((q) => q.vy < 8)!, 0, 1, makeCycle());
  const maxY = (jj: typeof j, cc: typeof fast): number => { let m = 0; const p = makePose(); for (let a = 0; a < 1.5; a += 0.01) if (sprayPose(jj, cc, 0, a, p)) m = Math.max(m, p.y - jj.poolY); return m; };
  ok(maxY(jets.find((q) => q.vy > 15)!, fast) > maxY(jets.find((q) => q.vy < 8)!, slow), 'the faster the drop, the higher the splash droplets go');
}

// ---- geometry
{
  const plaza = fountainGeo(FOUNTAINS[0]), lake = fountainGeo(FOUNTAINS[3]);
  ok(plaza.plaza && plaza.poolY === BASIN.water && plaza.poolR === plaza.R - 0.7, 'plaza basin: water at BASIN.water, radius R - 0.7');
  ok(!lake.plaza && lake.poolY === WATER_Y && lake.poolR === Infinity && lake.topY === WATER_Y + 0.6, 'lake jet: the lake is the pool, marble disc 0.6 m above it');
}

// ---- mesh: ONE InstancedMesh for the water (drops + splash puffs + splash droplets), one small one for ripple rings, nothing else changes per frame
{
  const calls: string[] = [];
  const P: any = {
    k: { own: (x: unknown) => x },
    t: { marbleCream: null, stone: null },
    lit: () => new THREE.MeshPhongMaterial(),
    cyl: (g: THREE.Object3D, rt: number, rb: number, h: number, x: number, y: number, z: number, m: THREE.Material) => { calls.push('cyl'); const q = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 8), m); q.position.set(x, y, z); g.add(q); return q; },
  };
  const f = buildFountains(P, FOUNTAINS);
  const inst: THREE.InstancedMesh[] = [];
  f.group.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) inst.push(o as THREE.InstancedMesh); });
  ok(inst.length === 2, `the whole fountain system uses 2 InstancedMesh (water + ripple rings), found ${inst.length}`);
  const water = inst.find((m) => m.count === f.instances)!, rings = inst.find((m) => m.count === f.rings)!;
  ok(!!water && f.instances === drops + jets.length * SPRAY.n && f.drops === drops, `water InstancedMesh holds ${f.instances} instances = ${drops} drops + ${jets.length * SPRAY.n} splash droplets`);
  ok(!!rings && f.rings === jets.length * 2, `ring InstancedMesh holds ${f.rings} rings (2 per jet)`);
  let allFinite = true, visible = 0, flat = 0, tiny = 0;
  const M = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const times = [0, 0.4, 1.3, 2.9, 7.7, 31.4, 100.1];
  for (const tt of times) {
    f.update(tt);
    for (let i = 0; i < water.count; i++) {
      water.getMatrixAt(i, M);
      M.decompose(pos, q, sc);
      if (![pos.x, pos.y, pos.z, sc.x, sc.y, sc.z].every(Number.isFinite)) allFinite = false;
      if (sc.x > 0) { visible++; if (sc.y < sc.x * 0.6) flat++; if (sc.x < 0.1) tiny++; }
    }
  }
  ok(allFinite, 'every instance matrix is finite at every sampled time');
  ok(visible > times.length * drops * 0.5, `most drops are visible at any time (${(visible / times.length).toFixed(0)} of ${water.count} per frame)`);
  ok(flat > 0, 'some instances are flat splash puffs');
  ok(tiny > 0, 'some instances are small splash droplets');
  f.update(5); water.getMatrixAt(0, M);
  const m1 = M.clone(); f.update(5); water.getMatrixAt(0, M);
  ok(M.equals(m1), 'same time = same picture (no per-frame random state)');
  let ringsShown = 0;
  for (const tt of times) { f.update(tt); for (let i = 0; i < rings.count; i++) { rings.getMatrixAt(i, M); M.decompose(pos, q, sc); if (sc.x > 0) ringsShown++; } }
  ok(ringsShown > 0, 'ripple rings appear');
  f.setNight(1); f.setNight(0);
  ok(true, 'setNight runs');
  ok(f.group.children.length > 0 && calls.length >= 3 * FOUNTAINS.length - 4, 'bases are built for every fountain');
}

console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);

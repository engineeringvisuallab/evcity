// STEP 17.1g-b (step 3): physics of the island link strait structure M6-1 with the real Rapier engine, headless (same trimesh the game builds: deck mesh + collision-only deck top).
// Run: npx tsx scripts/island-bridge-physics-check.ts [docs]
// A  DRIVE: a car-sized box (4.4 x 1.5 x 1.8 m, no rotation but yaw) follows the right lane at 22 m/s (80 km/h = the design speed) from 16 m before the structure to 16 m after it, both directions.
//    It stays on the deck (height over the road surface), never drops, never leaves the lane. The box has NO wheels / suspension: this is a body test, NOT the game's vehicle.
// B  PARAPET: the same box hits the parapet at mid-span, in the middle of the first / last span and over the island viaduct, from the outer lane, 20 m/s forward + 7 m/s sideways (about 19 deg),
//    and must stay on the deck inside the parapet outer face for 3 s, both sides.
// C  PIERS: a ball dropped beside a pier column and an abutment must rest on the sea floor / stay outside the solid (the solid is there: a ray from outside hits the column).
import { writeFileSync } from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildStructure, straitLayout, IB } from '../src/roads/ring/RingBridgeGeometry';
import { ISLAND_LINK_DATA } from '../src/roads/island/IslandLinkData';

const outDir = process.argv[2] ?? 'docs';
let fails = 0;
const log: string[] = [];
const say = (m: string): void => { console.log(m); log.push(m); };
const ok = (c: boolean, m: string): void => { say((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const f2 = (v: number): string => v.toFixed(2);

(async () => {
  await RAPIER.init();
  const net = new TerrainGenerator(Config.world.seed).roads;
  const r = net.roads.find((q) => q.name === ISLAND_LINK_DATA.name)!;
  const b = net.bridges.find((q) => q.roadId === r.id)!;
  const L = straitLayout(r, b);
  const d = buildStructure(net, b, 20);
  const W = b.deckHalfWidth;
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const base = d.positions.length / 3;
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(d.positions.concat(d.collider!.positions)), new Uint32Array(d.indices.concat(d.collider!.indices.map((i) => i + base)))));
  world.step(); // build the query pipeline

  // road frame at arc length s (linear between road points)
  const at = (s: number): { x: number; y: number; z: number; tx: number; tz: number; nx: number; nz: number } => {
    const n = r.xs.length;
    let i = 0;
    while (i < n - 2 && r.cum[i + 1] <= s) i++;
    const t = Math.min(1, Math.max(0, (s - r.cum[i]) / (r.cum[i + 1] - r.cum[i])));
    const dx = r.xs[i + 1] - r.xs[i], dz = r.zs[i + 1] - r.zs[i], l = Math.hypot(dx, dz);
    const nx = r.nx[i] + (r.nx[i + 1] - r.nx[i]) * t, nz = r.nz[i] + (r.nz[i + 1] - r.nz[i]) * t, nl = Math.hypot(nx, nz);
    return { x: r.xs[i] + dx * t, y: r.ys[i] + (r.ys[i + 1] - r.ys[i]) * t, z: r.zs[i] + dz * t, tx: dx / l, tz: dz / l, nx: nx / nl, nz: nz / nl };
  };
  const yawQ = (tx: number, tz: number): { x: number; y: number; z: number; w: number } => { const th = Math.atan2(-tz, tx); return { x: 0, y: Math.sin(th / 2), z: 0, w: Math.cos(th / 2) }; };
  const HY = 0.75; // half height of the box
  const mkBox = (x: number, y: number, z: number, tx: number, tz: number, fric: number): RAPIER.RigidBody => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(yawQ(tx, tz)).lockRotations().setCcdEnabled(true));
    world.createCollider(RAPIER.ColliderDesc.cuboid(2.2, HY, 0.9).setFriction(fric).setMass(1500), body);
    return body;
  };
  const sA = r.cum[b.i0] - 16, sB = r.cum[b.i1] + 16;

  // A. drive both directions in the lane 8 m from the axis (right lane = +u, the other direction = -u)
  for (const dir of [1, -1]) {
    const lane = dir * 8.0 * (dir === 1 ? 1 : 1); // +8 going up the s, -8 coming back (the driving side of each direction)
    const s0 = dir === 1 ? sA : sB;
    const p0 = at(s0);
    const box = mkBox(p0.x + p0.nx * lane, p0.y + HY + 0.1, p0.z + p0.nz * lane, p0.tx * dir, p0.tz * dir, 0.5);
    let s = s0, minH = Infinity, maxH = -Infinity, maxLat = 0, steps = 0, maxAt = 0;
    const v = 22, dt = 1 / 60;
    while ((dir === 1 ? s < sB : s > sA) && steps < 6000) {
      s += dir * v * dt;
      const tgt = at(s + dir * 5);
      const tx = tgt.x + tgt.nx * lane, tz = tgt.z + tgt.nz * lane;
      const p = box.translation();
      const hx = tx - p.x, hz = tz - p.z, hl = Math.hypot(hx, hz) || 1;
      const lv = box.linvel();
      box.setLinvel({ x: (hx / hl) * v, y: lv.y, z: (hz / hl) * v }, true);
      box.setRotation(yawQ(hx / hl, hz / hl), true);
      world.step();
      const q = box.translation();
      const f0 = at(Math.min(Math.max(s, r.cum[0]), r.cum[r.cum.length - 1] - 1e-3));
      const f = at(Math.min(Math.max(s + (q.x - f0.x) * f0.tx + (q.z - f0.z) * f0.tz, r.cum[0]), r.cum[r.cum.length - 1] - 1e-3)); // road under the box itself (the target s runs ahead of the box)
      const h = q.y - HY - f.y;
      if (h > maxH) maxAt = s; minH = Math.min(minH, h); maxH = Math.max(maxH, h);
      maxLat = Math.max(maxLat, Math.abs((q.x - f.x) * f.nx + (q.z - f.z) * f.nz - lane));
      steps++;
    }
    ok(steps < 6000 && minH > -0.15 && maxH < 0.35 && maxLat < 1.0, `A drive ${dir === 1 ? 'mainland -> island' : 'island -> mainland'} at ${v} m/s over ${f2(sB - sA)} m: ${steps} steps, box bottom over the road surface ${f2(minH)} .. ${f2(maxH)} m (limits -0.15 .. 0.35), lane error max ${f2(maxLat)} m (limit 1.0), highest at design s ${f2(maxAt + ISLAND_LINK_DATA.s[0])}`);
    world.removeRigidBody(box);
  }

  // B. parapet hits from the carriageway: 20 m/s forward, 7 m/s sideways
  const hitAt: [string, number][] = [['first span middle', L.s0 + (L.piers[0] - L.s0) / 2], ['mid-span', (L.s0 + L.s1) / 2], ['last span middle', L.piers[L.piers.length - 1] + (L.s1 - L.piers[L.piers.length - 1]) / 2], ['first 8 m', r.cum[b.i0] + 8]];
  for (const [name, s] of hitAt) for (const side of [-1, 1]) {
    const f = at(s);
    const u0 = side * 12;
    const box = mkBox(f.x + f.nx * u0, f.y + HY + 0.02, f.z + f.nz * u0, f.tx, f.tz, 0.3);
    box.setLinvel({ x: f.tx * 20 + f.nx * side * 7, y: 0, z: f.tz * 20 + f.nz * side * 7 }, true);
    let maxU = 0, minY = Infinity;
    for (let i = 0; i < 180; i++) {
      world.step();
      const q = box.translation();
      const g = at(Math.min(r.cum[r.cum.length - 2], Math.max(0.1, s + (i / 180) * 3 * 20)));
      maxU = Math.max(maxU, side * ((q.x - g.x) * g.nx + (q.z - g.z) * g.nz));
      minY = Math.min(minY, q.y - HY - g.y);
    }
    ok(maxU < W && minY > -0.3, `B parapet ${name.padEnd(17)} ${side > 0 ? 'right' : 'left '}: centre never beyond u = ${f2(maxU)} m (outer face ${f2(W)} m, inner face 16.00 m), lowest box bottom ${f2(minY)} m over the road surface`);
    world.removeRigidBody(box);
  }

  // C. piers and abutments are solid: a ray from the side at 2 m over the sea floor hits the column, a ray along the girder soffit gap between the columns does not hit the column plane
  let rayFail = 0;
  for (const s of L.piers) {
    const f = at(s);
    const k = Math.round(s / r.step);
    const low = Math.min(r.hNat[k - 1], r.hNat[k], r.hNat[k + 1]);
    const y = low + 4;
    const o = { x: f.x + f.nx * (IB.colU + 8), y, z: f.z + f.nz * (IB.colU + 8) };
    const hit = world.castRay(new RAPIER.Ray(o, { x: -f.nx, y: 0, z: -f.nz }), 40, true);
    const expect = 8 - IB.footB / 2; // the column face is about 8 - footB/2 (+ a little: tapered) from the origin
    if (!hit || Math.abs(hit.timeOfImpact - expect) > 1.6) rayFail++;
  }
  ok(rayFail === 0, `C ${L.piers.length} pier lines: a ray 4 m over the sea floor from 8 m outside the outer column hits that column (face about ${f2(8 - IB.footB / 2)} m away, tolerance 1.6 m for the taper); misses: ${rayFail}`);
  for (const s of [L.s0, L.s1]) {
    const f = at(s);
    const hit = world.castRay(new RAPIER.Ray({ x: f.x + f.tx * 8, y: f.y - 3.0 - 1.2, z: f.z + f.tz * 8 }, { x: -f.tx, y: 0, z: -f.tz }), 20, true);
    ok(!!hit, `C abutment at design s ${f2(s + ISLAND_LINK_DATA.s[0])}: a ray along the road under the girder hits the abutment wall (3.2 m thick, centred on the structure end) at ${hit ? f2(hit.timeOfImpact) : 'MISS'} m (3.2 m thick wall, face about 6.4 m from the ray start)`);
  }

  say(fails ? `\n${fails} FAIL` : '\nALL PASS');
  try { writeFileSync(`${outDir}/STEP171G_B_PHYSICS_OUTPUT.txt`, log.join('\n') + '\n'); } catch { /* docs folder missing */ }
  process.exit(fails ? 1 : 0);
})();

// STEP HK-9b check: the loop ramp meshes + solids (HkInterchangeLayer -> RingStructurePhysics -> Rapier), switch ON; with the switch OFF the layer must be empty.
// Run: HK=1 npx tsx scripts/hk-ring-run.ts hk-ramp-mesh-check      (HK=0: OFF test only)
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RingStructurePhysics } from '../src/roads/ring/RingStructurePhysics';
import { HkInterchangeLayer } from '../src/roads/ring/HkInterchangeLayer';
import { hkFrame, hkRamps, hkRingOffset } from '../src/roads/ring/HkRamps';
import { NODE_VIADUCT as N } from '../src/roads/ring/NodeViaductData';
import { HM } from '../src/roads/ring/HkRampMesh';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(68)} ${detail}`); };
const f2 = (v: number): string => v.toFixed(2);

(async () => {
  await RAPIER.init();
  const on = !!Config.roads.hatikamrul.enabled;
  const gen = new TerrainGenerator(Config.world.seed);
  const net = gen.roads;
  const ground = (x: number, z: number): number => gen.heightAt(x, z);
  const t0 = Date.now();
  const layer = new HkInterchangeLayer(new THREE.Group(), net, ground);
  const ms = Date.now() - t0;
  if (!on) { check(layer.solids.length === 0, 'M0 switch OFF: the layer is empty (no mesh, no solid)', `${layer.solids.length} solids`); console.log(fails ? `FAILED ${fails}` : 'ALL PASS (OFF)'); process.exit(fails ? 1 : 0); }

  const f = hkFrame(net)!, ramps = hkRamps(f), off = hkRingOffset(net);
  const ring = net.roads.find((r) => r.name === 'M8')!;
  // M1 meshes
  let tris = 0, verts = 0, bad = 0;
  for (const s of layer.solids) { const nv = s.positions.length / 3; verts += nv; tris += s.indices.length / 3; if (!s.positions.every(Number.isFinite) || !Array.from(s.indices).every((i) => i < nv) || s.indices.length % 3) bad++; }
  check(layer.solids.length === 4 && bad === 0, 'M1 four ramp meshes, finite numbers, valid indices', `${layer.solids.length} meshes, ${verts} verts, ${tris} tris, built in ${ms} ms`);

  // M2 no overlap with the ring deck: every vertex of every ramp mesh stays outside the 25.75 m deck half width
  let minOff = Infinity; for (const s of layer.solids) for (let i = 0; i < s.positions.length; i += 3) minOff = Math.min(minOff, off(s.positions[i], s.positions[i + 2]));
  check(minOff >= N.deckHalf - 0.05, 'M2 ramp meshes do not overlap the ring deck (>= 25.75 m from the ring axis)', `closest vertex ${f2(minOff)} m`);

  // M3 clearance to the 12 node viaduct columns, the column at its EXACT station (ring interpolated): centre distance - ramp half width - distance from the ramp centreline to the column rectangle (3.0 along the ring x 2.5 across, oriented with the ring) - ramp half width 4.2 >= 1.0 m
  const colAt = (station: number, u: number): { x: number; z: number; tx: number; tz: number } => {
    const k = Math.min(ring.xs.length - 2, Math.floor(station / ring.step)), t = (station - ring.cum[k]) / (ring.cum[k + 1] - ring.cum[k]);
    const x = ring.xs[k] + (ring.xs[k + 1] - ring.xs[k]) * t, z = ring.zs[k] + (ring.zs[k + 1] - ring.zs[k]) * t;
    let nx = ring.nx[k] + (ring.nx[k + 1] - ring.nx[k]) * t, nz = ring.nz[k] + (ring.nz[k + 1] - ring.nz[k]) * t; const l = Math.hypot(nx, nz); nx /= l; nz /= l;
    return { x: x + nx * u, z: z + nz * u, tx: -nz, tz: nx }; // tangent = normal turned by 90 deg
  };
  const minColFor = (stationM: number): { d: number; w: string } => {
    let best = Infinity, w = '';
    for (const pd of N.piersD) for (const u of N.colU) {
      const c = colAt(stationM + pd, u);
      for (const rp of ramps) for (let i = 0; i < rp.xs.length; i++) {
        const dx = rp.xs[i] - c.x, dz = rp.zs[i] - c.z, a = Math.abs(dx * c.tx + dz * c.tz) - N.colAlong / 2, b = Math.abs(dx * -c.tz + dz * c.tx) - N.colAcross / 2;
        const d = Math.hypot(Math.max(a, 0), Math.max(b, 0)) - rp.halfW; if (d < best) { best = d; w = `${rp.id} column d ${pd} u ${u}`; }
      }
    }
    return { d: best, w };
  };
  const mc = minColFor(N.stationM), mOld = minColFor(1207.797792497983);
  console.log(`  info  same check with the HK-8d-2 station 1207.798 (before HK-9b): closest ${f2(mOld.d)} m (${mOld.w})`);
  check(mc.d >= 1.0, 'M3 ramp edge to the node viaduct columns >= 1.0 m (HK-8b rule)', `closest ${f2(mc.d)} m (${mc.w}), station ${N.stationM}`);

  // physics through the real class
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const phys = new RingStructurePhysics({ RAPIER, world } as never, { origin: { x: 0, z: 0 } } as never, layer.solids);
  const act = (id: number): boolean => (phys as unknown as { active: Map<number, unknown> }).active.has(id);
  phys.update(1, layer.solids[0].cx + layer.solids[0].radius + 800, layer.solids[0].cz); check(!act(0), 'M4 player far away: no ramp collider', `active ${phys.activeCount}`);
  for (const s of layer.solids) phys.update(1, s.cx, s.cz); // every solid active at its own centre (several updates: each call re-checks all)
  phys.update(1, ramps[0].xs[10], ramps[0].zs[10]);
  check(layer.solids.every((_, i) => act(i)), 'M4 player at the interchange: all 4 ramp colliders created', `active ${phys.activeCount}`);

  // M5 balls on the lane centre at 5 places of every ramp (only in the kept part: where the mesh is)
  let worst = 0, nb = 0, nbad = 0, parBad = 0, nPar = 0;
  ramps.forEach((rp, q) => {
    const cdEnd = rp.ringEnd === 0 ? rp.xs.length - 1 : 0, st = rp.ringEnd === 0 ? -1 : 1;
    const kept: number[] = []; for (let i = cdEnd; i >= 0 && i < rp.xs.length; i += st) { if (off(rp.xs[i], rp.zs[i]) <= HM.maxOff) break; kept.push(i); }
    for (const fr of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const i = kept[Math.floor(fr * (kept.length - 1))];
      const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(rp.xs[i], rp.ys[i] + 3, rp.zs[i]));
      world.createCollider(RAPIER.ColliderDesc.ball(0.4), ball);
      for (let s = 0; s < 240; s++) world.step();
      const e = Math.abs(ball.translation().y - (rp.ys[i] + 0.4)); worst = Math.max(worst, e); nb++; if (e > 0.35) nbad++;
      world.removeRigidBody(ball);
    }
    // M6 parapet: a horizontal ray from 8 m outside at pavement + 0.5 m must hit the parapet at the ramp edge (4.2 m), both sides
    const i = kept[Math.floor(kept.length / 2)], i2 = kept[Math.floor(kept.length / 2) + 1];
    const tx = rp.xs[i2] - rp.xs[i], tz = rp.zs[i2] - rp.zs[i], l = Math.hypot(tx, tz), nx = -tz / l, nz = tx / l;
    for (const sd of [-1, 1]) {
      const ox = rp.xs[i] + nx * sd * 8, oz = rp.zs[i] + nz * sd * 8;
      const h = world.castRay(new RAPIER.Ray({ x: ox, y: rp.ys[i] + 0.5, z: oz }, { x: -nx * sd, y: 0, z: -nz * sd }), 20, false);
      nPar++; const at = h ? 8 - h.timeOfImpact : NaN; if (!h || Math.abs(at - rp.halfW) > 0.6) parBad++; void q;
    }
  });
  check(nbad === 0, 'M5 ball dropped 3 m on the lane centre rests on the pavement (4 ramps x 5 places)', `${nb} balls, worst error ${f2(worst)} m`);
  check(parBad === 0, 'M6 parapet stops a ray at the ramp edge (4.2 m), both sides of every ramp', `${nPar} rays, ${parBad} off`);

  // M7 terrain collider (ground) vs pavement: ground never above the pavement by more than 0.25 m; M8 ramp rests on piers / wall: lowest mesh point below the ground
  let poke = -Infinity, wp = '', nPoke = 0;
  for (const rp of ramps) for (let i = 0; i < rp.xs.length; i++) { if (off(rp.xs[i], rp.zs[i]) <= HM.maxOff) continue; const e = ground(rp.xs[i], rp.zs[i]) - rp.ys[i]; if (e > 0.25) nPoke++; if (e > poke) { poke = e; wp = `${rp.id} pt ${i}`; } }
  check(poke <= 0.25, 'M7 terrain does not poke through the pavement (ground - pavement <= 0.25 m)', `highest ${f2(poke)} m at ${wp}, ${nPoke} points over 0.25 m`);
  let mn = Infinity; for (const s of layer.solids) for (let i = 1; i < s.positions.length; i += 3) mn = Math.min(mn, s.positions[i]);
  let gmin = Infinity; for (const rp of ramps) for (let i = 0; i < rp.xs.length; i++) gmin = Math.min(gmin, ground(rp.xs[i], rp.zs[i]));
  check(mn < gmin - 2, 'M8 columns go below the lowest ground under the ramps (embedded)', `lowest mesh point ${f2(mn)} m, lowest ground ${f2(gmin)} m`);

  phys.dispose(); check(phys.activeCount === 0, 'M4 dispose() removes every body', `active ${phys.activeCount}`);
  console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();

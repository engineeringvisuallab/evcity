// STEP HK-8d-3 check: the physics solid of the NODE VIADUCT (Hatikamrul interchange, ring over the node), through the real game path:
// RingStructureLayer (solids) -> RingStructurePhysics (near-player switch, Rapier trimesh) -> balls / rays in the same Rapier world.
// Run: HK=1 npx tsx scripts/hk-ring-run.ts hk-node-physics-check      (HK=0: only proves that the switch OFF adds no node solid)
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RingStructureLayer } from '../src/roads/ring/RingStructureLayer';
import { RingStructurePhysics } from '../src/roads/ring/RingStructurePhysics';
import { isNodeViaduct, ringStructures } from '../src/roads/ring/RingBridgeGeometry';
import { NODE_VIADUCT as N, nodeDepth } from '../src/roads/ring/NodeViaductData';
import { PhysicsConfig } from '../src/physics/PhysicsConfig';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(64)} ${detail}`); };
const f1 = (v: number): string => v.toFixed(2);

(async () => {
  await RAPIER.init();
  const on = !!Config.roads.hatikamrul.enabled;
  const gen = new TerrainGenerator(Config.world.seed);
  const net = gen.roads;
  const ring = net.roads.find((r) => r.name === 'M8')!;
  const specs = ringStructures(net);
  const nodeSpecs = specs.filter((b) => isNodeViaduct(net, b));
  console.log(`switch ${on ? 'ON' : 'OFF'}: ${specs.length} ring-list structures, node viaducts ${nodeSpecs.length}`);
  if (!on) { check(nodeSpecs.length === 0, 'switch OFF: no node viaduct structure', `${nodeSpecs.length}`); console.log(fails ? `FAILED ${fails}` : 'ALL PASS (OFF)'); process.exit(fails ? 1 : 0); }

  // N1 the node structure exists once and is the LAST of the list
  check(nodeSpecs.length === 1 && specs[specs.length - 1] === nodeSpecs[0], 'N1 one node viaduct, LAST in the structure list', `index ${specs.indexOf(nodeSpecs[0])} of ${specs.length}`);
  const kNode = Math.round(N.stationM / ring.step);
  const at = (d: number, u: number): [number, number, number] => { const kk = kNode + Math.round(d / ring.step); /* d + is WEST = station + */ return [ring.xs[kk] + ring.nx[kk] * u, ring.ys[kk], ring.zs[kk] + ring.nz[kk] * u]; };

  // N2 the solid
  const layer = new RingStructureLayer(new THREE.Group(), net);
  const sid = layer.solids.length - 1; // the node structure is the last non-empty one
  const s = layer.solids[sid];
  const nv = s.positions.length / 3, nt = s.indices.length / 3;
  let maxR = 0, finite = true;
  for (let i = 0; i < s.positions.length; i += 3) { if (!Number.isFinite(s.positions[i] + s.positions[i + 1] + s.positions[i + 2])) finite = false; maxR = Math.max(maxR, Math.hypot(s.positions[i] - s.cx, s.positions[i + 2] - s.cz)); }
  const idxOk = Array.from(s.indices).every((i) => i < nv);
  const [cx0, , cz0] = at((N.deckD0 + N.deckD1) / 2 + 8, 0); // deck + slabs centre is d +24
  check(finite && idxOk && nt > 0 && s.indices.length % 3 === 0, 'N2 solid: finite numbers, valid indices', `${nv} verts, ${nt} tris (render + collider top face)`);
  check(Math.hypot(s.cx - cx0, s.cz - cz0) < 12, 'N2 bounding circle is centred on the deck (render mesh d -112 .. +160)', `centre off ${f1(Math.hypot(s.cx - cx0, s.cz - cz0))} m, radius ${f1(s.radius)} m`);
  // The circle is made from the RENDER mesh only; the collision-only deck top runs COLLIDER_EXT = 2 points (16 m) further on both ends (RingStructureLayer / deck(), old rule of every structure): the overshoot of the node viaduct must be like the other structures'.
  const over = (q: typeof s): number => { let m = 0; for (let i = 0; i < q.positions.length; i += 3) m = Math.max(m, Math.hypot(q.positions[i] - q.cx, q.positions[i + 2] - q.cz)); return m - q.radius; };
  const others = layer.solids.slice(0, sid).map(over); const oMax = Math.max(...others), oMin = Math.min(...others), oNode = over(s);
  check(oNode <= oMax + 0.5 && oNode <= 17, 'N2 collider-only deck top past the circle: same as the other structures (old rule)', `node ${f1(oNode)} m, other ${others.length} structures ${f1(oMin)} .. ${f1(oMax)} m, limit 2 points = 17 m`);
  // N3 RingStructurePhysics: near-player switch (real class, fake PhysicsWorld wrapper around a real Rapier world)
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const phys = new RingStructurePhysics({ RAPIER, world } as never, { origin: { x: 0, z: 0 } } as never, layer.solids);
  const reach = PhysicsConfig.activeRadius + s.radius;
  const act = (): boolean => (phys as unknown as { active: Map<number, unknown> }).active.has(sid);
  phys.update(1, s.cx + reach + 200, s.cz); check(!act(), 'N3 player far away (reach + 200 m): no collider', `active ${phys.activeCount}`);
  phys.update(1, s.cx + reach - 2, s.cz); check(act(), 'N3 player 2 m inside the reach: collider created', `reach ${f1(reach)} m, active ${phys.activeCount}`);
  phys.update(1, s.cx + reach + 70, s.cz); check(!act(), 'N3 player 70 m outside the reach: collider removed', `active ${phys.activeCount}`);
  phys.update(1, s.cx, s.cz); check(act(), 'N3 player on the deck: collider created again', `active ${phys.activeCount}`);
  const body = (phys as unknown as { active: Map<number, RAPIER.RigidBody> }).active.get(sid)!;
  check(body.isFixed() && body.numColliders() === 1, 'N3 one FIXED body with one trimesh collider', `fixed ${body.isFixed()}, colliders ${body.numColliders()}`);

  // N4 balls on the deck (real collider from N3): 7 stations x 4 lateral offsets, ring level = deck top
  let worstBall = 0, nBall = 0, badBall = 0;
  for (const d of [-94, -50, 0, 50, 97, 140]) for (const u of [-24, -12, 12, 24]) {
    const [x, y, z] = at(d, u);
    const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y + 3, z));
    world.createCollider(RAPIER.ColliderDesc.ball(0.4), ball);
    for (let i = 0; i < 240; i++) world.step();
    const e = Math.abs(ball.translation().y - (y + 0.4)); worstBall = Math.max(worstBall, e); nBall++; if (e > 0.35) badBall++;
    world.removeRigidBody(ball);
  }
  check(badBall === 0, 'N4 ball dropped 3 m on the deck rests on it (6 stations x 4 offsets)', `${nBall} balls, worst error ${f1(worstBall)} m`);

  // N5 parapets: a horizontal ray from outside at deck + 0.5 m must hit the parapet at the deck edge, from both sides, at 3 stations
  let parBad = 0; const parRes: string[] = [];
  for (const d of [-40, 24, 120]) for (const side of [-1, 1]) {
    const [x, y, z] = at(d, side * 32); const [x0, , z0] = at(d, 0);
    const dir = { x: x0 - x, y: 0, z: z0 - z }; const L = Math.hypot(dir.x, dir.z); dir.x /= L; dir.z /= L;
    const h = world.castRay(new RAPIER.Ray({ x, y: y + 0.5, z }, dir), 40, false);
    const edge = h ? 32 - h.timeOfImpact : NaN; // lateral position of the hit
    if (!h || Math.abs(edge - N.deckHalf) > 0.7) parBad++; parRes.push(f1(edge));
  }
  check(parBad === 0, 'N5 parapet stops a ray at the deck edge (25.75 m)', `hit at u = ${parRes.join(' / ')} m`);

  // N6 clearance: rays up from the carriageway of the lower roads (J1-S arm, island link M6-1) where they pass under the deck
  const lower = net.roads.filter((r) => r.name === 'J1-S' || r.name === 'M6-1');
  let minClr = Infinity, nRay = 0, nHit = 0, where = '';
  for (const lr of lower) {
    const half = lr.halfWidth;
    for (let k = 0; k < lr.xs.length; k++) {
      if (Math.hypot(lr.xs[k] - s.cx, lr.zs[k] - s.cz) > 120) continue;
      for (let u = -half; u <= half + 1e-6; u += Math.max(1, half / 8)) {
        const x = lr.xs[k] + lr.nx[k] * u, z = lr.zs[k] + lr.nz[k] * u, y = lr.ys[k] + 0.05;
        nRay++;
        const h = world.castRay(new RAPIER.Ray({ x, y, z }, { x: 0, y: 1, z: 0 }), 14, false);
        if (h) { nHit++; const c = h.timeOfImpact + 0.05; if (c < minClr) { minClr = c; where = `${lr.name} pt ${k} u ${f1(u)}`; } }
      }
    }
  }
  check(lower.length === 2, 'N6 both lower roads exist (J1-S arm, M6-1 link)', lower.map((r) => r.name).join(', '));
  check(nHit > 0 && minClr >= 5.49, 'N6 clearance over the lower roads >= 5.50 m (min over all rays)', `${nRay} rays, ${nHit} hit the deck, min ${f1(minClr)} m at ${where}`);

  // N7 the terrain collider (heightfield, bilinear like Rapier) under the deck stays below the soffit, nothing pokes through
  const cs = Config.world.chunkSize / Config.lod.vertsPerSide[0];
  const colH = (x: number, z: number): number => { const gx = Math.floor(x / cs), gz = Math.floor(z / cs), fx = x / cs - gx, fz = z / cs - gz; const h = (i: number, j: number): number => gen.heightAt(i * cs, j * cs); return (h(gx, gz) * (1 - fx) + h(gx + 1, gz) * fx) * (1 - fz) + (h(gx, gz + 1) * (1 - fx) + h(gx + 1, gz + 1) * fx) * fz; };
  let worstUp = -Infinity, wAt = '', n7 = 0;
  for (let d = N.deckD0 + 8; d <= N.deckD1 - 8; d += 8) for (const u of [-24, -16, -8, 0, 8, 16, 24]) { const [x, y, z] = at(d, u); const top = colH(x, z) - (y - nodeDepth(d)); n7++; if (top > worstUp) { worstUp = top; wAt = `d ${d} u ${u}`; } }
  check(worstUp < -0.3, 'N7 terrain collider under the deck is below the soffit (no poke-through)', `${n7} samples, highest terrain minus soffit ${f1(worstUp)} m at ${wAt}`);

  // N8 the lower connection under the deck: with the ring raised, the arm end (ring centreline) and the link start (25 m south) are joined by the TERRAIN collider only (the connector pavement is HK-9). Terrain collider height along the straight line arm end -> link start against the straight road level between them.
  const arm = net.roads.find((r) => r.name === 'J1-S')!, link = net.roads.find((r) => r.name === 'M6-1')!;
  const nearIdx = (r: typeof arm): number => { let bi = 0, bd = Infinity; for (let k = 0; k < r.xs.length; k++) { const dd = Math.hypot(r.xs[k] - s.cx, r.zs[k] - s.cz); if (dd < bd) { bd = dd; bi = k; } } return bi; };
  const ka = nearIdx(arm), kl = nearIdx(link);
  const A = { x: arm.xs[ka], z: arm.zs[ka], y: arm.ys[ka] }, L = { x: link.xs[kl], z: link.zs[kl], y: link.ys[kl] };
  const len = Math.hypot(L.x - A.x, L.z - A.z); let worstG = 0, wAtG = 0; const profile: string[] = [];
  for (let q = 0; q <= len; q += 2.5) { const t = q / len, x = A.x + (L.x - A.x) * t, z = A.z + (L.z - A.z) * t, yr = A.y + (L.y - A.y) * t, e = colH(x, z) - yr; if (Math.abs(e) > Math.abs(worstG)) { worstG = e; wAtG = q; } if (q % 5 === 0) profile.push(f1(e)); }
  check(Math.abs(worstG) <= 0.5, 'N8 terrain collider between arm end and link start is at road level (+-0.5 m)', `gap ${f1(len)} m (arm pt ${ka} y ${f1(A.y)} -> link pt ${kl} y ${f1(L.y)}), worst ${f1(worstG)} m at ${f1(wAtG)} m; every 5 m: ${profile.join(' ')}`);

  phys.dispose(); check(phys.activeCount === 0, 'N3 dispose() removes every body', `active ${phys.activeCount}`);
  console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();

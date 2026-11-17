// STEP 5.3c-6 check: the trimesh of every ring structure holds a falling ball on the deck (ball dropped 3 m above the road at mid-span must rest on the deck, not fall through).
// Run: npx tsx scripts/ring-bridge-physics-check.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildStructure, ringStructures } from '../src/roads/ring/RingBridgeGeometry';

(async () => {
  await RAPIER.init();
  const net = new TerrainGenerator(Config.world.seed).roads;
  let fails = 0;
  ringStructures(net).forEach((b, k) => {
    const d = buildStructure(net, b, k);
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const base = d.positions.length / 3;
    world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(d.positions.concat(d.collider!.positions)), new Uint32Array(d.indices.concat(d.collider!.indices.map((i) => i + base)))));
    const r = net.roads[b.roadId];
    const kk = (b.i0 + b.i1) >> 1;
    // drop points on the carriageway (offset 12 m from the axis): mid-span, 8 m before the start, 8 m after the end, 4 m inside each end
    const at = (kIdx: number, dk: number): [number, number, number] => {
      const j = Math.min(r.xs.length - 1, Math.max(0, kIdx));
      const t = dk / r.step; // dk in metres along the road
      const j2 = Math.min(r.xs.length - 1, Math.max(0, j + Math.round(t)));
      return [r.xs[j2] + r.nx[j2] * 12, r.ys[j2], r.zs[j2] + r.nz[j2] * 12];
    };
    const pts: [string, [number, number, number]][] = [
      ['mid-span', at(kk, 0)], ['8 m before start', at(b.i0, -8)], ['8 m after end', at(b.i1, 8)],
      ['4 m inside start', at(b.i0, 4)], ['4 m inside end', at(b.i1, -4)],
    ];
    for (const [name, [x, roadY, z]] of pts) {
      const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, roadY + 3, z));
      world.createCollider(RAPIER.ColliderDesc.ball(0.4), ball);
      for (let i = 0; i < 240; i++) world.step();
      const y = ball.translation().y;
      const ok = Math.abs(y - (roadY + 0.4)) < 0.35;
      if (!ok) fails++;
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  S${k + 1} ${name.padEnd(17)} road ${roadY.toFixed(2)}  ball centre ${y.toFixed(2)}`);
      world.removeRigidBody(ball);
    }
  });
  console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();

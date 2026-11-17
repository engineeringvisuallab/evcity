// Runtime check of the parking lots (the EVLab campus and its fence are removed).
// npx tsx scripts/parking-fence-test.ts
import * as THREE from 'three';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';

const ctxStub: any = new Proxy({ canvas: { width: 512, height: 128 } }, { get: (t: any, k) => (k in t ? t[k] : () => ({ width: 10 })), set: () => true });
(globalThis as any).location = { href: 'http://localhost/' };
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }) };
const { ParkingLots } = await import('../src/parking/ParkingLots');

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const bus = new EventBus<EngineEvents>();
const gen = new TerrainGenerator(Config.world.seed);
const physics = await PhysicsWorld.create(bus);
const root = new THREE.Group();
const origin = new FloatingOrigin(root, bus as any);

const lots = new ParkingLots({ root, terrain: gen });
let tris = 0, finite = true;
root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry.getIndex()) { tris += m.geometry.getIndex()!.count / 3; const a = m.geometry.getAttribute('position'); for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) finite = false; } });
ok(finite && tris > 500, `parking lots: ${tris} triangles, all vertices finite`);

lots.dispose();
ok(true, 'dispose runs clean');
console.log(fails ? `FAILED (${fails})` : 'ALL OK');
process.exit(fails ? 1 : 0);

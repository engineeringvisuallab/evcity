// Aircraft factory SITE checks (boundary fence, gate, roads, taxi strips, the pad on the real terrain) and the factory's parts / tour as the game builds them.
// Run: npx tsx scripts/aircraft-site-test.ts
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { InfraManager } from '../src/engineering/InfraManager';
import { L, SITE } from '../src/engineering/mechanical/aircraft-factory/layout';

const stubEl = (): Record<string, unknown> => ({ style: {}, appendChild() {}, remove() {}, textContent: '', getContext: () => null });
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).document = { createElement: stubEl };
let bad = 0;
const ok = (c: boolean, m: string): void => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const g = new TerrainGenerator(Config.world.seed);
const origin = { origin: new THREE.Vector3(), toLocal: (w: THREE.Vector3, out = new THREE.Vector3()) => out.set(w.x, w.y, w.z), toWorld: (l: THREE.Vector3, out = new THREE.Vector3()) => out.set(l.x, l.y, l.z) };
const pressed = new Set<string>();
const root = new THREE.Group();
const site = g.infra.find((s) => s.id === 'aircraft')!;
ok(!!site, 'aircraft site exists');
const mgr = new InfraManager({
  root, physics: { RAPIER, world } as never, origin: origin as never, terrain: g,
  input: { wasPressed: (k: string) => { const r = pressed.has(k); pressed.delete(k); return r; } } as never,
  voice: { speakText: async () => undefined, stop() {} }, container: { appendChild() {} } as never,
  playerWorld: (out) => out.set(site.x, site.floorY + 1.7, site.z + 150),
});
world.step();
const pl = mgr.plants.find((p) => p.site.id === 'aircraft')!;
root.updateMatrixWorld(true);

// the site stands inside the old airport's pad, on its floor, level
const ap = g.airport.rect, R = site.rect;
ok(site.x + R.x0 > ap.x0 + 20 && site.x + R.x1 < ap.x1 - 20 && site.z + R.z0 > ap.z0 + 20 && site.z + R.z1 < ap.z1 - 20, 'the pad is inside the old airport pad');
ok(Math.abs(site.floorY - g.airport.floorY) < 0.001, `its floor is the airport floor (${site.floorY.toFixed(2)} m)`);
const s0 = g.makeSample(); let dev = 0;
for (let lx = R.x0; lx <= R.x1; lx += 20) for (let lz = R.z0; lz <= R.z1; lz += 20) { const pt = { x: 0, z: 0 }; site.toWorld(lx, lz, pt); g.sample(pt.x, pt.z, s0); dev = Math.max(dev, Math.abs(s0.h - site.floorY)); }
ok(dev < 0.2, `the ground is level (max ${dev.toFixed(2)} m off)`);

// parts, tour
ok(pl.infra.parts.map((p) => p.id).join() === 'gate,line,hall,cnc,wing,fuse,final,paint,test', `nine parts: site works, line, hall, parts shop, five stations (${pl.infra.parts.map((p) => p.id).join()})`);
ok(pl.infra.tour.length === 12 && pl.infra.narrationLang === 'en', `twelve English tour stops (${pl.infra.tour.length})`);
ok(pl.infra.tour.every((st) => st.text.length > 200 && /^[\x20-\x7e]+$/.test(st.text)), 'every stop has a real English narration');
let bb = new THREE.Box3().setFromObject(pl.infra.root);
ok(bb.max.x - bb.min.x < 430 && bb.max.z - bb.min.z < 260, `the site and its taxi strips fit (${(bb.max.x - bb.min.x).toFixed(0)} x ${(bb.max.z - bb.min.z).toFixed(0)} m)`);

// colliders: the fence blocks, the gates and the rollout road are open
const ray = (lx: number, lz: number): number | null => { const pt = { x: 0, z: 0 }; site.toWorld(lx, lz, pt); const h = world.castRay(new RAPIER.Ray({ x: pt.x, y: site.floorY + 60, z: pt.z }, { x: 0, y: -1, z: 0 }), 100, true); return h ? site.floorY + 60 - h.timeOfImpact : null; };
const fenceTop = ray(SITE.minX + 0.0, -90) ?? 0;
ok(fenceTop > site.floorY + 0.7, `the fence at the west boundary is solid (top ${(fenceTop - site.floorY).toFixed(1)} m)`);
const gateY = ray(L.gate.x, SITE.maxZ), doorY = ray(SITE.minX, L.door.z);
ok(gateY !== null && Math.abs(gateY - site.floorY) < 0.3, 'the main gate is open (road level)');
ok(doorY !== null && Math.abs(doorY - site.floorY) < 0.3, 'the west gate (rollout road) is open');
let plate = 0, miss = 0;
for (let lx = SITE.minX + 4; lx < SITE.maxX - 4; lx += 10) for (let lz = SITE.minZ + 4; lz < SITE.maxZ - 4; lz += 10) { const y = ray(lx, lz); if (y === null) miss++; else if (Math.abs(y - site.floorY) < 0.3) plate++; }
ok(plate > 300 && miss === 0, `the plate has a collider everywhere (${plate} samples on the floor, the rest on the buildings, ${miss} misses)`);

// the tour runs
const cam = new THREE.PerspectiveCamera();
pressed.add('KeyY'); mgr.update(1 / 60);
ok(mgr.touring, 'Y starts the tour');
let nan = false;
for (let i = 0; i < 12; i++) {
  for (let f = 0; f < 60 * 3; f++) { mgr.update(1 / 60); mgr.applyCamera(1 / 60, cam); if (![cam.position.x, cam.position.y, cam.position.z, cam.quaternion.w].every(Number.isFinite)) nan = true; }
  pressed.add('Period'); mgr.update(1 / 60);
}
ok(!nan && !mgr.touring, 'the tour ends cleanly');
bb = new THREE.Box3();
console.log(bad ? `${bad} problem(s)` : 'ALL OK');
process.exit(bad ? 1 : 0);

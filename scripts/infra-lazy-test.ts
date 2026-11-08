// Lazy engineering sites: built EARLY (before the show distance) in an idle moment, a safety-net build inside the show distance,
// disposed again on the low tier when far (Rapier body removed from the world), rebuilt when the player returns, tours still start.
// Run: npx tsx scripts/infra-lazy-test.ts
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { Q } from '../src/core/Quality';
import { InfraManager } from '../src/engineering/InfraManager';

const stubEl = (): Record<string, unknown> => ({ style: {}, appendChild() {}, remove() {}, textContent: '', getContext: () => null });
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).document = { createElement: stubEl };
let bad = 0;
const ok = (c: boolean, m: string): void => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

(Q as { siteShowDist: number }).siteShowDist = 700; // the low tier
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const g = new TerrainGenerator(Config.world.seed);
const origin = { origin: new THREE.Vector3(), toLocal: (w: THREE.Vector3, out = new THREE.Vector3()) => out.set(w.x, w.y, w.z), toWorld: (l: THREE.Vector3, out = new THREE.Vector3()) => out.set(l.x, l.y, l.z) };
const pressed = new Set<string>();
const root = new THREE.Group();
const site = g.infra.find((s) => s.id === 'textile')!;
let px = site.x + 6000; // far away
const mgr = new InfraManager({
  root, physics: { RAPIER, world } as never, origin: origin as never, terrain: Object.create(g, { infra: { value: [site] } }) as TerrainGenerator, // only this site, so neighbours do not disturb the counts
  input: { wasPressed: (k: string) => { const r = pressed.has(k); pressed.delete(k); return r; } } as never,
  voice: { speakText: async () => {}, stop() {} }, container: { appendChild() {} } as never,
  playerWorld: (out) => out.set(px, 30, site.z),
  lazy: true,
});
const pl = mgr.plants.find((p) => p.site.id === 'textile')!;
const step = async (n = 3): Promise<void> => { for (let i = 0; i < n; i++) { mgr.update(1 / 60); await sleep(80); } };
console.log(`show distance ${Q.siteShowDist} m`);

Q.siteDisposeMul = 2.5; // the low-tier behaviour
const bodies0 = world.bodies.len();
await step();
ok(pl.built === false, 'far away: not built');

px = site.x + Q.siteShowDist * 1.6; // outside the early-build distance
await step();
ok(pl.built === false, 'at 1.6 x show distance: still not built');

px = site.x + Q.siteShowDist * 1.2; // inside 1.3 x, outside the show distance
mgr.update(1 / 60);
ok(pl.built === false, 'at 1.2 x show distance the build is only SCHEDULED (not done inside the frame)');
await sleep(200);
mgr.update(1 / 60); // (the game calls update every frame: a second site waiting for the single idle slot gets it then)
await sleep(200);
ok(pl.built === true, 'the idle build finished BEFORE the player reached the show distance');
ok(world.bodies.len() === bodies0 + 1, 'its Rapier body (colliders) exists');
mgr.update(1 / 60);
ok(pl.infra.root.visible === false, 'built early but still hidden beyond the show distance');

px = site.x + Q.siteShowDist * 0.8;
mgr.update(1 / 60);
ok(pl.infra.root.visible === true, 'visible inside the show distance');

// the tour still works
pressed.add('KeyY');
mgr.update(1 / 60);
ok(mgr.touring, 'Y starts the tour');
mgr.stopTour();
mgr.update(1 / 60);

// low tier: far away => disposed, body removed
px = site.x + Q.siteShowDist * 2.7;
mgr.update(1 / 60);
ok(pl.built === false, 'beyond 2.5 x show distance: the site is disposed');
ok(world.bodies.len() === bodies0, 'its Rapier body is removed from the physics world');
let leftovers = 0;
root.traverse((o) => { if (o.name === 'ground-pad') leftovers++; });
ok(leftovers === 0, 'no ground-pad mesh is left in the scene');

// back again: rebuilt, safety net inside the show distance builds synchronously
px = site.x + Q.siteShowDist * 0.5;
mgr.update(1 / 60);
ok(pl.built === true, 'player returns: the safety net rebuilds it at once (inside the show distance)');
ok(world.bodies.len() === bodies0 + 1, 'exactly one body again (no leak)');
ok(mgr.listTours().some((t) => t.id === 'textile' && t.stops > 0), 'the Tour menu lists the rebuilt site with its stops');
ok(mgr.startById('textile') === 'started', 'Tour menu start works after a rebuild');
mgr.stopTour();

// an active tour keeps its site even if the camera is far
mgr.startById('textile');
px = site.x + Q.siteShowDist * 3;
mgr.update(1 / 60);
ok(pl.built === true, 'a site with a running tour is never disposed');
mgr.stopTour();
mgr.dispose();
ok(world.bodies.len() === bodies0, 'dispose() leaves no body behind');
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);

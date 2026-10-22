// FIELD ACTORS: the people and machines that make a field alive, chosen by the field's ACTIVITY (CropDefs.Act).
//   plow          tractor or power tiller working up and down the lanes at the frontier of the ploughed part
//   harvestCombine combine harvester at the frontier + a tractor with an empty trolley waiting on the lane
//   harvestHand   a line of bent workers cutting with sickles + bundles lying on the cut side
//   transplant    bent workers in a line planting rice seedlings in the flooded field
//   sow, weed     workers walking the lanes / bent over the rows
//   irrigate      diesel pump + pipe at the bank, a worker with a spade
//   spray         agricultural drone sweeping the field with a spray cone
//   pick          pickers with crates (fruit, vegetables, tea)
//   thresh        threshing machine, straw stack, sacks, workers
//   haul          tractor with a loaded trolley on the bank lane + sacks
//   graze         cows wandering on the stubble / fallow land
// Everything lives in the field's local frame (x along the rows, z across; +x is the front of a model turned with rotation.y = -pi/2 for +z travel).
import * as THREE from 'three';
import { mulberry32 } from '../world/Seed';
import { Act, cropById } from './CropDefs';
import type { Field } from './FarmPlan';
import type { HeightGrid } from './FarmRenderer';
import { makeCombine, makeCow, makeCrate, makeDrone, makeFarmer, makePump, makeSacks, makeStraw, makeTiller, makeTractor, makeTrolley, mat } from './FarmProps';

export interface Actor { group: THREE.Group; tick(t: number): void }

const SHIRTS = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad, 0xe67e22, 0x16a085, 0xd35400];
const PI2 = Math.PI / 2;
/** Mark a mesh whose geometry (and material, if not shared) belongs to this field only: the manager frees it. */
const own = <T extends THREE.Mesh | THREE.InstancedMesh>(m: T): T => { m.userData.own = true; return m; };

export function buildActors(f: Field, grid: HeightGrid): Actor | null {
  const c = cropById(f.crop), rnd = mulberry32(f.seed ^ 0xa11ce), g = new THREE.Group(), ticks: ((t: number) => void)[] = [];
  const hw = f.w / 2, hd = f.d / 2;
  const gy = (x: number, z: number) => (f.level ? 0.05 : grid.at(x, z) + 0.08);
  const frontier = -hw + f.progress * f.w;
  const shirt = () => SHIRTS[Math.floor(rnd() * SHIRTS.length)];
  const add = <T extends THREE.Object3D>(o: T, x: number, z: number, ry = 0, lift = 0): T => { o.position.set(x, gy(x, z) + lift, z); o.rotation.y = ry; g.add(o); return o; };

  /** Model (front = +x) shuttling along z at fixed x. */
  const shuttle = (o: THREE.Object3D, x: number, speed: number, margin: number, phase = 0, drift = 0) => {
    const L = f.d - 2 * margin;
    ticks.push((t) => {
      const k = (((t * speed) / L + phase) % 2 + 2) % 2, u = k < 1 ? k : 2 - k, z = -hd + margin + u * L, xx = x + Math.sin(t * 0.07 + phase * 3) * drift;
      o.position.set(xx, gy(xx, z), z);
      o.rotation.y = k < 1 ? -PI2 : PI2;
    });
  };
  /** A line of workers across the field (along z) at x, bobbing; bent or upright. */
  const line = (n: number, x: number, bent: boolean, creep = 0, lift = 0) => {
    for (let i = 0; i < n; i++) {
      const w = makeFarmer(shirt(), bent), z = -hd + 4 + ((f.d - 8) * (i + 0.5)) / n, ph = rnd() * 6;
      add(w, x, z, PI2, lift);
      const pivot = w.getObjectByName('pivot')!;
      ticks.push((t) => {
        if (bent) pivot.rotation.x = 0.95 + Math.sin(t * 2 + ph) * 0.22;
        const xx = x + (creep ? ((t * creep) % 8) : 0) + Math.sin(t * 0.4 + ph) * 0.3;
        w.position.set(xx, gy(xx, z) + lift, z);
      });
    }
  };
  const bank = (): number => -hw - 4.5; // the lane on the low side, outside the bund

  switch (f.act) {
    case Act.plow: {
      const small = f.w < 62 || rnd() < 0.45;
      const m = small ? makeTiller() : makeTractor();
      if (!small) m.scale.setScalar(1.35); else m.scale.setScalar(1.3);
      g.add(m);
      shuttle(m, frontier + 2.2, small ? 1.6 : 3.2, 4, rnd());
      if (small) { const w = makeFarmer(shirt()); g.add(w); ticks.push(() => { w.position.copy(m.position); w.position.x -= 1.5 * Math.cos(m.rotation.y); w.position.z += 1.5 * Math.sin(m.rotation.y); w.rotation.y = m.rotation.y; }); }
      break;
    }
    case Act.harvestCombine: {
      const m = makeCombine();
      g.add(m);
      shuttle(m, frontier + 4.5, 2.4, 8, rnd());
      const reel = m.getObjectByName('reel');
      if (reel) ticks.push((t) => { reel.rotation.x = Math.PI / 2 + t * 3; });
      const tr = makeTractor(), tl = makeTrolley(0); tr.scale.setScalar(1.35);
      add(tr, bank(), -hd * 0.3, -PI2); add(tl, bank(), -hd * 0.3 - 4.4, -PI2);
      break;
    }
    case Act.harvestHand: {
      line(Math.max(5, Math.round(f.d / 9)), frontier + 0.6, true);
      const bundles = own(new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.32, 0.38), mat(0xd9b44a, 1, 0), 18)), d = new THREE.Object3D();
      for (let i = 0; i < 18; i++) { const x = -hw + 2 + rnd() * Math.max(1, frontier + hw - 4), z = -hd + 3 + rnd() * (f.d - 6); d.position.set(x, gy(x, z) + 0.2, z); d.rotation.set(0, rnd() * 3, 0); d.updateMatrix(); bundles.setMatrixAt(i, d.matrix); }
      g.add(bundles);
      break;
    }
    case Act.transplant: line(Math.max(6, Math.round(f.d / 8)), -hw + 8 + rnd() * f.w * 0.3, true, 0.18, -0.22); break;
    case Act.sow: for (let i = 0; i < 2; i++) { const w = makeFarmer(shirt()); g.add(w); shuttle(w, -hw + 10 + i * f.w * 0.35, 0.9, 5, rnd(), 4); } break;
    case Act.weed: {
      const n = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const w = makeFarmer(shirt(), true), x0 = -hw * 0.6 + rnd() * f.w * 0.6, z0 = -hd * 0.6 + rnd() * f.d * 0.6, ph = rnd() * 6, pv = w.getObjectByName('pivot')!;
        g.add(w);
        ticks.push((t) => { const x = x0 + Math.sin(t * 0.12 + ph) * 6, z = z0 + Math.cos(t * 0.1 + ph) * 6; w.position.set(x, gy(x, z), z); w.rotation.y = PI2; pv.rotation.x = 0.95 + Math.sin(t * 1.7 + ph) * 0.2; });
      }
      break;
    }
    case Act.irrigate: {
      const p = makePump();
      add(p, bank() + 1.2, 0, 0);
      const eng = p.getObjectByName('engine');
      if (eng) ticks.push((t) => { eng.position.y = 0.5 + Math.sin(t * 38) * 0.012; });
      const w = makeFarmer(shirt()); add(w, -hw + 5, 4, PI2);
      const stream = own(new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), new THREE.MeshStandardMaterial({ color: 0x6fb4d8, roughness: 0.1, transparent: true, opacity: 0.7 })));
      stream.rotation.x = -Math.PI / 2; add(stream, -hw - 1.5, 0, 0, 0.1);
      break;
    }
    case Act.spray: {
      const dr = makeDrone(); dr.scale.setScalar(1.6); g.add(dr);
      const cone = own(new THREE.Mesh(new THREE.ConeGeometry(3.2, 6, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide })));
      cone.rotation.x = Math.PI; cone.position.y = -3; dr.add(cone);
      const ph = rnd();
      ticks.push((t) => {
        const L = f.d - 10, k = (((t * 5) / L + ph) % 2 + 2) % 2, u = k < 1 ? k : 2 - k, z = -hd + 5 + u * L, x = Math.sin(t * 0.05 + ph * 6) * f.w * 0.32;
        dr.position.set(x, gy(x, z) + 7, z); dr.rotation.y = k < 1 ? 0 : Math.PI;
      });
      break;
    }
    case Act.pick: {
      const n = 3 + Math.floor(rnd() * 3), bent = c.cut === 'pick' && !c.id.match(/aam|kathal|lichu|komola|peyara|lebu|narikel|shupari|kola/);
      for (let i = 0; i < n; i++) {
        const w = makeFarmer(shirt(), bent), x0 = -hw * 0.6 + rnd() * f.w * 0.6, z0 = -hd * 0.6 + rnd() * f.d * 0.6, ph = rnd() * 6, pv = w.getObjectByName('pivot')!;
        g.add(w);
        ticks.push((t) => { const x = x0 + Math.sin(t * 0.1 + ph) * 7, z = z0 + Math.cos(t * 0.13 + ph) * 7; w.position.set(x, gy(x, z), z); w.rotation.y = Math.sin(t * 0.1 + ph) > 0 ? PI2 : -PI2; if (bent) pv.rotation.x = 0.7 + Math.sin(t * 1.5 + ph) * 0.2; });
      }
      for (let i = 0; i < 3; i++) add(makeCrate(c.fruit || 0xe53935), -hw - 2.2, -6 + i * 3.2, rnd() * 3);
      break;
    }
    case Act.thresh: {
      const mach = new THREE.Group();
      const b = own(new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.5, 1.7), mat(0x558b2f, 0.6, 0.3))); b.position.y = 1.1; mach.add(b);
      const hopper = own(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.9), mat(0x444a50, 0.6, 0.4))); hopper.position.set(-0.8, 2.1, 0); mach.add(hopper);
      add(mach, bank() - 0.5, 4, 0); add(makeStraw(), bank() - 0.5, -9, 0); add(makeSacks(6), bank() + 2.5, 11, 0.3);
      for (let i = 0; i < 3; i++) { const w = makeFarmer(shirt()), ph = rnd() * 6, x = bank() - 2.5 + i * 1.2, z = 4 + (i - 1) * 2.4; add(w, x, z, 0); ticks.push((t) => { w.position.y = gy(x, z) + Math.abs(Math.sin(t * 3 + ph)) * 0.06; }); }
      break;
    }
    case Act.haul: {
      const tr = makeTractor(), tl = makeTrolley(1); tr.scale.setScalar(1.35); g.add(tr, tl);
      const L = f.d - 20, ph = rnd();
      ticks.push((t) => {
        const k = (((t * 1.6) / L + ph) % 2 + 2) % 2, u = k < 1 ? k : 2 - k, z = -hd + 10 + u * L, dir = k < 1 ? 1 : -1, x = bank();
        tr.position.set(x, gy(x, z), z); tr.rotation.y = -PI2 * dir; tl.position.set(x, gy(x, z - 4.4 * dir), z - 4.4 * dir); tl.rotation.y = -PI2 * dir;
      });
      add(makeSacks(8), bank() + 3.2, hd * 0.55, 0);
      break;
    }
    case Act.graze: {
      const n = 3 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const cow = makeCow(i % 2), ph = rnd() * 6, x0 = (rnd() - 0.5) * f.w * 0.5, z0 = (rnd() - 0.5) * f.d * 0.5;
        g.add(cow);
        ticks.push((t) => {
          const a = t * 0.06 + ph, x = x0 + Math.sin(a) * 9, z = z0 + Math.cos(a * 1.3) * 7;
          cow.position.set(x, gy(x, z), z); cow.rotation.y = Math.atan2(Math.sin(a * 1.3) * 7 * 1.3, Math.cos(a) * 9); // heading of the path (front = +x)
        });
      }
      break;
    }
    default: break;
  }
  if (g.children.length === 0 && ticks.length === 0) return null;
  return { group: g, tick: (t) => { for (const fn of ticks) fn(t); } };
}

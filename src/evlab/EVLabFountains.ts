// EVLab campus: the fountains (jharna). Each one is a stone basin or pedestal plus a set of water jets. Building-local metres.
// Step 14: the water is real physics (EVLabFountainPhysics): drops fly as projectiles, are bent by a light breeze, land exactly at the water level and turn into a splash puff;
// the lead drop of each jet also throws small droplets and starts a ripple ring. ONE InstancedMesh holds every drop, splash puff and splash droplet of all fountains (a flat puff is
// just a squashed drop); the ripple rings are a second, tiny InstancedMesh (a ring needs another shape). No textures, ~2.2k instances in all.
import * as THREE from 'three';
import type { FountainDef } from './EVLabCampus';
import type { Parts } from './EVLabParts';
import {
  BASIN, SPRAY, buildJets, cycleOf, dropPose, fountainGeo, makeCycle, makePose, phaseOf, ringPose, sprayPose,
  type Cycle,
} from './EVLabFountainPhysics';

export interface FountainSet {
  group: THREE.Group;
  setNight(k: number): void;
  update(t: number): void;
  /** Number of drops (for the budget). */
  drops: number;
  /** Instances of the water InstancedMesh (drops + splash droplets) and of the ring InstancedMesh. */
  instances: number;
  rings: number;
}

/** Radius of one drop (m). */
const DROP_R = 0.17;
/** Splash droplets are smaller than drops. */
const SPRAY_SCALE = 0.45;

export function buildFountains(P: Parts, defs: readonly FountainDef[]): FountainSet {
  const { k, t } = P;
  const g = new THREE.Group();
  g.name = 'EVLabFountains';
  const marble = P.lit(t.marbleCream, 0xffffff, 0.3);
  const stone = P.lit(t.stone, 0xffffff, 0.15);
  // open shells (basin walls) are seen from both sides
  const marble2 = P.lit(t.marbleCream, 0xffffff, 0.3);
  marble2.side = THREE.DoubleSide;
  const water = k.own(new THREE.MeshPhongMaterial({ color: 0x2f86a6, specular: 0xbfe6ff, shininess: 120, transparent: true, opacity: 0.9 }));
  const shell = (rt: number, rb: number, h: number, x: number, y: number, z: number): void => {
    const geo = k.own(new THREE.CylinderGeometry(rt, rb, h, 40, 1, true));
    const m = new THREE.Mesh(geo, marble2);
    m.position.set(x, y, z);
    g.add(m);
  };
  for (const d of defs) {
    const f = fountainGeo(d);
    if (f.plaza) {
      // basin: floor slab, a thin wall (outer + inner shell), a flat rim on top, the water surface BASIN.water above the plaza floor (the old solid wall hid the water)
      const R = f.R;
      P.cyl(g, R + 0.3, R + 0.3, BASIN.floor, d.x, BASIN.floor / 2, d.z, marble, 40);
      shell(R + 0.3, R + 0.3, BASIN.rim, d.x, BASIN.rim / 2, d.z);
      shell(R - 0.7, R - 0.7, BASIN.rim - BASIN.floor, d.x, (BASIN.rim + BASIN.floor) / 2, d.z);
      const rimGeo = k.own(new THREE.RingGeometry(R - 0.7, R + 0.3, 40));
      const rim = new THREE.Mesh(rimGeo, marble2);
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(d.x, BASIN.rim, d.z);
      g.add(rim);
      P.cyl(g, R - 0.7, R - 0.7, 0.02, d.x, f.poolY - 0.01, d.z, water, 40); // water surface
      P.cyl(g, 1.6, 2.2, 1.4, d.x, 0.9, d.z, stone, 16); // central plinth (top = f.topY)
    } else {
      const top = d.y + 0.3;
      P.cyl(g, 3.2, 3.8, top + 4.4, d.x, (top - 4.4) / 2, d.z, stone, 20); // pedestal from the lake bed (y -4.4) to just above the water
      P.cyl(g, 3.5, 3.5, 0.5, d.x, d.y + 0.35, d.z, marble, 20); // marble disc (top = f.topY)
    }
  }

  // ---- the water
  const { jets, drops } = buildJets(defs);
  const sprayAt = drops; // first splash droplet in the InstancedMesh
  const total = drops + jets.length * SPRAY.n;
  const dropGeo = k.own(new THREE.SphereGeometry(DROP_R, 5, 4));
  const dropMat = k.own(new THREE.MeshBasicMaterial({ color: 0xd8efff, transparent: true, opacity: 0.8, depthWrite: false }));
  const mesh = new THREE.InstancedMesh(dropGeo, dropMat, total);
  mesh.frustumCulled = false;
  g.add(mesh);
  // ripple rings: two slots per jet (the ring of the last landing and the one before it can both still be visible)
  const RS = 2;
  const nRings = jets.length * RS;
  const ringGeo = k.own(new THREE.RingGeometry(0.88, 1, 28));
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = k.own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  const ringMesh = new THREE.InstancedMesh(ringGeo, ringMat, nRings);
  ringMesh.frustumCulled = false;
  ringMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nRings * 3), 3);
  g.add(ringMesh);

  // per-drop launch cache (recomputed only when a drop starts its next launch) and, for the lead drop, the launch before
  const cur: Cycle[] = Array.from({ length: drops }, makeCycle);
  const prev: Cycle[] = jets.map(() => makeCycle());
  const ph = { k: 0, u: 0 }, pose = makePose(), ring = { r: 0, a: 0 };
  const o = new THREE.Object3D();
  const col = new THREE.Color();
  const hide = (idx: number): void => { o.position.set(0, -50, 0); o.scale.setScalar(0); o.updateMatrix(); mesh.setMatrixAt(idx, o.matrix); };
  const day = new THREE.Color(0xd8efff), night = new THREE.Color(0xffefc4);
  const ringDay = new THREE.Color(0xffffff), ringNight = new THREE.Color(0xffe6b0);
  const ringBase = new THREE.Color(0xffffff);

  const update = (tt: number): void => {
    for (const j of jets) {
      for (let i = 0; i < j.m; i++) {
        const idx = j.first + i;
        phaseOf(j, j.ph + i / j.m, tt, ph);
        let c = cur[idx];
        if (c.k !== ph.k) c = cycleOf(j, i, ph.k, c);
        dropPose(j, c, ph.u, pose);
        if (pose.state === 2) { hide(idx); continue; }
        o.position.set(pose.x, pose.y, pose.z);
        if (pose.state === 0) {
          o.scale.setScalar(c.size * (0.8 + 0.5 * (1 - Math.abs(pose.f - 0.5) * 2)));
        } else {
          // splash puff: a flat disc that spreads and sinks
          const w = c.size * (1.1 + 2.4 * Math.sin(pose.f * Math.PI * 0.75)) * (1 - 0.35 * pose.f);
          o.scale.set(w, 0.3 * (1 - pose.f), w);
        }
        o.updateMatrix();
        mesh.setMatrixAt(idx, o.matrix);
      }
      // the lead drop (drop 0): splash droplets and ripple rings
      const c0 = cur[j.first];
      const cp = prev[j.id];
      const kk = c0.k;
      if (cp.k !== kk - 1) cycleOf(j, 0, kk - 1, cp);
      const age0 = tt - (c0.tl + c0.T), age1 = tt - (cp.tl + cp.T);
      for (let n = 0; n < SPRAY.n; n++) {
        const idx = sprayAt + j.id * SPRAY.n + n;
        if (sprayPose(j, c0, n, age0, pose) || sprayPose(j, cp, n, age1, pose)) {
          o.position.set(pose.x, pose.y, pose.z);
          o.scale.setScalar(SPRAY_SCALE * c0.size);
          o.updateMatrix();
          mesh.setMatrixAt(idx, o.matrix);
        } else hide(idx);
      }
      for (let s = 0; s < RS; s++) {
        const c = s === 0 ? c0 : cp, age = s === 0 ? age0 : age1;
        const idx = j.id * RS + s;
        // a ring that would run over the rim of a plaza basin is not drawn
        const room = j.poolR - Math.hypot(c.lx - j.cx, c.lz - j.cz);
        if (ringPose(c, age, ring) && ring.r < room) {
          o.position.set(c.lx, j.poolY + 0.03, c.lz);
          o.scale.setScalar(ring.r);
          col.copy(ringBase).multiplyScalar(ring.a);
          ringMesh.setColorAt(idx, col);
        } else {
          o.position.set(0, -50, 0);
          o.scale.setScalar(0);
          col.setScalar(0);
          ringMesh.setColorAt(idx, col);
        }
        o.updateMatrix();
        ringMesh.setMatrixAt(idx, o.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceMatrix.needsUpdate = true;
    if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
  };
  update(0);
  return {
    group: g, drops, instances: total, rings: nRings, update,
    setNight: (n) => { dropMat.color.copy(day).lerp(night, n); ringBase.copy(ringDay).lerp(ringNight, n); },
  };
}

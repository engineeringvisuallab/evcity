import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain';
import type { TerrainSample } from '../terrain/Lakes';
import { BUILT_UP_KINDS, getWorldZoneAt, type WorldZoneKind } from '../city/WorldZones';
import { mulberry32 } from '../world/Seed';
import { buildAnimal, buildFishGeometry, buildFishMaterial, type Rig, type Species } from './AnimalModel';

/**
 * Wildlife: deer herds, tigers and lions that hunt them, and schools of fish.
 *  - Animals live on dry, gentle, unbuilt land (farmland, forest, park, wetland, mountain foot) near the player and are
 *    removed when the player is far away; new ones appear in a ring around the player (only where the zone fits).
 *  - A predator (tiger / lion) gets hungry, stalks a deer, charges when close, pounces and eats. Deer graze in a loose herd,
 *    bolt away from predators (the whole herd runs when one deer sees danger) and from the player.
 *  - Predators keep away from the player: they never attack him (the player cannot die in this game anyway).
 *  - Fish are one InstancedMesh: schools swim under the water surface (rivers, lakes, sea), turn before the shore.
 * Added to the world root: positions are true world coordinates (the floating origin is handled by the root).
 */

type State = 'wander' | 'graze' | 'flee' | 'stalk' | 'chase' | 'attack' | 'eat' | 'rest' | 'dead';

interface Animal {
  sp: Species;
  rig: Rig;
  x: number; y: number; z: number;
  heading: number;
  speed: number;
  state: State;
  timer: number;
  tx: number; tz: number;
  retarget: number;
  target: Animal | null;
  stamina: number;
  hunger: number;
  phase: number;
  threatX: number; threatZ: number; calm: number;
  deadT: number;
  roll: number;
  pitch: number;
  neckDown: number;
  scale: number;
  seed: number;
  /** Fitness 0.8..1.02: young / old deer are slower and get caught more often. */
  fit: number;
  /** The pounce landed (decided at contact). */
  hit: boolean;
}

const ZONES: Record<Species, ReadonlySet<WorldZoneKind>> = {
  deer: new Set<WorldZoneKind>(['farmland', 'forest', 'park', 'wetland']),
  tiger: new Set<WorldZoneKind>(['forest', 'wetland', 'park', 'mountain', 'farmland']),
  lion: new Set<WorldZoneKind>(['farmland', 'park', 'forest', 'mountain']),
};
const SPEED = {
  deer: { walk: 1.5, run: 13.5 },
  tiger: { walk: 1.7, stalk: 2.6, run: 17 },
  lion: { walk: 1.7, stalk: 2.6, run: 17.5 },
};

const NEAR_MIN = 120; // new animals appear in this ring around the player (m)
const NEAR_MAX = 380;
const GONE = 700; // animals farther than this from the player are removed
const MAX_PREDATORS = 3;
const FISH_SCHOOLS = 10;
const FISH_PER = 12;

const WORLD_LIMIT = 4700;

export class AnimalManager {
  readonly animals: Animal[] = [];
  private rnd: () => number;
  private s: TerrainSample;
  private s2: TerrainSample;
  private spawnTimer = 0.2;
  private time = 0;

  // fish
  private fishGeo = buildFishGeometry();
  private uTime = { value: 0 };
  private fishMat = buildFishMaterial(this.uTime);
  private fishMesh: THREE.InstancedMesh;
  private schools: School[] = [];
  private dummy = new THREE.Object3D();
  private fishTimer = 0;

  /** Wildlife can be switched off (stats / debugging). */
  enabled = true;

  constructor(private root: THREE.Object3D, private terrain: TerrainGenerator, seed: number) {
    this.rnd = mulberry32(seed ^ 0x7a11d11f);
    this.s = terrain.makeSample();
    this.s2 = terrain.makeSample();
    const nFish = FISH_SCHOOLS * FISH_PER;
    this.fishMesh = new THREE.InstancedMesh(this.fishGeo, this.fishMat, nFish);
    this.fishMesh.frustumCulled = false;
    this.fishMesh.castShadow = false;
    this.fishMesh.count = 0;
    const palette = [0xb9c4cc, 0xc9a24a, 0x8aa07a, 0xd9602c, 0x7f8f9c, 0xe0d8c0];
    for (let i = 0; i < nFish; i++) this.fishMesh.setColorAt(i, new THREE.Color(palette[i % palette.length]).multiplyScalar(0.85 + this.rnd() * 0.3));
    root.add(this.fishMesh);
  }

  // ------------------------------------------------------------------ helpers

  private r(a: number, b: number): number { return a + (b - a) * this.rnd(); }

  /** Dry, gentle, unbuilt ground for this species? Fills this.s with the sample. */
  private okLand(sp: Species, x: number, z: number, strictZone = true): boolean {
    if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return false;
    const zone = getWorldZoneAt(x, z);
    if (zone.kind === 'sea' || BUILT_UP_KINDS.has(zone.kind)) return false;
    if (strictZone && !ZONES[sp].has(zone.kind)) return false;
    if (this.terrain.agro.contains(x, z, 12)) return false;
    const s = this.s;
    this.terrain.sample(x, z, s);
    if (!Number.isNaN(s.water) && s.h < s.water + 0.25) return false;
    if (s.h < 1.2) return false;
    return true;
  }

  private slopeOk(fromY: number, step: number): boolean {
    return Math.abs(this.s.h - fromY) / Math.max(step, 0.3) < 0.8;
  }

  // ------------------------------------------------------------------ spawning

  private make(sp: Species, x: number, z: number, heading: number): Animal {
    const seed = Math.floor(this.rnd() * 1e6);
    const rig = buildAnimal(sp, seed);
    const scale = sp === 'deer' ? this.r(0.9, 1.1) : this.r(0.95, 1.12);
    rig.group.scale.setScalar(scale);
    this.terrain.sample(x, z, this.s);
    const a: Animal = {
      sp, rig, x, y: this.s.h, z, heading, speed: 0, state: 'wander', timer: this.r(1, 4), tx: x, tz: z, retarget: 0, target: null,
      stamina: 7.5, hunger: this.r(5, 18), phase: this.rnd() * 6, threatX: 0, threatZ: 0, calm: 0, deadT: 0, roll: 0, pitch: 0, neckDown: 0, scale, seed, fit: this.r(0.8, 1.02), hit: false,
    };
    this.root.add(rig.group);
    this.animals.push(a);
    this.place(a);
    return a;
  }

  private remove(a: Animal): void {
    this.root.remove(a.rig.group);
    const i = this.animals.indexOf(a);
    if (i >= 0) this.animals.splice(i, 1);
    for (const o of this.animals) if (o.target === a) { o.target = null; if (o.state === 'stalk' || o.state === 'chase' || o.state === 'attack') this.setState(o, 'wander'); }
  }

  /** A herd of deer with one predator hunting in the neighbourhood, somewhere in the ring around the player. */
  private trySpawnCluster(px: number, pz: number): boolean {
    for (let attempt = 0; attempt < 24; attempt++) {
      const ang = this.rnd() * Math.PI * 2;
      const d = this.r(NEAR_MIN, NEAR_MAX);
      const cx = px + Math.cos(ang) * d, cz = pz + Math.sin(ang) * d;
      if (!this.okLand('deer', cx, cz)) continue;
      const kind = getWorldZoneAt(cx, cz).kind;
      const sp: Species = kind === 'forest' || kind === 'wetland' ? 'tiger' : kind === 'farmland' ? 'lion' : this.rnd() > 0.5 ? 'lion' : 'tiger';
      const pa = this.rnd() * Math.PI * 2, pd = this.r(70, 105);
      const qx = cx + Math.cos(pa) * pd, qz = cz + Math.sin(pa) * pd;
      if (!this.okLand(sp, qx, qz)) continue;
      const n = 4 + Math.floor(this.rnd() * 3);
      for (let i = 0; i < n; i++) {
        const dx = cx + this.r(-14, 14), dz = cz + this.r(-14, 14);
        if (this.okLand('deer', dx, dz)) this.make('deer', dx, dz, this.rnd() * 6.28);
      }
      const pr = this.make(sp, qx, qz, Math.atan2(cx - qx, cz - qz));
      pr.hunger = this.r(4, 14);
      return true;
    }
    return false;
  }

  private count(sp: Species): number {
    let n = 0;
    for (const a of this.animals) if (a.sp === sp && a.state !== 'dead') n++;
    return n;
  }

  // ------------------------------------------------------------------ movement

  private setState(a: Animal, st: State, timer = 0): void {
    a.state = st;
    a.timer = timer;
  }

  private turnTo(a: Animal, want: number, rate: number, dt: number): void {
    let d = want - a.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const m = rate * dt;
    a.heading += Math.max(-m, Math.min(m, d));
  }

  /** Walk / run along the current heading; stops (and turns away) at water, steep ground, towns, the sea. */
  private advance(a: Animal, speed: number, dt: number): void {
    const step = speed * dt;
    if (step <= 0) { a.speed = 0; return; }
    const nx = a.x + Math.sin(a.heading) * step, nz = a.z + Math.cos(a.heading) * step;
    if (this.okLand(a.sp, nx, nz, false) && this.slopeOk(a.y, step)) {
      a.x = nx; a.z = nz;
      a.y += (this.s.h - a.y) * Math.min(1, dt * 14);
      a.speed = speed;
    } else {
      // blocked: turn away and pick a new target on the next retarget
      a.heading += (this.rnd() > 0.5 ? 1 : -1) * this.r(1.2, 2.2);
      a.speed = 0;
      a.retarget = 0;
      if (a.state === 'flee') a.calm += 0.5;
    }
  }

  private dist(a: Animal, x: number, z: number): number { return Math.hypot(a.x - x, a.z - z); }

  private place(a: Animal): void {
    const g = a.rig.group;
    g.position.set(a.x, a.y, a.z);
    g.rotation.y = a.heading;
  }

  // ------------------------------------------------------------------ behaviours

  private wander(a: Animal, dt: number, px: number, pz: number, walk: number): void {
    a.retarget -= dt;
    const dp = this.dist(a, px, pz);
    if (a.retarget <= 0) {
      a.retarget = this.r(5, 11);
      if (dp < (a.sp === 'deer' ? 22 : 32)) { // keep away from the player
        const away = Math.atan2(a.x - px, a.z - pz);
        a.tx = a.x + Math.sin(away) * 40; a.tz = a.z + Math.cos(away) * 40;
      } else if (a.sp === 'deer') {
        // drift towards the middle of nearby herd mates
        let cx = 0, cz = 0, n = 0;
        for (const o of this.animals) if (o !== a && o.sp === 'deer' && o.state !== 'dead' && this.dist(o, a.x, a.z) < 45) { cx += o.x; cz += o.z; n++; }
        if (n > 0) { cx /= n; cz /= n; } else { cx = a.x; cz = a.z; }
        a.tx = cx + this.r(-14, 14); a.tz = cz + this.r(-14, 14);
        if (this.rnd() < 0.45) this.setState(a, 'graze', this.r(4, 10));
      } else {
        const ang = this.rnd() * 6.28, d = this.r(20, 60);
        a.tx = a.x + Math.cos(ang) * d; a.tz = a.z + Math.sin(ang) * d;
      }
    }
    const want = Math.atan2(a.tx - a.x, a.tz - a.z);
    this.turnTo(a, want, 1.6, dt);
    const far = this.dist(a, a.tx, a.tz);
    this.advance(a, far > 2 ? walk : 0, dt);
  }

  private updateDeer(a: Animal, dt: number, px: number, pz: number): void {
    // threat detection
    let tx = 0, tz = 0, threat = false, hard = false;
    for (const o of this.animals) {
      if (o.sp === 'deer' || o.state === 'dead') continue;
      const d = this.dist(a, o.x, o.z);
      const sight = o.state === 'chase' ? 110 : o.state === 'stalk' ? 19 : 14;
      if (d < sight) { threat = true; hard = true; tx = o.x; tz = o.z; break; }
    }
    const dp = this.dist(a, px, pz);
    if (!threat && dp < 28) { threat = true; tx = px; tz = pz; }
    if (threat && a.state !== 'flee') {
      this.setState(a, 'flee');
      a.calm = 0;
      if (hard) for (const o of this.animals) if (o !== a && o.sp === 'deer' && o.state !== 'dead' && o.state !== 'flee' && this.dist(o, a.x, a.z) < 45) { this.setState(o, 'flee'); o.threatX = tx; o.threatZ = tz; o.calm = 0; }
    }
    if (a.state === 'flee') {
      if (threat) { a.threatX = tx; a.threatZ = tz; a.calm = 0; } else a.calm += dt;
      const away = Math.atan2(a.x - a.threatX, a.z - a.threatZ) + Math.sin(this.time * 2.3 + a.seed) * 0.35; // zig-zag
      this.turnTo(a, away, 4.2, dt);
      this.advance(a, SPEED.deer.run * a.fit, dt);
      if (a.calm > 3.5) this.setState(a, 'wander');
      return;
    }
    if (a.state === 'graze') {
      a.timer -= dt;
      a.speed = 0;
      if (a.timer <= 0) this.setState(a, 'wander');
      return;
    }
    this.wander(a, dt, px, pz, SPEED.deer.walk);
  }

  private updatePredator(a: Animal, dt: number, px: number, pz: number): void {
    const S = SPEED[a.sp as 'tiger' | 'lion'];
    switch (a.state) {
      case 'wander': {
        a.hunger -= dt;
        a.stamina = Math.min(7.5, a.stamina + dt);
        this.wander(a, dt, px, pz, S.walk);
        if (a.hunger <= 0) {
          let best: Animal | null = null, bd = 120;
          for (const o of this.animals) {
            if (o.sp !== 'deer' || o.state === 'dead') continue;
            const d = this.dist(a, o.x, o.z);
            if (d < bd) { bd = d; best = o; }
          }
          if (best) { a.target = best; this.setState(a, 'stalk'); } else a.hunger = 8;
        }
        break;
      }
      case 'stalk': {
        const t = a.target;
        if (!t || t.state === 'dead') { this.setState(a, 'wander'); a.hunger = 6; break; }
        const d = this.dist(a, t.x, t.z);
        this.turnTo(a, Math.atan2(t.x - a.x, t.z - a.z), 2.4, dt);
        this.advance(a, S.stalk, dt);
        if (d < 24 || t.state === 'flee') { a.stamina = 7.5; this.setState(a, 'chase'); }
        if (d > 160) { this.setState(a, 'wander'); a.hunger = 10; }
        break;
      }
      case 'chase': {
        const t = a.target;
        if (!t || t.state === 'dead') { this.setState(a, 'wander'); a.hunger = 6; break; }
        const d = this.dist(a, t.x, t.z);
        a.stamina -= dt;
        // lead the prey a little
        const lead = Math.min(0.6, d / 30);
        const ax = t.x + Math.sin(t.heading) * t.speed * lead, az = t.z + Math.cos(t.heading) * t.speed * lead;
        this.turnTo(a, Math.atan2(ax - a.x, az - a.z), 5.5, dt);
        this.advance(a, S.run, dt);
        if (d < 2.8) {
          // contact: the pounce lands or the deer twists away
          a.hit = this.rnd() < 0.85;
          this.setState(a, 'attack', 0.7);
          a.speed = 0;
          if (a.hit) { this.setState(t, 'dead'); t.deadT = 0; t.speed = 0; t.heading = Math.atan2(a.x - t.x, a.z - t.z) + 1.2; }
          else { t.stamina = 0; }
        }
        else if (a.stamina <= 0 || d > 95) { this.setState(a, 'rest', this.r(7, 12)); a.target = null; a.hunger = this.r(15, 30); }
        break;
      }
      case 'attack': {
        const t = a.target;
        a.timer -= dt;
        a.speed = 0;
        if (t) this.turnTo(a, Math.atan2(t.x - a.x, t.z - a.z), 8, dt);
        if (a.timer <= 0) {
          if (a.hit && t && t.state === 'dead') {
            this.setState(a, 'eat', this.r(24, 40));
            a.x = t.x - Math.sin(t.heading) * 0.9; a.z = t.z - Math.cos(t.heading) * 0.9; // stand at the carcass
            a.heading = Math.atan2(t.x - a.x, t.z - a.z);
          } else {
            this.setState(a, 'rest', this.r(8, 14)); // the deer got away
            a.hunger = this.r(15, 30);
            a.target = null;
          }
        }
        break;
      }
      case 'eat': {
        a.timer -= dt;
        a.speed = 0;
        if (a.timer <= 0) { this.setState(a, 'wander'); a.hunger = this.r(60, 110); a.target = null; }
        break;
      }
      case 'rest': {
        a.timer -= dt;
        a.speed = 0;
        a.stamina = Math.min(7.5, a.stamina + dt * 1.2);
        if (a.timer <= 0) this.setState(a, 'wander');
        break;
      }
      default: this.setState(a, 'wander');
    }
  }

  // ------------------------------------------------------------------ pose

  private pose(a: Animal, dt: number): void {
    const rig = a.rig;
    const run = a.speed;
    const stride = Math.max(0.6, rig.length * 0.7 * a.scale);
    a.phase += (run / stride) * Math.PI * 2 * dt * 0.5;
    const gallop = run > 8;
    const moving = run > 0.15;
    const amp = moving ? Math.min(0.85, 0.25 + run * 0.055) : 0;
    const off = gallop ? [0, 0.35, Math.PI * 0.85, Math.PI * 1.15] : [0, Math.PI, Math.PI, 0];
    const crouch = a.state === 'stalk' ? 0.22 : a.state === 'attack' ? -0.1 : 0;
    for (let i = 0; i < 4; i++) {
      const sw = Math.sin(a.phase + off[i]);
      const swing = moving ? sw * amp : 0;
      rig.legs[i].rotation.x += (swing + (i < 2 ? -crouch : crouch) * 0.6 - rig.legs[i].rotation.x) * Math.min(1, dt * 16);
      const bend = moving ? Math.max(0, Math.cos(a.phase + off[i])) * amp * 1.2 : 0;
      rig.knees[i].rotation.x += (bend + crouch * 1.1 - rig.knees[i].rotation.x) * Math.min(1, dt * 16);
    }
    // body: bob while moving, crouch while stalking, pounce on attack, roll over when dead
    const bob = moving ? Math.abs(Math.sin(a.phase * 2)) * 0.03 * Math.min(1, run / 3) : 0;
    const lowered = crouch > 0 ? 0.32 : 0;
    rig.body.position.y += (rig.hipY + 0.2 + bob - lowered - rig.body.position.y) * Math.min(1, dt * 10);
    const gallopPitch = gallop ? Math.sin(a.phase * 2 + 1) * 0.07 : 0;
    const wantPitch = a.state === 'attack' ? -0.45 : gallopPitch;
    a.pitch += (wantPitch - a.pitch) * Math.min(1, dt * 12);
    rig.body.rotation.x = a.pitch;
    // head / neck
    const wantNeck = a.state === 'graze' || a.state === 'eat' ? 0.95 : a.state === 'stalk' ? 0.45 : a.state === 'chase' ? 0.15 : a.state === 'flee' ? -0.15 : 0.05;
    a.neckDown += (wantNeck - a.neckDown) * Math.min(1, dt * 6);
    rig.neck.rotation.x = a.neckDown;
    // tail
    rig.tail.rotation.y = Math.sin(this.time * (a.state === 'flee' ? 7 : 1.8) + a.seed) * (a.sp === 'deer' ? 0.12 : 0.4);
    rig.tail.rotation.x = a.sp === 'deer' ? (a.state === 'flee' ? -0.7 : 0) : a.state === 'chase' ? -0.3 : 0.2;
    // lying on the side when dead
    const wantRoll = a.state === 'dead' ? Math.PI / 2 : 0;
    a.roll += (wantRoll - a.roll) * Math.min(1, dt * 4);
    const g = rig.group;
    g.position.set(a.x, a.y + Math.sin(a.roll) * 0.28 * a.scale, a.z);
    g.rotation.y = a.heading;
    g.rotation.z = a.roll;
  }

  // ------------------------------------------------------------------ fish

  private spawnSchool(px: number, pz: number, sc: School): boolean {
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = this.rnd() * Math.PI * 2, d = this.r(12, 150);
      const x = px + Math.cos(ang) * d, z = pz + Math.sin(ang) * d;
      if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) continue;
      this.terrain.sample(x, z, this.s2);
      const s = this.s2;
      if (Number.isNaN(s.water)) continue;
      const depth = s.water - s.h;
      if (depth < 1.6) continue;
      sc.x = x; sc.z = z; sc.heading = this.rnd() * 6.28; sc.speed = this.r(0.8, 1.7);
      sc.depthFrac = this.r(0.18, 0.6);
      sc.size = this.r(0.28, 0.6) * (depth > 6 ? 1.5 : 1);
      sc.y = s.water - Math.min(depth * sc.depthFrac, 3.2) - 0.25;
      sc.alive = true;
      sc.timer = 0;
      return true;
    }
    return false;
  }

  private updateFish(dt: number, px: number, pz: number): void {
    this.fishTimer -= dt;
    const dummy = this.dummy;
    let idx = 0;
    for (const sc of this.schools) {
      if (!sc.alive) {
        if (this.fishTimer <= 0) this.spawnSchool(px, pz, sc);
        continue;
      }
      if (Math.hypot(sc.x - px, sc.z - pz) > 190) { sc.alive = false; continue; }
      // wander and turn well before the shore
      sc.timer -= dt;
      if (sc.timer <= 0) { sc.timer = this.r(2, 6); sc.turn = this.r(-0.7, 0.7); }
      sc.heading += sc.turn * dt;
      const ahead = 5 + sc.size * 8;
      const fx = sc.x + Math.sin(sc.heading) * ahead, fz = sc.z + Math.cos(sc.heading) * ahead;
      this.terrain.sample(fx, fz, this.s2);
      const s = this.s2;
      if (Number.isNaN(s.water) || s.water - s.h < 1.3) {
        sc.heading += 2.4 * dt * (sc.turn >= 0 ? 1 : -1) + 1.2 * dt;
        sc.speed = Math.max(0.5, sc.speed * 0.98);
      } else {
        sc.x += Math.sin(sc.heading) * sc.speed * dt;
        sc.z += Math.cos(sc.heading) * sc.speed * dt;
        sc.y += (s.water - Math.min((s.water - s.h) * sc.depthFrac, 3.2) - 0.25 - sc.y) * Math.min(1, dt * 2);
      }
      const t = this.time;
      for (let i = 0; i < sc.n; i++) {
        const o = sc.off[i];
        const lx = o.x + Math.sin(t * 0.7 + o.p) * 0.5, lz = o.z + Math.cos(t * 0.6 + o.p * 1.3) * 0.5;
        const c = Math.cos(sc.heading), sn = Math.sin(sc.heading);
        dummy.position.set(sc.x + lx * c + lz * sn, sc.y + o.y + Math.sin(t * 0.9 + o.p) * 0.12, sc.z - lx * sn + lz * c);
        dummy.rotation.set(0, sc.heading + Math.sin(t * 1.3 + o.p) * 0.18, 0);
        dummy.scale.setScalar(sc.size * o.k);
        dummy.updateMatrix();
        this.fishMesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
    if (this.fishTimer <= 0) this.fishTimer = 0.7;
    this.fishMesh.count = idx;
    this.fishMesh.instanceMatrix.needsUpdate = true;
    if (this.fishMesh.instanceColor) this.fishMesh.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------------ main update

  update(dt: number, time: number, playerWorld: THREE.Vector3): void {
    if (!this.enabled) return;
    dt = Math.min(dt, 0.1);
    this.time = time;
    this.uTime.value = time;
    const px = playerWorld.x, pz = playerWorld.z;

    // keep the population near the player
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.5;
      for (const a of this.animals.slice()) {
        if (this.dist(a, px, pz) > GONE) this.remove(a);
        else if (a.state === 'dead' && (a.deadT += 1.5) > 70) this.remove(a); // the carcass is gone after a while
      }
      const predators = this.count('tiger') + this.count('lion');
      if (predators < MAX_PREDATORS) this.trySpawnCluster(px, pz);
      else if (this.count('deer') < predators * 4) {
        // top the herds up with a few deer when too many were eaten
        for (let t = 0; t < 8; t++) {
          const ang = this.rnd() * Math.PI * 2, d = this.r(NEAR_MIN, NEAR_MAX);
          const x = px + Math.cos(ang) * d, z = pz + Math.sin(ang) * d;
          if (this.okLand('deer', x, z)) { for (let i = 0; i < 3; i++) if (this.okLand('deer', x + this.r(-10, 10), z + this.r(-10, 10))) this.make('deer', x + this.r(-10, 10), z + this.r(-10, 10), this.rnd() * 6.28); break; }
        }
      }
    }

    for (const a of this.animals) {
      if (a.state === 'dead') a.speed = 0;
      else if (a.sp === 'deer') this.updateDeer(a, dt, px, pz);
      else this.updatePredator(a, dt, px, pz);
      this.pose(a, dt);
    }

    if (this.schools.length === 0) for (let i = 0; i < FISH_SCHOOLS; i++) this.schools.push(newSchool(this.rnd, FISH_PER));
    this.updateFish(dt, px, pz);
  }

  /** Where wildlife is easy to find: the middle of the safari park. */
  get safariPark(): { x: number; z: number } { return { x: 3000, z: 1900 }; }

  /** Quick counts for the debug panel / tests. */
  stats(): { deer: number; tigers: number; lions: number; dead: number; fish: number } {
    let deer = 0, tigers = 0, lions = 0, dead = 0;
    for (const a of this.animals) {
      if (a.state === 'dead') dead++;
      else if (a.sp === 'deer') deer++;
      else if (a.sp === 'tiger') tigers++;
      else lions++;
    }
    return { deer, tigers, lions, dead, fish: this.fishMesh.count };
  }

  dispose(): void {
    for (const a of this.animals.slice()) this.remove(a);
    this.root.remove(this.fishMesh);
    this.fishMesh.dispose();
    this.fishGeo.dispose();
    this.fishMat.dispose();
  }
}

interface School {
  alive: boolean;
  x: number; y: number; z: number;
  heading: number; speed: number; turn: number; timer: number;
  size: number; depthFrac: number;
  n: number;
  off: { x: number; y: number; z: number; p: number; k: number }[];
}

function newSchool(rnd: () => number, n: number): School {
  const off: School['off'] = [];
  for (let i = 0; i < n; i++) off.push({ x: (rnd() - 0.5) * 3.2, y: (rnd() - 0.5) * 0.8, z: (rnd() - 0.5) * 4, p: rnd() * 6.28, k: 0.8 + rnd() * 0.4 });
  return { alive: false, x: 0, y: 0, z: 0, heading: 0, speed: 1, turn: 0, timer: 0, size: 0.4, depthFrac: 0.3, n, off };
}

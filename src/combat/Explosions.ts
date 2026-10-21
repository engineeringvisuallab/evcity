import * as THREE from 'three';
import type { PeopleManager } from '../people';
import type { TerrainGenerator } from '../terrain';
import type { Vehicle, VehicleManager } from '../vehicles';
import type { VehicleFx } from '../vehicles/VehicleFx';
import type { TreeDestruction } from '../vegetation/TreeDestruction';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { CombatEffects } from './CombatEffects';

interface Puff {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  alive: boolean;
  w: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  s0: number;
  s1: number;
  alpha: number;
  rise: number;
}

interface Piece {
  obj: THREE.Object3D;
  w: THREE.Vector3;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
  life: number;
  rest: boolean;
}

const SPHERE = new THREE.SphereGeometry(1, 7, 5);
const LOCAL = new THREE.Vector3();
const SCR = new THREE.Vector3();

export interface ExplosionDeps {
  scene: THREE.Scene;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  people: PeopleManager;
  vehicles: VehicleManager;
  effects: CombatEffects;
  /** Blasts fell the trees around them. */
  trees?: TreeDestruction;
  /** World position of the player's ears (for the loudness of bangs). */
  listener: (out: THREE.Vector3) => THREE.Vector3;
}

/**
 * Everything that blows up or breaks: area explosions (tank shells, helicopter bombs, burning vehicles), fire and smoke
 * puffs, and the pieces that fly off damaged vehicles (they tumble and bounce on the terrain, then disappear).
 * Pooled: nothing is created while playing except the objects handed in as pieces.
 */
export class Explosions implements VehicleFx {
  private smokes: Puff[] = [];
  private fires: Puff[] = [];
  private nextSmoke = 0;
  private nextFire = 0;
  private pieces: Piece[] = [];
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private lastBang = 0;

  constructor(private d: ExplosionDeps) {
    const make = (n: number, color: number, out: Puff[]) => {
      for (let i = 0; i < n; i++) {
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, fog: true });
        const mesh = new THREE.Mesh(SPHERE, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        d.scene.add(mesh);
        out.push({ mesh, mat, alive: false, w: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, s0: 1, s1: 1, alpha: 1, rise: 0 });
      }
    };
    make(110, 0x2b2b2b, this.smokes);
    make(70, 0xff8a1f, this.fires);
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  // ------------------------------------------------------------------ explosion
  /** Area blast at a WORLD point. `power` = damage to a person standing in the middle (falls off linearly to 0 at `radius`). */
  explode(at: THREE.Vector3, radius: number, power: number, byPlayer: boolean, ignore: Vehicle | null = null): void {
    const { people, vehicles, effects, origin } = this.d;
    origin.toLocal(at, LOCAL);
    effects.impact(LOCAL, 0xff8b28, 24);
    const big = Math.min(2.2, radius / 6);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = (3 + Math.random() * 7) * big;
      this.puff(this.fires, at, Math.cos(a) * sp, 2 + up * 7 * big, Math.sin(a) * sp, 0.45 + Math.random() * 0.4, (0.8 + Math.random()) * big, (2.2 + Math.random() * 1.6) * big, 0.95, 1.5);
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1 + Math.random() * 4) * big;
      this.puff(this.smokes, at, Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp, 1.8 + Math.random() * 1.6, (1 + Math.random()) * big, (3.5 + Math.random() * 2.5) * big, 0.7, 1.5);
    }
    this.bang(at, Math.min(2.2, 0.8 + radius / 8));
    if (radius >= 4) this.d.trees?.destroyInRadius(at.x, at.z, radius * 0.9, at.x, at.z);

    for (const p of people.onFoot) {
      if (p.dead) continue;
      const dist = Math.hypot(p.world.x - at.x, p.world.z - at.z);
      if (dist < radius && Math.abs(p.world.y - at.y) < radius * 0.6) people.damage(p, (1 - dist / radius) * power * 2.4, false, byPlayer);
    }
    for (const v of vehicles.vehicles) {
      if (v === ignore || !v.enabled || v.state === 'wrecked') continue;
      v.physWorld(SCR);
      const dx = SCR.x - at.x;
      const dz = SCR.z - at.z;
      const dist = Math.max(0.01, Math.hypot(dx, dz));
      const reach = radius + v.spec.half.z * 0.6;
      if (dist > reach) continue;
      const k = 1 - dist / reach;
      // Overpressure falls off much faster than linearly (about 1/r^2 in the far field), so a car at the edge of the
      // blast is only dented while one next to it is destroyed.
      v.blast(Math.pow(k, 1.6) * power * 1.1, byPlayer);
      // Delta-v = (pressure x frontal area x time) / mass: lighter vehicles are thrown further (~ mass^-1/3), a bigger
      // charge pushes harder (~ power^1/3). The push acts on the side facing the blast, so the vehicle also tips over.
      const lift = Math.min(1.8, Math.max(0.25, Math.cbrt(1250 / v.spec.mass)));
      const charge = power <= 0 ? 0 : Math.cbrt(power / 70);
      v.blastPush(dx / dist, dz / dist, 15 * k * k * lift * charge);
    }
  }

  // ------------------------------------------------------------------ VehicleFx
  smoke(at: THREE.Vector3, strength: number): void {
    this.puff(this.smokes, at, (Math.random() - 0.5) * 0.8, 1.6 + strength, (Math.random() - 0.5) * 0.8, 1.6 + Math.random() * strength, 0.35, 1.3 + strength * 0.5, strength > 1 ? 0.75 : 0.5, 0.6);
  }

  fire(at: THREE.Vector3): void {
    this.puff(this.fires, at, (Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2, 0.35 + Math.random() * 0.25, 0.45, 0.15, 0.9, 0.4);
  }

  crash(at: THREE.Vector3, dv: number): void {
    this.d.origin.toLocal(at, LOCAL);
    this.d.effects.impact(LOCAL, 0xffd27a, Math.min(12, 3 + Math.floor(dv)));
    if (dv > 3.5) this.bang(at, Math.min(0.9, dv / 14), true);
  }

  spawnPiece(obj: THREE.Object3D, velocity: THREE.Vector3, spin: THREE.Vector3, life = 30): void {
    obj.updateWorldMatrix(true, false);
    this.d.scene.attach(obj);
    const o = this.d.origin.origin;
    if (this.pieces.length >= 160) this.dropPiece(0);
    this.pieces.push({ obj, w: new THREE.Vector3(obj.position.x + o.x, obj.position.y, obj.position.z + o.z), v: velocity.clone(), spin: spin.clone(), age: 0, life, rest: false });
  }

  private dropPiece(i: number): void {
    this.pieces[i].obj.removeFromParent();
    this.pieces.splice(i, 1);
  }

  // ------------------------------------------------------------------ internals
  private puff(pool: Puff[], at: THREE.Vector3, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, alpha: number, rise: number): void {
    const p = pool[(pool === this.smokes ? this.nextSmoke++ : this.nextFire++) % pool.length];
    p.alive = true;
    p.w.copy(at);
    p.v.set(vx, vy, vz);
    p.life = p.max = life;
    p.s0 = s0;
    p.s1 = s1;
    p.alpha = alpha;
    p.rise = rise;
    p.mesh.visible = true;
  }

  private ensureAudio(): boolean {
    if (typeof AudioContext === 'undefined') return false;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      const n = Math.floor(this.ctx.sampleRate * 1.6);
      this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return true;
  }

  /** A low boom (explosion) or a short metal bang (crash). Quieter with distance. */
  private bang(at: THREE.Vector3, size: number, metal = false): void {
    if (this.muted || !this.ensureAudio() || !this.ctx || !this.master || !this.noise) return;
    const now = this.ctx.currentTime;
    if (now - this.lastBang < 0.05) return;
    this.lastBang = now;
    this.d.listener(SCR);
    const dist = Math.hypot(SCR.x - at.x, SCR.z - at.z);
    const vol = size / (1 + dist / 35);
    if (vol < 0.03) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = metal ? 'bandpass' : 'lowpass';
    f.frequency.setValueAtTime(metal ? 1800 : 900, now);
    if (!metal) f.frequency.exponentialRampToValueAtTime(70, now + 1.1);
    const g = this.ctx.createGain();
    const len = metal ? 0.18 : 1.1;
    g.gain.setValueAtTime(Math.min(1.4, vol), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + len);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(now);
    src.stop(now + len + 0.05);
    if (!metal) {
      const o = this.ctx.createOscillator();
      const og = this.ctx.createGain();
      o.frequency.setValueAtTime(90, now);
      o.frequency.exponentialRampToValueAtTime(28, now + 0.6);
      og.gain.setValueAtTime(Math.min(1, vol), now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      o.connect(og);
      og.connect(this.master);
      o.start(now);
      o.stop(now + 0.75);
    }
  }

  update(dt: number): void {
    const o = this.d.origin.origin;
    for (const pool of [this.smokes, this.fires]) {
      for (const p of pool) {
        if (!p.alive) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.alive = false;
          p.mesh.visible = false;
          continue;
        }
        p.v.y += p.rise * dt;
        p.v.multiplyScalar(Math.max(0, 1 - 1.3 * dt));
        p.w.addScaledVector(p.v, dt);
        const k = 1 - p.life / p.max;
        p.mesh.position.set(p.w.x - o.x, p.w.y, p.w.z - o.z);
        p.mesh.scale.setScalar(p.s0 + (p.s1 - p.s0) * k);
        p.mat.opacity = p.alpha * (1 - k) * (pool === this.fires ? 1 : Math.min(1, (1 - k) * 1.6));
      }
    }
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.age += dt;
      if (p.age > p.life) {
        this.dropPiece(i);
        continue;
      }
      if (!p.rest) {
        p.v.y -= 9.81 * dt;
        // air drag on a flat panel: a = -k |v| v (a thin bonnet slows down fast, a heavy part flies on)
        p.v.multiplyScalar(Math.max(0, 1 - 0.012 * p.v.length() * dt));
        p.w.addScaledVector(p.v, dt);
        p.obj.rotation.x += p.spin.x * dt;
        p.obj.rotation.y += p.spin.y * dt;
        p.obj.rotation.z += p.spin.z * dt;
        const gy = this.d.terrain.heightAt(p.w.x, p.w.z) + 0.15;
        if (p.w.y < gy) {
          p.w.y = gy;
          if (p.v.y < -1.2) {
            p.v.y *= -0.32;
            p.v.x *= 0.7;
            p.v.z *= 0.7;
            p.spin.multiplyScalar(0.6);
          } else {
            p.v.y = 0;
            p.v.x *= 1 - 3 * dt;
            p.v.z *= 1 - 3 * dt;
            p.spin.multiplyScalar(1 - 4 * dt);
            if (Math.hypot(p.v.x, p.v.z) < 0.15) p.rest = true;
          }
        }
      }
      p.obj.position.set(p.w.x - o.x, p.w.y, p.w.z - o.z);
      if (p.age > p.life - 2) p.obj.scale.multiplyScalar(1 - 1.6 * dt); // shrink away at the end
    }
  }

  dispose(): void {
    for (const p of [...this.smokes, ...this.fires]) {
      p.mesh.removeFromParent();
      p.mat.dispose();
    }
    for (const p of this.pieces) p.obj.removeFromParent();
    this.pieces.length = 0;
    void this.ctx?.close();
  }
}

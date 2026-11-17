import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain';
import { clamp } from '../utils/math';
import { mulberry32 } from '../world/Seed';
import { Q } from '../core/Quality';
import { createBirdGeometry, createBirdMaterial } from './BirdModel';

/**
 * flock  - a group wandering together (crows, egrets, swallows, doves, parrots)
 * soar   - one bird circling high on a thermal, wings almost still (kite, eagle)
 * dart   - one fast bird low over the ground with quick turns (kingfisher)
 * cruise - one bird on a calm straight flight with deep wingbeats (heron, hornbill)
 */
type Mode = 'flock' | 'soar' | 'dart' | 'cruise';

interface Kind {
  /** Also the model name (see BirdShapes.ts). */
  name: string;
  mode: Mode;
  count: [number, number];
  /** Height above the ground (m). */
  alt: [number, number];
  speed: [number, number];
  /** Wingspan in metres (a little bigger than life so they read from afar). */
  size: number;
  /** Flap rate (rad/s) and wing amplitude (fraction of the span at the tip). */
  rate: [number, number];
  amp: number;
  /** 0 = flaps all the time, 1 = mostly glides. */
  glide: number;
  /** Colour tints (multipliers) - every flock / bird picks one, so the same species is not one identical colour. */
  tints: [number, number, number][];
  /** Flock radius (m). */
  spread: number;
  /** Soaring circle radius (m). */
  radius?: [number, number];
  /** How strongly the bird banks into a turn. */
  bank: number;
}

const WHITE: [number, number, number] = [1, 1, 1];

const KINDS: Record<string, Kind> = {
  crow: { name: 'crow', mode: 'flock', count: [6, 12], alt: [30, 70], speed: [9, 12], size: 1.5, rate: [14, 17], amp: 0.34, glide: 0.35, tints: [WHITE, [1.12, 1.12, 1.15], [0.9, 0.9, 0.9]], spread: 14, bank: 2.4 },
  egret: { name: 'egret', mode: 'flock', count: [4, 8], alt: [40, 90], speed: [8, 10], size: 2.0, rate: [9, 11], amp: 0.3, glide: 0.45, tints: [WHITE, [0.97, 0.97, 0.95]], spread: 18, bank: 2.4 },
  swallow: { name: 'swallow', mode: 'flock', count: [10, 18], alt: [12, 35], speed: [13, 17], size: 0.8, rate: [30, 36], amp: 0.3, glide: 0.55, tints: [WHITE, [1.1, 1.1, 1.15], [0.92, 0.92, 0.95]], spread: 10, bank: 3.0 },
  dove: { name: 'dove', mode: 'flock', count: [8, 14], alt: [20, 50], speed: [10, 12], size: 1.1, rate: [20, 24], amp: 0.38, glide: 0.3, tints: [WHITE, [1.12, 0.98, 0.84], [1.12, 1.12, 1.12], [0.82, 0.82, 0.86]], spread: 12, bank: 2.4 },
  parrot: { name: 'parrot', mode: 'flock', count: [4, 8], alt: [18, 45], speed: [12, 15], size: 0.9, rate: [30, 36], amp: 0.3, glide: 0.1, tints: [WHITE, [1.05, 1.05, 0.9]], spread: 9, bank: 2.6 },
  kite: { name: 'kite', mode: 'soar', count: [1, 1], alt: [55, 110], speed: [9, 12], size: 2.0, rate: [8, 9], amp: 0.22, glide: 0.88, tints: [WHITE, [1.08, 1.0, 0.95], [0.92, 0.92, 0.92]], spread: 0, radius: [70, 150], bank: 4.5 },
  eagle: { name: 'eagle', mode: 'soar', count: [1, 1], alt: [75, 140], speed: [11, 14], size: 2.8, rate: [6, 7], amp: 0.2, glide: 0.93, tints: [WHITE, [0.95, 0.95, 0.98]], spread: 0, radius: [100, 200], bank: 4.0 },
  kingfisher: { name: 'kingfisher', mode: 'dart', count: [1, 1], alt: [10, 22], speed: [12, 15], size: 0.7, rate: [40, 48], amp: 0.28, glide: 0.3, tints: [WHITE, [0.94, 1.0, 1.06]], spread: 0, bank: 3.2 },
  heron: { name: 'heron', mode: 'cruise', count: [1, 1], alt: [20, 45], speed: [8, 10], size: 2.4, rate: [8, 9], amp: 0.28, glide: 0.4, tints: [WHITE, [0.94, 0.95, 0.97]], spread: 0, bank: 2.0 },
  hornbill: { name: 'hornbill', mode: 'cruise', count: [1, 1], alt: [30, 65], speed: [10, 12], size: 1.7, rate: [10, 12], amp: 0.3, glide: 0.5, tints: [WHITE], spread: 0, bank: 2.2 },
};
/** Flocks. The preset keeps the first ones: the first four hold the four classic kinds, the parrots come with the medium / high presets. */
const FLOCK_KINDS = ['crow', 'egret', 'swallow', 'dove', 'parrot', 'crow', 'swallow', 'egret', 'dove', 'parrot', 'crow', 'dove'];
/** Single birds. The preset keeps the first ones (low = 3, medium = 6, high = 9): every kind is there from the low preset on. */
const SOLO_KINDS = ['kite', 'kingfisher', 'eagle', 'heron', 'hornbill', 'kite', 'kingfisher', 'heron', 'hornbill'];

/** Birds wander inside this radius around the player; one that leaves it is moved to the far side. */
const NEAR = 850;
const FAR = 1300;

/** All birds of one species: one InstancedMesh, one draw call. */
interface ModelSet {
  name: string;
  count: number;
  bird: number[];
  colors: THREE.Color[];
  scales: number[];
  mesh: THREE.InstancedMesh | null;
  geo: THREE.BufferGeometry | null;
}

interface Slot {
  set: ModelSet;
  i: number;
}

interface Flock {
  kind: Kind;
  start: number;
  count: number;
  x: number;
  z: number;
  alt: number;
  baseAlt: number;
  heading: number;
  speed: number;
  turn: number;
  seed: number;
  /** Soaring circle radius (m). */
  radius: number;
  /** Per bird formation offset (x, y, z) in the flock frame + a personal phase. */
  off: Float32Array;
  phase: Float32Array;
}

/**
 * Flying birds: 10 species (crow, egret, swallow, dove, parrot in flocks; kite, eagle, kingfisher, heron, hornbill as single birds).
 * Every bird is a real shape (head, beak, eyes, tail, legs, feathered wings - see BirdShapes.ts) with its own plumage colour tint, size, flap rate and phase.
 * One InstancedMesh per species (10 draw calls at most); the wing flapping is done in the vertex shader.
 * A bird follows the terrain height (never flies into a hill), turns gently, banks into turns and pitches with climbs.
 * Added to the world root, so matrices use true world coordinates (the floating origin is handled by the root).
 */
export class BirdManager {
  private flocks: Flock[] = [];
  private sets = new Map<string, ModelSet>();
  private slots: Slot[] = [];
  private uTime = { value: 0 };
  private mat = createBirdMaterial(this.uTime);
  private dummy = new THREE.Object3D();
  private euler = new THREE.Euler();
  private rng: () => number;
  private placed = false;
  readonly total: number;

  constructor(
    private root: THREE.Object3D,
    private terrain: TerrainGenerator,
    seed: number,
  ) {
    this.rng = mulberry32(seed ^ 0x51ed270b);
    const r = this.rng;
    const between = (a: number, b: number) => a + (b - a) * r();

    // the list of flocks / single birds: the first Q.flockCount flocks + 3/4 as many single birds
    const names = FLOCK_KINDS.slice(0, Q.flockCount);
    names.push(...SOLO_KINDS.slice(0, Math.max(2, Math.round(Q.flockCount * 0.75))));

    let n = 0;
    for (const nm of names) {
      const kind = KINDS[nm];
      let set = this.sets.get(kind.name);
      if (!set) {
        set = { name: kind.name, count: 0, bird: [], colors: [], scales: [], mesh: null, geo: null };
        this.sets.set(kind.name, set);
      }
      const count = Math.round(between(kind.count[0], kind.count[1]));
      const off = new Float32Array(count * 3);
      const phase = new Float32Array(count);
      const tint = kind.tints[Math.floor(r() * kind.tints.length)];
      const start = n;
      for (let i = 0; i < count; i++) {
        if (kind.mode === 'flock') {
          const a = r() * Math.PI * 2;
          const rad = Math.sqrt(r()) * kind.spread;
          off[i * 3] = Math.cos(a) * rad;
          off[i * 3 + 1] = (r() - 0.5) * kind.spread * 0.4;
          off[i * 3 + 2] = Math.sin(a) * rad * 1.4;
        }
        phase[i] = r();
        const v = 0.9 + r() * 0.2; // every bird a little lighter / darker
        set.colors.push(new THREE.Color(tint[0] * v, tint[1] * v, tint[2] * v));
        set.scales.push(kind.size * (0.88 + r() * 0.24));
        set.bird.push(r() * 6.28, between(kind.rate[0], kind.rate[1]), kind.amp * (0.85 + r() * 0.3), kind.glide);
        this.slots.push({ set, i: set.count++ });
        n++;
      }
      this.flocks.push({
        kind, start, count, x: 0, z: 0, alt: 0, baseAlt: between(kind.alt[0], kind.alt[1]),
        heading: r() * Math.PI * 2, speed: between(kind.speed[0], kind.speed[1]), turn: 0, seed: r() * 100,
        radius: kind.radius ? between(kind.radius[0], kind.radius[1]) : 0, off, phase,
      });
    }
    this.total = n;

    for (const set of this.sets.values()) {
      const geo = createBirdGeometry(set.name);
      geo.setAttribute('aBird', new THREE.InstancedBufferAttribute(new Float32Array(set.bird), 4));
      const mesh = new THREE.InstancedMesh(geo, this.mat, set.count);
      mesh.frustumCulled = false; // the instances move all over the world; the geometry bounds say nothing
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      for (let i = 0; i < set.count; i++) {
        mesh.setColorAt(i, set.colors[i]);
        this.dummy.scale.setScalar(set.scales[i]);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      }
      set.mesh = mesh;
      set.geo = geo;
      root.add(mesh);
    }
  }

  /** Put a flock / bird on a ring around the player, heading roughly across the player's area. */
  private place(f: Flock, fx: number, fz: number, ring: [number, number]): void {
    const a = this.rng() * Math.PI * 2;
    const d = ring[0] + (ring[1] - ring[0]) * this.rng();
    f.x = fx + Math.cos(a) * d;
    f.z = fz + Math.sin(a) * d;
    // face towards the player +- 70 degrees so the flock passes over
    f.heading = Math.atan2(fx - f.x, fz - f.z) + (this.rng() - 0.5) * 2.4;
    f.alt = this.ground(f.x, f.z, f.heading) + f.baseAlt;
  }

  private ground(x: number, z: number, heading: number): number {
    const t = this.terrain;
    // highest ground under the flock and 50 / 110 / 180 m ahead (the flock climbs before the hill arrives)
    const sx = Math.sin(heading);
    const cz = Math.cos(heading);
    let h = Math.max(t.heightAt(x, z), 0);
    for (const a of [50, 110, 180]) h = Math.max(h, t.heightAt(x + sx * a, z + cz * a));
    return h;
  }

  /** Every frame. `focus` = true world position of the player / camera. */
  update(dt: number, time: number, focus: THREE.Vector3): void {
    this.uTime.value = time;
    if (!this.placed) {
      this.placed = true;
      for (const f of this.flocks) this.place(f, focus.x, focus.z, [60, NEAR]);
    }
    const d = this.dummy;
    const e = this.euler;
    const step = Math.min(dt, 0.1);
    for (const f of this.flocks) {
      const k = f.kind;
      // --- motion: each flight style has its own way of turning ---
      let turn: number;
      switch (k.mode) {
        case 'soar': // circles on a thermal, now left now right, with a short straight glide in between
          turn = (f.speed / f.radius) * Math.tanh(3 * Math.sin(time * 0.045 + f.seed));
          break;
        case 'dart': // quick darting turns
          turn = Math.sin(time * 0.55 + f.seed * 7) * 0.32 + Math.sin(time * 1.45 + f.seed * 3) * 0.22;
          break;
        case 'cruise': // calm, nearly straight
          turn = Math.sin(time * 0.11 + f.seed * 7) * 0.07 + Math.sin(time * 0.27 + f.seed * 3) * 0.05;
          break;
        default: // flock: gentle wander
          turn = Math.sin(time * 0.13 + f.seed * 7) * 0.1 + Math.sin(time * 0.31 + f.seed * 3) * 0.06;
      }
      const dx = focus.x - f.x;
      const dz = focus.z - f.z;
      const dist = Math.hypot(dx, dz);
      if (dist > NEAR) { // pulled back towards the player when it strays
        const want = Math.atan2(dx, dz);
        const diff = Math.atan2(Math.sin(want - f.heading), Math.cos(want - f.heading));
        turn += clamp(diff, -1, 1) * 0.35;
      }
      f.turn += (turn - f.turn) * Math.min(1, step * 1.5);
      f.heading += f.turn * step;
      f.x += Math.sin(f.heading) * f.speed * step;
      f.z += Math.cos(f.heading) * f.speed * step;
      if (dist > FAR) this.place(f, focus.x, focus.z, [NEAR * 0.8, NEAR]);

      // --- height: follow the terrain with a smooth climb / descent (soaring birds also ride the thermals up and down) ---
      const base = k.mode === 'soar' ? f.baseAlt + Math.sin(time * 0.05 + f.seed * 3) * 12 : f.baseAlt;
      const target = this.ground(f.x, f.z, f.heading) + base;
      const prevAlt = f.alt;
      f.alt += (target - f.alt) * (1 - Math.exp(-(target > f.alt ? 2.2 : 0.6) * step)); // climbs fast, descends lazily
      const vy = step > 0 ? (f.alt - prevAlt) / step : 0;
      const pitch = clamp(Math.atan2(vy, f.speed), -0.45, 0.45);
      const bank = clamp(-f.turn * k.bank, -0.75, 0.75);
      const ch = Math.cos(f.heading);
      const sh = Math.sin(f.heading);
      const single = f.count === 1;

      for (let i = 0; i < f.count; i++) {
        const p = f.phase[i] * 6.2832;
        const lx = f.off[i * 3] + Math.sin(time * 0.6 + p) * (single ? 0.4 : 1.6);
        const ly = f.off[i * 3 + 1] + Math.sin(time * 0.9 + p * 1.7) * (single ? 0.5 : 0.8);
        const lz = f.off[i * 3 + 2] + Math.sin(time * 0.4 + p * 1.3) * (single ? 0.6 : 2.2);
        d.position.set(f.x + lx * ch + lz * sh, f.alt + ly, f.z - lx * sh + lz * ch);
        e.set(-pitch, f.heading + Math.sin(time * 0.8 + p) * 0.08, bank + Math.sin(time * 1.1 + p * 2) * 0.08, 'YXZ');
        d.quaternion.setFromEuler(e);
        const slot = this.slots[f.start + i];
        d.scale.setScalar(slot.set.scales[slot.i]);
        d.updateMatrix();
        slot.set.mesh!.setMatrixAt(slot.i, d.matrix);
      }
    }
    for (const set of this.sets.values()) set.mesh!.instanceMatrix.needsUpdate = true;
  }

  /** For tests / debug: world position of bird i. */
  positionOf(i: number, out: THREE.Vector3): THREE.Vector3 {
    const s = this.slots[i];
    s.set.mesh!.getMatrixAt(s.i, this.dummy.matrix);
    return out.setFromMatrixPosition(this.dummy.matrix);
  }

  /** For tests / debug: species name of bird i. */
  kindOf(i: number): string {
    return this.slots[i].set.name;
  }

  /** Flocks plus single birds. */
  get flockCount(): number {
    return this.flocks.length;
  }

  /** Number of single birds (kite, eagle, kingfisher, heron, hornbill). */
  get soloCount(): number {
    return this.flocks.filter((f) => f.count === 1).length;
  }

  /** Number of species (= instanced draw calls). */
  get speciesCount(): number {
    return this.sets.size;
  }

  dispose(): void {
    for (const set of this.sets.values()) {
      if (set.mesh) {
        this.root.remove(set.mesh);
        set.mesh.dispose();
      }
      set.geo?.dispose();
    }
    this.mat.dispose();
  }
}

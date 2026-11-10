import * as THREE from 'three';
import type { MissionPin } from '../missions/MissionTypes';
import type { RoadGraph } from '../traffic/RoadGraph';
import { buildRaceCourse, type RaceCourse, type RacePoint } from './RaceCourse';

/**
 * CAR RACE (outer freeway, north -> west).
 *  - A green marker stands at the start (north). Go there and press Enter: you get a Jeep (the race car) and the countdown begins.
 *  - Circles lie on the road every ~1 km. You MUST drive through each one, in order: the next circle (yellow) is the only one that counts,
 *    and the finish (west end) opens only after the last circle. Miss one = turn round and touch it.
 *  - Get out of the Jeep or wreck it and the race is cancelled. The race Jeep never runs out of fuel.
 *  - 5 AI racers (spawned by the Engine / TrafficManager) start beside you and drive the same way; the first one at the finish wins. The HUD shows your position.
 * Drawing + rules only; the Engine gives the player's state each frame and spawns the Jeep (`deps.begin`).
 */

export interface RaceDeps {
  parent: HTMLElement;
  /** The group the floating origin moves (absolute world coordinates inside it). */
  root: THREE.Object3D;
  graph: RoadGraph;
  toast: (text: string, ms?: number) => void;
  /** Put the player in the race Jeep at the start line and set the AI racers on the grid. False = it could not be done (the Engine says why). */
  begin: (course: RaceCourse) => boolean;
  /** The countdown is over: the racers may drive. */
  go: () => void;
  /** The race is over or cancelled: the racers leave. */
  clear: () => void;
}

export interface RaceFrame {
  /** What the player controls (on foot or in a vehicle), world metres. */
  x: number;
  z: number;
  /** Enter was pressed this frame (and the game is not in a menu). */
  enter: boolean;
  /** The player sits in the race Jeep and it is not wrecked. */
  inRaceJeep: boolean;
  /** Where the AI racers are (the same order every frame). */
  racers: readonly { x: number; z: number }[];
}

type Phase = 'idle' | 'countdown' | 'running' | 'done';

const START_RADIUS = 30; // m: "at the start" (Enter works inside it)
const CP_RADIUS = 10; // m: a circle on the road
const FINISH_RADIUS = 14;
const COUNTDOWN = 3.5; // s
const COL_NEXT = 0xffd23a;
const COL_LATER = 0x35c8ff;
const COL_FINISH = 0xff4a4a;
const COL_START = 0x22e06a;

interface Ring {
  group: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  beam: THREE.Mesh;
}

export class RaceSystem {
  private course: RaceCourse | null;
  private group = new THREE.Group();
  private rings: Ring[] = [];
  private startMark = new THREE.Group();
  private geoRing: THREE.RingGeometry;
  private geoRingFinish: THREE.RingGeometry;
  private geoBeam: THREE.CylinderGeometry;
  private geoPost: THREE.CylinderGeometry;
  private mats: THREE.MeshBasicMaterial[] = [];
  private hud: HTMLDivElement;
  private prompt: HTMLDivElement;
  private phase: Phase = 'idle';
  private next = 0;
  private clock = 0; // s since GO
  private count = 0; // countdown seconds left
  private doneFor = 0;
  private best = Infinity;
  private t = 0;
  private px = 0;
  private pz = 0;
  private hasPrev = false;
  private lastDist = 0;
  /** Course distance (m) at each checkpoint (chords) and in total: `remaining()` = how far a car still has to go. */
  private cum: number[] = [];
  private total = 0;
  private rPrev: { x: number; z: number }[] = [];
  private rDone: boolean[] = [];
  private finishedCount = 0;

  constructor(private d: RaceDeps) {
    this.course = buildRaceCourse(d.graph);
    if (!this.course) console.warn('[race] outer freeway F1/F2/F3 not found: no race');
    this.group.name = 'race';
    this.geoRing = new THREE.RingGeometry(CP_RADIUS - 1.3, CP_RADIUS, 56);
    this.geoRing.rotateX(-Math.PI / 2);
    this.geoRingFinish = new THREE.RingGeometry(FINISH_RADIUS - 2.2, FINISH_RADIUS, 64);
    this.geoRingFinish.rotateX(-Math.PI / 2);
    this.geoBeam = new THREE.CylinderGeometry(0.35, 0.35, 45, 10);
    this.geoPost = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 24);

    const c = this.course;
    if (c) {
      let px = c.start.x;
      let pz = c.start.z;
      let acc = 0;
      for (const q of c.checkpoints) {
        acc += Math.hypot(q.x - px, q.z - pz);
        this.cum.push(acc);
        px = q.x;
        pz = q.z;
      }
      this.total = acc;
      const mk = (p: RacePoint, finish: boolean): Ring => {
        const mat = this.mat(COL_LATER, finish ? 0.95 : 0.8);
        const g = new THREE.Group();
        g.position.set(p.x, p.y + 0.25, p.z);
        const ring = new THREE.Mesh(finish ? this.geoRingFinish : this.geoRing, mat);
        ring.renderOrder = 7;
        ring.frustumCulled = false;
        g.add(ring);
        const beam = new THREE.Mesh(this.geoBeam, mat);
        beam.position.y = 22;
        beam.renderOrder = 7;
        beam.frustumCulled = false;
        g.add(beam);
        g.visible = false;
        this.group.add(g);
        return { group: g, mat, beam };
      };
      c.checkpoints.forEach((p, i) => this.rings.push(mk(p, i === c.checkpoints.length - 1)));
      // the start marker: a ring on the road + the same small green post as the mission places
      const sm = this.mat(COL_START, 0.9);
      this.startMark.position.set(c.start.x, c.start.y + 0.25, c.start.z);
      const sr = new THREE.Mesh(this.geoRing, sm);
      sr.renderOrder = 7;
      sr.frustumCulled = false;
      this.startMark.add(sr);
      const post = new THREE.Mesh(this.geoPost, sm);
      post.position.y = 0.75;
      post.renderOrder = 7;
      post.frustumCulled = false;
      this.startMark.add(post);
      this.group.add(this.startMark);
    }
    d.root.add(this.group);

    const box = (css: string): HTMLDivElement => {
      const el = document.createElement('div');
      el.style.cssText = `position:fixed;left:50%;transform:translateX(-50%);z-index:30;pointer-events:none;display:none;padding:8px 16px;border-radius:10px;background:rgba(10,14,20,0.62);color:#fff;font:600 17px/1.35 system-ui,sans-serif;text-align:center;text-shadow:0 1px 2px #000;${css}`;
      d.parent.appendChild(el);
      return el;
    };
    this.hud = box('top:92px;');
    this.prompt = box('bottom:22%;');
  }

  private mat(color: number, opacity: number): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    this.mats.push(m);
    return m;
  }

  /** The race is on (countdown or running): the Engine keeps the Jeep fuelled. */
  get active(): boolean {
    return this.phase === 'countdown' || this.phase === 'running';
  }

  get available(): boolean {
    return this.course !== null;
  }

  /** Metres a car at (x, z) still has to go to the finish (the course is a chain of circles 1 km apart: the nearest link decides). */
  remaining(x: number, z: number): number {
    const c = this.course;
    if (!c) return 0;
    let best = Infinity;
    for (let k = 0; k < c.checkpoints.length; k++) {
      const d = Math.hypot(x - c.checkpoints[k].x, z - c.checkpoints[k].z) + (this.total - this.cum[k]);
      if (d < best) best = d;
    }
    return best;
  }

  /** Minimap pins: the start while idle, the next circle while racing. */
  pins(): MissionPin[] {
    const c = this.course;
    if (!c) return [];
    if (this.phase === 'idle' || this.phase === 'done') return [{ id: 'race-start', x: c.start.x, z: c.start.z, kind: 'field', active: false, done: false }];
    const p = c.checkpoints[Math.min(this.next, c.checkpoints.length - 1)];
    return [{ id: 'race-next', x: p.x, z: p.z, kind: 'field', active: true, done: false, distance: this.lastDist }];
  }

  update(dt: number, f: RaceFrame): void {
    const c = this.course;
    if (!c) return;
    this.t += dt;
    const nearStart = Math.hypot(f.x - c.start.x, f.z - c.start.z) < START_RADIUS;

    if (this.phase === 'idle' || this.phase === 'done') {
      if (this.phase === 'done') {
        this.doneFor += dt;
        if (this.doneFor > 9) {
          this.phase = 'idle';
          this.hud.style.display = 'none';
          this.d.clear();
        }
      }
      this.startMark.visible = true;
      this.startMark.scale.setScalar(1 + 0.06 * Math.sin(this.t * 3));
      const show = nearStart && this.phase === 'idle';
      this.prompt.style.display = show ? 'block' : 'none';
      if (show) {
        this.prompt.innerHTML = `CAR RACE · outer freeway, north → west (${(c.length / 1000).toFixed(1)} km)<br>Press <b>Enter</b> to start · you drive the race Jeep` + (this.best < Infinity ? `<br>Best: ${fmt(this.best)}` : '');
        if (f.enter && this.d.begin(c)) this.startCountdown(f);
      }
      return;
    }

    // ---- countdown / running ----
    this.prompt.style.display = 'none';
    this.startMark.visible = false;
    if (!f.inRaceJeep) {
      this.cancel('Race cancelled: you left the Jeep (or it was wrecked).');
      return;
    }
    if (this.phase === 'countdown') {
      this.count -= dt;
      const n = Math.ceil(this.count);
      this.hud.style.display = 'block';
      this.hud.innerHTML = n > 0 ? `<span style="font-size:34px">${n}</span>` : '<span style="font-size:34px;color:#7dffa6">GO!</span>';
      if (this.count <= 0) {
        this.phase = 'running';
        this.clock = 0;
        this.hasPrev = false;
        this.d.go();
      }
      this.showRings();
      return;
    }

    this.clock += dt;
    // the AI racers: whoever drives through the finish circle first has won
    const fin = c.checkpoints[c.checkpoints.length - 1];
    for (let i = 0; i < f.racers.length; i++) {
      const r = f.racers[i];
      const a = this.rPrev[i] ?? r;
      if (!this.rDone[i] && segDist(a.x, a.z, r.x, r.z, fin.x, fin.z) <= FINISH_RADIUS) {
        this.rDone[i] = true;
        this.finishedCount++;
      }
      this.rPrev[i] = { x: r.x, z: r.z };
    }
    const target = c.checkpoints[this.next];
    const last = this.next === c.checkpoints.length - 1;
    this.lastDist = Math.hypot(f.x - target.x, f.z - target.z);
    // the car may cross a circle between two frames: test the whole step, not only the new point
    const ax = this.hasPrev ? this.px : f.x;
    const az = this.hasPrev ? this.pz : f.z;
    const hit = segDist(ax, az, f.x, f.z, target.x, target.z) <= (last ? FINISH_RADIUS : CP_RADIUS);
    this.px = f.x;
    this.pz = f.z;
    this.hasPrev = true;
    if (hit) {
      if (last) {
        this.finish(f.racers.length + 1);
        return;
      }
      this.next++;
      this.d.toast(`Checkpoint ${this.next}/${c.checkpoints.length - 1}  ·  ${fmt(this.clock)}`, 1600);
      this.showRings();
    }
    this.hud.style.display = 'block';
    const cps = c.checkpoints.length - 1;
    // position: racers that are already at the finish, or that still have less to go than the player
    const mine = this.remaining(f.x, f.z);
    let rank = 1;
    for (let i = 0; i < f.racers.length; i++) if (this.rDone[i] || this.remaining(f.racers[i].x, f.racers[i].z) < mine) rank++;
    this.hud.innerHTML = `<span style="font-size:22px">${fmt(this.clock)}</span> · Position <b>${rank}/${f.racers.length + 1}</b><br>` + (last ? 'FINISH: drive through the red circle' : `Checkpoint ${this.next + 1}/${cps} (yellow circle)`) + ` · ${Math.round(this.lastDist)} m`;
    // the next circle pulses
    const r = this.rings[this.next];
    if (r) r.mat.opacity = 0.7 + 0.3 * Math.sin(this.t * 6);
  }

  private startCountdown(f: RaceFrame): void {
    this.rPrev = f.racers.map((r) => ({ x: r.x, z: r.z }));
    this.rDone = f.racers.map(() => false);
    this.finishedCount = 0;
    this.phase = 'countdown';
    this.count = COUNTDOWN;
    this.next = 0;
    this.clock = 0;
    this.hasPrev = false;
    this.showRings();
  }

  /** Only the next circle (yellow) and the one after it (blue) are drawn; passed ones disappear. */
  private showRings(): void {
    this.rings.forEach((r, i) => {
      const cur = i === this.next;
      r.group.visible = i >= this.next && i <= this.next + 1;
      const fin = i === this.rings.length - 1;
      r.mat.color.setHex(fin ? COL_FINISH : cur ? COL_NEXT : COL_LATER);
      r.mat.opacity = cur ? 0.95 : 0.55;
      r.beam.visible = cur;
    });
  }

  private hideRings(): void {
    for (const r of this.rings) r.group.visible = false;
  }

  private finish(field: number): void {
    const time = this.clock;
    const place = this.finishedCount + 1; // everybody who was at the finish before you is ahead of you
    const rec = time < this.best;
    if (rec) this.best = time;
    this.phase = 'done';
    this.doneFor = 0;
    this.hideRings();
    this.hud.style.display = 'block';
    this.hud.innerHTML = `<span style="font-size:24px">${place === 1 ? 'YOU WIN!' : 'FINISH!'}</span><br>Position <b>${place}/${field}</b> · Time ${fmt(time)}` + (rec ? ' · new best' : ` · best ${fmt(this.best)}`);
    this.d.toast(`Race finished: position ${place}/${field}  ·  ${fmt(time)}`, 4500);
  }

  private cancel(msg: string): void {
    this.phase = 'idle';
    this.hideRings();
    this.hud.style.display = 'none';
    this.d.clear();
    this.d.toast(msg, 3400);
  }

  dispose(): void {
    this.d.clear();
    this.group.removeFromParent();
    this.geoRing.dispose();
    this.geoRingFinish.dispose();
    this.geoBeam.dispose();
    this.geoPost.dispose();
    for (const m of this.mats) m.dispose();
    this.hud.remove();
    this.prompt.remove();
  }
}

/** Distance from point (px, pz) to the segment a -> b. */
function segDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const u = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(ax + u * dx - px, az + u * dz - pz);
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}

// EVLab Tower: the audience of the Presentation Hall. Step 5: real people (head, hair, torso, arms with elbows, legs with knees, feet) who walk in
// through the three doors one after the other, climb down the aisles, sidestep along the row and sit down facing the stage.
// Step 6: when the mission ends everybody gets up (one after the other), walks the way in backwards through the doors and is gone; a new mission fills the hall again.
// 8 instanced meshes = 8 draw calls for the whole crowd. The routes and timing are in EVLabAudiencePath (pure maths).
// Only people on the move, and (while the crowd claps / listens) the seated ones, are re-posed; a hall of people sitting still costs nothing.
import * as THREE from 'three';
import { mulberry32 } from '../structures';
import type { Parts } from './EVLabParts';
import { leftAt, planPerson, sample, sampleLeave, seatedAt, SEAT_SETBACK, type Plan, type Sample, type Seat } from './EVLabAudiencePath';

export type Mood = 'idle' | 'listen' | 'clap' | 'ovation';
export type { Seat };
export interface AudienceBuild {
  group: THREE.Group;
  /** People of the crowd (planned) / seats in the hall. */
  peopleCount: number;
  seatCount: number;
  /** How many have come in so far / how many sit already (both 0 while the hall is empty). */
  readonly arrived: number;
  readonly seated: number;
  /** The hall is empty by default: people are shown only while a presentation mission runs. */
  readonly present: boolean;
  /** True while the people are leaving (after dismiss(), until the last one is out of the hall). */
  readonly leaving: boolean;
  setPresent(on: boolean): void;
  /** Step 6: the mission is over: people get up and leave through the doors; the crowd hides itself when the last one is out. */
  dismiss(): void;
  setMood(m: Mood): void;
  update(dt: number, t: number): void;
}

const SKIN = [0xf1c9a5, 0xd9a37a, 0xb97a52, 0x8a5636, 0x5e3a24];
const CLOTH = [0x2b4a7a, 0x7a2b3a, 0x2f6a4a, 0x3a3a44, 0x8a6a2b, 0x5a3a7a, 0xcfcfd4, 0x1f5f7a];
const TROUSER = [0x23262e, 0x2f3646, 0x4a4234, 0x1d2a3d, 0x3b3b3b, 0x5a5048];
const HAIR = [0x15110e, 0x2a1d14, 0x4a3320, 0x7a5a36, 0x9c9c9c, 0x0d0d0d];

// body measures (m): standing height ~1.8 m; sitting, the thigh rests on the 0.51 m seat cushion
const THIGH = 0.44, SHIN = 0.55, TORSO = 0.56, UARM = 0.3, FARM = 0.28;
const STAND_FWD = 0.4; // standing up for the ovation, people step forward out of the seat
const HALF_PI = Math.PI / 2;
const smooth = (a: number): number => a * a * (3 - 2 * a);

export function buildAudience(P: Parts, seats: readonly Seat[], fill = 0.62): AudienceBuild {
  const { k } = P;
  const g = new THREE.Group();
  g.name = 'EVLabAudience';
  g.visible = false; // nobody sits in the hall unless a presentation is going on
  const r = mulberry32(777);
  const chosen = seats.filter(() => r() < fill);
  const n = chosen.length;
  const plans: Plan[] = chosen.map((s) => planPerson(s, r));
  const order = plans.map((_, i) => i).sort((a, b) => plans[a].delay - plans[b].delay);

  // ---- geometry: every limb hangs from its joint (origin at the top), so it can simply be turned about the joint
  const limb = (w: number, len: number, d: number): THREE.BufferGeometry => k.own(new THREE.BoxGeometry(w, len, d).translate(0, -len / 2, 0));
  const mat = (): THREE.MeshLambertMaterial => k.own(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const mk = (geo: THREE.BufferGeometry, count: number): THREE.InstancedMesh => {
    const m = new THREE.InstancedMesh(geo, mat(), Math.max(1, count));
    m.frustumCulled = false;
    m.castShadow = m.receiveShadow = false;
    g.add(m);
    return m;
  };
  const torso = mk(k.own(new THREE.BoxGeometry(0.42, TORSO, 0.23).translate(0, TORSO / 2, 0)), n);
  const head = mk(k.own(new THREE.SphereGeometry(0.115, 10, 8).scale(0.95, 1.2, 1.05)), n);
  const hair = mk(k.own(new THREE.SphereGeometry(0.122, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(0.98, 1.12, 1.1)), n);
  const thigh = mk(limb(0.15, THIGH, 0.15), n * 2);
  const shin = mk(limb(0.12, SHIN, 0.13), n * 2);
  const uarm = mk(limb(0.095, UARM, 0.095), n * 2);
  const farm = mk(limb(0.08, FARM, 0.08), n * 2);
  const foot = mk(k.own(new THREE.BoxGeometry(0.11, 0.07, 0.26).translate(0, 0.035, 0.05)), n * 2);

  // ---- colours (per person): shirt, trousers, skin, hair, shoes
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const shirt = CLOTH[(r() * CLOTH.length) | 0], skin = SKIN[(r() * SKIN.length) | 0], trou = TROUSER[(r() * TROUSER.length) | 0];
    torso.setColorAt(i, col.setHex(shirt));
    head.setColorAt(i, col.setHex(skin));
    hair.setColorAt(i, col.setHex(HAIR[(r() * HAIR.length) | 0]));
    for (let s = 0; s < 2; s++) {
      const j = i * 2 + s;
      thigh.setColorAt(j, col.setHex(trou));
      shin.setColorAt(j, col.setHex(trou));
      uarm.setColorAt(j, col.setHex(shirt));
      farm.setColorAt(j, col.setHex(skin));
      foot.setColorAt(j, col.setHex(0x1a1612));
    }
  }
  const phase = new Float32Array(n);
  for (let i = 0; i < n; i++) phase[i] = r() * Math.PI * 2;
  for (const m of [torso, head, hair, thigh, shin, uarm, farm, foot]) if (m.instanceColor) m.instanceColor.needsUpdate = true;

  // ---- posing
  const root = new THREE.Matrix4(), lm = new THREE.Matrix4(), gm = new THREE.Matrix4(), hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), pv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
  /** Writes (root * [position, pitch about x, then roll about z]) into an instance. Pitch > 0 swings a hanging limb BACK (the model faces +z). */
  const put = (m: THREE.InstancedMesh, idx: number, x: number, y: number, z: number, pitch: number, roll: number): void => {
    qa.setFromAxisAngle(AX, pitch);
    if (roll !== 0) { qb.setFromAxisAngle(AZ, roll); qa.multiply(qb); }
    lm.compose(pv.set(x, y, z), qa, one);
    gm.multiplyMatrices(root, lm);
    m.setMatrixAt(idx, gm);
  };
  const o = { x: 0, y: 0, z: 0 }; // end point of the last limb()
  const end = (x: number, y: number, z: number, len: number, pitch: number, roll: number): void => {
    o.x = x + len * Math.sin(roll); o.y = y - len * Math.cos(roll) * Math.cos(pitch); o.z = z - len * Math.cos(roll) * Math.sin(pitch);
  };

  let mood: Mood = 'idle';
  let stand = 0; // 0 sitting .. 1 standing (ovation); only the seated people use it

  /**
   * One person. `walk` = 0..1 how much of the walking cycle (stride) shows, `sit` = 0 standing .. 1 seated, `st` = standing up for the ovation.
   * (x, y, z) = the point on the floor under the pelvis, `h` = heading.
   */
  const pose = (i: number, x: number, y: number, z: number, h: number, stride: number, walk: number, sit: number, st: number, t: number): void => {
    const p = phase[i];
    root.makeRotationY(h);
    root.setPosition(x, y, z);
    const u = sit * (1 - st); // how seated the legs are
    // ---- legs
    let hip = 0;
    const legPitch: number[] = [0, 0], kneeFlex: number[] = [0, 0];
    for (let s = 0; s < 2; s++) {
      const ph = stride + (s ? Math.PI : 0);
      const wt = 0.55 * Math.sin(ph) * walk, wk = 0.95 * Math.max(0, -Math.cos(ph)) * walk;
      legPitch[s] = wt + (-HALF_PI - wt) * u; // seated: thigh forward (pitch -90 deg)
      kneeFlex[s] = wk + (HALF_PI - wk) * u; // seated: knee bent 90 deg, shin vertical
      hip = Math.max(hip, THIGH * Math.cos(legPitch[s]) + SHIN * Math.cos(legPitch[s] + kneeFlex[s]));
    }
    hip += 0.03 * u; // sits ON the cushion
    const bob = mood === 'ovation' ? Math.max(0, Math.sin(t * 7 + p)) * 0.05 * st : 0;
    hip += bob;
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1, hx = side * 0.1, id = i * 2 + s;
      put(thigh, id, hx, hip, 0, legPitch[s], 0);
      end(hx, hip, 0, THIGH, legPitch[s], 0);
      const sp = legPitch[s] + kneeFlex[s];
      put(shin, id, o.x, o.y, o.z, sp, 0);
      end(o.x, o.y, o.z, SHIN, sp, 0);
      put(foot, id, o.x, o.y - 0.03 * u, o.z, sp * 0.4, 0);
    }
    // ---- torso (leans a little forward when walking / sitting; sways when listening) and head
    const listen = mood === 'listen' ? Math.sin(t * 0.8 + p) : 0;
    const lean = 0.05 * walk + 0.07 * u;
    const roll = listen * 0.03;
    put(torso, i, 0, hip, 0, lean, roll);
    const cl = Math.cos(lean), sl = Math.sin(lean), cr = Math.cos(roll), sr = Math.sin(roll);
    const tp = (lx: number, ly: number): void => { // a point of the torso frame -> model frame
      const rx = lx * cr - ly * sr, ry = lx * sr + ly * cr;
      o.x = rx; o.y = hip + ry * cl; o.z = ry * sl;
    };
    tp(0, TORSO + 0.13);
    const nod = mood === 'listen' ? Math.sin(t * 0.6 + p * 2) * 0.05 : 0;
    put(head, i, o.x, o.y, o.z, lean + nod, roll);
    put(hair, i, o.x, o.y + 0.012, o.z - 0.004, lean + nod, roll);
    // ---- arms: walking swing / hands in the lap / clapping
    const clap = mood === 'clap' || (mood === 'ovation' && st > 0.5);
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1, id = i * 2 + s;
      tp(side * 0.255, TORSO - 0.06);
      const sx = o.x, sy = o.y, sz = o.z;
      const sw = Math.sin(stride + (s ? 0 : Math.PI)) * walk; // the arm swings against the leg of its side
      // walking: swing + bent elbow; seated: upper arm a little forward, forearm forward (hands in the lap)
      let ap = -0.5 * sw + (-0.3 + 0.5 * sw) * u; // pitch (negative = forward)
      let el = 0.25 + 0.3 * Math.max(0, sw);
      el += (1.1 - el) * u;
      let ar = side * 0.06 * (1 - u) + side * 0.02 * u; // hangs slightly out
      if (clap) {
        const c = mood === 'clap' ? 1 : smooth(Math.min(1, (st - 0.5) * 2));
        const beat = Math.sin(t * 11 + p);
        ap += (-0.95 - ap) * c; el += (1.55 - el) * c; ar += (-side * (0.42 + 0.2 * beat) - ar) * c;
      }
      put(uarm, id, sx, sy, sz, ap, ar);
      end(sx, sy, sz, UARM, ap, ar);
      put(farm, id, o.x, o.y, o.z, ap - el, ar);
    }
  };

  // ---- the hall starts empty; the crowd is built on setPresent(true)
  const hideAll = (): void => {
    for (const m of [torso, head, hair]) for (let i = 0; i < n; i++) m.setMatrixAt(i, hide);
    for (const m of [thigh, shin, uarm, farm, foot]) for (let i = 0; i < n * 2; i++) m.setMatrixAt(i, hide);
    flush();
  };
  const flush = (): void => { for (const m of [torso, head, hair, thigh, shin, uarm, farm, foot]) m.instanceMatrix.needsUpdate = true; };
  hideAll();

  let clock = 0, next = 0, walkAcc = 0, moodAcc = 0, dirty = false, nSeated = 0;
  let leaving = false, lclock = 0, lnext = 0;
  const leaveOrder: number[] = [], leaveActive: number[] = [];
  const active: number[] = [];
  const seatedList: number[] = [];
  const smp: Sample = { phase: 'away', x: 0, y: 0, z: 0, h: 0, sit: 0, stride: 0 };
  const hidePerson = (i: number): void => {
    for (const m of [torso, head, hair]) m.setMatrixAt(i, hide);
    for (const m of [thigh, shin, uarm, farm, foot]) { m.setMatrixAt(i * 2, hide); m.setMatrixAt(i * 2 + 1, hide); }
  };
  const poseSeated = (i: number, t: number): void => {
    const s = plans[i].seat;
    pose(i, s.x, s.y, s.z - SEAT_SETBACK - STAND_FWD * stand, Math.PI, 0, 0, 1, stand, t);
  };

  /** The leaving phase: the seated people get up one after the other; the ones who stay behind keep sitting. */
  const updateLeave = (dt: number, t: number): void => {
    lclock += dt;
    while (lnext < leaveOrder.length && plans[leaveOrder[lnext]].leaveDelay <= lclock) { leaveActive.push(leaveOrder[lnext++]); nSeated--; } // `seated` counts the ones still sitting
    // the people still sitting settle after the ovation (stand -> 0); a pose only when something changes
    const moving = Math.abs(stand) > 0.001;
    if (moving) stand = Math.max(0, stand - dt * 2.2);
    walkAcc += dt;
    if (walkAcc < 1 / 30) return;
    walkAcc = 0.0001;
    if (moving || dirty) {
      dirty = false;
      for (let q = lnext; q < leaveOrder.length; q++) poseSeated(leaveOrder[q], t);
    }
    for (let a = leaveActive.length - 1; a >= 0; a--) {
      const i = leaveActive[a], pl = plans[i];
      if (lclock >= leftAt(pl)) {
        leaveActive[a] = leaveActive[leaveActive.length - 1]; leaveActive.pop();
        hidePerson(i);
      } else {
        sampleLeave(pl, lclock, smp);
        pose(i, smp.x, smp.y, smp.z, smp.h, smp.stride, smp.phase === 'walk' ? 1 : 0, smp.sit, 0, t);
      }
    }
    flush();
    if (lnext >= leaveOrder.length && leaveActive.length === 0) { // the last one is out: the hall is empty again
      leaving = false; g.visible = false; seatedList.length = 0; leaveOrder.length = 0; nSeated = 0;
    }
  };

  return {
    group: g,
    peopleCount: n,
    seatCount: seats.length,
    get arrived() { return next; },
    get seated() { return nSeated; },
    get present() { return g.visible; },
    get leaving() { return leaving; },
    setPresent(on) {
      if (g.visible === on && !(on && leaving)) return; // a new mission while people are still leaving starts a fresh arrival
      g.visible = on;
      leaving = false; leaveOrder.length = 0; leaveActive.length = 0; lnext = 0;
      if (on) {
        hideAll();
        clock = 0; next = 0; walkAcc = 1; moodAcc = 0; dirty = false; nSeated = 0; stand = 0; mood = 'idle';
        active.length = 0; seatedList.length = 0;
      }
    },
    dismiss() {
      if (!g.visible || leaving) return;
      // people who are still on their way in take their seat at once; people who have not come in yet never do
      for (const i of active) { seatedList.push(i); nSeated++; }
      active.length = 0;
      next = n;
      leaving = true; lclock = 0; lnext = 0;
      leaveOrder.length = 0; leaveActive.length = 0;
      for (const i of seatedList) leaveOrder.push(i);
      leaveOrder.sort((a, b) => plans[a].leaveDelay - plans[b].leaveDelay);
      mood = 'idle'; dirty = true;
    },
    setMood(m) { mood = m; dirty = true; },
    update(dt, t) {
      if (!g.visible) return; // empty hall: no work at all
      if (leaving) { updateLeave(dt, t); return; }
      clock += dt;
      while (next < n && plans[order[next]].delay <= clock) active.push(order[next++]);
      // people on the move (30 poses a second)
      walkAcc += dt;
      let touched = false;
      if (active.length && walkAcc >= 1 / 30) {
        walkAcc = 0.0001;
        for (let a = active.length - 1; a >= 0; a--) {
          const i = active[a], pl = plans[i];
          if (clock >= seatedAt(pl)) {
            active[a] = active[active.length - 1]; active.pop();
            seatedList.push(i); nSeated++;
            poseSeated(i, t);
          } else {
            sample(pl, clock, smp);
            const w = smp.phase === 'walk' ? 1 : 0;
            pose(i, smp.x, smp.y, smp.z, smp.h, smp.stride, w, smp.sit, 0, t);
          }
        }
        touched = true;
      }
      // the seated people: standing up / sitting down for the ovation, listening sway, clapping (24 poses a second, only while something moves)
      const target = mood === 'ovation' ? 1 : 0;
      const moving = Math.abs(stand - target) > 0.001;
      if (moving) stand += Math.sign(target - stand) * Math.min(Math.abs(target - stand), dt * 2.2);
      moodAcc += dt;
      if ((mood !== 'idle' || moving || dirty) && moodAcc >= 1 / 24) {
        moodAcc = 0.0001; dirty = false;
        for (const i of seatedList) poseSeated(i, t);
        touched = true;
      }
      if (touched) flush();
    },
  };
}

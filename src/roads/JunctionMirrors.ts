// ROAD (CONVEX) MIRRORS at junctions: a short pole with a round orange-rimmed mirror, like the ones on real blind corners.
//
//   planJunctionMirrors(roads)   pure placement (no three.js scene): where every mirror stands and which way it faces
//   JunctionMirrors              the 3D layer. Everything is INSTANCED: 2 draw calls for the whole map (poles + mirror faces)
//
// Placement (every engineered junction with 3 or more arms):
//   - T junction / any arm with NO road straight across from it: the classic spot. The mirror stands on the far kerb, opposite that arm, and
//     faces it, so a driver waiting on the side road sees the traffic coming from both sides on the main road.
//   - Crossing where every arm has a road opposite it (4-way, multi): one mirror on every corner, standing just outside the kerb return and
//     facing the middle of the junction.
// A mirror is never put on asphalt (it is pushed outwards onto the shoulder or dropped) and never within a metre of a street light pole.
// Children use ABSOLUTE world coordinates (parent = world.root), like the street lights.
import * as THREE from 'three';
import type { RoadNetwork } from './RoadNetwork';

export interface MirrorSpot {
  /** Foot of the pole (world metres). */
  x: number;
  y: number;
  z: number;
  /** Unit vector (x, z) the mirror faces (towards the traffic that should look into it). */
  nx: number;
  nz: number;
  /** 0 = stands opposite a side road (T junction), 1 = corner mirror of a crossing. */
  kind: 0 | 1;
}

const wrap = (a: number): number => {
  const t = Math.PI * 2;
  return ((a % t) + t) % t;
};
const angDiff = (a: number, b: number): number => {
  const d = Math.abs(wrap(a) - wrap(b));
  return Math.min(d, Math.PI * 2 - d);
};

/** Farthest distance from (cx, cz) along the unit ray (dx, dz) at which it leaves the polygon (x, z pairs); 0 if it never crosses. */
function rayExit(poly: Float32Array, cx: number, cz: number, dx: number, dz: number): number {
  const n = poly.length / 2;
  let best = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = poly[i * 2] - cx;
    const az = poly[i * 2 + 1] - cz;
    const ex = poly[j * 2] - poly[i * 2];
    const ez = poly[j * 2 + 1] - poly[i * 2 + 1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (ax * ez - az * ex) / den;
    const u = (ax * dz - az * dx) / den;
    if (t > 0 && u >= 0 && u <= 1 && t > best) best = t;
  }
  return best;
}

/** How far to the side of a ray the mirror may stand (m) when the straight-across spot is taken by asphalt. */
const SIDE_TRIES = [0, 1.5, -1.5, 3, -3];

/** Where every junction mirror stands. Deterministic. `avoid` = street light poles (x, z) to keep clear of. */
export function planJunctionMirrors(roads: RoadNetwork, avoid: ReadonlyArray<{ x: number; z: number }> = []): MirrorSpot[] {
  const out: MirrorSpot[] = [];
  const cell = 40;
  const grid = new Map<string, { x: number; z: number }[]>();
  const key = (cx: number, cz: number): string => cx + ',' + cz;
  const add = (x: number, z: number): void => {
    const k = key(Math.floor(x / cell), Math.floor(z / cell));
    const l = grid.get(k);
    if (l) l.push({ x, z });
    else grid.set(k, [{ x, z }]);
  };
  for (const a of avoid) add(a.x, a.z);
  const clear = (x: number, z: number): boolean => {
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let i = cx - 1; i <= cx + 1; i++)
      for (let j = cz - 1; j <= cz + 1; j++) {
        const l = grid.get(key(i, j));
        if (l) for (const p of l) if (Math.hypot(p.x - x, p.z - z) < 1.2) return false;
      }
    return true;
  };

  for (const p of roads.pads) {
    if (p.arms.length < 3) continue;
    const ring = p.gravel.length ? p.gravel : p.outline;
    const thetas = p.arms.map((a) => wrap(a.theta));
    const hasArmAt = (ang: number): boolean => thetas.some((t) => angDiff(t, ang) < 0.5);
    const heightAt = (x: number, z: number): number => p.y + p.a * (x - p.x) + p.b * (z - p.z);

    /** Try to stand a mirror on the ray (dx, dz) from the pad centre, just outside the shoulder; face (fx, fz). */
    const place = (dx: number, dz: number, fx: number, fz: number, kind: 0 | 1): boolean => {
      const reach = rayExit(ring, p.x, p.z, dx, dz);
      if (reach <= 0) return false;
      const sx = -dz; // sideways
      const sz = dx;
      for (const side of SIDE_TRIES) {
        for (let extra = 0.7; extra <= 2.5; extra += 0.9) {
          const px = p.x + dx * (reach + extra) + sx * side;
          const pz = p.z + dz * (reach + extra) + sz * side;
          if (roads.surfaceAt(px, pz) === 1) continue; // asphalt of this or a crossing road
          if (!clear(px, pz)) continue;
          out.push({ x: px, y: heightAt(px, pz), z: pz, nx: fx, nz: fz, kind });
          add(px, pz);
          return true;
        }
      }
      return false;
    };

    let stems = 0;
    for (const t of thetas) {
      if (hasArmAt(t + Math.PI)) continue; // a road runs straight across from this arm: no mirror needed for it
      const dx = Math.cos(t);
      const dz = Math.sin(t);
      // stand opposite the arm (direction -d from the centre), face the arm (+d)
      if (place(-dx, -dz, dx, dz, 0)) stems++;
    }
    if (stems > 0) continue;

    // every arm has an opposite: one mirror on each corner, facing the middle of the junction
    const th = [...thetas].sort((a, b) => a - b);
    for (let k = 0; k < th.length; k++) {
      const a = th[k];
      const b = k + 1 < th.length ? th[k + 1] : th[0] + Math.PI * 2;
      const gap = b - a;
      if (gap < 0.5) continue;
      const ang = a + gap / 2;
      place(Math.cos(ang), Math.sin(ang), -Math.cos(ang), -Math.sin(ang), 1);
    }
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------------------------------------

const MIRROR_R = 0.45;
const MIRROR_Y = 2.45; // centre height above the foot of the pole (m)
const POLE_TOP = 3.0;

/** The face: an orange rim with white stripes and a convex "reflection" (sky above, road below, curved horizon). */
function faceTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const m = S / 2;
  // rim
  g.fillStyle = '#ff6a00';
  g.beginPath();
  g.arc(m, m, m, 0, Math.PI * 2);
  g.fill();
  // white stripes on the rim
  g.strokeStyle = '#ffffff';
  g.lineWidth = 9;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.arc(m, m, m - 6, a0, a0 + 0.38);
    g.stroke();
  }
  // glass
  const r = m - 14;
  g.save();
  g.beginPath();
  g.arc(m, m, r, 0, Math.PI * 2);
  g.clip();
  const sky = g.createLinearGradient(0, m - r, 0, m + r);
  sky.addColorStop(0, '#d6e8fa');
  sky.addColorStop(0.5, '#9fc0e6');
  sky.addColorStop(0.5, '#6f7378');
  sky.addColorStop(1, '#3d4044');
  g.fillStyle = sky;
  g.fillRect(0, 0, S, S);
  // bent horizon + a bent road line, like a fish-eye view
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(m, m + 6, r * 0.95, r * 0.5, 0, Math.PI, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(240,220,120,0.7)';
  g.beginPath();
  g.moveTo(m, m + r);
  g.quadraticCurveTo(m + 6, m + 14, m - r * 0.7, m + 2);
  g.stroke();
  // convex highlight
  const hl = g.createRadialGradient(m - r * 0.35, m - r * 0.4, 2, m - r * 0.35, m - r * 0.4, r * 0.8);
  hl.addColorStop(0, 'rgba(255,255,255,0.65)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.fillRect(0, 0, S, S);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const DAY = new THREE.Color(1, 1, 1);
const NIGHT = new THREE.Color(0.3, 0.33, 0.45);

export class JunctionMirrors {
  readonly group = new THREE.Group();
  readonly spots: MirrorSpot[];
  private poles: THREE.InstancedMesh;
  private faces: THREE.InstancedMesh;
  private faceMat: THREE.MeshBasicMaterial;
  private poleMat = new THREE.MeshLambertMaterial({ color: 0x6a6f75 });
  private tex: THREE.CanvasTexture;
  private geos: THREE.BufferGeometry[] = [];

  constructor(parent: THREE.Object3D, roads: RoadNetwork, avoid: ReadonlyArray<{ x: number; z: number }> = []) {
    this.spots = planJunctionMirrors(roads, avoid);
    const n = this.spots.length;

    // instance frame: +Z = the way the mirror faces, +Y up, +X = Y x Z. The pole stands a little behind the mirror (z = -0.14).
    const parts: THREE.BufferGeometry[] = [];
    const pole = new THREE.CylinderGeometry(0.045, 0.06, POLE_TOP + 1.2, 8);
    pole.translate(0, (POLE_TOP - 1.2) / 2, -0.14);
    parts.push(pole);
    const bracket = new THREE.BoxGeometry(0.07, 0.07, 0.16);
    bracket.translate(0, MIRROR_Y, -0.08);
    parts.push(bracket);
    const dish = new THREE.CylinderGeometry(MIRROR_R + 0.03, MIRROR_R + 0.03, 0.1, 20);
    dish.rotateX(Math.PI / 2);
    dish.translate(0, MIRROR_Y, -0.05);
    parts.push(dish);
    const poleGeo = mergeGeometries(parts);
    for (const q of parts) q.dispose();
    this.geos.push(poleGeo);

    const faceGeo = new THREE.CircleGeometry(MIRROR_R + 0.03, 24);
    faceGeo.translate(0, MIRROR_Y, 0.004);
    this.geos.push(faceGeo);

    this.tex = faceTexture();
    this.faceMat = new THREE.MeshBasicMaterial({ map: this.tex, color: DAY.clone() });

    this.poles = new THREE.InstancedMesh(poleGeo, this.poleMat, Math.max(1, n));
    this.faces = new THREE.InstancedMesh(faceGeo, this.faceMat, Math.max(1, n));
    this.poles.count = this.faces.count = n;

    const m = new THREE.Matrix4();
    const X = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    const Z = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const s = this.spots[i];
      Z.set(s.nx, 0, s.nz);
      X.crossVectors(Y, Z);
      m.makeBasis(X, Y, Z).setPosition(s.x, s.y, s.z);
      this.poles.setMatrixAt(i, m);
      this.faces.setMatrixAt(i, m);
    }
    this.poles.instanceMatrix.needsUpdate = true;
    this.faces.instanceMatrix.needsUpdate = true;
    for (const o of [this.poles, this.faces]) {
      o.frustumCulled = false; // spread over the whole map
      o.castShadow = false;
      o.receiveShadow = false;
    }
    this.group.add(this.poles, this.faces);
    parent.add(this.group);
  }

  /** Once per rendered frame. on = 0 (day) .. 1 (night): the mirror is a dull dark disc at night. */
  update(on: number): void {
    this.faceMat.color.copy(DAY).lerp(NIGHT, on);
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.poles.dispose();
    this.faces.dispose();
    for (const g of this.geos) g.dispose();
    this.poleMat.dispose();
    this.faceMat.dispose();
    this.tex.dispose();
  }
}

/** Merge position / normal / uv / index of several indexed geometries into one (no BufferGeometryUtils import, which would pull the examples bundle). */
function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const g of list) {
    vCount += g.getAttribute('position').count;
    iCount += g.getIndex()!.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    pos.set(p.array as Float32Array, vo * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, vo * 3);
    uv.set(g.getAttribute('uv').array as Float32Array, vo * 2);
    const ix = g.getIndex()!.array;
    for (let k = 0; k < ix.length; k++) idx[io + k] = ix[k] + vo;
    vo += p.count;
    io += ix.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

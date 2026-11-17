// EVLab interiors: the furniture kit. A furniture model is a COMPOSITE: many small boxes / cylinders / spheres, each with its own colour, merged into ONE geometry
// (vertex colours), so a chair with a 5-star base, gas lift, cushion, back and arm rests is one mesh. Every model is defined once and placed many times as an
// InstancedMesh (one draw call per model), so a hall with 2900 seats or an office with 100 chairs costs a few draw calls.
// Building-local metres (x east, z south, y up). Convention: a model "faces" +z (the side where the person sits / stands). yaw 0 = faces +z, yaw PI = faces -z.
import * as THREE from 'three';
import type { Parts } from './EVLabParts';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const cylCache = new Map<string, THREE.CylinderGeometry>();
const sphCache = new Map<number, THREE.SphereGeometry>();
const tmpM = new THREE.Matrix4(), tmpN = new THREE.Matrix3(), tmpV = new THREE.Vector3(), tmpC = new THREE.Color();
const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();

/** Rotation of a part: yaw about y, tilt about x (positive = top leans towards +z), roll about z. */
export interface Rot { yaw?: number; tilt?: number; roll?: number }

/** A set of coloured parts that becomes one BufferGeometry (positions, normals, vertex colours; no uv). */
export class Composite {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  private add(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: number): this {
    const p = geo.getAttribute('position'), n = geo.getAttribute('normal'), ix = geo.getIndex();
    tmpN.getNormalMatrix(m);
    tmpC.setHex(color);
    const base = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      tmpV.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(tmpV.x, tmpV.y, tmpV.z);
      tmpV.fromBufferAttribute(n, i).applyMatrix3(tmpN).normalize();
      this.nor.push(tmpV.x, tmpV.y, tmpV.z);
      this.col.push(tmpC.r, tmpC.g, tmpC.b);
    }
    if (ix) for (let i = 0; i < ix.count; i++) this.idx.push(base + ix.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    return this;
  }

  private pose(x: number, y: number, z: number, sx: number, sy: number, sz: number, r?: Rot): THREE.Matrix4 {
    tmpE.set(r?.tilt ?? 0, r?.yaw ?? 0, r?.roll ?? 0, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    return tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
  }

  /** Box centred at (x, y, z), size w x h x d. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: number, r?: Rot): this {
    return this.add(unitBox, this.pose(x, y, z, w, h, d, r), color);
  }

  /** Cylinder (or cone) centred at (x, y, z), radii top / bottom, length h, standing (axis 'y'), or lying along x / z. */
  cyl(x: number, y: number, z: number, rt: number, rb: number, h: number, color: number, seg = 12, axis: 'y' | 'x' | 'z' = 'y', r?: Rot): this {
    const key = `${rt}|${rb}|${seg}`;
    let g = cylCache.get(key);
    if (!g) { g = new THREE.CylinderGeometry(rt, rb, 1, seg); cylCache.set(key, g); }
    const m = this.pose(x, y, z, 1, h, 1, r);
    if (axis !== 'y') {
      // lay the cylinder down: rotate about z (axis x) or x (axis z) first, then the part pose
      const lay = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0));
      const m2 = new THREE.Matrix4().copy(m);
      // part pose = translate * rotate(r) * scale(1,h,1): put the lay rotation between rotate(r) and the scale
      const t = new THREE.Matrix4().makeTranslation(x, y, z);
      const rot = new THREE.Matrix4().makeRotationFromQuaternion(tmpQ);
      const sc = new THREE.Matrix4().makeScale(1, h, 1);
      m2.copy(t).multiply(rot).multiply(lay).multiply(sc);
      return this.add(g, m2, color);
    }
    return this.add(g, m, color);
  }

  /** Ellipsoid (leaves, cushions, pot soil...). */
  sphere(x: number, y: number, z: number, rx: number, ry: number, rz: number, color: number, seg = 8, r?: Rot): this {
    let g = sphCache.get(seg);
    if (!g) { g = new THREE.SphereGeometry(1, seg, Math.max(3, seg >> 1)); sphCache.set(seg, g); }
    return this.add(g, this.pose(x, y, z, rx, ry, rz, r), color);
  }

  /** Put another composite into this one, moved to (x, y, z), turned by yaw and scaled by s. */
  merge(o: Composite, x = 0, y = 0, z = 0, yaw = 0, s = 1): this {
    const c = Math.cos(yaw), sn = Math.sin(yaw), base = this.pos.length / 3;
    for (let i = 0; i < o.pos.length; i += 3) {
      const px = o.pos[i] * s, py = o.pos[i + 1] * s, pz = o.pos[i + 2] * s;
      this.pos.push(x + px * c + pz * sn, y + py, z - px * sn + pz * c);
      const nx = o.nor[i], nz = o.nor[i + 2];
      this.nor.push(nx * c + nz * sn, o.nor[i + 1], -nx * sn + nz * c);
    }
    this.col.push(...o.col);
    for (const i of o.idx) this.idx.push(base + i);
    return this;
  }

  get triangles(): number { return this.idx.length / 3; }
  get empty(): boolean { return this.idx.length === 0; }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    geo.computeBoundingSphere();
    return geo;
  }
}

interface ModelType { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null; at: THREE.Matrix4[] }

/** Defines furniture models and places them; `flush()` turns every model into one InstancedMesh (+ one for its glowing parts). */
export class Furnish {
  private types = new Map<string, ModelType>();
  private bodyMat: THREE.MeshPhongMaterial;
  private glowMat: THREE.MeshBasicMaterial;

  constructor(private P: Parts, private parent: THREE.Object3D) {
    this.bodyMat = P.lit(null, 0xffffff, 0.3);
    this.bodyMat.vertexColors = true;
    this.glowMat = P.k.own(new THREE.MeshBasicMaterial({ vertexColors: true }));
  }

  /** Define a model once (`body`: lit parts, `glow`: parts that shine by themselves: screens, LEDs, light strips). */
  define(name: string, body: Composite, glow?: Composite): this {
    this.types.set(name, { body: this.P.k.own(body.build()), glow: glow && !glow.empty ? this.P.k.own(glow.build()) : null, at: [] });
    return this;
  }

  has(name: string): boolean { return this.types.has(name); }

  /** One copy of model `name` at (x, y, z) turned by yaw (0 = faces +z), scaled by s. */
  place(name: string, x: number, y: number, z: number, yaw = 0, s = 1): void {
    const t = this.types.get(name);
    if (!t) throw new Error('EVLab furniture: unknown model ' + name);
    t.at.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s)));
  }

  /** A composite as an ordinary mesh (built once, not instanced): wall panelling, a rotating rotor... */
  mesh(body: Composite, glow?: Composite): THREE.Group {
    const g = new THREE.Group();
    if (!body.empty) g.add(new THREE.Mesh(this.P.k.own(body.build()), this.bodyMat));
    if (glow && !glow.empty) g.add(new THREE.Mesh(this.P.k.own(glow.build()), this.glowMat));
    this.parent.add(g);
    return g;
  }

  /** Number of copies placed (all models) and of triangles drawn: for the test. */
  stats(): { copies: number; triangles: number; models: number } {
    let copies = 0, triangles = 0;
    for (const t of this.types.values()) {
      copies += t.at.length;
      const a = (t.body.getIndex()?.count ?? 0) / 3, b = (t.glow?.getIndex()?.count ?? 0) / 3;
      triangles += t.at.length * (a + b);
    }
    return { copies, triangles, models: this.types.size };
  }

  flush(): void {
    for (const [name, t] of this.types) {
      if (t.at.length === 0) continue;
      const make = (geo: THREE.BufferGeometry, mat: THREE.Material, suffix: string): void => {
        const im = new THREE.InstancedMesh(geo, mat, t.at.length);
        t.at.forEach((m, i) => im.setMatrixAt(i, m));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.name = 'EVLabFurn ' + name + suffix;
        this.parent.add(im);
      };
      make(t.body, this.bodyMat, '');
      if (t.glow) make(t.glow, this.glowMat, ' glow');
    }
  }
}

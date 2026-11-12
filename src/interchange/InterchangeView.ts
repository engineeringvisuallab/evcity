// INTERCHANGE STEP 3D-C (standalone): InterchangeModel -> three.js Group. Nothing here touches RoadNetwork / the game world:
// the object carries its own deck ribbons, the two crossing roads (simple strips), piers, lamps, rail posts, structures, walls and garden / pond discs,
// so an interchange can be built, looked at and kept as a finished object, and added to the main game later (scene.add(group)).
//
// Every kind of part / structure is ONE InstancedMesh (all instances of that kind), so the draw calls ~ number of kinds, not number of objects.
// Local mesh frame of an instance: +x = along the road, +z = across, +y = up. Instance yaw is the world heading (cos yaw, sin yaw) of the road,
// so the mesh turns by -yaw about Y.

import * as THREE from 'three';
import type { InterchangeModel, Ramp } from './InterchangeTypes';

export interface ViewOptions {
  /** Ground height under (x, z); default flat at model.spec.y. Used for walls, discs and nothing else. */
  ground?: (x: number, z: number) => number;
  /** Draw the two crossing roads as strips (default true). Off = ramps and structures only (for placing on real roads). */
  drawRoads?: boolean;
  /** Road strip half-length from the centre (m); default model.footprintR. */
  roadReach?: number;
}

export interface InterchangeObject {
  group: THREE.Group;
  /** Triangles drawn if everything is in view (for a budget check). */
  triangles: number;
  dispose(): void;
}

const COL = {
  asphalt: 0x3a3d42,
  concrete: 0xb9b6ae,
  pier: 0xa7a49c,
  lamp: 0x55585e,
  wall: 0xc9c4b8,
  garden: 0x4f8a3c,
  pond: 0x3c7fa8,
  stone: 0xd8d2c2,
  dome: 0x2f7d6d,
  trunk: 0x7a5a3a,
  leaf: 0x2f8a3a,
  sign: 0xe9e4d4,
  gold: 0xc9a227,
};

// ---------- tiny geometry helpers (no BufferGeometryUtils import, so this works with any three version) ----------

type Part = { geo: THREE.BufferGeometry; color: number };

/** Merge parts into ONE geometry with a vertex colour per part (so one material draws a multi-colour object). */
function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    g.computeVertexNormals();
    const pa = g.getAttribute('position');
    const na = g.getAttribute('normal');
    c.setHex(p.color);
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      nor.push(na.getX(i), na.getY(i), na.getZ(i));
      col.push(c.r, c.g, c.b);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): Part {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z); // y = bottom of the box
  return { geo: g, color };
}

function cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: number, seg = 10): Part {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(x, y + h / 2, z);
  return { geo: g, color };
}

function sphere(r: number, x: number, y: number, z: number, color: number, top = false): Part {
  const g = top ? new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(r, 8, 6);
  g.translate(x, y, z);
  return { geo: g, color };
}

function triCount(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
}

/** A closed-ish ribbon along a polyline: top surface (+ side faces and underside when `thick` > 0). */
function ribbon(xs: ArrayLike<number>, ys: ArrayLike<number>, zs: ArrayLike<number>, halfWs: number | ArrayLike<number>, thick: number): THREE.BufferGeometry {
  const n = xs.length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const tx = xs[b] - xs[a];
    const tz = zs[b] - zs[a];
    const l = Math.hypot(tx, tz) || 1;
    const nx = tz / l; // left normal (same as RoadSpec.nx / nz)
    const nz = -tx / l;
    const halfW = typeof halfWs === 'number' ? halfWs : halfWs[i];
    // 4 rim points per section: top-left, top-right, bottom-right, bottom-left
    pos.push(xs[i] + nx * halfW, ys[i], zs[i] + nz * halfW);
    pos.push(xs[i] - nx * halfW, ys[i], zs[i] - nz * halfW);
    pos.push(xs[i] - nx * halfW, ys[i] - thick, zs[i] - nz * halfW);
    pos.push(xs[i] + nx * halfW, ys[i] - thick, zs[i] + nz * halfW);
  }
  const faces = thick > 0 ? 4 : 1; // top only for a flat strip
  for (let i = 0; i < n - 1; i++) {
    const o = i * 4;
    const q = (a: number, b: number, c: number, d: number): void => {
      idx.push(a, b, c, a, c, d);
    };
    q(o, o + 1, o + 5, o + 4); // top (faces up)
    if (faces > 1) {
      q(o + 1, o + 5, o + 6, o + 2); // right side
      q(o + 2, o + 6, o + 7, o + 3); // underside
      q(o + 3, o + 7, o + 4, o); // left side
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Vertical wall (thin ribbon) along ramp points i0..i1 on one edge, from the ground (or `bottomY`) up to the deck. */
function wallRibbon(r: Ramp, side: 'left' | 'right', i0: number, i1: number, ground: (x: number, z: number) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const off = r.halfWidth + 0.25;
  const s = side === 'left' ? 1 : -1;
  const t = 0.35;
  let k = 0;
  for (let i = i0; i <= i1; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(r.xs.length - 1, i + 1);
    const tx = r.xs[b] - r.xs[a];
    const tz = r.zs[b] - r.zs[a];
    const l = Math.hypot(tx, tz) || 1;
    const nx = (tz / l) * s;
    const nz = (-tx / l) * s;
    const x1 = r.xs[i] + nx * off;
    const z1 = r.zs[i] + nz * off;
    const x2 = r.xs[i] + nx * (off + t);
    const z2 = r.zs[i] + nz * (off + t);
    const top = r.ys[i] + 0.9; // a little above the deck = parapet
    const bot = Math.min(ground(x1, z1), r.ys[i] - 0.5) - 0.3;
    pos.push(x1, top, z1, x2, top, z2, x2, bot, z2, x1, bot, z1);
    if (i < i1) {
      const o = k * 4;
      const q = (p: number, qq: number, c: number, d: number): void => {
        idx.push(p, qq, c, p, c, d);
      };
      q(o, o + 1, o + 5, o + 4); // top
      q(o, o + 3, o + 7, o + 4); // inner face
      q(o + 1, o + 5, o + 6, o + 2); // outer face
    }
    k++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- the shared meshes of every part / structure kind (local frame: +x along the road, +z across) ----------

function pierGeo(): THREE.BufferGeometry {
  return mergeParts([box(1.8, 1, 1.8, 0, 0, 0, COL.pier)]); // height = instance scale.y
}
function lampGeo(): THREE.BufferGeometry {
  return mergeParts([cyl(0.09, 0.14, 1, 0, 0, 0, COL.lamp, 6), box(1.6, 0.14, 0.14, 0.7, 0.96, 0, COL.lamp)]); // height = scale.y; arm points +x (later: toward the road)
}
function railPostGeo(): THREE.BufferGeometry {
  return mergeParts([box(0.14, 1.0, 0.14, 0, 0, 0, COL.concrete), box(6, 0.12, 0.1, 3, 0.85, 0, COL.concrete)]);
}
const ARCH_W = 20; // the arch mesh is built 20 m wide; an instance stretches only z by (width / 20)
function archGeo(): THREE.BufferGeometry {
  const h = ARCH_W / 2;
  return mergeParts([
    box(1.4, 6.2, 1.4, 0, 0, -h, COL.stone),
    box(1.4, 6.2, 1.4, 0, 0, h, COL.stone),
    box(1.6, 1.3, ARCH_W + 1.6, 0, 6.2, 0, COL.stone),
    box(1.2, 0.4, ARCH_W * 0.5, 0, 7.5, 0, COL.gold),
  ]);
}
function pavilionGeo(): THREE.BufferGeometry {
  const parts: Part[] = [cyl(3.6, 3.8, 0.5, 0, 0, 0, COL.stone, 16)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(cyl(0.22, 0.26, 4.6, Math.cos(a) * 3, 0.5, Math.sin(a) * 3, COL.stone, 8));
  }
  parts.push(cyl(3.5, 3.5, 0.35, 0, 5.1, 0, COL.stone, 16), sphere(3.2, 0, 5.45, 0, COL.dome, true), cyl(0.08, 0.08, 1.6, 0, 8.4, 0, COL.gold, 6));
  return mergeParts(parts);
}
function fountainGeo(): THREE.BufferGeometry {
  return mergeParts([cyl(3, 3.1, 0.7, 0, 0, 0, COL.stone, 18), cyl(2.7, 2.7, 0.1, 0, 0.62, 0, COL.pond, 18), cyl(0.35, 0.5, 1.8, 0, 0.6, 0, COL.stone, 10), cyl(1.3, 0.4, 0.4, 0, 2.2, 0, COL.stone, 12), sphere(0.35, 0, 3.2, 0, COL.pond)]);
}
function palmGeo(): THREE.BufferGeometry {
  const parts: Part[] = [cyl(0.22, 0.38, 7.4, 0, 0, 0, COL.trunk, 7)];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const g = new THREE.ConeGeometry(0.55, 4.2, 4);
    g.rotateZ(-Math.PI / 2); // apex points +x (outward), then droops
    g.translate(2.0, 0, 0);
    g.rotateZ(-0.35);
    g.rotateY(a);
    g.translate(0, 7.6, 0);
    parts.push({ geo: g, color: COL.leaf });
  }
  return mergeParts(parts);
}
function billboardGeo(): THREE.BufferGeometry {
  return mergeParts([box(0.6, 5, 0.6, 0, 0, -3.2, COL.lamp), box(0.6, 5, 0.6, 0, 0, 3.2, COL.lamp), box(0.5, 4.6, 12, 0, 4.6, 0, COL.sign), box(0.7, 0.4, 12.3, 0, 9.2, 0, COL.lamp)]);
}

const STRUCT_GEO: Record<string, () => THREE.BufferGeometry> = {
  arch: archGeo,
  pavilion: pavilionGeo,
  fountain: fountainGeo,
  palm: palmGeo,
  billboard: billboardGeo,
};

// ---------- main entry ----------

export function buildInterchangeObject(model: InterchangeModel, opts: ViewOptions = {}): InterchangeObject {
  const group = new THREE.Group();
  group.name = `interchange:${model.spec.id}`;
  const ground = opts.ground ?? ((): number => model.spec.y);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  let triangles = 0;
  const addMesh = (g: THREE.BufferGeometry, m: THREE.Material, name: string): THREE.Mesh => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    geos.push(g);
    triangles += triCount(g);
    return mesh;
  };
  const matAsphalt = new THREE.MeshStandardMaterial({ color: COL.asphalt, roughness: 0.95, side: THREE.DoubleSide });
  const matConcrete = new THREE.MeshStandardMaterial({ color: COL.concrete, roughness: 0.9, side: THREE.DoubleSide });
  const matVertex = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const matGarden = new THREE.MeshStandardMaterial({ color: COL.garden, roughness: 1 });
  const matPond = new THREE.MeshStandardMaterial({ color: COL.pond, roughness: 0.25, metalness: 0.1 });
  mats.push(matAsphalt, matConcrete, matVertex, matGarden, matPond);

  // 1. ramps: asphalt top with a concrete deck body under it (top is lifted 3 cm over the body so the two never z-fight).
  // GORE / MERGE TAPER: the ramp CENTRE LINE starts on the road's kerb lane, so near the join the ribbon would lie on top of the road.
  // Instead its half width grows from 0 with the clearance between its centre and the road edge (inner edge stays ON the road edge = a wedge
  // that opens up from the gore point) until it reaches the full ramp width.
  const roadHalf = (side: 'main' | 'cross'): number => (side === 'main' ? model.spec.main : model.spec.cross).halfWidth;
  const clearance = (r: Ramp, i: number, side: 'main' | 'cross'): number => {
    const q = r.local[i];
    return Math.abs(side === 'main' ? q.v : q.u) - roadHalf(side);
  };
  for (const r of model.ramps) {
    const n = r.xs.length;
    const hw: number[] = new Array(n).fill(r.halfWidth);
    if (r.from.kind !== 'terminal') {
      for (let i = 0; i < n; i++) {
        const w = Math.min(r.halfWidth, Math.max(0.02, clearance(r, i, r.from.road)));
        hw[i] = Math.min(hw[i], w);
        if (w >= r.halfWidth) break;
      }
    }
    if (r.to.kind !== 'terminal') {
      for (let i = n - 1; i >= 0; i--) {
        const w = Math.min(r.halfWidth, Math.max(0.02, clearance(r, i, r.to.road)));
        hw[i] = Math.min(hw[i], w);
        if (w >= r.halfWidth) break;
      }
    }
    const bodyHw = hw.map((w) => w * (1 + 0.5 / r.halfWidth));
    addMesh(ribbon(r.xs, r.ys.map((y) => y + 0.01), r.zs, bodyHw, model.params.deckThickness), matConcrete, `ramp-body:${r.id}`);
    addMesh(ribbon(r.xs, r.ys.map((y) => y + 0.03), r.zs, hw, 0), matAsphalt, `ramp:${r.id}`);
  }

  // 2. the two roads as strips along the interchange frame (u along main, v along cross), heights from the level plan
  if (opts.drawRoads ?? true) {
    const reach = opts.roadReach ?? model.footprintR;
    const step = 10;
    for (const side of ['main', 'cross'] as const) {
      const half = (side === 'main' ? model.spec.main : model.spec.cross).halfWidth;
      const xs: number[] = [];
      const ys: number[] = [];
      const zs: number[] = [];
      for (let t = -reach; t <= reach + 1e-6; t += step) {
        const w = side === 'main' ? model.toWorld(t, 0) : model.toWorld(0, t);
        xs.push(w.x);
        zs.push(w.z);
        ys.push(model.yOf(side, t));
      }
      const upper = model.levels.upper === side;
      addMesh(ribbon(xs, ys, zs, half + (upper ? 0.5 : 0), upper ? model.params.deckThickness : 0), upper ? matConcrete : matAsphalt, `road:${side}`);
      if (upper) addMesh(ribbon(xs, ys.map((y) => y + 0.03), zs, half, 0), matAsphalt, `road-top:${side}`);
    }
  }

  // 3. instanced parts + structures (one InstancedMesh per kind)
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const addInstances = (name: string, geo: THREE.BufferGeometry, count: number, fill: (i: number, set: (x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number) => void) => void, maxDist: number): void => {
    if (count === 0) return;
    const im = new THREE.InstancedMesh(geo, matVertex, count);
    im.name = name;
    im.castShadow = true;
    im.receiveShadow = true;
    for (let i = 0; i < count; i++) {
      fill(i, (x, y, z, yaw, sx, sy, sz) => {
        q.setFromAxisAngle(up, -yaw);
        pos.set(x, y, z);
        scl.set(sx, sy, sz);
        m4.compose(pos, q, scl);
        im.setMatrixAt(i, m4);
      });
    }
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false; // bounding sphere of the base geometry would cull far instances
    void maxDist; // LOD distances (STRUCTURE_DEFS.lodFar) are for the game's camera loop; a viewer draws everything
    group.add(im);
    geos.push(geo);
    triangles += triCount(geo) * count;
  };

  for (const b of model.parts) {
    const n = b.data.length / b.stride;
    const d = b.data;
    if (b.kind === 'pier') addInstances('piers', pierGeo(), n, (i, set) => set(d[i * 5], d[i * 5 + 1], d[i * 5 + 2], d[i * 5 + 3], 1, d[i * 5 + 4], 1), 0);
    else if (b.kind === 'lamp') addInstances('lamps', lampGeo(), n, (i, set) => set(d[i * 5], d[i * 5 + 1], d[i * 5 + 2], d[i * 5 + 3], 1, d[i * 5 + 4], 1), 0);
    else addInstances('railPosts', railPostGeo(), n, (i, set) => set(d[i * 5], d[i * 5 + 1], d[i * 5 + 2], d[i * 5 + 3], 1, 1, 1), 0);
  }

  for (const b of model.structures) {
    const make = STRUCT_GEO[b.def];
    if (!make) continue; // an unknown def id is simply not drawn
    const n = b.data.length / b.stride;
    const d = b.data;
    addInstances(b.def, make(), n, (i, set) => {
      const o = i * 6;
      const s = d[o + 4];
      if (b.def === 'arch') set(d[o], d[o + 1], d[o + 2], d[o + 3], 1, 1, s / ARCH_W); // scale = width across the road (m): only z is stretched
      else if (b.def === 'billboard') set(d[o], d[o + 1], d[o + 2], d[o + 3], 1, 1, 1);
      else set(d[o], d[o + 1], d[o + 2], d[o + 3], s, s, s);
    }, 0);
  }

  // 4. retaining walls along embankment stretches
  const byId = new Map(model.ramps.map((r) => [r.id, r] as const));
  for (const w of model.walls) {
    const r = byId.get(w.ramp);
    if (r) addMesh(wallRibbon(r, w.side, w.i0, w.i1, ground), matConcrete, `wall:${w.ramp}:${w.side}`);
  }

  // 5. infield discs (garden = grass, pond = water); the pavilion / fountain / palms stand on them
  for (const z of model.zones) {
    const g = new THREE.CircleGeometry(z.radius, 40);
    g.rotateX(-Math.PI / 2);
    g.translate(z.x, ground(z.x, z.z) + 0.06, z.z);
    addMesh(g, z.kind === 'pond' ? matPond : matGarden, `zone:${z.kind}`);
  }

  return {
    group,
    triangles: Math.round(triangles),
    dispose: (): void => {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

// ---------- AT-GRADE 3-WAY JUNCTION (no flyover) ----------
import { junction3Geometry } from './Junction3Geometry';

export interface Junction3Options {
  kind: 'T' | 'Y';
  /** Half width of one highway (m); default 12.7 = 3 lanes of 3.5 m each way + median + shoulders. */
  halfWidth?: number;
  lanesPerDir?: number;
  laneW?: number;
  /** Kerb radius of the three corners (m). */
  cornerR?: number;
  /** Arm length from the centre (m). */
  armLength?: number;
  medianW?: number;
}

export function buildJunction3Object(o: Junction3Options): InterchangeObject {
  const W = o.halfWidth ?? 12.7;
  const laneW = o.laneW ?? 3.5;
  const lanes = o.lanesPerDir ?? 3;
  const R = o.cornerR ?? 30;
  const L = o.armLength ?? 260;
  const medW = o.medianW ?? 2.4;
  const G = junction3Geometry(o.kind, W, R);
  const group = new THREE.Group();
  group.name = `junction3:${o.kind}`;
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  let triangles = 0;
  const matAsphalt = new THREE.MeshStandardMaterial({ color: COL.asphalt, roughness: 0.95, side: THREE.DoubleSide });
  const matVertex = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  mats.push(matAsphalt, matVertex);
  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string): void => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
    geos.push(g);
    triangles += triCount(g);
  };

  // the pad: triangle fan from the centre over the outline
  const pos: number[] = [];
  const idx: number[] = [];
  pos.push(0, 0, 0);
  for (const p of G.outline) pos.push(p.x, 0, p.z);
  for (let i = 0; i < G.outline.length; i++) idx.push(0, 1 + i, 1 + ((i + 1) % G.outline.length));
  const pad = new THREE.BufferGeometry();
  pad.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pad.setIndex(idx);
  pad.computeVertexNormals();
  add(pad, matAsphalt, 'pad');

  // arm strips + markings (white lines, median, stop bars)
  const marks: Part[] = [];
  // a thin / low box on an arm: t0..t1 along the arm, centred at lateral offset `lat`, `wide` across, `h` high, from height y
  const armBox = (a: number, t0: number, t1: number, lat: number, wide: number, y: number, h: number, color: number): Part => {
    const g = new THREE.BoxGeometry(t1 - t0, h, wide);
    const c = (t0 + t1) / 2;
    g.rotateY(-a);
    g.translate(Math.cos(a) * c - Math.sin(a) * lat, y + h / 2, Math.sin(a) * c + Math.cos(a) * lat);
    return { geo: g, color };
  };
  for (const a of G.angles) {
    const x0 = Math.cos(a) * G.s;
    const z0 = Math.sin(a) * G.s;
    const x1 = Math.cos(a) * L;
    const z1 = Math.sin(a) * L;
    add(ribbon([x0, x1], [0, 0], [z0, z1], W, 0), matAsphalt, 'arm');
    // median island (starts 14 m back from the stop line, nose at the junction)
    marks.push(armBox(a, G.s + 14, L, 0, medW, 0.02, 0.22, COL.concrete));
    // edge lines + lane dividers (both directions)
    for (const sgn of [-1, 1]) {
      marks.push(armBox(a, G.s + 1, L, sgn * (W - 0.6), 0.2, 0.02, 0.03, 0xffffff));
      for (let j = 1; j < lanes; j++) {
        const lat = sgn * (medW / 2 + j * laneW);
        for (let t = G.s + 16; t < L - 3; t += 9) marks.push(armBox(a, t, t + 3, lat, 0.15, 0.02, 0.03, 0xffffff));
      }
    }
    // stop bar across the incoming half (left-hand traffic: incoming vehicles keep to the arm's right side)
    marks.push(armBox(a, G.s + 0.8, G.s + 1.4, -(medW / 2 + (W - medW / 2) / 2), W - medW / 2 - 0.4, 0.02, 0.03, 0xffffff));
  }
  add(mergeParts(marks), matVertex, 'markings');

  return {
    group,
    triangles: Math.round(triangles),
    dispose: (): void => {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

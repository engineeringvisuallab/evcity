// CITY MALL, 10 FLOORS (Steps C1, C2, R1): ONE glass building, 10 x 5 m = 50 m high, whose footprint is the WHOLE building outline (MALL_BUILDING_LOCAL, ~109,500 m2 per floor,
// no podium, no separate tower). In the middle (centre = the block origin) a round ATRIUM of 100 m diameter is open from the ground up to the roof; the glass dome closes it.
// Floors 1..9 are slabs = outline minus the atrium minus the stair / lift holes. The roof is solid over the atrium too (no rain comes in), the dome above it is glass only.
//
// STEP R1 (26 Nov, user decisions): 2 entrances only, on the road sides (MALL_DOORS: east + north); ONE stair + ONE lift on each of two sides (west, east) of the atrium (MallCores.ts);
// outside the glass only a very small open area (a walkway). The old 12 zones / 36 products are gone for now (empty floors); step C3 lays the real shops out.
//
// Local origin = the atrium centre at floor level (y = 0 is the ground floor). Place it in the city with: mall.group.position.set(x, groundY, z); mall.group.rotation.y = yaw;
//
// PERFORMANCE (PERFORMANCE_RULES.md): the glass wall is ONE merged mesh, mullions / floor bands / columns / lights are InstancedMeshes, the dome ribs are one merged mesh. The things that fill a
// floor (columns, ceiling lights, atrium rail) are built LAZILY per floor (ensureFloor) and their Rapier colliders are listed per floor (floorSolids / floorObbs) so the game only keeps
// the colliders of the floor the player is on (MallColliders.ts). No lights, no shadows, no per-frame allocation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Catalog, Category, Product } from './MallCatalog';
import { stdMat } from './ProductModels';
import { MALL_FLOORS, MALL_FH, MALL_ATRIUM_R, MALL_SLAB, MALL_BUILDING_LOCAL, MALL_DOORS } from './MallSite';
import { buildCores, type CoresBuild } from './MallCoreBuilder';
import { coreHoles, type PickAction } from './MallCores';
import { floorLayout, insidePoly, GRID } from './MallLayout';

export const MALL = { FH: MALL_FH, floors: MALL_FLOORS, H: MALL_FH * MALL_FLOORS, atriumR: MALL_ATRIUM_R, slabT: MALL_SLAB, doorW: 10, doorH: 3.6, grid: GRID };

export interface PickInfo { title: string; sub: string; url: string; /** STEP C2: a lift button (call / panel); MallManager runs it instead of opening a link. */ action?: PickAction }
/** An axis-aligned solid in the group's LOCAL space. */
export interface Solid { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
/** A ramp: a slab rising along x from (x0, y0) to (x1, y1), `width` wide, centred on z = zc. */
export interface Ramp { x0: number; y0: number; x1: number; y1: number; zc: number; width: number; thick: number }
/** 2D rectangle (kept for other modules that import it). */
export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
/** An oriented (turned about y) box in the group's LOCAL space: the glass curtain wall. rot = turn about +y (three.js / Rapier convention). */
export interface Obb { cx: number; cz: number; hx: number; hz: number; rot: number; y0: number; y1: number }
/** A flat walkable / roof surface (triangles, local space) for the floor slabs that are not rectangles. */
export interface MeshSolid { vertices: Float32Array; indices: Uint32Array }
export interface MallItem { product: Product; category: Category; viewPos: THREE.Vector3; yaw: number }
export interface ShopInfo { category: Category; floor: number; viewPos: THREE.Vector3; yaw: number }
export interface MallBuild {
  group: THREE.Group; roof: THREE.Group;
  /** Everything inside one floor (columns, lights, atrium rail, later shops) - index = floor. Outer walls and slabs are not in here. Filled lazily: call ensureFloor(f). */
  floors: THREE.Group[];
  /** Always-on colliders: stair / lift cores, billboards, ... (local space). */
  solids: Solid[];
  /** Always-on turned colliders: the glass curtain wall. */
  obbs: Obb[];
  /** Always-on triangle colliders: the ground floor, the 9 upper floor slabs, the roof. */
  meshSolids: MeshSolid[];
  /** STEP R1: colliders that belong to ONE floor (columns, atrium balustrade, later shelves): the game keeps only the floor(s) the player is on. Index = floor. */
  floorSolids: Solid[][]; floorObbs: Obb[][];
  /** STEP R1: build what stands on floor f (columns, ceiling lights, atrium rail) the first time it is needed. */
  ensureFloor(f: number): void;
  ramps: Ramp[];                  // sloped walking surfaces (+ their own railing solids in `rampRails`)
  rampRails: { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number; rotZ: number }[];
  pickables: THREE.Object3D[];    // objects with userData.pick (PickInfo)
  blockers: THREE.Object3D[];     // walls and slabs: products behind them can't be picked
  shops: ShopInfo[]; items: MallItem[]; spawn: THREE.Vector3; spawnYaw: number;
  /** Walkable height at (x, z) for something standing at height y (viewer / tests). */
  surfaceAt(x: number, z: number, y: number): number;
  /** STEP C2: the stair + lift cores (MallLiftControl drives the lift views). */
  cores: CoresBuild;
  update(dt: number): void; dispose(): void;
}

const FONT = '"Noto Sans Bengali", "Segoe UI", sans-serif';
const ACCENT = 0xf97316;
export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function fitText(c: CanvasRenderingContext2D, text: string, size: number, weight: number, maxW: number): void {
  let s = size;
  do { c.font = `${weight} ${s}px ${FONT}`; s -= 2; } while (c.measureText(text).width > maxW && s > 10);
}
export function signMesh(w: number, h: number, title: string, sub: string, accent: number): THREE.Mesh {
  const tex = canvasTex(1024, Math.round((1024 * h) / w), (c) => {
    const W = c.canvas.width, H = c.canvas.height;
    c.fillStyle = '#0f172a'; c.fillRect(0, 0, W, H);
    c.fillStyle = hex(accent); c.fillRect(0, H - 14, W, 14); c.fillRect(0, 0, 18, H);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    fitText(c, title, H * 0.42, 700, W * 0.88); c.fillText(title, W / 2, H * 0.4);
    c.fillStyle = '#cbd5e1';
    fitText(c, sub, H * 0.2, 500, W * 0.88); c.fillText(sub, W / 2, H * 0.74);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

type R2 = [number, number, number, number]; // x0, x1, z0, z1
type Pt = [number, number]; // x, z

/** Rectangle `r` minus the (axis-aligned) `holes`: returns the remaining pieces. */
export function rectMinus(r: R2, holes: R2[]): R2[] {
  const xs = new Set<number>([r[0], r[1]]);
  for (const h of holes) for (const x of [h[0], h[1]]) if (x > r[0] && x < r[1]) xs.add(x);
  const xb = [...xs].sort((a, b) => a - b), out: R2[] = [];
  for (let i = 0; i + 1 < xb.length; i++) {
    const xa = xb[i], xc = xb[i + 1], xm = (xa + xc) / 2;
    const cuts = holes.filter((h) => xm > h[0] && xm < h[1]).map((h) => [Math.max(h[2], r[2]), Math.min(h[3], r[3])] as [number, number]).sort((a, b) => a[0] - b[0]);
    let z = r[2];
    for (const [c0, c1] of cuts) { if (c0 > z) out.push([xa, xc, z, c0]); z = Math.max(z, c1); }
    if (z < r[3]) out.push([xa, xc, z, r[3]]);
  }
  return out;
}

export function buildMall(_catalog: Catalog): MallBuild {
  const { FH, floors: NF, H, atriumR, slabT, doorW, doorH: DOOR_H } = MALL;
  const CEIL = FH - slabT; // underside of the slab above = ceiling height of every storey
  const g = new THREE.Group(); g.name = 'CityMall';
  const roof = new THREE.Group(); roof.name = 'MallRoof'; g.add(roof);
  const solids: Solid[] = [], pickables: THREE.Object3D[] = [], blockers: THREE.Object3D[] = [];
  const roofM = stdMat(0xe2e8f0, 0, 0.9), darkM = stdMat(0x1e293b, 0.3, 0.6), accM = stdMat(ACCENT, 0.3, 0.4);
  const obbs: Obb[] = [], meshSolids: MeshSolid[] = [];
  const BP = MALL_BUILDING_LOCAL.map(([x, z]) => [x, z] as Pt);
  const nBP = BP.length;

  const insideBP = (x: number, z: number): boolean => insidePoly(BP, x, z);
  const shapeOf = (poly: Pt[]) => new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const flip = (q: Pt[]) => q.map(([x, z]) => new THREE.Vector2(x, -z));
  /** A flat triangle collider (one face at height y) for a polygon with optional holes. Indices go into outer + hole1 + hole2 ... */
  const flatMesh = (outer: Pt[], holes: Pt[][], y: number): MeshSolid => {
    const tris = THREE.ShapeUtils.triangulateShape(flip(outer), holes.map(flip));
    const all: Pt[] = [...outer, ...holes.flat()];
    const v = new Float32Array(all.length * 3);
    all.forEach(([x, z], i) => { v[i * 3] = x; v[i * 3 + 1] = y; v[i * 3 + 2] = z; });
    return { vertices: v, indices: Uint32Array.from(tris.flat()) };
  };
  /** A CLOSED solid (top, bottom, sides) for a polygon between y0 and y1: the roof collider (nothing tunnels through a helicopter landing on it). */
  const closedPrism = (poly: Pt[], y0: number, y1: number): MeshSolid => {
    const n = poly.length, tris = THREE.ShapeUtils.triangulateShape(flip(poly), []);
    const v = new Float32Array(n * 2 * 3);
    poly.forEach(([x, z], i) => { v.set([x, y0, z], i * 3); v.set([x, y1, z], (n + i) * 3); });
    const idx: number[] = [];
    for (const [a, b, c] of tris) { idx.push(n + a, n + b, n + c); idx.push(a, c, b); }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(i, j, n + j, i, n + j, n + i); }
    return { vertices: v, indices: Uint32Array.from(idx) };
  };
  /** A flat polygon slab (top at y0 + thick) as a mesh in `parent`. */
  const prism = (poly: Pt[], y0: number, thick: number, m: THREE.Material, parent: THREE.Object3D): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeOf(poly), { depth: thick, bevelEnabled: false }), m);
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = y0; parent.add(mesh);
    return mesh;
  };
  const circle = (r: number, n = 96): Pt[] => Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return [Math.cos(t) * r, Math.sin(t) * r] as Pt; });
  const atriumHole = circle(atriumR);
  /** The holes cut in the slab of floor f (f >= 1): the atrium + the stair well over flight B and the two lift shafts, on both sides (STEP C2, moved out by R1). */
  const holesFor = (f: number): Pt[][] => [atriumHole, ...coreHoles(f)];
  /** A polygon slab WITH HOLES: mesh + (optional) triangle collider on its top face. */
  const slabHoles = (outer: Pt[], holes: Pt[][], y0: number, thick: number, m: THREE.Material, parent: THREE.Object3D, col: boolean): THREE.Mesh => {
    const shape = new THREE.Shape(flip(outer));
    for (const h of holes) shape.holes.push(new THREE.Path(flip(h)));
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false }), m);
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = y0; parent.add(mesh);
    if (col) { meshSolids.push(flatMesh(outer, holes, y0 + thick)); blockers.push(mesh); }
    return mesh;
  };
  const slabBox = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, m: THREE.Material, parent: THREE.Object3D) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    parent.add(mesh);
    return mesh;
  };

  const floorGroups: THREE.Group[] = [];
  for (let f = 0; f < NF; f++) { const fg = new THREE.Group(); fg.name = `Floor${f}`; fg.position.y = f * FH; g.add(fg); floorGroups.push(fg); } // filled by ensureFloor(f)

  // ---- concrete base under the whole building; the ROOF (collider = the whole outline as a closed solid, so it is solid over the atrium too; the visible roof has the atrium hole, the dome closes it) ----
  prism(BP, -1.62, 1.6, stdMat(0x94a3b8, 0, 0.95), g);
  blockers.push(slabHoles(BP, [atriumHole], H - slabT, slabT, roofM, roof, false));
  meshSolids.push(closedPrism(BP, H - slabT, H));

  // ---- the floor tiles: one tiled polygon for the whole ground floor (uv = metres, 6 m per texture = 3 m squares) + a flat collider ----
  const tileTex = canvasTex(128, 128, (c) => {
    c.fillStyle = '#e5e7eb'; c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#d1d5db'; c.fillRect(0, 0, 64, 64); c.fillRect(64, 64, 64, 64);
  });
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  tileTex.repeat.set(1 / 6, 1 / 6);
  const tileM = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.25, metalness: 0.1 });
  {
    const ground = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(BP)), tileM);
    ground.rotation.x = -Math.PI / 2; ground.position.y = 0.005; g.add(ground);
    meshSolids.push(flatMesh(BP, [], 0));
  }
  // ---- FLOORS 1..9: a slab over the whole outline minus the atrium + stair / lift holes (tile top = the floor, tiled ceiling underneath). Walkable: triangle collider on the top face ----
  for (let f = 1; f < NF; f++) slabHoles(BP, holesFor(f), f * FH - slabT, slabT, tileM, g, true);

  // ---- THE GLASS WALL: the whole outline, 50 m high (ONE merged glass mesh), a doorway at each of the 2 entrances, steel mullions every ~4 m, a dark band at every floor level ----
  const doorPoints: { sx: number; sz: number; nx: number; nz: number }[] = [];
  {
    const glassM = new THREE.MeshStandardMaterial({ color: 0xa5d8f0, transparent: true, opacity: 0.22, metalness: 0.7, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const frameM = stdMat(0x1e293b, 0.6, 0.4), bandM = stdMat(0x334155, 0.5, 0.4);
    const glassPos: number[] = [];
    const quad = (ax: number, az: number, bx: number, bz: number, y0: number, y1: number): void => { glassPos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az); };
    const posts: { x: number; z: number; rot: number }[] = [];
    const bands: { x: number; y: number; z: number; len: number; rot: number }[] = [];
    for (let i = 0; i < nBP; i++) {
      const A = BP[i], B = BP[(i + 1) % nBP];
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L, rot = Math.atan2(-uz, ux);
      let nx = -uz, nz = ux; if (nx * (A[0] + B[0]) + nz * (A[1] + B[1]) < 0) { nx = -nx; nz = -nz; } // outward normal (the building contains the origin)
      const at = (t: number): Pt => [A[0] + ux * t, A[1] + uz * t];
      // doorways on this edge
      const gaps: [number, number][] = [];
      for (const d of MALL_DOORS) {
        const t = (d.lx - A[0]) * ux + (d.lz - A[1]) * uz, off = Math.abs((d.lx - A[0]) * -uz + (d.lz - A[1]) * ux);
        if (off < 0.05 && t > doorW / 2 && t < L - doorW / 2) gaps.push([t - doorW / 2, t + doorW / 2]);
      }
      gaps.sort((p, q) => p[0] - q[0]);
      const piece = (a: number, b: number, y0: number, y1: number): void => { // one wall piece along the edge between distances a..b, heights y0..y1 (glass + collider)
        const len = b - a; if (len < 0.05) return;
        const P = at(a), Q = at(b);
        quad(P[0], P[1], Q[0], Q[1], y0, y1);
        const m = at((a + b) / 2);
        obbs.push({ cx: m[0], cz: m[1], hx: len / 2, hz: 0.25, rot, y0, y1 });
      };
      const open: [number, number][] = [];
      let from = 0;
      for (const [a, b] of gaps) { if (a > from) open.push([from, a]); from = b; }
      if (from < L) open.push([from, L]);
      for (const [a, b] of open) {
        piece(a, b, 0, H);
        const cnt = Math.max(1, Math.ceil((b - a) / 4));
        for (let k = 0; k <= cnt; k++) { const p = at(a + ((b - a) * k) / cnt); posts.push({ x: p[0], z: p[1], rot }); }
        const m = at((a + b) / 2);
        bands.push({ x: m[0], y: 0.45, z: m[1], len: b - a, rot }); // kick plate (not across the doorway)
      }
      for (const [a, b] of gaps) { // above the doorway: glass from 3.6 m up to the roof, a sign facing outwards, a short canopy
        piece(a, b, DOOR_H, H);
        const m = at((a + b) / 2);
        const sg = signMesh(doorW - 0.4, 0.95, 'CITY MALL', 'সিটি মল — স্বাগতম', ACCENT);
        sg.position.set(m[0] + nx * 0.4, (DOOR_H + CEIL) / 2, m[1] + nz * 0.4); sg.rotation.y = Math.atan2(nx, nz); g.add(sg);
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(b - a + 1, 0.25, 4), accM);
        canopy.position.set(m[0] + nx * 2.2, DOOR_H - 0.15, m[1] + nz * 2.2); canopy.rotation.y = rot; g.add(canopy);
        for (const t of [a, b]) { const p = at(t); posts.push({ x: p[0], z: p[1], rot }); }
        doorPoints.push({ sx: m[0], sz: m[1], nx, nz });
      }
      const mid = at(L / 2);
      for (let f = 1; f <= NF; f++) bands.push({ x: mid[0], y: f * FH - 0.2, z: mid[1], len: L + 0.2, rot }); // a band at every slab level (floor 1..9) + the parapet band at the roof
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(glassPos, 3));
    gg.computeVertexNormals();
    const glass = new THREE.Mesh(gg, glassM); glass.name = 'MallGlassWall'; g.add(glass);
    const dm = new THREE.Object3D();
    const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, H, 0.32), frameM, posts.length); postMesh.name = 'MallMullions';
    posts.forEach((q, i) => { dm.position.set(q.x, H / 2, q.z); dm.rotation.set(0, q.rot, 0); dm.scale.set(1, 1, 1); dm.updateMatrix(); postMesh.setMatrixAt(i, dm.matrix); });
    g.add(postMesh);
    const bandMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.9, 0.36), bandM, bands.length); bandMesh.name = 'MallFloorBands';
    bands.forEach((q, i) => { dm.position.set(q.x, q.y, q.z); dm.rotation.set(0, q.rot, 0); dm.scale.set(q.len, 1, 1); dm.updateMatrix(); bandMesh.setMatrixAt(i, dm.matrix); });
    g.add(bandMesh);
  }

  // ---- rooftop billboards above the two entrances, so the mall is easy to spot from the roads ----
  for (const d of doorPoints) {
    const px = d.sx - d.nx * 2, pz = d.sz - d.nz * 2, yaw = Math.atan2(d.nx, d.nz);
    const back = slabBox(-20.2, 20.2, -0.2, 0.2, H + 0.2, H + 6.6, darkM, roof); // dark backing board (40.4 x 6.4 x 0.4), turned to face outwards
    back.position.x = px - d.nx * 0.3; back.position.z = pz - d.nz * 0.3; back.rotation.y = yaw;
    const bb = signMesh(40, 6, 'CITY MALL', 'Shop · Eat · Play', ACCENT);
    bb.position.set(px, H + 3.4, pz); bb.rotation.y = yaw; roof.add(bb);
  }

  // ---- THE GLASS DOME closing the atrium (the roof below it is solid, so no rain comes in): a shallow spherical cap (rise 10 m) + 32 steel ribs + 4 rings, ribs merged in ONE mesh ----
  {
    const rb = atriumR + 0.4, hc = 10; // base radius, rise
    const Rs = (rb * rb + hc * hc) / (2 * hc), th = Math.asin(rb / Rs), cy = H + hc - Rs; // sphere centre height: the cap's base circle is at y = H
    const domeM = new THREE.MeshStandardMaterial({ color: 0xb8e4f7, transparent: true, opacity: 0.28, metalness: 0.6, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(Rs, 96, 16, 0, Math.PI * 2, 0, th), domeM);
    dome.position.y = cy; dome.name = 'MallDome'; roof.add(dome);
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 32; k++) {
      const ph = (k / 32) * Math.PI * 2, pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 12; i++) { const a = (i / 12) * th; pts.push(new THREE.Vector3(Rs * Math.sin(a) * Math.cos(ph), cy + Rs * Math.cos(a), Rs * Math.sin(a) * Math.sin(ph))); }
      parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.12, 6));
    }
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const a = t * th, pts: THREE.Vector3[] = [];
      for (let i = 0; i < 96; i++) { const ph = (i / 96) * Math.PI * 2; pts.push(new THREE.Vector3(Rs * Math.sin(a) * Math.cos(ph), cy + Rs * Math.cos(a), Rs * Math.sin(a) * Math.sin(ph))); }
      parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, t === 1 ? 0.25 : 0.1, 6, true));
    }
    const frame = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (frame) { const fm = new THREE.Mesh(frame, stdMat(0x1e293b, 0.6, 0.4)); fm.name = 'MallDomeFrame'; roof.add(fm); }
  }

  // ---- STEP C2 (moved out to the atrium edge by R1): the stair cores + the glass lifts (numbers in MallCores.ts, drawing + colliders in MallCoreBuilder.ts) ----
  const holeRects = coreHoles(1).map((h) => [Math.min(...h.map((p) => p[0])), Math.max(...h.map((p) => p[0])), Math.min(...h.map((p) => p[1])), Math.max(...h.map((p) => p[1]))]);
  const inCoreHole = (x: number, z: number): boolean => holeRects.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
  const cores = buildCores(g, floorGroups, { canvasTex, fitText, stdMat });
  solids.push(...cores.solids); meshSolids.push(...cores.meshSolids); pickables.push(...cores.pickables);

  // ---- THE COLUMN GRID + CEILING LIGHTS of every storey (positions: MallLayout.ts; here the colliders; the meshes come with ensureFloor) ----
  const { cols: COLS, lights: LIGHTS } = floorLayout(MALL_BUILDING_LOCAL, atriumR, GRID);
  const floorSolids: Solid[][] = Array.from({ length: NF }, (_, f) => COLS.map(([x, z]) => ({ minX: x - 0.5, maxX: x + 0.5, minY: f * FH, maxY: f * FH + CEIL, minZ: z - 0.5, maxZ: z + 0.5 })));
  const floorObbs: Obb[][] = Array.from({ length: NF }, () => []);
  const RAIL_R = atriumR + 0.3, RAIL_H = 1.1, RAIL_SEG = 64;
  for (let f = 1; f < NF; f++) {
    const y = f * FH;
    for (let k = 0; k < RAIL_SEG; k++) {
      const t = ((k + 0.5) / RAIL_SEG) * Math.PI * 2; // tangent of the ring there: (-sin t, cos t)
      floorObbs[f].push({ cx: Math.cos(t) * RAIL_R, cz: Math.sin(t) * RAIL_R, hx: (Math.PI * RAIL_R) / RAIL_SEG + 0.05, hz: 0.1, rot: Math.atan2(-Math.cos(t), -Math.sin(t)), y0: y, y1: y + 1.3 });
    }
  }
  // shared geometry + materials of the lazily built floors
  const colGeo = new THREE.BoxGeometry(1, CEIL, 1), colM = stdMat(0xcbd5e1, 0.1, 0.6);
  const lightGeo = new THREE.PlaneGeometry(6, 0.5); lightGeo.rotateX(Math.PI / 2); const lightM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const railGeo = new THREE.CylinderGeometry(RAIL_R, RAIL_R, RAIL_H, 96, 1, true), handGeo = new THREE.TorusGeometry(RAIL_R, 0.045, 6, 192);
  const railM = new THREE.MeshStandardMaterial({ color: 0xbfe6f5, transparent: true, opacity: 0.25, metalness: 0.6, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
  const handM = stdMat(0xcbd5e1, 0.8, 0.3);
  const built = new Set<number>();
  const ensureFloor = (f: number): void => {
    if (f < 0 || f >= NF || built.has(f)) return;
    built.add(f);
    const fg = floorGroups[f], m4 = new THREE.Matrix4();
    const cm = new THREE.InstancedMesh(colGeo, colM, COLS.length); cm.name = `Columns${f}`;
    COLS.forEach(([x, z], i) => { m4.makeTranslation(x, CEIL / 2, z); cm.setMatrixAt(i, m4); });
    fg.add(cm);
    const lm = new THREE.InstancedMesh(lightGeo, lightM, LIGHTS.length); lm.name = `CeilingLights${f}`;
    LIGHTS.forEach(([x, z], i) => { m4.makeTranslation(x, CEIL - 0.02, z); lm.setMatrixAt(i, m4); });
    fg.add(lm);
    if (f >= 1) { // the glass balustrade + handrail round the atrium hole
      const gl = new THREE.Mesh(railGeo, railM); gl.position.y = RAIL_H / 2; fg.add(gl);
      const hand = new THREE.Mesh(handGeo, handM); hand.rotation.x = Math.PI / 2; hand.position.y = RAIL_H; fg.add(hand);
    }
  };

  const E = MALL_DOORS.find((d) => d.id === 'E') ?? MALL_DOORS[0];
  return {
    group: g, roof, floors: floorGroups, solids, obbs, meshSolids, floorSolids, floorObbs, ensureFloor, ramps: cores.ramps, rampRails: cores.rampRails, cores, pickables, blockers, shops: [], items: [],
    spawn: new THREE.Vector3(E.lx + 8, 0, E.lz), spawnYaw: Math.PI / 2,
    surfaceAt: (x, z, y) => { // the floor level under (x, z) for something at height y (floors 1..9 only inside the outline and outside the atrium hole / the core holes)
      for (let f = Math.min(NF - 1, Math.floor((y + 0.3) / FH)); f >= 1; f--) if (Math.hypot(x, z) > atriumR && insideBP(x, z) && !inCoreHole(x, z)) return f * FH;
      return 0;
    },
    update() { /* nothing animates in the shell (the lifts are driven by MallLiftControl) */ },
    dispose() {
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material & { map?: THREE.Texture | null } | undefined;
        mat?.map?.dispose?.();
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
    },
  };
}

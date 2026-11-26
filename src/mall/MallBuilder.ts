// CITY MALL, 10 FLOORS (Step C1): a 50 m glass tower (96 x 64 m block, 10 x 5 m storeys) standing on a one-storey glass podium (the ground concourse + wings that follow the roads).
// The tower has a 20 m round ATRIUM in the middle (open from floor 1 up), closed on top by a glass dome. Floors 1..9 are slabs with the atrium hole (Step C2 cuts stair / lift holes too).
// (older text:) City Mall - ONE big glass hall built as ONE THREE.Group (local origin = centre of the hall's floor, y = 0 is the floor level).
// Place it in the city with: mall.group.position.set(x, groundY, z); mall.group.rotation.y = yaw;
//
// The BUILDING is not a box: its outline follows the roads around it (MALL_BUILDING_LOCAL) and the whole outline is a glass curtain wall,
// 14 m high = the height of the old two floors put together. Inside: ONE open hall, no walls, no upper floor, no ramp. The products stand
// openly on pedestals, grouped in ZONES (one per category, 6 columns x 2 rows, a wide aisle along the middle between the two doorways):
//   west part = Supermarket & Food (8 zones), east part = Fashion (4 zones). Each zone: coloured floor patch, hanging name sign,
//   3 turntable products (click = its page on the live shop), a "view all" board and a shopkeeper at the back.
// A 10 m doorway at each end (west + east).
import * as THREE from 'three';
import { Catalog, Category, FLOORS, Product, categoryUrl, productUrl } from './MallCatalog';
import { makePerson, makeProductModel, stdMat } from './ProductModels';
import { MALL_SIZE, MALL_FLOORS, MALL_FH, MALL_ATRIUM_R, MALL_SLAB, MALL_BUILDING_LOCAL, MALL_DOORS } from './MallSite';

export const MALL = { W: MALL_SIZE.W, D: MALL_SIZE.D, FH: MALL_FH, floors: MALL_FLOORS, H: MALL_FH * MALL_FLOORS, atriumR: MALL_ATRIUM_R, slabT: MALL_SLAB, corridor: 7, shopW: 18, doorW: 10, perShop: 3 };

export interface PickInfo { title: string; sub: string; url: string }
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
  /** Everything inside one floor (shops, products, signs) - index = floor. Outer walls and slabs are not in here. */
  floors: THREE.Group[];
  solids: Solid[];                // axis-aligned colliders (walls, slabs, shelves, pedestals), local space
  obbs: Obb[];                    // turned colliders: the glass curtain wall that follows the roads
  meshSolids: MeshSolid[];        // flat triangle colliders: floors / roofs of the wings around the block
  ramps: Ramp[];                  // sloped walking surfaces (+ their own railing solids in `rampRails`)
  rampRails: { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number; rotZ: number }[];
  pickables: THREE.Object3D[];    // objects with userData.pick (PickInfo)
  blockers: THREE.Object3D[];     // walls and slabs: products behind them can't be picked
  shops: ShopInfo[]; items: MallItem[]; spawn: THREE.Vector3; spawnYaw: number;
  /** Walkable height at (x, z) for something standing at height y (viewer / tests). */
  surfaceAt(x: number, z: number, y: number): number;
  update(dt: number): void; dispose(): void;
}

const FONT = '"Noto Sans Bengali", "Segoe UI", sans-serif';
const ACCENT = 0xf97316;
export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

const taka = (n: number) => '৳ ' + n.toLocaleString('bn-BD');

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
function tagSprite(p: Product, accent: number): THREE.Sprite {
  const tex = canvasTex(512, 170, (c) => {
    c.fillStyle = 'rgba(15,23,42,0.9)';
    c.beginPath(); c.roundRect(4, 4, 504, 162, 22); c.fill();
    c.fillStyle = hex(accent); c.fillRect(4, 150, 504, 16);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
    fitText(c, p.name, 46, 700, 470); c.fillText(p.name, 256, 54);
    c.fillStyle = hex(accent);
    fitText(c, taka(p.price), 54, 700, 470); c.fillText(taka(p.price), 256, 110);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true }));
  s.scale.set(2.5, 0.83, 1);
  return s;
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

export function buildMall(catalog: Catalog): MallBuild {
  const { W, D, FH, floors: NF, H, doorW, atriumR, slabT } = MALL;
  const CEIL = FH - slabT; // underside of the floor-1 slab = ceiling of the ground concourse = height of the podium (the glass wall round the whole outline)
  const DOOR_H = 3.6; // the two 10 m doorways
  const g = new THREE.Group(); g.name = 'CityMall';
  const roof = new THREE.Group(); roof.name = 'MallRoof'; g.add(roof);
  const solids: Solid[] = [], pickables: THREE.Object3D[] = [], blockers: THREE.Object3D[] = [], spinners: THREE.Object3D[] = [], shops: ShopInfo[] = [], allItems: MallItem[] = [];
  const roofM = stdMat(0xe2e8f0, 0, 0.9), darkM = stdMat(0x1e293b, 0.3, 0.6), accM = stdMat(ACCENT, 0.3, 0.4);
  const hx = W / 2, hz = D / 2;
  const obbs: Obb[] = [], meshSolids: MeshSolid[] = [];
  const BP = MALL_BUILDING_LOCAL.map(([x, z]) => [x, z] as Pt);

  /** Part of polygon `poly` where a*x + b*z <= c (Sutherland-Hodgman). */
  const clip = (poly: Pt[], a: number, b: number, c: number): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length];
      const dp = a * P[0] + b * P[1] - c, dq = a * Q[0] + b * Q[1] - c;
      if (dp <= 0) out.push(P);
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { const t = dp / (dp - dq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
    }
    return out;
  };
  const area = (poly: Pt[]): number => Math.abs(poly.reduce((acc, p, i) => { const q = poly[(i + 1) % poly.length]; return acc + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  /** The parts of the building around the block, as polygons: west lobby, east lobby, north strip, south strip (the last two optionally cut at x <= xMax). */
  const wingPieces = (westOnly: boolean): Pt[][] => {
    const west = clip(BP, 1, 0, -hx);
    const midBand = clip(clip(BP, -1, 0, hx), 1, 0, westOnly ? 0 : hx); // -hx <= x <= (0 | hx)
    const north = clip(midBand, 0, 1, -hz), south = clip(midBand, 0, -1, -hz);
    const east = westOnly ? [] : clip(BP, -1, 0, -hx);
    return [west, east, north, south].filter((q) => q.length >= 3 && area(q) > 0.5);
  };
  const shapeOf = (poly: Pt[]) => new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  /** A flat polygon slab (top at y0 + thick) as a mesh in `parent` + (optionally) a triangle collider on its top face. */
  const prism = (poly: Pt[], y0: number, thick: number, m: THREE.Material, parent: THREE.Object3D, col: boolean): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeOf(poly), { depth: thick, bevelEnabled: false }), m);
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = y0; parent.add(mesh);
    if (col) {
      const contour = poly.map(([x, z]) => new THREE.Vector2(x, -z));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const v = new Float32Array(poly.length * 3);
      poly.forEach(([x, z], i) => { v[i * 3] = x; v[i * 3 + 1] = y0 + thick; v[i * 3 + 2] = z; });
      meshSolids.push({ vertices: v, indices: Uint32Array.from(tris.flat()) });
      blockers.push(mesh);
    }
    return mesh;
  };
  const floorGroups: THREE.Group[] = [];
  for (let f = 0; f < NF; f++) { const fg = new THREE.Group(); fg.name = `Floor${f}`; fg.position.y = f * FH; g.add(fg); floorGroups.push(fg); } // empty: nothing stands inside any more

  const slab = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, m: THREE.Material, col = false, parent: THREE.Object3D = g) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    parent.add(mesh);
    if (col) { solids.push({ minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1 }); blockers.push(mesh); }
    return mesh;
  };
  const faceCorridor = (m: THREE.Object3D, sgn: number) => { m.rotation.y = sgn > 0 ? Math.PI : 0; };
  const plane = (w: number, d: number, x: number, y: number, z: number, m: THREE.Material, rx = -Math.PI / 2, parent: THREE.Object3D = g) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    mesh.rotation.x = rx; mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  };

  // ---- a polygon slab WITH HOLES (atrium, later stair / lift shafts): mesh + (optional) triangle collider on its top face ----
  const circle = (r: number, n = 48): Pt[] => Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return [Math.cos(t) * r, Math.sin(t) * r] as Pt; });
  const rectPoly: Pt[] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  const atriumHole = circle(atriumR);
  /** The holes cut in the slab of floor f (f >= 1). STEP C2 adds the stair + lift openings here. */
  const holesFor = (_f: number): Pt[][] => [atriumHole];
  const slabHoles = (outer: Pt[], holes: Pt[][], y0: number, thick: number, m: THREE.Material, parent: THREE.Object3D, col: boolean): THREE.Mesh => {
    const flip = (q: Pt[]) => q.map(([x, z]) => new THREE.Vector2(x, -z));
    const shape = new THREE.Shape(flip(outer));
    for (const h of holes) shape.holes.push(new THREE.Path(flip(h)));
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false }), m);
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = y0; parent.add(mesh);
    if (col) {
      const tris = THREE.ShapeUtils.triangulateShape(flip(outer), holes.map(flip)); // indices into outer + hole1 + hole2 ...
      const all: Pt[] = [...outer, ...holes.flat()];
      const v = new Float32Array(all.length * 3);
      all.forEach(([x, z], i) => { v[i * 3] = x; v[i * 3 + 1] = y0 + thick; v[i * 3 + 2] = z; });
      meshSolids.push({ vertices: v, indices: Uint32Array.from(tris.flat()) });
      blockers.push(mesh);
    }
    return mesh;
  };

  // ---- concrete podium under the whole building; the ROOF (collider = the whole rectangle, solid over the atrium too; the visible roof has the atrium hole, the glass dome closes it) ----
  prism(BP, -1.62, 1.6, stdMat(0x94a3b8, 0, 0.95), g, false);
  slab(-hx, hx, -hz, hz, H - slabT, H, roofM, true, roof).visible = false; // collider + pick blocker only
  slabHoles(rectPoly, [atriumHole], H - slabT, slabT, roofM, roof, false);
  for (const q of wingPieces(false)) prism(q, CEIL, slabT, roofM, roof, true); // roof of the podium wings: same level as the floor-1 slab

  // ---- THE GLASS BUILDING: a curtain wall all the way round the outline (it follows the roads), 14 m high, with a 10 m doorway at each end of the corridor ----
  {
    const glassWallM = new THREE.MeshStandardMaterial({ color: 0xa5d8f0, transparent: true, opacity: 0.22, metalness: 0.7, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const WH = CEIL; // the outline wall is the PODIUM: it stops under the floor-1 slab level
    const frameM = stdMat(0x1e293b, 0.6, 0.4);
    const n = BP.length;
    const posts: { x: number; z: number; rot: number }[] = [];
    for (let i = 0; i < n; i++) {
      const A = BP[i], B = BP[(i + 1) % n];
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L, rot = Math.atan2(-uz, ux);
      // doorways on this edge: where the corridor axis (z = 0) crosses it
      const gaps: [number, number][] = [];
      for (const d of MALL_DOORS) {
        if ((A[1] > 0) === (B[1] > 0)) continue;
        const t = (d.lx - A[0]) * ux + (0 - A[1]) * uz; // distance of the door point along the edge
        if (t > 0 && t < L && Math.abs(A[0] + ux * t - d.lx) < 0.05) gaps.push([Math.max(0, t - doorW / 2), Math.min(L, t + doorW / 2)]);
      }
      // outward normal (away from the block's centre) for signs
      const mx0 = (A[0] + B[0]) / 2, mz0 = (A[1] + B[1]) / 2;
      let nx = -uz, nz = ux; if (nx * mx0 + nz * mz0 < 0) { nx = -nx; nz = -nz; }
      const span = (a: number, b: number, y0: number, y1: number, solid: boolean) => { // one wall piece along the edge between distances a..b, heights y0..y1
        const len = b - a; if (len < 0.05) return;
        const cx = A[0] + ux * (a + b) / 2, cz = A[1] + uz * (a + b) / 2;
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(len, y1 - y0), glassWallM);
        gl.position.set(cx, (y0 + y1) / 2, cz); gl.rotation.y = rot; g.add(gl);
        if (solid) obbs.push({ cx, cz, hx: len / 2, hz: 0.25, rot, y0, y1 });
      };
      const open: [number, number][] = [];
      let from = 0;
      for (const [a, b] of gaps.sort((p, q) => p[0] - q[0])) { if (a > from) open.push([from, a]); from = b; }
      if (from < L) open.push([from, L]);
      for (const [a, b] of open) {
        span(a, b, 0, WH, true);
        const cnt = Math.max(1, Math.ceil((b - a) / 3.6));
        for (let k = 0; k <= cnt; k++) { const t = a + ((b - a) * k) / cnt; posts.push({ x: A[0] + ux * t, z: A[1] + uz * t, rot }); }
        for (const [yy, hh] of [[0.45, 0.9], [WH - 0.15, 0.3]] as [number, number][]) { // kick plate, top cap
          const bar = new THREE.Mesh(new THREE.BoxGeometry(b - a, hh, 0.3), frameM);
          bar.position.set(A[0] + ux * (a + b) / 2, yy, A[1] + uz * (a + b) / 2); bar.rotation.y = rot; g.add(bar);
        }
      }
      for (const [a, b] of gaps) { // above the doorway: a glass lintel from 5 m up, a sign facing outwards
        span(a, b, DOOR_H, WH, false);
        obbs.push({ cx: A[0] + ux * (a + b) / 2, cz: A[1] + uz * (a + b) / 2, hx: (b - a) / 2, hz: 0.25, rot, y0: DOOR_H, y1: WH });
        const sg = signMesh(doorW - 0.4, 0.95, 'CITY MALL', 'সিটি মল — স্বাগতম', ACCENT);
        const mx = A[0] + ux * (a + b) / 2 + nx * 0.4, mz = A[1] + uz * (a + b) / 2 + nz * 0.4;
        sg.position.set(mx, (DOOR_H + WH) / 2, mz); sg.rotation.y = Math.atan2(nx, nz); g.add(sg);
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(b - a + 1, 0.25, 4), accM); // short canopy over the door
        canopy.position.set(A[0] + ux * (a + b) / 2 + nx * 2.2, DOOR_H - 0.15, A[1] + uz * (a + b) / 2 + nz * 2.2); canopy.rotation.y = rot; g.add(canopy);
        for (const t of [a, b]) posts.push({ x: A[0] + ux * t, z: A[1] + uz * t, rot });
      }
    }
    // all vertical frame posts in ONE InstancedMesh
    const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, WH, 0.32), frameM, posts.length);
    const dummy = new THREE.Object3D();
    posts.forEach((q, i) => { dummy.position.set(q.x, WH / 2, q.z); dummy.rotation.set(0, q.rot, 0); dummy.updateMatrix(); postMesh.setMatrixAt(i, dummy.matrix); });
    g.add(postMesh);
  }

  // rooftop billboards, one at each end, so the mall is easy to spot from the road on either side
  for (const sx of [-1, 1]) {
    slab(sx * (hx + 0.9) - 0.25, sx * (hx + 0.9) + 0.25, -15, 15, H, H + 5, darkM, false, roof);
    const bb = signMesh(29.6, 4.6, 'CITY MALL', 'Shop · Eat · Play', ACCENT);
    bb.position.set(sx * (hx + 1.17), H + 2.5, 0); bb.rotation.y = sx < 0 ? -Math.PI / 2 : Math.PI / 2; roof.add(bb);
  }
  // front + back roof signs facing the long sides
  for (const sz of [-1, 1]) {
    const bb = signMesh(40, 4.6, 'CITY MALL', 'সিটি মল — গ্লাস শপিং সেন্টার', ACCENT);
    bb.position.set(0, H + 2.2, sz * (hz + 0.1)); bb.rotation.y = sz < 0 ? Math.PI : 0; roof.add(bb);
  }

  // ---- the floor: tiles (3 m squares) over the whole block, the same tiles in the wings around it, and a flat collider so walking is smooth ----
  const tileTex = canvasTex(128, 128, (c) => {
    c.fillStyle = '#e5e7eb'; c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#d1d5db'; c.fillRect(0, 0, 64, 64); c.fillRect(64, 64, 64, 64);
  });
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  tileTex.repeat.set(W / 3, D / 3);
  plane(W, D, 0, 0.005, 0, new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.25, metalness: 0.1 }));
  const tileWing = tileTex.clone(); tileWing.needsUpdate = true; tileWing.repeat.set(1 / 6, 1 / 6);
  const tileWingM = new THREE.MeshStandardMaterial({ map: tileWing, roughness: 0.25, metalness: 0.1 });
  for (const q of wingPieces(false)) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(q)), tileWingM);
    m.rotation.x = -Math.PI / 2; m.position.y = 0.005; g.add(m);
    const tris = THREE.ShapeUtils.triangulateShape(q.map(([x, z]) => new THREE.Vector2(x, -z)), []);
    const v = new Float32Array(q.length * 3);
    q.forEach(([x, z], i) => { v[i * 3] = x; v[i * 3 + 1] = 0; v[i * 3 + 2] = z; });
    meshSolids.push({ vertices: v, indices: Uint32Array.from(tris.flat()) });
  }

  // ---- FLOORS 1..9: a slab over the whole block with the atrium hole (tile top = the floor, white ceiling underneath). Walkable: triangle collider on the top face ----
  for (let f = 1; f < NF; f++) slabHoles(rectPoly, holesFor(f), f * FH - slabT, slabT, tileWingM, g, true);

  // ---- ATRIUM EDGE: on every floor 1..9 a glass balustrade + handrail round the hole (and an invisible-to-the-eye collider ring of 24 turned boxes) ----
  {
    const railM = new THREE.MeshStandardMaterial({ color: 0xbfe6f5, transparent: true, opacity: 0.25, metalness: 0.6, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const handM = stdMat(0xcbd5e1, 0.8, 0.3);
    const rr = atriumR + 0.3, RH = 1.1, SEG = 24;
    for (let f = 1; f < NF; f++) {
      const y = f * FH;
      const gl = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, RH, 48, 1, true), railM); gl.position.y = y + RH / 2; g.add(gl);
      const hand = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.045, 6, 48), handM); hand.rotation.x = Math.PI / 2; hand.position.y = y + RH; g.add(hand);
      for (let k = 0; k < SEG; k++) {
        const t = ((k + 0.5) / SEG) * Math.PI * 2; // tangent of the ring there: (-sin t, cos t)
        obbs.push({ cx: Math.cos(t) * rr, cz: Math.sin(t) * rr, hx: (Math.PI * rr) / SEG + 0.05, hz: 0.1, rot: Math.atan2(-Math.cos(t), -Math.sin(t)), y0: y, y1: y + 1.3 });
      }
    }
  }

  // ---- GROUND FLOOR: the tower stands on columns round its edge (none on the entrance aisle z = 0) ----
  {
    const colPts: Pt[] = [];
    for (let x = -hx; x <= hx + 0.01; x += 8) colPts.push([x, -hz], [x, hz]);
    for (let z = -hz + 8; z < hz - 0.01; z += 8) { if (Math.abs(z) < 5) continue; colPts.push([-hx, z], [hx, z]); }
    const cm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, CEIL, 0.8), stdMat(0xcbd5e1, 0.1, 0.6), colPts.length);
    const dm = new THREE.Object3D();
    colPts.forEach(([x, z], i) => {
      dm.position.set(x, CEIL / 2, z); dm.updateMatrix(); cm.setMatrixAt(i, dm.matrix);
      solids.push({ minX: x - 0.4, maxX: x + 0.4, minY: 0, maxY: CEIL, minZ: z - 0.4, maxZ: z + 0.4 });
    });
    g.add(cm);
  }

  // ---- THE TOWER: glass walls round the block from the podium roof level up to the roof, steel mullions, a dark band at every floor level ----
  {
    const tH = H - CEIL;
    const towerGlassM = new THREE.MeshStandardMaterial({ color: 0xa5d8f0, transparent: true, opacity: 0.22, metalness: 0.7, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const edges = [
      { cx: 0, cz: -hz, len: W, rot: 0 }, { cx: 0, cz: hz, len: W, rot: 0 },
      { cx: -hx, cz: 0, len: D, rot: Math.PI / 2 }, { cx: hx, cz: 0, len: D, rot: Math.PI / 2 },
    ];
    const mulls: { x: number; z: number; rot: number }[] = [];
    const dm = new THREE.Object3D();
    const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stdMat(0x334155, 0.5, 0.4), edges.length * NF);
    let bi = 0;
    for (const e of edges) {
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(e.len, tH), towerGlassM);
      gl.position.set(e.cx, CEIL + tH / 2, e.cz); gl.rotation.y = e.rot; g.add(gl);
      obbs.push({ cx: e.cx, cz: e.cz, hx: e.len / 2, hz: 0.25, rot: e.rot, y0: CEIL, y1: H });
      const ux = Math.cos(e.rot), uz = -Math.sin(e.rot), cnt = Math.ceil(e.len / 3.6);
      for (let k = 0; k <= cnt; k++) { const t = -e.len / 2 + (e.len * k) / cnt; mulls.push({ x: e.cx + ux * t, z: e.cz + uz * t, rot: e.rot }); }
      for (let f = 1; f <= NF; f++) { // a band at every slab level (floor 1..9) + the parapet band at the roof
        dm.position.set(e.cx, f * FH - 0.2, e.cz); dm.rotation.set(0, e.rot, 0); dm.scale.set(e.len + 0.4, 0.9, 0.36); dm.updateMatrix(); bands.setMatrixAt(bi++, dm.matrix);
      }
    }
    g.add(bands);
    const mm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, tH, 0.32), stdMat(0x1e293b, 0.6, 0.4), mulls.length);
    dm.scale.set(1, 1, 1);
    mulls.forEach((q, i) => { dm.position.set(q.x, CEIL + tH / 2, q.z); dm.rotation.set(0, q.rot, 0); dm.updateMatrix(); mm.setMatrixAt(i, dm.matrix); });
    g.add(mm);
  }

  // ---- THE GLASS DOME closing the atrium (the roof below it is solid, so no rain comes in): a shallow spherical cap + 12 steel ribs + 3 rings ----
  {
    const rb = atriumR + 0.4, hc = 3.2; // base radius, rise
    const Rs = (rb * rb + hc * hc) / (2 * hc), th = Math.asin(rb / Rs), cy = H + hc - Rs; // sphere centre height: the cap's base circle is at y = H
    const domeM = new THREE.MeshStandardMaterial({ color: 0xb8e4f7, transparent: true, opacity: 0.28, metalness: 0.6, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(Rs, 64, 16, 0, Math.PI * 2, 0, th), domeM);
    dome.position.y = cy; roof.add(dome);
    const ribM = stdMat(0x1e293b, 0.6, 0.4);
    for (let k = 0; k < 12; k++) {
      const ph = (k / 12) * Math.PI * 2, pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 12; i++) { const a = (i / 12) * th; pts.push(new THREE.Vector3(Rs * Math.sin(a) * Math.cos(ph), cy + Rs * Math.cos(a), Rs * Math.sin(a) * Math.sin(ph))); }
      roof.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.1, 6), ribM));
    }
    for (const t of [0.33, 0.66, 1]) {
      const a = t * th, pts: THREE.Vector3[] = [];
      for (let i = 0; i < 48; i++) { const ph = (i / 48) * Math.PI * 2; pts.push(new THREE.Vector3(Rs * Math.sin(a) * Math.cos(ph), cy + Rs * Math.cos(a), Rs * Math.sin(a) * Math.sin(ph))); }
      roof.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, t === 1 ? 0.2 : 0.08, 6, true), ribM));
    }
  }

  // ---- ceiling lights of floors 1..9 (one InstancedMesh; the ground floor's own are in its floor group) ----
  {
    const spots: [number, number][] = [];
    for (const x of [-40, -24, -8, 8, 24, 40]) for (const z of [-14, 14]) spots.push([x, z]);
    for (const x of [-36, -24, 24, 36]) spots.push([x, 0]);
    const lg = new THREE.PlaneGeometry(12, 0.5); lg.rotateX(Math.PI / 2);
    const lm = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff }), spots.length * (NF - 1));
    const m4 = new THREE.Matrix4();
    let li = 0;
    for (let f = 1; f < NF; f++) for (const [x, z] of spots) { m4.makeTranslation(x, (f + 1) * FH - slabT - 0.02, z); lm.setMatrixAt(li++, m4); }
    g.add(lm);
  }

  // ---- ZONES: one per category, openly on the floor (no walls). Row s = -1 (north, z < 0) and s = +1 (south, z > 0); the aisle |z| < 8 stays free ----
  const fg = floorGroups[0];
  const lightM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const poleM = stdMat(0x334155, 0.5, 0.5), deskM = stdMat(0x92400e, 0, 0.8);
  const COLS = [-40, -24, -8, 8, 24, 40];
  for (const x of COLS) for (const z of [-14, 14]) plane(12, 0.5, x, CEIL - 0.03, z, lightM, Math.PI / 2, fg); // ceiling light strips
  const hang = (px: number, pz: number, yBottom: number) => slab(px - 0.04, px + 0.04, pz - 0.04, pz + 0.04, yBottom, CEIL, poleM, false, fg); // a thin pole from the roof
  const food = catalog.categories.filter((c) => c.floor === 0).slice(0, 8), fashion = catalog.categories.filter((c) => c.floor === 1).slice(0, 4);
  const slots: { cat: Category; cx: number; s: number; floor: number }[] = [];
  food.forEach((c, i) => slots.push({ cat: c, cx: COLS[i % 4], s: i < 4 ? -1 : 1, floor: 0 }));
  fashion.forEach((c, i) => slots.push({ cat: c, cx: COLS[4 + (i % 2)], s: i < 2 ? -1 : 1, floor: 1 }));
  // department signs hanging over the aisle, readable from both ends of the hall
  for (const [x, f] of [[-16, 0], [32, 1]] as [number, number][]) {
    const info = FLOORS[f];
    for (const r of [Math.PI / 2, -Math.PI / 2]) {
      const sg = signMesh(14, 1.5, info.dept, info.deptEn, ACCENT);
      sg.position.set(x + (r > 0 ? 0.06 : -0.06), 3.7, 0); sg.rotation.y = r; fg.add(sg);
    }
    for (const dz of [-6, 6]) hang(x, dz, 4.4);
  }
  for (const { cat, cx, s, floor } of slots) {
    const zr = (a: number, b: number): [number, number] => [Math.min(s * a, s * b), Math.max(s * a, s * b)];
    const accent = new THREE.Color(cat.color);
    // floor patch (the zone) + a stripe in the category colour along the aisle edge
    plane(14, 20, cx, 0.012, s * 18, new THREE.MeshStandardMaterial({ color: accent.clone().lerp(new THREE.Color(0xffffff), 0.72), roughness: 0.5 }), -Math.PI / 2, fg);
    plane(14, 0.35, cx, 0.02, s * 8.2, new THREE.MeshBasicMaterial({ color: cat.color }), -Math.PI / 2, fg);
    // the zone's name, hanging from the roof above its aisle edge
    const sign = signMesh(10, 1.3, cat.bn, cat.en, cat.color);
    sign.position.set(cx, 3.8, s * 9); faceCorridor(sign, s); fg.add(sign);
    hang(cx - 4.5, s * 9, 4.4); hang(cx + 4.5, s * 9, 4.4);
    // "view all" board on a post at the back of the zone
    const post = slab(cx - 0.1, cx + 0.1, s * 25.4 - 0.1, s * 25.4 + 0.1, 0, 2.4, poleM, false, fg); post.castShadow = false;
    solids.push({ minX: cx - 0.1, maxX: cx + 0.1, minY: 0, maxY: 2.4, minZ: s * 25.4 - 0.1, maxZ: s * 25.4 + 0.1 });
    const all = signMesh(6, 1.4, 'সব পণ্য দেখুন', 'View all on website →', cat.color);
    all.position.set(cx, 2.7, s * 25.2); faceCorridor(all, s);
    all.userData.pick = { title: `${cat.bn} — সব পণ্য`, sub: 'ওয়েবসাইটে সব দেখুন', url: categoryUrl(cat) } satisfies PickInfo;
    fg.add(all); pickables.push(all);
    // products on turntable pedestals: one row of 3 across the zone
    catalog.products.filter((p) => p.categoryId === cat.id).slice(0, MALL.perShop).forEach((p, i) => {
      const x = cx + [-4.6, 0, 4.6][i % 3], z = s * 17;
      const item = new THREE.Group(); item.position.set(x, 0, z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.25, 32), darkM); base.position.y = 0.125; item.add(base);
      const ringM = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.5 });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.75, 40), ringM);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.27; item.add(ring);
      const spin = new THREE.Group(); spin.position.y = 0.25;
      spin.add(makeProductModel(p.kind, p.color, 0.85 + (i % 3) * 0.08)); item.add(spin); spinners.push(spin);
      const tag = tagSprite(p, cat.color); tag.position.y = 2.7; item.add(tag);
      item.userData.pick = { title: p.name, sub: taka(p.price), url: productUrl(p) } satisfies PickInfo;
      item.userData.ring = ring;
      fg.add(item); pickables.push(item);
      solids.push({ minX: x - 1.5, maxX: x + 1.5, minY: 0, maxY: 1.2, minZ: z - 1.5, maxZ: z + 1.5 });
      allItems.push({ product: p, category: cat, viewPos: new THREE.Vector3(x, 0, z - s * 4.2), yaw: s > 0 ? Math.PI : 0 });
    });
    // shopkeeper behind a small counter in the back corner of the zone
    const [ca, cb] = zr(23.3, 24.3);
    slab(cx + 3.4, cx + 6.6, ca, cb, 0, 1.0, deskM, true, fg);
    const sk = makePerson(cat.color); sk.position.set(cx + 5, 0, s * 25.4); faceCorridor(sk, s);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2, 0.9), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 1; sk.add(hit);
    const hello = signMesh(1.8, 0.5, 'স্বাগতম!', cat.en, cat.color); hello.position.set(0, 2.2, 0); sk.add(hello);
    sk.userData.pick = { title: `${cat.bn} — দোকানদার`, sub: 'যেকোনো পণ্য সম্পর্কে জিজ্ঞাসা করুন (ফিচার পরে আসছে)', url: '' } satisfies PickInfo;
    fg.add(sk); pickables.push(sk);
    shops.push({ category: cat, floor, viewPos: new THREE.Vector3(cx, 0, s * 9.5), yaw: s > 0 ? Math.PI : 0 });
  }

  return {
    group: g, roof, floors: floorGroups, solids, obbs, meshSolids, ramps: [], rampRails: [], pickables, blockers, shops, items: allItems,
    spawn: new THREE.Vector3(-hx - 3, 0, 0), spawnYaw: -Math.PI / 2,
    surfaceAt: (x, z, y) => { // the floor level under (x, z) for something at height y (floors 1..9 only inside the block and outside the atrium hole)
      for (let f = Math.min(NF - 1, Math.floor((y + 0.3) / FH)); f >= 1; f--) if (Math.abs(x) <= hx && Math.abs(z) <= hz && Math.hypot(x, z) > atriumR) return f * FH;
      return 0;
    },
    update(dt) { for (const sp of spinners) sp.rotation.y += dt * 0.6; },
    dispose() {
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material & { map?: THREE.Texture | null } | undefined;
        mat?.map?.dispose?.();
      });
    },
  };
}

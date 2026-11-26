// CITY MALL, STEP C2: draws the stair cores + the glass lifts (geometry numbers: MallCores.ts) and hands back the colliders + the lift animation.
// Performance (PERFORMANCE_RULES.md): all stair boxes (steps, slabs, glass rails, hand rails) are THREE InstancedMeshes for both stairs, the skirts ONE merged mesh;
// a lift = a glass shaft (few planes), 20 door leaves in one InstancedMesh, one cabin group. Floor plate / call button / directory board stand in the floor groups
// (they are hidden with their floor). No lights, no shadows, no per-frame allocation.
import * as THREE from 'three';
import {
  CEIL, FH, LIFT, LIFTS, LIFT_FRONT_Z, NF, SHAFT_TOP, SIDES, STAIR, cabinParts, floorNameBn, floorNameEn, levelNear, liftShaftSolids, stairModel,
  type Box, type LiftSpec, type MeshSpec, type PickAction, type RailSpec, type RampSpec, type Vis,
} from './MallCores';
import type { LiftCar } from './MallLift';

export interface CoreHelpers {
  canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture;
  fitText(c: CanvasRenderingContext2D, text: string, size: number, weight: number, maxW: number): void;
  stdMat(color: number, metal?: number, rough?: number, glow?: number): THREE.MeshStandardMaterial;
}

export interface LiftView {
  id: number;
  /** The cabin (moves up and down). */
  cabin: THREE.Group;
  /** Once per frame: cabin height, doors, floor number, lit buttons. */
  update(car: LiftCar): void;
}

export interface CoresBuild {
  solids: Box[]; ramps: RampSpec[]; rampRails: RailSpec[]; meshSolids: MeshSpec[];
  pickables: THREE.Object3D[];
  lifts: LiftView[];
  dispose(): void;
}

const FONT = '"Noto Sans Bengali", "Segoe UI", sans-serif';
const ACCENT = '#f97316';

export function buildCores(parent: THREE.Group, floorGroups: THREE.Group[], h: CoreHelpers): CoresBuild {
  const solids: Box[] = [], ramps: RampSpec[] = [], rampRails: RailSpec[] = [], meshSolids: MeshSpec[] = [], pickables: THREE.Object3D[] = [];
  const disposables: { dispose(): void }[] = [];
  const concreteM = h.stdMat(0xc3cad4, 0.05, 0.85), steelM = h.stdMat(0x94a3b8, 0.8, 0.3), darkM = h.stdMat(0x1e293b, 0.5, 0.4);
  const glassM = new THREE.MeshStandardMaterial({ color: 0xbfe6f5, transparent: true, opacity: 0.26, metalness: 0.6, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
  const leafM = new THREE.MeshStandardMaterial({ color: 0x9fd3ea, transparent: true, opacity: 0.45, metalness: 0.6, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  disposables.push(glassM, leafM);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(unit);

  // ------------------------------------------------------------------ the two stairs
  const vis: Vis[] = [];
  const skirts: MeshSpec[] = [];
  for (const side of SIDES) {
    const m = stairModel(side);
    solids.push(...m.solids); ramps.push(...m.ramps); rampRails.push(...m.rails); meshSolids.push(...m.meshSolids);
    vis.push(...m.vis); skirts.push(...m.skirts);
  }
  const instanced = (list: Vis[], mat: THREE.Material, name: string): void => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(unit, mat, list.length);
    im.name = name;
    const o = new THREE.Object3D();
    list.forEach((q, i) => { o.position.set(q.cx, q.cy, q.cz); o.rotation.set(0, 0, q.rz); o.scale.set(q.sx, q.sy, q.sz); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.instanceMatrix.needsUpdate = true;
    parent.add(im);
  };
  instanced(vis.filter((q) => q.k === 'c'), concreteM, 'StairConcrete');
  instanced(vis.filter((q) => q.k === 'g'), glassM, 'StairGlass');
  instanced(vis.filter((q) => q.k === 's'), steelM, 'StairHandrail');
  { // the skirts (closed prisms), merged into one mesh with flat normals
    let nTri = 0;
    for (const s of skirts) nTri += s.indices.length;
    const pos = new Float32Array(nTri * 3);
    let o = 0;
    for (const s of skirts) for (let i = 0; i < s.indices.length; i++) { const v = s.indices[i] * 3; pos[o++] = s.vertices[v]; pos[o++] = s.vertices[v + 1]; pos[o++] = s.vertices[v + 2]; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    disposables.push(g);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xa9b2bf, roughness: 0.9, side: THREE.DoubleSide }));
    mesh.name = 'StairSkirts';
    parent.add(mesh);
    disposables.push(mesh.material as THREE.Material);
  }

  // ------------------------------------------------------------------ the lifts
  const bandM = h.stdMat(0x334155, 0.5, 0.4);
  const plateTex: THREE.CanvasTexture[] = [];
  const plateMat: THREE.MeshBasicMaterial[] = [];
  const plateOf = (f: number): THREE.MeshBasicMaterial => {
    if (plateMat[f]) return plateMat[f];
    const tex = h.canvasTex(256, 96, (c) => {
      c.fillStyle = '#0f172a'; c.fillRect(0, 0, 256, 96);
      c.fillStyle = ACCENT; c.fillRect(0, 88, 256, 8);
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `700 64px ${FONT}`; c.fillText(String(f), 52, 44);
      c.fillStyle = '#cbd5e1';
      h.fitText(c, floorNameBn(f), 34, 700, 150); c.fillText(floorNameBn(f), 168, 32);
      h.fitText(c, floorNameEn(f), 22, 500, 150); c.fillText(floorNameEn(f), 168, 66);
    });
    plateTex[f] = tex;
    plateMat[f] = new THREE.MeshBasicMaterial({ map: tex });
    return plateMat[f];
  };
  const dirTex = h.canvasTex(512, 640, (c) => { // the floor directory (department names come in step C3)
    c.fillStyle = '#0f172a'; c.fillRect(0, 0, 512, 640);
    c.fillStyle = ACCENT; c.fillRect(0, 0, 512, 10); c.fillRect(0, 630, 512, 10);
    c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillStyle = '#fff';
    c.font = `700 40px ${FONT}`; c.fillText('ফ্লোর তালিকা', 256, 48);
    c.fillStyle = '#94a3b8'; c.font = `500 24px ${FONT}`; c.fillText('Floor Directory', 256, 88);
    for (let f = NF - 1; f >= 0; f--) {
      const y = 124 + (NF - 1 - f) * 50;
      c.fillStyle = f % 2 ? '#1e293b' : '#162033'; c.fillRect(20, y - 22, 472, 46);
      c.fillStyle = ACCENT; c.textAlign = 'center'; c.font = `700 32px ${FONT}`; c.fillText(String(f), 54, y + 1);
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `600 28px ${FONT}`; c.fillText(floorNameBn(f), 98, y + 1);
      c.fillStyle = '#94a3b8'; c.textAlign = 'right'; c.font = `500 22px ${FONT}`; c.fillText(floorNameEn(f), 480, y + 1);
    }
  });
  const dirMat = new THREE.MeshBasicMaterial({ map: dirTex });
  disposables.push(dirTex, dirMat);
  const btnM = h.stdMat(0xf97316, 0.3, 0.4, 0xf97316);
  const boardGeo = new THREE.PlaneGeometry(1.2, 1.5), plateGeo = new THREE.PlaneGeometry(1.1, 0.41), btnGeo = new THREE.BoxGeometry(0.14, 0.26, 0.05), postGeo = new THREE.BoxGeometry(0.1, 0.5, 0.1), baseGeo = new THREE.BoxGeometry(1.3, 0.12, 0.2);
  disposables.push(boardGeo, plateGeo, btnGeo, postGeo, baseGeo);

  const lifts: LiftView[] = [];
  const allLeaves = new THREE.InstancedMesh(unit, leafM, LIFTS.length * NF * 2);
  allLeaves.name = 'LiftLandingDoors';
  allLeaves.frustumCulled = false;
  parent.add(allLeaves);
  const bandCount = LIFTS.length * NF * 3;
  const bands = new THREE.InstancedMesh(unit, bandM, bandCount);
  bands.name = 'LiftBands';
  parent.add(bands);
  let bi = 0;
  const tmp = new THREE.Object3D();

  for (const L of LIFTS) {
    const hx = LIFT.innerX / 2, w = LIFT.wall;
    const zBack = LIFT.zc - 1.1 - 0.1, zFrontIn = zBack + LIFT.innerZ;
    solids.push(...liftShaftSolids(L));
    // shaft: glass on the three sides, steel posts in the corners, a dark band at every floor
    const midZ = (zBack - w + LIFT_FRONT_Z) / 2, depth = LIFT_FRONT_Z - (zBack - w);
    const plane = (wd: number, x: number, z: number, ry: number): void => {
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(wd, SHAFT_TOP), glassM);
      gl.position.set(x, SHAFT_TOP / 2, z); gl.rotation.y = ry; parent.add(gl); disposables.push(gl.geometry);
    };
    plane(depth, L.xc - hx - w / 2, midZ, Math.PI / 2);
    plane(depth, L.xc + hx + w / 2, midZ, Math.PI / 2);
    plane(2 * hx + 2 * w, L.xc, zBack - w / 2, 0);
    for (const [px, pz] of [[L.xc - hx - w / 2, zBack - w / 2], [L.xc + hx + w / 2, zBack - w / 2]] as const) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(w, SHAFT_TOP, w), steelM); post.position.set(px, SHAFT_TOP / 2, pz); parent.add(post); disposables.push(post.geometry);
    }
    for (let f = 0; f < NF; f++) {
      const y = f * FH + FH - 0.2; // under the slab of floor f + 1 (the last one under the roof)
      const sides: [number, number, number, number][] = [[L.xc, zBack - w / 2, 2 * hx + 2 * w, 0.3], [L.xc - hx - w / 2, midZ, 0.3, depth], [L.xc + hx + w / 2, midZ, 0.3, depth]];
      for (const [x, z, sx, sz] of sides) { tmp.position.set(x, y, z); tmp.rotation.set(0, 0, 0); tmp.scale.set(sx, 0.3, sz); tmp.updateMatrix(); bands.setMatrixAt(bi++, tmp.matrix); }
    }
    // the front wall: two piers (the door leaves slide behind them), a lintel over every door
    const pier = (x0: number, x1: number): void => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, SHAFT_TOP, w), concreteM);
      mesh.position.set((x0 + x1) / 2, SHAFT_TOP / 2, zFrontIn + w / 2); parent.add(mesh); disposables.push(mesh.geometry);
    };
    const dw = LIFT.doorW / 2;
    pier(L.xc - hx - w, L.xc - dw); pier(L.xc + dw, L.xc + hx + w);
    const lintelGeo = new THREE.BoxGeometry(2 * dw, FH - LIFT.doorH, w); disposables.push(lintelGeo);
    const lintels = new THREE.InstancedMesh(lintelGeo, concreteM, NF);
    for (let f = 0; f < NF; f++) { tmp.position.set(L.xc, f * FH + LIFT.doorH + (FH - LIFT.doorH) / 2, zFrontIn + w / 2); tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); lintels.setMatrixAt(f, tmp.matrix); }
    parent.add(lintels);

    // landing door leaves (2 per floor, one InstancedMesh for both lifts); closed = covering the opening, open = hidden behind the piers
    const leafBase = L.id * NF * 2;
    const setLeaves = (level: number, door: number): void => {
      const off = 0.3 + 0.45 * door;
      for (let k = 0; k < 2; k++) {
        tmp.position.set(L.xc + (k ? 1 : -1) * off, level * FH + LIFT.doorH / 2, zFrontIn + w / 2); tmp.rotation.set(0, 0, 0); tmp.scale.set(0.6, LIFT.doorH, 0.05); tmp.updateMatrix();
        allLeaves.setMatrixAt(leafBase + level * 2 + k, tmp.matrix);
      }
    };
    for (let f = 0; f < NF; f++) setLeaves(f, 0);
    allLeaves.instanceMatrix.needsUpdate = true;

    // at every floor: floor plate over the door, call button on the right pier, directory board beside the lift
    for (let f = 0; f < NF; f++) {
      const fg = floorGroups[f];
      const plate = new THREE.Mesh(plateGeo, plateOf(f)); plate.position.set(L.xc, 2.7, LIFT_FRONT_Z + 0.01); fg.add(plate);
      const btn = new THREE.Mesh(btnGeo, btnM); btn.position.set(L.xc + 1.0, 1.1, LIFT_FRONT_Z + 0.025);
      btn.userData.pick = { title: 'লিফট ডাকুন', sub: 'বাটনে ক্লিক করুন বা G চাপুন', url: '', action: { kind: 'call', lift: L.id, level: f } satisfies PickAction };
      fg.add(btn); pickables.push(btn);
      const bx = L.xc + L.side * 2.0, bz = LIFT_FRONT_Z + 1.1;
      const board = new THREE.Mesh(boardGeo, dirMat); board.position.set(bx, 1.55, bz + 0.06); fg.add(board);
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.26, 1.56, 0.08), darkM); back.position.set(bx, 1.55, bz); fg.add(back); disposables.push(back.geometry);
      const post = new THREE.Mesh(postGeo, steelM); post.position.set(bx, 0.45, bz); fg.add(post);
      const base = new THREE.Mesh(baseGeo, darkM); base.position.set(bx, 0.06, bz); fg.add(base);
      solids.push({ minX: bx - 0.65, maxX: bx + 0.65, minY: f * FH, maxY: f * FH + 2.35, minZ: bz - 0.1, maxZ: bz + 0.1 });
    }

    // the glass cabin (origin = centre of the cabin floor)
    const cab = new THREE.Group(); cab.name = `LiftCabin${L.id}`;
    cab.position.set(L.xc, 0, LIFT.zc);
    parent.add(cab);
    const chx = LIFT.cabX / 2, chz = LIFT.cabZ / 2, H = LIFT.cabH;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.rotation.y = ry; cab.add(mesh); disposables.push(geo); return mesh; };
    add(new THREE.BoxGeometry(LIFT.cabX + 0.1, LIFT.floorT, LIFT.cabZ + 0.16), darkM, 0, -LIFT.floorT / 2, 0.02);
    add(new THREE.BoxGeometry(LIFT.cabX + 0.12, 0.2, LIFT.cabZ + 0.12), darkM, 0, H + 0.1, 0);
    const lamp = add(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, H - 0.01, 0); lamp.rotation.x = Math.PI / 2; disposables.push(lamp.material as THREE.Material);
    add(new THREE.PlaneGeometry(LIFT.cabZ, H), glassM, -chx, H / 2, 0, Math.PI / 2);
    add(new THREE.PlaneGeometry(LIFT.cabZ, H), glassM, chx, H / 2, 0, Math.PI / 2);
    add(new THREE.PlaneGeometry(LIFT.cabX, H), glassM, 0, H / 2, -chz, 0);
    for (const [px, pz] of [[-chx, -chz], [chx, -chz], [-chx, chz], [chx, chz]] as const) add(new THREE.BoxGeometry(0.07, H, 0.07), steelM, px, H / 2, pz);
    for (const [sx, sz, wd, dp] of [[-chx + 0.04, 0, 0.05, LIFT.cabZ], [chx - 0.04, 0, 0.05, LIFT.cabZ], [0, -chz + 0.04, LIFT.cabX, 0.05]] as const) add(new THREE.BoxGeometry(wd, 0.05, dp), steelM, sx, 0.9, sz); // hand rails
    add(new THREE.PlaneGeometry(0.4, H), glassM, -0.8, H / 2, chz); add(new THREE.PlaneGeometry(0.4, H), glassM, 0.8, H / 2, chz); // fixed glass beside the door
    add(new THREE.BoxGeometry(2 * dw, H - LIFT.doorH, 0.06), steelM, 0, LIFT.doorH + (H - LIFT.doorH) / 2, chz); // header
    const leaves: THREE.Mesh[] = [];
    for (let k = 0; k < 2; k++) leaves.push(add(new THREE.BoxGeometry(0.6, LIFT.doorH, 0.04), leafM, (k ? 1 : -1) * 0.3, LIFT.doorH / 2, chz));
    // floor display (above the door, inside) + button panel (right wall)
    const dispC = document.createElement('canvas'); dispC.width = 192; dispC.height = 96;
    const dispTex = new THREE.CanvasTexture(dispC); dispTex.colorSpace = THREE.SRGBColorSpace; disposables.push(dispTex);
    const disp = add(new THREE.PlaneGeometry(0.62, 0.31), new THREE.MeshBasicMaterial({ map: dispTex }), 0, 2.33, chz - 0.04, Math.PI); disposables.push(disp.material as THREE.Material);
    const panC = document.createElement('canvas'); panC.width = 144; panC.height = 340;
    const panTex = new THREE.CanvasTexture(panC); panTex.colorSpace = THREE.SRGBColorSpace; disposables.push(panTex);
    const panel = add(new THREE.PlaneGeometry(0.36, 0.85), new THREE.MeshBasicMaterial({ map: panTex }), chx - 0.03, 1.25, 0.55, -Math.PI / 2); disposables.push(panel.material as THREE.Material);
    panel.userData.pick = { title: 'লিফটের বাটন', sub: 'ফ্লোরের বাটনে ক্লিক করুন (বা G চাপুন)', url: '', action: { kind: 'panel', lift: L.id } satisfies PickAction };
    pickables.push(panel);

    let shownKey = -1, litKey = '', doorLevel = 0;
    const drawDisplay = (level: number, dir: number): void => {
      const c = dispC.getContext('2d')!;
      c.fillStyle = '#0b1220'; c.fillRect(0, 0, 192, 96);
      c.fillStyle = '#22d3ee'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 74px ${FONT}`; c.fillText(String(level), 78, 50);
      c.fillStyle = dir === 0 ? '#475569' : '#f97316'; c.font = `700 46px ${FONT}`; c.fillText(dir > 0 ? '▲' : dir < 0 ? '▼' : '•', 152, 50);
      dispTex.needsUpdate = true;
    };
    const drawPanel = (lit: Set<number>): void => {
      const c = panC.getContext('2d')!;
      c.fillStyle = '#0f172a'; c.fillRect(0, 0, 144, 340);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 36px ${FONT}`;
      for (let r = 0; r < 5; r++) for (let k = 0; k < 2; k++) {
        const f = 9 - 2 * r - k, on = lit.has(f);
        c.fillStyle = on ? '#f97316' : '#334155'; c.beginPath(); c.roundRect(8 + k * 68, 8 + r * 66, 60, 58, 12); c.fill();
        c.fillStyle = on ? '#0f172a' : '#e2e8f0'; c.fillText(String(f), 38 + k * 68, 38 + r * 66);
      }
      panTex.needsUpdate = true;
    };
    drawDisplay(0, 0); drawPanel(new Set());
    const lit = new Set<number>();
    lifts.push({
      id: L.id, cabin: cab,
      update(car) {
        cab.position.y = car.y;
        const off = 0.3 + 0.45 * car.door;
        leaves[0].position.x = -off; leaves[1].position.x = off;
        if (car.state !== 'moving' || doorLevel !== car.level) { // the landing doors at the floor the car stands at follow the cabin doors
          if (doorLevel !== car.level) { setLeaves(doorLevel, 0); doorLevel = car.level; }
          setLeaves(car.level, car.door); allLeaves.instanceMatrix.needsUpdate = true;
        }
        const lv = levelNear(car.y), dir = car.state === 'moving' ? Math.sign(car.v) : 0, key = lv * 3 + (dir + 1);
        if (key !== shownKey) { shownKey = key; drawDisplay(lv, dir); }
        lit.clear();
        if (car.target >= 0) lit.add(car.target);
        for (const q of car.queue) lit.add(q);
        const lk = [...lit].sort().join(',');
        if (lk !== litKey) { litKey = lk; drawPanel(lit); }
      },
    });
  }
  bands.instanceMatrix.needsUpdate = true;

  return {
    solids, ramps, rampRails, meshSolids, pickables, lifts,
    dispose() {
      for (const t of plateTex) t?.dispose();
      for (const m of plateMat) m?.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}

export { CEIL, STAIR };

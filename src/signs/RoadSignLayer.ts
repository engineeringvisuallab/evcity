// ROAD SIGN BOARDS - Step 3 (one long board): the 3D overhead gantries (HANDOFF_ROAD_DESIGN.md section 23). Per gantry: two round steel pipe posts with concrete bases (one each side of the road), a truss beam
// across, and ONE long board across the whole road between the posts, divided into 2 / 3 / 4 coloured sections by the road width. The board has a face on BOTH sides (front = traffic of growing s, back = the other way). Step 2: the faces are EMPTY (no destinations, empty maxim strip); the lettering comes later.
// All steel of all gantries is ONE merged mesh (1 draw call). The faces are small plane meshes: plain green from afar, the lettering (a canvas texture, RoadSignPaint) is drawn only
// within SIGN_FIELD.paint * Q.signRadiusMul of the camera, at most Q.signPaintPerFrame per frame, and thrown away again beyond SIGN_FIELD.unpaint.
// Positions are ABSOLUTE world coordinates (the root is moved by the floating origin). The solid parts (posts + bases) are in `solidGroups` for SignPhysics.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Q } from '../core/Quality';
import { Config } from '../core/Config';
import { BOARD_H, BOARD_TOP, EMPTY_BOARD, GANTRY, POST_TOP, SIGN_FIELD, type BoardContent } from './RoadSignSpec';
import { paintBoard, paintSections, paintSize, SIGN_COLORS } from './RoadSignPaint';
import { ROAD_SIGN_SPOTS, type RoadSignSpot } from './RoadSignData';
import { gantrySolids, solidsRadius, type SignSolid, type SignSolidGroup } from './SignSolids';
import { bridgeParts, BRIDGE_ZB } from './RoadSignBridgeGeo';
import { bridgeDesign } from './RoadSignBridgeSpec';

interface Face {
  mesh: THREE.Mesh;
  cx: number;
  cz: number;
  w: number;
  sections: number;
  content: BoardContent;
  painted: THREE.MeshBasicMaterial | null;
}

export class RoadSignLayer {
  private group = new THREE.Group();
  private faces: Face[] = [];
  private steel: THREE.Mesh | null = null;
  private plain = new THREE.MeshBasicMaterial({ color: SIGN_COLORS.green, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  /** Blank board face (green + empty strip), one texture per (width, sections), shared by all empty faces. */
  private blanks = new Map<string, THREE.MeshBasicMaterial>();
  private steelMat = new THREE.MeshStandardMaterial({ color: '#b4bcc0', roughness: 0.55, metalness: 0.45 });
  /** The solid parts for SignPhysics (filled while the gantries are built, before the first update). */
  readonly solidGroups: SignSolidGroup[] = [];

  constructor(private root: THREE.Object3D) {
    this.group.name = 'road-signs';
    if (!Config.roads.signs.enabled) return;
    const parts: THREE.BufferGeometry[] = [];
    for (const s of ROAD_SIGN_SPOTS) this.build(s, parts);
    if (parts.length) {
      const merged = mergeGeometries(parts);
      for (const p of parts) p.dispose();
      if (merged) {
        merged.computeBoundingSphere();
        this.steel = new THREE.Mesh(merged, this.steelMat);
        this.steel.name = 'road-sign-steel';
        this.group.add(this.steel);
      }
    }
    root.add(this.group);
  }

  private build(s: RoadSignSpot, out: THREE.BufferGeometry[]): void {
    const spot = new THREE.Matrix4().makeRotationY(s.yaw).setPosition(s.x, s.y, s.z);
    const tmp = new THREE.Matrix4();
    const add = (geo: THREE.BufferGeometry, local: THREE.Matrix4): void => {
      geo.applyMatrix4(tmp.copy(spot).multiply(local));
      out.push(geo);
    };
    const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rotZ = 0): void => {
      add(new THREE.BoxGeometry(sx, sy, sz), new THREE.Matrix4().makeTranslation(cx, cy, cz).multiply(new THREE.Matrix4().makeRotationZ(rotZ)));
    };
    const pipe = (cx: number, cy: number, cz: number, r: number, len: number, alongX: boolean): void => {
      const m = new THREE.Matrix4().makeTranslation(cx, cy, cz);
      if (alongX) m.multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
      add(new THREE.CylinderGeometry(r, r, len, 14, 1), m);
    };
    if (s.sections >= 3) {
      this.buildBridge(s, add);
      return;
    }
    const feet = [s.feetL, s.feetR];
    // posts (round steel pipes) with concrete bases: same numbers as gantrySolids
    for (let k = 0; k < 2; k++) {
      const x = k === 0 ? -s.edge : s.edge;
      const bottom = Math.min(feet[k], 0) - GANTRY.postBelow;
      pipe(x, (POST_TOP + bottom) / 2, 0, GANTRY.postR, POST_TOP - bottom, false);
      box(x, feet[k] + GANTRY.baseHeight / 2 - 0.1, 0, GANTRY.baseSize, GANTRY.baseHeight, GANTRY.baseSize);
    }
    // truss beam: two chords, a vertical at every panel node and a diagonal in every panel
    const yl = BOARD_TOP + GANTRY.chordLow, yh = BOARD_TOP + GANTRY.chordHigh, hh = yh - yl;
    const span = 2 * s.edge;
    pipe(0, yl, 0, GANTRY.chordR, span, true);
    pipe(0, yh, 0, GANTRY.chordR, span, true);
    const n = Math.max(2, Math.ceil(span / GANTRY.panel));
    const dx = span / n;
    for (let i = 0; i <= n; i++) box(-s.edge + i * dx, (yl + yh) / 2, 0, 0.09, hh, 0.09);
    for (let i = 0; i < n; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      box(-s.edge + (i + 0.5) * dx, (yl + yh) / 2, 0, Math.hypot(dx, hh), 0.07, 0.07, Math.atan2(hh * dir, dx));
    }
    // the ONE long board between the posts, in the plane of the beam under the lower chord, hung on short rods; a face on each side (front +Z, back -Z)
    const by = GANTRY.clearance + BOARD_H / 2;
    box(0, by, 0, s.boardW + 0.12, BOARD_H + 0.12, GANTRY.boardDepth);
    const nh = Math.max(2, Math.ceil(s.boardW / 4));
    for (let i = 0; i <= nh; i++) box(-s.boardW / 2 + 0.3 + ((s.boardW - 0.6) * i) / nh, BOARD_TOP + GANTRY.chordLow / 2, 0, 0.1, GANTRY.chordLow + 0.1, 0.1);
    for (const face of [1, -1] as const) {
      const zf = face * (GANTRY.boardDepth / 2 + 0.012);
      const geo = new THREE.PlaneGeometry(s.boardW, BOARD_H);
      const local = new THREE.Matrix4().makeTranslation(0, by, zf);
      if (face < 0) local.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
      geo.applyMatrix4(tmp.copy(spot).multiply(local));
      const mesh = new THREE.Mesh(geo, this.blank(s.boardW, s.sections));
      mesh.name = 'road-sign-face';
      geo.computeBoundingSphere();
      this.group.add(mesh);
      this.faces.push({ mesh, cx: s.x, cz: s.z, w: s.boardW, sections: s.sections, content: EMPTY_BOARD, painted: null });
    }
    const solids = gantrySolids(s.edge, [s.feetL, s.feetR], POST_TOP, GANTRY.postR + 0.1, GANTRY.postBelow, GANTRY.baseSize, GANTRY.baseHeight, 0);
    this.solidGroups.push({ x: s.x, y: s.y, z: s.z, yaw: s.yaw, radius: solidsRadius(solids), solids });
  }

  /** STEP 4-3: a 6 / 8-lane road gets a walkable steel OVERBRIDGE instead of the gantry: two trusses, hammerhead piers, stair towers, and one board on each side (A on +Z, B on -Z). */
  private buildBridge(s: RoadSignSpot, add: (geo: THREE.BufferGeometry, local: THREE.Matrix4) => void): void {
    const lanes = s.sections >= 4 ? 8 : 6;
    const d = bridgeDesign({ lanes, halfWidth: s.edge - 0.6 - GANTRY.postGap, medianHalf: lanes === 8 ? 3 : 2, shoulder: 0.6, postGap: GANTRY.postGap, feetL: s.feetL, feetR: s.feetR });
    const parts = bridgeParts({ edge: s.edge, boardW: s.boardW, chordD: d.chord.D, panels: d.panels, feetL: s.feetL, feetR: s.feetR });
    const solids: SignSolid[] = [];
    for (const p of parts) {
      if (p.solid && p.rx === 0 && p.rz === 0 && p.t === 'b') solids.push({ k: 0, cx: p.cx, cy: p.cy, cz: p.cz, hx: p.a / 2, hy: p.b / 2, hz: p.c / 2 });
      if (!p.vis) continue;
      const m = new THREE.Matrix4().makeTranslation(p.cx, p.cy, p.cz);
      if (p.rz) m.multiply(new THREE.Matrix4().makeRotationZ(p.rz));
      if (p.rx) m.multiply(new THREE.Matrix4().makeRotationX(p.rx));
      if (p.t === 'b') add(new THREE.BoxGeometry(p.a, p.b, p.c), m);
      else add(new THREE.CylinderGeometry(p.a, p.a, p.b, 12, 1), m.multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)));
    }
    // the faces: board A looks +Z (on the +Z side), board B looks -Z; only the OUTER face is lettered, the inner side is plain steel
    const spot = new THREE.Matrix4().makeRotationY(s.yaw).setPosition(s.x, s.y, s.z);
    const tmp = new THREE.Matrix4();
    const by = d.deckTop + BOARD_H / 2;
    for (const sz of [1, -1] as const) {
      const geo = new THREE.PlaneGeometry(s.boardW, BOARD_H);
      const local = new THREE.Matrix4().makeTranslation(0, by, sz * (BRIDGE_ZB + GANTRY.boardDepth / 2 + 0.012));
      if (sz < 0) local.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
      geo.applyMatrix4(tmp.copy(spot).multiply(local));
      const mesh = new THREE.Mesh(geo, this.blank(s.boardW, s.sections));
      mesh.name = 'road-sign-face';
      geo.computeBoundingSphere();
      this.group.add(mesh);
      this.faces.push({ mesh, cx: s.x, cz: s.z, w: s.boardW, sections: s.sections, content: EMPTY_BOARD, painted: null });
    }
    this.solidGroups.push({ x: s.x, y: s.y, z: s.z, yaw: s.yaw, radius: solidsRadius(solids), solids });
  }

  /** The shared blank face for a panel width (plain green when there is no canvas, e.g. a headless run). */
  private blank(w: number, sections: number): THREE.MeshBasicMaterial {
    const key = w + '|' + sections;
    let m = this.blanks.get(key);
    if (m) return m;
    if (typeof document === 'undefined') return this.plain;
    const { W, H } = paintSize(w);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    if (!g) return this.plain;
    paintSections(g, W, H, sections);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Q.maxAniso;
    t.needsUpdate = true;
    m = new THREE.MeshBasicMaterial({ map: t, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.blanks.set(key, m);
    return m;
  }

  private paint(f: Face): void {
    if (typeof document === 'undefined') return;
    const { W, H } = paintSize(f.w);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    if (!g) return;
    paintBoard(g, W, H, f.content);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Q.maxAniso;
    t.needsUpdate = true;
    f.painted = new THREE.MeshBasicMaterial({ map: t, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    f.mesh.material = f.painted;
  }

  private unpaint(f: Face): void {
    if (!f.painted) return;
    f.painted.map?.dispose();
    f.painted.dispose();
    f.painted = null;
    f.mesh.material = this.blank(f.w, f.sections);
  }

  /** Camera position in absolute world metres. */
  update(camX: number, camZ: number): void {
    let budget = Q.signPaintPerFrame;
    const pr = SIGN_FIELD.paint * Q.signRadiusMul, ur = SIGN_FIELD.unpaint * Q.signRadiusMul;
    for (const f of this.faces) {
      if (f.content.rows.length === 0 && !f.content.maximBn) continue; // blank faces share one texture, nothing to paint
      const d = Math.hypot(camX - f.cx, camZ - f.cz);
      if (f.painted) {
        if (d > ur) this.unpaint(f);
      } else if (d < pr && budget > 0) {
        this.paint(f);
        budget--;
      }
    }
  }

  dispose(): void {
    this.root.remove(this.group);
    for (const f of this.faces) {
      this.unpaint(f);
      f.mesh.geometry.dispose();
    }
    this.steel?.geometry.dispose();
    for (const m of this.blanks.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.blanks.clear();
    this.plain.dispose();
    this.steelMat.dispose();
    this.faces.length = 0;
  }
}

// ROAD SIGNS - 3D layer. Step 1: SIDE sign (two posts + a flat board; Bangla + English names, an arrow and the distance, SignCanvas.ts).
// Traffic drives on the LEFT (as in Bangladesh), so a side board stands on the LEFT edge of the road, outside the gravel shoulder, and looks back
// at the drivers who come towards it (turned a few degrees towards the road).
// Step 4: the OVERHEAD GANTRY: two round posts on the road edges, a frame across ALL lanes and 1..3 panels that fill the whole width, each over the
// lanes of its direction (layout maths in GantryLayout.ts).
// Step 5: the WHOLE MAP (addPlanned): every board of the plan (SignPlan.ts) is built once, but the text is only drawn near the player (updateField):
//   - far away a board is hidden, a little nearer it is a plain green / blue board, close up the Bangla + English face is drawn on a canvas texture,
//   - when the player leaves again the texture is freed, so only a few dozen textures exist at any time (FPS and memory stay flat).
// Step 6: the Step 1 test boards are gone; boards of the same text share ONE texture (texCache); the SIGN_FIELD distances and the paints per frame follow the
// Quality preset (Q.signRadiusMul, Q.signPaintPerFrame); every board lists its solid parts (solidGroups) for SignPhysics (cars and people hit the posts).
// Children use ABSOLUTE world coordinates (parent = world.root, which the floating origin moves), like StreetLights / StationSignLayer.
import * as THREE from 'three';
import type { RoadNetwork, RoadSpec } from '../roads';
import { Q } from '../core/Quality';
import { BOARD_PX_PER_M, BOARD_W_M, boardHeightM, drawSignCanvas } from './SignCanvas';
import { GANTRY, gantryEdge, layoutGantry, splitPanels } from './GantryLayout';
import { kmBn, kmEn, type SignColor, type SignRow } from './SignFormat';
import { gantrySolids, sideSolids, solidsRadius, type SignSolidGroup } from './SignSolids';
import type { PlannedSign } from './SignPlan';

export interface SideSignSpec {
  /** Foot of the posts (world metres). */
  x: number;
  y: number;
  z: number;
  /** Unit vector (x, z) the board FACES = towards the oncoming driver. */
  fx: number;
  fz: number;
  rows: SignRow[];
  color: SignColor;
}

export interface GantryBoard {
  rows: SignRow[];
  color: SignColor;
}

export interface GantrySpec {
  /** Road centreline point under the beam: x, z and the road SURFACE height y (world metres). */
  x: number;
  y: number;
  z: number;
  /** The driver's unit heading (x, z) there. The boards face back at him. */
  hx: number;
  hz: number;
  /** Distance of each post from the centreline (see gantryEdge). */
  edge: number;
  /** Ground height at the foot of the left and the right post (the posts go a little below it). */
  footLeftY: number;
  footRightY: number;
  /** Panels from the driver's LEFT to his RIGHT (1..3, see splitPanels); together they fill the whole width between the posts. Too many for a narrow road are merged into the last one. */
  boards: GantryBoard[];
}

export interface GantryResult {
  placed: number;
  merged: number;
  /** Width of the whole sign face (m). */
  span: number;
  fits: boolean;
}

/** Colours of a board without its text (what you see from far away). */
const BOARD_COLOR: Record<SignColor, number> = { green: 0x0a6a3c, blue: 0x0b4f9e };

/**
 * When a board is hidden / drawn / freed, by distance from the player (m). Gantries are big, so they are seen and read from further away.
 * `unpaint` is larger than `paint`, so a player standing at the border does not make the texture flicker on and off.
 */
export const SIGN_FIELD = {
  gantry: { show: 800, paint: 380, unpaint: 600 },
  side: { show: 500, paint: 230, unpaint: 380 },
  /** At most this many boards get their texture drawn in one frame (a canvas costs a few ms). The Quality preset lowers it (Q.signPaintPerFrame). */
  paintPerFrame: 3,
};

/** One drawable face of a board: the material always exists, the canvas texture only while the player is near (or always, for the test boards). */
interface FaceSlot {
  mat: THREE.MeshBasicMaterial;
  rows: SignRow[];
  color: SignColor;
  widthPx?: number;
  heightRows?: number;
  tex: THREE.CanvasTexture | null;
  /** Key of the shared texture in texCache (null while not painted). */
  key: string | null;
}

/** A board of the plan that is hidden / painted by distance. */
interface FieldEntry {
  group: THREE.Group;
  x: number;
  z: number;
  showR2: number;
  paintR2: number;
  unpaintR2: number;
  slots: FaceSlot[];
  painted: boolean;
}

/** Point, height and unit tangent of a road at distance s from its start. */
function roadPointAt(r: RoadSpec, s: number): { x: number; y: number; z: number; tx: number; tz: number; i: number } {
  const sc = Math.max(0, Math.min(r.length, s));
  let i = 0;
  while (i < r.xs.length - 2 && r.cum[i + 1] < sc) i++;
  const seg = r.cum[i + 1] - r.cum[i];
  const f = seg > 1e-6 ? Math.min(1, Math.max(0, (sc - r.cum[i]) / seg)) : 0;
  let tx = r.xs[i + 1] - r.xs[i];
  let tz = r.zs[i + 1] - r.zs[i];
  const tl = Math.hypot(tx, tz) || 1;
  tx /= tl;
  tz /= tl;
  return { x: r.xs[i] + (r.xs[i + 1] - r.xs[i]) * f, y: r.ys[i] + (r.ys[i + 1] - r.ys[i]) * f, z: r.zs[i] + (r.zs[i + 1] - r.zs[i]) * f, tx, tz, i };
}

/** Height of the lower edge of the board above the ground (m). */
const CLEARANCE = 2.0;
const POST_R = 0.05;
const POST_BELOW = 0.8;

export class RoadSignLayer {
  readonly group = new THREE.Group();
  private slots: FaceSlot[] = [];
  private entries: FieldEntry[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private metal = new THREE.MeshLambertMaterial({ color: 0x4d5258 });
  private concrete = new THREE.MeshLambertMaterial({ color: 0x9a9a95 });
  private count = 0;
  /** Textures by what is written on the face: boards with the same text share one texture (refs = faces using it). */
  private texCache = new Map<string, { tex: THREE.CanvasTexture; refs: number }>();
  /** Solid parts of every board, for SignPhysics (filled while the boards are built). */
  readonly solidGroups: SignSolidGroup[] = [];
  /** 1 by day, down to 0.6 at night (the boards are a little darker). */
  private nightK = 1;

  constructor(private root: THREE.Object3D) {
    this.group.name = 'road-signs';
    root.add(this.group);
  }

  get signCount(): number {
    return this.count;
  }

  /** Boards that are visible right now / have their text drawn right now (for the console and the debug panel). */
  get fieldStats(): { total: number; visible: number; painted: number; textures: number; solids: number } {
    let visible = 0;
    let painted = 0;
    for (const e of this.entries) {
      if (e.group.visible) visible++;
      if (e.painted) painted++;
    }
    return { total: this.entries.length, visible, painted, textures: this.texCache.size, solids: this.solidGroups.length };
  }

  // ----- faces: a material that is a plain board colour until a texture is drawn into it -----

  private newSlot(rows: SignRow[], color: SignColor, widthPx?: number, heightRows?: number): FaceSlot {
    const mat = new THREE.MeshBasicMaterial({ color: BOARD_COLOR[color], polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const slot: FaceSlot = { mat, rows, color, widthPx, heightRows, tex: null, key: null };
    this.slots.push(slot);
    this.tint(slot);
    return slot;
  }

  private tint(s: FaceSlot): void {
    if (s.tex) s.mat.color.setScalar(this.nightK);
    else s.mat.color.setHex(BOARD_COLOR[s.color]).multiplyScalar(this.nightK);
  }

  /** What is written on a face (the visible text, colour and size): faces with the same key look the same and share one texture. */
  private faceKey(s: FaceSlot): string {
    const rows = s.rows.map((r) => `${r.arrow ?? ''}|${r.bn}|${r.en}|${r.km == null ? '' : `${kmEn(r.km)}~${kmBn(r.km)}`}`).join('/');
    return `${s.color}#${Math.round(s.widthPx ?? 0)}x${s.heightRows ?? 0}#${rows}`;
  }

  /** Draws the text of a face into a canvas texture (or takes the texture of a face with the same text). Does nothing when there is no DOM (headless). */
  private paint(s: FaceSlot): boolean {
    if (s.tex) return true;
    const key = this.faceKey(s);
    let hit = this.texCache.get(key);
    if (!hit) {
      const c = drawSignCanvas(s.rows, s.color, { widthPx: s.widthPx, heightRows: s.heightRows });
      if (!c) return false;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, Q.maxAniso);
      hit = { tex, refs: 0 };
      this.texCache.set(key, hit);
    }
    hit.refs++;
    s.key = key;
    s.tex = hit.tex;
    s.mat.map = hit.tex;
    s.mat.needsUpdate = true;
    this.tint(s);
    return true;
  }

  /** Lets go of the texture of a face (it becomes a plain coloured board again); the texture is freed when no face uses it any more. */
  private unpaint(s: FaceSlot): void {
    if (!s.tex) return;
    const hit = s.key ? this.texCache.get(s.key) : undefined;
    if (hit && --hit.refs <= 0) {
      hit.tex.dispose();
      this.texCache.delete(s.key!);
    } else if (!hit) s.tex.dispose();
    s.tex = null;
    s.key = null;
    s.mat.map = null;
    s.mat.needsUpdate = true;
    this.tint(s);
  }

  private register(group: THREE.Group, x: number, z: number, radii: { show: number; paint: number; unpaint: number }, slots: FaceSlot[]): void {
    const k = Q.signRadiusMul; // the Quality preset: Low draws fewer / nearer boards
    this.entries.push({ group, x, z, showR2: (radii.show * k) ** 2, paintR2: (radii.paint * k) ** 2, unpaintR2: (radii.unpaint * k) ** 2, slots, painted: false });
    group.visible = false; // updateField shows it when the player is near
  }

  /**
   * Builds one side sign. `lazy` = false (the Step 1 test boards): text drawn at once, always visible; returns false when there is no DOM to draw it (headless).
   * `lazy` = true (the plan of Step 5): hidden and plain until the player is near, see updateField.
   */
  addSideSign(spec: SideSignSpec, lazy = false): boolean {
    if (!lazy && typeof document === 'undefined') return false;
    const slot = this.newSlot(spec.rows, spec.color);
    const W = BOARD_W_M;
    const H = boardHeightM(spec.rows.length);

    const g = new THREE.Group();
    g.name = 'side-sign';

    // board body (thin box, the back side is plain metal) and the face on its front
    const bodyGeo = new THREE.BoxGeometry(W + 0.08, H + 0.08, 0.06);
    const faceGeo = new THREE.PlaneGeometry(W, H);
    this.geos.push(bodyGeo, faceGeo);
    const body = new THREE.Mesh(bodyGeo, this.metal);
    body.position.set(0, CLEARANCE + H / 2, -0.03);
    const face = new THREE.Mesh(faceGeo, slot.mat);
    face.position.set(0, CLEARANCE + H / 2, 0.004);
    g.add(body, face);

    // two posts behind the board, down into the ground
    const postH = CLEARANCE + H + 0.25 + POST_BELOW;
    const postGeo = new THREE.CylinderGeometry(POST_R, POST_R, postH, 8);
    this.geos.push(postGeo);
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, this.metal);
      p.position.set(sx * (W / 2 - 0.4), (CLEARANCE + H + 0.25 - POST_BELOW) / 2, -0.14);
      g.add(p);
    }

    g.position.set(spec.x, spec.y, spec.z);
    g.rotation.y = Math.atan2(spec.fx, spec.fz); // local +Z (the face) -> (fx, fz)
    this.group.add(g);
    const sideS = sideSolids(W, H, CLEARANCE, W / 2 - 0.4, -0.14, POST_BELOW);
    this.solidGroups.push({ x: spec.x, y: spec.y, z: spec.z, yaw: g.rotation.y, radius: solidsRadius(sideS), solids: sideS });
    this.count++;
    if (lazy) this.register(g, spec.x, spec.z, SIGN_FIELD.side, [slot]);
    else this.paint(slot);
    return true;
  }

  /**
   * Builds one OVERHEAD GANTRY: two round posts on concrete bases (one on each road edge), a frame (top and bottom pipe + a sign body) across ALL lanes,
   * and 1..3 panels whose faces together cover the whole width between the posts. `lazy` as in addSideSign. Returns null when there is no DOM and `lazy` is false.
   * Local frame (group rotated so that +Z = the way the boards face = back at the driver, +X = the driver's right): the lowest part of the gantry is
   * `GANTRY.clearanceM` above the road surface; the panels sit on the front of the sign body.
   */
  addGantry(spec: GantrySpec, lazy = false): GantryResult | null {
    if (spec.boards.length === 0) return null;
    if (!lazy && typeof document === 'undefined') return null;
    const lay = layoutGantry(spec.edge, spec.boards.length);
    // too many panels for this road: the extra ones are merged into the last panel (at most 4 rows)
    const panels: GantryBoard[] = spec.boards.slice(0, lay.n).map((b) => ({ rows: b.rows.slice(), color: b.color }));
    for (const extra of spec.boards.slice(lay.n)) panels[lay.n - 1].rows.push(...extra.rows);
    for (const p of panels) p.rows = p.rows.slice(0, 4);
    const heightRows = Math.max(...panels.map((p) => p.rows.length));

    // the pixel density of the faces is the same horizontally and vertically
    const hs = GANTRY.heightScale;
    const pxPerM = BOARD_PX_PER_M / hs;
    const slots = panels.map((p) => this.newSlot(p.rows, p.color, lay.panelW * pxPerM, heightRows));

    const g = new THREE.Group();
    g.name = 'gantry';
    const faceH = boardHeightM(heightRows) * hs;
    const faceBottom = GANTRY.clearanceM + GANTRY.faceLiftM;
    const faceTop = faceBottom + faceH;
    const bodyH = faceH + 2 * GANTRY.bodyPadM;
    const bodyMid = faceBottom + faceH / 2;
    const topPipeY = faceTop + GANTRY.bodyPadM + GANTRY.chordR;
    const botPipeY = GANTRY.clearanceM + GANTRY.chordR;

    // the sign body: the plain metal back of all the panels (seen from the other direction) + the two chord pipes along its top and bottom
    const bodyGeo = new THREE.BoxGeometry(lay.span + 0.1, bodyH, GANTRY.bodyDepthM);
    this.geos.push(bodyGeo);
    const body = new THREE.Mesh(bodyGeo, this.metal);
    body.position.set(0, bodyMid, 0);
    g.add(body);
    const pipeGeo = new THREE.CylinderGeometry(GANTRY.chordR, GANTRY.chordR, lay.frameLen, 10);
    pipeGeo.rotateZ(Math.PI / 2); // along local X
    this.geos.push(pipeGeo);
    for (const y of [topPipeY, botPipeY]) {
      const pipe = new THREE.Mesh(pipeGeo, this.metal);
      pipe.position.set(0, y, -0.05);
      g.add(pipe);
    }

    // the two posts (round tubes) with a concrete base each, from a little below the foot up past the top pipe
    const feet = [spec.footLeftY - spec.y, spec.footRightY - spec.y];
    const baseGeo = new THREE.BoxGeometry(GANTRY.baseSizeM, GANTRY.baseHeightM, GANTRY.baseSizeM);
    this.geos.push(baseGeo);
    for (let k = 0; k < 2; k++) {
      const bottom = Math.min(feet[k], 0) - GANTRY.postBelowM;
      const top = topPipeY + GANTRY.chordR + GANTRY.postAboveM;
      const geo = new THREE.CylinderGeometry(GANTRY.postR, GANTRY.postR, top - bottom, 12);
      this.geos.push(geo);
      const x = k === 0 ? -spec.edge : spec.edge;
      const post = new THREE.Mesh(geo, this.metal);
      post.position.set(x, (top + bottom) / 2, -0.15);
      g.add(post);
      const base = new THREE.Mesh(baseGeo, this.concrete);
      base.position.set(x, feet[k] + GANTRY.baseHeightM / 2 - 0.1, -0.15);
      g.add(base);
    }

    // the panels on the front of the sign body, side by side over the whole width
    const faceZ = GANTRY.bodyDepthM / 2 + 0.004;
    for (let i = 0; i < slots.length; i++) {
      const faceGeo = new THREE.PlaneGeometry(lay.panelW, faceH);
      this.geos.push(faceGeo);
      const face = new THREE.Mesh(faceGeo, slots[i].mat);
      face.position.set(lay.xs[i], bodyMid, faceZ);
      g.add(face);
    }

    g.position.set(spec.x, spec.y, spec.z);
    g.rotation.y = Math.atan2(-spec.hx, -spec.hz); // local +Z (the faces) -> back at the driver = -(hx, hz); local +X -> his right
    this.group.add(g);
    const gantryS = gantrySolids(spec.edge, [feet[0], feet[1]], topPipeY + GANTRY.chordR + GANTRY.postAboveM, GANTRY.postR, GANTRY.postBelowM, GANTRY.baseSizeM, GANTRY.baseHeightM, -0.15);
    this.solidGroups.push({ x: spec.x, y: spec.y, z: spec.z, yaw: g.rotation.y, radius: solidsRadius(gantryS), solids: gantryS });
    this.count++;
    if (lazy) this.register(g, spec.x, spec.z, SIGN_FIELD.gantry, slots);
    else for (const s of slots) this.paint(s);
    return { placed: lay.n, merged: lay.merged, span: lay.span, fits: lay.fits };
  }

  /**
   * STEP 5: builds EVERY board of the plan on the whole map: overhead boards as gantries (panels from splitPanels, full width of their road),
   * side boards on the left edge of their road. All of them start hidden and plain; updateField shows them and draws the text when the player is near.
   * Returns a short text for the console.
   */
  addPlanned(net: RoadNetwork, plan: readonly PlannedSign[], groundAt: (x: number, z: number) => number): string {
    const byId = new Map<number, RoadSpec>(net.roads.map((r) => [r.id, r]));
    let gantries = 0;
    let panels = 0;
    let sides = 0;
    let noRoad = 0;
    let noSpot = 0;
    let tooNarrow = 0;
    for (const q of plan) {
      if (q.style === 'overhead') {
        const road = byId.get(q.roadId);
        if (!road) {
          noRoad++;
          continue;
        }
        const y = roadPointAt(road, q.s).y;
        const edge = gantryEdge(road.halfWidth, road.shoulder);
        // left of the driver (hx, hz) is (hz, -hx)
        const res = this.addGantry(
          {
            x: q.x,
            y,
            z: q.z,
            hx: q.hx,
            hz: q.hz,
            edge,
            footLeftY: groundAt(q.x + q.hz * edge, q.z - q.hx * edge),
            footRightY: groundAt(q.x - q.hz * edge, q.z + q.hx * edge),
            boards: splitPanels(q.rows).map((rows) => ({ rows, color: q.color })),
          },
          true,
        );
        if (!res) continue;
        gantries++;
        panels += res.placed;
        if (!res.fits) tooNarrow++;
      } else if (q.sideOk) {
        if (this.addSideSign({ x: q.sx, y: groundAt(q.sx, q.sz), z: q.sz, fx: q.fx, fz: q.fz, rows: q.rows, color: q.color }, true)) sides++;
      } else noSpot++;
    }
    return `Step 5: ${gantries} gantries (${panels} panels) + ${sides} side boards placed on the whole map (${plan.length} planned; no road ${noRoad}, no free side spot ${noSpot}, gantry too narrow ${tooNarrow}). Text is drawn only within ${SIGN_FIELD.gantry.paint} m (gantries) / ${SIGN_FIELD.side.paint} m (side boards) of the player.`;
  }

  /**
   * Once per rendered frame with the player's ABSOLUTE world position: hides the far boards, draws the text of the near ones (at most
   * SIGN_FIELD.paintPerFrame per call) and frees the text of the ones the player has left.
   */
  updateField(px: number, pz: number): void {
    let budget = Math.min(SIGN_FIELD.paintPerFrame, Q.signPaintPerFrame);
    for (const e of this.entries) {
      const dx = e.x - px;
      const dz = e.z - pz;
      const d2 = dx * dx + dz * dz;
      const vis = d2 < e.showR2;
      if (e.group.visible !== vis) e.group.visible = vis;
      if (e.painted) {
        if (d2 > e.unpaintR2) {
          for (const s of e.slots) this.unpaint(s);
          e.painted = false;
        }
      } else if (vis && d2 < e.paintR2 && budget > 0) {
        let all = true;
        for (const s of e.slots) all = this.paint(s) && all;
        e.painted = all;
        budget--;
      }
    }
  }

  /** Once per rendered frame. lampOn = 0 (day) .. 1 (night): the boards are a little darker at night. */
  update(lampOn: number): void {
    this.nightK = 1 - 0.4 * Math.min(1, Math.max(0, lampOn));
    for (const s of this.slots) this.tint(s);
  }

  dispose(): void {
    this.root.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const c of this.texCache.values()) c.tex.dispose();
    this.texCache.clear();
    for (const s of this.slots) s.mat.dispose();
    this.solidGroups.length = 0;
    this.metal.dispose();
    this.concrete.dispose();
    this.geos.length = 0;
    this.slots.length = 0;
    this.entries.length = 0;
    this.count = 0;
  }
}

// ROAD SIGNS - 3D layer (Step 1: one kind of board, the SIDE sign, plus a few test boards near the spawn).
//
// A side sign = two posts + a flat board; the face carries Bangla + English names, an arrow and the distance (SignCanvas.ts).
// Traffic drives on the LEFT (as in Bangladesh), so a board stands on the LEFT edge of the road, outside the gravel shoulder, and looks back
// at the drivers who come towards it (turned a few degrees towards the road).
// Children use ABSOLUTE world coordinates (parent = world.root, which the floating origin moves), like StreetLights / StationSignLayer.
// Step 2 added the real destination table + road distances, Step 3 the placement plan, Step 4 (this file too) the OVERHEAD GANTRY:
// two posts on the road edges, a beam across all lanes and 1..3 boards on the beam (layout maths in GantryLayout.ts).
import * as THREE from 'three';
import type { RoadNetwork, RoadSpec } from '../roads';
import { BOARD_W_M, boardHeightM, drawSignCanvas } from './SignCanvas';
import { GANTRY, gantryEdge, layoutGantry } from './GantryLayout';
import type { SignColor, SignRow } from './SignFormat';
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
  /** Boards from the driver's LEFT to his RIGHT (1..3; more than fit are dropped, see layoutGantry). */
  boards: GantryBoard[];
}

export interface GantryResult {
  placed: number;
  dropped: number;
  scale: number;
  fits: boolean;
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

/** Real places of the map for the STEP 4 demo gantry (the km are straight-line, as in Step 1). */
const DEMO_PLACES = {
  central: { en: 'Central City', bn: 'কেন্দ্রীয় শহর', x: 0, z: 0 },
  airport: { en: 'Airport', bn: 'বিমানবন্দর', x: 2500, z: -3828 },
  seaport: { en: 'Seaport', bn: 'সমুদ্রবন্দর', x: 1740, z: 2920 },
};

/** Height of the lower edge of the board above the ground (m). */
const CLEARANCE = 2.0;
const POST_R = 0.05;
const POST_BELOW = 0.8;

export class RoadSignLayer {
  readonly group = new THREE.Group();
  private faceMats: THREE.MeshBasicMaterial[] = [];
  private textures: THREE.CanvasTexture[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private metal = new THREE.MeshLambertMaterial({ color: 0x4d5258 });
  private count = 0;

  constructor(private root: THREE.Object3D) {
    this.group.name = 'road-signs';
    root.add(this.group);
  }

  get signCount(): number {
    return this.count;
  }

  /** Builds one side sign. Returns false when there is no DOM to draw the text (headless). */
  addSideSign(spec: SideSignSpec): boolean {
    const canvas = drawSignCanvas(spec.rows, spec.color);
    if (!canvas) return false;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.textures.push(tex);

    const W = BOARD_W_M;
    const H = boardHeightM(spec.rows.length);
    const faceMat = new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.faceMats.push(faceMat);

    const g = new THREE.Group();
    g.name = 'side-sign';

    // board body (thin box, the back side is plain metal) and the face on its front
    const bodyGeo = new THREE.BoxGeometry(W + 0.08, H + 0.08, 0.06);
    const faceGeo = new THREE.PlaneGeometry(W, H);
    this.geos.push(bodyGeo, faceGeo);
    const body = new THREE.Mesh(bodyGeo, this.metal);
    body.position.set(0, CLEARANCE + H / 2, -0.03);
    const face = new THREE.Mesh(faceGeo, faceMat);
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
    this.count++;
    return true;
  }

  /**
   * STEP 1 TEST ONLY: three boards in a row on the left edge of the road nearest to (px, pz) - the player start, across the F4 road from the mall.
   * They stand 60 / 110 / 160 m ahead of the road point nearest to the player and face back at it, so standing on the road and looking along it you see
   * all three. The names are real places of the map but the arrows are only there to show all three arrow kinds, and the km are STRAIGHT-LINE
   * distances from the board (Step 2 replaces them by real road distances to the real destination table).
   * Returns a short text for the console / the handoff note.
   */
  addStep1TestSigns(net: RoadNetwork, groundAt: (x: number, z: number) => number, px: number, pz: number): string {
    // nearest point of a normal (not earthen, not roundabout) road to the player start
    let best: RoadSpec | null = null;
    let bestI = -1;
    let bestD = Infinity;
    for (const road of net.roads) {
      if (road.earth || road.kind === 'roundabout') continue;
      for (let i = 0; i < road.xs.length; i++) {
        if (road.bridgeOf[i] >= 0) continue;
        const d = Math.hypot(road.xs[i] - px, road.zs[i] - pz);
        if (d < bestD) {
          bestD = d;
          best = road;
          bestI = i;
        }
      }
    }
    if (!best) return 'no road found';
    const r: RoadSpec = best;
    const s0 = r.cum[bestI];
    // drive direction: the way with at least 200 m of road ahead
    const dir: 1 | -1 = s0 + 200 <= r.length ? 1 : -1;

    const at = (s: number): { x: number; y: number; z: number; tx: number; tz: number; i: number } => {
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
    };

    // fixed demo places (x, z in world metres); Step 2 builds the real table from WorldZones
    const CENTRAL = { en: 'Central City', bn: 'কেন্দ্রীয় শহর', x: 0, z: 0 };
    const AIRPORT = { en: 'Airport', bn: 'বিমানবন্দর', x: 2500, z: -3828 };
    const SEAPORT = { en: 'Seaport', bn: 'সমুদ্রবন্দর', x: 1740, z: 2920 };
    const BAZAAR = { en: 'South Bazaar', bn: 'দক্ষিণ বাজার', x: 0, z: 1550 };
    const NORTH = { en: 'North Industrial City', bn: 'উত্তর শিল্পনগর', x: 800, z: -3350 };
    const UNI = { en: 'University Town', bn: 'বিশ্ববিদ্যালয় নগর', x: -1150, z: -1150 };
    type Place = typeof CENTRAL;
    const demos: { color: SignColor; rows: [Place, 'ahead' | 'left' | 'right'][] }[] = [
      { color: 'green', rows: [[CENTRAL, 'ahead'], [AIRPORT, 'right'], [SEAPORT, 'left']] },
      { color: 'blue', rows: [[BAZAAR, 'ahead']] },
      { color: 'green', rows: [[NORTH, 'ahead'], [UNI, 'right']] },
    ];

    const lines: string[] = [];
    let s = s0 + dir * 60;
    for (let k = 0; k < demos.length; k++) {
      // find a spot that is not on a bridge, not on another road's asphalt and not inside a junction pad
      let placed = false;
      for (let tries = 0; tries < 25 && !placed; tries++, s += dir * 10) {
        const p = at(s);
        if (r.bridgeOf[p.i] >= 0) continue;
        // left of the travel direction (hx, hz) = dir * tangent is (hz, -hx)
        const hx = p.tx * dir;
        const hz = p.tz * dir;
        const lx = hz;
        const lz = -hx;
        const edge = r.halfWidth + r.shoulder + 0.9;
        const fxp = p.x + lx * edge;
        const fzp = p.z + lz * edge;
        if (net.surfaceAt(fxp, fzp) === 1 || net.padAt(fxp, fzp)) continue;
        // face: back along the road (towards the oncoming driver), turned ~7 degrees towards the road centre
        let fx = -hx - lx * 0.12;
        let fz = -hz - lz * 0.12;
        const fl = Math.hypot(fx, fz) || 1;
        fx /= fl;
        fz /= fl;
        const demo = demos[k];
        const rows: SignRow[] = demo.rows.map(([pl, arrow]) => ({
          en: pl.en,
          bn: pl.bn,
          arrow,
          km: Math.hypot(pl.x - fxp, pl.z - fzp) / 1000,
        }));
        placed = this.addSideSign({ x: fxp, y: groundAt(fxp, fzp), z: fzp, fx, fz, rows, color: demo.color });
        if (placed) lines.push(`board ${k + 1} (${demo.color}, ${rows.length} rows) on road ${r.name} at x=${fxp.toFixed(0)} z=${fzp.toFixed(0)}`);
        s += dir * 50; // next board 50 m further
      }
    }
    return `Step 1 test signs: ${lines.length} placed. ${lines.join('; ')}`;
  }

  /**
   * Builds one OVERHEAD GANTRY: two posts (one on each road edge), a box beam across the road and 1..3 boards on the front of the beam.
   * Returns null when there is no DOM to draw the text (headless).
   * Local frame (group rotated so that +Z = the way the boards face = back at the driver, +X = the driver's right): the posts stand at x = -edge / +edge,
   * the beam is `GANTRY.clearanceM` above the road surface, the boards sit on its front with their lower edge a little above the beam's lower edge.
   */
  addGantry(spec: GantrySpec): GantryResult | null {
    const boards = spec.boards.slice(0, GANTRY.maxBoards);
    if (boards.length === 0) return null;
    const lay = layoutGantry(spec.edge, boards.length);
    // draw every face first; if any fails (no DOM) nothing is built
    const faces: HTMLCanvasElement[] = [];
    for (let i = 0; i < lay.n; i++) {
      const c = drawSignCanvas(boards[i].rows, boards[i].color);
      if (!c) return null;
      faces.push(c);
    }

    const g = new THREE.Group();
    g.name = 'gantry';
    const beamBottom = GANTRY.clearanceM;
    const beamTop = beamBottom + GANTRY.beamH;

    // the beam
    const beamGeo = new THREE.BoxGeometry(lay.beamLen, GANTRY.beamH, GANTRY.beamDepth);
    this.geos.push(beamGeo);
    const beam = new THREE.Mesh(beamGeo, this.metal);
    beam.position.set(0, beamBottom + GANTRY.beamH / 2, 0);
    g.add(beam);

    // the two posts, from a little below their foot to a little above the beam
    const feet = [spec.footLeftY - spec.y, spec.footRightY - spec.y];
    for (let k = 0; k < 2; k++) {
      const bottom = Math.min(feet[k], 0) - GANTRY.postBelowM;
      const top = beamTop + GANTRY.postAboveBeamM;
      const geo = new THREE.CylinderGeometry(GANTRY.postR, GANTRY.postR, top - bottom, 10);
      this.geos.push(geo);
      const post = new THREE.Mesh(geo, this.metal);
      post.position.set(k === 0 ? -spec.edge : spec.edge, (top + bottom) / 2, 0);
      g.add(post);
    }

    // the boards on the front of the beam
    const bodyZ = GANTRY.beamDepth / 2 + 0.05;
    for (let i = 0; i < lay.n; i++) {
      const tex = new THREE.CanvasTexture(faces[i]);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      this.textures.push(tex);
      const faceMat = new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      this.faceMats.push(faceMat);
      const W = lay.boardW;
      const H = boardHeightM(boards[i].rows.length) * lay.scale;
      const bodyGeo = new THREE.BoxGeometry(W + 0.1, H + 0.1, 0.06);
      const faceGeo = new THREE.PlaneGeometry(W, H);
      this.geos.push(bodyGeo, faceGeo);
      const cy = beamBottom + GANTRY.boardLiftM + H / 2;
      const body = new THREE.Mesh(bodyGeo, this.metal);
      body.position.set(lay.xs[i], cy, bodyZ);
      const face = new THREE.Mesh(faceGeo, faceMat);
      face.position.set(lay.xs[i], cy, bodyZ + 0.034);
      g.add(body, face);
    }

    g.position.set(spec.x, spec.y, spec.z);
    g.rotation.y = Math.atan2(-spec.hx, -spec.hz); // local +Z (the faces) -> back at the driver = -(hx, hz); local +X -> his right
    this.group.add(g);
    this.count++;
    return { placed: lay.n, dropped: lay.dropped, scale: lay.scale, fits: lay.fits };
  }

  /**
   * STEP 4 TEST ONLY: gantries near the player start to check the model by eye.
   *  (a) up to `count` of the planned OVERHEAD boards (SignPlan.ts) nearest to (px, pz), each as a one-board gantry on its real road, at least 150 m apart;
   *  (b) one demo gantry with THREE boards (ahead / right / left) on the road nearest to (px, pz), about 260 m ahead of the point nearest to the player.
   * Returns a short text for the console.
   */
  addStep4TestGantries(net: RoadNetwork, plan: readonly PlannedSign[], groundAt: (x: number, z: number) => number, px: number, pz: number, count = 3, maxDist = 2500): string {
    const byId = new Map<number, RoadSpec>(net.roads.map((r) => [r.id, r]));
    // the two post positions of a gantry at road point (x, z) with driver heading (hx, hz): left = (hz, -hx)
    const feet = (x: number, z: number, hx: number, hz: number, edge: number): { l: [number, number]; r: [number, number] } => ({
      l: [x + hz * edge, z - hx * edge],
      r: [x - hz * edge, z + hx * edge],
    });
    const build = (road: RoadSpec, x: number, y: number, z: number, hx: number, hz: number, boards: GantryBoard[]): GantryResult | null => {
      const edge = gantryEdge(road.halfWidth, road.shoulder);
      const f = feet(x, z, hx, hz, edge);
      return this.addGantry({ x, y, z, hx, hz, edge, footLeftY: groundAt(f.l[0], f.l[1]), footRightY: groundAt(f.r[0], f.r[1]), boards });
    };

    const lines: string[] = [];
    // (a) planned overhead boards
    const cand = plan
      .filter((q) => q.style === 'overhead')
      .map((q) => ({ q, d: Math.hypot(q.x - px, q.z - pz) }))
      .filter((c) => c.d <= maxDist)
      .sort((a, b) => a.d - b.d);
    const picked: PlannedSign[] = [];
    for (const c of cand) {
      if (picked.length >= count) break;
      if (picked.some((o) => Math.hypot(o.x - c.q.x, o.z - c.q.z) < 150)) continue;
      picked.push(c.q);
    }
    for (const q of picked) {
      const road = byId.get(q.roadId);
      if (!road) continue;
      const y = roadPointAt(road, q.s).y;
      const res = build(road, q.x, y, q.z, q.hx, q.hz, [{ rows: q.rows, color: q.color }]);
      if (!res) continue;
      lines.push(`#${q.id} ${q.purpose} ${q.roadName} (${q.roadKind}, ${q.lanes} lanes) at x=${q.x.toFixed(0)} z=${q.z.toFixed(0)}: ${q.rows.map((r) => `${r.arrow} ${r.en} ${(r.km ?? 0).toFixed(1)}`).join(' | ')}`);
    }

    // (b) three-board demo on the road nearest to the player (a normal road, not earthen, not a roundabout)
    let best: RoadSpec | null = null;
    let bestI = -1;
    let bestD = Infinity;
    for (const road of net.roads) {
      if (road.earth || road.kind === 'roundabout') continue;
      for (let i = 0; i < road.xs.length; i++) {
        if (road.bridgeOf[i] >= 0) continue;
        const d = Math.hypot(road.xs[i] - px, road.zs[i] - pz);
        if (d < bestD) {
          bestD = d;
          best = road;
          bestI = i;
        }
      }
    }
    let demo = 'no road for the 3-board demo';
    if (best) {
      const r: RoadSpec = best;
      const s0 = r.cum[bestI];
      const dir: 1 | -1 = s0 + 330 <= r.length ? 1 : -1;
      const edge = gantryEdge(r.halfWidth, r.shoulder);
      const P = DEMO_PLACES;
      const boards: GantryBoard[] = [
        { color: 'green', rows: [{ en: P.seaport.en, bn: P.seaport.bn, arrow: 'left', km: 4.4 }] },
        { color: 'green', rows: [{ en: P.central.en, bn: P.central.bn, arrow: 'ahead', km: 1.2 }, { en: P.airport.en, bn: P.airport.bn, arrow: 'ahead', km: 5.1 }] },
        { color: 'blue', rows: [{ en: P.airport.en, bn: P.airport.bn, arrow: 'right', km: 5.1 }] },
      ];
      let s = s0 + dir * 260;
      for (let tries = 0; tries < 30; tries++, s += dir * 10) {
        const p = roadPointAt(r, s);
        if (r.bridgeOf[p.i] >= 0 || r.bridgeOf[Math.min(r.bridgeOf.length - 1, p.i + 1)] >= 0) continue;
        const hx = p.tx * dir;
        const hz = p.tz * dir;
        const f = feet(p.x, p.z, hx, hz, edge);
        // posts must not stand on another road or in a junction, and the beam centre not inside a junction
        if (net.surfaceAt(f.l[0], f.l[1]) === 1 || net.surfaceAt(f.r[0], f.r[1]) === 1 || net.padAt(p.x, p.z)) continue;
        const res = build(r, p.x, p.y, p.z, hx, hz, boards);
        if (res) demo = `3-board demo on road ${r.name} (${r.kind}, ${r.lanes} lanes) at x=${p.x.toFixed(0)} z=${p.z.toFixed(0)}: ${res.placed} boards placed, ${res.dropped} dropped, scale ${res.scale.toFixed(2)}${res.fits ? '' : ' (DOES NOT FIT the road)'}`;
        break;
      }
    }
    return `Step 4 test gantries: ${lines.length} planned overhead boards placed. ${lines.join(' ;; ')} || ${demo}`;
  }

  /**
   * STEP 3 PREVIEW ONLY: shows a few boards of the plan (SignPlan.ts) near (px, pz) so the rows, arrows and km can be checked by eye.
   * Only the planned SIDE boards are shown here (the overhead ones are the gantries of Step 4), on the left edge of the road, at most `maxDist` m from the player;
   * two chosen boards are never closer than 40 m. Returns a short text for the console.
   */
  addPlannedPreview(plan: readonly PlannedSign[], groundAt: (x: number, z: number) => number, px: number, pz: number, count = 6, maxDist = 1500): string {
    const cand = plan
      .filter((q) => q.style === 'side' && q.sideOk)
      .map((q) => ({ q, d: Math.hypot(q.sx - px, q.sz - pz) }))
      .filter((c) => c.d <= maxDist)
      .sort((a, b) => a.d - b.d);
    const picked: PlannedSign[] = [];
    for (const c of cand) {
      if (picked.length >= count) break;
      if (picked.some((o) => Math.hypot(o.sx - c.q.sx, o.sz - c.q.sz) < 40)) continue;
      picked.push(c.q);
    }
    const lines: string[] = [];
    for (const q of picked) {
      if (!this.addSideSign({ x: q.sx, y: groundAt(q.sx, q.sz), z: q.sz, fx: q.fx, fz: q.fz, rows: q.rows, color: q.color })) continue;
      lines.push(`#${q.id} ${q.purpose}/${q.style} ${q.roadName} at x=${q.sx.toFixed(0)} z=${q.sz.toFixed(0)}: ${q.rows.map((r) => `${r.arrow} ${r.en} ${(r.km ?? 0).toFixed(1)}`).join(' | ')}`);
    }
    return `Step 3 preview: ${lines.length} planned side boards placed. ${lines.join(' ;; ')}`;
  }

  /** Once per rendered frame. lampOn = 0 (day) .. 1 (night): the boards are a little darker at night. */
  update(lampOn: number): void {
    const k = 1 - 0.4 * Math.min(1, Math.max(0, lampOn));
    for (const m of this.faceMats) m.color.setScalar(k);
  }

  dispose(): void {
    this.root.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const t of this.textures) t.dispose();
    for (const m of this.faceMats) m.dispose();
    this.metal.dispose();
    this.geos.length = 0;
    this.textures.length = 0;
    this.faceMats.length = 0;
    this.count = 0;
  }
}

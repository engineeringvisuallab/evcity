// ROAD SIGNS - 3D layer (Step 1: one kind of board, the SIDE sign, plus a few test boards near the spawn).
//
// A side sign = two posts + a flat board; the face carries Bangla + English names, an arrow and the distance (SignCanvas.ts).
// Traffic drives on the LEFT (as in Bangladesh), so a board stands on the LEFT edge of the road, outside the gravel shoulder, and looks back
// at the drivers who come towards it (turned a few degrees towards the road).
// Children use ABSOLUTE world coordinates (parent = world.root, which the floating origin moves), like StreetLights / StationSignLayer.
// Later steps add: the real destination table + road distances (Step 2), the placement rules (Step 3), the overhead gantry (Step 4).
import * as THREE from 'three';
import type { RoadNetwork, RoadSpec } from '../roads';
import { BOARD_W_M, boardHeightM, drawSignCanvas } from './SignCanvas';
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
   * STEP 3 PREVIEW ONLY: shows a few boards of the plan (SignPlan.ts) near (px, pz) so the rows, arrows and km can be checked by eye.
   * Every board is built as a SIDE board (the overhead gantry comes in Step 4), on the left edge of the road, at most `maxDist` m from the player;
   * two chosen boards are never closer than 40 m. Returns a short text for the console.
   */
  addPlannedPreview(plan: readonly PlannedSign[], groundAt: (x: number, z: number) => number, px: number, pz: number, count = 6, maxDist = 1500): string {
    const cand = plan
      .filter((q) => q.sideOk)
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
    return `Step 3 preview: ${lines.length} planned boards placed (side style). ${lines.join(' ;; ')}`;
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

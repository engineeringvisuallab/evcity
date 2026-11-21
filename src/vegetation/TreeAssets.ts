import * as THREE from 'three';
import { Config } from '../core/Config';
import { Q } from '../core/Quality';
import { mulberry32 } from '../world/Seed';
import { TREE_KIND_COUNT, TreeKind, usesPalmAtlas } from './TreeTypes';
import { windGust } from './WindGust';
import { makePalmAtlas, PALM_BARK_TILES, PALM_MAKERS, PALM_TILES } from './PalmAssets';

/**
 * Tree models (built from code, no files) + the shared tree material.
 *
 * REALISTIC TREES: every model is ONE geometry (a whole forest is a handful of draw calls) made of
 *   - tapered, slightly bent trunks with a root flare, plus branches (tubes with a bark texture), and
 *   - a crown of many LEAF CARDS: small quads that carry a painted cluster of real-looking leaves (alpha cut-out), oriented
 *     randomly inside an ellipsoid. Their shading normals point away from the crown centre, so the whole crown is lit like one
 *     soft, round mass (bright on top, dark underneath) instead of hundreds of flat squares.
 * One painted texture atlas (a strip of 5 tiles, made on a canvas at start-up, no files): 0 bark, 1 ovate-leaf sprays, 2 needles,
 *   3 lobed-leaf sprays, 4 dense leaf mass (far LOD). Every leaf is painted individually (shape, veins, serrated rim, petiole).
 * Two detail levels per kind: 0 = near (LOD0 chunks), 1 = far (LOD1 chunks).
 * Kinds (TreeTypes): broadleaf = round-crowned shade tree, pine = layered conifer (high ground),
 *   palm = tall slender tree with a wide flat crown (the savanna tree of the reference picture; the old umbrella "palm" is gone).
 * More kinds (see TreeTypes): sal, segun, koroi, bot, shimul, debdaru use the same atlas; coconut, date palm, palmyra, banana and krishnachura use a second
 * atlas (PalmAssets.ts: fronds, fans, banana leaves, flowers) and their own material.
 */

export const TILES = 7;
/** Pixel size of one atlas tile: 800 -> the whole atlas is 4000 x 800 (4K wide, still inside every GPU's texture limit). The painters draw in a logical 512 space scaled by K. */
const TILE = 584; // 7 tiles x 584 = 4088 px: the whole atlas stays under 4096 (the limit of many phones; 6 tiles of 800 would be 4800)
const LS = 512;
const K = TILE / LS;
/** Branches x3 in total (3 levels of 1.44x) and leaves /2 for every old tree (not the gums). Lower BRANCH_LEVEL_MUL if the frame rate drops; leaves per tree = cards x 0.4 / (BRANCH_LEVEL_MUL^3 x 2) per twig tip (see leafCluster). */
const BRANCH_LEVEL_MUL = 1.44;
export const TILE_BARK = 0;
export const TILE_LEAF = 1;
export const TILE_NEEDLE = 2;
export const TILE_LOBED = 3;
export const TILE_MASS = 4;
export const TILE_GUM = 5;
export const TILE_SINGLE = 6; // ONE dry leaf (the fallen leaves on the ground are single leaves)

// ---------------------------------------------------------------------------------------------------------------------
// texture atlas (canvas, painted once)
// ---------------------------------------------------------------------------------------------------------------------

function paintBark(c: CanvasRenderingContext2D, tile: number): void {
  const x0 = tile * LS;
  const r = mulberry32(777);
  c.save();
  c.scale(K, K);
  c.beginPath();
  c.rect(x0, 0, LS, LS);
  c.clip();
  c.fillStyle = '#6b5a49';
  c.fillRect(x0, 0, LS, LS);
  // vertical fibres, wrapped sideways so the tile has no seam around the trunk
  for (let i = 0; i < 900; i++) {
    const x = r() * LS;
    const y = r() * LS;
    const w = 2 + r() * 9;
    const len = 50 + r() * 260;
    const l = 26 + r() * 28;
    c.fillStyle = `hsla(${26 + r() * 16}, ${14 + r() * 16}%, ${l}%, ${0.35 + r() * 0.4})`;
    for (const dx of [0, -LS, LS]) c.fillRect(x0 + x + dx, y - len / 2, w, len);
  }
  // dark cracks
  c.lineCap = 'round';
  for (let i = 0; i < 120; i++) {
    let x = r() * LS;
    let y = r() * LS;
    const len = 40 + r() * 200;
    c.strokeStyle = `rgba(25,16,9,${0.35 + r() * 0.4})`;
    c.lineWidth = 1.5 + r() * 3;
    for (const dx of [0, -LS, LS]) {
      c.beginPath();
      c.moveTo(x0 + x + dx, y);
      let cx = x;
      for (let s = 0; s < 6; s++) {
        cx += (r() - 0.5) * 14;
        c.lineTo(x0 + cx + dx, y + (len / 6) * (s + 1));
      }
      c.stroke();
    }
    x += 0;
    y += 0;
  }
  // light patches (moss / dry bark)
  for (let i = 0; i < 60; i++) {
    const x = r() * LS;
    const y = r() * LS;
    c.fillStyle = `rgba(${150 + r() * 40},${135 + r() * 30},${105 + r() * 25},0.15)`;
    for (const dx of [0, -LS, LS]) {
      c.beginPath();
      c.ellipse(x0 + x + dx, y, 6 + r() * 22, 20 + r() * 50, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

const hsl = (h: number, s: number, l: number, a = 1): string => `hsla(${h.toFixed(1)}, ${Math.max(0, s).toFixed(1)}%, ${Math.min(96, Math.max(3, l)).toFixed(1)}%, ${a})`;

/** Half-width of an ovate leaf (0..1) at fraction t along its length: rounded base, widest near 40 %, drawn-out pointed tip. */
const ovate = (t: number): number => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.82) * (1 - 0.3 * t);

interface LeafLook {
  hue: number;
  sat: number;
  light: number;
  /** sideways bend of the blade (fraction of its length at the tip) */
  curl: number;
  /** 0 = smooth edge, 1 = fine saw teeth */
  serrate: number;
}

/** Outline of one ovate leaf lying along +x (base at the origin, tip at x = len), with an optional serrated edge. */
function ovatePath(c: CanvasRenderingContext2D, len: number, wid: number, curl: number, serrate: number): void {
  const N = 30;
  c.beginPath();
  for (let side = -1; side <= 1; side += 2) {
    for (let k = 0; k <= N; k++) {
      const i = side < 0 ? k : N - k;
      const t = i / N;
      const tooth = serrate > 0 ? serrate * wid * 0.075 * ((t * 16) % 1) * Math.sin(Math.PI * t) : 0;
      const w = wid * ovate(t) + tooth;
      const x = t * len;
      const y = curl * len * t * t + side * w;
      if (side < 0 && k === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
  }
  c.closePath();
}

/** One painted ovate leaf (shaded blade, darker rim, midrib, lateral veins, petiole) at (x, y) pointing along `ang`. */
function drawOvateLeaf(c: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number, look: LeafLook, veins: boolean): void {
  const { hue, sat, light, curl, serrate } = look;
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const g = c.createLinearGradient(0, -wid, 0, wid);
  g.addColorStop(0, hsl(hue + 3, sat, light + 8));
  g.addColorStop(1, hsl(hue - 2, sat + 4, light - 7));
  c.fillStyle = g;
  ovatePath(c, len, wid, curl, serrate);
  c.fill();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = hsl(hue - 6, sat, light - 15, 0.55);
  c.lineWidth = Math.max(0.8, len * 0.014);
  c.stroke();
  if (veins) {
    c.strokeStyle = hsl(hue + 10, sat - 12, light + 13, 0.5);
    c.lineWidth = Math.max(0.6, len * 0.011);
    for (let i = 0; i < 6; i++) {
      const t = 0.1 + i * 0.135;
      const t2 = Math.min(0.97, t + 0.17);
      for (const sd of [-1, 1]) {
        c.beginPath();
        c.moveTo(t * len, curl * len * t * t);
        c.lineTo(t2 * len, curl * len * t2 * t2 + sd * wid * ovate(t2) * 0.78);
        c.stroke();
      }
    }
  }
  c.strokeStyle = hsl(hue + 14, sat - 16, light + 17, 0.85);
  c.lineWidth = Math.max(1, len * 0.024);
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.48, 0, len * 0.96, curl * len * 0.92);
  c.stroke();
  // petiole (leaf stalk)
  c.strokeStyle = hsl(hue - 20, sat - 8, light - 4, 1);
  c.lineWidth = Math.max(1.4, len * 0.03);
  c.beginPath();
  c.moveTo(-len * 0.22, 0);
  c.lineTo(len * 0.04, 0);
  c.stroke();
  c.restore();
}

/** Radius (0..1) of a five-lobed palmate leaf (fig / oak / maple family) in direction `a` from the leaf base: deep notches between lobes. */
const lobeR = (a: number): number => {
  const u = Math.abs((2.5 * a) / Math.PI);
  const tri = 1 - 2 * Math.abs(u - Math.round(u)); // 1 at every lobe tip, 0 in every notch
  return (0.4 + 0.6 * Math.pow(Math.max(0, tri), 0.85)) * (1 - (0.28 * Math.abs(a)) / 2.5) * (1 + 0.02 * Math.sin(a * 37));
};
const LOBE_TIPS = [0, 1.2566, -1.2566, 2.5133, -2.5133];

/** One painted lobed leaf (base at the origin, middle lobe along +x), with a vein running into every lobe. */
function drawLobedLeaf(c: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, look: LeafLook): void {
  const { hue, sat, light } = look;
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const g = c.createLinearGradient(0, -len * 0.9, 0, len * 0.9);
  g.addColorStop(0, hsl(hue + 3, sat, light + 8));
  g.addColorStop(1, hsl(hue - 2, sat + 4, light - 7));
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, 0);
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const a = -2.5 + (5 * i) / N;
    const r = len * lobeR(a);
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = hsl(hue - 6, sat, light - 15, 0.55);
  c.lineWidth = Math.max(0.9, len * 0.012);
  c.stroke();
  c.strokeStyle = hsl(hue + 12, sat - 14, light + 15, 0.8);
  for (const a of LOBE_TIPS) {
    c.lineWidth = Math.max(1, len * (a === 0 ? 0.024 : 0.017));
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * len * lobeR(a) * 0.86, Math.sin(a) * len * lobeR(a) * 0.86);
    c.stroke();
  }
  c.strokeStyle = hsl(hue - 20, sat - 8, light - 4, 1);
  c.lineWidth = Math.max(1.6, len * 0.03);
  c.beginPath();
  c.moveTo(-len * 0.3, 0);
  c.lineTo(len * 0.04, 0);
  c.stroke();
  c.restore();
}

/**
 * A tile that holds ONE LEAF SPRAY: a few twigs that carry individual leaves (alternate along the stem, a terminal leaf at the tip).
 * The gaps between the leaves are transparent, so the crown shows layers, light and the branch skeleton instead of a solid green mass.
 * Leaf cards are aimed so that the tips of the sprays point away from the crown centre (see Mesh.card).
 */
function paintSprays(c: CanvasRenderingContext2D, tile: number, lobed: boolean, seed: number, gum = false): void {
  const r = mulberry32(seed);
  c.save();
  c.scale(K, K);
  c.translate(tile * LS, 0);
  c.beginPath();
  c.rect(0, 0, LS, LS);
  c.clip();
  const margin = LS * (lobed ? 0.15 : 0.1);
  interface Leaf { x: number; y: number; ang: number; len: number; look: LeafLook }
  const leaves: Leaf[] = [];
  const baseLen = gum ? 150 : lobed ? 78 : 84;
  // a twig: curved stem with leaves on alternate sides; side twigs grow out of the first level
  const twig = (sx: number, sy: number, ang0: number, L: number, n: number, depth: number): void => {
    const steps = 24;
    const bend = (r() - 0.5) * 0.9;
    const px: number[] = [sx];
    const py: number[] = [sy];
    const pa: number[] = [];
    for (let i = 0; i < steps; i++) {
      const a = ang0 + bend * (i / steps);
      pa.push(a);
      px.push(px[i] + Math.cos(a) * (L / steps));
      py.push(py[i] + Math.sin(a) * (L / steps));
    }
    pa.push(pa[steps - 1]);
    c.lineCap = 'round';
    for (let i = 0; i < steps; i++) {
      c.strokeStyle = '#4a3920';
      c.lineWidth = (depth === 0 ? 3.6 : 2.4) * (1 - 0.55 * (i / steps));
      c.beginPath();
      c.moveTo(px[i], py[i]);
      c.lineTo(px[i + 1], py[i + 1]);
      c.stroke();
    }
    const at = (t: number): { x: number; y: number; a: number } => {
      const f = Math.min(0.999, t) * steps;
      const i = Math.floor(f);
      const k = f - i;
      return { x: px[i] + (px[i + 1] - px[i]) * k, y: py[i] + (py[i + 1] - py[i]) * k, a: pa[i] };
    };
    for (let i = 0; i <= n; i++) {
      const t = i === n ? 1 : 0.16 + (0.84 * i) / n;
      const p = at(t);
      const side = i % 2 === 0 ? 1 : -1;
      const terminal = i === n;
      const len = baseLen * (1.05 - 0.3 * t) * (0.9 + 0.2 * r()) * (depth > 0 ? 0.88 : 1) * (terminal ? 1.05 : 1);
      let ang = terminal ? p.a + (r() - 0.5) * 0.3 : p.a + side * (0.8 + r() * 0.45);
      if (gum) ang = terminal ? Math.PI / 2 + (r() - 0.5) * 0.5 : Math.PI / 2 + side * (0.1 + r() * 0.5);
      const look: LeafLook = {
        // gum: grey-green, a little blue-silver, long sickle-shaped leaves that hang down (curl always to one side)
        hue: gum ? 92 + (r() - 0.5) * 22 : (lobed ? 110 : 106) + (r() - 0.5) * 24,
        sat: gum ? 22 + r() * 12 : 50 + r() * 16,
        light: gum ? 30 + r() * 14 + t * 6 : 27 + r() * 15 + t * 7 - (depth > 0 ? 0 : (1 - t) * 4),
        curl: gum ? 0.22 + r() * 0.3 : (r() - 0.5) * 0.22,
        serrate: lobed || gum ? 0 : 0.6 + r() * 0.5,
      };
      if (p.x > margin && p.x < LS - margin && p.y > margin && p.y < LS - margin) leaves.push({ x: p.x, y: p.y, ang, len, look });
    }
    if (depth === 0) {
      for (const t of [0.34, 0.58]) {
        const p = at(t);
        const side = r() < 0.5 ? 1 : -1;
        twig(p.x, p.y, p.a + side * (0.7 + r() * 0.3), L * (0.42 + r() * 0.12), Math.max(2, Math.round(n * 0.42)), 1);
      }
    }
  };
  const stems = gum ? 3 : lobed ? 3 : 4;
  for (let s = 0; s < stems; s++) {
    const spread = s / (stems - 1) - 0.5;
    twig(
      LS * 0.5 + spread * LS * 0.3 + (r() - 0.5) * 18,
      LS * 0.94,
      -Math.PI / 2 + spread * 1.0 + (r() - 0.5) * 0.2,
      LS * (0.7 + r() * 0.12),
      gum ? 6 : lobed ? 6 : 7,
      0,
    );
  }
  for (const lf of leaves) {
    if (lobed) drawLobedLeaf(c, lf.x, lf.y, lf.ang, lf.len, lf.look);
    else drawOvateLeaf(c, lf.x, lf.y, lf.ang, lf.len, lf.len * (gum ? 0.1 : 0.27), lf.look, !gum);
  }
  c.restore();
}

/** The dense far-LOD tile: a disc of many small leaves (distant crowns read as a soft green mass, with the same colours as the sprays). */
function paintMass(c: CanvasRenderingContext2D, tile: number, seed: number): void {
  const r = mulberry32(seed);
  c.save();
  c.scale(K, K);
  c.translate(tile * LS, 0);
  c.beginPath();
  c.rect(0, 0, LS, LS);
  c.clip();
  const cx = LS / 2;
  const cy = LS / 2;
  const R = LS * 0.44;
  const layers = [
    { n: 360, h: 112, s: 50, l: 26 },
    { n: 420, h: 105, s: 58, l: 36 },
    { n: 380, h: 98, s: 62, l: 46 },
  ];
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const rr = (R - 30) * Math.sqrt(r());
      const ang = r() * Math.PI * 2;
      const len = 40 + r() * 22;
      drawOvateLeaf(
        c,
        cx + Math.cos(ang) * rr,
        cy + Math.sin(ang) * rr,
        ang + (r() - 0.5) * 1.8,
        len,
        len * 0.3,
        { hue: L.h + (r() - 0.5) * 18, sat: L.s, light: L.l + (r() - 0.5) * 8, curl: 0, serrate: 0 },
        false,
      );
    }
  }
  c.restore();
}

function paintNeedles(c: CanvasRenderingContext2D, tile: number): void {
  const x0 = tile * LS;
  const r = mulberry32(31337);
  const cx = x0 + LS / 2;
  const cy = LS / 2;
  const R = LS * 0.45;
  c.save();
  c.scale(K, K);
  c.beginPath();
  c.rect(x0, 0, LS, LS);
  c.clip();
  c.lineCap = 'round';
  for (let b = 0; b < 9; b++) {
    const a = -Math.PI / 2 + (b / 8 - 0.5) * 2.4 + (r() - 0.5) * 0.2;
    const ex = cx + Math.cos(a) * R;
    const ey = cy + Math.sin(a) * R;
    c.strokeStyle = '#3b2a1a';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(ex, ey);
    c.stroke();
    for (let t = 0.08; t < 1; t += 0.018) {
      const bx = cx + (ex - cx) * t;
      const by = cy + (ey - cy) * t;
      for (const side of [-1, 1]) {
        const na = a + side * (0.9 + r() * 0.5);
        const nl = (18 + r() * 24) * (1 - t * 0.5);
        c.strokeStyle = `hsl(${128 + r() * 18}, ${34 + r() * 14}%, ${15 + r() * 14}%)`;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(bx + Math.cos(na) * nl, by + Math.sin(na) * nl);
        c.stroke();
      }
    }
  }
  c.restore();
}

/** One single leaf, big, in the middle of its tile (for the fallen leaves on the ground). Painted green; the instance colour turns it brown / tan / rust. */
function paintSingleLeaf(c: CanvasRenderingContext2D, tile: number): void {
  c.save();
  c.scale(K, K);
  c.translate(tile * LS, 0);
  c.beginPath();
  c.rect(0, 0, LS, LS);
  c.clip();
  const look: LeafLook = { hue: 98, sat: 42, light: 40, curl: 0.1, serrate: 0.25 };
  drawOvateLeaf(c, LS * 0.2, LS * 0.5, -0.12, LS * 0.62, LS * 0.2, look, true);
  c.restore();
}

/** The atlas as a DataTexture (rgb of the transparent pixels is filled in, so mip levels have no dark fringes). Null without a DOM (tests). */
function makeAtlas(): THREE.DataTexture | null {
  if (typeof document === 'undefined') return null;
  const W = TILE * TILES;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = TILE;
  const c = cv.getContext('2d');
  if (!c) return null;
  paintBark(c, TILE_BARK);
  paintSprays(c, TILE_LEAF, false, 1234);
  paintNeedles(c, TILE_NEEDLE);
  paintSprays(c, TILE_LOBED, true, 98765);
  paintMass(c, TILE_MASS, 4242);
  paintSprays(c, TILE_GUM, false, 31337, true);
  paintSingleLeaf(c, TILE_SINGLE);
  return atlasTexture(c, W, TILE, TILES, 1);
}

/**
 * Canvas atlas (a strip of `tiles` square tiles) -> mip-mapped texture. Transparent pixels of every leaf tile (index >= firstLeaf) are filled with the
 * tile's average leaf colour, so the mip-maps and the soft edges do not get dark halos.
 */
export function atlasTexture(c: CanvasRenderingContext2D, W: number, H: number, tiles: number, firstLeaf: number): THREE.DataTexture {
  const tw = Math.round(W / tiles);
  const img = c.getImageData(0, 0, W, H);
  const d = img.data;
  for (let t = firstLeaf; t < tiles; t++) {
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let y = 0; y < H; y++) {
      for (let x = t * tw; x < Math.min(W, (t + 1) * tw); x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] > 200) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++; }
      }
    }
    if (n === 0) continue;
    const ar = Math.round(sr / n), ag = Math.round(sg / n), ab = Math.round(sb / n);
    for (let y = 0; y < H; y++) {
      for (let x = t * tw; x < Math.min(W, (t + 1) * tw); x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] < 128) { d[i] = ar; d[i + 1] = ag; d[i + 2] = ab; }
      }
    }
  }
  const tex = new THREE.DataTexture(new Uint8Array(d.buffer), W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapT = THREE.RepeatWrapping; // the bark tile repeats along long trunks
  tex.anisotropy = Math.min(16, Q.maxAniso);
  tex.needsUpdate = true;
  return tex;
}


// ---------------------------------------------------------------------------------------------------------------------
// geometry builder
// ---------------------------------------------------------------------------------------------------------------------

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Mesh {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  /** `tiles` = number of tiles in the atlas the uv coordinates point into (the forest atlas has 5, the palm atlas more). */
  constructor(private tiles = TILES) {}

  private vert(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, b: number, g = b, bl = b): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(b, g, bl);
    return this.pos.length / 3 - 1;
  }

  /** A tapered tube along a polyline (trunk / branch). Bark texture, outward normals. */
  tube(points: THREE.Vector3[], radii: number[], seg: number, shade = 1, bark = TILE_BARK, tint?: readonly [number, number, number]): void {
    const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
    const rings: number[][] = [];
    const total = points.length;
    // bark texture repeats along the tube so its texels stay square: (length / circumference) repeats
    let len = 0;
    for (let i = 1; i < total; i++) len += points[i].distanceTo(points[i - 1]);
    const meanR = radii.reduce((a, b) => a + b, 0) / total;
    const vRep = Math.max(0.25, len / (Math.PI * 2 * Math.max(meanR, 0.02)));
    for (let i = 0; i < total; i++) {
      const prev = points[Math.max(i - 1, 0)];
      const next = points[Math.min(i + 1, total - 1)];
      const t = next.clone().sub(prev).normalize();
      const ref = Math.abs(t.y) > 0.95 ? V3(1, 0, 0) : V3(0, 1, 0);
      const a = new THREE.Vector3().crossVectors(ref, t).normalize();
      const b = new THREE.Vector3().crossVectors(t, a);
      const ring: number[] = [];
      for (let j = 0; j <= seg; j++) {
        const th = (j / seg) * Math.PI * 2;
        const dir = a.clone().multiplyScalar(Math.cos(th)).addScaledVector(b, Math.sin(th));
        const p = points[i].clone().addScaledVector(dir, radii[i]);
        const u = (bark + 0.03 + 0.94 * (j / seg)) / this.tiles;
        const v = 0.03 + 0.94 * (i / Math.max(total - 1, 1)) * vRep;
        const sh = shade * (0.85 + 0.15 * (i / total));
        ring.push(this.vert(p, dir, u, v, sh * tr, sh * tg, sh * tb));
      }
      rings.push(ring);
    }
    for (let i = 0; i < total - 1; i++) {
      for (let j = 0; j < seg; j++) {
        const a0 = rings[i][j], a1 = rings[i][j + 1], b0 = rings[i + 1][j], b1 = rings[i + 1][j + 1];
        this.idx.push(a0, a1, b0, a1, b1, b0);
      }
    }
  }

  /**
   * One leaf card. `n` = the card's plane normal (its front face), `shade` = the normal used for lighting, `tint` = colour multiplier
   * (leaf-to-leaf hue variation), `aim` = when given, the card is turned so that the tips of its leaf spray point along this direction.
   */
  card(center: THREE.Vector3, n: THREE.Vector3, upHint: THREE.Vector3, w: number, h: number, tile: number, rot: number, shade: THREE.Vector3, bright: number, flip: boolean, tint?: readonly [number, number, number], aim?: THREE.Vector3): void {
    const nn = n.clone().normalize();
    const hint = upHint.clone();
    if (Math.abs(hint.dot(nn)) > 0.95) hint.set(1, 0, 0);
    const right = new THREE.Vector3().crossVectors(hint, nn).normalize();
    const up2 = new THREE.Vector3().crossVectors(nn, right);
    if (aim) {
      // the spray tips are at the top of the tile (v = 0), which is the -up2 side of the card
      const qx = aim.dot(right), qy = aim.dot(up2);
      if (qx * qx + qy * qy > 1e-4) rot = Math.atan2(qx, -qy) + (rot / (Math.PI * 2) - 0.5) * 1.3;
    }
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const r2 = right.clone().multiplyScalar(cr).addScaledVector(up2, sr);
    const u2 = up2.clone().multiplyScalar(cr).addScaledVector(right, -sr);
    const sn = shade.clone().normalize();
    const u0 = tile / this.tiles, u1 = (tile + 1) / this.tiles;
    const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
    const ids: number[] = [];
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = center.clone().addScaledVector(r2, (sx * w) / 2).addScaledVector(u2, (sy * h) / 2);
      const su = flip ? -sx : sx;
      ids.push(this.vert(p, sn, su > 0 ? u1 : u0, sy > 0 ? 1 : 0, bright * tr, bright * tg, bright * tb));
    }
    this.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }

  /** A leaf card standing on `base`, its painted tip pointing along `dir`: `len` along it, `wid` across. `face` = roughly which way the flat side looks. */
  leafAlong(base: THREE.Vector3, dir: THREE.Vector3, len: number, wid: number, face: THREE.Vector3, tile: number, bright: number, tint?: readonly [number, number, number]): void {
    const d = dir.clone().normalize();
    const n = face.clone().addScaledVector(d, -face.dot(d));
    if (n.lengthSq() < 1e-4) n.set(-d.z, 0, d.x);
    n.normalize();
    const centre = base.clone().addScaledVector(d, len / 2);
    this.card(centre, n, d.clone().negate(), wid, len, tile, 0, n, bright, false, tint);
  }

  /**
   * A bent strip along `pts` (base -> tip) with the painted tile mapped onto it (u across, v from the base at 1 to the tip at 0): palm fronds and banana
   * leaves. `widths[i]` = strip width at point i, `up` = which way the strip faces, `vee` = how far the two edges hang below the middle (fraction of the width).
   */
  ribbon(pts: THREE.Vector3[], widths: number[], up: THREE.Vector3, tile: number, bright: number, vee: number, tint?: readonly [number, number, number]): void {
    const N = pts.length;
    const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
    const rows: number[][] = [];
    for (let i = 0; i < N; i++) {
      const t = pts[Math.min(i + 1, N - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
      const side = new THREE.Vector3().crossVectors(t, up);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const nrm = new THREE.Vector3().crossVectors(side, t).normalize();
      const w = widths[i];
      const row: number[] = [];
      for (let k = 0; k < 3; k++) {
        const sd = k - 1;
        const p = pts[i].clone().addScaledVector(side, (sd * w) / 2).addScaledVector(nrm, -vee * w * 0.5 * Math.abs(sd));
        const nn = nrm.clone().addScaledVector(side, sd * vee * 0.9).normalize();
        row.push(this.vert(p, nn, (tile + k / 2) / this.tiles, 1 - i / (N - 1), bright * tr, bright * tg, bright * tb));
      }
      rows.push(row);
    }
    for (let i = 0; i < N - 1; i++) {
      for (let k = 0; k < 2; k++) {
        const a0 = rows[i][k], a1 = rows[i][k + 1], b0 = rows[i + 1][k], b1 = rows[i + 1][k + 1];
        this.idx.push(a0, a1, b0, a1, b1, b0);
      }
    }
  }

  /** A small lumpy ball (fruit): a few rings, solid colour `col` (it samples the plain white patch in the corner of `tile`). */
  blob(c: THREE.Vector3, rx: number, ry: number, rz: number, tile: number, col: readonly [number, number, number], seg = 6, rings = 4): void {
    const u = (tile + 0.07) / this.tiles;
    const rowsIdx: number[][] = [];
    for (let i = 0; i <= rings; i++) {
      const a = (i / rings) * Math.PI;
      const row: number[] = [];
      for (let j = 0; j < seg; j++) {
        const b = (j / seg) * Math.PI * 2;
        const dx = Math.sin(a) * Math.cos(b), dy = Math.cos(a), dz = Math.sin(a) * Math.sin(b);
        row.push(this.vert(V3(c.x + dx * rx, c.y + dy * ry, c.z + dz * rz), V3(dx, dy, dz), u, 0.5, col[0], col[1], col[2]));
      }
      rowsIdx.push(row);
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg;
        this.idx.push(rowsIdx[i][j], rowsIdx[i][j2], rowsIdx[i + 1][j], rowsIdx[i][j2], rowsIdx[i + 1][j2], rowsIdx[i + 1][j]);
      }
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export const unit = (r: () => number): THREE.Vector3 => {
  const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
  return V3(s * Math.cos(a), z, s * Math.sin(a));
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Leaf-to-leaf colour variation: most cards are a slightly cooler or warmer green, `warmChance` of them are yellow-green (young / sunlit leaves). */
function leafTint(r: () => number, warmChance: number): readonly [number, number, number] {
  if (r() < warmChance * 0.6) return [1.08, 1.04, 0.74]; // fewer, softer yellow-green cards (deeper green trees)
  const j = r();
  return [0.8 + 0.2 * j, 0.98 + 0.06 * (1 - j), 0.8 + 0.3 * (1 - j)];
}

/** A clump of leaf cards filling the shell of an ellipsoid. */
function crown(m: Mesh, r: () => number, c: THREE.Vector3, rx: number, ry: number, rz: number, count: number, sMin: number, sMax: number, warmChance = 0.22, tile = TILE_MASS): void {
  const yMin = c.y - ry, yMax = c.y + ry;
  for (let i = 0; i < count; i++) {
    const d = unit(r);
    if (d.y < -0.35) d.y = -0.35 + (d.y + 0.35) * 0.3; // the underside is flatter and mostly hidden
    const shell = 0.58 + 0.42 * r();
    const p = V3(c.x + d.x * rx * shell, c.y + d.y * ry * shell, c.z + d.z * rz * shell);
    const radial = V3(d.x / rx, d.y / ry, d.z / rz).normalize();
    const n = radial.clone().multiplyScalar(0.55).addScaledVector(unit(r), 0.75).normalize();
    if (n.dot(radial) < 0.2) n.addScaledVector(radial, 0.6).normalize();
    const size = lerp(sMin, sMax, r());
    const t = Math.min(1, Math.max(0, (p.y - yMin) / (yMax - yMin)));
    const bright = lerp(0.86, 1.2, t * t * 0.6 + t * 0.4) + (r() - 0.5) * 0.14;
    m.card(p, n, V3(0, 1, 0), size, size * lerp(0.85, 1.1, r()), tile, r() * Math.PI * 2, radial, bright, r() < 0.5, leafTint(r, warmChance));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// tree models
// ---------------------------------------------------------------------------------------------------------------------

/**
 * REAL BRANCHING. A tree is grown, not stamped: a bent trunk, primary limbs growing out of it, secondary limbs out of those and
 * twigs at the ends - every limb a tapered, slightly wobbling tube that bends up (towards the light) or droops (heavy outer
 * branches). Leaf clusters sit at the tips of the finest twigs, so the crown has holes, layers and a visible skeleton, and the
 * inside of the crown is darker than its sunlit outside.
 */
export interface Style {
  seed: number;
  trunkH: number;
  trunkR: number;
  trunkBend: number;
  /** primary limbs: count, where along the trunk they start (0..1), angle from vertical (rad), length (m), droop at the ends */
  primary: number;
  startFrac: number;
  spread: [number, number];
  limbLen: number;
  /** extra upright limbs forking from the top of the trunk (vase / oak shapes) */
  fork: number;
  /** child limbs per limb at levels 1, 2 and their length / radius ratio relative to the parent */
  kids: [number, number];
  lenRatio: [number, number];
  /** gravity on the outer limbs (negative = they rise) */
  droop: number;
  /** crown for shading and for the far LOD: centre height and radii */
  crownY: number;
  rx: number;
  ry: number;
  /** leaf clusters: cards per cluster, cluster radius (m), card size range (m), chance of a warm (yellow-green) leaf card */
  cards: number;
  clusterR: number;
  card: [number, number];
  warm: number;
  /** flat crowns squash the leaf clusters vertically (acacia / savanna tree) */
  flat?: number;
  /** lobed (palmate, fig / oak-like) leaves instead of ovate serrated ones */
  lobed?: boolean;
  /** Which atlas the uv coordinates point into (number of tiles; default = the forest atlas). */
  tiles?: number;
  /** Tile used for the bark / for the leaf sprays (defaults: forest atlas bark / ovate or lobed leaves), and a colour multiplier for the bark. */
  barkTile?: number;
  leafTile?: number;
  barkTint?: readonly [number, number, number];
  /** Flower cards per leaf cluster (sitting on top of the crown) and the tile that paints them. */
  bloomTile?: number;
  bloom?: number;
  /** Big buttress roots at the foot of the trunk: how many. */
  buttress?: number;
  /** Banyan: thin hanging roots, and thick pillar roots that carry the big limbs down to the ground. */
  aerial?: { hang: number; pillars: number };
  /** SIMPLE tree (like the gums): few limbs (no dal-pala multiplier, no extra limbs) and a fixed number of big leaf cards per twig tip, so a tree costs ~3k triangles instead of ~10k. */
  simple?: boolean;
  /** Banyan-style spreading crown: 0..1, how strongly the limbs are kept horizontal and straight (long flat limbs instead of a tangled dome). */
  horiz?: number;
  /** Far-LOD crown: card count and card size multiplier (big trees need more / bigger cards). */
  farScale?: number;
}

interface Grow {
  m: Mesh;
  r: () => number;
  s: Style;
  detail: number;
  clusters: THREE.Vector3[];
  /** Points on level 1-2 limbs where an aerial root can hang from (banyan). */
  hang: THREE.Vector3[];
}

const SEG = [9, 5, 3, 3]; // radial sides per branch level (near LOD); the thin level 2 / 3 twigs are 3-sided (was 4 for level 2)

/** Point (and direction) at fraction t along a polyline. */
function along(pts: THREE.Vector3[], t: number): { p: THREE.Vector3; d: THREE.Vector3; i: number } {
  const f = Math.min(Math.max(t, 0), 0.999) * (pts.length - 1);
  const i = Math.floor(f);
  const k = f - i;
  return { p: pts[i].clone().lerp(pts[i + 1], k), d: pts[i + 1].clone().sub(pts[i]).normalize(), i };
}

function limb(g: Grow, start: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, level: number): void {
  const { m, r, s } = g;
  const maxLevel = 3;
  const n = level === 0 ? 6 : level === 1 ? 5 : 4;
  const pts = [start.clone()];
  const radii = [r0];
  const d = dir.clone().normalize();
  const p = start.clone();
  const step = len / (n - 1);
  for (let i = 1; i < n; i++) {
    // wobble + tropism: the trunk and main limbs seek the light, the outer limbs sag under their own weight
    const hz = level >= 1 ? s.horiz ?? 0 : 0; // spreading crown (bot): straighter limbs that stay near-horizontal
    const wob = (level === 0 ? s.trunkBend : 0.28 + level * 0.06) * (1 - 0.6 * hz);
    d.x += (r() - 0.5) * wob;
    d.z += (r() - 0.5) * wob;
    d.y += (r() - 0.5) * wob * 0.5 + (level === 0 ? 0.04 : level === 1 ? 0.05 - s.droop * 0.05 : -s.droop * 0.1);
    if (hz > 0) d.y = Math.max(-0.08, Math.min(d.y + 0.05 * hz, 0.5)) * (1 - 0.3 * hz); // never dives into the ground, rises gently
    d.normalize();
    p.addScaledVector(d, step);
    pts.push(p.clone());
    radii.push(r0 * (level === 0 ? 1 - 0.62 * (i / (n - 1)) : 1 - 0.8 * (i / (n - 1))));
  }
  // TRIANGLES: the thinnest twigs (level 3, ~75 % of all bark triangles after the 3x dal-pala) are drawn with 3 points instead of 4 (start, middle, tip):
  // same curve to the eye (they are a few cm thick), a third fewer triangles. The growth above still uses all points, so the tree shape is unchanged.
  if (level >= 3 && g.detail === 0 && n === 4) m.tube([pts[0], along(pts, 0.5).p, pts[3]], [radii[0], (radii[1] + radii[2]) * 0.5, radii[3]], 3, 0.82 + 0.18 * Math.min(1, level / 2), s.barkTile ?? TILE_BARK, s.barkTint);
  else m.tube(pts, radii, Math.max(3, g.detail === 0 ? SEG[level] : 4), 0.82 + 0.18 * Math.min(1, level / 2), s.barkTile ?? TILE_BARK, s.barkTint);
  if (level >= 1 && s.aerial) g.hang.push(along(pts, 0.55).p, pts[n - 1].clone());

  if (level === 0 && g.detail === 0) {
    // root flare: short buttress roots spreading over the ground (tall plank-like buttresses for `buttress` kinds)
    const roots = s.buttress ?? 5;
    const big = s.buttress ? 2.2 : 1;
    for (let k = 0; k < roots; k++) {
      const a = (k / roots) * Math.PI * 2 + r() * 0.6;
      const ca = Math.cos(a), sa = Math.sin(a);
      const rr = r0 * (1.5 + r() * 0.8) * big;
      const mid = r0 * 0.9 * (big > 1 ? 1.5 : 1);
      m.tube([V3(ca * rr, -0.05, sa * rr), V3(ca * mid, r0 * 0.5 * big, sa * mid), V3(ca * r0 * 0.5, r0 * 1.7 * big, sa * r0 * 0.5)], [r0 * 0.2, r0 * 0.32, r0 * 0.5], 5, 1, s.barkTile ?? TILE_BARK, s.barkTint);
    }
  }

  if (level < maxLevel) {
    // MORE BRANCHES, FEWER LEAVES: every broadleaf tree (not the gums, already airy) gets 2 more main limbs and 25% more side limbs, so the branch skeleton shows
    const airy = s.leafTile === TILE_GUM || !!s.simple;
    // dal-pala: 3x as many branches in total (+200%) = 1.44x at each of the 3 branching levels (1.44^3 = 3); the 2 extra main limbs and +25% side limbs of before stay
    const bm = airy ? 1 : BRANCH_LEVEL_MUL;
    const count = level === 0 ? Math.round((s.primary + (airy ? 0 : 2)) * bm) : Math.max(1, Math.round(s.kids[level - 1] * (airy ? 1 : 1.25) * bm * (0.75 + r() * 0.5)));
    const t0 = level === 0 ? s.startFrac : 0.3;
    let az = r() * Math.PI * 2;
    for (let k = 0; k < count; k++) {
      const t = level === 0 ? t0 + (1 - t0) * ((k + r() * 0.6) / count) * 0.92 : t0 + (1 - t0) * ((k + r() * 0.5) / count);
      const at = along(pts, t);
      const rAt = radii[at.i] * 0.7;
      az += 2.399 + (r() - 0.5) * 0.8; // golden angle: limbs spiral round the trunk
      const ang = level === 0 ? s.spread[0] + r() * (s.spread[1] - s.spread[0]) : 0.55 + r() * 0.5;
      // rotate the parent direction by `ang` around an axis perpendicular to it, at azimuth `az`
      const ref = Math.abs(at.d.y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0);
      const u = new THREE.Vector3().crossVectors(ref, at.d).normalize();
      const v = new THREE.Vector3().crossVectors(at.d, u);
      const side = u.clone().multiplyScalar(Math.cos(az)).addScaledVector(v, Math.sin(az));
      const cd = at.d.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang));
      const cl = level === 0 ? s.limbLen * (0.75 + r() * 0.5) * (1 - 0.35 * Math.abs(t - 0.75)) : len * s.lenRatio[level - 1] * (0.8 + r() * 0.4) * (1 - 0.3 * t);
      limb(g, at.p, cd, cl, Math.max(rAt, 0.03), level + 1);
    }
    if (level === 0 && s.fork > 0) {
      // the trunk forks at the top into upright limbs
      for (let k = 0; k < s.fork; k++) {
        const a = (k / s.fork) * Math.PI * 2 + r() * 0.8;
        const cd = V3(Math.cos(a) * (0.35 + r() * 0.3), 1, Math.sin(a) * (0.35 + r() * 0.3)).normalize();
        limb(g, pts[n - 1], cd, s.limbLen * (0.9 + r() * 0.3), radii[n - 1] * 1.1, 1);
      }
    }
  }
  if (level >= maxLevel - 1) {
    // foliage sits at the tip of the thin limbs, and a second cluster part-way along the last ones
    g.clusters.push(pts[n - 1].clone());
    if (level === maxLevel && r() < 0.45) g.clusters.push(along(pts, 0.6).p);
  }
}

/**
 * Leaf cards (painted leaf sprays) around a cluster centre. The cards lie mostly flat and face up and out, like leaves do, and their
 * spray tips point away from the crown centre. The outer / upper ones are brighter, the inner / lower ones darker (crown occlusion).
 */
function leafCluster(g: Grow, c: THREE.Vector3, cc: THREE.Vector3): void {
  const { m, r, s } = g;
  // LEAVES: half as many leaf cards on the whole tree as before although there are 3x as many twig tips now -> on average only (cards x 0.4 / 6) cards per tip (often 0, often 1)
  let n = s.cards;
  if (s.leafTile !== TILE_GUM && !s.simple) {
    const want = (s.cards * 0.4) / (BRANCH_LEVEL_MUL ** 3 * 2);
    n = Math.floor(want) + (r() < want - Math.floor(want) ? 1 : 0);
  }
  const tile = s.leafTile ?? (s.lobed ? TILE_LOBED : TILE_LEAF);
  for (let i = 0; i < n; i++) {
    const d = unit(g.r);
    const rad = s.clusterR * (0.35 + 0.65 * Math.cbrt(r()));
    const p = V3(c.x + d.x * rad, c.y + d.y * rad * (s.flat ?? 1), c.z + d.z * rad);
    const radial = V3((p.x - cc.x) / s.rx, (p.y - cc.y) / s.ry, (p.z - cc.z) / s.rx).normalize();
    // plane normal: mostly up (leaves catch the sky), some outward lean, some random tilt
    const nrm = V3(0, 0.62, 0).addScaledVector(radial, 0.4).addScaledVector(unit(r), 0.62).normalize();
    if (nrm.dot(radial) < 0.1) nrm.addScaledVector(radial, 0.5).normalize();
    const size = lerp(s.card[0], s.card[1], r());
    // brightness: sunlit top / outside of the crown, shaded inside and underneath
    const dist = Math.min(1.25, Math.hypot((p.x - cc.x) / s.rx, (p.y - cc.y) / s.ry, (p.z - cc.z) / s.rx));
    const top = Math.min(1, Math.max(0, (p.y - (cc.y - s.ry)) / (2 * s.ry)));
    const bright = lerp(0.5, 1.2, Math.min(1, dist * 0.7 + top * 0.35)) + (r() - 0.5) * 0.16;
    m.card(p, nrm, V3(0, 1, 0), size, size * lerp(0.9, 1.08, r()), tile, r() * Math.PI * 2, radial, bright, r() < 0.5, leafTint(r, s.warm), radial);
  }
  // flowers: cards lying on the sunny top of the cluster (krishnachura)
  if (s.bloomTile !== undefined) {
    for (let i = 0; i < (s.bloom ?? 0); i++) {
      const d = unit(g.r);
      if (d.y < 0) d.y = -d.y * 0.3;
      const rad = s.clusterR * (0.5 + 0.6 * Math.cbrt(r()));
      const p = V3(c.x + d.x * rad, c.y + d.y * rad * (s.flat ?? 1) + 0.15, c.z + d.z * rad);
      const nrm = V3(0, 1, 0).addScaledVector(unit(r), 0.45).normalize();
      const size = lerp(0.8, 1.3, r());
      m.card(p, nrm, V3(0, 1, 0), size, size, s.bloomTile, r() * Math.PI * 2, V3(0, 1, 0), lerp(0.95, 1.2, r()), r() < 0.5);
    }
  }
}

/**
 * Banyan roots. `hang` thin ropes drop from the limbs (some reach the ground, young ones stop short); `pillars` thick columns grow from the outer limbs
 * to the ground and carry them, like the prop roots of a real bot gach.
 */
function aerialRoots(g: Grow, a: { hang: number; pillars: number }): void {
  const { m, r, s } = g;
  const out = g.hang.filter((p) => Math.hypot(p.x, p.z) > 2.2 && p.y > s.trunkH * 0.55 && p.y < s.crownY + 1);
  if (out.length === 0) return;
  for (let k = 0; k < a.hang; k++) {
    const p = out[Math.floor(r() * out.length)];
    const yEnd = r() < 0.5 ? -0.05 : p.y * (0.25 + r() * 0.5);
    const rad = 0.035 + r() * 0.04;
    const pts: THREE.Vector3[] = [];
    const rr: number[] = [];
    for (let i = 0; i < 4; i++) {
      const f = i / 3;
      pts.push(V3(p.x + (r() - 0.5) * 0.12, lerp(p.y - 0.2, yEnd, f), p.z + (r() - 0.5) * 0.12));
      rr.push(rad * (0.7 + 0.5 * f));
    }
    m.tube(pts, rr, 3, 0.95, s.barkTile ?? TILE_BARK, s.barkTint);
  }
  const far = out.filter((p) => p.y < s.crownY).sort((x, y) => Math.hypot(y.x, y.z) - Math.hypot(x.x, x.z));
  const taken: number[] = [];
  for (const p of far) {
    if (taken.length >= a.pillars) break;
    const ang = Math.atan2(p.z, p.x);
    if (taken.some((t) => Math.abs(Math.atan2(Math.sin(ang - t), Math.cos(ang - t))) < 0.9)) continue;
    taken.push(ang);
    const x = p.x * 0.97, z = p.z * 0.97;
    m.tube([V3(x, p.y - 0.3, z), V3(x * 1.01 + (r() - 0.5) * 0.3, p.y * 0.55, z * 1.01 + (r() - 0.5) * 0.3), V3(x * 1.03, 0.6, z * 1.03), V3(x * 1.03, -0.05, z * 1.03)], [0.2, 0.28, 0.4, 0.55], 6, 1, s.barkTile ?? TILE_BARK, s.barkTint);
  }
}

export function growTree(s: Style, detail: number): THREE.BufferGeometry {
  const r = mulberry32(s.seed);
  const m = new Mesh(s.tiles ?? TILES);
  const g: Grow = { m, r, s, detail, clusters: [], hang: [] };
  const cc = V3(0, s.crownY, 0);
  if (detail === 0) {
    limb(g, V3(0, 0, 0), V3(0.04, 1, 0.02), s.trunkH, s.trunkR, 0);
    for (const c of g.clusters) leafCluster(g, c, cc);
    if (s.aerial) aerialRoots(g, s.aerial);
  } else {
    // far LOD: one tube trunk, a few stubs and a handful of big leaf cards
    const seg = 5;
    m.tube([V3(0, 0, 0), V3(0.1, s.trunkH * 0.35, 0.04), V3(0, s.trunkH * 0.7, -0.05), V3(0, s.trunkH, 0)], [s.trunkR, s.trunkR * 0.7, s.trunkR * 0.55, s.trunkR * 0.4], seg, 1, s.barkTile ?? TILE_BARK, s.barkTint);
    const k = s.farScale ?? 1;
    crown(m, r, cc, s.rx * 0.95, s.ry * 0.95, s.rx * 0.95, Math.round((s.leafTile === TILE_GUM ? 20 : 6) * k * k), 2.6 * k, 3.8 * k, s.warm, s.leafTile ?? TILE_MASS);
    if (s.bloomTile !== undefined) {
      // far flowers: cards on the upper half of the crown
      for (let i = 0; i < Math.round(14 * 0.6 * k * k); i++) { // far flowers at 60% (2026-11-21)
        const d = unit(r);
        d.y = Math.abs(d.y) * 0.8 + 0.2;
        const p = V3(cc.x + d.x * s.rx * 0.9, cc.y + d.y * s.ry * 0.9, cc.z + d.z * s.rx * 0.9);
        const size = lerp(2.2, 3.2, r()) * k;
        m.card(p, V3(0, 1, 0).addScaledVector(unit(r), 0.4).normalize(), V3(0, 1, 0), size, size, s.bloomTile, r() * Math.PI * 2, V3(0, 1, 0), lerp(0.95, 1.2, r()), r() < 0.5);
      }
    }
  }
  return m.build();
}

// REAL-LOOK (v6): tall bare trunk, few limbs high up, a few hanging-leaf clusters (gum leaf tile, `simple`): sky and branches show through
const STYLE_ROUND: Style = {
  seed: 101, trunkH: 9, trunkR: 0.42, trunkBend: 0.16, primary: 5, startFrac: 0.55, spread: [0.5, 0.95], limbLen: 6.5, fork: 2,
  kids: [3, 2], lenRatio: [0.6, 0.55], droop: 0.22, crownY: 13.5, rx: 6, ry: 5, cards: 3, clusterR: 1.5, card: [1.9, 2.8], warm: 0.05, leafTile: TILE_GUM, simple: true, farScale: 1.4,
};
const STYLE_OAK: Style = {
  seed: 5150, trunkH: 8, trunkR: 0.5, trunkBend: 0.2, primary: 5, startFrac: 0.5, spread: [0.7, 1.1], limbLen: 7.5, fork: 2,
  kids: [3, 2], lenRatio: [0.6, 0.55], droop: 0.2, crownY: 12.5, rx: 7.5, ry: 4.5, cards: 3, clusterR: 1.5, card: [1.9, 2.8], warm: 0.05, leafTile: TILE_GUM, simple: true, farScale: 1.5,
};
const STYLE_VASE: Style = {
  seed: 7777, trunkH: 9.5, trunkR: 0.4, trunkBend: 0.14, primary: 4, startFrac: 0.65, spread: [0.3, 0.55], limbLen: 7, fork: 3,
  kids: [3, 2], lenRatio: [0.6, 0.55], droop: 0.1, crownY: 14.5, rx: 5, ry: 6, cards: 3, clusterR: 1.4, card: [1.9, 2.8], warm: 0.05, leafTile: TILE_GUM, simple: true, farScale: 1.4,
};
const STYLE_SLENDER: Style = {
  seed: 31415, trunkH: 10.5, trunkR: 0.26, trunkBend: 0.12, primary: 5, startFrac: 0.5, spread: [0.4, 0.75], limbLen: 5, fork: 1,
  kids: [3, 2], lenRatio: [0.6, 0.55], droop: 0.15, crownY: 15, rx: 4, ry: 5.5, cards: 3, clusterR: 1.3, card: [1.8, 2.6], warm: 0.05, leafTile: TILE_GUM, simple: true, farScale: 1.3,
};
/** The savanna tree: tall slender trunk, wide flat layered crown. */
const STYLE_ACACIA: Style = {
  seed: 202, trunkH: 8.4, trunkR: 0.34, trunkBend: 0.12, primary: 5, startFrac: 0.78, spread: [1.0, 1.35], limbLen: 3.8, fork: 0,
  kids: [3, 3], lenRatio: [0.55, 0.5], droop: -0.1, crownY: 11.2, rx: 4.8, ry: 1.5, cards: 7, clusterR: 1.25, card: [0.95, 1.5], warm: 0.2, flat: 0.45,
};

function broadleaf(detail: number): THREE.BufferGeometry {
  return growTree(STYLE_ROUND, detail);
}
function oak(detail: number): THREE.BufferGeometry {
  return growTree(STYLE_OAK, detail);
}
function vase(detail: number): THREE.BufferGeometry {
  return growTree(STYLE_VASE, detail);
}
function slender(detail: number): THREE.BufferGeometry {
  return growTree(STYLE_SLENDER, detail);
}
/** The tall slender tree with a wide flat crown. */
function palm(detail: number): THREE.BufferGeometry {
  return growTree(STYLE_ACACIA, detail);
}

/** Sal (Shorea robusta): the straight, tall forest tree of Bangladesh - a long clear trunk and a dense, narrow-oval dark crown. */
const STYLE_SAL: Style = {
  seed: 6006, trunkH: 13, trunkR: 0.55, trunkBend: 0.05, primary: 9, startFrac: 0.55, spread: [0.45, 0.8], limbLen: 5.5, fork: 1,
  kids: [3, 2], lenRatio: [0.55, 0.5], droop: 0.1, crownY: 20, rx: 5.2, ry: 7, cards: 8, clusterR: 1.3, card: [1.2, 1.9], warm: 0.1, farScale: 1.4,
};
/** Segun (teak): straight trunk, wide crown of very big leaves. */
const STYLE_SEGUN: Style = {
  seed: 7007, trunkH: 11, trunkR: 0.5, trunkBend: 0.06, primary: 7, startFrac: 0.6, spread: [0.6, 0.95], limbLen: 5, fork: 1,
  kids: [3, 3], lenRatio: [0.55, 0.5], droop: 0.15, crownY: 17.5, rx: 5.5, ry: 5, cards: 6, clusterR: 1.6, card: [2.2, 3.2], warm: 0.15, farScale: 1.5,
};
/** Koroi (rain tree): short trunk and a huge flat umbrella crown. */
const STYLE_KOROI: Style = {
  seed: 8008, trunkH: 6.5, trunkR: 0.7, trunkBend: 0.1, primary: 6, startFrac: 0.55, spread: [1.1, 1.4], limbLen: 8, fork: 2,
  kids: [3, 3], lenRatio: [0.55, 0.5], droop: 0.05, crownY: 13.5, rx: 10.5, ry: 3.8, cards: 11, clusterR: 1.9, card: [1.8, 2.7], warm: 0.1, flat: 0.55, farScale: 2.4,
};
/** Bot (banyan): short, very thick trunk with buttresses, limbs spreading wide, hanging roots and pillar roots. */
const STYLE_BOT: Style = {
  seed: 9009, trunkH: 4.2, trunkR: 1.4, trunkBend: 0.12, primary: 6, startFrac: 0.3, spread: [1.0, 1.3], limbLen: 13, fork: 1,
  kids: [2, 2], lenRatio: [0.7, 0.6], droop: 0.06, crownY: 10, rx: 19, ry: 5, cards: 9, clusterR: 2.8, card: [2.4, 3.6], warm: 0.08, flat: 0.55, horiz: 0.6, simple: true,
  buttress: 6, aerial: { hang: 14, pillars: 4 }, farScale: 3.2,
};
/** Shimul (silk cotton): very tall straight trunk with big buttresses, branches in flat tiers. */
const STYLE_SHIMUL: Style = {
  seed: 1010, trunkH: 20, trunkR: 0.9, trunkBend: 0.03, primary: 8, startFrac: 0.7, spread: [1.1, 1.4], limbLen: 7, fork: 1,
  kids: [3, 2], lenRatio: [0.55, 0.5], droop: 0.0, crownY: 25, rx: 7.5, ry: 4.5, cards: 10, clusterR: 1.9, card: [1.8, 2.8], warm: 0.1, flat: 0.7, buttress: 6, farScale: 1.8,
};
/** Debdaru (ashoka): a slim dark column with drooping leaves, the classic avenue tree. */
const STYLE_DEBDARU: Style = {
  seed: 1616, trunkH: 11, trunkR: 0.22, trunkBend: 0.03, primary: 16, startFrac: 0.3, spread: [0.12, 0.3], limbLen: 3.4, fork: 0,
  kids: [2, 2], lenRatio: [0.5, 0.45], droop: 0.35, crownY: 9.2, rx: 1.9, ry: 4.6, cards: 6, clusterR: 0.7, card: [0.8, 1.2], warm: 0.1,
};
/**
 * Gum (eucalyptus, like the Australian street-view trees): a tall, pale, crooked trunk, bare for the first third, a few long limbs that bend and
 * cross each other, and very few small clusters of long hanging leaves at the ends - the branch skeleton and the sky show through the crown.
 */
const STYLE_GUM: Style = {
  seed: 8421, trunkH: 16, trunkR: 0.62, trunkBend: 0.22, primary: 7, startFrac: 0.4, spread: [0.45, 0.95], limbLen: 11, fork: 2,
  kids: [3, 2], lenRatio: [0.62, 0.55], droop: 0.25, crownY: 21, rx: 11, ry: 8, cards: 5, clusterR: 1.8, card: [2.4, 3.4], warm: 0.05, leafTile: TILE_GUM,
  barkTint: [1.45, 1.38, 1.28], farScale: 1.8,
};
/** Gum 2: taller and more upright, a narrower crown high up, a few long limbs. */
const STYLE_GUM2: Style = {
  seed: 1357, trunkH: 21, trunkR: 0.5, trunkBend: 0.18, primary: 6, startFrac: 0.5, spread: [0.3, 0.6], limbLen: 8.5, fork: 3,
  kids: [3, 2], lenRatio: [0.6, 0.55], droop: 0.12, crownY: 27, rx: 7.5, ry: 9, cards: 5, clusterR: 1.6, card: [2.4, 3.4], warm: 0.05, leafTile: TILE_GUM,
  barkTint: [1.5, 1.4, 1.3], farScale: 1.7,
};
const gum2 = (detail: number): THREE.BufferGeometry => growTree(STYLE_GUM2, detail);
const gum = (detail: number): THREE.BufferGeometry => growTree(STYLE_GUM, detail);
const sal = (detail: number): THREE.BufferGeometry => growTree(STYLE_SAL, detail);
const segun = (detail: number): THREE.BufferGeometry => growTree(STYLE_SEGUN, detail);
const koroi = (detail: number): THREE.BufferGeometry => growTree(STYLE_KOROI, detail);
const bot = (detail: number): THREE.BufferGeometry => growTree(STYLE_BOT, detail);
const shimul = (detail: number): THREE.BufferGeometry => growTree(STYLE_SHIMUL, detail);
const debdaru = (detail: number): THREE.BufferGeometry => growTree(STYLE_DEBDARU, detail);

/**
 * REAL PINE (hill conifer, 24 m at scale 1): a long, straight, bare lower trunk (branchless for the first 30 %), then whorls of
 * branches every ~2 m: the low ones long and drooping, the upper ones short and rising. Needle sprays sit ALONG each branch
 * (not in a solid cone), so you see the trunk, the branch skeleton and sky through the gaps (faka faka).
 */
function pine(detail: number): THREE.BufferGeometry {
  const r = mulberry32(303);
  const m = new Mesh();
  const H = 24;
  const seg = detail === 0 ? 8 : 5;
  m.tube([V3(0, 0, 0), V3(0.06, 4, 0.03), V3(0.02, 9, 0.08), V3(0, 15, 0.03), V3(0, 20, 0), V3(0, H, 0)], [0.55, 0.42, 0.3, 0.2, 0.1, 0.03], seg);
  const whorls = detail === 0 ? 10 : 6;
  for (let i = 0; i < whorls; i++) {
    const f = i / (whorls - 1);
    const y = lerp(7, H - 1.8, f);
    const L = lerp(5.6, 0.9, Math.pow(f, 0.8));
    const n = detail === 0 ? 6 : 4;
    const rise = lerp(-0.12, 0.5, f);
    const a0 = r() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + (r() - 0.5) * 0.7;
      const out = V3(Math.cos(a), 0, Math.sin(a));
      const len = L * (0.75 + r() * 0.4);
      const p0 = V3(0, y + (r() - 0.5) * 0.6, 0);
      const p1 = p0.clone().addScaledVector(out, len * 0.5).add(V3(0, rise * len * 0.5, 0));
      const p2 = p0.clone().addScaledVector(out, len).add(V3(0, rise * len - 0.18 * len, 0));
      m.tube([p0, p1, p2], [0.09 * (0.5 + L / 5.6), 0.05, 0.015], 3);
      const cards = detail === 0 ? 3 : 2;
      for (let c = 0; c < cards; c++) {
        const t = lerp(0.4, 1, (c + 0.5) / cards);
        const pos = p0.clone().lerp(p1, Math.min(1, t * 2)).lerp(p2, Math.max(0, t * 2 - 1));
        pos.y += 0.1;
        const nrm = V3(0, 1, 0).multiplyScalar(0.8).addScaledVector(out, 0.35).normalize();
        const sz = (detail === 0 ? 1.7 : 2.6) * (0.55 + 0.45 * (L / 5.6)) * (1.15 - 0.3 * t);
        m.card(pos, nrm, out, sz * 0.8, sz, TILE_NEEDLE, r() * 0.4 - 0.2, nrm, lerp(0.6, 0.95, f) + (r() - 0.5) * 0.14, r() < 0.5, undefined, out);
      }
    }
  }
  // the leader: a small tuft on top
  m.card(V3(0, H - 0.8, 0), V3(0, 1, 0.2), V3(0, 0, 1), 1.4, 2.2, TILE_NEEDLE, 0, V3(0, 1, 0), 1.0, false);
  m.card(V3(0, H - 0.8, 0), V3(0.2, 1, 0), V3(1, 0, 0), 1.4, 2.2, TILE_NEEDLE, 0, V3(0, 1, 0), 1.0, true);
  return m.build();
}

/**
 * JUNGLE UNDERGROWTH (lata-pata): three small models for the jungle floor. They use the forest atlas and the same wind sway as the trees, and have no collider
 * (TREE_TRUNK r 0.03), so a person or car passes through them. The leaf colour is kept dark (shade 0.7-0.95): the jungle floor is in the shade.
 */
/** FERN (~1.2 m at scale 1): a rosette of arching fronds, each a thin stem with leaf sprays along it. */
function fern(detail: number): THREE.BufferGeometry {
  const r = mulberry32(551);
  const m = new Mesh();
  const n = detail === 0 ? 11 : 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const out = V3(Math.cos(a), 0, Math.sin(a));
    const len = lerp(0.9, 1.6, r());
    const up = lerp(0.35, 1.0, r()); // steep fronds in the middle, flat ones outside
    const p0 = V3(0, 0.05, 0);
    const p1 = p0.clone().addScaledVector(out, len * 0.45).add(V3(0, up * len * 0.6, 0));
    const p2 = p0.clone().addScaledVector(out, len).add(V3(0, up * len * 0.5 - 0.22 * len, 0));
    m.tube([p0, p1, p2], [0.014, 0.009, 0.004], 3, 0.8);
    const cards = detail === 0 ? 4 : 2;
    for (let c = 0; c < cards; c++) {
      const t = lerp(0.4, 1, (c + 0.5) / cards);
      const pos = p0.clone().lerp(p1, Math.min(1, t * 2)).lerp(p2, Math.max(0, t * 2 - 1));
      const aim = p2.clone().sub(p0).normalize();
      const nrm = V3(0, 1, 0).multiplyScalar(0.85).addScaledVector(out, 0.3).normalize();
      const sz = (0.85 + 0.45 * r()) * (1.1 - 0.35 * t);
      m.card(pos, nrm, out, sz * 0.62, sz, TILE_LEAF, r() * 0.5 - 0.25, nrm, lerp(0.85, 1.12, r()), r() < 0.5, leafTint(r, 0.1), aim);
    }
  }
  return m.build();
}

/** SHRUB (~1.5 m): a few thin stems and a dense, dark, leafy bush. */
function shrub(detail: number): THREE.BufferGeometry {
  const r = mulberry32(552);
  const m = new Mesh();
  const stems = detail === 0 ? 5 : 3;
  for (let k = 0; k < stems; k++) {
    const a = (k / stems) * Math.PI * 2 + r();
    const out = V3(Math.cos(a), 0, Math.sin(a));
    const hgt = lerp(0.9, 1.5, r());
    m.tube([V3(0, 0, 0), V3(0, hgt * 0.5, 0).addScaledVector(out, 0.15), V3(0, hgt, 0).addScaledVector(out, 0.4)], [0.03, 0.02, 0.01], 3, 0.85);
  }
  crown(m, r, V3(0, 0.85, 0), 0.7, 0.55, 0.7, detail === 0 ? 12 : 7, 0.7, 1.1, 0.16, TILE_MASS);
  crown(m, r, V3(0, 0.8, 0), 0.95, 0.75, 0.95, detail === 0 ? 16 : 8, 0.55, 0.9, 0.2, TILE_LEAF);
  return m.build();
}

/** LATA (~1.8 m): a creeper-covered mound with vines arching out and hanging down to the ground, lobed leaves along them. */
function lata(detail: number): THREE.BufferGeometry {
  const r = mulberry32(553);
  const m = new Mesh();
  crown(m, r, V3(0, 0.75, 0), 1.2, 0.75, 1.2, detail === 0 ? 22 : 12, 0.8, 1.2, 0.15, TILE_MASS);
  const vines = detail === 0 ? 9 : 4;
  for (let k = 0; k < vines; k++) {
    const a = (k / vines) * Math.PI * 2 + r() * 0.8;
    const out = V3(Math.cos(a), 0, Math.sin(a));
    const p0 = V3(0, 1.7, 0).addScaledVector(out, 0.35);
    const p1 = V3(0, 1.45, 0).addScaledVector(out, 1.0);
    const p2 = V3(0, 0.05, 0).addScaledVector(out, 1.4 + r() * 0.45);
    m.tube([p0, p1, p2], [0.016, 0.011, 0.006], 3, 0.8);
    const cards = detail === 0 ? 4 : 2;
    for (let c = 0; c < cards; c++) {
      const t = (c + 0.6) / (cards + 0.2);
      const pos = p0.clone().lerp(p1, Math.min(1, t * 2)).lerp(p2, Math.max(0, t * 2 - 1));
      const nrm = out.clone().multiplyScalar(0.9).add(V3(0, 0.25, 0)).normalize();
      m.card(pos, nrm, V3(0, 1, 0), 0.42, 0.5, TILE_LOBED, r() * Math.PI * 2, nrm, lerp(0.85, 1.12, r()), r() < 0.5, leafTint(r, 0.22));
    }
  }
  return m.build();
}

/**
 * JUNGLE FLOOR DEADWOOD. Two models lying on the ground of the dense jungle (placed by TreePlacement.cellDeadwood), no colliders (TREE_TRUNK r 0.03).
 * Both stand on the ground (their y = 0 is the ground; TreePlacement.footY does NOT sink them like a trunk).
 */
/** Dry, silvery-grey weathered bark: the bark tile times a pale tint (a vertex colour above 1 lightens it). */
const DEAD_BARK: readonly [number, number, number] = [1.45, 1.36, 1.25];

/** DEAD LOG (sukno gach): an old dry tree that fell long ago, ~7 m long and ~0.9 m thick at the root end (scale 1): a bent grey trunk, a broken tip, bare root stubs at one end and dry broken branch stumps (some forked) pointing up and sideways. */
function deadLog(detail: number): THREE.BufferGeometry {
  const r = mulberry32(561);
  const m = new Mesh();
  const seg = detail === 0 ? 8 : 5;
  const L = 7.0;
  const N = 7;
  const pts: THREE.Vector3[] = [];
  const rad: number[] = [];
  const at = (t: number) => ({ x: -L / 2 + L * t, y: 0, z: Math.sin(t * 2.6) * 0.22 });
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const rr = lerp(0.46, 0.2, t) * (1 + (r() - 0.5) * 0.08) * (1 + 0.55 * Math.max(0, 1 - t * 14)); // root flare at the foot
    const p = at(t);
    pts.push(V3(p.x, rr * 0.82 + 0.02 * Math.sin(t * 9), p.z));
    rad.push(rr);
  }
  m.tube(pts, rad, seg, 0.95, TILE_BARK, DEAD_BARK);
  // root stubs: dry thick roots sticking out of the foot (the root plate), up and sideways
  const roots = detail === 0 ? 6 : 4;
  for (let k = 0; k < roots; k++) {
    const a = (k / roots) * Math.PI * 2 + r() * 0.6;
    const out = V3(-0.7, 0.55 + r() * 0.9, 0).addScaledVector(V3(0, 0, Math.cos(a)), 0.9).addScaledVector(V3(0, Math.sin(a), 0), 0.5);
    const base = pts[0].clone().add(V3(0.45, 0, 0));
    const tip = base.clone().add(out.multiplyScalar(0.5 + r() * 0.6));
    tip.y = Math.max(tip.y, 0.1);
    const mid = base.clone().lerp(tip, 0.5).add(V3(0, 0.12, 0));
    m.tube([base, mid, tip], [0.19, 0.12, 0.05], 4, 0.92, TILE_BARK, DEAD_BARK);
  }
  // dry branch stumps along the top and the sides: broken short limbs, some with a fork
  const stumps = detail === 0 ? 7 : 4;
  for (let k = 0; k < stumps; k++) {
    const t = 0.12 + 0.8 * ((k + r() * 0.7) / stumps);
    const i = Math.min(N - 2, Math.floor(t * (N - 1)));
    const f = t * (N - 1) - i;
    const c = pts[i].clone().lerp(pts[i + 1], f);
    const rr = lerp(rad[i], rad[i + 1], f);
    const side = r() * Math.PI * 2;
    const dir = V3(0.35 + r() * 0.5, 0.8 + r() * 0.8, 0).addScaledVector(V3(0, 0, Math.cos(side)), 0.7).addScaledVector(V3(0, Math.sin(side) * 0.3, 0), 1).normalize();
    const len = lerp(0.5, 1.5, r()) * (1.1 - t * 0.6);
    const b0 = c.clone().addScaledVector(dir, rr * 0.6);
    const b1 = b0.clone().addScaledVector(dir, len * 0.55).add(V3(0, 0.08, 0));
    const b2 = b1.clone().addScaledVector(dir, len * 0.45).add(V3(0, -0.04, 0));
    const br = Math.max(0.045, rr * 0.28);
    m.tube([b0, b1, b2], [br, br * 0.7, br * 0.3], 4, 0.94, TILE_BARK, DEAD_BARK);
    if (detail === 0 && r() < 0.6) {
      const fd = dir.clone().add(V3((r() - 0.5) * 1.1, 0.25, (r() - 0.5) * 1.1)).normalize();
      m.tube([b1, b1.clone().addScaledVector(fd, len * 0.35), b1.clone().addScaledVector(fd, len * 0.6).add(V3(0, -0.05, 0))], [br * 0.6, br * 0.4, br * 0.12], 3, 0.94, TILE_BARK, DEAD_BARK);
    }
  }
  // the broken tip: a jagged splinter
  const tipP = pts[N - 1];
  m.tube([tipP.clone(), tipP.clone().add(V3(0.5, 0.1, 0.04)), tipP.clone().add(V3(0.95, 0.28, 0.1))], [rad[N - 1] * 0.9, rad[N - 1] * 0.5, 0.02], 4, 0.9, TILE_BARK, DEAD_BARK);
  return m.build();
}

/** Dry leaf colours (multiplied with the green leaf paint): brown, tan, rust, straw yellow. */

/** DRY LEAF (sukno pata): ONE single leaf lying flat on the ground (one card, 2 triangles). The colour (brown / tan / rust / straw) comes from the instance colour (TreeChunkBuilder), so every leaf is different; the ground is covered by many of these, loosely scattered. */
function leafLitter(detail: number): THREE.BufferGeometry {
  const r = mulberry32(562);
  const m = new Mesh();
  const tilt = V3((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3).normalize();
  const sz = (detail === 0 ? 0.36 : 0.5);
  m.card(V3(0, 0.035, 0), tilt, V3(0, 0, 1), sz, sz * 1.05, TILE_SINGLE, 0, tilt, 1, false, [1, 1, 1]);
  return m.build();
}

/** Geometries (shared by all chunks, never disposed per chunk) + one material with wind sway. */
export class TreeAssets {
  /** [kind][detail] */
  readonly geometries: THREE.BufferGeometry[][] = [];
  /** Forest-tree material (every kind except the palm-atlas ones). */
  readonly material: THREE.MeshLambertMaterial;
  /** Palm material: palms, banana and krishnachura (their own atlas). */
  readonly palmMaterial: THREE.MeshLambertMaterial;
  private time = { value: 0 };
  private atlas: THREE.DataTexture | null;
  private palmAtlas: THREE.DataTexture | null;

  constructor() {
    const makers: Record<number, (d: number) => THREE.BufferGeometry> = {
      [TreeKind.broadleaf]: broadleaf,
      [TreeKind.pine]: pine,
      [TreeKind.palm]: palm,
      [TreeKind.oak]: oak,
      [TreeKind.vase]: vase,
      [TreeKind.slender]: slender,
      [TreeKind.sal]: sal,
      [TreeKind.segun]: segun,
      [TreeKind.koroi]: koroi,
      [TreeKind.bot]: bot,
      [TreeKind.shimul]: shimul,
      [TreeKind.debdaru]: debdaru,
      [TreeKind.fern]: fern,
      [TreeKind.shrub]: shrub,
      [TreeKind.lata]: lata,
      [TreeKind.deadLog]: deadLog,
      [TreeKind.leafLitter]: leafLitter,
      [TreeKind.gum]: gum,
      [TreeKind.gum2]: gum2,
      ...PALM_MAKERS,
    };
    for (let k = 0; k < TREE_KIND_COUNT; k++) this.geometries.push([makers[k](0), makers[k](1)]);

    this.atlas = makeAtlas();
    this.palmAtlas = makePalmAtlas();
    this.material = this.makeMaterial(this.atlas, 1, TILES, 'tree-wind-leaf2');
    this.palmMaterial = this.makeMaterial(this.palmAtlas, PALM_BARK_TILES, PALM_TILES, 'tree-wind-palm1');
  }

  /** The material a tree kind is drawn with. */
  materialFor(kind: number): THREE.MeshLambertMaterial {
    return usesPalmAtlas(kind) ? this.palmMaterial : this.material;
  }

  private makeMaterial(atlas: THREE.DataTexture | null, barkTiles: number, tiles: number, cacheKey: string): THREE.MeshLambertMaterial {
    // Leaf cards are cut-outs (alpha test, soft edge with MSAA) and seen from both sides.
    const m = new THREE.MeshLambertMaterial({
      map: atlas,
      vertexColors: true,
      side: THREE.DoubleSide,
      alphaTest: atlas ? 0.42 : 0,
      alphaToCoverage: !!atlas,
    });
    const wind = Config.vegetation.windStrength;
    const floor = Config.vegetation.shadeFloor.map((v) => v.toFixed(3));
    // everything right of the bark tiles is foliage (bark u < (barkTiles - 0.03) / tiles, leaves u >= barkTiles / tiles)
    const leafEdge = ((barkTiles - 0.015) / tiles).toFixed(5);
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTreeTime = this.time;
      shader.uniforms.uTreeWind = windGust.uniform; // 0 = calm (nothing moves), 1 = full gust
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTreeTime;\nuniform float uTreeWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 0.071 + instanceMatrix[3].z * 0.053;
          #else
            float ph = 0.0;
          #endif
          // trunk and limbs hardly move (only a faint lean in a gust); the LEAVES do the moving
          float bend = max(position.y, 0.0) * ${wind.toFixed(4)} * uTreeWind * 0.12;
          float gust = 1.0 + 0.5 * sin(uTreeTime * 0.37 + ph * 1.7);
          transformed.x += sin(uTreeTime * 1.4 + ph) * bend * gust;
          transformed.z += cos(uTreeTime * 1.1 + ph * 1.3) * bend * 0.7;
          // branches sway on their own (a slow wave runs through the crown, so neighbouring limbs are out of step)
          float bp = position.x * 0.9 + position.z * 0.7 + position.y * 0.4;
          transformed.x += sin(uTreeTime * 1.9 + bp + ph) * bend * 0.3;
          transformed.z += cos(uTreeTime * 1.6 + bp * 1.3 + ph) * bend * 0.22;
          // every leaf flutters a little, each with its own phase (never the bark tile, less near the ground)
          float isLeaf = step(${leafEdge}, uv.x);
          float lp = position.x * 12.9898 + position.y * 78.233 + position.z * 37.719;
          float fl = sin(uTreeTime * 3.3 + lp) * 0.6 + sin(uTreeTime * 5.1 + lp * 1.7) * 0.4;
          float lift = isLeaf * min(1.0, position.y * 0.15) * uTreeWind;
          transformed += normal * fl * 0.11 * lift * (0.5 + 0.5 * gust);
          // in a gust each leaf is also pushed sideways and back (leaf only, own phase), so the foliage rustles while the tree stands still
          transformed.x += sin(uTreeTime * 2.3 + lp * 0.7) * 0.12 * lift * gust;
          transformed.z += cos(uTreeTime * 1.9 + lp * 0.9) * 0.09 * lift * gust;`,
        );
      // sunlight through the leaves + a soft sheen: added to the lit colour just before it is written
      const light = `
        #if NUM_DIR_LIGHTS > 0
        {
          #ifdef USE_MAP
            float leafMask = step(${leafEdge}, vMapUv.x);
          #else
            float leafMask = 0.0;
          #endif
          vec3 sunDir = directionalLights[ 0 ].direction;
          vec3 sunCol = directionalLights[ 0 ].color;
          vec3 viewDir = normalize( vViewPosition );
          float ndl = dot( normal, sunDir );
          // transmission: light that hits the far side of a thin leaf glows through it (strongest when looking towards the sun)
          float back = pow( clamp( -dot( viewDir, sunDir ), 0.0, 1.0 ), 2.5 );
          float open = smoothstep( 0.62, 1.05, vColor.g );
          float tr = ( clamp( -ndl, 0.0, 1.0 ) * 0.6 + back * 0.55 ) * leafMask * open;
          outgoingLight += diffuseColor.rgb * vec3( 1.0, 1.12, 0.45 ) * sunCol * tr * 0.55;
          // soft sheen (waxy leaf surface), only where the sun really reaches the leaf
          vec3 halfDir = normalize( sunDir + viewDir );
          float spec = pow( clamp( dot( normal, halfDir ), 0.0, 1.0 ), 36.0 );
          float sunSeen = clamp( dot( reflectedLight.directDiffuse, vec3( 0.3333 ) ) * 6.0, 0.0, 1.0 );
          outgoingLight += sunCol * spec * 0.045 * sunSeen * leafMask;
          // shade floor: leaves turned away from the sun never go black (scaled by the sun, so night stays dark)
          float dayAmt = clamp( dot( sunCol, vec3( 0.3333 ) ), 0.0, 1.0 );
          outgoingLight = max( outgoingLight, diffuseColor.rgb * vec3( ${floor[0]}, ${floor[1]}, ${floor[2]} ) * dayAmt );
        }
        #endif
        `;
      const hook = shader.fragmentShader.includes('#include <opaque_fragment>') ? '#include <opaque_fragment>' : '#include <output_fragment>';
      shader.fragmentShader = shader.fragmentShader.replace(hook, light + '\n' + hook);
    };
    m.customProgramCacheKey = () => cacheKey;
    return m;
  }

  update(time: number): void {
    this.time.value = time;
    windGust.update(time); // the one world wind (calm most of the time, a gust now and then); grass reads the same value
  }

  dispose(): void {
    for (const pair of this.geometries) for (const g of pair) g.dispose();
    this.material.dispose();
    this.palmMaterial.dispose();
    this.atlas?.dispose();
    this.palmAtlas?.dispose();
  }
}

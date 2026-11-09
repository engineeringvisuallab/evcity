import * as THREE from 'three';
import { mulberry32 } from '../world/Seed';
import { TreeKind } from './TreeTypes';
import { atlasTexture, growTree, lerp, Mesh, V3, type Style } from './TreeAssets';

/**
 * Palm atlas + models for the Bangladesh village / roadside trees: coconut (narikel), date palm (khejur), palmyra (tal), banana (kola) and the flowering
 * krishnachura. Same idea as the forest trees (TreeAssets): code-made, ONE geometry per model, one painted atlas made on a canvas at start-up (no files).
 *
 * Atlas = a strip of 448 px tiles + a 64 px plain white strip at the end (the colour source of fruit balls):
 *   0 ring bark (coconut, palmyra)   1 diamond leaf-scar bark (date)   2 banana pseudostem   3 rough bark (krishnachura)
 *   4 pinnate frond (coconut, date)  5 palmyra fan leaf                6 banana leaf            7 feathery leaf spray (krishnachura)   8 flower cluster
 * Fronds and banana leaves are bent strips (Mesh.ribbon) so a leaf arches like a real one; the painted leaflets give them their feathery edge.
 */

export const PALM_BARK_TILES = 4;
const TW = 448;
const AW = 4096;
/** Atlas width in tiles (fractional: the last 64 px are the plain strip). */
export const PALM_TILES = AW / TW;
const T_RING = 0;
const T_DIAMOND = 1;
const T_SHEATH = 2;
const T_ROUGH = 3;
const T_FROND = 4;
const T_FAN = 5;
const T_BANANA = 6;
const T_FEATHER = 7;
const T_BLOOM = 8;
const T_PLAIN = 9;

type Ctx = CanvasRenderingContext2D;

function inTile(c: Ctx, tile: number, fn: () => void): void {
  c.save();
  c.translate(tile * TW, 0);
  c.beginPath();
  c.rect(0, 0, TW, TW);
  c.clip();
  c.scale(TW / 512, TW / 512);
  fn();
  c.restore();
}

const hsl = (h: number, s: number, l: number, a = 1): string => `hsla(${h.toFixed(1)}, ${Math.max(0, s).toFixed(1)}%, ${Math.min(96, Math.max(3, l)).toFixed(1)}%, ${a})`;
const WRAP = [0, -512, 512];

function paintRing(c: Ctx): void {
  const r = mulberry32(31);
  inTile(c, T_RING, () => {
    c.fillStyle = '#8a7d68';
    c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 520; i++) {
      const x = r() * 512, y = r() * 512, w = 1 + r() * 3, len = 30 + r() * 150;
      c.fillStyle = hsl(30 + r() * 8, 12 + r() * 10, 32 + r() * 28, 0.12 + r() * 0.2);
      for (const dx of WRAP) for (const dy of WRAP) c.fillRect(x + dx, y + dy, w, len);
    }
    const N = 11, step = 512 / N;
    for (let i = 0; i < N; i++) {
      const y0 = i * step + (r() - 0.5) * 8;
      const jit: number[] = [];
      for (let k = 0; k <= 32; k++) jit.push((r() - 0.5) * 3);
      const lw = 4 + r() * 3;
      for (const dy of WRAP) {
        const y = y0 + dy;
        const g = c.createLinearGradient(0, y, 0, y + step * 0.85);
        g.addColorStop(0, 'rgba(205,190,160,0.38)');
        g.addColorStop(1, 'rgba(205,190,160,0)');
        c.fillStyle = g;
        c.fillRect(0, y, 512, step * 0.85);
        c.strokeStyle = 'rgba(45,36,26,0.8)';
        c.lineWidth = lw;
        c.beginPath();
        c.moveTo(0, y + jit[0]);
        for (let k = 1; k <= 32; k++) c.lineTo(k * 16, y + jit[k]);
        c.stroke();
      }
    }
  });
}

function paintDiamond(c: Ctx): void {
  const r = mulberry32(77);
  inTile(c, T_DIAMOND, () => {
    c.fillStyle = '#4b3522';
    c.fillRect(0, 0, 512, 512);
    const rows = 14, cols = 8;
    const dy = 512 / rows, dx = 512 / cols;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const cx = i * dx + (j % 2 ? dx / 2 : 0) + (r() - 0.5) * 5;
        const cy = j * dy + (r() - 0.5) * 4;
        const tone = r();
        for (const ox of WRAP) for (const oy of WRAP) {
          const x = cx + ox, y = cy + oy;
          const g = c.createLinearGradient(0, y - dy * 0.6, 0, y + dy * 0.6);
          g.addColorStop(0, hsl(34, 36, 52 + tone * 8));
          g.addColorStop(1, hsl(30, 38, 34 + tone * 6));
          c.fillStyle = g;
          c.beginPath();
          c.moveTo(x, y - dy * 0.66);
          c.lineTo(x + dx * 0.5, y);
          c.lineTo(x, y + dy * 0.66);
          c.lineTo(x - dx * 0.5, y);
          c.closePath();
          c.fill();
          c.strokeStyle = 'rgba(40,26,12,0.9)';
          c.lineWidth = 3;
          c.stroke();
          c.strokeStyle = 'rgba(30,18,8,0.45)';
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(x - dx * 0.3, y + 2);
          c.lineTo(x + dx * 0.3, y + 2);
          c.stroke();
        }
      }
    }
  });
}

function paintSheath(c: Ctx): void {
  const r = mulberry32(909);
  inTile(c, T_SHEATH, () => {
    c.fillStyle = '#86a64e';
    c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) {
      const x = r() * 512, y = r() * 512, w = 3 + r() * 12, len = 90 + r() * 300;
      const dry = r() < 0.18;
      c.fillStyle = dry ? hsl(34, 38, 36 + r() * 12, 0.25) : hsl(82 + r() * 20, 30 + r() * 20, 26 + r() * 30, 0.3);
      for (const dx of WRAP) for (const dy of WRAP) c.fillRect(x + dx, y + dy, w, len);
    }
    for (let i = 0; i < 3; i++) {
      const y = (i * 512) / 3;
      const g = c.createLinearGradient(0, y, 0, y + 40);
      g.addColorStop(0, 'rgba(50,70,25,0.5)');
      g.addColorStop(1, 'rgba(50,70,25,0)');
      c.fillStyle = g;
      c.fillRect(0, y, 512, 40);
    }
  });
}

function paintRough(c: Ctx): void {
  const r = mulberry32(2468);
  inTile(c, T_ROUGH, () => {
    c.fillStyle = '#6c6155';
    c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1000; i++) {
      const x = r() * 512, y = r() * 512, w = 1.5 + r() * 7, len = 40 + r() * 220;
      c.fillStyle = hsl(28 + r() * 8, 10 + r() * 10, 24 + r() * 26, 0.3 + r() * 0.35);
      for (const dx of WRAP) for (const dy of WRAP) c.fillRect(x + dx, y + dy, w, len);
    }
    c.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const x = r() * 512, y = r() * 512, len = 50 + r() * 180;
      c.strokeStyle = `rgba(30,24,18,${0.35 + r() * 0.35})`;
      c.lineWidth = 1.5 + r() * 2.5;
      for (const dx of WRAP) for (const dy of WRAP) {
        c.beginPath();
        c.moveTo(x + dx, y + dy);
        let cx = x;
        for (let s = 1; s <= 5; s++) {
          cx += Math.sin(i * 7 + s * 1.7) * 6;
          c.lineTo(cx + dx, y + dy + (len / 5) * s);
        }
        c.stroke();
      }
    }
  });
}

const FROND_W = 1.68;
const FROND_L = 4.0;

/** Pinnate palm frond (coconut / date): rachis up the middle, a pair of narrow leaflets at every step, angled towards the tip. Painted in metres so the angles come out right. */
function paintFrond(c: Ctx): void {
  const r = mulberry32(4455);
  inTile(c, T_FROND, () => {
    c.scale(512 / FROND_W, 512 / FROND_L);
    const cx = FROND_W / 2;
    const N = 46;
    c.lineJoin = 'round';
    for (let i = 0; i < N; i++) {
      const s = 0.04 + 0.94 * (i / (N - 1));
      const y0 = FROND_L * (1 - s);
      const prof = Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(s, 0.8))), 0.55);
      const th = lerp(0.9, 0.6, s);
      for (const side of [-1, 1]) {
        const lat = (FROND_W / 2) * 0.96 * prof * (0.92 + 0.08 * r());
        const len = lat / Math.sin(th);
        const x1 = cx + side * Math.sin(th) * len;
        const y1 = y0 - Math.cos(th) * len + 0.1 * len;
        const wd = 0.06;
        const l = Math.hypot(x1 - cx, y1 - y0) || 1;
        const nx = -(y1 - y0) / l, ny = (x1 - cx) / l;
        const mx = (cx + x1) / 2, my = (y0 + y1) / 2;
        c.fillStyle = hsl(98 + r() * 14, 42 + r() * 14, 22 + r() * 14);
        c.beginPath();
        c.moveTo(cx, y0);
        c.quadraticCurveTo(mx + nx * wd, my + ny * wd, x1, y1);
        c.quadraticCurveTo(mx - nx * wd, my - ny * wd, cx, y0);
        c.fill();
        c.strokeStyle = hsl(104, 36, 52, 0.45);
        c.lineWidth = 0.007;
        c.beginPath();
        c.moveTo(cx, y0);
        c.lineTo(x1, y1);
        c.stroke();
      }
    }
    // rachis (midrib): thick at the base, thin at the tip
    c.fillStyle = '#8d9a52';
    c.beginPath();
    c.moveTo(cx - 0.034, FROND_L);
    c.lineTo(cx - 0.006, 0);
    c.lineTo(cx + 0.006, 0);
    c.lineTo(cx + 0.034, FROND_L);
    c.closePath();
    c.fill();
  });
}

const FAN_W = 2.0;
const FAN_L = 1.1;

/** Palmyra fan leaf: pleated half-circle of stiff leaflets with split tips, the base at the bottom middle. */
function paintFan(c: Ctx): void {
  const r = mulberry32(8123);
  inTile(c, T_FAN, () => {
    c.scale(512 / FAN_W, 512 / FAN_L);
    const bx = FAN_W / 2, by = 1.06;
    const A = 1.6, n = 38;
    c.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      const a0 = -A + (2 * A * i) / n, a1 = -A + (2 * A * (i + 1)) / n, am = (a0 + a1) / 2;
      const R = (0.86 + 0.14 * r()) * (1 - 0.1 * Math.pow(Math.abs(am) / A, 2));
      const p = (a: number, rr: number): [number, number] => [bx + Math.sin(a) * rr, by - Math.cos(a) * rr];
      c.fillStyle = i % 2 ? hsl(86 + r() * 6, 38, 25 + r() * 5) : hsl(90 + r() * 6, 40, 32 + r() * 5);
      c.beginPath();
      c.moveTo(bx, by);
      c.lineTo(...p(a0, R));
      c.lineTo(...p(am, R * 0.84));
      c.lineTo(...p(a1, R));
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(30,45,15,0.5)';
      c.lineWidth = 0.006;
      c.beginPath();
      c.moveTo(bx, by);
      c.lineTo(...p(am, R * 0.9));
      c.stroke();
    }
  });
}

const BAN_W = 0.9;
const BAN_L = 2.6;

/** Banana leaf: long oval blade, thick pale midrib, fine parallel veins, torn into strips along the veins, a dry tip. */
function paintBanana(c: Ctx): void {
  const r = mulberry32(1357);
  inTile(c, T_BANANA, () => {
    c.scale(512 / BAN_W, 512 / BAN_L);
    const hw = (s: number): number => 0.44 * Math.pow(Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, s)), 0.72)), 0.55) * (1 - 0.12 * s);
    const mid = (s: number): number => 0.45 + 0.02 * Math.sin(s * 3);
    const NS = 40;
    const g = c.createLinearGradient(0, 0, BAN_W, 0);
    g.addColorStop(0, '#3f7d22');
    g.addColorStop(0.5, '#6aa937');
    g.addColorStop(1, '#3f7d22');
    c.fillStyle = g;
    c.beginPath();
    for (let i = 0; i <= NS; i++) {
      const s = i / NS;
      const x = mid(s) - hw(s), y = BAN_L * (1 - s);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    for (let i = NS; i >= 0; i--) {
      const s = i / NS;
      c.lineTo(mid(s) + hw(s), BAN_L * (1 - s));
    }
    c.closePath();
    c.fill();
    // dry brown tip
    c.fillStyle = 'rgba(120,85,30,0.55)';
    c.beginPath();
    for (let i = 0; i <= 8; i++) {
      const s = 0.9 + 0.1 * (i / 8);
      c.lineTo(mid(s) - hw(s), BAN_L * (1 - s));
    }
    for (let i = 8; i >= 0; i--) {
      const s = 0.9 + 0.1 * (i / 8);
      c.lineTo(mid(s) + hw(s), BAN_L * (1 - s));
    }
    c.closePath();
    c.fill();
    // lateral veins
    c.strokeStyle = 'rgba(205,235,140,0.3)';
    c.lineWidth = 0.007;
    for (let s0 = 0.03; s0 < 0.98; s0 += 0.011) {
      const y = BAN_L * (1 - s0);
      const s1 = s0 + 0.03;
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(mid(s0), y);
        c.lineTo(mid(s1) + side * hw(s1) * 0.97, BAN_L * (1 - s1));
        c.stroke();
      }
    }
    // midrib
    c.fillStyle = 'rgba(215,235,150,0.95)';
    c.beginPath();
    c.moveTo(mid(0) - 0.016, BAN_L);
    c.lineTo(mid(1) - 0.004, 0);
    c.lineTo(mid(1) + 0.004, 0);
    c.lineTo(mid(0) + 0.016, BAN_L);
    c.closePath();
    c.fill();
    // tears: wind splits the blade into strips along the veins
    c.globalCompositeOperation = 'destination-out';
    c.lineCap = 'round';
    c.lineWidth = 0.016;
    for (let k = 0; k < 12; k++) {
      const s = 0.12 + 0.8 * r();
      const side = r() < 0.5 ? -1 : 1;
      const s1 = s + 0.03;
      const x0 = mid(s) + side * hw(s) * 1.08, y0 = BAN_L * (1 - s);
      const xi = mid(s1) + side * hw(s1) * (0.15 + 0.3 * r()), yi = BAN_L * (1 - s1) - 0.02;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(xi, yi);
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
  });
}

/** Krishnachura leaf spray: bipinnate (a stem, ~11 pairs of side stems, each with two rows of tiny leaflets), light fresh green. */
function paintFeather(c: Ctx): void {
  const r = mulberry32(6464);
  inTile(c, T_FEATHER, () => {
    const P = (s: number): [number, number] => [256 + 40 * Math.sin(s * 2.2), 500 - 470 * s];
    c.lineCap = 'round';
    c.strokeStyle = hsl(95, 35, 38);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(...P(0));
    for (let i = 1; i <= 20; i++) c.lineTo(...P(i / 20));
    c.stroke();
    for (let i = 0; i < 11; i++) {
      const s = 0.08 + 0.84 * (i / 10);
      const [bx, by] = P(s);
      const phi = lerp(1.05, 0.7, s);
      const L = 40 + 175 * Math.sin(Math.PI * (0.1 + 0.8 * s));
      for (const side of [-1, 1]) {
        const dx = side * Math.sin(phi), dy = -Math.cos(phi);
        c.strokeStyle = hsl(95, 35, 40);
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(bx + dx * L, by + dy * L);
        c.stroke();
        const M = 16;
        const base = Math.atan2(dy, dx);
        for (let j = 0; j < M; j++) {
          const t = (j + 0.5) / M;
          const px = bx + dx * L * t, py = by + dy * L * t;
          const ll = 24 * (1 - 0.35 * t);
          for (const sd of [-1, 1]) {
            const ang = base + sd * 1.1;
            c.fillStyle = hsl(100 + r() * 12, 50, 30 + r() * 14);
            c.beginPath();
            c.ellipse(px + Math.cos(ang) * ll * 0.5, py + Math.sin(ang) * ll * 0.5, ll * 0.5, 4.6, ang, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
    }
  });
}

/** Krishnachura flower cluster: ~two dozen open flowers (four red petals + one larger petal with a cream stripe) and a few buds. */
function paintBloom(c: Ctx): void {
  const r = mulberry32(5252);
  inTile(c, T_BLOOM, () => {
    const flowers: { x: number; y: number; R: number; rot: number }[] = [];
    for (let i = 0; i < 24; i++) {
      const a = r() * Math.PI * 2, d = 175 * Math.sqrt(r());
      flowers.push({ x: 256 + Math.cos(a) * d, y: 256 + Math.sin(a) * d, R: 38 + r() * 18, rot: r() * Math.PI * 2 });
    }
    flowers.sort((a, b) => a.y - b.y);
    for (let i = 0; i < 10; i++) {
      c.fillStyle = hsl(4, 70, 34 + r() * 8);
      c.beginPath();
      c.ellipse(256 + (r() - 0.5) * 380, 256 + (r() - 0.5) * 380, 9, 14, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
    for (const f of flowers) {
      for (let k = 0; k < 5; k++) {
        const a = f.rot + (k * Math.PI * 2) / 5;
        const big = k === 0;
        const rr = f.R * (big ? 0.62 : 0.5);
        c.fillStyle = big ? hsl(8, 80, 52) : hsl(3 + r() * 8, 76 + r() * 10, 38 + r() * 14);
        c.strokeStyle = 'rgba(90,10,5,0.55)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.ellipse(f.x + Math.cos(a) * f.R * 0.5, f.y + Math.sin(a) * f.R * 0.5, rr, rr * 0.8, a, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        if (big) {
          c.fillStyle = 'rgba(246,226,160,0.85)';
          c.beginPath();
          c.ellipse(f.x + Math.cos(a) * f.R * 0.55, f.y + Math.sin(a) * f.R * 0.55, rr * 0.55, rr * 0.18, a, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.strokeStyle = hsl(28, 85, 50, 0.9);
      c.lineWidth = 1.6;
      for (let k = 0; k < 5; k++) {
        const a = f.rot + 0.4 + k * 1.2;
        c.beginPath();
        c.moveTo(f.x, f.y);
        c.lineTo(f.x + Math.cos(a) * f.R * 0.85, f.y + Math.sin(a) * f.R * 0.85);
        c.stroke();
        c.fillStyle = hsl(40, 90, 55);
        c.beginPath();
        c.arc(f.x + Math.cos(a) * f.R * 0.85, f.y + Math.sin(a) * f.R * 0.85, 2.4, 0, Math.PI * 2);
        c.fill();
      }
    }
  });
}

/** The palm atlas (null without a DOM, e.g. in a worker or a test). */
export function makePalmAtlas(): THREE.DataTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = AW;
  cv.height = TW;
  const c = cv.getContext('2d');
  if (!c) return null;
  paintRing(c);
  paintDiamond(c);
  paintSheath(c);
  paintRough(c);
  paintFrond(c);
  paintFan(c);
  paintBanana(c);
  paintFeather(c);
  paintBloom(c);
  c.fillStyle = '#ffffff';
  c.fillRect(T_PLAIN * TW, 0, AW - T_PLAIN * TW, TW);
  return atlasTexture(c, AW, TW, PALM_TILES, PALM_BARK_TILES);
}

// ---------------------------------------------------------------------------------------------------------------------
// models
// ---------------------------------------------------------------------------------------------------------------------

type Col = readonly [number, number, number];

const dirFrom = (ang: number, az: number): THREE.Vector3 => V3(Math.sin(ang) * Math.cos(az), Math.cos(ang), Math.sin(ang) * Math.sin(az));

/** Spine of an arching leaf: leaves `start` at angle `ang` from vertical, heading `az`, and sags under its own weight (`droop`). */
function arch(start: THREE.Vector3, ang: number, az: number, len: number, droop: number, n: number): THREE.Vector3[] {
  const pts = [start.clone()];
  const d = dirFrom(ang, az);
  const p = start.clone();
  const step = len / (n - 1);
  for (let i = 1; i < n; i++) {
    const t = i / (n - 1);
    d.y -= droop * step * (0.15 + t) * 0.9;
    d.normalize();
    p.addScaledVector(d, step);
    pts.push(p.clone());
  }
  return pts;
}

const GREEN_VAR = (r: () => number, lo = 0.9, hi = 1.1): Col => [lerp(lo, hi, r()), lerp(lo + 0.05, hi + 0.05, r()), lerp(lo - 0.05, hi - 0.1, r())];

/** Coconut palm (narikel gach): 12 m, leaning and gently curved, ringed trunk with a swollen foot, a crown of 26 long arching fronds and a bunch of nuts. */
function coconut(detail: number): THREE.BufferGeometry {
  const r = mulberry32(1111);
  const m = new Mesh(PALM_TILES);
  const H = 12;
  const n = detail === 0 ? 12 : 6;
  const pts: THREE.Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push(V3(1.6 * t * t, H * t, 0.45 * Math.sin(t * Math.PI * 1.3)));
    radii.push(0.2 * (1 + 1.1 * Math.exp(-t * 16)) * (1 - 0.28 * t));
  }
  m.tube(pts, radii, detail === 0 ? 8 : 5, 1, T_RING, [1.0, 0.97, 0.9]);
  const top = pts[n - 1];
  const cc = top.clone().add(V3(0, 0.15, 0));
  const count = detail === 0 ? 28 : 12;
  for (let f = 0; f < count; f++) {
    const t = f / (count - 1);
    const az = f * 2.399 + (r() - 0.5) * 0.5;
    const ang = lerp(0.12, 1.85, Math.pow(t, 0.75));
    const len = lerp(4.4, 5.6, r()) * (1 - 0.15 * (1 - t));
    const droop = (ang < 0.6 ? 0.1 : 0.24) + r() * 0.05;
    const spine = arch(cc, ang, az, len, droop, detail === 0 ? 7 : 4);
    const out = V3(Math.cos(az), 0, Math.sin(az));
    const up = V3(0, 1, 0).addScaledVector(out, 0.9);
    const dead = f >= count - 2;
    const tint: Col = dead ? [1.35, 0.95, 0.55] : GREEN_VAR(r);
    m.ribbon(spine, spine.map(() => len * 0.4), up, T_FROND, lerp(0.88, 1.15, r()), 0.32, tint);
  }
  const nuts = detail === 0 ? 9 : 4;
  for (let k = 0; k < nuts; k++) {
    const a = r() * Math.PI * 2, rad = 0.22 + r() * 0.12;
    const col: Col = r() < 0.6 ? [0.45, 0.58, 0.2] : [0.42, 0.3, 0.16];
    m.blob(cc.clone().add(V3(Math.cos(a) * rad, -0.25 - r() * 0.2, Math.sin(a) * rad)), 0.14, 0.17, 0.14, T_PLAIN, col, 6, 4);
  }
  return m.build();
}

/** Date palm (khejur gach): 7.5 m, thick trunk covered in diamond leaf scars, a dense crown of stiff blue-green fronds and hanging bunches of dates. */
function datePalm(detail: number): THREE.BufferGeometry {
  const r = mulberry32(2222);
  const m = new Mesh(PALM_TILES);
  const H = 7.5;
  const n = detail === 0 ? 10 : 5;
  const pts: THREE.Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const swell = t > 0.88 ? 0.07 * ((t - 0.88) / 0.12) : 0;
    pts.push(V3(0.5 * t * t, H * t, 0.15 * Math.sin(t * 3)));
    radii.push(0.3 * (1 + 0.25 * Math.exp(-t * 10)) * (1 - 0.08 * t) + swell);
  }
  m.tube(pts, radii, detail === 0 ? 8 : 5, 1, T_DIAMOND);
  const cc = pts[n - 1].clone().add(V3(0, 0.1, 0));
  const count = detail === 0 ? 34 : 12;
  for (let f = 0; f < count; f++) {
    const t = f / (count - 1);
    const az = f * 2.399 + (r() - 0.5) * 0.4;
    const ang = lerp(0.1, 1.55, Math.pow(t, 0.9));
    const len = lerp(2.8, 3.7, r());
    const spine = arch(cc, ang, az, len, 0.1 + r() * 0.08, detail === 0 ? 6 : 4);
    const out = V3(Math.cos(az), 0, Math.sin(az));
    const tint: Col = [0.78 + r() * 0.08, 0.98 + r() * 0.06, 0.88 + r() * 0.06];
    m.ribbon(spine, spine.map(() => len * 0.42), V3(0, 1, 0).addScaledVector(out, 0.9), T_FROND, lerp(0.85, 1.1, r()), 0.35, tint);
  }
  const bunches = detail === 0 ? 4 : 2;
  for (let b = 0; b < bunches; b++) {
    const a = (b / bunches) * Math.PI * 2 + r();
    const ux = Math.cos(a), uz = Math.sin(a);
    const s0 = cc.clone().add(V3(ux * 0.3, -0.15, uz * 0.3));
    const s1 = s0.clone().add(V3(ux * 0.35, -0.3, uz * 0.35));
    const s2 = s0.clone().add(V3(ux * 0.55, -0.9, uz * 0.55));
    m.tube([s0, s1, s2], [0.045, 0.04, 0.03], 4, 1, T_ROUGH, [1, 0.75, 0.45]);
    const fruits = detail === 0 ? 18 : 8;
    for (let k = 0; k < fruits; k++) {
      const f = r();
      const base = s1.clone().lerp(s2, f);
      const col: Col = r() < 0.5 ? [0.85, 0.4, 0.08] : [0.9, 0.7, 0.15];
      m.blob(base.add(V3((r() - 0.5) * 0.22, (r() - 0.5) * 0.2, (r() - 0.5) * 0.22)), 0.045, 0.06, 0.045, T_PLAIN, col, 5, 3);
    }
  }
  return m.build();
}

/** Palmyra palm (tal gach): 17 m, dead straight dark trunk, a ball of long-stalked fan leaves and a few dark fruit. */
function palmyra(detail: number): THREE.BufferGeometry {
  const r = mulberry32(3333);
  const m = new Mesh(PALM_TILES);
  const H = 17;
  const n = detail === 0 ? 12 : 6;
  const pts: THREE.Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push(V3(0.4 * t * t, H * t, 0.2 * Math.sin(t * 2.5)));
    radii.push(0.34 * (1 + 0.35 * Math.exp(-t * 20)) * (1 + 0.1 * Math.sin(Math.PI * t * 0.9)) * (1 - 0.15 * t));
  }
  m.tube(pts, radii, detail === 0 ? 8 : 5, 1, T_RING, [0.72, 0.68, 0.64]);
  const cc = pts[n - 1].clone().add(V3(0, 0.1, 0));
  const count = detail === 0 ? 34 : 14;
  for (let f = 0; f < count; f++) {
    const t = f / (count - 1);
    const az = f * 2.399 + (r() - 0.5) * 0.4;
    const ang = lerp(0.1, 1.4, Math.pow(t, 0.8));
    const pl = lerp(1.9, 2.7, r());
    const dir = dirFrom(ang, az);
    const end = cc.clone().addScaledVector(dir, pl);
    end.y -= 0.15 * ang * pl;
    if (detail === 0) {
      const mid = cc.clone().lerp(end, 0.5);
      m.tube([cc, mid, end], [0.06, 0.05, 0.035], 3, 1, T_ROUGH, [0.8, 0.85, 0.6]);
    }
    const d2 = dir.clone();
    d2.y -= 0.25 * ang;
    const out = V3(Math.cos(az), 0, Math.sin(az));
    const sc = lerp(1.35, 1.7, r());
    m.leafAlong(end, d2, FAN_L * sc, FAN_W * sc, V3(-out.z, 0, out.x).multiplyScalar(r() < 0.5 ? 1 : -1).add(V3(0, 0.9, 0)), T_FAN, lerp(0.8, 1.1, r()), GREEN_VAR(r, 1.0, 1.25));
  }
  const fruitClusters = detail === 0 ? 3 : 1;
  for (let k = 0; k < fruitClusters; k++) {
    const a = r() * Math.PI * 2;
    for (let j = 0; j < 4; j++) {
      m.blob(cc.clone().add(V3(Math.cos(a) * 0.35 + (r() - 0.5) * 0.3, -0.35 - r() * 0.2, Math.sin(a) * 0.35 + (r() - 0.5) * 0.3)), 0.12, 0.12, 0.12, T_PLAIN, [0.2, 0.12, 0.22], 6, 4);
    }
  }
  return m.build();
}

interface Stem {
  x: number;
  z: number;
  h: number;
  rad: number;
  leaves: number;
  bunch: boolean;
}

/** Banana clump (kola gach): a big stem with a hanging bunch and two suckers, pale green pseudostems and wide torn leaves. */
function banana(detail: number): THREE.BufferGeometry {
  const r = mulberry32(4444);
  const m = new Mesh(PALM_TILES);
  const stems: Stem[] = [
    { x: 0, z: 0, h: 3.4, rad: 0.17, leaves: detail === 0 ? 9 : 5, bunch: true },
    { x: 0.6, z: 0.35, h: 2.4, rad: 0.13, leaves: detail === 0 ? 7 : 4, bunch: false },
    { x: -0.45, z: 0.55, h: 1.5, rad: 0.09, leaves: detail === 0 ? 5 : 3, bunch: false },
  ];
  for (const s of stems) {
    const lean = 0.1 + r() * 0.2;
    const la = r() * Math.PI * 2;
    const ux = Math.cos(la), uz = Math.sin(la);
    const top = V3(s.x + ux * lean, s.h, s.z + uz * lean);
    m.tube([V3(s.x, 0, s.z), V3(s.x + ux * lean * 0.3, s.h * 0.5, s.z + uz * lean * 0.3), top], [s.rad * 1.3, s.rad, s.rad * 0.75], detail === 0 ? 8 : 5, 1, T_SHEATH);
    for (let i = 0; i < s.leaves; i++) {
      const t = i / (s.leaves - 1);
      const az = i * 2.399 + r();
      const ang = lerp(0.35, 1.55, Math.pow(t, 0.9));
      const L = (2.0 + 1.2 * Math.sqrt(s.h / 3.4)) * (0.85 + 0.3 * r());
      const spine = arch(top, ang, az, L, 0.62, detail === 0 ? 7 : 4);
      const out = V3(Math.cos(az), 0, Math.sin(az));
      m.ribbon(spine, spine.map(() => L * 0.4), V3(0, 1, 0).addScaledVector(out, 0.5), T_BANANA, lerp(0.85, 1.15, r()), 0.22);
    }
    if (s.bunch) {
      const p1 = top.clone().add(V3(ux * 0.18, -0.35, uz * 0.18));
      const p2 = top.clone().add(V3(ux * 0.3, -0.8, uz * 0.3));
      const p3 = top.clone().add(V3(ux * 0.32, -1.15, uz * 0.32));
      m.tube([top.clone().add(V3(0, -0.05, 0)), p1, p2, p3], [0.04, 0.04, 0.035, 0.03], 4, 1, T_SHEATH, [0.8, 1, 0.7]);
      const hands = detail === 0 ? 6 : 3;
      const fingers = detail === 0 ? 7 : 4;
      for (let h = 0; h < hands; h++) {
        const f = (h + 0.5) / hands;
        const c0 = p1.clone().lerp(p3, f);
        for (let k = 0; k < fingers; k++) {
          const a = (k / fingers) * Math.PI * 2 + h * 0.7;
          m.blob(c0.clone().add(V3(Math.cos(a) * 0.075, -0.04, Math.sin(a) * 0.075)), 0.035, 0.11, 0.035, T_PLAIN, [0.5, 0.66, 0.2], 5, 3);
        }
      }
      m.blob(p3.clone().add(V3(0.03, -0.12, 0)), 0.07, 0.14, 0.07, T_PLAIN, [0.4, 0.08, 0.22], 5, 4);
    }
  }
  return m.build();
}

/** Krishnachura (flamboyant, "Radhachura/Krishnachura"): wide flat umbrella of feathery leaves, covered with red flowers. */
const STYLE_KRISHNA: Style = {
  seed: 1515, trunkH: 6.6, trunkR: 0.38, trunkBend: 0.14, primary: 6, startFrac: 0.72, spread: [1.0, 1.3], limbLen: 5, fork: 2,
  kids: [3, 3], lenRatio: [0.55, 0.5], droop: -0.1, crownY: 10, rx: 6.5, ry: 2.4, cards: 7, clusterR: 1.5, card: [1.5, 2.2], warm: 0.2, flat: 0.5,
  tiles: PALM_TILES, barkTile: T_ROUGH, leafTile: T_FEATHER, bloomTile: T_BLOOM, bloom: 12, farScale: 1.7,
};

/** Model builders of the palm atlas kinds (index = TreeKind, argument = detail 0 near / 1 far). */
export const PALM_MAKERS: Record<number, (detail: number) => THREE.BufferGeometry> = {
  [TreeKind.coconut]: coconut,
  [TreeKind.datePalm]: datePalm,
  [TreeKind.palmyra]: palmyra,
  [TreeKind.banana]: banana,
  [TreeKind.krishnachura]: (d) => growTree(STYLE_KRISHNA, d),
};

// kept for tools that want to know how a tile is laid out
export const PALM_TILE_INDEX = { ring: T_RING, diamond: T_DIAMOND, sheath: T_SHEATH, rough: T_ROUGH, frond: T_FROND, fan: T_FAN, banana: T_BANANA, feather: T_FEATHER, bloom: T_BLOOM, plain: T_PLAIN } as const;

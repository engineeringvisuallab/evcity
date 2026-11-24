import { Config } from '../../core/Config';
import { TreeKind } from '../../vegetation/TreeTypes';
// STEP HK-10a: the infield of the Hatikamrul loops. Ponds (existing LakeSet bowl + water, see Lakes.addFixedPond) in the two WEST loops, striped lawns in the two EAST loops (HK-10b).
// WORLD metres (x east, z south). lx / ly = the same point in the interchange frame (x east along the ring, y north toward the J1-S arm); scripts/hk-infield-check.ts compares the two with hkWorld(), so they cannot drift.
// These numbers are fixed here (not computed from the road network) because the LakeSet is built BEFORE the roads exist.
// The NW pond is moved 10.4 m EAST of the loop circle centre (-110.4, 98.4): the old collector R2-35.2 runs through the west part of that loop (x about -160, y 84 .. 178) and the shore must keep 14 m from it.
export interface HkPond { readonly id: string; readonly loop: string; readonly lx: number; readonly ly: number; readonly x: number; readonly z: number; readonly R: number; readonly level: number; readonly depth: number }
export const HK_POND_WOBBLE = 0.06;
export const HK_INFIELD_PONDS: readonly HkPond[] = [
  { id: 'HKP-NW', loop: 'HK-NW', lx: -95, ly: 98, x: -1224.56, z: 2200.21, R: 32, level: 18.4, depth: 2.0 }, // HK-10c: was R 26 at lx -100 (5 m further EAST: room for the garden ring on the R2-35.2 side)
  { id: 'HKP-SW', loop: 'HK-SW', lx: -104.3, ly: -98.4, x: -1241.31, z: 2396.12, R: 38, level: 19.4, depth: 2.0 }, // HK-10c: was R 30
];

// ---- HK-10b: striped lawns in the two EAST loops (HK-SE, HK-NE). The lawn is the game's own CITY LAWN: CityGreen.at() returns 1 inside a lawn disc, so the terrain shader paints the ground green (aCity) and the
// grass placer grows its mown city-lawn tufts there (same code, same models, same colours). The STRIPES are only a shade: the tuft's unused 6th float carries a light / dark marker, GrassManager multiplies the tuft brightness.
// Concentric colour rings, HK_LAWN_STRIPE_W m wide, counted from the lawn edge. Pure functions of the world position (the chunk worker and the main thread see the same field).
export interface HkLawn { readonly id: string; readonly loop: string; readonly lx: number; readonly ly: number; readonly x: number; readonly z: number; readonly r: number }
export const HK_LAWN_FADE = 4;
export const HK_LAWN_STRIPE_W = 5;
export const HK_INFIELD_LAWNS: readonly HkLawn[] = [
  { id: 'HKL-SE', loop: 'HK-SE', lx: 104.3, ly: -98.4, x: -1032.86, z: 2404.04, r: 66 }, // HK-10d: r 62 -> 66 (the lawn now carries a plaza garden in the middle)
  { id: 'HKL-NE', loop: 'HK-NE', lx: 110.4, ly: 98.4, x: -1019.29, z: 2207.61, r: 66 },
  { id: 'HKL-NW', loop: 'HK-NW', lx: -95, ly: 98, x: -1224.56, z: 2200.21, r: 63 }, // HK-10d: the whole infield of the west loops is mown lawn too (r 63: the centreline of the old collector R2-35.2 is 65 m away)
  { id: 'HKL-SW', loop: 'HK-SW', lx: -104.3, ly: -98.4, x: -1241.31, z: 2396.12, r: 72 },
];
/** Lawn amount 0..1 at a world point: 1 inside a lawn disc, 0 over HK_LAWN_FADE m outside it; 0 everywhere with the switch OFF. */
export function hkLawnAt(x: number, z: number): number {
  if (!Config.roads.hatikamrul.enabled) return 0;
  let best = 0;
  for (const G of hkGardens()) { // HK-10c: the pond gardens are lawn too (flower zones are cut out of it by the grass placer)
    const d = Math.hypot(x - G.x, z - G.z);
    if (d <= G.gr) return 1;
    if (d < G.gr + HK_LAWN_FADE) { const t = (d - G.gr) / HK_LAWN_FADE; best = Math.max(best, 1 - t * t * (3 - 2 * t)); }
  }
  for (const L of HK_INFIELD_LAWNS) {
    const d = Math.hypot(x - L.x, z - L.z);
    if (d <= L.r) return 1;
    if (d < L.r + HK_LAWN_FADE) { const t = (d - L.r) / HK_LAWN_FADE; best = Math.max(best, 1 - t * t * (3 - 2 * t)); }
  }
  return best;
}
/** Stripe of the lawn at a point: +1 light ring, -1 dark ring, 0 outside every lawn disc. Rings are counted from the lawn edge inwards. */
export function hkLawnStripe(x: number, z: number): number {
  if (!Config.roads.hatikamrul.enabled) return 0;
  for (const G of hkGardens()) if (Math.hypot(x - G.x, z - G.z) < G.gr) return 0; // HK-10d: no stripes under a garden (the garden has its own lawn ring)
  for (const L of HK_INFIELD_LAWNS) {
    const d = Math.hypot(x - L.x, z - L.z);
    if (d <= L.r) return Math.floor((L.r - d) / HK_LAWN_STRIPE_W) % 2 === 0 ? 1 : -1;
  }
  return 0;
}
/** True when the square (world metres) can hold lawn (for the chunk mask). */
export function hkLawnTouches(x0: number, z0: number, x1: number, z1: number): boolean {
  if (!Config.roads.hatikamrul.enabled) return false;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, half = Math.hypot(x1 - x0, z1 - z0) / 2;
  return HK_INFIELD_LAWNS.some((L) => Math.hypot(cx - L.x, cz - L.z) < L.r + HK_LAWN_FADE + half) || hkGardens().some((G) => Math.hypot(cx - G.x, cz - G.z) < G.gr + HK_LAWN_FADE + half);
}

// ---- HK-10c: the POND GARDENS of the two WEST loops (a standard garden round each pond), pure numbers like CentralPark.ts (same zone codes, same 6 flowers): the grass placer plants the flowers, the tree placer the shade trees,
// HkGardenLayer builds the paving / kerbs / soil / benches / lamps. Rings counted from the pond SHORE S = R x (1 + wobble) x 1.08 (the bowl edge of Lakes.ts):
//   S .. S+3.5        PROMENADE (paved, kerb stones on both edges), 8 benches on the pond side, 12 lamps on the outer edge
//   S+3.5 .. S+10     BORDER of wild flowers, 6 colours in 12 sectors, cut by 4 diagonal PATHS (3.2 m) that run on to the garden edge
//   S+10 .. S+17      mown LAWN with 4 oval flower BEDS (two colours each, stone kerb) and 8 shade trees (krishnachura / rain tree)
// Everything is a pure function of the pond data above (no road network needed), so the chunk worker and the main thread agree.
export const HK_GARDEN = { prom: 3.5, border: 6.5, lawn: 7, armHalf: 1.6, bedR: 13.5, bedA: 3.6, bedB: 2.8, kerb: 1.12, innerE: 0.3 } as const;
export interface HkGarden { readonly id: string; readonly pond: string; readonly index: number; readonly x: number; readonly z: number; readonly shore: number; readonly gr: number; readonly plaza: boolean }
/** HK-10d: the two EAST loops get a PLAZA garden (no pond): a paved round plaza of radius `shore` with a round flower bed (radius `core`) in the middle, then the same promenade / flower border / lawn ring + beds as the pond gardens. */
export const HK_PLAZA = { shore: 18, core: 6.5 } as const;
let gardenCache: HkGarden[] | null = null;
export function hkGardens(): readonly HkGarden[] {
  if (gardenCache) return gardenCache;
  gardenCache = HK_INFIELD_PONDS.map((p, index) => {
    const shore = p.R * (1 + HK_POND_WOBBLE) * 1.08;
    return { id: 'HKG-' + p.id.slice(4), pond: p.id, index, x: p.x, z: p.z, shore, gr: shore + HK_GARDEN.prom + HK_GARDEN.border + HK_GARDEN.lawn, plaza: false };
  });
  HK_INFIELD_LAWNS.filter((L) => L.loop.endsWith('E')).forEach((L, i) => {
    const shore = HK_PLAZA.shore;
    gardenCache!.push({ id: 'HKG-' + L.id.slice(4), pond: '', index: HK_INFIELD_PONDS.length + i, x: L.x, z: L.z, shore, gr: shore + HK_GARDEN.prom + HK_GARDEN.border + HK_GARDEN.lawn, plaza: true });
  });
  return gardenCache;
}
const GTAU = Math.PI * 2;
const G_BORDER_ORDER = [1, 0, 3, 5, 2, 4] as const;
/** The two flowers (index 0..5 = daisy .. clover, as PARK_FLOWERS) of bed k of garden gi: main, second. */
export const hkBedFlowers = (gi: number, k: number): [number, number] => { const t: [number, number][] = [[0, 4], [2, 1], [3, 1], [4, 0], [5, 2], [1, 3], [2, 0], [5, 4]]; return t[(gi * 4 + k) % 8]; };
/** Centre of bed k (0..3) of a garden and its radial unit vector. */
export function hkBedCentre(G: HkGarden, k: number): { cx: number; cz: number; ex: number; ez: number } {
  const a = k * (Math.PI / 2), ex = Math.cos(a), ez = Math.sin(a), r = G.shore + HK_GARDEN.bedR;
  return { cx: G.x + ex * r, cz: G.z + ez * r, ex, ez };
}
/** Zone of the ground at (x, z): CentralPark.ts codes (low 4 bits 0 none, 1 lawn, 2 paved, 3 bed, 4 border; flower index << 4). */
export function hkGardenZone(x: number, z: number): number {
  if (!Config.roads.hatikamrul.enabled) return 0;
  for (const G of hkGardens()) {
    const dx = x - G.x, dz = z - G.z;
    if (Math.abs(dx) > G.gr || Math.abs(dz) > G.gr) continue;
    const d = Math.hypot(dx, dz);
    if (d >= G.gr) continue;
    if (d < G.shore) { if (!G.plaza) continue; return d < HK_PLAZA.core ? 3 | (((G.index * 2 + 1) % 6) << 4) : 2; } // HK-10d: plaza = round flower bed in the middle + paving
    const rel = d - G.shore;
    if (rel < HK_GARDEN.prom) return 2;
    let a = Math.atan2(dz, dx); if (a < 0) a += GTAU;
    const q = Math.PI / 2, m = (((a - Math.PI / 4) % q) + q) % q, dd = Math.min(m, q - m); // distance to the nearest diagonal axis
    if (d * Math.sin(dd) < HK_GARDEN.armHalf) return 2; // the 4 diagonal paths
    if (rel < HK_GARDEN.prom + HK_GARDEN.border) return 4 | (G_BORDER_ORDER[(Math.floor((a / GTAU) * 12) + G.index * 3) % 6] << 4);
    for (let k = 0; k < 4; k++) {
      const b = hkBedCentre(G, k);
      const u = (x - b.cx) * b.ex + (z - b.cz) * b.ez, v = -(x - b.cx) * b.ez + (z - b.cz) * b.ex;
      const e = (u / HK_GARDEN.bedA) ** 2 + (v / HK_GARDEN.bedB) ** 2;
      if (e < 1) return 3 | (hkBedFlowers(G.index, k)[e < HK_GARDEN.innerE ? 1 : 0] << 4);
      if (e < HK_GARDEN.kerb * HK_GARDEN.kerb) return 2;
    }
    return 1;
  }
  return 0;
}
/** Is (x, z) inside a garden disc (pond included), `margin` m extra? Used to keep the random trees out. */
export function inHkGarden(x: number, z: number, margin = 0): boolean {
  if (!Config.roads.hatikamrul.enabled) return false;
  return hkGardens().some((G) => Math.hypot(x - G.x, z - G.z) < G.gr + margin);
}
function grng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Shade trees: 8 per garden on the lawn ring, between the paths and the beds. kind 0 = krishnachura, 1 = rain tree (mapped to the game tree kinds by the caller). */
export function hkGardenTrees(): { x: number; z: number; flowering: boolean; scale: number; yaw: number; tint: number }[] {
  const out: { x: number; z: number; flowering: boolean; scale: number; yaw: number; tint: number }[] = [];
  for (const G of hkGardens()) {
    const r = grng(0x7a3d10 + G.index * 977);
    for (let j = 0; j < 8; j++) {
      const ang = (j + 0.5) * (Math.PI / 4) + (r() - 0.5) * 0.06, rad = G.shore + 14 + (r() - 0.5) * 1.2;
      const flowering = (j + G.index) % 3 !== 2;
      out.push({ x: G.x + Math.cos(ang) * rad, z: G.z + Math.sin(ang) * rad, flowering, scale: flowering ? 1.0 + r() * 0.3 : 0.5 + r() * 0.12, yaw: r() * GTAU, tint: 0.92 + r() * 0.12 });
    }
  }
  return out;
}
/** Benches (8 per garden, on the pond side of the promenade, facing the pond) and lamps (12 per garden, outer promenade edge): world x, z and the polar angle. */
export function hkGardenBenches(): { x: number; z: number; yaw: number }[] {
  const out: { x: number; z: number; yaw: number }[] = [];
  for (const G of hkGardens()) for (let j = 0; j < 8; j++) { const a = (j + 0.5) * (Math.PI / 4); out.push({ x: G.x + Math.cos(a) * (G.shore + 2.4), z: G.z + Math.sin(a) * (G.shore + 2.4), yaw: a }); }
  return out;
}
export function hkGardenLamps(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const G of hkGardens()) for (let j = 0; j < 12; j++) { const a = (j + 0.5) * (GTAU / 12); out.push({ x: G.x + Math.cos(a) * (G.shore + 3.25), z: G.z + Math.sin(a) * (G.shore + 3.25) }); }
  return out;
}

// ---- HK-10d: the whole INFIELD of the four loops (radius HK_RI) is levelled, mown lawn and planted: no random jungle tree inside, only the planted ones below.
export const HK_RI = 72;
/** Is (x, z) inside the infield of one of the four loops (`margin` m extra)? Used to keep the random jungle trees out. */
export function inHkInfield(x: number, z: number, margin = 0): boolean {
  if (!Config.roads.hatikamrul.enabled) return false;
  for (const L of HK_INFIELD_LAWNS) if (Math.hypot(x - L.x, z - L.z) < HK_RI + margin) return true;
  return false;
}
/** Leaf colour families of the planted trees (index into GARDEN_COLOURS of TreeChunkBuilder). The tint float of a tree = 3 + family + a 0..0.99 brightness fraction; a normal tree has a tint below 3. */
export const HK_TREE_FAMILIES = 9;
export const hkColourTint = (family: number, frac: number): number => 3 + family + Math.min(0.99, Math.max(0, frac));
export interface HkLoopTree { x: number; z: number; kind: number; scale: number; yaw: number; tint: number }
const BIG_KINDS = [TreeKind.oak, TreeKind.broadleaf, TreeKind.vase, TreeKind.koroi, TreeKind.oak, TreeKind.segun] as const;
const SMALL_KINDS = [TreeKind.slender, TreeKind.vase, TreeKind.broadleaf, TreeKind.slender] as const;
const BIG_SCALE: Record<number, [number, number]> = { [TreeKind.oak]: [1.15, 1.6], [TreeKind.broadleaf]: [1.2, 1.6], [TreeKind.vase]: [1.2, 1.6], [TreeKind.koroi]: [0.5, 0.65], [TreeKind.segun]: [0.5, 0.6] };
// colour order of the big trees: mostly green / lime / gold / teal / violet / pink, the red-bronze one (family 4) only once in 9
const BIG_FAM = [0, 1, 2, 5, 7, 3, 6, 8, 4] as const;
const SMALL_FAM = [2, 6, 5, 1, 3, 7, 6, 2, 5, 8] as const;
let loopTreeCache: HkLoopTree[] | null = null;
/**
 * HK-10d: the planted trees of the four loops. Per loop: 8 BIG shade trees on the garden lawn ring (only 2 of them krishnachura = few red flowers, the other 6 coloured leaf trees), then rings of BIG coloured trees (every ~16 m, family from BIG_FAM)
 * with 2 SMALL coloured trees in every gap, ring after ring out to the lawn edge (every 2nd ring is small trees only, in clumps). Pure numbers: the tree placer (chunk worker) only has to skip road ground / water.
 */
export function hkLoopTrees(): HkLoopTree[] {
  if (loopTreeCache) return loopTreeCache;
  const out: HkLoopTree[] = [];
  const lawnOf = (G: HkGarden): HkLawn | undefined => HK_INFIELD_LAWNS.find((L) => Math.hypot(L.x - G.x, L.z - G.z) < 1);
  for (const G of hkGardens()) {
    const rnd = grng(0x51c0de + G.index * 7919);
    const L = lawnOf(G), rMax = (L ? L.r : G.gr) - 2.5;
    const big = (ang: number, rad: number, k: number, plain: boolean): void => {
      const kind = BIG_KINDS[Math.floor(rnd() * BIG_KINDS.length)], sc = BIG_SCALE[kind];
      if (plain) { out.push({ x: G.x + Math.cos(ang) * rad, z: G.z + Math.sin(ang) * rad, kind: TreeKind.krishnachura, scale: 0.95 + rnd() * 0.25, yaw: rnd() * GTAU, tint: 0.92 + rnd() * 0.12 }); return; }
      out.push({ x: G.x + Math.cos(ang) * rad, z: G.z + Math.sin(ang) * rad, kind, scale: sc[0] + (sc[1] - sc[0]) * rnd(), yaw: rnd() * GTAU, tint: hkColourTint(BIG_FAM[(k + G.index * 2) % BIG_FAM.length], rnd()) });
    };
    const small = (ang: number, rad: number, k: number): void => {
      const kind = SMALL_KINDS[Math.floor(rnd() * SMALL_KINDS.length)];
      out.push({ x: G.x + Math.cos(ang) * rad, z: G.z + Math.sin(ang) * rad, kind, scale: kind === TreeKind.slender ? 0.5 + rnd() * 0.3 : 0.45 + rnd() * 0.25, yaw: rnd() * GTAU, tint: hkColourTint(SMALL_FAM[(k + G.index * 3) % SMALL_FAM.length], rnd()) });
    };
    // garden lawn ring: 8 big shade trees (2 krishnachura)
    for (let j = 0; j < 8; j++) big((j + 0.5) * (Math.PI / 4) + (rnd() - 0.5) * 0.06, G.shore + 14 + (rnd() - 0.5) * 1.2, j, j % 4 === 0);
    // outer rings
    let ringNo = 0;
    for (let r = G.gr + 6.5; r <= rMax; r += 8, ringNo++) {
      const spacing = ringNo % 2 === 0 ? 17 : 11, n = Math.max(6, Math.round((GTAU * r) / spacing)), a0 = rnd() * GTAU;
      for (let i = 0; i < n; i++) {
        const ang = a0 + (i / n) * GTAU + (rnd() - 0.5) * 0.08, rad = r + (rnd() - 0.5) * 2.4;
        if (ringNo % 2 === 0) {
          big(ang, rad, i + ringNo, false);
          const da = (GTAU / n) / 3;
          small(ang + da, rad + (rnd() - 0.5) * 5, i * 2); small(ang + 2 * da, rad + (rnd() - 0.5) * 5, i * 2 + 1);
        } else {
          small(ang, rad, i); if (i % 2 === 0) small(ang + 0.03, rad + 2.2, i + 3);
        }
      }
    }
  }
  loopTreeCache = out;
  return out;
}

// ---- HK-10d: LEVEL GROUND. Each infield is a flat pad (design level = about the middle of the natural ground in the disc, measured with scripts/hk-loop-probe.ts): flat out to HK_PAD_FLAT m, then a smooth fade to the natural ground over
// HK_PAD_FADE m (the loop ramps start 81 m from the centre and have their own cut, so the pad ends well before them). The two WEST pads leave the pond bank alone (the bank is shaped by Lakes.ts): they start 8 m beyond the shore and are full 14 m beyond it.
export const HK_PAD_FLAT = 60;
export const HK_PAD_FADE = 12;
export const HK_PADS: readonly { readonly id: string; readonly x: number; readonly z: number; readonly level: number; readonly bank: number }[] = [
  { id: 'HKD-NW', x: HK_INFIELD_PONDS[0].x, z: HK_INFIELD_PONDS[0].z, level: 19.0, bank: HK_INFIELD_PONDS[0].R * (1 + HK_POND_WOBBLE) * 1.08 },
  { id: 'HKD-SW', x: HK_INFIELD_PONDS[1].x, z: HK_INFIELD_PONDS[1].z, level: 20.0, bank: HK_INFIELD_PONDS[1].R * (1 + HK_POND_WOBBLE) * 1.08 },
  { id: 'HKD-SE', x: HK_INFIELD_LAWNS[0].x, z: HK_INFIELD_LAWNS[0].z, level: 21.3, bank: 0 },
  { id: 'HKD-NE', x: HK_INFIELD_LAWNS[1].x, z: HK_INFIELD_LAWNS[1].z, level: 18.5, bank: 0 },
];
const sstep = (t: number): number => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
/** Quick test: could (x, z) be inside a pad (+ fade)? */
export function hkPadNear(x: number, z: number): boolean {
  if (!Config.roads.hatikamrul.enabled) return false;
  for (const P of HK_PADS) if (Math.abs(x - P.x) < HK_PAD_FLAT + HK_PAD_FADE && Math.abs(z - P.z) < HK_PAD_FLAT + HK_PAD_FADE) return true;
  return false;
}
/** Ground height after the level pads: `h` = the ground so far, `k` 0..1 = how much the pad may act here (0 on road ground: roads keep what they have). */
export function hkPadHeight(x: number, z: number, h: number, k: number): number {
  for (const P of HK_PADS) {
    const d = Math.hypot(x - P.x, z - P.z);
    if (d >= HK_PAD_FLAT + HK_PAD_FADE) continue;
    let w = 1 - sstep((d - HK_PAD_FLAT) / HK_PAD_FADE);
    if (P.bank > 0) w *= sstep((d - (P.bank + 8)) / 6);
    w *= k;
    if (w > 0) return h + (P.level - h) * w;
  }
  return h;
}

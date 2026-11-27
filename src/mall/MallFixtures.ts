// CITY MALL, STEP C4: the shop fixtures (shelves, fridges, crates, counters, hanger rails + mannequins, TV stands, appliance boxes, room sets, bookshelves, racks ...) and where they stand
// inside a shop. PURE data (NO three.js): MallBuilder turns the boxes into InstancedMeshes, the headless checks use the same numbers.
// A fixture = a "bay" (one unit of a row, e.g. one 1.8 m shelf bay) = a short list of boxes in the bay's own frame (x along the row, z across, y up; `y` = CENTRE height). 16 families, every
// category of the mall uses one (FAMILY_OF). Open plan (user, C4): rows of bays, aisles between the rows, no walls. ~300 bays per shop (Quality: mallFixtures), ALL solid (one collider per run of bays).
import type { Pt, ShopSlot } from './MallShops';

export type Mat = 'o' | 'g'; // opaque / glass (the glass boxes are drawn in a transparent InstancedMesh)
/** A fixed colour (0xRRGGBB) or the category colour: c1 = the colour, c2 = lighter, c3 = very pale. */
export type Col = number | 'c1' | 'c2' | 'c3';
export interface Box { x: number; y: number; z: number; sx: number; sy: number; sz: number; m: Mat; c: Col }
/** STEP C5: where a real product stands on a bay (the bay's own frame): bottom centre x / y / z, `size` = the longest side of the product (m), `yaw` = which way its front looks (0 = +z, PI = -z, PI/2 = +x). */
export interface Slot { x: number; y: number; z: number; size: number; yaw: number }
export interface Bay { len: number; depth: number; h: number; boxes: Box[]; slots: Slot[] }
export type FamilyId =
  | 'gondola' | 'fridge' | 'crate' | 'counter' | 'rail' | 'tvwall' | 'electro' | 'bigbox'
  | 'room_sofa' | 'room_bed' | 'room_dining' | 'room_office' | 'bookshelf' | 'rack' | 'bikes' | 'plants';

const FR = 0x334155, WD = 0x8b5a2b, WH = 0xe5e7eb, DK = 0x1e293b, LT = 0xcbd5e1, SC = 0x0b1220, POT = 0xb45309, GL = 0xbfe6f5;
/** One box standing on y0 (bottom height), centre x / z, size sx sy sz. */
const bx = (x: number, y0: number, z: number, sx: number, sy: number, sz: number, c: Col, m: Mat = 'o'): Box => ({ x, y: y0 + sy / 2, z, sx, sy, sz, m, c });
const C3: Col[] = ['c1', 'c2', 'c3'];

const gondola = (v: number): Box[] => {
  const o = [bx(0, 0, 0, 1.8, 0.12, 1.0, FR), bx(0, 0.12, 0, 1.8, 1.7, 0.06, LT)]; // base, back panel; 3 shelf levels of goods on each side
  for (const sd of [-1, 1]) for (let lv = 0; lv < 3; lv++) o.push(bx(0, 0.25 + lv * 0.55, sd * 0.27, 1.6, 0.34, 0.38, C3[(lv + v + (sd > 0 ? 1 : 0)) % 3]));
  return o;
};
const fridge = (v: number): Box[] => {
  const o = [bx(0, 0, 0, 1.5, 0.1, 0.9, FR), bx(0, 0.1, -0.4, 1.5, 2.0, 0.08, DK), bx(-0.71, 0.1, -0.05, 0.08, 2.0, 0.8, DK), bx(0.71, 0.1, -0.05, 0.08, 2.0, 0.8, DK), bx(0, 2.1, 0, 1.5, 0.1, 0.9, DK)];
  for (let lv = 0; lv < 3; lv++) o.push(bx(0, 0.3 + lv * 0.6, -0.12, 1.3, 0.4, 0.5, C3[(lv + v) % 3]));
  o.push(bx(0, 0.1, 0.42, 1.4, 2.0, 0.04, GL, 'g')); // the glass door
  return o;
};
const crate = (v: number): Box[] => {
  const o = [bx(0, 0, 0, 1.8, 0.75, 0.9, WD)];
  for (let j = 0; j < 3; j++) o.push(bx(-0.55 + j * 0.55, 0.75, 0, 0.5, 0.22, 0.42, C3[(j + v) % 3]));
  if (v) o.push(bx(0, 0.97, 0, 0.5, 0.2, 0.4, 'c3'));
  return o;
};
const counter = (v: number): Box[] => [bx(0, 0, 0, 1.8, 0.75, 0.7, LT), bx(0, 0.75, 0, 1.7, 0.4, 0.6, GL, 'g'), bx(0, 0.78, 0, 1.5, 0.12, 0.45, v ? 'c2' : 'c1'), bx(0, 1.15, 0, 1.8, 0.05, 0.7, FR)];
const tv = (v: number): Box[] => [bx(0, 0, 0, 0.9, 0.05, 0.5, FR), bx(0, 0.05, 0, 0.12, 0.7, 0.12, FR), bx(0, 0.75, 0, 1.3, 0.75, 0.06, SC), bx(0, 0.82, 0.035, 1.2, 0.62, 0.01, v ? 'c2' : 0x38bdf8)];
const table = (): Box[] => [bx(0, 0, 0, 1.8, 0.8, 0.9, DK), bx(-0.6, 0.8, 0, 0.4, 0.03, 0.3, 'c1'), bx(0, 0.8, 0, 0.4, 0.03, 0.3, 'c2'), bx(0.6, 0.8, 0, 0.4, 0.03, 0.3, 'c3')];
const railBay = (v: number): Box[] => {
  const o = [bx(-0.9, 0, 0, 0.05, 1.6, 0.05, FR), bx(0.9, 0, 0, 0.05, 1.6, 0.05, FR), bx(0, 1.55, 0, 1.9, 0.04, 0.04, LT)];
  for (let j = 0; j < 6; j++) o.push(bx(-0.8 + j * 0.32, 0.65, 0, 0.26, 0.88, 0.06, C3[(j + v) % 3]));
  return o;
};
const mannequins = (): Box[] => {
  const o: Box[] = [];
  for (const x of [-0.5, 0.5]) o.push(bx(x, 0, 0, 0.5, 0.04, 0.5, FR), bx(x, 0.04, 0, 0.22, 0.75, 0.2, 'c3'), bx(x, 0.8, 0, 0.38, 0.6, 0.22, 'c1'), bx(x, 1.42, 0, 0.18, 0.24, 0.18, LT));
  return o;
};
const folded = (): Box[] => {
  const o = [bx(0, 0, 0, 1.8, 0.8, 0.9, WD)];
  for (let j = 0; j < 4; j++) o.push(bx(-0.65 + j * 0.43, 0.8, 0, 0.36, 0.14 + 0.04 * j, 0.5, C3[j % 3]));
  return o;
};
const bigbox = (v: number): Box[] => {
  const h = [1.9, 1.0, 0.9, 1.5][v % 4], body: Col = [WH, LT, 'c3', 'c2'][v % 4] as Col;
  return [bx(0, 0, 0, 1.2, h, 0.85, body), bx(0, h - 0.2, 0.43, 0.8, 0.1, 0.02, DK), bx(0.35, h * 0.35, 0.44, 0.04, 0.4, 0.04, FR)];
};
const roomSofa = (): Box[] => [bx(0, 0, 0, 4.2, 0.02, 2.8, 'c3'), bx(0, 0.02, -0.9, 2.2, 0.45, 0.9, 'c1'), bx(0, 0.47, -1.3, 2.2, 0.5, 0.2, 'c1'), bx(-1.2, 0.02, -0.9, 0.2, 0.65, 0.9, 'c2'), bx(1.2, 0.02, -0.9, 0.2, 0.65, 0.9, 'c2'), bx(0, 0.02, 0.4, 1.1, 0.4, 0.6, WD), bx(1.9, 0, -1.2, 0.05, 1.5, 0.05, FR), bx(1.9, 1.5, -1.2, 0.35, 0.25, 0.35, 'c2')];
const roomBed = (): Box[] => [bx(0, 0, 0, 4.2, 0.02, 2.8, 'c3'), bx(0, 0.02, -0.5, 2.0, 0.3, 2.2, WD), bx(0, 0.32, -0.45, 1.9, 0.2, 2.0, WH), bx(0, 0.02, -1.65, 2.0, 1.0, 0.1, WD), bx(-0.5, 0.52, -1.3, 0.6, 0.12, 0.35, 'c1'), bx(0.5, 0.52, -1.3, 0.6, 0.12, 0.35, 'c1'), bx(-1.4, 0.02, -1.5, 0.4, 0.45, 0.4, WD), bx(1.4, 0.02, -1.5, 0.4, 0.45, 0.4, WD), bx(0, 0.52, 0.1, 1.9, 0.06, 1.0, 'c2')];
const roomDining = (): Box[] => {
  const o = [bx(0, 0, 0, 2.0, 0.7, 0.9, WD), bx(0, 0.7, 0, 2.2, 0.08, 1.1, WD)];
  for (const z of [-0.8, 0.8]) for (const x of [-0.7, 0, 0.7]) o.push(bx(x, 0, z, 0.45, 0.9, 0.45, 'c1'));
  return o;
};
const roomOffice = (): Box[] => [bx(0, 0.7, -0.8, 1.8, 0.06, 0.8, WD), bx(-0.85, 0, -0.8, 0.06, 0.7, 0.8, WD), bx(0.85, 0, -0.8, 0.06, 0.7, 0.8, WD), bx(0, 0, 0.1, 0.5, 0.45, 0.5, DK), bx(0, 0.45, 0.35, 0.5, 0.55, 0.08, DK), bx(0, 0.76, -1.0, 0.6, 0.35, 0.04, SC)];
const bookshelf = (v: number): Box[] => {
  const o = [bx(0, 0, -0.2, 1.6, 2.0, 0.05, WD), bx(-0.78, 0, 0, 0.04, 2.0, 0.5, WD), bx(0.78, 0, 0, 0.04, 2.0, 0.5, WD)];
  for (let lv = 0; lv < 5; lv++) o.push(bx(0, 0.1 + lv * 0.38, 0, 1.5, 0.3, 0.28, C3[(lv + v) % 3]));
  return o;
};
const rack = (v: number): Box[] => {
  const o = [bx(-0.85, 0, 0, 0.05, 1.6, 0.05, FR), bx(0.85, 0, 0, 0.05, 1.6, 0.05, FR), bx(0, 0.5, 0, 1.7, 0.04, 0.04, LT), bx(0, 1.1, 0, 1.7, 0.04, 0.04, LT)];
  for (let j = 0; j < 4; j++) o.push(bx(-0.6 + j * 0.4, 1.14, 0, 0.28, 0.28, 0.28, C3[(j + v) % 3]));
  for (let j = 0; j < 3; j++) o.push(bx(-0.4 + j * 0.4, 0.54, 0, 0.28, 0.28, 0.28, C3[(j + v + 1) % 3]));
  return o;
};
const bike = (v: number): Box[] => [bx(-0.55, 0, 0, 0.7, 0.7, 0.05, DK), bx(0.55, 0, 0, 0.7, 0.7, 0.05, DK), bx(0, 0.3, 0, 0.9, 0.05, 0.05, C3[v % 3]), bx(-0.25, 0.62, 0, 0.25, 0.05, 0.12, DK), bx(0.5, 0.8, 0, 0.05, 0.05, 0.4, FR)];
const plants = (v: number): Box[] => {
  const o = [bx(0, 0, 0, 1.6, 0.7, 0.8, WD)];
  for (let j = 0; j < 4; j++) { const x = -0.55 + j * 0.37; o.push(bx(x, 0.7, 0, 0.28, 0.28, 0.28, v ? 'c2' : POT), bx(x, 0.98, 0, 0.36, 0.4, 0.36, v ? C3[j % 3] : (j % 2 ? 0x22c55e : 0x16a34a))); }
  return o;
};
// ---- STEP C5: product slots ("a shelf level of the bay faces the aisle"). Few slots per bay: the products stand on every k-th bay (Quality.mallProducts), see layoutProducts ----
const PI = Math.PI;
const sl = (x: number, y: number, z: number, size: number, yaw = 0): Slot => ({ x, y, z, size, yaw });
const twoSided = (xs: number[], y: number, z: number, size: number): Slot[] => [1, -1].flatMap((sd) => xs.map((x) => sl(x, y, sd * z, size, sd > 0 ? 0 : PI)));
const S_GONDOLA = twoSided([-0.4, 0.4], 1.14, 0.3, 0.34);
const S_FRIDGE = [...[-0.4, 0.4].map((x) => sl(x, 1.3, -0.1, 0.34)), ...[-0.4, 0.4].map((x) => sl(x, 1.9, -0.1, 0.34))];
const S_CRATE = twoSided([-0.6, 0.6], 0.75, 0.32, 0.26);
const S_COUNTER = [-0.6, -0.2, 0.2, 0.6].map((x) => sl(x, 0.9, 0, 0.26));
const S_RAIL = twoSided([-0.45, 0.45], 0.2, 0.09, 0.8);
const S_FOLDED = [-0.2, 0.2].map((x) => sl(x, 1.0, 0, 0.4));
const S_TV = [-0.45, 0.45].map((x) => sl(x, 0, 0.28, 0.5));
const S_TABLE = [-0.6, 0, 0.6].map((x) => sl(x, 0.83, 0, 0.3));
const S_BIGBOX = (top: number): Slot[] => (top > 1.6 ? [] : [-0.3, 0.3].map((x) => sl(x, top, 0, 0.4)));
const mk = (len: number, depth: number, h: number, variants: Box[][], slots: (variant: number) => Slot[]): Bay[] => variants.map((boxes, i) => ({ len, depth, h, boxes, slots: slots(i) }));

/** The bays of every family (variants are mixed along the rows). `h` = the height of the collider of a run. */
export const BAYS: Record<FamilyId, Bay[]> = {
  gondola: mk(1.8, 1.0, 1.9, [gondola(0), gondola(1)], () => S_GONDOLA),
  fridge: mk(1.5, 0.9, 2.1, [fridge(0), fridge(1)], () => S_FRIDGE),
  crate: mk(1.8, 0.9, 1.0, [crate(0), crate(1)], () => S_CRATE),
  counter: mk(1.8, 0.7, 1.2, [counter(0), counter(1)], () => S_COUNTER),
  rail: mk(2.0, 0.9, 1.7, [railBay(0), railBay(1), railBay(2), railBay(0), mannequins(), folded()], (i) => (i < 4 ? S_RAIL : i === 5 ? S_FOLDED : [])),
  tvwall: mk(1.6, 0.7, 1.6, [tv(0), tv(1)], () => S_TV),
  electro: mk(1.8, 0.9, 1.6, [counter(0), counter(1), tv(0), table(), counter(0), tv(1)], (i) => (i === 3 ? S_TABLE : i === 2 || i === 5 ? S_TV : S_COUNTER)),
  bigbox: mk(1.4, 0.9, 1.9, [bigbox(0), bigbox(1), bigbox(2), bigbox(3)], (i) => S_BIGBOX([1.9, 1.0, 0.9, 1.5][i])),
  room_sofa: mk(5, 3.5, 1.0, [roomSofa()], () => [sl(-1.5, 0.02, 0.85, 1.2, PI), sl(1.5, 0.02, 0.85, 1.2, PI)]),
  room_bed: mk(5, 3.5, 1.0, [roomBed()], () => [sl(-1.35, 0.02, 1.0, 1.3, PI), sl(1.35, 0.02, 1.0, 1.3, PI)]),
  room_dining: mk(5, 3.5, 1.0, [roomDining()], () => [sl(-1.8, 0, 0, 0.8, PI / 2), sl(1.8, 0, 0, 0.8, -PI / 2)]),
  room_office: mk(5, 3.5, 1.0, [roomOffice()], () => [sl(-1.5, 0, 0.4, 0.9, PI), sl(1.5, 0, 0.4, 0.9, PI)]),
  bookshelf: mk(1.6, 0.5, 2.0, [bookshelf(0), bookshelf(1)], () => [-0.4, 0.4].map((x) => sl(x, 2.0, 0, 0.35))),
  rack: mk(1.8, 0.7, 1.7, [rack(0), rack(1)], () => [-0.4, 0.4].map((x) => sl(x, 1.42, 0, 0.3))),
  bikes: mk(1.8, 0.7, 1.0, [bike(0), bike(1), bike(2)], () => [sl(0, 0, 0.3, 0.9)]),
  plants: mk(1.6, 0.8, 1.5, [plants(0), plants(1)], () => [-0.4, 0.4].map((x) => sl(x, 1.38, 0, 0.3))),
};

/** Which fixture family a category uses. */
export const FAMILY_OF: Record<string, FamilyId> = {
  // 0 supermarket
  fruits: 'crate', bakery: 'counter', drinks: 'fridge', snacks: 'gondola', dairy: 'fridge', grain: 'crate', sweets: 'counter', daily: 'gondola',
  // 1 women's fashion
  saree: 'rail', salwar: 'rail', kurti: 'rail', womenwest: 'rail', hijab: 'rail', bridal: 'rail', womenwinter: 'rail', beauty: 'counter',
  // 2 men's + kids' fashion
  panjabi: 'rail', menformal: 'rail', mendenim: 'rail', menwinter: 'rail', kidsboys: 'rail', kidsgirls: 'rail', baby: 'rail', sport: 'rail',
  // 3 shoes, bags, watches, jewellery
  shoes: 'gondola', sandal: 'gondola', bags: 'gondola', travel: 'rack', watches: 'counter', jewel: 'counter', glasses: 'counter', wallet: 'counter',
  // 4 mobile + laptop
  mobiles: 'electro', laptops: 'electro', tablets: 'electro', mobacc: 'gondola', lapacc: 'gondola', printer: 'bigbox', storage: 'counter', monitor: 'tvwall',
  // 5 TV, audio, camera, gaming
  tvs: 'tvwall', speaker: 'electro', audio: 'counter', cameras: 'electro', action: 'counter', gaming: 'electro', gameacc: 'gondola', projector: 'tvwall',
  // 6 home appliance + smart home
  fridge: 'bigbox', ac: 'bigbox', washer: 'bigbox', kitchenapp: 'gondola', appl: 'gondola', smart: 'electro', cctv: 'electro', solar: 'bigbox',
  // 7 furniture + bedding
  sofa: 'room_sofa', beds: 'room_bed', dining: 'room_dining', wardrobe: 'bigbox', officef: 'room_office', bedding: 'crate', carpet: 'crate', shelf: 'bookshelf',
  // 8 kitchen, decor, light, garden
  kitchen: 'gondola', dinner: 'gondola', light: 'gondola', decor: 'plants', garden: 'plants', tools: 'rack', bath: 'gondola', organizer: 'gondola',
  // 9 toys, books, sports, gifts
  toys: 'gondola', books: 'bookshelf', stationery: 'gondola', sports: 'rack', bikes: 'bikes', games: 'gondola', music: 'counter', gifts: 'counter',
};

export interface Placed { x: number; z: number; yaw: number; bay: Bay }
/** One collider: a whole run of bays standing next to each other (axis aligned: the rows run along x). */
export interface Run { cx: number; cz: number; hx: number; hz: number; h: number }
export interface ShopLayout { family: FamilyId; bays: Placed[]; runs: Run[] }

/** x intervals where the horizontal line at z is inside the polygon. */
function intervals(poly: Pt[], z: number): [number, number][] {
  const xs: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z)) xs.push(xj + ((z - zj) * (xi - xj)) / (zi - zj)); }
  xs.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], xs[k + 1]]);
  return out;
}
const inter = (A: [number, number][], B: [number, number][]): [number, number][] => {
  const out: [number, number][] = [];
  for (const a of A) for (const b of B) { const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]); if (hi > lo) out.push([lo, hi]); }
  return out;
};

export const ROW_PITCH = 12; // rows stand on z = 12 m x n: the columns stand on z = 6 + 12 m x n, so a row never meets a column
const cache = new Map<string, ShopLayout>();
/**
 * Rows of bays of one family inside a shop (cap = about how many bays the shop may hold; Quality.mallFixtures). Rows stand 6 m from the column rows, the bays tile x in
 * multiples of their length, a bay lies fully inside the shop polygon (0.4 m off its edge) and keeps 1 m clear of the "view all" post. When there would be more than `cap`
 * bays, only every k-th row is kept (the same rows on every floor, so the shops look the same density everywhere).
 */
export function layoutShop(slot: ShopSlot, fam: FamilyId, cap: number): ShopLayout {
  const key = `${slot.index}:${fam}:${cap}`, hit = cache.get(key);
  if (hit) return hit;
  const V = BAYS[fam], len = V[0].len, d = V[0].depth, h = V[0].h, poly = slot.poly;
  let zmin = Infinity, zmax = -Infinity;
  for (const [, z] of poly) { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
  type Row = { z: number; ks: { k: number; ok: boolean }[] };
  const rows: Row[] = [];
  for (let m = Math.ceil((zmin + d) / ROW_PITCH); m <= Math.floor((zmax - d) / ROW_PITCH); m++) {
    const z = m * ROW_PITCH;
    const I = inter(inter(intervals(poly, z - d / 2), intervals(poly, z)), intervals(poly, z + d / 2));
    const ks: Row['ks'] = [];
    for (const [a0, b0] of I) {
      const a = a0 + 0.4, b = b0 - 0.4;
      for (let k = Math.ceil(a / len); k <= Math.floor(b / len) - 1; k++) {
        const cx = (k + 0.5) * len;
        ks.push({ k, ok: !(Math.abs(cx - slot.board.x) < len / 2 + 1 && Math.abs(z - slot.board.z) < d / 2 + 1) });
      }
    }
    if (ks.some((q) => q.ok)) rows.push({ z, ks });
  }
  const total = rows.reduce((n, r) => n + r.ks.filter((q) => q.ok).length, 0), stride = total > cap ? Math.ceil(total / cap) : 1;
  const bays: Placed[] = [], runs: Run[] = [];
  rows.filter((_, i) => i % stride === 0).forEach((r, ri) => {
    const yaw = (ri % 2) * Math.PI;
    let c0 = 0, cn = 0, open = false;
    const close = (): void => { if (open) { runs.push({ cx: ((c0 + cn) / 2) * len + len / 2, cz: r.z, hx: ((cn - c0) * len) / 2 + len / 2, hz: d / 2, h }); open = false; } };
    let prev = -1e9;
    for (const q of r.ks) {
      if (!q.ok) { close(); prev = q.k; continue; }
      bays.push({ x: (q.k + 0.5) * len, z: r.z, yaw, bay: V[(q.k + 3 * ri + 1000) % V.length] });
      if (open && q.k === prev + 1) cn = q.k; else { close(); c0 = cn = q.k; open = true; }
      prev = q.k;
    }
    close();
  });
  const out: ShopLayout = { family: fam, bays, runs };
  cache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// STEP C5: which products stand where. PURE data (the headless check uses the same numbers). A shop shows `cap` products at most: every k-th bay of the shop gets its slots filled,
// the products of the category take the slots in turn (slot n -> product n mod count), so every product is on show about cap / count times.
export interface ProductPlace { x: number; y: number; z: number; yaw: number; size: number; product: number }
const pcache = new WeakMap<ShopLayout, Map<string, ProductPlace[]>>();
export function layoutProducts(L: ShopLayout, count: number, cap: number): ProductPlace[] {
  if (count <= 0 || cap <= 0) return [];
  let m = pcache.get(L);
  if (!m) pcache.set(L, (m = new Map()));
  const key = `${count}:${cap}`, hit = m.get(key);
  if (hit) return hit;
  const cand = L.bays.filter((p) => p.bay.slots.length > 0);
  const out: ProductPlace[] = [];
  if (cand.length) {
    const per = cand.reduce((n, p) => n + p.bay.slots.length, 0) / cand.length, want = Math.max(1, Math.ceil(cap / per)), stride = Math.max(1, Math.floor(cand.length / want));
    let k = 0;
    for (let i = Math.floor(stride / 2); i < cand.length && out.length < cap; i += stride) {
      const P = cand[i], cy = Math.cos(P.yaw), sy = Math.sin(P.yaw);
      for (const s of P.bay.slots) {
        if (out.length >= cap) break;
        out.push({ x: P.x + s.x * cy + s.z * sy, y: s.y, z: P.z - s.x * sy + s.z * cy, yaw: P.yaw + s.yaw, size: s.size, product: k++ % count });
      }
    }
  }
  m.set(key, out);
  return out;
}

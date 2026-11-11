// EVLab Step 12: who sits on which bench, and how (pure numbers + functions, no three.js / DOM: EVLabBenchSitters and the test use it).
// Building-local metres, same frame as EVLabBenches. People are only drawn (no physics), they sit still (a person on a bench costs nothing per frame).
//
// WHICH: `count` people (Q.evlabBenchSitters) are spread over the benches of the three areas (plaza, island quay, outer bank) in proportion to how many benches each has;
//        most benches stay empty (65 benches, 6 .. 20 people). A bench holds at most 2 people and then only on the two end places (1.16 m apart); a lone person
//        takes any of the 3 places. Same `seed` = same people on the same places.
// HOW:   upright, back against the back rest (a little lean back), thighs on the seat, shins down, soles flat on the ground (two-link leg solved for every body size),
//        hands in the lap or one hand on the seat; some people look a little to the side.
import { BENCH, benches, benchPoint, benchSeats, type BenchArea } from './EVLabBenches';
import { BODY, twoLink } from './EVLabCyclistPose';

export interface SitterPlan {
  /** Index into benchSeats(). */
  seat: number;
  bench: number;
  /** Body size (the PersonModel `scale`, 0.92 .. 1.06) and the seed of the look. */
  scale: number;
  look: number;
  /** Hands: 0 = both in the lap, 1 = one hand on the seat beside him. */
  hands: 0 | 1;
  /** Extra turn of the head / body to the side (rad, |.| < 0.35). */
  turn: number;
}

/** Small seeded generator (copy of the one in EVLabCyclists, so this file needs nothing else). */
export function sitterRng(seed: number): () => number {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Where the hips of a sitting person are, in the bench frame: a little in front of the back rest (z) and 0.05 m x scale above the seat. */
export const SIT = { hipZ: -0.08, lean: -0.1, heelF: 0.43 } as const;

/** Largest body size that still sits on the seat with the soles on the ground (the seat is 0.45 m high). */
export const SITTER_SCALE = { min: 0.92, max: 1.06 } as const;

export interface SitPose {
  lean: number;
  thigh: [number, number];
  knee: [number, number];
  arm: [number, number];
  elbow: [number, number];
  /** Hip joint height above the ground of the bench, and how far a sole stays above (+) / below (-) the ground (0 = flat on it). */
  hipY: number;
  miss: number;
}

/** Limb angles (PersonModel.setSeatedLimbs convention) of a person of body size `scale` sitting on a seat `seatH` high, so that both soles stand on the ground. */
export function sitPose(scale: number, hands: 0 | 1, seatH: number = BENCH.seatH): SitPose {
  const s = scale;
  const hipY = seatH + BODY.hipUp * s;
  const ankleY = BODY.soleUp * s; // the ankle is the sole height above the ground
  const ankleF = SIT.heelF * s;
  const r = twoLink(ankleF / s, (ankleY - hipY) / s, BODY.thigh, BODY.shin, true);
  const leg = -r.a1;
  // arms: upper arm a little forward, forearm bent forward (hands in the lap); with hands = 1 the right hand rests on the seat (arm straight down-ish)
  const arm: [number, number] = hands === 0 ? [-0.45, -0.45] : [-0.45, -0.12];
  const elbow: [number, number] = hands === 0 ? [-1.1, -1.1] : [-1.1, -0.35];
  return { lean: SIT.lean, thigh: [leg, leg], knee: [r.bend, r.bend], arm, elbow, hipY, miss: r.miss * s };
}

/** Position of the hip joint of the person on seat `i` in building coordinates (x, z) and the height above the floor level (y). */
export function sitterHip(seat: number, scale: number): { x: number; y: number; z: number; yaw: number } {
  const sp = benchSeats()[seat];
  const b = benches()[sp.bench];
  // seat middle -> hip: move back to SIT.hipZ in the bench frame, along the bench stays where the seat is
  const seatLx = (sp.x - b.x) * Math.cos(b.yaw) - (sp.z - b.z) * Math.sin(b.yaw);
  const [x, z] = benchPoint(b, seatLx, SIT.hipZ);
  return { x, y: b.y + BENCH.seatH + BODY.hipUp * scale, z, yaw: b.yaw };
}

/** Choose the people. `count` is clamped to what the benches can take (never more than 2 per bench). */
export function planSitters(count: number, seed = 1212): SitterPlan[] {
  const B = benches(), S = benchSeats();
  if (count <= 0 || !B.length) return [];
  const r = sitterRng(seed);
  // the benches of each area, shuffled
  const areas: BenchArea[] = ['plaza', 'island', 'bank'];
  const pools = areas.map((a) => {
    const idx = B.map((b, i) => (b.area === a ? i : -1)).filter((i) => i >= 0);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return idx;
  });
  const total = pools.reduce((n, p) => n + p.length, 0);
  const n = Math.min(count, total * 2);
  // people per area ~ share of the benches (largest remainder)
  const want = pools.map((p) => (n * p.length) / total);
  const per = want.map(Math.floor);
  let rest = n - per.reduce((a, b) => a + b, 0);
  const order = want.map((w, i) => ({ i, f: w - Math.floor(w) })).sort((a, b) => b.f - a.f);
  for (const o of order) { if (rest <= 0) break; per[o.i]++; rest--; }

  const used = new Map<number, number[]>(); // bench -> places taken (0..2)
  const out: SitterPlan[] = [];
  const add = (bench: number, place: number): void => {
    const seat = bench * BENCH.seats + place;
    if (!S[seat] || S[seat].bench !== bench) return;
    (used.get(bench) ?? used.set(bench, []).get(bench)!).push(place);
    out.push({ seat, bench, scale: SITTER_SCALE.min + r() * (SITTER_SCALE.max - SITTER_SCALE.min), look: Math.floor(r() * 1e6), hands: r() < 0.35 ? 1 : 0, turn: (r() - 0.5) * 0.6 });
  };
  for (let a = 0; a < areas.length; a++) {
    let k = per[a];
    // first pass: one person per bench (different benches), second pass (only if the area has more people than benches): the second person on the opposite end
    for (const b of pools[a]) { if (k <= 0) break; add(b, Math.floor(r() * BENCH.seats)); k--; }
    for (const b of pools[a]) {
      if (k <= 0) break;
      const taken = used.get(b)!;
      const p = taken[0];
      if (p === 1) continue; // a person in the middle blocks the bench for a second one
      add(b, p === 0 ? 2 : 0); k--;
    }
  }
  return out;
}

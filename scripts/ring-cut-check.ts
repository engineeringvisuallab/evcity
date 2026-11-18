// STEP 5.2a check (CP5.2): terrain cut and fill beside the ring follow the daylight slopes (cut 1:2, fill 1:3), the formation is flat and the cut never leaves a wall.
// Run: npx tsx scripts/ring-cut-check.ts [stride]   (stride = every n-th ring point, default 5 = every 40 m)
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';

const stride = Number(process.argv[2] ?? 5);
let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(66)} ${detail}`); };
Config.roads.junctionJ1Arms.enabled = false; Config.roads.islandLink.enabled = process.env.ISLAND === '1'; // ISLAND=1 (17.1g-b): keep the island link M6-1 ON, to see its cut / fill beside the ring S node // this check tests the ring alone; the J1 arms end on the ring (J1-e2, scripts/j1-arms-game-check.ts)
const gen = new TerrainGenerator(Config.world.seed);
const ring = gen.roads.roads.find((r) => r.name === 'M8')!;
const linkRoad = process.env.ISLAND === '1' ? gen.roads.roads.find((r) => r.name === 'M6-1') : undefined;
const linkNear = (x: number, z: number): boolean => { if (!linkRoad) return false; for (let q = 0; q < linkRoad.xs.length; q++) if (Math.hypot(x - linkRoad.xs[q], z - linkRoad.zs[q]) < linkRoad.halfWidth + linkRoad.shoulder + 40) return true; return false; }; // within the link's platform + slope zone
const core = ring.halfWidth + ring.shoulder; // flat platform half width
const o = { h: 0, water: NaN, fx: 0, fz: 0 };
const nat = (x: number, z: number): { h: number; wet: boolean } => { gen.sampleNatural(x, z, o); return { h: o.h, wet: !Number.isNaN(o.water) && o.h < o.water + 0.3 }; };
const fin = (x: number, z: number): number => { gen.sampleGround(x, z, o); gen.roads.apply(x, z, o); return o.h; }; // ground + ROAD cut only (sample() adds rail, port, city flattening)
// STEP 5: ground that another road (side road R*, link ...) or a junction pad shapes is not the ring's face. otherNear = a segment of another road is within its own platform + slope reach, or a pad is.
const net: any = gen.roads; const ringId = net.roads.indexOf(ring);
const otherNear = (x: number, z: number): boolean => {
  const segs = net.cellOf(x, z); if (!segs) return false;
  for (let q = 0; q < segs.length; q++) { const sg = segs[q]; if (net.segRoad[sg] === ringId || net.sbridge[sg]) continue;
    const abx = net.sbx[sg] - net.sax[sg], abz = net.sbz[sg] - net.saz[sg]; const l2 = abx * abx + abz * abz; let t = l2 > 0 ? ((x - net.sax[sg]) * abx + (z - net.saz[sg]) * abz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (net.sax[sg] + abx * t), z - (net.saz[sg] + abz * t)); const e = net.sea[sg] + (net.seb[sg] - net.sea[sg]) * t; if (d < net.score[sg] + e + 2) return true; }
  const pl = net.padCells.get((Math.floor(x / 64) + 512) * 1024 + (Math.floor(z / 64) + 512)); if (pl) for (let q = 0; q < pl.length; q++) { const pd = net.pads[pl[q]]; if (Math.hypot(x - pd.x, z - pd.z) < pd.rCore + pd.emb + 2) return true; }
  return false;
};
// STEP 5.3b rule: the ground is never RAISED where a structure slab (viaduct, bridge; of the ring or of a side road) is nearer than the embankment (a valley is not dammed): such a sample is the structure's, not a face.
const structNear = (x: number, z: number, u: number): boolean => { const segs = net.cellOf(x, z); if (!segs) return false;
  for (let q = 0; q < segs.length; q++) { const sg = segs[q]; if (net.sbridge[sg] !== 2) continue;
    const abx = net.sbx[sg] - net.sax[sg], abz = net.sbz[sg] - net.saz[sg]; const l2 = abx * abx + abz * abz; let t = l2 > 0 ? ((x - net.sax[sg]) * abx + (z - net.saz[sg]) * abz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    if (Math.hypot(x - (net.sax[sg] + abx * t), z - (net.saz[sg] + abz * t)) < u) return true; }
  return false;
};
let otherSkipped = 0;
const SIDES = [-1, 1];
const ROCK_MAX = 4; // = DAY_CUT_MAX in RoadNetwork: steepest rock-cut face (rise per metre of run)
let rock = 0; const wallSt: string[] = [];
const OFFS: number[] = []; for (let u = 0; u <= 250; u += 2) OFFS.push(u);

let nPts = 0, flatBad = 0, flatWorst = 0, envBad = 0, envWorst = 0, steepBad = 0, steepWorst = 0, wall = 0, wallWorst = 0, wet = 0;
const wallAt: string[] = []; const envAt: string[] = [];
for (let i = 0; i < ring.xs.length; i += stride) {
  if (ring.bridgeOf[i] >= 0) continue; // STEP 5.3b: under a structure the ground is natural and lies below the slab (scripts/ring-structures-check.ts checks that)
  nPts++;
  for (const sd of SIDES) {
    const hs: number[] = [], ns: number[] = [], ws: boolean[] = [];
    for (const u of OFFS) {
      const x = ring.xs[i] + ring.nx[i] * u * sd, z = ring.zs[i] + ring.nz[i] * u * sd;
      const n = nat(x, z); hs.push(fin(x, z)); ns.push(n.h); const oth = !n.wet && (otherNear(x, z) || structNear(x, z, u + 2)); if (oth) otherSkipped++; ws.push(n.wet || oth);
    }
    for (let k = 0; k < OFFS.length; k++) {
      const u = OFFS[k];
      if (ws[k]) { wet++; continue; }
      if (u <= core - 0.5) { const e = Math.abs(hs[k] - ring.ys[i]); if (e > 0.25) flatBad++; flatWorst = Math.max(flatWorst, e); }
      else if (u > core + 1 && k > 0 && !ws[k - 1] && u <= 250) {
        const run = u - core;
        const lo = ring.ys[i] - run * (1 / 3) - 0.5, hi = ring.ys[i] + run * ROCK_MAX + 0.5; // 0.5 m for the point-to-point difference of the nearest segment
        const out = Math.max(lo - hs[k], hs[k] - hi, 0); if (out > 0) { envBad++; if (envAt.length < 5) envAt.push(`pt ${i} (${(i * ring.length / ring.xs.length).toFixed(0)} m) ${sd < 0 ? 'L' : 'R'} at ${u} m: ${out.toFixed(2)} m outside, ground ${hs[k].toFixed(1)} road ${ring.ys[i].toFixed(1)}`); } envWorst = Math.max(envWorst, out);
        const sl = Math.abs(hs[k] - hs[k - 1]) / 2; // slope of the finished ground between neighbouring offsets
        const natSl = Math.abs(ns[k] - ns[k - 1]) / 2;
        const extra = sl - Math.max(natSl, ROCK_MAX + 0.05); // a rock cut may be as steep as ROCK_MAX; anything steeper than that and than the natural ground is a wall
        if (extra > 0.02) { steepBad++; if (wallSt.length < 8) wallSt.push(`${(i * ring.length / ring.xs.length).toFixed(0)}${sd < 0 ? 'L' : 'R'}`); } steepWorst = Math.max(steepWorst, extra);
        if (sl > 0.55 && sl > natSl + 0.05) rock++;
      }
    }
    // the last offset must be the natural ground again (daylight reached): a difference is a wall of that height
    const last = OFFS.length - 1;
    // ISLAND=1: a point 250 m from the ring that lies ON the island link road (its first 250 m run straight away from the S node) is road, not natural ground: skipped
    const onLink = linkRoad !== undefined && Math.hypot(ring.xs[i] + ring.nx[i] * 250 * sd - linkRoad.xs[0], ring.zs[i] + ring.nz[i] * 250 * sd - linkRoad.zs[0]) < 300 && Math.abs(hs[last] - ns[last]) > 1 && linkNear(ring.xs[i] + ring.nx[i] * 250 * sd, ring.zs[i] + ring.nz[i] * 250 * sd);
    if (!ws[last] && !onLink) { const w = Math.abs(hs[last] - ns[last]); if (w > 1) { wall++; if (wallAt.length < 6) wallAt.push(`pt ${i} (${(i * ring.length / ring.xs.length).toFixed(0)} m) ${sd < 0 ? 'left' : 'right'} ${w.toFixed(1)} m`); } wallWorst = Math.max(wallWorst, w); }
  }
}
console.log(`ring points tested ${nPts}, platform half width ${core.toFixed(1)} m, wet samples skipped ${wet}, other-road / pad samples skipped ${otherSkipped}`);
check(flatBad === 0, 'platform: ground equals the road surface across the whole width', `worst ${flatWorst.toFixed(3)} m, bad ${flatBad}`);
check(envBad === 0, 'beyond the platform: ground inside the envelope (fill 1:3 below, cut up to 4:1 above)', `worst outside ${envWorst.toFixed(2)} m, bad ${envBad}${envAt.length ? ' | ' + envAt.join(' | ') : ''}`);
console.log(`  info  rock-cut face samples steeper than 1:2 (made by the cut, natural ground is not): ${rock}`);
check(steepBad === 0, 'no wall: the cut face is never steeper than 4:1 (76 deg) except natural ground', `worst excess ${steepWorst.toFixed(2)}, bad ${steepBad}${wallSt.length ? ' at stations ' + wallSt.join(' ') : ''}`);
check(wall === 0, 'last offset (250 m) is natural ground again', `worst ${wallWorst.toFixed(1)} m, walls ${wall}${wallAt.length ? ': ' + wallAt.join('; ') : ''}`);
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(fails ? 1 : 0);

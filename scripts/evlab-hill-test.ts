// EVLab Step RT4: the hill palms (outside the fence, on the gentle parts of the hill behind the plot; only coconut / palm / date palm).   npx tsx scripts/evlab-hill-test.ts
// The tree placer adds road / rail / water / city exclusions (ok) in the game; here the ground is the plain natural terrain, so those are not tested (and count a little high).
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { GARDEN_KINDS } from '../src/evlab/EVLabGarden';
import { HILL_MAX_SLOPE, HILL_MIN_OUT, HILL_MIN_REL, HILL_REACH, HILL_TOP, evlabHillTreesInChunk, hillSide, type HillTree } from '../src/evlab/EVLabHill';
import { EVLAB_ORIGIN, EVLAB_PLOT, EVLAB_PARKING_STRIP, worldToLocal } from '../src/evlab/EVLabSite';
let fails = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const gen = new TerrainGenerator(Config.world.seed), fy = gen.evlab.floorY;
const a = { h: 0, water: NaN, fx: 0, fz: 0 }, b = { h: 0, water: NaN, fx: 0, fz: 0 }, c = { h: 0, water: NaN, fx: 0, fz: 0 };
const probe = (x: number, z: number) => { gen.sample(x, z, a); gen.sample(x + 2, z, b); gen.sample(x, z + 2, c); return { h: a.h, slope: Math.hypot(b.h - a.h, c.h - a.h) / 2, ok: true }; };
const R = 330, X0 = EVLAB_ORIGIN.x - R, Z0 = EVLAB_ORIGIN.z - R, SZ = 2 * R;
let t0 = Date.now();
const T: HillTree[] = evlabHillTreesInChunk(fy, X0, Z0, SZ, probe);
console.log(`hill palms ${T.length} in ${Date.now() - t0} ms; on the slope (${HILL_MIN_REL}..${HILL_TOP} m above the floor) ${T.filter((t) => t.h - fy < HILL_TOP).length}, on the hill top (>= ${HILL_TOP} m) ${T.filter((t) => t.h - fy >= HILL_TOP).length}`);
ok(T.length > 50 && T.length < 4000, `a sensible number of palms (${T.length})`);
ok(T.every((t) => Object.values(GARDEN_KINDS).includes(t.kind as 11 | 12 | 13)), 'ONLY coconut (11), date palm (12) and palm (13) trees');
ok(T.every((t) => t.scale >= 1.0 && t.scale <= 1.45 + 1e-9), 'big trees (scale 1.0 .. 1.45)');
ok(T.every((t) => { const [lx, lz] = worldToLocal(t.x, t.z); const s = hillSide(lx, lz); return s.hillSide && s.out >= HILL_MIN_OUT && s.out <= HILL_REACH; }), `every palm is on the hill side (north / east), ${HILL_MIN_OUT}..${HILL_REACH} m outside the plot + car park strip`);
ok(T.every((t) => { const [lx, lz] = worldToLocal(t.x, t.z); return !(lx >= EVLAB_PLOT.x0 - 5 && lx <= EVLAB_PARKING_STRIP.x1 + 5 && lz >= EVLAB_PLOT.z0 - 5 && lz <= EVLAB_PLOT.z1 + 5); }), 'no palm inside the fence / strip (the flat garden is EVLabGarden)');
ok(T.every((t) => t.h - fy >= HILL_MIN_REL - 1e-9 && t.slope <= HILL_MAX_SLOPE + 1e-9), `only on real hill ground (>= ${HILL_MIN_REL} m above the floor) and never steeper than ${HILL_MAX_SLOPE}`);
ok(T.some((t) => t.h - fy >= HILL_TOP), 'there are palms on the hill top too');
// chunk independence: 4 quarters give exactly the same trees as the whole square
const half = SZ / 2, parts: HillTree[] = [];
for (const [dx, dz] of [[0, 0], [half, 0], [0, half], [half, half]]) parts.push(...evlabHillTreesInChunk(fy, X0 + dx, Z0 + dz, half, probe));
const key = (t: HillTree) => `${t.x.toFixed(4)},${t.z.toFixed(4)},${t.kind}`;
ok(parts.length === T.length && new Set(parts.map(key)).size === T.length && T.every((t) => parts.some((p) => key(p) === key(t))), 'the trees do not depend on the chunk grid (4 quarters = the whole square)');
// deterministic
ok(evlabHillTreesInChunk(fy, X0, Z0, SZ, probe).length === T.length, 'deterministic (a second run gives the same count)');
// blocked ground (roads, water, city) gives nothing
ok(evlabHillTreesInChunk(fy, X0, Z0, SZ, (x, z) => ({ ...probe(x, z), ok: false })).length === 0, 'where the placer says "not ok" (road / rail / water / city) no palm is planted');
console.log(fails ? 'FAILED ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);

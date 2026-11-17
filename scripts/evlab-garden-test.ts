// EVLab Step RT3: the new garden (hill side only; only big coconut / palm / date palm trees).   npx tsx scripts/evlab-garden-test.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { GARDEN_BANDS, GARDEN_KINDS, GARDEN_MIN_GAP, gardenTrees } from '../src/evlab/EVLabGarden';
import { evlabParkTreesInChunk } from '../src/evlab/EVLabParkTrees';
import { inLake, parkTrees, OLD_GARDEN, ROAD_RECTS } from '../src/evlab/EVLabCampus';
import { inParkingZone } from '../src/evlab/EVLabParking';
import { EVLAB_ORIGIN, EVLAB_PLOT, insideFence, localToWorld } from '../src/evlab/EVLabSite';
let fails = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const T = gardenTrees(), P = EVLAB_PLOT;
console.log('garden trees', T.length);
ok(T.length >= 150 && T.length <= 400, `a big garden, not a forest (${T.length} trees)`);
ok(!OLD_GARDEN, 'the old garden is off');
ok(T.every((t) => Object.values(GARDEN_KINDS).includes(t.kind as 11 | 12 | 13)), 'ONLY coconut (11), date palm (12) and palm (13) trees');
const count = (k: number) => T.filter((t) => t.kind === k).length;
ok(count(11) > 0 && count(12) > 0 && count(13) > 0, `all three kinds are there (coconut ${count(11)}, date palm ${count(12)}, palm ${count(13)})`);
ok(T.every((t) => t.scale >= 1.0 && t.scale <= 1.5), 'big trees (scale 1.0 .. 1.5)');
const inBand = (t: { x: number; z: number }) => (t.x >= GARDEN_BANDS.north.x0 && t.x <= GARDEN_BANDS.north.x1 && t.z >= GARDEN_BANDS.north.z0 && t.z <= GARDEN_BANDS.north.z1) || (t.x >= GARDEN_BANDS.east.x0 && t.x <= GARDEN_BANDS.east.x1 && t.z >= GARDEN_BANDS.east.z0 && t.z <= GARDEN_BANDS.east.z1);
ok(T.every(inBand), 'every tree is in the north band (behind the lake) or the east band (hill side only)');
ok(T.every((t) => t.z <= -91 || t.x >= 152), 'nothing on the flat south / west sides');
ok(T.every((t) => insideFence(...localToWorld(t.x, t.z))) && T.every((t) => t.x > P.x0 + 2 && t.x < P.x1 - 2 && t.z > P.z0 + 2), 'every tree is inside the fence (world check)');
ok(T.every((t) => !inLake(t.x, t.z, 6)), 'no tree in the lake or within 6 m of its bank');
ok(T.every((t) => !inParkingZone(t.x, t.z, 6)), 'no tree on / within 6 m of the car park and its entry road');
ok(T.every((t) => !ROAD_RECTS.some((q) => t.x > q[0] - 6 && t.x < q[1] + 6 && t.z > q[2] - 6 && t.z < q[3] + 6)), 'no tree on / within 6 m of a bridge or link road');
let minGap = 1e9; for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) minGap = Math.min(minGap, Math.hypot(T[i].x - T[j].x, T[i].z - T[j].z));
ok(minGap >= GARDEN_MIN_GAP - 1e-9, `trees keep ${GARDEN_MIN_GAP} m apart (closest ${minGap.toFixed(1)} m)`);
// level ground under the garden (the pad), so the tree base = floorY
const gen = new TerrainGenerator(Config.world.seed), fy = gen.evlab.floorY;
let worst = 0; for (const t of T) { const [x, z] = localToWorld(t.x, t.z); worst = Math.max(worst, Math.abs(gen.heightAt(x, z) - (fy - 0.03))); }
ok(worst < 1.0, `the ground under every garden tree is level with the floor (worst ${worst.toFixed(2)} m off)`);
// planted: the chunk list gives exactly these trees (and none of the old garden)
let planted = 0; const S = Config.world.chunkSize;
for (let ox = EVLAB_ORIGIN.x - 320; ox <= EVLAB_ORIGIN.x + 320; ox += S) for (let oz = EVLAB_ORIGIN.z - 320; oz <= EVLAB_ORIGIN.z + 320; oz += S) for (const e of evlabParkTreesInChunk(fy, ox, oz)) { ok(e.kind >= 11 && e.kind <= 13, `chunk list kind ${e.kind} is a palm kind`); planted += e.v.length / 6; }
ok(planted === T.length, `chunk planting gives exactly the garden (${planted} of ${T.length})`);
ok(parkTrees().length > 100, 'the old list (kept only for bench / route avoidance) is not planted');
console.log(fails ? 'FAILED ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);

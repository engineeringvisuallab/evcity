// EVLab Step 13: lake water (wave table, ripples, sun, shader / material wiring). npx tsx scripts/evlab-lake-test.ts
import * as THREE from 'three';
import { BRIDGES, ISLAND, LAKE, WATER_Y, inLake } from '../src/evlab/EVLabCampus';
import { LAKE_WAVES, RIPPLE, WAVES_AT, buildLakeWater, lakeSlope, rippleSlope, shoreDist, sunFromHours } from '../src/evlab/EVLabLakeWater';
import { PRESETS } from '../src/core/Quality';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// waves: gentle, finite, moving, more detail = more waves
let maxS = 0, finite = true, moved = false;
for (let i = 0; i < 4000; i++) {
  const x = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 350, z = (Math.sin(i * 78.233) * 43758.5453 % 1) * 360;
  for (const d of [0, 1, 2] as const) {
    const [sx, sz] = lakeSlope(x, z, 3.7, d);
    if (!Number.isFinite(sx) || !Number.isFinite(sz)) finite = false;
    maxS = Math.max(maxS, Math.hypot(sx, sz));
  }
  const a = lakeSlope(x, z, 0, 2), b = lakeSlope(x, z, 1.3, 2);
  if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 1e-4) moved = true;
}
ok(finite, 'wave slopes are finite');
ok(maxS < 0.2, `slopes stay gentle (max ${maxS.toFixed(3)} < 0.2): a calm lake, normals never flip`);
ok(moved, 'the surface moves with time');
ok(WAVES_AT[0] === 2 && WAVES_AT[1] === 4 && WAVES_AT[2] === 5 && WAVES_AT[2] === LAKE_WAVES.length, 'detail 0 / 1 / 2 = 2 / 4 / 5 waves');
ok(LAKE_WAVES.every((w, i) => i === 0 || w.len < LAKE_WAVES[i - 1].len), 'wavelengths go from long swell to short chop');
const rms = (d: 0 | 1 | 2): number => { let s = 0, n = 0; for (let x = -50; x < 50; x += 3) for (let z = -50; z < 50; z += 3) { const [a, b] = lakeSlope(x, z, 1, d); s += a * a + b * b; n++; } return Math.sqrt(s / n); };
ok(rms(2) > rms(1) && rms(1) > rms(0), `more detail = more small-scale slope (${rms(0).toFixed(3)} < ${rms(1).toFixed(3)} < ${rms(2).toFixed(3)})`);

// shore distance and ripples
ok(Math.abs(shoreDist(0, ISLAND.cz - ISLAND.hz - 10) - 10) < 0.01 || shoreDist(0, ISLAND.cz - ISLAND.hz - 10) > 0, 'a point 10 m off the quay is in the water (shore distance > 0)');
ok(shoreDist(0, 38.5) < 0, 'the island is not water');
const mid = ISLAND.cz + ISLAND.hz + 25; // middle of the south band
ok(inLake(0, mid) && Math.abs(shoreDist(0, mid) - 25) < 1e-6, 'shore distance = distance to the nearest edge (25 m in the middle of the band)');
ok(rippleSlope(0, 1) === 0 && rippleSlope(-3, 1) === 0, 'no ripple on land / at the wall itself');
let r1 = 0, r20 = 0; for (let t = 0; t < 6.3; t += 0.05) { r1 = Math.max(r1, Math.abs(rippleSlope(1.5, t))); r20 = Math.max(r20, Math.abs(rippleSlope(20, t))); }
ok(r1 > 0.05 && r1 <= RIPPLE.slope && r20 < 0.01, `ripples are strong at the quay (${r1.toFixed(3)}) and die out (${r20.toFixed(4)} at 20 m)`);
ok(rippleSlope(2, 0) !== rippleSlope(2, 0.6), 'ripple rings travel (change with time)');

// sun
const noon = sunFromHours(12), dawn = sunFromHours(6.6), dusk = sunFromHours(17.4), night = sunFromHours(0);
ok(noon.dir[1] > 0.95 && noon.power === 1, 'noon: sun high, full glint');
ok(dawn.dir[0] > 0.5 && dusk.dir[0] < -0.5 && dawn.dir[1] > 0 && dusk.dir[1] > 0, 'morning sun in the east, evening sun in the west');
ok(night.power < 0.3 && night.dir[1] > 0, 'night: a dim moon glint');
ok([0, 3, 6, 6.05, 9, 12, 15, 17.95, 18, 21, 23.9, 30, -2].every((h) => { const s = sunFromHours(h); return Math.abs(Math.hypot(...s.dir) - 1) < 1e-9 && s.power >= 0 && s.power <= 1; }), 'sun direction is a unit vector, power 0..1, for every hour');

// quality tiers
ok(PRESETS.low.evlabWater === 0 && PRESETS.medium.evlabWater === 1 && PRESETS.high.evlabWater === 2, 'Q.evlabWater: low 0, medium 1, high 2');

// material
const lake = buildLakeWater();
const u = lake.material.uniforms;
const decl = [...lake.material.fragmentShader.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1]);
ok(decl.filter((n) => n.startsWith('u')).every((n) => n in u), `every uniform of the shader is set (${decl.filter((n) => n.startsWith('u')).join(', ')})`);
ok(lake.material.transparent && lake.material.fog === true, 'transparent and fogged (the game uses FogExp2)');
const geo = lake.mesh.geometry as THREE.BufferGeometry;
geo.computeBoundingBox();
const bb = geo.boundingBox!;
ok(Math.abs(bb.min.y - WATER_Y) < 1e-6 && Math.abs(bb.max.y - WATER_Y) < 1e-6, `flat at the water level (${WATER_Y} m)`);
ok(Math.abs(bb.min.x - (LAKE.cx - LAKE.hx)) < 1e-6 && Math.abs(bb.max.z - (LAKE.cz + LAKE.hz)) < 1e-6, 'covers the lake rectangle, vertices in building coordinates');
ok(geo.getAttribute('position').count === 4, 'one quad (4 vertices): no vertex work');
const nrm = geo.getAttribute('normal'); ok(nrm.getY(0) > 0.99, 'faces up');
ok((u.uBr.value as THREE.Vector4[]).length === BRIDGES.length && (u.uBr.value as THREE.Vector4[]).every((v) => v.z > 0 && v.w > 0), 'one rectangle per bridge');
const fs = lake.material.fragmentShader;
ok((fs.match(/{/g) ?? []).length === (fs.match(/}/g) ?? []).length && (fs.match(/\(/g) ?? []).length === (fs.match(/\)/g) ?? []).length, 'shader: braces and parentheses balance');
ok(LAKE_WAVES.every((w) => fs.includes((2 * Math.PI / w.len).toFixed(5))), 'shader carries every wave of the JS table');
ok(fs.includes('fog_fragment') && fs.includes('colorspace_fragment') && lake.material.vertexShader.includes('fog_vertex'), 'fog and colour space chunks are included');
lake.setNight(0.5); lake.setDetail(2); lake.setSun(15); lake.update(12.5);
ok(u.uNight.value === 0.5 && u.uDetail.value === 2 && u.uTime.value === 12.5 && (u.uSun.value as THREE.Vector3).y > 0, 'setNight / setDetail / update / setSun reach the uniforms');
lake.setDetail(7); ok(u.uDetail.value === 2, 'detail is clamped to 0..2');
lake.setDetail(-3); ok(u.uDetail.value === 0, 'detail is clamped to 0..2 (low end)');
lake.dispose();

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);

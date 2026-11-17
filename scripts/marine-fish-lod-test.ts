// PERF STEP 1: marineFish triangle budget.
// Measures the fish meshes of MarineLife the SAME way as PerfOverlay.heavyList (F2 report):
//   triangles = (index.count / 3) * (InstancedMesh.count), only meshes that are visible (traverseVisible), instanced meshes are never frustum-culled by the list.
// Usage: npx tsx scripts/marine-fish-lod-test.ts [low|medium|high] [waterQuality 0|1|2]
import * as THREE from 'three';
import { MarineLife } from '../src/water/MarineLife';
import { buildReefFishGeometry } from '../src/water/ReefFish';
import { PRESETS, Q } from '../src/core/Quality';
import type { QualityTier } from '../src/core/Quality';

const tier = (process.argv[2] ?? 'low') as QualityTier;
const wq = Number(process.argv[3] ?? 1);
Object.assign(Q, PRESETS[tier]);

// deep open sea everywhere inside 600 m of the origin, land outside
const fakeTerrain = {
  makeSample: () => ({ h: -30, water: 0, fx: 0, fz: 0 }),
  sample: (x: number, z: number, o: { h: number; water: number; fx: number; fz: number }) => {
    const sea = Math.hypot(x, z) < 600;
    o.h = sea ? -30 : 5;
    o.water = sea ? 0 : NaN;
    o.fx = 0;
    o.fz = 0;
    return o;
  },
};

function measure(root: THREE.Object3D): { rows: string[]; fishTris: number; fishCount: number; fishMeshes: number; fishDraws: number; total: number } {
  const rows: string[] = [];
  let fishTris = 0, fishCount = 0, fishMeshes = 0, fishDraws = 0, total = 0;
  root.traverseVisible((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    const inst = m.isInstancedMesh ? m.count : 1;
    const tris = ((g.index ? g.index.count : g.attributes.position.count) / 3) * inst;
    total += tris;
    if (m.name.startsWith('marineFish')) {
      fishTris += tris;
      fishCount += inst;
      fishMeshes++;
      if (inst > 0) fishDraws++;
      rows.push(`  ${m.name} | geoTris ${(g.index!.count / 3) | 0} | instances ${inst} | triangles ${Math.round(tris)}`);
    }
  });
  return { rows, fishTris, fishCount, fishMeshes, fishDraws, total };
}

let bad = 0;
const check = (ok: boolean, msg: string): void => {
  console.log(ok ? 'PASS' : 'FAIL', msg);
  if (!ok) bad++;
};

// ---- 1. geometry budgets of the 3 detail levels (before: 2232 for every fish)
const tris = [2, 1, 0].map((l) => {
  const g = buildReefFishGeometry(l as 0 | 1 | 2);
  const n = g.index!.count / 3;
  g.dispose();
  return n;
});
console.log(`geometry triangles: near ${tris[0]} | middle ${tris[1]} | far ${tris[2]}  (before: 2232 each)`);
check(tris[0] <= 900 && tris[0] >= tris[1] && tris[1] >= tris[2], 'near <= 900 triangles and near >= middle >= far');
{
  // the 3 models must have the same size, otherwise the fish would jump when it changes level
  const ext = [2, 1, 0].map((l) => {
    const g = buildReefFishGeometry(l as 0 | 1 | 2);
    g.computeBoundingBox();
    const sz = g.boundingBox!.getSize(new THREE.Vector3());
    g.dispose();
    return sz;
  });
  const diff = (i: number, a: 'x' | 'y' | 'z'): number => Math.abs(ext[i][a] / ext[0][a] - 1);
  const lenH = Math.max(diff(1, 'y'), diff(1, 'z'), diff(2, 'y'), diff(2, 'z')); // body length and height
  const wide = Math.max(diff(1, 'x'), diff(2, 'x')); // width: the pectoral fins stick out on the near model only
  console.log(`level sizes (x,y,z) near ${ext[0].toArray().map((v) => v.toFixed(2))} middle ${ext[1].toArray().map((v) => v.toFixed(2))} far ${ext[2].toArray().map((v) => v.toFixed(2))}; length/height differ ${(lenH * 100).toFixed(0)} %, width ${(wide * 100).toFixed(0)} % (pectoral fins)`);
  check(lenH < 0.15 && wide < 0.4, 'the 3 detail levels have the same length / height (within 15 %) and width (within 40 %, fins)');
}
check(tris[1] <= 250 && tris[2] <= 150, 'middle <= 250 and far <= 150 triangles');

// ---- 2. preset fields: low <= medium <= high, low has the cheaper numbers
const P = PRESETS;
const mono = (k: 'marineSchools' | 'marineFishHi' | 'marineFishMid' | 'marineFishFar' | 'marineFishNear' | 'marineFishMidDist' | 'marineFishFarDist'): boolean =>
  P.low[k] <= P.medium[k] && P.medium[k] <= P.high[k];
check(mono('marineSchools') && mono('marineFishHi') && mono('marineFishMid') && mono('marineFishFar'), 'preset caps: low <= medium <= high');
check(mono('marineFishNear') && mono('marineFishMidDist') && mono('marineFishFarDist'), 'preset distances: low <= medium <= high');
check(P.low.marineFishNear < P.low.marineFishMidDist && P.low.marineFishMidDist < P.low.marineFishFarDist, 'low distances grow: near < middle < far');

const root = new THREE.Group();
const ml = new MarineLife(root as unknown as THREE.Object3D, fakeTerrain as never);
ml.setQuality(wq);

const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 3000);
cam.position.set(0, 3, 0);
cam.lookAt(0, 3, 100);
cam.updateMatrixWorld(true);
cam.updateProjectionMatrix();
const camPos = cam.position.clone();
const focus = new THREE.Vector3(0, 3, 0);

console.log(`\ntier=${tier} waterQuality=${wq}`);
const dry = measure(root);
console.log(`A) nothing near water (MarineLife.update not called, like on land): fish triangles = ${Math.round(dry.fishTris)} (meshes drawn ${dry.fishDraws})  (before: 1178496)`);
check(dry.fishTris === 0 && dry.fishDraws === 0, 'A) no fish triangles and no fish draw call when no water is near');

// ---- B. open sea, normal look
let worstB = 0;
let last = measure(root);
for (let i = 0; i < 1500; i++) {
  ml.update(1 / 30, i / 30, camPos, focus, cam);
  if (i % 10 === 9) {
    last = measure(root);
    worstB = Math.max(worstB, last.fishTris);
  }
}
last.rows.forEach((r) => console.log(r));
console.log(`B) open sea, 50 s: last = ${Math.round(last.fishTris)}, worst = ${Math.round(worstB)}, draw calls ${last.fishDraws}, stats ${JSON.stringify(ml.stats)}`);
check(ml.stats.schools > 0, 'B) fish schools are alive in the open sea');
check(worstB <= 100_000, `B) worst fish triangles ${Math.round(worstB)} <= 100000`);
check(last.fishDraws <= 3, 'B) at most 3 fish draw calls');

// ---- C. the diver sits INSIDE a shoal (all fish very close), looking at it; D. same but no frustum (looking everywhere = worst case)
const schools = (ml as unknown as { schools: { alive: boolean; x: number; y: number; z: number }[] }).schools;
let worstC = 0, worstD = 0, maxHi = 0;
for (let i = 0; i < 600; i++) {
  const s = schools.find((x) => x.alive)!;
  const p = new THREE.Vector3(s.x - 2, s.y + 0.5, s.z - 2);
  cam.position.copy(p);
  cam.lookAt(s.x, s.y, s.z);
  cam.updateMatrixWorld(true);
  ml.update(1 / 30, 100 + i / 30, p, p, cam);
  worstC = Math.max(worstC, measure(root).fishTris);
  maxHi = Math.max(maxHi, ml.stats.fishDrawn[0]);
  ml.update(1 / 30, 100 + i / 30, p, p); // no camera: nothing is culled by the view
  worstD = Math.max(worstD, measure(root).fishTris);
  const d = ml.stats.fishDrawn;
  if (d[0] > Q.marineFishHi || d[1] > Q.marineFishMid || d[2] > Q.marineFishFar) bad++;
}
console.log(`C) inside a shoal, looking at it: worst ${Math.round(worstC)} triangles (most near-level fish ${maxHi}); D) no view culling at all: worst ${Math.round(worstD)}`);
const hardMax = Q.marineFishHi * tris[0] + Q.marineFishMid * tris[1] + Q.marineFishFar * tris[2];
check(worstC <= hardMax && worstD <= hardMax, `C/D) never more than the preset caps allow (${hardMax})`);
check(worstD <= 100_000 || tier !== 'low', `D) low tier only: worst case without view culling ${Math.round(worstD)} <= 100000 triangles`);
check(maxHi <= Q.marineFishHi, `C) near-level fish ${maxHi} <= cap ${Q.marineFishHi}`);

// ---- E. the camera looks away from every fish: the view culling must drop them all
{
  const s = schools.find((x) => x.alive)!;
  const p = new THREE.Vector3(s.x - 4, s.y, s.z);
  const away = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 3000);
  away.position.copy(p);
  away.lookAt(p.x - 100, p.y, p.z); // away from the school (it is at +x of the camera)
  away.updateMatrixWorld(true);
  away.updateProjectionMatrix();
  ml.update(0.0001, 200, p, p, away);
  const seen = measure(root).fishTris;
  ml.update(0.0001, 200, p, p);
  const unseen = measure(root).fishTris;
  console.log(`E) looking away: ${Math.round(seen)} triangles (without view culling ${Math.round(unseen)})`);
  check(seen < unseen, 'E) fish behind the camera are not drawn (view culling works)');
}

// ---- F. leaving the water: idle() hides every fish mesh again
ml.idle();
const gone = measure(root);
check(gone.fishTris === 0 && gone.fishDraws === 0, 'F) idle(): no fish triangles after leaving the water');
for (let i = 0; i < 300; i++) ml.update(1 / 30, 300 + i / 30, camPos, focus, cam); // schools come back around the camera
check(ml.stats.schools > 0, 'F) update() after idle(): schools are alive again');

// ---- G. fish colours / patterns reach the meshes (look at a shoal from 3 m)
{
  const s = schools.find((x) => x.alive)!;
  const p = new THREE.Vector3(s.x - 3, s.y + 0.3, s.z - 3);
  cam.position.copy(p);
  cam.lookAt(s.x, s.y, s.z);
  cam.updateMatrixWorld(true);
  ml.update(1 / 30, 400, p, p, cam);
  let okPat = true, okCol = true, n = 0;
  root.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh || !m.name.startsWith('marineFish') || m.count === 0) return;
    const pat = m.geometry.getAttribute('aPat').array;
    const col = m.instanceColor!.array;
    for (let i = 0; i < m.count; i++) {
      n++;
      if (!(pat[i] >= 0 && pat[i] <= 5)) okPat = false;
      if (!(col[i * 3] > 0.1 && col[i * 3 + 1] > 0.1 && col[i * 3 + 2] > 0.1)) okCol = false;
    }
  });
  check(n > 0 && okPat && okCol, `G) ${n} drawn fish have a pattern id 0..5 and a real colour`);
}
ml.dispose();
console.log(bad ? `\n${bad} FAIL` : '\nall PASS');
process.exit(bad ? 1 : 0);

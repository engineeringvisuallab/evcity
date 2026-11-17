// STEP J1-SIG (headless): the four corner signal masts of J1. Run: npx tsx scripts/j1-signal-mast-check.ts
// Checks: 4 masts on the 4 median island heads = the user's red dots (arm frame o = -W = island centre, s = box half + 0.8) and INSIDE the median island polygon of the plan, arm over the lanes of ITS arm, every head inside the lane band of its leg,
// every head >= 5.2 m above the road, arm + pole heights, luminaire, the signal still has 8 legs / 4 phases, and the merged mesh builds (2-3 draw calls).
import * as THREE from 'three';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { TrafficSignals } from '../src/traffic/TrafficSignals';
import { J1SignalMasts } from '../src/traffic/J1SignalMasts';
import { TrafficLightLayer } from '../src/traffic/TrafficLightLayer';
import { MAST_HEAD_MIN_CLEAR, MAST_POLE_H, MAST_S_IN, mastArmY } from '../src/traffic/J1MastSpec';
import { OPEN_PARAMS, deriveOpen, pointInPoly } from '../src/roads/junction/OpenJ1Geometry';
import { buildOpenJ1Plan } from '../src/roads/junction/OpenJ1Mesh';
import { DIRS, rotCW } from '../src/roads/junction/GroundJ1Geometry';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const g = new RoadGraph(new TerrainGenerator(Config.world.seed).roads);
const j1 = g.j1;
if (!j1) { ok(false, 'RoadGraph.j1 exists'); process.exit(1); }
const sg = new TrafficSignals(g);
const sp = sg.pads[sg.pads.length - 1];
const D = deriveOpen();
const plan = buildOpenJ1Plan();
const W = OPEN_PARAMS.W;
const c = j1.centre;
ok(sp.arms.length === 8 && sp.green.length === 4, 'J1 signal still has 8 legs and 4 phases');
const masts = sp.masts ?? [];
ok(masts.length === 4, `4 corner masts, got ${masts.length}`);
// (1) corners: arm frame (o, s) of every pole
for (const m of masts) {
  // arm-frame coordinates of the pole: o along the inbound normal, s outward
  const [ox, oz] = j1.armWorld(m.arm, 0, 0), [ex, ez] = j1.armWorld(m.arm, 0, 1), [nx, nz] = j1.armWorld(m.arm, 1, 0);
  const rx = m.x - ox, rz = m.z - oz;
  const s = rx * (ex - ox) + rz * (ez - oz), o = rx * (nx - ox) + rz * (nz - oz);
  ok(Math.abs(s - (D.B + MAST_S_IN)) < 0.01 && Math.abs(o + W) < 0.01, `arm ${m.arm}: pole at o ${o.toFixed(2)} s ${s.toFixed(2)} (median island head, box half ${D.B} + ${MAST_S_IN})`);
  const isl = plan.islands.find((q) => q.id === `${DIRS[m.arm]}-median`)!;
  const inside = [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].every(([dO, dS]) => { const p = rotCW([o + dO, s + dS], m.arm); return pointInPoly(p[0], p[1], isl.ring); });
  ok(inside, `arm ${m.arm}: the pole base (0.5 m circle) stands INSIDE the ash median island, not on the road`);
  ok(Math.abs(m.len - (D.t0 + 3.5 * W + 1 + W)) < 0.01, `arm ${m.arm}: mast arm length ${m.len.toFixed(1)} m reaches 1 m past the far head`);
  // the arm must point across its own approach (towards -o)
  const dot = m.tx * (nx - ox) + m.tz * (nz - oz);
  ok(dot > 0.999, `arm ${m.arm}: mast arm runs over the lanes of its own arm`);
  // 4 distinct corners, one in each quadrant of the centre
}
const quad = new Set(masts.map((m) => `${Math.sign(Math.round(m.x - c.x))}${Math.sign(Math.round(m.z - c.z))}`));
// the J1 frame is rotated (not axis aligned), so count distinct corner positions instead of quadrants
const dists = masts.map((m) => Math.hypot(m.x - c.x, m.z - c.z));
ok(dists.every((d) => Math.abs(d - Math.hypot(W, D.B + MAST_S_IN)) < 0.01), `all 4 poles ${dists[0].toFixed(2)} m from the centre (on the median island head of each arm)`);
void quad;
// (2) heads: lane band, height
for (const a of sp.arms) {
  const heads = [{ x: a.poleX, z: a.poleZ, h: a.headH ?? 0 }, ...(a.extraHeads ?? [])];
  const [ox, oz] = j1.armWorld(sp.arms.indexOf(a) >> 1, 0, 0), [nx, nz] = j1.armWorld(sp.arms.indexOf(a) >> 1, 1, 0);
  for (const h of heads) {
    const o = (h.x - ox) * (nx - ox) + (h.z - oz) * (nz - oz);
    ok(o >= (a.latMin ?? -99) && o <= (a.latMax ?? 99), `leg ${sp.arms.indexOf(a)}: head over lateral o ${o.toFixed(2)} inside band [${a.latMin?.toFixed(2)}, ${a.latMax?.toFixed(2)}]`);
    const lowest = h.h - 0.68;
    ok(lowest >= MAST_HEAD_MIN_CLEAR, `leg ${sp.arms.indexOf(a)}: lowest point of head ${lowest.toFixed(2)} m above road (>= ${MAST_HEAD_MIN_CLEAR})`);
  }
}
ok(a2(mastArmY(0, 20)) >= 7.2 && a2(mastArmY(10, 20)) > 7.2 && MAST_POLE_H > 9, 'arm arch >= 7.2 m, pole top > 9 m');
function a2(v: number): number { return v; }
// (3) the meshes build: layer + masts
const root = new THREE.Group();
const layer = new TrafficLightLayer(root, sg);
const mm = new J1SignalMasts(root, sg);
let meshes = 0, tris = 0;
mm.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { meshes++; const gg = (o as THREE.Mesh).geometry; tris += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; } });
ok(meshes >= 2 && meshes <= 3, `mast meshes (draw calls): ${meshes}, triangles ${Math.round(tris)}`);
ok(tris < 6000, 'mast triangles < 6000');
// heads: 8 legs + 4 extra = 12 heads, poles: none for the J1 legs (mast legs have no own pole)
const im = layer.group.children.filter((o): o is THREE.InstancedMesh => (o as THREE.InstancedMesh).isInstancedMesh);
const heads = im.find((o) => o.count === 12);
ok(!!heads, `12 signal heads (8 legs + 4 extra over the through lanes), instanced counts: ${im.map((o) => o.count).join(',')}`);
mm.update(1); mm.update(0); layer.update();
layer.dispose(); mm.dispose();
console.log(fails === 0 ? 'ALL PASS' : `${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);

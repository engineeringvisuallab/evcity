// EVLab Tower: the campus around the building. Building-local coordinates (see EVLabLayout / EVLabCampus).
//  - the lake that rings the island (water plane; the lake bed itself is carved into the terrain, see EVLabSite.height)
//  - the island: quay wall + coping, ring road, stone plaza with fountains, flagpoles, lamps
//  - four bridges (EVLabBridges), the entrance avenue to the F6 highway, and the lake fountains (EVLabFountains)
// Trees are NOT made here any more: the park trees are normal game trees (palms, krishnachura, sal, koroi ...), see EVLabParkTrees.
import * as THREE from 'three';
import { BLD, type Solid } from './EVLabLayout';
import { FOUNTAINS, ISLAND, PLAZA, RING, ROAD_RECTS, contour } from './EVLabCampus';
import { buildBridges } from './EVLabBridges';
import { buildFountains } from './EVLabFountains';
import { buildLakeWater } from './EVLabLakeWater';
import { buildParkingLot } from './EVLabParkingLot';
import { buildCycleRack } from './EVLabCycleRackMesh';
import { buildBenches } from './EVLabBenchMesh';
import type { Obb } from './EVLabTowerLayout';
import { asphaltTexture, roadStrip, runsOf, wallStrip } from './EVLabRoads';
import type { Parts } from './EVLabParts';

export interface GroundsBuild {
  group: THREE.Group;
  /** Colliders of the bridges (decks and railings), building-local. */
  solids: Solid[];
  /** Step 11: colliders of the benches (boxes turned about y), building-local. */
  obbs: Obb[];
  /** 0 (day) .. 1 (night): the lamps glow. */
  setNight(k: number): void;
  update(t: number): void;
  /** Step 13: clock hour (moves the sun / moon glint on the lake) and water detail 0 / 1 / 2 (Q.evlabWater). */
  setSun(hours: number): void;
  setWaterDetail(d: number): void;
}

/** `ground(x, z)` (optional): height of the real ground above the floor level at a building-local point (only the parking lot's entry road uses it). */
export function buildGrounds(P: Parts, ground?: (x: number, z: number) => number): GroundsBuild {
  const { k, t } = P;
  const g = new THREE.Group();
  g.name = 'EVLabGrounds';
  const y = 0.05; // just above the levelled terrain
  const zs = BLD.hz + 2; // plaza starts at the portal canopy line
  const stone = P.lit(t.stone, 0xffffff, 0.15), marble = P.lit(t.marbleCream, 0xffffff, 0.3);
  const road = k.own(new THREE.MeshPhongMaterial({ map: asphaltTexture(k), specular: 0x222222, shininess: 14, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const lampSpots: Array<[number, number]> = [];

  // ---------------------------------------------------------------- the lake: one water plane (the terrain hides it everywhere except in the carved bed)
  // Step 13: waves, fresnel, depth colour and ripples at the quay / bridges in one shader (EVLabLakeWater)
  const lake = buildLakeWater();
  g.add(lake.mesh);

  // ---------------------------------------------------------------- island edge: quay wall + coping (open at the bridge mouths)
  const edge = contour(ISLAND, 0.25, 2);
  edge.push(edge[0]);
  const atMouth = (x: number, z: number): boolean => ROAD_RECTS.some((q) => x > q[0] - 1.5 && x < q[1] + 1.5 && z > q[2] - 1.5 && z < q[3] + 1.5);
  for (const run of runsOf(edge, atMouth)) {
    wallStrip(g, k, run, -2.6, 0.32, stone);
    roadStrip(g, k, run, 0.7, 0.34, marble, 4);
  }

  // ---------------------------------------------------------------- ring road (closed) + the straight roads that lead to the bridges
  const ring = contour(RING, 0, 2);
  ring.push(ring[0]);
  roadStrip(g, k, ring, RING.halfW, y, road);
  const ringLamps = contour(RING, RING.halfW + 1.2, 2);
  for (let i = 0; i < ringLamps.length; i += 12) if (!atMouth(ringLamps[i][0], ringLamps[i][1])) lampSpots.push(ringLamps[i]);
  const cz = ISLAND.cz;
  roadStrip(g, k, [[0, PLAZA.z1], [0, 166]], 12, y, road); // plaza -> ring -> south bridge
  roadStrip(g, k, [[0, 228], [0, 272]], 12, y, road); // avenue from the bridge to the F6 highway
  roadStrip(g, k, [[0, -89], [0, -70]], 8, y, road); // north
  roadStrip(g, k, [[-119, cz], [-100, cz]], 8, y, road); // west
  roadStrip(g, k, [[100, cz], [119, cz]], 8, y, road); // east
  // promenades beyond the three small bridges (paved landings that lead into the park)
  roadStrip(g, k, [[0, -181], [0, -151]], 8, y, road);
  roadStrip(g, k, [[-205, cz], [-181, cz]], 8, y, road);
  roadStrip(g, k, [[181, cz], [205, cz]], 8, y, road);
  for (let z = 236; z < 270; z += 17) for (const x of [-14, 14]) lampSpots.push([x, z]);
  for (let z = 150; z < 166; z += 15) for (const x of [-14, 14]) lampSpots.push([x, z]);

  // ---------------------------------------------------------------- plaza in front of the portal
  P.hplane(g, PLAZA.x0, PLAZA.x1, PLAZA.z0, PLAZA.z1, y, stone, 8, 8);
  P.tbox(g, PLAZA.x0 - 1, PLAZA.x1 + 1, PLAZA.z1, PLAZA.z1 + 1, 0, y + 0.3, marble);
  P.tbox(g, PLAZA.x0 - 1, PLAZA.x0, PLAZA.z0, PLAZA.z1 + 1, 0, y + 0.3, marble);
  P.tbox(g, PLAZA.x1, PLAZA.x1 + 1, PLAZA.z0, PLAZA.z1 + 1, 0, y + 0.3, marble);
  for (let x = -60; x <= 60; x += 20) lampSpots.push([x, zs + 8]);
  for (let x = -60; x <= 60; x += 20) lampSpots.push([x, PLAZA.z1 - 2]);

  // ---------------------------------------------------------------- bridges and fountains
  const bridges = buildBridges(P, road);
  g.add(bridges.group);
  for (const l of bridges.lamps) lampSpots.push(l);
  const fountains = buildFountains(P, FOUNTAINS);
  g.add(fountains.group);
  // the car park east of the lake (beside the east promenade) and its entry road to the F6 highway
  const lot = buildParkingLot(P, road, ground);
  g.add(lot.group);
  for (const l of lot.lamps) lampSpots.push(l);
  // Step 10: the cycle rack on the plaza, east of the portal
  g.add(buildCycleRack(P));
  // Step 11: benches on the plaza, along the island's quay and on the outer bank of the lake (EVLabBenches has the layout)
  const benches = buildBenches(P);
  g.add(benches.group);

  // ---------------------------------------------------------------- lamps (one instanced pole + one lamp ball for all of them)
  const poleGeo = k.own(new THREE.CylinderGeometry(0.1, 0.14, 6, 6)), lampGeo = k.own(new THREE.SphereGeometry(0.4, 8, 6));
  const poleMat = k.own(new THREE.MeshLambertMaterial({ color: 0x23262b }));
  const lampMat = k.own(new THREE.MeshBasicMaterial({ color: 0x555044 }));
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length), lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampSpots.length);
  const o = new THREE.Object3D();
  lampSpots.forEach(([x, z], i) => {
    o.position.set(x, 3, z); o.updateMatrix(); poles.setMatrixAt(i, o.matrix);
    o.position.set(x, 6.2, z); o.updateMatrix(); lamps.setMatrixAt(i, o.matrix);
  });
  poles.frustumCulled = lamps.frustumCulled = false;
  g.add(poles, lamps);

  // ---------------------------------------------------------------- flagpoles in front of the canopy
  const flagMat = k.own(new THREE.MeshLambertMaterial({ color: 0xc0392b, side: THREE.DoubleSide }));
  const flags: THREE.Mesh[] = [];
  [-40, -32, 32, 40].forEach((x, i) => {
    P.cyl(g, 0.12, 0.18, 16, x, y + 8, zs + 14, stone, 6);
    const fl = new THREE.Mesh(k.own(new THREE.PlaneGeometry(4, 2.4)), i % 2 ? flagMat : k.own(new THREE.MeshLambertMaterial({ color: 0x1f5f9a, side: THREE.DoubleSide })));
    fl.position.set(x + 2.1, y + 14.6, zs + 14);
    g.add(fl);
    flags.push(fl);
  });

  const dayLamp = new THREE.Color(0x555044), nightLamp = new THREE.Color(0xffe6a8);
  return {
    group: g,
    solids: bridges.solids,
    obbs: benches.obbs,
    setNight: (n) => { lampMat.color.copy(dayLamp).lerp(nightLamp, n); lake.setNight(n); fountains.setNight(n); },
    setSun: (h) => lake.setSun(h),
    setWaterDetail: (d) => lake.setDetail(d),
    update: (tt) => {
      flags.forEach((f, i) => { f.rotation.y = Math.sin(tt * 2.1 + i) * 0.25; f.scale.x = 0.92 + Math.sin(tt * 3.3 + i * 1.7) * 0.06; });
      lake.update(tt);
      fountains.update(tt);
    },
  };
}

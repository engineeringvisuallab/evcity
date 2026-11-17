import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart, TourStop } from '../../core/types';
import { resolveOptions } from '../../core/options';
import type { SolidShape } from '../../core/solids';
import { createMaterials } from '../../core/materials';
import { Site } from '../../core/Site';
import { makeLabel } from '../../core/Labels';
import { AnimSet, flow } from '../../core/anim';
import { box, cyl, building, pipe, V } from '../../core/prims';

/**
 * MINE LOAD TERMINAL (EVCity Step 2): the level pad + load structure for the MINE_LOAD area inside the mining area (eng-mining).
 * Local frame = world axes (yaw 0): x east, z south. Pad 56 x 40 m. The vehicle bay (MINE_LOAD, local x -6..26, z -14..14) is open;
 * the hopper, chute and loading gantry stand on its west end. Entrance: the east gate of the mining fence (ENGINEERING_GATES).
 */
const NAME = 'Mine Fuel Load Terminal';
export const MINE_PAD = { minX: -28, maxX: 28, minZ: -20, maxZ: 20 };

const LABELS: [string, number, number, number, number?][] = [
  ['Mine load terminal', 0, 12, -17, 1.1],
  ['Mine load area - drive in and stop to load', 10, 3.5, 0, 0.9],
  ['Storage hopper', -19, 9.5, -9, 0.9],
  ['Loading chute', -13, 4.4, -9, 0.7],
  ['Loading gantry', -7, 6.6, 0, 0.8],
  ['Control hut', -20, 4.2, 12, 0.7],
];
const stop = (id: string, partId: string, title: string, text: string, az: number, el: number, dist: number, target: [number, number, number]): TourStop => ({ id, partId, titleBn: title, voiceId: id, text, shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target } });
const TOUR: TourStop[] = [
  stop('intro', 'hopper', 'The mine load terminal', 'This is the mine load terminal. Material from the mine is stored in the hopper, then dropped through the chute into the vehicle waiting in the bay. Drive in from the east gate and stop in the bay to load.', 150, 26, 62, [-4, 2, 0]),
  stop('hopper', 'hopper', '1. Storage hopper', 'The storage hopper is a steel tank with a cone at the bottom. The cone makes the material slide down to the outlet by gravity.', 160, 20, 30, [-19, 4, -9]),
  stop('gantry', 'hopper', '2. Chute and loading gantry', 'A chute takes the material to the loading gantry. A hose hangs from the gantry over the bay, so the vehicle is filled without spilling.', 100, 20, 34, [-8, 3, -3]),
  stop('bay', 'hopper', '3. The loading bay', 'The bay is a concrete slab with yellow edge lines. Drive in from the east and stop inside the lines: the vehicle is loaded while it stands still. A bigger vehicle carries more.', 80, 30, 42, [10, 0, 0]),
  stop('hut', 'hopper', '4. Control hut', 'The operator watches the loading from the control hut. Keep clear of the hopper legs and the gantry columns, they are solid.', 200, 20, 26, [-20, 2, 12]),
  stop('road', 'hopper', '5. Getting out', 'The load is fuel for the Main Station. Take it along the road to the Main Station, stop in the unloading bay, and you are paid a bonus.', 60, 24, 70, [0, 0, 0]),
];

export function createMineLoad(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', MINE_PAD.maxX);
  const mats = createMaterials();
  const site = new Site({ minX: -29, maxX: 29, minZ: -21, maxZ: 21 }, MINE_PAD);
  const anim = new AnimSet();
  const solids: SolidShape[] = [];
  const root = new THREE.Group();
  root.name = 'mineload';
  const group = new THREE.Group();
  group.name = 'hopper';
  root.add(group);
  const parts: InfraPart[] = [{ id: 'hopper', nameBn: 'Hopper and loading gantry', group }];
  root.add(site.buildGround(mats.gravel, opts.skirtDepth, mats.concreteDark));
  box(group, 34, 0.04, 30, mats.concrete, 10, 0.3, 0); // the vehicle bay slab
  for (const z of [-14, 14]) box(group, 34, 0.02, 0.3, mats.yellow, 10, 0.33, z);
  // storage hopper: drum + cone + legs
  cyl(group, 4, 5, mats.steel, -19, 3.2, -9, 24);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(4, 0.8, 2.4, 24), mats.casing);
  cone.position.set(-19, 3.2 - 1.2, -9);
  group.add(cone);
  for (const [lx, lz] of [[-22, -12], [-16, -12], [-22, -6], [-16, -6]]) box(group, 0.4, 3, 0.4, mats.concreteDark, lx, 0.3, lz);
  box(group, 1.2, 0.3, 1.2, mats.steel, -19, 8.2, -9); // roof hatch
  // chute to the gantry (flowing dots show the direction) and a hose that hangs over the bay
  const chute = [V(-19, 2.2, -9), V(-19, 2.2, -4), V(-7, 3.6, 0)];
  pipe(group, chute, 0.3, mats.pipe.sludge);
  pipe(group, [V(-7, 3.6, 0), V(-7, 1.6, 0)], 0.22, mats.pipe.sludge);
  flow(anim, group, [...chute, V(-7, 1.6, 0)], { color: 0xd6b36a, speed: 2.5, spacing: 1.2, size: 0.12 });
  // loading gantry: two columns + beam (west end of the bay, bay stays open to the east)
  for (const z of [-8, 8]) box(group, 0.5, 5.5, 0.5, mats.yellow, -7, 0.3, z);
  box(group, 0.5, 0.5, 16.5, mats.yellow, -7, 5.8, 0);
  // control hut
  building(group, mats, { x: -20, z: 12, w: 5, d: 4, h: 3, door: 'E' });
  // solids: the hopper legs / gantry columns / hut are real; the bay stays free
  const sol = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): void => { solids.push({ kind: 'box', c: [cx, cy, cz], q: [0, 0, 0, 1], h: [hx, hy, hz] }); };
  sol(-19, 4, -9, 4, 4, 4); sol(-7, 3, -8, 0.3, 3, 0.3); sol(-7, 3, 8, 0.3, 3, 0.3); sol(-20, 1.5, 12, 2.5, 1.5, 2);

  const labels = new THREE.Group();
  labels.name = 'labels';
  for (const [text, x, y, z, sc] of LABELS) {
    const tag = makeLabel(text, sc ?? 1);
    tag.position.set(x, y, z);
    labels.add(tag);
  }
  root.add(labels);
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mat = o.material as THREE.Material;
      const fx = o.name === 'fx';
      o.castShadow = !mat.transparent && !fx;
      o.receiveShadow = !fx;
    }
  });
  root.updateWorldMatrix(true, true);
  return {
    id: 'mineload',
    nameBn: NAME,
    category: 'materials',
    narrationLang: 'en',
    root,
    parts,
    tour: TOUR,
    legend: ['sludge'],
    footprint: { width: 58, depth: 42 },
    solids: () => [...solids],
    setLabelsVisible: (v) => { labels.visible = v; },
    update: (dt) => anim.update(dt),
    dispose: () => {
      root.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose(); });
      Object.values(mats.pipe).forEach((m) => m.dispose());
      Object.entries(mats).forEach(([k, m]) => { if (k !== 'pipe') (m as THREE.Material).dispose(); });
      anim.dispose();
    },
  };
}

export const mineLoadDef: InfrastructureDef = { id: 'mineload', nameBn: NAME, category: 'materials', create: (o) => createMineLoad(o) };

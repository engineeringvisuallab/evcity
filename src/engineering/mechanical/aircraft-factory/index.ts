import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, TourStop } from '../../core/types';
import { resolveOptions } from '../../core/options';
import { collectSolids } from '../../core/solids';
import { createMaterials } from '../../core/materials';
import { Site } from '../../core/Site';
import { AnimSet } from '../../core/anim';
import { PAD, SITE } from './layout';
import { buildSiteWorks } from './parts/site';

const stop = (id: string, titleBn: string, text: string, az: number, el: number, dist: number, target: [number, number, number], focus?: TourStop['focus']): TourStop => ({
  id, partId: 'gate', titleBn, voiceId: id, text, shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target }, focus,
});

/** Stage 1: the site only (the factory buildings and the assembly line follow, with their own stops). */
const TOUR: TourStop[] = [
  stop('site', 'The Aircraft Factory Site',
    'This is the site of the aircraft factory, inside the grounds of the old airport. The fence marks the boundary of the factory. The painted lines on the ground show where the buildings and the assembly line will stand. The road at the west gate leads straight to the airport taxiway, so a finished aeroplane can roll out to the runway. The factory itself is still to be built.',
    150, 38, 430, [0, 8, -10]),
  stop('boundary', 'Boundary and Security',
    'A factory needs a clear boundary. A low concrete wall carries a steel fence with two rails, and the posts stand every twelve metres. There are only two gates: the main gate for people and vehicles in the south, and the rollout gate in the west for aeroplanes. Fences keep visitors away from moving machines, protect the aeroplanes under construction, and let the guards watch everyone who comes in.',
    20, 20, 120, [-184, 2, 60], [-188, 0, 20, -180, 4, 100]),
  stop('gate', 'The Main Gate',
    'This is the main gate. Everyone who enters stops here at the gate house, where the guard checks the visitors. Notice the red barrier arm and the big sign. Behind the gate, a straight road leads north to the spine road of the factory, and the visitor centre and the car park are on the way.',
    90, 14, 60, [150, 3, 96], [142, 0, 88, 160, 8, 108]),
  stop('roads', 'Roads and the Car Park',
    'The spine road runs along the whole factory from east to west. Street lights stand on both sides, and the dashed line in the middle keeps the traffic in order. The car park is south of the road, close to the visitor centre. Good roads are important in a factory: heavy trucks bring aluminium plates and engines, and nothing may block the way of the fire engines.',
    0, 28, 150, [0, 2, 40]),
  stop('rollout', 'The Rollout Road to the Airport',
    'This is the rollout gate in the west. When an aeroplane is finished, it will roll out through this gate, along a wide taxi strip with a yellow centre line, then turn north onto the taxiway of the old airport. From there it goes to the runway and takes off. The strip is twenty-six metres wide, because an airliner has a wide undercarriage and long wings, and it must stay on the paved surface.',
    270, 14, 100, [-205, 2, -90], [-232, 0, -140, -176, 3, -47]),
];

/** AIRCRAFT FACTORY, stage 1: only the site (boundary fence, gate, roads, taxi strips to the airport, plot outlines). The factory buildings and the assembly line follow in the next stage. */
export function createAircraftFactory(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', PAD.maxX);
  const mats = createMaterials();
  const site = new Site(SITE, PAD);
  const anim = new AnimSet();
  const root = new THREE.Group();
  root.name = 'aircraft-factory';
  const part = buildSiteWorks(mats);
  root.add(part.group);
  root.add(site.buildGround(mats.concrete, opts.skirtDepth, mats.concreteDark));
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mat = o.material as THREE.Material;
      o.castShadow = !mat.transparent;
      o.receiveShadow = true;
    }
  });
  root.updateWorldMatrix(true, true);
  return {
    id: 'aircraft',
    nameBn: 'Aircraft Factory',
    category: 'mechanical',
    root,
    parts: [part],
    tour: TOUR,
    narrationLang: 'en',
    legend: [],
    footprint: { width: SITE.maxX - SITE.minX, depth: SITE.maxZ - SITE.minZ },
    solids: () => collectSolids(root),
    setLabelsVisible: () => undefined,
    update: (dt) => anim.update(dt),
    dispose: () => {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
      });
      Object.values(mats.pipe).forEach((m) => m.dispose());
      Object.entries(mats).forEach(([k, m]) => {
        if (k !== 'pipe') (m as THREE.Material).dispose();
      });
      anim.dispose();
    },
  };
}

export const aircraftDef: InfrastructureDef = {
  id: 'aircraft',
  nameBn: 'Aircraft Factory',
  category: 'mechanical',
  create: (o) => createAircraftFactory(o),
};

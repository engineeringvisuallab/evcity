import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart } from '../../core/types';
import { resolveOptions } from '../../core/options';
import { collectSolids, type SolidShape } from '../../core/solids';
import { createMaterials } from '../../core/materials';
import { Site } from '../../core/Site';
import { makeLabel } from '../../core/Labels';
import { AnimSet } from '../../core/anim';
import { PAD, SITE } from './layout';
import { AIRCRAFT_TOUR } from './tourScript';
import { createAirMats, createVehMats, type Ctx } from './parts/ctx';
import { makePlaneKit } from './parts/airframe';
import { buildSiteWorks } from './parts/site';
import { buildLine } from './parts/line';
import { buildHall } from './parts/hall';
import { buildShop } from './parts/shop';
import { buildWing, buildFuse, buildFinal, buildPaint, buildTest } from './parts/stations';

const NAME = 'Aircraft Factory';

/** Floating English name tags: [text, x, y, z, scale] (local metres). */
const LABELS: [string, number, number, number, number?][] = [
  ['Aircraft factory', 0, 34, -60, 1.3],
  ['1 Wing', 140, 21, -60],
  ['2 Fuselage', 70, 21, -60],
  ['3 Final assembly', 0, 21, -60],
  ['4 Paint', -70, 21, -60],
  ['5 Test cell', -135, 21, -60],
  ['Rollout door', -172, 19, -60, 0.9],
  ['Parts shop - CNC', -105, 15, 64],
  ['Gantry mill', -73, 8, 74, 0.8],
  ['Main gate', 150, 9, 108, 0.9],
];

/** AIRCRAFT FACTORY: the site, the assembly hall with cranes, five stations on one line, the parts shop, and the moving line of aeroplanes (the SAME aeroplane the game flies). */
export function createAircraftFactory(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', PAD.maxX);
  const mats = createMaterials();
  const t = createVehMats();
  const a = createAirMats();
  const site = new Site(SITE, PAD);
  const anim = new AnimSet();
  const extraSolids: SolidShape[] = [];
  const kit = makePlaneKit();
  // ONE clock: in the game the airplane manager's clock (options.clock), so the aeroplane that leaves the door is the one that appears on the taxiway
  const clock = opts.clock ?? ((): number => anim.time);
  const ctx: Ctx = { mats, t, a, site, opts, anim, solids: extraSolids, clock, kit, planes: [] };
  const root = new THREE.Group();
  root.name = 'aircraft-factory';
  const parts: InfraPart[] = [buildSiteWorks(mats), ...[buildLine, buildHall, buildShop, buildWing, buildFuse, buildFinal, buildPaint, buildTest].map((b) => b(ctx))];
  for (const p of parts) root.add(p.group);
  root.add(site.buildGround(mats.concrete, opts.skirtDepth, mats.concreteDark));

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
    id: 'aircraft',
    nameBn: NAME,
    category: 'mechanical',
    root,
    parts,
    tour: AIRCRAFT_TOUR,
    narrationLang: 'en',
    legend: [],
    footprint: { width: SITE.maxX - SITE.minX, depth: SITE.maxZ - SITE.minZ },
    solids: () => [...collectSolids(root), ...extraSolids],
    setLabelsVisible: (v) => {
      labels.visible = v;
    },
    update: (dt) => anim.update(dt),
    dispose: () => {
      ctx.planes.forEach((p) => p.dispose());
      kit.dispose();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
      });
      Object.values(mats.pipe).forEach((m) => m.dispose());
      Object.entries(mats).forEach(([k, m]) => {
        if (k !== 'pipe') (m as THREE.Material).dispose();
      });
      Object.values(t).forEach((m) => m.dispose());
      Object.values(a).forEach((m) => m.dispose());
      anim.dispose();
    },
  };
}

export const aircraftDef: InfrastructureDef = {
  id: 'aircraft',
  nameBn: NAME,
  category: 'mechanical',
  create: (o) => createAircraftFactory(o),
};

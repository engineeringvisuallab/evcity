import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart } from '../../core/types';
import { resolveOptions } from '../../core/options';
import { collectSolids, type SolidShape } from '../../core/solids';
import { createMaterials } from '../../core/materials';
import { Site } from '../../core/Site';
import { makeLabel } from '../../core/Labels';
import { AnimSet } from '../../core/anim';
import { PAD, SITE } from './layout';
import { THERMAL_TOUR } from './tourScript';
import { createThermalMats, type Ctx } from './parts/ctx';
import { buildSiteWorks } from './parts/site';
import { buildGas } from './parts/gas';
import { buildBoiler } from './parts/boiler';
import { buildStack } from './parts/stack';
import { buildTurbine } from './parts/turbine';
import { buildCondenser } from './parts/condenser';
import { buildCooling } from './parts/cooling';
import { buildFeedwater } from './parts/feedwater';
import { buildDm } from './parts/dm';
import { buildElectrical } from './parts/electrical';
import { buildControl } from './parts/control';

/** Floating Bangla name tags: [text, x, y, z] (local metres). */
const LABELS: [string, number, number, number][] = [
  ['মূল ফটক', 0, 10, 108],
  ['প্রশাসনিক ভবন', -45, 11, 88],
  ['গ্যাস স্টেশন', -150, 9, 20],
  ['বয়লার', -95, 50, -30],
  ['চিমনি', -128, 78, -30],
  ['টারবাইন ও জেনারেটর', -5, 26, -30],
  ['কনডেনসার', -2, 9, -22],
  ['কুলিং টাওয়ার', 105, 76, -66],
  ['ফিডওয়াটার পাম্প', -52, 14, 12],
  ['ডিএম প্ল্যান্ট', -125, 11, 55],
  ['জেনারেটর ট্রান্সফর্মার', 45, 15, -30],
  ['সুইচইয়ার্ড', 105, 18, -15],
  ['কন্ট্রোল রুম', 22, 14, 8],
];

export function createThermalPlant(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', PAD.maxX);
  const mats = createMaterials();
  const t = createThermalMats();
  const site = new Site(SITE, PAD);
  const anim = new AnimSet();
  const extraSolids: SolidShape[] = [];
  const ctx: Ctx = { mats, t, site, opts, anim, solids: extraSolids };
  const root = new THREE.Group();
  root.name = 'thermal';
  const builders = [buildSiteWorks, buildGas, buildBoiler, buildStack, buildTurbine, buildCondenser, buildCooling, buildFeedwater, buildDm, buildElectrical, buildControl];
  const parts: InfraPart[] = builders.map((b) => b(ctx));
  for (const p of parts) root.add(p.group);
  root.add(site.buildGround(mats.concrete, opts.skirtDepth, mats.concreteDark));

  const labels = new THREE.Group();
  labels.name = 'labels';
  for (const [text, x, y, z] of LABELS) {
    const tag = makeLabel(text);
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
    id: 'thermal',
    nameBn: 'তাপ বিদ্যুৎ কেন্দ্র (গ্যাসচালিত, ১৫০ মেগাওয়াট)',
    category: 'electrical',
    root,
    parts,
    tour: THERMAL_TOUR,
    legend: ['gas', 'steam', 'feedwater', 'cooling', 'flue'],
    footprint: { width: SITE.maxX - SITE.minX, depth: SITE.maxZ - SITE.minZ },
    solids: () => [...collectSolids(root), ...extraSolids],
    setLabelsVisible: (v) => {
      labels.visible = v;
    },
    update: (dt) => anim.update(dt),
    dispose: () => {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
      });
      Object.values(mats.pipe).forEach((m) => m.dispose());
      Object.entries(mats).forEach(([k, m]) => {
        if (k !== 'pipe') (m as THREE.Material).dispose();
      });
      Object.values(t).forEach((m) => m.dispose());
      anim.dispose();
    },
  };
}

export const thermalDef: InfrastructureDef = {
  id: 'thermal',
  nameBn: 'তাপ বিদ্যুৎ কেন্দ্র (গ্যাসচালিত, ১৫০ মেগাওয়াট)',
  category: 'electrical',
  create: (o) => createThermalPlant(o),
};

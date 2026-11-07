import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart } from '../../core/types';
import { resolveOptions } from '../../core/options';
import { collectSolids, type SolidShape } from '../../core/solids';
import { createMaterials } from '../../core/materials';
import { Site } from '../../core/Site';
import { makeLabel } from '../../core/Labels';
import { AnimSet } from '../../core/anim';
import { PAD, SITE } from './layout';
import { TEXTILE_TOUR } from './tourScript';
import { createTextileMats, Sim, type Ctx } from './parts/ctx';
import { buildSiteWorks } from './parts/site';
import { buildCotton } from './parts/cotton';
import { buildSpinning } from './parts/spinning';
import { buildWeaving } from './parts/weaving';
import { buildDyeing } from './parts/dyeing';
import { buildEtp } from './parts/etp';
import { buildGarments } from './parts/garments';

/** Floating name tags: [text, x, y, z] (local metres). */
const LABELS: [string, number, number, number][] = [
  ['Main Gate', -110, 9, 96],
  ['Administration', -70, 11, 80],
  ['Cotton Store', -122, 11, -62],
  ['Spinning Mill', -62, 12, -55],
  ['Weaving Shed', 30, 11, -55],
  ['Dyeing & Finishing', 105, 13, -62],
  ['Boiler House', 86, 10, -26],
  ['Chimney', 99, 35, -26],
  ['Water Plant', 60, 8, -26],
  ['Garments Factory', -45, 12, 25],
  ['Finished Goods Store', 35, 11, 25],
  ['Effluent Treatment Plant', 110, 8, 28],
  ['Substation', 130, 8, 84],
];

export function createTextileFactory(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', PAD.maxX);
  const mats = createMaterials();
  const anim = new AnimSet();
  const t = createTextileMats();
  const site = new Site(SITE, PAD);
  const sim = new Sim();
  sim.update(0);
  const extraSolids: SolidShape[] = [];
  const ctx: Ctx = { mats, t, site, opts, anim, solids: extraSolids, sim };
  const root = new THREE.Group();
  root.name = 'textile';
  const builders = [buildSiteWorks, buildCotton, buildSpinning, buildWeaving, buildDyeing, buildEtp, buildGarments];
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
    id: 'textile',
    narrationLang: 'en',
    nameBn: 'Textile & Garments Factory',
    category: 'materials',
    root,
    parts,
    tour: TEXTILE_TOUR,
    legend: [],
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

export const textileDef: InfrastructureDef = {
  id: 'textile',
  nameBn: 'Textile & Garments Factory',
  category: 'materials',
  create: (o) => createTextileFactory(o),
};

import * as THREE from 'three';
import type { Mats } from '../../../core/materials';
import type { ResolvedOptions } from '../../../core/options';
import type { Site } from '../../../core/Site';
import type { SolidShape } from '../../../core/solids';
import type { AnimSet } from '../../../core/anim';

export const std = (color: number, o: { rough?: number; metal?: number; opacity?: number; emissive?: number; glow?: number } = {}): THREE.MeshStandardMaterial => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0.2 });
  if (o.emissive !== undefined) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.glow ?? 0.8;
  }
  if (o.opacity !== undefined && o.opacity < 1) {
    m.transparent = true;
    m.opacity = o.opacity;
    m.depthWrite = false;
  }
  return m;
};
const basic = (color: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color });

/** Colours of the jet dyeing machines (one dye bath each). */
export const DYE_COLORS = [0xc0392b, 0x2e6bd1, 0x2e9d57, 0xe0b020, 0x8e44ad, 0x1f2933, 0xe67e22, 0x16a39a] as const;

export function createTextileMats() {
  return {
    cotton: std(0xf5f2e8, { rough: 0.95, metal: 0 }),
    cottonDark: std(0xe2d9c0, { rough: 0.95, metal: 0 }),
    strap: std(0x3a3d40, { rough: 0.6 }),
    yarn: std(0xf1ead2, { rough: 0.9, metal: 0 }),
    fabricGrey: std(0xe9dfc4, { rough: 0.95, metal: 0 }),
    white: std(0xf1f3f4, { rough: 0.45, metal: 0.15 }),
    steel: std(0xb7bec6, { rough: 0.35, metal: 0.8 }),
    steelDark: std(0x4a5056, { rough: 0.5, metal: 0.6 }),
    alu: std(0xc8cfd6, { rough: 0.3, metal: 0.9 }),
    paintRed: std(0xb5382c, { rough: 0.55 }),
    paintBlue: std(0x2e5c8a, { rough: 0.55 }),
    paintGreen: std(0x3f7d5a, { rough: 0.55 }),
    paintYellow: std(0xe0b020, { rough: 0.55 }),
    paintGrey: std(0x8f979e, { rough: 0.6 }),
    paintTeal: std(0x1f8a8a, { rough: 0.55 }),
    rubber: std(0x222426, { rough: 0.9, metal: 0 }),
    wood: std(0x9a7448, { rough: 0.85, metal: 0 }),
    carton: std(0xc59a63, { rough: 0.9, metal: 0 }),
    table: std(0xd7d2c4, { rough: 0.7, metal: 0.05 }),
    chair: std(0x2c4a6e, { rough: 0.8, metal: 0.05 }),
    skin: std(0xc68a62, { rough: 0.8, metal: 0 }),
    uniform: std(0xffffff, { rough: 0.85, metal: 0 }),
    glass: Object.assign(std(0xaed4e6, { opacity: 0.22, rough: 0.1, metal: 0.2 }), { side: THREE.DoubleSide }),
    balloon: std(0xffffff, { opacity: 0.16, rough: 0.5, metal: 0 }),
    panel: std(0x1d3557, { rough: 0.25, metal: 0.5 }),
    flame: std(0xff8a1f, { rough: 0.4, metal: 0, emissive: 0xff7a00, glow: 1 }),
    // fabrics: grey (undyed) and the dyed colours
    fabricRed: std(DYE_COLORS[0], { rough: 0.95, metal: 0 }),
    fabricBlue: std(DYE_COLORS[1], { rough: 0.95, metal: 0 }),
    fabricGreen: std(DYE_COLORS[2], { rough: 0.95, metal: 0 }),
    // waste water stages
    waterDye: std(0x7a4a8a, { opacity: 0.92, rough: 0.3, metal: 0 }),
    waterNeutral: std(0x8a7a6a, { opacity: 0.92, rough: 0.3, metal: 0 }),
    waterAer: std(0x7a6a3f, { opacity: 0.93, rough: 0.3, metal: 0 }),
    waterSettled: std(0x8aa39a, { opacity: 0.88, rough: 0.2, metal: 0 }),
    waterTreated: std(0x4aa3c9, { opacity: 0.82, rough: 0.2, metal: 0 }),
    foam: std(0xeeeeee, { opacity: 0.7, rough: 1, metal: 0 }),
    sludgeBed: std(0x5a4a36, { rough: 1, metal: 0 }),
    ledGreen: basic(0x32d74b),
    ledAmber: basic(0xffb347),
    ledRed: basic(0xff3b30),
    ledOff: basic(0x333a40),
    screenOff: basic(0x0d2a3b),
    barCotton: basic(0xf5f2e8),
    barYarn: basic(0xffd23f),
    barFabric: basic(0x5ec2ff),
    barDyed: basic(0xe040fb),
    barGarment: basic(0x32d74b),
  };
}
export type TMats = ReturnType<typeof createTextileMats>;

/** colour of the dots that travel along each line (= what flows) */
export const DOT = {
  cotton: 0xffffff,
  yarn: 0xf6e9b0,
  fabric: 0xe9dfc4,
  steam: 0xdfe6ee,
  gas: 0xffe066,
  water: 0x7ec8ff,
  effluent: 0xc58ad6,
  treated: 0x7fd6ff,
  garment: 0xffb347,
  air: 0xcfd8e3,
  power: 0x9fd0ff,
  sludge: 0x9a8560,
  chem: 0xf4d35e,
} as const;

/**
 * One accelerated shift for the whole factory (SHIFT seconds). The production board in front of the administration building shows the
 * cumulative output of every stage: later stages start later and lag behind, like in a real factory. Not real numbers, only the right story.
 */
export const SHIFT = 40;
export class Sim {
  phase = 0;
  /** cotton issued, yarn, grey fabric, dyed fabric, garments: 0..1 */
  stage = [0, 0, 0, 0, 0];
  update(t: number): void {
    this.phase = (t / SHIFT) % 1;
    for (let i = 0; i < 5; i++) this.stage[i] = Math.min(1, Math.max(0, (this.phase - 0.08 * i) / 0.62));
  }
}

export interface Ctx {
  mats: Mats;
  t: TMats;
  site: Site;
  opts: ResolvedOptions;
  anim: AnimSet;
  solids: SolidShape[];
  sim: Sim;
}

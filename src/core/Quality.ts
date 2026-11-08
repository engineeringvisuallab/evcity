/**
 * Graphics quality: one preset per device class, picked automatically (Chrome, Safari, Firefox, phone, tablet, PC) and changeable in the settings menu.
 *
 *   initQuality()  - call ONCE in main.ts, BEFORE the engine is imported (LOD / shadow / fog numbers are read when the engine modules load).
 *   Q              - the active preset (pixel ratio cap, antialiasing, shadow size, site draw distance, FPS cap ...).
 *   DynamicResolution - lowers the render resolution by itself when the FPS drops, raises it again when there is room.
 *
 * Safari / iOS notes: Safari has no navigator.deviceMemory and hides the GPU name, so the detection uses the user agent (iPhone / iPad / iPadOS-as-Mac),
 * the CPU core count and the touch points. All iPhone / iPad browsers (Chrome included) are WebKit, so they get the same treatment.
 */
import { Config } from './Config';

export type QualityChoice = 'auto' | 'low' | 'medium' | 'high';
export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  tier: QualityTier;
  /** Highest device pixel ratio of the picture (normal render mode). */
  maxDpr: number;
  /** Highest number of pixels of the picture (width x height x ratio^2) in normal render mode: protects 4K screens and tablets. */
  maxPixels: number;
  antialias: boolean;
  powerPreference: 'default' | 'high-performance' | 'low-power';
  shadowMapSize: number;
  shadowExtent: number;
  /** Terrain LOD distances (m); the last one is the load radius. */
  lodDistances: number[];
  /** Engineering sites are drawn (and built) within this distance (m) of the player. */
  siteShowDist: number;
  /** 0 = no limit. */
  fpsCap: number;
  /** Lowest resolution factor the dynamic resolution may use. */
  minScale: number;

  // ---- entity counts / densities (high = the original game values) ----
  /** Chance multipliers of the placement in the chunk workers (trees, rocks, grass tufts). 1 = every one of the original set; lower = a thinner subset of the SAME set. */
  treeMul: number;
  rockMul: number;
  grassMul: number;
  /** Chunks up to this LOD get trees and rocks (see Config.vegetation.maxLod). */
  treeMaxLod: number;
  /** Grass draw radius (m); the LOD rings and the fade-out are squeezed to fit. */
  grassRadius: number;
  /** Blades per tuft model multiplier (Config.vegetation.grass.bladeDensity). */
  grassBlades: number;
  /** People on foot / AI cars / buses around the player. */
  peopleTarget: number;
  trafficTarget: number;
  maxBuses: number;
  /** Bird flocks (of 12), land animals, predators, dolphins, fish schools. */
  flockCount: number;
  landAnimals: number;
  predators: number;
  dolphins: number;
  fishSchools: number;
  /** Street lamp spacing multiplier (1 = original, 1.5 = a lamp every 1.5x as far). */
  lampStepMul: number;
  /** Vehicle headlight beams on the road are drawn only this close (m) to the player; the small lamp glows reach much farther. */
  lightFxDist: number;
  /** Radius multiplier of the crop plants / farm crew around the player. */
  farmMul: number;
  /** Engineering sites farther than this x siteShowDist are disposed again to free memory (0 = never; they are rebuilt when the player returns). */
  siteDisposeMul: number;
  /** Engineering sites: merge their static meshes into few draw calls (same picture); ?merge=0 switches it off for comparing. */
  siteMerge: boolean;
  /** Engineering sites: meshes with a bounding radius below this (m) stop casting a sun shadow (0 = all keep it). */
  siteShadowMinR: number;
  /** Cap of the texture anisotropy (sharpness at grazing angles; cheaper on small GPUs). */
  maxAniso: number;
  /** The sun shadow map is redrawn every n-th frame (1 = every frame). */
  shadowInterval: number;
  /** Road sign boards: multiplier of the show / paint / unpaint distances in SIGN_FIELD (1 = high). */
  signRadiusMul: number;
  /** Road sign boards: at most this many get their text drawn (a canvas texture) in one frame. */
  signPaintPerFrame: number;
  /** Junction road mirrors: how many nearby mirrors show the real scene at once (0 = only the painted picture). */
  mirrorLive: number;
  /** Junction road mirrors: a mirror shows the real scene only within this distance (m) of the camera. */
  mirrorLiveDist: number;
  /** Junction road mirrors: size (px) of the square picture a live mirror renders. */
  mirrorTex: number;
}

export const PRESETS: Readonly<Record<QualityTier, QualitySettings>> = {
  low: {
    tier: 'low', maxDpr: 1.5, maxPixels: 1_300_000, antialias: false, powerPreference: 'default',
    shadowMapSize: 1024, shadowExtent: 200, lodDistances: [220, 520, 1100, 2000], siteShowDist: 700, fpsCap: 30, minScale: 0.6,
    treeMul: 0.35, rockMul: 0.35, grassMul: 0.6, treeMaxLod: 1, grassRadius: 120, grassBlades: 0.6,
    peopleTarget: 12, trafficTarget: 5, maxBuses: 1, flockCount: 4, landAnimals: 24, predators: 2, dolphins: 3, fishSchools: 4,
    lampStepMul: 1.6, lightFxDist: 45, farmMul: 0.65, siteDisposeMul: 2.5, siteMerge: true, siteShadowMinR: 1.2, maxAniso: 2, shadowInterval: 2,
    signRadiusMul: 0.6, signPaintPerFrame: 1,
    mirrorLive: 1, mirrorLiveDist: 30, mirrorTex: 256,
  },
  medium: {
    tier: 'medium', maxDpr: 1.25, maxPixels: 2_800_000, antialias: false, powerPreference: 'default',
    shadowMapSize: 2048, shadowExtent: 280, lodDistances: [300, 700, 1400, 2600], siteShowDist: 1300, fpsCap: 60, minScale: 0.6,
    treeMul: 0.65, rockMul: 0.65, grassMul: 0.85, treeMaxLod: 1, grassRadius: 145, grassBlades: 0.8,
    peopleTarget: 22, trafficTarget: 8, maxBuses: 2, flockCount: 8, landAnimals: 42, predators: 3, dolphins: 5, fishSchools: 7,
    lampStepMul: 1.25, lightFxDist: 80, farmMul: 0.85, siteDisposeMul: 0, siteMerge: true, siteShadowMinR: 0.5, maxAniso: 4, shadowInterval: 1,
    signRadiusMul: 0.8, signPaintPerFrame: 2,
    mirrorLive: 1, mirrorLiveDist: 40, mirrorTex: 384,
  },
  high: {
    tier: 'high', maxDpr: 2, maxPixels: 8_300_000, antialias: true, powerPreference: 'high-performance',
    shadowMapSize: 4096, shadowExtent: 350, lodDistances: [380, 900, 1900, 3600], siteShowDist: 2400, fpsCap: 60, minScale: 0.7,
    treeMul: 1, rockMul: 1, grassMul: 1, treeMaxLod: 1, grassRadius: 170, grassBlades: 1,
    peopleTarget: 34, trafficTarget: 12, maxBuses: 3, flockCount: 12, landAnimals: 64, predators: 4, dolphins: 8, fishSchools: 10,
    lampStepMul: 1, lightFxDist: 130, farmMul: 1, siteDisposeMul: 0, siteMerge: true, siteShadowMinR: 0, maxAniso: 16, shadowInterval: 1,
    signRadiusMul: 1, signPaintPerFrame: 3,
    mirrorLive: 2, mirrorLiveDist: 50, mirrorTex: 512,
  },
};

/** The active settings (filled by initQuality; until then = high, the old behaviour). */
export const Q: QualitySettings = { ...PRESETS.high, lodDistances: [...PRESETS.high.lodDistances] };

const KEY = 'evcity.quality';
const isChoice = (v: unknown): v is QualityChoice => v === 'auto' || v === 'low' || v === 'medium' || v === 'high';

export function getQualityChoice(): QualityChoice {
  try {
    const p = new URLSearchParams(location.search).get('quality'); // e.g. ?quality=low
    if (isChoice(p)) {
      localStorage.setItem(KEY, p);
      return p;
    }
    const s = localStorage.getItem(KEY);
    if (isChoice(s)) return s;
  } catch {
    /* storage blocked (Safari private mode): auto */
  }
  return 'auto';
}

/** Saves the choice; the new preset is used after a reload (shadow size, LOD and fog are read at start). */
export function setQualityChoice(c: QualityChoice): void {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* ignore */
  }
}

function gpuName(): string {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return '';
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    const n = e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return n;
  } catch {
    return '';
  }
}

export function detectTier(): QualityTier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const ua = nav.userAgent || '';
  const touch = (nav.maxTouchPoints || 0) > 1;
  const iPhone = /iPhone|iPod/.test(ua);
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch); // iPadOS Safari reports itself as a Mac
  const android = /Android/.test(ua);
  const phone = iPhone || (android && /Mobile/.test(ua));
  const tablet = iPad || (android && !/Mobile/.test(ua));
  if (phone) return 'low';
  if (tablet) return 'medium';
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory; // Chrome / Edge only (undefined in Safari, Firefox)
  const gpu = gpuName();
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) return 'low';
  let tier: QualityTier = 'high';
  if (cores <= 4 || (mem !== undefined && mem <= 4)) tier = 'medium';
  if (tier === 'high' && /intel/i.test(gpu) && !/arc/i.test(gpu)) tier = 'medium'; // integrated Intel graphics
  return tier;
}

/** Picks the preset and writes the numbers the engine reads from Config. Call before the engine modules are imported. */
export function initQuality(): QualitySettings {
  const choice = getQualityChoice();
  const tier = choice === 'auto' ? detectTier() : choice;
  const p = PRESETS[tier];
  Object.assign(Q, p, { lodDistances: [...p.lodDistances] });
  try {
    if (new URLSearchParams(location.search).get('merge') === '0') Q.siteMerge = false; // A/B test of the mesh merging
  } catch {
    /* ignore */
  }
  Config.environment.shadowMapSize = p.shadowMapSize;
  Config.environment.shadowExtent = p.shadowExtent;
  if (tier !== 'high') {
    p.lodDistances.forEach((d, i) => {
      Config.lod.distances[i] = d;
    });
    // same fog (about 95 % at the load radius) at the shorter radius: hides the pop-in of chunks
    Config.environment.fogDensity *= PRESETS.high.lodDistances[3] / p.lodDistances[3];
  }
  // entity counts (main thread; the chunk workers get treeMul / rockMul / grassMul / treeMaxLod in their request messages, see ChunkLoader)
  Config.people.target = p.peopleTarget;
  Config.traffic.target = p.trafficTarget;
  Config.traffic.maxBuses = p.maxBuses;
  Config.vegetation.maxLod = p.treeMaxLod;
  const G = Config.vegetation.grass;
  Config.vegetation.grass.bladeDensity = p.grassBlades;
  if (p.grassRadius !== PRESETS.high.grassRadius) {
    const r = p.grassRadius;
    G.radius = r;
    G.keep = r + 20;
    G.fadeEnd = r - 2;
    G.fadeStart = r - 30;
    // the near ring keeps its size; the middle ring is squeezed in proportion, the last ring ends at the radius
    G.lods[1].to = Math.round(G.lods[1].to * Math.min(1, (r - 40) / (PRESETS.high.grassRadius - 40)) + 0.0001);
    G.lods[2].to = r;
  }
  (Q as { choice?: QualityChoice }).choice = choice;
  return Q;
}

export function currentChoice(): QualityChoice {
  return ((Q as { choice?: QualityChoice }).choice ?? 'auto');
}

/**
 * Resolution factor 1 .. minScale. Every ~1.5 s the average FPS is checked: clearly below the target -> 10 % lower resolution;
 * at the target for ~6 s -> 5 % higher again. The first seconds are ignored (shader compile, chunk start-up).
 */
export class DynamicResolution {
  scale = 1;
  private acc = 0;
  private frames = 0;
  private good = 0;
  private warm = 5;

  constructor(
    private target: number,
    private minScale: number,
    private onChange: (scale: number) => void,
  ) {}

  sample(dt: number): void {
    if (dt <= 0 || dt > 0.2) return; // a hitch / background tab is not a reason to blur the picture
    this.acc += dt;
    this.frames++;
    if (this.acc < 1.5) return;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (this.warm > 0) {
      this.warm -= 1.5;
      return;
    }
    if (fps < this.target * 0.85 && this.scale > this.minScale + 0.001) {
      this.scale = Math.max(this.minScale, this.scale - 0.1);
      this.good = 0;
      this.onChange(this.scale);
    } else if (fps >= this.target * 0.97) {
      if (++this.good >= 4 && this.scale < 1) {
        this.scale = Math.min(1, this.scale + 0.05);
        this.good = 0;
        this.onChange(this.scale);
      }
    } else {
      this.good = 0;
    }
  }
}

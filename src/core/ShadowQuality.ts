/**
 * Sun shadows: off / low / medium / high, or AUTO. Changeable in the settings menu at any time (no reload).
 *
 *   ShadowManager   owns the current level and tells the host (Environment + renderer) to apply it.
 *
 * AUTO (the default):
 *   - starts from the device class: weak devices (phone, old PC) start with the shadows OFF, normal ones with MEDIUM, strong ones with HIGH.
 *   - every 2 s the average FPS is looked at. Clearly too slow for 4 s -> one level less (high -> medium -> low -> off). The shadows are
 *     the first thing to go; the resolution (DynamicResolution) is lowered only when the shadows are already off.
 *   - a good PC gets its shadows back: after 20 s of full speed (and 60 s since the last change) one level more is TRIED. If the FPS drops
 *     in the next seconds, it goes back and that level stays locked for the rest of the session.
 *   - the last level is remembered, so the next start does not repeat the slow-down.
 * A fixed choice (off / low / medium / high) is never changed by the game.
 */
import { Q, type QualityTier } from './Quality';

export type ShadowLevel = 'off' | 'low' | 'medium' | 'high';
export type ShadowChoice = 'auto' | ShadowLevel;

export const SHADOW_ORDER: readonly ShadowLevel[] = ['off', 'low', 'medium', 'high'];

export interface ShadowSpec {
  /** Shadow map side (px). 0 = no shadow map. */
  size: number;
  /** Half width of the shadow box around the camera (m). */
  extent: number;
  /** The shadow map is redrawn every n-th frame (1 = every frame). 0 = off. */
  interval: number;
  /** Edge softness. */
  radius: number;
}

/** "high" is the original look of the game. */
export const SHADOW_SPECS: Readonly<Record<ShadowLevel, ShadowSpec>> = {
  off: { size: 0, extent: 0, interval: 0, radius: 0 },
  low: { size: 1024, extent: 170, interval: 2, radius: 1.5 },
  medium: { size: 2048, extent: 260, interval: 1, radius: 2 },
  high: { size: 4096, extent: 350, interval: 1, radius: 2.5 },
};

export const SHADOW_NAMES_BN: Readonly<Record<ShadowLevel, string>> = { off: 'বন্ধ', low: 'নিচু', medium: 'মাঝারি', high: 'উঁচু' };

/** Auto mode: where it starts and the highest level it may try, per device class. */
export const TIER_SHADOW: Readonly<Record<QualityTier, { start: ShadowLevel; max: ShadowLevel }>> = {
  low: { start: 'off', max: 'low' },
  medium: { start: 'medium', max: 'high' },
  high: { start: 'high', max: 'high' },
};

const KEY_CHOICE = 'evcity.shadow';
const KEY_LAST = 'evcity.shadowLast';

const rank = (l: ShadowLevel): number => SHADOW_ORDER.indexOf(l);
const isLevel = (v: unknown): v is ShadowLevel => v === 'off' || v === 'low' || v === 'medium' || v === 'high';
const isChoice = (v: unknown): v is ShadowChoice => v === 'auto' || isLevel(v);

function read(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice just is not remembered */
  }
}

/** The saved choice (or ?shadow=off|low|medium|high|auto in the address). */
export function getShadowChoice(): ShadowChoice {
  try {
    const p = new URLSearchParams(location.search).get('shadow');
    if (isChoice(p)) {
      write(KEY_CHOICE, p);
      if (p === 'auto') write(KEY_LAST, null);
      return p;
    }
  } catch {
    /* no location (tests) */
  }
  const s = read(KEY_CHOICE);
  return isChoice(s) ? s : 'auto';
}

export interface ShadowHost {
  /** Make the sun shadow look like `spec` (level 'off' = no shadow map at all). */
  apply(level: ShadowLevel, spec: ShadowSpec): void;
  /** A short message for the player (auto mode only). */
  notify?(text: string): void;
}

const WINDOW = 2; // seconds per FPS measurement
const BAD_FPS = 0.8; // of the target
const GOOD_FPS = 0.95;
const PROBE_FPS = 0.88;
const BAD_WINDOWS = 2; // in a row
const GOOD_WINDOWS = 10; // in a row before a higher level is tried
const UP_COOLDOWN = 60; // seconds since the last change
const SETTLE_WINDOWS = 2; // ignored after a change (shader recompile)
const PROBE_WINDOWS = 3; // watched after a step up

export class ShadowManager {
  choice: ShadowChoice;
  level: ShadowLevel;
  /** Highest level auto may use now (lowered for the session when a try failed). */
  private ceiling: ShadowLevel;
  private acc = 0;
  private frames = 0;
  private settle = 3;
  private bad = 0;
  private good = 0;
  private since = 0;
  private probe = 0;
  private probeFrom: ShadowLevel | null = null;

  constructor(
    private host: ShadowHost,
    private tier: QualityTier = Q.tier,
    choice: ShadowChoice = getShadowChoice(),
  ) {
    this.choice = choice;
    this.ceiling = TIER_SHADOW[tier].max;
    this.level = this.startLevel();
    this.host.apply(this.level, SHADOW_SPECS[this.level]);
  }

  /** Redrawing rate of the shadow map for the current level (0 = off). */
  get interval(): number {
    return SHADOW_SPECS[this.level].interval;
  }

  /** true = the game may lower the resolution now (a fixed shadow choice, or the shadows are already off). */
  get atFloor(): boolean {
    return this.choice !== 'auto' || this.level === 'off';
  }

  /** The player picks a choice in the settings menu. Applied at once, remembered. */
  setChoice(c: ShadowChoice): void {
    this.choice = c;
    write(KEY_CHOICE, c);
    if (c === 'auto') write(KEY_LAST, null); // auto starts fresh from the device class
    this.ceiling = TIER_SHADOW[this.tier].max;
    this.resetCounters();
    this.level = this.startLevel();
    this.host.apply(this.level, SHADOW_SPECS[this.level]);
  }

  /** Call once per rendered frame with the frame time (s) and the FPS the game aims for (30 / 60). */
  sample(dt: number, target: number): void {
    if (this.choice !== 'auto') return;
    if (dt <= 0 || dt > 0.2) return; // a hitch or a background tab says nothing about the speed
    this.acc += dt;
    this.frames++;
    this.since += dt;
    if (this.acc < WINDOW) return;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (this.settle > 0) {
      this.settle--;
      return;
    }
    if (this.probe > 0) {
      // a higher level was just tried: keep it only when the speed holds
      if (fps < target * PROBE_FPS) this.failProbe();
      else if (--this.probe === 0) this.probeFrom = null;
      return;
    }
    if (fps < target * BAD_FPS) {
      this.good = 0;
      if (++this.bad >= BAD_WINDOWS && rank(this.level) > 0) this.step(-1);
      return;
    }
    this.bad = 0;
    if (fps >= target * GOOD_FPS && rank(this.level) < rank(this.ceiling)) {
      if (++this.good >= GOOD_WINDOWS && this.since >= UP_COOLDOWN) this.step(1);
    } else {
      this.good = 0;
    }
  }

  private startLevel(): ShadowLevel {
    if (this.choice !== 'auto') return this.choice;
    const start = TIER_SHADOW[this.tier].start;
    const last = read(KEY_LAST);
    // the level the last session ended on (when it was lower than the class default): no slow-down again at every start
    return isLevel(last) && rank(last) < rank(start) ? last : start;
  }

  private resetCounters(): void {
    this.acc = 0;
    this.frames = 0;
    this.bad = 0;
    this.good = 0;
    this.since = 0;
    this.probe = 0;
    this.probeFrom = null;
    this.settle = 3;
  }

  private change(to: ShadowLevel): void {
    this.level = to;
    this.host.apply(to, SHADOW_SPECS[to]);
    write(KEY_LAST, to);
    this.acc = 0;
    this.frames = 0;
    this.bad = 0;
    this.good = 0;
    this.since = 0;
    this.settle = SETTLE_WINDOWS;
  }

  private step(dir: 1 | -1): void {
    const from = this.level;
    const to = SHADOW_ORDER[rank(from) + dir];
    if (!to) return;
    this.change(to);
    if (dir > 0) {
      this.probeFrom = from;
      this.probe = PROBE_WINDOWS;
      this.host.notify?.(`🌤️ পিসি ভালো চলছে — ছায়া বাড়ানো হলো: ${SHADOW_NAMES_BN[to]}`);
    } else {
      this.host.notify?.(to === 'off' ? '🌑 গেম ধীর — ছায়া বন্ধ করা হলো (সেটিংসে বদলানো যায়)' : `🌑 গেম ধীর — ছায়া কমানো হলো: ${SHADOW_NAMES_BN[to]}`);
    }
  }

  private failProbe(): void {
    const back = this.probeFrom ?? this.level;
    this.ceiling = back; // this level is too heavy for this PC: not tried again in this session
    this.probe = 0;
    this.probeFrom = null;
    this.change(back);
  }
}

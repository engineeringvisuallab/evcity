// Headless test of the rain logic (src/weather/RainState.ts): npm run test:rain
import { ALWAYS_LEVELS, RAIN_FADE_IN, RAIN_FADE_OUT, RAIN_HOLD, RAIN_PROFILES, RainState } from '../src/weather/RainState';

let fails = 0;
const ok = (c: boolean, msg: string): void => {
  console.log((c ? 'PASS ' : 'FAIL ') + msg);
  if (!c) fails++;
};

// seeded random numbers: the test is repeatable
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 660; // 8 + 3 minutes
const DT = 0.1;

// ---- 1. AUTO mode over 60 game days: how often does it rain, how long, how strong? ----
{
  const r = new RainState(seeded(42), DAY, false);
  const rainDays = new Set<number>();
  const showers: { start: number; peak: number; maxI: number }[] = [];
  let cur: { start: number; peak: number; maxI: number } | null = null;
  let maxStep = 0;
  let prev = 0;
  for (let t = 0; t < DAY * 60; t += DT) {
    r.update(DT);
    maxStep = Math.max(maxStep, Math.abs(r.intensity - prev));
    prev = r.intensity;
    if (r.intensity > 0.05) {
      rainDays.add(Math.floor(r.time / DAY));
      if (!cur) cur = { start: r.time, peak: r.event?.peak ?? 0, maxI: 0 };
      cur.maxI = Math.max(cur.maxI, r.intensity);
    } else if (cur && r.intensity < 0.01) {
      showers.push(cur);
      cur = null;
    }
  }
  const days = [...rainDays].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]);
  console.log('rain days:', days.join(','));
  console.log('gaps (days):', gaps.join(','));
  ok(showers.length >= 10 && showers.length <= 30, `about one shower every 2..5 days (60 days -> ${showers.length} showers)`);
  ok(gaps.length > 0 && Math.min(...gaps) >= 2 && Math.max(...gaps) <= 6, `gap between rain days is 2..5 (min ${Math.min(...gaps)}, max ${Math.max(...gaps)})`);
  ok(gaps.includes(2) && gaps.includes(5), 'both the 2-day and the 5-day gap happen');
  const peaks = showers.map((s) => s.maxI);
  ok(Math.max(...peaks) > 0.7 && Math.min(...peaks) < 0.65, `strength varies (weakest ${Math.min(...peaks).toFixed(2)}, strongest ${Math.max(...peaks).toFixed(2)})`);
  ok(maxStep < 0.02, `no jumps: the strength changes smoothly (largest step ${maxStep.toFixed(4)})`);
}

// ---- 2. first rain comes soon, clouds come before the rain, the sea calms down slowly, the ground dries slowly ----
{
  const r = new RainState(seeded(7), DAY, true);
  const e = r.event!;
  ok(e.start >= 60 && e.start <= 300, `first shower starts in the first minutes (t = ${e.start.toFixed(0)} s)`);
  let cloudBefore = 0;
  let stormAtEnd = 0;
  let wetAtEnd = 0;
  let stormLater = 0;
  let wetLater = 0;
  let rainDuring = 0;
  for (let t = 0; t < e.end + 400; t += DT) {
    r.update(DT);
    if (Math.abs(r.time - (e.start - 3)) < DT / 2) cloudBefore = r.cloud;
    if (Math.abs(r.time - (e.start + (e.end - e.start) / 2)) < DT / 2) rainDuring = r.intensity;
    if (Math.abs(r.time - (e.end + 20)) < DT / 2) {
      stormAtEnd = r.storm;
      wetAtEnd = r.wet;
    }
    if (Math.abs(r.time - (e.end + 120)) < DT / 2) {
      stormLater = r.storm;
      wetLater = r.wet;
    }
  }
  ok(cloudBefore > 0.15, `sky is already getting cloudy before the first drop (cloud ${cloudBefore.toFixed(2)})`);
  ok(rainDuring > 0.1, `it rains in the middle of the shower (${rainDuring.toFixed(2)})`);
  ok(stormLater < stormAtEnd + 1e-9 && stormLater > 0, `sea calms down slowly (${stormAtEnd.toFixed(2)} -> ${stormLater.toFixed(2)} after 100 s more)`);
  ok(wetLater > 0.2 && wetLater < wetAtEnd + 1e-9, `ground dries slowly (${wetAtEnd.toFixed(2)} -> ${wetLater.toFixed(2)})`);
}

// ---- 2b. a shower is SHORT: 20 s fade in, 60 s of rain, 20 s fade out; the puddles fill while it rains and dry slowly ----
{
  const r = new RainState(seeded(11), DAY, true);
  const e = r.event!;
  ok(Math.abs(e.end - e.start - (RAIN_FADE_IN + RAIN_HOLD + RAIN_FADE_OUT)) < 1e-9, `a shower lasts ${RAIN_FADE_IN} + ${RAIN_HOLD} + ${RAIN_FADE_OUT} = ${e.end - e.start} s`);
  const at = (t: number): number => {
    while (r.time < t) r.update(DT);
    return r.intensity;
  };
  const peak = e.peak;
  const before = at(e.start - 1);
  const early = at(e.start + 5);
  const mid = at(e.start + 20);
  const hold = at(e.start + 55);
  const fading = at(e.end - 8);
  const after = at(e.end + 15);
  ok(before < 0.01, `dry right before the start (${before.toFixed(3)})`);
  ok(early > 0 && early < 0.45 * peak, `it starts gently: 5 s in only ${early.toFixed(2)} (peak ${peak.toFixed(2)})`);
  ok(mid > early && mid > 0.5 * peak, `20 s in it is close to full strength (${mid.toFixed(2)})`);
  ok(hold > 0.6 * peak, `it rains hard during the 60 s hold (${hold.toFixed(2)})`);
  ok(fading < hold, `it is fading 8 s before the end (${fading.toFixed(2)})`);
  ok(after < 0.05, `15 s after the end the rain is off (${after.toFixed(3)})`);
  const puddleEnd = r.puddle;
  ok(puddleEnd > 0.35, `puddles filled during the shower (${puddleEnd.toFixed(2)})`);
  const wetEnd = r.wet;
  while (r.time < e.end + 120) r.update(DT);
  ok(r.puddle > 0.1 && r.puddle < puddleEnd, `puddles are still there 2 minutes later, smaller (${r.puddle.toFixed(2)})`);
  ok(r.wet < wetEnd && r.wet > 0.2, `the ground is still damp 2 minutes later (${r.wet.toFixed(2)})`);
}

// ---- 3. OFF and ALWAYS ----
{
  const r = new RainState(seeded(3), DAY, true);
  r.mode = 'off';
  for (let t = 0; t < 1200; t += DT) r.update(DT);
  ok(r.intensity === 0 && r.cloud === 0, 'OFF: never rains');
  r.mode = 'always';
  for (let l = 0; l < 3; l++) {
    r.alwaysLevel = l;
    for (let t = 0; t < 200; t += DT) r.update(DT);
    ok(Math.abs(r.intensity - ALWAYS_LEVELS[l]) < 0.12, `ALWAYS level ${l}: strength ${r.intensity.toFixed(2)} (~${ALWAYS_LEVELS[l]})`);
  }
  r.alwaysLevel = 2;
  let thunder = 0;
  for (let t = 0; t < 400; t += DT) {
    r.update(DT);
    while (r.popThunder() !== null) thunder++;
  }
  ok(thunder >= 3, `storm level: thunder claps happen (${thunder} in 400 s)`);
  ok(r.storm > 0.8, `storm level: heavy sea state (${r.storm.toFixed(2)})`);
  r.mode = 'off';
  for (let t = 0; t < 30; t += DT) r.update(DT);
  ok(r.intensity < 0.01, 'switching OFF stops the rain within seconds');
}

// ---- 4. quality profiles: low is much cheaper than high ----
{
  const [lo, me, hi] = RAIN_PROFILES;
  ok(lo.near + lo.far < me.near + me.far && me.near + me.far < hi.near + hi.far, 'low < medium < high streak counts');
  ok(lo.near + lo.far <= 500 && !lo.lightning && !lo.beach && lo.wetQ === 1, 'LOW profile: a few hundred streaks, darker ground only');
  ok(hi.wetQ === 3 && hi.waterRipples && hi.beach, 'HIGH profile: puddles, water rings, beach foam');
  ok(lo.splash === 0 && me.splash > 0 && hi.splash > me.splash, 'splash droplets: none on LOW, more on HIGH than MEDIUM');
}

if (fails) {
  console.log(`\n${fails} test(s) FAILED`);
  process.exit(1);
}
console.log('\nall rain tests passed');

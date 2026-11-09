// Shadow quality: fixed choices stay fixed, auto lowers (high -> medium -> low -> off) when the FPS is bad, brings a level back on a good PC,
// goes back and locks when a tried level is too heavy, weak classes start with the shadows off, and the last level is remembered.
import { ShadowManager, SHADOW_SPECS, type ShadowChoice, type ShadowHost, type ShadowLevel } from '../src/core/ShadowQuality';

// a tiny localStorage for node
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

let bad = 0;
const check = (ok: boolean, msg: string): void => {
  console.log(ok ? 'PASS' : 'FAIL', msg);
  if (!ok) bad++;
};

function make(tier: 'low' | 'medium' | 'high', choice: ShadowChoice) {
  const applied: ShadowLevel[] = [];
  const msgs: string[] = [];
  const host: ShadowHost = { apply: (l) => applied.push(l), notify: (t) => msgs.push(t) };
  const m = new ShadowManager(host, tier, choice);
  return { m, applied, msgs };
}
/** Runs `seconds` of game time at a steady `fps`. */
function run(m: ShadowManager, fps: number, seconds: number, target = 60): void {
  const dt = 1 / fps;
  for (let t = 0; t < seconds; t += dt) m.sample(dt, target);
}

// 1. starts: weak = off, normal = medium, strong = high
check(make('low', 'auto').m.level === 'off', 'low class starts with the shadows off');
check(make('medium', 'auto').m.level === 'medium', 'medium class starts at medium');
check(make('high', 'auto').m.level === 'high', 'high class starts at high');
check(SHADOW_SPECS.high.size === 4096 && SHADOW_SPECS.high.extent === 350 && SHADOW_SPECS.high.interval === 1, 'high = the original shadow numbers');

// 2. a fixed choice never changes
{
  const { m, applied } = make('high', 'low');
  run(m, 10, 120);
  check(m.level === 'low' && applied.length === 1, 'fixed "low" stays low at 10 FPS');
  check(m.atFloor, 'fixed choice: the resolution may react');
}
{
  const { m } = make('high', 'off');
  run(m, 60, 200);
  check(m.level === 'off', 'fixed "off" stays off at 60 FPS');
}

// 3. auto goes down step by step to off, then hands over to the resolution
{
  store.clear();
  const { m, msgs } = make('high', 'auto');
  check(!m.atFloor, 'auto at high: the shadows react first');
  run(m, 20, 60);
  check(m.level === 'off', 'auto: 20 FPS for 60 s -> shadows off (got ' + m.level + ')');
  check(m.atFloor, 'auto at off: the resolution may react now');
  check(msgs.length === 3, 'auto: three messages (high->medium->low->off), got ' + msgs.length);
}

// 4. a hitch (one long frame) is not a reason
{
  store.clear();
  const { m } = make('high', 'auto');
  run(m, 60, 10);
  for (let i = 0; i < 20; i++) m.sample(0.5, 60);
  run(m, 60, 20);
  check(m.level === 'high', 'auto: single long frames are ignored');
}

// 5. a good PC gets a level back after ~60 s of full speed
{
  store.clear();
  const { m } = make('high', 'auto');
  run(m, 20, 16); // medium
  const dropped = m.level;
  check(dropped !== 'high', 'auto dropped to ' + dropped);
  run(m, 60, 90);
  check(m.level === 'high', 'auto: 90 s at 60 FPS brings the level back (got ' + m.level + ')');
}

// 6. a tried level that is too heavy: back down and locked for the session
{
  store.clear();
  const { m, applied } = make('high', 'auto');
  run(m, 20, 12); // down one step (to medium)
  const base = m.level;
  run(m, 60, 62); // good: a step up is tried
  check(m.level === 'high', 'probe: tried one level up (got ' + m.level + ')');
  run(m, 30, 10); // too heavy at the higher level
  check(m.level === base, 'probe failed: back to ' + base + ' (got ' + m.level + ')');
  const n = applied.length;
  run(m, 60, 400);
  check(!applied.slice(n).includes('high'), 'locked: "high" is not tried again for the rest of the session');
}

// 7. weak class: starts off, may try at most "low"
{
  store.clear();
  const { m } = make('low', 'auto');
  run(m, 30, 200, 30);
  check(m.level === 'low', 'low class: good speed -> at most "low" (got ' + m.level + ')');
}

// 8. the last level is remembered for the next start (only when lower than the class default)
{
  store.clear();
  const a = make('high', 'auto');
  run(a.m, 20, 60); // -> off
  const b = make('high', 'auto');
  check(b.m.level === 'off', 'next start begins at the remembered level (got ' + b.m.level + ')');
  b.m.setChoice('auto');
  check(b.m.level === 'high', 'picking auto again starts fresh from the class');
}

// 9. settings: setChoice applies at once
{
  store.clear();
  const { m, applied } = make('medium', 'auto');
  m.setChoice('high');
  check(m.level === 'high' && applied[applied.length - 1] === 'high', 'setChoice("high") applies at once');
  m.setChoice('off');
  check(m.level === 'off' && m.interval === 0, 'setChoice("off"): interval 0');
}

if (bad) {
  console.log(`\n${bad} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll shadow checks passed');

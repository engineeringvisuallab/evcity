// EVLab Step RT6: the real-time tower clock (country list, real time of a country, hands, where the 4 clocks stand, the Settings value).
// npx tsx scripts/evlab-clock-test.ts   (the plan imports EVLabTowerLayout, which imports three at load: run it where `npm install` was done; the canvas drawing is not tested here)
import { readFileSync } from 'node:fs';
import { COUNTRIES, DEFAULT_COUNTRY, clockTime, countryOf, digital, handAngles, isCountryCode, utcOffsetMin } from '../src/evlab/EVLabClockZones';
import { CLOCK_BAND, CLOCK_H, CLOCK_SETBACK_OK, CLOCK_W, CLOCK_Y0, DIAL, DIGITAL, clockQuads } from '../src/evlab/EVLabClockPlan';
import { BAND_Y1, FACES, faceLength } from '../src/evlab/EVLabLettersPlan';
import { SETBACKS } from '../src/evlab/EVLabTowerLayout';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const zoneOf = (code: string): string => countryOf(code).zone;
const at = (y: number, mo: number, d: number, h: number, mi = 0, s = 0): number => Date.UTC(y, mo - 1, d, h, mi, s);

// 1 the country list
ok(COUNTRIES.length >= 40, `${COUNTRIES.length} countries`);
ok(new Set(COUNTRIES.map((c) => c.code)).size === COUNTRIES.length && COUNTRIES.every((c) => /^[A-Z]{2}$/.test(c.code)), 'unique 2-letter codes');
ok(COUNTRIES[0].code === DEFAULT_COUNTRY && DEFAULT_COUNTRY === 'BD' && zoneOf('BD') === 'Asia/Dhaka', 'the default is Bangladesh (Asia/Dhaka), first in the list');
let zonesOk = true;
for (const c of COUNTRIES) { try { clockTime(c.zone, at(2026, 11, 15, 12)); } catch { zonesOk = false; console.log('   bad zone ' + c.zone); } }
ok(zonesOk, 'every zone is a valid IANA zone (Intl accepts it)');
ok(countryOf('XX').code === 'BD' && countryOf(undefined).code === 'BD' && !isCountryCode('XX') && isCountryCode('JP'), 'an unknown code gives the default country');
const rest = COUNTRIES.slice(1).map((c) => c.name);
ok(rest.join('|') === [...rest].sort((a, b) => a.localeCompare(b, 'en')).join('|'), 'the others are sorted A..Z');

// 2 real time of a country (12:00:00 UTC on 15 Nov 2026)
const T0 = at(2026, 11, 15, 12);
const want: Array<[string, string]> = [['BD', '18:00:00'], ['IN', '17:30:00'], ['NP', '17:45:00'], ['MM', '18:30:00'], ['JP', '21:00:00'], ['GB', '12:00:00'], ['US', '07:00:00'], ['AU', '23:00:00'], ['IR', '15:30:00']];
for (const [c, w] of want) ok(digital(clockTime(zoneOf(c), T0)) === w, `${c}: 12:00:00 UTC = ${w}`);

// 3 offsets, summer time follows the date (the clock must not stay on a fixed offset)
const off = (c: string, ms: number): number => utcOffsetMin(zoneOf(c), ms);
ok(off('BD', T0) === 360 && off('BD', at(2026, 7, 15, 12)) === 360, 'Bangladesh UTC+06:00 all year');
ok(off('IN', T0) === 330 && off('NP', T0) === 345, 'India +05:30, Nepal +05:45');
ok(off('GB', T0) === 0 && off('GB', at(2026, 7, 15, 12)) === 60, 'UK 0 in winter, +01:00 in summer');
ok(off('US', T0) === -300 && off('US', at(2026, 7, 15, 12)) === -240, 'New York -05:00 in winter, -04:00 in summer');
ok(off('AU', T0) === 660 && off('AU', at(2026, 7, 15, 12)) === 600, 'Sydney +11:00 in November, +10:00 in July');
const b1 = digital(clockTime(zoneOf('GB'), at(2026, 3, 29, 0, 59, 59))), b2 = digital(clockTime(zoneOf('GB'), at(2026, 3, 29, 1, 0, 0)));
ok(b1 === '00:59:59' && b2 === '02:00:00', `UK clocks go forward at 01:00 UTC on 29 Mar 2026 (${b1} -> ${b2})`);
ok(digital(clockTime(zoneOf('BD'), at(2026, 11, 15, 17, 59, 59))) === '23:59:59' && digital(clockTime(zoneOf('BD'), at(2026, 11, 15, 18, 0, 0))) === '00:00:00', 'Bangladesh midnight rolls over (23:59:59 -> 00:00:00, hour 0 not 24)');

// 4 hands
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;
const h3 = handAngles({ h: 3, m: 0, s: 0 }), h12 = handAngles({ h: 12, m: 0, s: 0 }), h1530 = handAngles({ h: 15, m: 30, s: 0 }), h645 = handAngles({ h: 6, m: 30, s: 30 });
ok(near(h3.hour, Math.PI / 2) && near(h3.minute, 0) && near(h3.second, 0), '03:00:00: hour hand at 3, minute and second at 12');
ok(near(h12.hour, 0) && near(handAngles({ h: 0, m: 0, s: 0 }).hour, 0), '12:00 and 00:00: hour hand at 12');
ok(near(h1530.hour, (3.5 / 12) * Math.PI * 2) && near(h1530.minute, Math.PI), '15:30: hour hand half way between 3 and 4, minute hand at 6');
ok(near(h645.second, Math.PI) && near(h645.minute, ((30.5) / 60) * Math.PI * 2), '06:30:30: second hand at 6, minute hand moves with the seconds');

// 5 where the 4 clocks stand
const Q = clockQuads();
ok(CLOCK_SETBACK_OK && CLOCK_BAND.n0 > SETBACKS[0] && CLOCK_BAND.n1 < SETBACKS[1], `clock levels ${CLOCK_BAND.n0}..${CLOCK_BAND.n1}: above the first set-back (level ${SETBACKS[0]}), below the next (level ${SETBACKS[1]})`);
ok(CLOCK_Y0 > BAND_Y1 + 5, `above the lettering (clock from y ${CLOCK_Y0.toFixed(1)} m, lettering to ${BAND_Y1.toFixed(1)} m)`);
const nLev = CLOCK_BAND.n1 - CLOCK_BAND.n0 + 1;
ok(Q.length === nLev * 4 && FACES.every((f) => Q.filter((q) => q.face === f).length === nLev), `one clock on each of the 4 faces (${Q.length} quads)`);
let minFace = Infinity;
for (const f of FACES) for (let n = CLOCK_BAND.n0; n <= CLOCK_BAND.n1; n++) minFace = Math.min(minFace, faceLength(f, n));
ok(CLOCK_W <= minFace, `texture ${CLOCK_W} m fits the straight glass (shortest ${minFace.toFixed(1)} m)`);
ok(DIAL.cy - DIAL.r >= 0.3 && DIAL.cx - DIAL.r >= 0.3 && DIAL.cy + DIAL.r < DIGITAL.top, `the dial (diameter ${(2 * DIAL.r).toFixed(1)} m) is inside the texture, above the digital line`);
const digW = 8 * 0.67 * (DIGITAL.cap / 0.72); // 8 characters, widest bold sans digits (0.67 em)
ok(DIGITAL.top + DIGITAL.cap <= CLOCK_H - 0.3 && digW <= CLOCK_W * 0.94, `digital line ${DIGITAL.cap} m high, <= ${digW.toFixed(1)} m wide: inside the texture (${CLOCK_W} x ${CLOCK_H.toFixed(1)} m)`);
let outward = true, mirrored = false, centred = true;
for (const q of Q) {
  const a = q.p[0], b = q.p[1];
  if (((a[0] + b[0]) / 2) * q.n[0] + (((a[2] + b[2]) / 2) - 20) * q.n[1] <= 0) outward = false;
  const right: [number, number] = [q.n[1], -q.n[0]];
  const along = (b[0] - a[0]) * right[0] + (b[2] - a[2]) * right[1], du = q.uv[1][0] - q.uv[0][0];
  if (du * along <= 0 || Math.abs(Math.abs(du * CLOCK_W) - Math.abs(along)) > 1e-6) mirrored = true;
  if (Math.abs(q.uv[0][0] + q.uv[1][0] - 1) > 1e-6) centred = false;
}
ok(outward && !mirrored && centred, 'the clock faces point away from the tower, are not mirrored and are centred');

// 6 it is NOT the game's time: the clock files never touch DayNight / game hours
const src = ['EVLabClock.ts', 'EVLabClockPlan.ts', 'EVLabClockZones.ts'].map((f) => readFileSync(new URL('../src/evlab/' + f, import.meta.url), 'utf8')).join('\n');
const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
ok(!/DayNight|environment\.hours|nightOf|\bhours\b/.test(code), 'the clock code does not use DayNight / game hours (real time only: Date.now + Intl)');

// 7 the Settings value (HudSettings) with a fake localStorage
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 } as Storage;
const { HudSettings, HUD_DEFAULTS } = await import('../src/ui/HudSettings');
ok(HUD_DEFAULTS.clockCountry === 'BD' && new HudSettings().values.clockCountry === 'BD', 'Settings default country = Bangladesh (nothing saved yet)');
store.set('evcity.settings', JSON.stringify({ clockCountry: 'XX' }));
ok(new HudSettings().values.clockCountry === 'BD', 'a broken saved country falls back to Bangladesh');
store.set('evcity.settings', JSON.stringify({ gold: true }));
ok(new HudSettings().values.clockCountry === 'BD', 'old saved settings (without a country) still load');
store.set('evcity.settings', JSON.stringify({ clockCountry: 'IN' }));
const hs = new HudSettings();
let heard = '';
hs.onChange((v) => { heard = v.clockCountry; });
ok(hs.values.clockCountry === 'IN', 'saved country is read back (IN)');
hs.set('clockCountry', 'JP');
ok(heard === 'JP' && (JSON.parse(store.get('evcity.settings')!) as { clockCountry: string }).clockCountry === 'JP', 'picking a country tells the game and is saved in localStorage');

console.log(`   cost: 1 mesh (1 draw call), ${Q.length * 2} triangles, 1 canvas texture 1024 x ~${Math.round(1024 * CLOCK_H / CLOCK_W)} shared by 4 faces, redrawn 1 x per second (and at once on a country change), no light, no shadow`);
console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);

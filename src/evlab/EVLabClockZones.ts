// EVLab Step RT6: the countries of the tower clock and the real-time hisab (pure: Intl only, no three.js, nothing from DayNight).
// The clock shows REAL time (Date.now) in the IANA zone of the country picked in Settings. It has nothing to do with the game's day and night.
// A country with several zones uses the zone of its capital (the note in Settings says so).

export interface Country { code: string; name: string; zone: string }

export const DEFAULT_COUNTRY = 'BD';

const LIST: ReadonlyArray<Country> = [
  { code: 'AR', name: 'Argentina', zone: 'America/Argentina/Buenos_Aires' },
  { code: 'AU', name: 'Australia', zone: 'Australia/Sydney' },
  { code: 'AT', name: 'Austria', zone: 'Europe/Vienna' },
  { code: 'BH', name: 'Bahrain', zone: 'Asia/Bahrain' },
  { code: 'BD', name: 'Bangladesh', zone: 'Asia/Dhaka' },
  { code: 'BE', name: 'Belgium', zone: 'Europe/Brussels' },
  { code: 'BT', name: 'Bhutan', zone: 'Asia/Thimphu' },
  { code: 'BR', name: 'Brazil', zone: 'America/Sao_Paulo' },
  { code: 'BN', name: 'Brunei', zone: 'Asia/Brunei' },
  { code: 'CA', name: 'Canada', zone: 'America/Toronto' },
  { code: 'CL', name: 'Chile', zone: 'America/Santiago' },
  { code: 'CN', name: 'China', zone: 'Asia/Shanghai' },
  { code: 'CO', name: 'Colombia', zone: 'America/Bogota' },
  { code: 'DK', name: 'Denmark', zone: 'Europe/Copenhagen' },
  { code: 'EG', name: 'Egypt', zone: 'Africa/Cairo' },
  { code: 'FI', name: 'Finland', zone: 'Europe/Helsinki' },
  { code: 'FR', name: 'France', zone: 'Europe/Paris' },
  { code: 'DE', name: 'Germany', zone: 'Europe/Berlin' },
  { code: 'GR', name: 'Greece', zone: 'Europe/Athens' },
  { code: 'HK', name: 'Hong Kong', zone: 'Asia/Hong_Kong' },
  { code: 'IN', name: 'India', zone: 'Asia/Kolkata' },
  { code: 'ID', name: 'Indonesia', zone: 'Asia/Jakarta' },
  { code: 'IR', name: 'Iran', zone: 'Asia/Tehran' },
  { code: 'IQ', name: 'Iraq', zone: 'Asia/Baghdad' },
  { code: 'IE', name: 'Ireland', zone: 'Europe/Dublin' },
  { code: 'IL', name: 'Israel', zone: 'Asia/Jerusalem' },
  { code: 'IT', name: 'Italy', zone: 'Europe/Rome' },
  { code: 'JP', name: 'Japan', zone: 'Asia/Tokyo' },
  { code: 'JO', name: 'Jordan', zone: 'Asia/Amman' },
  { code: 'KE', name: 'Kenya', zone: 'Africa/Nairobi' },
  { code: 'KW', name: 'Kuwait', zone: 'Asia/Kuwait' },
  { code: 'MY', name: 'Malaysia', zone: 'Asia/Kuala_Lumpur' },
  { code: 'MV', name: 'Maldives', zone: 'Indian/Maldives' },
  { code: 'MX', name: 'Mexico', zone: 'America/Mexico_City' },
  { code: 'MM', name: 'Myanmar', zone: 'Asia/Yangon' },
  { code: 'NP', name: 'Nepal', zone: 'Asia/Kathmandu' },
  { code: 'NL', name: 'Netherlands', zone: 'Europe/Amsterdam' },
  { code: 'NZ', name: 'New Zealand', zone: 'Pacific/Auckland' },
  { code: 'NG', name: 'Nigeria', zone: 'Africa/Lagos' },
  { code: 'NO', name: 'Norway', zone: 'Europe/Oslo' },
  { code: 'OM', name: 'Oman', zone: 'Asia/Muscat' },
  { code: 'PK', name: 'Pakistan', zone: 'Asia/Karachi' },
  { code: 'PH', name: 'Philippines', zone: 'Asia/Manila' },
  { code: 'PL', name: 'Poland', zone: 'Europe/Warsaw' },
  { code: 'PT', name: 'Portugal', zone: 'Europe/Lisbon' },
  { code: 'QA', name: 'Qatar', zone: 'Asia/Qatar' },
  { code: 'RU', name: 'Russia', zone: 'Europe/Moscow' },
  { code: 'SA', name: 'Saudi Arabia', zone: 'Asia/Riyadh' },
  { code: 'SG', name: 'Singapore', zone: 'Asia/Singapore' },
  { code: 'ZA', name: 'South Africa', zone: 'Africa/Johannesburg' },
  { code: 'KR', name: 'South Korea', zone: 'Asia/Seoul' },
  { code: 'ES', name: 'Spain', zone: 'Europe/Madrid' },
  { code: 'LK', name: 'Sri Lanka', zone: 'Asia/Colombo' },
  { code: 'SE', name: 'Sweden', zone: 'Europe/Stockholm' },
  { code: 'CH', name: 'Switzerland', zone: 'Europe/Zurich' },
  { code: 'TW', name: 'Taiwan', zone: 'Asia/Taipei' },
  { code: 'TH', name: 'Thailand', zone: 'Asia/Bangkok' },
  { code: 'TR', name: 'Turkey', zone: 'Europe/Istanbul' },
  { code: 'AE', name: 'United Arab Emirates', zone: 'Asia/Dubai' },
  { code: 'GB', name: 'United Kingdom', zone: 'Europe/London' },
  { code: 'US', name: 'United States', zone: 'America/New_York' },
  { code: 'VN', name: 'Vietnam', zone: 'Asia/Ho_Chi_Minh' },
];

/** The countries for the Settings list: Bangladesh first (the default), the others A..Z. */
export const COUNTRIES: ReadonlyArray<Country> = [
  ...LIST.filter((c) => c.code === DEFAULT_COUNTRY),
  ...LIST.filter((c) => c.code !== DEFAULT_COUNTRY).sort((a, b) => a.name.localeCompare(b.name, 'en')),
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c] as const));

export const isCountryCode = (c: unknown): c is string => typeof c === 'string' && BY_CODE.has(c);
/** The country of a code; an unknown code gives the default country. */
export const countryOf = (code: unknown): Country => (isCountryCode(code) ? BY_CODE.get(code)! : BY_CODE.get(DEFAULT_COUNTRY)!);

export interface ClockTime { h: number; m: number; s: number }

const fmts = new Map<string, Intl.DateTimeFormat>();
function fmt(zone: string): Intl.DateTimeFormat {
  let f = fmts.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    fmts.set(zone, f);
  }
  return f;
}
interface Wall { y: number; mo: number; d: number; h: number; m: number; s: number }
function wall(zone: string, ms: number): Wall {
  const o: Record<string, number> = {};
  for (const p of fmt(zone).formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = parseInt(p.value, 10);
  return { y: o.year, mo: o.month, d: o.day, h: o.hour % 24, m: o.minute, s: o.second };
}

/** The wall-clock time in the zone at the instant `ms` (UTC milliseconds, e.g. Date.now()). */
export function clockTime(zone: string, ms: number): ClockTime {
  const w = wall(zone, ms);
  return { h: w.h, m: w.m, s: w.s };
}

/** UTC offset of the zone at the instant `ms`, in minutes (Dhaka +360, Kolkata +330, New York -300 in winter / -240 in summer). */
export function utcOffsetMin(zone: string, ms: number): number {
  const w = wall(zone, ms);
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.m, w.s);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** "HH:MM:SS" */
export function digital(t: ClockTime): string {
  const p = (n: number): string => (n < 10 ? '0' : '') + n;
  return `${p(t.h)}:${p(t.m)}:${p(t.s)}`;
}

/** Hand angles in radians, clockwise from 12 o'clock (the hour hand moves smoothly with the minutes). */
export function handAngles(t: ClockTime): { hour: number; minute: number; second: number } {
  const TAU = Math.PI * 2;
  return {
    hour: (((t.h % 12) + t.m / 60 + t.s / 3600) / 12) * TAU,
    minute: ((t.m + t.s / 60) / 60) * TAU,
    second: (t.s / 60) * TAU,
  };
}

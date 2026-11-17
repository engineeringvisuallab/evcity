// PRESENTATION HALL: how a spoken page is marked. Pure functions (no DOM), tested in scripts/mission-test.ts.

const STOP = new Set([
  'the', 'a', 'an', 'and', 'of', 'to', 'is', 'in', 'it', 'be', 'are', 'for', 'on', 'at', 'as', 'by', 'or', 'with', 'that', 'this', 'i', 'we', 'you',
  'will', 'who', 'which', 'from', 'so', 'its', 'their', 'his', 'has', 'have', 'was', 'were', 'but', 'not', 'can', 'all', 'any', 'our', 'us', 'me', 'my',
]);

export const tokenize = (s: string): string[] =>
  s.toLowerCase().replace(/[\u2019']/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);

/** Words that carry meaning: they decide the mark. Small words only get highlighted. */
export const isContent = (w: string): boolean => w.length > 2 && !STOP.has(w);

function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= n; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[n];
}

/** Speech recognition spells names its own way: long words may differ by one (nine or more letters: two) letters. */
const close = (a: string, b: string): boolean => a === b || (a.length >= 5 && b.length >= 5 && lev(a, b) <= (Math.max(a.length, b.length) >= 9 ? 2 : 1));

/** For every word of the script: was it heard? Each heard word is used once; content words are matched first. */
export function matchWords(script: string[], heard: string): boolean[] {
  const pool = tokenize(heard);
  const used = new Array<boolean>(pool.length).fill(false);
  const out = new Array<boolean>(script.length).fill(false);
  const take = (idx: number): void => {
    const w = script[idx];
    for (let k = 0; k < pool.length; k++) {
      if (!used[k] && close(w, pool[k])) {
        used[k] = true;
        out[idx] = true;
        return;
      }
    }
  };
  script.forEach((w, i) => isContent(w) && take(i));
  script.forEach((w, i) => !isContent(w) && take(i));
  return out;
}

/** 0..1: the share of the content words of the page that were heard. */
export function coverage(script: string[], matched: boolean[]): number {
  let total = 0;
  let hit = 0;
  script.forEach((w, i) => {
    if (!isContent(w)) return;
    total++;
    if (matched[i]) hit++;
  });
  return total ? hit / total : 0;
}

/** A page under 30 % heard is noise, not reading: it earns nothing. */
export const pageMark = (cov: number): number => (cov < 0.3 ? 0 : Math.min(1, cov));

/** The presenter starts by voice: any greeting or "start" is enough. */
export function isStartPhrase(heard: string): boolean {
  const t = tokenize(heard);
  const words = ['start', 'begin', 'ready', 'hello', 'welcome', 'morning', 'afternoon', 'evening', 'salam', 'assalamu', 'assalam', 'bismillah', 'ladies', 'everyone'];
  return t.some((w) => words.some((x) => w === x || close(w, x)));
}

export const stars = (mark: number): number => (mark >= 90 ? 3 : mark >= 75 ? 2 : mark >= 60 ? 1 : 0);

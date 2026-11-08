// ROAD SIGNS - Step 1: pure helpers (no three.js, no DOM), so they can be tested headless.

/** A direction on a sign board, as the DRIVER sees it. */
export type SignArrow = 'ahead' | 'left' | 'right';

/** One line of a direction board: a place (Bangla + English), the distance to it and the way to go. */
export interface SignRow {
  /** English name of the place. */
  en: string;
  /** Bangla name of the place. */
  bn: string;
  /** Distance in kilometres (optional: a board may only point the way). */
  km?: number;
  /** Which way to go (optional). */
  arrow?: SignArrow;
}

/** green = highway / main road boards, blue = city / local boards. */
export type SignColor = 'green' | 'blue';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** "12.5" -> "১২.৫" */
export function toBnDigits(text: string): string {
  return text.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** Distance as written on a board: below 10 km one decimal (0.4, 7.5), from 10 km whole kilometres (12, 48). Never "0.0". */
export function fmtKm(km: number): string {
  if (!(km > 0)) return '0.1';
  const r = Math.max(0.1, Math.round(km * 10) / 10);
  if (r < 10) return r.toFixed(1);
  return String(Math.round(km));
}

/** English side of the distance: "7.5 km". */
export function kmEn(km: number): string {
  return fmtKm(km) + ' km';
}

/** Bangla side of the distance: "৭.৫ কিমি". */
export function kmBn(km: number): string {
  return toBnDigits(fmtKm(km)) + ' কিমি';
}

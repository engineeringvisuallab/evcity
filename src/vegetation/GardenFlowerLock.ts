// *** LOCKED BY THE USER (2026-11-24): the size of the FLOWERS of the Central park and the Hatikamrul gardens (beds / borders, grass flag 9+). ***
// The user looked at them in the game and said "the flower is right, fix it, nobody may ever change it".
// DO NOT change these numbers, do not scale the flowers anywhere else (GrassManager, Config, GrassPlacement, assets), and do not move them back into Config.
// If a later step really needs another flower size, the USER must ask for exactly that in words; scripts/garden-flower-lock-check.ts must then be changed together with this file.
export const GARDEN_FLOWER = Object.freeze({
  /** Tuft height in metres: lo + (hi - lo) x a hash of the tuft position. */
  heightLo: 1.0,
  heightHi: 1.2,
  /** Tuft width = height x grass.widthScale (1.25 at the time of locking) x ring size: kept here as its own number, so a later change of the grass width cannot change the flowers. */
  widthScale: 1.25,
});

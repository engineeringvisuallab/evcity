// three.js side of the interchange system (kept out of index.ts so the core + tests stay headless, no `three` needed).
export { buildInterchangeObject, buildJunction3Object } from './InterchangeView';
export type { ViewOptions, InterchangeObject, Junction3Options } from './InterchangeView';

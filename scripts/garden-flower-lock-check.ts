// The LOCKED size of the garden flowers (user, 2026-11-24): src/vegetation/GardenFlowerLock.ts. This check fails if anybody changes the numbers or moves the flowers back into Config / scales them elsewhere.
// Run: npx tsx scripts/garden-flower-lock-check.ts
import { readFileSync } from 'node:fs';
import { GARDEN_FLOWER } from '../src/vegetation/GardenFlowerLock';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(64)} ${detail}`); };
check(GARDEN_FLOWER.heightLo === 1.0 && GARDEN_FLOWER.heightHi === 1.2 && GARDEN_FLOWER.widthScale === 1.25, 'L1 locked numbers 1.0 .. 1.2 m, width 1.25', `${GARDEN_FLOWER.heightLo} .. ${GARDEN_FLOWER.heightHi}, ${GARDEN_FLOWER.widthScale}`);
check(Object.isFrozen(GARDEN_FLOWER), 'L2 the object is frozen', '');
const gm = readFileSync(new URL('../src/vegetation/GrassManager.ts', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../src/core/Config.ts', import.meta.url), 'utf8');
check(gm.includes('GARDEN_FLOWER.heightLo') && gm.includes('GARDEN_FLOWER.widthScale'), 'L3 GrassManager takes the garden flower size from the lock file', '');
check(!/garden:\s*\{[^}]*flower/.test(cfg), 'L4 Config grass.garden has NO flower entry', '');
check(!/parkLawnTall|bedFlowerTall|hkLawnTall/.test(gm + cfg), 'L5 the old flower / lawn multipliers are gone', '');
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);

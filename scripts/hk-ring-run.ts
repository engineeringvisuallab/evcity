// STEP HK-8d-3: runs ONE ring check with the Hatikamrul switch set from the environment (HK=1 -> ON, anything else -> OFF), the check itself is not edited.
// Run: HK=1 npx tsx scripts/hk-ring-run.ts ring-cut-check [check args]
import { Config } from '../src/core/Config';

const cfg = Config as unknown as { roads: { hatikamrul?: { enabled: boolean } } };
const has = !!cfg.roads.hatikamrul;
if (has) cfg.roads.hatikamrul!.enabled = process.env.HK === '1';
const name = process.argv[2];
if (!name) { console.log('usage: HK=0|1 tsx scripts/hk-ring-run.ts <check-name> [args]'); process.exit(2); }
process.argv.splice(2, 1); // the check sees its own args at argv[2]
console.log(`[hk-ring-run] ${name}: hatikamrul switch present ${has}, enabled ${has ? cfg.roads.hatikamrul!.enabled : 'n/a (base)'}`);
await import(`./${name}.ts`);

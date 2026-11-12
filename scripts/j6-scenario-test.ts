// T01/T02 scenario test (stub). Run: npx tsx scripts/j6-scenario-test.ts
// Planned checks (docs/j6/04_TASKS_BN.md T02): scenario OFF == baseline; ON: pad 6 gone, path S4 -> centre -> J57 and centre -> T -> S5, min distance to F6, grade, radius.
import { J6_SCENARIO } from '../src/interchange/scenario/J6Scenario';
import * as fs from 'fs';
let fails = 0;
const ok = (c: boolean, m: string): void => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
ok(J6_SCENARIO.enabled === false, 'scenario is OFF by default');
ok(fs.existsSync('docs/j6/data/j6-scenario-data.json'), 'scenario data json exists');
console.log('TODO T02: connectivity / baseline / geometry checks');
process.exit(fails ? 1 : 0);

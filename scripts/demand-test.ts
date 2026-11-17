// T03 test. Run: npx tsx scripts/demand-test.ts
import { demandFor, resolveDemand, DEFAULT_DEMAND_BY_KIND } from '../src/interchange/demand/Demand';
let fails = 0;
const ok = (c: boolean, m: string): void => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const d = demandFor('highway', 'collector');
ok(d.approaches.length === 4, '4 approaches');
ok(d.approaches[0].thru === 1800 && d.approaches[2].thru === 1800 && d.approaches[1].thru === 250 && d.approaches[3].left === 120, 'J6 defaults (highway 1800/150/100, collector 250/120/80)');
const o = demandFor('highway', 'collector', [{ approach: 1, thru: 400 }, { approach: 1, left: -5 }]);
ok(o.approaches[1].thru === 400 && o.approaches[1].left === 120, 'override replaces only the given movement; negative ignored');
const r = resolveDemand({ kinds: ['highway', 'collector', 'highway', 'collector'], counts: (a) => (a === 0 ? { thru: 2100, right: Number.NaN } : null), overrides: [{ approach: 0, thru: 2500 }] });
ok(r.demand.approaches[0].thru === 2500 && r.sources[0][0] === 'override', 'override beats count');
ok(r.demand.approaches[0].left === 150 && r.sources[0][1] === 'default' && r.sources[0][2] === 'default', 'NaN count falls back to default');
const c = resolveDemand({ kinds: ['arterial', 'local', 'arterial', 'local'], counts: (a) => (a === 2 ? { thru: 900 } : null) });
ok(c.demand.approaches[2].thru === 900 && c.sources[2][0] === 'count' && c.demand.approaches[1].thru === DEFAULT_DEMAND_BY_KIND.local.thru, 'count used where available, default elsewhere');
d.approaches[0].thru = 1;
ok(DEFAULT_DEMAND_BY_KIND.highway.thru === 1800 && demandFor('highway', 'collector').approaches[0].thru === 1800, 'results do not alias the defaults');
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);

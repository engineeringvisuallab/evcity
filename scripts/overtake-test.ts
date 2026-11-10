// Overtake decision test (pure logic). Run: npx tsx scripts/overtake-test.ts
import { decideExtra, laneFree, LANE_W, type Other } from '../src/traffic/Overtake';

let failed = 0;
const ok = (c: boolean, m: string): void => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) failed++;
};
const base = { extra: 0, maxExtra: 2, vFree: 33, speed: 30, cooldown: 0, nearJunction: false };

const truck: Other = { a: 30, l: 0, v: 20 };
ok(decideExtra({ ...base, others: [truck] }) === 1, 'a fast car behind a slow truck pulls out one lane');
ok(decideExtra({ ...base, others: [{ a: 30, l: 0, v: 32 }] }) === 0, 'it does NOT pull out behind a car that is about as fast');
ok(decideExtra({ ...base, others: [{ a: 30, l: 0, v: 20 }, { a: 5, l: -LANE_W, v: 30 }] }) === 0, 'it stays when the next lane has a car beside it');
ok(decideExtra({ ...base, others: [{ a: 30, l: 0, v: 20 }, { a: -20, l: -LANE_W, v: 40 }] }) === 0, 'it stays when a faster car comes up behind in the next lane');
ok(decideExtra({ ...base, others: [truck], cooldown: 1 }) === 0, 'no lane change during the cool-down');
ok(decideExtra({ ...base, others: [truck], nearJunction: true }) === 0, 'no overtaking near a junction');
ok(decideExtra({ ...base, extra: 2, others: [truck] }) === 2, 'the fast lane is the last one (no 4th lane)');
ok(decideExtra({ ...base, maxExtra: 1, extra: 1, others: [truck] }) === 1, 'maxExtra is respected');
// after passing: the truck is behind, the kerb-side lane is free
ok(decideExtra({ ...base, extra: 1, others: [{ a: -30, l: LANE_W, v: 20 }] }) === 0, 'once past the truck it moves back');
ok(decideExtra({ ...base, extra: 1, others: [{ a: -5, l: LANE_W, v: 20 }] }) === 1, 'it does not cut in while the truck is still beside it');
ok(decideExtra({ ...base, maxExtra: 1, extra: 1, others: [{ a: 20, l: 0, v: 20 }] }) === 1, 'a new slow car ahead keeps it in the passing lane (no move back)');
ok(decideExtra({ ...base, extra: 1, others: [{ a: 20, l: 0, v: 20 }] }) === 2, 'with a lane left it passes that one too');
ok(laneFree([], LANE_W, 30), 'an empty lane is free');
ok(decideExtra({ ...base, extra: 1, others: [] }) === 0, 'alone on the road it goes back to its own lane');
console.log(failed === 0 ? '\nALL OK' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);

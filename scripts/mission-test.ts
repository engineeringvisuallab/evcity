// Checks the mission data and the answer parsing: npm run test:missions
import { MISSIONS } from '../src/missions/MissionData';
import { checkNumber, checkText, parseSpokenNumber } from '../src/missions/MissionVoice';
import { ENGINEERING_AREAS } from '../src/city/EngineeringZones';

let fail = 0;
const ok = (c: boolean, m: string): void => {
  if (!c) {
    fail++;
    console.error('FAIL', m);
  }
};

const nums: [string, number | null][] = [
  ['0.378', 0.378], ['sixty two point five', 62.5], ['two hundred sixty two', 262], ['zero point three seven eight', 0.378],
  ['1,250', 1250], ['it is 54 kilonewton metres', 54], ['one point five metres per second', 1.5], ['twelve', 12], ['hello', null],
  ['one hundred and eight', 108], ['two thousand five hundred', 2500],
];
for (const [t, v] of nums) {
  const got = parseSpokenNumber(t);
  ok(got !== null && v !== null ? Math.abs(got - v) < 1e-9 : got === v, `parse "${t}" -> ${got}, want ${v}`);
}
ok(checkNumber(0.38, { answer: 0.3778, tol: 0.05 }), 'tolerance accepts 0.38');
ok(!checkNumber(0.5, { answer: 0.3778, tol: 0.05 }), 'tolerance rejects 0.5');
ok(checkNumber(10, { min: 7, max: 14 }), 'range');
ok(checkText('It increases a lot!', [['increase', 'longer']]), 'text keyword');
ok(!checkText('decrease', [['increase', 'longer']]), 'text wrong');

const ids = new Set<string>();
for (const m of MISSIONS) {
  ok(!ids.has(m.id), `duplicate id ${m.id}`);
  ids.add(m.id);
  const a = ENGINEERING_AREAS.find((e) => m.place.x >= e.x0 && m.place.x <= e.x1 && m.place.z >= e.z0 && m.place.z <= e.z1);
  ok(!!a, `${m.id}: place is outside every engineering area`);
  ok(!!a && a.ground !== 'lake' && a.ground !== 'sea', `${m.id}: place is on water`);
  ok(m.questions.length > 0 && m.pass > 0 && m.pass <= 1, `${m.id}: questions / pass`);
  for (const q of m.questions) {
    if (q.kind === 'number') ok(q.answer !== undefined || (q.min !== undefined && q.max !== undefined), `${m.id}: number question without answer`);
    else ok(!!q.groups?.length, `${m.id}: text question without keyword groups`);
    ok(/[A-Za-z]/.test(q.q) && !/[\u0980-\u09FF]/.test(q.q + q.explain), `${m.id}: English only`);
    if (q.kind === 'number' && q.answer !== undefined) ok(checkNumber(q.answer, q), `${m.id}: own answer rejected`);
  }
  console.log(`${m.id.padEnd(18)} ${m.kind.padEnd(12)} (${m.place.x}, ${m.place.z}) in ${a?.id} · ${m.questions.length} questions`);
}
console.log(fail ? `${fail} FAILED` : 'missions: all ok');
process.exit(fail ? 1 : 0);

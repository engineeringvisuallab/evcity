// Checks the mission data and the answer parsing: npm run test:missions
import { MISSIONS } from '../src/missions/MissionData';
import { checkNumber, checkText, parseSpokenNumber } from '../src/missions/MissionVoice';
import { ENGINEERING_AREAS } from '../src/city/EngineeringZones';
import { EVLAB_PLOT } from '../src/evlab/EVLabSite';
import { HALL_SOON, HALL_TOPICS, pagesOf } from '../src/missions/HallTopics';
import { coverage, isStartPhrase, matchWords, pageMark, tokenize } from '../src/missions/HallScoring';

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
  if (m.kind === 'hall') {
    const inPlot = m.place.x >= EVLAB_PLOT.x0 && m.place.x <= EVLAB_PLOT.x1 && m.place.z >= EVLAB_PLOT.z0 && m.place.z <= EVLAB_PLOT.z1;
    ok(inPlot, `${m.id}: the hall entrance is outside the EVLab plot`);
    console.log(`${m.id.padEnd(18)} ${m.kind.padEnd(12)} (${m.place.x}, ${m.place.z}) in EVLab plot`);
    continue;
  }
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
  console.log(`${m.id.padEnd(18)} ${m.kind.padEnd(12)} (${m.place.x}, ${m.place.z}) in ${a?.id} - ${m.questions.length} questions`);
}

// --- presentation hall
for (const t of HALL_TOPICS) {
  const pages = pagesOf(t);
  ok(pages.length > 0, `${t.id}: no pages`);
  for (const sl of t.slides) {
    ok(sl.script.length % 3 === 0, `${t.id}/${sl.title}: script is not a multiple of 3 lines`);
    ok(!/[^\x00-\x7F\u2019]/.test(sl.script.join(' ')), `${t.id}/${sl.title}: English / ASCII only`);
    ok(sl.script.every((l) => l.split(' ').length <= 16), `${t.id}/${sl.title}: a line is too long to read comfortably`);
  }
  for (const pg of pages) {
    const words = pg.lines.flatMap((l) => tokenize(l));
    ok(coverage(words, matchWords(words, pg.lines.join(' '))) === 1, `${t.id}: reading a page exactly must give 100 %`);
    ok(coverage(words, matchWords(words, 'what a lovely day we are having today in the city')) < 0.3, `${t.id}: random talk must stay under 30 %`);
    ok(coverage(words, matchWords(words, '')) === 0, `${t.id}: silence must give 0`);
    const half = pg.lines.slice(0, 2).join(' ');
    const c = coverage(words, matchWords(words, half));
    ok(c > 0.4 && c < 0.9, `${t.id}: two of three lines should give a middle mark (got ${c.toFixed(2)})`);
  }
  console.log(`${t.id}: ${t.slides.length} slides, ${pages.length} pages`);
}
ok(HALL_SOON.some((t) => t.id === 'water-supply'), 'Water Supply must be in the coming soon list');
ok(isStartPhrase('good morning everyone') && isStartPhrase('okay start') && !isStartPhrase('banana tree'), 'start phrases');
ok(isStartPhrase('assalam alaikum'), 'salam starts');
ok(pageMark(0.2) === 0 && pageMark(0.8) === 0.8, 'page mark: noise earns nothing');
// a speech recogniser spells long words its own way
const pw = tokenize('Eid al-Fitr comes after Ramadan');
ok(coverage(pw, matchWords(pw, 'eid al fitr comes after ramazan')) === 1, 'fuzzy spelling');

console.log(fail ? `${fail} FAILED` : 'missions: all ok');
process.exit(fail ? 1 : 0);

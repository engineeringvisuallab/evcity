// STEP A2 (headless): ZONE WEIGHTS = population, jobs and daily trips of every zone of the map. Reads the world + the A1 raster, changes nothing in src/.
// Method (land use planning, simple and visible): developable land (A1 classes A, B, C, not water / rail / fixed road / fence) of the zone -> residential, commercial,
// industrial share -> floor area = net ha x coverage x floors x 0.8 (net / gross) -> persons = residential floor area / GFA per person, jobs = commercial floor area / GFA per job
// (or jobs per ha for industry). Housing areas of 19.1 get their own floors (mix of 5 / 10 / 20 floor buildings in the city). Trips = productions (home) and attractions (jobs).
// ALL parameters are PROPOSALS in the table PAR below: the user OKs the numbers, step A3 uses them for the demand and the lane ladder.
// REVISION 2026-11-15 (run 1 gave jobs / persons 1.12 = FAIL): mixed use (housing above shops: commercial zones res 0.10 -> 0.25, urban-core 0.25 -> 0.35), GFA per job 30 -> 40 m2 (gross, retail + services), engineering sites 35 -> 20 jobs / ha (campus-like labs, they are replaced later anyway). Run 2 gave productions / attractions 2.07 = FAIL: attractions also come from schools, local shops and parks inside residential areas, so +1.2 attractions per resident (TRIP.perResidentLocal).
// Run: npx tsx scripts/zone-weights.ts <out-dir>      needs docs/a1_buildability.json (step A1)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { getWorldZoneAt, WORLD_ZONES } from '../src/city/WorldZones';

const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });
const A1 = JSON.parse(readFileSync(`${out}/a1_buildability.json`, 'utf8'));
const CELL: number = A1.cell, HALF: number = A1.half, N: number = A1.n;
const HA = (CELL * CELL) / 10000;

interface Par { res: number; com: number; ind: number; cov: number; fl: number; gfaP: number; gfaJ: number; jobsHaInd: number }
// share of developable land used for residential / commercial / industrial (the rest = roads, parks, schools, utilities), coverage, floors, GFA per person, GFA per job
const P = (res: number, com: number, ind: number, cov: number, fl: number, gfaP = 35, gfaJ = 30, jobsHaInd = 0): Par => ({ res, com, ind, cov, fl, gfaP, gfaJ, jobsHaInd });
const PAR: Record<string, Par> = {
  'urban-core': P(0.35, 0.40, 0, 0.30, 12, 35, 40),
  commercial: P(0.25, 0.45, 0, 0.30, 6, 35, 40),
  residential: P(0.55, 0.08, 0, 0.25, 3, 35, 40),
  civic: P(0.05, 0.35, 0, 0.20, 4, 35, 40),
  education: P(0.20, 0.30, 0, 0.20, 4, 35, 40),
  industrial: P(0, 0, 0.60, 0, 0, 35, 30, 45),
  logistics: P(0, 0, 0.55, 0, 0, 35, 30, 25),
  utility: P(0, 0, 0.40, 0, 0, 35, 30, 8),
  village: P(0.35, 0.03, 0, 0.15, 1.3, 25),
  farmland: P(0.01, 0, 0, 0.10, 1, 25),
  forest: P(0, 0, 0, 0, 0), wetland: P(0, 0, 0, 0, 0), park: P(0, 0, 0, 0, 0), coast: P(0.02, 0.02, 0, 0.1, 1.5), mountain: P(0, 0, 0, 0, 0),
};
// housing areas of 19.1: floors come from a mix (share of 5 / 10 / 20 floor buildings in the city, 1-5 floors in the suburb)
const HOUSING: Record<string, { role: string; mix: [number, number, number]; fl?: number; cov: number; res: number; gfaP: number }> = {
  'se-dense': { role: 'H-C1 city', mix: [0.2, 0.4, 0.4], cov: 0.20, res: 0.55, gfaP: 35 },
  'west-homes': { role: 'H-C2 city', mix: [0.3, 0.5, 0.2], cov: 0.22, res: 0.55, gfaP: 35 },
  'sw-homes': { role: 'H-C2 city', mix: [0.3, 0.5, 0.2], cov: 0.22, res: 0.55, gfaP: 35 },
  'east-homes': { role: 'H-C3 city', mix: [0.6, 0.4, 0], cov: 0.22, res: 0.55, gfaP: 35 },
  'south-suburb': { role: 'H-S1 suburb', mix: [0, 0, 0], fl: 3, cov: 0.25, res: 0.60, gfaP: 40 },
  'east-suburb': { role: 'H-S2 suburb', mix: [0, 0, 0], fl: 3, cov: 0.25, res: 0.60, gfaP: 40 },
  'sw-newtown': { role: 'H-S3 suburb', mix: [0, 0, 0], fl: 3.5, cov: 0.25, res: 0.60, gfaP: 40 },
  'west-suburb': { role: 'H-S4 suburb', mix: [0, 0, 0], fl: 2.5, cov: 0.25, res: 0.60, gfaP: 40 },
  'north-homes': { role: 'H-S5 suburb', mix: [0, 0, 0], fl: 3, cov: 0.25, res: 0.60, gfaP: 40 },
};
// fenced facilities and engineering land (whole rectangle, any non-water cell): jobs per ha, truck trips per day (PROPOSAL)
const FAC: Record<string, { jobsHa: number; trucks: number }> = { airport: { jobsHa: 25, trucks: 1500 }, 'airport-sea': { jobsHa: 25, trucks: 800 }, seaport: { jobsHa: 40, trucks: 3000 }, army: { jobsHa: 5, trucks: 100 } };
const ENG = { jobsHa: 20, truckPerJob: 0.12 };
const TRIP = { perResident: 3.2, perJob: 2.4, perResidentLocal: 1.2, truckPerJobInd: 0.15, truckPerJobLog: 0.30 };

interface Z { id: string; kind: string; cells: number; devCells: number; ha: number; devHa: number; pop: number; jobs: number; fl: number; popHa: number; prod: number; attr: number; trucks: number; role?: string; sx: number; sz: number }
const Zs = new Map<string, Z>();
const get = (id: string, kind: string): Z => { let z = Zs.get(id); if (!z) { z = { id, kind, cells: 0, devCells: 0, ha: 0, devHa: 0, pop: 0, jobs: 0, fl: 0, popHa: 0, prod: 0, attr: 0, trucks: 0, sx: 0, sz: 0 }; Zs.set(id, z); } return z; };
const seed = new Map(WORLD_ZONES.map((z) => [z.id, z]));
const BG = 'background (outside every zone circle)';
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const c = A1.rows[j][i] as string; if (c === '~') continue;
  const x = -HALF + (i + 0.5) * CELL, z = -HALF + (j + 0.5) * CELL;
  const h = getWorldZoneAt(x, z);
  let id = h.id, kind = h.kind as string;
  const s = seed.get(id);
  if (s && Math.hypot(x - s.x, z - s.z) > s.w) { id = BG; kind = 'farmland'; }          // far from the seed: scattered farmland, not the dense zone
  const Zr = get(id, kind); Zr.cells++; Zr.ha += HA; Zr.sx += x; Zr.sz += z;
  if (c === 'A' || c === 'B' || c === 'C') { Zr.devCells++; Zr.devHa += HA; }
  if (kind === 'engineering' || FAC[id] || kind === 'airport' || kind === 'army' || kind === 'seaport') { if (c !== 'R' && c !== 'X') Zr.devHa += c === 'F' ? HA : 0; }
}
let totPop = 0, totJobs = 0;
for (const z of Zs.values()) {
  const hs = HOUSING[z.id];
  const fac = FAC[z.id] ?? (z.kind === 'engineering' ? { jobsHa: ENG.jobsHa, trucks: 0 } : null);
  if (fac) {
    z.jobs = z.devHa * fac.jobsHa; z.trucks = fac.trucks || z.jobs * ENG.truckPerJob; z.fl = 0;
  } else {
    const par = PAR[z.kind] ?? PAR.farmland;
    let fl = par.fl, cov = par.cov, res = par.res, gfaP = par.gfaP;
    if (hs) { fl = hs.fl ?? hs.mix[0] * 5 + hs.mix[1] * 10 + hs.mix[2] * 20; cov = hs.cov; res = hs.res; gfaP = hs.gfaP; z.role = hs.role; }
    z.fl = fl;
    z.pop = (z.devHa * res * 10000 * cov * fl * 0.8) / gfaP;
    const comJobs = (z.devHa * par.com * 10000 * par.cov * par.fl * 0.8) / par.gfaJ;
    const indJobs = z.devHa * par.ind * par.jobsHaInd;
    z.jobs = comJobs + indJobs;
    z.trucks = indJobs * (z.kind === 'logistics' ? TRIP.truckPerJobLog : TRIP.truckPerJobInd);
  }
  z.popHa = z.devHa > 0 ? z.pop / z.devHa : 0;
  z.prod = z.pop * TRIP.perResident; z.attr = z.jobs * TRIP.perJob + z.pop * TRIP.perResidentLocal;
  totPop += z.pop; totJobs += z.jobs;
}
const list = [...Zs.values()].filter((z) => z.pop > 0 || z.jobs > 0).sort((a, b) => b.pop + b.jobs - (a.pop + a.jobs));
const f0 = (v: number) => Math.round(v).toLocaleString('en-US');
console.log(`ZONE WEIGHTS (Step A2)   ALL numbers are PROPOSALS (table PAR in scripts/zone-weights.ts), the user OKs them; developable land = A1 classes A, B, C`);
console.log(`trips: ${TRIP.perResident} person trips / resident / day (home-based productions), ${TRIP.perJob} / job + ${TRIP.perResidentLocal} / resident (local services) / day (attractions); trucks from industrial / logistics jobs and the fixed facility numbers\n`);
console.log('zone                      kind         role          dev ha   floors   persons   per ha     jobs   prod/day  attr/day  trucks/day');
for (const z of list) console.log(`${z.id.slice(0, 25).padEnd(25)} ${z.kind.padEnd(12)} ${(z.role ?? '').padEnd(12)} ${f0(z.devHa).padStart(7)} ${z.fl ? z.fl.toFixed(1).padStart(8) : '       -'} ${f0(z.pop).padStart(9)} ${z.pop ? f0(z.popHa).padStart(8) : '       -'} ${f0(z.jobs).padStart(8)} ${f0(z.prod).padStart(9)} ${f0(z.attr).padStart(9)} ${f0(z.trucks).padStart(10)}`);
const totP = list.reduce((s, z) => s + z.prod, 0), totA = list.reduce((s, z) => s + z.attr, 0), totT = list.reduce((s, z) => s + z.trucks, 0);
console.log(`\nTOTAL persons ${f0(totPop)}, jobs ${f0(totJobs)} (jobs / persons ${(totJobs / totPop).toFixed(2)}), productions ${f0(totP)}, attractions ${f0(totA)} (ratio ${(totP / totA).toFixed(2)}), trucks / day ${f0(totT)}`);
const city = ['se-dense', 'west-homes', 'sw-homes', 'east-homes'], sub = ['south-suburb', 'east-suburb', 'sw-newtown', 'west-suburb', 'north-homes'];
const g = (id: string) => Zs.get(id)!;
console.log('\nHOUSING (19.1): persons and net persons per developable ha');
for (const id of [...city, ...sub]) console.log(`  ${id.padEnd(14)} ${g(id).role!.padEnd(12)} floors ${g(id).fl.toFixed(1)}  dev ${f0(g(id).devHa)} ha  persons ${f0(g(id).pop).padStart(7)}  ${f0(g(id).popHa)} per ha`);
let pass = 0, fail = 0; const chk = (ok: boolean, t: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${t}`); ok ? pass++ : fail++; };
console.log('\nCHECKS (plausibility of the proposal, numbers only)');
chk(totJobs / totPop >= 0.35 && totJobs / totPop <= 0.80, `jobs / persons ${(totJobs / totPop).toFixed(2)} inside 0.35-0.80 (a working city: about 1 job per 2 people)`);
chk(totP / totA >= 0.6 && totP / totA <= 1.6, `productions / attractions ${(totP / totA).toFixed(2)} inside 0.6-1.6 (A3 balances the rest by scaling)`);
chk(city.every((id) => g(id).popHa >= 150), `every city housing has >= 150 persons per developable ha (dense)`);
chk(sub.every((id) => g(id).popHa >= 40 && g(id).popHa <= 110), `every suburb housing has 40-110 persons per developable ha (1-5 floors)`);
chk(Math.min(...city.map((id) => g(id).popHa)) > Math.max(...sub.map((id) => g(id).popHa)), `densest suburb < thinnest city housing (gradual change 3.14)`);
chk(['village-west', 'village-east', 'village-sw', 'village-ne'].every((id) => !Zs.has(id) || g(id).popHa <= 40), `villages <= 40 persons per developable ha (green, low)`);
console.log(`\n${pass} PASS, ${fail} FAIL (numbers only; no src/ file changed; game NOT run)`);
writeFileSync(`${out}/a2_zone_weights.json`, JSON.stringify({ params: { PAR, HOUSING, FAC, ENG, TRIP }, totals: { pop: totPop, jobs: totJobs, prod: totP, attr: totA, trucks: totT }, zones: list.map((z) => ({ ...z, cx: z.sx / z.cells, cz: z.sz / z.cells })) }));

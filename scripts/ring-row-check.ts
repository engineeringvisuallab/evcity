// STEP 4.4 (headless): ROW boundary, clear-zone lines and fence line of the ring (M8), with geometry checks and a zone check.
// Run: npx tsx scripts/ring-row-check.ts [out.json]     out.json = the lines (x, z every 5 m) for the picture / for the game later.
import { writeFileSync } from 'node:fs';
import { SECTION_M8 as S } from '../src/roads/standards/SectionTable';
import { buildAlignment, sampleAlignment } from '../src/roads/alignment/PiAlignment';
import { RING_PIS } from '../src/roads/alignment/RingAlignment';
import { getWorldZoneAt, BUILT_UP_KINDS } from '../src/city/WorldZones';

const FENCE_INSET = 0.5; // PROJECT ASSUMPTION: fence line 0.5 m inside the ROW line, so posts stay on our land
const MAP_HALF = 5000;   // map is 10 km x 10 km, centre 0,0
let fails = 0;
const L = (s = '') => console.log(s);
const f = (v: number, d = 1) => v.toFixed(d);
function check(label: string, ok: boolean, detail: string): void { if (!ok) fails++; L(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(60)} ${detail}`); }

const el = (k: string) => S.elements.find((e) => e.kind === k)!;
const D = {
  pavement: S.pavementEdge, clearIn: el('clear-zone').from, clearOut: el('clear-zone').to, row: S.rowHalf, fence: S.rowHalf - FENCE_INSET,
};
const al = buildAlignment([...RING_PIS]);
const { ds, samples } = sampleAlignment(al, 5);
const n = samples.length, len = al.length;
const totalTurn = al.rows.reduce((a, r) => a + r.delta, 0);
const turnSign = totalTurn > 0 ? 1 : -1; // +1: the +normal side is the INNER side of the ring

interface Line { name: string; sigma: number; d: number; x: Float64Array; z: Float64Array }
const lines: Line[] = [];
for (const [nm, d] of [['pavement edge', D.pavement], ['clear zone inner (ditch top)', D.clearIn], ['clear zone outer', D.clearOut], ['fence', D.fence], ['ROW boundary', D.row]] as Array<[string, number]>) {
  for (const sigma of [1, -1]) {
    const x = new Float64Array(n), z = new Float64Array(n);
    samples.forEach((p, i) => { x[i] = p.x + sigma * d * -Math.sin(p.h); z[i] = p.z + sigma * d * Math.cos(p.h); });
    lines.push({ name: `${nm} ${sigma === turnSign ? '(inner side of the ring)' : '(outer side of the ring)'}`, sigma, d, x, z });
  }
}
const lenOf = (ln: Line) => { let a = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += Math.hypot(ln.x[j] - ln.x[i], ln.z[j] - ln.z[i]); } return a; };
const areaOf = (ln: Line) => { let a = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += ln.x[i] * ln.z[j] - ln.x[j] * ln.z[i]; } return Math.abs(a) / 2; };

L(`=== 4.4 RING ROW, CLEAR ZONE AND FENCE (M8) ===`);
L(`  ring ${f(len / 1000, 3)} km, ${n} stations every ${f(ds, 3)} m; the +normal side is the ${turnSign > 0 ? 'INNER' : 'OUTER'} side of the ring (total turn ${f((totalTurn * 180) / Math.PI, 1)} deg)`);
L(`  offsets from the centreline: pavement edge ${D.pavement}, clear zone ${D.clearIn}-${D.clearOut} (${f(D.clearOut - D.clearIn)} m), fence ${D.fence} (assumption: ${FENCE_INSET} m inside the ROW line), ROW boundary ${D.row}`);

L('\n=== Line lengths (closed loops) ===');
L('  line                                                      offset   length m   expected L -+ 2 pi d   difference');
const dev: number[] = [];
for (const ln of lines) {
  const inner = ln.sigma === turnSign;
  const expect = len + (inner ? -1 : 1) * 2 * Math.PI * ln.d;
  const got = lenOf(ln);
  dev.push(Math.abs(got / expect - 1));
  L(`  ${ln.name.padEnd(56)} ${f(ln.d).padStart(5)} ${f(got, 0).padStart(10)} ${f(expect, 0).padStart(14)} ${f(got - expect, 2).padStart(16)}`);
}
check('every line length = ring length -+ 2 pi d (net turn 360 deg)', Math.max(...dev) < 0.0005, `worst ${f(Math.max(...dev) * 100, 4)} %`);

L('\n=== Geometry checks ===');
// 1. distance of each ROW / fence vertex to the centreline polyline
let worstLow = Infinity, worstHigh = 0;
const cell = 100;
const grid = new Map<number, number[]>();
const key = (cx: number, cz: number) => (cx + 5000) * 20000 + (cz + 5000);
samples.forEach((p, i) => { const k = key(Math.floor(p.x / cell), Math.floor(p.z / cell)); const a = grid.get(k); if (a) a.push(i); else grid.set(k, [i]); });
const dist2seg = (px: number, pz: number, i: number) => {
  const a = samples[i], b = samples[(i + 1) % n];
  const vx = b.x - a.x, vz = b.z - a.z; const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (pz - a.z) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (a.x + t * vx), pz - (a.z + t * vz));
};
for (const ln of lines.filter((l) => l.d === D.row || l.d === D.fence)) {
  for (let i = 0; i < n; i += 3) {
    const cx = Math.floor(ln.x[i] / cell), cz = Math.floor(ln.z[i] / cell);
    let m = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of grid.get(key(cx + dx, cz + dz)) ?? []) { m = Math.min(m, dist2seg(ln.x[i], ln.z[i], j), dist2seg(ln.x[i], ln.z[i], (j - 1 + n) % n)); }
    if (ln.d === D.row) { worstLow = Math.min(worstLow, m); worstHigh = Math.max(worstHigh, m); }
  }
}
check('ROW line is 40 m from the centreline everywhere (nearest point)', worstLow > D.row - 0.1 && worstHigh < D.row + 0.1, `${f(worstLow, 3)} to ${f(worstHigh, 3)} m`);
// 2. area between the two ROW loops = ROW area
const rowIn = lines.find((l) => l.d === D.row && l.sigma === turnSign)!, rowOut = lines.find((l) => l.d === D.row && l.sigma !== turnSign)!;
const areaCorridor = areaOf(rowOut) - areaOf(rowIn);
check('area between outer and inner ROW loop = 80 m x ring length', Math.abs(areaCorridor / (2 * D.row * len) - 1) < 0.002, `${f(areaCorridor / 1e4, 1)} ha vs ${f((2 * D.row * len) / 1e4, 1)} ha`);
const clearIn = lines.find((l) => l.d === D.clearOut && l.sigma === turnSign)!, clearOut = lines.find((l) => l.d === D.clearOut && l.sigma !== turnSign)!;
void clearIn; void clearOut;
// 3. clear zone area per side = 7.8 m x length (with the +-d/R effect cancelling over a closed loop only partly: use the loop areas)
for (const sigma of [1, -1]) {
  const a = lines.find((l) => l.d === D.clearOut && l.sigma === sigma)!, b = lines.find((l) => l.d === D.clearIn && l.sigma === sigma)!;
  const ar = Math.abs(areaOf(a) - areaOf(b));
  const exp = (D.clearOut - D.clearIn) * len + (sigma === turnSign ? -1 : 1) * Math.PI * (D.clearOut ** 2 - D.clearIn ** 2);
  check(`clear zone strip area, ${sigma === turnSign ? 'inner' : 'outer'} side (7.8 m wide)`, Math.abs(ar / exp - 1) < 0.002, `${f(ar / 1e4, 2)} ha vs ${f(exp / 1e4, 2)} ha`);
}
// 4. map edge
let ext = 0;
for (const ln of lines.filter((l) => l.d === D.row)) for (let i = 0; i < n; i++) ext = Math.max(ext, Math.abs(ln.x[i]), Math.abs(ln.z[i]));
check('ROW line stays inside the 10 km map', ext < MAP_HALF, `farthest ROW point ${f(ext, 0)} m from the map centre (edge at ${MAP_HALF})`);

L('\n=== Zones touched by the corridor (offsets -40, -32, -24.2, 0, +24.2, +32, +40 at every station) ===');
const OFFS = [-D.row, -D.clearOut, -D.clearIn, 0, D.clearIn, D.clearOut, D.row];
interface Hit { id: string; kind: string }
const hitsAt = (i: number): Hit[] => {
  const p = samples[i], nx = -Math.sin(p.h), nz = Math.cos(p.h);
  const seen = new Map<string, Hit>();
  for (const o of OFFS) { const h = getWorldZoneAt(p.x + nx * o, p.z + nz * o); seen.set(h.id, { id: h.id, kind: h.kind }); }
  return [...seen.values()];
};
interface Rng { id: string; kind: string; a: number; b: number }
const open = new Map<string, Rng>(); const done: Rng[] = [];
for (let i = 0; i < n; i++) {
  const ids = new Set(hitsAt(i).map((h) => h.id));
  for (const h of hitsAt(i)) { const r = open.get(h.id); if (r) r.b = samples[i].s; else open.set(h.id, { id: h.id, kind: h.kind, a: samples[i].s, b: samples[i].s }); }
  for (const [k, r] of open) if (!ids.has(k)) { done.push(r); open.delete(k); }
}
done.push(...open.values());
done.sort((p, q) => p.a - q.a);
const builtUp = done.filter((r) => BUILT_UP_KINDS.has(r.kind as never));
const special = done.filter((r) => ['engineering', 'airport', 'army', 'seaport'].includes(r.kind) || r.id.startsWith('sea'));
L(`  ${done.length} zone stretches along the corridor, ${builtUp.length} of them built-up kinds (houses, shops, factories will be placed there later), ${special.length} engineering / facility / sea`);
for (const r of done) L(`   stations ${f(r.a, 0).padStart(6)} - ${f(r.b, 0).padStart(6)}  ${f(r.b - r.a + ds, 0).padStart(5)} m   ${r.id} (${r.kind})${BUILT_UP_KINDS.has(r.kind as never) ? '   [built-up: keep buildings out of the 80 m ROW]' : ''}`);
const seaHit = done.filter((r) => r.id.startsWith('sea'));
const facHit = done.filter((r) => ['airport', 'army', 'seaport'].includes(r.kind));
check('no sea or facility fence area inside the corridor', seaHit.length === 0 && facHit.length === 0, `${seaHit.length} sea stretches, ${facHit.length} facility stretches`);
const eng = done.filter((r) => r.kind === 'engineering');
// how far does each engineering area (a fenced rectangle, EngineeringFence.ts) reach into the corridor? centreline inside = the ring cuts the area in two
const engCentre = new Map<string, { a: number; b: number; n: number }>();
for (let i = 0; i < n; i++) { const h = getWorldZoneAt(samples[i].x, samples[i].z); if (h.kind !== 'engineering') continue; const r = engCentre.get(h.id) ?? { a: samples[i].s, b: samples[i].s, n: 0 }; r.b = samples[i].s; r.n++; engCentre.set(h.id, r); }
check('no engineering area inside the corridor', eng.length === 0, eng.length ? eng.map((r) => `${r.id} ${f(r.a, 0)}-${f(r.b, 0)}`).join('; ') : 'none');
for (const [id, r] of engCentre) L(`        ${id}: the CENTRELINE is inside the fenced rectangle from station ${f(r.a, 0)} to ${f(r.b, 0)} (${f(r.n * ds, 0)} m), so the ring cuts this area in two`);
const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify({ ds, offsets: D, lines: lines.map((l) => ({ name: l.name, d: l.d, sigma: l.sigma, x: Array.from(l.x, (v) => +v.toFixed(2)), z: Array.from(l.z, (v) => +v.toFixed(2)) })) }));
L(`\n${fails === 0 ? 'ALL CHECKS PASS' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);

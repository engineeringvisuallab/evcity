// STEP 2.4 (headless): samples the ring every 5 m (CSV), marks every 100 m, and finds where the four radials (N, E, S, W) meet the ring.
// Run: npx tsx scripts/ring-samples.ts <out-dir>      writes ring_samples_5m.csv and ring_overlay.json into <out-dir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildAlignment, sampleAlignment, poseAt } from '../src/roads/alignment/PiAlignment';
import { RING_PIS, RING_DESIGN_SPEED as V } from '../src/roads/alignment/RingAlignment';
import { REF_NORTH, REF_EAST, REF_SOUTH, REF_WEST } from '../src/roads/reference/RefShapes';

const al = buildAlignment([...RING_PIS]);
const { ds, samples } = sampleAlignment(al, 5);
const out = process.argv[2] ?? '.';
mkdirSync(out, { recursive: true });
const deg = (r: number) => (((r * 180) / Math.PI) % 360 + 360) % 360;

// ---- CSV: station, game x, game z, easting, northing, heading (deg, 0 = east, clockwise on the map = increasing), curvature (1/m, + = clockwise), radius, kind
const rows = ['station_m,x,z,easting,northing,heading_deg,curvature_1_per_m,radius_m,kind'];
for (const s of samples) rows.push([s.s.toFixed(3), s.x.toFixed(3), s.z.toFixed(3), (s.x + 5000).toFixed(3), (5000 - s.z).toFixed(3), deg(s.h).toFixed(4), s.k.toExponential(5), s.k === 0 ? '' : (1 / Math.abs(s.k)).toFixed(1), s.kind].join(','));
writeFileSync(`${out}/ring_samples_5m.csv`, rows.join('\n') + '\n');
console.log(`ring_samples_5m.csv: ${samples.length} rows, ds ${ds.toFixed(3)} m, length ${al.length.toFixed(1)} m`);

// ---- marks every 100 m
const marks: Array<{ s: number; x: number; z: number; h: number }> = [];
for (let s = 0; s < al.length; s += 100) { const p = poseAt(al, s); marks.push({ s, x: p.x, z: p.z, h: p.h }); }

// ---- radials: the far end of each reference radial (the end that is NOT at the city centre) gives the place where it meets the ring.
const ends = (a: readonly number[]) => { const n = a.length; const d0 = Math.hypot(a[0], a[1]); const d1 = Math.hypot(a[n - 2], a[n - 1]); return d0 > d1 ? { x: a[0], z: a[1], px: a[2], pz: a[3] } : { x: a[n - 2], z: a[n - 1], px: a[n - 4], pz: a[n - 3] }; };
const radials: Array<[string, readonly number[]]> = [['N', REF_NORTH], ['E', REF_EAST], ['S', REF_SOUTH], ['W', REF_WEST]];
const straights = al.elements.filter((e) => e.kind === 'straight');
const joins: Array<Record<string, number | string>> = [];
/** Nearest station to s0 that has CLEAR straight on both sides (clear = 500 m: exit lane 116 + taper 91 and entry lane 241 + taper 183, rounded). */
const CLEAR = 500;
const suggest = (s0: number) => {
  let best = NaN, bd = Infinity;
  for (const q of straights) {
    if (q.length < 2 * CLEAR) continue;
    for (const k of [-1, 0, 1]) { // the band also exists one lap before / after (the loop wraps around station 0)
      const lo = q.s0 + CLEAR + k * al.length, hi = q.s0 + q.length - CLEAR + k * al.length;
      const c = Math.min(Math.max(s0, lo), hi);
      const d = Math.abs(c - s0);
      if (d < bd) { bd = d; best = ((c % al.length) + al.length) % al.length; }
    }
  }
  return { s: best, shift: bd };
};
console.log('\nRadial meeting points on the new ring (nearest point to the end of the reference radial)');
console.log('  dir  station   x        z        ring heading  approach   element      straight range (clear before / after)    ref end -> ring');
for (const [name, arr] of radials) {
  const e = ends(arr);
  let best = 0, bd = Infinity;
  for (let i = 0; i < samples.length; i++) { const d = Math.hypot(samples[i].x - e.x, samples[i].z - e.z); if (d < bd) { bd = d; best = i; } }
  const p = samples[best];
  const rh = Math.atan2(e.z - e.pz, e.x - e.px); // direction of the radial when it arrives at the ring
  let ang = Math.abs(((rh - p.h) * 180) / Math.PI) % 180; if (ang > 90) ang = 180 - ang; // angle between the two lines, 0..90
  const st = straights.find((q) => p.s >= q.s0 && p.s <= q.s0 + q.length);
  const where = st ? `straight ${st.s0.toFixed(0)}-${(st.s0 + st.length).toFixed(0)} (${(p.s - st.s0).toFixed(0)} / ${(st.s0 + st.length - p.s).toFixed(0)})` : `in curve (${p.kind})`;
  console.log(`  ${name}   ${p.s.toFixed(0).padStart(7)} ${p.x.toFixed(1).padStart(8)} ${p.z.toFixed(1).padStart(8)}   ${deg(p.h).toFixed(1).padStart(8)} deg  ${ang.toFixed(0).padStart(4)} deg   ${p.kind.padEnd(10)}  ${where.padEnd(46)} ${bd.toFixed(0)} m`);
  const sg = suggest(p.s);
  const sp = poseAt(al, sg.s);
  console.log(`       suggested (>= ${CLEAR} m clear straight each side): station ${sg.s.toFixed(0)} at x ${sp.x.toFixed(1)}, z ${sp.z.toFixed(1)}, shift along the ring ${sg.shift.toFixed(0)} m`);
  joins.push({ sugS: sg.s, sugX: sp.x, sugZ: sp.z, sugShift: sg.shift, dir: name, s: p.s, x: p.x, z: p.z, h: p.h, refEndX: e.x, refEndZ: e.z, dist: bd, angle: ang, kind: p.kind, straight: st ? `${st.s0.toFixed(0)}-${(st.s0 + st.length).toFixed(0)}` : '' });
}
const ss = joins.map((j) => j.s as number).sort((a, b) => a - b);
console.log('\n  spacing between neighbouring junctions (m): ' + ss.map((s, i) => ((ss[(i + 1) % ss.length] - s + al.length) % al.length).toFixed(0)).join(', ') + `   (rule: >= 1600 m urban)`);
writeFileSync(`${out}/ring_overlay.json`, JSON.stringify({ length: al.length, ds, samples: samples.filter((_, i) => i % 2 === 0).map((s) => [s.x, s.z, s.s]), marks, joins, pis: RING_PIS, V }));

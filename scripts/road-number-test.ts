// ROAD NUMBERS Step 1: headless checks (no three.js, no DOM). Run: npx tsx scripts/road-number-test.ts
//   1. every road has a code, a class and a plate size that fits its lane
//   2. the label stands on the road, in the right lane, 100 mm above the road surface, never on the median
//   3. it follows a camera that drives along a road (slides, stays one plate per road), turns round only when the camera turns round
//   4. the nearest-point search with a hint gives the same answer as the full search
//   5. (Step 2 / 4) the on/off setting: default OFF, saved and loaded, old saves without it stay off, the menu row and the Engine hook exist
//   6. (Step 3) the plate keeps off junction pads and bridge ends, bends with the road (no folding), lies on the road height
//   8. (Step 5) junction numbers: one plate J<id> in the middle of every junction pad, on the pad plane, readable, not touching the short-link plates
//   7. (Step 4) every road gets a label (short links inside junction pads too, on the pad plane); a high camera (plane, drone) keeps the labels
import { readFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { HUD_DEFAULTS, HudSettings } from '../src/ui/HudSettings';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { laneWidth, lanesPerDir, isDivided } from '../src/roads/RoadSection';
import {
  BRIDGE_END_M, buildRoadIndex, chooseRoads, chooseJunctions, constrainS, fitToPads, heightOk, hideRadius, JUNCTION_KEEP_M, JUNCTION_PLATE_H, JUNCTION_PLATE_W, junctionCode, junctionCorners, junctionDir, labelLane, labelLimit, labelOffset, lowestY, MAX_LABELS, MAX_LABELS_AIR, nearestOnRoad, newLabelState, padRadius, placeLabel, pointAt, ROAD_NUMBER_LIFT_M, showRadius, STRIP_FLOATS,
  STRIP_ROWS, stripVertices, styleOf,
  type NumberRoad,
} from '../src/roads/RoadNumberPlan';

let failed = 0;
const ok = (c: boolean, m: string): void => { if (!c) failed++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); };
const note = (m: string): void => console.log(`NOTE ${m}`);

const gen = new TerrainGenerator(Config.world.seed);
const roads: NumberRoad[] = gen.roads.roads;
note(`${roads.length} roads`);

console.log('\n=== 1. STYLE ===');
{
  const idx = buildRoadIndex(roads);
  ok(idx.length === roads.length, `every road is indexed (${idx.length} of ${roads.length}; roads without a name or points would be skipped)`);
  const classes = new Map<string, number>();
  let bad = 0;
  const names = new Set<string>();
  for (const r of roads) {
    const st = styleOf(r);
    classes.set(st.cls, (classes.get(st.cls) ?? 0) + 1);
    names.add(r.name);
    if (!(st.across >= 1.8 && st.across <= 2.8) || st.across > laneWidth(r) * 1.01 + 0.9 || st.along < st.across) bad++;
    if (!/^[A-Za-z]{1,3}\d{1,3}[A-Za-z]?$/.test(r.name)) note(`unusual code "${r.name}" (road ${r.id})`);
  }
  ok(bad === 0, `plate size fits every lane (${bad} bad)`);
  note(`classes: ${[...classes].map(([k, v]) => `${k} ${v}`).join(', ')}; ${names.size} different codes`);
  ok(names.size > 5, 'many different road codes');
}

console.log('\n=== 2. POSITION ===');
{
  let bad = 0;
  let badLift = 0;
  let badLane = 0;
  let divided = 0;
  for (const r of roads) {
    if (r.length < 30) continue;
    const st = newLabelState();
    const mid = pointAt(r, r.length / 2);
    const pose = placeLabel(r, st, { x: mid.x + mid.nx * 5, y: mid.y + 2, z: mid.z + mid.nz * 5, fx: mid.tx, fz: mid.tz }, 0.016);
    if (!pose) { bad++; continue; }
    // lift: the label centre is 0.1 m above the centreline height of its segment (the road is flat across)
    const p = pointAt(r, pose.s);
    if (Math.abs(pose.y - (p.y + ROAD_NUMBER_LIFT_M)) > 1e-6) badLift++;
    // lateral offset from the centreline must be the middle-lane centre and inside the asphalt, outside the median
    const lat = Math.abs((pose.x - p.x) * p.nx + (pose.z - p.z) * p.nz);
    if (Math.abs(lat - labelOffset(r)) > 0.01) badLane++;
    const half = styleOf(r).across / 2;
    if (lat - half < r.medianHalf - 1e-6 || lat + half > r.halfWidth + 1e-6) badLane++;
    if (isDivided(r)) divided++;
    // the camera was on the left (+5): the label must be on the left
    if ((pose.x - p.x) * p.nx + (pose.z - p.z) * p.nz <= 0) bad++;
  }
  ok(bad === 0, `label is placed on the camera's side for every road (${bad} bad)`);
  ok(badLift === 0, `label is exactly ${ROAD_NUMBER_LIFT_M * 1000} mm above the road height (${badLift} bad)`);
  ok(badLane === 0, `label sits in the middle lane, inside the asphalt, never on the median (${badLane} bad; ${divided} divided roads)`);
  const r3 = roads.find((r) => isDivided(r) && lanesPerDir(r) === 3);
  if (r3) ok(labelLane(r3) === 1, `6-lane road: the middle lane (k = ${labelLane(r3)}), offset ${labelOffset(r3).toFixed(2)} m from the centreline`);
}

console.log('\n=== 3. FOLLOWS THE CAMERA ===');
{
  // the longest road: drive along it at 25 m/s, 60 frames per second, camera 4 m above the road centreline
  const r = roads.reduce((a, b) => (b.length > a.length ? b : a));
  const st = newLabelState();
  let prevS = NaN;
  let maxJump = 0;
  let flips = 0;
  let lastDir = 0;
  let offRoad = 0;
  let sMin = Infinity;
  let sMax = -Infinity;
  const dt = 1 / 60;
  for (let s = 100; s < Math.min(r.length - 100, 1600); s += 25 * dt) {
    const p = pointAt(r, s);
    const pose = placeLabel(r, st, { x: p.x, y: p.y + 4, z: p.z, fx: p.tx, fz: p.tz }, dt);
    if (!pose) { offRoad++; continue; }
    if (Number.isFinite(prevS)) maxJump = Math.max(maxJump, Math.abs(st.s - prevS));
    prevS = st.s;
    if (lastDir !== 0 && st.dir !== lastDir) flips++;
    lastDir = st.dir;
    sMin = Math.min(sMin, st.s);
    sMax = Math.max(sMax, st.s);
    const d = Math.hypot(pose.x - p.x, pose.z - p.z);
    if (d > r.halfWidth + 1) offRoad++;
  }
  ok(maxJump < 1.0, `the label slides, never jumps (largest step ${maxJump.toFixed(2)} m per frame at 25 m/s)`);
  ok(flips === 0, `driving one way: the text never turns round (${flips} flips)`);
  ok(offRoad === 0, `the label stays within the road width of the camera line (${offRoad} bad)`);
  ok(sMax - sMin > 500, `the label travelled with the camera (${(sMax - sMin).toFixed(0)} m)`);

  // turning round: camera looks against the road -> exactly one flip, then stable
  const q = pointAt(r, 400);
  const st2 = newLabelState();
  const cam = (fx: number, fz: number) => ({ x: q.x, y: q.y + 4, z: q.z, fx, fz });
  placeLabel(r, st2, cam(q.tx, q.tz), dt);
  const d0 = st2.dir;
  placeLabel(r, st2, cam(q.tx * 0.2 + q.nx * 0.97, q.tz * 0.2 + q.nz * 0.97), dt); // looking sideways: no flip
  ok(st2.dir === d0, 'looking sideways does not turn the text');
  placeLabel(r, st2, cam(-q.tx, -q.tz), dt);
  ok(st2.dir === -d0, 'looking back along the road turns the text round');
  placeLabel(r, st2, cam(0, 0), dt);
  ok(st2.dir === -d0, 'looking straight down keeps it as it is');

  // camera on the other side of the road: the label changes side only when the camera is clearly across (> 3 m)
  const st3 = newLabelState();
  const at = (lat: number) => placeLabel(r, st3, { x: q.x + q.nx * lat, y: q.y + 4, z: q.z + q.nz * lat, fx: q.tx, fz: q.tz }, dt);
  at(2);
  const side0 = st3.side;
  at(-1.5);
  ok(st3.side === side0, 'a small step over the centreline does not change the side (no flicker)');
  at(-6);
  ok(st3.side === -side0, 'the camera clearly on the other side: the label moves to that side');
}

console.log('\n=== 4. NEAREST POINT ===');
{
  let bad = 0;
  let n = 0;
  for (const r of roads) {
    if (r.length < 200) continue;
    const a = pointAt(r, r.length * 0.37);
    const full = nearestOnRoad(r, a.x + 7, a.z + 3);
    const hinted = nearestOnRoad(r, a.x + 7, a.z + 3, Math.max(0, full.i - 20));
    n++;
    if (Math.abs(full.s - hinted.s) > 0.01) bad++;
  }
  ok(bad === 0, `a search with a hint gives the same point as the full search (${n} roads, ${bad} different)`);

  // cost: 12 near roads per frame
  const long = roads.slice().sort((a, b) => b.xs.length - a.xs.length).slice(0, MAX_LABELS);
  const t0 = Date.now();
  for (let k = 0; k < 2000; k++) for (const r of long) nearestOnRoad(r, r.xs[0] + k, r.zs[0], 100);
  note(`2000 frames x ${long.length} roads with a hint: ${Date.now() - t0} ms in total`);
  const t1 = Date.now();
  const idx = buildRoadIndex(roads);
  for (let k = 0; k < 200; k++) for (const e of idx) if (!(2000 < e.minX - 140 || 2000 > e.maxX + 140 || 2000 < e.minZ - 140 || 2000 > e.maxZ + 140)) nearestOnRoad(e.road, 2000 + k, 2000);
  note(`200 searches of the near-roads list (full scan): ${Date.now() - t1} ms`);
}

console.log('\n=== 5. ON / OFF SETTING (Step 2) ===');
{
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  ok(HUD_DEFAULTS.roadNumbers === false, 'default: road numbers are OFF');
  const a = new HudSettings();
  ok(a.values.roadNumbers === false, 'a new player starts with road numbers off');
  let heard = 0;
  a.onChange(() => heard++);
  a.set('roadNumbers', true);
  ok(a.values.roadNumbers === true && heard === 1, 'switching on changes the value and tells the listeners');
  a.set('roadNumbers', true);
  ok(heard === 1, 'setting the same value again tells nobody');
  ok(JSON.parse(store.get('evcity.settings') ?? '{}').roadNumbers === true, 'the choice is saved in the browser');
  ok(new HudSettings().values.roadNumbers === true, 'after a reload it is still on');
  a.set('roadNumbers', false);
  ok(new HudSettings().values.roadNumbers === false, 'switched off again: saved off');
  store.set('evcity.settings', JSON.stringify({ crosshair: false, muted: true }));
  const old = new HudSettings();
  ok(old.values.roadNumbers === false && old.values.crosshair === false && old.values.muted === true, 'an old save without the key keeps its other choices and road numbers stay off');
  store.set('evcity.settings', JSON.stringify({ roadNumbers: 'no' }));
  ok(new HudSettings().values.roadNumbers === false, 'a broken value (not true / false) falls back to off');
  store.set('evcity.settings', '{not json');
  ok(new HudSettings().values.roadNumbers === false, 'a broken save falls back to off');

  const menu = readFileSync('src/ui/SettingsMenu.ts', 'utf8');
  ok(/key: 'roadNumbers', label: '[^']+'/.test(menu) && /'areaAlways' \| 'roadNumbers'/.test(menu), 'the Settings menu has the row (key roadNumbers) in the "screen" list');
  const eng = readFileSync('src/core/Engine.ts', 'utf8');
  ok(/roadNumbers\.enabled !== this\.hudSettings\.values\.roadNumbers/.test(eng) && /roadNumbers\.setEnabled\(this\.hudSettings\.values\.roadNumbers\)/.test(eng), 'the Engine passes the setting to the view every frame (only calls setEnabled on a change)');
}

console.log('\n=== 6. KEEP-OUT, BENDING PLATE, HILLS (Step 3) ===');
{
  const pads = gen.roads.pads;
  const bridges = gen.roads.bridges;
  const idx = buildRoadIndex(roads, pads, bridges);
  note(`${pads.length} junction pads, ${bridges.length} bridges`);
  const blockedRoads = idx.filter((e) => e.blocked.length > 0).length;
  const noLabel = idx.filter((e) => !e.labelOk);
  note(`${blockedRoads} roads have blocked stretches; ${noLabel.length} roads get no label (${noLabel.map((e) => `${e.road.name}:${e.road.length.toFixed(0)}m`).slice(0, 12).join(' ')}${noLabel.length > 12 ? ' ...' : ''})`);
  ok(pads.length === 0 || blockedRoads > 0, 'junction pads do block stretches of road');
  ok(idx.length - noLabel.length >= idx.length * 0.9, `at least 90 % of the roads can get a label (${idx.length - noLabel.length} of ${idx.length})`);
  ok(noLabel.every((e) => e.road.length < 200 || e.blocked.length > 0), 'a road with no free spot is a short road or one that is blocked (no road is lost for no reason)');
  ok(noLabel.length === 0, `Step 4: every road gets a label (${noLabel.length} without)`);

  // constrainS on small cases
  ok(constrainS(50, 2, 100, []) === 50, 'constrainS: a free spot stays where it is');
  ok(constrainS(1, 2, 100, []) === 2 && constrainS(99, 2, 100, []) === 98, 'constrainS: the whole plate stays on the road (ends)');
  ok(constrainS(48, 2, 100, [[45, 60]]) === 43, 'constrainS: blocked 45..60, wanted 48 -> the near edge before it (43)');
  ok(constrainS(58, 2, 100, [[45, 60]]) === 62, 'constrainS: blocked 45..60, wanted 58 -> the near edge after it (62)');
  ok(Number.isNaN(constrainS(50, 2, 100, [[1, 99]])), 'constrainS: no free spot gives NaN');
  ok(constrainS(30, 2, 100, [[20, 40], [41, 60]]) === 18, 'constrainS: two blocks close together (a gap too small for the plate): the nearest free spot is before them (18)');
  ok(constrainS(50, 2, 100, [[10, 98]]) === 8, 'constrainS: blocked 10..98 on a 100 m road: the only free spot is at 8 (far from the wanted 50)');
  ok(constrainS(30, 2, 100, [[0, 29], [29.5, 70]]) === 72, 'constrainS: edge of the first block is not free (the second block is right there): it goes to the far edge (72)');

  // every road, 60 camera spots: the plate never touches a blocked stretch, a pad outline, a bridge end
  let overlapS = 0;
  let inPad = 0;
  let bridgeBad = 0;
  let folded = 0;
  let asked = 0;
  let given = 0;
  let wide = 0;
  let heightOff = 0;
  let heightChecked = 0;
  let maxDev = 0;
  const buf = new Float32Array(STRIP_FLOATS);
  // does the asphalt of another road lie at (x, z)? (bounding boxes first, then the exact distance to the centreline)
  const otherRoadHere = (self: NumberRoad, x: number, z: number): boolean => {
    for (const e2 of idx) {
      const r2 = e2.road;
      if (r2.id === self.id || x < e2.minX - r2.halfWidth || x > e2.maxX + r2.halfWidth || z < e2.minZ - r2.halfWidth || z > e2.maxZ + r2.halfWidth) continue;
      const n = nearestOnRoad(r2, x, z);
      if (n.d < r2.halfWidth + 1) return true;
    }
    return false;
  };
  const inPoly = (poly: ArrayLike<number>, x: number, z: number): boolean => {
    let c = false;
    for (let i = 0, j = poly.length / 2 - 1; i < poly.length / 2; j = i++) {
      const xi = poly[i * 2], zi = poly[i * 2 + 1], xj = poly[j * 2], zj = poly[j * 2 + 1];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  for (const e of idx) {
    const r = e.road;
    if (!e.labelOk || e.inPad) continue; // the short links inside their pads are checked in section 7
    const st = styleOf(r);
    const half = st.along / 2;
    for (let k = 0; k < 60; k++) {
      const sc = (r.length * (k + 0.5)) / 60;
      const c = pointAt(r, sc);
      const state = newLabelState();
      asked++;
      const pose = placeLabel(r, state, { x: c.x + c.nx * 4, y: c.y + 3, z: c.z + c.nz * 4, fx: c.tx, fz: c.tz }, 0.016, e.blocked);
      if (!pose) continue;
      given++;
      if (pose.s - half < -1e-6 || pose.s + half > r.length + 1e-6) overlapS++;
      for (const iv of e.blocked) if (pose.s + half > iv[0] + 1e-6 && pose.s - half < iv[1] - 1e-6) overlapS++;
      stripVertices(r, pose.s, state.side, state.dir, st.across, st.along, buf);
      // no corner inside a pad outline
      for (const pad of pads) {
        if (Math.hypot(pad.x - c.x, pad.z - c.z) > padRadius(pad) + 80) continue;
        for (let v = 0; v < buf.length; v += 3) if (inPoly(pad.outline, buf[v], buf[v + 2])) inPad++;
      }
      // bridge: not in the end stretches; narrow decks are blocked completely
      for (const b of bridges) {
        if (b.roadId !== r.id) continue;
        const a = r.cum[b.i0];
        const z = r.cum[b.i1];
        const inside = pose.s + half > a && pose.s - half < z;
        if (inside && (pose.s - half < a + BRIDGE_END_M - 1e-6 || pose.s + half > z - BRIDGE_END_M + 1e-6)) bridgeBad++;
        if (inside && b.deckHalfWidth < labelOffset(r) + st.across / 2 + 0.2 - 1e-6) bridgeBad++;
      }
      // rows follow the road: they advance along the reading direction, the width stays the plate width
      let prevAlong = -Infinity;
      for (let row = 0; row <= STRIP_ROWS; row++) {
        const o = row * 6;
        const mx = (buf[o] + buf[o + 3]) / 2;
        const mz = (buf[o + 2] + buf[o + 5]) / 2;
        const pr = pointAt(r, pose.s + state.dir * (-half + (st.along * row) / STRIP_ROWS));
        const w = Math.hypot(buf[o + 3] - buf[o], buf[o + 5] - buf[o + 2]);
        if (Math.abs(w - st.across) > 0.01) wide++;
        if (row > 0) {
          const q = (mx - (buf[o - 6] + buf[o - 3]) / 2) * pr.tx * state.dir + (mz - (buf[o - 4] + buf[o - 1]) / 2) * pr.tz * state.dir;
          if (q <= 0) folded++;
        }
        void prevAlong;
        // height: 100 mm above the road. roadHeightAt (the surface function of the game) at the row middle, only where no OTHER road's asphalt is there
        // (a crossing, an overpass: roadHeightAt then answers for the other road) and not on a pad
        const surf = gen.roads.roadHeightAt(mx, mz);
        if (surf !== null && (row === 0 || row === STRIP_ROWS / 2 || row === STRIP_ROWS) && !gen.roads.padAt(mx, mz) && !otherRoadHere(r, mx, mz)) {
          heightChecked++;
          const dev = buf[o + 1] - (surf + ROAD_NUMBER_LIFT_M);
          maxDev = Math.max(maxDev, Math.abs(dev));
          if (Math.abs(dev) > 0.05) heightOff++;
        }
      }
    }
  }
  ok(given === asked, `a plate is found for every camera spot on every road that can have one (${given} of ${asked})`);
  ok(overlapS === 0, `no plate leaves its road or touches a blocked stretch (${overlapS} bad)`);
  ok(inPad === 0, `no plate corner lies inside a junction pad outline (${inPad} bad)`);
  ok(bridgeBad === 0, `no plate on a bridge end or on a deck too narrow for it (${bridgeBad} bad)`);
  ok(folded === 0, `the rows follow the road in order, no folding on bends (${folded} bad)`);
  ok(wide === 0, `every row is exactly the plate width (${wide} bad)`);
  // The ribbon of the road gives every sideways point the height of its centreline point; roadHeightAt projects a sideways point on ONE segment instead, so on a
  // bend with a grade the two differ by a few cm. The plate uses the ribbon rule (the same as the road mesh), so a small difference is expected.
  ok(heightChecked > 1000 && maxDev <= 0.1, `plate height = game road surface + 100 mm on ${heightChecked - heightOff} of ${heightChecked} rows within 5 cm; largest difference ${maxDev.toFixed(3)} m (limit 0.1 m: projection on a bend)`);
  note(`rows more than 5 cm off: ${heightOff} of ${heightChecked}`);

  // a steep road: the plate follows the hill (rows rise with the road, flat plate would not)
  let steepest: { r: NumberRoad; g: number; s: number } | null = null;
  for (const r of roads) {
    for (let i = 0; i + 1 < r.xs.length; i++) {
      const seg = r.cum[i + 1] - r.cum[i];
      if (seg < 2) continue;
      const g = Math.abs(r.ys[i + 1] - r.ys[i]) / seg;
      if (!steepest || g > steepest.g) steepest = { r, g, s: (r.cum[i] + r.cum[i + 1]) / 2 };
    }
  }
  if (steepest) {
    const st = styleOf(steepest.r);
    stripVertices(steepest.r, Math.max(st.along / 2, Math.min(steepest.r.length - st.along / 2, steepest.s)), 1, 1, st.across, st.along, buf);
    const rise = buf[STRIP_ROWS * 6 + 1] - buf[1];
    note(`steepest road ${steepest.r.name}: grade ${(steepest.g * 100).toFixed(1)} %, the plate rises ${rise.toFixed(2)} m over ${st.along.toFixed(1)} m`);
    ok(Number.isFinite(rise), 'the plate on the steepest road has real numbers');
  }

  // cost of Step 3: building the index (pads, bridges, corners) once, and 10 plates per frame (placement + 9 rows each)
  {
    const t0 = Date.now();
    buildRoadIndex(roads, pads, bridges);
    note(`index with ${pads.length} pads, ${bridges.length} bridges, ${roads.length} roads built in ${Date.now() - t0} ms (once, at game start)`);
    const ten = idx.filter((e) => e.labelOk).sort((a, b) => b.blocked.length - a.blocked.length).slice(0, MAX_LABELS);
    const states = ten.map(() => newLabelState());
    const t1 = Date.now();
    for (let f = 0; f < 2000; f++) {
      ten.forEach((e, k) => {
        const c = pointAt(e.road, (f * 0.4) % Math.max(1, e.road.length - 1));
        const st = styleOf(e.road);
        const pose = placeLabel(e.road, states[k], { x: c.x, y: c.y + 3, z: c.z, fx: c.tx, fz: c.tz }, 1 / 60, e.blocked);
        if (pose) stripVertices(e.road, pose.s, states[k].side, states[k].dir, st.across, st.along, buf);
      });
    }
    const ms = Date.now() - t1;
    note(`2000 frames x ${ten.length} plates (the roads with the most blocked stretches): ${ms} ms in total = ${(ms / 2000).toFixed(3)} ms per frame`);
    ok(ms / 2000 < 1, 'one frame of 10 plates costs less than 1 ms');
  }

  // the camera drives the longest road with blocked stretches: the plate never overlaps a block; it jumps only when the camera is near a block
  const withBlocks = idx.filter((e) => e.labelOk && e.blocked.length > 0).sort((a, b) => b.road.length - a.road.length)[0];
  if (withBlocks) {
    const r = withBlocks.road;
    const half = styleOf(r).along / 2;
    const state = newLabelState();
    let bad = 0;
    let prev = NaN;
    let farJumps = 0;
    let nearJumps = 0;
    const dt = 1 / 60;
    for (let s = 20; s < r.length - 20; s += 25 * dt) {
      const c = pointAt(r, s);
      const pose = placeLabel(r, state, { x: c.x, y: c.y + 4, z: c.z, fx: c.tx, fz: c.tz }, dt, withBlocks.blocked);
      if (!pose) continue;
      for (const iv of withBlocks.blocked) if (pose.s + half > iv[0] + 1e-6 && pose.s - half < iv[1] - 1e-6) bad++;
      if (Number.isFinite(prev) && Math.abs(pose.s - prev) > 1) {
        const nearBlock = withBlocks.blocked.some((iv) => s > iv[0] - 80 && s < iv[1] + 80);
        if (nearBlock) nearJumps++;
        else farJumps++;
      }
      prev = pose.s;
    }
    ok(bad === 0, `driving ${r.name} (${r.length.toFixed(0)} m, ${withBlocks.blocked.length} blocked stretches): the plate never overlaps one (${bad} bad)`);
    ok(farJumps === 0, `the plate jumps only close to a pad / bridge end (${nearJumps} jumps near, ${farJumps} far)`);
  }
}

console.log('\n=== 7. SHORT LINKS IN PADS, HIGH CAMERA (Step 4) ===');
{
  const pads = gen.roads.pads;
  const bridges = gen.roads.bridges;
  const idx = buildRoadIndex(roads, pads, bridges);
  const links = idx.filter((e) => e.inPad);
  note(`${links.length} short links lie inside their junction pads: ${links.map((e) => e.road.name).join(' ')}`);
  ok(idx.every((e) => e.labelOk), 'every road can get a label');
  ok(links.length > 0 && links.every((e) => e.road.length < 100), 'only short links use the pad (a long road never needs it)');

  // the plate of a link: on the road, 100 mm above the pad plane, whole strip on the road
  let bad = 0;
  let worst = 0;
  let measured = 0;
  const buf = new Float32Array(STRIP_FLOATS);
  for (const e of links) {
    const r = e.road;
    const st = styleOf(r);
    const half = st.along / 2;
    for (let k = 0; k < 20; k++) {
      const c = pointAt(r, (r.length * (k + 0.5)) / 20);
      const state = newLabelState();
      const pose = placeLabel(r, state, { x: c.x + c.nx * 3, y: c.y + 3, z: c.z + c.nz * 3, fx: c.tx, fz: c.tz }, 0.016, e.blocked);
      if (!pose || pose.s - half < -1e-6 || pose.s + half > r.length + 1e-6) { bad++; continue; }
      stripVertices(r, pose.s, state.side, state.dir, st.across, st.along, buf);
      fitToPads(e.padList, buf);
      for (let row = 0; row <= STRIP_ROWS; row++) {
        for (const side of [0, 1]) {
          const x = buf[(row * 2 + side) * 3];
          const y = buf[(row * 2 + side) * 3 + 1];
          const z = buf[(row * 2 + side) * 3 + 2];
          // the game's own road surface under this corner (the pad plane inside a pad, the road ribbon elsewhere)
          const surf = gen.roads.roadHeightAt(x, z);
          if (surf === null) continue;
          worst = Math.max(worst, Math.abs(y - (surf + ROAD_NUMBER_LIFT_M)));
          measured++;
        }
      }
    }
  }
  ok(bad === 0, `a plate of a short link lies fully on its road (${bad} bad)`);
  ok(measured > 100 && worst < 0.005, `the plate of a short link is 100 mm above the game's road surface (${measured} corners measured; largest difference ${worst.toFixed(3)} m, limit 0.005 m)`);

  // the high camera
  ok(showRadius(0) === 140 && showRadius(-50) === 140, 'on the ground the radius is still 140 m');
  ok(showRadius(100) > showRadius(10) && showRadius(1e6) <= 140 + 1.2 * 600, 'the radius grows with the camera height and has a ceiling');
  ok(hideRadius(80) > showRadius(80), 'the hide radius is a little larger than the show radius (no flicker)');
  ok(labelLimit(0) === MAX_LABELS && labelLimit(200) === MAX_LABELS_AIR, `near the ground ${MAX_LABELS} labels, high up ${MAX_LABELS_AIR}`);
  ok(heightOk(-300) && heightOk(0) && heightOk(60) && !heightOk(120) && !heightOk(-700), 'a road far below the camera keeps its label; a road high above the camera does not');

  const low = lowestY(idx);
  const none = (): boolean => false;
  // a busy place: the pad with the most arms
  const busy = pads.slice().sort((p, q) => q.arms.length - p.arms.length)[0];
  const home = idx.find((e) => e.road.id === busy.arms[0].roadId)!.road;
  const mid = pointAt(home, nearestOnRoad(home, busy.x, busy.z).s);
  let prevN = 0;
  for (const up of [5, 100, 250, 450]) {
    const cam = { x: mid.x, y: mid.y + up, z: mid.z, fx: 0, fz: 0 };
    const { cand, limit } = chooseRoads(idx, cam, none, low);
    ok(!!cand.find((c) => c.e.road.id === home.id), `camera ${up} m above road ${home.name}: it still wants a label (before Step 4 it was dropped above 80 m)`);
    ok(cand.length >= prevN, `camera ${up} m up: ${cand.length} roads are candidates (never fewer than lower down: ${prevN}), ${limit} labels allowed`);
    prevN = cand.length;
    if (up >= 100) ok(limit === MAX_LABELS_AIR, `camera ${up} m up: ${MAX_LABELS_AIR} labels allowed`);
  }
  {
    const { cand } = chooseRoads(idx, { x: mid.x, y: mid.y + 450, z: mid.z, fx: 0, fz: 0 }, none, low);
    ok(cand.length > MAX_LABELS, `from 450 m up more than ${MAX_LABELS} roads want a label (${cand.length})`);
  }
  // the hold: a label that exists keeps existing while the camera climbs straight up
  {
    const r = home;
    const state = newLabelState();
    let dropped = 0;
    for (let up = 2; up <= 450; up += 2) {
      const pose = placeLabel(r, state, { x: mid.x + mid.nx * 4, y: mid.y + up, z: mid.z + mid.nz * 4, fx: 0, fz: 0 }, 0.016, idx.find((e) => e.road === r)!.blocked);
      if (!pose || pose.d > hideRadius(-pose.gapY) || !heightOk(pose.gapY)) dropped++;
    }
    ok(dropped === 0, `climbing straight up to 450 m above ${r.name}: its label is never dropped (${dropped} bad)`);
  }
  // cost of choosing from the air: all roads in range, 8 times a second
  {
    const cam = { x: mid.x, y: mid.y + 400, z: mid.z, fx: 0, fz: 0 };
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) chooseRoads(idx, cam, none, low);
    const ms = (Date.now() - t0) / 200;
    note(`choosing the roads from 400 m up: ${ms.toFixed(2)} ms per call (8 calls a second)`);
    ok(ms < 8, 'choosing from the air is cheap (< 8 ms per call)');
  }
}

console.log('\n=== 8. JUNCTION NUMBERS (Step 5) ===');
{
  const pads = gen.roads.pads;
  const idx = buildRoadIndex(roads, pads, gen.roads.bridges);
  const inPoly = (poly: ArrayLike<number>, x: number, z: number): boolean => {
    let c = false;
    for (let i = 0, j = poly.length / 2 - 1; i < poly.length / 2; j = i++) {
      const xi = poly[i * 2], zi = poly[i * 2 + 1], xj = poly[j * 2], zj = poly[j * 2 + 1];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const codes = new Set(pads.map((p) => junctionCode(p)));
  ok(codes.size === pads.length, `every junction has its own number (${codes.size} codes for ${pads.length} pads, e.g. ${junctionCode(pads[0])}, ${junctionCode(pads[pads.length - 1])})`);
  ok(/^J\d{1,3}$/.test(junctionCode(pads[5])), 'a junction number looks like J12');

  const q = new Float32Array(12);
  let outside = 0;
  let badY = 0;
  let worstY = 0;
  let badShape = 0;
  for (const pad of pads) {
    for (const dir of [1, -1]) {
      if (!junctionCorners(pad, dir, q)) badY++;
      for (let k = 0; k < 4; k++) {
        const x = q[k * 3], y = q[k * 3 + 1], z = q[k * 3 + 2];
        if (!inPoly(pad.outline, x, z)) outside++;
        const surf = gen.roads.roadHeightAt(x, z);
        if (surf === null) badY++;
        else worstY = Math.max(worstY, Math.abs(y - (surf + ROAD_NUMBER_LIFT_M)));
      }
      // shape: width along the text right, height along the text up; text up = north (-z) for dir 1
      const w = Math.hypot(q[3] - q[0], q[5] - q[2]);
      const h = Math.hypot(q[6] - q[0], q[8] - q[2]);
      const rightX = (q[3] - q[0]) / w;
      const upZ = (q[8] - q[2]) / h;
      if (Math.abs(w - JUNCTION_PLATE_W) > 1e-4 || Math.abs(h - JUNCTION_PLATE_H) > 1e-4 || Math.abs(rightX - dir) > 1e-6 || Math.abs(upZ + dir) > 1e-6) badShape++;
    }
  }
  ok(outside === 0, `all 4 corners of every junction plate lie inside the pad outline (${outside} bad)`);
  ok(badY === 0 && worstY < 0.005, `every corner is exactly 100 mm above the game's road surface (largest difference ${worstY.toFixed(4)} m; ${badY} corners without surface)`);
  ok(badShape === 0, `the plate is ${JUNCTION_PLATE_W} x ${JUNCTION_PLATE_H} m; text right = east / text up = north (turned round for the other reading direction) (${badShape} bad)`);

  // reading direction
  ok(junctionDir(1, -1) === 1 && junctionDir(1, 0) === 1 && junctionDir(-1, 1) === -1, 'looking along the text up (north), sideways, or straight down: the text stays');
  ok(junctionDir(1, 0.2) === 1 && junctionDir(1, 0.34) === 1, 'a small turn does not flip it');
  ok(junctionDir(1, 0.9) === -1 && junctionDir(-1, -0.9) === 1, 'looking clearly south turns the text round, and back');
  let flips = 0;
  let dir = 1;
  for (let a = 0; a < 3000; a++) {
    const nd = junctionDir(dir, Math.cos(a * 0.01) * 0.3);
    if (nd !== dir) flips++;
    dir = nd;
  }
  ok(flips === 0, 'a camera that wobbles around the east-west line never makes the text flicker');

  // choosing
  const busy = pads.slice().sort((p, q2) => q2.arms.length - p.arms.length)[0];
  const none = (): boolean => false;
  const at = (up: number) => ({ x: busy.x, y: busy.y + up, z: busy.z, fx: 0, fz: 0 });
  const g0 = chooseJunctions(pads, at(3), none);
  ok(g0.cand[0]?.pad.id === busy.id && g0.limit === MAX_LABELS, `standing on junction J${busy.id}: it is the nearest one (${g0.cand.length} junctions within range, limit ${g0.limit})`);
  const gHigh = chooseJunctions(pads, at(300), none);
  ok(gHigh.cand.length > g0.cand.length && gHigh.limit === MAX_LABELS_AIR, `300 m up: more junctions (${gHigh.cand.length} vs ${g0.cand.length}), limit ${gHigh.limit}`);
  ok(chooseJunctions(pads, at(3), (id) => id === busy.id).cand.every((c) => c.pad.id !== busy.id), 'a junction that already has its plate is not listed again');

  // the plates of the short links do not touch the junction plate
  let touch = 0;
  let tested = 0;
  const buf = new Float32Array(STRIP_FLOATS);
  const half2 = { x: JUNCTION_PLATE_W / 2, z: JUNCTION_PLATE_H / 2 };
  for (const e of idx.filter((en) => en.inPad)) {
    const r = e.road;
    const st = styleOf(r);
    for (let k = 0; k < 60; k++) {
      const c = pointAt(r, (r.length * (k + 0.5)) / 60);
      const state = newLabelState();
      const pose = placeLabel(r, state, { x: c.x + c.nx * 3, y: c.y + 3, z: c.z + c.nz * 3, fx: c.tx, fz: c.tz }, 0.016, e.blocked);
      if (!pose) continue;
      stripVertices(r, pose.s, state.side, state.dir, st.across, st.along, buf);
      tested++;
      // sample points over the strip (rows x 5 across) and test them against the junction plate rectangles of the pads that are near
      for (const pad of e.padList) {
        for (let row = 0; row <= STRIP_ROWS; row++) {
          for (let t = 0; t <= 4; t++) {
            const x = buf[row * 6] + (buf[row * 6 + 3] - buf[row * 6]) * (t / 4);
            const z = buf[row * 6 + 2] + (buf[row * 6 + 5] - buf[row * 6 + 2]) * (t / 4);
            if (Math.abs(x - pad.x) < half2.x && Math.abs(z - pad.z) < half2.z) touch++;
          }
        }
      }
    }
  }
  ok(tested > 0 && touch === 0, `the plates of the short links never lie on a junction plate (${tested} placements, ${touch} points inside)`);
  ok(JUNCTION_KEEP_M > Math.hypot(JUNCTION_PLATE_W / 2, JUNCTION_PLATE_H / 2), 'the keep-away radius is larger than the plate half diagonal');
  ok(idx.every((e) => e.labelOk), 'every road still gets a label with the junction keep-out');
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);

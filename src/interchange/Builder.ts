// INTERCHANGE FOUNDATION: InterchangeSpec -> InterchangeModel. Pure function of its input (same spec = same model), no game state, no three.js.
//   1. pattern table  -> canonical ramps, turned by k * 90 degrees for the approaches of the pattern
//   2. level plan     -> which road is the bridge, heights of both roads, ramp height profiles
//   3. world frame    -> every ramp point in world x, z
//   4. links          -> where every ramp leaves / joins a road (for the road network + the AI)
//   5. zones, parts   -> infield decoration circles, instanced piers / lamps / rail posts
//   6. validation     -> radius, grade, gap, clearance, lane joins

import { rot90, type P2 } from './Geometry2D';
import { ROLE_BUILDERS, getPattern, type CanonRamp } from './Patterns';
import { INTERCHANGE_DEFAULTS, type InterchangeModel, type InterchangeParams, type InterchangeSpec, type Join, type Link, type Ramp, type RoadSide, type Zone } from './InterchangeTypes';
import { makeLevels, rampProfile, yOf } from './Levels';
import { makeParts } from './Parts';
import { STRUCTURE_BUDGET, placeStructures, resolveDressing } from './Structures';
import { validate } from './Validate';

const APPROACH = ['mf', 'xf', 'mb', 'xb'] as const; // main forward, cross forward, main backward, cross backward
const TAPER_LEN = 80;

export function mergeParams(over?: Partial<InterchangeParams>): InterchangeParams {
  return { ...INTERCHANGE_DEFAULTS, ...(over ?? {}), designKmh: { ...INTERCHANGE_DEFAULTS.designKmh, ...(over?.designKmh ?? {}) } };
}

export function buildInterchange(spec: InterchangeSpec, ground?: (x: number, z: number) => number): InterchangeModel {
  const P = mergeParams(spec.params);
  const def = getPattern(spec.pattern);
  if (!def) throw new Error(`interchange "${spec.id}": unknown pattern "${spec.pattern}"`);
  const L = makeLevels(spec, P);
  const cy = Math.cos(spec.yaw);
  const sy = Math.sin(spec.yaw);
  const toWorld = (u: number, v: number): { x: number; z: number } => ({ x: spec.x + u * cy + v * sy, z: spec.z + u * sy - v * cy });
  const groundY = ground ?? ((): number => spec.y);

  // 1. the ramps in the interchange frame (u along main, v along cross)
  interface Draft {
    id: string;
    role: CanonRamp['role'];
    approach: 0 | 1 | 2 | 3;
    pts: P2[];
    from: { kind: Join['kind']; road: RoadSide; u: number; v: number };
    to: { kind: Join['kind']; road: RoadSide; u: number; v: number };
    designKmh: number;
  }
  const drafts: Draft[] = [];
  if (def.custom) {
    for (const lr of def.custom(spec.main, spec.cross, P)) {
      const a = lr.pts[0];
      const b = lr.pts[lr.pts.length - 1];
      drafts.push({ id: lr.id, role: lr.role, approach: lr.approach, pts: lr.pts, from: { ...lr.from, u: a.u, v: a.v }, to: { ...lr.to, u: b.u, v: b.v }, designKmh: lr.designKmh });
    }
  } else {
    for (const k of def.approaches) {
      const aSide: RoadSide = k % 2 === 0 ? 'main' : 'cross';
      const bSide: RoadSide = k % 2 === 0 ? 'cross' : 'main';
      const ctx = { a: aSide === 'main' ? spec.main : spec.cross, b: bSide === 'main' ? spec.main : spec.cross, P };
      for (const role of def.roles) {
        const c = ROLE_BUILDERS[role](ctx);
        const side = (r: 'a' | 'b'): RoadSide => (r === 'a' ? aSide : bSide);
        const turn = (p: { u: number; v: number }): P2 => rot90(p, k);
        const f = turn(c.from);
        const t = turn(c.to);
        drafts.push({
          id: `${APPROACH[k]}-${role}`,
          role: c.role,
          approach: k,
          pts: c.pts.map(turn),
          from: { kind: c.from.kind, road: side(c.from.road), u: f.u, v: f.v },
          to: { kind: c.to.kind, road: side(c.to.road), u: t.u, v: t.v },
          designKmh: c.designKmh,
        });
      }
    }
  }

  // 2 + 3. heights and world coordinates
  const join = (j: Draft['from']): Join => {
    const w = toWorld(j.u, j.v);
    return { kind: j.kind, road: j.road, u: j.u, v: j.v, x: w.x, z: w.z, t: j.road === 'main' ? j.u : j.v };
  };
  const ramps: Ramp[] = drafts.map((d) => {
    const cum: number[] = [0];
    for (let i = 1; i < d.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(d.pts[i].u - d.pts[i - 1].u, d.pts[i].v - d.pts[i - 1].v));
    const from = join(d.from);
    const to = join(d.to);
    const ys = rampProfile(cum, yOf(L, from.road, from.t), yOf(L, to.road, to.t));
    const xs: number[] = [];
    const zs: number[] = [];
    for (const p of d.pts) {
      const w = toWorld(p.u, p.v);
      xs.push(w.x);
      zs.push(w.z);
    }
    // stretches higher than pierFromH over the ground = piers / bridge deck; the rest is an embankment
    const elevated: Ramp['elevated'] = [];
    let open = -1;
    for (let i = 0; i < ys.length; i++) {
      const high = ys[i] - groundY(xs[i], zs[i]) > P.pierFromH;
      if (high && open < 0) open = i;
      if ((!high || i === ys.length - 1) && open >= 0) {
        elevated.push({ i0: open, i1: high ? i : i - 1 });
        open = -1;
      }
    }
    return {
      id: d.id,
      role: d.role,
      approach: d.approach,
      oneWay: true,
      local: d.pts,
      xs,
      zs,
      ys,
      cum,
      length: cum[cum.length - 1],
      halfWidth: P.rampHalfWidth,
      designKmh: d.designKmh,
      from,
      to,
      elevated,
    };
  });

  // 4. links for the road network / AI
  const links: Link[] = [];
  for (const r of ramps) {
    for (const j of [r.from, r.to]) {
      links.push({ kind: j.kind === 'gore' ? 'diverge' : j.kind === 'merge' ? 'merge' : 'terminal', ramp: r.id, road: j.road, t: j.t, x: j.x, z: j.z, side: 'left', taperLen: j.kind === 'terminal' ? 0 : TAPER_LEN });
    }
  }

  // 5. infield zones (inside every loop) + instanced parts
  const zones: Zone[] = [];
  if (P.decor !== 'none') {
    let n = 0;
    for (const d of drafts) {
      if (d.role !== 'loop') continue;
      // the loop is a 270 degree circle of radius loopR: its centre is loopR to the LEFT of the gore, seen in the travel direction
      const a = d.pts[0];
      const b = d.pts[1];
      const l = Math.hypot(b.u - a.u, b.v - a.v) || 1;
      const cu = a.u + (-(b.v - a.v) / l) * P.loopR;
      const cv = a.v + ((b.u - a.u) / l) * P.loopR;
      const w = toWorld(cu, cv);
      const kind: Zone['kind'] = P.decor === 'mixed' ? (n % 2 === 0 ? 'garden' : 'pond') : P.decor;
      zones.push({ kind, u: cu, v: cv, x: w.x, z: w.z, radius: Math.max(4, P.loopR - P.rampHalfWidth - 2) });
      n++;
    }
  }
  const parts = makeParts(ramps, P, L, spec.main, spec.cross, toWorld, spec.yaw, groundY);
  const dressed = placeStructures({ id: spec.id, ramps, zones, P, L, main: spec.main, cross: spec.cross, toWorld, yaw: spec.yaw, ground: groundY, dressing: resolveDressing(spec.dressing) });

  let far = 0;
  for (const r of ramps) for (const p of r.local) far = Math.max(far, Math.hypot(p.u, p.v));
  const footprintR = Math.max(120, far + P.rampHalfWidth + 20);
  const issues = validate(ramps, spec.main, spec.cross, P, L);
  if (dressed.instances > STRUCTURE_BUDGET.maxInstances) issues.push({ level: 'warn', code: 'budget', message: `dressing has ${dressed.instances} instances (budget ${STRUCTURE_BUDGET.maxInstances})` });

  return {
    spec,
    params: P,
    levels: L,
    ramps,
    links,
    zones,
    parts,
    structures: dressed.batches,
    walls: dressed.walls,
    budget: { instances: dressed.instances, trisHint: dressed.trisHint },
    footprintR,
    issues,
    yOf: (side, t) => yOf(L, side, t),
    toWorld,
  };
}

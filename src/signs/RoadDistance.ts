// ROAD SIGNS - Step 2: real distances ALONG THE ROADS (not straight lines) from every junction to every sign destination.
//
//   buildPadGraph(roads, pads)     junctions (pads) are the nodes; the stretch of a road between two neighbouring junctions is an edge (both ways)
//   RoadDistances                  one Dijkstra per destination: distance(destination, pad) = metres you must drive from that junction.
//                                  A destination is joined to the nearest POINT OF A ROAD (not to the nearest junction, which can be a km away),
//                                  and from there you can leave towards the junction behind it or the junction ahead of it.
//
// Pure data code: no three.js, no DOM. RoadNetwork.roads / RoadNetwork.pads fit the two small interfaces below as they are, so it also runs on
// a hand-made mini network in the test. Heading convention = PadSpec.arms[].theta: atan2(dz, dx) (x east, z south).

/** What this module needs of a road (RoadSpec has all of it). */
export interface GraphRoad {
  id: number;
  xs: ArrayLike<number>;
  zs: ArrayLike<number>;
  /** Distance along the road from point 0 (m). */
  cum: ArrayLike<number>;
  length: number;
  closed: boolean;
  earth?: boolean;
}
/** What this module needs of a junction pad (PadSpec has all of it). */
export interface GraphPad {
  x: number;
  z: number;
  arms: readonly { roadId: number }[];
}

export interface GraphEdge {
  /** Pad index at the other end. */
  to: number;
  /** Length of the road stretch (m). */
  len: number;
  roadId: number;
  /** +1 = along increasing s of that road, -1 = against it. */
  dir: 1 | -1;
  /** Direction (rad, atan2(dz, dx)) in which this edge LEAVES its pad. Step 3 uses it to find which pad arm an edge belongs to. */
  heading: number;
  /** Distance along the road (m) of the pad where this edge STARTS and of the pad where it ENDS (Step 3 uses them to put a sign a given distance along the edge). */
  s0: number;
  s1: number;
  /** true = the closing stretch of a ring road: it runs over the end of the road back to its start (so s1 < s0 although dir = +1). */
  wrap: boolean;
}

/** A place where a road meets a pad: distance along the road (m), the pad, and the road's heading there in the direction of increasing s. */
export interface Station {
  s: number;
  pad: number;
  fwd: number;
}

export interface PadGraph {
  /** adj[pad] = the edges leaving that pad. */
  adj: GraphEdge[][];
  edgeCount: number;
  /** For every road that meets at least one pad: its stations, sorted by s. */
  stations: Map<number, Station[]>;
}

/** A road point this close to a pad centre means the road meets that pad (same limit as RoadGraph). */
const SNAP = 30;

const wrapPi = (a: number): number => {
  const t = Math.PI * 2;
  let r = ((a % t) + t) % t;
  if (r > Math.PI) r -= t;
  return r;
};

export function buildPadGraph(roads: readonly GraphRoad[], pads: readonly GraphPad[]): PadGraph {
  const roadById = new Map<number, GraphRoad>();
  for (const r of roads) roadById.set(r.id, r);
  const stations = new Map<number, Station[]>();

  for (let p = 0; p < pads.length; p++) {
    const pad = pads[p];
    const seen = new Set<number>();
    for (const arm of pad.arms) {
      if (seen.has(arm.roadId)) continue;
      seen.add(arm.roadId);
      const r = roadById.get(arm.roadId);
      if (!r || r.earth) continue;
      const n = r.xs.length;
      if (n < 2) continue;
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(r.xs[i] - pad.x, r.zs[i] - pad.z);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      if (bd > SNAP) continue;
      const a = Math.max(0, bi - 1);
      const b = Math.min(n - 1, bi + 1);
      const fwd = Math.atan2(r.zs[b] - r.zs[a], r.xs[b] - r.xs[a]);
      let list = stations.get(r.id);
      if (!list) stations.set(r.id, (list = []));
      list.push({ s: r.cum[bi], pad: p, fwd });
    }
  }

  const adj: GraphEdge[][] = pads.map(() => []);
  let edgeCount = 0;
  const link = (a: Station, b: Station, len: number, roadId: number, wrap = false): void => {
    if (a.pad === b.pad || !(len >= 0)) return;
    adj[a.pad].push({ to: b.pad, len, roadId, dir: 1, heading: a.fwd, s0: a.s, s1: b.s, wrap });
    adj[b.pad].push({ to: a.pad, len, roadId, dir: -1, heading: wrapPi(b.fwd + Math.PI), s0: b.s, s1: a.s, wrap });
    edgeCount += 2;
  };
  for (const [roadId, list] of stations) {
    const r = roadById.get(roadId)!;
    list.sort((x, y) => x.s - y.s);
    for (let k = 0; k + 1 < list.length; k++) link(list[k], list[k + 1], list[k + 1].s - list[k].s, roadId);
    // a closed road (ring): the stretch from the last junction back to the first
    if (r.closed && list.length >= 2) {
      const first = list[0];
      const last = list[list.length - 1];
      link(last, first, r.length - (last.s - first.s), roadId, true);
    }
  }
  return { adj, edgeCount, stations };
}

/** Binary min-heap of (key, value). */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  /** Removes the smallest; returns its value (the key is left in `lastKey`). */
  lastKey = 0;
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const topV = v[0];
    this.lastKey = k[0];
    const key = k.pop()!;
    const val = v.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= key) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = key;
      v[i] = val;
    }
    return topV;
  }
}

/** Shortest road distance (m) from several starting pads at once (each with its own head start); Infinity where there is no road connection. */
export function dijkstraMulti(graph: PadGraph, sources: readonly { pad: number; init: number }[]): Float64Array {
  const n = graph.adj.length;
  const dist = new Float64Array(n).fill(Infinity);
  const heap = new MinHeap();
  for (const src of sources) {
    if (src.pad < 0 || src.pad >= n || !(src.init < dist[src.pad])) continue;
    dist[src.pad] = src.init;
    heap.push(src.init, src.pad);
  }
  while (heap.size > 0) {
    const u = heap.pop();
    const du = heap.lastKey;
    if (du > dist[u]) continue;
    for (const e of graph.adj[u]) {
      const nd = du + e.len;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        heap.push(nd, e.to);
      }
    }
  }
  return dist;
}

/** Shortest road distance (m) from `src` to every pad; Infinity where there is no road connection. */
export function dijkstra(graph: PadGraph, src: number, init = 0): Float64Array {
  return dijkstraMulti(graph, [{ pad: src, init }]);
}

export interface PlacePoint {
  x: number;
  z: number;
}

/** Where a destination is joined to the roads. */
export interface PlaceJoin {
  roadId: number;
  /** Distance along that road (m) of the joining point. */
  s: number;
  /** Straight gap (m) between the place and the joining point on the road. */
  gap: number;
}

/**
 * Road distances from every pad to a list of destinations. A destination (a point of the map) is joined to the nearest point of a road of the MAIN
 * network (the part connected to the map centre). From that point you can drive to the junction behind it or to the junction ahead of it (on a ring
 * road also across the closing stretch). The straight gap between the place and the road point is added.
 */
export class RoadDistances {
  readonly graph: PadGraph;
  /** 1 for pads that are connected to the map centre by road. */
  readonly inMain: Uint8Array;
  /** Where each destination is joined (null = no road found). */
  readonly joins: (PlaceJoin | null)[] = [];
  /** The pad nearest by road to each destination (-1 = none): for reports. */
  readonly destPad: Int32Array;
  /** Straight gap (m) between a destination and its road point (Infinity = none). */
  readonly destGap: Float64Array;
  private dist: Float64Array[] = [];

  constructor(
    private roads: readonly GraphRoad[],
    private pads: readonly GraphPad[],
    destinations: readonly PlacePoint[],
    home: PlacePoint = { x: 0, z: 0 },
  ) {
    this.graph = buildPadGraph(roads, pads);
    // the main network: everything reachable from the pad nearest to `home` (that has roads)
    this.inMain = new Uint8Array(pads.length);
    const homePad = this.nearestPad(home.x, home.z, false);
    if (homePad >= 0) {
      const d = dijkstra(this.graph, homePad);
      for (let i = 0; i < d.length; i++) if (d[i] < Infinity) this.inMain[i] = 1;
    }
    // roads of the main network = roads that meet at least one main pad
    const mainRoad = new Set<number>();
    for (const [roadId, list] of this.graph.stations) if (list.some((st) => this.inMain[st.pad])) mainRoad.add(roadId);

    this.destPad = new Int32Array(destinations.length).fill(-1);
    this.destGap = new Float64Array(destinations.length).fill(Infinity);
    destinations.forEach((p, k) => {
      const join = this.nearestRoadPoint(p.x, p.z, mainRoad);
      this.joins.push(join);
      if (!join) {
        this.dist.push(new Float64Array(pads.length).fill(Infinity));
        return;
      }
      const road = roads.find((r) => r.id === join.roadId)!;
      const st = this.graph.stations.get(join.roadId)!;
      // the junction behind (s <= join.s) and the junction ahead (s >= join.s); a ring road continues over its closing stretch
      let prev: Station | null = null;
      let next: Station | null = null;
      for (const q of st) {
        if (q.s <= join.s) prev = q;
        if (q.s >= join.s && !next) next = q;
      }
      const src: { pad: number; init: number }[] = [];
      if (prev) src.push({ pad: prev.pad, init: join.s - prev.s + join.gap });
      else if (road.closed) src.push({ pad: st[st.length - 1].pad, init: road.length - st[st.length - 1].s + join.s + join.gap });
      if (next) src.push({ pad: next.pad, init: next.s - join.s + join.gap });
      else if (road.closed) src.push({ pad: st[0].pad, init: road.length - join.s + st[0].s + join.gap });
      const d = dijkstraMulti(this.graph, src);
      this.dist.push(d);
      this.destGap[k] = join.gap;
      let best = src[0];
      for (const q of src) if (q.init < best.init) best = q;
      this.destPad[k] = best ? best.pad : -1;
    });
  }

  get padCount(): number {
    return this.pads.length;
  }

  /** Nearest pad that has at least one road edge (and, when `mainOnly`, belongs to the main network). -1 if none. */
  nearestPad(x: number, z: number, mainOnly: boolean): number {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < this.pads.length; i++) {
      if (this.graph.adj[i].length === 0) continue;
      if (mainOnly && !this.inMain[i]) continue;
      const d = Math.hypot(this.pads[i].x - x, this.pads[i].z - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** Nearest point (among the points of the given roads) to (x, z). */
  private nearestRoadPoint(x: number, z: number, allowed: ReadonlySet<number>): PlaceJoin | null {
    let best: PlaceJoin | null = null;
    let bd = Infinity;
    for (const r of this.roads) {
      if (r.earth || !allowed.has(r.id)) continue;
      for (let i = 0; i < r.xs.length; i++) {
        const d = Math.hypot(r.xs[i] - x, r.zs[i] - z);
        if (d < bd) {
          bd = d;
          best = { roadId: r.id, s: r.cum[i], gap: d };
        }
      }
    }
    return best;
  }

  /** Metres to drive from `pad` to destination number `dest` (the gap between the road and the place is included). */
  distance(dest: number, pad: number): number {
    return this.dist[dest]?.[pad] ?? Infinity;
  }
}

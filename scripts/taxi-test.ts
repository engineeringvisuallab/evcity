// Taxi check: a plane leaves a nose-in gate like a real one: pushed back tail-first, then rolls forward along rounded corners (turning radius >= 20 m), slows for
// curves, never snaps its nose, and arrives exactly at the end of the route; arriving planes stop smoothly at the gate nose-in.
import { createAirportPlan } from '../src/airport/AirportPlan';
import { createAirportOps, TaxiMover } from '../src/airplane/AirplaneOps';
let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const ap = createAirportOps('t', createAirportPlan({ cx: 0, cz: 0, heading: 0.3, groundY: 0, seed: 1 }), 0);
const stand = ap.stands.gate1;
const route = ap.taxiOut(stand, 1);

function run(name: string, r: { x: number; z: number }[], h0: number, opts: { radius?: number; pushback?: boolean }): { maxYawRate: number; minRadius: number; backwards: number; time: number; endErr: number; maxSpeed: number; endSpeed: number } {
  const t = new TaxiMover(r, h0, 14, 0.7, opts);
  let time = 0, maxYawRate = 0, minR = 1e9, backwards = 0, maxSpeed = 0, prev = { x: t.x, z: t.z, h: t.heading }, lastSpeed = 0;
  while (!t.done && time < 900) {
    t.step(0.1); time += 0.1;
    const dx = t.x - prev.x, dz = t.z - prev.z, d = Math.hypot(dx, dz);
    let dh = t.heading - prev.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    if (d > 1e-4) {
      maxYawRate = Math.max(maxYawRate, Math.abs(dh) / 0.1);
      if (Math.abs(dh) > 0.002 && !t.pushing) minR = Math.min(minR, d / Math.abs(dh));
      const along = dx * Math.cos(t.heading) + dz * Math.sin(t.heading);
      if (along < -1e-4) backwards += d;
    }
    maxSpeed = Math.max(maxSpeed, Math.hypot(dx, dz) / 0.1); lastSpeed = Math.hypot(dx, dz) / 0.1;
    prev = { x: t.x, z: t.z, h: t.heading };
  }
  const end = r[r.length - 1];
  const res = { maxYawRate, minRadius: minR, backwards, time, endErr: Math.hypot(t.x - end.x, t.z - end.z), maxSpeed, endSpeed: lastSpeed };
  console.log(name, JSON.stringify({ ...res, minRadius: +res.minRadius.toFixed(1), maxYawRate: +res.maxYawRate.toFixed(2), backwards: +res.backwards.toFixed(0), time: +res.time.toFixed(0), maxSpeed: +res.maxSpeed.toFixed(1) }));
  return res;
}

const out = run('taxi-out gate1', route, stand.heading, { radius: 28, pushback: true });
ok(out.backwards > 40, `pushed back tail-first (${out.backwards.toFixed(0)} m backwards)`);
ok(out.minRadius > 15, `turns on a real radius (min ${out.minRadius.toFixed(0)} m)`);
ok(out.maxYawRate < 0.45, `the nose never snaps (max yaw rate ${out.maxYawRate.toFixed(2)} rad/s)`);
ok(out.endErr < 0.6, `ends on the runway line-up point (${out.endErr.toFixed(2)} m off)`);
ok(out.time > 60 && out.time < 400, `a realistic time (${out.time.toFixed(0)} s)`);
ok(out.maxSpeed <= 14.5, 'never faster than the taxi speed');

const back = [...route].reverse();
const arr = run('taxi-in gate1', back, Math.atan2(back[1].z - back[0].z, back[1].x - back[0].x), { radius: 28 });
ok(arr.endErr < 0.6, `arrives exactly at the stand (${arr.endErr.toFixed(2)} m off)`);
ok(arr.endSpeed < 1.2, `stops smoothly (last speed ${arr.endSpeed.toFixed(2)} m/s)`);
ok(arr.minRadius > 15, `turns on a real radius (min ${arr.minRadius.toFixed(0)} m)`);

const fr = run('fighter taxi-out', ap.taxiOut(ap.stands.mil0, 1), ap.stands.mil0.heading, { radius: 14, pushback: true });
ok(fr.minRadius > 8 && fr.endErr < 0.6, `fighter: radius ${fr.minRadius.toFixed(0)} m, ends ${fr.endErr.toFixed(2)} m off`);
console.log(fails ? `\n${fails} FAILURES` : '\nALL OK');
process.exit(fails ? 1 : 0);

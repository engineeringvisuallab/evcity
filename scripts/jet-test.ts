// Player jet flight model: take-off on a runway, climb, turn, level flight, stall, a good landing, a hard landing / gear-up landing / sea landing = crash.
import { JetFlight, JET, type JetControls } from '../src/airplane/JetFlight';
let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const none: JetControls = { throttleUp: false, throttleDown: false, afterburner: false, pitch: 0, roll: 0, yaw: 0, brake: false };
const flat = (): JetFlight => { const f = new JetFlight(() => 10, () => false); f.st.y = 10; f.st.heading = 0; return f; };
const run = (f: JetFlight, secs: number, c: Partial<JetControls>, until?: () => boolean): { ev: ReturnType<JetFlight['step']> } => {
  let ev = null as ReturnType<JetFlight['step']>;
  for (let t = 0; t < secs; t += 0.02) { const e = f.step(0.02, { ...none, ...c }); if (e) ev = e; if (until?.()) break; }
  return { ev };
};

// ---- take-off: full throttle, rotate at 280 km/h, climb
{
  const f = flat();
  run(f, 6, { throttleUp: true });
  ok(f.st.onGround && f.st.speed > 40, `rolling on the runway (${(f.st.speed * 3.6).toFixed(0)} km/h)`);
  run(f, 20, { throttleUp: true, pitch: 1 }, () => !f.st.onGround);
  ok(!f.st.onGround, `lifts off (${(f.st.speed * 3.6).toFixed(0)} km/h, ${(f.st.x).toFixed(0)} m of runway)`);
  ok(f.st.x < 1500, `a take-off roll under 1.5 km (${f.st.x.toFixed(0)} m)`);
  run(f, 14, { throttleUp: true, pitch: 0.5 });
  ok(f.st.y > 150, `climbs (${f.st.y.toFixed(0)} m)`);
  // turn right: bank right for 6 s -> the heading increases
  const h0 = f.st.heading;
  run(f, 6, { throttleUp: true, roll: 1 });
  ok(f.st.heading - h0 > 0.2, `banking right turns right (${((f.st.heading - h0) * 57.3).toFixed(0)} deg in 6 s)`);
  run(f, 8, { throttleUp: true, roll: -1 });
  run(f, 12, { throttleUp: true });
  ok(Math.abs(f.st.roll) < 0.2, 'the stabiliser levels the wings');
  // full power: reaches a high speed
  run(f, 25, { throttleUp: true, afterburner: true });
  ok(f.st.speed > 280 && f.st.speed <= JET.vMax, `afterburner speed ${(f.st.speed * 3.6).toFixed(0)} km/h`);
}
// ---- stall: low speed in the air -> the nose falls, the jet sinks
{
  const f = flat(); f.st.onGround = false; f.st.y = 800; f.st.speed = 45; f.st.pitch = 0.3;
  run(f, 4, {});
  ok(f.st.stall && f.st.pitch < 0.3, 'stall: the nose drops below the stall speed');
  ok(f.st.y < 800, `and the jet sinks (${(800 - f.st.y).toFixed(0)} m in 4 s)`);
}
// ---- good landing: gear down, 220 km/h, a gentle glide
{
  const f = flat(); f.st.onGround = false; f.st.y = 60; f.st.speed = 62; f.st.throttle = 0.25; f.st.pitch = -0.04; f.st.assist = false;
  const { ev } = run(f, 60, { pitch: 0 }, () => f.st.onGround);
  ok(ev?.type === 'landed' && f.st.onGround, `a smooth landing (${ev?.type})`);
  run(f, 60, { brake: true, throttleDown: true });
  ok(f.st.speed < 1, 'it stops with the brakes');
}
// ---- crashes
{
  const hard = flat(); hard.st.onGround = false; hard.st.y = 100; hard.st.speed = 140; hard.st.pitch = -0.5; hard.st.throttle = 0.6;
  const a = run(hard, 20, {}, () => hard.st.crashT > 0 || hard.st.onGround);
  ok(a.ev?.type === 'crash', `diving into the ground is a crash (${a.ev?.type})`);
  const gearUp = flat(); gearUp.st.onGround = false; gearUp.st.gear = false; gearUp.st.y = 40; gearUp.st.speed = 70; gearUp.st.throttle = 0.3; gearUp.st.pitch = -0.06; gearUp.st.assist = false;
  const b = run(gearUp, 30, {}, () => gearUp.st.crashT > 0 || gearUp.st.onGround);
  ok(b.ev?.type === 'crash' && (b.ev as { reason: string }).reason === 'gear', 'landing with the gear up crashes');
  const sea = new JetFlight(() => 0.2, () => true); sea.st.onGround = false; sea.st.y = 40; sea.st.speed = 70; sea.st.throttle = 0.3; sea.st.heading = 0; sea.st.pitch = -0.06; sea.st.assist = false;
  const c = run(sea, 30, {}, () => sea.st.crashT > 0);
  ok(c.ev?.type === 'crash' && (c.ev as { reason: string }).reason === 'water', 'landing on the sea crashes');
}
console.log(fails ? `\n${fails} FAILURES` : '\nALL OK');
process.exit(fails ? 1 : 0);

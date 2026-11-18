// Checks the first-person view maths (P on foot): npm run test:first-person
import { aimFov, angleDiff, bodyHeading, eyeHeight, FP_MAX_PITCH, lookDir, lookStep } from '../src/camera/firstPersonMath';

let fail = 0;
const ok = (c: boolean, m: string): void => {
  if (!c) {
    fail++;
    console.log('FAIL', m);
  } else console.log('PASS', m);
};
const near = (a: number, b: number, e = 1e-9): boolean => Math.abs(a - b) <= e;

// 1. W walks where the camera looks: Player uses forward = (-sin yaw, -cos yaw), lookDir at pitch 0 must be the same
for (const yaw of [0, 0.7, Math.PI, -2.1, 5.5]) {
  const d = lookDir(yaw, 0);
  ok(near(d.x, -Math.sin(yaw)) && near(d.z, -Math.cos(yaw)) && near(d.y, 0), `look dir = walk forward, yaw ${yaw.toFixed(2)}`);
}
// 2. look dir is a unit vector at any pitch
{
  const d = lookDir(1.2, 0.8);
  ok(near(Math.hypot(d.x, d.y, d.z), 1), 'look dir is a unit vector');
}
// 3. mouse: right turns right (yaw down, like the orbit camera), down looks down, pitch limit +-85 deg
{
  const a = lookStep(0, 0, 100, 0, 0.0022);
  ok(a.yaw < 0 && a.pitch === 0, 'mouse right -> yaw decreases');
  const b = lookStep(0, 0, 0, 100, 0.0022);
  ok(b.pitch < 0, 'mouse down -> looks down');
  let p = 0;
  for (let i = 0; i < 500; i++) p = lookStep(0, p, 0, -50, 0.0022).pitch;
  ok(near(p, FP_MAX_PITCH) && near((p * 180) / Math.PI, 85, 1e-6), 'pitch up stops at +85 deg');
  p = 0;
  for (let i = 0; i < 500; i++) p = lookStep(0, p, 0, 50, 0.0022).pitch;
  ok(near(p, -FP_MAX_PITCH), 'pitch down stops at -85 deg');
  let y = 0;
  for (let i = 0; i < 1000; i++) y = lookStep(y, 0, 40, 0, 0.0022).yaw;
  ok(Number.isFinite(y), 'yaw turns round without limit');
}
// 4. the body faces the look direction (Player.heading 0 = +Z, forward = (sin h, cos h))
for (const yaw of [0, 1, -1.3, 3]) {
  const h = bodyHeading(yaw);
  const d = lookDir(yaw, 0);
  ok(near(Math.sin(h), d.x) && near(Math.cos(h), d.z), `body heading faces the look direction, yaw ${yaw}`);
}
// 5. eye height: standing 1.62, crouch lowers it, never below base - drop, never above base
ok(near(eyeHeight(1.62, 0.5, 0), 1.62), 'standing eye height');
ok(near(eyeHeight(1.62, 0.5, 1), 1.12), 'crouched eye height');
ok(near(eyeHeight(1.62, 0.5, 5), 1.12) && near(eyeHeight(1.62, 0.5, -3), 1.62), 'crouch value is clamped');
// 6. aim zoom: hip = base lens, full aim (aimFactor = aimCameraScale 0.6) = base * (1 - zoom), in between is smooth
ok(near(aimFov(70, 1, 0.6, 0.4), 70), 'hip fire keeps the lens');
ok(near(aimFov(70, 0.6, 0.6, 0.4), 42), 'full aim narrows the lens by 40 %');
{
  const mid = aimFov(70, 0.8, 0.6, 0.4);
  ok(mid < 70 && mid > 42, 'half aim is in between');
  ok(near(aimFov(70, 0.2, 0.6, 0.4), 42), 'aim factor below the scale is clamped');
}
// 7. angleDiff takes the short way round
ok(near(angleDiff(3.0, -3.0), 2 * Math.PI - 6.0), 'angle difference takes the short way');

console.log(fail === 0 ? 'ALL PASS' : `${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);

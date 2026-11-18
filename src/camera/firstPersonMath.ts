/**
 * First-person view (P on foot): the pure maths, no three.js and no physics, so a headless test can check it.
 * Angle convention = the orbit camera's: yaw 0 looks along -Z, forward = (-sin yaw, -cos yaw); pitch + = looking up.
 */

/** Look limit up / down (rad): +-85 degrees. */
export const FP_MAX_PITCH = (85 * Math.PI) / 180;

export function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** One mouse step: dx right (turns right = yaw down), dy down (looks down = pitch down). */
export function lookStep(yaw: number, pitch: number, dx: number, dy: number, sensitivity: number): { yaw: number; pitch: number } {
  return { yaw: yaw - dx * sensitivity, pitch: clampNum(pitch - dy * sensitivity, -FP_MAX_PITCH, FP_MAX_PITCH) };
}

/** Unit look direction (x, y, z) for yaw / pitch. */
export function lookDir(yaw: number, pitch: number): { x: number; y: number; z: number } {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}

/** Heading of the body (rad, 0 = +Z, same as Player.heading) when it faces where the camera looks. */
export function bodyHeading(yaw: number): number {
  return Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
}

/** Eye height above the feet (m): standing `base`, `crouch` 0..1 lowers it by up to `drop`. */
export function eyeHeight(base: number, drop: number, crouch: number): number {
  return base - drop * clampNum(crouch, 0, 1);
}

/** Field of view (deg) while aiming: `aimFactor` runs 1 (hip) .. `aimScale` (fully aimed, Config.combat.aimCameraScale); `zoom` = how much of the view is cut at full aim (0.4 = 40 %). */
export function aimFov(baseFov: number, aimFactor: number, aimScale: number, zoom: number): number {
  const span = 1 - aimScale;
  const t = span > 1e-6 ? clampNum((1 - aimFactor) / span, 0, 1) : 0;
  return baseFov * (1 - zoom * t);
}

/** Shortest turn from `a` to `b` (rad). */
export function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}
